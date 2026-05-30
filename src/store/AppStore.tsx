import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import {
  Cliente, Lancamento, MetaEmpresa, MetaPessoal, Evento, PrioridadeP1Item,
  Negocio, Produto, RegraComissao, Vendedor, MetaVendedor, MetaCategoria, TicketMedioRegra, Orcamento, Empresa, ProximaAcao, FormaPagamento, PrazoPagamento, AppConfig, OportunidadeComercial,
} from "@/types";
import { bootstrapLocalDatabase, saveStore } from "@/lib/localRepository";
import { restoreAccountSnapshotToLocal, type AccountSnapshot, type CloudRestoreResult } from "@/lib/cloudRestore";
import { enqueueSyncItem, getPendingSyncItems, shouldTrackSyncStore } from "@/lib/syncQueue";
import { getAutoSyncCooldownRemaining, runControlledUploadSync, type AutoSyncAccessStatus, type AutoSyncContext, type AutoSyncResult } from "@/lib/autoSync";
import { getFreshSupabaseAccessContext } from "@/lib/supabaseAccess";
import { useAuth } from "@/store/AuthStore";
import { calcularPotencialCliente, calcularValorMedioHaSegmentosAtivos } from "@/utils/businessRules";

interface Filters {
  dataInicial: string; dataFinal: string; mes: string;
  abc: string; prioridade: string; rota: string;
  status: string; frente: string; vendedor: string;
}

type ManualUploadSyncOverrideContext = {
  session: AutoSyncContext["session"];
  accessStatus: AutoSyncAccessStatus;
};

interface AppStoreCtx {
  clientes: Cliente[]; setClientes: React.Dispatch<React.SetStateAction<Cliente[]>>;
  lancamentos: Lancamento[]; setLancamentos: React.Dispatch<React.SetStateAction<Lancamento[]>>;
  metasEmpresa: MetaEmpresa[]; setMetasEmpresa: React.Dispatch<React.SetStateAction<MetaEmpresa[]>>;
  metasPessoais: MetaPessoal[]; setMetasPessoais: React.Dispatch<React.SetStateAction<MetaPessoal[]>>;
  metasVendedor: MetaVendedor[]; setMetasVendedor: React.Dispatch<React.SetStateAction<MetaVendedor[]>>;
  metasCategoria: MetaCategoria[]; setMetasCategoria: React.Dispatch<React.SetStateAction<MetaCategoria[]>>;
  eventos: Evento[]; setEventos: React.Dispatch<React.SetStateAction<Evento[]>>;
  prioridadesP1: PrioridadeP1Item[]; setPrioridadesP1: React.Dispatch<React.SetStateAction<PrioridadeP1Item[]>>;
  negocios: Negocio[]; setNegocios: React.Dispatch<React.SetStateAction<Negocio[]>>;
  oportunidades: OportunidadeComercial[]; setOportunidades: React.Dispatch<React.SetStateAction<OportunidadeComercial[]>>;
  produtos: Produto[]; setProdutos: React.Dispatch<React.SetStateAction<Produto[]>>;
  regras: RegraComissao[]; setRegras: React.Dispatch<React.SetStateAction<RegraComissao[]>>;
  vendedores: Vendedor[]; setVendedores: React.Dispatch<React.SetStateAction<Vendedor[]>>;
  ticketsMedios: TicketMedioRegra[]; setTicketsMedios: React.Dispatch<React.SetStateAction<TicketMedioRegra[]>>;
  orcamentos: Orcamento[]; setOrcamentos: React.Dispatch<React.SetStateAction<Orcamento[]>>;
  empresas: Empresa[]; setEmpresas: React.Dispatch<React.SetStateAction<Empresa[]>>;
  proximasAcoes: ProximaAcao[]; setProximasAcoes: React.Dispatch<React.SetStateAction<ProximaAcao[]>>;
  formasPagamento: FormaPagamento[]; setFormasPagamento: React.Dispatch<React.SetStateAction<FormaPagamento[]>>;
  prazosPagamento: PrazoPagamento[]; setPrazosPagamento: React.Dispatch<React.SetStateAction<PrazoPagamento[]>>;
  appConfig: AppConfig; setAppConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  isLoading: boolean;
  isSaving: boolean;
  lastSavedAt: string | null;
  saveError: string | null;
  pendingSyncCount: number;
  refreshPendingSyncCount: () => Promise<void>;
  syncStatus: "idle" | "pending" | "syncing" | "synced" | "error" | "first-upload-required";
  syncError: string | null;
  lastAutoSyncAt: string | null;
  runManualUploadSync: (overrideContext?: ManualUploadSyncOverrideContext) => Promise<AutoSyncResult>;
  restoreAccountSnapshot: (snapshot: AccountSnapshot) => Promise<CloudRestoreResult>;
  isReady: boolean;
  dbError: string | null;
  filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  filtered: { lancamentos: Lancamento[]; negocios: Negocio[]; oportunidades: OportunidadeComercial[] };
  clienteById: (id: string) => Cliente | undefined;
  produtoById: (id: string) => Produto | undefined;
}

const Ctx = createContext<AppStoreCtx | null>(null);

const defaultFilters: Filters = {
  dataInicial: "", dataFinal: "", mes: "",
  abc: "", prioridade: "", rota: "", status: "", frente: "", vendedor: "",
};

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const { session, accessStatus, loading: authLoading } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [metasEmpresa, setMetasEmpresa] = useState<MetaEmpresa[]>([]);
  const [metasPessoais, setMetasPessoais] = useState<MetaPessoal[]>([]);
  const [metasVendedor, setMetasVendedor] = useState<MetaVendedor[]>([]);
  const [metasCategoria, setMetasCategoria] = useState<MetaCategoria[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [prioridadesP1, setPrioridadesP1] = useState<PrioridadeP1Item[]>([]);
  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [oportunidades, setOportunidades] = useState<OportunidadeComercial[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [regras, setRegras] = useState<RegraComissao[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [ticketsMedios, setTicketsMedios] = useState<TicketMedioRegra[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [proximasAcoes, setProximasAcoes] = useState<ProximaAcao[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [prazosPagamento, setPrazosPagamento] = useState<PrazoPagamento[]>([]);
  const [appConfig, setAppConfig] = useState<AppConfig>({ id: "main", percentualAcertoEsperado: 12 });
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<"idle" | "pending" | "syncing" | "synced" | "error" | "first-upload-required">("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastAutoSyncAt, setLastAutoSyncAt] = useState<string | null>(null);
  const hasHydratedRef = useRef(false);
  const isApplyingCloudRestoreRef = useRef(false);
  const skipNextPersistStoresRef = useRef<Set<string>>(new Set());
  const lastPersistedAppConfigRef = useRef<string>(JSON.stringify({ id: "main", percentualAcertoEsperado: 12 }));
  const autoSyncTimerRef = useRef<number | null>(null);
  const autoSyncWatchdogIntervalRef = useRef<number | null>(null);
  const pendingSyncCountRef = useRef(pendingSyncCount);
  const syncStatusRef = useRef(syncStatus);
  const isReadyRef = useRef(isReady);
  const authLoadingRetryCountRef = useRef(0);
  const authLoadingRef = useRef(authLoading);
  const scheduleAutoSyncRef = useRef<(delayMs: number) => void>(() => undefined);

  useEffect(() => {
    authLoadingRef.current = authLoading;
    if (!authLoading) authLoadingRetryCountRef.current = 0;
  }, [authLoading]);

  useEffect(() => {
    pendingSyncCountRef.current = pendingSyncCount;
  }, [pendingSyncCount]);

  useEffect(() => {
    syncStatusRef.current = syncStatus;
  }, [syncStatus]);

  useEffect(() => {
    isReadyRef.current = isReady;
  }, [isReady]);


  const refreshPendingSyncCount = useCallback(async () => {
    try {
      const pending = await getPendingSyncItems();
      pendingSyncCountRef.current = pending.length;
      setPendingSyncCount(pending.length);
      return pending.length;
    } catch (error) {
      console.error(error);
      return pendingSyncCountRef.current;
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const localData = await bootstrapLocalDatabase();
        setClientes(localData.clientes);
        setLancamentos(localData.lancamentos);
        setMetasEmpresa(localData.metasEmpresa);
        setMetasPessoais(localData.metasPessoais);
        setMetasVendedor(localData.metasVendedor);
        setMetasCategoria(localData.metasCategoria);
        setEventos(localData.eventos);
        setPrioridadesP1(localData.prioridadesP1);
        setNegocios(localData.negocios);
        setOportunidades((localData as {oportunidades?: OportunidadeComercial[]}).oportunidades || []);
        setProdutos(localData.produtos);
        setRegras(localData.regrasComissao);
        setVendedores(localData.vendedores);
        setTicketsMedios(localData.configuracoes || []);
        setOrcamentos(localData.orcamentos || []);
        setEmpresas((localData as {empresas?: Empresa[]}).empresas || []);
        setProximasAcoes((localData as {proximasAcoes?: ProximaAcao[]}).proximasAcoes || []);
        setFormasPagamento((localData as {formasPagamento?: FormaPagamento[]}).formasPagamento || []);
        setPrazosPagamento((localData as {prazosPagamento?: PrazoPagamento[]}).prazosPagamento || []);
        const hydratedAppConfig = (localData as {appConfig?: AppConfig[]}).appConfig?.[0] || { id: "main", percentualAcertoEsperado: 12 };
        setAppConfig(hydratedAppConfig);
        lastPersistedAppConfigRef.current = JSON.stringify({ id: hydratedAppConfig.id, percentualAcertoEsperado: hydratedAppConfig.percentualAcertoEsperado });
        await refreshPendingSyncCount();
      } catch (error) {
        console.error(error);
        setDbError("Não foi possível acessar o banco local deste navegador. Os dados podem não ser salvos até o problema ser resolvido.");
      } finally {
        hasHydratedRef.current = true;
        setIsLoading(false);
        setIsReady(true);
      }
    };

    void init();
  }, [refreshPendingSyncCount]);


  const persistStore = useCallback(async <T extends { id: string }>(store: Parameters<typeof saveStore<T>>[0], data: T[]) => {
    if (!isReady || !hasHydratedRef.current || dbError || isApplyingCloudRestoreRef.current) return;
    if (skipNextPersistStoresRef.current.has(store)) {
      skipNextPersistStoresRef.current.delete(store);
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      await saveStore(store, data);
      if (shouldTrackSyncStore(store)) {
        const isOnlySyncMetaChange = store === "appConfig" && (() => {
          const config = data[0] as AppConfig | undefined;
          if (!config) return false;
          const syncRelevantPayload = JSON.stringify({ id: config.id, percentualAcertoEsperado: config.percentualAcertoEsperado });
          const unchanged = syncRelevantPayload === lastPersistedAppConfigRef.current;
          lastPersistedAppConfigRef.current = syncRelevantPayload;
          return unchanged;
        })();
        if (!isOnlySyncMetaChange) {
          await Promise.all(data.map((item) => enqueueSyncItem({ store, entityId: item.id, operation: "upsert", payload: item })));
        }
      }
      setLastSavedAt(new Date().toISOString());
      await refreshPendingSyncCount();
    } catch (error) {
      console.error(error);
      setSaveError("Erro ao salvar dados locais.");
    } finally {
      setIsSaving(false);
    }
  }, [dbError, isReady, refreshPendingSyncCount]);

  useEffect(() => { void persistStore("clientes", clientes); }, [clientes, persistStore]);
  useEffect(() => { void persistStore("lancamentos", lancamentos); }, [lancamentos, persistStore]);
  useEffect(() => { void persistStore("metasEmpresa", metasEmpresa); }, [metasEmpresa, persistStore]);
  useEffect(() => { void persistStore("metasPessoais", metasPessoais); }, [metasPessoais, persistStore]);
  useEffect(() => { void persistStore("metasVendedor", metasVendedor); }, [metasVendedor, persistStore]);
  useEffect(() => { void persistStore("metasCategoria", metasCategoria); }, [metasCategoria, persistStore]);
  useEffect(() => { void persistStore("eventos", eventos); }, [eventos, persistStore]);
  useEffect(() => { void persistStore("prioridadesP1", prioridadesP1); }, [prioridadesP1, persistStore]);
  useEffect(() => { void persistStore("negocios", negocios); }, [negocios, persistStore]);
  useEffect(() => { void persistStore("oportunidades", oportunidades as never); }, [oportunidades, persistStore]);
  useEffect(() => { void persistStore("produtos", produtos); }, [produtos, persistStore]);
  useEffect(() => { void persistStore("regrasComissao", regras); }, [regras, persistStore]);
  useEffect(() => { void persistStore("vendedores", vendedores); }, [vendedores, persistStore]);
  useEffect(() => { void persistStore("configuracoes", ticketsMedios as never); }, [ticketsMedios, persistStore]);
  useEffect(() => { void persistStore("orcamentos", orcamentos as never); }, [orcamentos, persistStore]);
  useEffect(() => { void persistStore("empresas", empresas as never); }, [empresas, persistStore]);
  useEffect(() => { void persistStore("proximasAcoes", proximasAcoes as never); }, [proximasAcoes, persistStore]);
  useEffect(() => { void persistStore("formasPagamento", formasPagamento as never); }, [formasPagamento, persistStore]);
  useEffect(() => { void persistStore("prazosPagamento", prazosPagamento as never); }, [prazosPagamento, persistStore]);
  useEffect(() => { void persistStore("appConfig", [appConfig] as never); }, [appConfig, persistStore]);


  const restoreAccountSnapshot = useCallback(async (snapshot: AccountSnapshot) => {
    isApplyingCloudRestoreRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    try {
      const result = await restoreAccountSnapshotToLocal(snapshot);
      skipNextPersistStoresRef.current = new Set([
        "clientes", "lancamentos", "oportunidades", "orcamentos", "negocios", "proximasAcoes",
        "vendedores", "produtos", "formasPagamento", "prazosPagamento", "appConfig",
      ]);
      setClientes(result.snapshot.clientes as Cliente[]);
      setLancamentos(result.snapshot.lancamentos as Lancamento[]);
      setOportunidades(result.snapshot.oportunidades as OportunidadeComercial[]);
      setOrcamentos(result.snapshot.orcamentos as Orcamento[]);
      setNegocios(result.snapshot.negocios as Negocio[]);
      setProximasAcoes(result.snapshot.proximasAcoes as ProximaAcao[]);
      setVendedores(result.snapshot.vendedores as Vendedor[]);
      setProdutos(result.snapshot.produtos as Produto[]);
      setFormasPagamento(result.snapshot.formasPagamento as FormaPagamento[]);
      setPrazosPagamento(result.snapshot.prazosPagamento as PrazoPagamento[]);
      const restoredConfig = result.snapshot.appConfig[0] as AppConfig;
      setAppConfig(restoredConfig);
      lastPersistedAppConfigRef.current = JSON.stringify({ id: restoredConfig.id, percentualAcertoEsperado: restoredConfig.percentualAcertoEsperado });
      setLastSavedAt(result.restoredAt);
      setSyncStatus("synced");
      setSyncError(null);
      await refreshPendingSyncCount();
      return result;
    } catch (error) {
      console.error(error);
      setSaveError("Erro ao restaurar dados da conta neste dispositivo.");
      throw error;
    } finally {
      isApplyingCloudRestoreRef.current = false;
      setIsSaving(false);
    }
  }, [refreshPendingSyncCount]);

  const firstUploadConfirmed = Boolean(appConfig.syncMeta?.lastUploadAt);

  const applySyncResult = useCallback(async (result: AutoSyncResult, source: "auto" | "manual") => {
    if (result.skipped) {
      if (result.reason === "first-upload-required") {
        setSyncStatus("first-upload-required");
        setSyncError(result.message);
      } else if (result.reason === "no-pending-items") {
        setSyncStatus("synced");
        setSyncError(null);
      } else {
        setSyncStatus(pendingSyncCount > 0 ? "pending" : "idle");
        setSyncError(result.reason === "cooldown" ? "Cooldown de sincronização; nova tentativa em instantes." : result.message);
      }
      await refreshPendingSyncCount();
      return;
    }

    if (!result.ok) {
      setSyncStatus("error");
      setSyncError(result.message);
      await refreshPendingSyncCount();
      return;
    }

    setSyncError(null);
    setSyncStatus(result.summary.error > 0 ? "error" : "synced");
    setLastAutoSyncAt(new Date().toISOString());
    if (result.meta) setAppConfig((current) => ({ ...current, syncMeta: result.meta }));
    await refreshPendingSyncCount();
    if (source === "auto" && result.summary.error > 0) {
      setSyncError(`${result.summary.error} item(ns) não foram sincronizados automaticamente.`);
    }
  }, [pendingSyncCount, refreshPendingSyncCount]);

  const runManualUploadSync = useCallback(async (overrideContext?: ManualUploadSyncOverrideContext) => {
    const syncSession = overrideContext?.session ?? session;
    const syncAccessStatus = overrideContext?.accessStatus ?? accessStatus;

    setSyncStatus("syncing");
    setSyncError(null);
    const result = await runControlledUploadSync(
      { session: syncSession, accessStatus: syncAccessStatus, firstUploadConfirmed: true },
      { mode: "manual", bypassCooldown: true },
    );
    await applySyncResult(result, "manual");
    return result;
  }, [accessStatus, applySyncResult, session]);

  const getFreshAutoSyncContext = useCallback(async (): Promise<{ context: AutoSyncContext } | { result: AutoSyncResult }> => {
    const fresh = await getFreshSupabaseAccessContext();

    if (!fresh.session?.user) {
      if (fresh.error?.startsWith("Tempo excedido")) {
        return { result: { ok: false, skipped: false, message: fresh.error } };
      }

      return {
        result: {
          ok: true,
          skipped: true,
          reason: "missing-session",
          message: "Sessão Supabase indisponível. Faça login novamente.",
        },
      };
    }

    if (fresh.error) {
      return { result: { ok: false, skipped: false, message: fresh.error } };
    }

    if (fresh.accessStatus !== "active") {
      return {
        result: {
          ok: true,
          skipped: true,
          reason: "inactive-profile",
          message: "Usuário ainda não aprovado para sincronização.",
        },
      };
    }

    return {
      context: {
        session: fresh.session,
        accessStatus: fresh.accessStatus,
        firstUploadConfirmed,
      },
    };
  }, [firstUploadConfirmed]);

  const scheduleAutoSync = useCallback((delayMs: number) => {
    if (syncStatusRef.current === "syncing") return;
    if (autoSyncTimerRef.current) window.clearTimeout(autoSyncTimerRef.current);
    autoSyncTimerRef.current = window.setTimeout(() => {
      autoSyncTimerRef.current = null;
      if (!isReadyRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (syncStatusRef.current === "syncing") return;

      if (authLoadingRef.current) {
        setSyncStatus("pending");
        setSyncError("Aguardando sessão Supabase...");
        authLoadingRetryCountRef.current += 1;
        if (authLoadingRetryCountRef.current <= 20) scheduleAutoSyncRef.current(3_000);
        else {
          setSyncStatus("error");
          setSyncError("Tempo excedido ao aguardar sessão Supabase.");
        }
        return;
      }

      authLoadingRetryCountRef.current = 0;
      void (async () => {
        const freshPendingCount = await refreshPendingSyncCount();
        if (freshPendingCount <= 0) return;
        if (typeof navigator !== "undefined" && !navigator.onLine) return;
        if (syncStatusRef.current === "syncing") return;

        setSyncStatus("syncing");
        setSyncError(null);

        const freshContext = await getFreshAutoSyncContext();
        const result = "result" in freshContext
          ? freshContext.result
          : await runControlledUploadSync(freshContext.context, { mode: "auto" });

        await applySyncResult(result, "auto");

        if (result.skipped && result.reason === "cooldown" && getAutoSyncCooldownRemaining() > 0) {
          scheduleAutoSyncRef.current(getAutoSyncCooldownRemaining() + 500);
        }
      })();
    }, delayMs);
  }, [applySyncResult, getFreshAutoSyncContext, refreshPendingSyncCount]);

  useEffect(() => {
    scheduleAutoSyncRef.current = scheduleAutoSync;
  }, [scheduleAutoSync]);

  useEffect(() => {
    if (!isReady) return;
    if (pendingSyncCount <= 0) {
      setSyncError(null);
      setSyncStatus((current) => current === "syncing" ? current : "synced");
      return;
    }
    if (authLoading) {
      setSyncStatus("pending");
      setSyncError("Aguardando sessão Supabase...");
      scheduleAutoSync(3_000);
      return;
    }
    setSyncStatus((current) => current === "syncing" ? current : "pending");
    scheduleAutoSync(10_000);
  }, [authLoading, isReady, pendingSyncCount, scheduleAutoSync]);

  useEffect(() => {
    const triggerAutoSync = () => {
      void refreshPendingSyncCount();
      if (syncStatusRef.current === "syncing") return;
      setSyncStatus("pending");
      setSyncError("Aguardando sessão Supabase...");
      scheduleAutoSync(1_000);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") triggerAutoSync();
    };

    window.addEventListener("online", triggerAutoSync);
    window.addEventListener("focus", triggerAutoSync);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("online", triggerAutoSync);
      window.removeEventListener("focus", triggerAutoSync);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshPendingSyncCount, scheduleAutoSync]);

  useEffect(() => {
    if (!isReady || pendingSyncCount <= 0 || syncStatus === "syncing" || (typeof navigator !== "undefined" && !navigator.onLine)) {
      if (autoSyncWatchdogIntervalRef.current) {
        window.clearInterval(autoSyncWatchdogIntervalRef.current);
        autoSyncWatchdogIntervalRef.current = null;
      }
      return;
    }

    if (!autoSyncWatchdogIntervalRef.current) {
      autoSyncWatchdogIntervalRef.current = window.setInterval(() => {
        if (!isReadyRef.current || pendingSyncCountRef.current <= 0 || syncStatusRef.current === "syncing") return;
        if (typeof navigator !== "undefined" && !navigator.onLine) return;
        scheduleAutoSyncRef.current(1_000);
      }, 30_000);
    }

    return undefined;
  }, [isReady, pendingSyncCount, syncStatus]);

  useEffect(() => () => {
    if (autoSyncTimerRef.current) window.clearTimeout(autoSyncTimerRef.current);
    if (autoSyncWatchdogIntervalRef.current) window.clearInterval(autoSyncWatchdogIntervalRef.current);
  }, []);

  useEffect(() => {
    const valorMedio = calcularValorMedioHaSegmentosAtivos(ticketsMedios);
    setClientes((prev) => {
      let changed = false;
      const next = prev.map((c) => {
        const potencialTotal = calcularPotencialCliente(c, ticketsMedios);
        const potencialCalculado = valorMedio > 0;
        if (c.potencialTotal === potencialTotal && c.potencialCalculado === potencialCalculado) return c;
        changed = true;
        return { ...c, potencialTotal, potencialCalculado };
      });
      return changed ? next : prev;
    });
  }, [ticketsMedios, setClientes]);

  const cMap = useMemo(() => new Map(clientes.map(c => [c.id, c])), [clientes]);
  const pMap = useMemo(() => new Map(produtos.map(p => [p.id, p])), [produtos]);

  const filteredLancs = useMemo(() => lancamentos.filter(l => {
    const c = cMap.get(l.clienteId);
    if (filters.dataInicial && l.data < filters.dataInicial) return false;
    if (filters.dataFinal && l.data > filters.dataFinal) return false;
    if (filters.mes && l.data.slice(0, 7) !== filters.mes) return false;
    if (filters.abc && c?.abc !== filters.abc) return false;
    if (filters.prioridade && c?.prioridade !== filters.prioridade) return false;
    if (filters.rota && c?.rota !== filters.rota) return false;
    if (filters.status && l.status !== filters.status) return false;
    if (filters.frente && l.frente !== filters.frente) return false;
    if (filters.vendedor && l.vendedor !== filters.vendedor) return false;
    return true;
  }), [lancamentos, filters, cMap]);

  const filteredNegs = useMemo(() => negocios.filter(n => {
    const c = cMap.get(n.clienteId);
    const dt = n.ultimaAtualizacao || n.dataCriacao;
    if (filters.dataInicial && dt < filters.dataInicial) return false;
    if (filters.dataFinal && dt > filters.dataFinal) return false;
    if (filters.mes && dt.slice(0, 7) !== filters.mes) return false;
    if (filters.abc && c?.abc !== filters.abc) return false;
    if (filters.prioridade && c?.prioridade !== filters.prioridade) return false;
    if (filters.rota && c?.rota !== filters.rota) return false;
    if (filters.vendedor && n.vendedor !== filters.vendedor) return false;
    return true;
  }), [negocios, filters, cMap]);

  const filteredOportunidades = useMemo(() => oportunidades.filter(o => {
    const c = cMap.get(o.clienteId);
    const dt = o.updatedAt || o.createdAt;
    if (filters.dataInicial && dt < filters.dataInicial) return false;
    if (filters.dataFinal && dt > filters.dataFinal) return false;
    if (filters.mes && dt.slice(0, 7) !== filters.mes) return false;
    if (filters.abc && c?.abc !== filters.abc) return false;
    if (filters.prioridade && c?.prioridade !== filters.prioridade) return false;
    if (filters.rota && c?.rota !== filters.rota) return false;
    if (filters.status && o.etapa !== filters.status) return false;
    if (filters.vendedor && o.responsavel !== filters.vendedor) return false;
    return true;
  }), [oportunidades, filters, cMap]);

  return (
    <Ctx.Provider value={{
      clientes, setClientes, lancamentos, setLancamentos,
      metasEmpresa, setMetasEmpresa, metasPessoais, setMetasPessoais,
      metasVendedor, setMetasVendedor, metasCategoria, setMetasCategoria,
      eventos, setEventos, prioridadesP1, setPrioridadesP1,
      negocios, setNegocios, oportunidades, setOportunidades, produtos, setProdutos,
      regras, setRegras, vendedores, setVendedores, ticketsMedios, setTicketsMedios, orcamentos, setOrcamentos, empresas, setEmpresas, proximasAcoes, setProximasAcoes, formasPagamento, setFormasPagamento, prazosPagamento, setPrazosPagamento, appConfig, setAppConfig,
      isLoading, isReady, dbError, isSaving, lastSavedAt, saveError, pendingSyncCount, refreshPendingSyncCount, syncStatus, syncError, lastAutoSyncAt, runManualUploadSync, restoreAccountSnapshot,
      filters, setFilters,
      filtered: { lancamentos: filteredLancs, negocios: filteredNegs, oportunidades: filteredOportunidades },
      clienteById: (id) => cMap.get(id),
      produtoById: (id) => pMap.get(id),
    }}>
      {isLoading ? (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
            Carregando dados locais...
          </div>
        </div>
      ) : children}
    </Ctx.Provider>
  );
}

export function useAppStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppStore must be used within AppStoreProvider");
  return ctx;
}
