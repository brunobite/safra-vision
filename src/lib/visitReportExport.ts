import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

import { Cliente, Lancamento, Negocio, OportunidadeComercial, ProximaAcao, RelatorioVisita } from "@/types";
import { formatDateBR } from "@/utils/dateUtils";
import { formatDateTimeStamp } from "@/lib/exportService";

export type OpportunityFilter = "todas" | "com" | "sem";
export type NextActionFilter = "todas" | "com" | "sem";

export interface VisitReportFilters {
  dataInicial: string;
  dataFinal: string;
  vendedor: string;
  clienteId: string;
  cidade: string;
  rota: string;
  resultadoVisita: string;
  tipoAcao: string;
  oportunidade: OpportunityFilter;
  proximaAcao: NextActionFilter;
}

export interface VisitReportBundle {
  relatoriosVisita: RelatorioVisita[];
  clientes: Cliente[];
  proximasAcoes: ProximaAcao[];
  lancamentos: Lancamento[];
  oportunidades: OportunidadeComercial[];
  negocios: Negocio[];
}

export interface EnrichedVisitReport extends RelatorioVisita {
  cliente?: Cliente;
  proximaAcao?: ProximaAcao;
  lancamento?: Lancamento;
  oportunidade?: OportunidadeComercial;
  negocio?: Negocio;
  clienteNomeExport: string;
  cidadeExport: string;
  rotaExport: string;
  vendedorExport: string;
  hasOportunidade: boolean;
  hasProximaAcao: boolean;
  proximaAcaoExport: string;
}

export interface VisitReportSummary {
  totalVisitas: number;
  visitasComOportunidade: number;
  visitasSemOportunidade: number;
  totalClientesVisitados: number;
  clientesComOportunidade: number;
  clientesSemOportunidade: number;
  visitasComProximaAcao: number;
  visitasSemProximaAcao: number;
  porVendedor: Array<{ label: string; total: number }>;
  porResultado: Array<{ label: string; total: number }>;
  porCidade: Array<{ label: string; total: number }>;
  proximasAcoes: Array<{ visitaId: string; dataVisita: string; cliente: string; vendedor: string; acao: string }>;
}

export const defaultVisitReportFilters: VisitReportFilters = {
  dataInicial: "",
  dataFinal: "",
  vendedor: "",
  clienteId: "",
  cidade: "",
  rota: "",
  resultadoVisita: "",
  tipoAcao: "",
  oportunidade: "todas",
  proximaAcao: "todas",
};

const normalize = (value?: string | null) => String(value ?? "").trim();
const lower = (value?: string | null) => normalize(value).toLocaleLowerCase("pt-BR");
const text = (value?: string | number | null) => normalize(String(value ?? "")) || "—";
const safeFilePart = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "relatorio";

function countBy<T>(rows: T[], getKey: (row: T) => string | undefined) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = normalize(getKey(row)) || "Não informado";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries()).map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

export function enrichVisitReports(bundle: VisitReportBundle) {
  return bundle.relatoriosVisita.map((visit): EnrichedVisitReport => {
    const cliente = bundle.clientes.find((c) => c.id === visit.clienteId);
    const oportunidade = bundle.oportunidades.find((o) => o.id === visit.oportunidadeId || o.relatorioVisitaId === visit.id);
    const negocio = bundle.negocios.find((n) => n.id === visit.negocioId || n.oportunidadeId === visit.oportunidadeId || n.lancamentoId === visit.lancamentoId);
    const lancamento = bundle.lancamentos.find((l) => l.id === visit.lancamentoId || l.id === visit.acaoId || l.acaoAgendaId === visit.acaoId || l.oportunidadeId === visit.oportunidadeId);
    const proximaAcao = bundle.proximasAcoes.find((a) => a.id === visit.origemAgendaId || a.id === visit.acaoId || a.proximaAcaoId === visit.origemAgendaId || a.oportunidadeId === visit.oportunidadeId || a.negocioId === visit.negocioId);
    const proximaAcaoExport = normalize(visit.proximaAcaoRecomendada) || proximaAcao?.descricao || lancamento?.proximaAcao || "";
    const hasOportunidade = Boolean(visit.oportunidadeId || oportunidade || visit.negocioId || negocio || visit.resultadoVisita === "Visita realizada com oportunidade");
    const hasProximaAcao = Boolean(proximaAcaoExport || proximaAcao || lancamento?.proximaAcaoId || lancamento?.dataProximaAcao);

    return {
      ...visit,
      cliente,
      proximaAcao,
      lancamento,
      oportunidade,
      negocio,
      clienteNomeExport: normalize(visit.clienteNome) || cliente?.nome || oportunidade?.clienteNome || "Cliente não identificado",
      cidadeExport: normalize(visit.cidade) || cliente?.cidade || "",
      rotaExport: cliente?.rota || "",
      vendedorExport: normalize(visit.vendedor) || oportunidade?.vendedor || negocio?.vendedor || cliente?.vendedor || lancamento?.vendedor || proximaAcao?.responsavel || "",
      hasOportunidade,
      hasProximaAcao,
      proximaAcaoExport,
    };
  });
}

export function filterVisitReports(visits: EnrichedVisitReport[], filters: VisitReportFilters) {
  return visits.filter((visit) => {
    if (filters.dataInicial && visit.dataVisita < filters.dataInicial) return false;
    if (filters.dataFinal && visit.dataVisita > filters.dataFinal) return false;
    if (filters.clienteId && visit.clienteId !== filters.clienteId) return false;
    if (filters.vendedor && !lower(visit.vendedorExport).includes(lower(filters.vendedor))) return false;
    if (filters.cidade && lower(visit.cidadeExport) !== lower(filters.cidade)) return false;
    if (filters.rota && lower(visit.rotaExport) !== lower(filters.rota)) return false;
    if (filters.resultadoVisita && visit.resultadoVisita !== filters.resultadoVisita) return false;
    if (filters.tipoAcao && visit.tipoAcao !== filters.tipoAcao) return false;
    if (filters.oportunidade === "com" && !visit.hasOportunidade) return false;
    if (filters.oportunidade === "sem" && visit.hasOportunidade) return false;
    if (filters.proximaAcao === "com" && !visit.hasProximaAcao) return false;
    if (filters.proximaAcao === "sem" && visit.hasProximaAcao) return false;
    return true;
  }).sort((a, b) => `${a.dataVisita} ${a.horario || ""}`.localeCompare(`${b.dataVisita} ${b.horario || ""}`));
}

export function summarizeVisitReports(visits: EnrichedVisitReport[]): VisitReportSummary {
  const clientKey = (visit: EnrichedVisitReport) => visit.clienteId || visit.clienteNomeExport;
  const clientesComOportunidade = new Set(visits.filter((v) => v.hasOportunidade).map(clientKey).filter(Boolean)).size;
  const clientesVisitados = new Set(visits.map(clientKey).filter(Boolean));

  return {
    totalVisitas: visits.length,
    visitasComOportunidade: visits.filter((v) => v.hasOportunidade).length,
    visitasSemOportunidade: visits.filter((v) => !v.hasOportunidade).length,
    totalClientesVisitados: clientesVisitados.size,
    clientesComOportunidade,
    clientesSemOportunidade: Math.max(clientesVisitados.size - clientesComOportunidade, 0),
    visitasComProximaAcao: visits.filter((v) => v.hasProximaAcao).length,
    visitasSemProximaAcao: visits.filter((v) => !v.hasProximaAcao).length,
    porVendedor: countBy(visits, (v) => v.vendedorExport),
    porResultado: countBy(visits, (v) => v.resultadoVisita),
    porCidade: countBy(visits, (v) => v.cidadeExport),
    proximasAcoes: visits
      .filter((v) => v.hasProximaAcao)
      .map((v) => ({ visitaId: v.id, dataVisita: v.dataVisita, cliente: v.clienteNomeExport, vendedor: v.vendedorExport, acao: v.proximaAcaoExport || v.proximaAcao?.descricao || v.lancamento?.proximaAcao || "" }))
      .filter((v) => normalize(v.acao)),
  };
}

export function describeVisitReportFilters(filters: VisitReportFilters, clientes: Cliente[]) {
  const cliente = clientes.find((c) => c.id === filters.clienteId);
  return [
    filters.vendedor && `Vendedor: ${filters.vendedor}`,
    cliente && `Cliente: ${cliente.nome}`,
    filters.cidade && `Cidade: ${filters.cidade}`,
    filters.rota && `Rota: ${filters.rota}`,
    filters.resultadoVisita && `Resultado: ${filters.resultadoVisita}`,
    filters.tipoAcao && `Tipo de ação: ${filters.tipoAcao}`,
    filters.oportunidade === "com" && "Somente visitas com oportunidade",
    filters.oportunidade === "sem" && "Somente visitas sem oportunidade",
    filters.proximaAcao === "com" && "Somente visitas com próxima ação",
    filters.proximaAcao === "sem" && "Somente visitas sem próxima ação",
  ].filter(Boolean) as string[];
}

export function visitReportPeriodText(filters: VisitReportFilters) {
  if (filters.dataInicial || filters.dataFinal) return `${formatDateBR(filters.dataInicial) || "início"} até ${formatDateBR(filters.dataFinal) || "hoje"}`;
  return "Todos os períodos";
}

const visitRows = (visits: EnrichedVisitReport[]) => visits.map((visit) => ({
  dataVisita: visit.dataVisita,
  horario: visit.horario || "—",
  clienteNome: visit.clienteNomeExport,
  fazenda: visit.fazenda || "—",
  cidade: visit.cidadeExport || "—",
  vendedor: visit.vendedorExport || "—",
  tipoAcao: visit.tipoAcao,
  objetivoOriginal: visit.objetivoOriginal || "—",
  resumoVisita: visit.resumoVisita || "—",
  pontosAvaliados: visit.pontosAvaliados || "—",
  dadosColetados: visit.dadosColetados || "—",
  necessidadeIdentificada: visit.necessidadeIdentificada || visit.oportunidade?.necessidade || "—",
  produtosSolucoesDiscutidas: visit.produtosSolucoesDiscutidas || visit.oportunidade?.produtosInteresse?.join(", ") || visit.negocio?.produtos?.join(", ") || "—",
  potencialNegocio: visit.potencialNegocio || (visit.oportunidade?.valorEstimado ? String(visit.oportunidade.valorEstimado) : visit.negocio?.valorPotencial ? String(visit.negocio.valorPotencial) : "—"),
  resultadoVisita: visit.resultadoVisita,
  proximaAcaoRecomendada: visit.proximaAcaoExport || "—",
  observacoesGerais: visit.observacoesGerais || "—",
  origemAgendaId: visit.origemAgendaId || "—",
  lancamentoId: visit.lancamentoId || visit.lancamento?.id || "—",
  oportunidadeId: visit.oportunidadeId || visit.oportunidade?.id || "—",
  negocioId: visit.negocioId || visit.negocio?.id || "—",
  createdAt: visit.createdAt,
  updatedAt: visit.updatedAt,
}));

export function exportVisitReportsXlsx(visits: EnrichedVisitReport[], filters: VisitReportFilters, clientes: Cliente[]) {
  const summary = summarizeVisitReports(visits);
  const filterText = describeVisitReportFilters(filters, clientes).join("; ") || "Sem filtros adicionais";
  const resumoRows = [
    { indicador: "Período", valor: visitReportPeriodText(filters) },
    { indicador: "Filtros aplicados", valor: filterText },
    { indicador: "Total de visitas", valor: summary.totalVisitas },
    { indicador: "Visitas com oportunidade", valor: summary.visitasComOportunidade },
    { indicador: "Visitas sem oportunidade", valor: summary.visitasSemOportunidade },
    { indicador: "Total de clientes visitados", valor: summary.totalClientesVisitados },
    { indicador: "Clientes com oportunidade gerada", valor: summary.clientesComOportunidade },
    { indicador: "Clientes sem oportunidade", valor: summary.clientesSemOportunidade },
    { indicador: "Visitas com próxima ação", valor: summary.visitasComProximaAcao },
    { indicador: "Visitas sem próxima ação", valor: summary.visitasSemProximaAcao },
    ...summary.porVendedor.map((item) => ({ indicador: `Visitas por vendedor - ${item.label}`, valor: item.total })),
    ...summary.porCidade.map((item) => ({ indicador: `Visitas por cidade - ${item.label}`, valor: item.total })),
    ...summary.porResultado.map((item) => ({ indicador: `Visitas por resultado - ${item.label}`, valor: item.total })),
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(resumoRows), "Resumo");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(visitRows(visits)), "Visitas");
  XLSX.writeFile(workbook, `relatorio-visitas-${safeFilePart(formatDateTimeStamp())}.xlsx`);
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")} • Página ${page}/${pageCount}`, 12, doc.internal.pageSize.getHeight() - 8);
  }
}

function visitDetailsRows(visit: EnrichedVisitReport) {
  return [
    ["Data da visita", `${formatDateBR(visit.dataVisita)}${visit.horario ? ` às ${visit.horario}` : ""}`],
    ["Cliente", text(visit.clienteNomeExport)],
    ["Fazenda/propriedade", text(visit.fazenda)],
    ["Cidade", text(visit.cidadeExport)],
    ["Vendedor/responsável", text(visit.vendedorExport)],
    ["Tipo de ação", text(visit.tipoAcao)],
    ["Objetivo original", text(visit.objetivoOriginal)],
    ["Resumo da visita", text(visit.resumoVisita)],
    ["Pontos avaliados", text(visit.pontosAvaliados)],
    ["Dados coletados", text(visit.dadosColetados)],
    ["Necessidade identificada", text(visit.necessidadeIdentificada || visit.oportunidade?.necessidade)],
    ["Produtos/soluções discutidas", text(visit.produtosSolucoesDiscutidas || visit.oportunidade?.produtosInteresse?.join(", ") || visit.negocio?.produtos?.join(", "))],
    ["Potencial de negócio", text(visit.potencialNegocio || visit.oportunidade?.valorEstimado || visit.negocio?.valorPotencial)],
    ["Resultado da visita", text(visit.resultadoVisita)],
    ["Próxima ação recomendada", text(visit.proximaAcaoExport)],
    ["Observações gerais", text(visit.observacoesGerais)],
    ["Ação de agenda", text(visit.origemAgendaId || visit.acaoId || visit.proximaAcao?.id)],
    ["Lançamento", text(visit.lancamentoId || visit.lancamento?.id)],
    ["Oportunidade", text(visit.oportunidadeId || visit.oportunidade?.id)],
    ["Negócio", text(visit.negocioId || visit.negocio?.id)],
  ];
}

export function exportSingleVisitReportPdf(visit: EnrichedVisitReport) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 12;
  const width = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Safra Vision / Safra 26/27", width / 2, 16, { align: "center" });
  doc.setFontSize(12);
  doc.text("Relatório individual de visita", width / 2, 23, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, margin, 32);

  autoTable(doc, {
    startY: 38,
    theme: "grid",
    head: [["Campo", "Informação"]],
    body: visitDetailsRows(visit),
    styles: { fontSize: 9, cellPadding: 2, valign: "top" },
    headStyles: { fillColor: [35, 89, 64], textColor: 255 },
    columnStyles: { 0: { cellWidth: 50, fontStyle: "bold" }, 1: { cellWidth: width - margin * 2 - 50 } },
    margin: { left: margin, right: margin },
  });

  addFooter(doc);
  doc.save(`relatorio-visita-${safeFilePart(visit.clienteNomeExport)}-${safeFilePart(visit.dataVisita)}.pdf`);
}

export function exportVisitReportsPdf(visits: EnrichedVisitReport[], filters: VisitReportFilters, clientes: Cliente[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 12;
  const width = doc.internal.pageSize.getWidth();
  const summary = summarizeVisitReports(visits);
  const filtersText = describeVisitReportFilters(filters, clientes);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Safra Vision / Safra 26/27", width / 2, 16, { align: "center" });
  doc.setFontSize(12);
  doc.text("Relatório consolidado de visitas", width / 2, 23, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Período filtrado: ${visitReportPeriodText(filters)}`, margin, 32);
  doc.text(`Filtros: ${filtersText.join("; ") || "Sem filtros adicionais"}`, margin, 38, { maxWidth: width - margin * 2 });

  autoTable(doc, {
    startY: 46,
    theme: "grid",
    head: [["Total de visitas", "Clientes visitados", "Clientes com oportunidade", "Clientes sem oportunidade", "Com próxima ação"]],
    body: [[summary.totalVisitas, summary.totalClientesVisitados, summary.clientesComOportunidade, summary.clientesSemOportunidade, summary.visitasComProximaAcao]],
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [35, 89, 64], textColor: 255 },
    margin: { left: margin, right: margin },
  });

  const firstY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 46) + 4;
  autoTable(doc, {
    startY: firstY,
    theme: "striped",
    head: [["Visitas por vendedor", "Qtd.", "Visitas por cidade", "Qtd.", "Visitas por resultado", "Qtd."]],
    body: Array.from({ length: Math.max(summary.porVendedor.length, summary.porCidade.length, summary.porResultado.length, 1) }).map((_, index) => [
      summary.porVendedor[index]?.label || "—",
      summary.porVendedor[index]?.total || "—",
      summary.porCidade[index]?.label || "—",
      summary.porCidade[index]?.total || "—",
      summary.porResultado[index]?.label || "—",
      summary.porResultado[index]?.total || "—",
    ]),
    styles: { fontSize: 7.5, cellPadding: 1.6 },
    margin: { left: margin, right: margin },
  });

  const clientesResumo = Array.from(
    visits.reduce((map, visit) => {
      const key = visit.clienteId || visit.clienteNomeExport;
      const current = map.get(key);
      map.set(key, { cliente: visit.clienteNomeExport, hasOportunidade: Boolean(current?.hasOportunidade || visit.hasOportunidade) });
      return map;
    }, new Map<string, { cliente: string; hasOportunidade: boolean }>()).values(),
  ).sort((a, b) => a.cliente.localeCompare(b.cliente));

  let y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? firstY) + 6;
  autoTable(doc, {
    startY: y,
    theme: "grid",
    head: [["Clientes visitados", "Status de oportunidade"]],
    body: clientesResumo.length > 0 ? clientesResumo.map((cliente) => [cliente.cliente, cliente.hasOportunidade ? "Com oportunidade gerada" : "Sem oportunidade"]) : [["—", "—"]],
    styles: { fontSize: 8, cellPadding: 1.7 },
    margin: { left: margin, right: margin },
  });

  y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 6;
  autoTable(doc, {
    startY: y,
    theme: "striped",
    head: [["Próximas ações recomendadas", "Cliente", "Vendedor", "Data da visita"]],
    body: summary.proximasAcoes.length > 0 ? summary.proximasAcoes.map((acao) => [acao.acao, acao.cliente, text(acao.vendedor), formatDateBR(acao.dataVisita)]) : [["—", "—", "—", "—"]],
    styles: { fontSize: 7.8, cellPadding: 1.6, valign: "top" },
    margin: { left: margin, right: margin },
  });

  y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Lista resumida das visitas", margin, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    theme: "grid",
    head: [["Data", "Cliente", "Cidade", "Vendedor", "Resultado", "Próxima ação"]],
    body: visits.map((visit) => [
      `${formatDateBR(visit.dataVisita)}${visit.horario ? ` ${visit.horario}` : ""}`,
      visit.clienteNomeExport,
      text(visit.cidadeExport),
      text(visit.vendedorExport),
      text(visit.resultadoVisita),
      text(visit.proximaAcaoExport),
    ]),
    styles: { fontSize: 7.2, cellPadding: 1.4, valign: "top" },
    headStyles: { fillColor: [35, 89, 64], textColor: 255 },
    margin: { left: margin, right: margin },
    pageBreak: "auto",
  });

  addFooter(doc);
  doc.save(`relatorio-visitas-${safeFilePart(formatDateTimeStamp())}.pdf`);
}
