import { DbMeta } from "@/lib/db";
import { ExportDataBundle, saveBackupFile } from "@/lib/exportService";

interface BackupFile {
  app?: string;
  version?: string;
  createdAt?: string;
  schemaVersion?: number;
  data?: Partial<ExportDataBundle>;
}

const REQUIRED_KEYS: Array<keyof ExportDataBundle> = [
  "clientes", "vendedores", "lancamentos", "negocios", "produtos",
  "metasEmpresa", "metasPessoais", "regrasComissao", "eventos", "configuracoes",
];

export function generateBackupPayload(source: ExportDataBundle, dbMeta?: DbMeta | null) {
  return {
    app: "Safra 26/27 — Controle Operacional",
    version: "1.0",
    createdAt: new Date().toISOString(),
    schemaVersion: dbMeta?.versaoSchema ?? null,
    data: {
      ...source,
      dbMeta: dbMeta ?? source.dbMeta ?? null,
    },
  };
}

export function downloadBackupJson(source: ExportDataBundle, dbMeta?: DbMeta | null) {
  const payload = generateBackupPayload(source, dbMeta);
  saveBackupFile(payload);
}

export function parseBackupPayload(content: string): ExportDataBundle {
  let parsed: BackupFile;
  try {
    parsed = JSON.parse(content) as BackupFile;
  } catch {
    throw new Error("Arquivo de backup inválido ou incompatível com o aplicativo.");
  }

  if (!parsed || typeof parsed !== "object" || (!parsed.app && !parsed.data) || !parsed.data) {
    throw new Error("Arquivo de backup inválido ou incompatível com o aplicativo.");
  }

  const normalized = {} as ExportDataBundle;
  REQUIRED_KEYS.forEach((key) => {
    const candidate = parsed.data?.[key];
    normalized[key] = Array.isArray(candidate) ? candidate : [];
  });
  normalized.metasVendedor = Array.isArray(parsed.data.metasVendedor) ? parsed.data.metasVendedor : [];
  normalized.metasCategoria = Array.isArray(parsed.data.metasCategoria) ? parsed.data.metasCategoria : [];
  normalized.prioridadesP1 = Array.isArray(parsed.data.prioridadesP1) ? parsed.data.prioridadesP1 : [];
  normalized.dbMeta = (parsed.data.dbMeta as DbMeta | undefined) ?? null;

  return normalized;
}
