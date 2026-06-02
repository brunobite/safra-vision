import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { useAppStore } from "@/store/AppStore";
import { fmtBRL, fmtNum, fmtPct } from "@/utils/calculations";
import { AlertTriangle, Award, CalendarDays, ChevronDown, Clock, FileText, Filter, Layers, Percent, TrendingUp, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import type { Cliente, OportunidadeComercial, OrcamentoStatus, StatusProximaAcao } from "@/types";

const ALL = "__all__";
const OPEN_OPPORTUNITY_STAGES = [
  "Oportunidade identificada",
  "Identificada",
  "Qualificação técnica/comercial",
  "Qualificação",
  "Necessidade definida",
  "Orçamento solicitado",
  "Orçamento em elaboração",
  "Orçamento enviado",
  "Negociação",
  "Fechamento encaminhado",
  "Suspensa/Sem timing",
];
const CLOSED_OPPORTUNITY_STAGES = ["Ganha", "Perdida", "Cancelada"];
const ACTION_OPEN_STATUSES: StatusProximaAcao[] = ["Pendente", "Em andamento", "Reagendada"];
const STUCK_DAYS_LIMIT = 30;

const buildDefaultFilters = (hoje: string) => ({
  dataInicial: hoje.slice(0, 7) + "-01",
  dataFinal: hoje,
  vendedor: "",
  clienteId: "",
  rota: "",
  etapa: "",
  statusOportunidade: "",
  statusAcao: "",
});

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromIso: string | undefined, toIso: string) {
  if (!fromIso) return 0;
  const from = new Date(fromIso.slice(0, 10));
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86400000));
}

function dateInPeriod(dateIso: string | undefined, start: string, end: string) {
  if (!dateIso) return false;
  const date = dateIso.slice(0, 10);
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function probabilityToRatio(value: number | undefined) {
  if (!value) return 0;
  return value > 1 ? value / 100 : value;
}

function opportunityValue(oportunidade: OportunidadeComercial) {
  return oportunidade.valorFinal || oportunidade.valorEstimado || 0;
}

function isOpenOpportunity(oportunidade: OportunidadeComercial) {
  return !CLOSED_OPPORTUNITY_STAGES.includes(oportunidade.etapa);
}

function stageTone(etapa: string) {
  if (etapa === "Ganha") return "bg-emerald-100 text-emerald-700";
  if (etapa === "Perdida" || etapa === "Cancelada") return "bg-red-100 text-red-700";
  if (etapa.includes("Orçamento") || etapa === "Negociação") return "bg-amber-100 text-amber-700";
  return "bg-blue-100 text-blue-700";
}

export default function Dashboard() {
  const {
    clientes,
    lancamentos,
    negocios,
    orcamentos,
    oportunidades,
    proximasAcoes,
    relatoriosVisita,
    vendedores,
    clienteById,
  } = useAppStore();
  const nav = useNavigate();
  const hoje = todayIso();
  const defaultFilters = useMemo(() => buildDefaultFilters(hoje), [hoje]);
  const [filters, setFilters] = useState(defaultFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const rotas = useMemo(() => Array.from(new Set(clientes.map((c) => c.rota).filter(Boolean))).sort(), [clientes]);
  const etapas = useMemo(() => Array.from(new Set([...OPEN_OPPORTUNITY_STAGES, ...oportunidades.map((o) => o.etapa)])).sort(), [oportunidades]);
  const statusAcoes = useMemo(() => Array.from(new Set(proximasAcoes.map((a) => a.status))).sort(), [proximasAcoes]);

  const clienteMap = useMemo(() => new Map(clientes.map((cliente) => [cliente.id, cliente])), [clientes]);

  const scoped = useMemo(() => {
    const matchesCliente = (clienteId?: string) => !filters.clienteId || clienteId === filters.clienteId;
    const matchesCarteira = (clienteId?: string, vendedor?: string) => {
      const cliente = clienteId ? clienteMap.get(clienteId) : undefined;
      if (!matchesCliente(clienteId)) return false;
      if (filters.rota && cliente?.rota !== filters.rota) return false;
      if (filters.vendedor && (vendedor || cliente?.vendedor) !== filters.vendedor) return false;
      return true;
    };

    const clientesFiltrados = clientes.filter((cliente) => matchesCarteira(cliente.id, cliente.vendedor));
    const lancamentosFiltrados = lancamentos.filter((lancamento) => dateInPeriod(lancamento.data, filters.dataInicial, filters.dataFinal) && matchesCarteira(lancamento.clienteId, lancamento.vendedor));
    const relatoriosFiltrados = relatoriosVisita.filter((relatorio) => dateInPeriod(relatorio.dataVisita, filters.dataInicial, filters.dataFinal) && matchesCarteira(relatorio.clienteId, relatorio.vendedor));
    const oportunidadesFiltradas = oportunidades.filter((oportunidade) => {
      const dataReferencia = oportunidade.updatedAt || oportunidade.createdAt || oportunidade.previsaoFechamento;
      if (!dateInPeriod(dataReferencia, filters.dataInicial, filters.dataFinal) && !dateInPeriod(oportunidade.previsaoFechamento, filters.dataInicial, filters.dataFinal)) return false;
      if (!matchesCarteira(oportunidade.clienteId, oportunidade.vendedor || oportunidade.responsavel)) return false;
      if (filters.etapa && oportunidade.etapa !== filters.etapa) return false;
      if (filters.statusOportunidade === "aberta" && !isOpenOpportunity(oportunidade)) return false;
      if (filters.statusOportunidade === "ganha" && oportunidade.etapa !== "Ganha") return false;
      if (filters.statusOportunidade === "perdida" && oportunidade.etapa !== "Perdida") return false;
      if (filters.statusOportunidade === "cancelada" && oportunidade.etapa !== "Cancelada") return false;
      return true;
    });
    const orcamentosFiltrados = orcamentos.filter((orcamento) => dateInPeriod(orcamento.updatedAt || orcamento.data, filters.dataInicial, filters.dataFinal) && matchesCarteira(orcamento.clienteId, orcamento.vendedor));
    const negociosFiltrados = negocios.filter((negocio) => dateInPeriod(negocio.ultimaAtualizacao || negocio.dataCriacao || negocio.previsaoFechamento, filters.dataInicial, filters.dataFinal) && matchesCarteira(negocio.clienteId, negocio.vendedor));
    const acoesFiltradas = proximasAcoes.filter((acao) => {
      if (!matchesCarteira(acao.clienteId, acao.responsavel)) return false;
      if (filters.statusAcao && acao.status !== filters.statusAcao) return false;
      return true;
    });

    return { clientesFiltrados, lancamentosFiltrados, relatoriosFiltrados, oportunidadesFiltradas, orcamentosFiltrados, negociosFiltrados, acoesFiltradas };
  }, [clienteMap, clientes, filters, lancamentos, negocios, oportunidades, orcamentos, proximasAcoes, relatoriosVisita]);

  const dashboard = useMemo(() => {
    const clientesAtivos = scoped.clientesFiltrados.filter((cliente) => cliente.statusAtual !== "Inativo");
    const clienteTemAcaoFutura = (cliente: Cliente) =>
      scoped.acoesFiltradas.some((acao) => acao.clienteId === cliente.id && ACTION_OPEN_STATUSES.includes(acao.status) && acao.data >= hoje) || Boolean(cliente.dataProximaAcao && cliente.dataProximaAcao >= hoje);
    const potencialMedio = clientesAtivos.length ? clientesAtivos.reduce((sum, cliente) => sum + (cliente.potencialTotal || 0), 0) / clientesAtivos.length : 0;
    const clientesSemAcaoFutura = clientesAtivos.filter((cliente) => !clienteTemAcaoFutura(cliente));
    const clientesAltoPotencialSemAcao = clientesSemAcaoFutura.filter((cliente) => cliente.abc === "A" || cliente.prioridade === "P1" || (cliente.potencialTotal || 0) >= potencialMedio);
    const acoesAbertas = scoped.acoesFiltradas.filter((acao) => ACTION_OPEN_STATUSES.includes(acao.status));
    const acoesAtrasadas = acoesAbertas.filter((acao) => acao.data < hoje);
    const acoesHoje = acoesAbertas.filter((acao) => acao.data === hoje);
    const visitasConcluidas = scoped.lancamentosFiltrados.filter((lancamento) => lancamento.tipo === "Visita" && lancamento.status === "Concluído");
    const oportunidadesAbertas = scoped.oportunidadesFiltradas.filter(isOpenOpportunity);
    const valorAberto = oportunidadesAbertas.reduce((sum, oportunidade) => sum + opportunityValue(oportunidade), 0);
    const valorPonderado = oportunidadesAbertas.reduce((sum, oportunidade) => sum + opportunityValue(oportunidade) * probabilityToRatio(oportunidade.probabilidade), 0);
    const oportunidadesPorEtapa = Object.values(oportunidadesAbertas.reduce((acc, oportunidade) => {
      acc[oportunidade.etapa] ??= { etapa: oportunidade.etapa, quantidade: 0, valor: 0, ponderado: 0 };
      acc[oportunidade.etapa].quantidade += 1;
      acc[oportunidade.etapa].valor += opportunityValue(oportunidade);
      acc[oportunidade.etapa].ponderado += opportunityValue(oportunidade) * probabilityToRatio(oportunidade.probabilidade);
      return acc;
    }, {} as Record<string, { etapa: string; quantidade: number; valor: number; ponderado: number }>)).sort((a, b) => b.valor - a.valor);
    const oportunidadeTemProximaAcao = (oportunidade: OportunidadeComercial) =>
      Boolean(oportunidade.proximaAcaoId) || scoped.acoesFiltradas.some((acao) => acao.oportunidadeId === oportunidade.id && ACTION_OPEN_STATUSES.includes(acao.status) && acao.data >= hoje);
    const oportunidadesSemProximaAcao = oportunidadesAbertas.filter((oportunidade) => !oportunidadeTemProximaAcao(oportunidade));
    const oportunidadesParadas = oportunidadesAbertas
      .map((oportunidade) => ({ ...oportunidade, diasParada: daysBetween(oportunidade.updatedAt || oportunidade.createdAt, hoje) }))
      .filter((oportunidade) => oportunidade.diasParada >= STUCK_DAYS_LIMIT)
      .sort((a, b) => b.diasParada - a.diasParada);
    const oportunidadesCriticas = [...oportunidadesSemProximaAcao.map((o) => ({ ...o, motivoCritico: "Sem próxima ação" })), ...oportunidadesParadas.map((o) => ({ ...o, motivoCritico: `${o.diasParada} dias parada` }))]
      .reduce((acc, oportunidade) => {
        if (!acc.some((item) => item.id === oportunidade.id)) acc.push(oportunidade);
        return acc;
      }, [] as Array<OportunidadeComercial & { motivoCritico: string; diasParada?: number }>)
      .sort((a, b) => opportunityValue(b) - opportunityValue(a));
    const orcamentosPorStatus = scoped.orcamentosFiltrados.reduce((acc, orcamento) => {
      const status = orcamento.status as OrcamentoStatus;
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<OrcamentoStatus, number>);
    const orcamentoBuckets = {
      abertos: (orcamentosPorStatus.Rascunho || 0) + (orcamentosPorStatus.Aberto || 0) + (orcamentosPorStatus["Em revisão"] || 0),
      enviados: (orcamentosPorStatus.Enviado || 0) + (orcamentosPorStatus.Reenviado || 0) + (orcamentosPorStatus["Em negociação"] || 0),
      aprovados: orcamentosPorStatus.Aprovado || 0,
      perdidos: (orcamentosPorStatus.Perdido || 0) + (orcamentosPorStatus.Recusado || 0) + (orcamentosPorStatus.Vencido || 0) + (orcamentosPorStatus.Reprovado || 0) + (orcamentosPorStatus.Expirado || 0) + (orcamentosPorStatus.Cancelado || 0),
    };
    const negociosGanhos = scoped.negociosFiltrados.filter((negocio) => negocio.status === "Fechado ganho");
    const oportunidadesGanhas = scoped.oportunidadesFiltradas.filter((oportunidade) => oportunidade.etapa === "Ganha");
    const oportunidadesPerdidas = scoped.oportunidadesFiltradas.filter((oportunidade) => oportunidade.etapa === "Perdida");
    const taxaConversao = oportunidadesGanhas.length + oportunidadesPerdidas.length
      ? oportunidadesGanhas.length / (oportunidadesGanhas.length + oportunidadesPerdidas.length)
      : oportunidadesAbertas.length
        ? oportunidadesAbertas.reduce((sum, oportunidade) => sum + probabilityToRatio(oportunidade.probabilidade), 0) / oportunidadesAbertas.length
        : 0;
    const previsaoFechamento = Object.values(oportunidadesAbertas.reduce((acc, oportunidade) => {
      const periodo = oportunidade.previsaoFechamento?.slice(0, 7) || "Sem previsão";
      acc[periodo] ??= { periodo, quantidade: 0, valor: 0, ponderado: 0 };
      acc[periodo].quantidade += 1;
      acc[periodo].valor += opportunityValue(oportunidade);
      acc[periodo].ponderado += opportunityValue(oportunidade) * probabilityToRatio(oportunidade.probabilidade);
      return acc;
    }, {} as Record<string, { periodo: string; quantidade: number; valor: number; ponderado: number }>)).sort((a, b) => a.periodo.localeCompare(b.periodo));
    const rankingVendedor = Object.values(scoped.clientesFiltrados.reduce((acc, cliente) => {
      const vendedor = cliente.vendedor || "Sem vendedor";
      acc[vendedor] ??= { vendedor, clientes: 0, oportunidades: 0, valorAberto: 0, valorPonderado: 0, acoesAtrasadas: 0, negociosGanhos: 0 };
      acc[vendedor].clientes += cliente.statusAtual !== "Inativo" ? 1 : 0;
      return acc;
    }, {} as Record<string, { vendedor: string; clientes: number; oportunidades: number; valorAberto: number; valorPonderado: number; acoesAtrasadas: number; negociosGanhos: number }>));
    const ensureSeller = (vendedor?: string) => {
      const key = vendedor || "Sem vendedor";
      let row = rankingVendedor.find((item) => item.vendedor === key);
      if (!row) {
        row = { vendedor: key, clientes: 0, oportunidades: 0, valorAberto: 0, valorPonderado: 0, acoesAtrasadas: 0, negociosGanhos: 0 };
        rankingVendedor.push(row);
      }
      return row;
    };
    oportunidadesAbertas.forEach((oportunidade) => {
      const row = ensureSeller(oportunidade.vendedor || oportunidade.responsavel || clienteMap.get(oportunidade.clienteId)?.vendedor);
      row.oportunidades += 1;
      row.valorAberto += opportunityValue(oportunidade);
      row.valorPonderado += opportunityValue(oportunidade) * probabilityToRatio(oportunidade.probabilidade);
    });
    acoesAtrasadas.forEach((acao) => ensureSeller(acao.responsavel || clienteMap.get(acao.clienteId || "")?.vendedor).acoesAtrasadas += 1);
    negociosGanhos.forEach((negocio) => ensureSeller(negocio.vendedor || clienteMap.get(negocio.clienteId)?.vendedor).negociosGanhos += 1);
    rankingVendedor.sort((a, b) => b.valorAberto - a.valorAberto || b.clientes - a.clientes);
    const alertas = [
      { id: "acoes-atrasadas", titulo: "Ações atrasadas", valor: acoesAtrasadas.length, detalhe: `${acoesAtrasadas.length} ação(ões) pendente(s) antes de ${hoje}.`, severidade: acoesAtrasadas.length ? "alta" : "baixa" },
      { id: "clientes-sem-acao", titulo: "Clientes sem ação futura", valor: clientesSemAcaoFutura.length, detalhe: `${clientesSemAcaoFutura.length} cliente(s) ativo(s) sem próximo contato registrado.`, severidade: clientesAltoPotencialSemAcao.length ? "alta" : clientesSemAcaoFutura.length ? "media" : "baixa" },
      { id: "opp-sem-acao", titulo: "Oportunidades sem próxima ação", valor: oportunidadesSemProximaAcao.length, detalhe: `${oportunidadesSemProximaAcao.length} oportunidade(s) aberta(s) precisam de follow-up.`, severidade: oportunidadesSemProximaAcao.length ? "media" : "baixa" },
      { id: "opp-paradas", titulo: "Oportunidades paradas", valor: oportunidadesParadas.length, detalhe: `${oportunidadesParadas.length} oportunidade(s) sem atualização há ${STUCK_DAYS_LIMIT}+ dias.`, severidade: oportunidadesParadas.length ? "alta" : "baixa" },
    ];

    return {
      clientesAtivos,
      clientesSemAcaoFutura,
      clientesAltoPotencialSemAcao,
      acoesAtrasadas,
      acoesHoje,
      visitasConcluidas,
      relatoriosPeriodo: scoped.relatoriosFiltrados,
      oportunidadesAbertas,
      valorAberto,
      valorPonderado,
      oportunidadesPorEtapa,
      oportunidadesSemProximaAcao,
      oportunidadesParadas,
      oportunidadesCriticas,
      orcamentoBuckets,
      negociosGanhos,
      taxaConversao,
      previsaoFechamento,
      rankingVendedor,
      alertas,
    };
  }, [clienteMap, hoje, scoped]);

  const activeFiltersCount = useMemo(
    () => (Object.keys(defaultFilters) as Array<keyof typeof defaultFilters>).filter((key) => filters[key] !== defaultFilters[key]).length,
    [defaultFilters, filters]
  );
  const updateFilter = (key: keyof typeof filters, value: string) => setFilters((prev) => ({ ...prev, [key]: value === ALL ? "" : value }));
  const clearFilters = () => setFilters(defaultFilters);

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Painel gestor e indicadores comerciais</h1>
            <p className="text-sm text-muted-foreground">Indicadores calculados em memória a partir do AppStore/cache local. Google Calendar permanece apenas como espelho operacional.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button type="button" variant="outline" onClick={() => nav("/agenda")}>Ver Agenda</Button>
            <Button type="button" variant="outline" onClick={() => nav("/funil")}>Ver Funil</Button>
            <Button type="button" variant="outline" onClick={() => nav("/relatorios")}>Ver Relatórios</Button>
            <Button type="button" variant="outline" onClick={() => nav("/clientes")}>Ver Clientes críticos</Button>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Button
              type="button"
              variant="outline"
              className="justify-start"
              aria-expanded={filtersOpen}
              aria-controls="dashboard-filters-panel"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <Filter className="mr-2 h-4 w-4" />
              Filtros
              {activeFiltersCount > 0 && <Badge className="ml-2" variant="secondary">{activeFiltersCount}</Badge>}
              <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
            </Button>
            {activeFiltersCount > 0 && !filtersOpen && (
              <p className="mt-2 text-xs text-muted-foreground">{activeFiltersCount} filtro(s) ativo(s) no painel.</p>
            )}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters} disabled={activeFiltersCount === 0}>Limpar filtros</Button>
        </div>
        {filtersOpen && (
          <div id="dashboard-filters-panel" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <div><Label className="text-xs">Período inicial</Label><Input type="date" value={filters.dataInicial} onChange={(e) => updateFilter("dataInicial", e.target.value)} /></div>
            <div><Label className="text-xs">Período final</Label><Input type="date" value={filters.dataFinal} onChange={(e) => updateFilter("dataFinal", e.target.value)} /></div>
            <div><Label className="text-xs">Vendedor</Label><Select value={filters.vendedor || ALL} onValueChange={(value) => updateFilter("vendedor", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos</SelectItem>{vendedores.map((vendedor) => <SelectItem key={vendedor.id} value={vendedor.nome}>{vendedor.nome}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Cliente</Label><Select value={filters.clienteId || ALL} onValueChange={(value) => updateFilter("clienteId", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos</SelectItem>{clientes.map((cliente) => <SelectItem key={cliente.id} value={cliente.id}>{cliente.nome}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Rota</Label><Select value={filters.rota || ALL} onValueChange={(value) => updateFilter("rota", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todas</SelectItem>{rotas.map((rota) => <SelectItem key={rota} value={rota}>{rota}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Etapa do funil</Label><Select value={filters.etapa || ALL} onValueChange={(value) => updateFilter("etapa", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todas</SelectItem>{etapas.map((etapa) => <SelectItem key={etapa} value={etapa}>{etapa}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Status oportunidade</Label><Select value={filters.statusOportunidade || ALL} onValueChange={(value) => updateFilter("statusOportunidade", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos</SelectItem><SelectItem value="aberta">Aberta</SelectItem><SelectItem value="ganha">Ganha</SelectItem><SelectItem value="perdida">Perdida</SelectItem><SelectItem value="cancelada">Cancelada</SelectItem></SelectContent></Select></div>
            <div><Label className="text-xs">Status da ação</Label><Select value={filters.statusAcao || ALL} onValueChange={(value) => updateFilter("statusAcao", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos</SelectItem>{statusAcoes.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Clientes ativos" value={fmtNum(dashboard.clientesAtivos.length)} icon={Users} />
        <KpiCard label="Clientes sem ação futura" value={fmtNum(dashboard.clientesSemAcaoFutura.length)} icon={AlertTriangle} tone={dashboard.clientesSemAcaoFutura.length ? "warning" : "success"} />
        <KpiCard label="Alto potencial sem ação" value={fmtNum(dashboard.clientesAltoPotencialSemAcao.length)} icon={Award} tone={dashboard.clientesAltoPotencialSemAcao.length ? "destructive" : "success"} />
        <KpiCard label="Ações atrasadas" value={fmtNum(dashboard.acoesAtrasadas.length)} icon={Clock} tone={dashboard.acoesAtrasadas.length ? "destructive" : "success"} />
        <KpiCard label="Ações hoje" value={fmtNum(dashboard.acoesHoje.length)} icon={CalendarDays} />
        <KpiCard label="Visitas concluídas" value={fmtNum(dashboard.visitasConcluidas.length)} icon={CalendarDays} tone="success" />
        <KpiCard label="Relatórios registrados" value={fmtNum(dashboard.relatoriosPeriodo.length)} icon={FileText} />
        <KpiCard label="Oportunidades abertas" value={fmtNum(dashboard.oportunidadesAbertas.length)} icon={Layers} />
        <KpiCard label="Valor aberto" value={fmtBRL(dashboard.valorAberto)} icon={TrendingUp} />
        <KpiCard label="Valor ponderado" value={fmtBRL(dashboard.valorPonderado)} icon={Percent} />
        <KpiCard label="Oportunidades sem ação" value={fmtNum(dashboard.oportunidadesSemProximaAcao.length)} icon={AlertTriangle} tone={dashboard.oportunidadesSemProximaAcao.length ? "warning" : "success"} />
        <KpiCard label="Paradas 30+ dias" value={fmtNum(dashboard.oportunidadesParadas.length)} icon={Clock} tone={dashboard.oportunidadesParadas.length ? "destructive" : "success"} />
        <KpiCard label="Orç. abertos/enviados" value={`${dashboard.orcamentoBuckets.abertos}/${dashboard.orcamentoBuckets.enviados}`} icon={FileText} />
        <KpiCard label="Orç. aprov./perd." value={`${dashboard.orcamentoBuckets.aprovados}/${dashboard.orcamentoBuckets.perdidos}`} icon={Award} />
        <KpiCard label="Negócios ganhos" value={fmtNum(dashboard.negociosGanhos.length)} icon={Award} tone="success" />
        <KpiCard label="Conversão estimada" value={fmtPct(dashboard.taxaConversao)} icon={Percent} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Alertas operacionais</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {dashboard.alertas.map((alerta) => (
              <div key={alerta.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-2"><b>{alerta.titulo}</b><Badge variant={alerta.severidade === "alta" ? "destructive" : "secondary"}>{alerta.valor}</Badge></div>
                <p className="mt-1 text-xs text-muted-foreground">{alerta.detalhe}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Resumo do funil por etapa</h2>
          <div className="space-y-3">
            {dashboard.oportunidadesPorEtapa.map((etapa) => (
              <div key={etapa.etapa}>
                <div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="font-medium">{etapa.etapa} ({fmtNum(etapa.quantidade)})</span><span>{fmtBRL(etapa.valor)}</span></div>
                <Progress value={dashboard.valorAberto ? Math.min(100, (etapa.valor / dashboard.valorAberto) * 100) : 0} />
                <div className="mt-1 text-[11px] text-muted-foreground">Ponderado: {fmtBRL(etapa.ponderado)}</div>
              </div>
            ))}
            {!dashboard.oportunidadesPorEtapa.length && <p className="text-xs text-muted-foreground">Nenhuma oportunidade aberta no recorte atual.</p>}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Oportunidades críticas</h2>
          <div className="space-y-2">
            {dashboard.oportunidadesCriticas.slice(0, 10).map((oportunidade) => {
              const cliente = clienteById(oportunidade.clienteId);
              return <div key={oportunidade.id} className="rounded-lg border p-3 text-xs"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><button className="text-left font-medium text-primary hover:underline" onClick={() => nav("/funil")}>{oportunidade.clienteNome || cliente?.nome || "Cliente não identificado"}</button><Badge className={stageTone(oportunidade.etapa)}>{oportunidade.motivoCritico}</Badge></div><div className="mt-1 text-muted-foreground">{oportunidade.etapa} • {oportunidade.vendedor || oportunidade.responsavel || cliente?.vendedor || "Sem vendedor"} • {fmtBRL(opportunityValue(oportunidade))}</div></div>;
            })}
            {!dashboard.oportunidadesCriticas.length && <p className="text-xs text-muted-foreground">Nenhuma oportunidade crítica no recorte atual.</p>}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Clientes sem próxima ação</h2>
          <div className="space-y-2">
            {dashboard.clientesSemAcaoFutura.slice(0, 10).map((cliente) => (
              <div key={cliente.id} className="rounded-lg border p-3 text-xs">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><button className="text-left font-medium text-primary hover:underline" onClick={() => nav(`/clientes/${cliente.id}`)}>{cliente.nome}</button><Badge variant={cliente.abc === "A" || cliente.prioridade === "P1" ? "destructive" : "secondary"}>{cliente.abc}/{cliente.prioridade}</Badge></div>
                <div className="mt-1 text-muted-foreground">{cliente.rota || "Sem rota"} • {cliente.vendedor || "Sem vendedor"} • potencial {fmtBRL(cliente.potencialTotal || 0)}</div>
              </div>
            ))}
            {!dashboard.clientesSemAcaoFutura.length && <p className="text-xs text-muted-foreground">Todos os clientes ativos do recorte possuem ação futura.</p>}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Indicadores por vendedor</h2>
          <div className="overflow-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b text-muted-foreground"><tr><th className="py-2">Vendedor</th><th>Clientes</th><th>Opp. abertas</th><th>Valor aberto</th><th>Ponderado</th><th>Ações atrasadas</th><th>Ganhos</th></tr></thead>
              <tbody>{dashboard.rankingVendedor.map((linha) => <tr key={linha.vendedor} className="border-b last:border-0"><td className="py-2 font-medium">{linha.vendedor}</td><td>{fmtNum(linha.clientes)}</td><td>{fmtNum(linha.oportunidades)}</td><td>{fmtBRL(linha.valorAberto)}</td><td>{fmtBRL(linha.valorPonderado)}</td><td>{fmtNum(linha.acoesAtrasadas)}</td><td>{fmtNum(linha.negociosGanhos)}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Previsão de fechamento por período</h2>
          <div className="overflow-auto">
            <table className="mb-4 w-full min-w-[520px] text-left text-xs">
              <thead className="border-b text-muted-foreground"><tr><th className="py-2">Período</th><th>Opp.</th><th>Valor</th><th>Ponderado</th></tr></thead>
              <tbody>{dashboard.previsaoFechamento.map((linha) => <tr key={linha.periodo} className="border-b last:border-0"><td className="py-2 font-medium">{linha.periodo}</td><td>{fmtNum(linha.quantidade)}</td><td>{fmtBRL(linha.valor)}</td><td>{fmtBRL(linha.ponderado)}</td></tr>)}</tbody>
            </table>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dashboard.previsaoFechamento.filter((linha) => linha.periodo !== "Sem previsão")}> <CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="periodo" fontSize={11} /><YAxis fontSize={11} /><Tooltip formatter={(value: number) => fmtBRL(value)} /><Bar dataKey="valor" fill="hsl(200 70% 45%)" radius={[4, 4, 0, 0]} /><Bar dataKey="ponderado" fill="hsl(36 90% 50%)" radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
