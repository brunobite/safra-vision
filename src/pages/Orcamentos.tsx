import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppStore } from "@/store/AppStore";
import { EtapaOportunidade, Negocio, Orcamento, OrcamentoItem, OrcamentoStatus, ProximaAcao, Produto, UnidadeDose } from "@/types";
import { fmtBRL } from "@/utils/calculations";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { calcularQuantidadeComercial, DOSE_UNIDADES, isOrcamentoBloqueado, recalcularItem } from "@/lib/orcamentoUtils";
import { PEDIDO_STATUS_OFICIAIS, canTransitionPedidoStatus, normalizePedidoStatus, pedidoStatusToEtapa } from "@/lib/pedidoWorkflow";
import { gerarPdfOrcamento } from "@/lib/orcamentoPdf";
import { CanalProposta, getDataFollowUpProposta, hasFollowUpPendenteParaOrcamento, montarAssuntoProposta, montarMailtoUrl, montarMensagemProposta, montarWhatsAppUrl } from "@/lib/propostaWorkflow";
import { formatDateBR } from "@/utils/dateUtils";
import { useAuth } from "@/store/AuthStore";
import { canCreate, canDelete, canEdit, canExport, canManage, canSaveBelowMinimumPrice, canView, isAdminRole, normalizeRole } from "@/lib/permissions";
import { supabase } from "@/lib/supabase";
import { recordAuditLog } from "@/lib/audit";
import { deleteEntityCloudFirst, hydrateLocalCacheFromCloud, saveEntityCloudFirst } from "@/lib/operationalPersistence";

const STATUS_OFICIAIS: OrcamentoStatus[] = [...PEDIDO_STATUS_OFICIAIS];
const STATUS_LEGADO: OrcamentoStatus[] = ["Aberto", "Enviado", "Aprovado", "Recusado", "Convertido", "Em revisão", "Reenviado", "Vencido", "Reprovado", "Expirado"];
const CANAIS_ENVIO = ["WhatsApp", "E-mail", "Presencial", "Ligação", "Outro"] as const;
const validade7 = (base: string) => new Date(new Date(base).getTime() + 7 * 86400000).toISOString().slice(0, 10);

type CommercialAgent = { user_id: string; nome: string; papel: "vendedor" | "gestor" | "administrador" | "visualizador"; status: string; superior_user_id?: string | null };
const sameText = (a?: string | null, b?: string | null) => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

const novoItem = (idx: number, areaHa = 0): OrcamentoItem => ({ id: `i${Date.now()}-${idx}`, produtoId: "", produtoNome: "", categoria: "", unidadeProduto: "LT", dosePorHa: 0, unidadeDose: "L/ha", areaHa, quantidadeTotal: 0, precoUnitario: 0, precoMinimo: 0, desconto: 0, valorTotalItem: 0, custoPorHaItem: 0 });

export default function Orcamentos() {
  const { orcamentos, setOrcamentos, negocios, setNegocios, clientes, produtos, setProdutos, empresas, oportunidades, formasPagamento, prazosPagamento, proximasAcoes, setProximasAcoes, setOportunidades, setHistoricoFunil } = useAppStore();
  const { role, accessStatus, user, session, vendedorNome, vendedorId, permissions, accountOwnerUserId } = useAuth();
  const permissionContext = { role, accessStatus, email: user?.email, vendedorNome, vendedorId, permissions };
  const canViewOrcamentos = canView("orcamentos", permissionContext);
  const canCreateOrcamentos = canCreate("orcamentos", permissionContext);
  const canEditOrcamentos = canEdit("orcamentos", permissionContext);
  const canExportOrcamentos = canExport("orcamentos", permissionContext);
  const canManageOrcamentos = canManage("orcamentos", permissionContext);
  const canDeleteOrcamentos = canDelete("orcamentos", permissionContext) || canManageOrcamentos;
  const canCreateNegocios = canCreate("negocios", permissionContext);
  const canManageNegocios = canManage("negocios", permissionContext);
  const canUseMinimumPriceException = canSaveBelowMinimumPrice(permissionContext);
  const persistenceOptions = { session, accessStatus, accountOwnerUserId, actorUserId: user?.id, actorNome: vendedorNome || user?.user_metadata?.nome || user?.email, actorPapel: role };
  const [params] = useSearchParams();
  const normalizedRole = normalizeRole(role);
  const isAdmin = isAdminRole(role);
  const isGestor = normalizedRole === "gestor";
  const isVendedor = normalizedRole === "vendedor";
  const [commercialAgents, setCommercialAgents] = useState<CommercialAgent[]>([]);

  const formasPagamentoAtivas = formasPagamento.filter((f) => f.ativo);
  const prazosPagamentoAtivos = prazosPagamento.filter((p) => p.ativo);
  const formasPagamentoFallback = ["Boleto", "Pix", "Dinheiro", "Cartão", "Safra", "Barter", "Outro"];
  const prazosPagamentoFallback = ["À vista", "7 dias", "14 dias", "21 dias", "28 dias", "30 dias", "45 dias", "60 dias", "Safra", "Barter", "Outro"];
  const empresaPadrao = empresas.find((e) => e.padrao && e.ativa)?.id || empresas.find((e) => e.ativa)?.id || "";
  const formaPagamentoPadrao = formasPagamentoAtivas.find((f) => f.padrao)?.nome || formasPagamentoAtivas[0]?.nome || formasPagamentoFallback[0];
  const prazoPagamentoPadrao = prazosPagamentoAtivos.find((p) => p.padrao)?.nome || prazosPagamentoAtivos[0]?.nome || prazosPagamentoFallback[0];
  const now = new Date().toISOString();

  const [open, setOpen] = useState(false);
  const [closeSaleTarget, setCloseSaleTarget] = useState<Orcamento | null>(null);
  const [sendProposalTarget, setSendProposalTarget] = useState<Orcamento | null>(null);
  const [sendProposalChannel, setSendProposalChannel] = useState<CanalProposta>("WhatsApp");
  const [confirmingProposal, setConfirmingProposal] = useState(false);
  const [closingSale, setClosingSale] = useState(false);
  const [edit, setEdit] = useState<Orcamento | null>(null);
  const [motivoRevisao, setMotivoRevisao] = useState("");
  const [form, setForm] = useState<Orcamento>({ id: "", codigo: `ORC-${Date.now()}`, versao: 1, clienteId: "", empresaId: empresaPadrao, vendedor: "", data: now.slice(0, 10), validade: validade7(now.slice(0, 10)), status: "Rascunho", areaAplicacaoHa: 0, itens: [], subtotal: 0, descontoTotal: 0, valorTotal: 0, custoPorHectare: 0, createdAt: now, updatedAt: now, prazoPagamento: prazoPagamentoPadrao, formaPagamento: formaPagamentoPadrao });

  const isLegacy = Boolean(edit?.id && !edit?.oportunidadeId);
  const oportunidadesAbertasCliente = oportunidades.filter((o) => o.clienteId === form.clienteId && !["Ganha", "Perdida", "Cancelada", "Suspensa/Sem timing"].includes(o.etapa));
  useEffect(() => {
    if (!supabase) {
      const localName = vendedorNome || user?.user_metadata?.nome || user?.email || "Administrador local";
      setCommercialAgents([{ user_id: user?.id || "local-admin", nome: localName, papel: normalizedRole, status: "ativo" }]);
      return;
    }
    if (!user) {
      setCommercialAgents([]);
      return;
    }
    void (async () => {
      const { data: profilesData, error: profilesError } = await supabase.from("user_profiles").select("user_id,nome,email,papel,status,superior_user_id").eq("status", "ativo").in("papel", ["vendedor", "gestor", "administrador"]);
      if (profilesError) toast.error(profilesError.message);
      setCommercialAgents((profilesData ?? []).filter((profile) => profile.user_id).map((profile) => ({ user_id: profile.user_id!, nome: profile.nome || profile.email || profile.user_id!, papel: normalizeRole(profile.papel) as CommercialAgent["papel"], status: profile.status || "ativo", superior_user_id: profile.superior_user_id })));
    })();
  }, [normalizedRole, user, vendedorNome]);

  const teamSellerIds = useMemo(() => new Set(commercialAgents.filter((agent) => agent.papel === "vendedor" && agent.superior_user_id === user?.id).map((agent) => agent.user_id)), [commercialAgents, user?.id]);
  const selectableAgents = useMemo(() => {
    if (isAdmin) return commercialAgents;
    if (isGestor) return commercialAgents.filter((agent) => agent.user_id === user?.id || teamSellerIds.has(agent.user_id));
    return commercialAgents.filter((agent) => agent.user_id === user?.id);
  }, [commercialAgents, isAdmin, isGestor, teamSellerIds, user?.id]);

  const canSeeOrcamento = (orcamento: Orcamento) => {
    if (isAdmin) return true;
    const ownId = user?.id;
    const candidateIds = [orcamento.vendedorUserId, orcamento.responsavelUserId, orcamento.createdByUserId].filter(Boolean);
    if (isGestor) {
      if (candidateIds.some((id) => id === ownId || teamSellerIds.has(id!))) return true;
      if (!orcamento.vendedorUserId && !orcamento.responsavelUserId) return selectableAgents.some((agent) => sameText(agent.nome, orcamento.vendedorNome || orcamento.responsavelNome || orcamento.vendedor || orcamento.responsavel));
      return false;
    }
    if (isVendedor) {
      if (candidateIds.some((id) => id === ownId)) return true;
      return sameText(vendedorNome, orcamento.vendedorNome) || sameText(vendedorNome, orcamento.responsavelNome) || sameText(vendedorNome, orcamento.vendedor) || sameText(vendedorNome, orcamento.responsavel);
    }
    return canViewOrcamentos && (candidateIds.includes(ownId) || sameText(vendedorNome, orcamento.vendedorNome || orcamento.responsavelNome || orcamento.vendedor || orcamento.responsavel));
  };
  const orcamentosVisiveis = orcamentos.filter(canSeeOrcamento);
  const statusOptions = Array.from(new Set([...(isLegacy ? [...STATUS_LEGADO, ...STATUS_OFICIAIS] : STATUS_OFICIAIS), form.status]));
  const orcamentoBloqueado = isOrcamentoBloqueado(form, oportunidades);

  const recalc = (next: Orcamento) => {
    const itens = next.itens.map((it) => {
      const p = produtos.find((pp) => pp.id === it.produtoId);
      return p ? recalcularItem(it, p) : it;
    });
    const subtotal = itens.reduce((s, i) => s + i.valorTotalItem, 0);
    const valorTotal = Math.max(0, subtotal - (next.descontoTotal || 0));
    return { ...next, itens, subtotal, valorTotal, custoPorHectare: next.areaAplicacaoHa > 0 ? valorTotal / next.areaAplicacaoHa : 0 };
  };

  const applyAgentToOrcamento = (orcamento: Orcamento, agent: CommercialAgent): Orcamento => ({ ...orcamento, vendedorId: agent.user_id, vendedorUserId: agent.user_id, vendedorNome: agent.nome, vendedor: agent.nome, responsavelId: agent.user_id, responsavelUserId: agent.user_id, responsavelNome: agent.nome, responsavel: agent.nome });

  const getSuggestedAgentForCliente = (clienteId: string) => {
    const cliente = clientes.find((c) => c.id === clienteId);
    const agentId = cliente?.responsavelUserId || cliente?.vendedorUserId || cliente?.vendedorId;
    if (agentId) return selectableAgents.find((agent) => agent.user_id === agentId);
    const agentName = cliente?.responsavelNome || cliente?.vendedorNome || cliente?.vendedor;
    if (agentName) return selectableAgents.find((agent) => sameText(agent.nome, agentName));
    return undefined;
  };

  const canDeleteOrcamento = (orcamento: Orcamento) => canDeleteOrcamentos && canSeeOrcamento(orcamento);

  const currentUserAgent = (): CommercialAgent => ({ user_id: user?.id || vendedorId || "", nome: vendedorNome || user?.user_metadata?.nome || user?.email || "", papel: normalizedRole as CommercialAgent["papel"], status: "ativo" });

  const canEnviarProposta = (orcamento: Orcamento) => canEditOrcamentos && canSeeOrcamento(orcamento) && normalizedRole !== "visualizador" && ["Rascunho", "Em negociação"].includes(normalizePedidoStatus(orcamento.status));

  const abrirModalEnvioProposta = (orcamento: Orcamento) => {
    if (!canEnviarProposta(orcamento)) return toast.error("Você não tem permissão ou o status não permite enviar esta proposta.");
    setSendProposalTarget(orcamento);
    setSendProposalChannel(orcamento.canalEnvio === "E-mail" ? "E-mail" : "WhatsApp");
  };

  const abrirCanalProposta = () => {
    if (!sendProposalTarget) return;
    const cliente = clientes.find((c) => c.id === sendProposalTarget.clienteId);
    const mensagem = montarMensagemProposta(sendProposalTarget, cliente, currentUserAgent().nome);
    const url = sendProposalChannel === "WhatsApp" ? montarWhatsAppUrl(cliente, mensagem) : montarMailtoUrl(cliente, montarAssuntoProposta(sendProposalTarget), mensagem);
    if (sendProposalChannel === "WhatsApp" && !cliente?.telefone) toast.warning("Cliente sem telefone cadastrado. O WhatsApp será aberto sem destinatário; cadastre o telefone para preencher automaticamente.");
    if (sendProposalChannel === "E-mail" && !cliente?.email) toast.warning("Cliente sem e-mail cadastrado. O e-mail será aberto sem destinatário; cadastre o e-mail para preencher automaticamente.");
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const gerarPdfProposta = (orcamento: Orcamento) => {
    if (!canExportOrcamentos) return toast.error("Você não tem permissão para exportar orçamentos.");
    void recordAuditLog({ action: "gerar_pdf_orcamento", resource: "orcamentos", entityId: orcamento.id, entityLabel: orcamento.codigo });
    gerarPdfOrcamento(orcamento, clientes.find((c) => c.id === orcamento.clienteId), empresas.find((e) => e.id === orcamento.empresaId), oportunidades.find((op) => op.id === orcamento.oportunidadeId));
  };

  const confirmarEnvioProposta = async () => {
    const orcamento = sendProposalTarget;
    if (!orcamento) return;
    if (!canEnviarProposta(orcamento)) return toast.error("Você não tem permissão ou o status não permite enviar esta proposta.");
    const current = new Date().toISOString();
    const actor = currentUserAgent();
    const payload: Orcamento = recalc({ ...orcamento, status: "Enviado ao cliente", canalEnvio: sendProposalChannel, dataEnvio: current.slice(0, 10), enviadoPorUserId: actor.user_id || user?.id, enviadoPorNome: actor.nome, updatedAt: current, updatedByUserId: user?.id || orcamento.updatedByUserId });
    const oportunidadeAtual = payload.oportunidadeId ? oportunidades.find((o) => o.id === payload.oportunidadeId) : undefined;
    const oportunidadeAtualizada = oportunidadeAtual && !["Ganha", "Perdida", "Cancelada", "Suspensa/Sem timing"].includes(oportunidadeAtual.etapa) ? { ...oportunidadeAtual, etapa: "Orçamento enviado" as EtapaOportunidade, orcamentoId: payload.id, valorEstimado: payload.valorTotal || oportunidadeAtual.valorEstimado, updatedAt: current, updatedByUserId: user?.id } : undefined;
    const followUpExistente = hasFollowUpPendenteParaOrcamento(proximasAcoes, payload.id);
    const followUp: ProximaAcao | undefined = followUpExistente ? undefined : { id: `pa-proposta-${payload.id}-${Date.now()}`, clienteId: payload.clienteId, oportunidadeId: payload.oportunidadeId, orcamentoId: payload.id, responsavel: payload.responsavel || payload.vendedor || actor.nome, responsavelId: payload.responsavelId || payload.vendedorId, responsavelUserId: payload.responsavelUserId || payload.vendedorUserId || actor.user_id, responsavelNome: payload.responsavelNome || payload.vendedorNome || actor.nome, vendedorUserId: payload.vendedorUserId, vendedorNome: payload.vendedorNome, createdByUserId: user?.id, updatedByUserId: user?.id, descricao: `Follow-up da proposta ${payload.codigo}`, tipo: "Follow-up", data: getDataFollowUpProposta(payload), status: "Pendente", origem: "Orçamento", createdAt: current, updatedAt: current };
    setConfirmingProposal(true);
    try {
      const results = [await saveEntityCloudFirst("orcamentos", payload, { ...persistenceOptions, auditAction: "enviar_proposta_orcamento", resource: "orcamentos", beforeData: orcamento, afterData: payload, auditMetadata: { canalEnvio: sendProposalChannel } })];
      if (oportunidadeAtualizada) results.push(await saveEntityCloudFirst("oportunidades", oportunidadeAtualizada, { ...persistenceOptions, auditAction: "atualizar_funil_proposta_enviada", resource: "oportunidades", beforeData: oportunidadeAtual, afterData: oportunidadeAtualizada, auditMetadata: { orcamentoId: payload.id } }));
      if (followUp) results.push(await saveEntityCloudFirst("proximasAcoes", followUp, { ...persistenceOptions, auditAction: "criar_followup_proposta", resource: "proximasAcoes", afterData: followUp, auditMetadata: { orcamentoId: payload.id, oportunidadeId: payload.oportunidadeId } }));
      if (results.some((result) => result.status === "conflict")) {
        toast.error("Conflito ao confirmar envio. Atualize/recarregue os dados e tente novamente; o status local não foi alterado.");
        return;
      }
      setOrcamentos((prev) => prev.map((o) => o.id === payload.id ? payload : o));
      if (oportunidadeAtualizada) setOportunidades((prev) => prev.map((o) => o.id === oportunidadeAtualizada.id ? oportunidadeAtualizada : o));
      if (followUp) setProximasAcoes((prev) => [followUp, ...prev]);
      void recordAuditLog({ action: "confirmar_envio_proposta", resource: "orcamentos", entityId: payload.id, entityLabel: payload.codigo, metadata: { canalEnvio: sendProposalChannel, dataEnvio: payload.dataEnvio, followUpCriado: Boolean(followUp), persistencia: results.map((r) => r.status) } });
      toast.success(results.some((r) => r.status === "pending-offline") ? "Envio confirmado localmente e pendente de sincronização." : "Envio da proposta confirmado.");
      setSendProposalTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao confirmar envio da proposta.");
    } finally {
      setConfirmingProposal(false);
    }
  };

  useEffect(() => {
    if (!canViewOrcamentos || !session?.user || !accountOwnerUserId || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    let cancelled = false;
    void hydrateLocalCacheFromCloud<Orcamento>("orcamentos", persistenceOptions)
      .then((result) => {
        if (cancelled) return;
        setOrcamentos(result.active);
      })
      .catch((error) => {
        console.warn("Não foi possível atualizar orçamentos da nuvem:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [accountOwnerUserId, canViewOrcamentos, session?.user?.id]);

  const novoOrcamento = () => {
    const current = new Date().toISOString();
    const base: Orcamento = { id: "", codigo: `ORC-${Date.now()}`, versao: 1, clienteId: "", empresaId: empresaPadrao, vendedor: "", data: current.slice(0, 10), validade: validade7(current.slice(0, 10)), status: "Rascunho", areaAplicacaoHa: 0, itens: [], subtotal: 0, descontoTotal: 0, valorTotal: 0, custoPorHectare: 0, createdAt: current, updatedAt: current, prazoPagamento: prazoPagamentoPadrao, formaPagamento: formaPagamentoPadrao, createdByUserId: user?.id, updatedByUserId: user?.id };
    setEdit(null);
    setMotivoRevisao("");
    setForm(isVendedor ? applyAgentToOrcamento(base, currentUserAgent()) : base);
    setOpen(true);
  };

  const criarNovaVersao = (origem: Orcamento) => {
    if (isOrcamentoBloqueado(origem, oportunidades)) return toast.error("Orçamento bloqueado: oportunidade já fechada.");
    const irmas = orcamentos.filter((o) => (o.orcamentoOrigemId || o.id) === (origem.orcamentoOrigemId || origem.id));
    const proximaVersao = Math.max(...irmas.map((i) => i.versao || 1), origem.versao || 1) + 1;
    const current = new Date().toISOString();
    setEdit(null);
    setForm(recalc({ ...origem, id: "", versao: proximaVersao, status: "Rascunho", motivoRevisao: "", dataEnvio: undefined, canalEnvio: undefined, substituiOrcamentoId: origem.id, orcamentoOrigemId: origem.orcamentoOrigemId || origem.id, createdAt: current, updatedAt: current, itens: origem.itens.map((it, idx) => ({ ...it, id: `${it.id}-v${proximaVersao}-${idx}` })) }));
    setMotivoRevisao("");
    setOpen(true);
  };

  const save = async () => {
    if (orcamentoBloqueado) return toast.error("Orçamento bloqueado: oportunidade já fechada. Para nova negociação, crie uma nova oportunidade.");
    const selectedAgent = isVendedor ? currentUserAgent() : selectableAgents.find((agent) => agent.user_id === (form.responsavelUserId || form.vendedorUserId || form.responsavelId || form.vendedorId));
    if ((isAdmin || isGestor) && !selectedAgent) return toast.error("Selecione o responsável comercial.");
    if (isGestor && selectedAgent && selectedAgent.user_id !== user?.id && !teamSellerIds.has(selectedAgent.user_id)) return toast.error("Gestor só pode criar orçamento para si ou para vendedores da própria equipe.");
    const ownerApplied = selectedAgent ? applyAgentToOrcamento(form, selectedAgent) : form;
    const idNovo = ownerApplied.id || `orc${Date.now()}`;
    const createdAt = ownerApplied.createdAt || new Date().toISOString();
    const payload = recalc({ ...ownerApplied, id: idNovo, orcamentoOrigemId: ownerApplied.orcamentoOrigemId || idNovo, createdAt, createdByUserId: ownerApplied.createdByUserId || user?.id, updatedByUserId: user?.id || ownerApplied.updatedByUserId, motivoRevisao: motivoRevisao || ownerApplied.motivoRevisao, status: normalizePedidoStatus(ownerApplied.status), updatedAt: new Date().toISOString() });
    if (!payload.clienteId) return toast.error("Cliente obrigatório");
    const excecoesPreco = payload.itens.filter((it) => it.abaixoPrecoMinimo);
    if (excecoesPreco.length && !canUseMinimumPriceException) return toast.error("Preço abaixo do mínimo exige a permissão específica excecao_preco_minimo.");
    const estouroEstoque = payload.itens.filter((it) => it.controlaEstoque && !it.representacaoComissionado && it.quantidadeTotal > (it.estoqueDisponivel || 0));
    if (estouroEstoque.length) toast.warning("Há itens acima do estoque disponível; produtos representados não bloqueiam por estoque.");
    if (normalizePedidoStatus(payload.status) === "Enviado ao cliente" && (!payload.canalEnvio || !payload.dataEnvio)) return toast.error("Informe canal e data de envio");
    if (edit && !canTransitionPedidoStatus(edit.status, payload.status, normalizedRole)) return toast.error("Transição de status não permitida para seu papel.");

    if (edit && (!canEditOrcamentos || !canSeeOrcamento(edit))) return toast.error("Você não tem permissão para editar este orçamento.");
    if (!edit && !canCreateOrcamentos) return toast.error("Você não tem permissão para criar orçamentos.");
    const shouldReserveOnApproval = normalizePedidoStatus(payload.status) === "Aprovado pelo gestor" && normalizePedidoStatus(edit?.status) !== "Aprovado pelo gestor" && !payload.estoqueReservado;
    const currentApproval = new Date().toISOString();
    const reservasAprovacao = shouldReserveOnApproval ? produtosComReserva(payload) : [];
    const produtosComReservaAprovacao = reservasAprovacao.length
      ? produtos.map((produto) => {
        const totalReservar = reservasAprovacao.filter((entry) => entry.produto.id === produto.id).reduce((sum, entry) => sum + entry.item.quantidadeTotal, 0);
        return totalReservar > 0 ? { ...produto, estoqueReservado: (produto.estoqueReservado || 0) + totalReservar, updatedAt: currentApproval, ultimaAtualizacao: currentApproval, updatedByUserId: user?.id } : produto;
      })
      : produtos;
    const payloadPersistido: Orcamento = reservasAprovacao.length ? { ...payload, estoqueReservado: true, estoqueReservadoAt: currentApproval } : payload;

    let result: Awaited<ReturnType<typeof saveEntityCloudFirst<Orcamento>>>;
    try {
      result = await saveEntityCloudFirst("orcamentos", payloadPersistido, { ...persistenceOptions, auditAction: edit ? "editar_orcamento" : "criar_orcamento", resource: "orcamentos", beforeData: edit || null, afterData: payloadPersistido });
      for (const reserva of reservasAprovacao) {
        const produtoAtualizado = produtosComReservaAprovacao.find((p) => p.id === reserva.produto.id)!;
        await saveEntityCloudFirst("produtos", produtoAtualizado, { ...persistenceOptions, auditAction: "reservar_estoque_orcamento_aprovado", resource: "produtos", beforeData: reserva.produto, afterData: produtoAtualizado, auditMetadata: { orcamentoId: payloadPersistido.id, quantidadeReservada: reserva.item.quantidadeTotal } });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar orçamento.");
      return;
    }
    if (result.status === "conflict") {
      toast.error("Conflito ao salvar orçamento. Atualize/recarregue os dados e tente novamente para evitar sobrescrever alterações mais recentes.");
      return;
    }
    if (reservasAprovacao.length) setProdutos(produtosComReservaAprovacao);
    setOrcamentos((prev) => edit ? prev.map((o) => (o.id === edit.id ? payloadPersistido : o)) : [payloadPersistido, ...prev.filter((o) => o.id !== idNovo)]);
    if (edit && (edit.responsavelUserId !== payload.responsavelUserId || edit.responsavelNome !== payload.responsavelNome)) void recordAuditLog({ action: "alterar_responsavel_orcamento", resource: "orcamentos", entityId: idNovo, entityLabel: payload.codigo, metadata: { de: edit.responsavelNome || edit.responsavel, para: payload.responsavelNome || payload.responsavel } });
    if (edit && normalizePedidoStatus(edit.status) !== normalizePedidoStatus(payloadPersistido.status)) void recordAuditLog({ action: "alterar_status_orcamento", resource: "orcamentos", entityId: idNovo, entityLabel: payload.codigo, metadata: { de: normalizePedidoStatus(edit.status), para: normalizePedidoStatus(payloadPersistido.status), persistencia: result.status } });
    if ((payload.descontoTotal || 0) > 0 || payload.itens.some((it) => (it.desconto || 0) > 0)) void recordAuditLog({ action: "aplicar_desconto_orcamento", resource: "orcamentos", entityId: idNovo, entityLabel: payload.codigo, metadata: { descontoTotal: payload.descontoTotal, itens: payload.itens.map((it) => ({ produtoId: it.produtoId, desconto: it.desconto || 0 })) } });
    if (excecoesPreco.length) void recordAuditLog({ action: "preco_abaixo_minimo_autorizado", resource: "orcamentos", entityId: idNovo, entityLabel: payload.codigo, metadata: { itens: excecoesPreco.map((it) => ({ produtoId: it.produtoId, precoUnitario: it.precoUnitario, desconto: it.desconto, precoMinimo: it.precoMinimo })) } });
    if (normalizePedidoStatus(payload.status) === "Aprovado pelo gestor") {
      void recordAuditLog({ action: "aprovar_orcamento", resource: "orcamentos", entityId: idNovo, entityLabel: payload.codigo });
    }
    if (payload.status === "Cancelado") void recordAuditLog({ action: "cancelar_orcamento", resource: "orcamentos", entityId: idNovo, entityLabel: payload.codigo });

    if (payload.oportunidadeId) {
      const oportunidadeAtual = oportunidades.find((o) => o.id === payload.oportunidadeId);
      const etapaNova = pedidoStatusToEtapa(payload.status);
      setOportunidades((prev) => prev.map((o) => o.id === payload.oportunidadeId ? { ...o, etapa: etapaNova, orcamentoId: idNovo, valorEstimado: payload.valorTotal || o.valorEstimado, updatedAt: new Date().toISOString() } : o));
      if (oportunidadeAtual && oportunidadeAtual.etapa !== etapaNova) {
        const current = new Date().toISOString();
        setHistoricoFunil((prev) => [{ id: `hf${Date.now()}-${idNovo}-${payload.status}`, oportunidadeId: oportunidadeAtual.id, clienteId: oportunidadeAtual.clienteId, etapaAnterior: oportunidadeAtual.etapa, etapaNova, dataMovimento: current, vendedor: oportunidadeAtual.vendedor || oportunidadeAtual.responsavel || payload.responsavel || payload.vendedor, observacao: `Status do pedido ${payload.codigo}: ${payload.status}.`, createdAt: current }, ...prev]);
      }
    }

    if (payload.oportunidadeId && normalizePedidoStatus(payload.status) === "Enviado ao cliente") {
      const oportunidadeAtual = oportunidades.find((o) => o.id === payload.oportunidadeId);
      setOportunidades((prev) => prev.map((o) => o.id === payload.oportunidadeId && !["Ganha", "Perdida", "Cancelada", "Suspensa/Sem timing"].includes(o.etapa) ? { ...o, etapa: "Orçamento enviado", orcamentoId: idNovo, updatedAt: new Date().toISOString() } : o));
      if (oportunidadeAtual && oportunidadeAtual.etapa !== "Orçamento enviado") {
        const current = new Date().toISOString();
        setHistoricoFunil((prev) => [{ id: `hf${Date.now()}-${idNovo}`, oportunidadeId: oportunidadeAtual.id, clienteId: oportunidadeAtual.clienteId, etapaAnterior: oportunidadeAtual.etapa, etapaNova: "Orçamento enviado", dataMovimento: current, vendedor: oportunidadeAtual.vendedor || oportunidadeAtual.responsavel || payload.responsavel || payload.vendedor, observacao: `Orçamento ${payload.codigo} marcado como enviado.`, createdAt: current }, ...prev]);
      }
      if (!payload.proximaAcaoId) {
        setProximasAcoes((prev) => [{ id: `pa${Date.now()}`, clienteId: payload.clienteId, oportunidadeId: payload.oportunidadeId, orcamentoId: idNovo, responsavel: payload.responsavel || payload.vendedor || "", descricao: `Follow-up de orçamento enviado ${payload.codigo} v${payload.versao || 1}`, tipo: "Follow-up", data: payload.validade || payload.data, status: "Pendente", origem: "Orçamento", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...prev]);
      }
    }

    if (payload.oportunidadeId && ["Em revisão", "Reenviado"].includes(payload.status)) {
      const oportunidadeAtual = oportunidades.find((o) => o.id === payload.oportunidadeId);
      setOportunidades((prev) => prev.map((o) => o.id === payload.oportunidadeId && !["Ganha", "Perdida", "Cancelada", "Suspensa/Sem timing"].includes(o.etapa) ? { ...o, etapa: "Negociação", orcamentoId: idNovo, updatedAt: new Date().toISOString() } : o));
      if (oportunidadeAtual && oportunidadeAtual.etapa !== "Negociação") {
        const current = new Date().toISOString();
        setHistoricoFunil((prev) => [{ id: `hf${Date.now()}-${idNovo}-neg`, oportunidadeId: oportunidadeAtual.id, clienteId: oportunidadeAtual.clienteId, etapaAnterior: oportunidadeAtual.etapa, etapaNova: "Negociação", dataMovimento: current, vendedor: oportunidadeAtual.vendedor || oportunidadeAtual.responsavel || payload.responsavel || payload.vendedor, observacao: `Orçamento ${payload.codigo} entrou em ${payload.status}.`, createdAt: current }, ...prev]);
      }
    }

    if (normalizePedidoStatus(payloadPersistido.status) === "Aprovado pelo gestor") toast.message("Orçamento aprovado. Use Fechar venda para criar o negócio operacional.");
    if (normalizePedidoStatus(payload.status) === "Perdido") toast.message("Orçamento perdido. Feche a oportunidade como Perdida e informe motivo.");
    setOpen(false);
    toast.success(result.status === "pending-offline" ? "Orçamento salvo localmente e pendente de sincronização" : "Orçamento salvo");
  };

  useEffect(() => {
    const editId = params.get("edit");
    if (editId) {
      const orcamento = orcamentos.find((x) => x.id === editId);
      if (!orcamento) return;
      setEdit(orcamento);
      setForm(orcamento);
      setMotivoRevisao(orcamento.motivoRevisao || "");
      setOpen(true);
      return;
    }

    if (params.get("new")) {
      novoOrcamento();
      return;
    }

    const oportunidadeId = params.get("oportunidadeId");
    if (!oportunidadeId) return;
    const op = oportunidades.find((x) => x.id === oportunidadeId);
    if (!op) return;
    const itens = (op.itensEstimados || []).map((it, idx) => ({ ...novoItem(idx), produtoId: it.produtoId, produtoNome: it.produtoNome || "", categoria: it.categoria || "", unidadeProduto: (it.unidadeProduto as OrcamentoItem["unidadeProduto"]) || "LT", dosePorHa: it.dosePorHa || 0, unidadeDose: it.unidadeDose || "L/ha", areaHa: it.areaHa || 0, quantidadeTotal: it.quantidadeTotal || 0, precoUnitario: it.precoUnitario || 0, valorTotalItem: it.valorTotalItem || 0, custoPorHaItem: it.custoPorHaItem || 0, observacoes: it.observacoes }));
    setEdit(null);
    setForm((f) => recalc({ ...f, clienteId: op.clienteId, oportunidadeId: op.id, responsavel: op.responsavel || f.responsavel || "", vendedor: op.responsavel || f.vendedor || "", segmento: op.segmento || f.segmento || "", areaAplicacaoHa: itens.length ? Math.max(...itens.map((i) => i.areaHa || 0), 0) : 0, itens }));
    setOpen(true);
  }, [params, oportunidades, orcamentos]);

  const converterEmOportunidade = (orcamento: Orcamento) => {
    if (normalizePedidoStatus(orcamento.status) !== "Aprovado pelo gestor") return toast.error("Apenas pedido aprovado pelo gestor pode avançar.");
    const current = new Date().toISOString();
    const opId = orcamento.oportunidadeId || `op${Date.now()}`;
    if (!orcamento.oportunidadeId) setOportunidades((prev) => [{ id: opId, clienteId: orcamento.clienteId, clienteNome: clientes.find((c) => c.id === orcamento.clienteId)?.nome, vendedor: orcamento.vendedor, vendedorId: orcamento.vendedorId, origem: "Orçamento", necessidade: `Conversão do orçamento ${orcamento.codigo}`, valorEstimado: orcamento.valorTotal, responsavel: orcamento.responsavel || orcamento.vendedor, etapa: "Fechamento encaminhado" as EtapaOportunidade, probabilidade: 80, itensEstimados: orcamento.itens, orcamentoId: orcamento.id, createdAt: current, updatedAt: current }, ...prev]);
    else setOportunidades((prev) => prev.map((o) => o.id === opId ? { ...o, etapa: "Fechamento encaminhado", valorEstimado: orcamento.valorTotal, itensEstimados: orcamento.itens, orcamentoId: orcamento.id, updatedAt: current } : o));
    setProximasAcoes((prev) => [{ id: `pa${Date.now()}`, clienteId: orcamento.clienteId, oportunidadeId: opId, orcamentoId: orcamento.id, responsavel: orcamento.responsavel || orcamento.vendedor || "", descricao: `Próxima ação da oportunidade convertida do orçamento ${orcamento.codigo}`, tipo: "Follow-up", data: orcamento.validade || current.slice(0, 10), status: "Pendente", origem: "Orçamento", createdAt: current, updatedAt: current }, ...prev]);
    setOrcamentos((prev) => prev.map((o) => o.id === orcamento.id ? { ...o, status: "Convertido em venda", oportunidadeId: opId, updatedAt: current } : o));
    void recordAuditLog({ action: "converter_orcamento_oportunidade", resource: "orcamentos", entityId: orcamento.id, entityLabel: orcamento.codigo, metadata: { oportunidadeId: opId, valorPrevisto: orcamento.valorTotal, produtos: orcamento.itens.map((it) => it.produtoId) } });
    toast.success("Orçamento convertido em oportunidade.");
  };


  const canConvertOrcamentoToSale = (orcamento: Orcamento) => {
    if (!canCreateNegocios && !canManageNegocios) return false;
    if (isAdmin) return true;
    return canSeeOrcamento(orcamento);
  };

  const negocioVinculado = (orcamento: Orcamento) => negocios.find((negocio) => negocio.orcamentoId === orcamento.id || negocio.id === orcamento.negocioId);

  const produtosComReserva = (orcamento: Orcamento) => orcamento.itens
    .filter((item) => {
      const produto = produtos.find((p) => p.id === item.produtoId);
      return Boolean(item.produtoId && item.quantidadeTotal > 0 && (item.controlaEstoque || produto?.controlaEstoque) && !(item.representacaoComissionado || produto?.representacaoComissionado));
    })
    .map((item) => ({ item, produto: produtos.find((p) => p.id === item.produtoId)! }))
    .filter((entry): entry is { item: OrcamentoItem; produto: Produto } => Boolean(entry.produto));

  const confirmarFecharVenda = async () => {
    const orcamento = closeSaleTarget;
    if (!orcamento) return;
    if (normalizePedidoStatus(orcamento.status) !== "Aprovado pelo gestor" && normalizePedidoStatus(orcamento.status) !== "Reservado") return toast.error("Apenas pedido aprovado/reservado pode ser fechado como venda.");
    if (!canConvertOrcamentoToSale(orcamento)) return toast.error("Você não tem permissão para fechar esta venda.");
    const existente = negocioVinculado(orcamento);
    if (existente) return toast.error(`Venda já criada: ${existente.codigo || existente.id}.`);
    setClosingSale(true);
    const current = new Date().toISOString();
    const cliente = clientes.find((c) => c.id === orcamento.clienteId);
    const empresa = empresas.find((e) => e.id === orcamento.empresaId);
    const margemBruta = orcamento.itens.reduce((sum, item) => sum + ((item.precoUnitario - (item.desconto || 0)) * item.quantidadeTotal - (item.custoPorHaItem || 0) * (item.areaHa || orcamento.areaAplicacaoHa || 0)), 0);
    const negocio: Negocio = {
      id: `neg-${orcamento.id}`,
      codigo: `VEN-${orcamento.codigo.replace(/^ORC-?/, "")}`,
      nome: `Venda do orçamento ${orcamento.codigo}`,
      orcamentoId: orcamento.id,
      oportunidadeId: orcamento.oportunidadeId,
      clienteId: orcamento.clienteId,
      clienteNome: cliente?.nome,
      empresaId: orcamento.empresaId,
      empresaNome: empresa?.nomeFantasia,
      vendedor: orcamento.vendedor || orcamento.responsavel || "",
      vendedorId: orcamento.vendedorId || orcamento.responsavelId,
      vendedorUserId: orcamento.vendedorUserId || orcamento.responsavelUserId,
      vendedorNome: orcamento.vendedorNome || orcamento.responsavelNome || orcamento.vendedor,
      responsavel: orcamento.responsavel || orcamento.vendedor,
      responsavelId: orcamento.responsavelId || orcamento.vendedorId,
      responsavelUserId: orcamento.responsavelUserId || orcamento.vendedorUserId,
      responsavelNome: orcamento.responsavelNome || orcamento.vendedorNome || orcamento.vendedor,
      createdByUserId: user?.id,
      updatedByUserId: user?.id,
      origem: "Orçamento",
      produtos: orcamento.itens.map((item) => item.produtoId).filter(Boolean),
      categoria: (orcamento.itens[0]?.categoria || "Outros") as Negocio["categoria"],
      valorPotencial: orcamento.valorTotal,
      valorFechado: orcamento.valorTotal,
      valorTotal: orcamento.valorTotal,
      subtotal: orcamento.subtotal,
      descontoTotal: orcamento.descontoTotal,
      margemBruta,
      margemPercentual: orcamento.valorTotal > 0 ? (margemBruta / orcamento.valorTotal) * 100 : 0,
      formaPagamento: orcamento.formaPagamento,
      prazoPagamento: orcamento.prazoPagamento,
      prazoEntrega: orcamento.prazoEntrega,
      itens: orcamento.itens,
      itensEstimados: orcamento.itens,
      observacoes: orcamento.observacoes,
      status: "Pendente de faturamento",
      dataFechamento: current.slice(0, 10),
      dataPrevistaFaturamento: current.slice(0, 10),
      dataPrevistaEntrega: orcamento.validade,
      previsaoFechamento: current.slice(0, 10),
      dataCriacao: current,
      ultimaAtualizacao: current,
      createdAt: current,
      updatedAt: current,
      estoqueReservado: Boolean(orcamento.estoqueReservado),
      estoqueBaixado: false,
    };
    const orcamentoConvertido: Orcamento = { ...orcamento, status: "Convertido em venda", negocioId: negocio.id, estoqueReservado: Boolean(orcamento.estoqueReservado), estoqueReservadoAt: orcamento.estoqueReservadoAt, updatedAt: current, updatedByUserId: user?.id };
    const oportunidadeAtual = orcamento.oportunidadeId ? oportunidades.find((o) => o.id === orcamento.oportunidadeId) : undefined;
    const oportunidadeGanha = oportunidadeAtual ? { ...oportunidadeAtual, etapa: "Ganha" as EtapaOportunidade, negocioId: negocio.id, orcamentoId: orcamento.id, valorFinal: orcamento.valorTotal, valorEstimado: orcamento.valorTotal, itensEstimados: orcamento.itens, dataFechamento: current.slice(0, 10), updatedAt: current, updatedByUserId: user?.id } : orcamento.oportunidadeId ? { id: orcamento.oportunidadeId, origem: "Orçamento" as const, etapa: "Ganha" as EtapaOportunidade, orcamentoId: orcamento.id, negocioId: negocio.id, clienteId: orcamento.clienteId, clienteNome: cliente?.nome, valorFinal: orcamento.valorTotal, valorEstimado: orcamento.valorTotal, itensEstimados: orcamento.itens, vendedor: orcamento.vendedor, vendedorId: orcamento.vendedorId, vendedorUserId: orcamento.vendedorUserId, vendedorNome: orcamento.vendedorNome, responsavel: orcamento.responsavel || orcamento.vendedor, responsavelId: orcamento.responsavelId || orcamento.vendedorId, responsavelUserId: orcamento.responsavelUserId || orcamento.vendedorUserId, responsavelNome: orcamento.responsavelNome || orcamento.vendedorNome || orcamento.vendedor, createdByUserId: orcamento.createdByUserId || user?.id, updatedByUserId: user?.id, dataFechamento: current.slice(0, 10), createdAt: current, updatedAt: current } : undefined;
    const historicoGanho = oportunidadeGanha ? { id: `hf${Date.now()}-${negocio.id}`, oportunidadeId: oportunidadeGanha.id, clienteId: oportunidadeGanha.clienteId, etapaAnterior: oportunidadeAtual?.etapa, etapaNova: "Ganha" as EtapaOportunidade, dataMovimento: current, vendedor: negocio.vendedor, observacao: `Venda ${negocio.codigo} criada a partir do orçamento ${orcamento.codigo}.`, createdAt: current } : undefined;
    try {
      const negocioResult = await saveEntityCloudFirst("negocios", negocio, { ...persistenceOptions, auditAction: "criar_negocio", resource: "negocios", afterData: negocio, auditMetadata: { action: "fechar_venda", orcamentoId: orcamento.id, oportunidadeId: orcamento.oportunidadeId, clienteId: orcamento.clienteId, valor: orcamento.valorTotal, produtosAfetados: produtosComReserva(orcamento).map((r) => ({ produtoId: r.item.produtoId, quantidade: r.item.quantidadeTotal })) } });
      const orcamentoResult = await saveEntityCloudFirst("orcamentos", orcamentoConvertido, { ...persistenceOptions, auditAction: "converter_orcamento_negocio", resource: "orcamentos", beforeData: orcamento, afterData: orcamentoConvertido, auditMetadata: { negocioId: negocio.id, valor: negocio.valorTotal } });
      const oportunidadeResult = oportunidadeGanha ? await saveEntityCloudFirst("oportunidades", oportunidadeGanha, { ...persistenceOptions, auditAction: oportunidadeAtual ? "oportunidade_ganha_por_orcamento" : "recriar_oportunidade_orfa_ganha", resource: "oportunidades", beforeData: oportunidadeAtual || null, afterData: oportunidadeGanha, auditMetadata: { orcamentoId: orcamento.id, negocioId: negocio.id } }) : null;
      const historicoResult = historicoGanho ? await saveEntityCloudFirst("historicoFunil", historicoGanho, { ...persistenceOptions, auditAction: "registrar_historico_funil_ganho", resource: "historicoFunil", afterData: historicoGanho, auditMetadata: { orcamentoId: orcamento.id, negocioId: negocio.id, oportunidadeId: oportunidadeGanha?.id } }) : null;
      if ([negocioResult, orcamentoResult, oportunidadeResult, historicoResult].some((result) => result?.status === "conflict")) {
        toast.error("Conflito ao fechar venda. Atualize/recarregue os dados e tente novamente para evitar sobrescrever alterações mais recentes.");
        setClosingSale(false);
        return;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao fechar venda.");
      setClosingSale(false);
      return;
    }
    setNegocios((prev) => [negocio, ...prev.filter((n) => n.id !== negocio.id && n.orcamentoId !== orcamento.id)]);
    setOrcamentos((prev) => prev.map((o) => o.id === orcamento.id ? orcamentoConvertido : o));
    if (oportunidadeGanha) setOportunidades((prev) => [oportunidadeGanha, ...prev.filter((o) => o.id !== oportunidadeGanha.id)]);
    if (historicoGanho) setHistoricoFunil((prev) => [historicoGanho, ...prev.filter((h) => h.id !== historicoGanho.id)]);
    void recordAuditLog({ action: "fechar_venda", resource: "negocios", entityId: negocio.id, entityLabel: negocio.codigo, metadata: { orcamentoId: orcamento.id, oportunidadeId: orcamento.oportunidadeId, clienteId: orcamento.clienteId, valor: negocio.valorTotal, produtosAfetados: produtosComReserva(orcamento).map((r) => ({ produtoId: r.item.produtoId, quantidade: r.item.quantidadeTotal })) } });
    setClosingSale(false);
    setCloseSaleTarget(null);
    toast.success("Venda criada e orçamento convertido.");
  };


  const statusGuiados: Array<{ label: string; status: OrcamentoStatus }> = [
    { label: "Marcar em negociação", status: "Em negociação" },
    { label: "Marcar venda fechada", status: "Venda fechada pelo vendedor" },
    { label: "Enviar para aprovação", status: "Aguardando aprovação" },
    { label: "Aprovar pedido", status: "Aprovado pelo gestor" },
    { label: "Reprovar pedido", status: "Reprovado pelo gestor" },
    { label: "Cancelar/Perder", status: "Perdido" },
  ];

  const persistirStatusGuiado = async (orcamento: Orcamento, status: OrcamentoStatus) => {
    const destino = normalizePedidoStatus(status);
    const origem = normalizePedidoStatus(orcamento.status);
    if (origem === destino) return toast.error("O orçamento já está neste status.");
    if (!canTransitionPedidoStatus(origem, destino, normalizedRole)) return toast.error("Ação não permitida para seu papel ou status atual.");
    if (!canEditOrcamentos || !canSeeOrcamento(orcamento)) return toast.error("Você não tem permissão para editar este orçamento.");
    const current = new Date().toISOString();
    const payload: Orcamento = recalc({
      ...orcamento,
      status: destino,
      canalEnvio: destino === "Enviado ao cliente" ? (orcamento.canalEnvio || "WhatsApp") : orcamento.canalEnvio,
      dataEnvio: destino === "Enviado ao cliente" ? (orcamento.dataEnvio || current.slice(0, 10)) : orcamento.dataEnvio,
      updatedAt: current,
      updatedByUserId: user?.id || orcamento.updatedByUserId,
    });
    try {
      const result = await saveEntityCloudFirst("orcamentos", payload, { ...persistenceOptions, auditAction: "editar_status_orcamento", resource: "orcamentos", beforeData: orcamento, afterData: payload });
      if (result.status === "conflict") {
        toast.error("Conflito ao alterar status. Atualize/recarregue os dados e tente novamente para evitar sobrescrever alterações mais recentes.");
        return;
      }
      setOrcamentos((prev) => prev.map((o) => o.id === orcamento.id ? payload : o));
      void recordAuditLog({ action: "alterar_status_orcamento", resource: "orcamentos", entityId: orcamento.id, entityLabel: orcamento.codigo, metadata: { de: origem, para: destino, persistencia: result.status } });
      if (payload.oportunidadeId) {
        const etapaNova = pedidoStatusToEtapa(destino);
        setOportunidades((prev) => prev.map((o) => o.id === payload.oportunidadeId ? { ...o, etapa: etapaNova, orcamentoId: payload.id, valorEstimado: payload.valorTotal || o.valorEstimado, updatedAt: current } : o));
      }
      toast.success(result.status === "pending-offline" ? "Status salvo localmente e pendente de sincronização" : "Status do orçamento salvo");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao alterar status do orçamento.");
    }
  };

  const excluirOrcamento = async (orcamento: Orcamento) => {
    if (!canDeleteOrcamento(orcamento)) return toast.error("Você não tem permissão para excluir este orçamento.");
    if (!window.confirm(`Excluir o orçamento ${orcamento.codigo}? Esta ação não deve retornar após sincronização.`)) return;
    try {
      const result = await deleteEntityCloudFirst<Orcamento>("orcamentos", orcamento.id, {
        ...persistenceOptions,
        record: orcamento,
        auditAction: "excluir_orcamento",
        resource: "orcamentos",
        beforeData: orcamento,
        afterData: null,
      });
      setOrcamentos((prev) => prev.filter((item) => item.id !== orcamento.id));
      toast.success(result.status === "pending-offline" ? "Orçamento excluído localmente e pendente de sincronização" : "Orçamento excluído");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir orçamento.");
    }
  };

  if (!canViewOrcamentos) return <Card className="p-4">Você não tem permissão para visualizar orçamentos.</Card>;

  return <div className="space-y-3"><Button onClick={novoOrcamento} disabled={!canCreateOrcamentos}>Novo orçamento</Button>
    {orcamentosVisiveis.map((o) => <Card key={o.id} className="p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="flex-1 text-sm"><div className="font-semibold">{o.codigo} v{o.versao || 1} · {clientes.find((c) => c.id === o.clienteId)?.nome || "Sem cliente"}</div>
          <div className="text-muted-foreground">Status: {normalizePedidoStatus(o.status)} · Validade: {formatDateBR(o.validade)} · Responsável: {o.responsavelNome || o.vendedorNome || o.responsavel || o.vendedor || "-"}</div>
          <div className="text-muted-foreground">Oportunidade: {o.oportunidadeId || "Legado/sem vínculo"} · Envio: {o.canalEnvio || "-"} {o.dataEnvio ? `em ${formatDateBR(o.dataEnvio)}` : ""}</div></div>
        <div className="text-sm font-semibold">{fmtBRL(o.valorTotal)}</div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => { setEdit(o); setForm(o); setMotivoRevisao(o.motivoRevisao || ""); setOpen(true); }}>{isOrcamentoBloqueado(o, oportunidades) ? "Ver orçamento" : "Abrir/Editar"}</Button>
          <Button size="sm" variant="outline" onClick={() => gerarPdfProposta(o)}>PDF</Button>
          <Button size="sm" onClick={() => abrirModalEnvioProposta(o)} disabled={!canEnviarProposta(o)}>Enviar proposta</Button>
          <Button size="sm" onClick={() => criarNovaVersao(o)} disabled={isOrcamentoBloqueado(o, oportunidades) || !canCreateOrcamentos}>Criar nova versão</Button>
          <div className="flex flex-wrap gap-1">{statusGuiados.map((acao) => <Button key={acao.label} size="sm" variant="outline" onClick={() => void persistirStatusGuiado(o, acao.status)} disabled={normalizePedidoStatus(o.status) === normalizePedidoStatus(acao.status) || !canTransitionPedidoStatus(o.status, acao.status, normalizedRole)}>{acao.label}</Button>)}</div>
          {negocioVinculado(o) ? <Button size="sm" variant="secondary" disabled>Venda já criada</Button> : <Button size="sm" variant="secondary" onClick={() => setCloseSaleTarget(o)} disabled={!["Aprovado pelo gestor", "Reservado"].includes(normalizePedidoStatus(o.status)) || !canConvertOrcamentoToSale(o)}>Fechar venda aprovado</Button>}
          <Button size="sm" variant="destructive" onClick={() => void excluirOrcamento(o)} disabled={!canDeleteOrcamento(o)}>Excluir</Button>
        </div>
      </div>
    </Card>)}


    <Dialog open={!!sendProposalTarget} onOpenChange={(v) => !v && setSendProposalTarget(null)}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Enviar proposta</DialogTitle></DialogHeader>
      {sendProposalTarget && (() => { const cliente = clientes.find((c) => c.id === sendProposalTarget.clienteId); const mensagem = montarMensagemProposta(sendProposalTarget, cliente, currentUserAgent().nome); return <div className="space-y-3 text-sm">
        <Card className="p-3"><div className="grid gap-2 md:grid-cols-2">
          <div><b>Cliente:</b> {cliente?.nome || sendProposalTarget.clienteId}</div>
          <div><b>Proposta:</b> {sendProposalTarget.codigo} v{sendProposalTarget.versao || 1}</div>
          <div><b>Valor total:</b> {fmtBRL(sendProposalTarget.valorTotal)}</div>
          <div><b>Validade:</b> {formatDateBR(sendProposalTarget.validade) || "-"}</div>
          <div><b>Condição:</b> {sendProposalTarget.formaPagamento || "-"} / {sendProposalTarget.prazoPagamento || "-"}</div>
          <div><b>Responsável:</b> {sendProposalTarget.responsavelNome || sendProposalTarget.vendedorNome || sendProposalTarget.responsavel || sendProposalTarget.vendedor || "-"}</div>
        </div></Card>
        <div className="grid gap-2 md:grid-cols-2"><div><Label>Canal de envio</Label><Select value={sendProposalChannel} onValueChange={(v: CanalProposta) => setSendProposalChannel(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="WhatsApp">WhatsApp</SelectItem><SelectItem value="E-mail">E-mail</SelectItem></SelectContent></Select></div></div>
        <Card className="p-3"><b>Mensagem pronta</b><pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-xs">{mensagem}</pre><p className="mt-2 text-xs text-muted-foreground">O PDF deve ser baixado e anexado manualmente se o navegador/canal externo não permitir anexo automático.</p></Card>
        {sendProposalChannel === "WhatsApp" && !cliente?.telefone && <Card className="border-amber-500 bg-amber-50 p-3 text-amber-900">Cliente sem telefone cadastrado. O WhatsApp será aberto sem destinatário.</Card>}
        {sendProposalChannel === "E-mail" && !cliente?.email && <Card className="border-amber-500 bg-amber-50 p-3 text-amber-900">Cliente sem e-mail cadastrado. O e-mail será aberto sem destinatário.</Card>}
      </div>; })()}
      <DialogFooter><Button variant="outline" onClick={() => setSendProposalTarget(null)}>Cancelar</Button><Button variant="outline" onClick={() => sendProposalTarget && gerarPdfProposta(sendProposalTarget)}>Gerar/baixar PDF</Button><Button variant="secondary" onClick={abrirCanalProposta}>Abrir canal</Button><Button onClick={() => void confirmarEnvioProposta()} disabled={confirmingProposal}>{confirmingProposal ? "Confirmando..." : "Confirmar envio"}</Button></DialogFooter>
    </DialogContent></Dialog>

    <Dialog open={!!closeSaleTarget} onOpenChange={(v) => !v && setCloseSaleTarget(null)}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Fechar venda</DialogTitle></DialogHeader>
      {closeSaleTarget && <div className="space-y-3 text-sm">
        <Card className="p-3"><div className="grid gap-2 md:grid-cols-2">
          <div><b>Cliente:</b> {clientes.find((c) => c.id === closeSaleTarget.clienteId)?.nome || closeSaleTarget.clienteId}</div>
          <div><b>Responsável:</b> {closeSaleTarget.responsavelNome || closeSaleTarget.vendedorNome || closeSaleTarget.responsavel || closeSaleTarget.vendedor || "-"}</div>
          <div><b>Valor total:</b> {fmtBRL(closeSaleTarget.valorTotal)}</div>
          <div><b>Pagamento:</b> {closeSaleTarget.formaPagamento || "-"} · {closeSaleTarget.prazoPagamento || "-"}</div>
          <div><b>Previsão faturamento:</b> {formatDateBR(new Date().toISOString().slice(0, 10))}</div>
          <div><b>Previsão entrega:</b> {formatDateBR(closeSaleTarget.validade) || closeSaleTarget.prazoEntrega || "-"}</div>
        </div></Card>
        <Card className="p-3"><b>Produtos</b><div className="mt-2 space-y-1">{closeSaleTarget.itens.map((item) => <div key={item.id} className="flex justify-between gap-2"><span>{item.produtoNome || item.produtoId} · {item.quantidadeTotal.toLocaleString("pt-BR")} {item.unidadeProduto}</span><span>{fmtBRL(item.valorTotalItem)}</span></div>)}</div></Card>
        {negocioVinculado(closeSaleTarget) && <Card className="border-amber-500 bg-amber-50 p-3 text-amber-900">Venda já criada para este orçamento.</Card>}
      </div>}
      <DialogFooter><Button variant="outline" onClick={() => setCloseSaleTarget(null)}>Cancelar</Button><Button onClick={() => void confirmarFecharVenda()} disabled={closingSale || !closeSaleTarget || Boolean(closeSaleTarget && negocioVinculado(closeSaleTarget))}>{closingSale ? "Fechando..." : "Confirmar fechamento"}</Button></DialogFooter>
    </DialogContent></Dialog>

    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto max-w-6xl"><DialogHeader><DialogTitle>{edit ? "Editar" : "Novo"} orçamento</DialogTitle></DialogHeader>
      {orcamentoBloqueado && <Card className="border-amber-500 bg-amber-50 p-3 text-amber-900">Orçamento bloqueado: oportunidade já fechada. Para nova negociação, crie uma nova oportunidade.</Card>}
      <fieldset disabled={orcamentoBloqueado} className="space-y-2">
      <Card className="p-3 space-y-2"><h3 className="font-semibold">Dados da proposta</h3><div className="grid gap-2 md:grid-cols-5">
        <div><Label>Código</Label><Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} disabled={orcamentoBloqueado} /></div>
        <div><Label>Versão</Label><Input value={form.versao || 1} disabled /></div>
        <div><Label>Cliente</Label><Select value={form.clienteId} onValueChange={(v) => { const suggested = getSuggestedAgentForCliente(v); const next = { ...form, clienteId: v, oportunidadeId: undefined }; setForm(suggested && !isVendedor ? applyAgentToOrcamento(next, suggested) : next); }} disabled={orcamentoBloqueado}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Fazenda/propriedade</Label><Input value={form.fazenda || ""} onChange={(e) => setForm({ ...form, fazenda: e.target.value })} /></div>
        <div><Label>Cidade</Label><Input value={form.cidade || clientes.find((c) => c.id === form.clienteId)?.cidade || ""} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></div>
        <div><Label>Oportunidade vinculada</Label><Select value={form.oportunidadeId || (isLegacy ? "legacy" : "")} onValueChange={(v) => setForm({ ...form, oportunidadeId: v === "legacy" ? undefined : v })} disabled={orcamentoBloqueado}><SelectTrigger><SelectValue placeholder="Obrigatório para novo orçamento" /></SelectTrigger><SelectContent>{isLegacy && <SelectItem value="legacy">Legado/sem vínculo</SelectItem>}{oportunidadesAbertasCliente.map((o) => <SelectItem key={o.id} value={o.id}>{o.etapa} · {o.necessidade || o.id}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Empresa</Label><Select value={form.empresaId} onValueChange={(v) => setForm({ ...form, empresaId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{empresas.filter((e) => e.ativa).map((e) => <SelectItem key={e.id} value={e.id}>{e.nomeFantasia}</SelectItem>)}</SelectContent></Select></div>
        {!isVendedor && <div><Label>Responsável comercial</Label><Select value={form.responsavelUserId || form.vendedorUserId || ""} onValueChange={(agentId) => { const agent = selectableAgents.find((item) => item.user_id === agentId); if (agent) setForm(applyAgentToOrcamento(form, agent)); }}><SelectTrigger><SelectValue placeholder="Selecione o responsável" /></SelectTrigger><SelectContent>{selectableAgents.length ? selectableAgents.map((agent) => <SelectItem key={agent.user_id} value={agent.user_id}>{agent.nome} · {agent.papel}</SelectItem>) : <SelectItem value="sem-agente" disabled>Nenhum agente disponível</SelectItem>}</SelectContent></Select></div>}
        <div><Label>Data</Label><Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></div>
        <div><Label>Validade</Label><Input type="date" value={form.validade || ""} onChange={(e) => setForm({ ...form, validade: e.target.value })} /></div>
        <div><Label>Status</Label><Select value={form.status} onValueChange={(v: OrcamentoStatus) => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{statusOptions.map((s) => <SelectItem key={s} value={s} disabled={edit ? !canTransitionPedidoStatus(edit.status, s, normalizedRole) : s !== "Rascunho"}>{s}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Motivo revisão</Label><Input value={motivoRevisao} onChange={(e) => setMotivoRevisao(e.target.value)} /></div>
      </div></Card>

      <Card className="p-3 space-y-2"><h3 className="font-semibold">Itens da proposta</h3>
        {form.itens.map((it, idx) => { const p = produtos.find((x) => x.id === it.produtoId); const area = it.areaHa || form.areaAplicacaoHa; const calc = calcularQuantidadeComercial((p?.unidade || it.unidadeProduto), it.dosePorHa, it.unidadeDose, area); const precoLiquido = Math.max(0, it.precoUnitario - (it.desconto || 0)); const total = calc.quantidadeComercial * precoLiquido; const precoBase = calc.precoBaseDivisor > 0 ? precoLiquido / calc.precoBaseDivisor : precoLiquido; return <div key={it.id} className="grid gap-2 md:grid-cols-12">
          <div className="md:col-span-2"><Label>Produto</Label><Select value={it.produtoId} onValueChange={(v) => { const pp = produtos.find((x) => x.id === v); const itens = [...form.itens]; itens[idx] = recalcularItem({ ...it, produtoId: v, precoUnitario: pp?.precoLista || 0, precoMinimo: pp?.precoMinimo || 0, unidadeProduto: pp?.unidade || it.unidadeProduto, controlaEstoque: !!pp?.controlaEstoque, representacaoComissionado: !!pp?.representacaoComissionado || !pp?.controlaEstoque }, pp!); setForm(recalc({ ...form, itens })); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{produtos.map((pr) => <SelectItem key={pr.id} value={pr.id}>{pr.nome}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Dose/ha</Label><Input type="number" value={it.dosePorHa} onChange={(e) => { const itens = [...form.itens]; itens[idx] = { ...it, dosePorHa: +e.target.value }; setForm(recalc({ ...form, itens })); }} /></div>
          <div><Label>Unid. dose</Label><Select value={it.unidadeDose} onValueChange={(v: UnidadeDose) => { const itens = [...form.itens]; itens[idx] = { ...it, unidadeDose: v }; setForm(recalc({ ...form, itens })); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DOSE_UNIDADES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Área</Label><Input type="number" value={it.areaHa} onChange={(e) => { const itens = [...form.itens]; itens[idx] = { ...it, areaHa: +e.target.value }; setForm(recalc({ ...form, itens })); }} /></div>
          <div><Label>Qtd. calculada</Label><Input value={`${calc.quantidadeComercial.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${p?.unidade || it.unidadeProduto}`} disabled /></div>
          <div><Label>Unid. comercial</Label><Input value={p?.unidade || it.unidadeProduto} disabled /></div>
          <div><Label>Valor unit.</Label><Input type="number" value={it.precoUnitario} onChange={(e) => { const itens = [...form.itens]; itens[idx] = { ...it, precoUnitario: +e.target.value }; setForm(recalc({ ...form, itens })); }} /></div>
          <div><Label>Preço mín.</Label><Input value={fmtBRL(it.precoMinimo || p?.precoMinimo || 0)} disabled /></div>
          <div><Label>Desconto</Label><Input type="number" value={it.desconto || 0} onChange={(e) => { const itens = [...form.itens]; itens[idx] = { ...it, desconto: +e.target.value }; setForm(recalc({ ...form, itens })); }} disabled={!canManageOrcamentos} /></div>
          <div><Label>Subtotal item</Label><Input value={fmtBRL(total)} disabled /></div>
          <div><Label>Custo técnico/ha</Label><Input value={`${fmtBRL(it.custoPorHaItem || 0)}/ha`} disabled /></div>
          {it.abaixoPrecoMinimo && <div className="md:col-span-12 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">Alerta: preço líquido abaixo do preço mínimo. Somente usuários com a permissão específica excecao_preco_minimo podem salvar esta exceção.</div>}
          {it.controlaEstoque && !it.representacaoComissionado && <div className="md:col-span-12 text-xs text-muted-foreground">Estoque disponível: {it.estoqueDisponivel ?? Math.max(0, (p?.estoqueAtual || 0) - (p?.estoqueReservado || 0))}. {it.quantidadeTotal > (it.estoqueDisponivel || 0) ? "Quantidade acima do disponível." : "Reserva será feita somente ao aprovar."}</div>}
          <div className="md:col-span-12 text-xs text-muted-foreground">Necessidade técnica: {calc.necessidadeTecnica.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {calc.unidadeBase} → Quantidade comercial: {calc.quantidadeComercial.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {p?.unidade || it.unidadeProduto} (volume comercial: {calc.volumeComercial.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {calc.unidadeBase}). Preço base: {fmtBRL(precoBase)}/{calc.unidadeBase}. Valor total: {fmtBRL(total)}. Custo técnico: {fmtBRL(it.custoPorHaItem || 0)}/ha.</div>
        </div>; })}
        <Button variant="outline" onClick={() => setForm((f) => ({ ...f, itens: [...f.itens, novoItem(f.itens.length, f.areaAplicacaoHa)] }))}>Adicionar item</Button>
      </Card>

      <Card className="p-3"><h3 className="font-semibold">Condições comerciais</h3><div className="grid gap-2 md:grid-cols-4">
        <div><Label>Forma de pagamento</Label><Select value={form.formaPagamento || formaPagamentoPadrao} onValueChange={(v) => setForm({ ...form, formaPagamento: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(formasPagamentoAtivas.length ? formasPagamentoAtivas.map((f) => f.nome) : formasPagamentoFallback).map((nome) => <SelectItem key={nome} value={nome}>{nome}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Prazo pagamento</Label><Select value={form.prazoPagamento || prazoPagamentoPadrao} onValueChange={(v) => setForm({ ...form, prazoPagamento: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(prazosPagamentoAtivos.length ? prazosPagamentoAtivos.map((p) => p.nome) : prazosPagamentoFallback).map((nome) => <SelectItem key={nome} value={nome}>{nome}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Desconto total</Label><Input type="number" value={form.descontoTotal || 0} onChange={(e) => setForm(recalc({ ...form, descontoTotal: +e.target.value }))} disabled={!canManageOrcamentos} /></div>
        <div><Label>Canal de envio</Label><Select value={form.canalEnvio || ""} onValueChange={(v) => setForm({ ...form, canalEnvio: v })}><SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger><SelectContent>{CANAIS_ENVIO.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Data envio</Label><Input type="date" value={form.dataEnvio || ""} onChange={(e) => setForm({ ...form, dataEnvio: e.target.value })} /></div>
        <div><Label>Prazo de entrega</Label><Input value={form.prazoEntrega || ""} onChange={(e) => setForm({ ...form, prazoEntrega: e.target.value })} /></div>
        <div className="md:col-span-3"><Label>Observações comerciais</Label><Input value={form.observacoes || ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
      </div></Card>

      <Card className="p-3"><h3 className="font-semibold">Totais</h3><div className="grid gap-2 md:grid-cols-4 text-sm"><div>Subtotal: <b>{fmtBRL(form.subtotal)}</b></div><div>Desconto: <b>{fmtBRL(form.descontoTotal || 0)}</b></div><div>Valor total: <b>{fmtBRL(form.valorTotal)}</b></div><div>Custo médio/ha: <b>{fmtBRL(form.custoPorHectare)}/ha</b></div></div></Card>

      </fieldset>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save} disabled={orcamentoBloqueado}>Salvar</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
