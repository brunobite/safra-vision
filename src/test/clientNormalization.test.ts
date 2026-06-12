import { describe, expect, it } from "vitest";
import { auditClientesForPersistence, normalizeClienteForPersistence } from "@/lib/clientNormalization";
import type { Cliente } from "@/types";

const baseCliente = (overrides: Record<string, unknown> = {}) => ({
  id: "cliente-1",
  nome: "Cliente Teste",
  abc: "A",
  prioridade: "P1",
  rota: "Rota 1",
  cidade: "Bagé",
  localidade: "Fazenda",
  culturas: "Soja",
  areaHa: 100,
  potencialTotal: 250000,
  statusAtual: "Ativo",
  frequenciaRetorno: "30 dias",
  retorno: "30 dias",
  vendedor: "Ana",
  ...overrides,
}) as unknown as Cliente;

describe("normalização e auditoria de clientes", () => {
  it("substitui potencialCalculado boolean true/false por potencialTotal numérico e nunca mantém boolean", () => {
    const clienteTrue = normalizeClienteForPersistence(baseCliente({ potencialCalculado: true, potencialTotal: 250000 }));
    const clienteFalse = normalizeClienteForPersistence(baseCliente({ potencialCalculado: false, potencialTotal: 123456 }));

    expect(clienteTrue.potencialCalculado).toBe(250000);
    expect(clienteFalse.potencialCalculado).toBe(123456);
    expect(typeof clienteTrue.potencialCalculado).toBe("number");
    expect(typeof clienteFalse.potencialCalculado).toBe("number");
  });

  it("preenche localidade com cidade quando localidade está vazia", () => {
    const cliente = normalizeClienteForPersistence(baseCliente({ cidade: "  Dom Pedrito  ", localidade: "   " }));

    expect(cliente.cidade).toBe("Dom Pedrito");
    expect(cliente.localidade).toBe("Dom Pedrito");
  });

  it("remove espaços extras dos campos textuais principais", () => {
    const cliente = normalizeClienteForPersistence(baseCliente({ nome: "  Cliente   Safra  ", cidade: " Bagé ", localidade: " Fazenda  Norte ", vendedor: " Ana   Silva ", statusAtual: " Ativo ", abc: " A ", prioridade: " P1 ", rota: " Rota   1 " }));

    expect(cliente.nome).toBe("Cliente Safra");
    expect(cliente.cidade).toBe("Bagé");
    expect(cliente.localidade).toBe("Fazenda Norte");
    expect(cliente.vendedor).toBe("Ana Silva");
    expect(cliente.statusAtual).toBe("Ativo");
    expect(cliente.abc).toBe("A");
    expect(cliente.prioridade).toBe("P1");
    expect(cliente.rota).toBe("Rota 1");
  });

  it("mantém areaHa e potencialTotal válidos como números", () => {
    const cliente = normalizeClienteForPersistence(baseCliente({ areaHa: "1.250,5", potencialTotal: "350.000,75" }));

    expect(cliente.areaHa).toBe(1250.5);
    expect(cliente.potencialTotal).toBe(350000.75);
  });

  it("cliente sem vendedor gera aviso, mas não bloqueia publicação", () => {
    const audit = auditClientesForPersistence([baseCliente({ vendedor: "" })]);

    expect(audit.semVendedor).toBe(1);
    expect(audit.warnings).toBeGreaterThan(0);
    expect(audit.canPublishOfficial).toBe(true);
    expect(audit.blockers).toEqual([]);
  });
});
