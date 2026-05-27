import { Cliente, ClienteCulturaArea, Lancamento, Negocio, Orcamento, ProximaAcao } from "@/types";
import { formatDateBR } from "@/utils/dateUtils";

export const CULTURAS_SUGERIDAS = ["Soja", "Arroz", "Milho", "Trigo", "Pastagem", "Aveia", "Outra"];


export function parseFrequenciaDias(freq?: string) {
  const num = Number((freq || "").match(/\d+/)?.[0] || 0);
  return Number.isFinite(num) && num > 0 ? num : 30;
}

export function computeClienteStatus(cliente: Cliente, lancamentos: Lancamento[], negocios: Negocio[], orcamentos: Orcamento[]) {
  if (cliente.inativoManual) return "Inativo";
  const negocioAberto = negocios.some((n) => n.clienteId === cliente.id && !["Fechado ganho", "Fechado perdido"].includes(n.status));
  const orcAberto = orcamentos.some((o) => o.clienteId === cliente.id && ["Rascunho", "Enviado", "Aprovado"].includes(o.status));
  if (negocioAberto || orcAberto) return "Ativo";
  const visitas = lancamentos.filter((l) => l.clienteId === cliente.id && l.tipo === "Visita").sort((a, b) => b.data.localeCompare(a.data));
  if (!visitas[0]) return "Prospecção";
  const dias = (Date.now() - new Date(`${visitas[0].data}T00:00:00`).getTime()) / 86400000;
  return dias <= 60 ? "Visita" : "Prospecção";
}

export function sugestaoRetornoDias(cliente: Cliente, status: string, negocios: Negocio[]) {
  const regras: number[] = [];
  if (status === "Prospecção" || status === "Visita") regras.push(30);
  if (cliente.abc === "A") regras.push(15);
  if (negocios.some((n) => n.clienteId === cliente.id && !["Fechado ganho", "Fechado perdido"].includes(n.status))) regras.push(7);
  return Math.min(...regras, 30);
}

export function isClienteAtrasado(cliente: Cliente, proximasAcoes: ProximaAcao[]) {
  if (cliente.inativoManual) return false;
  const hoje = new Date().toISOString().slice(0, 10);
  const acaoPendente = proximasAcoes.some((a) => a.clienteId === cliente.id && a.status === "Pendente" && a.data < hoje);
  const retornoVencido = !!cliente.retorno && cliente.retorno < hoje;
  return acaoPendente || retornoVencido;
}

export function normalizarCulturas(culturasDetalhes?: ClienteCulturaArea[], culturasTexto?: string) {
  if (culturasDetalhes?.length) return culturasDetalhes;
  if (!culturasTexto) return [];
  return culturasTexto.split(",").map((c, i) => ({ id: `legacy-${i}`, cultura: c.trim(), areaHa: 0 })).filter((c) => c.cultura);
}
