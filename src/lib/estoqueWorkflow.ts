import type { Orcamento, OrcamentoItem, Produto } from "@/types";

export type EstoqueReservaItem = { item: OrcamentoItem; produto: Produto; quantidade: number };
export type EstoqueReservaAgrupada = { produto: Produto; quantidade: number; itens: OrcamentoItem[] };

export function itemMovimentaEstoque(item: OrcamentoItem, produto?: Produto | null) {
  return Boolean(
    item.produtoId
    && (item.quantidadeTotal || 0) > 0
    && produto?.controlaEstoque === true
    && item.controlaEstoque === true
    && !produto.representacaoComissionado
    && !item.representacaoComissionado,
  );
}

export function itensControladosDoPedido(orcamento: Orcamento, produtos: Produto[]): EstoqueReservaItem[] {
  return (orcamento.itens || [])
    .map((item) => ({ item, produto: produtos.find((p) => p.id === item.produtoId) }))
    .filter((entry): entry is { item: OrcamentoItem; produto: Produto } => itemMovimentaEstoque(entry.item, entry.produto))
    .map(({ item, produto }) => ({ item, produto, quantidade: item.quantidadeTotal || 0 }));
}

export function agruparItensControlados(orcamento: Orcamento, produtos: Produto[]): EstoqueReservaAgrupada[] {
  const agrupados = new Map<string, EstoqueReservaAgrupada>();
  for (const entry of itensControladosDoPedido(orcamento, produtos)) {
    const atual = agrupados.get(entry.produto.id) || { produto: entry.produto, quantidade: 0, itens: [] };
    atual.quantidade += entry.quantidade;
    atual.itens.push(entry.item);
    agrupados.set(entry.produto.id, atual);
  }
  return [...agrupados.values()];
}

export function validarDisponibilidadeReserva(orcamento: Orcamento, produtos: Produto[]) {
  if (orcamento.estoqueReservado) return [];
  return agruparItensControlados(orcamento, produtos)
    .map((entry) => ({ ...entry, disponivel: (entry.produto.estoqueAtual || 0) - (entry.produto.estoqueReservado || 0) }))
    .filter((entry) => entry.quantidade > entry.disponivel);
}

export function aplicarReservaPedidoAprovado(orcamento: Orcamento, produtos: Produto[], userId: string | undefined, now: string) {
  const agrupados = orcamento.estoqueReservado ? [] : agruparItensControlados(orcamento, produtos);
  const produtosAtualizados = produtos.map((produto) => {
    const reserva = agrupados.find((entry) => entry.produto.id === produto.id);
    if (!reserva) return produto;
    return {
      ...produto,
      estoqueReservado: (produto.estoqueReservado || 0) + reserva.quantidade,
      updatedAt: now,
      ultimaAtualizacao: now,
      updatedByUserId: userId,
    };
  });
  return { agrupados, produtosAtualizados };
}

export function aplicarBaixaVendaFaturada(itens: OrcamentoItem[], produtos: Produto[], now: string) {
  const fakeOrcamento = { itens } as Orcamento;
  const agrupados = agruparItensControlados(fakeOrcamento, produtos);
  return produtos.map((produto) => {
    const baixa = agrupados.find((entry) => entry.produto.id === produto.id);
    if (!baixa) return produto;
    return {
      ...produto,
      estoqueAtual: Math.max(0, (produto.estoqueAtual || 0) - baixa.quantidade),
      estoqueReservado: Math.max(0, (produto.estoqueReservado || 0) - baixa.quantidade),
      updatedAt: now,
      ultimaAtualizacao: now,
    };
  });
}

export function aplicarLiberacaoReserva(itens: OrcamentoItem[], produtos: Produto[], now: string) {
  const fakeOrcamento = { itens } as Orcamento;
  const agrupados = agruparItensControlados(fakeOrcamento, produtos);
  return produtos.map((produto) => {
    const reserva = agrupados.find((entry) => entry.produto.id === produto.id);
    if (!reserva) return produto;
    return { ...produto, estoqueReservado: Math.max(0, (produto.estoqueReservado || 0) - reserva.quantidade), updatedAt: now, ultimaAtualizacao: now };
  });
}
