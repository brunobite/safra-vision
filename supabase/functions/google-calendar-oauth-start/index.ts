import { GOOGLE_CALENDAR_SCOPE, corsHeaders, getRequiredEnv, getServiceClient, responseJson, signedStateForRequest, validateRequestUser } from "../_shared/googleCalendar.ts";

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return responseJson({ error: "Método não permitido." }, 405);

  const { user } = await validateRequestUser(req);
  const supabase = getServiceClient();
  const { data: existing } = await supabase
    .from("google_calendar_connections")
    .select("id")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", getRequiredEnv("GOOGLE_CLIENT_ID"));
  authUrl.searchParams.set("redirect_uri", getRequiredEnv("GOOGLE_CALENDAR_REDIRECT_URI"));
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_CALENDAR_SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("state", await signedStateForRequest(user.id));
  if (!existing) authUrl.searchParams.set("prompt", "consent");

  return responseJson({ authUrl: authUrl.toString() });
}

Deno.serve((req) => handle(req).catch((error) => responseJson({ error: error instanceof Error ? error.message : "Erro ao iniciar OAuth do Google Calendar." }, 400)));
