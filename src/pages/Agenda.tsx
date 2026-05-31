import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Plus, RotateCcw } from "lucide-react";
import { useAppStore } from "@/store/AppStore";
import type { AgendaVisao } from "@/utils/agenda";
import {
  buscarClientesAgenda,
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
  { value: "semana", label: "Próximos 7 dias" },
  { value: "atrasadas", label: "Atrasados" },
  { value: "sem-agendamento", label: "Sem agendamento" },
  { value: "todas", label: "Todas" },
];

export default function Agenda() {
  const { clientes, vendedores, proximasAcoes, setProximasAcoes, oportunidades, orcamentos, negocios } = useAppStore();
  const nav = useNavigate();
  const hoje = new Date().toISOString().slice(0, 10);
  const [visao, setVisao] = useState<AgendaVisao>("hoje");
  const [filtros, setFiltros] = useState({ vendedor: "__all__", data: "", abc: "__all__", prioridade: "__all__", status: "__all__", tipo: "__all__", cliente: "" });
  const [quick, setQuick] = useState({ clienteId: "", tipo: "Visita" as TipoProximaAcao, descricao: "", data: "", horario: "", observacao: "" });
  const [clienteBusca, setClienteBusca] = useState("");
  const [clienteMenuAberto, setClienteMenuAberto] = useState(false);
  const [reschedule, setReschedule] = useState<Record<string, { data: string; horario: string }>>({});

  const itens = useMemo(() => montarItensAgenda({ clientes, proximasAcoes, oportunidades, orcamentos, negocios, vendedores, hojeIso: hoje }), [clientes, proximasAcoes, oportunidades, orcamentos, negocios, vendedores, hoje]);
  const alertas = useMemo(() => montarAlertasAgenda({ clientes, proximasAcoes, orcamentos, negocios, vendedores, hojeIso: hoje }), [clientes, proximasAcoes, orcamentos, negocios, vendedores, hoje]);
  const resumo = useMemo(() => calcularResumoAgenda(itens, hoje), [itens, hoje]);
  const vendedoresCanonicos = useMemo(() => vendedoresCanonicosAgenda(clientes, vendedores), [clientes, vendedores]);
  const clientesEncontrados = useMemo(() => buscarClientesAgenda(clientes, clienteBusca, vendedores), [clientes, clienteBusca, vendedores]);
  const clienteSelecionado = useMemo(() => clientes.find((cliente) => cliente.id === quick.clienteId), [clientes, quick.clienteId]);
  const vendedorSelecionado = useMemo(() => clienteSelecionado ? buscarClientesAgenda([clienteSelecionado], clienteSelecionado.nome, vendedores, 1)[0]?.vendedor || "Não definido" : "Selecione um cliente", [clienteSelecionado, vendedores]);
  const itensFiltrados = useMemo(() => filtrarItensAgenda(filtrarPorVisaoAgenda(itens, visao, hoje), filtros), [itens, visao, filtros, hoje]);

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
    if (!cliente) return;
    const acao = criarAcaoRapidaAgenda({ cliente, tipo: quick.tipo, data: quick.data, horario: quick.horario, descricao: quick.descricao, observacao: quick.observacao, vendedores });
    setProximasAcoes((atuais) => [acao, ...atuais]);
    setQuick({ clienteId: "", tipo: "Visita", descricao: "", data: "", horario: "", observacao: "" });
    setClienteBusca("");
  };

  const badgeVariant = (classificacao: string) => {
    if (classificacao === "Atrasada") return "destructive" as const;
    if (classificacao === "Pendente hoje") return "default" as const;
    return "outline" as const;
  };

  const contagemVisao = (value: AgendaVisao) => filtrarPorVisaoAgenda(itens, value, hoje).length;
  const termoOperacional = (valor: string) => valor === "Sem próxima ação" ? "Sem ação comercial" : valor;

  return <div className="space-y-4">
    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agenda comercial</h1>
        <p className="text-sm text-muted-foreground">Agenda operacional das ações comerciais com agendamento, status e próxima decisão do fluxo comercial.</p>
      </div>
      <Button variant="outline" onClick={() => nav("/proximas-acoes")}>Ver ações comerciais</Button>
    </div>

    <div className="grid gap-3 md:grid-cols-5">
      <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4" />Atrasadas</div><div className="text-2xl font-bold">{resumo.atrasadas}</div></Card>
      <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4" />Hoje</div><div className="text-2xl font-bold">{resumo.hoje}</div></Card>
      <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarClock className="h-4 w-4" />Próximos 7 dias</div><div className="text-2xl font-bold">{resumo.proximos7Dias}</div></Card>
      <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4" />Sem ação comercial</div><div className="text-2xl font-bold">{resumo.clientesAP1SemProximaAcao}</div></Card>
      <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarClock className="h-4 w-4" />Sem agendamento</div><div className="text-2xl font-bold">{resumo.semAgendamento}</div></Card>
    </div>

    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2 font-semibold"><Plus className="h-4 w-4" />Criar ação comercial rápida</div>
      <div className="grid gap-3 md:grid-cols-6">
        <div className="relative md:col-span-3">
          <Label>1. Selecionar cliente</Label>
          <Input
            value={clienteBusca}
            onFocus={() => setClienteMenuAberto(true)}
            onChange={(event) => {
              setClienteBusca(event.target.value);
              setClienteMenuAberto(true);
              setQuick((atual) => ({ ...atual, clienteId: "" }));
            }}
            placeholder="Digite nome, fazenda ou cidade"
          />
          {clienteMenuAberto && clienteBusca.trim() && <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md">
            {clientesEncontrados.map((cliente) => <button
              key={cliente.id}
              type="button"
              className="w-full rounded-sm px-3 py-2 text-left hover:bg-accent"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setQuick((atual) => ({ ...atual, clienteId: cliente.id }));
                setClienteBusca(cliente.nome);
                setClienteMenuAberto(false);
              }}
            >
              <div className="font-medium">{cliente.nome}</div>
              <div className="text-xs text-muted-foreground">{cliente.fazenda} — {cliente.cidade} — {cliente.vendedor}</div>
            </button>)}
            {clientesEncontrados.length === 0 && <div className="px-3 py-2 text-muted-foreground">Nenhum cliente encontrado. Digite nome, fazenda ou cidade e selecione uma opção válida.</div>}
          </div>}
          {clienteSelecionado && <p className="mt-1 text-xs text-muted-foreground">Cliente selecionado: {clienteSelecionado.nome}</p>}
          {!quick.clienteId && clienteBusca && <p className="mt-1 text-xs text-destructive">Selecione um cliente do menu para evitar cadastro ambíguo.</p>}
        </div>
        <div className="md:col-span-2"><Label>2. Tipo de ação comercial</Label><Select value={quick.tipo} onValueChange={(v: TipoProximaAcao) => setQuick((atual) => ({ ...atual, tipo: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIPOS.map((tipo) => <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>)}</SelectContent></Select></div>
        <div className="md:col-span-3"><Label>3. Descrição/objetivo</Label><Textarea value={quick.descricao} onChange={(event) => setQuick((atual) => ({ ...atual, descricao: event.target.value }))} placeholder="Ex.: Pegar KML das áreas para orçamento" /></div>
        <div><Label>4. Data</Label><Input type="date" value={quick.data} onChange={(event) => setQuick((atual) => ({ ...atual, data: event.target.value }))} /></div>
        <div><Label>5. Horário opcional</Label><Input type="time" value={quick.horario} onChange={(event) => setQuick((atual) => ({ ...atual, horario: event.target.value }))} /></div>
        <div><Label>6. Vendedor herdado</Label><Input value={vendedorSelecionado} readOnly /></div>
        <div className="md:col-span-4"><Label>Observações</Label><Textarea value={quick.observacao} onChange={(event) => setQuick((atual) => ({ ...atual, observacao: event.target.value }))} placeholder="Combinados, contexto e próxima decisão" /></div>
        <div className="flex items-end md:col-span-2"><Button className="w-full" disabled={!quick.clienteId} onClick={criarRapida}>Salvar ação comercial</Button></div>
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
        <div><Label>Status</Label><Select value={filtros.status} onValueChange={(v) => setFiltros((atual) => ({ ...atual, status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">Todos</SelectItem>{[...STATUS, "Atrasada", "Pendente hoje", "Agendada", "Sem agendamento"].map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Tipo</Label><Select value={filtros.tipo} onValueChange={(v) => setFiltros((atual) => ({ ...atual, tipo: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">Todos</SelectItem>{[...TIPOS, "Sem próxima ação", "Retorno de orçamento", "Pós-venda", "Próxima etapa"].map((tipo) => <SelectItem key={tipo} value={tipo}>{termoOperacional(tipo)}</SelectItem>)}</SelectContent></Select></div>
        <div className="xl:col-span-2"><Label>Cliente</Label><Input value={filtros.cliente} onChange={(event) => setFiltros((atual) => ({ ...atual, cliente: event.target.value }))} placeholder="Buscar cliente, fazenda ou cidade" /></div>
      </div>
    </Card>

    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Agenda: ações comerciais por agendamento</h2><span className="text-xs text-muted-foreground">{itensFiltrados.length} item(ns)</span></div>
        <div className="space-y-3">
          {itensFiltrados.map((item) => {
            const reprogramacao = reschedule[item.sourceId || ""] || { data: item.data || hoje, horario: item.horario || "" };
            const podeEditarAcao = item.origem === "Ação comercial" && !!item.sourceId;
            return <div key={item.id} className="rounded-xl border bg-card p-3 text-sm">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <button className="font-semibold text-primary hover:underline" onClick={() => item.clienteId && nav(`/clientes/${item.clienteId}`)}>{item.cliente}</button>
                  <div className="text-xs text-muted-foreground">{item.fazenda} • {item.cidade}</div>
                </div>
                <div className="flex flex-wrap gap-2"><Badge variant={badgeVariant(item.classificacao)}>{item.classificacao}</Badge><Badge variant="outline">{termoOperacional(item.status)}</Badge></div>
              </div>
              <div className="grid gap-1 text-muted-foreground md:grid-cols-2 xl:grid-cols-3">
                <span><b className="text-foreground">Agendamento:</b> {item.data || "Sem agendamento"}{item.horario ? ` às ${item.horario}` : ""}</span>
                <span><b className="text-foreground">Vendedor:</b> {item.vendedor}</span>
                <span><b className="text-foreground">ABC/Prioridade:</b> {item.abc || "—"}/{item.prioridade || "—"}</span>
                <span><b className="text-foreground">Ação comercial:</b> {termoOperacional(item.tipo)}</span>
                <span><b className="text-foreground">Etapa/origem:</b> {item.origem}</span>
                <span><b className="text-foreground">Vínculos:</b> {[item.oportunidadeId ? `Opp. ${item.oportunidadeNome || item.oportunidadeId}` : "", item.orcamentoId ? `Orç. ${item.orcamentoCodigo || item.orcamentoId}` : "", item.negocioId ? `Neg. ${item.negocioNome || item.negocioId}` : ""].filter(Boolean).join(" • ") || "—"}</span>
                <span className="md:col-span-2 xl:col-span-3"><b className="text-foreground">Objetivo comercial:</b> {item.descricao}</span>
              </div>
              {podeEditarAcao && <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
                <Button size="sm" variant="outline" onClick={() => concluir(item.sourceId)}>Concluir ação comercial</Button>
                <div><Label className="text-xs">Novo agendamento</Label><Input className="h-9 w-40" type="date" value={reprogramacao.data} onChange={(event) => setReschedule((atual) => ({ ...atual, [item.sourceId || ""]: { ...reprogramacao, data: event.target.value } }))} /></div>
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
