import {
  Cliente, Lancamento, MetaEmpresa, MetaPessoal, Rota, Evento, PrioridadeP1Item,
  Negocio, Produto, RegraComissao, Vendedor, MetaVendedor, MetaCategoria,
} from "@/types";

export const ROTAS_NOMES = ["Rota Norte", "Rota Sul", "Rota Leste", "Rota Oeste", "Rota Central"];

export const initialVendedores: Vendedor[] = [
  { id: "v1", nome: "Bruno" },
  { id: "v2", nome: "Douglas" },
  { id: "v3", nome: "Outro" },
];

export const initialClientes: Cliente[] = [
  { id: "c1", nome: "Fazenda Boa Vista", abc: "A", prioridade: "P1", rota: "Rota Norte", cidade: "Bagé", localidade: "Distrito 3", culturas: "Soja, Milho", areaHa: 1200, potencialTotal: 480000, potencialAdj: 280000, potencialNutri: 200000, statusAtual: "Ativo", frequencia: "Mensal", retorno: "Alto", motivoAbc: "Volume e fidelidade", vendedor: "Bruno", produtosInteresse: ["p1","p3"] },
  { id: "c2", nome: "Agropecuária São João", abc: "A", prioridade: "P1", rota: "Rota Sul", cidade: "Pelotas", localidade: "Capão do Leão", culturas: "Arroz, Soja", areaHa: 980, potencialTotal: 410000, statusAtual: "Ativo", frequencia: "Quinzenal", retorno: "Alto", vendedor: "Douglas" },
  { id: "c3", nome: "Sítio Esperança", abc: "B", prioridade: "P2", rota: "Rota Norte", cidade: "Candiota", localidade: "Linha 4", culturas: "Soja", areaHa: 420, potencialTotal: 150000, statusAtual: "Ativo", frequencia: "Mensal", retorno: "Médio", vendedor: "Bruno" },
  { id: "c4", nome: "Estância Três Marias", abc: "A", prioridade: "P2", rota: "Rota Leste", cidade: "Dom Pedrito", localidade: "Coxilha", culturas: "Soja, Trigo", areaHa: 1500, potencialTotal: 520000, statusAtual: "Prospecção", frequencia: "Mensal", retorno: "Alto", vendedor: "Douglas" },
  { id: "c5", nome: "Fazenda Santa Rita", abc: "B", prioridade: "P2", rota: "Rota Oeste", cidade: "Alegrete", localidade: "Vila Nova", culturas: "Milho, Soja", areaHa: 650, potencialTotal: 210000, statusAtual: "Ativo", frequencia: "Quinzenal", retorno: "Médio", vendedor: "Bruno" },
  { id: "c6", nome: "Granja Vale Verde", abc: "C", prioridade: "P3", rota: "Rota Central", cidade: "Hulha Negra", localidade: "BR-153", culturas: "Soja", areaHa: 180, potencialTotal: 60000, statusAtual: "Ativo", frequencia: "Trimestral", retorno: "Baixo", vendedor: "Douglas" },
  { id: "c7", nome: "Fazenda Costa do Sul", abc: "A", prioridade: "P1", rota: "Rota Sul", cidade: "Rio Grande", localidade: "Quinta", culturas: "Arroz", areaHa: 1100, potencialTotal: 440000, statusAtual: "Ativo", frequencia: "Mensal", retorno: "Alto", vendedor: "Bruno" },
  { id: "c8", nome: "Cabanha Boa Sorte", abc: "B", prioridade: "P2", rota: "Rota Leste", cidade: "Lavras do Sul", localidade: "Campo Aberto", culturas: "Pastagem, Soja", areaHa: 720, potencialTotal: 230000, statusAtual: "Ativo", frequencia: "Mensal", retorno: "Médio", vendedor: "Douglas" },
  { id: "c9", nome: "Agro Pampa", abc: "C", prioridade: "P3", rota: "Rota Oeste", cidade: "Quaraí", localidade: "Cerro", culturas: "Soja", areaHa: 240, potencialTotal: 75000, statusAtual: "Prospecção", frequencia: "Trimestral", retorno: "Baixo", vendedor: "Bruno" },
  { id: "c10", nome: "Fazenda Nova Era", abc: "A", prioridade: "P1", rota: "Rota Central", cidade: "Caçapava do Sul", localidade: "Linha 7", culturas: "Soja, Milho", areaHa: 1350, potencialTotal: 500000, statusAtual: "Ativo", frequencia: "Mensal", retorno: "Alto", vendedor: "Douglas" },
  { id: "c11", nome: "Estância do Cerro", abc: "B", prioridade: "P2", rota: "Rota Norte", cidade: "Aceguá", localidade: "Fronteira", culturas: "Soja, Trigo", areaHa: 580, potencialTotal: 190000, statusAtual: "Ativo", frequencia: "Mensal", retorno: "Médio", vendedor: "Bruno" },
  { id: "c12", nome: "Sítio Recanto", abc: "C", prioridade: "P3", rota: "Rota Sul", cidade: "Pinheiro Machado", localidade: "Vila Rural", culturas: "Milho", areaHa: 120, potencialTotal: 38000, statusAtual: "Ativo", frequencia: "Trimestral", retorno: "Baixo", vendedor: "Douglas" },
];

export const rotasInfo: Rota[] = [
  { nome: "Rota Norte", leituraAdministrativa: "Forte concentração de clientes A e P1, manter cobertura mensal.", acaoOperacional: "Priorizar visitas técnicas e propostas ADJ." },
  { nome: "Rota Sul", leituraAdministrativa: "Mix equilibrado, com potencial em arroz.", acaoOperacional: "Reforçar Nutrição Especial em arrozeiras." },
  { nome: "Rota Leste", leituraAdministrativa: "Oportunidades em prospecção, requer atenção.", acaoOperacional: "Agenda focada em conversão e relacionamento." },
  { nome: "Rota Oeste", leituraAdministrativa: "Distância elevada, otimizar roteirização.", acaoOperacional: "Agrupar visitas e eventos regionais." },
  { nome: "Rota Central", leituraAdministrativa: "Boa densidade C, oportunidades B.", acaoOperacional: "Ações de upgrade de portfólio." },
];

const hoje = new Date();
const diasAtras = (n: number) => { const d = new Date(hoje); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const diasFuturos = (n: number) => { const d = new Date(hoje); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export const initialProdutos: Produto[] = [
  { id: "p1", codigo: "ADJ-001", nome: "ADJ Performance", categoria: "Adjuvantes", linha: "Performance", unidade: "L", fornecedor: "Quimagro", precoLista: 85, precoMinimo: 70, custo: 50, margem: 41, controlaEstoque: true, estoqueAtual: 400, estoqueReservado: 50, localEstoque: "CD Bagé", ultimaAtualizacao: diasAtras(2), ativo: true },
  { id: "p2", codigo: "NUT-010", nome: "Nutri Special K", categoria: "Nutrição", linha: "Especial", unidade: "Kg", fornecedor: "AgroNutri", precoLista: 120, precoMinimo: 95, custo: 70, margem: 41, controlaEstoque: true, estoqueAtual: 80, estoqueReservado: 20, localEstoque: "CD Pelotas", ultimaAtualizacao: diasAtras(5), ativo: true },
  { id: "p3", codigo: "FER-200", nome: "Fertilizante NPK 10-20-10", categoria: "Fertilizantes", linha: "Premium", unidade: "Ton", fornecedor: "Fertipampa", precoLista: 3200, precoMinimo: 2800, custo: 2400, margem: 25, controlaEstoque: true, estoqueAtual: 25, estoqueReservado: 5, localEstoque: "CD Bagé", ultimaAtualizacao: diasAtras(1), ativo: true },
  { id: "p4", codigo: "SEM-050", nome: "Semente Soja R7", categoria: "Sementes", linha: "Elite", unidade: "Sc", fornecedor: "SeedBR", precoLista: 850, precoMinimo: 780, custo: 700, margem: 17, controlaEstoque: true, estoqueAtual: 5, estoqueReservado: 0, localEstoque: "CD Pelotas", ultimaAtualizacao: diasAtras(7), ativo: true },
  { id: "p5", codigo: "DEF-300", nome: "Defensivo Glifo X", categoria: "Defensivos", linha: "Standard", unidade: "L", fornecedor: "Quimagro", precoLista: 45, precoMinimo: 38, custo: 28, margem: 38, controlaEstoque: true, estoqueAtual: 1200, estoqueReservado: 200, localEstoque: "CD Bagé", ultimaAtualizacao: diasAtras(3), ativo: true },
  { id: "p6", codigo: "BIO-100", nome: "Bio Inoc Plus", categoria: "Biológicos", linha: "Bio", unidade: "L", fornecedor: "BioAgro", precoLista: 65, precoMinimo: 55, custo: 38, margem: 41, controlaEstoque: true, estoqueAtual: 0, estoqueReservado: 0, localEstoque: "CD Pelotas", ultimaAtualizacao: diasAtras(10), ativo: true },
];

export const initialLancamentos: Lancamento[] = [
  { id: "l1", data: diasAtras(2), clienteId: "c1", tipo: "Visita", frente: "Venda Direta", status: "Concluído", oQueFoiRealizado: "Visita técnica de abertura, apresentação portfólio ADJ.", vendedor: "Bruno", geraOportunidade: true, negocioId: "n1" },
  { id: "l2", data: diasAtras(3), clienteId: "c2", tipo: "Proposta", frente: "Cooperagro", status: "Aguardando cliente", oQueFoiRealizado: "Proposta ADJ enviada por email.", vendedor: "Douglas", geraOportunidade: true, negocioId: "n2" },
  { id: "l3", data: diasAtras(5), clienteId: "c1", tipo: "Venda", frente: "Venda Direta", status: "Concluído", oQueFoiRealizado: "Pedido confirmado.", vendaRs: 85000, vendedor: "Bruno" },
  { id: "l4", data: diasAtras(7), clienteId: "c4", tipo: "Visita", frente: "Tritec", status: "Concluído", oQueFoiRealizado: "Visita técnica - levantamento de necessidades.", vendedor: "Douglas", geraOportunidade: true, negocioId: "n3" },
  { id: "l5", data: diasAtras(8), clienteId: "c7", tipo: "Venda", frente: "Cooperagro", status: "Concluído", oQueFoiRealizado: "Negócio fechado, NF emitida.", vendaRs: 62000, vendedor: "Bruno" },
  { id: "l6", data: diasAtras(10), clienteId: "c5", tipo: "Visita", frente: "Nutrição Especial", status: "Concluído", oQueFoiRealizado: "Apresentação Nutri Special.", vendedor: "Bruno", geraOportunidade: true, negocioId: "n4" },
  { id: "l7", data: diasAtras(12), clienteId: "c10", tipo: "Venda", frente: "Venda Direta", status: "Concluído", oQueFoiRealizado: "Pedido grande de NPK.", vendaRs: 110000, vendedor: "Douglas" },
  { id: "l8", data: diasAtras(14), clienteId: "c8", tipo: "Proposta", frente: "Geo Pampa", status: "Em negociação", oQueFoiRealizado: "Proposta apresentada.", vendedor: "Douglas", geraOportunidade: true, negocioId: "n5" },
  { id: "l9", data: diasAtras(18), clienteId: "c3", tipo: "Visita", frente: "Venda Direta", status: "Concluído", oQueFoiRealizado: "Visita de relacionamento.", vendedor: "Bruno" },
  { id: "l10", data: diasAtras(22), clienteId: "c2", tipo: "Venda", frente: "Cooperagro", status: "Concluído", oQueFoiRealizado: "Fechamento de pedido recorrente.", vendaRs: 95000, vendedor: "Douglas" },
  { id: "l11", data: diasAtras(25), clienteId: "c11", tipo: "Ligação", frente: "Venda Direta", status: "Aberto", oQueFoiRealizado: "Cliente ficou de retornar.", vendedor: "Bruno" },
  { id: "l12", data: diasAtras(30), clienteId: "c4", tipo: "Proposta", frente: "Tritec", status: "Aguardando parceiro", oQueFoiRealizado: "Aguardando análise técnica Tritec.", vendedor: "Douglas" },
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

export const initialMetasVendedor: MetaVendedor[] = [
  { id: "mv1", vendedor: "Bruno", mes: "2026-08", meta: 180000 },
  { id: "mv2", vendedor: "Douglas", mes: "2026-08", meta: 160000 },
];

export const initialMetasCategoria: MetaCategoria[] = [
  { id: "mc1", categoria: "Adjuvantes", mes: "2026-08", meta: 90000 },
  { id: "mc2", categoria: "Nutrição", mes: "2026-08", meta: 70000 },
  { id: "mc3", categoria: "Fertilizantes", mes: "2026-08", meta: 200000 },
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

export const initialNegocios: Negocio[] = [
  { id: "n1", nome: "ADJ Boa Vista 2026", clienteId: "c1", vendedor: "Bruno", origem: "Visita", produtos: ["p1"], categoria: "Adjuvantes", valorPotencial: 80000, status: "Qualificado", probabilidade: 60, previsaoFechamento: diasFuturos(20), dataCriacao: diasAtras(2), ultimaAtualizacao: diasAtras(1), proximaAcao: "Enviar proposta formal", dataProximaAcao: diasFuturos(3), lancamentoId: "l1" },
  { id: "n2", nome: "Cooperagro SJ - ADJ", clienteId: "c2", vendedor: "Douglas", origem: "Visita", produtos: ["p1","p5"], categoria: "Adjuvantes", valorPotencial: 65000, status: "Proposta enviada", probabilidade: 70, previsaoFechamento: diasFuturos(10), dataCriacao: diasAtras(3), ultimaAtualizacao: diasAtras(1), proximaAcao: "Follow-up cliente", dataProximaAcao: diasFuturos(2), lancamentoId: "l2" },
  { id: "n3", nome: "Tritec Três Marias", clienteId: "c4", vendedor: "Douglas", origem: "Visita", produtos: ["p3"], categoria: "Fertilizantes", valorPotencial: 180000, status: "Em negociação", probabilidade: 50, previsaoFechamento: diasFuturos(30), dataCriacao: diasAtras(7), ultimaAtualizacao: diasAtras(2), proximaAcao: "Reunião técnica", dataProximaAcao: diasFuturos(5), lancamentoId: "l4" },
  { id: "n4", nome: "Nutri Santa Rita", clienteId: "c5", vendedor: "Bruno", origem: "Visita", produtos: ["p2"], categoria: "Nutrição", valorPotencial: 42000, status: "Qualificado", probabilidade: 55, previsaoFechamento: diasFuturos(25), dataCriacao: diasAtras(10), ultimaAtualizacao: diasAtras(3), proximaAcao: "Enviar amostra", dataProximaAcao: diasFuturos(7), lancamentoId: "l6" },
  { id: "n5", nome: "Geo Pampa Cabanha", clienteId: "c8", vendedor: "Douglas", origem: "Visita", produtos: ["p6"], categoria: "Biológicos", valorPotencial: 28000, status: "Em negociação", probabilidade: 40, previsaoFechamento: diasFuturos(15), dataCriacao: diasAtras(14), ultimaAtualizacao: diasAtras(2), proximaAcao: "Apresentar resultados", dataProximaAcao: diasAtras(1), lancamentoId: "l8" },
  { id: "n6", nome: "Fechamento Costa do Sul", clienteId: "c7", vendedor: "Bruno", origem: "Ligação", produtos: ["p3","p5"], categoria: "Fertilizantes", valorPotencial: 75000, valorFechado: 62000, status: "Fechado ganho", probabilidade: 100, previsaoFechamento: diasAtras(8), dataCriacao: diasAtras(20), ultimaAtualizacao: diasAtras(8) },
  { id: "n7", nome: "Nova Era - NPK", clienteId: "c10", vendedor: "Douglas", origem: "Visita", produtos: ["p3"], categoria: "Fertilizantes", valorPotencial: 130000, valorFechado: 110000, status: "Fechado ganho", probabilidade: 100, previsaoFechamento: diasAtras(12), dataCriacao: diasAtras(40), ultimaAtualizacao: diasAtras(12) },
  { id: "n8", nome: "São João Cooperagro", clienteId: "c2", vendedor: "Douglas", origem: "Visita", produtos: ["p1"], categoria: "Adjuvantes", valorPotencial: 105000, valorFechado: 95000, status: "Fechado ganho", probabilidade: 100, previsaoFechamento: diasAtras(22), dataCriacao: diasAtras(60), ultimaAtualizacao: diasAtras(22) },
  { id: "n9", nome: "Sítio Esperança - perdido", clienteId: "c3", vendedor: "Bruno", origem: "WhatsApp", produtos: ["p1"], categoria: "Adjuvantes", valorPotencial: 22000, status: "Fechado perdido", probabilidade: 0, dataCriacao: diasAtras(30), ultimaAtualizacao: diasAtras(10), motivoPerda: "Preço acima do concorrente" },
  { id: "n10", nome: "Boa Vista Nutri", clienteId: "c1", vendedor: "Bruno", origem: "Indicação", produtos: ["p2"], categoria: "Nutrição", valorPotencial: 35000, valorFechado: 32000, status: "Fechado ganho", probabilidade: 100, previsaoFechamento: diasAtras(35), dataCriacao: diasAtras(50), ultimaAtualizacao: diasAtras(35) },
  { id: "n11", nome: "Granja Vale Verde - novo", clienteId: "c6", vendedor: "Douglas", origem: "Evento", produtos: ["p5"], categoria: "Defensivos", valorPotencial: 12000, status: "Novo", probabilidade: 20, previsaoFechamento: diasFuturos(45), dataCriacao: diasAtras(2), ultimaAtualizacao: diasAtras(2), proximaAcao: "Primeira ligação", dataProximaAcao: diasFuturos(2) },
];

export const initialRegrasComissao: RegraComissao[] = [
  { id: "rc1", nome: "Comissão padrão venda direta", tipo: "fixa", percentual: 1.5, aplicarSobre: "negocio_fechado", ativo: true },
  { id: "rc2", nome: "Comissão escalonada por meta", tipo: "escalonada", aplicarSobre: "meta_empresa", ativo: true, faixas: [
    { min: 80, max: 89, percentual: 0.5 },
    { min: 90, max: 99, percentual: 1.0 },
    { min: 100, max: 9999, percentual: 1.5 },
  ]},
  { id: "rc3", nome: "Bônus Nutrição", tipo: "fixa", percentual: 2.0, aplicarSobre: "categoria", alvo: "Nutrição", ativo: true },
];
