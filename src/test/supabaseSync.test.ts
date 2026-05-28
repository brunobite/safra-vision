import { describe, expect, it } from "vitest";
import { calculateStoreComparison, LOCAL_TO_REMOTE_TABLE, summarizeComparison, type RemoteRow } from "@/lib/supabaseSync";

describe("supabaseSync", () => {
  it("maps local stores to Supabase tables", () => {
    expect(LOCAL_TO_REMOTE_TABLE.proximasAcoes).toBe("proximas_acoes");
    expect(LOCAL_TO_REMOTE_TABLE.formasPagamento).toBe("formas_pagamento");
    expect(LOCAL_TO_REMOTE_TABLE.prazosPagamento).toBe("prazos_pagamento");
    expect(LOCAL_TO_REMOTE_TABLE.appConfig).toBe("app_config");
  });

  it("calculates local versus remote counts without mutating data", () => {
    const remoteRows: RemoteRow[] = [
      { id: "a", user_id: "u1", payload: {}, created_at: null, updated_at: null, deleted_at: null },
      { id: "c", user_id: "u1", payload: {}, created_at: null, updated_at: null, deleted_at: null },
      { id: "d", user_id: "u1", payload: {}, created_at: null, updated_at: null, deleted_at: "2026-05-28T00:00:00.000Z" },
    ];

    const comparison = calculateStoreComparison("clientes", ["a", "b"], remoteRows);

    expect(comparison).toMatchObject({
      localCount: 2,
      remoteCount: 2,
      onlyLocal: 1,
      onlyRemote: 1,
      inBoth: 1,
      remoteDeleted: 1,
    });
  });

  it("summarizes comparison totals", () => {
    const first = calculateStoreComparison("clientes", ["a", "b"], [
      { id: "a", user_id: "u1", payload: {}, created_at: null, updated_at: null, deleted_at: null },
    ]);
    const second = calculateStoreComparison("produtos", ["p1"], [
      { id: "p2", user_id: "u1", payload: {}, created_at: null, updated_at: null, deleted_at: null },
    ]);

    expect(summarizeComparison([first, second])).toEqual({
      localCount: 3,
      remoteCount: 2,
      onlyLocal: 2,
      onlyRemote: 1,
      inBoth: 1,
      remoteDeleted: 0,
    });
  });
});
