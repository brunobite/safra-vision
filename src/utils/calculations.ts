import { Lancamento, Cliente, MetaEmpresa } from "@/types";

export const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const fmtNum = (n: number) => n.toLocaleString("pt-BR");
export const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

export const STATUS_PIPELINE = ["Aberto", "Em negociação", "Aguardando cliente", "Aguardando parceiro"];
export const STATUS_PENDENTE = ["Aberto", "Atrasado", "Aguardando cliente", "Aguardando parceiro"];
export const TIPOS_ATENDIMENTO = ["Visita", "Proposta", "Venda"];

export function getSemana(dataIso: string): number {
  const d = new Date(dataIso + "T00:00:00");
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = (d.getTime() - start.getTime()) / 86400000;
  return Math.ceil((diff + start.getDay() + 1) / 7);
}

export function getMes(dataIso: string): string {
  return dataIso.slice(0, 7);
}

export function statusCor(pct: number): "success" | "warning" | "destructive" {
  if (pct >= 1) return "success";
  if (pct >= 0.8) return "warning";
  return "destructive";
}

export interface DashboardKpis {
  metaEmpresa: number;
  realizadoEmpresa: number;
  pctEmpresa: number;
  gapEmpresa: number;
  metaPessoal: number;
  realizadoPessoal: number;
  pctPessoal: number;
  comissaoEstimada: number;
  visitas: number;
  propostas: number;
  p1Atendidos: number;
  aAtendidos: number;
  km: number;
  despesas: number;
  eventos: number;
  pipelineAberto: number;
  pendencias: number;
}

export function calcDashboard(
  lancs: Lancamento[],
  clientes: Cliente[],
  metasEmpresa: MetaEmpresa[],
  metaPessoalTotal: number,
): DashboardKpis {
  const cMap = new Map(clientes.map(c => [c.id, c]));
  const metaEmpresa = metasEmpresa.reduce((s, m) => s + m.metaTotal, 0);
  const realizadoEmpresa = lancs
    .filter(l => l.tipo === "Venda" || l.status === "Concluído")
    .reduce((s, l) => s + (l.vendaRs || 0), 0);
  const comissao = lancs.reduce((s, l) => s + (l.comissaoRs || 0), 0);
  const visitas = lancs.filter(l => l.tipo === "Visita").length;
  const propostas = lancs.filter(l => l.tipo === "Proposta").length;
  const atendidos = lancs.filter(l => TIPOS_ATENDIMENTO.includes(l.tipo));
  const p1Atendidos = new Set(atendidos.filter(l => cMap.get(l.clienteId)?.prioridade === "P1").map(l => l.clienteId)).size;
  const aAtendidos = new Set(atendidos.filter(l => cMap.get(l.clienteId)?.abc === "A").map(l => l.clienteId)).size;
  const km = lancs.reduce((s, l) => s + (l.km || 0), 0);
  const despesas = lancs.reduce((s, l) => s + (l.despesaRs || 0), 0);
  const eventos = lancs.filter(l => l.tipo === "Evento").length;
  const pipelineAberto = lancs.filter(l => STATUS_PIPELINE.includes(l.status)).reduce((s, l) => s + (l.vendaRs || 0), 0);
  const pendencias = lancs.filter(l => STATUS_PENDENTE.includes(l.status)).length;
  return {
    metaEmpresa,
    realizadoEmpresa,
    pctEmpresa: metaEmpresa ? realizadoEmpresa / metaEmpresa : 0,
    gapEmpresa: realizadoEmpresa - metaEmpresa,
    metaPessoal: metaPessoalTotal,
    realizadoPessoal: realizadoEmpresa,
    pctPessoal: metaPessoalTotal ? realizadoEmpresa / metaPessoalTotal : 0,
    comissaoEstimada: comissao,
    visitas,
    propostas,
    p1Atendidos,
    aAtendidos,
    km,
    despesas,
    eventos,
    pipelineAberto,
    pendencias,
  };
}