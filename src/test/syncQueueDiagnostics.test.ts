import { describe, expect, it } from "vitest";
import { categorizeSyncQueueItem, getSyncQueueDiagnostics, type SyncQueueItem } from "@/lib/syncQueue";

function item(overrides: Partial<SyncQueueItem>): SyncQueueItem {
  return {
    id: overrides.id ?? "id",
    accountOwnerUserId: overrides.accountOwnerUserId === undefined ? "owner" : overrides.accountOwnerUserId,
    actorUserId: overrides.actorUserId ?? "seller",
    deviceId: overrides.deviceId ?? "device",
    store: overrides.store ?? "clientes",
    entityId: overrides.entityId ?? "c1",
    operation: overrides.operation ?? "upsert",
    payload: overrides.payload ?? {},
    baseRemoteUpdatedAt: overrides.baseRemoteUpdatedAt ?? null,
    clientMutationId: overrides.clientMutationId ?? "m1",
    createdAt: overrides.createdAt ?? "now",
    updatedAt: overrides.updatedAt ?? "now",
    status: overrides.status ?? "pending",
    attempts: overrides.attempts ?? 0,
    lastError: overrides.lastError,
  };
}

describe("sync queue operational diagnostics", () => {
  it("conta pending real como pendência de envio automático", () => {
    const diagnostics = getSyncQueueDiagnostics([item({ status: "pending" })]);

    expect(diagnostics.pendingUpload).toBe(1);
    expect(diagnostics.conflicts).toBe(0);
  });

  it("não conta conflict como retry automático", () => {
    const diagnostics = getSyncQueueDiagnostics([item({ status: "conflict", lastError: "Conflito remoto" })]);

    expect(categorizeSyncQueueItem(item({ status: "conflict" }))).toBe("conflict");
    expect(diagnostics.pendingUpload).toBe(0);
    expect(diagnostics.conflicts).toBe(1);
  });

  it("não conta orphaned como retry automático", () => {
    const diagnostics = getSyncQueueDiagnostics([item({ status: "orphaned", accountOwnerUserId: null })]);

    expect(diagnostics.pendingUpload).toBe(0);
    expect(diagnostics.orphaned).toBe(1);
  });

  it("classifica cleanup manual para remover apenas orphaned/obsolete", () => {
    const items = [
      item({ id: "pending", status: "pending" }),
      item({ id: "conflict", status: "conflict" }),
      item({ id: "orphaned", status: "orphaned", accountOwnerUserId: null }),
      item({ id: "obsolete", status: "obsolete" }),
    ];

    const removable = items.filter((queueItem) => ["orphaned", "obsolete"].includes(categorizeSyncQueueItem(queueItem))).map((queueItem) => queueItem.id);

    expect(removable).toEqual(["orphaned", "obsolete"]);
  });

  it("preserva conflito fora da limpeza de órfãos/obsoletos", () => {
    const conflict = item({ id: "conflict", status: "conflict" });

    expect(["orphaned", "obsolete"].includes(categorizeSyncQueueItem(conflict))).toBe(false);
  });

  it("zera contador operacional quando só há itens técnicos não reenviáveis", () => {
    const diagnostics = getSyncQueueDiagnostics([
      item({ status: "conflict" }),
      item({ status: "orphaned", accountOwnerUserId: null }),
      item({ status: "obsolete" }),
    ]);

    expect(diagnostics.pendingUpload).toBe(0);
    expect(diagnostics.total).toBe(3);
  });

  it("separa erro de rede/sessão como pendência reenviável, mas diagnosticada", () => {
    const diagnostics = getSyncQueueDiagnostics([item({ status: "error", lastError: "Erro de rede: Failed to fetch" })]);

    expect(diagnostics.pendingUpload).toBe(1);
    expect(diagnostics.networkSessionErrors).toBe(1);
  });
});
