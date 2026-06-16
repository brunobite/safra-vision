import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn(async () => ({ error: null }));
const maybeSingle = vi.fn();
const markSyncItemConflict = vi.fn();
const enqueueSyncItem = vi.fn(async (item: Record<string, unknown>) => ({ id: `queue-${item.operation}`, ...item }));
const deleteCalls: string[] = [];
const putCalls: Record<string, unknown>[] = [];

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
      })),
      upsert,
    })),
  },
}));

vi.mock("@/lib/syncQueue", () => ({
  compactSyncQueueItem: vi.fn(),
  enqueueSyncItem,
  getAllSyncItems: vi.fn(async () => []),
  markSyncItemConflict,
  removeSyncItemsForEntity: vi.fn(),
  suppressNextSyncQueueItem: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({ recordAuditLog: vi.fn() }));

vi.mock("@/lib/db", () => ({
  openAppDb: vi.fn(async () => ({
    transaction: vi.fn(() => {
      const tx: { objectStore: () => { put: (entry: Record<string, unknown>) => void; delete: (id: string) => void }; oncomplete: (() => void) | null; onerror: (() => void) | null; error: Error | null } = {
        objectStore: () => ({
          put: (entry) => { putCalls.push(entry); },
          delete: (id) => { deleteCalls.push(id); },
        }),
        oncomplete: null,
        onerror: null,
        error: null,
      };
      queueMicrotask(() => tx.oncomplete?.());
      return tx;
    }),
    close: vi.fn(),
  })),
}));

const session = { user: { id: "seller-user" } } as never;
const options = { session, accessStatus: "active", accountOwnerUserId: "owner-user", offlineFallback: true } as const;

describe("operationalPersistence conflict policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    putCalls.length = 0;
    deleteCalls.length = 0;
    maybeSingle.mockResolvedValue({ data: { updated_at: "remote-v1", deleted_at: null }, error: null });
  });

  it("edita cliente existente online com baseRemoteUpdatedAt válido", async () => {
    const { saveOperationalEntity } = await import("@/lib/operationalPersistence");

    const result = await saveOperationalEntity("clientes", { id: "c1", nome: "Novo", __syncRemoteUpdatedAt: "remote-v1" }, "upsert", options);

    expect(result.status).toBe("synced");
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: "c1", user_id: "owner-user", deleted_at: null }), { onConflict: "user_id,id" });
    expect(putCalls[0]).toMatchObject({ id: "c1", nome: "Novo", __syncAccountOwnerUserId: "owner-user" });
  });

  it("editar cliente existente sem baseRemoteUpdatedAt gera conflito controlado e visível", async () => {
    const { saveOperationalEntity } = await import("@/lib/operationalPersistence");

    const result = await saveOperationalEntity("clientes", { id: "c1", nome: "Sem base" }, "upsert", options);

    expect(result.status).toBe("conflict");
    expect(upsert).not.toHaveBeenCalled();
    expect(enqueueSyncItem).toHaveBeenCalledWith(expect.objectContaining({ status: "conflict", accountOwnerUserId: "owner-user", entityId: "c1" }));
    expect(markSyncItemConflict).toHaveBeenCalled();
  });

  it("exclui cliente existente com baseRemoteUpdatedAt válido", async () => {
    const { saveOperationalEntity } = await import("@/lib/operationalPersistence");

    const result = await saveOperationalEntity("clientes", { id: "c1", __syncRemoteUpdatedAt: "remote-v1" }, "delete", options);

    expect(result.status).toBe("synced");
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: "c1", user_id: "owner-user", deleted_at: expect.any(String) }), { onConflict: "user_id,id" });
    expect(deleteCalls).toContain("c1");
  });

  it("excluir cliente com remoto alterado bloqueia como conflito", async () => {
    const { saveOperationalEntity } = await import("@/lib/operationalPersistence");

    const result = await saveOperationalEntity("clientes", { id: "c1", __syncRemoteUpdatedAt: "remote-old" }, "delete", options);

    expect(result.status).toBe("conflict");
    expect(upsert).not.toHaveBeenCalled();
    expect(deleteCalls).not.toContain("c1");
    expect(enqueueSyncItem).toHaveBeenCalledWith(expect.objectContaining({ status: "conflict", operation: "delete", baseRemoteUpdatedAt: "remote-old" }));
  });
});
