import {
  initialClientes, initialEventos, initialLancamentos, initialMetasCategoria,
  initialMetasEmpresa, initialMetasPessoais, initialMetasVendedor,
  initialNegocios, initialPrioridadesP1, initialProdutos, initialRegrasComissao,
  initialVendedores,
} from "@/data/mockData";

const enableDemoData = import.meta.env.VITE_ENABLE_DEMO_DATA === "true";
const enableDemoProducts = import.meta.env.VITE_ENABLE_DEMO_PRODUCTS === "true";

export const seedData = {
  clientes: enableDemoData ? initialClientes : [],
  vendedores: enableDemoData ? initialVendedores : [],
  lancamentos: enableDemoData ? initialLancamentos : [],
  negocios: enableDemoData ? initialNegocios : [],
  oportunidades: [],
  produtos: enableDemoProducts ? initialProdutos : [],
  metasEmpresa: enableDemoData ? initialMetasEmpresa : [],
  metasPessoais: enableDemoData ? initialMetasPessoais : [],
  metasVendedor: enableDemoData ? initialMetasVendedor : [],
  metasCategoria: enableDemoData ? initialMetasCategoria : [],
  regrasComissao: enableDemoData ? initialRegrasComissao : [],
  eventos: enableDemoData ? initialEventos : [],
  prioridadesP1: enableDemoData ? initialPrioridadesP1 : [],
  configuracoes: [{ id: "cfg-show-custo-ha", key: "showCustoPorHectare", value: true }],
  orcamentos: [],
  orcamentoItens: [],
  empresas: [],
  proximasAcoes: [],
  relatoriosVisita: [],
  formasPagamento: [],
  importLogs: [],
  prazosPagamento: [],
  appConfig: [{ id: "main", taxaAcertoCarteira: 12 }],
};

export type SeedData = typeof seedData;
