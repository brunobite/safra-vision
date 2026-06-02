import type { Cliente, Lancamento, MetaCategoria, MetaEmpresa, MetaVendedor, OportunidadeComercial, Orcamento, ProximaAcao, StatusProximaAcao, TipoProximaAcao } from "@/types";

export const OPEN_ACTION_STATUSES: StatusProximaAcao[] = ["Pendente", "Em andamento", "Reagendada"];
export const CLOSED_OPPORTUNITY_STAGES = ["Ganha", "Perdida", "Cancelada"];
export const STUCK_OPPORTUNITY_DAYS = 30;
export const QUOTE_WITHOUT_RETURN_DAYS = 10;

type ScopeFilters = {
  dataInicial: string;
  dataFinal: string;
  vendedor: string;
  clienteId: string;
  rota: string;
  categoria: string;
};

export type ActionPlanReason =
  | "cliente-sem-acao"
  | "oportunidade-sem-acao"
  | "oportunidade-parada"
  | "orcamento-sem-retorno"
  | "acao-atrasada";

export interface ActionPlanItem {
  id: string;
  reason: ActionPlanReason;
  title: string;
  description: string;
  impactValue: number;
  suggestedType: TipoProximaAcao;
  suggestedDate: string;
  clienteId?: string;
  oportunidadeId?: string;
  orcamentoId?: string;
  acaoId?: string;
  vendedor?: string;
  priority: "alta" | "media" | "baixa";
}

export interface GoalSummary {
  metaTotal: number;
  realizado: number;
  previsto: number;
  previstoPonderado: number;
  gap: number;
  necessarioParaMeta: number;
  atingimento: number;
  atingimentoComPrevisto: number;
  ritmoEsperado: number;
  oportunidadesAbertas: OportunidadeComercial[];
  oportunidadesContribuintes: OportunidadeComercial[];
  clientesSemAcaoImpactantes: Cliente[];
  planoAcao: ActionPlanItem[];
  alertas: Array<{ id: string; title: string; detail: string; severity: "alta" | "media" | "baixa" }>;
}

export function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string | undefined, toIso: string) {
  if (!fromIso) return 0;
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00`);
  const to = new Date(`${toIso}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86400000));
}

export function inDateRange(dateIso: string | undefined, start: string, end: string) {
  if (!dateIso) return false;
  const date = dateIso.slice(0, 10);
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

export function inMonthRange(month: string | undefined, start: string, end: string) {
  if (!month) return false;
  const startMonth = start ? start.slice(0, 7) : "";
  const endMonth = end ? end.slice(0, 7) : "";
  if (startMonth && month < startMonth) return false;
  if (endMonth && month > endMonth) return false;
  return true;
}

export function opportunityAmount(oportunidade: OportunidadeComercial) {
  return oportunidade.valorFinal || oportunidade.valorEstimado || oportunidade.itensEstimados?.reduce((sum, item) => sum + (item.valorTotalItem || 0), 0) || 0;
}

export function probabilityRatio(probability: number | undefined) {
  if (!probability) return 0;
  return probability > 1 ? probability / 100 : probability;
}

export function isOpenOpportunity(oportunidade: OportunidadeComercial) {
  return !CLOSED_OPPORTUNITY_STAGES.includes(oportunidade.etapa);
}

export function monthStart(isoDate = isoToday()) {
  return `${isoDate.slice(0, 7)}-01`;
}

export function commercialRhythm(start: string, end: string, today = isoToday()) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const todayDate = new Date(`${today}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate >= endDate) return 1;
  const cappedToday = new Date(Math.min(Math.max(todayDate.getTime(), startDate.getTime()), endDate.getTime()));
  return Math.min(1, Math.max(0, (cappedToday.getTime() - startDate.getTime() + 86400000) / (endDate.getTime() - startDate.getTime() + 86400000)));
}

function clienteMatches(cliente: Cliente | undefined, filters: ScopeFilters) {
  if (!cliente) return !filters.clienteId && !filters.rota;
  if (filters.clienteId && cliente.id !== filters.clienteId) return false;
  if (filters.rota && cliente.rota !== filters.rota) return false;
  if (filters.vendedor && cliente.vendedor !== filters.vendedor) return false;
  return true;
}

function oportunidadeMatchesCategoria(oportunidade: OportunidadeComercial, categoria: string) {
  if (!categoria) return true;
  return oportunidade.itensEstimados?.some((item) => item.categoria === categoria) ?? false;
}

function orcamentoMatchesCategoria(orcamento: Orcamento, categoria: string) {
  if (!categoria) return true;
  return orcamento.itens?.some((item) => item.categoria === categoria) ?? false;
}

export function calculateSellerGoalRows(params: {
  metasVendedor: MetaVendedor[];
  lancamentos: Lancamento[];
  oportunidades: OportunidadeComercial[];
  clientesById: Map<string, Cliente>;
  filters: ScopeFilters;
}) {
  const { metasVendedor, lancamentos, oportunidades, clientesById, filters } = params;
  return metasVendedor
    .filter((meta) => meta.ativo !== false)
    .filter((meta) => !filters.vendedor || meta.vendedor === filters.vendedor)
    .filter((meta) => inMonthRange(meta.mes || filters.dataInicial.slice(0, 7), filters.dataInicial, filters.dataFinal))
    .map((meta) => {
      const valorMeta = meta.metaManual || meta.meta || meta.metaCalculada || 0;
      const realizado = lancamentos
        .filter((lancamento) => (lancamento.tipo === "Venda" || lancamento.status === "Concluído") && inDateRange(lancamento.data, filters.dataInicial, filters.dataFinal))
        .filter((lancamento) => (lancamento.vendedor || clientesById.get(lancamento.clienteId)?.vendedor) === meta.vendedor)
        .filter((lancamento) => clienteMatches(clientesById.get(lancamento.clienteId), filters))
        .reduce((sum, lancamento) => sum + (lancamento.vendaRs || 0), 0);
      const previstoPonderado = oportunidades
        .filter(isOpenOpportunity)
        .filter((oportunidade) => inDateRange(oportunidade.previsaoFechamento || oportunidade.updatedAt || oportunidade.createdAt, filters.dataInicial, filters.dataFinal))
        .filter((oportunidade) => (oportunidade.vendedor || oportunidade.responsavel || clientesById.get(oportunidade.clienteId)?.vendedor) === meta.vendedor)
        .filter((oportunidade) => clienteMatches(clientesById.get(oportunidade.clienteId), filters) && oportunidadeMatchesCategoria(oportunidade, filters.categoria))
        .reduce((sum, oportunidade) => sum + opportunityAmount(oportunidade) * probabilityRatio(oportunidade.probabilidade), 0);
      return { meta, valorMeta, realizado, previstoPonderado, gap: valorMeta - realizado, atingimento: valorMeta ? realizado / valorMeta : 0 };
    })
    .sort((a, b) => b.gap - a.gap);
}

export function calculateCategoryGoalRows(params: {
  metasCategoria: MetaCategoria[];
  orcamentos: Orcamento[];
  oportunidades: OportunidadeComercial[];
  clientesById: Map<string, Cliente>;
  filters: ScopeFilters;
}) {
  const { metasCategoria, orcamentos, oportunidades, clientesById, filters } = params;
  return metasCategoria
    .filter((meta) => !filters.categoria || meta.categoria === filters.categoria)
    .filter((meta) => inMonthRange(meta.mes, filters.dataInicial, filters.dataFinal))
    .map((meta) => {
      const realizado = orcamentos
        .filter((orcamento) => orcamento.status === "Aprovado" && inDateRange(orcamento.updatedAt || orcamento.data, filters.dataInicial, filters.dataFinal))
        .filter((orcamento) => clienteMatches(clientesById.get(orcamento.clienteId), filters) && orcamentoMatchesCategoria(orcamento, meta.categoria))
        .reduce((sum, orcamento) => sum + orcamento.itens.filter((item) => item.categoria === meta.categoria).reduce((inner, item) => inner + (item.valorTotalItem || 0), 0), 0);
      const previstoPonderado = oportunidades
        .filter(isOpenOpportunity)
        .filter((oportunidade) => inDateRange(oportunidade.previsaoFechamento || oportunidade.updatedAt || oportunidade.createdAt, filters.dataInicial, filters.dataFinal))
        .filter((oportunidade) => clienteMatches(clientesById.get(oportunidade.clienteId), filters))
        .reduce((sum, oportunidade) => sum + (oportunidade.itensEstimados || []).filter((item) => item.categoria === meta.categoria).reduce((inner, item) => inner + (item.valorTotalItem || 0) * probabilityRatio(oportunidade.probabilidade), 0), 0);
      return { meta, realizado, previstoPonderado, gap: meta.meta - realizado, atingimento: meta.meta ? realizado / meta.meta : 0 };
    })
    .sort((a, b) => b.gap - a.gap);
}

export function calculateGoalSummary(params: {
  metasEmpresa: MetaEmpresa[];
  lancamentos: Lancamento[];
  clientes: Cliente[];
  oportunidades: OportunidadeComercial[];
  orcamentos: Orcamento[];
  proximasAcoes: ProximaAcao[];
  filters: ScopeFilters;
  today?: string;
}): GoalSummary {
  const { metasEmpresa, lancamentos, clientes, oportunidades, orcamentos, proximasAcoes, filters } = params;
  const today = params.today || isoToday();
  const clientesById = new Map(clientes.map((cliente) => [cliente.id, cliente]));
  const clientesFiltrados = clientes.filter((cliente) => clienteMatches(cliente, filters) && cliente.statusAtual !== "Inativo");
  const metaTotal = metasEmpresa
    .filter((meta) => inMonthRange(meta.mes, filters.dataInicial, filters.dataFinal))
    .reduce((sum, meta) => sum + (meta.metaTotal || 0), 0);
  const realizado = lancamentos
    .filter((lancamento) => (lancamento.tipo === "Venda" || lancamento.status === "Concluído") && inDateRange(lancamento.data, filters.dataInicial, filters.dataFinal))
    .filter((lancamento) => clienteMatches(clientesById.get(lancamento.clienteId), filters))
    .reduce((sum, lancamento) => sum + (lancamento.vendaRs || 0), 0);
  const oportunidadesAbertas = oportunidades
    .filter(isOpenOpportunity)
    .filter((oportunidade) => inDateRange(oportunidade.previsaoFechamento || oportunidade.updatedAt || oportunidade.createdAt, filters.dataInicial, filters.dataFinal))
    .filter((oportunidade) => clienteMatches(clientesById.get(oportunidade.clienteId), filters) && oportunidadeMatchesCategoria(oportunidade, filters.categoria));
  const previsto = oportunidadesAbertas.reduce((sum, oportunidade) => sum + opportunityAmount(oportunidade), 0);
  const previstoPonderado = oportunidadesAbertas.reduce((sum, oportunidade) => sum + opportunityAmount(oportunidade) * probabilityRatio(oportunidade.probabilidade), 0);
  const gap = metaTotal - realizado;
  const necessarioParaMeta = Math.max(0, gap);
  const clienteTemAcaoFutura = (clienteId: string) => proximasAcoes.some((acao) => acao.clienteId === clienteId && OPEN_ACTION_STATUSES.includes(acao.status) && acao.data >= today);
  const clientesSemAcaoImpactantes = clientesFiltrados
    .filter((cliente) => !clienteTemAcaoFutura(cliente.id))
    .filter((cliente) => cliente.abc === "A" || cliente.prioridade === "P1" || (cliente.potencialTotal || 0) >= 300000)
    .sort((a, b) => (b.potencialTotal || 0) - (a.potencialTotal || 0));
  const oportunidadeTemProximaAcao = (oportunidade: OportunidadeComercial) => Boolean(oportunidade.proximaAcaoId) || proximasAcoes.some((acao) => acao.oportunidadeId === oportunidade.id && OPEN_ACTION_STATUSES.includes(acao.status) && acao.data >= today);
  const oportunidadesSemAcao = oportunidadesAbertas.filter((oportunidade) => !oportunidadeTemProximaAcao(oportunidade));
  const oportunidadesParadas = oportunidadesAbertas.map((oportunidade) => ({ oportunidade, dias: daysBetween(oportunidade.updatedAt || oportunidade.createdAt, today) })).filter((item) => item.dias >= STUCK_OPPORTUNITY_DAYS);
  const orcamentosSemRetorno = orcamentos
    .filter((orcamento) => ["Enviado", "Reenviado", "Em negociação"].includes(orcamento.status))
    .filter((orcamento) => inDateRange(orcamento.dataEnvio || orcamento.updatedAt || orcamento.data, filters.dataInicial, filters.dataFinal))
    .filter((orcamento) => clienteMatches(clientesById.get(orcamento.clienteId), filters) && orcamentoMatchesCategoria(orcamento, filters.categoria))
    .map((orcamento) => ({ orcamento, dias: daysBetween(orcamento.dataEnvio || orcamento.updatedAt || orcamento.data, today) }))
    .filter((item) => item.dias >= QUOTE_WITHOUT_RETURN_DAYS);
  const acoesAtrasadas = proximasAcoes
    .filter((acao) => OPEN_ACTION_STATUSES.includes(acao.status) && acao.data < today)
    .filter((acao) => clienteMatches(clientesById.get(acao.clienteId || ""), filters));

  const planoAcao: ActionPlanItem[] = [
    ...oportunidadesSemAcao.map((oportunidade) => {
      const cliente = clientesById.get(oportunidade.clienteId);
      return {
        id: `opp-sem-acao-${oportunidade.id}`,
        reason: "oportunidade-sem-acao" as const,
        title: `Follow-up da oportunidade: ${oportunidade.clienteNome || cliente?.nome || "cliente"}`,
        description: `${oportunidade.etapa} sem próxima ação registrada.`,
        impactValue: opportunityAmount(oportunidade) * probabilityRatio(oportunidade.probabilidade),
        suggestedType: "Follow-up" as TipoProximaAcao,
        suggestedDate: addDays(today, 1),
        clienteId: oportunidade.clienteId,
        oportunidadeId: oportunidade.id,
        vendedor: oportunidade.vendedor || oportunidade.responsavel || cliente?.vendedor,
        priority: "alta" as const,
      };
    }),
    ...oportunidadesParadas.map(({ oportunidade, dias }) => {
      const cliente = clientesById.get(oportunidade.clienteId);
      return {
        id: `opp-parada-${oportunidade.id}`,
        reason: "oportunidade-parada" as const,
        title: `Destravar oportunidade parada: ${oportunidade.clienteNome || cliente?.nome || "cliente"}`,
        description: `${dias} dias sem atualização no funil.`,
        impactValue: opportunityAmount(oportunidade) * probabilityRatio(oportunidade.probabilidade),
        suggestedType: "Ligação" as TipoProximaAcao,
        suggestedDate: addDays(today, 1),
        clienteId: oportunidade.clienteId,
        oportunidadeId: oportunidade.id,
        vendedor: oportunidade.vendedor || oportunidade.responsavel || cliente?.vendedor,
        priority: "alta" as const,
      };
    }),
    ...orcamentosSemRetorno.map(({ orcamento, dias }) => {
      const cliente = clientesById.get(orcamento.clienteId);
      return {
        id: `orc-sem-retorno-${orcamento.id}`,
        reason: "orcamento-sem-retorno" as const,
        title: `Cobrar retorno do orçamento ${orcamento.codigo}`,
        description: `${dias} dias desde o envio sem retorno registrado.`,
        impactValue: orcamento.valorTotal || 0,
        suggestedType: "Cobrar retorno" as TipoProximaAcao,
        suggestedDate: today,
        clienteId: orcamento.clienteId,
        orcamentoId: orcamento.id,
        vendedor: orcamento.vendedor || cliente?.vendedor,
        priority: "media" as const,
      };
    }),
    ...clientesSemAcaoImpactantes.map((cliente) => ({
      id: `cliente-sem-acao-${cliente.id}`,
      reason: "cliente-sem-acao" as const,
      title: `Agendar contato com ${cliente.nome}`,
      description: `Cliente ${cliente.abc}/${cliente.prioridade} de potencial ${cliente.potencialTotal || 0} sem ação futura.`,
      impactValue: cliente.potencialTotal || 0,
      suggestedType: "Visita" as TipoProximaAcao,
      suggestedDate: addDays(today, 2),
      clienteId: cliente.id,
      vendedor: cliente.vendedor,
      priority: (cliente.abc === "A" || cliente.prioridade === "P1" ? "alta" : "media") as "alta" | "media",
    })),
    ...acoesAtrasadas.map((acao) => {
      const cliente = clientesById.get(acao.clienteId || "");
      return {
        id: `acao-atrasada-${acao.id}`,
        reason: "acao-atrasada" as const,
        title: `Reagendar ação atrasada: ${cliente?.nome || acao.descricao}`,
        description: `${acao.tipo} prevista para ${acao.data}.`,
        impactValue: cliente?.potencialTotal || 0,
        suggestedType: acao.tipo,
        suggestedDate: today,
        clienteId: acao.clienteId,
        acaoId: acao.id,
        vendedor: acao.responsavel || cliente?.vendedor,
        priority: "alta" as const,
      };
    }),
  ]
    .reduce((acc, item) => {
      if (!acc.some((existing) => existing.id === item.id)) acc.push(item);
      return acc;
    }, [] as ActionPlanItem[])
    .sort((a, b) => (b.priority === "alta" ? 1 : 0) - (a.priority === "alta" ? 1 : 0) || b.impactValue - a.impactValue);

  const ritmoEsperado = commercialRhythm(filters.dataInicial, filters.dataFinal, today);
  const alertas: GoalSummary["alertas"] = [];
  if (metaTotal > 0 && realizado / metaTotal + 0.05 < ritmoEsperado) {
    alertas.push({ id: "meta-ritmo", title: "Meta abaixo do ritmo esperado", detail: `Atingimento de ${Math.round((realizado / metaTotal) * 100)}% contra ritmo esperado de ${Math.round(ritmoEsperado * 100)}%.`, severity: "alta" });
  }
  if (metaTotal > 0 && realizado + previstoPonderado < metaTotal) {
    alertas.push({ id: "funil-insuficiente", title: "Funil insuficiente para bater a meta", detail: `Realizado + ponderado ainda deixa ${Math.round(metaTotal - realizado - previstoPonderado).toLocaleString("pt-BR")} em aberto.`, severity: "alta" });
  }
  if (oportunidadesSemAcao.length) alertas.push({ id: "opp-critica", title: "Oportunidade crítica sem próxima ação", detail: `${oportunidadesSemAcao.length} oportunidade(s) abertas precisam de follow-up.`, severity: "media" });
  if (clientesSemAcaoImpactantes.length) alertas.push({ id: "cliente-potencial", title: "Cliente de alto potencial sem visita futura", detail: `${clientesSemAcaoImpactantes.length} cliente(s) prioritário(s) sem ação futura.`, severity: "media" });
  if (orcamentosSemRetorno.length) alertas.push({ id: "orcamento-retorno", title: "Orçamento enviado sem retorno", detail: `${orcamentosSemRetorno.length} orçamento(s) aguardam cobrança de retorno.`, severity: "media" });

  return {
    metaTotal,
    realizado,
    previsto,
    previstoPonderado,
    gap,
    necessarioParaMeta,
    atingimento: metaTotal ? realizado / metaTotal : 0,
    atingimentoComPrevisto: metaTotal ? (realizado + previstoPonderado) / metaTotal : 0,
    ritmoEsperado,
    oportunidadesAbertas,
    oportunidadesContribuintes: oportunidadesAbertas.sort((a, b) => opportunityAmount(b) * probabilityRatio(b.probabilidade) - opportunityAmount(a) * probabilityRatio(a.probabilidade)).slice(0, 12),
    clientesSemAcaoImpactantes,
    planoAcao: planoAcao.slice(0, 20),
    alertas,
  };
}
