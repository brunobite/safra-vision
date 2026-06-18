import type { Session } from "@supabase/supabase-js";
import { openAppDb, type StoreName } from "@/lib/db";
import { categorizeSyncQueueItem, compactSyncQueueItem, enqueueSyncItem, getAllSyncItems, getSyncQueueDiagnostics, markSyncItemConflict, removeSyncItemsForEntity, suppressNextSyncQueueItem, type SyncOperation } from "@/lib/syncQueue";
import { LOCAL_TO_REMOTE_TABLE, syncPendingQueue, type RemoteRow, type SyncableStore, type SyncSummary } from "@/lib/supabaseSync";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { normalizeAccessStatus } from "@/lib/accessStatus";
import { normalizeClienteForPersistence, normalizeClientesForPersistence } from "@/lib/clientNormalization";
import { recordAuditLog } from "@/lib/audit";

export type OperationalPersistenceStatus = "sending" | "synced" | "pending-offline" | "conflict" | "error";
export type OperationalActor = { id?: string | null; email?: string | null; role?: string | null; nome?: string | null };

export type OperationalPersistenceOptions = {
  session: Session | null;
  accessStatus?: string | null;
  actorUser?: OperationalActor | null;
  accountOwnerUserId?: string | null;
  actorUserId?: string | null;
  actorNome?: string | null;
  actorPapel?: string | null;
  auditAction?: string;
  resource?: string;
  beforeData?: unknown;
  afterData?: unknown;
  operation?: string;
  auditMetadata?: Record<string, unknown>;
  baseRemoteUpdatedAt?: string | null;
  offlineFallback?: boolean;
  onStatusChange?: (status: OperationalPersistenceStatus) => void;
  onRemoteSuccess?: () => Promise<void> | void;
  onRemoteError?: (error: Error) => Promise<void> | void;
};

export type SaveOperationalEntityOptions = OperationalPersistenceOptions;
export type EntitySnapshot<T extends { id: string } = { id: string }> = { store: SyncableStore; active: T[]; tombstones: RemoteRow[]; rows: RemoteRow[]; fetchedAt: string };
export type HydrateStoreResult<T extends { id: string } = { id: string }> = EntitySnapshot<T> & { appliedActive: number; appliedTombstones: number };
export type QueueDiagnostics = { validas: number; filasOrfas: number; dadosSemNamespace: number; obsoletasSchemaAntigo: number; duplicadasNamespaceAntigo: number; conflitantes: number; falhasRedeSessao: number; total: number; exportBackupRecommended: boolean };
export const CRITICAL_OPERATION_RULES = {
  priceRelease: "Liberação de preço deve usar gravação cloud-first direta no Supabase e não depender da fila geral.",
} as const;

const nowIso = () => new Date().toISOString();
const queueKey = (store: string, id: string) => `${store}:${id}`;

function getRemoteUserId(options: OperationalPersistenceOptions) {
  return options.accountOwnerUserId || null;
}

function requireAccountOwnerUserId(options: OperationalPersistenceOptions) {
  const accountOwnerUserId = getRemoteUserId(options);
  if (!accountOwnerUserId) throw new Error("Conta comercial (accountOwnerUserId) obrigatória ausente; operação sincronizável bloqueada.");
  return accountOwnerUserId;
}

function queueContext(options: OperationalPersistenceOptions) {
  return {
    accountOwnerUserId: requireAccountOwnerUserId(options),
    actorUserId: options.actorUserId ?? options.session?.user.id ?? null,
    deviceId: typeof navigator === "undefined" ? "server" : navigator.userAgent,
  };
}

function canAttemptRemote(options: OperationalPersistenceOptions) {
  return Boolean(isSupabaseConfigured && supabase && options.session?.user && normalizeAccessStatus(options.accessStatus) === "active" && getRemoteUserId(options) && (typeof navigator === "undefined" || navigator.onLine));
}

function formatRemoteError(error: unknown) { return error instanceof Error ? error : new Error("Falha desconhecida ao sincronizar operação."); }
function stripLocalSyncMetadata(record: Record<string, unknown>) {
  const { __syncRemoteUpdatedAt: _remoteUpdatedAt, __syncAccountOwnerUserId: _owner, ...payload } = record;
  void _remoteUpdatedAt;
  void _owner;
  return payload;
}
function normalizePayload<T extends { id: string }>(store: SyncableStore, record: T) {
  const payload = stripLocalSyncMetadata(record as Record<string, unknown>) as T;
  return store === "clientes" ? normalizeClienteForPersistence(payload as Record<string, unknown>) : payload;
}
function withRemoteSyncMetadata<T extends { id: string }>(record: T, row: RemoteRow): T {
  return { ...(record as Record<string, unknown>), __syncRemoteUpdatedAt: row.updated_at ?? null, __syncAccountOwnerUserId: row.user_id } as T;
}
function getBaseRemoteUpdatedAt<T extends { id: string }>(record: T, options: OperationalPersistenceOptions): string | null | undefined {
  if (Object.prototype.hasOwnProperty.call(options, "baseRemoteUpdatedAt")) return options.baseRemoteUpdatedAt;
  if (Object.prototype.hasOwnProperty.call(options.auditMetadata ?? {}, "baseRemoteUpdatedAt")) return options.auditMetadata?.baseRemoteUpdatedAt as string | null | undefined;
  if (Object.prototype.hasOwnProperty.call(record as Record<string, unknown>, "__syncRemoteUpdatedAt")) return (record as Record<string, unknown>).__syncRemoteUpdatedAt as string | null;
  return undefined;
}
class SyncConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncConflictError";
  }
}
function isSyncConflict(error: Error) {
  return error instanceof SyncConflictError || /Conflito|tombstone/i.test(error.message);
}
function rowToRecord<T extends { id: string }>(store: SyncableStore, row: RemoteRow): T | null {
  if (row.deleted_at || !row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) return null;
  const record = { id: row.id, ...(row.payload as Record<string, unknown>) };
  const normalized = (store === "clientes" ? normalizeClientesForPersistence([record])[0] : record) as T;
  return withRemoteSyncMetadata(normalized, row);
}

async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>) { const db = await openAppDb(); try { return await fn(db); } finally { db.close(); } }
function normalizeLocalCacheRecord<T extends { id: string }>(store: SyncableStore, record: T) {
  const normalized = normalizePayload(store, record) as Record<string, unknown>;
  const syncMeta: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(record as Record<string, unknown>, "__syncRemoteUpdatedAt")) syncMeta.__syncRemoteUpdatedAt = (record as Record<string, unknown>).__syncRemoteUpdatedAt;
  if (Object.prototype.hasOwnProperty.call(record as Record<string, unknown>, "__syncAccountOwnerUserId")) syncMeta.__syncAccountOwnerUserId = (record as Record<string, unknown>).__syncAccountOwnerUserId;
  return { ...normalized, ...syncMeta };
}
async function writeLocalRecord<T extends { id: string }>(store: SyncableStore, record: T) {
  await withDb(async (db) => { const tx = db.transaction(store as StoreName, "readwrite"); tx.objectStore(store).put(normalizeLocalCacheRecord(store, record)); await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); });
}
async function deleteLocalRecord(store: SyncableStore, id: string) {
  await withDb(async (db) => { const tx = db.transaction(store as StoreName, "readwrite"); tx.objectStore(store).delete(id); await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); });
}

async function writeRemoteRow<T extends { id: string }>(store: SyncableStore, record: T, operation: SyncOperation, options: OperationalPersistenceOptions) {
  if (!canAttemptRemote(options)) throw new Error("Sem conexão, sessão ativa ou Supabase configurado para gravação online.");
  const accountOwnerUserId = requireAccountOwnerUserId(options);
  const timestamp = nowIso();
  const { data: currentRemote, error: currentRemoteError } = await supabase!.from(LOCAL_TO_REMOTE_TABLE[store]).select("updated_at,deleted_at").eq("user_id", accountOwnerUserId).eq("id", record.id).maybeSingle();
  if (currentRemoteError) throw new Error(currentRemoteError.message);
  const remote = currentRemote as { updated_at?: string | null; deleted_at?: string | null } | null;
  const expectedBase = getBaseRemoteUpdatedAt(record, options);
  if (expectedBase === undefined && remote?.updated_at) throw new SyncConflictError(`Conflito de sincronização em ${store}/${record.id}: baseRemoteUpdatedAt ausente para registro remoto existente.`);
  if ((remote?.updated_at ?? null) !== (expectedBase ?? null)) throw new SyncConflictError(`Conflito de sincronização em ${store}/${record.id}: remoto atualizado desde a base local.`);
  if (operation === "upsert" && remote?.deleted_at) throw new SyncConflictError(`Conflito de tombstone em ${store}/${record.id}: exclusão remota mais recente vence upsert local antigo.`);
  const { error } = await supabase!.from(LOCAL_TO_REMOTE_TABLE[store]).upsert({ id: record.id, user_id: accountOwnerUserId, payload: normalizePayload(store, record), updated_at: timestamp, deleted_at: operation === "delete" ? timestamp : null }, { onConflict: "user_id,id" });
  if (error) throw new Error(error.message);
  return timestamp;
}

async function auditIfRequested<T extends { id: string }>(record: T, options: OperationalPersistenceOptions) {
  if (!options.auditAction) return;
  await recordAuditLog({ action: options.auditAction, resource: options.resource ?? "operational", entityId: record.id, entityLabel: (record as Record<string, unknown>).nome as string | undefined, beforeData: options.beforeData, afterData: options.afterData ?? record, metadata: { ...options.auditMetadata, actorUserId: options.actorUserId, actorNome: options.actorNome, actorPapel: options.actorPapel } });
}

export async function compactPendingQueue(store: string, id: string) {
  return compactSyncQueueItem(store, id, "Compactado por operação cloud-first/tombstone remoto.");
}

export async function saveEntityCloudFirst<T extends { id: string }>(store: SyncableStore, record: T, options: OperationalPersistenceOptions) {
  const payload = normalizePayload(store, record);
  const fallback = options.offlineFallback !== false;
  if (!canAttemptRemote(options)) {
    if (!fallback) throw new Error("Operação online obrigatória indisponível.");
    await writeLocalRecord(store, record);
    if (getRemoteUserId(options)) {
      await enqueueSyncItem({ ...queueContext(options), store, entityId: record.id, operation: "upsert", payload, baseRemoteUpdatedAt: getBaseRemoteUpdatedAt(record, options) ?? null, status: "pending-offline" });
    }
    options.onStatusChange?.("pending-offline");
    return { status: "pending-offline" as const, remote: false };
  }
  options.onStatusChange?.("sending");
  try {
    const remoteUpdatedAt = await writeRemoteRow(store, record, "upsert", options);
    await writeLocalRecord(store, { ...(record as Record<string, unknown>), __syncRemoteUpdatedAt: remoteUpdatedAt, __syncAccountOwnerUserId: requireAccountOwnerUserId(options) } as T);
    await removeSyncItemsForEntity(store, record.id);
    suppressNextSyncQueueItem(store, record.id, "upsert");
    await auditIfRequested(record, options);
    await options.onRemoteSuccess?.();
    options.onStatusChange?.("synced");
    return { status: "synced" as const, remote: true };
  } catch (error) {
    const formatted = formatRemoteError(error);
    const baseRemoteUpdatedAt = getBaseRemoteUpdatedAt(record, options) ?? null;
    if (isSyncConflict(formatted)) {
      const conflictItem = await enqueueSyncItem({ ...queueContext(options), store, entityId: record.id, operation: "upsert", payload, baseRemoteUpdatedAt, status: "conflict" });
      await markSyncItemConflict(conflictItem.id, formatted.message);
      await options.onRemoteError?.(formatted);
      options.onStatusChange?.("conflict");
      return { status: "conflict" as const, remote: false, error: formatted };
    }
    if (!fallback) throw formatted;
    await writeLocalRecord(store, record);
    await enqueueSyncItem({ ...queueContext(options), store, entityId: record.id, operation: "upsert", payload, baseRemoteUpdatedAt, status: "pending-offline" });
    await options.onRemoteError?.(formatted);
    options.onStatusChange?.("pending-offline");
    return { status: "pending-offline" as const, remote: false, error: formatted };
  }
}

export async function deleteEntityCloudFirst<T extends { id: string }>(store: SyncableStore, id: string, options: OperationalPersistenceOptions & { record?: T }) {
  const record = options.record ?? ({ id } as T);
  const payload = normalizePayload(store, record);
  const fallback = options.offlineFallback !== false;
  if (!canAttemptRemote(options)) {
    if (!fallback) throw new Error("Exclusão online obrigatória indisponível.");
    await deleteLocalRecord(store, id);
    if (getRemoteUserId(options)) {
      await enqueueSyncItem({ ...queueContext(options), store, entityId: id, operation: "delete", payload, baseRemoteUpdatedAt: getBaseRemoteUpdatedAt(record, options) ?? null, status: "pending-offline" });
    }
    options.onStatusChange?.("pending-offline");
    return { status: "pending-offline" as const, remote: false };
  }
  options.onStatusChange?.("sending");
  try {
    await writeRemoteRow(store, record, "delete", options);
    await deleteLocalRecord(store, id);
    await removeSyncItemsForEntity(store, id);
    suppressNextSyncQueueItem(store, id, "delete");
    await auditIfRequested(record, options);
    await options.onRemoteSuccess?.();
    options.onStatusChange?.("synced");
    return { status: "synced" as const, remote: true };
  } catch (error) {
    const formatted = formatRemoteError(error);
    const baseRemoteUpdatedAt = getBaseRemoteUpdatedAt(record, options) ?? null;
    if (isSyncConflict(formatted)) {
      const conflictItem = await enqueueSyncItem({ ...queueContext(options), store, entityId: id, operation: "delete", payload, baseRemoteUpdatedAt, status: "conflict" });
      await markSyncItemConflict(conflictItem.id, formatted.message);
      await options.onRemoteError?.(formatted);
      options.onStatusChange?.("conflict");
      return { status: "conflict" as const, remote: false, error: formatted };
    }
    if (!fallback) throw formatted;
    await deleteLocalRecord(store, id);
    await enqueueSyncItem({ ...queueContext(options), store, entityId: id, operation: "delete", payload, baseRemoteUpdatedAt, status: "pending-offline" });
    await options.onRemoteError?.(formatted);
    options.onStatusChange?.("pending-offline");
    return { status: "pending-offline" as const, remote: false, error: formatted };
  }
}

export async function fetchCloudSnapshot<T extends { id: string } = { id: string }>(store: SyncableStore, options: OperationalPersistenceOptions): Promise<EntitySnapshot<T>> {
  if (!canAttemptRemote(options)) throw new Error("Sem conexão, sessão ativa ou Supabase configurado para leitura online.");
  const { data, error } = await supabase!.from(LOCAL_TO_REMOTE_TABLE[store]).select("id,user_id,payload,created_at,updated_at,deleted_at").eq("user_id", getRemoteUserId(options)!).order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as RemoteRow[];
  return { store, active: rows.map((row) => rowToRecord<T>(store, row)).filter((r): r is T => Boolean(r)), tombstones: rows.filter((row) => Boolean(row.deleted_at)), rows, fetchedAt: nowIso() };
}

export async function hydrateLocalCacheFromCloud<T extends { id: string } = { id: string }>(store: SyncableStore, options: OperationalPersistenceOptions): Promise<HydrateStoreResult<T>> {
  const snapshot = await fetchCloudSnapshot<T>(store, options);
  await withDb(async (db) => {
    const tx = db.transaction(store as StoreName, "readwrite");
    const os = tx.objectStore(store);
    snapshot.tombstones.forEach((row) => os.delete(row.id));
    snapshot.active.forEach((record) => os.put(normalizeLocalCacheRecord(store, record)));
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  });
  await Promise.all(snapshot.tombstones.map(async (row) => {
    await removeSyncItemsForEntity(store, row.id);
    if (store === "clientes") {
      await recordAuditLog({ action: "sync_tombstone_cliente", resource: "clientes", entityId: row.id, beforeData: row.payload, metadata: { deletedAt: row.deleted_at, remoteUpdatedAt: row.updated_at } });
    }
  }));
  if (store === "clientes" && snapshot.active.length > 0) {
    await recordAuditLog({ action: "sync_download_cliente", resource: "clientes", entityId: "snapshot", afterData: { total: snapshot.active.length }, metadata: { tombstones: snapshot.tombstones.length } });
  }
  return { ...snapshot, appliedActive: snapshot.active.length, appliedTombstones: snapshot.tombstones.length };
}

export async function diagnosePendingQueue(): Promise<QueueDiagnostics> {
  const items = await getAllSyncItems();
  const byEntity = new Map<string, typeof items>();
  items.forEach((item) => byEntity.set(queueKey(item.store, item.entityId), [...(byEntity.get(queueKey(item.store, item.entityId)) ?? []), item]));
  const diagnostics = getSyncQueueDiagnostics(items);
  return {
    total: items.length,
    validas: diagnostics.pendingUpload,
    filasOrfas: diagnostics.orphaned,
    dadosSemNamespace: items.filter((i) => !i.accountOwnerUserId).length,
    obsoletasSchemaAntigo: diagnostics.obsolete,
    duplicadasNamespaceAntigo: Array.from(byEntity.values()).filter((group) => group.length > 1).length,
    conflitantes: diagnostics.conflicts + Array.from(byEntity.values()).filter((group) => group.some((i) => i.operation === "delete") && group.some((i) => i.operation === "upsert")).length,
    falhasRedeSessao: diagnostics.networkSessionErrors,
    exportBackupRecommended: items.some((i) => ["orphaned", "conflict"].includes(categorizeSyncQueueItem(i))),
  };
}

export async function syncPendingQueueNow(options: OperationalPersistenceOptions): Promise<{ summary: SyncSummary; snapshot?: EntitySnapshot; diagnostics: QueueDiagnostics }> {
  if (!canAttemptRemote(options)) throw new Error("Sem conexão, sessão ativa ou Supabase configurado para sincronização.");
  const diagnostics = await diagnosePendingQueue();
  const items = await getAllSyncItems();
  await Promise.all(items.map((item) => compactPendingQueue(item.store, item.entityId)));
  const summaryResult = await syncPendingQueue({ session: options.session, accessStatus: "active", accountOwnerUserId: options.accountOwnerUserId, deviceId: typeof navigator === "undefined" ? "server" : navigator.userAgent });
  const snapshot = await fetchCloudSnapshot("clientes", options);
  return { summary: summaryResult.summary, snapshot, diagnostics };
}

export const saveEntity = saveEntityCloudFirst;
export const deleteEntity = deleteEntityCloudFirst;
export const saveOperationalEntity = <T extends { id: string }>(store: SyncableStore, record: T, operation: SyncOperation, options: SaveOperationalEntityOptions) => operation === "delete" ? deleteEntityCloudFirst(store, record.id, { ...options, record, operation }) : saveEntityCloudFirst(store, record, { ...options, operation });
export const fetchEntitySnapshot = fetchCloudSnapshot;
export const hydrateStoreFromCloud = hydrateLocalCacheFromCloud;
