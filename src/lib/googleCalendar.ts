import type { Cliente, ProximaAcao } from "@/types";

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const GOOGLE_GSI_SCRIPT_URL = "https://accounts.google.com/gsi/client";
export const GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3/calendars";
export const DEFAULT_GOOGLE_CALENDAR_ID = "primary";
export const DEFAULT_EVENT_DURATION_MINUTES = 60;

export type GoogleCalendarStatus = "not_synced" | "synced" | "update_pending" | "error" | "deleted";
export type GoogleCalendarAuthStatus = "not_configured" | "not_connected" | "connected" | "token_expired" | "auth_error";

export interface GoogleCalendarConfig {
  clientId?: string;
  scope?: string;
}

export interface GoogleCalendarAgendaItem {
  id: string;
  cliente?: string;
  clienteNome?: string;
  fazenda?: string;
  cidade?: string;
  localidade?: string;
  vendedor?: string;
  responsavel?: string;
  tipo?: string;
  descricao?: string;
  objetivo?: string;
  observacoes?: string;
  status?: string;
  data?: string;
  horario?: string;
}

export interface GoogleCalendarEventPayload {
  summary: string;
  description: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
}

export interface GoogleCalendarApiEvent {
  id: string;
  htmlLink?: string;
  updated?: string;
}

export interface GoogleCalendarSyncMetadata {
  googleCalendarEventId?: string;
  googleCalendarHtmlLink?: string;
  googleCalendarSyncedAt?: string;
  googleCalendarStatus: GoogleCalendarStatus;
  googleCalendarLastError?: string;
  googleCalendarCalendarId?: string;
  googleCalendarUpdatedAt?: string;
}

type TokenResponse = { access_token?: string; expires_in?: number; error?: string; error_description?: string };
type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };
type GoogleIdentityServices = { accounts?: { oauth2?: { initTokenClient: (config: { client_id: string; scope: string; callback: (response: TokenResponse) => void; error_callback?: (error: unknown) => void }) => TokenClient } } };

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

let tokenClient: TokenClient | null = null;
let currentConfig: GoogleCalendarConfig | null = null;
let accessToken: string | null = null;
let accessTokenExpiresAt = 0;
let authStatus: GoogleCalendarAuthStatus = "not_configured";
let lastAuthError: string | null = null;
let pendingTokenRequest: { resolve: (token: string) => void; reject: (error: Error) => void; timeoutId?: number } | null = null;

const GOOGLE_CALENDAR_AUTH_TIMEOUT_MS = 120_000;
const GOOGLE_CALENDAR_AUTH_TIMEOUT_MESSAGE = "Autorização não concluída. Verifique se você rolou até o final da tela do Google e tocou em Continuar/Permitir.";

function safeGoogleCalendarDevLog(message: string, details?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  console.debug(`[Google Calendar] ${message}`, details || "");
}

function clearPendingTokenRequest(error?: Error): void {
  if (!pendingTokenRequest) return;
  if (pendingTokenRequest.timeoutId && typeof window !== "undefined") window.clearTimeout(pendingTokenRequest.timeoutId);
  if (error) pendingTokenRequest.reject(error);
  pendingTokenRequest = null;
}

function friendlyGoogleError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "error_description" in error) return String((error as { error_description?: string }).error_description || "Erro de autorização do Google Calendar.");
  if (error && typeof error === "object" && "error" in error) return String((error as { error?: string }).error || "Erro de autorização do Google Calendar.");
  return "Erro ao comunicar com o Google Calendar.";
}

function markGoogleCalendarAuthError(message: string): void {
  accessToken = null;
  accessTokenExpiresAt = 0;
  authStatus = "auth_error";
  lastAuthError = message;
}

function markGoogleCalendarTokenExpired(): void {
  accessToken = null;
  accessTokenExpiresAt = 0;
  authStatus = "token_expired";
}

function normalizeGoogleCalendarAuthState(): GoogleCalendarAuthStatus {
  if (accessToken && Date.now() >= accessTokenExpiresAt) markGoogleCalendarTokenExpired();
  return authStatus;
}

export function getGoogleCalendarClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
}

export function getGoogleCalendarAuthStatus(): GoogleCalendarAuthStatus {
  normalizeGoogleCalendarAuthState();
  if (lastAuthError) return "auth_error";
  if (!getGoogleCalendarClientId() && !currentConfig?.clientId) return "not_configured";
  if (authStatus === "connected" || authStatus === "token_expired") return authStatus;
  return "not_connected";
}

export function getGoogleCalendarLastAuthError(): string | null {
  return lastAuthError;
}

export function isGoogleIdentityServicesLoaded(): boolean {
  return Boolean(typeof window !== "undefined" && window.google?.accounts?.oauth2);
}

export function disconnectGoogleCalendar(): void {
  accessToken = null;
  accessTokenExpiresAt = 0;
  authStatus = "not_configured";
  lastAuthError = null;
  clearPendingTokenRequest();
}

export function resetGoogleCalendarAuthForTests(): void {
  tokenClient = null;
  currentConfig = null;
  accessToken = null;
  accessTokenExpiresAt = 0;
  authStatus = "not_configured";
  lastAuthError = null;
  clearPendingTokenRequest();
}

export function hasGoogleCalendarAccess(): boolean {
  normalizeGoogleCalendarAuthState();
  return Boolean(accessToken && Date.now() < accessTokenExpiresAt && authStatus === "connected");
}

function ensureBrowser(): void {
  if (typeof window === "undefined" || typeof document === "undefined") throw new Error("Google Calendar só pode ser conectado no navegador.");
}

export function loadGoogleIdentityScript(): Promise<void> {
  ensureBrowser();
  if (window.google?.accounts?.oauth2) {
    safeGoogleCalendarDevLog("GSI carregado", { gsiLoaded: true });
    return Promise.resolve();
  }
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_GSI_SCRIPT_URL}"]`);
  if (existing) return new Promise((resolve, reject) => {
    existing.addEventListener("load", () => {
      safeGoogleCalendarDevLog("GSI carregado", { gsiLoaded: true });
      resolve();
    }, { once: true });
    existing.addEventListener("error", () => reject(new Error("Não foi possível carregar o script oficial do Google Identity Services.")), { once: true });
  });
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GOOGLE_GSI_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      safeGoogleCalendarDevLog("GSI carregado", { gsiLoaded: true });
      resolve();
    };
    script.onerror = () => reject(new Error("Não foi possível carregar o script oficial do Google Identity Services."));
    document.head.appendChild(script);
  });
}

export async function initGoogleCalendarClient(config: GoogleCalendarConfig = {}): Promise<void> {
  const clientId = config.clientId || getGoogleCalendarClientId();
  currentConfig = { clientId, scope: config.scope || GOOGLE_CALENDAR_SCOPE };
  safeGoogleCalendarDevLog("Client ID presente", { clientIdPresent: Boolean(clientId) });
  if (!clientId) {
    authStatus = "not_configured";
    throw new Error("Configure VITE_GOOGLE_CLIENT_ID para conectar o Google Calendar.");
  }
  await loadGoogleIdentityScript();
  const initTokenClient = window.google?.accounts?.oauth2?.initTokenClient;
  if (!initTokenClient) throw new Error("Google Identity Services indisponível no navegador.");
  tokenClient = initTokenClient({
    client_id: clientId,
    scope: currentConfig.scope || GOOGLE_CALENDAR_SCOPE,
    callback: (response) => {
      if (response.error || response.error_description || !response.access_token) {
        const message = friendlyGoogleError(response) || "Autorização do Google Calendar não concluída.";
        safeGoogleCalendarDevLog("callback OAuth recebido", { callbackReceived: true });
        safeGoogleCalendarDevLog("erro OAuth recebido", { error: response.error || response.error_description || "access_token ausente" });
        markGoogleCalendarAuthError(message);
        clearPendingTokenRequest(new Error(message));
        return;
      }
      safeGoogleCalendarDevLog("callback OAuth recebido", { callbackReceived: true });
      const expiresIn = response.expires_in ?? 3600;
      accessToken = response.access_token;
      accessTokenExpiresAt = expiresIn <= 0 ? Date.now() : Date.now() + Math.max(0, expiresIn - 60) * 1000;
      authStatus = expiresIn <= 0 ? "token_expired" : "connected";
      lastAuthError = null;
      pendingTokenRequest?.resolve(response.access_token);
      clearPendingTokenRequest();
    },
    error_callback: (error) => {
      const message = friendlyGoogleError(error) || "Autorização do Google Calendar cancelada ou negada.";
      safeGoogleCalendarDevLog("erro OAuth recebido", { error: message });
      markGoogleCalendarAuthError(message);
      clearPendingTokenRequest(new Error(message));
    },
  });
}

export async function requestGoogleCalendarAccess(config: GoogleCalendarConfig = {}): Promise<string> {
  const requestedClientId = config.clientId || getGoogleCalendarClientId();
  const requestedScope = config.scope || GOOGLE_CALENDAR_SCOPE;
  if (!tokenClient || currentConfig?.clientId !== requestedClientId || currentConfig?.scope !== requestedScope) await initGoogleCalendarClient(config);
  if (!tokenClient) throw new Error("Cliente OAuth do Google Calendar não inicializado.");
  clearPendingTokenRequest(new Error("Uma nova tentativa de autorização do Google Calendar foi iniciada."));
  lastAuthError = null;
  if (!hasGoogleCalendarAccess()) authStatus = "not_connected";
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      markGoogleCalendarAuthError(GOOGLE_CALENDAR_AUTH_TIMEOUT_MESSAGE);
      clearPendingTokenRequest(new Error(GOOGLE_CALENDAR_AUTH_TIMEOUT_MESSAGE));
    }, GOOGLE_CALENDAR_AUTH_TIMEOUT_MS);
    pendingTokenRequest = { resolve, reject, timeoutId };
    safeGoogleCalendarDevLog("requestAccessToken chamado", { clientIdPresent: Boolean(requestedClientId), gsiLoaded: isGoogleIdentityServicesLoaded() });
    try {
      tokenClient?.requestAccessToken({ prompt: hasGoogleCalendarAccess() ? "" : "consent" });
    } catch (error) {
      const message = friendlyGoogleError(error) || "Não foi possível iniciar a autorização do Google Calendar.";
      markGoogleCalendarAuthError(message);
      clearPendingTokenRequest(new Error(message));
    }
  });
}

async function fetchGoogleCalendar(path: string, init: RequestInit): Promise<GoogleCalendarApiEvent> {
  if (!hasGoogleCalendarAccess()) throw new Error("Conecte o Google Calendar antes de sincronizar. O token não é armazenado permanentemente.");
  const response = await fetch(`${GOOGLE_CALENDAR_API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) },
  });
  if (response.status === 401) {
    markGoogleCalendarTokenExpired();
    throw new Error("Autorização expirada. Conecte novamente o Google Calendar.");
  }
  if (!response.ok) throw new Error(`Erro do Google Calendar (${response.status}).`);
  return response.json() as Promise<GoogleCalendarApiEvent>;
}

export async function createGoogleCalendarEvent(payload: GoogleCalendarEventPayload, calendarId = DEFAULT_GOOGLE_CALENDAR_ID): Promise<GoogleCalendarApiEvent> {
  return fetchGoogleCalendar(`/${encodeURIComponent(calendarId)}/events`, { method: "POST", body: JSON.stringify(payload) });
}

export async function updateGoogleCalendarEvent(eventId: string, payload: GoogleCalendarEventPayload, calendarId = DEFAULT_GOOGLE_CALENDAR_ID): Promise<GoogleCalendarApiEvent> {
  if (!eventId) throw new Error("Evento do Google Calendar não informado para atualização.");
  return fetchGoogleCalendar(`/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function deleteGoogleCalendarEvent(eventId: string, calendarId = DEFAULT_GOOGLE_CALENDAR_ID): Promise<void> {
  if (!eventId) throw new Error("Evento do Google Calendar não informado para remoção.");
  await fetchGoogleCalendar(`/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
}

function addMinutes(dateTime: string, minutes: number): string {
  const date = new Date(dateTime);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString().slice(0, 19);
}

function addOneDay(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function buildCalendarEventFromAgendaItem(item: GoogleCalendarAgendaItem): GoogleCalendarEventPayload {
  if (!item.data) throw new Error("Defina um agendamento antes de enviar ao Google Calendar.");
  const cliente = item.cliente || item.clienteNome || "Cliente não informado";
  const tipo = item.tipo || "Ação comercial";
  const fazenda = item.fazenda || item.localidade || "";
  const cidade = item.cidade || "";
  const vendedor = item.vendedor || item.responsavel || "Não definido";
  const objetivo = item.objetivo || item.descricao || "";
  const summary = `Safra Vision — ${tipo} — ${cliente}`;
  const description = [
    `Cliente: ${cliente}`,
    `Fazenda: ${fazenda || "—"}`,
    `Cidade: ${cidade || "—"}`,
    `Vendedor: ${vendedor}`,
    `Ação comercial: ${tipo}`,
    `Objetivo: ${objetivo || "—"}`,
    `Observações: ${item.observacoes || "—"}`,
    `Status no Safra Vision: ${item.status || "—"}`,
    `ID interno do item: ${item.id}`,
    "Evento criado pelo Safra Vision. Alterações comerciais devem ser feitas no app.",
  ].join("\n");
  const location = [fazenda, cidade].filter(Boolean).join(" — ");
  if (item.horario) {
    const dateTime = `${item.data}T${item.horario}:00`;
    return { summary, description, location, start: { dateTime }, end: { dateTime: addMinutes(dateTime, DEFAULT_EVENT_DURATION_MINUTES) } };
  }
  return { summary, description, location, start: { date: item.data }, end: { date: addOneDay(item.data) } };
}

export async function upsertGoogleCalendarEventForAgendaItem(item: GoogleCalendarAgendaItem & { googleCalendarEventId?: string; googleCalendarCalendarId?: string }): Promise<GoogleCalendarApiEvent & { operation: "created" | "updated" }> {
  const payload = buildCalendarEventFromAgendaItem(item);
  if (item.googleCalendarEventId) {
    const updated = await updateGoogleCalendarEvent(item.googleCalendarEventId, payload, item.googleCalendarCalendarId || DEFAULT_GOOGLE_CALENDAR_ID);
    return { ...updated, operation: "updated" };
  }
  const created = await createGoogleCalendarEvent(payload, item.googleCalendarCalendarId || DEFAULT_GOOGLE_CALENDAR_ID);
  return { ...created, operation: "created" };
}

export function metadataAfterGoogleCalendarSuccess(event: GoogleCalendarApiEvent, calendarId = DEFAULT_GOOGLE_CALENDAR_ID, now = new Date().toISOString()): GoogleCalendarSyncMetadata {
  return { googleCalendarEventId: event.id, googleCalendarHtmlLink: event.htmlLink, googleCalendarSyncedAt: now, googleCalendarStatus: "synced", googleCalendarLastError: undefined, googleCalendarCalendarId: calendarId, googleCalendarUpdatedAt: event.updated || now };
}

export function metadataAfterGoogleCalendarError(error: unknown): Pick<GoogleCalendarSyncMetadata, "googleCalendarStatus" | "googleCalendarLastError"> {
  return { googleCalendarStatus: "error", googleCalendarLastError: friendlyGoogleError(error) };
}

export function metadataAfterGoogleCalendarReschedule<T extends { googleCalendarEventId?: string; googleCalendarStatus?: GoogleCalendarStatus }>(item: T): Partial<T> {
  if (!item.googleCalendarEventId || item.googleCalendarStatus === "deleted") return {};
  return { googleCalendarStatus: "update_pending" } as Partial<T>;
}

export function metadataAfterGoogleCalendarDelete(now = new Date().toISOString()): GoogleCalendarSyncMetadata {
  return { googleCalendarEventId: undefined, googleCalendarHtmlLink: undefined, googleCalendarSyncedAt: undefined, googleCalendarStatus: "deleted", googleCalendarLastError: undefined, googleCalendarCalendarId: undefined, googleCalendarUpdatedAt: now };
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function buildAgendaItemIcs(item: GoogleCalendarAgendaItem): string {
  const event = buildCalendarEventFromAgendaItem(item);
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const start = event.start.dateTime ? event.start.dateTime.replace(/[-:]/g, "") : event.start.date?.replace(/-/g, "");
  const end = event.end.dateTime ? event.end.dateTime.replace(/[-:]/g, "") : event.end.date?.replace(/-/g, "");
  const dateKey = event.start.dateTime ? "DTSTART" : "DTSTART;VALUE=DATE";
  const endKey = event.end.dateTime ? "DTEND" : "DTEND;VALUE=DATE";
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Safra Vision//Agenda Comercial//PT-BR", "BEGIN:VEVENT", `UID:${item.id}@safra-vision`, `DTSTAMP:${now}`, `${dateKey}:${start}`, `${endKey}:${end}`, `SUMMARY:${escapeIcs(event.summary)}`, `DESCRIPTION:${escapeIcs(event.description)}`, `LOCATION:${escapeIcs(event.location || "")}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}

export function toGoogleCalendarAgendaItem(acao: ProximaAcao, cliente?: Cliente): GoogleCalendarAgendaItem & ProximaAcao {
  return { ...acao, cliente: cliente?.nome, fazenda: cliente?.localidade || cliente?.rota, cidade: cliente?.cidade, vendedor: acao.responsavel };
}

export function getGoogleCalendarAgendaActionState(item: { data?: string; googleCalendarEventId?: string; googleCalendarHtmlLink?: string; googleCalendarStatus?: GoogleCalendarStatus; googleCalendarLastError?: string }) {
  const status = item.googleCalendarStatus || (item.googleCalendarEventId ? "synced" : "not_synced");
  const disabled = !item.data;
  return {
    status,
    disabled,
    primaryLabel: status === "error" ? "Tentar novamente" : item.googleCalendarEventId ? "Atualizar no Google Calendar" : "Enviar para Google Calendar",
    showOpenLink: Boolean(item.googleCalendarHtmlLink && item.googleCalendarEventId),
    helperText: disabled ? "Defina um agendamento antes de enviar ao Google Calendar." : item.googleCalendarLastError || "",
  };
}
