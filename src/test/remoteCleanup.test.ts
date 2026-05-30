import { describe, expect, it } from "vitest";
import {
  findRemoteOnlyClientTestCandidatesFromRows,
  validateRemoteClientTestCleanup,
  type RemoteOnlyClientTestCandidate,
} from "@/lib/remoteCleanup";
import type { RemoteRow } from "@/lib/supabaseSync";

const remoteClient = (partial: Partial<RemoteRow>): RemoteRow => ({
  id: "c1",
  user_id: "u1",
  payload: { id: "c1", nome: "Cliente TESTE", cidade: "Bagé", rota: "R1" },
  created_at: "2026-05-29T10:00:00.000Z",
  updated_at: "2026-05-29T11:00:00.000Z",
  deleted_at: null,
  ...partial,
});

const candidate = (partial: Partial<RemoteOnlyClientTestCandidate> = {}): RemoteOnlyClientTestCandidate => ({
  id: "c1",
  nome: "Cliente TESTE",
  cidade: "Bagé",
  rota: "R1",
  motivo: "TESTE",
  updated_at: "2026-05-29T11:00:00.000Z",
  created_at: "2026-05-29T10:00:00.000Z",
  payload: { id: "c1", nome: "Cliente TESTE" },
  origem: "somente-nuvem",
  ...partial,
});

describe("remoteCleanup", () => {
  it("detecta cliente teste ativo que existe somente na nuvem", () => {
    const candidates = findRemoteOnlyClientTestCandidatesFromRows([
      remoteClient({ id: "remote-test", payload: { id: "remote-test", nome: "Cliente TESTE validação" } }),
    ], new Set(["local-real"]));

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      id: "remote-test",
      nome: "Cliente TESTE validação",
      motivo: "TESTE, VALIDAÇÃO",
      origem: "somente-nuvem",
    });
  });

  it("não detecta cliente real sem padrão de teste", () => {
    const candidates = findRemoteOnlyClientTestCandidatesFromRows([
      remoteClient({ id: "remote-real", payload: { id: "remote-real", nome: "Cliente Real", cidade: "Pelotas" } }),
    ], new Set());

    expect(candidates).toEqual([]);
  });

  it("não detecta cliente que também existe localmente", () => {
    const candidates = findRemoteOnlyClientTestCandidatesFromRows([
      remoteClient({ id: "same-id", payload: { id: "same-id", nome: "Cliente TESTE" } }),
    ], new Set(["same-id"]));

    expect(candidates).toEqual([]);
  });

  it("valida limpeza remota segura apenas para clientes com seleção explícita e motivo", () => {
    expect(validateRemoteClientTestCleanup({
      store: "clientes",
      selectedIds: ["c1"],
      candidates: [candidate()],
      activeRemoteCount: 3,
    })).toEqual({ ok: true, ids: ["c1"], errors: [] });

    expect(validateRemoteClientTestCleanup({
      store: "produtos",
      selectedIds: ["c1"],
      candidates: [candidate()],
    }).ok).toBe(false);

    expect(validateRemoteClientTestCleanup({
      store: "clientes",
      selectedIds: [],
      candidates: [candidate()],
    }).ok).toBe(false);

    expect(validateRemoteClientTestCleanup({
      store: "clientes",
      selectedIds: ["c1"],
      candidates: [candidate({ motivo: "" })],
    }).ok).toBe(false);

    expect(validateRemoteClientTestCleanup({
      store: "clientes",
      selectedIds: ["c1", "c2"],
      candidates: [candidate(), candidate({ id: "c2" })],
      activeRemoteCount: 2,
    }).ok).toBe(false);
  });
});
