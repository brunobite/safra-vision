import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarPlus, ChevronDown, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppStore } from "@/store/AppStore";
import { fmtBRL, fmtNum, fmtPct, statusCor } from "@/utils/calculations";
import { criarAcaoRapidaAgenda } from "@/utils/agenda";
import {
  calculateCategoryGoalRows,
  calculateGoalSummary,
  calculateSellerGoalRows,
  isoToday,
  monthStart,
  opportunityAmount,
  probabilityRatio,
  type ActionPlanItem,
} from "@/utils/commercialGoals";
import { CATEGORIAS_PRODUTO, FRENTES_COMERCIAIS, type FrenteComercial, type MetaCategoria, type MetaEmpresa, type MetaPessoal, type MetaVendedor } from "@/types";

const ALL = "__all__";

type GoalFilters = {
  dataInicial: string;
  dataFinal: string;
  vendedor: string;
  clienteId: string;
  rota: string;
  categoria: string;
};

function StatusBadge({ pct }: { pct: number }) {
  const c = statusCor(pct);
  const cls = c === "success" ? "bg-success/15 text-success border-success/30"
    : c === "warning" ? "bg-warning/15 text-warning border-warning/30"
    : "bg-destructive/15 text-destructive border-destructive/30";
  return <Badge variant="outline" className={cls}>{c === "success" ? "No alvo" : c === "warning" ? "Próximo" : "Atenção"}</Badge>;
}

function priorityVariant(priority: ActionPlanItem["priority"]) {
  return priority === "alta" ? "destructive" : priority === "media" ? "secondary" : "outline";
}

export default function Metas() {
  const {
    metasEmpresa,
    setMetasEmpresa,
    metasPessoais,
    setMetasPessoais,
    metasVendedor,
    setMetasVendedor,
    metasCategoria,
    setMetasCategoria,
    lancamentos,
    clientes,
    vendedores,
    oportunidades,
    orcamentos,
    proximasAcoes,
    setProximasAcoes,
  } = useAppStore();
  const nav = useNavigate();
  const hoje = isoToday();
  const [filters, setFilters] = useState<GoalFilters>({ dataInicial: monthStart(hoje), dataFinal: hoje, vendedor: "", clienteId: "", rota: "", categoria: "" });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const clienteMap = useMemo(() => new Map(clientes.map((cliente) => [cliente.id, cliente])), [clientes]);
  const rotas = useMemo(() => Array.from(new Set(clientes.map((cliente) => cliente.rota).filter(Boolean))).sort(), [clientes]);
  const categorias = useMemo(() => Array.from(new Set([...CATEGORIAS_PRODUTO, ...metasCategoria.map((meta) => meta.categoria), ...orcamentos.flatMap((orcamento) => orcamento.itens.map((item) => item.categoria)), ...oportunidades.flatMap((oportunidade) => oportunidade.itensEstimados?.map((item) => item.categoria || "") || [])].filter(Boolean))).sort(), [metasCategoria, oportunidades, orcamentos]);
  const activeFiltersCount = useMemo(() => Object.entries(filters).filter(([key, value]) => value && !(key === "dataInicial" && value === monthStart(hoje)) && !(key === "dataFinal" && value === hoje)).length, [filters, hoje]);
  const updateFilter = (key: keyof GoalFilters, value: string) => setFilters((prev) => ({ ...prev, [key]: value === ALL ? "" : value }));
  const resetFilters = () => setFilters({ dataInicial: monthStart(hoje), dataFinal: hoje, vendedor: "", clienteId: "", rota: "", categoria: "" });

  const summary = useMemo(() => calculateGoalSummary({ metasEmpresa, lancamentos, clientes, oportunidades, orcamentos, proximasAcoes, filters, today: hoje }), [clientes, filters, hoje, lancamentos, metasEmpresa, oportunidades, orcamentos, proximasAcoes]);
  const sellerRows = useMemo(() => calculateSellerGoalRows({ metasVendedor, lancamentos, oportunidades, clientesById: clienteMap, filters }), [clienteMap, filters, lancamentos, metasVendedor, oportunidades]);
  const categoryRows = useMemo(() => calculateCategoryGoalRows({ metasCategoria, orcamentos, oportunidades, clientesById: clienteMap, filters }), [clienteMap, filters, metasCategoria, oportunidades, orcamentos]);

  const realizadoPorFrente = useMemo(() => {
    const m: Record<string, number> = {};
    lancamentos.forEach((l) => {
      if (l.data < filters.dataInicial || l.data > filters.dataFinal) return;
      m[l.frente] = (m[l.frente] || 0) + (l.vendaRs || 0);
    });
    return m;
  }, [filters.dataFinal, filters.dataInicial, lancamentos]);

  const createActionFromPlan = (item: ActionPlanItem) => {
    const cliente = item.clienteId ? clienteMap.get(item.clienteId) : undefined;
    if (!cliente) return toast.error("Plano sem cliente vinculado para criar ação.");
    const now = new Date().toISOString();
    const acao = {
      ...criarAcaoRapidaAgenda({
        cliente,
        tipo: item.suggestedType,
        data: item.suggestedDate,
        descricao: item.title,
        observacao: item.description,
        vendedor: item.vendedor || cliente.vendedor,
        now,
        id: `pa-meta-${Date.now()}`,
        vendedores,
      }),
      origem: item.orcamentoId ? "Orçamento" : item.oportunidadeId ? "Negócio" : "Cliente",
      oportunidadeId: item.oportunidadeId,
      orcamentoId: item.orcamentoId,
      observacoes: [item.description, `Criada pelo plano de ação da Sprint 30 (${item.reason}).`].join(" "),
      googleCalendarSyncStatus: "not_required" as const,
      googleCalendarStatus: "not_synced" as const,
      updatedAt: now,
    };
    setProximasAcoes((prev) => [acao, ...prev]);
    toast.success("Ação criada na Agenda e Visitas.");
  };

  // Empresa dialog
  const [empOpen, setEmpOpen] = useState(false);
  const [empEdit, setEmpEdit] = useState<MetaEmpresa | null>(null);
  const [empForm, setEmpForm] = useState<Omit<MetaEmpresa, "id">>({ mes: hoje.slice(0, 7), metaTotal: 0, vendaDireta: 0, cooperagro: 0, tritec: 0, observacao: "" });
  const openEmp = (m?: MetaEmpresa) => { setEmpEdit(m || null); setEmpForm(m ? { ...m } : { mes: hoje.slice(0, 7), metaTotal: 0, vendaDireta: 0, cooperagro: 0, tritec: 0, observacao: "" }); setEmpOpen(true); };
  const saveEmp = () => {
    if (!empForm.mes) return toast.error("Informe o mês.");
    if (empEdit) setMetasEmpresa((prev) => prev.map((x) => x.id === empEdit.id ? { ...empForm, id: empEdit.id } : x));
    else setMetasEmpresa((prev) => [...prev, { ...empForm, id: `me-${Date.now()}` }]);
    setEmpOpen(false); toast.success("Meta salva.");
  };

  // Pessoal dialog
  const [pesOpen, setPesOpen] = useState(false);
  const [pesEdit, setPesEdit] = useState<MetaPessoal | null>(null);
  const [pesForm, setPesForm] = useState<Omit<MetaPessoal, "id">>({ frente: "Venda Direta", comissaoAlvo: 0, participacao: 0, percComissao: 0, metaFaturamento: 0, observacao: "" });
  const openPes = (m?: MetaPessoal) => { setPesEdit(m || null); setPesForm(m ? { ...m } : { frente: "Venda Direta", comissaoAlvo: 0, participacao: 0, percComissao: 0, metaFaturamento: 0, observacao: "" }); setPesOpen(true); };
  const savePes = () => {
    if (pesEdit) setMetasPessoais((prev) => prev.map((x) => x.id === pesEdit.id ? { ...pesForm, id: pesEdit.id } : x));
    else setMetasPessoais((prev) => [...prev, { ...pesForm, id: `mp-${Date.now()}` }]);
    setPesOpen(false); toast.success("Meta salva.");
  };

  // Vendedor dialog
  const [sellerOpen, setSellerOpen] = useState(false);
  const [sellerEdit, setSellerEdit] = useState<MetaVendedor | null>(null);
  const [sellerForm, setSellerForm] = useState<Omit<MetaVendedor, "id">>({ vendedor: vendedores[0]?.nome || "", mes: hoje.slice(0, 7), metaManual: 0, ativo: true, origemMeta: "manual", observacao: "" });
  const openSeller = (m?: MetaVendedor) => { setSellerEdit(m || null); setSellerForm(m ? { ...m } : { vendedor: vendedores[0]?.nome || "", mes: hoje.slice(0, 7), metaManual: 0, ativo: true, origemMeta: "manual", observacao: "" }); setSellerOpen(true); };
  const saveSeller = () => {
    if (!sellerForm.vendedor || !sellerForm.mes) return toast.error("Informe vendedor e mês.");
    if (sellerEdit) setMetasVendedor((prev) => prev.map((x) => x.id === sellerEdit.id ? { ...sellerForm, id: sellerEdit.id } : x));
    else setMetasVendedor((prev) => [...prev, { ...sellerForm, id: `mv-${Date.now()}` }]);
    setSellerOpen(false); toast.success("Meta por vendedor salva.");
  };

  // Categoria dialog
  const [catOpen, setCatOpen] = useState(false);
  const [catEdit, setCatEdit] = useState<MetaCategoria | null>(null);
  const [catForm, setCatForm] = useState<Omit<MetaCategoria, "id">>({ categoria: categorias[0] || "Outros", mes: hoje.slice(0, 7), meta: 0 });
  const openCat = (m?: MetaCategoria) => { setCatEdit(m || null); setCatForm(m ? { ...m } : { categoria: categorias[0] || "Outros", mes: hoje.slice(0, 7), meta: 0 }); setCatOpen(true); };
  const saveCat = () => {
    if (!catForm.categoria || !catForm.mes) return toast.error("Informe categoria e mês.");
    if (catEdit) setMetasCategoria((prev) => prev.map((x) => x.id === catEdit.id ? { ...catForm, id: catEdit.id } : x));
    else setMetasCategoria((prev) => [...prev, { ...catForm, id: `mc-${Date.now()}` }]);
    setCatOpen(false); toast.success("Meta por categoria salva.");
  };

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Metas comerciais e plano de ação</h1>
            <p className="text-sm text-muted-foreground">Meta x realizado, previsão de fechamento, gap e ações recomendadas calculados no AppStore/cache local. Google Calendar não é alterado.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => nav("/dashboard")}>Dashboard</Button>
            <Button variant="outline" onClick={() => nav("/agenda")}>Agenda e Visitas</Button>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="outline" className="justify-start" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}>
            <ChevronDown className={`mr-2 h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} /> Filtros de metas
            {activeFiltersCount > 0 && <Badge className="ml-2" variant="secondary">{activeFiltersCount}</Badge>}
          </Button>
          <Button variant="ghost" size="sm" onClick={resetFilters}>Limpar filtros</Button>
        </div>
        {filtersOpen && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div><Label className="text-xs">Período inicial</Label><Input type="date" value={filters.dataInicial} onChange={(e) => updateFilter("dataInicial", e.target.value)} /></div>
            <div><Label className="text-xs">Período final</Label><Input type="date" value={filters.dataFinal} onChange={(e) => updateFilter("dataFinal", e.target.value)} /></div>
            <div><Label className="text-xs">Vendedor</Label><Select value={filters.vendedor || ALL} onValueChange={(value) => updateFilter("vendedor", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos</SelectItem>{vendedores.map((vendedor) => <SelectItem key={vendedor.id} value={vendedor.nome}>{vendedor.nome}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Cliente</Label><Select value={filters.clienteId || ALL} onValueChange={(value) => updateFilter("clienteId", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos</SelectItem>{clientes.map((cliente) => <SelectItem key={cliente.id} value={cliente.id}>{cliente.nome}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Rota</Label><Select value={filters.rota || ALL} onValueChange={(value) => updateFilter("rota", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todas</SelectItem>{rotas.map((rota) => <SelectItem key={rota} value={rota}>{rota}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Categoria</Label><Select value={filters.categoria || ALL} onValueChange={(value) => updateFilter("categoria", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todas</SelectItem>{categorias.map((categoria) => <SelectItem key={categoria} value={categoria}>{categoria}</SelectItem>)}</SelectContent></Select></div>
          </div>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Meta total</div><div className="text-2xl font-semibold">{fmtBRL(summary.metaTotal)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Realizado</div><div className="text-2xl font-semibold">{fmtBRL(summary.realizado)}</div><Progress className="mt-2" value={Math.min(100, summary.atingimento * 100)} /></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Gap até a meta</div><div className={summary.gap > 0 ? "text-2xl font-semibold text-destructive" : "text-2xl font-semibold text-success"}>{fmtBRL(summary.gap)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Necessário para bater</div><div className="text-2xl font-semibold">{fmtBRL(summary.necessarioParaMeta)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Previsão ponderada</div><div className="text-2xl font-semibold">{fmtBRL(summary.previstoPonderado)}</div><div className="text-xs text-muted-foreground">Aberto: {fmtBRL(summary.previsto)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Ating. com previsão</div><div className="text-2xl font-semibold">{fmtPct(summary.atingimentoComPrevisto)}</div><Progress className="mt-2" value={Math.min(100, summary.atingimentoComPrevisto * 100)} /></Card>
      </div>

      <Tabs defaultValue="gestao" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="gestao">Gestão ativa</TabsTrigger>
          <TabsTrigger value="empresa">Empresa</TabsTrigger>
          <TabsTrigger value="vendedor">Vendedor</TabsTrigger>
          <TabsTrigger value="categoria">Categoria/produto</TabsTrigger>
          <TabsTrigger value="pessoal">Metas pessoais</TabsTrigger>
        </TabsList>

        <TabsContent value="gestao" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-warning" /> Alertas de gestão</h2>
              <div className="space-y-2">
                {summary.alertas.map((alerta) => <div key={alerta.id} className="rounded-lg border p-3 text-sm"><div className="flex items-center justify-between gap-2"><b>{alerta.title}</b><Badge variant={alerta.severity === "alta" ? "destructive" : "secondary"}>{alerta.severity}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{alerta.detail}</p></div>)}
                {!summary.alertas.length && <p className="text-sm text-muted-foreground">Nenhum alerta crítico no recorte atual.</p>}
              </div>
            </Card>
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Oportunidades que contribuem para a meta</h2>
              <div className="space-y-2">
                {summary.oportunidadesContribuintes.slice(0, 8).map((oportunidade) => {
                  const cliente = clienteMap.get(oportunidade.clienteId);
                  return <div key={oportunidade.id} className="rounded-lg border p-3 text-xs"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><b>{oportunidade.clienteNome || cliente?.nome || "Cliente"}</b><Badge variant="secondary">{oportunidade.etapa}</Badge></div><div className="mt-1 text-muted-foreground">{fmtBRL(opportunityAmount(oportunidade))} • ponderado {fmtBRL(opportunityAmount(oportunidade) * probabilityRatio(oportunidade.probabilidade))} • {oportunidade.previsaoFechamento || "sem previsão"}</div></div>;
                })}
                {!summary.oportunidadesContribuintes.length && <p className="text-sm text-muted-foreground">Nenhuma oportunidade aberta contribuindo no período filtrado.</p>}
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-primary" /> Plano de ação recomendado</h2>
            <div className="space-y-2">
              {summary.planoAcao.map((item) => (
                <div key={item.id} className="rounded-xl border p-3 text-sm">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><b>{item.title}</b><Badge variant={priorityVariant(item.priority)}>{item.priority}</Badge><Badge variant="outline">impacto {fmtBRL(item.impactValue)}</Badge></div>
                      <p className="mt-1 text-xs text-muted-foreground">{item.description} • Sugestão: {item.suggestedType} em {item.suggestedDate}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => createActionFromPlan(item)}><CalendarPlus className="mr-1 h-4 w-4" /> Criar {item.suggestedType}</Button>
                    </div>
                  </div>
                </div>
              ))}
              {!summary.planoAcao.length && <p className="text-sm text-muted-foreground">Nenhuma recomendação pendente no recorte atual.</p>}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="empresa" className="space-y-4">
          <div className="flex justify-end"><Button onClick={() => openEmp()}><Plus className="mr-1 h-4 w-4" /> Nova meta mensal</Button></div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {[...metasEmpresa].filter((m) => m.mes >= filters.dataInicial.slice(0, 7) && m.mes <= filters.dataFinal.slice(0, 7)).sort((a, b) => a.mes.localeCompare(b.mes)).map((m) => {
              const real = lancamentos.filter((l) => l.data.slice(0, 7) === m.mes).reduce((sum, l) => sum + (l.vendaRs || 0), 0);
              const pct = m.metaTotal ? real / m.metaTotal : 0;
              return <Card key={m.id} className="p-4"><div className="mb-2 flex items-center justify-between"><div><p className="text-xs uppercase text-muted-foreground">Mês</p><p className="text-lg font-semibold">{m.mes}</p></div><div className="flex gap-1"><StatusBadge pct={pct} /><Button size="icon" variant="ghost" onClick={() => openEmp(m)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" onClick={() => setMetasEmpresa((prev) => prev.filter((x) => x.id !== m.id))}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div></div><div className="space-y-1 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Meta</span><span>{fmtBRL(m.metaTotal)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Realizado</span><span>{fmtBRL(real)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Gap</span><span>{fmtBRL(m.metaTotal - real)}</span></div><Progress value={Math.min(pct * 100, 100)} /></div></Card>;
            })}
          </div>
        </TabsContent>

        <TabsContent value="vendedor" className="space-y-4">
          <div className="flex justify-end"><Button onClick={() => openSeller()}><Plus className="mr-1 h-4 w-4" /> Nova meta por vendedor</Button></div>
          <div className="overflow-auto rounded-xl border bg-card">
            <table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b text-xs text-muted-foreground"><tr><th className="p-3">Vendedor</th><th>Mês</th><th>Meta</th><th>Realizado</th><th>Ponderado</th><th>Gap</th><th>%</th><th>Ações</th></tr></thead><tbody>{sellerRows.map((row) => <tr key={row.meta.id} className="border-b last:border-0"><td className="p-3 font-medium">{row.meta.vendedor}</td><td>{row.meta.mes || "—"}</td><td>{fmtBRL(row.valorMeta)}</td><td>{fmtBRL(row.realizado)}</td><td>{fmtBRL(row.previstoPonderado)}</td><td>{fmtBRL(row.gap)}</td><td>{fmtPct(row.atingimento)}</td><td><Button size="sm" variant="ghost" onClick={() => openSeller(row.meta)}>Editar</Button></td></tr>)}</tbody></table>
          </div>
        </TabsContent>

        <TabsContent value="categoria" className="space-y-4">
          <div className="flex justify-end"><Button onClick={() => openCat()}><Plus className="mr-1 h-4 w-4" /> Nova meta por categoria</Button></div>
          <div className="overflow-auto rounded-xl border bg-card">
            <table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b text-xs text-muted-foreground"><tr><th className="p-3">Categoria</th><th>Mês</th><th>Meta</th><th>Realizado</th><th>Ponderado</th><th>Gap</th><th>%</th><th>Ações</th></tr></thead><tbody>{categoryRows.map((row) => <tr key={row.meta.id} className="border-b last:border-0"><td className="p-3 font-medium">{row.meta.categoria}</td><td>{row.meta.mes}</td><td>{fmtBRL(row.meta.meta)}</td><td>{fmtBRL(row.realizado)}</td><td>{fmtBRL(row.previstoPonderado)}</td><td>{fmtBRL(row.gap)}</td><td>{fmtPct(row.atingimento)}</td><td><Button size="sm" variant="ghost" onClick={() => openCat(row.meta)}>Editar</Button></td></tr>)}</tbody></table>
          </div>
        </TabsContent>

        <TabsContent value="pessoal" className="space-y-4">
          <div className="flex justify-end"><Button onClick={() => openPes()}><Plus className="mr-1 h-4 w-4" /> Nova meta por frente</Button></div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {metasPessoais.map((m) => {
              const real = realizadoPorFrente[m.frente] || 0;
              const pct = m.metaFaturamento ? real / m.metaFaturamento : 0;
              return <Card key={m.id} className="p-4"><div className="mb-2 flex items-center justify-between"><div><p className="text-xs uppercase text-muted-foreground">Frente</p><p className="text-lg font-semibold">{m.frente}</p></div><div className="flex gap-1"><StatusBadge pct={pct} /><Button size="icon" variant="ghost" onClick={() => openPes(m)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" onClick={() => setMetasPessoais((prev) => prev.filter((x) => x.id !== m.id))}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div></div><div className="space-y-1 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Meta faturamento</span><span>{fmtBRL(m.metaFaturamento)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Realizado</span><span>{fmtBRL(real)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Gap</span><span>{fmtBRL(m.metaFaturamento - real)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Comissão estimada</span><span>{fmtBRL(real * (m.percComissao / 100))}</span></div><Progress value={Math.min(pct * 100, 100)} /></div></Card>;
            })}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={empOpen} onOpenChange={setEmpOpen}><DialogContent><DialogHeader><DialogTitle>{empEdit ? "Editar meta" : "Nova meta mensal"}</DialogTitle></DialogHeader><div className="grid gap-3"><div><Label>Mês</Label><Input type="month" value={empForm.mes} onChange={(e) => setEmpForm({ ...empForm, mes: e.target.value })} /></div><div><Label>Meta total</Label><Input type="number" value={empForm.metaTotal} onChange={(e) => setEmpForm({ ...empForm, metaTotal: +e.target.value })} /></div><div className="grid grid-cols-3 gap-2"><div><Label>Venda Direta</Label><Input type="number" value={empForm.vendaDireta} onChange={(e) => setEmpForm({ ...empForm, vendaDireta: +e.target.value })} /></div><div><Label>Cooperagro</Label><Input type="number" value={empForm.cooperagro} onChange={(e) => setEmpForm({ ...empForm, cooperagro: +e.target.value })} /></div><div><Label>Tritec</Label><Input type="number" value={empForm.tritec} onChange={(e) => setEmpForm({ ...empForm, tritec: +e.target.value })} /></div></div><div><Label>Observação</Label><Input value={empForm.observacao || ""} onChange={(e) => setEmpForm({ ...empForm, observacao: e.target.value })} /></div></div><DialogFooter><Button onClick={saveEmp}>Salvar</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={pesOpen} onOpenChange={setPesOpen}><DialogContent><DialogHeader><DialogTitle>{pesEdit ? "Editar meta" : "Nova meta por frente"}</DialogTitle></DialogHeader><div className="grid gap-3"><div><Label>Frente</Label><Select value={pesForm.frente} onValueChange={(v: FrenteComercial) => setPesForm({ ...pesForm, frente: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{FRENTES_COMERCIAIS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent></Select></div><div className="grid grid-cols-2 gap-2"><div><Label>Meta faturamento</Label><Input type="number" value={pesForm.metaFaturamento} onChange={(e) => setPesForm({ ...pesForm, metaFaturamento: +e.target.value })} /></div><div><Label>Comissão alvo</Label><Input type="number" value={pesForm.comissaoAlvo} onChange={(e) => setPesForm({ ...pesForm, comissaoAlvo: +e.target.value })} /></div><div><Label>Participação (%)</Label><Input type="number" value={pesForm.participacao} onChange={(e) => setPesForm({ ...pesForm, participacao: +e.target.value })} /></div><div><Label>% Comissão</Label><Input type="number" value={pesForm.percComissao} onChange={(e) => setPesForm({ ...pesForm, percComissao: +e.target.value })} /></div></div></div><DialogFooter><Button onClick={savePes}>Salvar</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={sellerOpen} onOpenChange={setSellerOpen}><DialogContent><DialogHeader><DialogTitle>{sellerEdit ? "Editar meta por vendedor" : "Nova meta por vendedor"}</DialogTitle></DialogHeader><div className="grid gap-3"><div><Label>Vendedor</Label><Select value={sellerForm.vendedor || ALL} onValueChange={(v) => setSellerForm({ ...sellerForm, vendedor: v === ALL ? "" : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Selecione</SelectItem>{vendedores.map((v) => <SelectItem key={v.id} value={v.nome}>{v.nome}</SelectItem>)}</SelectContent></Select></div><div><Label>Mês</Label><Input type="month" value={sellerForm.mes || ""} onChange={(e) => setSellerForm({ ...sellerForm, mes: e.target.value })} /></div><div><Label>Meta faturamento</Label><Input type="number" value={sellerForm.metaManual || sellerForm.meta || 0} onChange={(e) => setSellerForm({ ...sellerForm, metaManual: +e.target.value, origemMeta: "manual" })} /></div><div><Label>Observação</Label><Input value={sellerForm.observacao || ""} onChange={(e) => setSellerForm({ ...sellerForm, observacao: e.target.value })} /></div></div><DialogFooter><Button onClick={saveSeller}>Salvar</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={catOpen} onOpenChange={setCatOpen}><DialogContent><DialogHeader><DialogTitle>{catEdit ? "Editar meta por categoria" : "Nova meta por categoria"}</DialogTitle></DialogHeader><div className="grid gap-3"><div><Label>Categoria</Label><Select value={catForm.categoria} onValueChange={(categoria) => setCatForm({ ...catForm, categoria })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categorias.map((categoria) => <SelectItem key={categoria} value={categoria}>{categoria}</SelectItem>)}</SelectContent></Select></div><div><Label>Mês</Label><Input type="month" value={catForm.mes} onChange={(e) => setCatForm({ ...catForm, mes: e.target.value })} /></div><div><Label>Meta</Label><Input type="number" value={catForm.meta} onChange={(e) => setCatForm({ ...catForm, meta: +e.target.value })} /></div></div><DialogFooter><Button onClick={saveCat}>Salvar</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
