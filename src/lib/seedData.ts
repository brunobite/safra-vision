import {
  initialClientes, initialEventos, initialLancamentos, initialMetasCategoria,
  initialMetasEmpresa, initialMetasPessoais, initialMetasVendedor,
  initialNegocios, initialPrioridadesP1, initialProdutos, initialRegrasComissao,
  initialVendedores,
} from "@/data/mockData";

export const seedData = {
  clientes: initialClientes,
  vendedores: initialVendedores,
  lancamentos: initialLancamentos,
  negocios: initialNegocios,
  produtos: initialProdutos,
  metasEmpresa: initialMetasEmpresa,
  metasPessoais: initialMetasPessoais,
  metasVendedor: initialMetasVendedor,
  metasCategoria: initialMetasCategoria,
  regrasComissao: initialRegrasComissao,
  eventos: initialEventos,
  prioridadesP1: initialPrioridadesP1,
  configuracoes: [] as Array<{ id: string; key: string; value: string }>,
};

export type SeedData = typeof seedData;
