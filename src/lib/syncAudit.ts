import { openAppDb, promisifyRequest, type StoreName } from "@/lib/db";
import type { SyncQueueItem, SyncStatus } from "@/lib/syncQueue";
import type { SyncableStore } from "@/lib/supabaseSync";

export const TEST_RECORD_PATTERNS = [
  "TESTE",
  "NÃO USAR",
  "NAO USAR",
  "AUTO SYNC",
  "SYNC",
  "VALIDAÇÃO",
  "VALIDACAO",
  "OFFLINE",
  "EXCLUIR TESTE",
] as const;

export const STALE_PROCESSING_MINUTES = 10;

export type SyncQueueStatusCounts = Record<SyncStatus, number>;

export interface SyncQueueAudit {
  generatedAt: string;
  total: number;
  byStatus: SyncQueueStatusCounts;
  staleProcessing: SyncQueueItem[];
  recentErrors: SyncQueueItem[];
  byStore: Record<string, number>;
}

export interface SyncErrorsSummary {
  total: number;
  recent: SyncQueueItem[];
  byStore: Record<string, number>;
  byMessage: Record<string, number>;
}

export interface TestRecordCandidate {
  key: string;
  store: SyncableStore;
  id: string;
  label: string;
  cityRoute?: string;
  createdAt?: string;
  updatedAt?: string;
  reason: string;
  localStatus: "local";
  remoteStatus?: "na-nuvem" | "somente-local" | "excluido-remoto" | "desconhecido";
  cleanable: boolean;
  payload: Record<string, unknown>;
}

const SYNCABLE_TEST_STORES: SyncableStore[] = [
  "clientes",
  "lancamentos",
  "oportunidades",
  "orcamentos",
  "negocios",
  "proximasAcoes",
  "produtos",
];

const EMPTY_COUNTS: SyncQueueStatusCounts = { pending: 0, processing: 0, synced: 0, error: 0 };

const normalize = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toUpperCase();

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>) {
  const db = await openAppDb();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

export function getStaleProcessingItems(items: SyncQueueItem[], staleMinutes = STALE_PROCESSING_MINUTES, now = new Date()) {
  const limit = now.getTime() - staleMinutes * 60_000;
  return items.filter((item) => item.status === "processing" && new Date(item.updatedAt).getTime() <= limit);
}

export function buildSyncQueueAudit(items: SyncQueueItem[], now = new Date()): SyncQueueAudit {
  const byStatus = items.reduce<SyncQueueStatusCounts>((acc, item) => {
    acc[item.status] += 1;
    return acc;
  }, { ...EMPTY_COUNTS });

  const byStore = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.store] = (acc[item.store] ?? 0) + 1;
    return acc;
  }, {});

  const recentErrors = items
    .filter((item) => item.status === "error")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 10);

  return {
    generatedAt: now.toISOString(),
    total: items.length,
    byStatus,
    staleProcessing: getStaleProcessingItems(items, STALE_PROCESSING_MINUTES, now),
    recentErrors,
    byStore,
  };
}

export function buildSyncErrorsSummary(items: SyncQueueItem[]): SyncErrorsSummary {
  const errors = items.filter((item) => item.status === "error");
  return {
    total: errors.length,
    recent: errors.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 10),
    byStore: errors.reduce<Record<string, number>>((acc, item) => {
      acc[item.store] = (acc[item.store] ?? 0) + 1;
      return acc;
    }, {}),
    byMessage: errors.reduce<Record<string, number>>((acc, item) => {
      const message = item.lastError || "Erro sem mensagem";
      acc[message] = (acc[message] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

export function detectTestRecordReasons(record: Record<string, unknown>) {
  const searchableValues = [
    record.nome,
    record.descricao,
    record.observacao,
    record.observacoes,
    record.cidade,
    record.rota,
    record.statusAtual,
    record.email,
    record.nomeContato,
  ];
  const haystack = normalize(searchableValues.filter(Boolean).join(" | "));

  return TEST_RECORD_PATTERNS.filter((pattern) => haystack.includes(normalize(pattern)));
}

export function toTestRecordCandidate(store: SyncableStore, record: Record<string, unknown>): TestRecordCandidate | null {
  const id = String(record.id ?? "");
  if (!id) return null;

  const reasons = detectTestRecordReasons(record);
  if (reasons.length === 0) return null;

  const label = String(record.nome ?? record.descricao ?? record.titulo ?? id);
  const cityRoute = [record.cidade, record.rota].filter(Boolean).join(" / ") || undefined;
  return {
    key: `${store}:${id}`,
    store,
    id,
    label,
    cityRoute,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
    reason: reasons.join(", "),
    localStatus: "local",
    remoteStatus: "desconhecido",
    cleanable: store === "clientes",
    payload: record,
  };
}

export async function getAllSyncQueueItems() {
  return withDb(async (db) => {
    const tx = db.transaction("syncQueue", "readonly");
    return (await promisifyRequest(tx.objectStore("syncQueue").getAll())) as SyncQueueItem[];
  });
}

export async function getSyncQueueItemsByStatus(status?: SyncStatus) {
  const items = await getAllSyncQueueItems();
  return status ? items.filter((item) => item.status === status) : items;
}

export async function getSyncQueueAudit() {
  return buildSyncQueueAudit(await getAllSyncQueueItems());
}

export async function getSyncErrorsSummary() {
  return buildSyncErrorsSummary(await getAllSyncQueueItems());
}

export async function findLocalTestRecordCandidates(stores: SyncableStore[] = SYNCABLE_TEST_STORES) {
  return withDb(async (db) => {
    const results: TestRecordCandidate[] = [];
    for (const store of stores) {
      const tx = db.transaction(store as StoreName, "readonly");
      const records = (await promisifyRequest(tx.objectStore(store).getAll())) as unknown[];
      records.forEach((record) => {
        if (!isRecord(record)) return;
        const candidate = toTestRecordCandidate(store, record);
        if (candidate) results.push(candidate);
      });
    }
    return results.sort((a, b) => a.store.localeCompare(b.store) || a.label.localeCompare(b.label));
  });
}
