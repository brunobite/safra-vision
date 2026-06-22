import { corsHeaders, exchangeRefreshToken, responseJson, validateRequestUser } from "../_shared/googleCalendar.ts";

const GOOGLE_CALENDAR_RECONNECT_MESSAGE = "Autorização do Google Calendar expirada ou revogada. Reconecte em Configurações.";

function isRefreshTokenAuthorizationError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error || "")).toLowerCase();
  return message.includes("invalid_grant")
    || message.includes("token has been expired or revoked")
    || message.includes("expired or revoked")
    || message.includes("refresh token revoked/expired")
    || message.includes("revoked/expired")
    || message.includes("revogado")
    || message.includes("revogada")
    || message.includes("expirado")
    || message.includes("expirada")
    || message.includes("unauthorized_client");
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { user, supabase } = await validateRequestUser(req);
  const { data, error } = await supabase
    .from("google_calendar_connections")
    .select("id, google_account_email, connected_at, updated_at, revoked_at, refresh_token")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    return responseJson({ connected: false });
  }

  try {
    // Valida a autorização persistente sem expor ou registrar tokens.
    await exchangeRefreshToken(data.refresh_token);
  } catch (error) {
    if (isRefreshTokenAuthorizationError(error)) {
      const now = new Date().toISOString();
      const { error: revokeError } = await supabase
        .from("google_calendar_connections")
        .update({ revoked_at: now, updated_at: now })
        .eq("id", data.id);
      if (revokeError) throw revokeError;

      return responseJson({
        connected: false,
        googleAccountEmail: data.google_account_email ?? undefined,
        connectedAt: data.connected_at ?? undefined,
        updatedAt: now,
        revokedAt: now,
        error: GOOGLE_CALENDAR_RECONNECT_MESSAGE,
      });
    }
    throw error;
  }

  return responseJson({
    connected: true,
    googleAccountEmail: data.google_account_email ?? undefined,
    connectedAt: data.connected_at ?? undefined,
    updatedAt: data.updated_at ?? undefined,
    revokedAt: data.revoked_at ?? undefined,
  });
}

Deno.serve((req) => handle(req).catch((error) => responseJson({
  connected: false,
  error: error instanceof Error ? error.message : "Erro ao consultar Google Calendar.",
}, 400)));