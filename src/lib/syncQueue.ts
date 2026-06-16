import { openAppDb, promisifyRequest, StoreName } from "@/lib/db";

export type SyncOperation = "upsert" | "delete";
export type SyncStatus = "pending" | "pending-offline" | "processing" | "synced" | "error" | "obsolete" | "conflict" | "orphaned";

export interface SyncQueueItem {
  id: string;
  accountOwnerUserId: string | null;
  actorUserId: string | null;
  deviceId: string;
  store: string;
  entityId: string;
  operation: SyncOperation;
  payload?: unknown;
  baseRemoteUpdatedAt: string | null;
  clientMutationId: string;
  createdAt: string;
  updatedAt: string;
  status: SyncStatus;
  attempts: number;
  lastError?: string;
}

const STORE_NAME: StoreName = "syncQueue";
const TRACKED_STORES = new Set<StoreName>([
  "clientes",
  "vendedores",
  "produtos",
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
  "formasPagamento",
  "prazosPagamento",
  "appConfig",
]);

const now = () => new Date().toISOString();
const legacyQueueId = (store: string, entityId: string) => `${store}:${entityId}`;
const newMutationId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const queueId = (accountOwnerUserId: string, store: string, entityId: string, clientMutationId: string) => `${accountOwnerUserId}:${store}:${entityId}:${clientMutationId}`;
const suppressedQueueItems = new Map<string, SyncOperation>();

export function suppressNextSyncQueueItem(store: string, entityId: string, operation: SyncOperation) {
  suppressedQueueItems.set(legacyQueueId(store, entityId), operation);
}

export function consumeSuppressedSyncQueueItem(store: string, entityId: string, operation: SyncOperation) {
  const id = legacyQueueId(store, entityId);
  if (suppressedQueueItems.get(id) !== operation) return false;
  suppressedQueueItems.delete(id);
  return true;
}

async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>) {
  const db = await openAppDb();
  try { return await fn(db); } finally { db.close(); }
}

export function shouldTrackSyncStore(store: StoreName) {
  return TRACKED_STORES.has(store);
}

export async function enqueueSyncItem(input: Omit<SyncQueueItem, "id" | "createdAt" | "updatedAt" | "status" | "attempts" | "clientMutationId" | "deviceId" | "actorUserId" | "baseRemoteUpdatedAt"> & Partial<Pick<SyncQueueItem, "status" | "clientMutationId" | "deviceId" | "actorUserId" | "baseRemoteUpdatedAt">>) {
  if (!input.accountOwnerUserId) throw new Error("SyncQueue exige accountOwnerUserId; fila sem namespace de conta foi bloqueada.");
  return withDb(async (db) => {
    const clientMutationId = input.clientMutationId ?? newMutationId();
    const id = queueId(input.accountOwnerUserId, input.store, input.entityId, clientMutationId);
    const tx = db.transaction(STORE_NAME, "readwrite");
    const os = tx.objectStore(STORE_NAME);
    const existing = await promisifyRequest(os.get(id)) as SyncQueueItem | undefined;
    const timestamp = now();
    const shouldKeepExistingDelete = existing?.operation === "delete" && input.operation === "upsert" && existing.status !== "synced";
    const next: SyncQueueItem = shouldKeepExistingDelete ? {
      ...existing,
      updatedAt: timestamp,
      status: existing.status === "processing" ? "pending" : existing.status,
      lastError: undefined,
    } : {
      id,
      accountOwnerUserId: input.accountOwnerUserId,
      actorUserId: input.actorUserId ?? null,
      deviceId: input.deviceId ?? "unknown-device",
      store: input.store,
      entityId: input.entityId,
      operation: input.operation,
      payload: input.payload,
      baseRemoteUpdatedAt: input.baseRemoteUpdatedAt ?? null,
      clientMutationId,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      status: input.status ?? "pending",
      attempts: existing?.attempts ?? 0,
      lastError: undefined,
    };
    os.put(next);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Erro ao enfileirar sync item."));
    });
    return next;
  });
}

export async function getPendingSyncItems() {
  return withDb(async (db) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const items = await promisifyRequest(tx.objectStore(STORE_NAME).getAll()) as SyncQueueItem[];
    return items.filter((item) => (item.status === "pending" || item.status === "pending-offline" || item.status === "error") && Boolean(item.accountOwnerUserId));
  });
}

export async function compactSyncQueueItem(store: string, entityId: string, reason = "compactado") {
  return withDb(async (db) => {
    const id = legacyQueueId(store, entityId);
    const tx = db.transaction(STORE_NAME, "readwrite");
    const os = tx.objectStore(STORE_NAME);
    const current = await promisifyRequest(os.get(id)) as SyncQueueItem | undefined;
    if (!current) return undefined;
    if (current.operation === "delete") {
      os.put({ ...current, status: "pending", updatedAt: now(), lastError: undefined });
    } else if (!TRACKED_STORES.has(current.store as StoreName)) {
      os.put({ ...current, status: "obsolete", updatedAt: now(), lastError: reason });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Erro ao compactar item da fila."));
    });
    return current;
  });
}

export async function removeSyncItemsForEntity(store: string, entityId: string) {
  const items = await getAllSyncItems();
  await Promise.all(items.filter((item) => item.store === store && item.entityId === entityId).map((item) => markSyncItemSynced(item.id)));
}

async function updateSyncItem(id: string, updater: (item: SyncQueueItem) => SyncQueueItem) {
  return withDb(async (db) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const os = tx.objectStore(STORE_NAME);
    const current = await promisifyRequest(os.get(id)) as SyncQueueItem | undefined;
    if (!current) return undefined;
    const updated = updater(current);
    os.put(updated);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Erro ao atualizar sync item."));
    });
    return updated;
  });
}

export const markSyncItemProcessing = (id: string) => updateSyncItem(id, (item) => ({ ...item, status: "processing", updatedAt: now(), attempts: item.attempts + 1 }));
export async function markSyncItemSynced(id: string) {
  return withDb(async (db) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Erro ao remover sync item sincronizado."));
      tx.onabort = () => reject(tx.error ?? new Error("Remoção de sync item sincronizado abortada."));
    });
  });
}
export const markSyncItemError = (id: string, error: string) => updateSyncItem(id, (item) => ({ ...item, status: "error", updatedAt: now(), lastError: error }));
export const markSyncItemConflict = (id: string, error: string) => updateSyncItem(id, (item) => ({ ...item, status: "conflict", updatedAt: now(), lastError: error }));
export const markOrphanedLegacySyncItem = (id: string, error: string) => updateSyncItem(id, (item) => ({ ...item, status: "orphaned", updatedAt: now(), lastError: error }));

export async function getAllSyncItems() {
  return withDb(async (db) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    return (await promisifyRequest(tx.objectStore(STORE_NAME).getAll())) as SyncQueueItem[];
  });
}

export async function requeueFailedAndStaleSyncItems(staleMinutes = 10) {
  return withDb(async (db) => {
    const staleLimit = Date.now() - staleMinutes * 60_000;
    const tx = db.transaction(STORE_NAME, "readwrite");
    const os = tx.objectStore(STORE_NAME);
    const items = (await promisifyRequest(os.getAll())) as SyncQueueItem[];
    const changed: SyncQueueItem[] = [];

    items.forEach((item) => {
      const isStaleProcessing = item.status === "processing" && new Date(item.updatedAt).getTime() <= staleLimit;
      if ((item.status !== "error" && item.status !== "pending-offline") && !isStaleProcessing) return;
      if (!item.accountOwnerUserId) return;
      const updated: SyncQueueItem = {
        ...item,
        status: input.status ?? "pending",
        updatedAt: now(),
        lastError: item.status === "error" ? item.lastError : undefined,
      };
      os.put(updated);
      changed.push(updated);
    });

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Erro ao reprocessar itens da fila."));
    });

    return changed;
  });
}
