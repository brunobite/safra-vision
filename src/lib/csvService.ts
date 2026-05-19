import { ENTITY_LABELS, ExportDataBundle } from "@/lib/exportService";
import { saveAsTextFile } from "@/lib/fileDownload";

const CSV_SEPARATOR = ";";

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const escaped = text.replace(/"/g, '""');
  return /[;\n\r"]/.test(escaped) ? `"${escaped}"` : escaped;
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "";
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [
    headers.join(CSV_SEPARATOR),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(CSV_SEPARATOR)),
  ];
  return `\uFEFF${lines.join("\n")}`;
}

export function exportAllEntitiesToCsv(data: ExportDataBundle) {
  ENTITY_LABELS.forEach(({ key, fileName }) => {
    const rows = (data[key] ?? []) as Array<Record<string, unknown>>;
    const csv = toCsv(rows);
    saveAsTextFile(fileName, csv, "text/csv;charset=utf-8");
  });
}
