import { describe, expect, it } from "vitest";
import {
  calcularResumoAgenda,
  classificarAgenda,
  concluirAcaoAgenda,
  criarAcaoRapidaAgenda,
  filtrarItensAgenda,
  montarAlertasAgenda,
  montarItensAgenda,
  reagendarAcaoAgenda,
} from "@/utils/agenda";
import type { Cliente, Negocio, Orcamento, ProximaAcao, Vendedor } from "@/types";

const hoje = "2026-05-31";
const vendedores: Vendedor[] = [
  { id: "v1", nome: "BRUNO", ativo: true },
  { id: "v2", nome: "DOUGLAS", ativo: true },
];

function cliente(overrides: Partial<Cliente>): Cliente {
  return {
    id: "c1",
    nome: "Cliente 1",
    abc: "A",
    prioridade: "P1",
    rota: "Rota 1",
    cidade: "Cidade",
    localidade: "Fazenda 1",
    areaHa: 100,
    potencialTotal: 100000,
    statusAtual: "Ativo",
    frequenciaRetorno: "Mensal",
    retorno: hoje,
    ...overrides,
  } as Cliente;
}

function acao(overrides: Partial<ProximaAcao>): ProximaAcao {
  return {
    id: "pa1",
    clienteId: "c1",
    descricao: "Visitar cliente",
    tipo: "Visita",
    data: hoje,
    status: "Pendente",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  } as ProximaAcao;
}

function orcamento(overrides: Partial<Orcamento>): Orcamento {
  return {
    id: "o1",
    codigo: "ORC-1",
    clienteId: "c1",
    vendedor: "BRUNO",
    data: "2026-05-20",
    status: "Enviado",
    areaAplicacaoHa: 10,
    itens: [],
    subtotal: 0,
    descontoTotal: 0,
    valorTotal: 1000,
    custoPorHectare: 0,
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z",
    ...overrides,
  } as Orcamento;
}

function negocio(overrides: Partial<Negocio>): Negocio {
  return {
    id: "n1",
    nome: "Venda ganha",
    clienteId: "c1",
    vendedor: "BRUNO",
    origem: "Manual",
    produtos: [],
    categoria: "Nutrição",
    valorPotencial: 1000,
    valorFechado: 1000,
    status: "Fechado ganho",
    dataCriacao: "2026-05-20",
    ultimaAtualizacao: "2026-05-20",
    ...overrides,
  } as Negocio;
}

describe("classificação da agenda", () => {
  it("classifica ações vencidas, de hoje, semana, sem data e concluídas", () => {
    expect(classificarAgenda("2026-05-30", "Pendente", hoje)).toBe("Atrasado");
    expect(classificarAgenda(hoje, "Pendente", hoje)).toBe("Hoje");
    expect(classificarAgenda("2026-06-06", "Pendente", hoje)).toBe("Próximos 7 dias");
    expect(classificarAgenda("", "Pendente", hoje)).toBe("Sem data");
    expect(classificarAgenda("2026-05-30", "Concluída", hoje)).toBe("Concluído");
  });

  it("não conta ação concluída como pendente no resumo", () => {
    const itens = montarItensAgenda({
      clientes: [cliente({ id: "c1" }), cliente({ id: "c2", abc: "B", prioridade: "P2" })],
      proximasAcoes: [acao({ id: "a1", clienteId: "c1", data: "2026-05-30" }), acao({ id: "a2", clienteId: "c2", status: "Concluída", data: "2026-05-30" })],
      vendedores,
      hojeIso: hoje,
    });
    const resumo = calcularResumoAgenda(itens);
    expect(resumo.atrasadas).toBe(1);
    expect(itens.find((item) => item.sourceId === "a2")?.classificacao).toBe("Concluído");
  });
});

describe("filtros por vendedor canônico", () => {
  it("agrupa Bruno/bruno/BRUNO como BRUNO e mantém DOUGLAS separado", () => {
    const itens = montarItensAgenda({
      clientes: [
        cliente({ id: "c1", vendedor: "Bruno" }),
        cliente({ id: "c2", nome: "Cliente 2", vendedor: "bruno", abc: "B", prioridade: "P2" }),
        cliente({ id: "c3", nome: "Cliente 3", vendedor: "DOUGLAS", abc: "B", prioridade: "P2" }),
      ],
      proximasAcoes: [
        acao({ id: "a1", clienteId: "c1" }),
        acao({ id: "a2", clienteId: "c2" }),
        acao({ id: "a3", clienteId: "c3" }),
      ],
      vendedores,
      hojeIso: hoje,
    });

    expect(filtrarItensAgenda(itens, { vendedor: "BRUNO" }).map((item) => item.sourceId).sort()).toEqual(["a1", "a2"]);
    expect(filtrarItensAgenda(itens, { vendedor: "DOUGLAS" }).map((item) => item.sourceId)).toEqual(["a3"]);
  });

  it("usa Não definido quando cliente não tem vendedor", () => {
    const itens = montarItensAgenda({ clientes: [cliente({ vendedor: "" })], proximasAcoes: [acao({ responsavel: undefined })], vendedores, hojeIso: hoje });
    expect(filtrarItensAgenda(itens, { vendedor: "Não definido" })).toHaveLength(1);
  });
});

describe("alertas operacionais", () => {
  it("gera alertas para cliente A/P1 sem próxima ação, orçamento aberto e negócio ganho sem pós-venda", () => {
    const alertas = montarAlertasAgenda({
      clientes: [cliente({ id: "c1", abc: "A", prioridade: "P2" }), cliente({ id: "c2", abc: "B", prioridade: "P1" })],
      proximasAcoes: [],
      orcamentos: [orcamento({ id: "o1", clienteId: "c1", status: "Enviado" })],
      negocios: [negocio({ id: "n1", clienteId: "c2" })],
      vendedores,
      hojeIso: hoje,
    });
    const tipos = alertas.map((alerta) => alerta.tipo);
    expect(tipos).toContain("cliente-a-sem-proxima-acao");
    expect(tipos).toContain("cliente-p1-sem-proxima-acao");
    expect(tipos).toContain("orcamento-aberto-sem-retorno");
    expect(tipos).toContain("negocio-ganho-sem-pos-venda");
  });
});

describe("ações da agenda", () => {
  it("concluir ação altera status e registra data de conclusão", () => {
    const resultado = concluirAcaoAgenda([acao({ id: "a1" })], "a1", "2026-05-31T12:00:00.000Z");
    expect(resultado[0].status).toBe("Concluída");
    expect((resultado[0] as ProximaAcao & { dataConclusao: string }).dataConclusao).toBe("2026-05-31T12:00:00.000Z");
  });

  it("reagendar ação altera data e horário", () => {
    const resultado = reagendarAcaoAgenda([acao({ id: "a1", data: hoje })], "a1", "2026-06-10", "09:30", "2026-05-31T12:00:00.000Z");
    expect(resultado[0].data).toBe("2026-06-10");
    expect((resultado[0] as ProximaAcao & { horario: string }).horario).toBe("09:30");
    expect(resultado[0].status).toBe("Reagendada");
  });

  it("criar ação rápida vincula ao cliente correto e herda vendedor", () => {
    const novo = criarAcaoRapidaAgenda({ cliente: cliente({ id: "c9", vendedor: "bruno" }), tipo: "Ligação", data: hoje, observacao: "Ligar", now: "2026-05-31T12:00:00.000Z", id: "nova", vendedores });
    expect(novo.id).toBe("nova");
    expect(novo.clienteId).toBe("c9");
    expect(novo.responsavel).toBe("BRUNO");
  });
});

describe("resumo da agenda para dashboard", () => {
  it("calcula atrasadas, hoje e próximos 7 dias corretamente", () => {
    const itens = montarItensAgenda({
      clientes: [
        cliente({ id: "c1", abc: "B", prioridade: "P2" }),
        cliente({ id: "c2", abc: "B", prioridade: "P2" }),
        cliente({ id: "c3", abc: "B", prioridade: "P2" }),
      ],
      proximasAcoes: [
        acao({ id: "a1", clienteId: "c1", data: "2026-05-30" }),
        acao({ id: "a2", clienteId: "c2", data: hoje }),
        acao({ id: "a3", clienteId: "c3", data: "2026-06-03" }),
      ],
      vendedores,
      hojeIso: hoje,
    });
    expect(calcularResumoAgenda(itens)).toMatchObject({ atrasadas: 1, hoje: 1, proximos7Dias: 1 });
  });
});
