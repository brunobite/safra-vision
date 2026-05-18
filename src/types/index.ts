export type ABC = "A" | "B" | "C";
export type Prioridade = "P1" | "P2" | "P3";
export type FrenteComercial = "Venda Direta" | "Cooperagro" | "Tritec" | "Nutrição Especial" | "Geo Pampa";
export type StatusLancamento = "Aberto" | "Concluído" | "Atrasado" | "Cancelado" | "Aguardando cliente" | "Aguardando parceiro" | "Em negociação";
export type TipoLancamento = "Visita" | "Ligação" | "WhatsApp" | "Proposta" | "Venda" | "Evento" | "Orçamento" | "Em negociação";
export type StatusEvento = "Aprovar" | "Planejar" | "Em andamento" | "Concluído" | "Cancelado";

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
}

export interface Lancamento {
  id: string;
  data: string; // ISO yyyy-mm-dd
  clienteId: string;
  tipo: TipoLancamento;
  frente: FrenteComercial;
  status: StatusLancamento;
  vendaRs: number;
  comissaoRs: number;
  km: number;
  despesaRs: number;
  eventoAcao?: string;
  observacao?: string;
}

export interface MetaEmpresa {
  id: string;
  mes: string; // YYYY-MM
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
  participacao: number; // %
  percComissao: number; // %
  metaFaturamento: number;
  observacao?: string;
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