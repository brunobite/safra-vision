import { Produto } from "@/types";

export function hasStockData(produto: Pick<Produto, "estoqueAtual" | "estoqueReservado" | "localEstoque">) {
  return Boolean(produto.estoqueAtual || produto.estoqueReservado || produto.localEstoque?.trim());
}

export function controlaEstoqueProduto(produto: Pick<Produto, "controlaEstoque" | "estoqueAtual" | "estoqueReservado" | "localEstoque">) {
  return produto.controlaEstoque ?? hasStockData(produto);
}

export function estoqueDisponivelProduto(produto: Pick<Produto, "estoqueAtual" | "estoqueReservado">) {
  return (produto.estoqueAtual ?? 0) - (produto.estoqueReservado ?? 0);
}
