import { DEFAULT_GOOGLE_CALENDAR_ID, corsHeaders, exchangeRefreshToken, responseJson, validateRequestUser, readSafeGoogleError } from "../_shared/googleCalendar.ts";

type GoogleCalendarEventPayload = {
  summary: string;
  description?: string;
  start: Record<string, unknown>;
  end: Record<string, unknown>;
  location?: string;
  reminders?: Record<string, unknown>;
};

type UpsertRequest = {
  event?: GoogleCalendarEventPayload;
  eventId?: string;
  calendarId?: string;
};

type LogDetails = {
  user_id?: string;
  calendarId?: string;
  operation?: "created" | "updated";
  googleStatus?: number;
  message?: string;
};

class HttpError extends Error {
  status: number;
  googleStatus?: number;

  constructor(message: string, status: number, googleStatus?: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.googleStatus = googleStatus;
  }
}

function sanitizeLogMessage(message: string): string {
  return message
    .replace(/ya29\.[\w.-]+/g, "[access_token]")
    .replace(/1\/\/[\w.-]+/g, "[refresh_token]")
    .replace(/Bearer\s+[\w.-]+/gi, "Bearer [token]")
    .slice(0, 500);
}

function logGoogleCalendar(level: "info" | "error", event: string, details: LogDetails): void {
  const safeDetails = {
    user_id: details.user_id,
    calendarId: details.calendarId,
    operation: details.operation,
    googleStatus: details.googleStatus,
    message: details.message ? sanitizeLogMessage(details.message) : undefined,
  };
  console[level](`[google-calendar-upsert-event] ${event}`, safeDetails);
}

function httpErrorFromUnknown(error: unknown): HttpError {
  const message = error instanceof Error ? error.message : "Erro ao enviar evento ao Google Calendar.";
  if (error instanceof HttpError) return error;
  if (message.includes("Sessão Supabase")) return new HttpError(message, 401);
  if (message.startsWith("Secret obrigatório ausente:")) return new HttpError(message, 500);
  return new HttpError(message, 400);
}

function isRefreshTokenAuthorizationError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error || "")).toLowerCase();
  return message.includes("invalid_grant")
    || message.includes("token has been expired or revoked")
    || message.includes("expired or revoked")
    || message.includes("refresh token revoked/expired")
    || message.includes("revoked/expired")
    || message.includes("revogado")
    || message.includes("expirado")
    || message.includes("unauthorized_client");
}

async function handleUpsert(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return responseJson({ error: "Método não permitido." }, 405);

  const { user, supabase } = await validateRequestUser(req).catch((error) => {
    const message = error instanceof Error ? error.message : "Sessão Supabase inválida.";
    throw new HttpError(message, 401);
  });

  let body: UpsertRequest;
  try {
    body = await req.json() as UpsertRequest;
  } catch {
    throw new HttpError("Payload inválido.", 400);
  }
  if (!body.event?.summary || !body.event.start || !body.event.end) throw new HttpError("Payload de evento inválido.", 400);

  const calendarId = body.calendarId || DEFAULT_GOOGLE_CALENDAR_ID;
  const operation = body.eventId ? "updated" : "created";

  const { data: connection, error: connectionError } = await supabase
    .from("google_calendar_connections")
    .select("id, refresh_token")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (connectionError) {
    logGoogleCalendar("error", "connection_lookup_failed", { user_id: user.id, calendarId, operation, message: connectionError.message });
    throw new HttpError(connectionError.message, 500);
  }
  if (!connection?.refresh_token) {
    logGoogleCalendar("error", "connection_not_found", { user_id: user.id, calendarId, operation, message: "Google Calendar persistente não conectado." });
    throw new HttpError("Google Calendar persistente não conectado.", 409);
  }

  let accessToken: string;
  try {
    accessToken = await exchangeRefreshToken(connection.refresh_token);
  } catch (error) {
    if (isRefreshTokenAuthorizationError(error)) {
      const now = new Date().toISOString();
      const { error: revokeError } = await supabase
        .from("google_calendar_connections")
        .update({ revoked_at: now, updated_at: now })
        .eq("id", connection.id);
      if (revokeError) logGoogleCalendar("error", "failed_to_mark_connection_revoked", { user_id: user.id, calendarId, operation, message: revokeError.message });
      logGoogleCalendar("error", "refresh_token_authorization_failed", { user_id: user.id, calendarId, operation, message: "Autorização do Google Calendar expirada ou revogada. Reconecte em Configurações." });
      throw new HttpError("Autorização do Google Calendar expirada ou revogada. Reconecte em Configurações.", 401);
    }
    const httpError = httpErrorFromUnknown(error);
    logGoogleCalendar("error", "refresh_token_failed", { user_id: user.id, calendarId, operation, message: httpError.message });
    throw httpError;
  }

  const path = body.eventId
    ? `${encodeURIComponent(calendarId)}/events/${encodeURIComponent(body.eventId)}`
    : `${encodeURIComponent(calendarId)}/events`;
  const googleResponse = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${path}`, {
    method: body.eventId ? "PUT" : "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body.event),
  });

  if (!googleResponse.ok) {
    const googleMessage = await readSafeGoogleError(googleResponse);
    const message = googleResponse.status === 404 && body.eventId
      ? "Evento não encontrado no Google Calendar. Remova o vínculo e envie novamente."
      : googleMessage;
    logGoogleCalendar("error", "google_api_error", { user_id: user.id, calendarId, operation, googleStatus: googleResponse.status, message });
    throw new HttpError(message, googleResponse.status, googleResponse.status);
  }

  const event = await googleResponse.json() as { id: string; htmlLink?: string; updated?: string };
  logGoogleCalendar("info", "google_api_success", { user_id: user.id, calendarId, operation, googleStatus: googleResponse.status });
  return responseJson({ eventId: event.id, htmlLink: event.htmlLink, updated: event.updated, calendarId, operation });
}

Deno.serve((req) => handleUpsert(req).catch((error) => {
  const httpError = httpErrorFromUnknown(error);
  logGoogleCalendar("error", "request_failed", {
    googleStatus: httpError.googleStatus,
    message: httpError.message,
  });
  return responseJson({ error: httpError.message }, httpError.status);
}));
