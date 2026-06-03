import { Cliente, Evento, Lancamento, MetaEmpresa, MetaPessoal, MetaVendedor, Negocio, Produto, RegraComissao, StatusFunil, Vendedor } from "@/types";

export type ReportType = "geral" | "semanal" | "mensal" | "cliente" | "funil" | "metas-comissao" | "produtos-estoque" | "visitas";

export interface ReportFilters {
  reportType: ReportType;
  dataInicial: string;
  dataFinal: string;
  mes: string;
  clienteId: string;
  vendedor: string;
  rota: string;
  status: string;
  categoria: string;
}

export const defaultReportFilters: ReportFilters = { reportType: "geral", dataInicial: "", dataFinal: "", mes: "", clienteId: "", vendedor: "", rota: "", status: "", categoria: "" };

export const inRange = (date: string, start?: string, end?: string) => (!start || date >= start) && (!end || date <= end);
export const byMonth = (date: string, month?: string) => !month || date.slice(0, 7) === month;

export function alertLevel(pct: number) { if (pct >= 1) return "verde"; if (pct >= 0.7) return "amarelo"; return "vermelho"; }

export function commissionEstimate(regras: RegraComissao[], realizado: number, metaTotal: number, pctMeta: number) {
  return regras.filter((r) => r.ativo).reduce((acc, r) => {
    let base = 0;
    if (r.aplicarSobre === "negocio_fechado" || r.aplicarSobre === "realizado_empresa") base = realizado;
    else if (r.aplicarSobre === "meta_empresa") base = metaTotal;
    if (r.tipo === "fixa") return acc + (base * ((r.percentual || 0) / 100));
    const faixa = r.faixas?.find((f) => pctMeta * 100 >= f.min && pctMeta * 100 <= f.max);
    return acc + (faixa ? base * (faixa.percentual / 100) : 0);
  }, 0);
}
