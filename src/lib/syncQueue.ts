import { openAppDb, promisifyRequest, StoreName } from "@/lib/db";

export type SyncOperation = "upsert" | "delete";
export type SyncStatus = "pending" | "processing" | "synced" | "error";

export interface SyncQueueItem {
  id: string;
  store: string;
  entityId: string;
  operation: SyncOperation;
  payload?: unknown;
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
const queueId = (store: string, entityId: string) => `${store}:${entityId}`;

async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>) {
  const db = await openAppDb();
  try { return await fn(db); } finally { db.close(); }
}

export function shouldTrackSyncStore(store: StoreName) {
  return TRACKED_STORES.has(store);
}

export async function enqueueSyncItem(input: Omit<SyncQueueItem, "id" | "createdAt" | "updatedAt" | "status" | "attempts">) {
  return withDb(async (db) => {
    const id = queueId(input.store, input.entityId);
    const tx = db.transaction(STORE_NAME, "readwrite");
    const os = tx.objectStore(STORE_NAME);
    const existing = await promisifyRequest(os.get(id)) as SyncQueueItem | undefined;
    const next: SyncQueueItem = {
      id,
      store: input.store,
      entityId: input.entityId,
      operation: input.operation,
      payload: input.payload,
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now(),
      status: "pending",
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
    return items.filter((item) => item.status === "pending" || item.status === "error");
  });
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
      if (item.status !== "error" && !isStaleProcessing) return;
      const updated: SyncQueueItem = {
        ...item,
        status: "pending",
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
