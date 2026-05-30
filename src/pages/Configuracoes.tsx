import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppStore } from "@/store/AppStore";
import { BaseMode, ImportLog, RegraComissao, AplicarSobre, FaixaComissao, CATEGORIAS_PRODUTO_PADRAO, Empresa, FormaPagamento, PrazoPagamento } from "@/types";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteLocalItemsById, getLocalDbStats, LocalDbStats, replaceLocalDatabase, resetLocalDatabase, saveStore } from "@/lib/localRepository";
import { clearLocalAppDeviceData } from "@/lib/clientCleanup";
import { exportAllEntitiesToCsv } from "@/lib/csvService";
import { exportWorkbook } from "@/lib/excelService";
import { downloadBackupJson, parseBackupPayload } from "@/lib/backupService";
import { applyImport, buildImportPreview, IMPORT_TEMPLATES, ImportMode, ImportPreview, parseCsv } from "@/lib/importService";
import { saveAsTextFile } from "@/lib/fileDownload";
import { openAppDb, promisifyRequest } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getFreshSupabaseAccessContext, type FreshSupabaseAccessContext } from "@/lib/supabaseAccess";
import { compareLocalAndRemote, getRemoteSyncMeta, type LocalRemoteComparison, type SyncSummary } from "@/lib/supabaseSync";
import { fetchAccountSnapshot, shouldRestoreFromCloud, buildCloudRestoreSummary, type CloudRestoreSummary } from "@/lib/cloudRestore";
import { enqueueSyncItem, requeueFailedAndStaleSyncItems } from "@/lib/syncQueue";
import { findRemoteOnlyClientTestCandidates, softDeleteRemoteClientTests, type RemoteOnlyClientTestCandidate } from "@/lib/remoteCleanup";
import { findLocalTestRecordCandidates, getSyncQueueAudit, type SyncQueueAudit, type TestRecordCandidate } from "@/lib/syncAudit";
import * as XLSX from "xlsx";

const APLICAR: { v: AplicarSobre; label: string }[] = [
  { v: "realizado_empresa", label: "Realizado empresa" }, { v: "realizado_pessoal", label: "Realizado pessoal" },
  { v: "negocio_fechado", label: "Negócio fechado" }, { v: "categoria", label: "Categoria de produto" },
  { v: "frente_comercial", label: "Frente comercial" }, { v: "meta_empresa", label: "Meta empresa" }, { v: "meta_pessoal", label: "Meta pessoal" },
];
const emptyRegra: Omit<RegraComissao, "id"> = { nome: "", tipo: "fixa", percentual: 1, aplicarSobre: "negocio_fechado", ativo: true, faixas: [{ min: 80, max: 89, percentual: 0.5 }] };

const defaultEmpresa: Empresa = { id: "", nomeFantasia: "", razaoSocial: "", cnpj: "", inscricaoEstadual: "", endereco: "", cidadeUf: "", telefone: "", email: "", consultorPadrao: "", observacoesComerciaisPadrao: "", ativa: true, padrao: false, logoDataUrl: "" };
const SYNC_PANEL_TIMEOUT_MS = 8000;
type SyncQueryStatus = "parado" | "atualizando" | "erro" | "sucesso";

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(message)), ms);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeoutId));
  });
}

export default function Configuracoes() {
  const {
    regras, setRegras, vendedores, setVendedores, ticketsMedios, setTicketsMedios, dbError, isSaving, lastSavedAt, saveError,
    clientes, lancamentos, negocios, produtos, metasEmpresa, metasPessoais, eventos, metasVendedor, metasCategoria, prioridadesP1, orcamentos, setOrcamentos, empresas, setEmpresas, formasPagamento, setFormasPagamento, prazosPagamento, setPrazosPagamento,
    setClientes, setLancamentos, setNegocios, setProdutos, setMetasEmpresa, setMetasPessoais, setEventos, setMetasVendedor, setMetasCategoria, setPrioridadesP1, appConfig, setAppConfig, pendingSyncCount, refreshPendingSyncCount, runManualUploadSync, runAccountSyncNowForAccount, accountSyncStatus, restoreAccountSnapshot,
  } = useAppStore();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<RegraComissao | null>(null);
  const [form, setForm] = useState<Omit<RegraComissao, "id">>(emptyRegra);
  const [novoVend, setNovoVend] = useState("");
  const [novoTel, setNovoTel] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [stats, setStats] = useState<LocalDbStats | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("add");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [baseMode, setBaseMode] = useState<BaseMode>((localStorage.getItem("baseMode") as BaseMode) || "teste");
  const [importLogs, setImportLogs] = useState<ImportLog[]>([]);
  const [lastBackupAt, setLastBackupAt] = useState<string>("");
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const [syncComparison, setSyncComparison] = useState<LocalRemoteComparison | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAccountSyncing, setIsAccountSyncing] = useState(false);
  const [isComparingSync, setIsComparingSync] = useState(false);
  const [confirmUploadOpen, setConfirmUploadOpen] = useState(false);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [isRestoringCloud, setIsRestoringCloud] = useState(false);
  const [restoreSummary, setRestoreSummary] = useState<CloudRestoreSummary | null>(null);
  const [isRefreshingSyncStatus, setIsRefreshingSyncStatus] = useState(false);
  const [syncQueryStatus, setSyncQueryStatus] = useState<SyncQueryStatus>("parado");
  const [syncQueueAudit, setSyncQueueAudit] = useState<SyncQueueAudit | null>(null);
  const [testCandidates, setTestCandidates] = useState<TestRecordCandidate[]>([]);
  const [selectedTestKeys, setSelectedTestKeys] = useState<string[]>([]);
  const [cleanConfirmOpen, setCleanConfirmOpen] = useState(false);
  const [cleanConfirmText, setCleanConfirmText] = useState("");
  const [cleanupSummary, setCleanupSummary] = useState<{ removed: number; queued: number; errors: string[] } | null>(null);
  const [remoteOnlyCandidates, setRemoteOnlyCandidates] = useState<RemoteOnlyClientTestCandidate[]>([]);
  const [selectedRemoteOnlyIds, setSelectedRemoteOnlyIds] = useState<string[]>([]);
  const [remoteCleanConfirmOpen, setRemoteCleanConfirmOpen] = useState(false);
  const [remoteCleanConfirmText, setRemoteCleanConfirmText] = useState("");
  const [remoteCleanupSummary, setRemoteCleanupSummary] = useState<{ count: number; ids: string[]; deletedAt: string } | null>(null);
  const [isAuditingSync, setIsAuditingSync] = useState(false);
  const [isFindingRemoteOnlyTests, setIsFindingRemoteOnlyTests] = useState(false);
  const [isCleaningRemoteOnlyTests, setIsCleaningRemoteOnlyTests] = useState(false);
  const [isCleaningTests, setIsCleaningTests] = useState(false);
  const [isRequeueingSync, setIsRequeueingSync] = useState(false);
  const [activeTab, setActiveTab] = useState("comissao");
  const [dadosEmpresa, setDadosEmpresa] = useState<Empresa>(defaultEmpresa);
  const categoriasTicket = [...new Set([...CATEGORIAS_PRODUTO_PADRAO, ...ticketsMedios.map((t) => t.categoria)])];
  const isCategoriaPadrao = (categoria: string) => CATEGORIAS_PRODUTO_PADRAO.includes(categoria as (typeof CATEGORIAS_PRODUTO_PADRAO)[number]);


  const [cloudUserEmail, setCloudUserEmail] = useState<string | null>(null);
  const [cloudUserId, setCloudUserId] = useState<string | null>(null);
  const [cloudRole, setCloudRole] = useState<string | null>(null);
  const [cloudAccessStatus, setCloudAccessStatus] = useState<string | null>(null);
  const [cloudSessionExists, setCloudSessionExists] = useState(false);
  const [cloudLastRefreshAt, setCloudLastRefreshAt] = useState<string>("");
  const [cloudAuthError, setCloudAuthError] = useState<string | null>(null);
  const lastSyncAt = appConfig.syncMeta?.lastUploadAt || appConfig.syncMeta?.lastDownloadAt || "";
  const shouldWarnAboutStaleAccess = Boolean(cloudSessionExists && cloudAccessStatus !== "active");
  const canCompareCloud = Boolean(
    cloudSessionExists
      && cloudAccessStatus === "active"
      && (cloudRole === "admin" || cloudRole === "user"),
  );
  const canViewAudit = Boolean(cloudSessionExists && cloudAccessStatus === "active");
  const canCleanTests = Boolean(canViewAudit && cloudRole === "admin");
  const selectedTestCandidates = testCandidates.filter((candidate) => selectedTestKeys.includes(candidate.key));
  const selectedRemoteOnlyCandidates = remoteOnlyCandidates.filter((candidate) => selectedRemoteOnlyIds.includes(candidate.id));
  const lastSyncPanelError = cloudAuthError || syncError;
  const cloudRestoreDecision = shouldRestoreFromCloud({
    supabaseConfigured: isSupabaseConfigured,
    sessionExists: cloudSessionExists,
    accessStatus: cloudAccessStatus,
    isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
    pendingSyncCount,
    onlyLocal: syncComparison?.totals.onlyLocal ?? 0,
    onlyRemote: syncComparison?.totals.onlyRemote ?? 0,
    remoteCount: syncComparison?.totals.remoteCount ?? 0,
  });
  const showCloudRestoreCta = cloudRestoreDecision.allowed;

  const updateCloudAccessPanel = (context: FreshSupabaseAccessContext) => {
    setCloudUserEmail(context.email);
    setCloudUserId(context.userId);
    setCloudRole(context.role);
    setCloudAccessStatus(context.accessStatus);
    setCloudSessionExists(Boolean(context.session?.user));
    setCloudAuthError(context.error);
    setCloudLastRefreshAt(new Date().toISOString());
  };

  const getFreshSyncContext = async () => {
    const freshAccessContext = await getFreshSupabaseAccessContext();
    updateCloudAccessPanel(freshAccessContext);
    return freshAccessContext;
  };

  const assertFreshActiveSyncContext = (freshAccessContext: FreshSupabaseAccessContext) => {
    if (!freshAccessContext.session?.user) {
      throw new Error("Sessão Supabase indisponível. Atualize o status ou faça login novamente.");
    }
    if (freshAccessContext.error) throw new Error(freshAccessContext.error);
    if (freshAccessContext.accessStatus !== "active") throw new Error("Usuário ainda não aprovado para sincronização.");
    return { session: freshAccessContext.session, accessStatus: freshAccessContext.accessStatus, role: freshAccessContext.role };
  };

  const refreshCloudSyncMeta = async (context: { session: FreshSupabaseAccessContext["session"]; accessStatus: "active" }) => {
    const meta = await withTimeout(
      getRemoteSyncMeta(context),
      SYNC_PANEL_TIMEOUT_MS,
      "Tempo excedido ao buscar metadados de sincronização Supabase.",
    );
    if (meta) setAppConfig((current) => ({ ...current, syncMeta: meta }));
  };

  const handleRefreshSyncPanel = async () => {
    setIsRefreshingSyncStatus(true);
    setSyncQueryStatus("atualizando");
    setSyncError(null);
    try {
      const freshAccessContext = await getFreshSyncContext();
      await withTimeout(
        refreshPendingSyncCount(),
        SYNC_PANEL_TIMEOUT_MS,
        "Tempo excedido ao atualizar pendências locais.",
      );
      if (freshAccessContext.error) throw new Error(freshAccessContext.error);
      if (freshAccessContext.accessStatus === "active") await refreshCloudSyncMeta({ session: freshAccessContext.session, accessStatus: freshAccessContext.accessStatus });
      setSyncQueryStatus("sucesso");
      toast.success("Status e pendências atualizados.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido ao atualizar status e pendências.";
      setSyncError(message);
      setCloudAuthError((current) => current ?? message);
      setSyncQueryStatus("erro");
      toast.error(message);
    } finally {
      setIsRefreshingSyncStatus(false);
    }
  };

  const handleCompareCloud = async () => {
    setIsComparingSync(true);
    setSyncError(null);
    try {
      const freshAccessContext = await getFreshSyncContext();
      const freshSyncContext = assertFreshActiveSyncContext(freshAccessContext);
      const result = await compareLocalAndRemote(freshSyncContext);
      setSyncComparison(result);
      toast.success("Comparação local x nuvem concluída.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido ao comparar local x nuvem.";
      setSyncError(message);
      toast.error(message);
    } finally {
      setIsComparingSync(false);
    }
  };

  const refreshAuditAndComparison = async (options: { compareCloud?: boolean } = {}) => {
    setIsAuditingSync(true);
    setSyncError(null);
    try {
      const freshAccessContext = await getFreshSyncContext();
      const freshSyncContext = assertFreshActiveSyncContext(freshAccessContext);

      const [queueAudit, candidates] = await Promise.all([
        getSyncQueueAudit(),
        findLocalTestRecordCandidates(),
      ]);
      setSyncQueueAudit(queueAudit);
      setTestCandidates(candidates);
      setSelectedTestKeys((current) => current.filter((key) => candidates.some((candidate) => candidate.key === key)));
      await refreshPendingSyncCount();

      if (options.compareCloud) {
        const comparison = await compareLocalAndRemote(freshSyncContext);
        setSyncComparison(comparison);
      }

      toast.success("Auditoria e limpeza atualizadas.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido ao atualizar auditoria.";
      setSyncError(message);
      toast.error(message);
    } finally {
      setIsAuditingSync(false);
    }
  };

  const handleFindRemoteOnlyTests = async () => {
    setIsFindingRemoteOnlyTests(true);
    setSyncError(null);
    try {
      const freshAccessContext = await getFreshSyncContext();
      const freshSyncContext = assertFreshActiveSyncContext(freshAccessContext);
      const candidates = await findRemoteOnlyClientTestCandidates(freshSyncContext);
      setRemoteOnlyCandidates(candidates);
      setSelectedRemoteOnlyIds((current) => current.filter((id) => candidates.some((candidate) => candidate.id === id)));
      toast.success(`${candidates.length} cliente(s) teste somente na nuvem encontrado(s).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido ao buscar testes somente na nuvem.";
      setSyncError(message);
      toast.error(message);
    } finally {
      setIsFindingRemoteOnlyTests(false);
    }
  };

  const handleConfirmRemoteOnlyCleanup = async () => {
    if (remoteCleanConfirmText !== "LIMPAR NUVEM") return;
    if (!canCleanTests) {
      toast.error("Somente administradores podem limpar testes somente na nuvem.");
      return;
    }
    if (selectedRemoteOnlyCandidates.length === 0) {
      toast.error("Selecione manualmente pelo menos um cliente teste somente na nuvem.");
      return;
    }
    if (selectedRemoteOnlyCandidates.some((candidate) => !candidate.motivo || candidate.origem !== "somente-nuvem")) {
      toast.error("Bloqueio de segurança: há candidato sem padrão de teste ou sem origem somente-nuvem.");
      return;
    }

    setIsCleaningRemoteOnlyTests(true);
    setSyncError(null);
    try {
      const freshAccessContext = await getFreshSyncContext();
      const freshSyncContext = assertFreshActiveSyncContext(freshAccessContext);
      if (freshAccessContext.role !== "admin") throw new Error("Somente administradores podem limpar testes somente na nuvem.");
      const result = await softDeleteRemoteClientTests(freshSyncContext, selectedRemoteOnlyCandidates.map((candidate) => candidate.id));
      setRemoteCleanupSummary({ count: result.count, ids: result.ids, deletedAt: result.deletedAt });
      setSelectedRemoteOnlyIds([]);
      setRemoteCleanConfirmOpen(false);
      setRemoteCleanConfirmText("");

      const [queueAudit, localCandidates, remoteCandidates, comparison] = await Promise.all([
        getSyncQueueAudit(),
        findLocalTestRecordCandidates(),
        findRemoteOnlyClientTestCandidates(freshSyncContext),
        compareLocalAndRemote(freshSyncContext),
      ]);
      setSyncQueueAudit(queueAudit);
      setTestCandidates(localCandidates);
      setRemoteOnlyCandidates(remoteCandidates);
      setSyncComparison(comparison);
      await refreshPendingSyncCount();
      toast.success(`${result.count} cliente(s) teste somente na nuvem marcado(s) como excluído(s).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido na limpeza somente na nuvem.";
      setSyncError(message);
      toast.error(message);
    } finally {
      setIsCleaningRemoteOnlyTests(false);
    }
  };

  const handleRequeueFailedItems = async () => {
    if (!canCleanTests) {
      toast.error("Somente administradores podem reprocessar erros/travados.");
      return;
    }
    const ok = window.confirm("Esta ação apenas recoloca erros/travados na fila. Nenhum dado será apagado.");
    if (!ok) return;

    setIsRequeueingSync(true);
    try {
      const changed = await requeueFailedAndStaleSyncItems(10);
      await refreshAuditAndComparison();
      toast.success(`${changed.length} item(ns) recolocado(s) na fila.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido ao reprocessar fila.";
      setSyncError(message);
      toast.error(message);
    } finally {
      setIsRequeueingSync(false);
    }
  };

  const handleCopyAuditReport = async () => {
    const lines = [
      "Relatório de auditoria Safra Vision",
      `Data/hora: ${new Date().toLocaleString("pt-BR")}`,
      `Usuário: ${cloudUserEmail || "—"} (${cloudUserId || "—"})`,
      `Role/status: ${cloudRole || "—"} / ${cloudAccessStatus || "—"}`,
      `Supabase configurado: ${isSupabaseConfigured ? "Sim" : "Não"}`,
      `Sessão Supabase: ${cloudSessionExists ? "Sim" : "Não"}`,
      `Último sync: ${lastSyncAt ? new Date(lastSyncAt).toLocaleString("pt-BR") : "não registrado"}`,
      `Pendências locais: ${pendingSyncCount}`,
      "",
      "Totais local x nuvem:",
      syncComparison
        ? `Local ${syncComparison.totals.localCount}; Nuvem ${syncComparison.totals.remoteCount}; Só local ${syncComparison.totals.onlyLocal}; Só nuvem ${syncComparison.totals.onlyRemote}; Nos dois ${syncComparison.totals.inBoth}; Remotos excluídos ${syncComparison.totals.remoteDeleted}.`
        : "Comparação ainda não executada.",
      "",
      "Fila por status:",
      syncQueueAudit
        ? `pending ${syncQueueAudit.byStatus.pending}; processing ${syncQueueAudit.byStatus.processing}; synced ${syncQueueAudit.byStatus.synced}; error ${syncQueueAudit.byStatus.error}; travados ${syncQueueAudit.staleProcessing.length}.`
        : "Auditoria da fila ainda não executada.",
      "",
      `Registros de teste detectados: ${testCandidates.length}`,
      ...testCandidates.slice(0, 20).map((candidate) => `- ${candidate.store}/${candidate.id}: ${candidate.label} (${candidate.reason})`),
      `Clientes teste somente na nuvem: ${remoteOnlyCandidates.length}`,
      ...remoteOnlyCandidates.slice(0, 20).map((candidate) => `- clientes/${candidate.id}: ${candidate.nome} (${candidate.motivo})`),
      "",
      "Ações recomendadas:",
      syncQueueAudit && syncQueueAudit.byStatus.error + syncQueueAudit.staleProcessing.length > 0 ? "- Reprocessar erros/travados." : "- Fila sem erros/travados detectados.",
      testCandidates.length > 0 ? "- Revisar candidatos de teste e limpar manualmente apenas clientes confirmados." : "- Nenhum registro de teste detectado pelos padrões configurados.",
      remoteOnlyCandidates.length > 0 ? "- Revisar testes somente na nuvem e limpar manualmente apenas candidatos confirmados." : "- Nenhum teste somente na nuvem carregado ou detectado.",
      syncComparison && (syncComparison.totals.onlyLocal > 0 || syncComparison.totals.onlyRemote > 0) ? "- Revisar divergências local x nuvem." : "- Comparação local x nuvem sem divergências destacadas ou não executada.",
    ];

    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Relatório de auditoria copiado.");
  };

  const handleConfirmCleanupTests = async () => {
    if (cleanConfirmText !== "LIMPAR TESTES") return;
    if (!canCleanTests) {
      toast.error("Somente administradores podem limpar registros de teste.");
      return;
    }

    const selectedClientes = selectedTestCandidates.filter((candidate) => candidate.store === "clientes" && candidate.cleanable);
    if (selectedClientes.length === 0) {
      toast.error("Selecione pelo menos um cliente de teste.");
      return;
    }
    if (selectedClientes.length >= clientes.length) {
      toast.error("Bloqueio de segurança: não é permitido limpar todos os clientes.");
      return;
    }
    if (selectedClientes.some((candidate) => !candidate.reason)) {
      toast.error("Bloqueio de segurança: há cliente selecionado sem padrão de teste identificado.");
      return;
    }

    setIsCleaningTests(true);
    const errors: string[] = [];
    let queued = 0;
    try {
      const ids = selectedClientes.map((candidate) => candidate.id);
      await deleteLocalItemsById("clientes", ids);
      for (const candidate of selectedClientes) {
        try {
          await enqueueSyncItem({ store: "clientes", entityId: candidate.id, operation: "delete", payload: candidate.payload });
          queued += 1;
        } catch (error) {
          errors.push(`${candidate.id}: ${error instanceof Error ? error.message : "erro ao enfileirar delete"}`);
        }
      }
      setClientes((current) => current.filter((cliente) => !ids.includes(cliente.id)));
      setSelectedTestKeys([]);
      const summary = { removed: ids.length, queued, errors };
      setCleanupSummary(summary);
      setCleanConfirmOpen(false);
      setCleanConfirmText("");
      await refreshPendingSyncCount();
      await refreshAuditAndComparison({ compareCloud: canCompareCloud });
      if (typeof navigator !== "undefined" && navigator.onLine) {
        const freshAccessContext = await getFreshSyncContext();
        if (freshAccessContext.session?.user && !freshAccessContext.error && freshAccessContext.accessStatus === "active") {
          const result = await runManualUploadSync({
            session: freshAccessContext.session,
            accessStatus: freshAccessContext.accessStatus,
          });
          if (!result.ok) {
            setSyncError(result.message);
            toast.error(result.message);
          }
        }
      }
      toast.success(`Limpeza concluída: ${ids.length} removido(s), ${queued} delete(s) enfileirado(s).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido na limpeza segura.";
      setSyncError(message);
      toast.error(message);
    } finally {
      setIsCleaningTests(false);
    }
  };

  const executeUploadSync = async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const freshAccessContext = await getFreshSyncContext();
      const freshSyncContext = assertFreshActiveSyncContext(freshAccessContext);
      const result = await runManualUploadSync(freshSyncContext);
      if (result.skipped) {
        toast.message(result.message);
        return;
      }
      if (!result.ok) throw new Error(result.message);
      setSyncSummary(result.summary);
      if (result.meta) setAppConfig((current) => ({ ...current, syncMeta: result.meta }));
      await refreshPendingSyncCount();
      toast.success(`Sync concluído: ${result.summary.success} enviados, ${result.summary.error} erros.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido ao enviar pendências.";
      setSyncError(message);
      toast.error(message);
    } finally {
      setIsSyncing(false);
    }
  };


  const executeCloudRestore = async () => {
    if (restoreConfirmText !== "CARREGAR CONTA") return;
    setIsRestoringCloud(true);
    setSyncError(null);
    try {
      const freshAccessContext = await getFreshSyncContext();
      const freshSyncContext = assertFreshActiveSyncContext(freshAccessContext);
      const freshPendingCount = await refreshPendingSyncCount();
      const currentComparison = await compareLocalAndRemote(freshSyncContext);
      setSyncComparison(currentComparison);

      const decision = shouldRestoreFromCloud({
        supabaseConfigured: isSupabaseConfigured,
        sessionExists: Boolean(freshAccessContext.session?.user),
        accessStatus: freshAccessContext.accessStatus,
        isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
        pendingSyncCount: freshPendingCount,
        onlyLocal: currentComparison.totals.onlyLocal,
        onlyRemote: currentComparison.totals.onlyRemote,
        remoteCount: currentComparison.totals.remoteCount,
      });
      if (!decision.allowed) throw new Error(decision.message);

      const snapshot = await fetchAccountSnapshot(freshSyncContext);
      const summary = buildCloudRestoreSummary(snapshot);
      await restoreAccountSnapshot(snapshot);
      setRestoreSummary(summary);
      const postComparison = await compareLocalAndRemote(freshSyncContext);
      setSyncComparison(postComparison);
      setConfirmRestoreOpen(false);
      setRestoreConfirmText("");
      toast.success(`Dados da conta carregados neste dispositivo: ${summary.total} registro(s).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido ao carregar dados da conta.";
      setSyncError(message);
      toast.error(message);
    } finally {
      setIsRestoringCloud(false);
    }
  };

  const handleUploadClick = () => {
    if (!lastSyncAt) {
      setConfirmUploadOpen(true);
      return;
    }
    void executeUploadSync();
  };

  const handleAccountSyncNow = async () => {
    setIsAccountSyncing(true);
    setSyncError(null);
    try {
      const status = await runAccountSyncNowForAccount();
      if (status.comparison) setSyncComparison(status.comparison);
      if (status.uploadSummary) setSyncSummary(status.uploadSummary);
      if (status.code === "error" || status.code === "blocked") {
        setSyncError(status.message);
        toast.error(status.message);
        return;
      }
      toast.success(status.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido ao sincronizar conta.";
      setSyncError(message);
      toast.error(message);
    } finally {
      setIsAccountSyncing(false);
    }
  };


  const loadStats = async () => {
    try { setStats(await getLocalDbStats()); } catch (error) { console.error(error); }
  };
  useEffect(() => { void loadStats();
    void (async () => {
      const db = await openAppDb();
      const tx = db.transaction("importLogs", "readonly");
      const logs = await promisifyRequest(tx.objectStore("importLogs").getAll()) as ImportLog[];
      setImportLogs(logs.sort((a,b)=>b.dataHora.localeCompare(a.dataHora)));
      db.close();
    })();
  }, []);

  useEffect(() => {
    if (activeTab !== "sync-cloud") return;
    void handleRefreshSyncPanel();
  }, [activeTab]);

  const exportPayload = {
    clientes, vendedores, lancamentos, negocios, produtos, metasEmpresa, metasPessoais, regrasComissao: regras, eventos,
    configuracoes: ticketsMedios, metasVendedor, metasCategoria, prioridadesP1, orcamentos, empresas, formasPagamento, prazosPagamento,
  };

  const handleRestoreFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const restored = parseBackupPayload(content);
      const ok = window.confirm("Esta ação substituirá os dados locais atuais pelos dados do backup selecionado. Essa ação não pode ser desfeita nesta versão. Deseja continuar?");
      if (!ok) return;

      await replaceLocalDatabase({ ...restored, regrasComissao: restored.regrasComissao });
      setClientes(restored.clientes as never[]);
      setVendedores(restored.vendedores as never[]);
      setLancamentos(restored.lancamentos as never[]);
      setNegocios(restored.negocios as never[]);
      setProdutos(restored.produtos as never[]);
      setMetasEmpresa(restored.metasEmpresa as never[]);
      setMetasPessoais(restored.metasPessoais as never[]);
      setRegras(restored.regrasComissao as never[]);
      setEventos(restored.eventos as never[]);
      setMetasVendedor((restored.metasVendedor ?? []) as never[]);
      setMetasCategoria((restored.metasCategoria ?? []) as never[]);
      setPrioridadesP1((restored.prioridadesP1 ?? []) as never[]);
      setOrcamentos((restored.orcamentos ?? []) as never[]);
      setEmpresas((restored.empresas ?? []) as never[]);
      setFormasPagamento((restored.formasPagamento ?? []) as never[]);
      setPrazosPagamento((restored.prazosPagamento ?? []) as never[]);

      toast.success("Backup restaurado com sucesso.");
      void loadStats();
    } catch {
      toast.error("Arquivo de backup inválido ou incompatível com o aplicativo.");
    } finally {
      event.target.value = "";
    }
  };



  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "xml" || ext === "xls") {
        toast.error("Formato não suportado. Use CSV ou XLSX.");
        return;
      }
      const hasBackup = window.confirm("Backup recomendado antes de homologar dados reais.\nDeseja continuar sem gerar backup agora?");
      if (!hasBackup) { downloadBackupJson(exportPayload); setLastBackupAt(new Date().toISOString()); toast.message("Backup gerado. Selecione o arquivo novamente para importar."); return; }
      if (baseMode === "operacional") toast.warning("Use base Operacional apenas após validar os dados importados.");
      toast.message("Você está importando dados em ambiente de teste/homologação.");
      let rows: string[][] = [];
      if (ext === "xlsx") {
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const firstSheet = wb.SheetNames[0];
        const ws = firstSheet ? wb.Sheets[firstSheet] : undefined;
        if (!ws) throw new Error();
        rows = (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as unknown[][])
          .map((row) => row.map((cell) => String(cell ?? "")));
      } else {
        const text = await file.text();
        rows = parseCsv(text);
      }
      if (rows.length < 2) throw new Error();
      const preview = buildImportPreview(file.name, "clientes", rows);
      setImportPreview(preview);
      setPreviewOpen(true);
    } catch {
      toast.error("Arquivo inválido ou sem dados para importação.");
    } finally {
      event.target.value = "";
    }
  };

  const confirmImport = () => {
    if (!importPreview) return;
    if (importMode === "replace" && !window.confirm("Esta ação substituirá todos os dados atuais desta entidade pelos dados importados. Essa ação não pode ser desfeita nesta versão. Deseja continuar?")) return;

    const applyClientes = (current: never[], setter: (v: never[])=>void) => {
      const result = applyImport("clientes", importMode, current as { id: string }[], importPreview);
      setter(result.data as never[]);
      toast.success(`Importação concluída: ${result.imported} criados, ${result.updated} atualizados, ${result.ignored} ignorados, ${result.duplicates} duplicidades.`);
      return result;
    };

    let summary = { imported: 0, updated: 0, ignored: 0, duplicates: 0 };
    summary = applyClientes(clientes as never[], setClientes) || summary;
    const log: ImportLog = { id: `ilog-${Date.now()}`, arquivo: importPreview.fileName, dataHora: new Date().toISOString(), entidade: "clientes", registrosLidos: importPreview.totalRows, registrosCriados: summary.imported, registrosAtualizados: summary.updated, registrosIgnorados: summary.ignored, erros: importPreview.errorRows, avisos: importPreview.rows.reduce((a,r)=>a+r.warnings.length,0) };
    setImportLogs((prev)=>[log, ...prev]);
    void saveStore("importLogs", [log, ...importLogs]);
    setPreviewOpen(false);
    setImportPreview(null);
    void loadStats();
  };

  const downloadTemplateClientes = () => {
    const headers = IMPORT_TEMPLATES.clientes;
    const csv = `${headers.join(";")}\n`;
    saveAsTextFile("modelo_clientes.csv", csv, "text/csv;charset=utf-8");
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "modelo_clientes.xlsx";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const openNew = () => { setEdit(null); setForm(emptyRegra); setOpen(true); };
  const openEdit = (r: RegraComissao) => { setEdit(r); const { id, ...rest } = r; void id; setForm(rest); setOpen(true); };
  const save = () => {
    if (!form.nome) return toast.error("Nome obrigatório.");
    if (edit) setRegras(prev => prev.map(r => r.id === edit.id ? { ...form, id: edit.id } : r));
    else setRegras(prev => [...prev, { ...form, id: `rc${Date.now()}` }]);
    setOpen(false); toast.success("Regra salva."); void loadStats();
  };

  const addFaixa = () => setForm(f => ({ ...f, faixas: [...(f.faixas || []), { min: 0, max: 100, percentual: 0 }] }));
  const updFaixa = (i: number, k: keyof FaixaComissao, v: number) => setForm(f => ({ ...f, faixas: (f.faixas || []).map((x, idx) => idx === i ? { ...x, [k]: v } : x) }));
  const rmFaixa = (i: number) => setForm(f => ({ ...f, faixas: (f.faixas || []).filter((_, idx) => idx !== i) }));

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) { toast.error("Use PNG ou JPG/JPEG."); return; }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error());
      reader.readAsDataURL(file);
    });
    setDadosEmpresa((prev) => ({ ...prev, logoDataUrl: dataUrl }));
    event.target.value = "";
  };

  return <div className="space-y-4">
    <Card className="p-4">
      <div className="grid gap-2 md:grid-cols-3 items-end">
        <div>
          <Label>Taxa de acerto da carteira (%)</Label>
          <Input type="number" min={0} max={100} step="0.01" value={appConfig.percentualAcertoEsperado} onChange={(e)=>{const v=Math.min(100,Math.max(0,Number(e.target.value||0))); setAppConfig({ ...appConfig, percentualAcertoEsperado: v });}} />
        </div>
        <p className="text-xs text-muted-foreground md:col-span-2">Valor padrão sugerido: 12. Usado no Dashboard para calcular meta da carteira.</p>
      </div>
    </Card>
    {dbError && <Card className="border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{dbError}</Card>}
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="comissao">Regras de comissão</TabsTrigger>
        <TabsTrigger value="vendedores">Vendedores</TabsTrigger>
        <TabsTrigger value="tickets">Regras comerciais</TabsTrigger>
        <TabsTrigger value="dados-empresa">Empresas</TabsTrigger>
        <TabsTrigger value="banco-local">Banco local</TabsTrigger>
        <TabsTrigger value="sync-cloud">Sincronização em nuvem</TabsTrigger>
      </TabsList>

      <TabsContent value="comissao" className="space-y-3">{/* unchanged table */}
        <div className="flex justify-end"><Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Nova regra</Button></div>
        <Card className="overflow-x-auto p-0"><Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead>Aplicar sobre</TableHead><TableHead>Alvo</TableHead><TableHead>Percentual / Faixas</TableHead><TableHead>Ativo</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{regras.map(r => <TableRow key={r.id}><TableCell className="font-medium">{r.nome}</TableCell><TableCell><Badge variant="outline">{r.tipo}</Badge></TableCell><TableCell>{APLICAR.find(a => a.v === r.aplicarSobre)?.label}</TableCell><TableCell>{r.alvo || "—"}</TableCell><TableCell className="text-xs">{r.tipo === "fixa" ? `${r.percentual}%` : r.faixas?.map(f => `${f.min}-${f.max}%: ${f.percentual}%`).join(" | ")}</TableCell><TableCell>{r.ativo ? <Badge className="bg-success/15 text-success">Sim</Badge> : <Badge variant="outline">Não</Badge>}</TableCell><TableCell className="text-right"><Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" onClick={() => { if (!window.confirm("Esta ação não pode ser desfeita nesta versão. Deseja continuar?")) return; setRegras(prev => prev.filter(x => x.id !== r.id)); toast.success("Excluída."); void loadStats(); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></TableCell></TableRow>)}</TableBody></Table></Card>
      </TabsContent>

      <TabsContent value="vendedores" className="space-y-3"><Card className="p-4"><div className="grid gap-2 md:grid-cols-4"><Input placeholder="Nome" value={novoVend} onChange={e => setNovoVend(e.target.value)} /><Input placeholder="Telefone" value={novoTel} onChange={e => setNovoTel(e.target.value)} /><Input placeholder="E-mail" value={novoEmail} onChange={e => setNovoEmail(e.target.value)} /><Button onClick={() => { if (!novoVend) return; setVendedores(prev => [...prev, { id: `v${Date.now()}`, nome: novoVend, telefone: novoTel, email: novoEmail, ativo: true }]); setNovoVend("");setNovoTel("");setNovoEmail(""); toast.success("Vendedor adicionado."); void loadStats(); }}><Plus className="mr-1 h-4 w-4" />Adicionar</Button></div><div className="mt-4 space-y-2">{vendedores.map(v => <div key={v.id} className="flex items-center justify-between rounded border p-2 text-sm"><div>{v.nome} • {v.telefone||"-"} • {v.email||"-"} • {v.ativo?"Ativo":"Inativo"}</div><button className="ml-2 text-destructive" onClick={() => { if (!window.confirm("Esta ação não pode ser desfeita nesta versão. Deseja continuar?")) return; setVendedores(prev => prev.filter(x => x.id !== v.id)); void loadStats(); }}>Excluir</button></div>)}</div></Card></TabsContent>

      <TabsContent value="tickets" className="space-y-3"><Card className="p-4 space-y-3"><div className="text-sm font-semibold">Ticket médio por linha/categoria</div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Linha/categoria</TableHead><TableHead>Valor médio por hectare</TableHead><TableHead>Ativo</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{categoriasTicket.map((categoria) => { const regra = ticketsMedios.find((t) => t.categoria === categoria); return <TableRow key={categoria}><TableCell className="font-medium">{categoria}</TableCell><TableCell><Input type="number" step="0.01" value={regra?.valorMedioHa ?? 0} onChange={(e) => { const valor = Number(e.target.value || 0); setTicketsMedios((prev) => regra ? prev.map((t) => t.id === regra.id ? { ...t, valorMedioHa: valor } : t) : [...prev, { id: `tm${Date.now()}`, categoria, valorMedioHa: valor, ativo: true }]); }} /></TableCell><TableCell><Switch checked={regra?.ativo ?? true} onCheckedChange={(ativo) => setTicketsMedios((prev) => regra ? prev.map((t) => t.id === regra.id ? { ...t, ativo } : t) : [...prev, { id: `tm${Date.now()}`, categoria, valorMedioHa: 0, ativo }])} /></TableCell><TableCell className="text-right">{!isCategoriaPadrao(categoria) && regra ? <Button size="sm" variant="ghost" onClick={() => setTicketsMedios((prev) => prev.filter((x) => x.id !== regra.id))}>Remover</Button> : <span className="text-xs text-muted-foreground">Padrão</span>}</TableCell></TableRow>;})}</TableBody></Table></div><div className="rounded border p-3 space-y-2"><div className="text-sm font-medium">Criar nova linha de produto</div><div className="grid gap-2 md:grid-cols-4"><Input id="nova-cat" placeholder="Nome da linha/categoria" /><Input id="novo-ticket" type="number" step="0.01" placeholder="Valor médio por ha" /><Select defaultValue="1"><SelectTrigger id="novo-ativo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">Ativo</SelectItem><SelectItem value="0">Inativo</SelectItem></SelectContent></Select><Button onClick={() => { const nomeEl = document.getElementById('nova-cat') as HTMLInputElement | null; const valorEl = document.getElementById('novo-ticket') as HTMLInputElement | null; const ativoEl = document.querySelector('#novo-ativo [data-state]') ? '1' : '1'; const categoria = nomeEl?.value.trim() || ''; if (!categoria) return toast.error('Informe o nome da linha/categoria.'); if (categoriasTicket.some((c) => c.toLowerCase() === categoria.toLowerCase())) return toast.error('Esta categoria já existe.'); setTicketsMedios((prev) => [...prev, { id: `tm${Date.now()}`, categoria, valorMedioHa: Number(valorEl?.value || 0), ativo: ativoEl === '1' }]); if (nomeEl) nomeEl.value = ''; if (valorEl) valorEl.value = '0'; toast.success('Linha/categoria criada.'); }}>Adicionar linha</Button></div></div></Card></TabsContent>


      <TabsContent value="dados-empresa" className="space-y-3"><Card className="p-4 space-y-3">
        <div className="text-sm font-semibold">Cadastro de empresas</div>
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>Nome fantasia</Label><Input value={dadosEmpresa.nomeFantasia || ""} onChange={e=>setDadosEmpresa({...dadosEmpresa,nomeFantasia:e.target.value})} /></div>
          <div><Label>Razão social</Label><Input value={dadosEmpresa.razaoSocial || ""} onChange={e=>setDadosEmpresa({...dadosEmpresa,razaoSocial:e.target.value})} /></div>
          <div><Label>CNPJ</Label><Input value={dadosEmpresa.cnpj || ""} onChange={e=>setDadosEmpresa({...dadosEmpresa,cnpj:e.target.value})} /></div>
          <div><Label>Inscrição estadual</Label><Input value={dadosEmpresa.inscricaoEstadual || ""} onChange={e=>setDadosEmpresa({...dadosEmpresa,inscricaoEstadual:e.target.value})} /></div>
          <div><Label>Endereço</Label><Input value={dadosEmpresa.endereco || ""} onChange={e=>setDadosEmpresa({...dadosEmpresa,endereco:e.target.value})} /></div>
          <div><Label>Cidade/UF</Label><Input value={dadosEmpresa.cidadeUf || ""} onChange={e=>setDadosEmpresa({...dadosEmpresa,cidadeUf:e.target.value})} /></div>
          <div><Label>Telefone</Label><Input value={dadosEmpresa.telefone || ""} onChange={e=>setDadosEmpresa({...dadosEmpresa,telefone:e.target.value})} /></div>
          <div><Label>E-mail</Label><Input value={dadosEmpresa.email || ""} onChange={e=>setDadosEmpresa({...dadosEmpresa,email:e.target.value})} /></div>
          <div><Label>Logo da empresa</Label><Input type="file" accept="image/png,image/jpeg" onChange={handleLogoUpload} /></div>
          <div><Label>Consultor padrão/responsável</Label><Input value={dadosEmpresa.consultorPadrao || ""} onChange={e=>setDadosEmpresa({...dadosEmpresa,consultorPadrao:e.target.value})} /></div>
          <div><Label>Observações comerciais padrão</Label><Input value={dadosEmpresa.observacoesComerciaisPadrao || ""} onChange={e=>setDadosEmpresa({...dadosEmpresa,observacoesComerciaisPadrao:e.target.value})} /></div>
        </div>
        <Button onClick={()=>{ if(!dadosEmpresa.nomeFantasia) return toast.error("Nome fantasia obrigatório"); if(dadosEmpresa.id){ setEmpresas(prev=>prev.map(e=>e.id===dadosEmpresa.id?dadosEmpresa:e)); } else { setEmpresas(prev=>[...prev,{...dadosEmpresa,id:`emp${Date.now()}`}]); } setDadosEmpresa(defaultEmpresa); toast.success("Empresa salva."); }}>Salvar empresa</Button>
        <div className="space-y-2">{empresas.map((e)=><div key={e.id} className="flex justify-between border rounded p-2 text-sm"><div>{e.nomeFantasia} {e.padrao?"(Padrão)":""} {e.ativa?"":"(Inativa)"}</div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>setEmpresas(prev=>prev.map(x=>({...x,padrao:x.id===e.id})))}>Marcar padrão</Button><Button size="sm" variant="outline" onClick={()=>setEmpresas(prev=>prev.map(x=>x.id===e.id?{...x,ativa:!x.ativa}:x))}>{e.ativa?"Inativar":"Ativar"}</Button><Button size="sm" variant="outline" onClick={()=>setDadosEmpresa(e)}>Editar</Button><Button size="sm" variant="destructive" onClick={()=>{if(!window.confirm("Excluir empresa?"))return; setEmpresas(prev=>prev.filter(x=>x.id!==e.id));}}>Excluir</Button></div></div>)}</div>
        <div className="rounded border p-3 space-y-2">
          <div className="text-sm font-semibold">Formas de pagamento</div>
          <div className="grid gap-2 md:grid-cols-3">
            <Input id="nova-forma" placeholder="Nova forma" />
            <Button onClick={() => { const nomeEl = document.getElementById("nova-forma") as HTMLInputElement | null; const nome = nomeEl?.value.trim() || ""; if (!nome) return; setFormasPagamento(prev => [...prev, { id: `fp${Date.now()}`, nome, ativo: true, padrao: prev.length===0 } as FormaPagamento]); if (nomeEl) nomeEl.value = ""; }}>Adicionar</Button>
          </div>
          {formasPagamento.map((fp) => <div key={fp.id} className="flex items-center justify-between gap-2 text-sm border rounded p-2"><Input value={fp.nome} onChange={e=>setFormasPagamento(prev=>prev.map(x=>x.id===fp.id?{...x,nome:e.target.value}:x))} /><div className="flex gap-1"><Button size="sm" variant="outline" onClick={()=>setFormasPagamento(prev=>prev.map(x=>({...x,padrao:x.id===fp.id})))}>Padrão</Button><Button size="sm" variant="outline" onClick={()=>setFormasPagamento(prev=>prev.map(x=>x.id===fp.id?{...x,ativo:!x.ativo}:x))}>{fp.ativo?"Inativar":"Ativar"}</Button><Button size="sm" variant="destructive" onClick={()=>{if(window.confirm("Excluir forma de pagamento?"))setFormasPagamento(prev=>prev.filter(x=>x.id!==fp.id));}}>Excluir</Button></div></div>)}
        <div className="rounded border p-3 space-y-2">
          <div className="text-sm font-semibold">Prazos de pagamento</div>
          <div className="grid gap-2 md:grid-cols-3">
            <Input id="novo-prazo" placeholder="Novo prazo" />
            <Button onClick={() => { const nomeEl = document.getElementById("novo-prazo") as HTMLInputElement | null; const nome = nomeEl?.value.trim() || ""; if (!nome) return; setPrazosPagamento(prev => [...prev, { id: `pp${Date.now()}`, nome, ativo: true, padrao: prev.length===0 } as PrazoPagamento]); if (nomeEl) nomeEl.value = ""; }}>Adicionar</Button>
          </div>
          {prazosPagamento.map((pp) => <div key={pp.id} className="flex items-center justify-between gap-2 text-sm border rounded p-2"><Input value={pp.nome} onChange={e=>setPrazosPagamento(prev=>prev.map(x=>x.id===pp.id?{...x,nome:e.target.value}:x))} /><div className="flex gap-1"><Button size="sm" variant="outline" onClick={()=>setPrazosPagamento(prev=>prev.map(x=>({...x,padrao:x.id===pp.id})))}>Padrão</Button><Button size="sm" variant="outline" onClick={()=>setPrazosPagamento(prev=>prev.map(x=>x.id===pp.id?{...x,ativo:!x.ativo}:x))}>{pp.ativo?"Inativar":"Ativar"}</Button><Button size="sm" variant="destructive" onClick={()=>{if(window.confirm("Excluir prazo de pagamento?"))setPrazosPagamento(prev=>prev.filter(x=>x.id!==pp.id));}}>Excluir</Button></div></div>)}
        </div>

        </div>
      </Card></TabsContent>

      <TabsContent value="banco-local">
        <Card className="space-y-3 p-4 text-sm">
          <div className="text-xs font-semibold">Base: {baseMode === "teste" ? "Teste" : "Operacional"}</div><div><b>Status do banco:</b> {stats?.status || "ativo"}</div>
          <div><b>Tipo:</b> {stats?.tipo || "IndexedDB"}</div>
          <div><b>Data da primeira criação:</b> {stats?.createdAt ? new Date(stats.createdAt).toLocaleString("pt-BR") : "-"}</div>
          <div><b>Última atualização:</b> {stats?.updatedAt ? new Date(stats.updatedAt).toLocaleString("pt-BR") : "-"}</div>
          <div>
            <b>Persistência:</b>{" "}
            {saveError
              ? "Erro ao salvar dados locais"
              : isSaving
                ? "Salvando..."
                : "Dados salvos localmente"}
          </div>
          {lastSavedAt && <div><b>Último salvamento em memória:</b> {new Date(lastSavedAt).toLocaleString("pt-BR")}</div>}
          <div className="rounded border p-3"><div className="font-semibold mb-1">Diagnóstico da base local</div><div className="text-xs text-amber-600 mb-2">Antes de importar dados reais, gere um backup da base atual.</div><div className="grid gap-1">{stats && Object.entries(stats.counts).map(([k, v]) => <div key={k}>{k}: {v}</div>)}</div><div className="mt-2 text-xs">Versão schema IndexedDB: 6</div></div>
          <div className="rounded border p-3"><Label>Modo da base</Label><Select value={baseMode} onValueChange={(v: BaseMode)=>{ setBaseMode(v); localStorage.setItem("baseMode", v); if (v === "operacional") toast.warning("Use base Operacional apenas após validar os dados importados.");}}><SelectTrigger className="mt-2 max-w-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="teste">Teste</SelectItem><SelectItem value="operacional">Operacional</SelectItem></SelectContent></Select><div className="mt-2 text-xs text-amber-600">Você está importando dados em ambiente de teste/homologação.</div></div>
          <Button variant="destructive" onClick={async () => {
            if (!window.confirm("Esta ação apagará os dados locais deste navegador. Essa ação não pode ser desfeita nesta versão. Deseja continuar?")) return;
            await resetLocalDatabase();
            toast.success("Base local limpa. Recarregando aplicação sem dados operacionais.");
            window.location.reload();
          }}>Limpar base local</Button>
          <Button variant="outline" onClick={async () => {
            if (!window.confirm("Esta ação removerá IndexedDB/cache/localStorage/sessionStorage e service worker deste dispositivo. Deseja continuar?")) return;
            await clearLocalAppDeviceData();
            toast.success("Dados locais deste dispositivo foram removidos.");
            window.location.reload();
          }}>Limpar dados locais deste dispositivo</Button>
          <Card className="space-y-2 border-dashed p-3">
            <div className="font-semibold">Exportação e backup</div>
            <p className="text-xs text-muted-foreground">Use estas opções para salvar seus dados fora do navegador, enviar por e-mail, WhatsApp ou guardar em local seguro.</p>

          <Card className="space-y-3 border-dashed p-3">
            <div className="font-semibold">Importação de clientes</div>
            <p className="text-xs text-muted-foreground">Baixe o modelo, preencha os dados e importe a planilha para cadastrar ou atualizar clientes.</p><div className="text-xs">Último backup manual: {lastBackupAt ? new Date(lastBackupAt).toLocaleString("pt-BR") : "não registrado"}</div>
            <div className="grid gap-2 md:grid-cols-2">
              <Select value={importMode} onValueChange={(v: ImportMode) => setImportMode(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="add">Adicionar novos registros</SelectItem><SelectItem value="update">Atualizar registros existentes</SelectItem><SelectItem value="replace">Substituir base de clientes</SelectItem>
              </SelectContent></Select>
              <Button variant="outline" onClick={() => { downloadBackupJson(exportPayload); setLastBackupAt(new Date().toISOString()); }}>Gerar backup antes de importar</Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={downloadTemplateClientes}>Baixar planilha modelo de clientes</Button>
              <Button onClick={() => importFileRef.current?.click()}>Importar planilha de clientes</Button>
            </div>
            <input ref={importFileRef} type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={handleImportFile} />
          </Card>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={() => exportWorkbook(exportPayload)}>Exportar Excel</Button>
              <Button variant="outline" onClick={() => exportAllEntitiesToCsv(exportPayload)}>Exportar CSV</Button>
              <Button variant="outline" onClick={() => downloadBackupJson(exportPayload)}>Gerar backup JSON</Button>
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>Restaurar backup JSON</Button>
            </div>
            <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleRestoreFile} />
          </Card>
        </Card>
      </TabsContent>

      <TabsContent value="sync-cloud" className="space-y-3">
        <Card className="p-4 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Sincronização da conta</h2>
            <p className="text-sm text-muted-foreground">A conta é a fonte dos dados; este dispositivo mantém um cache local/offline.</p>
          </div>
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Nível usuário</h3>
                <p className="text-sm text-muted-foreground">Use este botão para enviar pendências locais e carregar dados da conta quando for seguro.</p>
              </div>
              <Button onClick={() => void handleAccountSyncNow()} disabled={isAccountSyncing || isSyncing || isComparingSync || isRefreshingSyncStatus || isRestoringCloud}>{isAccountSyncing ? "Sincronizando..." : "Sincronizar agora"}</Button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border bg-background/60 p-3 text-sm"><div className="text-muted-foreground">Status da conta</div><div className="font-medium">{cloudSessionExists ? `${cloudRole || "—"} / ${cloudAccessStatus || "—"}` : "Não autenticado"}</div></div>
              <div className="rounded-md border bg-background/60 p-3 text-sm"><div className="text-muted-foreground">Última sincronização</div><div className="font-medium">{lastSyncAt ? new Date(lastSyncAt).toLocaleString("pt-BR") : "não registrado"}</div></div>
              <div className="rounded-md border bg-background/60 p-3 text-sm"><div className="text-muted-foreground">Pendências</div><div className="font-medium">{pendingSyncCount}</div></div>
            </div>
            <div className="rounded-md border bg-background/60 p-3 text-sm">{accountSyncStatus?.message || "Este dispositivo já está atualizado."}</div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border p-3 text-sm"><div className="text-muted-foreground">Supabase configurado</div><div className="font-medium">{isSupabaseConfigured ? "Sim" : "Não"}</div></div>
            <div className="rounded-md border p-3 text-sm"><div className="text-muted-foreground">Usuário autenticado</div><div className="font-medium">{cloudUserEmail || "Não autenticado"}</div></div>
            <div className="rounded-md border p-3 text-sm"><div className="text-muted-foreground">Role/status do banco</div><div className="font-medium">{cloudRole || "—"} / {cloudAccessStatus || "—"}</div></div>
            <div className="rounded-md border p-3 text-sm"><div className="text-muted-foreground">Pendências locais</div><div className="font-medium">{pendingSyncCount}</div></div>
            <div className="rounded-md border p-3 text-sm md:col-span-2"><div className="text-muted-foreground">Último sync</div><div className="font-medium">{lastSyncAt ? new Date(lastSyncAt).toLocaleString("pt-BR") : "não registrado"}</div></div>
          </div>
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            <div className="grid gap-2 md:grid-cols-2">
              <div><span className="font-medium text-foreground">Sessão Supabase:</span> {cloudSessionExists ? "Sim" : "Não"}</div>
              <div><span className="font-medium text-foreground">Status da consulta:</span> {syncQueryStatus}</div>
              <div><span className="font-medium text-foreground">Email atual:</span> {cloudUserEmail || "—"}</div>
              <div><span className="font-medium text-foreground">User ID:</span> {cloudUserId || "—"}</div>
              <div><span className="font-medium text-foreground">Role/status do banco:</span> {cloudRole || "—"} / {cloudAccessStatus || "—"}</div>
              <div><span className="font-medium text-foreground">Última tentativa de atualização:</span> {cloudLastRefreshAt ? new Date(cloudLastRefreshAt).toLocaleString("pt-BR") : "—"}</div>
              <div className="md:col-span-2"><span className="font-medium text-foreground">Último erro:</span> {lastSyncPanelError || "—"}</div>
              {!cloudSessionExists && <div className="text-destructive md:col-span-2">Usuário não autenticado. Volte para Login e entre novamente.</div>}
            </div>
          </div>
          {shouldWarnAboutStaleAccess && <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-800">Usuário ainda não aprovado para sincronização.</div>}
          {!lastSyncAt && <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-800">Primeiro envio deve ser confirmado manualmente.</div>}
          {showCloudRestoreCta && <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-800">Há dados da sua conta na nuvem. Carregar neste dispositivo?</div>}
          {!cloudRestoreDecision.allowed && syncComparison && cloudRestoreDecision.reason !== "no-remote-only" && <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-800">Restauração bloqueada: {cloudRestoreDecision.message}</div>}
          {syncError && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{syncError}</div>}
          <div className="space-y-2 rounded-md border p-3">
            <h3 className="font-semibold">Nível avançado</h3>
            <p className="text-xs text-muted-foreground">Ferramentas técnicas para diagnóstico, primeiro envio, restauração manual e auditoria.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void handleRefreshSyncPanel()} disabled={isRefreshingSyncStatus}>{isRefreshingSyncStatus ? "Atualizando..." : "Atualizar status e pendências"}</Button>
              <Button variant="outline" onClick={handleCompareCloud} disabled={!canCompareCloud || isComparingSync || isSyncing || isRefreshingSyncStatus}>{isComparingSync ? "Comparando..." : "Comparar local x nuvem"}</Button>
              <Button onClick={handleUploadClick} disabled={isSyncing || isComparingSync || isRefreshingSyncStatus || isRestoringCloud}>{isSyncing ? "Enviando..." : "Enviar pendências para nuvem"}</Button>
              <Button variant="default" onClick={() => { setRestoreConfirmText(""); setConfirmRestoreOpen(true); }} disabled={!cloudRestoreDecision.allowed || isRestoringCloud || isSyncing || isComparingSync || isRefreshingSyncStatus}>{isRestoringCloud ? "Carregando..." : "Carregar dados da conta neste dispositivo"}</Button>
              <Button variant="outline" onClick={() => void refreshAuditAndComparison({ compareCloud: true })} disabled={isAuditingSync}>{isAuditingSync ? "Auditando..." : "Auditoria e limpeza"}</Button>
            </div>
          </div>
        </Card>

        {syncSummary && <Card className="p-4 space-y-3">
          <h3 className="font-semibold">Resumo do envio</h3>
          <div className="grid gap-2 md:grid-cols-3 text-sm">
            <div><b>Total:</b> {syncSummary.total}</div><div><b>Sucesso:</b> {syncSummary.success}</div><div><b>Erros:</b> {syncSummary.error}</div>
          </div>
          <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Store</TableHead><TableHead>Total</TableHead><TableHead>Sucesso</TableHead><TableHead>Erro</TableHead></TableRow></TableHeader><TableBody>{Object.entries(syncSummary.byStore).map(([store, item]) => <TableRow key={store}><TableCell>{store}</TableCell><TableCell>{item?.total ?? 0}</TableCell><TableCell>{item?.success ?? 0}</TableCell><TableCell>{item?.error ?? 0}</TableCell></TableRow>)}</TableBody></Table></div>
          {syncSummary.errors.length > 0 && <div className="text-sm text-destructive">{syncSummary.errors.map((error) => <div key={error.id}>{error.store}: {error.message}</div>)}</div>}
        </Card>}

        {restoreSummary && <Card className="p-4 space-y-3">
          <h3 className="font-semibold">Resumo da restauração</h3>
          <div className="text-sm"><b>Total carregado da nuvem:</b> {restoreSummary.total}</div>
          <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Store</TableHead><TableHead>Restaurados</TableHead></TableRow></TableHeader><TableBody>{Object.entries(restoreSummary.byStore).map(([store, count]) => <TableRow key={store}><TableCell>{store}</TableCell><TableCell>{count}</TableCell></TableRow>)}</TableBody></Table></div>
        </Card>}

        {syncComparison && <Card className="p-4 space-y-3">
          <h3 className="font-semibold">Comparação local x nuvem</h3>
          <div className="text-xs text-muted-foreground">Gerado em {new Date(syncComparison.generatedAt).toLocaleString("pt-BR")}</div>
          <div className="grid gap-2 md:grid-cols-6 text-sm">
            <div><b>Local:</b> {syncComparison.totals.localCount}</div><div><b>Nuvem:</b> {syncComparison.totals.remoteCount}</div><div><b>Só local:</b> {syncComparison.totals.onlyLocal}</div><div><b>Só nuvem:</b> {syncComparison.totals.onlyRemote}</div><div><b>Nos dois:</b> {syncComparison.totals.inBoth}</div><div><b>Remotos excluídos:</b> {syncComparison.totals.remoteDeleted}</div>
          </div>
          <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Store</TableHead><TableHead>Tabela</TableHead><TableHead>Local</TableHead><TableHead>Nuvem</TableHead><TableHead>Só local</TableHead><TableHead>Só nuvem</TableHead><TableHead>Nos dois</TableHead><TableHead>Excluídos</TableHead></TableRow></TableHeader><TableBody>{syncComparison.stores.map((row) => <TableRow key={row.store}><TableCell>{row.store}</TableCell><TableCell>{row.table}</TableCell><TableCell>{row.localCount}</TableCell><TableCell>{row.remoteCount}</TableCell><TableCell className={row.onlyLocal > 0 ? "font-semibold text-yellow-700" : undefined}>{row.onlyLocal}</TableCell><TableCell className={row.onlyRemote > 0 ? "font-semibold text-yellow-700" : undefined}>{row.onlyRemote}</TableCell><TableCell>{row.inBoth}</TableCell><TableCell>{row.remoteDeleted}</TableCell></TableRow>)}</TableBody></Table></div>
        </Card>}

        <Card className="p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">Auditoria e limpeza</h3>
              <p className="text-sm text-muted-foreground">Verifica integridade local/nuvem, audita a syncQueue e permite limpeza segura apenas de clientes de teste.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void refreshAuditAndComparison({ compareCloud: canCompareCloud })} disabled={!canViewAudit || isAuditingSync}>{isAuditingSync ? "Auditando..." : "Atualizar auditoria"}</Button>
              <Button variant="outline" onClick={() => void handleCopyAuditReport()} disabled={!syncQueueAudit && !syncComparison}>Copiar relatório de auditoria</Button>
              <Button variant="outline" onClick={() => void handleRequeueFailedItems()} disabled={!canCleanTests || isRequeueingSync || !syncQueueAudit || (syncQueueAudit.byStatus.error + syncQueueAudit.staleProcessing.length === 0)}>{isRequeueingSync ? "Reprocessando..." : "Reprocessar erros/travados"}</Button>
            </div>
          </div>

          {!canViewAudit && <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-800">A seção exige usuário autenticado e status active.</div>}
          {canViewAudit && !canCleanTests && <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-800">Somente administradores podem limpar registros de teste.</div>}

          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-md border p-3 text-sm"><div className="text-muted-foreground">Total local</div><div className="font-medium">{syncComparison?.totals.localCount ?? "—"}</div></div>
            <div className="rounded-md border p-3 text-sm"><div className="text-muted-foreground">Total nuvem</div><div className="font-medium">{syncComparison?.totals.remoteCount ?? "—"}</div></div>
            <div className={`rounded-md border p-3 text-sm ${syncComparison && syncComparison.totals.onlyLocal > 0 ? "border-yellow-500/50 bg-yellow-500/10" : ""}`}><div className="text-muted-foreground">Só local</div><div className="font-medium">{syncComparison?.totals.onlyLocal ?? "—"}</div></div>
            <div className={`rounded-md border p-3 text-sm ${syncComparison && syncComparison.totals.onlyRemote > 0 ? "border-yellow-500/50 bg-yellow-500/10" : ""}`}><div className="text-muted-foreground">Só nuvem</div><div className="font-medium">{syncComparison?.totals.onlyRemote ?? "—"}</div></div>
            <div className="rounded-md border p-3 text-sm"><div className="text-muted-foreground">Última comparação</div><div className="font-medium">{syncComparison?.generatedAt ? new Date(syncComparison.generatedAt).toLocaleString("pt-BR") : "—"}</div></div>
            <div className="rounded-md border p-3 text-sm"><div className="text-muted-foreground">Nos dois</div><div className="font-medium">{syncComparison?.totals.inBoth ?? "—"}</div></div>
            <div className="rounded-md border p-3 text-sm"><div className="text-muted-foreground">Remotos excluídos</div><div className="font-medium">{syncComparison?.totals.remoteDeleted ?? "—"}</div></div>
            <div className={`rounded-md border p-3 text-sm ${syncQueueAudit && syncQueueAudit.byStatus.error > 0 ? "border-destructive/50 bg-destructive/10" : ""}`}><div className="text-muted-foreground">Erros na fila</div><div className="font-medium">{syncQueueAudit?.byStatus.error ?? "—"}</div></div>
            <div className={`rounded-md border p-3 text-sm ${syncQueueAudit && syncQueueAudit.staleProcessing.length > 0 ? "border-yellow-500/50 bg-yellow-500/10" : ""}`}><div className="text-muted-foreground">Processing travado</div><div className="font-medium">{syncQueueAudit?.staleProcessing.length ?? "—"}</div></div>
            <div className={`rounded-md border p-3 text-sm ${testCandidates.length > 0 ? "border-yellow-500/50 bg-yellow-500/10" : ""}`}><div className="text-muted-foreground">Testes detectados</div><div className="font-medium">{testCandidates.length}</div></div>
          </div>

          {syncQueueAudit && <div className="space-y-2">
            <h4 className="text-sm font-semibold">Auditoria da syncQueue</h4>
            <div className="grid gap-2 md:grid-cols-4 text-sm">
              <div><b>pending:</b> {syncQueueAudit.byStatus.pending}</div><div><b>processing:</b> {syncQueueAudit.byStatus.processing}</div><div><b>synced:</b> {syncQueueAudit.byStatus.synced}</div><div><b>error:</b> {syncQueueAudit.byStatus.error}</div>
            </div>
            <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Status</TableHead><TableHead>Store</TableHead><TableHead>Entity ID</TableHead><TableHead>Operação</TableHead><TableHead>Tentativas</TableHead><TableHead>UpdatedAt</TableHead><TableHead>Último erro</TableHead></TableRow></TableHeader><TableBody>{[...syncQueueAudit.recentErrors, ...syncQueueAudit.staleProcessing].slice(0, 12).map((item) => <TableRow key={`${item.id}-${item.status}`}><TableCell>{item.status}</TableCell><TableCell>{item.store}</TableCell><TableCell className="font-mono text-xs">{item.entityId}</TableCell><TableCell>{item.operation}</TableCell><TableCell>{item.attempts}</TableCell><TableCell>{new Date(item.updatedAt).toLocaleString("pt-BR")}</TableCell><TableCell className="max-w-xs truncate text-xs">{item.lastError || "—"}</TableCell></TableRow>)}</TableBody></Table></div>
          </div>}

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Registros de teste detectados</h4>
              <Button variant="destructive" onClick={() => setCleanConfirmOpen(true)} disabled={!canCleanTests || selectedTestCandidates.length === 0 || isCleaningTests}>Limpar testes selecionados</Button>
            </div>
            <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Selecionar</TableHead><TableHead>Store</TableHead><TableHead>ID</TableHead><TableHead>Nome/descrição</TableHead><TableHead>Cidade/rota</TableHead><TableHead>Created/updated</TableHead><TableHead>Motivo</TableHead><TableHead>Status local</TableHead><TableHead>Status remoto</TableHead></TableRow></TableHeader><TableBody>{testCandidates.map((candidate) => <TableRow key={candidate.key}><TableCell><Checkbox checked={selectedTestKeys.includes(candidate.key)} disabled={!candidate.cleanable || !canCleanTests} onCheckedChange={(checked) => setSelectedTestKeys((current) => checked === true ? Array.from(new Set([...current, candidate.key])) : current.filter((key) => key !== candidate.key))} /></TableCell><TableCell>{candidate.store}{!candidate.cleanable ? <div className="text-[10px] text-muted-foreground">leitura</div> : null}</TableCell><TableCell className="font-mono text-xs">{candidate.id}</TableCell><TableCell>{candidate.label}</TableCell><TableCell>{candidate.cityRoute || "—"}</TableCell><TableCell className="text-xs">{candidate.createdAt || "—"}<br />{candidate.updatedAt || "—"}</TableCell><TableCell>{candidate.reason}</TableCell><TableCell>{candidate.localStatus}</TableCell><TableCell>{candidate.remoteStatus || "—"}</TableCell></TableRow>)}</TableBody></Table></div>
          </div>

          <div className="space-y-2 rounded-md border border-blue-500/30 bg-blue-500/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold">Clientes teste somente na nuvem</h4>
                <p className="text-xs text-muted-foreground">Lista apenas clientes ativos no Supabase que não existem no IndexedDB local e batem nos padrões de teste. A limpeza faz delete lógico remoto via deleted_at.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void handleFindRemoteOnlyTests()} disabled={!canViewAudit || isFindingRemoteOnlyTests || isCleaningRemoteOnlyTests}>{isFindingRemoteOnlyTests ? "Buscando..." : "Buscar testes somente na nuvem"}</Button>
                <Button variant="destructive" onClick={() => setRemoteCleanConfirmOpen(true)} disabled={!canCleanTests || selectedRemoteOnlyCandidates.length === 0 || isCleaningRemoteOnlyTests}>Limpar testes somente na nuvem selecionados</Button>
              </div>
            </div>
            <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Selecionar</TableHead><TableHead>Nome</TableHead><TableHead>Cidade/rota</TableHead><TableHead>Motivo</TableHead><TableHead>ID</TableHead><TableHead>Updated_at</TableHead></TableRow></TableHeader><TableBody>{remoteOnlyCandidates.map((candidate) => <TableRow key={candidate.id}><TableCell><Checkbox checked={selectedRemoteOnlyIds.includes(candidate.id)} disabled={!canCleanTests || !candidate.motivo || candidate.origem !== "somente-nuvem"} onCheckedChange={(checked) => setSelectedRemoteOnlyIds((current) => checked === true ? Array.from(new Set([...current, candidate.id])) : current.filter((id) => id !== candidate.id))} /></TableCell><TableCell>{candidate.nome}</TableCell><TableCell>{[candidate.cidade, candidate.rota].filter(Boolean).join(" / ") || "—"}</TableCell><TableCell>{candidate.motivo}</TableCell><TableCell className="font-mono text-xs">{candidate.id}</TableCell><TableCell className="text-xs">{candidate.updated_at ? new Date(candidate.updated_at).toLocaleString("pt-BR") : "—"}</TableCell></TableRow>)}</TableBody></Table></div>
          </div>

          {cleanupSummary && <div className="rounded-md border bg-muted/30 p-3 text-sm"><b>Resultado da limpeza:</b> removidos localmente {cleanupSummary.removed}; enfileirados para delete {cleanupSummary.queued}; erros {cleanupSummary.errors.length}. {cleanupSummary.errors.join("; ")}</div>}
          {remoteCleanupSummary && <div className="rounded-md border bg-muted/30 p-3 text-sm"><b>Resultado da limpeza somente na nuvem:</b> {remoteCleanupSummary.count} marcado(s) com deleted_at em {new Date(remoteCleanupSummary.deletedAt).toLocaleString("pt-BR")}. IDs: {remoteCleanupSummary.ids.join(", ")}</div>}
        </Card>
      </TabsContent>

    </Tabs>


    <Dialog open={remoteCleanConfirmOpen} onOpenChange={(open) => { setRemoteCleanConfirmOpen(open); if (!open) setRemoteCleanConfirmText(""); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Confirmar limpeza somente na nuvem</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p>Esta ação marcará como excluídos apenas clientes de teste que existem somente na nuvem. Nenhum cliente local será apagado.</p>
          <p>Você selecionou <b>{selectedRemoteOnlyCandidates.length}</b> cliente(s). A operação será feita apenas na tabela clientes, com deleted_at e updated_at.</p>
          <div className="max-h-40 overflow-auto rounded-md border p-2 text-xs">
            {selectedRemoteOnlyCandidates.map((candidate) => <div key={candidate.id}>clientes/{candidate.id} — {candidate.nome} ({candidate.motivo})</div>)}
          </div>
          <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-yellow-800">Digite <b>LIMPAR NUVEM</b> para confirmar. Nenhum cliente local será removido.</div>
          <div>
            <Label>Confirmação</Label>
            <Input value={remoteCleanConfirmText} onChange={(event) => setRemoteCleanConfirmText(event.target.value)} placeholder="LIMPAR NUVEM" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRemoteCleanConfirmOpen(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={() => void handleConfirmRemoteOnlyCleanup()} disabled={remoteCleanConfirmText !== "LIMPAR NUVEM" || isCleaningRemoteOnlyTests}>{isCleaningRemoteOnlyTests ? "Limpando..." : "Confirmar limpeza na nuvem"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={cleanConfirmOpen} onOpenChange={(open) => { setCleanConfirmOpen(open); if (!open) setCleanConfirmText(""); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Confirmar limpeza segura de testes</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>Você selecionou <b>{selectedTestCandidates.length}</b> item(ns). Somente clientes com padrão de teste identificado serão removidos localmente e enfileirados como delete lógico para o Supabase.</p>
          <div className="max-h-40 overflow-auto rounded-md border p-2 text-xs">
            {selectedTestCandidates.map((candidate) => <div key={candidate.key}>{candidate.store}/{candidate.id} — {candidate.label} ({candidate.reason})</div>)}
          </div>
          <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-yellow-800">Digite <b>LIMPAR TESTES</b> para confirmar. Nenhum dado real deve ser selecionado.</div>
          <div>
            <Label>Confirmação</Label>
            <Input value={cleanConfirmText} onChange={(event) => setCleanConfirmText(event.target.value)} placeholder="LIMPAR TESTES" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCleanConfirmOpen(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={() => void handleConfirmCleanupTests()} disabled={cleanConfirmText !== "LIMPAR TESTES" || isCleaningTests}>{isCleaningTests ? "Limpando..." : "Confirmar limpeza"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={confirmRestoreOpen} onOpenChange={setConfirmRestoreOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Carregar dados da conta neste dispositivo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>Esta ação carregará os dados ativos da sua conta neste dispositivo. Os dados locais sincronizáveis serão substituídos pela versão da nuvem. Nenhum dado da nuvem será apagado.</p>
          <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-yellow-800">Digite <b>CARREGAR CONTA</b> para confirmar.</div>
          <div>
            <Label>Confirmação</Label>
            <Input value={restoreConfirmText} onChange={(event) => setRestoreConfirmText(event.target.value)} placeholder="CARREGAR CONTA" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmRestoreOpen(false)}>Cancelar</Button>
          <Button onClick={() => void executeCloudRestore()} disabled={restoreConfirmText !== "CARREGAR CONTA" || isRestoringCloud}>{isRestoringCloud ? "Carregando..." : "Confirmar restauração"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={confirmUploadOpen} onOpenChange={setConfirmUploadOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar primeiro envio para nuvem</AlertDialogTitle>
          <AlertDialogDescription>Esta ação enviará os dados locais deste dispositivo para a nuvem do usuário autenticado. Nenhum dado local será apagado. Deseja continuar?</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => { setConfirmUploadOpen(false); void executeUploadSync(); }}>Confirmar envio</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{edit ? "Editar regra" : "Nova regra de comissão"}</DialogTitle></DialogHeader><div className="grid gap-3 md:grid-cols-2"><div className="md:col-span-2"><Label>Nome da regra</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div><div><Label>Tipo</Label><Select value={form.tipo} onValueChange={(v: "fixa" | "escalonada") => setForm({ ...form, tipo: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fixa">Fixa</SelectItem><SelectItem value="escalonada">Escalonada</SelectItem></SelectContent></Select></div><div><Label>Aplicar sobre</Label><Select value={form.aplicarSobre} onValueChange={(v: AplicarSobre) => setForm({ ...form, aplicarSobre: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{APLICAR.map(a => <SelectItem key={a.v} value={a.v}>{a.label}</SelectItem>)}</SelectContent></Select></div>{form.tipo === "fixa" && (<div><Label>Percentual (%)</Label><Input type="number" step="0.1" value={form.percentual || 0} onChange={e => setForm({ ...form, percentual: +e.target.value })} /></div>)}<div className="flex items-end gap-2"><Switch checked={form.ativo} onCheckedChange={v => setForm({ ...form, ativo: v })} /><Label>Ativo</Label></div></div>{form.tipo === "escalonada" && <div className="mt-3 rounded-md border border-border p-3"><div className="mb-2 flex items-center justify-between"><Label className="text-sm font-semibold">Faixas escalonadas</Label><Button size="sm" variant="outline" onClick={addFaixa}><Plus className="mr-1 h-3 w-3" /> Faixa</Button></div><div className="space-y-2">{(form.faixas || []).map((f, i) => <div key={i} className="grid grid-cols-4 gap-2"><Input type="number" placeholder="Mín %" value={f.min} onChange={e => updFaixa(i, "min", +e.target.value)} /><Input type="number" placeholder="Máx %" value={f.max} onChange={e => updFaixa(i, "max", +e.target.value)} /><Input type="number" step="0.1" placeholder="% comissão" value={f.percentual} onChange={e => updFaixa(i, "percentual", +e.target.value)} /><Button size="icon" variant="ghost" onClick={() => rmFaixa(i)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div>)}</div></div>}<DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></DialogFooter></DialogContent></Dialog>
  
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>Prévia da importação</DialogTitle></DialogHeader>{importPreview && <div className="space-y-2 text-sm">
      <div><b>Arquivo:</b> {importPreview.fileName}</div><div><b>Entidade:</b> {importPreview.entity}</div><div><b>Modo:</b> {importMode}</div>
      <div><b>Linhas lidas:</b> {importPreview.totalRows} | <b>Válidas:</b> {importPreview.validRows} | <b>Com erro:</b> {importPreview.errorRows} | <b>Com aviso:</b> {importPreview.warningRows}</div><div><b>Possíveis duplicidades:</b> {importPreview.duplicateRows} | <b>Obrigatórios ausentes:</b> {importPreview.missingRequiredRows}</div>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Linha</TableHead><TableHead>Dados normalizados</TableHead><TableHead>Erros</TableHead></TableRow></TableHeader><TableBody>{importPreview.sample.map(r => <TableRow key={r.row}><TableCell>{r.row}</TableCell><TableCell className="max-w-md whitespace-pre-wrap text-xs">{JSON.stringify(r.normalized)}</TableCell><TableCell className="text-xs text-destructive">{r.errors.join("; ") || "—"}</TableCell></TableRow>)}</TableBody></Table></div>
      <div className="text-xs text-muted-foreground">Colunas não reconhecidas: {importPreview.unmappedColumns.join(", ") || "nenhuma"}</div>
    </div>}<DialogFooter><Button variant="outline" onClick={() => setPreviewOpen(false)}>Cancelar</Button><Button onClick={confirmImport}>Confirmar importação</Button></DialogFooter></DialogContent></Dialog>
</div>;
}
