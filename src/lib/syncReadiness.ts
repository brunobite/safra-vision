import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getLocalDbStats, type LocalDbStats } from "@/lib/localRepository";
import { getPendingSyncItems } from "@/lib/syncQueue";
import { getRemoteSyncMeta, type LocalRemoteComparison, type SyncMetaPayload } from "@/lib/supabaseSync";
import type { LocalSyncMeta } from "@/types";

export type SyncReadinessState =
  | "ready"
  | "needs-login"
  | "needs-approval"
  | "first-upload-required"
  | "offline"
  | "pending-items"
  | "local-empty-cloud-existing"
  | "attention"
  | "blocked";

export type SyncReadinessAccessStatus = "pending" | "active" | "blocked" | "inactive" | null;

export type SyncReadinessInput = {
  supabaseConfigured: boolean;
  sessionExists: boolean;
  userId: string | null;
  email: string | null;
  role: string | null;
  accessStatus: SyncReadinessAccessStatus;
  indexedDbLoaded: boolean;
  pendingSyncCount: number;
  localSyncMeta: LocalSyncMeta | null;
  remoteSyncMeta?: SyncMetaPayload | null;
  remoteSyncMetaChecked?: boolean;
  online: boolean;
  comparison?: LocalRemoteComparison | null;
  localOperationalCount?: number | null;
  currentUserId?: string | null;
};

export type SyncReadinessReport = SyncReadinessInput & {
  state: SyncReadinessState;
  firstUploadConfirmed: boolean;
  hasLocalSyncMeta: boolean;
  hasRemoteSyncMeta: boolean;
  userSwitchDetected: boolean;
  localEmptyCloudExisting: boolean;
  divergenceDetected: boolean;
  autosyncAllowed: boolean;
  autosyncBlockedReason: string | null;
  operationalRecommendation: string;
  finalRecommendation: "Apto para uso" | "Apto com atenção" | "Bloqueado";
  blockingMessages: string[];
};

export type GetSyncReadinessOptions = {
  session: Session | null;
  accessStatus: SyncReadinessAccessStatus;
  role: string | null;
  localSyncMeta: LocalSyncMeta | null;
  indexedDbLoaded: boolean;
  comparison?: LocalRemoteComparison | null;
  stats?: LocalDbStats | null;
  fetchRemoteMeta?: boolean;
};

const USER_SWITCH_MESSAGE = "Conta Supabase diferente da última conta sincronizada neste navegador. Para evitar mistura de dados entre usuários, o autosync foi bloqueado.";
const FIRST_UPLOAD_MESSAGE = "Primeiro envio precisa ser confirmado manualmente.";
const LOCAL_EMPTY_CLOUD_EXISTING_MESSAGE = "Base local vazia e dados encontrados na nuvem. Restauração será tratada no Sprint 18.";

const OPERATIONAL_STORES: Array<keyof LocalDbStats["counts"]> = [
  "clientes", "vendedores", "lancamentos", "negocios", "oportunidades", "produtos", "metasEmpresa",
  "metasPessoais", "metasVendedor", "metasCategoria", "regrasComissao", "eventos", "prioridadesP1",
  "configuracoes", "orcamentos", "empresas", "proximasAcoes", "formasPagamento", "prazosPagamento",
];

export function getLocalOperationalCount(stats: LocalDbStats | null | undefined) {
  if (!stats) return null;
  return OPERATIONAL_STORES.reduce((total, store) => total + (stats.counts[store] ?? 0), 0);
}

export function detectUserSwitch(currentUserId: string | null | undefined, localSyncMeta: LocalSyncMeta | null | undefined) {
  return Boolean(currentUserId && localSyncMeta?.lastSyncedUserId && localSyncMeta.lastSyncedUserId !== currentUserId);
}

export function buildSyncReadinessReport(input: SyncReadinessInput): SyncReadinessReport {
  const firstUploadConfirmed = Boolean(input.localSyncMeta?.lastUploadAt);
  const hasLocalSyncMeta = Boolean(input.localSyncMeta?.lastUploadAt || input.localSyncMeta?.lastDownloadAt || input.localSyncMeta?.lastSyncedUserId);
  const hasRemoteSyncMeta = Boolean(input.remoteSyncMeta?.lastUploadAt || input.remoteSyncMeta?.lastDownloadAt || input.remoteSyncMeta?.lastSyncedUserId);
  const userSwitchDetected = detectUserSwitch(input.currentUserId ?? input.userId, input.localSyncMeta);
  const localEmptyCloudExisting = Boolean((input.localOperationalCount ?? 1) <= 0 && hasRemoteSyncMeta);
  const divergenceDetected = Boolean(input.comparison && (input.comparison.totals.onlyLocal > 0 || input.comparison.totals.onlyRemote > 0));

  const blockingMessages: string[] = [];
  let state: SyncReadinessState = "ready";
  let autosyncBlockedReason: string | null = null;

  if (!input.supabaseConfigured) {
    state = "blocked";
    blockingMessages.push("Supabase não configurado.");
  } else if (!input.online) {
    state = "offline";
    blockingMessages.push("Aplicativo offline.");
  } else if (!input.sessionExists || !input.userId) {
    state = "needs-login";
    blockingMessages.push("Sessão Supabase ausente.");
  } else if (input.accessStatus !== "active") {
    state = "needs-approval";
    blockingMessages.push("Usuário pending/inactive/blocked precisa de aprovação administrativa.");
  } else if (!input.indexedDbLoaded) {
    state = "blocked";
    blockingMessages.push("IndexedDB ainda não foi carregado.");
  } else if (userSwitchDetected) {
    state = "blocked";
    blockingMessages.push(USER_SWITCH_MESSAGE);
  } else if (localEmptyCloudExisting) {
    state = "local-empty-cloud-existing";
    blockingMessages.push(LOCAL_EMPTY_CLOUD_EXISTING_MESSAGE);
  } else if (!firstUploadConfirmed) {
    state = "first-upload-required";
    blockingMessages.push(FIRST_UPLOAD_MESSAGE);
  } else if (input.pendingSyncCount > 0) {
    state = "pending-items";
  } else if (divergenceDetected) {
    state = "attention";
  }

  if (!input.supabaseConfigured) autosyncBlockedReason = "Supabase não configurado.";
  else if (!input.online) autosyncBlockedReason = "Aplicativo offline.";
  else if (!input.sessionExists || !input.userId) autosyncBlockedReason = "Sessão Supabase ausente.";
  else if (input.accessStatus !== "active") autosyncBlockedReason = "Usuário ainda não aprovado para sincronização.";
  else if (!input.indexedDbLoaded) autosyncBlockedReason = "IndexedDB ainda não foi carregado.";
  else if (userSwitchDetected) autosyncBlockedReason = USER_SWITCH_MESSAGE;
  else if (localEmptyCloudExisting) autosyncBlockedReason = LOCAL_EMPTY_CLOUD_EXISTING_MESSAGE;
  else if (!firstUploadConfirmed) autosyncBlockedReason = FIRST_UPLOAD_MESSAGE;

  const autosyncAllowed = !autosyncBlockedReason;
  const finalRecommendation = state === "ready" ? "Apto para uso" : ["pending-items", "attention"].includes(state) ? "Apto com atenção" : "Bloqueado";
  const operationalRecommendation = (() => {
    if (userSwitchDetected) return USER_SWITCH_MESSAGE;
    if (localEmptyCloudExisting) return LOCAL_EMPTY_CLOUD_EXISTING_MESSAGE;
    if (!firstUploadConfirmed && input.sessionExists && input.accessStatus === "active") return FIRST_UPLOAD_MESSAGE;
    if (state === "needs-login") return "Faça login no Supabase para sincronizar.";
    if (state === "needs-approval") return "Aguarde aprovação administrativa do perfil Supabase.";
    if (state === "offline") return "Conecte à internet antes de sincronizar.";
    if (input.pendingSyncCount > 0) return "Há pendências locais; a sincronização pode enviar a fila quando liberada.";
    if (divergenceDetected) return "Há divergência local x nuvem; revisar comparação antes de novas decisões.";
    return "Apto para uso.";
  })();

  return {
    ...input,
    state,
    firstUploadConfirmed,
    hasLocalSyncMeta,
    hasRemoteSyncMeta,
    userSwitchDetected,
    localEmptyCloudExisting,
    divergenceDetected,
    autosyncAllowed,
    autosyncBlockedReason,
    operationalRecommendation,
    finalRecommendation,
    blockingMessages,
  };
}

export async function getSyncReadiness(options: GetSyncReadinessOptions): Promise<SyncReadinessReport> {
  const session = options.session;
  const user = session?.user ?? null;
  const [pendingItems, stats] = await Promise.all([
    getPendingSyncItems(),
    options.stats === undefined ? getLocalDbStats().catch(() => null) : Promise.resolve(options.stats),
  ]);

  let remoteSyncMeta: SyncMetaPayload | null | undefined;
  let remoteSyncMetaChecked = false;
  if (options.fetchRemoteMeta && session?.user && options.accessStatus === "active") {
    try {
      remoteSyncMeta = await getRemoteSyncMeta({ session, accessStatus: "active" });
      remoteSyncMetaChecked = true;
    } catch {
      remoteSyncMeta = null;
      remoteSyncMetaChecked = false;
    }
  }

  return buildSyncReadinessReport({
    supabaseConfigured: isSupabaseConfigured,
    sessionExists: Boolean(user),
    userId: user?.id ?? null,
    email: user?.email ?? null,
    role: options.role,
    accessStatus: options.accessStatus,
    indexedDbLoaded: options.indexedDbLoaded,
    pendingSyncCount: pendingItems.length,
    localSyncMeta: options.localSyncMeta,
    remoteSyncMeta,
    remoteSyncMetaChecked,
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    comparison: options.comparison,
    localOperationalCount: getLocalOperationalCount(stats),
    currentUserId: user?.id ?? null,
  });
}

export const syncReadinessMessages = {
  userSwitch: USER_SWITCH_MESSAGE,
  firstUpload: FIRST_UPLOAD_MESSAGE,
  localEmptyCloudExisting: LOCAL_EMPTY_CLOUD_EXISTING_MESSAGE,
};
