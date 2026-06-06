import { CATEGORIAS_PRODUTO_PADRAO, type CategoriaProduto, type MetaCategoria, type OportunidadeComercial, type Orcamento, type Produto, type TicketMedioRegra, type Negocio } from "@/types";

export type CategoriaComercialSource = {
  categoriasPadrao?: readonly string[];
  produtos?: Pick<Produto, "categoria">[];
  metasCategoria?: Pick<MetaCategoria, "categoria">[];
  ticketsMedios?: Pick<TicketMedioRegra, "categoria">[];
  orcamentos?: Pick<Orcamento, "itens">[];
  oportunidades?: Pick<OportunidadeComercial, "itensEstimados" | "segmento">[];
  negocios?: Pick<Negocio, "categoria" | "itensEstimados" | "segmento">[];
  extras?: Array<string | undefined | null>;
};

export function normalizarEspacosCategoria(categoria: unknown): string {
  return String(categoria ?? "").replace(/\s+/g, " ").trim();
}

export function chaveCategoriaComercial(categoria: unknown): string {
  return normalizarEspacosCategoria(categoria).toLocaleLowerCase("pt-BR");
}

export function getCategoriasComerciais(params: CategoriaComercialSource = {}): CategoriaProduto[] {
  const categorias = new Map<string, string>();
  const add = (categoria: unknown) => {
    const normalizada = normalizarEspacosCategoria(categoria);
    if (!normalizada) return;
    const chave = chaveCategoriaComercial(normalizada);
    if (!categorias.has(chave)) categorias.set(chave, normalizada);
  };

  (params.categoriasPadrao ?? CATEGORIAS_PRODUTO_PADRAO).forEach(add);
  params.produtos?.forEach((produto) => add(produto.categoria));
  params.metasCategoria?.forEach((meta) => add(meta.categoria));
  params.ticketsMedios?.forEach((ticket) => add(ticket.categoria));
  params.orcamentos?.forEach((orcamento) => orcamento.itens?.forEach((item) => add(item.categoria)));
  params.oportunidades?.forEach((oportunidade) => {
    add(oportunidade.segmento);
    oportunidade.itensEstimados?.forEach((item) => add(item.categoria));
  });
  params.negocios?.forEach((negocio) => {
    add(negocio.categoria);
    add(negocio.segmento);
    negocio.itensEstimados?.forEach((item) => add(item.categoria));
  });
  params.extras?.forEach(add);

  return Array.from(categorias.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function normalizarCategoriaComercial(categoria: unknown, categoriasExistentes: readonly string[] = []): string {
  const normalizada = normalizarEspacosCategoria(categoria) || "Outros";
  const chave = chaveCategoriaComercial(normalizada);
  const existente = categoriasExistentes.find((item) => chaveCategoriaComercial(item) === chave);
  return existente ? normalizarEspacosCategoria(existente) : normalizada;
}

export function categoriaComercialExiste(categoria: unknown, categoriasExistentes: readonly string[]): boolean {
  const chave = chaveCategoriaComercial(categoria);
  return Boolean(chave) && categoriasExistentes.some((item) => chaveCategoriaComercial(item) === chave);
}
