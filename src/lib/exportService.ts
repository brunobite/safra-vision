import { DbMeta } from "@/lib/db";
import { saveAsJsonFile } from "@/lib/fileDownload";

export interface ExportDataBundle {
  clientes: unknown[];
  vendedores: unknown[];
  lancamentos: unknown[];
  negocios: unknown[];
  produtos: unknown[];
  metasEmpresa: unknown[];
  metasPessoais: unknown[];
  regrasComissao: unknown[];
  eventos: unknown[];
  configuracoes: unknown[];
  metasVendedor?: unknown[];
  metasCategoria?: unknown[];
  prioridadesP1?: unknown[];
  dbMeta?: DbMeta | null;
}

export const ENTITY_LABELS: Array<{ key: keyof ExportDataBundle; fileName: string; sheetName: string }> = [
  { key: "clientes", fileName: "clientes.csv", sheetName: "CLIENTES" },
  { key: "vendedores", fileName: "vendedores.csv", sheetName: "VENDEDORES" },
  { key: "lancamentos", fileName: "lancamentos.csv", sheetName: "LANCAMENTOS" },
  { key: "negocios", fileName: "negocios.csv", sheetName: "NEGOCIOS" },
  { key: "produtos", fileName: "produtos.csv", sheetName: "PRODUTOS" },
  { key: "metasEmpresa", fileName: "metas_empresa.csv", sheetName: "METAS_EMPRESA" },
  { key: "metasPessoais", fileName: "metas_pessoais.csv", sheetName: "METAS_PESSOAIS" },
  { key: "regrasComissao", fileName: "regras_comissao.csv", sheetName: "REGRAS_COMISSAO" },
  { key: "eventos", fileName: "eventos.csv", sheetName: "EVENTOS" },
];

export function formatDateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function formatDateTimeStamp(date = new Date()) {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)}_${iso.slice(11, 16).replace(":", "-")}`;
}

export function saveBackupFile(payload: unknown) {
  const fileName = `backup_safra_26_27_${formatDateTimeStamp()}.json`;
  saveAsJsonFile(fileName, payload);
}
