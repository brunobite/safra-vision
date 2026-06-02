import type { Session } from "@supabase/supabase-js";
import { openAppDb, promisifyRequest, type StoreName } from "@/lib/db";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  enqueueSyncItem,
  getPendingSyncItems,
  markSyncItemError,
  markSyncItemProcessing,
  markSyncItemSynced,
  type SyncQueueItem,
} from "@/lib/syncQueue";

type AccessStatus = "pending" | "active" | "blocked" | "inactive";

type SyncContext = {
  session: Session | null;
  accessStatus: AccessStatus;
};

export type SyncableStore =
  | "clientes"
  | "lancamentos"
  | "oportunidades"
  | "historicoFunil"
  | "orcamentos"
  | "negocios"
  | "proximasAcoes"
  | "relatoriosVisita"
  | "metasEmpresa"
  | "metasPessoais"
  | "metasVendedor"
  | "metasCategoria"
  | "regrasComissao"
  | "configuracoes"
  | "empresas"
  | "eventos"
  | "prioridadesP1"
  | "vendedores"
  | "produtos"
  | "formasPagamento"
  | "prazosPagamento"
  | "appConfig";

type RemoteTable =
  | "clientes"
  | "lancamentos"
  | "oportunidades"
  | "historico_funil"
  | "orcamentos"
  | "negocios"
  | "proximas_acoes"
  | "relatorios_visita"
  | "metas_empresa"
  | "metas_pessoais"
  | "metas_vendedor"
  | "metas_categoria"
  | "regras_comissao"
  | "configuracoes"
  | "empresas"
  | "eventos"
  | "prioridades_p1"
  | "vendedores"
  | "produtos"
  | "formas_pagamento"
  | "prazos_pagamento"
  | "app_config";

export type SyncSummary = {
  total: number;
  success: number;
  error: number;
  byStore: Partial<Record<SyncableStore, { total: number; success: number; error: number }>>;
  errors: Array<{ id: string; store: string; message: string }>;
};

export type RemoteRow = {
  id: string;
  user_id: string;
  payload: unknown;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
};

export type RemoteSnapshot = Record<SyncableStore, unknown[]>;

export type StoreComparison = {
  store: SyncableStore;
  table: RemoteTable;
  localCount: number;
  remoteCount: number;
  onlyLocal: number;
  onlyRemote: number;
  inBoth: number;
  remoteDeleted: number;
};

export type LocalRemoteComparison = {
  generatedAt: string;
  stores: StoreComparison[];
  totals: Omit<StoreComparison, "store" | "table">;
};

export type SyncMetaPayload = {
  lastUploadAt: string | null;
  lastDownloadAt: string | null;
  lastSyncSummary: SyncSummary;
  deviceLabel: string;
};

const SYNCABLE_STORES: SyncableStore[] = [
  "clientes",
  "lancamentos",
  "oportunidades",
  "historicoFunil",
  "orcamentos",
  "negocios",
  "proximasAcoes",
  "relatoriosVisita",
  "metasEmpresa",
  "metasPessoais",
  "metasVendedor",
  "metasCategoria",
  "regrasComissao",
  "configuracoes",
  "empresas",
  "eventos",
  "prioridadesP1",
  "vendedores",
  "produtos",
  "formasPagamento",
  "prazosPagamento",
  "appConfig",
];

export const LOCAL_TO_REMOTE_TABLE: Record<SyncableStore, RemoteTable> = {
  clientes: "clientes",
  lancamentos: "lancamentos",
  oportunidades: "oportunidades",
  historicoFunil: "historico_funil",
  orcamentos: "orcamentos",
  negocios: "negocios",
  proximasAcoes: "proximas_acoes",
  relatoriosVisita: "relatorios_visita",
  metasEmpresa: "metas_empresa",
  metasPessoais: "metas_pessoais",
  metasVendedor: "metas_vendedor",
  metasCategoria: "metas_categoria",
  regrasComissao: "regras_comissao",
  configuracoes: "configuracoes",
  empresas: "empresas",
  eventos: "eventos",
  prioridadesP1: "prioridades_p1",
  vendedores: "vendedores",
  produtos: "produtos",
  formasPagamento: "formas_pagamento",
  prazosPagamento: "prazos_pagamento",
  appConfig: "app_config",
};

const emptySummary = (): SyncSummary => ({ total: 0, success: 0, error: 0, byStore: {}, errors: [] });

const isSyncableStore = (store: string): store is SyncableStore => store in LOCAL_TO_REMOTE_TABLE;

const nowIso = () => new Date().toISOString();

function ensureCanSync(context: SyncContext) {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase não configurado.");
  if (!context.session?.user) throw new Error("Usuário não autenticado.");
  if (context.accessStatus !== "active") throw new Error("Usuário ainda não aprovado para sincronização.");
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("Sem conexão com a internet.");
  return { client: supabase, userId: context.session.user.id };
}

function friendlySupabaseError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("row-level security") || lower.includes("violates row-level security")) return `Erro de RLS: ${message}`;
  if (lower.includes("failed to fetch") || lower.includes("network")) return `Erro de rede: ${message}`;
  if (lower.includes("relation") && lower.includes("does not exist")) return `Tabela não encontrada: ${message}`;
  if (lower.includes("invalid input syntax") || lower.includes("json")) return `Payload inválido: ${message}`;
  return message;
}

function incrementStore(summary: SyncSummary, store: SyncableStore, field: "total" | "success" | "error") {
  summary.byStore[store] ??= { total: 0, success: 0, error: 0 };
  summary.byStore[store][field] += 1;
}

async function uploadQueueItem(item: SyncQueueItem, context: SyncContext) {
  const { client, userId } = ensureCanSync(context);
  if (!isSyncableStore(item.store)) throw new Error(`Store sem mapeamento para Supabase: ${item.store}.`);

  const table = LOCAL_TO_REMOTE_TABLE[item.store];
  const timestamp = nowIso();

  if (item.operation === "upsert") {
    if (!item.payload || typeof item.payload !== "object") throw new Error("Payload inválido: item sem objeto para upsert.");
    const { error } = await client.from(table).upsert({
      id: item.entityId,
      user_id: userId,
      payload: item.payload,
      updated_at: timestamp,
      deleted_at: null,
    }, { onConflict: "user_id,id" });
    if (error) throw new Error(friendlySupabaseError(error.message));
    return;
  }

  const { error } = await client
    .from(table)
    .upsert({ id: item.entityId, user_id: userId, payload: item.payload ?? {}, updated_at: timestamp, deleted_at: timestamp }, { onConflict: "user_id,id" });
  if (error) throw new Error(friendlySupabaseError(error.message));
}

async function persistRemoteSyncMeta(context: SyncContext, summary: SyncSummary) {
  const { client, userId } = ensureCanSync(context);
  const payload: SyncMetaPayload = {
    lastUploadAt: nowIso(),
    lastDownloadAt: null,
    lastSyncSummary: summary,
    deviceLabel: typeof navigator === "undefined" ? "Dispositivo desconhecido" : navigator.userAgent,
  };

  const { error } = await client.from("sync_meta").upsert({
    id: "main",
    user_id: userId,
    payload,
    updated_at: payload.lastUploadAt,
    deleted_at: null,
  }, { onConflict: "user_id,id" });

  if (error) throw new Error(friendlySupabaseError(error.message));
  return payload;
}

export async function getRemoteSyncMeta(context: SyncContext): Promise<SyncMetaPayload | null> {
  const { client, userId } = ensureCanSync(context);
  const { data, error } = await client
    .from("sync_meta")
    .select("payload")
    .eq("user_id", userId)
    .eq("id", "main")
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(friendlySupabaseError(error.message));
  return (data?.payload as SyncMetaPayload | undefined) ?? null;
}

export async function syncPendingQueue(context: SyncContext): Promise<{ summary: SyncSummary; meta: SyncMetaPayload | null }> {
  ensureCanSync(context);
  const items = await getPendingSyncItems();
  const summary = emptySummary();

  for (const item of items) {
    summary.total += 1;
    await markSyncItemProcessing(item.id);

    if (!isSyncableStore(item.store)) {
      const message = `Store sem mapeamento para Supabase: ${item.store}.`;
      await markSyncItemError(item.id, message);
      summary.error += 1;
      summary.errors.push({ id: item.id, store: item.store, message });
      continue;
    }

    incrementStore(summary, item.store, "total");
    try {
      await uploadQueueItem(item, context);
      await markSyncItemSynced(item.id);
      summary.success += 1;
      incrementStore(summary, item.store, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido ao sincronizar item.";
      await markSyncItemError(item.id, message);
      summary.error += 1;
      incrementStore(summary, item.store, "error");
      summary.errors.push({ id: item.id, store: item.store, message });
    }
  }

  const meta = await persistRemoteSyncMeta(context, summary);
  return { summary, meta };
}

export async function enqueueFullLocalSnapshotForSync() {
  const db = await openAppDb();
  try {
    const snapshot = await Promise.all(SYNCABLE_STORES.map(async (store) => {
      const tx = db.transaction(store as StoreName, "readonly");
      const records = (await promisifyRequest(tx.objectStore(store).getAll())) as Array<{ id?: string }>;
      return [store, records.filter((record): record is { id: string } => Boolean(record.id))] as const;
    }));

    await Promise.all(snapshot.flatMap(([store, records]) => (
      records.map((record) => enqueueSyncItem({ store, entityId: record.id, operation: "upsert", payload: record }))
    )));
  } finally {
    db.close();
  }
}

export async function runFirstUploadSync(context: SyncContext) {
  await enqueueFullLocalSnapshotForSync();
  return syncPendingQueue(context);
}

async function fetchRows(table: RemoteTable, context: SyncContext, includeDeleted: boolean) {
  const { client, userId } = ensureCanSync(context);
  let query = client.from(table).select("id,user_id,payload,created_at,updated_at,deleted_at").eq("user_id", userId);
  if (!includeDeleted) query = query.is("deleted_at", null);
  const { data, error } = await query;
  if (error) throw new Error(friendlySupabaseError(error.message));
  return (data ?? []) as RemoteRow[];
}

export async function fetchRemoteSnapshot(context: SyncContext): Promise<RemoteSnapshot> {
  ensureCanSync(context);
  const entries = await Promise.all(
    SYNCABLE_STORES.map(async (store) => {
      const rows = await fetchRows(LOCAL_TO_REMOTE_TABLE[store], context, false);
      return [store, rows.map((row) => row.payload)] as const;
    }),
  );
  return Object.fromEntries(entries) as RemoteSnapshot;
}

async function readLocalSyncableStore(store: SyncableStore) {
  const db = await openAppDb();
  try {
    const tx = db.transaction(store as StoreName, "readonly");
    return (await promisifyRequest(tx.objectStore(store).getAll())) as Array<{ id: string }>;
  } finally {
    db.close();
  }
}

export function calculateStoreComparison(store: SyncableStore, localIds: string[], remoteRows: RemoteRow[]): StoreComparison {
  const activeRemoteIds = new Set(remoteRows.filter((row) => !row.deleted_at).map((row) => row.id));
  const deletedRemoteIds = new Set(remoteRows.filter((row) => Boolean(row.deleted_at)).map((row) => row.id));
  const localIdSet = new Set(localIds);
  let onlyLocal = 0;
  let inBoth = 0;

  localIdSet.forEach((id) => {
    if (activeRemoteIds.has(id)) inBoth += 1;
    else onlyLocal += 1;
  });

  let onlyRemote = 0;
  activeRemoteIds.forEach((id) => {
    if (!localIdSet.has(id)) onlyRemote += 1;
  });

  return {
    store,
    table: LOCAL_TO_REMOTE_TABLE[store],
    localCount: localIdSet.size,
    remoteCount: activeRemoteIds.size,
    onlyLocal,
    onlyRemote,
    inBoth,
    remoteDeleted: deletedRemoteIds.size,
  };
}

export function summarizeComparison(stores: StoreComparison[]): LocalRemoteComparison["totals"] {
  return stores.reduce(
    (totals, store) => ({
      localCount: totals.localCount + store.localCount,
      remoteCount: totals.remoteCount + store.remoteCount,
      onlyLocal: totals.onlyLocal + store.onlyLocal,
      onlyRemote: totals.onlyRemote + store.onlyRemote,
      inBoth: totals.inBoth + store.inBoth,
      remoteDeleted: totals.remoteDeleted + store.remoteDeleted,
    }),
    { localCount: 0, remoteCount: 0, onlyLocal: 0, onlyRemote: 0, inBoth: 0, remoteDeleted: 0 },
  );
}

export async function compareLocalAndRemote(context: SyncContext): Promise<LocalRemoteComparison> {
  ensureCanSync(context);
  const stores = await Promise.all(
    SYNCABLE_STORES.map(async (store) => {
      const [local, remote] = await Promise.all([
        readLocalSyncableStore(store),
        fetchRows(LOCAL_TO_REMOTE_TABLE[store], context, true),
      ]);
      return calculateStoreComparison(store, local.map((item) => item.id), remote);
    }),
  );

  return { generatedAt: nowIso(), stores, totals: summarizeComparison(stores) };
}
