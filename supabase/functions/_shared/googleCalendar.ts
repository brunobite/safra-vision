import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const DEFAULT_GOOGLE_CALENDAR_ID = "primary";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Secret obrigatório ausente: ${name}`);
  return value;
}

export function getServiceClient() {
  return createClient(getRequiredEnv("SUPABASE_URL"), getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getBearerToken(req: Request): string {
  const header = req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new Error("Sessão Supabase obrigatória.");
  return match[1];
}

export async function requireUser(req: Request) {
  const token = getBearerToken(req);
  const supabase = getServiceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("Sessão Supabase inválida ou expirada.");
  return { supabase, user: data.user, token };
}

function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

async function hmacSha256(message: string): Promise<string> {
  const secret = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
}

export async function createSignedState(userId: string): Promise<string> {
  const payload = base64UrlEncode(JSON.stringify({ user_id: userId, nonce: crypto.randomUUID(), exp: Math.floor(Date.now() / 1000) + 600 }));
  const signature = await hmacSha256(payload);
  return `${payload}.${signature}`;
}

export async function verifySignedState(state: string): Promise<{ user_id: string }> {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("State OAuth inválido.");
  const expected = await hmacSha256(payload);
  if (signature !== expected) throw new Error("State OAuth inválido.");
  const parsed = JSON.parse(base64UrlDecode(payload)) as { user_id?: string; exp?: number };
  if (!parsed.user_id || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) throw new Error("State OAuth expirado.");
  return { user_id: parsed.user_id };
}

export function getAppRedirectUrl(status: "connected" | "error", message?: string): string {
  const appBaseUrl = Deno.env.get("SAFRA_VISION_APP_URL") || Deno.env.get("SITE_URL") || "http://localhost:5173";
  const url = new URL("/configuracoes", appBaseUrl);
  url.searchParams.set("googleCalendar", status);
  if (message) url.searchParams.set("message", message);
  return url.toString();
}

export async function exchangeRefreshToken(refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: getRequiredEnv("GOOGLE_CLIENT_ID"),
    client_secret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json() as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || "Falha ao renovar autorização do Google Calendar.");
  return data.access_token;
}

export async function readSafeGoogleError(response: Response): Promise<string> {
  return response.json()
    .then((data: { error?: { message?: string } | string; message?: string }) => {
      if (typeof data.error === "string") return data.error;
      return data.error?.message || data.message || `Erro do Google Calendar (${response.status}).`;
    })
    .catch(() => `Erro do Google Calendar (${response.status}).`);
}

export const responseJson = jsonResponse;
export const signedStateForRequest = createSignedState;
export async function validateRequestUser(req: Request) {
  const token = getBearerToken(req);
  const supabase = getServiceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("Sessão Supabase obrigatória para OAuth persistente.");
  return { supabase, user: data.user };
}
