export type ABC = "A" | "B" | "C";
export type Prioridade = "P1" | "P2" | "P3";
export type FrenteComercial = "Venda Direta" | "Cooperagro" | "Tritec" | "Nutrição Especial" | "Geo Pampa";
export type StatusLancamento = "Aberto" | "Concluído" | "Atrasado" | "Cancelado" | "Aguardando cliente" | "Aguardando parceiro" | "Em negociação";
export type TipoLancamento = "Visita" | "Ligação" | "WhatsApp" | "Proposta" | "Venda" | "Evento" | "Orçamento" | "Em negociação";
export type StatusEvento = "Aprovar" | "Planejar" | "Em andamento" | "Concluído" | "Cancelado";

export type StatusFunil =
  | "Novo" | "Qualificado" | "Em negociação" | "Proposta enviada"
  | "Aguardando cliente" | "Aguardando parceiro" | "Fechado ganho" | "Fechado perdido";

export const STATUS_FUNIL: StatusFunil[] = [
  "Novo", "Qualificado", "Em negociação", "Proposta enviada",
  "Aguardando cliente", "Aguardando parceiro", "Fechado ganho", "Fechado perdido",
];

export type OrigemNegocio = "Visita" | "Ligação" | "WhatsApp" | "Evento" | "Indicação" | "Outro";

export type CategoriaProduto = "Adjuvantes" | "Nutrição" | "Fertilizantes" | "Sementes" | "Defensivos" | "Biológicos" | "Outros";
export const CATEGORIAS_PRODUTO: CategoriaProduto[] = ["Adjuvantes", "Nutrição", "Fertilizantes", "Sementes", "Defensivos", "Biológicos", "Outros"];

export interface Vendedor { id: string; nome: string; }

export interface Cliente {
  id: string;
  nome: string;
  abc: ABC;
  prioridade: Prioridade;
  rota: string;
  cidade: string;
  localidade: string;
  latitude?: number;
  longitude?: number;
  culturas: string;
  areaHa: number;
  potencialTotal: number;
  potencialAdj?: number;
  potencialNutri?: number;
  statusAtual: string;
  observacao?: string;
  motivoAbc?: string;
  frequencia: string;
  retorno: string;
  vendedor?: string;
  produtosInteresse?: string[];
}

export interface Lancamento {
  id: string;
  data: string;
  clienteId: string;
  tipo: TipoLancamento;
  frente: FrenteComercial;
  status: StatusLancamento;
  vendaRs?: number;
  comissaoRs?: number;
  km?: number;
  despesaRs?: number;
  eventoAcao?: string;
  observacao?: string;
  oQueFoiRealizado?: string;
  vendedor?: string;
  geraOportunidade?: boolean;
  negocioId?: string;
}

export interface Negocio {
  id: string;
  nome?: string;
  clienteId: string;
  vendedor: string;
  origem: OrigemNegocio;
  produtos: string[]; // ids
  categoria: CategoriaProduto;
  valorPotencial: number;
  valorFechado?: number;
  status: StatusFunil;
  probabilidade: number; // 0-100
  previsaoFechamento?: string;
  dataCriacao: string;
  ultimaAtualizacao: string;
  proximaAcao?: string;
  dataProximaAcao?: string;
  motivoPerda?: string;
  observacoes?: string;
  lancamentoId?: string;
}

export interface MetaEmpresa {
  id: string;
  mes: string;
  metaTotal: number;
  vendaDireta: number;
  cooperagro: number;
  tritec: number;
  observacao?: string;
}

export interface MetaPessoal {
  id: string;
  frente: FrenteComercial;
  comissaoAlvo: number;
  participacao: number;
  percComissao: number;
  metaFaturamento: number;
  observacao?: string;
}

export interface MetaVendedor {
  id: string; vendedor: string; mes: string; meta: number;
}
export interface MetaCategoria {
  id: string; categoria: CategoriaProduto; mes: string; meta: number;
}

export interface Rota {
  nome: string;
  leituraAdministrativa: string;
  acaoOperacional: string;
}

export interface Evento {
  id: string;
  tipo: string;
  regiaoParceiro: string;
  publico: string;
  participantesMin: number;
  participantesMax: number;
  custoUnitario: number;
  objetivo: string;
  evidencia: string;
  status: StatusEvento;
}

export interface PrioridadeP1Item {
  id: string;
  ordem: number;
  clienteId: string;
  acaoRecomendada: string;
  status: "Aberto" | "Em andamento" | "Concluído" | "Atrasado";
}

export interface Produto {
  id: string;
  codigo: string;
  nome: string;
  categoria: CategoriaProduto;
  linha?: string;
  unidade: string;
  fornecedor?: string;
  precoLista: number;
  precoMinimo: number;
  precoPromocional?: number;
  validadePreco?: string;
  custo: number;
  margem?: number;
  estoqueAtual: number;
  estoqueReservado: number;
  localEstoque?: string;
  ultimaAtualizacao?: string;
  ativo: boolean;
  observacoes?: string;
}

export type AplicarSobre =
  | "realizado_empresa" | "realizado_pessoal" | "negocio_fechado"
  | "categoria" | "frente_comercial" | "meta_empresa" | "meta_pessoal";

export interface FaixaComissao { min: number; max: number; percentual: number; }

export interface RegraComissao {
  id: string;
  nome: string;
  tipo: "fixa" | "escalonada";
  percentual?: number;
  faixas?: FaixaComissao[];
  aplicarSobre: AplicarSobre;
  alvo?: string; // categoria/frente quando aplicável
  ativo: boolean;
}
