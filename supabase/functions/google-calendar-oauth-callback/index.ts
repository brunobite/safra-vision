import { GOOGLE_CALENDAR_SCOPE, getAppRedirectUrl, getRequiredEnv, getServiceClient, verifySignedState } from "../_shared/googleCalendar.ts";

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (oauthError) throw new Error("Autorização do Google Calendar cancelada ou negada.");
  if (!code || !state) throw new Error("Callback OAuth incompleto.");

  const { user_id } = await verifySignedState(state);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getRequiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: getRequiredEnv("GOOGLE_CALENDAR_REDIRECT_URI"),
      grant_type: "authorization_code",
    }),
  });
  const tokens = await tokenResponse.json() as GoogleTokenResponse;
  if (!tokenResponse.ok || tokens.error) throw new Error(tokens.error_description || "Falha ao concluir autorização do Google Calendar.");

  const supabase = getServiceClient();
  const { data: existing, error: existingError } = await supabase
    .from("google_calendar_connections")
    .select("id, refresh_token")
    .eq("user_id", user_id)
    .is("revoked_at", null)
    .maybeSingle();
  if (existingError) throw existingError;

  const refreshToken = tokens.refresh_token || existing?.refresh_token;
  if (!refreshToken) throw new Error("Google não retornou refresh_token. Remova o consentimento antigo no Google e conecte novamente.");

  const values = {
    user_id,
    refresh_token: refreshToken,
    scope: tokens.scope || GOOGLE_CALENDAR_SCOPE,
    updated_at: new Date().toISOString(),
    revoked_at: null,
  };

  const { error } = existing?.id
    ? await supabase.from("google_calendar_connections").update(values).eq("id", existing.id)
    : await supabase.from("google_calendar_connections").insert(values);
  if (error) throw error;

  return Response.redirect(getAppRedirectUrl("connected"), 302);
}

Deno.serve((req) => handleCallback(req).catch((error) => {
  const message = error instanceof Error ? error.message : "Erro no callback do Google Calendar.";
  return Response.redirect(getAppRedirectUrl("error", message), 302);
}));
