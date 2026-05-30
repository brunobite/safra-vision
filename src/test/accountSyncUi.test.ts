import { describe, expect, it } from "vitest";
import { buildAccountSyncStatus } from "@/lib/accountSyncOrchestrator";
import {
  ACCOUNT_SYNC_MESSAGES,
  addAccountSyncHistoryEvent,
  getAccountSyncUserMessage,
  getAccountSyncVisualState,
  SYNC_HOMOLOGATION_CHECKLIST,
  type AccountSyncHistoryEvent,
} from "@/lib/accountSyncUi";

describe("accountSyncUi", () => {
  it("returns simple user-level status messages", () => {
    expect(getAccountSyncUserMessage({ isOnline: true, cloudSessionExists: true, cloudAccessStatus: "active", pendingSyncCount: 0 })).toBe(ACCOUNT_SYNC_MESSAGES.active);
    expect(getAccountSyncUserMessage({ isOnline: false, cloudSessionExists: true, cloudAccessStatus: "active", pendingSyncCount: 0 })).toBe(ACCOUNT_SYNC_MESSAGES.offline);
    expect(getAccountSyncUserMessage({ isOnline: true, cloudSessionExists: true, cloudAccessStatus: "active", pendingSyncCount: 0, hasConflict: true })).toBe(ACCOUNT_SYNC_MESSAGES.conflict);
    expect(getAccountSyncUserMessage({ isOnline: true, cloudSessionExists: true, cloudAccessStatus: "pending", pendingSyncCount: 0 })).toBe(ACCOUNT_SYNC_MESSAGES.inactive);
  });

  it("does not expose technical terms in user-level messages", () => {
    const status = buildAccountSyncStatus({ code: "error", message: "Falha IndexedDB payload syncQueue RLS snapshot onlyLocal onlyRemote" });

    expect(getAccountSyncUserMessage({ isOnline: true, cloudSessionExists: true, cloudAccessStatus: "active", pendingSyncCount: 0, accountSyncStatus: status })).toBe(ACCOUNT_SYNC_MESSAGES.updated);
  });

  it("maps simple visual states", () => {
    expect(getAccountSyncVisualState({ isOnline: true, isSyncing: false, cloudSessionExists: true, cloudAccessStatus: "active", pendingSyncCount: 0 })).toBe("Atualizado");
    expect(getAccountSyncVisualState({ isOnline: true, isSyncing: true, cloudSessionExists: true, cloudAccessStatus: "active", pendingSyncCount: 0 })).toBe("Sincronizando");
    expect(getAccountSyncVisualState({ isOnline: true, isSyncing: false, cloudSessionExists: true, cloudAccessStatus: "active", pendingSyncCount: 2 })).toBe("Pendente");
    expect(getAccountSyncVisualState({ isOnline: false, isSyncing: false, cloudSessionExists: true, cloudAccessStatus: "active", pendingSyncCount: 0 })).toBe("Offline");
    expect(getAccountSyncVisualState({ isOnline: true, isSyncing: false, cloudSessionExists: true, cloudAccessStatus: "active", pendingSyncCount: 0, hasConflict: true })).toBe("Atenção");
    expect(getAccountSyncVisualState({ isOnline: true, isSyncing: false, cloudSessionExists: false, cloudAccessStatus: null, pendingSyncCount: 0 })).toBe("Bloqueado");
  });

  it("keeps only the last 10 history events", () => {
    const history = Array.from({ length: 12 }).reduce<AccountSyncHistoryEvent[]>(
      (current, _, index) => addAccountSyncHistoryEvent(current, { id: `e-${index}`, timestamp: `2026-05-30T00:00:${String(index).padStart(2, "0")}.000Z`, tipo: "sync-now", status: "sucesso", mensagem: `Evento ${index}` }),
      [],
    );

    expect(history).toHaveLength(10);
    expect(history[0].mensagem).toBe("Evento 11");
    expect(history[9].mensagem).toBe("Evento 2");
  });

  it("includes the advanced homologation checklist copy text", () => {
    expect(SYNC_HOMOLOGATION_CHECKLIST).toContain("Celular → computador");
    expect(SYNC_HOMOLOGATION_CHECKLIST).toContain("Offline → online");
    expect(SYNC_HOMOLOGATION_CHECKLIST).toContain("Conflito");
    expect(SYNC_HOMOLOGATION_CHECKLIST).toContain("Restauração");
  });
});
