import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, ExternalLink, Filter, Plus, RotateCcw } from "lucide-react";
import { useAppStore } from "@/store/AppStore";
import { useAuth } from "@/store/AuthStore";
import type { AgendaItem, AgendaVisao } from "@/utils/agenda";
import {
  buscarClientesAgenda,
  calcularResumoAgenda,
  concluirAcaoAgenda,
  criarAcaoRapidaAgenda,
  filtrarItensAgenda,
  filtrarPorVisaoAgenda,
  montarAlertasAgenda,
  montarItensAgenda,
  reagendarAcaoAgenda,
  vendedoresCanonicosAgenda,
} from "@/utils/agenda";
import type { ABC, CategoriaProduto, Prioridade, ProximaAcao, StatusProximaAcao, TipoProximaAcao } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { buildAgendaItemIcs, buildCalendarEventFromAgendaItem, ensureGoogleCalendarAccess, getGoogleCalendarBackendStatus, getGoogleCalendarClientId, isGoogleCalendarPreferenceEnabled, metadataAfterGoogleCalendarDelete, metadataAfterGoogleCalendarError, metadataAfterGoogleCalendarReschedule, metadataAfterGoogleCalendarSuccess, setGoogleCalendarPreferenceEnabled, upsertGoogleCalendarEventForAgendaItem, upsertGoogleCalendarEventViaBackend } from "@/lib/googleCalendar";

const TIPOS: TipoProximaAcao[] = ["Visita", "Ligação", "WhatsApp", "Reunião", "Follow-up", "Enviar orçamento", "Cobrar retorno", "Pós-venda", "Renovação", "Outro"];
const STATUS: StatusProximaAcao[] = ["Pendente", "Em andamento", "Realizada", "Reagendada", "Cancelada", "Concluída"];
const ABCS: ABC[] = ["A", "B", "C"];
const PRIORIDADES: Prioridade[] = ["P1", "P2", "P3"];
const VISOES: Array<{ value: AgendaVisao; label: string }> = [
  { value: "hoje", label: "Hoje" },
  { value: "semana", label: "Próximos 7 dias" },
  { value: "atrasadas", label: "Atrasados" },
  { value: "sem-agendamento", label: "Sem agendamento" },
  { value: "todas", label: "Todas" },
];

type AgendaFlowForm = { clienteId: string; clienteBusca: string; data: string; horario: string; descricao: string; tipo: TipoProximaAcao; observacao: string; vendedor: string };
type OportunidadeItemForm = { produtoId: string; quantidade: number; unidade: string; precoUnitario: number };

const nowParts = () => {
  const now = new Date();
  return { iso: now.toISOString(), data: now.toISOString().slice(0, 10), horario: now.toTimeString().slice(0, 5) };
};

const emptyFlowForm = (tipo: TipoProximaAcao = "Visita"): AgendaFlowForm => ({ clienteId: "", clienteBusca: "", data: "", horario: "", descricao: "", tipo, observacao: "", vendedor: "" });

export default function Agenda() {
  const { session } = useAuth();
  const { clientes, vendedores, proximasAcoes, setProximasAcoes, oportunidades, setOportunidades, orcamentos, negocios, setNegocios, lancamentos, setLancamentos, produtos } = useAppStore();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const hoje = new Date().toISOString().slice(0, 10);

  const [visao, setVisao] = useState<AgendaVisao>("hoje");
  const [filtros, setFiltros] = useState({ vendedor: "__all__", data: "", abc: "__all__", prioridade: "__all__", status: "__all__", tipo: "__all__", cliente: "" });
  const [draftFiltros, setDraftFiltros] = useState(filtros);
  const [filtrosOpen, setFiltrosOpen] = useState(false);
  const [modal, setModal] = useState<"agendar" | "visita" | "pergunta" | "oportunidade" | "marcarPergunta" | "novaAcao" | null>(null);
  const [flowForm, setFlowForm] = useState<AgendaFlowForm>(emptyFlowForm());
  const [contexto, setContexto] = useState<{ clienteId: string; vendedor?: string; lancamentoId?: string; oportunidadeId?: string; negocioId?: string } | null>(null);
  const [oppForm, setOppForm] = useState({ descricao: "", previsaoFechamento: "" });
  const [oppItems, setOppItems] = useState<OportunidadeItemForm[]>([{ produtoId: "", quantidade: 1, unidade: "", precoUnitario: 0 }]);
  const [reschedule, setReschedule] = useState<Record<string, { data: string; horario: string }>>({});
  const [enviarGoogleCalendarNoSalvar, setEnviarGoogleCalendarNoSalvar] = useState(false);

  const itens = useMemo(() => montarItensAgenda({ clientes, proximasAcoes, oportunidades, orcamentos, negocios, vendedores, hojeIso: hoje }), [clientes, proximasAcoes, oportunidades, orcamentos, negocios, vendedores, hoje]);
  const alertas = useMemo(() => montarAlertasAgenda({ clientes, proximasAcoes, orcamentos, negocios, vendedores, hojeIso: hoje }), [clientes, proximasAcoes, orcamentos, negocios, vendedores, hoje]);
  const resumo = useMemo(() => calcularResumoAgenda(itens, hoje), [itens, hoje]);
  const vendedoresCanonicos = useMemo(() => vendedoresCanonicosAgenda(clientes, vendedores), [clientes, vendedores]);
  const clientesEncontrados = useMemo(() => buscarClientesAgenda(clientes, flowForm.clienteBusca, vendedores), [clientes, flowForm.clienteBusca, vendedores]);
  const clienteSelecionado = useMemo(() => clientes.find((cliente) => cliente.id === flowForm.clienteId), [clientes, flowForm.clienteId]);
  const vendedorSelecionado = useMemo(() => flowForm.vendedor || (clienteSelecionado ? buscarClientesAgenda([clienteSelecionado], clienteSelecionado.nome, vendedores, 1)[0]?.vendedor || clienteSelecionado.vendedor || "" : ""), [clienteSelecionado, flowForm.vendedor, vendedores]);
  const vendedoresAtivos = useMemo(() => Array.from(new Set(vendedores.filter((vendedor) => vendedor.ativo).map((vendedor) => vendedor.nome).filter(Boolean))), [vendedores]);
  const vendedoresOpcoes = useMemo(() => Array.from(new Set([...vendedoresAtivos, ...vendedoresCanonicos.filter((vendedor) => vendedor !== "Não definido"), flowForm.vendedor, contexto?.vendedor].filter(Boolean))), [contexto?.vendedor, flowForm.vendedor, vendedoresAtivos, vendedoresCanonicos]);
  const itensFiltrados = useMemo(() => filtrarItensAgenda(filtrarPorVisaoAgenda(itens, visao, hoje), filtros), [itens, visao, filtros, hoje]);
  const filtrosAtivos = useMemo(() => Object.values(filtros).filter((valor) => valor && valor !== "__all__").length, [filtros]);
  const valorEstimadoTotal = useMemo(() => oppItems.reduce((total, item) => total + (Number(item.quantidade) || 0) * (Number(item.precoUnitario) || 0), 0), [oppItems]);
  const googleCalendarClientIdConfigurado = Boolean(getGoogleCalendarClientId());
  const [googleCalendarBackendConnected, setGoogleCalendarBackendConnected] = useState(false);
  const googleCalendarPreferenciaAtiva = isGoogleCalendarPreferenceEnabled() || googleCalendarBackendConnected;

  useEffect(() => {
    let cancelled = false;
    if (!session?.access_token) {
      setGoogleCalendarBackendConnected(false);
      return;
    }
    void getGoogleCalendarBackendStatus()
      .then((status) => { if (!cancelled) setGoogleCalendarBackendConnected(status.connected); })
      .catch(() => { if (!cancelled) setGoogleCalendarBackendConnected(false); });
    return () => { cancelled = true; };
  }, [session?.access_token]);

  useEffect(() => {
    const action = params.get("action");
    if (!action) return;
    const clienteId = params.get("clienteId") || undefined;
    if (action === "agendar-visita") abrirAgendamento(clienteId);
    if (action === "visita-concluida") abrirVisitaConcluida(clienteId);
    if (action === "nova-acao") abrirNovaAcaoAvulsa(clienteId, (params.get("tipo") as TipoProximaAcao) || undefined);
    setParams({});
  }, [params, setParams]);

  const preencherCliente = (clienteId: string) => {
    const cliente = clientes.find((item) => item.id === clienteId);
    const vendedor = cliente?.vendedor ? buscarClientesAgenda([cliente], cliente.nome, vendedores, 1)[0]?.vendedor || cliente.vendedor : "";
    setFlowForm((atual) => ({ ...atual, clienteId, clienteBusca: cliente?.nome || atual.clienteBusca, vendedor }));
  };

  const abrirAgendamento = (clienteId?: string) => {
    const cliente = clientes.find((item) => item.id === clienteId);
    setFlowForm({ ...emptyFlowForm("Visita"), clienteId: cliente?.id || "", clienteBusca: cliente?.nome || "", vendedor: cliente?.vendedor || "", data: hoje, descricao: "Visita agendada" });
    setEnviarGoogleCalendarNoSalvar(googleCalendarBackendConnected || (googleCalendarClientIdConfigurado && isGoogleCalendarPreferenceEnabled()));
    setContexto(null);
    setModal("agendar");
  };

  const abrirVisitaConcluida = (clienteId?: string) => {
    setEnviarGoogleCalendarNoSalvar(false);
    const agora = nowParts();
    const cliente = clientes.find((item) => item.id === clienteId);
    setFlowForm({ ...emptyFlowForm("Visita"), clienteId: cliente?.id || "", clienteBusca: cliente?.nome || "", vendedor: cliente?.vendedor || "", data: agora.data, horario: agora.horario, descricao: "Visita concluída" });
    setContexto(null);
    setModal("visita");
  };

  const abrirNovaAcaoAvulsa = (clienteId?: string, tipo: TipoProximaAcao = "Follow-up") => {
    const cliente = clientes.find((item) => item.id === clienteId);
    setFlowForm({ ...emptyFlowForm(tipo), clienteId: cliente?.id || "", clienteBusca: cliente?.nome || "", vendedor: cliente?.vendedor || "", data: hoje, descricao: tipo === "Follow-up" ? "Nova ação comercial" : tipo });
    setEnviarGoogleCalendarNoSalvar(googleCalendarBackendConnected || (googleCalendarClientIdConfigurado && isGoogleCalendarPreferenceEnabled()));
    setContexto(null);
    setModal("novaAcao");
  };

  const criarAcaoAgenda = (status: StatusProximaAcao, origem: "Cliente" | "Lançamento" | "Negócio" | "Orçamento" | "Avulsa", extra: Partial<ReturnType<typeof criarAcaoRapidaAgenda>> = {}) => {
    const cliente = clientes.find((item) => item.id === (flowForm.clienteId || contexto?.clienteId));
    if (!cliente) return null;
    const dataHoraInicio = `${flowForm.data || hoje}T${flowForm.horario || "00:00"}:00`;
    const acao = {
      ...criarAcaoRapidaAgenda({ cliente, tipo: flowForm.tipo, data: flowForm.data || hoje, horario: flowForm.horario, descricao: flowForm.descricao, observacao: flowForm.observacao, vendedor: flowForm.vendedor, vendedores }),
      status,
      origem,
      responsavel: flowForm.vendedor || vendedorSelecionado,
      objetivo: flowForm.descricao,
      googleCalendarSyncStatus: "pending",
      googleCalendarStatus: "not_synced",
      googleCalendarEventId: "",
      dataHoraInicio,
      dataHoraFim: dataHoraInicio,
      ...extra,
    };
    return acao;
  };

  const executarUpsertGoogleCalendar = async (payload: ReturnType<typeof montarGoogleCalendarPayload>) => {
    if (googleCalendarBackendConnected && session?.access_token) {
      const event = await upsertGoogleCalendarEventViaBackend(payload);
      return { ...event, calendarId: event.calendarId || payload.googleCalendarCalendarId };
    }
    await ensureGoogleCalendarAccess({ interactive: !isGoogleCalendarPreferenceEnabled() });
    const event = await upsertGoogleCalendarEventForAgendaItem(payload);
    setGoogleCalendarPreferenceEnabled(true);
    return { ...event, calendarId: payload.googleCalendarCalendarId };
  };

  const salvarAgendamento = async () => {
    if (!flowForm.clienteId || !flowForm.data) return toast.error("Selecione cliente e data da visita.");
    if (!flowForm.vendedor) return toast.error("Selecione o vendedor responsável pela visita.");
    const acao = criarAcaoAgenda("Pendente", "Avulsa", { descricao: flowForm.descricao || "Visita agendada", tipo: "Visita" });
    if (!acao) return;
    const acaoLocal = { ...acao, observacoes: flowForm.observacao || "Status Agenda e Visitas: Agendada" };
    setProximasAcoes((atuais) => [acaoLocal, ...atuais]);
    setModal(null);
    if (!enviarGoogleCalendarNoSalvar || !googleCalendarClientIdConfigurado) {
      toast.success("Visita futura agendada sem entrar no funil de vendas.");
      return;
    }
    await sincronizarAcaoCriadaNoGoogleCalendar(acaoLocal, "Visita agendada e enviada ao Google Calendar.", "Visita salva no Safra Vision, mas houve erro ao enviar ao Google Calendar.");
  };

  const salvarVisitaConcluida = () => {
    const cliente = clientes.find((item) => item.id === flowForm.clienteId);
    if (!cliente || !flowForm.data) return toast.error("Selecione cliente e data da visita concluída.");
    if (!flowForm.vendedor) return toast.error("Selecione o vendedor responsável pela visita.");
    const agora = nowParts();
    const lancamentoId = `lan${Date.now()}`;
    const dataHoraInicio = `${flowForm.data}T${flowForm.horario || agora.horario}:00`;
    setLancamentos((atuais) => [{
      id: lancamentoId,
      data: flowForm.data,
      clienteId: cliente.id,
      tipo: "Visita",
      frente: "Venda Direta",
      status: "Concluído",
      vendedor: flowForm.vendedor || vendedorSelecionado,
      geraOportunidade: false,
      observacao: flowForm.observacao,
      oQueFoiRealizado: flowForm.descricao || "Visita concluída",
      googleCalendarSyncStatus: "not_required",
      googleCalendarStatus: "not_synced",
      googleCalendarEventId: "",
      dataHoraInicio,
      dataHoraFim: dataHoraInicio,
    }, ...atuais]);
    setContexto({ clienteId: cliente.id, vendedor: flowForm.vendedor || vendedorSelecionado, lancamentoId });
    setModal("pergunta");
  };

  const somenteVisita = () => {
    toast.success("Visita salva no histórico do cliente sem criar oportunidade.");
    setModal("marcarPergunta");
  };

  const iniciarOportunidade = () => {
    setOppForm({ descricao: flowForm.descricao || "Oportunidade gerada por visita concluída", previsaoFechamento: "" });
    setOppItems([{ produtoId: "", quantidade: 1, unidade: "", precoUnitario: 0 }]);
    setModal("oportunidade");
  };

  const salvarOportunidade = () => {
    if (!contexto?.clienteId) return toast.error("Fluxo de visita não encontrado.");
    if (!contexto.vendedor) return toast.error("Selecione o vendedor responsável pela oportunidade.");
    const now = new Date().toISOString();
    const oportunidadeId = `op${Date.now()}`;
    const itensEstimados = oppItems.filter((item) => item.produtoId).map((item) => {
      const produto = produtos.find((p) => p.id === item.produtoId);
      return { produtoId: item.produtoId, produtoNome: produto?.nome, categoria: produto?.categoria, unidadeProduto: item.unidade || produto?.unidade, quantidadeTotal: item.quantidade, precoUnitario: item.precoUnitario, valorTotalItem: item.quantidade * item.precoUnitario };
    });
    setOportunidades((atuais) => [{
      id: oportunidadeId,
      clienteId: contexto.clienteId,
      origem: "Visita",
      necessidade: oppForm.descricao,
      valorEstimado: valorEstimadoTotal,
      responsavel: contexto.vendedor,
      etapa: "Identificada",
      lancamentoId: contexto.lancamentoId,
      previsaoFechamento: oppForm.previsaoFechamento,
      observacoes: `Origem: Visita concluída${contexto.lancamentoId ? ` • lançamento ${contexto.lancamentoId}` : ""}`,
      itensEstimados,
      createdAt: now,
      updatedAt: now,
    }, ...atuais]);
    const negocioId = `neg${Date.now()}`;
    setNegocios((atuais) => [{
      id: negocioId,
      oportunidadeId,
      nome: oppForm.descricao || "Oportunidade criada",
      clienteId: contexto.clienteId,
      vendedor: contexto.vendedor || "Não definido",
      origem: "Visita",
      produtos: itensEstimados.map((item) => item.produtoId),
      categoria: (itensEstimados[0]?.categoria || "Outros") as CategoriaProduto,
      valorPotencial: valorEstimadoTotal,
      status: "Novo",
      dataCriacao: now.slice(0, 10),
      ultimaAtualizacao: now,
      observacoes: "Etapa inicial = Oportunidade criada; status = Aberta; origem = Visita concluída",
      itensEstimados,
      lancamentoId: contexto.lancamentoId,
    }, ...atuais]);
    if (contexto.lancamentoId) {
      setLancamentos((atuais) => atuais.map((lancamento) => lancamento.id === contexto.lancamentoId ? { ...lancamento, oportunidadeId, negocioId, geraOportunidade: true } : lancamento));
    }
    setContexto((atual) => atual ? { ...atual, oportunidadeId, negocioId } : atual);
    setModal("marcarPergunta");
    toast.success("Oportunidade criada no funil a partir da visita concluída.");
  };

  const prepararNovaAcaoDoContexto = () => {
    const cliente = clientes.find((item) => item.id === contexto?.clienteId);
    setFlowForm({ ...emptyFlowForm("Follow-up"), clienteId: contexto?.clienteId || "", clienteBusca: cliente?.nome || "", vendedor: contexto?.vendedor || cliente?.vendedor || "", data: hoje, descricao: "Próxima ação comercial" });
    setEnviarGoogleCalendarNoSalvar(googleCalendarBackendConnected || (googleCalendarClientIdConfigurado && isGoogleCalendarPreferenceEnabled()));
    setModal("novaAcao");
  };

  const salvarNovaAcao = async () => {
    if (!flowForm.data) return toast.error("Informe a data da nova ação.");
    if (!flowForm.vendedor) return toast.error("Selecione o vendedor responsável pela ação.");
    const acao = criarAcaoAgenda("Pendente", contexto?.oportunidadeId ? "Negócio" : "Avulsa", { oportunidadeId: contexto?.oportunidadeId, negocioId: contexto?.negocioId, lancamentoId: contexto?.lancamentoId });
    if (!acao) return toast.error("Selecione um cliente para a nova ação.");
    setProximasAcoes((atuais) => [acao, ...atuais]);
    setModal(null);
    if (!enviarGoogleCalendarNoSalvar || !googleCalendarClientIdConfigurado) {
      toast.success("Próxima ação salva na Agenda e Visitas e vinculada ao fluxo atual.");
      return;
    }
    await sincronizarAcaoCriadaNoGoogleCalendar(acao, "Próxima ação salva e enviada ao Google Calendar.", "Próxima ação salva no Safra Vision, mas houve erro ao enviar ao Google Calendar.");
  };

  const concluir = (acaoId?: string) => {
    if (!acaoId) return;
    const acao = proximasAcoes.find((item) => item.id === acaoId);
    const concluidaEm = new Date().toISOString();
    if (acao?.tipo === "Visita") {
      const cliente = clientes.find((item) => item.id === acao.clienteId);
      const agora = nowParts();
      const existente = lancamentos.find((lancamento) => lancamento.id === acao.lancamentoId || lancamento.proximaAcaoId === acao.id || lancamento.origemAcaoId === acao.id || lancamento.acaoAgendaId === acao.id);
      const lancamentoId = existente?.id || acao.lancamentoId || `lan${Date.now()}`;
      const vendedor = acao.responsavel || cliente?.vendedor || "";
      const dataConclusao = agora.data || acao.data || hoje;
      const dataHoraInicio = acao.dataHoraInicio || `${acao.data || dataConclusao}T${acao.horario || agora.horario}:00`;
      const dataHoraFim = `${dataConclusao}T${agora.horario}:00`;

      if (!existente) {
        setLancamentos((atuais) => [{
          id: lancamentoId,
          clienteId: acao.clienteId || "",
          data: dataConclusao,
          tipo: "Visita",
          frente: "Venda Direta",
          status: "Concluído",
          vendedor,
          observacao: acao.observacoes,
          oQueFoiRealizado: acao.descricao,
          dataHoraInicio,
          dataHoraFim,
          googleCalendarSyncStatus: "not_required",
          googleCalendarStatus: "not_synced",
          googleCalendarEventId: "",
          oportunidadeId: acao.oportunidadeId,
          negocioId: acao.negocioId,
          orcamentoId: acao.orcamentoId,
          proximaAcaoId: acao.id,
          origemAcaoId: acao.id,
          acaoAgendaId: acao.id,
        }, ...atuais]);
      }

      setProximasAcoes((atuais) => atuais.map((item) => item.id === acaoId ? { ...item, status: "Concluída", dataConclusao: concluidaEm, updatedAt: concluidaEm, lancamentoId } : item));
      setFlowForm({ clienteId: acao.clienteId || "", clienteBusca: cliente?.nome || "", vendedor, data: dataConclusao, horario: agora.horario, descricao: acao.descricao, tipo: "Visita", observacao: acao.observacoes || "" });
      setContexto({ clienteId: acao.clienteId || "", vendedor, lancamentoId, oportunidadeId: acao.oportunidadeId, negocioId: acao.negocioId });
      setModal("pergunta");
    } else {
      setProximasAcoes((atuais) => concluirAcaoAgenda(atuais, acaoId, concluidaEm));
      abrirNovaAcaoAvulsa();
    }
  };

  const montarGoogleCalendarPayload = (acao: ProximaAcao) => {
    const cliente = clientes.find((item) => item.id === acao.clienteId);
    return {
      ...acao,
      cliente: cliente?.nome,
      fazenda: cliente?.localidade || cliente?.rota,
      cidade: cliente?.cidade,
      vendedor: acao.responsavel || cliente?.vendedor,
    };
  };

  const agendaItemGooglePayload = (acaoId?: string) => {
    const acao = proximasAcoes.find((item) => item.id === acaoId);
    if (!acao) throw new Error("Ação comercial não encontrada para sincronizar.");
    return montarGoogleCalendarPayload(acao);
  };

  const sincronizarAcaoCriadaNoGoogleCalendar = async (acao: ProximaAcao, mensagemSucesso: string, mensagemErro: string) => {
    try {
      const payload = montarGoogleCalendarPayload(acao);
      buildCalendarEventFromAgendaItem(payload);
      const event = await executarUpsertGoogleCalendar(payload);
      const metadata = metadataAfterGoogleCalendarSuccess(event, event.calendarId || payload.googleCalendarCalendarId);
      setProximasAcoes((atuais) => atuais.map((item) => item.id === acao.id ? { ...item, ...metadata, googleCalendarSyncStatus: "synced" } : item));
      toast.success(mensagemSucesso);
    } catch (error) {
      const metadata = metadataAfterGoogleCalendarError(error);
      setProximasAcoes((atuais) => atuais.map((item) => item.id === acao.id ? { ...item, ...metadata, googleCalendarSyncStatus: "error" } : item));
      toast.error(mensagemErro);
    }
  };

  const sincronizarGoogleCalendar = async (acaoId?: string) => {
    if (!acaoId) return;
    try {
      const payload = agendaItemGooglePayload(acaoId);
      buildCalendarEventFromAgendaItem(payload);
      const event = await executarUpsertGoogleCalendar(payload);
      const metadata = metadataAfterGoogleCalendarSuccess(event, event.calendarId || payload.googleCalendarCalendarId);
      setProximasAcoes((atuais) => atuais.map((acao) => acao.id === acaoId ? { ...acao, ...metadata, googleCalendarSyncStatus: "synced" } : acao));
      toast.success(event.operation === "created" ? "Evento criado no Google Calendar." : "Evento atualizado no Google Calendar.");
    } catch (error) {
      const metadata = metadataAfterGoogleCalendarError(error);
      setProximasAcoes((atuais) => atuais.map((acao) => acao.id === acaoId ? { ...acao, ...metadata, googleCalendarSyncStatus: "error" } : acao));
      toast.error(metadata.googleCalendarLastError || "Erro ao sincronizar Google Calendar.");
    }
  };

  const removerVinculoGoogleCalendar = async (acaoId?: string) => {
    if (!acaoId) return;
    const metadata = metadataAfterGoogleCalendarDelete();
    setProximasAcoes((atuais) => atuais.map((acao) => acao.id === acaoId ? { ...acao, ...metadata, googleCalendarSyncStatus: "not_required" } : acao));
    toast.success("Vínculo com Google Calendar removido do Safra Vision.");
  };

  const exportarIcsGoogleCalendar = (acaoId?: string) => {
    try {
      const payload = agendaItemGooglePayload(acaoId);
      const ics = buildAgendaItemIcs(payload);
      const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `safra-vision-${payload.id}.ics`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao exportar ICS.");
    }
  };

  const reagendar = (acaoId?: string) => {
    if (!acaoId) return;
    const dados = reschedule[acaoId];
    if (!dados?.data) return;
    setProximasAcoes((atuais) => reagendarAcaoAgenda(atuais, acaoId, dados.data, dados.horario).map((acao) => acao.id === acaoId ? { ...acao, ...metadataAfterGoogleCalendarReschedule(acao), googleCalendarSyncStatus: acao.googleCalendarEventId ? "pending" : acao.googleCalendarSyncStatus } : acao));
    toast.success("Ação reagendada. Se havia vínculo com Google Calendar, ficou marcada para atualização.");
    setReschedule((atual) => ({ ...atual, [acaoId]: { data: "", horario: "" } }));
  };

  const badgeVariant = (classificacao: string) => {
    if (classificacao === "Atrasada") return "destructive" as const;
    if (classificacao === "Pendente hoje") return "default" as const;
    return "outline" as const;
  };

  const contagemVisao = (value: AgendaVisao) => filtrarPorVisaoAgenda(itens, value, hoje).length;
  const termoOperacional = (valor: string) => valor === "Sem próxima ação" ? "Sem ação comercial" : valor;
  const statusOperacional = (item: AgendaItem) => {
    if (item.status === "Cancelada") return "Cancelada";
    if (item.status === "Concluída" || item.status === "Realizada" || item.classificacao === "Concluída") return "Concluída";
    if (item.status === "Reagendada") return "Reagendada";
    return item.classificacao;
  };
  const googleCalendarLabel = (status: string) => status === "not_synced"
    ? "Google Calendar: não sincronizado"
    : status === "synced"
      ? "Google Calendar: sincronizado"
      : status === "update_pending"
        ? "Google Calendar: atualização pendente"
        : status === "deleted"
          ? "Google Calendar: vínculo removido"
          : "Google Calendar: erro";

  return <div className="space-y-4">
    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agenda comercial</h1>
        <p className="text-sm text-muted-foreground">Agenda operacional das ações comerciais com agendamento, status e próxima decisão do fluxo comercial.</p>
      </div>
      <Button variant="outline" onClick={() => nav("/proximas-acoes")}>Ver ações comerciais</Button>
    </div>

    <div className="grid gap-3 md:grid-cols-5">
      <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4" />Atrasadas</div><div className="text-2xl font-bold">{resumo.atrasadas}</div></Card>
      <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4" />Hoje</div><div className="text-2xl font-bold">{resumo.hoje}</div></Card>
      <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarClock className="h-4 w-4" />Próximos 7 dias</div><div className="text-2xl font-bold">{resumo.proximos7Dias}</div></Card>
      <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4" />Sem ação comercial</div><div className="text-2xl font-bold">{resumo.clientesAP1SemProximaAcao}</div></Card>
      <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarClock className="h-4 w-4" />Sem agendamento</div><div className="text-2xl font-bold">{resumo.semAgendamento}</div></Card>
    </div>

    <Card className="p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 font-semibold"><Plus className="h-4 w-4" />Lançamento guiado de Agenda e Visitas</div>
          <p className="text-sm text-muted-foreground">Comece por uma visita futura ou concluída. O funil só abre quando a visita concluída gerar oportunidade.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={abrirAgendamento}>Agendar visita futura</Button>
          <Button variant="secondary" onClick={abrirVisitaConcluida}>VISITA CONCLUÍDA</Button>
          <Button variant="outline" onClick={abrirNovaAcaoAvulsa}>Marcar próxima ação</Button>
        </div>
      </div>
    </Card>

    <Card className="p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={visao} onValueChange={(value) => setVisao(value as AgendaVisao)}>
          <TabsList className="h-auto flex-wrap justify-start">
            {VISOES.map((item) => <TabsTrigger key={item.value} value={item.value}>{item.label} ({contagemVisao(item.value)})</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <Button variant="ghost" className="h-auto px-2 py-1 text-xs" onClick={() => { setDraftFiltros(filtros); setFiltrosOpen(true); }}>
          <Filter className="mr-1 h-3.5 w-3.5" />Filtros{filtrosAtivos ? ` (${filtrosAtivos})` : ""}
        </Button>
      </div>
    </Card>

    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Agenda: ações comerciais por agendamento</h2><span className="text-xs text-muted-foreground">{itensFiltrados.length} item(ns)</span></div>
        <div className="space-y-3">
          {itensFiltrados.map((item) => {
            const reprogramacao = reschedule[item.sourceId || ""] || { data: item.data || hoje, horario: item.horario || "" };
            const podeEditarAcao = item.origem === "Ação comercial" && !!item.sourceId;
            const labelStatus = statusOperacional(item);
            return <div key={item.id} className="rounded-xl border bg-card p-4 text-sm shadow-sm">
              <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <button className="font-semibold text-primary hover:underline" onClick={() => item.clienteId && nav(`/clientes/${item.clienteId}`)}>{item.cliente}</button>
                      <div className="text-xs text-muted-foreground">{item.fazenda} • {item.cidade}</div>
                    </div>
                    <div className="flex flex-wrap gap-2"><Badge variant={badgeVariant(labelStatus)}>{labelStatus}</Badge><Badge variant="outline">{termoOperacional(item.tipo)}</Badge></div>
                  </div>
                  <div className="grid gap-1 text-muted-foreground md:grid-cols-2">
                    <span><b className="text-foreground">Data:</b> {item.data || "Sem agendamento"}</span>
                    <span><b className="text-foreground">Horário:</b> {item.horario || "—"}</span>
                    <span><b className="text-foreground">Vendedor:</b> {item.vendedor}</span>
                    <span><b className="text-foreground">ABC/Prioridade:</b> {item.abc || "—"}/{item.prioridade || "—"}</span>
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ação comercial e objetivo</div>
                  <div className="mt-2 grid gap-1 text-muted-foreground">
                    <span><b className="text-foreground">Ação:</b> {termoOperacional(item.tipo)}</span>
                    <span><b className="text-foreground">Origem:</b> {item.origem}</span>
                    <span><b className="text-foreground">Objetivo:</b> {item.descricao}</span>
                    <span><b className="text-foreground">Vínculos:</b> {[item.oportunidadeId ? `Opp. ${item.oportunidadeNome || item.oportunidadeId}` : "", item.orcamentoId ? `Orç. ${item.orcamentoCodigo || item.orcamentoId}` : "", item.negocioId ? `Neg. ${item.negocioNome || item.negocioId}` : ""].filter(Boolean).join(" • ") || "—"}</span>
                  </div>
                </div>
              </div>

              {podeEditarAcao && (() => {
                const acao = proximasAcoes.find((registro) => registro.id === item.sourceId);
                const statusGoogle = acao?.googleCalendarStatus || (acao?.googleCalendarEventId ? "synced" : "not_synced");
                const semData = !item.data;
                const googleCalendarDisponivel = googleCalendarBackendConnected || Boolean(getGoogleCalendarClientId());
                const labelAcao = statusGoogle === "error" ? "Tentar novamente" : acao?.googleCalendarEventId ? "Atualizar no Google Calendar" : "Enviar para Google Calendar";
                return <div className="mt-3 rounded-lg border border-dashed p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Google Calendar</span>
                    <Badge variant={statusGoogle === "synced" ? "default" : statusGoogle === "error" ? "destructive" : "outline"}>{googleCalendarLabel(statusGoogle)}</Badge>
                    {acao?.googleCalendarLastError && <span className="text-xs text-destructive">{acao.googleCalendarLastError}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant={statusGoogle === "error" ? "default" : "outline"} disabled={semData} title={semData ? "Defina um agendamento antes de enviar ao Google Calendar." : undefined} onClick={() => sincronizarGoogleCalendar(item.sourceId)}>{labelAcao}</Button>
                    {acao?.googleCalendarHtmlLink && <Button size="sm" variant="outline" onClick={() => window.open(acao.googleCalendarHtmlLink, "_blank", "noopener,noreferrer")}><ExternalLink className="mr-1 h-3 w-3" />Abrir no Google Calendar</Button>}
                    {acao?.googleCalendarEventId && <Button size="sm" variant="ghost" onClick={() => removerVinculoGoogleCalendar(item.sourceId)}>Remover vínculo</Button>}
                    {!googleCalendarDisponivel && <Button size="sm" variant="secondary" disabled={semData} onClick={() => exportarIcsGoogleCalendar(item.sourceId)}>Exportar .ics</Button>}
                    {semData && <span className="text-xs text-muted-foreground">Defina um agendamento antes de enviar ao Google Calendar.</span>}
                  </div>
                </div>;
              })()}

              {podeEditarAcao && <div className="mt-3 rounded-lg border p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conclusão e reagendamento</div>
                <div className="flex flex-wrap items-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => concluir(item.sourceId)}>Concluir ação comercial</Button>
                  <div><Label className="text-xs">Novo agendamento</Label><Input className="h-9 w-40" type="date" value={reprogramacao.data} onChange={(event) => setReschedule((atual) => ({ ...atual, [item.sourceId || ""]: { ...reprogramacao, data: event.target.value } }))} /></div>
                  <div><Label className="text-xs">Horário</Label><Input className="h-9 w-32" type="time" value={reprogramacao.horario} onChange={(event) => setReschedule((atual) => ({ ...atual, [item.sourceId || ""]: { ...reprogramacao, horario: event.target.value } }))} /></div>
                  <Button size="sm" onClick={() => reagendar(item.sourceId)}><RotateCcw className="mr-1 h-3 w-3" />Reagendar</Button>
                </div>
              </div>}
            </div>;
          })}
          {itensFiltrados.length === 0 && <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum item encontrado para esta visão e filtros.</div>}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Alertas operacionais</h2>
        <div className="space-y-2">
          {alertas.slice(0, 20).map((alerta) => <button key={alerta.id} className="w-full rounded border p-3 text-left text-xs hover:bg-accent" onClick={() => alerta.clienteId && nav(`/clientes/${alerta.clienteId}`)}>
            <div className="flex items-center justify-between gap-2"><b>{alerta.titulo}</b><Badge variant={alerta.severidade === "alta" ? "destructive" : "outline"}>{alerta.severidade}</Badge></div>
            <div className="mt-1 text-muted-foreground">{alerta.detalhe}</div>
          </button>)}
          {alertas.length === 0 && <p className="text-sm text-muted-foreground">Nenhum alerta operacional no momento.</p>}
        </div>
      </Card>
    </div>

    <Dialog open={filtrosOpen} onOpenChange={setFiltrosOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Filter className="h-4 w-4" />Filtros de Agenda e Visitas</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-3">
          <div><Label>Vendedor</Label><Select value={draftFiltros.vendedor} onValueChange={(v) => setDraftFiltros((atual) => ({ ...atual, vendedor: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">Todos</SelectItem>{vendedoresCanonicos.map((vendedor) => <SelectItem key={vendedor} value={vendedor}>{vendedor}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Data</Label><Input type="date" value={draftFiltros.data} onChange={(event) => setDraftFiltros((atual) => ({ ...atual, data: event.target.value }))} /></div>
          <div><Label>ABC</Label><Select value={draftFiltros.abc} onValueChange={(v) => setDraftFiltros((atual) => ({ ...atual, abc: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">Todos</SelectItem>{ABCS.map((abc) => <SelectItem key={abc} value={abc}>{abc}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Prioridade</Label><Select value={draftFiltros.prioridade} onValueChange={(v) => setDraftFiltros((atual) => ({ ...atual, prioridade: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">Todas</SelectItem>{PRIORIDADES.map((prioridade) => <SelectItem key={prioridade} value={prioridade}>{prioridade}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Status</Label><Select value={draftFiltros.status} onValueChange={(v) => setDraftFiltros((atual) => ({ ...atual, status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">Todos</SelectItem>{[...STATUS, "Atrasada", "Pendente hoje", "Agendada", "Sem agendamento"].map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Tipo</Label><Select value={draftFiltros.tipo} onValueChange={(v) => setDraftFiltros((atual) => ({ ...atual, tipo: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">Todos</SelectItem>{[...TIPOS, "Sem próxima ação", "Retorno de orçamento", "Pós-venda", "Próxima etapa"].map((tipo) => <SelectItem key={tipo} value={tipo}>{termoOperacional(tipo)}</SelectItem>)}</SelectContent></Select></div>
          <div className="md:col-span-3"><Label>Cliente</Label><Input value={draftFiltros.cliente} onChange={(event) => setDraftFiltros((atual) => ({ ...atual, cliente: event.target.value }))} placeholder="Buscar cliente, fazenda ou cidade" /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => { const limpo = { vendedor: "__all__", data: "", abc: "__all__", prioridade: "__all__", status: "__all__", tipo: "__all__", cliente: "" }; setDraftFiltros(limpo); setFiltros(limpo); }}>Limpar</Button><Button onClick={() => { setFiltros(draftFiltros); setFiltrosOpen(false); }}>Aplicar filtros</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={modal === "agendar" || modal === "visita" || modal === "novaAcao"} onOpenChange={(open) => !open && setModal(null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{modal === "agendar" ? "Agendar visita futura" : modal === "visita" ? "VISITA CONCLUÍDA" : "Marcar próxima ação"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="relative md:col-span-2"><Label>Cliente</Label><Input value={flowForm.clienteBusca} onChange={(event) => setFlowForm((atual) => ({ ...atual, clienteBusca: event.target.value, clienteId: "", vendedor: "" }))} placeholder="Buscar por nome, fazenda, cidade, rota ou vendedor" />{flowForm.clienteBusca && !flowForm.clienteId && <div className="mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover p-1 text-sm shadow">{clientesEncontrados.map((cliente) => <button key={cliente.id} type="button" className="w-full rounded-sm px-3 py-2 text-left hover:bg-accent" onClick={() => preencherCliente(cliente.id)}><div className="font-medium">{cliente.nome}</div><div className="text-xs text-muted-foreground">{cliente.fazenda} — {cliente.cidade} — {cliente.vendedor || "Sem vendedor"}</div></button>)}{clientesEncontrados.length === 0 && <div className="px-3 py-2 text-muted-foreground">Nenhum cliente encontrado.</div>}</div>}</div>
          <div><Label>Data</Label><Input type="date" value={flowForm.data} onChange={(event) => setFlowForm((atual) => ({ ...atual, data: event.target.value }))} /></div>
          <div><Label>Hora</Label><Input type="time" value={flowForm.horario} onChange={(event) => setFlowForm((atual) => ({ ...atual, horario: event.target.value }))} /></div>
          <div><Label>Vendedor</Label><Select value={flowForm.vendedor || "__none__"} onValueChange={(value) => setFlowForm((atual) => ({ ...atual, vendedor: value === "__none__" ? "" : value }))}><SelectTrigger><SelectValue placeholder="Selecione o vendedor" /></SelectTrigger><SelectContent><SelectItem value="__none__">Selecione</SelectItem>{vendedoresOpcoes.map((vendedor) => <SelectItem key={vendedor} value={vendedor}>{vendedor}</SelectItem>)}</SelectContent></Select></div>
          {modal === "novaAcao" && <div><Label>Tipo de ação</Label><Select value={flowForm.tipo} onValueChange={(v: TipoProximaAcao) => setFlowForm((atual) => ({ ...atual, tipo: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIPOS.map((tipo) => <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>)}</SelectContent></Select></div>}
          <div className="md:col-span-2"><Label>{modal === "novaAcao" ? "Descrição" : "Objetivo da visita"}</Label><Textarea value={flowForm.descricao} onChange={(event) => setFlowForm((atual) => ({ ...atual, descricao: event.target.value }))} /></div>
          <div className="md:col-span-2"><Label>Observações</Label><Textarea value={flowForm.observacao} onChange={(event) => setFlowForm((atual) => ({ ...atual, observacao: event.target.value }))} /></div>
          {(googleCalendarBackendConnected || googleCalendarClientIdConfigurado) && modal !== "visita" && <div className="md:col-span-2 rounded-md border p-3">
            <div className="flex items-start gap-3">
              <Checkbox id="enviar-google-calendar" checked={enviarGoogleCalendarNoSalvar} onCheckedChange={(checked) => setEnviarGoogleCalendarNoSalvar(checked === true)} />
              <div className="space-y-1 leading-none">
                <Label htmlFor="enviar-google-calendar" className="cursor-pointer">Enviar também para Google Calendar</Label>
                <p className="text-xs text-muted-foreground">
                  {googleCalendarPreferenciaAtiva ? "Google Calendar ativo; se o backend persistente estiver conectado, enviaremos sem popup nas próximas sessões." : "Você pode conectar o Google Calendar ao salvar."}
                </p>
              </div>
            </div>
          </div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button><Button onClick={modal === "agendar" ? salvarAgendamento : modal === "visita" ? salvarVisitaConcluida : salvarNovaAcao}>{modal === "agendar" ? "Salvar como Agendada" : modal === "visita" ? "Salvar visita concluída" : "Salvar próxima ação"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={modal === "pergunta"} onOpenChange={(open) => !open && setModal(null)}>
      <DialogContent><DialogHeader><DialogTitle>VISITA GEROU OPORTUNIDADE?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Somente visitas concluídas podem iniciar o funil de vendas.</p><DialogFooter><Button variant="outline" onClick={somenteVisita}>SOMENTE VISITA</Button><Button onClick={iniciarOportunidade}>GERAR NOVA OPORTUNIDADE</Button></DialogFooter></DialogContent>
    </Dialog>

    <Dialog open={modal === "marcarPergunta"} onOpenChange={(open) => !open && setModal(null)}>
      <DialogContent><DialogHeader><DialogTitle>CRIAR PRÓXIMA AÇÃO?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">A próxima ação alimenta a Agenda e Visitas e pode ficar vinculada à visita ou oportunidade do fluxo atual.</p><DialogFooter><Button variant="outline" onClick={() => setModal(null)}>NÃO</Button><Button onClick={prepararNovaAcaoDoContexto}>SIM, CRIAR PRÓXIMA AÇÃO</Button></DialogFooter></DialogContent>
    </Dialog>

    <Dialog open={modal === "oportunidade"} onOpenChange={(open) => !open && setModal(null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader><DialogTitle>OPORTUNIDADE DE NEGÓCIO</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>Cliente herdado</Label><Input value={clientes.find((cliente) => cliente.id === contexto?.clienteId)?.nome || ""} readOnly /></div>
          <div><Label>Vendedor</Label><Select value={contexto?.vendedor || "__none__"} onValueChange={(value) => setContexto((atual) => atual ? { ...atual, vendedor: value === "__none__" ? "" : value } : atual)}><SelectTrigger><SelectValue placeholder="Selecione o vendedor" /></SelectTrigger><SelectContent><SelectItem value="__none__">Selecione</SelectItem>{vendedoresOpcoes.map((vendedor) => <SelectItem key={vendedor} value={vendedor}>{vendedor}</SelectItem>)}</SelectContent></Select></div>
          <div className="md:col-span-2"><Label>Descrição da oportunidade</Label><Textarea value={oppForm.descricao} onChange={(event) => setOppForm((atual) => ({ ...atual, descricao: event.target.value }))} /></div>
          <div><Label>Previsão de fechamento</Label><Input type="date" value={oppForm.previsaoFechamento} onChange={(event) => setOppForm((atual) => ({ ...atual, previsaoFechamento: event.target.value }))} /></div>
          <div><Label>Valor estimado total</Label><Input value={valorEstimadoTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} readOnly /></div>
          <div className="md:col-span-2 space-y-2"><Label>Produtos</Label>{oppItems.map((item, index) => <div key={index} className="grid gap-2 rounded border p-2 md:grid-cols-5"><Select value={item.produtoId || "__none__"} onValueChange={(value) => setOppItems((atuais) => atuais.map((atual, i) => i === index ? { ...atual, produtoId: value === "__none__" ? "" : value, unidade: produtos.find((produto) => produto.id === value)?.unidade || atual.unidade, precoUnitario: produtos.find((produto) => produto.id === value)?.precoLista || atual.precoUnitario } : atual))}><SelectTrigger><SelectValue placeholder="Produto" /></SelectTrigger><SelectContent><SelectItem value="__none__">Selecione</SelectItem>{produtos.map((produto) => <SelectItem key={produto.id} value={produto.id}>{produto.nome}</SelectItem>)}</SelectContent></Select><Input type="number" value={item.quantidade} onChange={(event) => setOppItems((atuais) => atuais.map((atual, i) => i === index ? { ...atual, quantidade: Number(event.target.value) } : atual))} placeholder="Qtd." /><Input value={item.unidade} onChange={(event) => setOppItems((atuais) => atuais.map((atual, i) => i === index ? { ...atual, unidade: event.target.value } : atual))} placeholder="Unidade" /><Input type="number" value={item.precoUnitario} onChange={(event) => setOppItems((atuais) => atuais.map((atual, i) => i === index ? { ...atual, precoUnitario: Number(event.target.value) } : atual))} placeholder="Preço unit." /><Input value={(item.quantidade * item.precoUnitario).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} readOnly /></div>)}<Button type="button" variant="outline" size="sm" onClick={() => setOppItems((atuais) => [...atuais, { produtoId: "", quantidade: 1, unidade: "", precoUnitario: 0 }])}>Adicionar produto</Button></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setModal("pergunta")}>Voltar</Button><Button onClick={salvarOportunidade}>Salvar oportunidade e perguntar próxima ação</Button></DialogFooter>
      </DialogContent>
    </Dialog>

  </div>;
}
