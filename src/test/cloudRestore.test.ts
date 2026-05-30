import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreName } from "@/lib/db";
import type { RemoteRow } from "@/lib/supabaseSync";

const dbState = new Map<string, Record<string, unknown>[]>();
let pendingItems: unknown[] = [];

function makeRequest<T>(result: T) {
  return { result } as IDBRequest<T>;
}

function makeObjectStore(store: string) {
  return {
    clear: () => {
      dbState.set(store, []);
      return makeRequest(undefined);
    },
    put: (entry: Record<string, unknown>) => {
      const current = dbState.get(store) ?? [];
      const next = current.filter((item) => item.id !== entry.id);
      next.push(entry);
      dbState.set(store, next);
      return makeRequest(entry.id);
    },
    getAll: () => makeRequest([...(dbState.get(store) ?? [])]),
  };
}

vi.mock("@/lib/db", () => ({
  openAppDb: vi.fn(async () => ({
    transaction: (_stores: StoreName | StoreName[]) => {
      const tx: { objectStore: (store: string) => ReturnType<typeof makeObjectStore>; oncomplete: (() => void) | null; onerror: (() => void) | null; onabort: (() => void) | null; error: Error | null } = {
        objectStore: (store: string) => makeObjectStore(store),
        oncomplete: null,
        onerror: null,
        onabort: null,
        error: null,
      };
      queueMicrotask(() => tx.oncomplete?.());
      return tx;
    },
    close: vi.fn(),
  })),
  promisifyRequest: vi.fn(async <T,>(request: { result: T }) => request.result),
}));

vi.mock("@/lib/syncQueue", () => ({
  getPendingSyncItems: vi.fn(async () => pendingItems),
  markSyncItemError: vi.fn(),
  markSyncItemProcessing: vi.fn(),
  markSyncItemSynced: vi.fn(),
}));

const activeRow = (id: string, payload: Record<string, unknown>): RemoteRow => ({
  id,
  user_id: "user-1",
  payload,
  created_at: null,
  updated_at: null,
  deleted_at: null,
});

const deletedRow = (id: string, payload: Record<string, unknown>): RemoteRow => ({
  ...activeRow(id, payload),
  deleted_at: "2026-05-30T00:00:00.000Z",
});

describe("cloudRestore", () => {
  beforeEach(() => {
    dbState.clear();
    pendingItems = [];
    vi.useRealTimers();
    vi.stubGlobal("navigator", {
      onLine: true,
      userAgent: "Vitest",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds active account snapshots and maps remote tables to local stores", async () => {
    const { buildAccountSnapshotFromRemoteRows, REMOTE_TO_LOCAL_STORE } = await import("@/lib/cloudRestore");

    const snapshot = buildAccountSnapshotFromRemoteRows({
      clientes: [activeRow("c1", { id: "c1", nome: "Cliente real" }), deletedRow("c2", { id: "c2", nome: "Excluído" })],
      proximasAcoes: [activeRow("a1", { id: "a1", titulo: "Ação" })],
      formasPagamento: [activeRow("f1", { nome: "Pix" })],
    });

    expect(snapshot.clientes).toEqual([{ id: "c1", nome: "Cliente real" }]);
    expect(snapshot.proximasAcoes).toEqual([{ id: "a1", titulo: "Ação" }]);
    expect(snapshot.formasPagamento).toEqual([{ id: "f1", nome: "Pix" }]);
    expect(REMOTE_TO_LOCAL_STORE.proximas_acoes).toBe("proximasAcoes");
    expect(REMOTE_TO_LOCAL_STORE.formas_pagamento).toBe("formasPagamento");
    expect(REMOTE_TO_LOCAL_STORE.prazos_pagamento).toBe("prazosPagamento");
    expect(REMOTE_TO_LOCAL_STORE.app_config).toBe("appConfig");
  });

  it("decides when account restore is allowed or blocked", async () => {
    const { shouldRestoreFromCloud } = await import("@/lib/cloudRestore");
    const base = {
      supabaseConfigured: true,
      sessionExists: true,
      accessStatus: "active",
      isOnline: true,
      pendingSyncCount: 0,
      onlyLocal: 0,
      onlyRemote: 84,
      remoteCount: 86,
    } as const;

    expect(shouldRestoreFromCloud(base).allowed).toBe(true);
    expect(shouldRestoreFromCloud({ ...base, pendingSyncCount: 1 }).reason).toBe("pending-sync");
    expect(shouldRestoreFromCloud({ ...base, onlyLocal: 1 }).reason).toBe("local-conflict");
    expect(shouldRestoreFromCloud({ ...base, isOnline: false }).reason).toBe("offline");
    expect(shouldRestoreFromCloud({ ...base, accessStatus: "blocked" }).reason).toBe("inactive-profile");
  });

  it("restores syncable stores, ignores deleted records and preserves internal stores", async () => {
    const { buildAccountSnapshotFromRemoteRows, restoreAccountSnapshotToLocal } = await import("@/lib/cloudRestore");
    dbState.set("clientes", [{ id: "local", nome: "Local" }]);
    dbState.set("importLogs", [{ id: "log-1", file: "clientes.csv" }]);
    dbState.set("syncQueue", [{ id: "clientes:local", status: "synced" }]);

    const snapshot = buildAccountSnapshotFromRemoteRows({
      clientes: [activeRow("c1", { id: "c1", nome: "Nuvem" }), deletedRow("c2", { id: "c2", nome: "Deletado" })],
      produtos: [activeRow("p1", { id: "p1", nome: "Produto" })],
      appConfig: [activeRow("main", { id: "main", percentualAcertoEsperado: 15 })],
    });

    const result = await restoreAccountSnapshotToLocal(snapshot);

    expect(dbState.get("clientes")).toEqual([{ id: "c1", nome: "Nuvem" }]);
    expect(dbState.get("produtos")).toEqual([{ id: "p1", nome: "Produto" }]);
    expect(dbState.get("clientes")).not.toContainEqual(expect.objectContaining({ id: "c2" }));
    expect(dbState.get("importLogs")).toEqual([{ id: "log-1", file: "clientes.csv" }]);
    expect(dbState.get("syncQueue")).toEqual([{ id: "clientes:local", status: "synced" }]);
    expect(result.snapshot.appConfig[0]).toMatchObject({ id: "main", percentualAcertoEsperado: 15, syncMeta: { lastUploadAt: null } });
  });

  it("blocks restore when local sync queue has pending items", async () => {
    const { buildAccountSnapshotFromRemoteRows, restoreAccountSnapshotToLocal } = await import("@/lib/cloudRestore");
    pendingItems = [{ id: "clientes:c1" }];
    const snapshot = buildAccountSnapshotFromRemoteRows({ clientes: [activeRow("c1", { id: "c1" })] });

    await expect(restoreAccountSnapshotToLocal(snapshot)).rejects.toThrow("Existem dados locais que ainda não estão na nuvem");
    expect(dbState.get("clientes")).toBeUndefined();
  });

  it("compares local with restored snapshot so local equals cloud", async () => {
    const { buildAccountSnapshotFromRemoteRows, restoreAccountSnapshotToLocal } = await import("@/lib/cloudRestore");
    const snapshot = buildAccountSnapshotFromRemoteRows({
      clientes: [activeRow("c1", { id: "c1" }), activeRow("c2", { id: "c2" })],
      produtos: [activeRow("p1", { id: "p1" })],
    });

    await restoreAccountSnapshotToLocal(snapshot);

    vi.resetModules();
    vi.doMock("@/lib/supabase", () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: (table: string) => ({
          select: () => ({
            eq: () => ({
              is: () => Promise.resolve({
                data: table === "clientes"
                  ? [activeRow("c1", { id: "c1" }), activeRow("c2", { id: "c2" })]
                  : table === "produtos"
                    ? [activeRow("p1", { id: "p1" })]
                    : [],
                error: null,
              }),
            }),
          }),
        }),
      },
    }));
    const restoredModule = await import("@/lib/cloudRestore");
    const comparison = await restoredModule.compareLocalWithAccountSnapshot({
      session: { user: { id: "user-1" } } as never,
      accessStatus: "active",
    });

    expect(comparison.totals.localCount).toBe(3);
    expect(comparison.totals.remoteCount).toBe(3);
    expect(comparison.totals.onlyLocal).toBe(0);
    expect(comparison.totals.onlyRemote).toBe(0);
    expect(comparison.totals.inBoth).toBe(3);
  });
});
