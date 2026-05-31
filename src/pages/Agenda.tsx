import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Plus, RotateCcw } from "lucide-react";
import { useAppStore } from "@/store/AppStore";
import type { AgendaVisao } from "@/utils/agenda";
import {
  calcularResumoAgenda,
  concluirAcaoAgenda,
  criarAcaoRapidaAgenda,
  filtrarItensAgenda,
  filtrarPorVisaoAgenda,
  montarAlertasAgenda,
  montarItensAgenda,
  reagendarAcaoAgenda,
  vendedoresCanonicosAgenda,
} from "@/utils/agenda";
import type { ABC, Prioridade, StatusProximaAcao, TipoProximaAcao } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TIPOS: TipoProximaAcao[] = ["Visita", "Ligação", "WhatsApp", "Reunião", "Follow-up", "Enviar orçamento", "Cobrar retorno", "Pós-venda", "Renovação", "Outro"];
const STATUS: StatusProximaAcao[] = ["Pendente", "Em andamento", "Realizada", "Reagendada", "Cancelada", "Concluída"];
const ABCS: ABC[] = ["A", "B", "C"];
const PRIORIDADES: Prioridade[] = ["P1", "P2", "P3"];
const VISOES: Array<{ value: AgendaVisao; label: string }> = [
  { value: "hoje", label: "Hoje" },
  { value: "semana", label: "Semana" },
  { value: "atrasadas", label: "Atrasadas" },
  { value: "sem-proxima-acao", label: "Sem próxima ação" },
  { value: "todas", label: "Todas" },
];

export default function Agenda() {
  const { clientes, vendedores, proximasAcoes, setProximasAcoes, oportunidades, orcamentos, negocios } = useAppStore();
  const nav = useNavigate();
  const hoje = new Date().toISOString().slice(0, 10);
  const [visao, setVisao] = useState<AgendaVisao>("hoje");
  const [filtros, setFiltros] = useState({ vendedor: "__all__", data: "", abc: "__all__", prioridade: "__all__", status: "__all__", tipo: "__all__", cliente: "" });
  const [quick, setQuick] = useState({ clienteId: "", tipo: "Visita" as TipoProximaAcao, data: hoje, horario: "", observacao: "" });
  const [reschedule, setReschedule] = useState<Record<string, { data: string; horario: string }>>({});

  const itens = useMemo(() => montarItensAgenda({ clientes, proximasAcoes, oportunidades, orcamentos, negocios, vendedores, hojeIso: hoje }), [clientes, proximasAcoes, oportunidades, orcamentos, negocios, vendedores, hoje]);
  const alertas = useMemo(() => montarAlertasAgenda({ clientes, proximasAcoes, orcamentos, negocios, vendedores, hojeIso: hoje }), [clientes, proximasAcoes, orcamentos, negocios, vendedores, hoje]);
  const resumo = useMemo(() => calcularResumoAgenda(itens), [itens]);
  const vendedoresCanonicos = useMemo(() => vendedoresCanonicosAgenda(clientes, vendedores), [clientes, vendedores]);
  const clientesOrdenados = useMemo(() => [...clientes].sort((a, b) => a.nome.localeCompare(b.nome)), [clientes]);
  const itensFiltrados = useMemo(() => filtrarItensAgenda(filtrarPorVisaoAgenda(itens, visao), filtros), [itens, visao, filtros]);

  const concluir = (acaoId?: string) => {
    if (!acaoId) return;
    setProximasAcoes((atuais) => concluirAcaoAgenda(atuais, acaoId));
  };

  const reagendar = (acaoId?: string) => {
    if (!acaoId) return;
    const dados = reschedule[acaoId];
    if (!dados?.data) return;
    setProximasAcoes((atuais) => reagendarAcaoAgenda(atuais, acaoId, dados.data, dados.horario));
    setReschedule((atual) => ({ ...atual, [acaoId]: { data: "", horario: "" } }));
  };

  const criarRapida = () => {
    const cliente = clientes.find((item) => item.id === quick.clienteId);
    if (!cliente || !quick.data) return;
    const acao = criarAcaoRapidaAgenda({ cliente, tipo: quick.tipo, data: quick.data, horario: quick.horario, observacao: quick.observacao, vendedores });
    setProximasAcoes((atuais) => [acao, ...atuais]);
    setQuick({ clienteId: "", tipo: "Visita", data: hoje, horario: "", observacao: "" });
  };

  const badgeVariant = (classificacao: string) => {
    if (classificacao === "Atrasado") return "destructive" as const;
    if (classificacao === "Hoje") return "default" as const;
    return "outline" as const;
  };

  const contagemVisao = (value: AgendaVisao) => filtrarPorVisaoAgenda(itens, value).length;

  return <div className="space-y-4">
    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agenda comercial</h1>
        <p className="text-sm text-muted-foreground">Rotina diária de visitas, retornos, ações atrasadas e clientes prioritários sem próxima ação.</p>
      </div>
      <Button variant="outline" onClick={() => nav("/proximas-acoes")}>Ver próximas ações</Button>
    </div>

    <div className="grid gap-3 md:grid-cols-4">
      <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4" />Atrasadas</div><div className="text-2xl font-bold">{resumo.atrasadas}</div></Card>
      <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4" />Hoje</div><div className="text-2xl font-bold">{resumo.hoje}</div></Card>
      <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarClock className="h-4 w-4" />Próximos 7 dias</div><div className="text-2xl font-bold">{resumo.proximos7Dias}</div></Card>
      <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4" />A/P1 sem ação</div><div className="text-2xl font-bold">{resumo.clientesAP1SemProximaAcao}</div></Card>
    </div>

    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2 font-semibold"><Plus className="h-4 w-4" />Criar ação rápida</div>
      <div className="grid gap-3 md:grid-cols-5">
        <div className="md:col-span-2"><Label>Cliente</Label><Select value={quick.clienteId || "__none__"} onValueChange={(v) => setQuick((atual) => ({ ...atual, clienteId: v === "__none__" ? "" : v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">Selecione...</SelectItem>{clientesOrdenados.map((cliente) => <SelectItem key={cliente.id} value={cliente.id}>{cliente.nome} • {cliente.localidade || cliente.cidade} • {cliente.vendedor || "Não definido"}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Tipo</Label><Select value={quick.tipo} onValueChange={(v: TipoProximaAcao) => setQuick((atual) => ({ ...atual, tipo: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIPOS.map((tipo) => <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Data</Label><Input type="date" value={quick.data} onChange={(event) => setQuick((atual) => ({ ...atual, data: event.target.value }))} /></div>
        <div><Label>Horário</Label><Input type="time" value={quick.horario} onChange={(event) => setQuick((atual) => ({ ...atual, horario: event.target.value }))} /></div>
        <div className="md:col-span-4"><Label>Observação</Label><Textarea value={quick.observacao} onChange={(event) => setQuick((atual) => ({ ...atual, observacao: event.target.value }))} placeholder="Objetivo, combinado ou contexto da ação" /></div>
        <div className="flex items-end"><Button className="w-full" onClick={criarRapida}>Criar ação</Button></div>
      </div>
    </Card>

    <Card className="p-4">
      <Tabs value={visao} onValueChange={(value) => setVisao(value as AgendaVisao)}>
        <TabsList className="h-auto flex-wrap justify-start">
          {VISOES.map((item) => <TabsTrigger key={item.value} value={item.value}>{item.label} ({contagemVisao(item.value)})</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
        <div><Label>Vendedor</Label><Select value={filtros.vendedor} onValueChange={(v) => setFiltros((atual) => ({ ...atual, vendedor: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">Todos</SelectItem>{vendedoresCanonicos.map((vendedor) => <SelectItem key={vendedor} value={vendedor}>{vendedor}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Data</Label><Input type="date" value={filtros.data} onChange={(event) => setFiltros((atual) => ({ ...atual, data: event.target.value }))} /></div>
        <div><Label>ABC</Label><Select value={filtros.abc} onValueChange={(v) => setFiltros((atual) => ({ ...atual, abc: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">Todos</SelectItem>{ABCS.map((abc) => <SelectItem key={abc} value={abc}>{abc}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Prioridade</Label><Select value={filtros.prioridade} onValueChange={(v) => setFiltros((atual) => ({ ...atual, prioridade: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">Todas</SelectItem>{PRIORIDADES.map((prioridade) => <SelectItem key={prioridade} value={prioridade}>{prioridade}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Status</Label><Select value={filtros.status} onValueChange={(v) => setFiltros((atual) => ({ ...atual, status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">Todos</SelectItem>{[...STATUS, "Atrasado", "Hoje", "Próximos 7 dias", "Sem data"].map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Tipo</Label><Select value={filtros.tipo} onValueChange={(v) => setFiltros((atual) => ({ ...atual, tipo: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">Todos</SelectItem>{[...TIPOS, "Sem próxima ação", "Retorno de orçamento", "Pós-venda", "Próxima etapa"].map((tipo) => <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>)}</SelectContent></Select></div>
        <div className="xl:col-span-2"><Label>Cliente</Label><Input value={filtros.cliente} onChange={(event) => setFiltros((atual) => ({ ...atual, cliente: event.target.value }))} placeholder="Buscar cliente, fazenda ou cidade" /></div>
      </div>
    </Card>

    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Itens da agenda</h2><span className="text-xs text-muted-foreground">{itensFiltrados.length} item(ns)</span></div>
        <div className="space-y-3">
          {itensFiltrados.map((item) => {
            const reprogramacao = reschedule[item.sourceId || ""] || { data: item.data || hoje, horario: item.horario || "" };
            const podeEditarAcao = item.origem === "Próxima ação" && !!item.sourceId;
            return <div key={item.id} className="rounded-xl border bg-card p-3 text-sm">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <button className="font-semibold text-primary hover:underline" onClick={() => item.clienteId && nav(`/clientes/${item.clienteId}`)}>{item.cliente}</button>
                  <div className="text-xs text-muted-foreground">{item.fazenda} • {item.cidade}</div>
                </div>
                <div className="flex flex-wrap gap-2"><Badge variant={badgeVariant(item.classificacao)}>{item.classificacao}</Badge><Badge variant="outline">{item.status}</Badge></div>
              </div>
              <div className="grid gap-1 text-muted-foreground md:grid-cols-2 xl:grid-cols-3">
                <span><b className="text-foreground">Data:</b> {item.data || "Sem data"}{item.horario ? ` às ${item.horario}` : ""}</span>
                <span><b className="text-foreground">Vendedor:</b> {item.vendedor}</span>
                <span><b className="text-foreground">ABC/Prioridade:</b> {item.abc || "—"}/{item.prioridade || "—"}</span>
                <span><b className="text-foreground">Tipo:</b> {item.tipo}</span>
                <span><b className="text-foreground">Origem:</b> {item.origem}</span>
                <span><b className="text-foreground">Vínculos:</b> {[item.oportunidadeId ? `Opp. ${item.oportunidadeNome || item.oportunidadeId}` : "", item.orcamentoId ? `Orç. ${item.orcamentoCodigo || item.orcamentoId}` : "", item.negocioId ? `Neg. ${item.negocioNome || item.negocioId}` : ""].filter(Boolean).join(" • ") || "—"}</span>
                <span className="md:col-span-2 xl:col-span-3"><b className="text-foreground">Descrição:</b> {item.descricao}</span>
              </div>
              {podeEditarAcao && <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
                <Button size="sm" variant="outline" onClick={() => concluir(item.sourceId)}>Concluir ação</Button>
                <div><Label className="text-xs">Nova data</Label><Input className="h-9 w-40" type="date" value={reprogramacao.data} onChange={(event) => setReschedule((atual) => ({ ...atual, [item.sourceId || ""]: { ...reprogramacao, data: event.target.value } }))} /></div>
                <div><Label className="text-xs">Horário</Label><Input className="h-9 w-32" type="time" value={reprogramacao.horario} onChange={(event) => setReschedule((atual) => ({ ...atual, [item.sourceId || ""]: { ...reprogramacao, horario: event.target.value } }))} /></div>
                <Button size="sm" onClick={() => reagendar(item.sourceId)}><RotateCcw className="mr-1 h-3 w-3" />Reagendar</Button>
              </div>}
            </div>;
          })}
          {itensFiltrados.length === 0 && <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum item encontrado para esta visão e filtros.</div>}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Alertas operacionais</h2>
        <div className="space-y-2">
          {alertas.slice(0, 20).map((alerta) => <button key={alerta.id} className="w-full rounded border p-3 text-left text-xs hover:bg-accent" onClick={() => alerta.clienteId && nav(`/clientes/${alerta.clienteId}`)}>
            <div className="flex items-center justify-between gap-2"><b>{alerta.titulo}</b><Badge variant={alerta.severidade === "alta" ? "destructive" : "outline"}>{alerta.severidade}</Badge></div>
            <div className="mt-1 text-muted-foreground">{alerta.detalhe}</div>
          </button>)}
          {alertas.length === 0 && <p className="text-sm text-muted-foreground">Nenhum alerta operacional no momento.</p>}
        </div>
      </Card>
    </div>
  </div>;
}
