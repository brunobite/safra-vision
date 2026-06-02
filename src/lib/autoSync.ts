import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getPendingSyncItems } from "@/lib/syncQueue";
import { enqueueFullLocalSnapshotForSync, syncPendingQueue, type SyncMetaPayload, type SyncSummary } from "@/lib/supabaseSync";

export type AutoSyncAccessStatus = "pending" | "active" | "blocked" | "inactive" | null;
export type AutoSyncMode = "auto" | "manual";
export type AutoSyncSkipReason =
  | "supabase-not-configured"
  | "missing-session"
  | "inactive-profile"
  | "offline"
  | "no-pending-items"
  | "first-upload-required"
  | "already-running"
  | "cooldown";

export type AutoSyncResult =
  | { ok: true; skipped: false; summary: SyncSummary; meta: SyncMetaPayload | null }
  | { ok: true; skipped: true; reason: AutoSyncSkipReason; message: string }
  | { ok: false; skipped: false; message: string };

export type AutoSyncContext = {
  session: Session | null;
  accessStatus: AutoSyncAccessStatus;
  firstUploadConfirmed: boolean;
};

const AUTO_SYNC_COOLDOWN_MS = 30_000;

let autoSyncInProgress = false;
let lastAutoSyncAttemptAt = 0;

const skip = (reason: AutoSyncSkipReason, message: string): AutoSyncResult => ({ ok: true, skipped: true, reason, message });

export function isAutoSyncInProgress() {
  return autoSyncInProgress;
}

export function getAutoSyncCooldownRemaining(now = Date.now()) {
  return Math.max(0, AUTO_SYNC_COOLDOWN_MS - (now - lastAutoSyncAttemptAt));
}

export async function runControlledUploadSync(
  context: AutoSyncContext,
  options: { mode: AutoSyncMode; bypassCooldown?: boolean } = { mode: "auto" },
): Promise<AutoSyncResult> {
  if (autoSyncInProgress) return skip("already-running", "Sincronização já em andamento.");

  const now = Date.now();
  if (!options.bypassCooldown && now - lastAutoSyncAttemptAt < AUTO_SYNC_COOLDOWN_MS) {
    return skip("cooldown", "Aguardando intervalo mínimo entre tentativas de sincronização.");
  }

  if (!isSupabaseConfigured) return skip("supabase-not-configured", "Supabase não configurado.");
  if (!context.session?.user) return skip("missing-session", "Usuário não autenticado.");
  if (context.accessStatus !== "active") return skip("inactive-profile", "Usuário ainda não aprovado para sincronização.");
  if (typeof navigator !== "undefined" && !navigator.onLine) return skip("offline", "Sem conexão com a internet.");
  if (options.mode === "auto" && !context.firstUploadConfirmed) {
    return skip("first-upload-required", "Primeiro envio deve ser confirmado manualmente.");
  }

  let pendingItems;
  try {
    if (options.mode === "manual" && !context.firstUploadConfirmed) {
      await enqueueFullLocalSnapshotForSync();
    }
    pendingItems = await getPendingSyncItems();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao verificar pendências locais.";
    return { ok: false, skipped: false, message };
  }
  if (pendingItems.length === 0) return skip("no-pending-items", "Sem pendências locais para sincronizar.");

  autoSyncInProgress = true;
  lastAutoSyncAttemptAt = now;

  try {
    const { summary, meta } = await syncPendingQueue({ session: context.session, accessStatus: "active" });
    return { ok: true, skipped: false, summary, meta };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao sincronizar pendências.";
    return { ok: false, skipped: false, message };
  } finally {
    autoSyncInProgress = false;
  }
}
