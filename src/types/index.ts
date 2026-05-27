export type ABC = "A" | "B" | "C";
export type Prioridade = "P1" | "P2" | "P3";
export type FrenteComercial = "Venda Direta" | "Nutrição Especial" | "Geo Pampa" | "Canal de Vendas";
export const FRENTES_COMERCIAIS: FrenteComercial[] = ["Venda Direta", "Nutrição Especial", "Geo Pampa", "Canal de Vendas"];
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

export type OrigemNegocio = "Visita" | "Ligação" | "WhatsApp" | "Evento" | "Indicação" | "Manual" | "Outro";

export type OrigemOportunidade = "Visita" | "WhatsApp" | "Ligação" | "Indicação" | "Manual" | "Outro";
export type EtapaOportunidade = "Identificada" | "Qualificação" | "Necessidade definida" | "Orçamento em elaboração" | "Orçamento enviado" | "Negociação" | "Ganha" | "Perdida" | "Cancelada";
export type MotivoPerdaOportunidade = "Preço" | "Prazo" | "Concorrente" | "Condição de pagamento" | "Cliente adiou decisão" | "Sem interesse" | "Crédito" | "Produto indisponível" | "Outro";

export type CategoriaProduto = string;
export const CATEGORIAS_PRODUTO_PADRAO = ["Adjuvantes", "Nutrição", "Fertilizantes", "Sementes", "Defensivos", "Biológicos", "Outros"] as const;
export const CATEGORIAS_PRODUTO: CategoriaProduto[] = [...CATEGORIAS_PRODUTO_PADRAO];


export type TipoProximaAcao = "Visita" | "Ligação" | "WhatsApp" | "Reunião" | "Follow-up" | "Orçamento" | "Enviar orçamento" | "Cobrar retorno" | "Pós-venda" | "Entrega" | "Acompanhamento técnico" | "Conferir aplicação" | "Visita pós-venda" | "Cobrança comercial futura" | "Renovação" | "Outro";
export type StatusProximaAcao = "Pendente" | "Em andamento" | "Realizada" | "Reagendada" | "Cancelada" | "Concluída";

export interface ProximaAcao {
  id: string;
  clienteId?: string;
  negocioId?: string;
  oportunidadeId?: string;
  oportunidadeId?: string;
  orcamentoId?: string;
  responsavel?: string;
  descricao: string;
  objetivo?: string;
  observacoes?: string;
  itensEstimados?: OportunidadeItemEstimado[];
  segmento?: string;
  responsavel?: string;
  proximaAcaoId?: string;
  dataPrevistaFechamento?: string;
  dataDecisao?: string;
  motivoPerda?: string;
  tipo: TipoProximaAcao;
  data: string;
  status: StatusProximaAcao;
  origem?: "Cliente" | "Lançamento" | "Negócio" | "Orçamento" | "Avulsa";
  createdAt: string;
  updatedAt: string;
}

export interface Vendedor { id: string; nome: string; telefone?: string; email?: string; ativo: boolean; }
export interface PrazoPagamento { id: string; nome: string; ativo: boolean; padrao: boolean; }

export interface ClienteCulturaArea {
  id: string;
  cultura: string;
  areaHa: number;
}

export interface Cliente {
  id: string;
  nome: string;
  abc: ABC;
  prioridade: Prioridade;
  rota: string;
  cidade: string;
  localidade?: string;
  latitude?: number;
  longitude?: number;
  coordenadas?: string;
  linkMapa?: string;
  observacaoLocalizacao?: string;
  culturas?: string;
  culturasDetalhes?: ClienteCulturaArea[];
  areaHa: number;
  potencialTotal: number;
  potencialAdj?: number;
  potencialNutri?: number;
  statusAtual: string;
  observacao?: string;
  motivoAbc?: string;
  frequenciaRetorno: string;
  retorno: string;
  potencialCalculado?: boolean;
  inativoManual?: boolean;
  vendedor?: string;
  produtosInteresse?: string[];
  documento?: string;
  inscricaoEstadual?: string;
  endereco?: string;
  telefone?: string;
  email?: string;
  nomeContato?: string;
  culturaPrincipal?: string;
  areaAplicacaoPotencial?: string;
  proximaAcao?: string;
  dataProximaAcao?: string;
  tipoProximaAcao?: TipoProximaAcao;
  ultimaVisita?: string;
}

export interface AppConfig {
  id: string;
  percentualAcertoEsperado: number;
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
  oportunidadeId?: string;
  proximaAcao?: string;
  dataProximaAcao?: string;
  tipoProximaAcao?: TipoProximaAcao;
}

export interface Negocio {
  oportunidadeId?: string;
  orcamentoId?: string;
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
  previsaoFechamento?: string;
  dataCriacao: string;
  ultimaAtualizacao: string;
  proximaAcao?: string;
  dataProximaAcao?: string;
  motivoPerda?: string;
  observacoes?: string;
  itensEstimados?: OportunidadeItemEstimado[];
  segmento?: string;
  responsavel?: string;
  proximaAcaoId?: string;
  dataPrevistaFechamento?: string;
  dataDecisao?: string;
  motivoPerda?: string;
  lancamentoId?: string;
}


export interface OportunidadeItemEstimado {
  produtoId: string;
  produtoNome?: string;
  categoria?: string;
  unidadeProduto?: string;
  dosePorHa?: number;
  unidadeDose?: UnidadeDose;
  areaHa?: number;
  quantidadeTotal?: number;
  precoUnitario?: number;
  valorTotalItem?: number;
  custoPorHaItem?: number;
  observacoes?: string;
}

export interface OportunidadeComercial {
  id: string;
  clienteId: string;
  origem: OrigemOportunidade;
  segmento?: string;
  necessidade?: string;
  valorEstimado?: number;
  responsavel?: string;
  etapa: EtapaOportunidade;
  previsaoFechamento?: string;
  probabilidade?: number;
  observacoes?: string;
  itensEstimados?: OportunidadeItemEstimado[];
  dataFechamento?: string;
  valorFinal?: number;
  motivoPerda?: MotivoPerdaOportunidade;
  concorrente?: string;
  createdAt: string;
  updatedAt: string;
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
  unidade: "LT" | "GAL" | "BD" | "TON" | "KG";
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
  itensEstimados?: OportunidadeItemEstimado[];
  segmento?: string;
  responsavel?: string;
  proximaAcaoId?: string;
  dataPrevistaFechamento?: string;
  dataDecisao?: string;
  motivoPerda?: string;
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


export interface TicketMedioRegra { id: string; categoria: CategoriaProduto; valorMedioHa: number; ativo: boolean; }

export interface FormaPagamento {
  id: string;
  nome: string;
  ativo: boolean;
  padrao: boolean;
  logoDataUrl?: string;
}

export type BaseMode = "teste" | "operacional";

export interface ImportLog {
  id: string;
  arquivo: string;
  dataHora: string;
  entidade: string;
  registrosLidos: number;
  registrosCriados: number;
  registrosAtualizados: number;
  registrosIgnorados: number;
  erros: number;
  avisos: number;
}

export interface NegocioProdutoItem { produtoId: string; quantidade: number; precoUnitario: number; }

export type OrcamentoStatus = "Rascunho" | "Enviado" | "Em revisão" | "Reenviado" | "Aprovado" | "Perdido" | "Expirado" | "Cancelado" | "Aberto" | "Em negociação" | "Recusado" | "Vencido" | "Reprovado";
export type UnidadeDose = "L/ha" | "mL/ha" | "kg/ha" | "g/ha" | "ton/ha" | "un/ha";

export interface OrcamentoItem {
  id: string;
  produtoId: string;
  produtoNome: string;
  categoria: string;
  unidadeProduto: "LT" | "KG" | "TON" | "GAL" | "BD";
  dosePorHa: number;
  unidadeDose: UnidadeDose;
  areaHa: number;
  quantidadeTotal: number;
  precoUnitario: number;
  valorTotalItem: number;
  custoPorHaItem: number;
  observacoes?: string;
  itensEstimados?: OportunidadeItemEstimado[];
  segmento?: string;
  responsavel?: string;
  proximaAcaoId?: string;
  dataPrevistaFechamento?: string;
  dataDecisao?: string;
  motivoPerda?: string;
}

export interface Orcamento {
  versao?: number;
  orcamentoOrigemId?: string;
  substituiOrcamentoId?: string;
  motivoRevisao?: string;
  canalEnvio?: "WhatsApp" | "E-mail" | "Presencial" | "Ligação" | "Outro";
  dataEnvio?: string;
  empresaId?: string;
  id: string;
  codigo: string;
  clienteId: string;
  negocioId?: string;
  oportunidadeId?: string;
  vendedor: string;
  data: string;
  validade?: string;
  status: OrcamentoStatus;
  areaAplicacaoHa: number;
  itens: OrcamentoItem[];
  subtotal: number;
  descontoTotal: number;
  valorTotal: number;
  custoPorHectare: number;
  formaPagamento?: string;
  prazoPagamento?: string;
  observacoes?: string;
  itensEstimados?: OportunidadeItemEstimado[];
  segmento?: string;
  responsavel?: string;
  proximaAcaoId?: string;
  dataPrevistaFechamento?: string;
  dataDecisao?: string;
  motivoPerda?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Empresa {
  id: string;
  nomeFantasia: string;
  razaoSocial: string;
  cnpj: string;
  inscricaoEstadual: string;
  endereco: string;
  cidadeUf: string;
  telefone: string;
  email: string;
  consultorPadrao: string;
  observacoesComerciaisPadrao: string;
  ativa: boolean;
  padrao: boolean;
  logoDataUrl?: string;
}

export interface DadosEmpresa {
  id: string;
  nomeFantasia?: string;
  razaoSocial?: string;
  cnpj?: string;
  inscricaoEstadual?: string;
  endereco?: string;
  cidadeUf?: string;
  telefone?: string;
  email?: string;
  consultorPadrao?: string;
  observacoesComerciaisPadrao?: string;
}

export interface RegraComercialConfig {
  id: string;
  key: "showCustoPorHectare";
  value: boolean;
}
