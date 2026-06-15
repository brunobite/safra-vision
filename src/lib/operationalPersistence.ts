import type { Session } from "@supabase/supabase-js";
import { enqueueSyncItem, markSyncItemSynced, type SyncOperation } from "@/lib/syncQueue";
import { LOCAL_TO_REMOTE_TABLE, type SyncableStore } from "@/lib/supabaseSync";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { normalizeAccessStatus } from "@/lib/accessStatus";
import { normalizeClienteForPersistence } from "@/lib/clientNormalization";

export type OperationalPersistenceStatus = "sending" | "synced" | "pending-offline";

export type SaveOperationalEntityOptions = {
  session: Session | null;
  accessStatus: string | null;
  accountOwnerUserId?: string | null;
  onStatusChange?: (status: OperationalPersistenceStatus) => void;
  onRemoteSuccess?: () => Promise<void> | void;
  onRemoteError?: (error: Error) => Promise<void> | void;
};

const nowIso = () => new Date().toISOString();

function getRemoteUserId(options: SaveOperationalEntityOptions) {
  return options.accountOwnerUserId || options.session?.user.id || null;
}

function canAttemptRemote(options: SaveOperationalEntityOptions) {
  return Boolean(isSupabaseConfigured && supabase && options.session?.user && normalizeAccessStatus(options.accessStatus) === "active" && getRemoteUserId(options) && (typeof navigator === "undefined" || navigator.onLine));
}

function formatRemoteError(error: unknown) {
  if (error instanceof Error) return error;
  return new Error("Falha desconhecida ao sincronizar operação.");
}

export async function saveOperationalEntity<T extends { id: string }>(
  store: SyncableStore,
  record: T,
  operation: SyncOperation,
  options: SaveOperationalEntityOptions,
) {
  const payload = store === "clientes" ? normalizeClienteForPersistence(record as Record<string, unknown>) : record;

  if (!canAttemptRemote(options)) {
    await enqueueSyncItem({ store, entityId: record.id, operation, payload });
    options.onStatusChange?.("pending-offline");
    return { status: "pending-offline" as const, remote: false };
  }

  options.onStatusChange?.("sending");
  try {
    const table = LOCAL_TO_REMOTE_TABLE[store];
    const timestamp = nowIso();
    const row = operation === "delete"
      ? { id: record.id, user_id: getRemoteUserId(options)!, payload, updated_at: timestamp, deleted_at: timestamp }
      : { id: record.id, user_id: getRemoteUserId(options)!, payload, updated_at: timestamp, deleted_at: null };
    const { error } = await supabase!.from(table).upsert(row, { onConflict: "user_id,id" });
    if (error) throw new Error(error.message);

    await markSyncItemSynced(`${store}:${record.id}`);
    await options.onRemoteSuccess?.();
    options.onStatusChange?.("synced");
    return { status: "synced" as const, remote: true };
  } catch (error) {
    const formatted = formatRemoteError(error);
    await enqueueSyncItem({ store, entityId: record.id, operation, payload });
    await options.onRemoteError?.(formatted);
    options.onStatusChange?.("pending-offline");
    return { status: "pending-offline" as const, remote: false, error: formatted };
  }
}
