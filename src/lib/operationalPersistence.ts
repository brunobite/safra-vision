import type { Session } from "@supabase/supabase-js";
import { enqueueSyncItem, markSyncItemSynced, suppressNextSyncQueueItem, type SyncOperation } from "@/lib/syncQueue";
import { LOCAL_TO_REMOTE_TABLE, syncPendingQueue, type RemoteRow, type SyncableStore, type SyncSummary } from "@/lib/supabaseSync";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { normalizeAccessStatus } from "@/lib/accessStatus";
import { normalizeClienteForPersistence, normalizeClientesForPersistence } from "@/lib/clientNormalization";

export type OperationalPersistenceStatus = "sending" | "synced" | "pending-offline" | "error";

export type OperationalActor = { id?: string | null; email?: string | null; role?: string | null; nome?: string | null };

export type OperationalPersistenceOptions = {
  session: Session | null;
  accessStatus: string | null;
  actorUser?: OperationalActor | null;
  accountOwnerUserId?: string | null;
  operation?: string;
  auditMetadata?: Record<string, unknown>;
  offlineFallback?: boolean;
  onStatusChange?: (status: OperationalPersistenceStatus) => void;
  onRemoteSuccess?: () => Promise<void> | void;
  onRemoteError?: (error: Error) => Promise<void> | void;
};

export type SaveOperationalEntityOptions = OperationalPersistenceOptions;

export type EntitySnapshot<T extends { id: string } = { id: string }> = {
  store: SyncableStore;
  active: T[];
  tombstones: RemoteRow[];
  rows: RemoteRow[];
  fetchedAt: string;
};

export type HydrateStoreResult<T extends { id: string } = { id: string }> = EntitySnapshot<T> & {
  appliedActive: number;
  appliedTombstones: number;
};

const nowIso = () => new Date().toISOString();

function getRemoteUserId(options: OperationalPersistenceOptions) {
  return options.accountOwnerUserId || options.session?.user.id || null;
}

function canAttemptRemote(options: OperationalPersistenceOptions) {
  return Boolean(isSupabaseConfigured && supabase && options.session?.user && normalizeAccessStatus(options.accessStatus) === "active" && getRemoteUserId(options) && (typeof navigator === "undefined" || navigator.onLine));
}

function formatRemoteError(error: unknown) {
  if (error instanceof Error) return error;
  return new Error("Falha desconhecida ao sincronizar operação.");
}

function normalizePayload<T extends { id: string }>(store: SyncableStore, record: T) {
  return store === "clientes" ? normalizeClienteForPersistence(record as Record<string, unknown>) : record;
}

function rowToRecord<T extends { id: string }>(store: SyncableStore, row: RemoteRow): T | null {
  if (row.deleted_at || !row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) return null;
  const record = { id: row.id, ...(row.payload as Record<string, unknown>) };
  return (store === "clientes" ? normalizeClientesForPersistence([record])[0] : record) as T;
}

async function writeRemoteRow<T extends { id: string }>(store: SyncableStore, record: T, operation: SyncOperation, options: OperationalPersistenceOptions) {
  if (!canAttemptRemote(options)) throw new Error("Sem conexão, sessão ativa ou Supabase configurado para gravação online.");
  const timestamp = nowIso();
  const payload = normalizePayload(store, record);
  const { error } = await supabase!.from(LOCAL_TO_REMOTE_TABLE[store]).upsert({
    id: record.id,
    user_id: getRemoteUserId(options)!,
    payload,
    updated_at: timestamp,
    deleted_at: operation === "delete" ? timestamp : null,
  }, { onConflict: "user_id,id" });
  if (error) throw new Error(error.message);
}

export async function saveEntity<T extends { id: string }>(store: SyncableStore, record: T, options: OperationalPersistenceOptions) {
  const operation = (options.operation === "delete" ? "delete" : "upsert") as SyncOperation;
  const payload = normalizePayload(store, record);
  const fallback = options.offlineFallback !== false;

  if (!canAttemptRemote(options)) {
    if (!fallback) throw new Error("Operação online obrigatória indisponível.");
    await enqueueSyncItem({ store, entityId: record.id, operation, payload });
    options.onStatusChange?.("pending-offline");
    return { status: "pending-offline" as const, remote: false };
  }

  options.onStatusChange?.("sending");
  try {
    await writeRemoteRow(store, record, operation, options);
    await markSyncItemSynced(`${store}:${record.id}`);
    suppressNextSyncQueueItem(store, record.id, operation);
    await options.onRemoteSuccess?.();
    options.onStatusChange?.("synced");
    return { status: "synced" as const, remote: true };
  } catch (error) {
    const formatted = formatRemoteError(error);
    if (!fallback) throw formatted;
    await enqueueSyncItem({ store, entityId: record.id, operation, payload });
    await options.onRemoteError?.(formatted);
    options.onStatusChange?.("pending-offline");
    return { status: "pending-offline" as const, remote: false, error: formatted };
  }
}

export async function deleteEntity<T extends { id: string }>(store: SyncableStore, id: string, options: OperationalPersistenceOptions & { record?: T }) {
  const record = options.record ?? ({ id } as T);
  return saveEntity(store, record, { ...options, operation: "delete" });
}

export async function saveOperationalEntity<T extends { id: string }>(store: SyncableStore, record: T, operation: SyncOperation, options: SaveOperationalEntityOptions) {
  return operation === "delete" ? deleteEntity(store, record.id, { ...options, record, operation }) : saveEntity(store, record, { ...options, operation });
}

export async function fetchEntitySnapshot<T extends { id: string } = { id: string }>(store: SyncableStore, options: OperationalPersistenceOptions): Promise<EntitySnapshot<T>> {
  if (!canAttemptRemote(options)) throw new Error("Sem conexão, sessão ativa ou Supabase configurado para leitura online.");
  const { data, error } = await supabase!
    .from(LOCAL_TO_REMOTE_TABLE[store])
    .select("id,user_id,payload,created_at,updated_at,deleted_at")
    .eq("user_id", getRemoteUserId(options)!)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as RemoteRow[];
  const active = rows.map((row) => rowToRecord<T>(store, row)).filter((record): record is T => Boolean(record));
  return { store, active, tombstones: rows.filter((row) => Boolean(row.deleted_at)), rows, fetchedAt: nowIso() };
}

export async function hydrateStoreFromCloud<T extends { id: string } = { id: string }>(store: SyncableStore, options: OperationalPersistenceOptions): Promise<HydrateStoreResult<T>> {
  const snapshot = await fetchEntitySnapshot<T>(store, options);
  return { ...snapshot, appliedActive: snapshot.active.length, appliedTombstones: snapshot.tombstones.length };
}

export async function syncPendingQueueNow(options: OperationalPersistenceOptions): Promise<{ summary: SyncSummary; snapshot?: EntitySnapshot }> {
  if (!canAttemptRemote(options)) throw new Error("Sem conexão, sessão ativa ou Supabase configurado para sincronização.");
  const summaryResult = await syncPendingQueue({ session: options.session, accessStatus: "active", accountOwnerUserId: options.accountOwnerUserId });
  const snapshot = await fetchEntitySnapshot("clientes", options);
  return { summary: summaryResult.summary, snapshot };
}
