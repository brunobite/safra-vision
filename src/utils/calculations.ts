import { Lancamento, Cliente, MetaEmpresa, Negocio, RegraComissao } from "@/types";

export const fmtBRL = (n: number) =>
  (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtBRLCompact = (n: number) => {
  const value = Number.isFinite(n) ? n : 0;
  const abs = Math.abs(value);
  const formatOneDecimal = (amount: number) => amount.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  if (abs >= 1_000_000) return `R$ ${formatOneDecimal(value / 1_000_000)} mi`;
  if (abs >= 1_000) return `R$ ${formatOneDecimal(value / 1_000)} mil`;

  return fmtBRL(value);
};
export const fmtNum = (n: number) => (n || 0).toLocaleString("pt-BR");
export const fmtPct = (n: number) => `${((n || 0) * 100).toFixed(1)}%`;

export const STATUS_PENDENTE = ["Aberto", "Atrasado", "Aguardando cliente", "Aguardando parceiro"];
export const TIPOS_ATENDIMENTO = ["Visita", "Proposta", "Venda"];

export function getSemana(dataIso: string): number {
  const d = new Date(dataIso + "T00:00:00");
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = (d.getTime() - start.getTime()) / 86400000;
  return Math.ceil((diff + start.getDay() + 1) / 7);
}
export const getMes = (d: string) => d.slice(0, 7);

export function statusCor(pct: number): "success" | "warning" | "destructive" {
  if (pct >= 1) return "success";
  if (pct >= 0.8) return "warning";
  return "destructive";
}

export const STATUS_FUNIL_ABERTO = ["Novo", "Qualificado", "Em negociação", "Proposta enviada", "Aguardando cliente", "Aguardando parceiro"];

export interface DashboardKpis {
  metaEmpresa: number;
  realizadoEmpresa: number;
  pctEmpresa: number;
  gapEmpresa: number;
  metaPessoal: number;
  realizadoPessoal: number;
  pctPessoal: number;
  gapPessoal: number;
  propostas: number;
  eventos: number;
  pipelineAberto: number;
  pendencias: number;
  aproveitamento: number;
  comissaoEstimada: number;
  comissaoRealizada: number;
}

export function calcDashboard(
  lancs: Lancamento[],
  clientes: Cliente[],
  metasEmpresa: MetaEmpresa[],
  metaPessoalTotal: number,
  negocios: Negocio[],
  regras: RegraComissao[],
): DashboardKpis {
  const metaEmpresa = metasEmpresa.reduce((s, m) => s + m.metaTotal, 0);
  const realizadoEmpresa = negocios
    .filter(n => n.status === "Fechado ganho")
    .reduce((s, n) => s + (n.valorFechado || 0), 0);
  const propostas = lancs.filter(l => l.tipo === "Proposta").length;
  const eventos = lancs.filter(l => l.tipo === "Evento").length;
  const pipelineAberto = negocios
    .filter(n => STATUS_FUNIL_ABERTO.includes(n.status))
    .reduce((s, n) => s + (n.valorPotencial || 0), 0);
  const pendencias = lancs.filter(l => STATUS_PENDENTE.includes(l.status)).length;
  const potencialCarteira = clientes.reduce((s, c) => s + (c.potencialTotal || 0), 0);
  const aproveitamento = potencialCarteira ? realizadoEmpresa / potencialCarteira : 0;

  // Comissão estimada/realizada simples: aplica primeira regra ativa "negocio_fechado" sobre realizado
  const fixa = regras.find(r => r.ativo && r.tipo === "fixa" && r.aplicarSobre === "negocio_fechado");
  const pctEmp = metaEmpresa ? realizadoEmpresa / metaEmpresa : 0;
  const escalonada = regras.find(r => r.ativo && r.tipo === "escalonada" && r.aplicarSobre === "meta_empresa");
  let comissaoRealizada = fixa ? realizadoEmpresa * ((fixa.percentual || 0) / 100) : 0;
  let comissaoEstimada = comissaoRealizada;
  if (escalonada?.faixas) {
    const faixa = escalonada.faixas.find(f => pctEmp * 100 >= f.min && pctEmp * 100 <= f.max);
    if (faixa) comissaoRealizada += realizadoEmpresa * (faixa.percentual / 100);
    const meta = metaEmpresa;
    const proj = escalonada.faixas[escalonada.faixas.length - 1];
    comissaoEstimada += meta * (proj.percentual / 100);
  }

  return {
    metaEmpresa,
    realizadoEmpresa,
    pctEmpresa: pctEmp,
    gapEmpresa: realizadoEmpresa - metaEmpresa,
    metaPessoal: metaPessoalTotal,
    realizadoPessoal: realizadoEmpresa,
    pctPessoal: metaPessoalTotal ? realizadoEmpresa / metaPessoalTotal : 0,
    gapPessoal: realizadoEmpresa - metaPessoalTotal,
    propostas,
    eventos,
    pipelineAberto,
    pendencias,
    aproveitamento,
    comissaoEstimada,
    comissaoRealizada,
  };
}
