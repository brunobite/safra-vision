import { ENTITY_LABELS, ExportDataBundle, formatDateStamp } from "@/lib/exportService";
import { saveAsTextFile } from "@/lib/fileDownload";

const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function sheetXml(name: string, rows: Array<Record<string, unknown>>) {
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const safeRows = rows.length ? rows : [{}];
  const headerRow = headers.map((h) => `<Cell><Data ss:Type="String">${esc(h)}</Data></Cell>`).join("");
  const dataRows = safeRows.map((row) => `<Row>${headers.map((h) => `<Cell><Data ss:Type="String">${esc(row[h])}</Data></Cell>`).join("")}</Row>`).join("");
  return `<Worksheet ss:Name="${name}"><Table>${headers.length ? `<Row>${headerRow}</Row>` : ""}${dataRows}</Table></Worksheet>`;
}

export function exportWorkbook(data: ExportDataBundle) {
  const sheets = ENTITY_LABELS.map(({ key, sheetName }) => sheetXml(sheetName, (data[key] ?? []) as Array<Record<string, unknown>>)).join("");
  const summary = [
    { campo: "Data de geração", valor: new Date().toLocaleString("pt-BR") },
    { campo: "Total de clientes", valor: data.clientes.length },
    { campo: "Total de vendedores", valor: data.vendedores.length },
    { campo: "Total de lançamentos", valor: data.lancamentos.length },
    { campo: "Total de negócios", valor: data.negocios.length },
    { campo: "Total de produtos", valor: data.produtos.length },
    { campo: "Total de metas empresa", valor: data.metasEmpresa.length },
    { campo: "Total de metas pessoais", valor: data.metasPessoais.length },
    { campo: "Total de eventos", valor: data.eventos.length },
    { campo: "Observação", valor: "Arquivo exportado do aplicativo Safra 26/27 — Controle Operacional" },
  ];
  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${sheets}${sheetXml("RESUMO", summary)}</Workbook>`;
  saveAsTextFile(`Controle_Safra_26_27_${formatDateStamp()}.xlsx`, xml, "application/vnd.ms-excel;charset=utf-8");
}
