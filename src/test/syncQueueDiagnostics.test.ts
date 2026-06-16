import { describe, expect, it } from "vitest";
import type { SyncQueueItem } from "@/lib/syncQueue";

const operationalStatuses = ["pending", "pending-offline", "error", "conflict", "orphaned"];

function countOperational(items: SyncQueueItem[]) {
  return items.filter((item) => operationalStatuses.includes(item.status)).length;
}

describe("sync queue operational diagnostics", () => {
  it("mantém conflitos visíveis para contadores operacionais", () => {
    const items = [
      { id: "1", accountOwnerUserId: "owner", actorUserId: "seller", deviceId: "device", store: "clientes", entityId: "c1", operation: "upsert", baseRemoteUpdatedAt: "v1", clientMutationId: "m1", createdAt: "now", updatedAt: "now", status: "conflict" },
      { id: "2", accountOwnerUserId: null, actorUserId: null, deviceId: "device", store: "clientes", entityId: "c2", operation: "upsert", baseRemoteUpdatedAt: null, clientMutationId: "m2", createdAt: "now", updatedAt: "now", status: "orphaned" },
    ] satisfies SyncQueueItem[];

    expect(countOperational(items)).toBe(2);
  });
});
