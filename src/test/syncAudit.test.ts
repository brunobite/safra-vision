import { describe, expect, it } from "vitest";
import { buildSyncErrorsSummary, buildSyncQueueAudit, detectTestRecordReasons, getStaleProcessingItems, toTestRecordCandidate } from "@/lib/syncAudit";
import type { SyncQueueItem } from "@/lib/syncQueue";

const item = (partial: Partial<SyncQueueItem>): SyncQueueItem => ({
  id: "clientes:c1",
  store: "clientes",
  entityId: "c1",
  operation: "upsert",
  createdAt: "2026-05-29T10:00:00.000Z",
  updatedAt: "2026-05-29T10:00:00.000Z",
  status: "pending",
  attempts: 0,
  ...partial,
});

describe("syncAudit", () => {
  it("counts syncQueue items by status and detects stale processing", () => {
    const now = new Date("2026-05-29T10:20:00.000Z");
    const audit = buildSyncQueueAudit([
      item({ id: "a", status: "pending" }),
      item({ id: "b", status: "processing", updatedAt: "2026-05-29T10:01:00.000Z" }),
      item({ id: "c", status: "processing", updatedAt: "2026-05-29T10:19:00.000Z" }),
      item({ id: "d", status: "synced" }),
      item({ id: "e", status: "error", lastError: "RLS" }),
    ], now);

    expect(audit.byStatus).toEqual({ pending: 1, processing: 2, synced: 1, error: 1 });
    expect(audit.staleProcessing.map((stale) => stale.id)).toEqual(["b"]);
    expect(audit.recentErrors.map((error) => error.id)).toEqual(["e"]);
  });

  it("summarizes errors by store and message", () => {
    const summary = buildSyncErrorsSummary([
      item({ id: "e1", store: "clientes", status: "error", lastError: "Falha de rede" }),
      item({ id: "e2", store: "clientes", status: "error", lastError: "Falha de rede" }),
      item({ id: "ok", store: "produtos", status: "pending" }),
    ]);

    expect(summary.total).toBe(2);
    expect(summary.byStore.clientes).toBe(2);
    expect(summary.byMessage["Falha de rede"]).toBe(2);
  });

  it("detects test records with accent-insensitive patterns", () => {
    expect(detectTestRecordReasons({ nome: "Cliente NÃO USAR validação offline" })).toEqual(["NÃO USAR", "VALIDAÇÃO", "OFFLINE"]);
    expect(toTestRecordCandidate("clientes", { id: "c1", nome: "AUTO SYNC TESTE", cidade: "Bagé", rota: "R1" })).toMatchObject({
      cleanable: true,
      store: "clientes",
      id: "c1",
      cityRoute: "Bagé / R1",
    });
    expect(toTestRecordCandidate("produtos", { id: "p1", nome: "Produto TESTE" })?.cleanable).toBe(false);
  });

  it("returns processing items older than configured threshold", () => {
    const stale = getStaleProcessingItems([
      item({ id: "old", status: "processing", updatedAt: "2026-05-29T09:00:00.000Z" }),
      item({ id: "new", status: "processing", updatedAt: "2026-05-29T09:56:00.000Z" }),
    ], 10, new Date("2026-05-29T10:00:00.000Z"));

    expect(stale.map((entry) => entry.id)).toEqual(["old"]);
  });
});
