export const DB_NAME = "safra-2627-operacional";
export const DB_VERSION = 1;

export const STORE_NAMES = [
  "clientes",
  "vendedores",
  "lancamentos",
  "negocios",
  "produtos",
  "metasEmpresa",
  "metasPessoais",
  "metasVendedor",
  "metasCategoria",
  "regrasComissao",
  "eventos",
  "prioridadesP1",
  "configuracoes",
  "dbMeta",
] as const;

export type StoreName = (typeof STORE_NAMES)[number];

export interface DbMeta {
  id: "meta";
  versaoSchema: number;
  seeded: boolean;
  createdAt: string;
  updatedAt: string;
}

export function openAppDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      STORE_NAMES.forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "id" });
        }
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha ao abrir IndexedDB"));
  });
}

export function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Erro no IndexedDB"));
  });
}
