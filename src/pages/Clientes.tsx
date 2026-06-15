import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAppStore } from "@/store/AppStore";
import { ROTAS_NOMES } from "@/data/mockData";
import { Cliente, ABC } from "@/types";
import { fmtBRL, fmtNum } from "@/utils/calculations";
import { computeClienteStatus, formatDateBR, isClienteAtrasado, sugestaoRetornoDias } from "@/lib/clientesUtils";
import { normalizeClienteForPersistence, normalizeClientesForPersistence } from "@/lib/clientNormalization";
import { saveOperationalEntity, type OperationalPersistenceStatus } from "@/lib/operationalPersistence";
import { fetchRemoteSnapshot } from "@/lib/supabaseSync";
import { useAuth } from "@/store/AuthStore";
import { canCreate, canDelete, canEdit, canManage, canView, isAdminRole, normalizeRole } from "@/lib/permissions";
import { normalizeAccessStatus } from "@/lib/accessStatus";
import { supabase } from "@/lib/supabase";
import { recordAuditLog } from "@/lib/audit";
import { calcularPotencialCliente, calcularValorMedioHaSegmentosAtivos } from "@/utils/businessRules";
import { Plus, Pencil, Trash2, Eye, Search, Filter, X, MapPin } from "lucide-react";
import { toast } from "sonner";

const ALL = "__all__";
type CommercialAgent = { user_id: string; nome: string; papel: "vendedor" | "gestor" | "administrador" | "visualizador"; status: string; superior_user_id?: string | null };
const sameText = (a?: string | null, b?: string | null) => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
const empty: Omit<Cliente, "id"> = {
  nome: "", abc: "A", prioridade: "P2", rota: "Rota Norte", cidade: "", localidade: "", culturas: "",
  areaHa: 0, potencialTotal: 0, statusAtual: "Prospectar", frequenciaRetorno: "30 dias", retorno: "30 dias", vendedor: "", potencialCalculado: 0, inativoManual: false,
  documento: "", inscricaoEstadual: "", endereco: "", telefone: "", email: "", nomeContato: "", culturaPrincipal: "", areaAplicacaoPotencial: "",
  latitude: undefined, longitude: undefined, coordenadas: "", linkMapa: "", observacaoLocalizacao: "",
};

export default function Clientes() {
  const { clientes, setClientes, lancamentos, negocios, ticketsMedios, orcamentos, proximasAcoes, refreshPendingSyncCount, runManualUploadSync } = useAppStore();
  const { role, accessStatus, user, vendedorNome, vendedorId, permissions, session } = useAuth();
  const permissionContext = { role, accessStatus, email: user?.email, vendedorNome, vendedorId, permissions };
  const canViewClientes = canView("clientes", permissionContext);
  const canCreateClientes = canCreate("clientes", permissionContext);
  const canEditClientes = canEdit("clientes", permissionContext);
  const canDeleteClientes = canDelete("clientes", permissionContext);
  const canManageClientes = canManage("clientes", permissionContext);
  const normalizedRole = normalizeRole(role);
  const isAdmin = isAdminRole(role);
  const isGestor = normalizedRole === "gestor";
  const isVendedor = normalizedRole === "vendedor";
  const [commercialAgents, setCommercialAgents] = useState<CommercialAgent[]>([]);
  const [busca, setBusca] = useState("");
  const [fAbc, setFAbc] = useState(""); const [fPri, setFPri] = useState(""); const [fRota, setFRota] = useState(""); const [fStatus, setFStatus] = useState(""); const [fCidade, setFCidade] = useState(""); const [fAtrasado, setFAtrasado] = useState("");
  const [fVendedor, setFVendedor] = useState(""); const [fGeo, setFGeo] = useState(""); const [fProximaAcao, setFProximaAcao] = useState(""); const [fIncompletos, setFIncompletos] = useState("");
  const [filtrosOpen, setFiltrosOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Cliente | null>(null);
  const [form, setForm] = useState<Omit<Cliente, "id">>(empty);
  const [view, setView] = useState<Cliente | null>(null);
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [operationStatus, setOperationStatus] = useState<OperationalPersistenceStatus | null>(null);
  const [lastCloudRefreshAt, setLastCloudRefreshAt] = useState<string | null>(null);


  useEffect(() => {
    if (!supabase) {
      const localName = vendedorNome || user?.user_metadata?.nome || user?.email || "Administrador local";
      setCommercialAgents([{ user_id: user?.id || vendedorId || "local-admin", nome: localName, papel: normalizedRole as CommercialAgent["papel"], status: "ativo" }]);
      return;
    }
    if (!user) { setCommercialAgents([]); return; }
    void (async () => {
      const { data, error } = await supabase.from("user_profiles").select("user_id,nome,email,papel,status,superior_user_id").eq("status", "ativo").in("papel", ["vendedor", "gestor", "administrador"]);
      if (error) toast.error(error.message);
      setCommercialAgents((data ?? []).filter((profile) => profile.user_id).map((profile) => ({ user_id: profile.user_id!, nome: profile.nome || profile.email || profile.user_id!, papel: normalizeRole(profile.papel) as CommercialAgent["papel"], status: profile.status || "ativo", superior_user_id: profile.superior_user_id })));
    })();
  }, [normalizedRole, user, vendedorId, vendedorNome]);

  const teamSellerIds = useMemo(() => new Set(commercialAgents.filter((agent) => agent.papel === "vendedor" && agent.superior_user_id === user?.id).map((agent) => agent.user_id)), [commercialAgents, user?.id]);
  const selectableAgents = useMemo(() => {
    if (isAdmin) return commercialAgents;
    if (isGestor) return commercialAgents.filter((agent) => agent.user_id === user?.id || teamSellerIds.has(agent.user_id));
    return commercialAgents.filter((agent) => agent.user_id === user?.id);
  }, [commercialAgents, isAdmin, isGestor, teamSellerIds, user?.id]);
  const currentUserAgent = (): CommercialAgent => ({ user_id: user?.id || vendedorId || "", nome: vendedorNome || user?.user_metadata?.nome || user?.email || "", papel: normalizedRole as CommercialAgent["papel"], status: "ativo" });
  const applyAgentToCliente = (cliente: Omit<Cliente, "id">, agent: CommercialAgent): Omit<Cliente, "id"> => ({ ...cliente, responsavelUserId: agent.user_id, responsavelNome: agent.nome, vendedorUserId: agent.user_id, vendedorNome: agent.nome, vendedor: agent.nome });
  const getClienteResponsavelId = (cliente: Cliente | Omit<Cliente, "id">) => cliente.responsavelUserId || cliente.vendedorUserId || cliente.vendedorId;
  const getClienteResponsavelNome = (cliente: Cliente | Omit<Cliente, "id">) => cliente.responsavelNome || cliente.vendedorNome || cliente.vendedor;
  const canSeeCliente = useCallback((cliente: Cliente) => {
    if (isAdmin) return true;
    const ownId = user?.id || vendedorId || undefined;
    const candidateIds = [cliente.responsavelUserId, cliente.vendedorUserId, cliente.createdByUserId].filter(Boolean);
    const candidateName = getClienteResponsavelNome(cliente);
    if (isGestor) {
      if (candidateIds.some((id) => id === ownId || teamSellerIds.has(id!))) return true;
      if (!cliente.responsavelUserId && !cliente.vendedorUserId) return selectableAgents.some((agent) => sameText(agent.nome, candidateName));
      return false;
    }
    if (isVendedor) {
      if (candidateIds.some((id) => id === ownId)) return true;
      return sameText(vendedorNome, candidateName);
    }
    return canViewClientes && (candidateIds.includes(ownId) || sameText(vendedorNome, candidateName));
  }, [canViewClientes, isAdmin, isGestor, isVendedor, selectableAgents, teamSellerIds, user?.id, vendedorId, vendedorNome]);
  const canMutateCliente = (cliente: Cliente, action: "edit" | "delete") => (action === "edit" ? (canEditClientes || canManageClientes) : (canDeleteClientes || canManageClientes)) && canSeeCliente(cliente);

  const triggerFastSync = useCallback(() => {
    void refreshPendingSyncCount();
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    window.setTimeout(() => { void runManualUploadSync(); }, 1_000);
  }, [refreshPendingSyncCount, runManualUploadSync]);

  const refreshClientesFromCloud = useCallback(async () => {
    if (!session?.user || normalizeAccessStatus(accessStatus) !== "active" || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    try {
      const snapshot = await fetchRemoteSnapshot({ session, accessStatus: "active" });
      const remoteClientes = normalizeClientesForPersistence((snapshot.clientes ?? []) as Record<string, unknown>[]) as Cliente[];
      if (remoteClientes.length === 0) {
        setLastCloudRefreshAt(new Date().toISOString());
        return;
      }
      setClientes((current) => {
        const byId = new Map(current.map((cliente) => [cliente.id, cliente]));
        remoteClientes.forEach((cliente) => byId.set(cliente.id, cliente));
        return Array.from(byId.values());
      });
      setLastCloudRefreshAt(new Date().toISOString());
    } catch (error) {
      console.warn("Não foi possível atualizar clientes da nuvem:", error);
    }
  }, [accessStatus, session, setClientes]);

  useEffect(() => {
    void refreshClientesFromCloud();
    const onFocus = () => void refreshClientesFromCloud();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refreshClientesFromCloud]);

  const clientesVisiveis = useMemo(() => clientes.filter(canSeeCliente), [clientes, canSeeCliente]);
  const cidades = useMemo(() => Array.from(new Set(clientesVisiveis.map(c => c.cidade))), [clientesVisiveis]);
  const statuses = useMemo(() => Array.from(new Set(clientesVisiveis.map(c => c.statusAtual))), [clientesVisiveis]);

  const visitasCliente = (id: string) => lancamentos.filter(l => l.clienteId === id && l.tipo === "Visita");
  const totalVisitas = (id: string) => visitasCliente(id).length;
  const ultimaVisita = (id: string) => visitasCliente(id).sort((a, b) => b.data.localeCompare(a.data))[0]?.data;
  const proximaAcaoPendente = (id: string) => proximasAcoes.find(a => a.clienteId === id && a.status === "Pendente");
  const totalProximasAcoesAbertas = (id: string) => proximasAcoes.filter(a => a.clienteId === id && a.status === "Pendente").length;
  const atrasado = useCallback((c: Cliente) => isClienteAtrasado(c, proximasAcoes), [proximasAcoes]);
  const lista = useMemo(() => clientesVisiveis.filter(c =>
    (!busca || c.nome.toLowerCase().includes(busca.toLowerCase())) &&
    (!fAbc || c.abc === fAbc) &&
    (!fPri || c.prioridade === fPri) &&
    (!fRota || c.rota === fRota) && (!fStatus || c.statusAtual === fStatus) &&
    (!fCidade || c.cidade === fCidade) &&
    (!fAtrasado || (fAtrasado === "sim" ? atrasado(c) : !atrasado(c))) &&
    (!fVendedor || getClienteResponsavelId(c) === fVendedor || sameText(getClienteResponsavelNome(c), fVendedor)) &&
    (!fGeo || (fGeo === "com" ? (!!c.latitude && !!c.longitude) : (!c.latitude || !c.longitude))) &&
    (!fProximaAcao || (fProximaAcao === "com" ? !!proximaAcaoPendente(c.id) : !proximaAcaoPendente(c.id))) &&
    (!fIncompletos || (fIncompletos === "sim" ? (!getClienteResponsavelNome(c) || !c.rota || !c.telefone || !c.documento || !c.latitude || !c.longitude || !c.abc || !c.prioridade || !proximaAcaoPendente(c.id)) : !!getClienteResponsavelNome(c) && !!c.rota && !!c.telefone && !!c.documento && !!c.latitude && !!c.longitude && !!c.abc && !!c.prioridade && !!proximaAcaoPendente(c.id)))
  ), [clientesVisiveis, busca, fAbc, fPri, fRota, fStatus, fCidade, fAtrasado, fVendedor, fGeo, fProximaAcao, fIncompletos, atrasado, proximaAcaoPendente]);

  const totais = useMemo(() => ({
    potencial: lista.reduce((s, c) => s + c.potencialTotal, 0),
    area: lista.reduce((s, c) => s + c.areaHa, 0),
  }), [lista]);
  const valorMedioSegmentosAtivos = useMemo(() => calcularValorMedioHaSegmentosAtivos(ticketsMedios), [ticketsMedios]);
  const qualidadeBase = useMemo(() => ({
    totalClientes: clientesVisiveis.length,
    areaTotal: clientesVisiveis.reduce((s, c) => s + (c.areaHa || 0), 0),
    semVendedor: clientesVisiveis.filter((c) => !getClienteResponsavelNome(c)).length,
    semRota: clientesVisiveis.filter((c) => !c.rota).length,
    semTelefone: clientesVisiveis.filter((c) => !c.telefone).length,
    semDocumento: clientesVisiveis.filter((c) => !c.documento).length,
    semGeo: clientesVisiveis.filter((c) => !c.latitude || !c.longitude).length,
    semPrioridadeAbc: clientesVisiveis.filter((c) => !c.prioridade || !c.abc).length,
    semProximaAcao: clientesVisiveis.filter((c) => !proximaAcaoPendente(c.id)).length,
    porVendedor: Object.entries(clientesVisiveis.reduce((m, c) => { const k = getClienteResponsavelNome(c) || "Sem responsável"; m[k] = (m[k] || 0) + 1; return m; }, {} as Record<string, number>)),
    porRota: Object.entries(clientesVisiveis.reduce((m, c) => { const k = c.rota || "Sem rota"; m[k] = (m[k] || 0) + 1; return m; }, {} as Record<string, number>)),
    porCidade: Object.entries(clientesVisiveis.reduce((m, c) => { const k = c.cidade || "Sem cidade"; m[k] = (m[k] || 0) + 1; return m; }, {} as Record<string, number>)),
  }), [clientesVisiveis, proximaAcaoPendente]);


  const openNew = () => { if (!canCreateClientes) return toast.error("Você não tem permissão para criar clientes."); setEdit(null); setForm(isVendedor ? applyAgentToCliente(empty, currentUserAgent()) : empty); setOpen(true); };
  useEffect(() => { if (params.get("new")) { openNew(); setParams({}); } }, [params, setParams]);
  const openEdit = (c: Cliente) => { if (!canMutateCliente(c, "edit")) return toast.error("Você não tem permissão para editar este cliente."); setEdit(c); const { id, ...rest } = c; void id; setForm(rest); setOpen(true); };
  const calcStatus = (clienteId: string, inativoManual?: boolean) => {
    if (inativoManual) return "Inativo";
    const now = new Date();
    const hasNeg = negocios.some(n => n.clienteId === clienteId && ((now.getTime()-new Date(n.ultimaAtualizacao||n.dataCriacao).getTime())/86400000) <= 365);
    if (hasNeg) return "Ativo";
    const lastVisit = lancamentos.filter(l => l.clienteId === clienteId && l.tipo === "Visita").sort((a,b)=>b.data.localeCompare(a.data))[0];
    if (!lastVisit) return "Prospectar";
    const days = (now.getTime()-new Date(lastVisit.data).getTime())/86400000;
    return days <= 90 ? "Visita" : "Prospectar";
  };
  
  const save = async () => {
    if (edit && !canMutateCliente(edit, "edit")) return toast.error("Você não tem permissão para editar este cliente.");
    if (!edit && !canCreateClientes) return toast.error("Você não tem permissão para criar clientes.");
    if (!form.nome) return toast.error("Nome obrigatório.");
    let assignedForm = form;
    if (isVendedor) assignedForm = applyAgentToCliente(form, currentUserAgent());
    const selectedAgentId = getClienteResponsavelId(assignedForm);
    const selectedAgent = selectableAgents.find((agent) => agent.user_id === selectedAgentId) || (isVendedor ? currentUserAgent() : undefined);
    if (!selectedAgent) return toast.error("Selecione um responsável comercial válido.");
    assignedForm = applyAgentToCliente(assignedForm, selectedAgent);
    const beforeResponsavelId = edit ? getClienteResponsavelId(edit) : undefined;
    const potencialCalculado = calcularPotencialCliente(assignedForm as Cliente, ticketsMedios);
    const base = normalizeClienteForPersistence({ ...assignedForm, potencialTotal: potencialCalculado, potencialCalculado: valorMedioSegmentosAtivos > 0 ? potencialCalculado : assignedForm.potencialTotal, frequenciaRetorno: assignedForm.frequenciaRetorno || `${sugestaoRetornoDias(assignedForm as Cliente, computeClienteStatus(assignedForm as Cliente, lancamentos, negocios, orcamentos), negocios)} dias`, statusAtual: computeClienteStatus({ ...assignedForm, id: edit?.id || "novo" } as Cliente, lancamentos, negocios, orcamentos), createdByUserId: edit?.createdByUserId || user?.id, updatedByUserId: user?.id } as Cliente, ticketsMedios);
    const saved = edit ? { ...base, id: edit.id } as Cliente : { ...base, id: `c${Date.now()}` } as Cliente;
    const action = edit ? "editar_cliente" : "criar_cliente";
    const result = await saveOperationalEntity("clientes", saved, "upsert", {
      session,
      accessStatus,
      onStatusChange: setOperationStatus,
      onRemoteSuccess: async () => {
        await recordAuditLog({ action: "sincronizar_cliente_imediato", resource: "clientes", entityId: saved.id, entityLabel: saved.nome, afterData: saved, metadata: { operation: "upsert" } });
      },
      onRemoteError: async (error) => {
        await recordAuditLog({ action: "erro_sync_cliente", resource: "clientes", entityId: saved.id, entityLabel: saved.nome, afterData: saved, metadata: { operation: "upsert", error: error.message } });
      },
    });
    if (edit) setClientes(prev => prev.map(c => c.id === edit.id ? saved : c));
    else setClientes(prev => [...prev, saved]);
    void recordAuditLog({ action, resource: "clientes", entityId: saved.id, entityLabel: saved.nome, beforeData: edit, afterData: saved });
    if (edit && beforeResponsavelId !== getClienteResponsavelId(saved)) void recordAuditLog({ action: "alterar_responsavel_cliente", resource: "clientes", entityId: saved.id, entityLabel: saved.nome, beforeData: { responsavelUserId: beforeResponsavelId, responsavelNome: getClienteResponsavelNome(edit) }, afterData: { responsavelUserId: getClienteResponsavelId(saved), responsavelNome: getClienteResponsavelNome(saved) }, metadata: { responsavelAnterior: getClienteResponsavelNome(edit), responsavelNovo: getClienteResponsavelNome(saved) } });
    await refreshPendingSyncCount();
    if (result.status === "pending-offline") triggerFastSync();
    setOpen(false); toast.success(result.status === "synced" ? "Cliente salvo e sincronizado." : "Cliente salvo com pendência offline.");
  };

  const deleteCliente = async (cliente: Cliente) => {
    if (!canMutateCliente(cliente, "delete")) return toast.error("Você não tem permissão para excluir este cliente.");
    const result = await saveOperationalEntity("clientes", cliente, "delete", {
      session,
      accessStatus,
      onStatusChange: setOperationStatus,
      onRemoteSuccess: async () => {
        await recordAuditLog({ action: "sincronizar_cliente_imediato", resource: "clientes", entityId: cliente.id, entityLabel: cliente.nome, beforeData: cliente, metadata: { operation: "delete" } });
      },
      onRemoteError: async (error) => {
        await recordAuditLog({ action: "erro_sync_cliente", resource: "clientes", entityId: cliente.id, entityLabel: cliente.nome, beforeData: cliente, metadata: { operation: "delete", error: error.message } });
      },
    });
    setClientes(prev => prev.filter(x => x.id !== cliente.id));
    void recordAuditLog({ action: "excluir_cliente", resource: "clientes", entityId: cliente.id, entityLabel: cliente.nome, beforeData: cliente });
    await refreshPendingSyncCount();
    if (result.status === "pending-offline") triggerFastSync();
    toast.success(result.status === "synced" ? "Cliente excluído e sincronizado." : "Cliente excluído com pendência offline.");
  };

  if (!canViewClientes) return <Card className="p-6"><p className="font-medium">Acesso bloqueado</p><p className="text-sm text-muted-foreground">Você não tem permissão para visualizar clientes.</p></Card>;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Label className="text-xs">Buscar</Label>
            <Search className="absolute left-2 top-[30px] h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-7" placeholder="Nome do cliente..." value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <Button variant="outline" onClick={() => setFiltrosOpen(true)}><Filter className="mr-2 h-4 w-4" />Filtros</Button>
          {canCreateClientes && <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Novo cliente</Button>}
        </div>
        <div className="mt-3 flex gap-4 text-sm">
          <Badge variant="outline">Clientes: {lista.length}</Badge>
          <Badge variant="outline">Área total: {fmtNum(totais.area)} ha</Badge>
          <Badge variant="outline">Potencial: {fmtBRL(totais.potencial)}</Badge>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Cidades disponíveis: {cidades.join(", ")}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Última atualização da nuvem: {lastCloudRefreshAt ? new Date(lastCloudRefreshAt).toLocaleString("pt-BR") : "ainda não consultada"} • Status operacional: {operationStatus === "sending" ? "Enviando..." : operationStatus === "synced" ? "Sincronizado" : operationStatus === "pending-offline" ? "Pendente offline" : "Pronto"}</p>
        <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
          <Badge variant="secondary">Base: {qualidadeBase.totalClientes} clientes • {fmtNum(qualidadeBase.areaTotal)} ha</Badge>
          <Badge variant="destructive">Sem responsável: {qualidadeBase.semVendedor}</Badge><Badge variant="destructive">Sem rota: {qualidadeBase.semRota}</Badge>
          <Badge variant="destructive">Sem telefone: {qualidadeBase.semTelefone}</Badge><Badge variant="destructive">Sem CPF/CNPJ: {qualidadeBase.semDocumento}</Badge>
          <Badge variant="destructive">Sem geo: {qualidadeBase.semGeo}</Badge><Badge variant="destructive">Sem prioridade/ABC: {qualidadeBase.semPrioridadeAbc}</Badge>
          <Badge variant="destructive">Sem próxima ação: {qualidadeBase.semProximaAcao}</Badge>
        </div>
        <div className="mt-2 grid gap-3 text-xs text-muted-foreground md:grid-cols-3">
          <div><b className="text-foreground">Clientes por responsável:</b> {qualidadeBase.porVendedor.map(([k,v]) => `${k} (${v})`).join(", ")}</div>
          <div><b className="text-foreground">Clientes por rota:</b> {qualidadeBase.porRota.map(([k,v]) => `${k} (${v})`).join(", ")}</div>
          <div><b className="text-foreground">Clientes por cidade:</b> {qualidadeBase.porCidade.map(([k,v]) => `${k} (${v})`).join(", ")}</div>
        </div>
      </Card>

      <div className="grid gap-3 md:hidden">
        {lista.map((c) => (
          <Card key={c.id} className="p-3">
            <div className="mb-2 flex items-start justify-between gap-2"><div><p className="font-semibold">{c.nome}</p><p className="text-xs text-muted-foreground">{c.localidade || c.endereco || "Localidade não informada"}</p></div><Badge variant="outline">{c.statusAtual}</Badge></div>
            <div className="grid grid-cols-2 gap-1 text-xs">
              <span><b>Cidade:</b> {c.cidade || "—"}</span><span><b>Responsável:</b> {getClienteResponsavelNome(c) || "—"}</span>
              <span><b>Rota:</b> {c.rota || "—"}</span><span><b>ABC/Pri:</b> {c.abc}/{c.prioridade}</span>
              <span><b>Área:</b> {fmtNum(c.areaHa)} ha</span><span><b>Próx. ação:</b> {proximaAcaoPendente(c.id) ? "Sim" : "Não"}</span>
              <span className="col-span-2"><b>Geo:</b> {c.latitude && c.longitude ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />Com geolocalização</span> : "Sem geolocalização"}</span>
            </div>
            <div className="mt-3 flex justify-end gap-1">
              <Button size="icon" variant="ghost" onClick={() => nav(`/clientes/${c.id}`)}><Eye className="h-3.5 w-3.5" /></Button>
              {canMutateCliente(c, "edit") && <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>}
              {canMutateCliente(c, "delete") && <AlertDialog>
                <AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Excluir cliente?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => void deleteCliente(c)}>Excluir</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>}
            </div>
          </Card>
        ))}
      </div>

      <Card className="hidden overflow-x-auto p-0 md:block">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Cliente</TableHead><TableHead>ABC</TableHead>
            <TableHead>Rota</TableHead><TableHead>Cidade</TableHead>
            <TableHead className="text-right">Área (ha)</TableHead><TableHead className="text-right">Potencial</TableHead>
            <TableHead>Status</TableHead><TableHead>Última visita</TableHead><TableHead>Próxima ação</TableHead><TableHead>Próximo retorno</TableHead><TableHead className="text-right">Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {lista.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium"><button className="text-left text-primary hover:underline" onClick={() => nav(`/clientes/${c.id}`)}>{c.nome}</button></TableCell>
                <TableCell><Badge variant="outline">{c.abc}</Badge></TableCell>
                                <TableCell>{c.rota}</TableCell><TableCell>{c.cidade}</TableCell>
                <TableCell className="text-right">{fmtNum(c.areaHa)}</TableCell>
                <TableCell className="text-right">{fmtBRL(c.potencialTotal)}</TableCell>
                <TableCell>{c.statusAtual} {atrasado(c) && <Badge className="ml-1" variant="destructive">Atrasado</Badge>}</TableCell><TableCell>{formatDateBR(ultimaVisita(c.id)) || "Sem visita registrada"}</TableCell><TableCell>{proximaAcaoPendente(c.id)?.descricao || "—"}</TableCell><TableCell>{formatDateBR(proximaAcaoPendente(c.id)?.data || c.retorno)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => nav(`/clientes/${c.id}`)}><Eye className="h-3.5 w-3.5" /></Button>
                    {canMutateCliente(c, "edit") && <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>}
                    {canMutateCliente(c, "delete") && <AlertDialog>
                      <AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Excluir cliente?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => void deleteCliente(c)}>Excluir</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={filtrosOpen} onOpenChange={setFiltrosOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Filtros de clientes</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-3">
            <div><Label className="text-xs">ABC</Label><Select value={fAbc || ALL} onValueChange={v => setFAbc(v === ALL ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos</SelectItem>{["A","B","C"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Prioridade</Label><Select value={fPri || ALL} onValueChange={v => setFPri(v === ALL ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todas</SelectItem>{["P1","P2","P3"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Rota</Label><Select value={fRota || ALL} onValueChange={v => setFRota(v === ALL ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todas</SelectItem>{ROTAS_NOMES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Cidade</Label><Select value={fCidade || ALL} onValueChange={v => setFCidade(v === ALL ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todas</SelectItem>{cidades.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Status</Label><Select value={fStatus || ALL} onValueChange={v => setFStatus(v === ALL ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos</SelectItem>{statuses.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
            {!isVendedor && <div><Label className="text-xs">Responsável comercial</Label><Select value={fVendedor || ALL} onValueChange={v => setFVendedor(v === ALL ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos</SelectItem>{selectableAgents.map(agent => <SelectItem key={agent.user_id} value={agent.user_id}>{agent.nome}</SelectItem>)}</SelectContent></Select></div>}
            <div><Label className="text-xs">Com/Sem geolocalização</Label><Select value={fGeo || ALL} onValueChange={v => setFGeo(v === ALL ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos</SelectItem><SelectItem value="com">Com geo</SelectItem><SelectItem value="sem">Sem geo</SelectItem></SelectContent></Select></div>
            <div><Label className="text-xs">Com/Sem próxima ação</Label><Select value={fProximaAcao || ALL} onValueChange={v => setFProximaAcao(v === ALL ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos</SelectItem><SelectItem value="com">Com ação</SelectItem><SelectItem value="sem">Sem ação</SelectItem></SelectContent></Select></div>
            <div><Label className="text-xs">Dados incompletos</Label><Select value={fIncompletos || ALL} onValueChange={v => setFIncompletos(v === ALL ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos</SelectItem><SelectItem value="sim">Incompletos</SelectItem><SelectItem value="nao">Completos</SelectItem></SelectContent></Select></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setFAbc(""); setFPri(""); setFRota(""); setFStatus(""); setFCidade(""); setFAtrasado(""); setFVendedor(""); setFGeo(""); setFProximaAcao(""); setFIncompletos(""); }}><X className="mr-2 h-4 w-4" />Limpar filtros</Button>
            <Button variant="outline" onClick={() => setFiltrosOpen(false)}>Fechar</Button>
            <Button onClick={() => setFiltrosOpen(false)}>Aplicar filtros</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{edit ? "Editar cliente" : "Novo cliente"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2"><Label>Nome</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
            <div><Label>ABC</Label><Select value={form.abc} onValueChange={(v: ABC) => setForm({ ...form, abc: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["A","B","C"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Prioridade</Label><Select value={form.prioridade} onValueChange={v => setForm({ ...form, prioridade: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["P1","P2","P3"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Rota</Label><Select value={form.rota} onValueChange={v => setForm({ ...form, rota: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROTAS_NOMES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
            {isVendedor ? <div><Label>Responsável comercial</Label><p className="rounded-md border px-3 py-2 text-sm">Responsável comercial: {getClienteResponsavelNome(form) || currentUserAgent().nome || "usuário atual"}</p></div> : <div><Label>Responsável comercial</Label><Select value={getClienteResponsavelId(form) || ALL} onValueChange={v => { const agent = selectableAgents.find(a => a.user_id === v); setForm(agent ? applyAgentToCliente(form, agent) : { ...form, responsavelUserId: undefined, responsavelNome: undefined, vendedorUserId: undefined, vendedorNome: undefined, vendedor: "" }); }} disabled={isVendedor}><SelectTrigger><SelectValue placeholder="Selecione o responsável" /></SelectTrigger><SelectContent><SelectItem value={ALL}>Não definido</SelectItem>{selectableAgents.map(agent => <SelectItem key={agent.user_id} value={agent.user_id}>{agent.nome} · {agent.papel}</SelectItem>)}</SelectContent></Select></div>}
            <div><Label>Cidade</Label><Input value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} /></div>
            <div><Label>Área (ha)</Label><Input type="number" step="0.01" value={form.areaHa} onChange={e => setForm({ ...form, areaHa: Number(e.target.value || 0) })} /></div>
            <div><Label>Potencial total</Label><Input type="number" step="0.01" value={valorMedioSegmentosAtivos > 0 ? form.areaHa * valorMedioSegmentosAtivos : 0} disabled /></div>
            <div className="md:col-span-2 text-xs text-muted-foreground">Potencial calculado automaticamente: área total do cliente × soma dos valores médios por hectare dos segmentos ativos.</div>
            <div><Label>Inativo manual</Label><Select value={form.inativoManual ? "1":"0"} onValueChange={v=>setForm({ ...form, inativoManual: v==="1" })}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="0">Não</SelectItem><SelectItem value="1">Sim</SelectItem></SelectContent></Select></div>
            <div><Label>Status atual</Label><Input value={form.statusAtual} disabled /></div>
            <div><Label>Frequência de retorno</Label><Input value={form.frequenciaRetorno} onChange={e => setForm({ ...form, frequenciaRetorno: e.target.value })} /></div>
            
            <div><Label>CPF/CNPJ</Label><Input value={form.documento || ""} onChange={e => setForm({ ...form, documento: e.target.value })} /></div>
            <div><Label>Inscrição estadual</Label><Input value={form.inscricaoEstadual || ""} onChange={e => setForm({ ...form, inscricaoEstadual: e.target.value })} /></div>
            <div><Label>Telefone</Label><Input value={form.telefone || ""} onChange={e => setForm({ ...form, telefone: e.target.value })} /></div>
            <div><Label>E-mail</Label><Input value={form.email || ""} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Nome do contato</Label><Input value={form.nomeContato || ""} onChange={e => setForm({ ...form, nomeContato: e.target.value })} /></div>
            <div><Label>Endereço</Label><Input value={form.endereco || ""} onChange={e => setForm({ ...form, endereco: e.target.value })} /></div>
            <div><Label>Latitude</Label><Input type="number" step="0.000001" value={form.latitude ?? ""} onChange={e => setForm({ ...form, latitude: e.target.value ? Number(e.target.value) : undefined })} /></div>
            <div><Label>Longitude</Label><Input type="number" step="0.000001" value={form.longitude ?? ""} onChange={e => setForm({ ...form, longitude: e.target.value ? Number(e.target.value) : undefined })} /></div>
            <div><Label>Coordenadas</Label><Input value={form.coordenadas || ""} onChange={e => setForm({ ...form, coordenadas: e.target.value })} /></div>
            <div><Label>Link do mapa</Label><Input value={form.linkMapa || ""} onChange={e => setForm({ ...form, linkMapa: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={() => void save()}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!view} onOpenChange={o => !o && setView(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{view?.nome}</DialogTitle></DialogHeader>
          {view && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">ABC:</span> {view.abc}</div>
              <div><span className="text-muted-foreground">Prioridade:</span> {view.prioridade}</div>
              <div><span className="text-muted-foreground">Rota:</span> {view.rota}</div>
              <div><span className="text-muted-foreground">Cidade:</span> {view.cidade}</div>
                            <div><span className="text-muted-foreground">CPF/CNPJ:</span> {view.documento || "—"}</div>
              <div><span className="text-muted-foreground">IE:</span> {view.inscricaoEstadual || "—"}</div>
              <div><span className="text-muted-foreground">Telefone:</span> {view.telefone || "—"}</div>
              <div><span className="text-muted-foreground">Endereço:</span> {view.endereco || "—"}</div>
              <div><span className="text-muted-foreground">Responsável comercial:</span> {getClienteResponsavelNome(view) || "—"}</div>
              <div><span className="text-muted-foreground">Localização:</span> {view.latitude && view.longitude ? `${view.latitude}, ${view.longitude}` : (view.coordenadas || "—")}</div>
                            <div><span className="text-muted-foreground">Área:</span> {fmtNum(view.areaHa)} ha</div>
              <div><span className="text-muted-foreground">Potencial:</span> {fmtBRL(view.potencialTotal)}</div>
              <div><span className="text-muted-foreground">Status:</span> {view.statusAtual}</div>
              <div><span className="text-muted-foreground">Frequência:</span> {view.frequenciaRetorno}</div>
              <div><span className="text-muted-foreground">Próximo retorno:</span> {formatDateBR(proximaAcaoPendente(view.id)?.data || view.retorno)}</div>
              <div><span className="text-muted-foreground">Visitas realizadas:</span> {totalVisitas(view.id)}</div>
              <div><span className="text-muted-foreground">Última visita:</span> {formatDateBR(ultimaVisita(view.id)) || "Sem visita registrada"}</div>
              <div><span className="text-muted-foreground">Próxima ação:</span> {proximaAcaoPendente(view.id)?.descricao || "—"}</div>
              <div><span className="text-muted-foreground">Negócios:</span> {negocios.filter(n=>n.clienteId===view.id).length}</div>
              <div><span className="text-muted-foreground">Orçamentos:</span> {orcamentos.filter(o=>o.clienteId===view.id).length}</div>
              <div><span className="text-muted-foreground">Próximas ações abertas:</span> {totalProximasAcoesAbertas(view.id)}</div>
              <div className="col-span-2 mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => nav(`/lancamentos?clienteId=${view.id}`)}>Nova visita</Button><Button size="sm" variant="outline" onClick={() => nav(`/funil?clienteId=${view.id}`)}>Nova oportunidade</Button><Button size="sm" variant="outline" onClick={() => nav(`/orcamentos?clienteId=${view.id}`)}>Novo orçamento</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
