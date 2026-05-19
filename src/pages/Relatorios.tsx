import { useMemo, useState } from "react";
import { useAppStore } from "@/store/AppStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportHeader } from "@/components/reports/ReportHeader";
import { ReportLayout } from "@/components/reports/ReportLayout";
import { ReportSection } from "@/components/reports/ReportSection";
import { ReportSummaryCards } from "@/components/reports/ReportSummaryCards";
import { alertLevel, commissionEstimate, defaultReportFilters, inRange, byMonth, type ReportType } from "@/lib/reportCalculations";
import { fmtBRL, fmtPct } from "@/utils/calculations";

const reportLabels: Record<ReportType, string> = { geral: "Relatório Geral", semanal: "Relatório Semanal", mensal: "Relatório Mensal", cliente: "Relatório por Cliente", funil: "Relatório do Funil de Vendas", "metas-comissao": "Relatório de Metas e Comissão", "produtos-estoque": "Relatório de Produtos / Estoque" };

export default function Relatorios() {
  const store = useAppStore();
  const [filters, setFilters] = useState(defaultReportFilters);
  const [showReport, setShowReport] = useState(false);

  const negocios = useMemo(() => store.negocios.filter(n => inRange(n.ultimaAtualizacao || n.dataCriacao, filters.dataInicial, filters.dataFinal) && byMonth(n.ultimaAtualizacao || n.dataCriacao, filters.mes) && (!filters.vendedor || n.vendedor === filters.vendedor) && (!filters.status || n.status === filters.status) && (!filters.categoria || n.categoria === filters.categoria) && (!filters.clienteId || n.clienteId === filters.clienteId) && (!filters.rota || store.clienteById(n.clienteId)?.rota === filters.rota)), [store, filters]);
  const lancs = useMemo(() => store.lancamentos.filter(l => inRange(l.data, filters.dataInicial, filters.dataFinal) && byMonth(l.data, filters.mes) && (!filters.vendedor || l.vendedor === filters.vendedor) && (!filters.status || l.status === filters.status) && (!filters.clienteId || l.clienteId === filters.clienteId) && (!filters.rota || store.clienteById(l.clienteId)?.rota === filters.rota)), [store, filters]);

  const realized = negocios.filter(n => n.status === "Fechado ganho").reduce((s, n) => s + (n.valorFechado || 0), 0);
  const metaTotal = store.metasEmpresa.reduce((s, m) => s + m.metaTotal, 0);
  const pctMeta = metaTotal ? realized / metaTotal : 0;
  const pipeline = negocios.filter(n => !["Fechado ganho", "Fechado perdido"].includes(n.status)).reduce((s, n) => s + n.valorPotencial, 0);

  const summary = [
    { label: "Realizado empresa", value: fmtBRL(realized) },
    { label: "% empresa", value: fmtPct(pctMeta) },
    { label: "Gap empresa", value: fmtBRL(Math.max(metaTotal - realized, 0)) },
    { label: "Pipeline aberto", value: fmtBRL(pipeline) },
  ];

  const currentClient = store.clienteById(filters.clienteId);
  const periodText = filters.mes || `${filters.dataInicial || "início"} até ${filters.dataFinal || "hoje"}`;

  return <div className="space-y-4">
    <div className="no-print grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
      <Select value={filters.reportType} onValueChange={(v: ReportType) => setFilters((f) => ({ ...f, reportType: v }))}><SelectTrigger><SelectValue placeholder="Tipo de relatório" /></SelectTrigger><SelectContent>{Object.entries(reportLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
      {filters.reportType !== "mensal" && <Input type="date" value={filters.dataInicial} onChange={e => setFilters(f => ({ ...f, dataInicial: e.target.value }))} />}
      {filters.reportType !== "mensal" && <Input type="date" value={filters.dataFinal} onChange={e => setFilters(f => ({ ...f, dataFinal: e.target.value }))} />}
      {filters.reportType === "mensal" && <Input type="month" value={filters.mes} onChange={e => setFilters(f => ({ ...f, mes: e.target.value }))} />}
      {["cliente", "geral", "semanal"].includes(filters.reportType) && <Select value={filters.clienteId || "all"} onValueChange={v => setFilters(f => ({ ...f, clienteId: v === "all" ? "" : v }))}><SelectTrigger><SelectValue placeholder="Cliente" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os clientes</SelectItem>{store.clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select>}
      <Input placeholder="Vendedor" value={filters.vendedor} onChange={e => setFilters(f => ({ ...f, vendedor: e.target.value }))} />
      <Input placeholder="Rota" value={filters.rota} onChange={e => setFilters(f => ({ ...f, rota: e.target.value }))} />
      <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
        <Button onClick={() => setShowReport(true)}>Visualizar relatório</Button>
        <Button variant="secondary" onClick={() => window.print()}>Salvar/Gerar PDF</Button>
        <Button variant="outline" onClick={() => window.print()}>Imprimir</Button>
        <Button variant="ghost" onClick={() => { setFilters(defaultReportFilters); setShowReport(false); }}>Limpar filtros</Button>
      </div>
      <p className="sm:col-span-2 lg:col-span-4 text-xs text-muted-foreground">Para salvar como PDF no celular, use a opção Salvar como PDF ou Compartilhar da tela de impressão.</p>
    </div>

    {showReport && <ReportLayout>
      <ReportHeader title={reportLabels[filters.reportType]} period={periodText} filters={[filters.vendedor && `Vendedor: ${filters.vendedor}`, filters.rota && `Rota: ${filters.rota}`, currentClient && `Cliente: ${currentClient.nome}`].filter(Boolean) as string[]} />
      <ReportSummaryCards items={summary} />

      <ReportSection title="Indicadores principais">
        {negocios.length === 0 && <p>Nenhum dado encontrado para o período selecionado.</p>}
        {negocios.length > 0 && <Table><TableHeader><TableRow><TableHead>Indicador</TableHead><TableHead>Valor</TableHead></TableRow></TableHeader><TableBody>
          <TableRow><TableCell>Negócios ganhos</TableCell><TableCell>{negocios.filter(n => n.status === "Fechado ganho").length}</TableCell></TableRow>
          <TableRow><TableCell>Negócios perdidos</TableCell><TableCell>{negocios.filter(n => n.status === "Fechado perdido").length}</TableCell></TableRow>
          <TableRow><TableCell>Propostas enviadas</TableCell><TableCell>{lancs.filter(l => l.tipo === "Proposta").length}</TableCell></TableRow>
          <TableRow><TableCell>Pendências</TableCell><TableCell>{lancs.filter(l => l.status === "Aberto" || l.status === "Atrasado").length}</TableCell></TableRow>
        </TableBody></Table>}
      </ReportSection>

      <ReportSection title="Tabelas executivas">
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

        {filters.reportType === "produtos-estoque" && <Table><TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>Disponível</TableHead><TableHead>Preço lista</TableHead></TableRow></TableHeader><TableBody>{store.produtos.map((p) => <TableRow key={p.id}><TableCell>{p.nome}</TableCell><TableCell>{p.estoqueAtual - p.estoqueReservado}</TableCell><TableCell>{fmtBRL(p.precoLista)}</TableCell></TableRow>)}</TableBody></Table>}

        {["geral", "semanal", "mensal"].includes(filters.reportType) && <p className="text-sm">Visitas realizadas: {lancs.filter(l => l.tipo === "Visita").length} • Lançamentos: {lancs.length} • Eventos lançados: {store.eventos.length}</p>}
      </ReportSection>

      <footer className="pt-4 text-xs text-muted-foreground">Relatório gerado pelo aplicativo Safra 26/27 — Controle Operacional • {new Date().toLocaleString("pt-BR")}</footer>
    </ReportLayout>}
  </div>;
}
