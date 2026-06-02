import type { Cliente, ProximaAcao } from "@/types";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const GOOGLE_GSI_SCRIPT_URL = "https://accounts.google.com/gsi/client";
export const GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3/calendars";
export const DEFAULT_GOOGLE_CALENDAR_ID = "primary";
export const DEFAULT_EVENT_DURATION_MINUTES = 60;
export const DEFAULT_GOOGLE_CALENDAR_TIME_ZONE = "America/Sao_Paulo";

export type GoogleCalendarStatus = "not_synced" | "synced" | "update_pending" | "error" | "deleted";
export type GoogleCalendarAuthStatus = "not_configured" | "not_connected" | "connected" | "token_expired" | "auth_error";

export interface GoogleCalendarConfig {
  clientId?: string;
  scope?: string;
}

export interface GoogleCalendarAccessOptions extends GoogleCalendarConfig {
  prompt?: "consent" | "";
}

export interface EnsureGoogleCalendarAccessOptions extends GoogleCalendarConfig {
  interactive?: boolean;
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

export interface GoogleCalendarReminderOverride {
  method: "popup" | "email";
  minutes: number;
}

export interface GoogleCalendarEventPayload {
  summary: string;
  description: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  reminders?: {
    useDefault: boolean;
    overrides?: GoogleCalendarReminderOverride[];
  };
}

export interface GoogleCalendarApiEvent {
  id: string;
  htmlLink?: string;
  updated?: string;
}

export interface GoogleCalendarBackendStatus {
  connected: boolean;
  googleAccountEmail?: string;
  connectedAt?: string;
  updatedAt?: string;
  revokedAt?: string;
  error?: string;
}

export interface GoogleCalendarBackendUpsertResponse {
  eventId: string;
  htmlLink?: string;
  updated?: string;
  calendarId: string;
  operation: "created" | "updated";
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

export const GOOGLE_CALENDAR_ENABLED_STORAGE_KEY = "safraVision.googleCalendar.enabled";
export const GOOGLE_CALENDAR_OFFLINE_PENDING_MESSAGE = "Sincronização pendente: dispositivo offline.";
export const GOOGLE_CALENDAR_OFFLINE_SYNC_TOAST = "Ação salva offline. O envio ao Google Calendar ficará pendente até reconectar.";
export const GOOGLE_CALENDAR_OFFLINE_MANUAL_SYNC_MESSAGE = "Você está offline. Reconecte para enviar ao Google Calendar.";

const GOOGLE_CALENDAR_AUTH_TIMEOUT_MS = 120_000;
const GOOGLE_CALENDAR_AUTH_TIMEOUT_MESSAGE = "Autorização não concluída. Verifique se você rolou até o final da tela do Google e tocou em Continuar/Permitir.";
const GOOGLE_CALENDAR_RECONNECT_MESSAGE = "Precisa renovar autorização do Google Calendar. Acesse Configurações e conecte novamente neste dispositivo.";

export function isGoogleCalendarOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function assertGoogleCalendarOnline(): void {
  if (isGoogleCalendarOffline()) throw new Error(GOOGLE_CALENDAR_OFFLINE_PENDING_MESSAGE);
}

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
  return isGoogleCalendarPreferenceEnabled() ? "token_expired" : "not_connected";
}

export function isGoogleCalendarPreferenceEnabled(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage?.getItem(GOOGLE_CALENDAR_ENABLED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setGoogleCalendarPreferenceEnabled(enabled: boolean): void {
  try {
    if (typeof window === "undefined") return;
    if (enabled) window.localStorage?.setItem(GOOGLE_CALENDAR_ENABLED_STORAGE_KEY, "true");
    else window.localStorage?.removeItem(GOOGLE_CALENDAR_ENABLED_STORAGE_KEY);
  } catch {
    // A preferência operacional não é crítica e nunca contém dados sensíveis.
  }
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
  authStatus = getGoogleCalendarClientId() || currentConfig?.clientId ? "not_connected" : "not_configured";
  lastAuthError = null;
  setGoogleCalendarPreferenceEnabled(false);
  clearPendingTokenRequest();
}

export function resetGoogleCalendarAuthForTests(): void {
  tokenClient = null;
  currentConfig = null;
  accessToken = null;
  accessTokenExpiresAt = 0;
  authStatus = "not_configured";
  lastAuthError = null;
  setGoogleCalendarPreferenceEnabled(false);
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
  assertGoogleCalendarOnline();
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

export async function requestGoogleCalendarAccess(config: GoogleCalendarAccessOptions = {}): Promise<string> {
  assertGoogleCalendarOnline();
  const requestedClientId = config.clientId || getGoogleCalendarClientId();
  const requestedScope = config.scope || GOOGLE_CALENDAR_SCOPE;
  const requestedPrompt = config.prompt ?? (hasGoogleCalendarAccess() ? "" : "consent");
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
    safeGoogleCalendarDevLog("requestAccessToken chamado", { clientIdPresent: Boolean(requestedClientId), gsiLoaded: isGoogleIdentityServicesLoaded(), promptMode: requestedPrompt ? "consent" : "reuse" });
    try {
      tokenClient?.requestAccessToken({ prompt: requestedPrompt });
    } catch (error) {
      const message = friendlyGoogleError(error) || "Não foi possível iniciar a autorização do Google Calendar.";
      markGoogleCalendarAuthError(message);
      clearPendingTokenRequest(new Error(message));
    }
  });
}

export async function ensureGoogleCalendarAccess(options: EnsureGoogleCalendarAccessOptions = {}): Promise<string> {
  assertGoogleCalendarOnline();
  if (hasGoogleCalendarAccess() && accessToken) return accessToken;
  const shouldAskConsent = options.interactive ?? !isGoogleCalendarPreferenceEnabled();
  try {
    return await requestGoogleCalendarAccess({ ...options, prompt: shouldAskConsent ? "consent" : "" });
  } catch (error) {
    const message = shouldAskConsent ? friendlyGoogleError(error) : GOOGLE_CALENDAR_RECONNECT_MESSAGE;
    markGoogleCalendarAuthError(message);
    throw new Error(message);
  }
}

async function fetchGoogleCalendar(path: string, init: RequestInit): Promise<GoogleCalendarApiEvent> {
  assertGoogleCalendarOnline();
  if (!hasGoogleCalendarAccess()) throw new Error("Conecte o Google Calendar antes de sincronizar. O token não é armazenado permanentemente.");
  const response = await fetch(`${GOOGLE_CALENDAR_API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) },
  });
  if (response.status === 401) {
    markGoogleCalendarTokenExpired();
    throw new Error("Autorização expirada. Conecte novamente o Google Calendar.");
  }
  if (!response.ok) throw new Error(await readGoogleCalendarErrorMessage(response));
  return response.json() as Promise<GoogleCalendarApiEvent>;
}

async function readGoogleCalendarErrorMessage(response: Response): Promise<string> {
  const fallback = `Erro do Google Calendar (${response.status}).`;
  if (typeof response.text !== "function") return fallback;

  const body = await response.text();
  if (!body) return fallback;

  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; status?: string; code?: number; errors?: Array<{ message?: string; reason?: string }> } | string; message?: string };
    if (typeof parsed.error === "string") return `${fallback} ${parsed.error}`;
    const googleMessage = parsed.error?.message || parsed.message;
    const firstError = parsed.error?.errors?.find((entry) => entry.message || entry.reason);
    const detail = googleMessage || firstError?.message || firstError?.reason || parsed.error?.status;
    return detail ? `${fallback} ${detail}` : fallback;
  } catch {
    return `${fallback} ${body}`;
  }
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


export function isGoogleCalendarBackendAvailable(): boolean {
  return Boolean(isSupabaseConfigured && supabase);
}

async function invokeGoogleCalendarBackend<T>(functionName: string, body?: unknown): Promise<T> {
  assertGoogleCalendarOnline();
  if (!supabase || !isSupabaseConfigured) throw new Error("Supabase não configurado para Google Calendar persistente.");
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  const accessTokenSupabase = sessionData.session?.access_token;
  if (!accessTokenSupabase) throw new Error("Faça login no Safra Vision para usar Google Calendar persistente.");
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: { Authorization: `Bearer ${accessTokenSupabase}` },
  });
  if (error) throw new Error(error.message);
  const payload = data as (T & { error?: string }) | null;
  if (payload?.error) throw new Error(payload.error);
  if (!payload) throw new Error("Resposta vazia do backend Google Calendar.");
  return payload as T;
}

export async function startGoogleCalendarBackendOAuth(): Promise<string> {
  const response = await invokeGoogleCalendarBackend<{ authUrl: string }>("google-calendar-oauth-start", {});
  if (!response.authUrl) throw new Error("Backend não retornou URL de autorização do Google Calendar.");
  return response.authUrl;
}

export async function getGoogleCalendarBackendStatus(): Promise<GoogleCalendarBackendStatus> {
  if (!isGoogleCalendarBackendAvailable()) return { connected: false, error: "Supabase não configurado." };
  return invokeGoogleCalendarBackend<GoogleCalendarBackendStatus>("google-calendar-status", {})
    .catch((error) => ({ connected: false, error: friendlyGoogleError(error) }));
}

export async function disconnectGoogleCalendarBackend(): Promise<void> {
  await invokeGoogleCalendarBackend<{ disconnected: boolean; revokedAt?: string }>("google-calendar-disconnect", {});
}

function formatLocalDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

export function addMinutesToLocalDateTime(dateIso: string, time: string, minutes: number): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const [hours = 0, minute = 0] = time.split(":").map(Number);
  const date = new Date(year, month - 1, day, hours, minute, 0);
  date.setMinutes(date.getMinutes() + minutes);
  return formatLocalDateTime(date);
}

function addOneDay(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function buildGoogleCalendarSummary(item: GoogleCalendarAgendaItem): string {
  const cliente = item.cliente?.trim() || item.clienteNome?.trim() || "Cliente não informado";
  const tipo = item.tipo?.trim() || "Ação comercial";
  return `${cliente} - ${tipo}`;
}

function buildLocalDateTime(dateIso: string, time?: string): Date {
  const normalizedTime = time?.trim() || "00:00";
  return new Date(`${dateIso}T${normalizedTime}:00`);
}

export function minutesBeforePreviousDayAt0930(startDate: string, startTime?: string): number {
  const eventStart = buildLocalDateTime(startDate, startTime);
  const previousDayAt0930 = buildLocalDateTime(startDate, "09:30");
  previousDayAt0930.setDate(previousDayAt0930.getDate() - 1);
  return Math.round((eventStart.getTime() - previousDayAt0930.getTime()) / 60_000);
}

export function buildGoogleCalendarReminders(item: GoogleCalendarAgendaItem): GoogleCalendarEventPayload["reminders"] {
  if (!item.data) return undefined;
  const horario = item.horario?.trim();
  const overrides: GoogleCalendarReminderOverride[] = [
    { method: "popup", minutes: minutesBeforePreviousDayAt0930(item.data, horario) },
  ];
  if (horario) overrides.push({ method: "popup", minutes: 30 });
  return { useDefault: false, overrides };
}

export function hasScheduledFutureDate(item: GoogleCalendarAgendaItem, now = new Date()): boolean {
  if (!item.data) return false;
  return buildLocalDateTime(item.data, item.horario?.trim()).getTime() > now.getTime();
}

export function buildCalendarEventFromAgendaItem(item: GoogleCalendarAgendaItem): GoogleCalendarEventPayload {
  if (!item.data) throw new Error("Defina um agendamento antes de enviar ao Google Calendar.");
  const cliente = item.cliente?.trim() || item.clienteNome?.trim() || "Cliente não informado";
  const tipo = item.tipo?.trim() || "Ação comercial";
  const fazenda = item.fazenda?.trim() || item.localidade?.trim() || "";
  const cidade = item.cidade?.trim() || "";
  const vendedor = item.vendedor?.trim() || item.responsavel?.trim() || "Não definido";
  const objetivo = item.objetivo?.trim() || item.descricao?.trim() || "";
  const summary = buildGoogleCalendarSummary(item);
  const reminders = buildGoogleCalendarReminders(item);
  const description = [
    `Cliente: ${cliente}`,
    `Fazenda: ${fazenda || "—"}`,
    `Cidade: ${cidade || "—"}`,
    `Vendedor: ${vendedor}`,
    `Ação comercial: ${tipo}`,
    `Objetivo: ${objetivo || "—"}`,
    `Observações: ${item.observacoes?.trim() || "—"}`,
    `Status no Safra Vision: ${item.status?.trim() || "—"}`,
    `ID interno do item: ${item.id}`,
    "Evento criado pelo Safra Vision. Alterações comerciais devem ser feitas no app.",
  ].join("\n");
  const location = [fazenda, cidade].filter(Boolean).join(" — ");
  const horario = item.horario?.trim();
  if (horario) {
    const dateTime = `${item.data}T${horario}:00`;
    const endDateTime = addMinutesToLocalDateTime(item.data, horario, DEFAULT_EVENT_DURATION_MINUTES);
    return {
      summary,
      description,
      location,
      start: { dateTime, timeZone: DEFAULT_GOOGLE_CALENDAR_TIME_ZONE },
      end: { dateTime: endDateTime, timeZone: DEFAULT_GOOGLE_CALENDAR_TIME_ZONE },
      reminders,
    };
  }
  return { summary, description, location, start: { date: item.data }, end: { date: addOneDay(item.data) }, reminders };
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


export async function upsertGoogleCalendarEventViaBackend(item: GoogleCalendarAgendaItem & { googleCalendarEventId?: string; googleCalendarCalendarId?: string }): Promise<GoogleCalendarApiEvent & { calendarId: string; operation: "created" | "updated" }> {
  const event = buildCalendarEventFromAgendaItem(item);
  const calendarId = item.googleCalendarCalendarId || DEFAULT_GOOGLE_CALENDAR_ID;
  const response = await invokeGoogleCalendarBackend<GoogleCalendarBackendUpsertResponse>("google-calendar-upsert-event", {
    calendarId,
    eventId: item.googleCalendarEventId || undefined,
    event,
  });
  return {
    id: response.eventId,
    htmlLink: response.htmlLink,
    updated: response.updated,
    calendarId: response.calendarId || calendarId,
    operation: response.operation,
  };
}


export function isGoogleCalendarSyncPending(item: {
  googleCalendarSyncStatus?: string;
  googleCalendarStatus?: GoogleCalendarStatus;
  googleCalendarLastError?: string;
}): boolean {
  return item.googleCalendarSyncStatus === "pending"
    || item.googleCalendarStatus === "update_pending"
    || item.googleCalendarLastError === GOOGLE_CALENDAR_OFFLINE_PENDING_MESSAGE;
}

export function isGoogleCalendarPendingActionEligible(item: {
  data?: string;
  status?: string;
  googleCalendarSyncStatus?: string;
  googleCalendarStatus?: GoogleCalendarStatus;
  googleCalendarLastError?: string;
}): boolean {
  if (!isGoogleCalendarSyncPending(item)) return false;
  if (!item.data?.trim()) return false;
  if (item.status === "Cancelada") return false;
  if (item.googleCalendarStatus === "deleted") return false;
  if (item.googleCalendarSyncStatus === "synced" && item.googleCalendarStatus !== "update_pending") return false;
  return true;
}

export function metadataAfterGoogleCalendarSuccess(event: GoogleCalendarApiEvent, calendarId = DEFAULT_GOOGLE_CALENDAR_ID, now = new Date().toISOString()): GoogleCalendarSyncMetadata {
  return { googleCalendarEventId: event.id, googleCalendarHtmlLink: event.htmlLink, googleCalendarSyncedAt: now, googleCalendarStatus: "synced", googleCalendarLastError: undefined, googleCalendarCalendarId: calendarId, googleCalendarUpdatedAt: event.updated || now };
}

export function metadataAfterGoogleCalendarError(error: unknown): Pick<GoogleCalendarSyncMetadata, "googleCalendarStatus" | "googleCalendarLastError"> {
  return { googleCalendarStatus: "error", googleCalendarLastError: friendlyGoogleError(error) };
}

export function metadataAfterGoogleCalendarOfflinePending(item: { googleCalendarEventId?: string } = {}): Pick<GoogleCalendarSyncMetadata, "googleCalendarStatus" | "googleCalendarLastError"> {
  return {
    googleCalendarStatus: item.googleCalendarEventId ? "update_pending" : "not_synced",
    googleCalendarLastError: GOOGLE_CALENDAR_OFFLINE_PENDING_MESSAGE,
  };
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
