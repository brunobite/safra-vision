import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/supabase";
import { fetchAccountSnapshot, type AccountSnapshot } from "@/lib/cloudRestore";
import { compareLocalAndRemote, type LocalRemoteComparison, type SyncMetaPayload, type SyncSummary } from "@/lib/supabaseSync";
import { normalizeAccessStatus } from "@/lib/accessStatus";

export type AccountSyncAccessStatus = "pending" | "active" | "blocked" | "inactive" | string | null;

export type AccountSyncFreshContext = {
  session: Session | null;
  accessStatus: AccountSyncAccessStatus;
  error?: string | null;
  accountOwnerUserId?: string | null;
  role?: string | null;
};

export type AccountSyncUploadResult =
  | { ok: true; skipped?: false; summary: SyncSummary; meta: SyncMetaPayload | null }
  | { ok: true; skipped: true; message: string }
  | { ok: false; skipped?: false; message: string };

export type AccountSyncRestoreResult = {
  restoredAt: string;
  summary?: { total: number };
};

export type AccountSyncDependencies = {
  getFreshAccessContext: () => Promise<AccountSyncFreshContext>;
  refreshPendingSyncCount: () => Promise<number>;
  uploadPending: (context: { session: Session; accessStatus: "active"; accountOwnerUserId: string; role?: string | null }) => Promise<AccountSyncUploadResult>;
  compareLocalAndRemote?: (context: { session: Session; accessStatus: "active"; accountOwnerUserId: string; role?: string | null }) => Promise<LocalRemoteComparison>;
  fetchAccountSnapshot?: (context: { session: Session; accessStatus: "active"; accountOwnerUserId: string; role?: string | null }) => Promise<AccountSnapshot>;
  restoreAccountSnapshot: (snapshot: AccountSnapshot) => Promise<AccountSyncRestoreResult>;
  isOnline?: () => boolean;
  isSupabaseConfigured?: () => boolean;
  now?: () => number;
  cooldownMs?: number;
};

export type AccountSyncContext = AccountSyncDependencies;

export type AccountSyncStatusCode =
  | "synced"
  | "restored"
  | "cta-available"
  | "blocked"
  | "skipped"
  | "error";

export type AccountSyncStatus = {
  ok: boolean;
  code: AccountSyncStatusCode;
  message: string;
  technicalMessage?: string;
  comparison?: LocalRemoteComparison;
  pendingSyncCount?: number;
  restoredCount?: number;
  uploadSummary?: SyncSummary;
  lastCheckedAt: string;
};

export type AccountSyncDecisionParams = {
  supabaseConfigured: boolean;
  sessionExists: boolean;
  accessStatus: AccountSyncAccessStatus;
  isOnline: boolean;
  pendingSyncCount: number;
  localCount: number;
  onlyLocal: number;
  onlyRemote: number;
  changedInBoth?: number;
  remoteCount: number;
};

export type AccountSyncDecision = {
  allowed: boolean;
  reason:
    | "allowed"
    | "supabase-unconfigured"
    | "missing-session"
    | "inactive-profile"
    | "offline"
    | "pending-sync"
    | "local-conflict"
    | "cloud-conflict"
    | "no-cloud-data"
    | "already-updated"
    | "manual-cta";
  message: string;
};

const ACCOUNT_SYNC_COOLDOWN_MS = 60_000;

let lastAutoCheckAt = 0;
let autoCheckInProgress = false;

const nowIso = () => new Date().toISOString();

function defaultIsOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function defaultSupabaseConfigured() {
  return isSupabaseConfigured;
}

function buildStatus(input: Omit<AccountSyncStatus, "lastCheckedAt"> & { lastCheckedAt?: string }): AccountSyncStatus {
  return { ...input, lastCheckedAt: input.lastCheckedAt ?? nowIso() };
}

function activeContext(fresh: AccountSyncFreshContext): { session: Session; accessStatus: "active"; accountOwnerUserId: string; role?: string | null } | AccountSyncStatus {
  if (fresh.error) {
    return buildAccountSyncStatus({ code: "error", technicalMessage: fresh.error });
  }
  if (!fresh.session?.user) {
    return buildAccountSyncStatus({ code: "skipped", reason: "missing-session" });
  }
  if (normalizeAccessStatus(fresh.accessStatus) !== "active") {
    return buildAccountSyncStatus({ code: "skipped", reason: "inactive-profile" });
  }
  if (!fresh.accountOwnerUserId) {
    return buildAccountSyncStatus({ code: "blocked", technicalMessage: "Conta comercial (accountOwnerUserId) obrigatória ausente; sincronização bloqueada." });
  }
  return { session: fresh.session, accessStatus: "active", accountOwnerUserId: fresh.accountOwnerUserId, role: fresh.role ?? null };
}

export function shouldUploadPendingFirst(params: { pendingSyncCount: number }) {
  return params.pendingSyncCount > 0;
}

export function shouldAutoRestoreAccount(params: AccountSyncDecisionParams): AccountSyncDecision {
  if (!params.supabaseConfigured) return { allowed: false, reason: "supabase-unconfigured", message: "Sincronização da conta indisponível neste ambiente." };
  if (!params.sessionExists) return { allowed: false, reason: "missing-session", message: "Faça login para sincronizar os dados da conta." };
  if (normalizeAccessStatus(params.accessStatus) !== "active") return { allowed: false, reason: "inactive-profile", message: "Usuário ainda não aprovado para sincronização." };
  if (!params.isOnline) return { allowed: false, reason: "offline", message: "Sem conexão. Os dados locais continuam disponíveis." };
  if (params.pendingSyncCount > 0) return { allowed: false, reason: "pending-sync", message: "Há dados locais aguardando envio." };
  if (params.remoteCount <= 0) return { allowed: false, reason: "no-cloud-data", message: "Este dispositivo está atualizado." };
  if (params.onlyLocal > 0 || params.onlyRemote > 0 || (params.changedInBoth ?? 0) > 0) {
    return { allowed: true, reason: "allowed", message: "Carregando dados oficiais da sua conta..." };
  }
  return { allowed: false, reason: "already-updated", message: "Este dispositivo está atualizado." };
}

export function buildAccountSyncStatus(params: {
  code: AccountSyncStatusCode;
  reason?: AccountSyncDecision["reason"];
  technicalMessage?: string;
  comparison?: LocalRemoteComparison;
  pendingSyncCount?: number;
  restoredCount?: number;
  uploadSummary?: SyncSummary;
  message?: string;
}): AccountSyncStatus {
  const fallbackMessage = (() => {
    switch (params.code) {
      case "synced":
        return "Sincronização concluída.";
      case "restored":
        return "Dados da conta carregados neste dispositivo.";
      case "cta-available":
        return "Há dados da sua conta disponíveis. Sincronizar agora?";
      case "blocked":
        return "Conflito detectado. Revisão manual necessária.";
      case "skipped":
        if (params.reason === "offline") return "Sem conexão. Os dados locais continuam disponíveis.";
        if (params.reason === "missing-session") return "Faça login para sincronizar os dados da conta.";
        if (params.reason === "inactive-profile") return "Usuário ainda não aprovado para sincronização.";
        if (params.reason === "supabase-unconfigured") return "Sincronização da conta indisponível neste ambiente.";
        return "Este dispositivo está atualizado.";
      case "error":
        return "Não foi possível concluir a sincronização agora.";
    }
  })();

  return buildStatus({
    ok: params.code !== "error" && params.code !== "blocked",
    code: params.code,
    message: params.message ?? fallbackMessage,
    technicalMessage: params.technicalMessage,
    comparison: params.comparison,
    pendingSyncCount: params.pendingSyncCount,
    restoredCount: params.restoredCount,
    uploadSummary: params.uploadSummary,
  });
}

async function uploadPendingFirstIfNeeded(
  dependencies: AccountSyncDependencies,
  syncContext: { session: Session; accessStatus: "active"; accountOwnerUserId: string; role?: string | null },
  pendingSyncCount: number,
): Promise<{ status?: AccountSyncStatus; pendingSyncCount: number; uploadSummary?: SyncSummary }> {
  if (!shouldUploadPendingFirst({ pendingSyncCount })) return { pendingSyncCount };

  const uploadResult = await dependencies.uploadPending(syncContext);
  if (!uploadResult.ok) {
    return {
      pendingSyncCount,
      status: buildAccountSyncStatus({
        code: "blocked",
        message: "Existem dados locais que precisam de revisão antes de sincronizar.",
        technicalMessage: uploadResult.message,
      }),
    };
  }
  if (uploadResult.skipped) {
    return {
      pendingSyncCount,
      status: buildAccountSyncStatus({ code: "blocked", message: uploadResult.message }),
    };
  }
  if (uploadResult.summary.error > 0) {
    return {
      pendingSyncCount,
      uploadSummary: uploadResult.summary,
      status: buildAccountSyncStatus({
        code: "blocked",
        message: "Existem dados locais que precisam de revisão antes de sincronizar.",
        uploadSummary: uploadResult.summary,
        technicalMessage: uploadResult.summary.errors.map((error) => error.message).join("; "),
      }),
    };
  }

  return {
    pendingSyncCount: await dependencies.refreshPendingSyncCount(),
    uploadSummary: uploadResult.summary,
  };
}

async function restoreRemoteOnlyData(
  dependencies: AccountSyncDependencies,
  syncContext: { session: Session; accessStatus: "active"; accountOwnerUserId: string; role?: string | null },
  comparison: LocalRemoteComparison,
  uploadSummary?: SyncSummary,
) {
  const snapshot = await (dependencies.fetchAccountSnapshot ?? fetchAccountSnapshot)(syncContext);
  const restoreResult = await dependencies.restoreAccountSnapshot(snapshot);
  return buildAccountSyncStatus({
    code: "restored",
    comparison,
    restoredCount: restoreResult.summary?.total,
    uploadSummary,
  });
}

export async function runAccountSyncNow(dependencies: AccountSyncContext): Promise<AccountSyncStatus> {
  if (!(dependencies.isSupabaseConfigured ?? defaultSupabaseConfigured)()) {
    return buildAccountSyncStatus({ code: "skipped", reason: "supabase-unconfigured" });
  }
  if (!(dependencies.isOnline ?? defaultIsOnline)()) {
    return buildAccountSyncStatus({ code: "skipped", reason: "offline" });
  }

  try {
    const fresh = await dependencies.getFreshAccessContext();
    const syncContext = activeContext(fresh);
    if ("code" in syncContext) return syncContext;

    let pendingSyncCount = await dependencies.refreshPendingSyncCount();
    const upload = await uploadPendingFirstIfNeeded(dependencies, syncContext, pendingSyncCount);
    if (upload.status) return upload.status;
    pendingSyncCount = upload.pendingSyncCount;

    const comparison = await (dependencies.compareLocalAndRemote ?? compareLocalAndRemote)(syncContext);

    if (pendingSyncCount > 0) {
      return buildAccountSyncStatus({ code: "blocked", comparison, pendingSyncCount, uploadSummary: upload.uploadSummary });
    }

    const hasOfficialCloudData = comparison.totals.remoteCount > 0;
    const hasDivergence = comparison.totals.onlyLocal > 0
      || comparison.totals.onlyRemote > 0
      || comparison.totals.changedInBoth > 0;

    if (hasOfficialCloudData && hasDivergence) {
      return restoreRemoteOnlyData(dependencies, syncContext, comparison, upload.uploadSummary);
    }

    return buildAccountSyncStatus({ code: "synced", comparison, pendingSyncCount, uploadSummary: upload.uploadSummary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao sincronizar conta.";
    return buildAccountSyncStatus({ code: "error", technicalMessage: message });
  }
}

export async function runAccountSyncCheck(dependencies: AccountSyncContext): Promise<AccountSyncStatus> {
  const now = (dependencies.now ?? Date.now)();
  const cooldownMs = dependencies.cooldownMs ?? ACCOUNT_SYNC_COOLDOWN_MS;

  if (autoCheckInProgress) return buildAccountSyncStatus({ code: "skipped", message: "Este dispositivo está atualizado." });
  if (now - lastAutoCheckAt < cooldownMs) return buildAccountSyncStatus({ code: "skipped", message: "Este dispositivo está atualizado." });

  if (!(dependencies.isSupabaseConfigured ?? defaultSupabaseConfigured)()) {
    return buildAccountSyncStatus({ code: "skipped", reason: "supabase-unconfigured" });
  }
  if (!(dependencies.isOnline ?? defaultIsOnline)()) {
    return buildAccountSyncStatus({ code: "skipped", reason: "offline" });
  }

  autoCheckInProgress = true;
  lastAutoCheckAt = now;

  try {
    const fresh = await dependencies.getFreshAccessContext();
    const syncContext = activeContext(fresh);
    if ("code" in syncContext) return syncContext;

    let pendingSyncCount = await dependencies.refreshPendingSyncCount();
    const upload = await uploadPendingFirstIfNeeded(dependencies, syncContext, pendingSyncCount);
    if (upload.status) return upload.status;
    pendingSyncCount = upload.pendingSyncCount;

    const comparison = await (dependencies.compareLocalAndRemote ?? compareLocalAndRemote)(syncContext);
    const decision = shouldAutoRestoreAccount({
      supabaseConfigured: true,
      sessionExists: true,
      accessStatus: "active",
      isOnline: true,
      pendingSyncCount,
      localCount: comparison.totals.localCount,
      onlyLocal: comparison.totals.onlyLocal,
      onlyRemote: comparison.totals.onlyRemote,
      changedInBoth: comparison.totals.changedInBoth,
      remoteCount: comparison.totals.remoteCount,
    });

    if (decision.allowed) return restoreRemoteOnlyData(dependencies, syncContext, comparison, upload.uploadSummary);
    if (decision.reason === "manual-cta") return buildAccountSyncStatus({ code: "cta-available", message: decision.message, comparison, pendingSyncCount, uploadSummary: upload.uploadSummary });
    if (["pending-sync", "local-conflict", "cloud-conflict"].includes(decision.reason)) {
      return buildAccountSyncStatus({ code: "blocked", message: decision.message, comparison, pendingSyncCount, uploadSummary: upload.uploadSummary });
    }

    return buildAccountSyncStatus({ code: "synced", message: decision.message, comparison, pendingSyncCount, uploadSummary: upload.uploadSummary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao verificar sincronização da conta.";
    console.error(message);
    return buildAccountSyncStatus({ code: "error", technicalMessage: message });
  } finally {
    autoCheckInProgress = false;
  }
}

export function resetAccountSyncCooldownForTests() {
  lastAutoCheckAt = 0;
  autoCheckInProgress = false;
}
