import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true, supabase: { from: vi.fn() } }));
import { shouldRestoreFromCloud } from "@/lib/cloudRestore";
import { ensureSyncRuntimeContext } from "@/lib/supabaseSync";
import { calculateStoreComparison, type RemoteRow } from "@/lib/supabaseSync";

describe("sync layer refactor guardrails", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { onLine: true, userAgent: "Vitest" });
  });

  const session = { user: { id: "seller-user" } } as never;

  it("vendedor sincroniza usando accountOwnerUserId, não session.user.id", () => {
    const context = ensureSyncRuntimeContext({ session, accessStatus: "active", accountOwnerUserId: "owner-user", role: "vendedor", deviceId: "device-a" });
    expect(context.userId).toBe("seller-user");
    expect(context.accountOwnerUserId).toBe("owner-user");
  });

  it("bloqueia fallback silencioso para session.user.id quando accountOwnerUserId está ausente", () => {
    expect(() => ensureSyncRuntimeContext({ session, accessStatus: "active", deviceId: "device-a" })).toThrow(/accountOwnerUserId/);
  });

  it("cloud restore não substitui local quando há fila pendente ou conflito local", () => {
    expect(shouldRestoreFromCloud({ supabaseConfigured: true, sessionExists: true, accessStatus: "active", isOnline: true, pendingSyncCount: 1, onlyLocal: 0, onlyRemote: 1, remoteCount: 1 }).reason).toBe("pending-sync");
    expect(shouldRestoreFromCloud({ supabaseConfigured: true, sessionExists: true, accessStatus: "active", isOnline: true, pendingSyncCount: 0, onlyLocal: 1, onlyRemote: 1, changedInBoth: 1, remoteCount: 1 }).allowed).toBe(true);
  });

  it("delete remoto/tombstone participa da comparação e impede recriação cega por fila antiga", () => {
    const rows: RemoteRow[] = [{ id: "c1", user_id: "owner-user", payload: { nome: "Cliente" }, created_at: null, updated_at: "2026-06-01T00:00:00.000Z", deleted_at: "2026-06-01T00:00:00.000Z" }];
    const comparison = calculateStoreComparison("clientes", [{ id: "c1", nome: "Cliente local antigo" }], rows);
    expect(comparison.remoteDeleted).toBe(1);
    expect(comparison.onlyLocal).toBe(1);
  });
});
