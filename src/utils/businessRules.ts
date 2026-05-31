import type {
  ABC,
  Cliente,
  Negocio,
  OportunidadeComercial,
  Orcamento,
  ProximaAcao,
  MetaVendedor,
  TicketMedioRegra,
  Vendedor,
} from "@/types";

const ACAO_ATIVA_STATUS = ["Pendente", "Em andamento", "Reagendada"];
const OPORTUNIDADE_ABERTA_ETAPAS = [
  "Identificada",
  "Qualificação",
  "Necessidade definida",
  "Orçamento em elaboração",
  "Orçamento enviado",
  "Negociação",
];
const POS_VENDA_TIPOS = ["Pós-venda", "Entrega", "Acompanhamento técnico", "Conferir aplicação", "Visita pós-venda"];

export interface RealizadoPorCliente {
  clienteId: string;
  valor: number;
}

export interface VisaoVendedorComercial {
  vendedor: string;
  clientes: number;
  areaHa: number;
  potencial: number;
  realizado: number;
  meta: number;
  gap: number;
  percentualAtingido: number;
  origemMeta: "manual" | "calculada";
  oportunidadesAbertas: number;
  proximasAcoesCriticas: number;
}

export interface VisaoClienteComercial {
  clienteId: string;
  cliente: string;
  fazenda: string;
  cidade: string;
  vendedor: string;
  abc: ABC;
  prioridade: string;
  areaHa: number;
  potencial: number;
  realizado: number;
  meta: number;
  gap: number;
  percentualAtingido: number;
  statusComercial: string;
  proximaAcao: string;
}

export interface VisaoAbcComercial {
  abc: ABC;
  clientes: number;
  areaHa: number;
  potencial: number;
  realizado: number;
  meta: number;
  gap: number;
  prioritariosSemProximaAcao: number;
}

export interface AlertaGerencialComercial {
  id: string;
  tipo:
    | "cliente-a-sem-proxima-acao"
    | "alto-potencial-sem-oportunidade"
    | "orcamento-aprovado-sem-negocio"
    | "negocio-ganho-sem-pos-venda"
    | "cliente-sem-vendedor"
    | "cliente-sem-area";
  severidade: "alta" | "media" | "baixa";
  titulo: string;
  detalhe: string;
  clienteId?: string;
  negocioId?: string;
  orcamentoId?: string;
}

export interface DashboardComercialSafra {
  potencialCarteira: number;
  metaCarteira: number;
  realizado: number;
  gap: number;
  percentualAtingido: number;
  statusVisual: "abaixo da meta" | "em evolução" | "próximo da meta" | "meta atingida";
  clientesAtivos: number;
  areaTotalHa: number;
  ticketMedioEstimadoHa: number;
  oportunidadesAbertas: number;
  orcamentosEmAberto: number;
  orcamentosAprovados: number;
  negociosGanhos: number;
  porVendedor: VisaoVendedorComercial[];
  porCliente: VisaoClienteComercial[];
  porAbc: VisaoAbcComercial[];
  alertas: AlertaGerencialComercial[];
  alertasConfiguracao: string[];
}

function normalizarTextoVendedor(vendedor?: string): string {
  return (vendedor || "").trim().replace(/\s+/g, " ");
}

function chaveComparacaoVendedor(vendedor?: string): string {
  return normalizarTextoVendedor(vendedor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function resolverVendedorCanonico(vendedor?: string, vendedores: Pick<Vendedor, "nome">[] = []): string {
  const nomeNormalizado = normalizarTextoVendedor(vendedor);
  if (!nomeNormalizado) return "Não definido";

  const chaveVendedor = chaveComparacaoVendedor(nomeNormalizado);
  const vendedorOficial = vendedores.find((item) => chaveComparacaoVendedor(item.nome) === chaveVendedor);
  return vendedorOficial ? normalizarTextoVendedor(vendedorOficial.nome) : nomeNormalizado;
}

export function normalizarVendedor(vendedor?: string, vendedores: Pick<Vendedor, "nome">[] = []): string {
  return resolverVendedorCanonico(vendedor, vendedores);
}

function temProximaAcaoAtiva(clienteId: string, proximasAcoes: ProximaAcao[], hojeIso?: string): boolean {
  return proximasAcoes.some((acao) => {
    if (acao.clienteId !== clienteId || !ACAO_ATIVA_STATUS.includes(acao.status)) return false;
    return hojeIso ? acao.data >= hojeIso || acao.status === "Pendente" : true;
  });
}

function obterProximaAcao(cliente: Cliente, proximasAcoes: ProximaAcao[], hojeIso: string): string {
  const acao = proximasAcoes
    .filter((item) => item.clienteId === cliente.id && ACAO_ATIVA_STATUS.includes(item.status))
    .sort((a, b) => a.data.localeCompare(b.data))[0];
  if (acao) return `${acao.data} • ${acao.tipo}`;
  if (cliente.dataProximaAcao) return `${cliente.dataProximaAcao} • ${cliente.tipoProximaAcao || "Ação"}`;
  if (cliente.proximaAcao) return cliente.proximaAcao;
  return "Sem próxima ação";
}

export function limitarPercentualAcerto(percentual: number): number {
  return Math.min(100, Math.max(0, Number.isFinite(percentual) ? percentual : 0));
}

export function normalizarValorNaoNegativo(valor: number): number {
  return Math.max(0, Number.isFinite(valor) ? valor : 0);
}

export function calcularValorMedioHaSegmentosAtivos(ticketsMedios: TicketMedioRegra[]): number {
  return ticketsMedios.filter((t) => t.ativo).reduce((s, t) => s + normalizarValorNaoNegativo(t.valorMedioHa || 0), 0);
}

export function calcularPotencialCliente(cliente: Cliente, ticketsMedios: TicketMedioRegra[]): number {
  const areaHa = Math.max(0, cliente.areaHa || 0);
  const valorMedioHa = calcularValorMedioHaSegmentosAtivos(ticketsMedios);
  if (valorMedioHa > 0) return areaHa * valorMedioHa;
  return Math.max(0, cliente.potencialTotal || cliente.potencialAdj || 0) + Math.max(0, cliente.potencialNutri || 0);
}

export function calcularPotencialCarteira(clientes: Cliente[], ticketsMedios: TicketMedioRegra[]): number {
  return clientes.reduce((s, c) => s + calcularPotencialCliente(c, ticketsMedios), 0);
}

export function calcularMetaCarteira(clientes: Cliente[], ticketsMedios: TicketMedioRegra[], percentualAcertoEsperado: number): number {
  const taxa = limitarPercentualAcerto(percentualAcertoEsperado || 0);
  return calcularPotencialCarteira(clientes, ticketsMedios) * taxa / 100;
}

export function calcularRealizadoCarteira(negocios: Negocio[], orcamentos: Orcamento[]): number {
  const fechados = negocios.filter((n) => n.status === "Fechado ganho");
  const negocioIdsFechados = new Set(fechados.map((n) => n.id));
  const orcamentoIdsFechados = new Set(fechados.map((n) => n.orcamentoId).filter(Boolean));
  const realizadoNegocios = fechados.reduce((s, n) => s + (n.valorFechado || 0), 0);
  const realizadoOrcamentos = orcamentos
    .filter((o) => o.status === "Aprovado")
    .filter((o) => (!o.negocioId || !negocioIdsFechados.has(o.negocioId)) && !orcamentoIdsFechados.has(o.id))
    .reduce((s, o) => s + (o.valorTotal || 0), 0);
  return realizadoNegocios + realizadoOrcamentos;
}

export function calcularRealizadoPorCliente(negocios: Negocio[], orcamentos: Orcamento[]): RealizadoPorCliente[] {
  const porCliente = new Map<string, number>();
  const fechados = negocios.filter((n) => n.status === "Fechado ganho");
  const negocioIdsFechados = new Set(fechados.map((n) => n.id));
  const orcamentoIdsFechados = new Set(fechados.map((n) => n.orcamentoId).filter(Boolean));

  fechados.forEach((negocio) => {
    porCliente.set(negocio.clienteId, (porCliente.get(negocio.clienteId) || 0) + (negocio.valorFechado || 0));
  });

  orcamentos
    .filter((orcamento) => orcamento.status === "Aprovado")
    .filter((orcamento) => (!orcamento.negocioId || !negocioIdsFechados.has(orcamento.negocioId)) && !orcamentoIdsFechados.has(orcamento.id))
    .forEach((orcamento) => {
      porCliente.set(orcamento.clienteId, (porCliente.get(orcamento.clienteId) || 0) + (orcamento.valorTotal || 0));
    });

  return Array.from(porCliente.entries()).map(([clienteId, valor]) => ({ clienteId, valor }));
}

export function obterStatusAtingimento(percentualAtingido: number): DashboardComercialSafra["statusVisual"] {
  if (percentualAtingido >= 1) return "meta atingida";
  if (percentualAtingido >= 0.85) return "próximo da meta";
  if (percentualAtingido >= 0.4) return "em evolução";
  return "abaixo da meta";
}

export function montarDashboardComercialSafra(params: {
  clientes: Cliente[];
  ticketsMedios: TicketMedioRegra[];
  percentualAcertoEsperado: number;
  metasVendedor?: MetaVendedor[];
  vendedores?: Pick<Vendedor, "nome">[];
  negocios: Negocio[];
  orcamentos: Orcamento[];
  oportunidades: OportunidadeComercial[];
  proximasAcoes: ProximaAcao[];
  hojeIso?: string;
}): DashboardComercialSafra {
  const { clientes, ticketsMedios, percentualAcertoEsperado, negocios, orcamentos, oportunidades, proximasAcoes } = params;
  const metasVendedor = params.metasVendedor || [];
  const vendedoresCadastrados = params.vendedores || [];
  const hojeIso = params.hojeIso || new Date().toISOString().slice(0, 10);
  const potencialCarteira = calcularPotencialCarteira(clientes, ticketsMedios);
  const metaCarteira = calcularMetaCarteira(clientes, ticketsMedios, percentualAcertoEsperado);
  const realizado = calcularRealizadoCarteira(negocios, orcamentos);
  const gap = metaCarteira - realizado;
  const percentualAtingido = metaCarteira > 0 ? realizado / metaCarteira : 0;
  const realizadoMap = new Map(calcularRealizadoPorCliente(negocios, orcamentos).map((item) => [item.clienteId, item.valor]));
  const potenciais = new Map(clientes.map((cliente) => [cliente.id, calcularPotencialCliente(cliente, ticketsMedios)]));
  const oportunidadesAbertas = oportunidades.filter((oportunidade) => OPORTUNIDADE_ABERTA_ETAPAS.includes(oportunidade.etapa)).length;
  const orcamentosEmAberto = orcamentos.filter((orcamento) => ["Rascunho", "Enviado", "Em revisão", "Reenviado", "Aberto", "Em negociação"].includes(orcamento.status)).length;
  const orcamentosAprovados = orcamentos.filter((orcamento) => orcamento.status === "Aprovado").length;
  const negociosGanhos = negocios.filter((negocio) => negocio.status === "Fechado ganho").length;

  const porCliente = clientes.map((cliente) => {
    const potencial = potenciais.get(cliente.id) || 0;
    const realizadoCliente = realizadoMap.get(cliente.id) || 0;
    const metaCliente = potencial * limitarPercentualAcerto(percentualAcertoEsperado || 0) / 100;
    const percentualCliente = metaCliente > 0 ? realizadoCliente / metaCliente : 0;
    return {
      clienteId: cliente.id,
      cliente: cliente.nome,
      fazenda: cliente.localidade || cliente.rota || "—",
      cidade: cliente.cidade || "—",
      vendedor: resolverVendedorCanonico(cliente.vendedor, vendedoresCadastrados),
      abc: cliente.abc,
      prioridade: cliente.prioridade,
      areaHa: cliente.areaHa || 0,
      potencial,
      realizado: realizadoCliente,
      meta: metaCliente,
      gap: metaCliente - realizadoCliente,
      percentualAtingido: percentualCliente,
      statusComercial: obterStatusAtingimento(percentualCliente),
      proximaAcao: obterProximaAcao(cliente, proximasAcoes, hojeIso),
    };
  });

  const porVendedor = Array.from(porCliente.reduce((mapa, cliente) => {
    const atual = mapa.get(cliente.vendedor) || {
      vendedor: cliente.vendedor,
      clientes: 0,
      areaHa: 0,
      potencial: 0,
      realizado: 0,
      meta: 0,
      gap: 0,
      percentualAtingido: 0,
      origemMeta: "calculada" as const,
      oportunidadesAbertas: 0,
      proximasAcoesCriticas: 0,
    };
    atual.clientes += 1;
    atual.areaHa += cliente.areaHa;
    atual.potencial += cliente.potencial;
    atual.realizado += cliente.realizado;
    mapa.set(cliente.vendedor, atual);
    return mapa;
  }, new Map<string, VisaoVendedorComercial>()).values()).map((vendedor) => {
    const clientesDoVendedor = clientes.filter((cliente) => resolverVendedorCanonico(cliente.vendedor, vendedoresCadastrados) === vendedor.vendedor);
    const metaConfigurada = metasVendedor.find((meta) => (meta.ativo ?? true) && resolverVendedorCanonico(meta.vendedor, vendedoresCadastrados) === vendedor.vendedor);
    const metaManual = metaConfigurada?.metaManual ?? (metaConfigurada?.origemMeta === "proporcional" ? undefined : metaConfigurada?.meta);
    const metaAutomatica = metaConfigurada?.metaCalculada ?? metaCarteira * (potencialCarteira > 0 ? vendedor.potencial / potencialCarteira : 0);
    const metaVendedor = metaManual !== undefined ? normalizarValorNaoNegativo(metaManual) : normalizarValorNaoNegativo(metaAutomatica);
    vendedor.meta = metaVendedor;
    vendedor.origemMeta = metaManual !== undefined ? "manual" : "calculada";
    vendedor.gap = metaVendedor - vendedor.realizado;
    vendedor.percentualAtingido = metaVendedor > 0 ? vendedor.realizado / metaVendedor : 0;
    vendedor.oportunidadesAbertas = oportunidades.filter((oportunidade) => OPORTUNIDADE_ABERTA_ETAPAS.includes(oportunidade.etapa) && clientesDoVendedor.some((cliente) => cliente.id === oportunidade.clienteId)).length;
    vendedor.proximasAcoesCriticas = proximasAcoes.filter((acao) => clientesDoVendedor.some((cliente) => cliente.id === acao.clienteId) && ACAO_ATIVA_STATUS.includes(acao.status) && acao.data <= hojeIso).length;
    return vendedor;
  }).sort((a, b) => b.potencial - a.potencial);

  const porAbc = (["A", "B", "C"] as ABC[]).map((abc) => {
    const clientesAbc = porCliente.filter((cliente) => cliente.abc === abc);
    const potencial = clientesAbc.reduce((s, cliente) => s + cliente.potencial, 0);
    const realizadoAbc = clientesAbc.reduce((s, cliente) => s + cliente.realizado, 0);
    const metaAbc = potencial * limitarPercentualAcerto(percentualAcertoEsperado || 0) / 100;
    return {
      abc,
      clientes: clientesAbc.length,
      areaHa: clientesAbc.reduce((s, cliente) => s + cliente.areaHa, 0),
      potencial,
      realizado: realizadoAbc,
      meta: metaAbc,
      gap: metaAbc - realizadoAbc,
      prioritariosSemProximaAcao: clientes.filter((cliente) => cliente.abc === abc && cliente.prioridade === "P1" && !temProximaAcaoAtiva(cliente.id, proximasAcoes, hojeIso)).length,
    };
  });

  const maiorPotencial = Math.max(0, ...porCliente.map((cliente) => cliente.potencial));
  const limiteAltoPotencial = Math.max(maiorPotencial * 0.7, potencialCarteira / Math.max(clientes.length, 1));
  const negociosGanhosSemPosVenda = negocios.filter((negocio) => negocio.status === "Fechado ganho" && !proximasAcoes.some((acao) => (acao.negocioId === negocio.id || acao.clienteId === negocio.clienteId) && POS_VENDA_TIPOS.includes(acao.tipo) && ACAO_ATIVA_STATUS.includes(acao.status)));
  const negociosGanhosIds = new Set(negocios.filter((negocio) => negocio.status === "Fechado ganho").map((negocio) => negocio.id));
  const orcamentosComNegocioGanhoIds = new Set(negocios.filter((negocio) => negocio.status === "Fechado ganho").map((negocio) => negocio.orcamentoId).filter(Boolean));

  const alertas: AlertaGerencialComercial[] = [
    ...clientes
      .filter((cliente) => cliente.abc === "A" && !temProximaAcaoAtiva(cliente.id, proximasAcoes, hojeIso))
      .map((cliente) => ({ id: `cliente-a-sem-acao-${cliente.id}`, tipo: "cliente-a-sem-proxima-acao" as const, severidade: "alta" as const, titulo: "Cliente A sem próxima ação", detalhe: `${cliente.nome} precisa de ação comercial registrada.`, clienteId: cliente.id })),
    ...porCliente
      .filter((cliente) => cliente.potencial > 0 && cliente.potencial >= limiteAltoPotencial && !oportunidades.some((oportunidade) => oportunidade.clienteId === cliente.clienteId && OPORTUNIDADE_ABERTA_ETAPAS.includes(oportunidade.etapa)))
      .map((cliente) => ({ id: `alto-potencial-sem-oportunidade-${cliente.clienteId}`, tipo: "alto-potencial-sem-oportunidade" as const, severidade: "media" as const, titulo: "Alto potencial sem oportunidade aberta", detalhe: `${cliente.cliente} tem potencial de ${cliente.potencial.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`, clienteId: cliente.clienteId })),
    ...orcamentos
      .filter((orcamento) => orcamento.status === "Aprovado" && (!orcamento.negocioId || !negociosGanhosIds.has(orcamento.negocioId)) && !orcamentosComNegocioGanhoIds.has(orcamento.id))
      .map((orcamento) => ({ id: `orcamento-aprovado-sem-negocio-${orcamento.id}`, tipo: "orcamento-aprovado-sem-negocio" as const, severidade: "media" as const, titulo: "Orçamento aprovado sem negócio ganho", detalhe: `${orcamento.codigo} aprovado e ainda sem negócio ganho vinculado.`, clienteId: orcamento.clienteId, orcamentoId: orcamento.id })),
    ...negociosGanhosSemPosVenda.map((negocio) => ({ id: `negocio-ganho-sem-pos-venda-${negocio.id}`, tipo: "negocio-ganho-sem-pos-venda" as const, severidade: "baixa" as const, titulo: "Negócio ganho sem próxima ação pós-venda", detalhe: negocio.nome || negocio.id, clienteId: negocio.clienteId, negocioId: negocio.id })),
    ...clientes
      .filter((cliente) => !cliente.vendedor?.trim())
      .map((cliente) => ({ id: `cliente-sem-vendedor-${cliente.id}`, tipo: "cliente-sem-vendedor" as const, severidade: "media" as const, titulo: "Cliente sem vendedor definido", detalhe: cliente.nome, clienteId: cliente.id })),
    ...clientes
      .filter((cliente) => !cliente.areaHa || cliente.areaHa <= 0)
      .map((cliente) => ({ id: `cliente-sem-area-${cliente.id}`, tipo: "cliente-sem-area" as const, severidade: "media" as const, titulo: "Cliente sem área informada", detalhe: cliente.nome, clienteId: cliente.id })),
  ];

  const areaTotalHa = clientes.reduce((s, cliente) => s + Math.max(0, cliente.areaHa || 0), 0);
  const regrasAtivas = ticketsMedios.filter((ticket) => ticket.ativo && normalizarValorNaoNegativo(ticket.valorMedioHa) > 0);
  const vendedoresCarteira = new Set(porVendedor.map((vendedor) => vendedor.vendedor));
  const metasAtivas = metasVendedor.filter((meta) => (meta.ativo ?? true) && vendedoresCarteira.has(resolverVendedorCanonico(meta.vendedor, vendedoresCadastrados)));
  const alertasConfiguracao = [
    ...(regrasAtivas.length === 0 ? ["Ticket médio/ha não configurado."] : []),
    ...(percentualAcertoEsperado === undefined || percentualAcertoEsperado === null ? ["Percentual de acerto esperado não configurado."] : []),
    ...(metasAtivas.length === 0 ? ["Metas por vendedor ainda não configuradas."] : []),
    ...(porVendedor.some((vendedor) => vendedor.origemMeta === "calculada") ? ["Usando distribuição automática por potencial."] : []),
  ];

  return {
    potencialCarteira,
    metaCarteira,
    realizado,
    gap,
    percentualAtingido,
    statusVisual: obterStatusAtingimento(percentualAtingido),
    clientesAtivos: clientes.filter((cliente) => cliente.statusAtual !== "Inativo").length,
    areaTotalHa,
    ticketMedioEstimadoHa: areaTotalHa > 0 ? potencialCarteira / areaTotalHa : 0,
    oportunidadesAbertas,
    orcamentosEmAberto,
    orcamentosAprovados,
    negociosGanhos,
    porVendedor,
    porCliente: porCliente.sort((a, b) => b.potencial - a.potencial),
    porAbc,
    alertas,
    alertasConfiguracao,
  };
}

export function distribuirMetaPorPotencial(params: {
  clientes: Cliente[];
  ticketsMedios: TicketMedioRegra[];
  percentualAcertoEsperado: number;
  vendedores?: Pick<Vendedor, "nome">[];
}): MetaVendedor[] {
  const potencialCarteira = calcularPotencialCarteira(params.clientes, params.ticketsMedios);
  const metaCarteira = calcularMetaCarteira(params.clientes, params.ticketsMedios, params.percentualAcertoEsperado);
  const potenciaisPorVendedor = params.clientes.reduce((mapa, cliente) => {
    const vendedor = resolverVendedorCanonico(cliente.vendedor, params.vendedores || []);
    mapa.set(vendedor, (mapa.get(vendedor) || 0) + calcularPotencialCliente(cliente, params.ticketsMedios));
    return mapa;
  }, new Map<string, number>());

  return Array.from(potenciaisPorVendedor.entries()).map(([vendedor, potencial], index) => {
    const percentualMetaCarteira = potencialCarteira > 0 ? (potencial / potencialCarteira) * 100 : 0;
    const metaCalculada = metaCarteira * (percentualMetaCarteira / 100);
    return {
      id: `mv-auto-${index}-${vendedor.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`,
      vendedor,
      percentualMetaCarteira,
      metaCalculada,
      meta: metaCalculada,
      ativo: true,
      origemMeta: "proporcional",
    };
  });
}
