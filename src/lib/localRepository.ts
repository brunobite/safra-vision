import { DbMeta, DB_VERSION, openAppDb, promisifyRequest, StoreName } from "@/lib/db";
import { SeedData, seedData } from "@/lib/seedData";

const nowIso = () => new Date().toISOString();

export interface AppPersistedData extends SeedData {
  dbMeta: DbMeta;
}

export interface LocalDbStats {
  status: "ativo";
  tipo: "IndexedDB";
  createdAt: string;
  updatedAt: string;
  counts: Record<StoreName, number>;
}

const storesToLoad: StoreName[] = [
  "clientes", "vendedores", "lancamentos", "negocios", "oportunidades", "produtos", "metasEmpresa",
  "metasPessoais", "metasVendedor", "metasCategoria", "regrasComissao", "eventos",
  "prioridadesP1", "configuracoes", "orcamentos", "orcamentoItens", "empresas", "proximasAcoes", "relatoriosVisita",
  "formasPagamento", "importLogs", "prazosPagamento", "appConfig",
];

async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openAppDb();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

async function getAll<T>(db: IDBDatabase, store: StoreName): Promise<T[]> {
  const tx = db.transaction(store, "readonly");
  const data = await promisifyRequest(tx.objectStore(store).getAll());
  return data as T[];
}

function putAll(db: IDBDatabase, store: StoreName, entries: Array<Record<string, unknown>>) {
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  entries.forEach((entry) => os.put(entry));
}

async function waitForTransaction(tx: IDBTransaction) {
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Falha na transação IndexedDB."));
    tx.onabort = () => reject(tx.error ?? new Error("Transação IndexedDB abortada."));
  });
}

export async function bootstrapLocalDatabase(): Promise<AppPersistedData> {
  return withDb(async (db) => {
    const dbMeta = await readDbMeta(db);
    if (!dbMeta?.seeded) {
      await seedInitialData(db);
    }

    const loaded = Object.fromEntries(
      await Promise.all(storesToLoad.map(async (store) => [store, await getAll(db, store)])),
    ) as unknown as SeedData;

    return {
      ...loaded,
      dbMeta: (await readDbMeta(db))!,
    };
  });
}

async function readDbMeta(db: IDBDatabase): Promise<DbMeta | undefined> {
  const tx = db.transaction("dbMeta", "readonly");
  const meta = await promisifyRequest(tx.objectStore("dbMeta").get("meta"));
  return meta as DbMeta | undefined;
}

async function writeDbMeta(db: IDBDatabase, partial: Partial<DbMeta>) {
  const current = await readDbMeta(db);
  const createdAt = current?.createdAt ?? nowIso();
  const merged: DbMeta = {
    id: "meta",
    versaoSchema: DB_VERSION,
    seeded: current?.seeded ?? false,
    createdAt,
    updatedAt: nowIso(),
    ...current,
    ...partial,
  };
  const tx = db.transaction("dbMeta", "readwrite");
  tx.objectStore("dbMeta").put(merged);
}

async function seedInitialData(db: IDBDatabase) {
  storesToLoad.forEach((store) => {
    putAll(db, store, (seedData as unknown as Record<string, Array<Record<string, unknown>>>)[store] ?? []);
  });
  await writeDbMeta(db, { seeded: true, versaoSchema: DB_VERSION });
}

export async function saveStore<T extends { id: string }>(store: StoreName, list: T[]) {
  return withDb(async (db) => {
    try {
      const tx = db.transaction(store, "readwrite");
      const os = tx.objectStore(store);
      await promisifyRequest(os.clear());
      list.forEach((item) => os.put(item));
      await waitForTransaction(tx);
      await writeDbMeta(db, {});
    } catch (error) {
      console.error(`[localRepository] Erro ao salvar store "${store}"`, error);
      throw new Error(`Falha ao persistir "${store}" no banco local.`);
    }
  });
}

export async function getLocalDbStats(): Promise<LocalDbStats> {
  return withDb(async (db) => {
    const countsEntries = await Promise.all(
      ([...storesToLoad, "dbMeta"] as StoreName[]).map(async (store) => {
        const tx = db.transaction(store, "readonly");
        const count = await promisifyRequest(tx.objectStore(store).count());
        return [store, count] as const;
      }),
    );
    const meta = await readDbMeta(db);
    return {
      status: "ativo",
      tipo: "IndexedDB",
      createdAt: meta?.createdAt ?? "-",
      updatedAt: meta?.updatedAt ?? "-",
      counts: Object.fromEntries(countsEntries) as Record<StoreName, number>,
    };
  });
}

export async function resetLocalDatabase() {
  return withDb(async (db) => {
    for (const store of storesToLoad) {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).clear();
      await waitForTransaction(tx);
    }
    await writeDbMeta(db, { seeded: true, versaoSchema: DB_VERSION });
  });
}

export async function clearOperationalStores() {
  const operationalStores: StoreName[] = [
    "clientes", "lancamentos", "negocios", "oportunidades", "produtos", "eventos", "prioridadesP1",
    "orcamentos", "orcamentoItens", "proximasAcoes", "relatoriosVisita", "importLogs",
  ];

  return withDb(async (db) => {
    for (const store of operationalStores) {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).clear();
      await waitForTransaction(tx);
    }
    await writeDbMeta(db, { seeded: true, versaoSchema: DB_VERSION });
  });
}


export async function replaceLocalDatabase(payload: Partial<AppPersistedData>) {
  return withDb(async (db) => {
    for (const store of storesToLoad) {
      const tx = db.transaction(store, "readwrite");
      const os = tx.objectStore(store);
      await promisifyRequest(os.clear());
      const entries = (payload as Record<string, Array<Record<string, unknown>>>)[store] ?? [];
      entries.forEach((entry) => os.put(entry));
    }

    if (payload.dbMeta) {
      const tx = db.transaction("dbMeta", "readwrite");
      tx.objectStore("dbMeta").put(payload.dbMeta);
    }

    await writeDbMeta(db, { seeded: true, versaoSchema: DB_VERSION });
  });
}

export async function deleteLocalItemsById(store: StoreName, ids: string[]) {
  if (ids.length === 0) return;
  return withDb(async (db) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    ids.forEach((id) => os.delete(id));
    await waitForTransaction(tx);
    await writeDbMeta(db, {});
  });
}
