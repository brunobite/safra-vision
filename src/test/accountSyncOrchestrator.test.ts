import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import {
  buildAccountSyncStatus,
  resetAccountSyncCooldownForTests,
  runAccountSyncCheck,
  runAccountSyncNow,
  shouldAutoRestoreAccount,
  type AccountSyncDependencies,
} from "@/lib/accountSyncOrchestrator";
import type { LocalRemoteComparison, SyncSummary } from "@/lib/supabaseSync";

const session = { user: { id: "user-1" } } as Session;

const emptySummary = (): SyncSummary => ({ total: 0, success: 0, error: 0, byStore: {}, errors: [] });

const comparison = (totals: Partial<LocalRemoteComparison["totals"]>): LocalRemoteComparison => ({
  generatedAt: "2026-05-30T00:00:00.000Z",
  stores: [],
  totals: {
    localCount: 0,
    remoteCount: 0,
    onlyLocal: 0,
    onlyRemote: 0,
    inBoth: 0,
    remoteDeleted: 0,
    ...totals,
  },
});

function deps(overrides: Partial<AccountSyncDependencies> = {}): AccountSyncDependencies {
  return {
    getFreshAccessContext: vi.fn(async () => ({ session, accessStatus: "active" })),
    refreshPendingSyncCount: vi.fn(async () => 0),
    uploadPending: vi.fn(async () => ({ ok: true, summary: emptySummary(), meta: null })),
    compareLocalAndRemote: vi.fn(async () => comparison({ localCount: 0, remoteCount: 0 })),
    fetchAccountSnapshot: vi.fn(async () => ({
      clientes: [],
      lancamentos: [],
      oportunidades: [],
      orcamentos: [],
      negocios: [],
      proximasAcoes: [],
      vendedores: [],
      produtos: [],
      formasPagamento: [],
      prazosPagamento: [],
      appConfig: [],
    })),
    restoreAccountSnapshot: vi.fn(async () => ({ restoredAt: "2026-05-30T00:00:00.000Z", summary: { total: 1 } })),
    isOnline: () => true,
    isSupabaseConfigured: () => true,
    now: () => 60_000,
    cooldownMs: 60_000,
    ...overrides,
  };
}

describe("accountSyncOrchestrator", () => {
  beforeEach(() => {
    resetAccountSyncCooldownForTests();
    vi.restoreAllMocks();
  });

  it("sync now uploads local pending items first and then restores remote-only data", async () => {
    const refreshPendingSyncCount = vi.fn()
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0);
    const uploadPending = vi.fn(async () => ({ ok: true as const, summary: { ...emptySummary(), total: 2, success: 2 }, meta: null }));
    const fetchAccountSnapshot = vi.fn(async () => ({
      clientes: [{ id: "c1", nome: "Conta" }],
      lancamentos: [],
      oportunidades: [],
      orcamentos: [],
      negocios: [],
      proximasAcoes: [],
      vendedores: [],
      produtos: [],
      formasPagamento: [],
      prazosPagamento: [],
      appConfig: [],
    }));
    const restoreAccountSnapshot = vi.fn(async () => ({ restoredAt: "2026-05-30T00:00:00.000Z", summary: { total: 1 } }));

    const result = await runAccountSyncNow(deps({
      refreshPendingSyncCount,
      uploadPending,
      compareLocalAndRemote: vi.fn(async () => comparison({ localCount: 0, remoteCount: 1, onlyRemote: 1 })),
      fetchAccountSnapshot,
      restoreAccountSnapshot,
    }));

    expect(uploadPending).toHaveBeenCalledTimes(1);
    expect(fetchAccountSnapshot).toHaveBeenCalledTimes(1);
    expect(restoreAccountSnapshot).toHaveBeenCalledTimes(1);
    expect(result.code).toBe("restored");
    expect(result.message).toBe("Dados da conta carregados neste dispositivo.");
  });

  it("sync now does not restore when pending upload fails", async () => {
    const restoreAccountSnapshot = vi.fn();
    const result = await runAccountSyncNow(deps({
      refreshPendingSyncCount: vi.fn(async () => 1),
      uploadPending: vi.fn(async () => ({ ok: false as const, message: "Falha Supabase detalhada" })),
      restoreAccountSnapshot,
    }));

    expect(result.code).toBe("blocked");
    expect(result.message).toBe("Existem dados locais que precisam de revisão antes de sincronizar.");
    expect(result.technicalMessage).toBe("Falha Supabase detalhada");
    expect(restoreAccountSnapshot).not.toHaveBeenCalled();
  });

  it("sync now does not run without a session", async () => {
    const uploadPending = vi.fn();
    const result = await runAccountSyncNow(deps({
      getFreshAccessContext: vi.fn(async () => ({ session: null, accessStatus: null })),
      uploadPending,
    }));

    expect(result.code).toBe("skipped");
    expect(result.message).toBe("Faça login para sincronizar os dados da conta.");
    expect(uploadPending).not.toHaveBeenCalled();
  });

  it("sync now does not run when the user is not active", async () => {
    const uploadPending = vi.fn();
    const result = await runAccountSyncNow(deps({
      getFreshAccessContext: vi.fn(async () => ({ session, accessStatus: "pending" })),
      uploadPending,
    }));

    expect(result.code).toBe("skipped");
    expect(result.message).toBe("Usuário ainda não aprovado para sincronização.");
    expect(uploadPending).not.toHaveBeenCalled();
  });

  it("allows safe auto-restore only when local is empty or nearly empty, only cloud has data and there are no pending items", () => {
    const base = {
      supabaseConfigured: true,
      sessionExists: true,
      accessStatus: "active",
      isOnline: true,
      pendingSyncCount: 0,
      localCount: 0,
      onlyLocal: 0,
      onlyRemote: 3,
      remoteCount: 3,
    } as const;

    expect(shouldAutoRestoreAccount(base).allowed).toBe(true);
    expect(shouldAutoRestoreAccount({ ...base, localCount: 1 }).allowed).toBe(true);
    expect(shouldAutoRestoreAccount({ ...base, localCount: 2 }).reason).toBe("manual-cta");
    expect(shouldAutoRestoreAccount({ ...base, onlyLocal: 1 }).reason).toBe("local-conflict");
    expect(shouldAutoRestoreAccount({ ...base, onlyLocal: 1, onlyRemote: 1 }).reason).toBe("cloud-conflict");
    expect(shouldAutoRestoreAccount({ ...base, pendingSyncCount: 1 }).reason).toBe("pending-sync");
    expect(shouldAutoRestoreAccount({ ...base, isOnline: false }).reason).toBe("offline");
  });

  it("does not run repeated auto-checks inside cooldown and runs again after cooldown", async () => {
    let now = 60_000;
    const compareLocalAndRemote = vi.fn(async () => comparison({ localCount: 0, remoteCount: 0 }));
    const baseDeps = deps({ now: () => now, compareLocalAndRemote });

    const first = await runAccountSyncCheck(baseDeps);
    const second = await runAccountSyncCheck(baseDeps);
    now = 121_000;
    const third = await runAccountSyncCheck(baseDeps);

    expect(first.code).toBe("synced");
    expect(second.code).toBe("skipped");
    expect(third.code).toBe("synced");
    expect(compareLocalAndRemote).toHaveBeenCalledTimes(2);
  });

  it("auto-check blocks conflict without restore", async () => {
    const restoreAccountSnapshot = vi.fn();
    const result = await runAccountSyncCheck(deps({
      compareLocalAndRemote: vi.fn(async () => comparison({ localCount: 2, remoteCount: 2, onlyLocal: 1, onlyRemote: 1 })),
      restoreAccountSnapshot,
    }));

    expect(result.code).toBe("blocked");
    expect(result.message).toBe("Conflito detectado. Revisão manual necessária.");
    expect(restoreAccountSnapshot).not.toHaveBeenCalled();
  });

  it("auto-check does not upload local pending data automatically", async () => {
    const uploadPending = vi.fn();
    const result = await runAccountSyncCheck(deps({
      refreshPendingSyncCount: vi.fn(async () => 1),
      uploadPending,
      compareLocalAndRemote: vi.fn(async () => comparison({ localCount: 1, remoteCount: 1 })),
    }));

    expect(result.code).toBe("blocked");
    expect(result.message).toBe("Há dados locais aguardando envio.");
    expect(uploadPending).not.toHaveBeenCalled();
  });

  it("returns simple UI messages and keeps technical errors separate", () => {
    const status = buildAccountSyncStatus({ code: "error", technicalMessage: "violates row-level security policy" });

    expect(status.message).toBe("Não foi possível concluir a sincronização agora.");
    expect(status.technicalMessage).toBe("violates row-level security policy");
  });
});
