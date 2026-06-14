import { useMemo, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";

import { useAppStore } from "@/store/AppStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ReportHeader } from "@/components/reports/ReportHeader";
import { ReportLayout } from "@/components/reports/ReportLayout";
import { ReportSection } from "@/components/reports/ReportSection";
import { ReportSummaryCards } from "@/components/reports/ReportSummaryCards";
import { alertLevel, commissionEstimate, defaultReportFilters, inRange, byMonth, type ReportType } from "@/lib/reportCalculations";
import { fmtBRL, fmtPct } from "@/utils/calculations";
import { controlaEstoqueProduto, estoqueDisponivelProduto } from "@/utils/productStock";
import {
  defaultVisitReportFilters,
  describeVisitReportFilters,
  enrichVisitReports,
  exportSingleVisitReportPdf,
  exportVisitReportsPdf,
  exportVisitReportsXlsx,
  filterVisitReports,
  summarizeVisitReports,
  visitReportPeriodText,
  type NextActionFilter,
  type OpportunityFilter,
} from "@/lib/visitReportExport";
import { formatDateBR } from "@/utils/dateUtils";
import { getCategoriasComerciais } from "@/utils/commercialCategories";
import { recordAuditLog } from "@/lib/audit";
import { canExport } from "@/lib/permissions";
import { useAuth } from "@/store/AuthStore";
import { toast } from "sonner";

const reportLabels: Record<ReportType, string> = {
  geral: "Relatório Geral",
  semanal: "Relatório Semanal",
  mensal: "Relatório Mensal",
  cliente: "Relatório por Cliente",
  funil: "Relatório do Funil de Vendas",
  "metas-comissao": "Relatório de Metas e Comissão",
  "produtos-estoque": "Relatório de Produtos / Estoque",
  visitas: "Relatório de visitas",
};

export default function Relatorios() {
  const store = useAppStore();
  const { role, accessStatus, user, permissions } = useAuth();
  const [filters, setFilters] = useState(defaultReportFilters);
  const [visitFilters, setVisitFilters] = useState(defaultVisitReportFilters);
  const [showReport, setShowReport] = useState(false);
  const [visitFiltersOpen, setVisitFiltersOpen] = useState(true);

  const isVisitReport = filters.reportType === "visitas";
  const negocios = useMemo(() => store.negocios.filter(n => inRange(n.ultimaAtualizacao || n.dataCriacao, filters.dataInicial, filters.dataFinal) && byMonth(n.ultimaAtualizacao || n.dataCriacao, filters.mes) && (!filters.vendedor || n.vendedor === filters.vendedor) && (!filters.status || n.status === filters.status) && (!filters.categoria || n.categoria === filters.categoria) && (!filters.clienteId || n.clienteId === filters.clienteId) && (!filters.rota || store.clienteById(n.clienteId)?.rota === filters.rota)), [store, filters]);
  const lancs = useMemo(() => store.lancamentos.filter(l => inRange(l.data, filters.dataInicial, filters.dataFinal) && byMonth(l.data, filters.mes) && (!filters.vendedor || l.vendedor === filters.vendedor) && (!filters.status || l.status === filters.status) && (!filters.clienteId || l.clienteId === filters.clienteId) && (!filters.rota || store.clienteById(l.clienteId)?.rota === filters.rota)), [store, filters]);

  const enrichedVisits = useMemo(() => enrichVisitReports({ relatoriosVisita: store.relatoriosVisita, clientes: store.clientes, proximasAcoes: store.proximasAcoes, lancamentos: store.lancamentos, oportunidades: store.oportunidades, negocios: store.negocios }), [store.relatoriosVisita, store.clientes, store.proximasAcoes, store.lancamentos, store.oportunidades, store.negocios]);
  const filteredVisits = useMemo(() => filterVisitReports(enrichedVisits, visitFilters), [enrichedVisits, visitFilters]);
  const visitSummary = useMemo(() => summarizeVisitReports(filteredVisits), [filteredVisits]);
  const visitFilterLabels = useMemo(() => describeVisitReportFilters(visitFilters, store.clientes), [visitFilters, store.clientes]);

  const realized = negocios.filter(n => n.status === "Fechado ganho").reduce((s, n) => s + (n.valorFechado || 0), 0);
  const metaTotal = store.metasEmpresa.reduce((s, m) => s + m.metaTotal, 0);
  const pctMeta = metaTotal ? realized / metaTotal : 0;
  const pipeline = negocios.filter(n => !["Fechado ganho", "Fechado perdido"].includes(n.status)).reduce((s, n) => s + n.valorPotencial, 0);

  const summary = isVisitReport ? [
    { label: "Total de visitas", value: String(visitSummary.totalVisitas) },
    { label: "Com oportunidade", value: String(visitSummary.visitasComOportunidade) },
    { label: "Sem oportunidade", value: String(visitSummary.visitasSemOportunidade) },
    { label: "Clientes visitados", value: String(visitSummary.totalClientesVisitados) },
    { label: "Próximas ações", value: String(visitSummary.visitasComProximaAcao) },
  ] : [
    { label: "Realizado empresa", value: fmtBRL(realized) },
    { label: "% empresa", value: fmtPct(pctMeta) },
    { label: "Gap empresa", value: fmtBRL(Math.max(metaTotal - realized, 0)) },
    { label: "Pipeline aberto", value: fmtBRL(pipeline) },
  ];

  const currentClient = store.clienteById(filters.clienteId);
  const periodText = isVisitReport ? visitReportPeriodText(visitFilters) : (filters.mes || `${filters.dataInicial || "início"} até ${filters.dataFinal || "hoje"}`);
  const uniqueCities = Array.from(new Set(enrichedVisits.map((v) => v.cidadeExport).filter(Boolean))).sort();
  const uniqueRoutes = Array.from(new Set(store.clientes.map((c) => c.rota).filter(Boolean))).sort();
  const uniqueResults = Array.from(new Set(store.relatoriosVisita.map((v) => v.resultadoVisita).filter(Boolean))).sort();
  const uniqueActionTypes = Array.from(new Set(store.relatoriosVisita.map((v) => v.tipoAcao).filter(Boolean))).sort();
  const categorias = useMemo(() => getCategoriasComerciais({ produtos: store.produtos, metasCategoria: store.metasCategoria, ticketsMedios: store.ticketsMedios, orcamentos: store.orcamentos, oportunidades: store.oportunidades, negocios: store.negocios }), [store.produtos, store.metasCategoria, store.ticketsMedios, store.orcamentos, store.oportunidades, store.negocios]);
  const canExportReports = canExport("relatorios", { role, accessStatus, email: user?.email, permissions });
  const canExportVisits = filteredVisits.length > 0 && canExportReports;
  const auditExport = (format: string) => recordAuditLog({ action: `exportar_${format}`, resource: "relatorios", entityLabel: reportLabels[filters.reportType], metadata: { filtros: filters, visitas: filteredVisits.length } });
  const guardedPrint = () => { if (!canExportReports) { toast.error("Você não tem permissão para exportar relatórios."); return; } void auditExport("pdf"); window.print(); };

  return <div className="space-y-4">
    <div className="no-print space-y-3 rounded-lg border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select value={filters.reportType} onValueChange={(v: ReportType) => { setFilters((f) => ({ ...f, reportType: v })); setShowReport(false); }}><SelectTrigger><SelectValue placeholder="Tipo de relatório" /></SelectTrigger><SelectContent>{Object.entries(reportLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
        {!isVisitReport && filters.reportType !== "mensal" && <Input type="date" value={filters.dataInicial} onChange={e => setFilters(f => ({ ...f, dataInicial: e.target.value }))} />}
        {!isVisitReport && filters.reportType !== "mensal" && <Input type="date" value={filters.dataFinal} onChange={e => setFilters(f => ({ ...f, dataFinal: e.target.value }))} />}
        {!isVisitReport && filters.reportType === "mensal" && <Input type="month" value={filters.mes} onChange={e => setFilters(f => ({ ...f, mes: e.target.value }))} />}
        {!isVisitReport && ["cliente", "geral", "semanal"].includes(filters.reportType) && <Select value={filters.clienteId || "all"} onValueChange={v => setFilters(f => ({ ...f, clienteId: v === "all" ? "" : v }))}><SelectTrigger><SelectValue placeholder="Cliente" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os clientes</SelectItem>{store.clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select>}
        {!isVisitReport && <Input placeholder="Vendedor" value={filters.vendedor} onChange={e => setFilters(f => ({ ...f, vendedor: e.target.value }))} />}
        {!isVisitReport && <Input placeholder="Rota" value={filters.rota} onChange={e => setFilters(f => ({ ...f, rota: e.target.value }))} />}
        {!isVisitReport && <Select value={filters.categoria || "all"} onValueChange={v => setFilters(f => ({ ...f, categoria: v === "all" ? "" : v }))}><SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as categorias</SelectItem>{categorias.map(categoria => <SelectItem key={categoria} value={categoria}>{categoria}</SelectItem>)}</SelectContent></Select>}
      </div>

      {isVisitReport && <Collapsible open={visitFiltersOpen} onOpenChange={setVisitFiltersOpen} className="rounded-md border bg-background/50 p-3">
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" className="flex w-full justify-between px-0 text-left">
            <span>Filtros do relatório de visitas</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${visitFiltersOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1"><Label>Período inicial</Label><Input type="date" value={visitFilters.dataInicial} onChange={e => setVisitFilters(f => ({ ...f, dataInicial: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Período final</Label><Input type="date" value={visitFilters.dataFinal} onChange={e => setVisitFilters(f => ({ ...f, dataFinal: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Vendedor</Label><Input placeholder="Nome do vendedor" value={visitFilters.vendedor} onChange={e => setVisitFilters(f => ({ ...f, vendedor: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Cliente</Label><Select value={visitFilters.clienteId || "all"} onValueChange={v => setVisitFilters(f => ({ ...f, clienteId: v === "all" ? "" : v }))}><SelectTrigger><SelectValue placeholder="Cliente" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os clientes</SelectItem>{store.clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Cidade</Label><Select value={visitFilters.cidade || "all"} onValueChange={v => setVisitFilters(f => ({ ...f, cidade: v === "all" ? "" : v }))}><SelectTrigger><SelectValue placeholder="Cidade" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as cidades</SelectItem>{uniqueCities.map(cidade => <SelectItem key={cidade} value={cidade}>{cidade}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Rota</Label><Select value={visitFilters.rota || "all"} onValueChange={v => setVisitFilters(f => ({ ...f, rota: v === "all" ? "" : v }))}><SelectTrigger><SelectValue placeholder="Rota" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as rotas</SelectItem>{uniqueRoutes.map(rota => <SelectItem key={rota} value={rota}>{rota}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Resultado da visita</Label><Select value={visitFilters.resultadoVisita || "all"} onValueChange={v => setVisitFilters(f => ({ ...f, resultadoVisita: v === "all" ? "" : v }))}><SelectTrigger><SelectValue placeholder="Resultado" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os resultados</SelectItem>{uniqueResults.map(resultado => <SelectItem key={resultado} value={resultado}>{resultado}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Tipo de ação</Label><Select value={visitFilters.tipoAcao || "all"} onValueChange={v => setVisitFilters(f => ({ ...f, tipoAcao: v === "all" ? "" : v }))}><SelectTrigger><SelectValue placeholder="Tipo de ação" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os tipos</SelectItem>{uniqueActionTypes.map(tipo => <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Oportunidade</Label><Select value={visitFilters.oportunidade} onValueChange={(v: OpportunityFilter) => setVisitFilters(f => ({ ...f, oportunidade: v }))}><SelectTrigger><SelectValue placeholder="Oportunidade" /></SelectTrigger><SelectContent><SelectItem value="todas">Com e sem oportunidade</SelectItem><SelectItem value="com">Somente com oportunidade</SelectItem><SelectItem value="sem">Somente sem oportunidade</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Próxima ação</Label><Select value={visitFilters.proximaAcao} onValueChange={(v: NextActionFilter) => setVisitFilters(f => ({ ...f, proximaAcao: v }))}><SelectTrigger><SelectValue placeholder="Próxima ação" /></SelectTrigger><SelectContent><SelectItem value="todas">Com e sem próxima ação</SelectItem><SelectItem value="com">Somente com próxima ação</SelectItem><SelectItem value="sem">Somente sem próxima ação</SelectItem></SelectContent></Select></div>
          </div>
        </CollapsibleContent>
      </Collapsible>}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setShowReport(true)}>Visualizar relatório</Button>
        {!isVisitReport && <Button variant="secondary" onClick={guardedPrint}>Salvar/Gerar PDF</Button>}
        {isVisitReport && <Button variant="secondary" disabled={!canExportVisits} onClick={() => { void auditExport("pdf"); exportVisitReportsPdf(filteredVisits, visitFilters, store.clientes); }}><FileText className="mr-2 h-4 w-4" />Exportar PDF consolidado</Button>}
        {isVisitReport && <Button variant="outline" disabled={!canExportVisits} onClick={() => { void auditExport("xlsx"); exportVisitReportsXlsx(filteredVisits, visitFilters, store.clientes); }}><FileSpreadsheet className="mr-2 h-4 w-4" />Exportar XLSX</Button>}
        {!isVisitReport && <Button variant="outline" onClick={guardedPrint}>Imprimir</Button>}
        {isVisitReport && <Button variant="outline" onClick={guardedPrint}><Download className="mr-2 h-4 w-4" />Imprimir prévia</Button>}
        <Button variant="ghost" onClick={() => { setFilters(defaultReportFilters); setVisitFilters(defaultVisitReportFilters); setShowReport(false); }}>Limpar filtros</Button>
      </div>
      {isVisitReport && <p className="text-sm text-muted-foreground">{store.relatoriosVisita.length === 0 ? "Nenhum relatório de visita salvo no cache/app store." : `${filteredVisits.length} visita(s) encontrada(s) para os filtros atuais.`} A exportação fica bloqueada quando não há visitas no período selecionado.</p>}
      {!isVisitReport && <p className="text-xs text-muted-foreground">Para salvar como PDF no celular, use a opção Salvar como PDF ou Compartilhar da tela de impressão.</p>}
    </div>

    {showReport && <ReportLayout>
      <ReportHeader title={reportLabels[filters.reportType]} period={periodText} filters={isVisitReport ? visitFilterLabels : [filters.vendedor && `Vendedor: ${filters.vendedor}`, filters.rota && `Rota: ${filters.rota}`, currentClient && `Cliente: ${currentClient.nome}`].filter(Boolean) as string[]} />
      <ReportSummaryCards items={summary} />

      {isVisitReport && <ReportSection title="Relatórios de visita">
        {filteredVisits.length === 0 && <p className="text-sm text-muted-foreground">Nenhum relatório de visita encontrado para o período e filtros selecionados.</p>}
        {filteredVisits.length > 0 && <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border p-3"><h3 className="font-medium">Visitas por vendedor</h3><ul className="mt-2 space-y-1 text-sm">{visitSummary.porVendedor.map(item => <li key={item.label} className="flex justify-between"><span>{item.label}</span><strong>{item.total}</strong></li>)}</ul></div>
            <div className="rounded-md border p-3"><h3 className="font-medium">Visitas por cidade</h3><ul className="mt-2 space-y-1 text-sm">{visitSummary.porCidade.map(item => <li key={item.label} className="flex justify-between"><span>{item.label}</span><strong>{item.total}</strong></li>)}</ul></div>
            <div className="rounded-md border p-3"><h3 className="font-medium">Principais resultados</h3><ul className="mt-2 space-y-1 text-sm">{visitSummary.porResultado.map(item => <li key={item.label} className="flex justify-between gap-3"><span>{item.label}</span><strong>{item.total}</strong></li>)}</ul></div>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead className="hidden md:table-cell">Vendedor</TableHead><TableHead className="hidden lg:table-cell">Resultado</TableHead><TableHead>Oportunidade</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>{filteredVisits.slice(0, 20).map(visit => <TableRow key={visit.id}><TableCell>{formatDateBR(visit.dataVisita)} {visit.horario || ""}</TableCell><TableCell>{visit.clienteNomeExport}<span className="block text-xs text-muted-foreground">{visit.fazenda || visit.cidadeExport || "—"}</span></TableCell><TableCell className="hidden md:table-cell">{visit.vendedorExport || "—"}</TableCell><TableCell className="hidden lg:table-cell">{visit.resultadoVisita || "—"}</TableCell><TableCell>{visit.hasOportunidade ? "Sim" : "Não"}</TableCell><TableCell className="text-right"><Button type="button" size="sm" variant="outline" onClick={() => { void auditExport("pdf_visita"); exportSingleVisitReportPdf(visit); }}><FileText className="mr-2 h-4 w-4" />PDF da visita</Button></TableCell></TableRow>)}</TableBody>
          </Table>
          {filteredVisits.length > 20 && <p className="text-xs text-muted-foreground">Prévia exibindo as 20 primeiras visitas. PDF e XLSX exportam todas as {filteredVisits.length} visitas filtradas.</p>}
        </div>}
      </ReportSection>}

      {!isVisitReport && <ReportSection title="Indicadores principais">
        {negocios.length === 0 && <p>Nenhum dado encontrado para o período selecionado.</p>}
        {negocios.length > 0 && <Table><TableHeader><TableRow><TableHead>Indicador</TableHead><TableHead>Valor</TableHead></TableRow></TableHeader><TableBody>
          <TableRow><TableCell>Negócios ganhos</TableCell><TableCell>{negocios.filter(n => n.status === "Fechado ganho").length}</TableCell></TableRow>
          <TableRow><TableCell>Negócios perdidos</TableCell><TableCell>{negocios.filter(n => n.status === "Fechado perdido").length}</TableCell></TableRow>
          <TableRow><TableCell>Propostas enviadas</TableCell><TableCell>{lancs.filter(l => l.tipo === "Proposta").length}</TableCell></TableRow>
          <TableRow><TableCell>Pendências</TableCell><TableCell>{lancs.filter(l => l.status === "Aberto" || l.status === "Atrasado").length}</TableCell></TableRow>
        </TableBody></Table>}
      </ReportSection>}

      {!isVisitReport && <ReportSection title="Tabelas executivas">
        {filters.reportType === "cliente" && !currentClient && <p>Nenhum cliente selecionado.</p>}
        {filters.reportType === "cliente" && currentClient && <Table><TableBody>
          <TableRow><TableCell>Cliente</TableCell><TableCell>{currentClient.nome}</TableCell></TableRow><TableRow><TableCell>ABC/Prioridade</TableCell><TableCell>{currentClient.abc} / {currentClient.prioridade}</TableCell></TableRow>
          <TableRow><TableCell>Rota/Cidade</TableCell><TableCell>{currentClient.rota} / {currentClient.cidade}</TableCell></TableRow><TableRow><TableCell>Culturas / Área (ha)</TableCell><TableCell>{currentClient.culturas} / {currentClient.areaHa}</TableCell></TableRow>
        </TableBody></Table>}

        {filters.reportType === "funil" && <Table><TableHeader><TableRow><TableHead>Etapa</TableHead><TableHead>Qtd</TableHead><TableHead>Potencial</TableHead></TableRow></TableHeader><TableBody>{[...new Set(negocios.map(n => n.status))].map((s) => {
          const rows = negocios.filter(n => n.status === s);
          return <TableRow key={s}><TableCell>{s}</TableCell><TableCell>{rows.length}</TableCell><TableCell>{fmtBRL(rows.reduce((a, n) => a + n.valorPotencial, 0))}</TableCell></TableRow>;
        })}</TableBody></Table>}

        {filters.reportType === "metas-comissao" && <Table><TableBody>
          <TableRow><TableCell>Meta empresa</TableCell><TableCell>{fmtBRL(metaTotal)}</TableCell></TableRow>
          <TableRow><TableCell>Meta pessoal (total)</TableCell><TableCell>{fmtBRL(store.metasPessoais.reduce((s,m)=>s+m.metaFaturamento,0))}</TableCell></TableRow>
          <TableRow><TableCell>Comissão estimada</TableCell><TableCell>{fmtBRL(commissionEstimate(store.regras, realized, metaTotal, pctMeta))}</TableCell></TableRow>
          <TableRow><TableCell>Alerta visual</TableCell><TableCell>{alertLevel(pctMeta)}</TableCell></TableRow>
        </TableBody></Table>}

        {filters.reportType === "produtos-estoque" && <Table><TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>Controle</TableHead><TableHead>Disponível</TableHead><TableHead>Preço lista</TableHead></TableRow></TableHeader><TableBody>{store.produtos.map((p) => <TableRow key={p.id}><TableCell>{p.nome}</TableCell><TableCell>{controlaEstoqueProduto(p) ? "Com controle" : "Representação"}</TableCell><TableCell>{controlaEstoqueProduto(p) ? estoqueDisponivelProduto(p) : "Não aplicável"}</TableCell><TableCell>{fmtBRL(p.precoLista)}</TableCell></TableRow>)}</TableBody></Table>}

        {["geral", "semanal", "mensal"].includes(filters.reportType) && <p className="text-sm">Visitas realizadas: {lancs.filter(l => l.tipo === "Visita").length} • Lançamentos: {lancs.length} • Eventos lançados: {store.eventos.length}</p>}
      </ReportSection>}

      <footer className="pt-4 text-xs text-muted-foreground">Relatório gerado pelo aplicativo Safra 26/27 — Controle Operacional • {new Date().toLocaleString("pt-BR")}</footer>
    </ReportLayout>}
  </div>;
}
