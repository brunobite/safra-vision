import { supabase } from "@/lib/supabase";

export type AuditPayload = {
  action: string;
  resource: string;
  entityId?: string | null;
  entityLabel?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  metadata?: Record<string, unknown> | null;
};

export async function recordAuditLog({ action, resource, entityId, entityLabel, beforeData, afterData, metadata }: AuditPayload) {
  if (!supabase) return;
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;
  const { error } = await supabase.rpc("record_audit_log", {
    p_action: action,
    p_resource: resource,
    p_entity_id: entityId ?? null,
    p_entity_label: entityLabel ?? null,
    p_before_data: beforeData ?? null,
    p_after_data: afterData ?? null,
    p_metadata: { ...(metadata ?? {}), user_agent: userAgent },
  });
  if (error) console.warn("Falha ao registrar auditoria:", error.message);
}
