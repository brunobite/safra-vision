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

async function handleUpsert(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return responseJson({ error: "Método não permitido." }, 405);

  const { user, supabase } = await validateRequestUser(req);
  const body = await req.json() as UpsertRequest;
  if (!body.event?.summary || !body.event.start || !body.event.end) throw new Error("Payload de evento inválido.");

  const { data: connection, error: connectionError } = await supabase
    .from("google_calendar_connections")
    .select("id, refresh_token")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (connectionError) throw connectionError;
  if (!connection?.refresh_token) throw new Error("Google Calendar persistente não conectado.");

  const accessToken = await exchangeRefreshToken(connection.refresh_token);
  const calendarId = body.calendarId || DEFAULT_GOOGLE_CALENDAR_ID;
  const operation = body.eventId ? "updated" : "created";
  const path = body.eventId
    ? `${encodeURIComponent(calendarId)}/events/${encodeURIComponent(body.eventId)}`
    : `${encodeURIComponent(calendarId)}/events`;
  const googleResponse = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${path}`, {
    method: body.eventId ? "PUT" : "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body.event),
  });
  if (!googleResponse.ok) throw new Error(await readSafeGoogleError(googleResponse));

  const event = await googleResponse.json() as { id: string; htmlLink?: string; updated?: string };
  return responseJson({ eventId: event.id, htmlLink: event.htmlLink, updated: event.updated, calendarId, operation });
}

Deno.serve((req) => handleUpsert(req).catch((error) => responseJson({
  error: error instanceof Error ? error.message : "Erro ao enviar evento ao Google Calendar.",
}, 400)));
