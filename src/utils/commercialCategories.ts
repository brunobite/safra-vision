import { CATEGORIAS_PRODUTO_PADRAO, type CategoriaProduto, type MetaCategoria, type OportunidadeComercial, type Orcamento, type Produto, type TicketMedioRegra, type Negocio } from "@/types";

export type CategoriaComercialSource = {
  categoriasPadrao?: readonly unknown[] | null;
  produtos?: readonly (Pick<Produto, "categoria"> | null | undefined)[] | null;
  metasCategoria?: readonly (Pick<MetaCategoria, "categoria"> | null | undefined)[] | null;
  ticketsMedios?: readonly (Pick<TicketMedioRegra, "categoria"> | null | undefined)[] | null;
  orcamentos?: readonly (Pick<Orcamento, "itens"> | null | undefined)[] | null;
  oportunidades?: readonly (Pick<OportunidadeComercial, "itensEstimados" | "segmento"> | null | undefined)[] | null;
  negocios?: readonly (Pick<Negocio, "categoria" | "itensEstimados" | "segmento"> | null | undefined)[] | null;
  extras?: readonly unknown[] | null;
};

function listaSegura<T>(valor: readonly T[] | null | undefined): readonly T[] {
  return Array.isArray(valor) ? valor : [];
}

function lerCampo<T extends string>(registro: unknown, campo: T): unknown {
  return registro && typeof registro === "object" ? (registro as Record<T, unknown>)[campo] : undefined;
}

export function normalizarEspacosCategoria(categoria: unknown): string {
  return String(categoria ?? "").replace(/\s+/g, " ").trim();
}

export function chaveCategoriaComercial(categoria: unknown): string {
  return normalizarEspacosCategoria(categoria).toLocaleLowerCase("pt-BR");
}

export function getCategoriasComerciais(params: CategoriaComercialSource = {}): CategoriaProduto[] {
  try {
    const fonte = params && typeof params === "object" ? params : {};
    const categorias = new Map<string, string>();
    const add = (categoria: unknown) => {
      const normalizada = normalizarEspacosCategoria(categoria);
      if (!normalizada) return;
      const chave = chaveCategoriaComercial(normalizada);
      if (!chave || categorias.has(chave)) return;
      categorias.set(chave, normalizada);
    };

    const categoriasPadrao = listaSegura(fonte.categoriasPadrao).length > 0 ? listaSegura(fonte.categoriasPadrao) : CATEGORIAS_PRODUTO_PADRAO;
    categoriasPadrao.forEach(add);
    listaSegura(fonte.produtos).forEach((produto) => add(lerCampo(produto, "categoria")));
    listaSegura(fonte.metasCategoria).forEach((meta) => add(lerCampo(meta, "categoria")));
    listaSegura(fonte.ticketsMedios).forEach((ticket) => add(lerCampo(ticket, "categoria")));
    listaSegura(fonte.orcamentos).forEach((orcamento) => {
      listaSegura(lerCampo(orcamento, "itens") as readonly unknown[] | null | undefined).forEach((item) => add(lerCampo(item, "categoria")));
    });
    listaSegura(fonte.oportunidades).forEach((oportunidade) => {
      add(lerCampo(oportunidade, "segmento"));
      listaSegura(lerCampo(oportunidade, "itensEstimados") as readonly unknown[] | null | undefined).forEach((item) => add(lerCampo(item, "categoria")));
    });
    listaSegura(fonte.negocios).forEach((negocio) => {
      add(lerCampo(negocio, "categoria"));
      add(lerCampo(negocio, "segmento"));
      listaSegura(lerCampo(negocio, "itensEstimados") as readonly unknown[] | null | undefined).forEach((item) => add(lerCampo(item, "categoria")));
    });
    listaSegura(fonte.extras).forEach(add);

    return Array.from(categorias.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
  } catch (error) {
    console.error("Erro ao consolidar categorias comerciais", error);
    return [...CATEGORIAS_PRODUTO_PADRAO];
  }
}

export function normalizarCategoriaComercial(categoria: unknown, categoriasExistentes: readonly string[] = []): string {
  const normalizada = normalizarEspacosCategoria(categoria) || "Outros";
  const chave = chaveCategoriaComercial(normalizada);
  const existentes = listaSegura(categoriasExistentes);
  const existente = existentes.find((item) => chaveCategoriaComercial(item) === chave);
  return existente ? normalizarEspacosCategoria(existente) : normalizada;
}

export function categoriaComercialExiste(categoria: unknown, categoriasExistentes: readonly string[] = []): boolean {
  const chave = chaveCategoriaComercial(categoria);
  return Boolean(chave) && listaSegura(categoriasExistentes).some((item) => chaveCategoriaComercial(item) === chave);
}
