import type { Session } from "@supabase/supabase-js";
import { openAppDb, promisifyRequest } from "@/lib/db";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { detectTestRecordReasons } from "@/lib/syncAudit";
import type { RemoteRow } from "@/lib/supabaseSync";

export type RemoteCleanupAccessStatus = "pending" | "active" | "blocked" | "inactive";
export type RemoteCleanupRole = "admin" | "user" | string | null;

export type RemoteCleanupContext = {
  session: Session | null;
  accessStatus: RemoteCleanupAccessStatus | null;
  role?: RemoteCleanupRole;
};

export type RemoteOnlyClientTestCandidate = {
  id: string;
  nome: string;
  cidade?: string;
  rota?: string;
  motivo: string;
  updated_at: string | null;
  created_at: string | null;
  payload: Record<string, unknown>;
  origem: "somente-nuvem";
};

export type RemoteClientTestCleanupValidation = {
  ok: boolean;
  ids: string[];
  errors: string[];
};

const CLIENTES_TABLE = "clientes" as const;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

function ensureCanUseRemoteCleanup(context: RemoteCleanupContext, options: { requireAdmin?: boolean } = {}) {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase não configurado.");
  if (!context.session?.user) throw new Error("Usuário não autenticado.");
  if (context.accessStatus !== "active") throw new Error("Usuário ainda não aprovado para sincronização.");
  if (options.requireAdmin && context.role !== "admin") throw new Error("Somente administradores podem limpar testes somente na nuvem.");
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("Sem conexão com a internet.");
  return { client: supabase, userId: context.session.user.id };
}

function friendlySupabaseError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("row-level security") || lower.includes("violates row-level security")) return `Erro de RLS: ${message}`;
  if (lower.includes("failed to fetch") || lower.includes("network")) return `Erro de rede: ${message}`;
  if (lower.includes("relation") && lower.includes("does not exist")) return `Tabela não encontrada: ${message}`;
  return message;
}

async function readLocalClientIds() {
  const db = await openAppDb();
  try {
    const tx = db.transaction("clientes", "readonly");
    const localClientes = (await promisifyRequest(tx.objectStore("clientes").getAll())) as Array<{ id?: unknown }>;
    return new Set(localClientes.map((cliente) => String(cliente.id ?? "")).filter(Boolean));
  } finally {
    db.close();
  }
}

function payloadFromRemoteRow(row: RemoteRow): Record<string, unknown> {
  if (isRecord(row.payload)) return row.payload;
  return {};
}

export function toRemoteOnlyClientTestCandidate(row: RemoteRow, localClientIds: Set<string>): RemoteOnlyClientTestCandidate | null {
  if (!row.id || row.deleted_at || localClientIds.has(row.id)) return null;

  const payload = payloadFromRemoteRow(row);
  const reasons = detectTestRecordReasons(payload);
  if (reasons.length === 0) return null;

  return {
    id: row.id,
    nome: String(payload.nome ?? row.id),
    cidade: typeof payload.cidade === "string" ? payload.cidade : undefined,
    rota: typeof payload.rota === "string" ? payload.rota : undefined,
    motivo: reasons.join(", "),
    updated_at: row.updated_at,
    created_at: row.created_at,
    payload,
    origem: "somente-nuvem",
  };
}

export function findRemoteOnlyClientTestCandidatesFromRows(remoteRows: RemoteRow[], localClientIds: Set<string>) {
  return remoteRows
    .map((row) => toRemoteOnlyClientTestCandidate(row, localClientIds))
    .filter((candidate): candidate is RemoteOnlyClientTestCandidate => Boolean(candidate))
    .sort((a, b) => a.nome.localeCompare(b.nome) || a.id.localeCompare(b.id));
}

export function validateRemoteClientTestCleanup(params: {
  store: string;
  selectedIds: string[];
  candidates: RemoteOnlyClientTestCandidate[];
  activeRemoteCount?: number;
}): RemoteClientTestCleanupValidation {
  const errors: string[] = [];
  const uniqueIds = Array.from(new Set(params.selectedIds.map((id) => String(id ?? "").trim()).filter(Boolean)));
  const candidateById = new Map(params.candidates.map((candidate) => [candidate.id, candidate]));

  if (params.store !== CLIENTES_TABLE) errors.push("A limpeza remota segura só pode atuar na store clientes.");
  if (uniqueIds.length === 0) errors.push("Selecione manualmente pelo menos um cliente teste somente na nuvem.");
  if (params.activeRemoteCount !== undefined && uniqueIds.length >= params.activeRemoteCount) {
    errors.push("Bloqueio de segurança: não é permitido limpar todos os clientes remotos ativos.");
  }

  uniqueIds.forEach((id) => {
    const candidate = candidateById.get(id);
    if (!candidate) {
      errors.push(`${id}: candidato não confirmado como somente-nuvem.`);
      return;
    }
    if (candidate.origem !== "somente-nuvem") errors.push(`${id}: origem inválida para limpeza remota.`);
    if (!candidate.motivo) errors.push(`${id}: sem padrão de teste identificado.`);
  });

  return { ok: errors.length === 0, ids: uniqueIds, errors };
}

async function fetchActiveRemoteClientRows(context: RemoteCleanupContext) {
  const { client, userId } = ensureCanUseRemoteCleanup(context);
  const { data, error } = await client
    .from(CLIENTES_TABLE)
    .select("id,user_id,payload,created_at,updated_at,deleted_at")
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (error) throw new Error(friendlySupabaseError(error.message));
  return (data ?? []) as RemoteRow[];
}

export async function findRemoteOnlyClientTestCandidates(context: RemoteCleanupContext) {
  ensureCanUseRemoteCleanup(context);
  const [remoteRows, localClientIds] = await Promise.all([
    fetchActiveRemoteClientRows(context),
    readLocalClientIds(),
  ]);

  return findRemoteOnlyClientTestCandidatesFromRows(remoteRows, localClientIds);
}

export async function softDeleteRemoteClientTests(context: RemoteCleanupContext, ids: string[]) {
  const { client, userId } = ensureCanUseRemoteCleanup(context, { requireAdmin: true });
  const [activeRows, localClientIds] = await Promise.all([
    fetchActiveRemoteClientRows(context),
    readLocalClientIds(),
  ]);
  const candidates = findRemoteOnlyClientTestCandidatesFromRows(activeRows, localClientIds);
  const validation = validateRemoteClientTestCleanup({
    store: CLIENTES_TABLE,
    selectedIds: ids,
    candidates,
    activeRemoteCount: activeRows.length,
  });
  if (!validation.ok) throw new Error(validation.errors.join(" "));

  const timestamp = new Date().toISOString();
  const { error } = await client
    .from(CLIENTES_TABLE)
    .update({ deleted_at: timestamp, updated_at: timestamp })
    .eq("user_id", userId)
    .in("id", validation.ids)
    .is("deleted_at", null);

  if (error) throw new Error(friendlySupabaseError(error.message));

  return {
    deletedAt: timestamp,
    updatedAt: timestamp,
    ids: validation.ids,
    count: validation.ids.length,
  };
}
