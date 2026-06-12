import type { Session } from "@supabase/supabase-js";
import { openAppDb, promisifyRequest, type StoreName } from "@/lib/db";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { getPendingSyncItems } from "@/lib/syncQueue";
import { normalizeClientesForPersistence } from "@/lib/clientNormalization";
import {
  calculateStoreComparison,
  LOCAL_TO_REMOTE_TABLE,
  summarizeComparison,
  type LocalRemoteComparison,
  type RemoteRow,
  type StoreComparison,
  type SyncableStore,
  type SyncMetaPayload,
  type SyncSummary,
} from "@/lib/supabaseSync";

export type AccessStatus = "pending" | "active" | "blocked" | "inactive";

export type CloudRestoreContext = {
  session: Session | null;
  accessStatus: AccessStatus;
};

export type AccountSnapshot = Record<SyncableStore, Array<Record<string, unknown>>>;

export type CloudRestoreSummary = {
  total: number;
  byStore: Record<SyncableStore, number>;
};

export type CloudRestoreDecisionParams = {
  supabaseConfigured: boolean;
  sessionExists: boolean;
  accessStatus: AccessStatus | string | null;
  isOnline: boolean;
  pendingSyncCount: number;
  onlyLocal: number;
  onlyRemote: number;
  changedInBoth?: number;
  remoteCount: number;
};

export type CloudRestoreDecision = {
  allowed: boolean;
  reason: "allowed" | "supabase-unconfigured" | "missing-session" | "inactive-profile" | "offline" | "pending-sync" | "local-conflict" | "no-cloud-data" | "no-remote-only";
  message: string;
};

export type CloudRestoreResult = {
  restoredAt: string;
  summary: CloudRestoreSummary;
  syncMeta: SyncMetaPayload;
  snapshot: AccountSnapshot;
};

export const SYNCABLE_CLOUD_STORES: SyncableStore[] = [
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

export const REMOTE_TO_LOCAL_STORE = Object.fromEntries(
  Object.entries(LOCAL_TO_REMOTE_TABLE).map(([local, remote]) => [remote, local]),
) as Record<(typeof LOCAL_TO_REMOTE_TABLE)[SyncableStore], SyncableStore>;

const CONFLICT_MESSAGE = "Existem dados locais que ainda não estão na nuvem. Envie ou revise essas pendências antes de carregar a conta neste dispositivo.";

const nowIso = () => new Date().toISOString();

function ensureCanRestore(context: CloudRestoreContext) {
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
  return message;
}

function emptySnapshot(): AccountSnapshot {
  return Object.fromEntries(SYNCABLE_CLOUD_STORES.map((store) => [store, []])) as AccountSnapshot;
}

function normalizePayload(row: RemoteRow): Record<string, unknown> | null {
  if (row.deleted_at) return null;
  if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) return null;
  return { id: row.id, ...(row.payload as Record<string, unknown>) };
}

export function buildAccountSnapshotFromRemoteRows(rowsByStore: Partial<Record<SyncableStore, RemoteRow[]>>): AccountSnapshot {
  const snapshot = emptySnapshot();
  SYNCABLE_CLOUD_STORES.forEach((store) => {
    snapshot[store] = (rowsByStore[store] ?? [])
      .map(normalizePayload)
      .filter((payload): payload is Record<string, unknown> => Boolean(payload));
  });
  snapshot.clientes = normalizeClientesForPersistence(snapshot.clientes as Record<string, unknown>[]);
  return snapshot;
}

export async function fetchAccountSnapshot(context: CloudRestoreContext): Promise<AccountSnapshot> {
  const { client, userId } = ensureCanRestore(context);
  const rowsByStore = Object.fromEntries(
    await Promise.all(SYNCABLE_CLOUD_STORES.map(async (store) => {
      const { data, error } = await client
        .from(LOCAL_TO_REMOTE_TABLE[store])
        .select("id,user_id,payload,created_at,updated_at,deleted_at")
        .eq("user_id", userId)
        .is("deleted_at", null);

      if (error) throw new Error(friendlySupabaseError(error.message));
      return [store, (data ?? []) as RemoteRow[]] as const;
    })),
  ) as Partial<Record<SyncableStore, RemoteRow[]>>;

  return buildAccountSnapshotFromRemoteRows(rowsByStore);
}

async function readLocalRecords(store: SyncableStore) {
  const db = await openAppDb();
  try {
    const tx = db.transaction(store as StoreName, "readonly");
    const records = (await promisifyRequest(tx.objectStore(store).getAll())) as Array<{ id: string }>;
    return records;
  } finally {
    db.close();
  }
}

export async function compareLocalWithAccountSnapshot(context: CloudRestoreContext): Promise<LocalRemoteComparison> {
  const snapshot = await fetchAccountSnapshot(context);
  const stores = await Promise.all(SYNCABLE_CLOUD_STORES.map(async (store): Promise<StoreComparison> => {
    const localRecords = await readLocalRecords(store);
    const remoteRows: RemoteRow[] = snapshot[store].map((payload) => ({
      id: String(payload.id),
      user_id: context.session?.user.id ?? "",
      payload,
      created_at: null,
      updated_at: null,
      deleted_at: null,
    }));
    return calculateStoreComparison(store, localRecords, remoteRows);
  }));

  return { generatedAt: nowIso(), stores, totals: summarizeComparison(stores) };
}

export function shouldRestoreFromCloud(params: CloudRestoreDecisionParams): CloudRestoreDecision {
  if (!params.supabaseConfigured) return { allowed: false, reason: "supabase-unconfigured", message: "Supabase não configurado." };
  if (!params.sessionExists) return { allowed: false, reason: "missing-session", message: "Usuário não autenticado." };
  if (params.accessStatus !== "active") return { allowed: false, reason: "inactive-profile", message: "Usuário ainda não aprovado para sincronização." };
  if (!params.isOnline) return { allowed: false, reason: "offline", message: "Sem conexão com a internet." };
  if (params.pendingSyncCount > 0) return { allowed: false, reason: "pending-sync", message: CONFLICT_MESSAGE };
  if (params.remoteCount <= 0) return { allowed: false, reason: "no-cloud-data", message: "Não há dados ativos da conta na nuvem para carregar." };
  if (params.onlyRemote <= 0 && params.onlyLocal <= 0 && (params.changedInBoth ?? 0) <= 0) return { allowed: false, reason: "no-remote-only", message: "Este dispositivo já está alinhado com os dados ativos da conta." };
  return { allowed: true, reason: "allowed", message: params.onlyLocal > 0 || (params.changedInBoth ?? 0) > 0 ? "Dados divergentes entre este dispositivo e a nuvem. Carregar a nuvem substituirá os dados locais sincronizáveis." : "Há dados da sua conta na nuvem. Carregar neste dispositivo?" };
}

export function buildCloudRestoreSummary(snapshot: AccountSnapshot): CloudRestoreSummary {
  const byStore = Object.fromEntries(SYNCABLE_CLOUD_STORES.map((store) => [store, snapshot[store].length])) as Record<SyncableStore, number>;
  return {
    byStore,
    total: Object.values(byStore).reduce((sum, count) => sum + count, 0),
  };
}

function emptySyncSummary(): SyncSummary {
  return { total: 0, success: 0, error: 0, byStore: {}, errors: [] };
}

export function buildRestoredAppConfig(snapshot: AccountSnapshot, syncMeta: SyncMetaPayload) {
  const [remoteConfig] = snapshot.appConfig;
  const remoteSyncMeta = remoteConfig?.syncMeta as Partial<SyncMetaPayload> | undefined;
  return {
    id: "main",
    percentualAcertoEsperado: 12,
    ...remoteConfig,
    syncMeta: {
      ...syncMeta,
      lastUploadAt: remoteSyncMeta?.lastUploadAt ?? syncMeta.lastUploadAt,
    },
  };
}

export async function restoreAccountSnapshotToLocal(snapshot: AccountSnapshot): Promise<CloudRestoreResult> {
  const pending = await getPendingSyncItems();
  if (pending.length > 0) throw new Error(CONFLICT_MESSAGE);

  const restoredAt = nowIso();
  const summary = buildCloudRestoreSummary(snapshot);
  const syncMeta: SyncMetaPayload = {
    lastUploadAt: null,
    lastDownloadAt: restoredAt,
    lastSyncSummary: emptySyncSummary(),
    deviceLabel: typeof navigator === "undefined" ? "Dispositivo desconhecido" : navigator.userAgent,
  };
  const sanitizedSnapshot: AccountSnapshot = {
    ...snapshot,
    clientes: normalizeClientesForPersistence((snapshot.clientes ?? []) as Record<string, unknown>[]),
    appConfig: [buildRestoredAppConfig(snapshot, syncMeta)],
  };

  const db = await openAppDb();
  try {
    const tx = db.transaction(SYNCABLE_CLOUD_STORES as StoreName[], "readwrite");
    SYNCABLE_CLOUD_STORES.forEach((store) => {
      const objectStore = tx.objectStore(store);
      objectStore.clear();
      sanitizedSnapshot[store].forEach((entry) => objectStore.put(entry));
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Falha ao restaurar dados da nuvem no IndexedDB."));
      tx.onabort = () => reject(tx.error ?? new Error("Restauração da nuvem abortada."));
    });
  } finally {
    db.close();
  }

  return { restoredAt, summary, syncMeta, snapshot: sanitizedSnapshot };
}
