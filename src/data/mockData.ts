import { Cliente, Lancamento, MetaEmpresa, MetaPessoal, Rota, Evento, PrioridadeP1Item } from "@/types";

export const ROTAS_NOMES = ["Rota Norte", "Rota Sul", "Rota Leste", "Rota Oeste", "Rota Central"];

export const initialClientes: Cliente[] = [
  { id: "c1", nome: "Fazenda Boa Vista", abc: "A", prioridade: "P1", rota: "Rota Norte", cidade: "Bagé", localidade: "Distrito 3", culturas: "Soja, Milho", areaHa: 1200, potencialTotal: 480000, potencialAdj: 280000, potencialNutri: 200000, statusAtual: "Ativo", frequencia: "Mensal", retorno: "Alto", motivoAbc: "Volume e fidelidade" },
  { id: "c2", nome: "Agropecuária São João", abc: "A", prioridade: "P1", rota: "Rota Sul", cidade: "Pelotas", localidade: "Capão do Leão", culturas: "Arroz, Soja", areaHa: 980, potencialTotal: 410000, statusAtual: "Ativo", frequencia: "Quinzenal", retorno: "Alto" },
  { id: "c3", nome: "Sítio Esperança", abc: "B", prioridade: "P2", rota: "Rota Norte", cidade: "Candiota", localidade: "Linha 4", culturas: "Soja", areaHa: 420, potencialTotal: 150000, statusAtual: "Ativo", frequencia: "Mensal", retorno: "Médio" },
  { id: "c4", nome: "Estância Três Marias", abc: "A", prioridade: "P2", rota: "Rota Leste", cidade: "Dom Pedrito", localidade: "Coxilha", culturas: "Soja, Trigo", areaHa: 1500, potencialTotal: 520000, statusAtual: "Prospecção", frequencia: "Mensal", retorno: "Alto" },
  { id: "c5", nome: "Fazenda Santa Rita", abc: "B", prioridade: "P2", rota: "Rota Oeste", cidade: "Alegrete", localidade: "Vila Nova", culturas: "Milho, Soja", areaHa: 650, potencialTotal: 210000, statusAtual: "Ativo", frequencia: "Quinzenal", retorno: "Médio" },
  { id: "c6", nome: "Granja Vale Verde", abc: "C", prioridade: "P3", rota: "Rota Central", cidade: "Hulha Negra", localidade: "BR-153", culturas: "Soja", areaHa: 180, potencialTotal: 60000, statusAtual: "Ativo", frequencia: "Trimestral", retorno: "Baixo" },
  { id: "c7", nome: "Fazenda Costa do Sul", abc: "A", prioridade: "P1", rota: "Rota Sul", cidade: "Rio Grande", localidade: "Quinta", culturas: "Arroz", areaHa: 1100, potencialTotal: 440000, statusAtual: "Ativo", frequencia: "Mensal", retorno: "Alto" },
  { id: "c8", nome: "Cabanha Boa Sorte", abc: "B", prioridade: "P2", rota: "Rota Leste", cidade: "Lavras do Sul", localidade: "Campo Aberto", culturas: "Pastagem, Soja", areaHa: 720, potencialTotal: 230000, statusAtual: "Ativo", frequencia: "Mensal", retorno: "Médio" },
  { id: "c9", nome: "Agro Pampa", abc: "C", prioridade: "P3", rota: "Rota Oeste", cidade: "Quaraí", localidade: "Cerro", culturas: "Soja", areaHa: 240, potencialTotal: 75000, statusAtual: "Prospecção", frequencia: "Trimestral", retorno: "Baixo" },
  { id: "c10", nome: "Fazenda Nova Era", abc: "A", prioridade: "P1", rota: "Rota Central", cidade: "Caçapava do Sul", localidade: "Linha 7", culturas: "Soja, Milho", areaHa: 1350, potencialTotal: 500000, statusAtual: "Ativo", frequencia: "Mensal", retorno: "Alto" },
  { id: "c11", nome: "Estância do Cerro", abc: "B", prioridade: "P2", rota: "Rota Norte", cidade: "Aceguá", localidade: "Fronteira", culturas: "Soja, Trigo", areaHa: 580, potencialTotal: 190000, statusAtual: "Ativo", frequencia: "Mensal", retorno: "Médio" },
  { id: "c12", nome: "Sítio Recanto", abc: "C", prioridade: "P3", rota: "Rota Sul", cidade: "Pinheiro Machado", localidade: "Vila Rural", culturas: "Milho", areaHa: 120, potencialTotal: 38000, statusAtual: "Ativo", frequencia: "Trimestral", retorno: "Baixo" },
];

export const rotasInfo: Rota[] = [
  { nome: "Rota Norte", leituraAdministrativa: "Forte concentração de clientes A e P1, manter cobertura mensal.", acaoOperacional: "Priorizar visitas técnicas e propostas ADJ." },
  { nome: "Rota Sul", leituraAdministrativa: "Mix equilibrado, com potencial em arroz.", acaoOperacional: "Reforçar Nutrição Especial em arrozeiras." },
  { nome: "Rota Leste", leituraAdministrativa: "Oportunidades em prospecção, requer atenção.", acaoOperacional: "Agenda focada em conversão e relacionamento." },
  { nome: "Rota Oeste", leituraAdministrativa: "Distância elevada, otimizar roteirização.", acaoOperacional: "Agrupar visitas e eventos regionais." },
  { nome: "Rota Central", leituraAdministrativa: "Boa densidade C, oportunidades B.", acaoOperacional: "Ações de upgrade de portfólio." },
];

const hoje = new Date();
function diasAtras(n: number) {
  const d = new Date(hoje);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export const initialLancamentos: Lancamento[] = [
  { id: "l1", data: diasAtras(2), clienteId: "c1", tipo: "Visita", frente: "Venda Direta", status: "Concluído", vendaRs: 0, comissaoRs: 0, km: 120, despesaRs: 80, observacao: "Visita técnica de abertura." },
  { id: "l2", data: diasAtras(3), clienteId: "c2", tipo: "Proposta", frente: "Cooperagro", status: "Aguardando cliente", vendaRs: 0, comissaoRs: 0, km: 90, despesaRs: 50, observacao: "Proposta ADJ enviada." },
  { id: "l3", data: diasAtras(5), clienteId: "c1", tipo: "Venda", frente: "Venda Direta", status: "Concluído", vendaRs: 85000, comissaoRs: 5100, km: 0, despesaRs: 0 },
  { id: "l4", data: diasAtras(7), clienteId: "c4", tipo: "Visita", frente: "Tritec", status: "Concluído", vendaRs: 0, comissaoRs: 0, km: 180, despesaRs: 120 },
  { id: "l5", data: diasAtras(8), clienteId: "c7", tipo: "Venda", frente: "Cooperagro", status: "Concluído", vendaRs: 62000, comissaoRs: 3720, km: 0, despesaRs: 0 },
  { id: "l6", data: diasAtras(10), clienteId: "c5", tipo: "Visita", frente: "Nutrição Especial", status: "Concluído", vendaRs: 0, comissaoRs: 0, km: 150, despesaRs: 90 },
  { id: "l7", data: diasAtras(12), clienteId: "c10", tipo: "Venda", frente: "Venda Direta", status: "Concluído", vendaRs: 110000, comissaoRs: 6600, km: 0, despesaRs: 0 },
  { id: "l8", data: diasAtras(14), clienteId: "c8", tipo: "Proposta", frente: "Geo Pampa", status: "Em negociação", vendaRs: 0, comissaoRs: 0, km: 200, despesaRs: 140 },
  { id: "l9", data: diasAtras(18), clienteId: "c3", tipo: "Visita", frente: "Venda Direta", status: "Concluído", vendaRs: 0, comissaoRs: 0, km: 80, despesaRs: 40 },
  { id: "l10", data: diasAtras(22), clienteId: "c2", tipo: "Venda", frente: "Cooperagro", status: "Concluído", vendaRs: 95000, comissaoRs: 5700, km: 0, despesaRs: 0 },
  { id: "l11", data: diasAtras(25), clienteId: "c11", tipo: "Ligação", frente: "Venda Direta", status: "Aberto", vendaRs: 0, comissaoRs: 0, km: 0, despesaRs: 0, observacao: "Cliente vai retornar." },
  { id: "l12", data: diasAtras(30), clienteId: "c4", tipo: "Proposta", frente: "Tritec", status: "Aguardando parceiro", vendaRs: 0, comissaoRs: 0, km: 0, despesaRs: 0 },
  { id: "l13", data: diasAtras(35), clienteId: "c1", tipo: "Venda", frente: "Nutrição Especial", status: "Concluído", vendaRs: 48000, comissaoRs: 3360, km: 100, despesaRs: 70 },
  { id: "l14", data: diasAtras(45), clienteId: "c7", tipo: "Visita", frente: "Cooperagro", status: "Concluído", vendaRs: 0, comissaoRs: 0, km: 220, despesaRs: 160 },
  { id: "l15", data: diasAtras(60), clienteId: "c10", tipo: "Venda", frente: "Tritec", status: "Concluído", vendaRs: 72000, comissaoRs: 4320, km: 0, despesaRs: 0 },
  { id: "l16", data: diasAtras(15), clienteId: "c6", tipo: "Evento", frente: "Geo Pampa", status: "Concluído", vendaRs: 0, comissaoRs: 0, km: 90, despesaRs: 350, eventoAcao: "Dia de campo regional" },
];

const mesesSafra = [
  "2026-06","2026-07","2026-08","2026-09","2026-10","2026-11",
  "2027-01","2027-02","2027-03","2027-04","2027-05","2026-12",
];

export const initialMetasEmpresa: MetaEmpresa[] = mesesSafra.map((mes, i) => ({
  id: `me-${mes}`,
  mes,
  metaTotal: 250000 + (i % 4) * 50000,
  vendaDireta: 120000,
  cooperagro: 80000,
  tritec: 60000,
  observacao: "",
})).sort((a, b) => a.mes.localeCompare(b.mes));

export const initialMetasPessoais: MetaPessoal[] = [
  { id: "mp1", frente: "Venda Direta", comissaoAlvo: 60000, participacao: 40, percComissao: 6, metaFaturamento: 1000000 },
  { id: "mp2", frente: "Cooperagro", comissaoAlvo: 36000, participacao: 25, percComissao: 6, metaFaturamento: 600000 },
  { id: "mp3", frente: "Tritec", comissaoAlvo: 24000, participacao: 15, percComissao: 6, metaFaturamento: 400000 },
  { id: "mp4", frente: "Nutrição Especial", comissaoAlvo: 18000, participacao: 12, percComissao: 7, metaFaturamento: 260000 },
  { id: "mp5", frente: "Geo Pampa", comissaoAlvo: 12000, participacao: 8, percComissao: 8, metaFaturamento: 150000 },
];

export const initialEventos: Evento[] = [
  { id: "e1", tipo: "Dia de Campo", regiaoParceiro: "Bagé / Coop. Local", publico: "Produtores A/B", participantesMin: 40, participantesMax: 80, custoUnitario: 120, objetivo: "Apresentar portfólio ADJ", evidencia: "Lista de presença + fotos", status: "Planejar" },
  { id: "e2", tipo: "Treinamento Técnico", regiaoParceiro: "Pelotas / Tritec", publico: "RTV e clientes", participantesMin: 20, participantesMax: 35, custoUnitario: 180, objetivo: "Capacitar equipe Tritec", evidencia: "Certificados", status: "Aprovar" },
  { id: "e3", tipo: "Visita Demonstrativa", regiaoParceiro: "Dom Pedrito", publico: "Clientes P1", participantesMin: 10, participantesMax: 20, custoUnitario: 250, objetivo: "Mostrar resultados Nutri", evidencia: "Relatório técnico", status: "Em andamento" },
  { id: "e4", tipo: "Feira Regional", regiaoParceiro: "Alegrete", publico: "Aberto", participantesMin: 100, participantesMax: 300, custoUnitario: 80, objetivo: "Geração de leads", evidencia: "Cadastros coletados", status: "Concluído" },
];

export const initialPrioridadesP1: PrioridadeP1Item[] = initialClientes
  .filter(c => c.prioridade === "P1")
  .map((c, i) => ({
    id: `p1-${c.id}`,
    ordem: i + 1,
    clienteId: c.id,
    acaoRecomendada: i % 2 === 0 ? "Visita técnica + proposta ADJ" : "Reunião comercial + amostra Nutri",
    status: (["Em andamento", "Aberto", "Concluído", "Atrasado"] as const)[i % 4],
  }));