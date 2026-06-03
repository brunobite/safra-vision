import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

import { Cliente, Lancamento, Negocio, OportunidadeComercial, ProximaAcao, RelatorioVisita } from "@/types";
import { formatDateBR } from "@/utils/dateUtils";
import { formatDateTimeStamp } from "@/lib/exportService";

export type OpportunityFilter = "todas" | "com" | "sem";

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
}

export interface VisitReportSummary {
  totalVisitas: number;
  visitasComOportunidade: number;
  visitasSemOportunidade: number;
  totalClientesVisitados: number;
  porVendedor: Array<{ label: string; total: number }>;
  porResultado: Array<{ label: string; total: number }>;
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
};

const normalize = (value?: string | null) => String(value ?? "").trim();
const lower = (value?: string | null) => normalize(value).toLocaleLowerCase("pt-BR");
const text = (value?: string | number | null) => normalize(String(value ?? "")) || "-";
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
    const hasOportunidade = Boolean(visit.oportunidadeId || oportunidade || visit.negocioId || negocio || visit.resultadoVisita === "Visita realizada com oportunidade");

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
    return true;
  }).sort((a, b) => `${a.dataVisita} ${a.horario || ""}`.localeCompare(`${b.dataVisita} ${b.horario || ""}`));
}

export function summarizeVisitReports(visits: EnrichedVisitReport[]): VisitReportSummary {
  return {
    totalVisitas: visits.length,
    visitasComOportunidade: visits.filter((v) => v.hasOportunidade).length,
    visitasSemOportunidade: visits.filter((v) => !v.hasOportunidade).length,
    totalClientesVisitados: new Set(visits.map((v) => v.clienteId || v.clienteNomeExport).filter(Boolean)).size,
    porVendedor: countBy(visits, (v) => v.vendedorExport),
    porResultado: countBy(visits, (v) => v.resultadoVisita),
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
  ].filter(Boolean) as string[];
}

export function visitReportPeriodText(filters: VisitReportFilters) {
  if (filters.dataInicial || filters.dataFinal) return `${formatDateBR(filters.dataInicial) || "início"} até ${formatDateBR(filters.dataFinal) || "hoje"}`;
  return "Todos os períodos";
}

const visitRows = (visits: EnrichedVisitReport[]) => visits.map((visit) => ({
  dataVisita: visit.dataVisita,
  horario: visit.horario || "",
  clienteNome: visit.clienteNomeExport,
  fazenda: visit.fazenda || "",
  cidade: visit.cidadeExport,
  vendedor: visit.vendedorExport,
  tipoAcao: visit.tipoAcao,
  objetivoOriginal: visit.objetivoOriginal || "",
  resumoVisita: visit.resumoVisita || "",
  pontosAvaliados: visit.pontosAvaliados || "",
  dadosColetados: visit.dadosColetados || "",
  necessidadeIdentificada: visit.necessidadeIdentificada || visit.oportunidade?.necessidade || "",
  produtosSolucoesDiscutidas: visit.produtosSolucoesDiscutidas || visit.oportunidade?.produtosInteresse?.join(", ") || visit.negocio?.produtos?.join(", ") || "",
  potencialNegocio: visit.potencialNegocio || (visit.oportunidade?.valorEstimado ? String(visit.oportunidade.valorEstimado) : visit.negocio?.valorPotencial ? String(visit.negocio.valorPotencial) : ""),
  resultadoVisita: visit.resultadoVisita,
  proximaAcaoRecomendada: visit.proximaAcaoRecomendada || visit.proximaAcao?.descricao || visit.lancamento?.proximaAcao || "",
  observacoesGerais: visit.observacoesGerais || "",
  oportunidadeId: visit.oportunidadeId || visit.oportunidade?.id || "",
  acaoId: visit.acaoId || visit.origemAgendaId || visit.proximaAcao?.id || "",
  lancamentoId: visit.lancamentoId || visit.lancamento?.id || "",
  negocioId: visit.negocioId || visit.negocio?.id || "",
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
    ...summary.porVendedor.map((item) => ({ indicador: `Visitas por vendedor - ${item.label}`, valor: item.total })),
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
  doc.text("Relatório executivo de visitas", width / 2, 23, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Período: ${visitReportPeriodText(filters)}`, margin, 32);
  doc.text(`Filtros: ${filtersText.join("; ") || "Sem filtros adicionais"}`, margin, 38, { maxWidth: width - margin * 2 });

  autoTable(doc, {
    startY: 45,
    theme: "grid",
    head: [["Total", "Com oportunidade", "Sem oportunidade", "Clientes visitados"]],
    body: [[summary.totalVisitas, summary.visitasComOportunidade, summary.visitasSemOportunidade, summary.totalClientesVisitados]],
    styles: { fontSize: 9, cellPadding: 2 },
    margin: { left: margin, right: margin },
  });

  const firstY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 45) + 4;
  autoTable(doc, {
    startY: firstY,
    theme: "striped",
    head: [["Visitas por vendedor", "Qtd.", "Principais resultados", "Qtd."]],
    body: Array.from({ length: Math.max(summary.porVendedor.length, summary.porResultado.length, 1) }).map((_, index) => [
      summary.porVendedor[index]?.label || "",
      summary.porVendedor[index]?.total || "",
      summary.porResultado[index]?.label || "",
      summary.porResultado[index]?.total || "",
    ]),
    styles: { fontSize: 8, cellPadding: 1.8 },
    margin: { left: margin, right: margin },
  });

  let y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? firstY) + 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Lista de visitas", margin, y);
  y += 4;

  visits.forEach((visit, index) => {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      head: [[`Visita ${index + 1} — ${formatDateBR(visit.dataVisita)} ${visit.horario ? `às ${visit.horario}` : ""}`, visit.clienteNomeExport]],
      body: [
        ["Fazenda / Cidade", `${text(visit.fazenda)} / ${text(visit.cidadeExport)}`],
        ["Vendedor / Tipo de ação", `${text(visit.vendedorExport)} / ${text(visit.tipoAcao)}`],
        ["Objetivo original", text(visit.objetivoOriginal)],
        ["Resumo da visita", text(visit.resumoVisita)],
        ["Pontos avaliados", text(visit.pontosAvaliados)],
        ["Dados coletados", text(visit.dadosColetados)],
        ["Necessidade identificada", text(visit.necessidadeIdentificada || visit.oportunidade?.necessidade)],
        ["Produtos/soluções discutidas", text(visit.produtosSolucoesDiscutidas || visit.oportunidade?.produtosInteresse?.join(", ") || visit.negocio?.produtos?.join(", "))],
        ["Potencial de negócio", text(visit.potencialNegocio || visit.oportunidade?.valorEstimado || visit.negocio?.valorPotencial)],
        ["Resultado", text(visit.resultadoVisita)],
        ["Próxima ação recomendada", text(visit.proximaAcaoRecomendada || visit.proximaAcao?.descricao || visit.lancamento?.proximaAcao)],
        ["Observações gerais", text(visit.observacoesGerais)],
        ["Vínculos", `Oportunidade: ${text(visit.oportunidadeId || visit.oportunidade?.id)} | Ação: ${text(visit.acaoId || visit.origemAgendaId || visit.proximaAcao?.id)} | Lançamento: ${text(visit.lancamentoId || visit.lancamento?.id)} | Negócio: ${text(visit.negocioId || visit.negocio?.id)}`],
      ],
      styles: { fontSize: 8, cellPadding: 1.7, valign: "top" },
      headStyles: { fillColor: [35, 89, 64], textColor: 255 },
      columnStyles: { 0: { cellWidth: 44, fontStyle: "bold" }, 1: { cellWidth: width - margin * 2 - 44 } },
      margin: { left: margin, right: margin },
      pageBreak: "auto",
    });
    y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 5;
  });

  addFooter(doc);
  doc.save(`relatorio-visitas-${safeFilePart(formatDateTimeStamp())}.pdf`);
}
