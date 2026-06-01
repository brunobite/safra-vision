import { corsHeaders, responseJson, validateRequestUser } from "../_shared/googleCalendar.ts";

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const { user, supabase } = await validateRequestUser(req);
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("google_calendar_connections")
    .update({ revoked_at: now, updated_at: now })
    .eq("user_id", user.id)
    .is("revoked_at", null);
  if (error) throw error;
  return responseJson({ disconnected: true, revokedAt: now });
}

Deno.serve((req) => handle(req).catch((error) => responseJson({ disconnected: false, error: error instanceof Error ? error.message : "Erro ao desconectar Google Calendar." }, 400)));
