import type {
  ABC,
  Cliente,
  Negocio,
  OportunidadeComercial,
  Orcamento,
  Prioridade,
  ProximaAcao,
  StatusProximaAcao,
  TipoProximaAcao,
  Vendedor,
} from "@/types";
import { resolverVendedorCanonico } from "@/utils/businessRules";

export type AgendaClassificacao = "Atrasada" | "Pendente hoje" | "Agendada" | "Sem agendamento" | "Concluída";
export type AgendaOrigem = "Ação comercial" | "Cliente" | "Oportunidade" | "Orçamento" | "Negócio" | "Alerta";
export type AgendaVisao = "hoje" | "semana" | "atrasadas" | "sem-agendamento" | "todas";
export type AgendaAlertaTipo =
  | "cliente-a-sem-proxima-acao"
  | "cliente-p1-sem-proxima-acao"
  | "proxima-acao-vencida"
  | "orcamento-aberto-sem-retorno"
  | "negocio-ganho-sem-pos-venda"
  | "cliente-sem-vendedor"
  | "alto-potencial-sem-acao-futura";

export interface AgendaItem {
  id: string;
  sourceId?: string;
  clienteId?: string;
  data?: string;
  horario?: string;
  cliente: string;
  fazenda?: string;
  cidade?: string;
  vendedor: string;
  abc?: ABC;
  prioridade?: Prioridade;
  tipo: TipoProximaAcao | "Sem próxima ação" | "Retorno de orçamento" | "Pós-venda" | "Próxima etapa";
  descricao: string;
  status: StatusProximaAcao | "Sem próxima ação" | "Aberto" | "Ganho";
  origem: AgendaOrigem;
  classificacao: AgendaClassificacao;
  oportunidadeId?: string;
  oportunidadeNome?: string;
  orcamentoId?: string;
  orcamentoCodigo?: string;
  negocioId?: string;
  negocioNome?: string;
  alertaTipo?: AgendaAlertaTipo;
}

export interface AgendaAlerta {
  id: string;
  tipo: AgendaAlertaTipo;
  severidade: "alta" | "media" | "baixa";
  titulo: string;
  detalhe: string;
  clienteId?: string;
  sourceId?: string;
}

export interface AgendaFiltros {
  vendedor?: string;
  data?: string;
  abc?: string;
  prioridade?: string;
  status?: string;
  tipo?: string;
  cliente?: string;
}

export interface AgendaResumo {
  atrasadas: number;
  hoje: number;
  proximos7Dias: number;
  clientesAP1SemProximaAcao: number;
  semAgendamento: number;
}


export interface ClienteBuscaAgenda {
  id: string;
  nome: string;
  fazenda: string;
  cidade: string;
  vendedor: string;
}

function normalizarBuscaAgenda(valor: string | undefined): string {
  return (valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function buscarClientesAgenda(clientes: Cliente[], termo: string, vendedores: Pick<Vendedor, "nome">[] = [], limite = 8): ClienteBuscaAgenda[] {
  const termoNormalizado = normalizarBuscaAgenda(termo);
  if (!termoNormalizado) return [];

  return clientes
    .map((cliente) => ({
      id: cliente.id,
      nome: cliente.nome,
      fazenda: cliente.localidade || cliente.rota || "—",
      cidade: cliente.cidade || "—",
      vendedor: resolverVendedorCanonico(cliente.vendedor, vendedores),
      textoBusca: normalizarBuscaAgenda([cliente.nome, cliente.localidade, cliente.rota, cliente.cidade].filter(Boolean).join(" ")),
    }))
    .filter((cliente) => cliente.textoBusca.includes(termoNormalizado))
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .slice(0, limite)
    .map(({ textoBusca: _textoBusca, ...cliente }) => cliente);
}

export const STATUS_ACAO_CONCLUIDA: StatusProximaAcao[] = ["Realizada", "Concluída", "Cancelada"];
export const STATUS_ACAO_ATIVA: StatusProximaAcao[] = ["Pendente", "Em andamento", "Reagendada"];
const ORCAMENTOS_ABERTOS = ["Rascunho", "Enviado", "Em revisão", "Reenviado", "Aberto", "Em negociação"];
const POS_VENDA_TIPOS: TipoProximaAcao[] = ["Pós-venda", "Entrega", "Acompanhamento técnico", "Conferir aplicação", "Visita pós-venda"];

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

export function isAcaoConcluida(status?: string): boolean {
  return status ? STATUS_ACAO_CONCLUIDA.includes(status as StatusProximaAcao) : false;
}

export function isAcaoAtiva(status?: string): boolean {
  return status ? STATUS_ACAO_ATIVA.includes(status as StatusProximaAcao) : false;
}

export function classificarAgenda(data: string | undefined, status: string | undefined, hojeIso = toIsoDate(new Date())): AgendaClassificacao {
  if (isAcaoConcluida(status)) return "Concluída";
  if (!data) return "Sem agendamento";
  if (data < hojeIso) return "Atrasada";
  if (data === hojeIso) return "Pendente hoje";
  return "Agendada";
}

function clienteDaAcao(acao: ProximaAcao, clientes: Cliente[]) {
  return clientes.find((cliente) => cliente.id === acao.clienteId);
}

function temAcaoFuturaOuHoje(clienteId: string, proximasAcoes: ProximaAcao[], hojeIso: string): boolean {
  return proximasAcoes.some((acao) => acao.clienteId === clienteId && isAcaoAtiva(acao.status) && !!acao.data && acao.data >= hojeIso);
}

function temAcaoAtiva(clienteId: string, proximasAcoes: ProximaAcao[]): boolean {
  return proximasAcoes.some((acao) => acao.clienteId === clienteId && isAcaoAtiva(acao.status));
}

function obterVendedor(cliente: Cliente | undefined, responsavel: string | undefined, vendedores: Pick<Vendedor, "nome">[]): string {
  return resolverVendedorCanonico(responsavel || cliente?.vendedor, vendedores);
}

function getHorario(acao: ProximaAcao): string | undefined {
  return (acao as ProximaAcao & { horario?: string }).horario;
}

function montarClienteInfo(cliente?: Cliente) {
  return {
    cliente: cliente?.nome || "Sem cliente",
    fazenda: cliente?.localidade || cliente?.rota || "—",
    cidade: cliente?.cidade || "—",
    abc: cliente?.abc,
    prioridade: cliente?.prioridade,
  };
}

export function montarItensAgenda(params: {
  clientes: Cliente[];
  proximasAcoes: ProximaAcao[];
  oportunidades?: OportunidadeComercial[];
  orcamentos?: Orcamento[];
  negocios?: Negocio[];
  vendedores?: Pick<Vendedor, "nome">[];
  hojeIso?: string;
}): AgendaItem[] {
  const { clientes, proximasAcoes, oportunidades = [], orcamentos = [], negocios = [], vendedores = [] } = params;
  const hojeIso = params.hojeIso || toIsoDate(new Date());
  const items: AgendaItem[] = [];

  proximasAcoes.forEach((acao) => {
    const cliente = clienteDaAcao(acao, clientes);
    const oportunidade = oportunidades.find((item) => item.id === acao.oportunidadeId);
    const orcamento = orcamentos.find((item) => item.id === acao.orcamentoId);
    const negocio = negocios.find((item) => item.id === acao.negocioId);
    items.push({
      id: `acao-${acao.id}`,
      sourceId: acao.id,
      clienteId: acao.clienteId,
      data: acao.data || undefined,
      horario: getHorario(acao),
      ...montarClienteInfo(cliente),
      vendedor: obterVendedor(cliente, acao.responsavel, vendedores),
      tipo: acao.tipo,
      descricao: acao.descricao || acao.objetivo || "Ação comercial",
      status: acao.status,
      origem: "Ação comercial",
      classificacao: classificarAgenda(acao.data, acao.status, hojeIso),
      oportunidadeId: acao.oportunidadeId,
      oportunidadeNome: oportunidade?.necessidade || oportunidade?.segmento,
      orcamentoId: acao.orcamentoId,
      orcamentoCodigo: orcamento?.codigo,
      negocioId: acao.negocioId,
      negocioNome: negocio?.nome,
      alertaTipo: classificarAgenda(acao.data, acao.status, hojeIso) === "Atrasada" ? "proxima-acao-vencida" : undefined,
    });
  });

  clientes.forEach((cliente) => {
    if (cliente.proximaAcao && !proximasAcoes.some((acao) => acao.clienteId === cliente.id && acao.descricao === cliente.proximaAcao)) {
      items.push({
        id: `cliente-proxima-acao-${cliente.id}`,
        clienteId: cliente.id,
        data: cliente.dataProximaAcao || undefined,
        ...montarClienteInfo(cliente),
        vendedor: obterVendedor(cliente, undefined, vendedores),
        tipo: cliente.tipoProximaAcao || "Outro",
        descricao: cliente.proximaAcao,
        status: "Pendente",
        origem: "Cliente",
        classificacao: classificarAgenda(cliente.dataProximaAcao, "Pendente", hojeIso),
      });
    }
  });

  oportunidades
    .filter((oportunidade) => !["Ganha", "Perdida", "Cancelada"].includes(oportunidade.etapa))
    .forEach((oportunidade) => {
      if (!oportunidade.previsaoFechamento) return;
      const cliente = clientes.find((item) => item.id === oportunidade.clienteId);
      items.push({
        id: `oportunidade-${oportunidade.id}`,
        sourceId: oportunidade.id,
        clienteId: oportunidade.clienteId,
        data: oportunidade.previsaoFechamento,
        ...montarClienteInfo(cliente),
        vendedor: obterVendedor(cliente, oportunidade.responsavel, vendedores),
        tipo: "Próxima etapa",
        descricao: oportunidade.necessidade || `Avançar etapa: ${oportunidade.etapa}`,
        status: "Pendente",
        origem: "Oportunidade",
        classificacao: classificarAgenda(oportunidade.previsaoFechamento, "Pendente", hojeIso),
        oportunidadeId: oportunidade.id,
        oportunidadeNome: oportunidade.necessidade || oportunidade.segmento,
      });
    });

  orcamentos
    .filter((orcamento) => ORCAMENTOS_ABERTOS.includes(orcamento.status))
    .forEach((orcamento) => {
      const cliente = clientes.find((item) => item.id === orcamento.clienteId);
      const dataRetorno = orcamento.dataDecisao || orcamento.validade || orcamento.dataEnvio || orcamento.data;
      items.push({
        id: `orcamento-retorno-${orcamento.id}`,
        sourceId: orcamento.id,
        clienteId: orcamento.clienteId,
        data: dataRetorno || undefined,
        ...montarClienteInfo(cliente),
        vendedor: obterVendedor(cliente, orcamento.responsavel || orcamento.vendedor, vendedores),
        tipo: "Retorno de orçamento",
        descricao: `Retornar orçamento ${orcamento.codigo}`,
        status: "Aberto",
        origem: "Orçamento",
        classificacao: classificarAgenda(dataRetorno, "Pendente", hojeIso),
        oportunidadeId: orcamento.oportunidadeId,
        orcamentoId: orcamento.id,
        orcamentoCodigo: orcamento.codigo,
        negocioId: orcamento.negocioId,
        alertaTipo: "orcamento-aberto-sem-retorno",
      });
    });

  negocios
    .filter((negocio) => negocio.status === "Fechado ganho")
    .filter((negocio) => !proximasAcoes.some((acao) => (acao.negocioId === negocio.id || acao.clienteId === negocio.clienteId) && POS_VENDA_TIPOS.includes(acao.tipo) && isAcaoAtiva(acao.status)))
    .forEach((negocio) => {
      const cliente = clientes.find((item) => item.id === negocio.clienteId);
      items.push({
        id: `negocio-pos-venda-${negocio.id}`,
        sourceId: negocio.id,
        clienteId: negocio.clienteId,
        data: negocio.ultimaAtualizacao || negocio.dataCriacao,
        ...montarClienteInfo(cliente),
        vendedor: obterVendedor(cliente, negocio.responsavel || negocio.vendedor, vendedores),
        tipo: "Pós-venda",
        descricao: `Programar pós-venda do negócio ${negocio.nome || negocio.id}`,
        status: "Ganho",
        origem: "Negócio",
        classificacao: classificarAgenda(negocio.ultimaAtualizacao || negocio.dataCriacao, "Pendente", hojeIso),
        oportunidadeId: negocio.oportunidadeId,
        orcamentoId: negocio.orcamentoId,
        negocioId: negocio.id,
        negocioNome: negocio.nome,
        alertaTipo: "negocio-ganho-sem-pos-venda",
      });
    });

  clientes
    .filter((cliente) => cliente.abc === "A" || cliente.prioridade === "P1")
    .filter((cliente) => !temAcaoAtiva(cliente.id, proximasAcoes) && !cliente.proximaAcao)
    .forEach((cliente) => {
      items.push({
        id: `sem-proxima-acao-${cliente.id}`,
        clienteId: cliente.id,
        ...montarClienteInfo(cliente),
        vendedor: obterVendedor(cliente, undefined, vendedores),
        tipo: "Sem próxima ação",
        descricao: "Cliente prioritário sem ação comercial registrada",
        status: "Sem próxima ação",
        origem: "Alerta",
        classificacao: "Sem agendamento",
        alertaTipo: cliente.abc === "A" ? "cliente-a-sem-proxima-acao" : "cliente-p1-sem-proxima-acao",
      });
    });

  return items.sort((a, b) => (a.data || "9999-12-31").localeCompare(b.data || "9999-12-31") || a.cliente.localeCompare(b.cliente));
}

export function montarAlertasAgenda(params: {
  clientes: Cliente[];
  proximasAcoes: ProximaAcao[];
  orcamentos?: Orcamento[];
  negocios?: Negocio[];
  vendedores?: Pick<Vendedor, "nome">[];
  hojeIso?: string;
}): AgendaAlerta[] {
  const { clientes, proximasAcoes, orcamentos = [], negocios = [], vendedores = [] } = params;
  const hojeIso = params.hojeIso || toIsoDate(new Date());
  const alertas: AgendaAlerta[] = [];

  clientes.forEach((cliente) => {
    const vendedor = resolverVendedorCanonico(cliente.vendedor, vendedores);
    const semAcaoAtiva = !temAcaoAtiva(cliente.id, proximasAcoes) && !cliente.proximaAcao;
    if (cliente.abc === "A" && semAcaoAtiva) {
      alertas.push({ id: `cliente-a-sem-proxima-acao-${cliente.id}`, tipo: "cliente-a-sem-proxima-acao", severidade: "alta", titulo: "Cliente A sem ação comercial", detalhe: cliente.nome, clienteId: cliente.id });
    }
    if (cliente.prioridade === "P1" && semAcaoAtiva) {
      alertas.push({ id: `cliente-p1-sem-proxima-acao-${cliente.id}`, tipo: "cliente-p1-sem-proxima-acao", severidade: "alta", titulo: "Cliente P1 sem ação comercial", detalhe: cliente.nome, clienteId: cliente.id });
    }
    if (vendedor === "Não definido") {
      alertas.push({ id: `cliente-sem-vendedor-${cliente.id}`, tipo: "cliente-sem-vendedor", severidade: "media", titulo: "Cliente sem vendedor", detalhe: cliente.nome, clienteId: cliente.id });
    }
    if ((cliente.potencialTotal || 0) >= 300000 && !temAcaoFuturaOuHoje(cliente.id, proximasAcoes, hojeIso)) {
      alertas.push({ id: `alto-potencial-sem-acao-futura-${cliente.id}`, tipo: "alto-potencial-sem-acao-futura", severidade: "media", titulo: "Cliente com alto potencial sem ação futura", detalhe: cliente.nome, clienteId: cliente.id });
    }
  });

  proximasAcoes
    .filter((acao) => isAcaoAtiva(acao.status) && !!acao.data && acao.data < hojeIso)
    .forEach((acao) => {
      const cliente = clienteDaAcao(acao, clientes);
      alertas.push({ id: `proxima-acao-vencida-${acao.id}`, tipo: "proxima-acao-vencida", severidade: "alta", titulo: "Próxima ação vencida", detalhe: `${cliente?.nome || "Sem cliente"} • ${acao.data}`, clienteId: acao.clienteId, sourceId: acao.id });
    });

  orcamentos
    .filter((orcamento) => ORCAMENTOS_ABERTOS.includes(orcamento.status))
    .forEach((orcamento) => {
      const cliente = clientes.find((item) => item.id === orcamento.clienteId);
      alertas.push({ id: `orcamento-aberto-sem-retorno-${orcamento.id}`, tipo: "orcamento-aberto-sem-retorno", severidade: "media", titulo: "Orçamento em aberto sem retorno", detalhe: `${orcamento.codigo} • ${cliente?.nome || "Sem cliente"}`, clienteId: orcamento.clienteId, sourceId: orcamento.id });
    });

  negocios
    .filter((negocio) => negocio.status === "Fechado ganho")
    .filter((negocio) => !proximasAcoes.some((acao) => (acao.negocioId === negocio.id || acao.clienteId === negocio.clienteId) && POS_VENDA_TIPOS.includes(acao.tipo) && isAcaoAtiva(acao.status)))
    .forEach((negocio) => {
      const cliente = clientes.find((item) => item.id === negocio.clienteId);
      alertas.push({ id: `negocio-ganho-sem-pos-venda-${negocio.id}`, tipo: "negocio-ganho-sem-pos-venda", severidade: "baixa", titulo: "Negócio ganho sem pós-venda", detalhe: `${negocio.nome || negocio.id} • ${cliente?.nome || "Sem cliente"}`, clienteId: negocio.clienteId, sourceId: negocio.id });
    });

  return alertas;
}

export function filtrarItensAgenda(items: AgendaItem[], filtros: AgendaFiltros): AgendaItem[] {
  const termoCliente = (filtros.cliente || "").trim().toLocaleLowerCase("pt-BR");
  return items.filter((item) => {
    if (filtros.vendedor && filtros.vendedor !== "__all__" && item.vendedor !== filtros.vendedor) return false;
    if (filtros.data && item.data !== filtros.data) return false;
    if (filtros.abc && filtros.abc !== "__all__" && item.abc !== filtros.abc) return false;
    if (filtros.prioridade && filtros.prioridade !== "__all__" && item.prioridade !== filtros.prioridade) return false;
    if (filtros.status && filtros.status !== "__all__" && item.status !== filtros.status && item.classificacao !== filtros.status) return false;
    if (filtros.tipo && filtros.tipo !== "__all__" && item.tipo !== filtros.tipo) return false;
    if (termoCliente && ![item.cliente, item.fazenda || "", item.cidade || ""].join(" ").toLocaleLowerCase("pt-BR").includes(termoCliente)) return false;
    return true;
  });
}

export function filtrarPorVisaoAgenda(items: AgendaItem[], visao: AgendaVisao, hojeIso = toIsoDate(new Date())): AgendaItem[] {
  if (visao === "hoje") return items.filter((item) => item.classificacao === "Pendente hoje");
  if (visao === "semana") return items.filter((item) => item.data && item.data >= hojeIso && item.data <= addDaysIso(hojeIso, 7) && !isAcaoConcluida(item.status));
  if (visao === "atrasadas") return items.filter((item) => item.classificacao === "Atrasada");
  if (visao === "sem-agendamento") return items.filter((item) => item.classificacao === "Sem agendamento" && item.status !== "Sem próxima ação");
  return items;
}

export function concluirAcaoAgenda(acoes: ProximaAcao[], acaoId: string, concluidaEm = new Date().toISOString()): ProximaAcao[] {
  return acoes.map((acao) => acao.id === acaoId ? { ...acao, status: "Concluída", dataConclusao: concluidaEm, updatedAt: concluidaEm } as ProximaAcao & { dataConclusao: string } : acao);
}

export function reagendarAcaoAgenda(acoes: ProximaAcao[], acaoId: string, novaData: string, novoHorario?: string, updatedAt = new Date().toISOString()): ProximaAcao[] {
  return acoes.map((acao) => acao.id === acaoId ? { ...acao, data: novaData, horario: novoHorario || getHorario(acao), status: "Reagendada", updatedAt } as ProximaAcao & { horario?: string } : acao);
}

export function criarAcaoRapidaAgenda(params: {
  cliente: Cliente;
  tipo: TipoProximaAcao;
  data?: string;
  observacao?: string;
  descricao?: string;
  vendedor?: string;
  horario?: string;
  now?: string;
  id?: string;
  vendedores?: Pick<Vendedor, "nome">[];
}): ProximaAcao {
  const now = params.now || new Date().toISOString();
  return {
    id: params.id || `pa-agenda-${Date.now()}`,
    clienteId: params.cliente.id,
    responsavel: resolverVendedorCanonico(params.vendedor || params.cliente.vendedor, params.vendedores || []),
    descricao: params.descricao || params.observacao || "Ação rápida da agenda",
    objetivo: params.descricao || "Rotina diária",
    observacoes: params.observacao,
    tipo: params.tipo,
    data: params.data || "",
    status: "Pendente",
    origem: "Avulsa",
    createdAt: now,
    updatedAt: now,
    horario: params.horario,
  } as ProximaAcao & { horario?: string };
}

export function calcularResumoAgenda(items: AgendaItem[], hojeIso = toIsoDate(new Date())): AgendaResumo {
  return {
    atrasadas: items.filter((item) => item.classificacao === "Atrasada").length,
    hoje: items.filter((item) => item.classificacao === "Pendente hoje").length,
    proximos7Dias: items.filter((item) => item.data && item.data >= hojeIso && item.data <= addDaysIso(hojeIso, 7) && item.classificacao !== "Concluída").length,
    clientesAP1SemProximaAcao: items.filter((item) => item.alertaTipo === "cliente-a-sem-proxima-acao" || item.alertaTipo === "cliente-p1-sem-proxima-acao").length,
    semAgendamento: items.filter((item) => item.classificacao === "Sem agendamento" && item.status !== "Sem próxima ação").length,
  };
}

export function vendedoresCanonicosAgenda(clientes: Cliente[], vendedores: Pick<Vendedor, "nome">[]): string[] {
  return Array.from(new Set(["BRUNO", "DOUGLAS", "Não definido", ...clientes.map((cliente) => resolverVendedorCanonico(cliente.vendedor, vendedores))]));
}
