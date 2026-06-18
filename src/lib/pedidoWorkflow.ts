import type { EtapaOportunidade, OportunidadeComercial, Orcamento, OrcamentoItem, OrcamentoStatus } from "@/types";

export const PEDIDO_STATUS_OFICIAIS = [
  "Rascunho",
  "Enviado ao cliente",
  "Em negociação",
  "Venda fechada pelo vendedor",
  "Aguardando aprovação",
  "Aprovado pelo gestor",
  "Reprovado pelo gestor",
  "Reservado",
  "Convertido em venda",
  "Faturado",
  "Cancelado",
  "Perdido",
] as const satisfies readonly OrcamentoStatus[];

export type PedidoWorkflowRole = "vendedor" | "gestor" | "administrador" | "visualizador" | string | null | undefined;

const LEGACY_STATUS_MAP: Partial<Record<string, OrcamentoStatus>> = {
  Enviado: "Enviado ao cliente",
  Aprovado: "Aprovado pelo gestor",
  Recusado: "Perdido",
  Convertido: "Convertido em venda",
  Reenviado: "Enviado ao cliente",
  Reprovado: "Reprovado pelo gestor",
  Vencido: "Perdido",
  Expirado: "Perdido",
  Aberto: "Rascunho",
  "Em revisão": "Em negociação",
};

export const normalizePedidoStatus = (status?: string): OrcamentoStatus => LEGACY_STATUS_MAP[status || ""] || (status as OrcamentoStatus) || "Rascunho";

export const pedidoStatusToEtapa = (status?: string): EtapaOportunidade => {
  switch (normalizePedidoStatus(status)) {
    case "Rascunho": return "Orçamento solicitado";
    case "Enviado ao cliente": return "Orçamento enviado";
    case "Em negociação": return "Negociação";
    case "Venda fechada pelo vendedor":
    case "Aguardando aprovação":
    case "Aprovado pelo gestor":
    case "Reservado": return "Fechamento encaminhado";
    case "Convertido em venda":
    case "Faturado": return "Ganha";
    case "Cancelado": return "Cancelada";
    case "Perdido":
    case "Reprovado pelo gestor": return "Perdida";
    default: return "Orçamento solicitado";
  }
};

export const getPedidoValorPotencial = (oportunidade: Pick<OportunidadeComercial, "id" | "orcamentoId" | "valorEstimado">, orcamentos: Pick<Orcamento, "id" | "oportunidadeId" | "valorTotal" | "status" | "updatedAt" | "createdAt" | "versao">[]) => {
  const vinculado = getPedidoAtualDaOportunidade(oportunidade.id, orcamentos, oportunidade.orcamentoId);
  return vinculado ? vinculado.valorTotal || 0 : oportunidade.valorEstimado || 0;
};

export function getPedidoAtualDaOportunidade<T extends Pick<Orcamento, "id" | "oportunidadeId" | "status" | "updatedAt" | "createdAt" | "versao">>(oportunidadeId: string, orcamentos: T[], preferredId?: string): T | null {
  const vinculados = orcamentos.filter((o) => o.oportunidadeId === oportunidadeId || (preferredId && o.id === preferredId));
  if (!vinculados.length) return null;
  const score = (status: string) => {
    const normalized = normalizePedidoStatus(status);
    const index = PEDIDO_STATUS_OFICIAIS.indexOf(normalized);
    return index >= 0 ? index : 0;
  };
  return [...vinculados].sort((a, b) => score(b.status) - score(a.status) || (b.versao || 0) - (a.versao || 0) || new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())[0];
}

export function buildPedidoRascunhoFromOportunidade(oportunidade: OportunidadeComercial, existingOrcamentos: Pick<Orcamento, "id" | "oportunidadeId" | "status">[] = [], now = new Date().toISOString()): Orcamento | null {
  if (existingOrcamentos.some((o) => o.oportunidadeId === oportunidade.id && normalizePedidoStatus(o.status) === "Rascunho")) return null;
  const itens: OrcamentoItem[] = (oportunidade.itensEstimados || []).map((item, idx) => ({ id: `i${Date.now()}-${idx}`, produtoId: item.produtoId, produtoNome: item.produtoNome || "", categoria: item.categoria || "", unidadeProduto: item.unidadeProduto || "LT", dosePorHa: item.dosePorHa || 0, unidadeDose: item.unidadeDose || "L/ha", areaHa: item.areaHa || 0, quantidadeTotal: item.quantidadeTotal || 0, precoUnitario: item.precoUnitario || 0, valorTotalItem: item.valorTotalItem || 0, custoPorHaItem: item.custoPorHaItem || 0, observacoes: item.observacoes }));
  const subtotal = itens.reduce((sum, item) => sum + (item.valorTotalItem || 0), 0);
  return { id: `orc${Date.now()}`, codigo: `ORC-${Date.now()}`, versao: 1, clienteId: oportunidade.clienteId, oportunidadeId: oportunidade.id, vendedor: oportunidade.vendedor || oportunidade.responsavel || "", vendedorId: oportunidade.vendedorId, vendedorUserId: oportunidade.vendedorUserId, vendedorNome: oportunidade.vendedorNome, responsavel: oportunidade.responsavel || oportunidade.vendedor, responsavelId: oportunidade.responsavelId || oportunidade.vendedorId, responsavelUserId: oportunidade.responsavelUserId || oportunidade.vendedorUserId, responsavelNome: oportunidade.responsavelNome || oportunidade.vendedorNome, data: now.slice(0, 10), validade: new Date(new Date(now).getTime() + 7 * 86400000).toISOString().slice(0, 10), status: "Rascunho", areaAplicacaoHa: itens.length ? Math.max(...itens.map((i) => i.areaHa || 0), 0) : 0, itens, subtotal, descontoTotal: 0, valorTotal: subtotal || oportunidade.valorEstimado || 0, custoPorHectare: 0, createdAt: now, updatedAt: now, createdByUserId: oportunidade.createdByUserId, updatedByUserId: oportunidade.updatedByUserId };
}

export function canTransitionPedidoStatus(from: OrcamentoStatus, to: OrcamentoStatus, role: PedidoWorkflowRole) {
  if (from === to) return true;
  const normalizedRole = role === "administrador" || role === "admin" ? "administrador" : role;
  const manager = normalizedRole === "gestor" || normalizedRole === "administrador";
  const allowedSeller: Record<string, OrcamentoStatus[]> = {
    Rascunho: ["Enviado ao cliente", "Cancelado"],
    "Enviado ao cliente": ["Em negociação", "Perdido", "Cancelado"],
    "Em negociação": ["Venda fechada pelo vendedor", "Perdido", "Cancelado"],
    "Venda fechada pelo vendedor": ["Aguardando aprovação", "Em negociação", "Perdido"],
    "Reprovado pelo gestor": ["Em negociação", "Cancelado"],
  };
  const allowedManager: Record<string, OrcamentoStatus[]> = {
    ...allowedSeller,
    "Aguardando aprovação": ["Aprovado pelo gestor", "Reprovado pelo gestor"],
    "Aprovado pelo gestor": ["Reservado", "Convertido em venda", "Cancelado"],
    Reservado: ["Convertido em venda", "Faturado", "Cancelado"],
    "Convertido em venda": ["Faturado"],
  };
  return (manager ? allowedManager : allowedSeller)[normalizePedidoStatus(from)]?.includes(normalizePedidoStatus(to)) ?? false;
}
