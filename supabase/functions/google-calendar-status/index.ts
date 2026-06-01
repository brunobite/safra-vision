import { corsHeaders, responseJson, validateRequestUser } from "../_shared/googleCalendar.ts";

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const { user, supabase } = await validateRequestUser(req);
  const { data, error } = await supabase
    .from("google_calendar_connections")
    .select("google_account_email, connected_at, updated_at, revoked_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  return responseJson({
    connected: Boolean(data),
    googleAccountEmail: data?.google_account_email ?? undefined,
    connectedAt: data?.connected_at ?? undefined,
    updatedAt: data?.updated_at ?? undefined,
    revokedAt: data?.revoked_at ?? undefined,
  });
}

Deno.serve((req) => handle(req).catch((error) => responseJson({ connected: false, error: error instanceof Error ? error.message : "Erro ao consultar Google Calendar." }, 400)));
