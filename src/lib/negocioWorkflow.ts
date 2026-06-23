import type { EtapaOportunidade, Negocio, OportunidadeComercial, Orcamento } from "@/types";

export function isVendaOperacionalStatus(status?: string) {
  return ["Pendente de faturamento", "Faturado", "Entregue", "Fechado", "Fechado ganho"].includes(status || "");
}

export function buildNegocioFromOrcamento(params: {
  orcamento: Orcamento;
  negocioExistente?: Negocio;
  clienteNome?: string;
  empresaNome?: string;
  actorUserId?: string;
  now: string;
}): Negocio {
  const { orcamento, negocioExistente, clienteNome, empresaNome, actorUserId, now } = params;
  const margemBruta = orcamento.itens.reduce((sum, item) => sum + ((item.precoUnitario - (item.desconto || 0)) * item.quantidadeTotal - (item.custoPorHaItem || 0) * (item.areaHa || orcamento.areaAplicacaoHa || 0)), 0);
  return {
    ...negocioExistente,
    id: negocioExistente?.id || `neg-${orcamento.id}`,
    codigo: negocioExistente?.codigo || `VEN-${orcamento.codigo.replace(/^ORC-?/, "")}`,
    nome: negocioExistente?.nome || `Venda do orçamento ${orcamento.codigo}`,
    orcamentoId: orcamento.id,
    oportunidadeId: orcamento.oportunidadeId,
    clienteId: orcamento.clienteId,
    clienteNome: negocioExistente?.clienteNome || clienteNome,
    empresaId: orcamento.empresaId,
    empresaNome: negocioExistente?.empresaNome || empresaNome,
    vendedor: orcamento.vendedor || orcamento.responsavel || "",
    vendedorId: orcamento.vendedorId || orcamento.responsavelId,
    vendedorUserId: orcamento.vendedorUserId || orcamento.responsavelUserId,
    vendedorNome: orcamento.vendedorNome || orcamento.responsavelNome || orcamento.vendedor,
    responsavel: orcamento.responsavel || orcamento.vendedor,
    responsavelId: orcamento.responsavelId || orcamento.vendedorId,
    responsavelUserId: orcamento.responsavelUserId || orcamento.vendedorUserId,
    responsavelNome: orcamento.responsavelNome || orcamento.vendedorNome || orcamento.vendedor,
    createdByUserId: negocioExistente?.createdByUserId || actorUserId || orcamento.createdByUserId,
    updatedByUserId: actorUserId || orcamento.updatedByUserId,
    origem: "Orçamento",
    produtos: orcamento.itens.map((item) => item.produtoId).filter(Boolean),
    categoria: (orcamento.itens[0]?.categoria || "Outros") as Negocio["categoria"],
    valorPotencial: orcamento.valorTotal,
    valorFechado: orcamento.valorTotal,
    valorTotal: orcamento.valorTotal,
    subtotal: orcamento.subtotal,
    descontoTotal: orcamento.descontoTotal,
    margemBruta,
    margemPercentual: orcamento.valorTotal > 0 ? (margemBruta / orcamento.valorTotal) * 100 : 0,
    formaPagamento: orcamento.formaPagamento,
    prazoPagamento: orcamento.prazoPagamento,
    prazoEntrega: orcamento.prazoEntrega,
    itens: orcamento.itens,
    itensEstimados: orcamento.itens,
    observacoes: orcamento.observacoes,
    status: isVendaOperacionalStatus(negocioExistente?.status) ? negocioExistente!.status : "Pendente de faturamento",
    dataFechamento: negocioExistente?.dataFechamento || now.slice(0, 10),
    dataPrevistaFaturamento: negocioExistente?.dataPrevistaFaturamento || now.slice(0, 10),
    dataPrevistaEntrega: orcamento.validade,
    previsaoFechamento: negocioExistente?.previsaoFechamento || now.slice(0, 10),
    dataCriacao: negocioExistente?.dataCriacao || now,
    ultimaAtualizacao: now,
    createdAt: negocioExistente?.createdAt || now,
    updatedAt: now,
    estoqueReservado: true,
    estoqueBaixado: negocioExistente?.estoqueBaixado ?? false,
  };
}

export function buildOportunidadeGanha(params: { oportunidade?: OportunidadeComercial; orcamento: Orcamento; negocio: Negocio; clienteNome?: string; actorUserId?: string; now: string; }): OportunidadeComercial | undefined {
  const { oportunidade, orcamento, negocio, clienteNome, actorUserId, now } = params;
  if (!orcamento.oportunidadeId && !oportunidade) return undefined;
  return {
    ...(oportunidade || { id: orcamento.oportunidadeId!, origem: "Orçamento" as const, clienteId: orcamento.clienteId }),
    etapa: "Ganha" as EtapaOportunidade,
    orcamentoId: orcamento.id,
    negocioId: negocio.id,
    clienteId: orcamento.clienteId,
    clienteNome: oportunidade?.clienteNome || clienteNome,
    valorFinal: orcamento.valorTotal,
    valorEstimado: orcamento.valorTotal,
    itensEstimados: orcamento.itens,
    vendedor: orcamento.vendedor,
    vendedorId: orcamento.vendedorId,
    vendedorUserId: orcamento.vendedorUserId,
    vendedorNome: orcamento.vendedorNome,
    responsavel: orcamento.responsavel || orcamento.vendedor,
    responsavelId: orcamento.responsavelId || orcamento.vendedorId,
    responsavelUserId: orcamento.responsavelUserId || orcamento.vendedorUserId,
    responsavelNome: orcamento.responsavelNome || orcamento.vendedorNome || orcamento.vendedor,
    updatedByUserId: actorUserId,
    dataFechamento: now.slice(0, 10),
    createdAt: oportunidade?.createdAt || now,
    updatedAt: now,
  };
}
