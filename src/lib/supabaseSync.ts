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
import { normalizeClienteForPersistence, normalizeClientesForPersistence } from "@/lib/clientNormalization";
import { normalizeAccessStatus } from "@/lib/accessStatus";

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

export type SyncStoreSummary = {
  total: number;
  success: number;
  error: number;
  sent: number;
  tombstoned: number;
};

export type SyncSummary = {
  total: number;
  success: number;
  error: number;
  byStore: Partial<Record<SyncableStore, SyncStoreSummary>>;
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
  changedInBoth: number;
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
  if (normalizeAccessStatus(context.accessStatus) !== "active") throw new Error("Usuário ainda não aprovado para sincronização.");
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

function incrementStore(summary: SyncSummary, store: SyncableStore, field: keyof SyncStoreSummary) {
  summary.byStore[store] ??= { total: 0, success: 0, error: 0, sent: 0, tombstoned: 0 };
  summary.byStore[store][field] += 1;
}

function mergeSyncSummaries(...summaries: SyncSummary[]): SyncSummary {
  const merged = emptySummary();
  summaries.forEach((summary) => {
    merged.total += summary.total;
    merged.success += summary.success;
    merged.error += summary.error;
    merged.errors.push(...summary.errors);
    Object.entries(summary.byStore).forEach(([store, storeSummary]) => {
      if (!storeSummary || !isSyncableStore(store)) return;
      merged.byStore[store] ??= { total: 0, success: 0, error: 0, sent: 0, tombstoned: 0 };
      merged.byStore[store].total += storeSummary.total;
      merged.byStore[store].success += storeSummary.success;
      merged.byStore[store].error += storeSummary.error;
      merged.byStore[store].sent += storeSummary.sent;
      merged.byStore[store].tombstoned += storeSummary.tombstoned;
    });
  });
  return merged;
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
      payload: item.store === "clientes" ? normalizeClienteForPersistence(item.payload as Record<string, unknown>) : item.payload,
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
      incrementStore(summary, item.store, item.operation === "upsert" ? "sent" : "tombstoned");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido ao sincronizar item.";
      await markSyncItemError(item.id, message);
      summary.error += 1;
      incrementStore(summary, item.store, "error");
      summary.errors.push({ id: item.id, store: item.store, message });
    }
  }

  const meta = summary.error === 0 ? await persistRemoteSyncMeta(context, summary) : null;
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
      records.map((record) => enqueueSyncItem({ store, entityId: record.id, operation: "upsert", payload: store === "clientes" ? normalizeClienteForPersistence(record as Record<string, unknown>) : record }))
    )));
  } finally {
    db.close();
  }
}

export async function runFirstUploadSync(context: SyncContext) {
  await enqueueFullLocalSnapshotForSync();
  return syncPendingQueue(context);
}

export type PublishOfficialResult = {
  summary: SyncSummary;
  meta: SyncMetaPayload | null;
  beforeComparison: LocalRemoteComparison;
  afterComparison: LocalRemoteComparison;
  completed: boolean;
};

function comparisonHasNoDivergence(comparison: LocalRemoteComparison) {
  return comparison.totals.onlyLocal === 0
    && comparison.totals.onlyRemote === 0
    && comparison.totals.changedInBoth === 0;
}

async function tombstoneRemoteRowsMissingLocally(
  context: SyncContext,
  remoteOnlyRowsByStore: Array<{ store: SyncableStore; rows: RemoteRow[] }>,
): Promise<SyncSummary> {
  const { client, userId } = ensureCanSync(context);
  const summary = emptySummary();

  for (const { store, rows } of remoteOnlyRowsByStore) {
    const table = LOCAL_TO_REMOTE_TABLE[store];
    for (const row of rows) {
      const timestamp = nowIso();
      summary.total += 1;
      incrementStore(summary, store, "total");

      const { error } = await client.from(table).upsert({
        id: row.id,
        user_id: userId,
        payload: row.payload ?? {},
        updated_at: timestamp,
        deleted_at: timestamp,
      }, { onConflict: "user_id,id" });

      if (error) {
        const message = friendlySupabaseError(error.message);
        summary.error += 1;
        incrementStore(summary, store, "error");
        summary.errors.push({ id: row.id, store, message });
      } else {
        summary.success += 1;
        incrementStore(summary, store, "success");
        incrementStore(summary, store, "tombstoned");
      }
    }
  }

  return summary;
}

export async function publishLocalSnapshotAsOfficial(context: SyncContext): Promise<PublishOfficialResult> {
  ensureCanSync(context);
  const publishPlan = await Promise.all(
    SYNCABLE_STORES.map(async (store) => {
      const [local, remote] = await Promise.all([
        readLocalSyncableStore(store),
        fetchRows(LOCAL_TO_REMOTE_TABLE[store], context, true),
      ]);
      const localIds = new Set(local.map((record) => record.id));
      const remoteOnlyRows = remote.filter((row) => !row.deleted_at && !localIds.has(row.id));
      return { store, remoteOnlyRows, comparison: calculateStoreComparison(store, local, remote) };
    }),
  );
  const beforeComparison: LocalRemoteComparison = {
    generatedAt: nowIso(),
    stores: publishPlan.map((item) => item.comparison),
    totals: summarizeComparison(publishPlan.map((item) => item.comparison)),
  };

  await enqueueFullLocalSnapshotForSync();
  const uploadResult = await syncPendingQueue(context);
  const tombstoneSummary = await tombstoneRemoteRowsMissingLocally(
    context,
    publishPlan.map((item) => ({ store: item.store, rows: item.remoteOnlyRows })),
  );
  const summary = mergeSyncSummaries(uploadResult.summary, tombstoneSummary);
  const afterComparison = await compareLocalAndRemote(context);
  const completed = summary.error === 0 && comparisonHasNoDivergence(afterComparison);
  const meta = completed ? await persistRemoteSyncMeta(context, summary) : null;

  return { summary, meta, beforeComparison, afterComparison, completed };
}

async function fetchRows(table: RemoteTable, context: SyncContext, includeDeleted: boolean) {
  const { client } = ensureCanSync(context);
  let query = client.from(table).select("id,user_id,payload,created_at,updated_at,deleted_at");
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
      return [store, store === "clientes" ? normalizeClientesForPersistence(rows.map((row) => ({ id: row.id, ...((row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)) ? row.payload as Record<string, unknown> : {}) }))) : rows.map((row) => row.payload)] as const;
    }),
  );
  return Object.fromEntries(entries) as RemoteSnapshot;
}

async function readLocalSyncableStore(store: SyncableStore) {
  const db = await openAppDb();
  try {
    const tx = db.transaction(store as StoreName, "readonly");
    const records = (await promisifyRequest(tx.objectStore(store).getAll())) as Array<{ id: string }>;
    return store === "clientes" ? normalizeClientesForPersistence(records as Record<string, unknown>[]) as Array<{ id: string }> : records;
  } finally {
    db.close();
  }
}

const TECHNICAL_PAYLOAD_FIELDS = new Set(["syncMeta", "lastUploadAt", "lastDownloadAt", "lastSyncSummary", "deviceLabel"]);

type LocalComparableRecord = string | { id: string; [key: string]: unknown };

function normalizeComparablePayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeComparablePayload);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !TECHNICAL_PAYLOAD_FIELDS.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizeComparablePayload(item)]),
  );
}

export function stablePayloadHash(value: unknown): string {
  return JSON.stringify(normalizeComparablePayload(value));
}

function getLocalRecordId(record: LocalComparableRecord) {
  return typeof record === "string" ? record : record.id;
}

function normalizeRemotePayload(row: RemoteRow) {
  if (row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)) {
    return { id: row.id, ...(row.payload as Record<string, unknown>) };
  }
  return { id: row.id };
}

export function calculateStoreComparison(store: SyncableStore, localRecords: LocalComparableRecord[], remoteRows: RemoteRow[]): StoreComparison {
  const activeRemoteRows = remoteRows.filter((row) => !row.deleted_at);
  const activeRemoteIds = new Set(activeRemoteRows.map((row) => row.id));
  const activeRemoteById = new Map(activeRemoteRows.map((row) => [row.id, row]));
  const deletedRemoteIds = new Set(remoteRows.filter((row) => Boolean(row.deleted_at)).map((row) => row.id));
  const localIdSet = new Set(localRecords.map(getLocalRecordId));
  const localById = new Map(localRecords.filter((record): record is { id: string; [key: string]: unknown } => typeof record !== "string").map((record) => [record.id, record]));
  let onlyLocal = 0;
  let inBoth = 0;
  let changedInBoth = 0;

  localIdSet.forEach((id) => {
    if (activeRemoteIds.has(id)) {
      inBoth += 1;
      const localRecord = localById.get(id);
      const remoteRow = activeRemoteById.get(id);
      if (localRecord && remoteRow && stablePayloadHash(localRecord) !== stablePayloadHash(normalizeRemotePayload(remoteRow))) {
        changedInBoth += 1;
      }
    } else {
      onlyLocal += 1;
    }
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
    changedInBoth,
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
      changedInBoth: totals.changedInBoth + store.changedInBoth,
      remoteDeleted: totals.remoteDeleted + store.remoteDeleted,
    }),
    { localCount: 0, remoteCount: 0, onlyLocal: 0, onlyRemote: 0, inBoth: 0, changedInBoth: 0, remoteDeleted: 0 },
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
      return calculateStoreComparison(store, local, remote);
    }),
  );

  return { generatedAt: nowIso(), stores, totals: summarizeComparison(stores) };
}
