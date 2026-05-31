import { describe, expect, it } from "vitest";
import {
  calcularMetaCarteira,
  calcularPotencialCarteira,
  calcularPotencialCliente,
  calcularRealizadoCarteira,
  montarDashboardComercialSafra,
} from "@/utils/businessRules";
import { Cliente, Negocio, OportunidadeComercial, Orcamento, ProximaAcao, TicketMedioRegra } from "@/types";

const tickets: TicketMedioRegra[] = [
  { id: "t1", categoria: "Nutrição", valorMedioHa: 100, ativo: true },
  { id: "t2", categoria: "Biológicos", valorMedioHa: 50, ativo: true },
];

function cliente(overrides: Partial<Cliente>): Cliente {
  return {
    id: "c1",
    nome: "Cliente 1",
    abc: "A",
    prioridade: "P1",
    rota: "Rota 1",
    cidade: "Cidade",
    areaHa: 0,
    potencialTotal: 0,
    statusAtual: "Ativo",
    frequenciaRetorno: "Mensal",
    retorno: "2026-06-01",
    ...overrides,
  } as Cliente;
}

function negocio(overrides: Partial<Negocio>): Negocio {
  return {
    id: "n1",
    clienteId: "c1",
    vendedor: "Ana",
    origem: "Manual",
    produtos: [],
    categoria: "Nutrição",
    valorPotencial: 0,
    status: "Novo",
    dataCriacao: "2026-05-01",
    ultimaAtualizacao: "2026-05-01",
    ...overrides,
  } as Negocio;
}

function orcamento(overrides: Partial<Orcamento>): Orcamento {
  return {
    id: "o1",
    codigo: "ORC-1",
    clienteId: "c1",
    vendedor: "Ana",
    data: "2026-05-01",
    status: "Rascunho",
    areaAplicacaoHa: 0,
    itens: [],
    subtotal: 0,
    descontoTotal: 0,
    valorTotal: 0,
    custoPorHectare: 0,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  } as Orcamento;
}

function oportunidade(overrides: Partial<OportunidadeComercial>): OportunidadeComercial {
  return {
    id: "op1",
    clienteId: "c1",
    origem: "Manual",
    etapa: "Identificada",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  } as OportunidadeComercial;
}

function proximaAcao(overrides: Partial<ProximaAcao>): ProximaAcao {
  return {
    id: "pa1",
    clienteId: "c1",
    descricao: "Follow-up",
    tipo: "Follow-up",
    data: "2026-05-31",
    status: "Pendente",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  } as ProximaAcao;
}

describe("regras comerciais do Sprint 21", () => {
  it("calcula potencial de cliente com área", () => {
    expect(calcularPotencialCliente(cliente({ areaHa: 10 }), tickets)).toBe(1500);
  });

  it("não quebra cálculo de cliente sem área", () => {
    expect(calcularPotencialCliente(cliente({ areaHa: 0 }), tickets)).toBe(0);
  });

  it("soma o potencial total somente de clientes válidos para cálculo", () => {
    const total = calcularPotencialCarteira([
      cliente({ id: "c1", areaHa: 10 }),
      cliente({ id: "c2", areaHa: 20 }),
      cliente({ id: "c3", areaHa: 0 }),
    ], tickets);

    expect(total).toBe(4500);
  });

  it("usa percentual esperado para meta e calcula gap como meta menos realizado", () => {
    const clientes = [cliente({ id: "c1", areaHa: 100 })];
    expect(calcularMetaCarteira(clientes, tickets, 20)).toBe(3000);

    const painel = montarDashboardComercialSafra({
      clientes,
      ticketsMedios: tickets,
      percentualAcertoEsperado: 20,
      negocios: [negocio({ id: "n1", clienteId: "c1", status: "Fechado ganho", valorFechado: 1200 })],
      orcamentos: [],
      oportunidades: [],
      proximasAcoes: [],
      hojeIso: "2026-05-30",
    });

    expect(painel.gap).toBe(1800);
  });

  it("inclui negócio ganho, ignora perdido e não duplica orçamento aprovado vinculado", () => {
    const realizado = calcularRealizadoCarteira([
      negocio({ id: "n-ganho", clienteId: "c1", status: "Fechado ganho", valorFechado: 1000, orcamentoId: "o-ganho" }),
      negocio({ id: "n-perdido", clienteId: "c1", status: "Fechado perdido", valorFechado: 5000 }),
    ], [
      orcamento({ id: "o-ganho", negocioId: "n-ganho", status: "Aprovado", valorTotal: 1000 }),
      orcamento({ id: "o-sem-negocio", status: "Aprovado", valorTotal: 300 }),
    ]);

    expect(realizado).toBe(1300);
  });

  it("agrupa por vendedor, ABC e coloca sem vendedor em Não definido", () => {
    const painel = montarDashboardComercialSafra({
      clientes: [
        cliente({ id: "c1", abc: "A", vendedor: "Ana", areaHa: 10 }),
        cliente({ id: "c2", abc: "B", vendedor: "", areaHa: 20 }),
      ],
      ticketsMedios: tickets,
      percentualAcertoEsperado: 10,
      negocios: [negocio({ id: "n1", clienteId: "c1", status: "Fechado ganho", valorFechado: 200 })],
      orcamentos: [],
      oportunidades: [oportunidade({ id: "op1", clienteId: "c1" })],
      proximasAcoes: [proximaAcao({ id: "pa1", clienteId: "c1" })],
      hojeIso: "2026-05-30",
    });

    expect(painel.porVendedor.map((item) => item.vendedor)).toContain("Ana");
    expect(painel.porVendedor.map((item) => item.vendedor)).toContain("Não definido");
    expect(painel.porAbc.find((item) => item.abc === "A")?.clientes).toBe(1);
    expect(painel.porAbc.find((item) => item.abc === "B")?.clientes).toBe(1);
  });

  it("gera alertas para cliente A sem ação, cliente sem área e orçamento aprovado sem negócio", () => {
    const painel = montarDashboardComercialSafra({
      clientes: [cliente({ id: "c1", nome: "Cliente A", abc: "A", areaHa: 0 })],
      ticketsMedios: tickets,
      percentualAcertoEsperado: 10,
      negocios: [],
      orcamentos: [orcamento({ id: "o1", codigo: "ORC-1", clienteId: "c1", status: "Aprovado", valorTotal: 1000 })],
      oportunidades: [],
      proximasAcoes: [],
      hojeIso: "2026-05-30",
    });

    expect(painel.alertas.map((alerta) => alerta.tipo)).toContain("cliente-a-sem-proxima-acao");
    expect(painel.alertas.map((alerta) => alerta.tipo)).toContain("cliente-sem-area");
    expect(painel.alertas.map((alerta) => alerta.tipo)).toContain("orcamento-aprovado-sem-negocio");
  });
});

describe("configuração comercial do Sprint 22", () => {
  it("considera apenas tickets ativos e ignora valor negativo", () => {
    const regras: TicketMedioRegra[] = [
      { id: "t1", categoria: "Nutrição", valorMedioHa: 100, ativo: true },
      { id: "t2", categoria: "Sementes", valorMedioHa: 25, ativo: false },
      { id: "t3", categoria: "Biológicos", valorMedioHa: 50, ativo: true },
      { id: "t4", categoria: "Outros", valorMedioHa: -999, ativo: true },
    ];

    expect(calcularPotencialCliente(cliente({ areaHa: 2 }), regras)).toBe(300);
  });

  it("limita percentual de acerto, aceita decimal e permite meta zero", () => {
    const clientes = [cliente({ id: "c1", areaHa: 10 })];

    expect(calcularMetaCarteira(clientes, tickets, 12.5)).toBe(187.5);
    expect(calcularMetaCarteira(clientes, tickets, 0)).toBe(0);
    expect(calcularMetaCarteira(clientes, tickets, 150)).toBe(1500);
  });

  it("usa meta manual do vendedor quando configurada", () => {
    const painel = montarDashboardComercialSafra({
      clientes: [cliente({ id: "c1", vendedor: "Ana", areaHa: 10 })],
      ticketsMedios: tickets,
      percentualAcertoEsperado: 10,
      metasVendedor: [{ id: "mv1", vendedor: "Ana", metaManual: 500, ativo: true, origemMeta: "manual" }],
      negocios: [negocio({ id: "n1", clienteId: "c1", status: "Fechado ganho", valorFechado: 200 })],
      orcamentos: [],
      oportunidades: [],
      proximasAcoes: [],
      hojeIso: "2026-05-30",
    });

    expect(painel.porVendedor[0].meta).toBe(500);
    expect(painel.porVendedor[0].gap).toBe(300);
    expect(painel.porVendedor[0].percentualAtingido).toBe(0.4);
    expect(painel.porVendedor[0].origemMeta).toBe("manual");
  });

  it("usa meta proporcional como fallback e mantém vendedor sem nome como Não definido", () => {
    const painel = montarDashboardComercialSafra({
      clientes: [
        cliente({ id: "c1", vendedor: "Ana", areaHa: 10 }),
        cliente({ id: "c2", vendedor: "", areaHa: 30 }),
      ],
      ticketsMedios: tickets,
      percentualAcertoEsperado: 10,
      negocios: [],
      orcamentos: [],
      oportunidades: [],
      proximasAcoes: [],
      hojeIso: "2026-05-30",
    });

    const semVendedor = painel.porVendedor.find((linha) => linha.vendedor === "Não definido");
    expect(semVendedor?.meta).toBe(450);
    expect(semVendedor?.origemMeta).toBe("calculada");
  });

  it("distribui automaticamente a meta por potencial e soma com a meta da carteira", async () => {
    const { distribuirMetaPorPotencial } = await import("@/utils/businessRules");
    const distribuicao = distribuirMetaPorPotencial({
      clientes: [
        cliente({ id: "c1", vendedor: "Ana", areaHa: 10 }),
        cliente({ id: "c2", vendedor: "Bia", areaHa: 30 }),
        cliente({ id: "c3", vendedor: "Caio", areaHa: 0 }),
      ],
      ticketsMedios: tickets,
      percentualAcertoEsperado: 10,
    });

    expect(distribuicao.reduce((soma, meta) => soma + (meta.metaCalculada || 0), 0)).toBe(600);
    expect((distribuicao.find((meta) => meta.vendedor === "Bia")?.metaCalculada || 0)).toBeGreaterThan(distribuicao.find((meta) => meta.vendedor === "Ana")?.metaCalculada || 0);
    expect(distribuicao.find((meta) => meta.vendedor === "Caio")?.metaCalculada).toBe(0);
  });

  it("dashboard expõe alertas de configuração incompleta", () => {
    const painel = montarDashboardComercialSafra({
      clientes: [cliente({ id: "c1", vendedor: "Ana", areaHa: 10, potencialTotal: 1000 })],
      ticketsMedios: [],
      percentualAcertoEsperado: 10,
      negocios: [],
      orcamentos: [],
      oportunidades: [],
      proximasAcoes: [],
      hojeIso: "2026-05-30",
    });

    expect(painel.alertasConfiguracao).toContain("Ticket médio/ha não configurado.");
    expect(painel.alertasConfiguracao).toContain("Metas por vendedor ainda não configuradas.");
    expect(painel.alertasConfiguracao).toContain("Usando distribuição automática por potencial.");
  });
});
