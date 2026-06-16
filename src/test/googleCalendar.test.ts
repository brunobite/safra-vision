import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_CALENDAR_OFFLINE_PENDING_MESSAGE,
  buildAgendaItemIcs,
  buildCalendarEventFromAgendaItem,
  buildGoogleCalendarReminders,
  buildGoogleCalendarSummary,
  createGoogleCalendarEvent,
  disconnectGoogleCalendar,
  ensureGoogleCalendarAccess,
  resetGoogleCalendarAuthForTests,
  getGoogleCalendarAgendaActionState,
  getGoogleCalendarAuthStatus,
  hasGoogleCalendarAccess,
  isGoogleCalendarOffline,
  isGoogleCalendarPendingActionEligible,
  isGoogleCalendarSyncPending,
  isGoogleCalendarPreferenceEnabled,
  metadataAfterGoogleCalendarDelete,
  metadataAfterGoogleCalendarError,
  metadataAfterGoogleCalendarOfflinePending,
  metadataAfterGoogleCalendarReschedule,
  metadataAfterGoogleCalendarSuccess,
  requestGoogleCalendarAccess,
  setGoogleCalendarPreferenceEnabled,
  upsertGoogleCalendarEventForAgendaItem,
} from "@/lib/googleCalendar";

const item = {
  id: "pa1",
  cliente: "Luiz Reinaldo Bredow",
  fazenda: "Fazenda Boa Vista",
  cidade: "Bagé",
  vendedor: "BRUNO",
  tipo: "Visita",
  descricao: "Negociar nutrição",
  objetivo: "Planejar safra",
  observacoes: "Levar amostras",
  status: "Pendente",
  data: "2026-06-10",
  horario: "09:30",
};

function createTestLocalStorage() {
  const storage = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn((key: string) => { storage.delete(key); }),
    clear: vi.fn(() => { storage.clear(); }),
  };
}

function buildTestWindow(overrides: Record<string, unknown> = {}) {
  return {
    ...globalThis.window,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    localStorage: createTestLocalStorage(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.stubGlobal("window", buildTestWindow());
  vi.stubGlobal("navigator", { onLine: true });
  resetGoogleCalendarAuthForTests();
  disconnectGoogleCalendar();
});

describe("payload do Google Calendar", () => {
  it("cria título e descrição com dados comerciais", () => {
    const payload = buildCalendarEventFromAgendaItem(item);
    expect(payload.summary).toBe("Luiz Reinaldo Bredow - Visita");
    expect(payload.description).toContain("Cliente: Luiz Reinaldo Bredow");
    expect(payload.description).toContain("Fazenda: Fazenda Boa Vista");
    expect(payload.description).toContain("Vendedor: BRUNO");
    expect(payload.description).toContain("Objetivo: Planejar safra");
    expect(payload.description).toContain("Evento criado pelo Safra Vision");
    expect(payload.location).toBe("Fazenda Boa Vista — Bagé");
  });

  it("cria horário com dateTime, timeZone e duração padrão quando há hora", () => {
    const payload = buildCalendarEventFromAgendaItem({ ...item, data: "2026-06-19", horario: "08:00" });
    expect(payload.start).toEqual({ dateTime: "2026-06-19T08:00:00", timeZone: "America/Sao_Paulo" });
    expect(payload.end).toEqual({ dateTime: "2026-06-19T09:00:00", timeZone: "America/Sao_Paulo" });
  });

  it("bloqueia envio quando não há data", () => {
    expect(() => buildCalendarEventFromAgendaItem({ ...item, data: "" })).toThrow("Defina um agendamento antes de enviar ao Google Calendar.");
  });

  it("trata data sem hora como evento de dia inteiro", () => {
    const payload = buildCalendarEventFromAgendaItem({ ...item, horario: "" });
    expect(payload.start).toEqual({ date: "2026-06-10" });
    expect(payload.end).toEqual({ date: "2026-06-11" });
  });

  it("gera summary limpo com cliente LAURI HEIDERICH e tipo Visita", () => {
    expect(buildGoogleCalendarSummary({ ...item, cliente: "LAURI HEIDERICH", tipo: "Visita" })).toBe("LAURI HEIDERICH - Visita");
  });

  it("usa Ação comercial no summary quando tipo está vazio", () => {
    expect(buildGoogleCalendarSummary({ ...item, cliente: "LAURI HEIDERICH", tipo: "" })).toBe("LAURI HEIDERICH - Ação comercial");
  });

  it("gera lembretes popup para 09:30 do dia anterior e 30 minutos antes quando há horário", () => {
    expect(buildGoogleCalendarReminders({ ...item, data: "2026-06-12", horario: "08:00" })).toEqual({
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 1350 },
        { method: "popup", minutes: 30 },
      ],
    });
  });

  it("gera somente lembrete popup para 09:30 do dia anterior quando não há horário", () => {
    expect(buildGoogleCalendarReminders({ ...item, data: "2026-06-12", horario: "" })).toEqual({
      useDefault: false,
      overrides: [{ method: "popup", minutes: 870 }],
    });
  });

  it("inclui lembretes no payload do evento", () => {
    const payload = buildCalendarEventFromAgendaItem({ ...item, data: "2026-06-12", horario: "08:00" });
    expect(payload.reminders).toEqual({
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 1350 },
        { method: "popup", minutes: 30 },
      ],
    });
  });
});

describe("duplicidade e vínculo", () => {
  it("item sem googleCalendarEventId cria evento", async () => {
    await authorizeGoogleCalendar();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "evt1", htmlLink: "https://calendar.google.com/event?eid=1" }) });
    vi.stubGlobal("fetch", fetchMock);
    const result = await upsertGoogleCalendarEventForAgendaItem(item);
    expect(result.operation).toBe("created");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/primary/events"), expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).reminders).toEqual({
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 1440 },
        { method: "popup", minutes: 30 },
      ],
    });
  });

  it("item com googleCalendarEventId atualiza evento e não cria duplicado", async () => {
    await authorizeGoogleCalendar();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "evt1" }) });
    vi.stubGlobal("fetch", fetchMock);
    const result = await upsertGoogleCalendarEventForAgendaItem({ ...item, googleCalendarEventId: "evt1" });
    expect(result.operation).toBe("updated");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/primary/events/evt1"), expect.objectContaining({ method: "PUT" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).reminders).toEqual({
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 1440 },
        { method: "popup", minutes: 30 },
      ],
    });
  });
});

describe("status de sincronização", () => {
  it("sucesso de criação marca synced", () => {
    expect(metadataAfterGoogleCalendarSuccess({ id: "evt1", htmlLink: "https://calendar.google.com", updated: "2026-06-01T10:00:00.000Z" }, "primary", "2026-06-01T10:00:00.000Z")).toMatchObject({ googleCalendarStatus: "synced", googleCalendarEventId: "evt1" });
  });

  it("erro marca error com mensagem amigável", () => {
    expect(metadataAfterGoogleCalendarError(new Error("Falha"))).toEqual({ googleCalendarStatus: "error", googleCalendarLastError: "Falha" });
  });

  it("reagendamento de item vinculado marca update_pending", () => {
    expect(metadataAfterGoogleCalendarReschedule({ googleCalendarEventId: "evt1", googleCalendarStatus: "synced" })).toEqual({ googleCalendarStatus: "update_pending" });
  });

  it("remoção marca deleted e limpa vínculo", () => {
    expect(metadataAfterGoogleCalendarDelete("2026-06-01T10:00:00.000Z")).toMatchObject({ googleCalendarStatus: "deleted", googleCalendarEventId: undefined, googleCalendarHtmlLink: undefined });
  });

  it("offline marca pendência sem vínculo como not_synced", () => {
    expect(metadataAfterGoogleCalendarOfflinePending()).toEqual({ googleCalendarStatus: "not_synced", googleCalendarLastError: GOOGLE_CALENDAR_OFFLINE_PENDING_MESSAGE });
  });

  it("offline marca evento já vinculado como update_pending", () => {
    expect(metadataAfterGoogleCalendarOfflinePending({ googleCalendarEventId: "evt1" })).toEqual({ googleCalendarStatus: "update_pending", googleCalendarLastError: GOOGLE_CALENDAR_OFFLINE_PENDING_MESSAGE });
  });

  it("identifica pendências automáticas do Google Calendar", () => {
    expect(isGoogleCalendarSyncPending({ googleCalendarSyncStatus: "pending" })).toBe(true);
    expect(isGoogleCalendarSyncPending({ googleCalendarStatus: "update_pending" })).toBe(true);
    expect(isGoogleCalendarSyncPending({ googleCalendarLastError: GOOGLE_CALENDAR_OFFLINE_PENDING_MESSAGE })).toBe(true);
    expect(isGoogleCalendarSyncPending({ googleCalendarSyncStatus: "synced", googleCalendarStatus: "synced" })).toBe(false);
  });

  it("filtra pendências elegíveis sem data, canceladas ou com vínculo removido", () => {
    expect(isGoogleCalendarPendingActionEligible({ data: "2026-06-10", googleCalendarSyncStatus: "pending" })).toBe(true);
    expect(isGoogleCalendarPendingActionEligible({ data: "", googleCalendarSyncStatus: "pending" })).toBe(false);
    expect(isGoogleCalendarPendingActionEligible({ data: "2026-06-10", status: "Cancelada", googleCalendarSyncStatus: "pending" })).toBe(false);
    expect(isGoogleCalendarPendingActionEligible({ data: "2026-06-10", googleCalendarStatus: "deleted", googleCalendarSyncStatus: "pending" })).toBe(false);
    expect(isGoogleCalendarPendingActionEligible({ data: "2026-06-10", googleCalendarSyncStatus: "synced", googleCalendarStatus: "synced" })).toBe(false);
  });
});

describe("token e autorização", () => {
  it("offline bloqueia OAuth e API remota antes de chamar Google", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(isGoogleCalendarOffline()).toBe(true);
    await expect(ensureGoogleCalendarAccess({ clientId: "client-id" })).rejects.toThrow(GOOGLE_CALENDAR_OFFLINE_PENDING_MESSAGE);
    await expect(createGoogleCalendarEvent(buildCalendarEventFromAgendaItem(item))).rejects.toThrow(GOOGLE_CALENDAR_OFFLINE_PENDING_MESSAGE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem token bloqueia chamada à API", async () => {
    await expect(createGoogleCalendarEvent(buildCalendarEventFromAgendaItem(item))).rejects.toThrow("Conecte o Google Calendar antes de sincronizar");
  });

  it("retorna erro detalhado do Google Calendar", async () => {
    await authorizeGoogleCalendar();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { message: "Invalid time zone: America/Sao_Paulo", status: "INVALID_ARGUMENT" } }),
      }),
    );

    await expect(createGoogleCalendarEvent(buildCalendarEventFromAgendaItem(item))).rejects.toThrow("Invalid time zone: America/Sao_Paulo");
  });

  it("não imprime access token em logs", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    mockGoogleIdentity({ access_token: "secret-access-token", expires_in: 3600 });
    await requestGoogleCalendarAccess({ clientId: "client-id" });
    expect(JSON.stringify(debugSpy.mock.calls)).not.toContain("secret-access-token");
  });

  it("token expirado exige nova autorização", async () => {
    await authorizeGoogleCalendar(0);
    expect(hasGoogleCalendarAccess()).toBe(false);
    await expect(createGoogleCalendarEvent(buildCalendarEventFromAgendaItem(item))).rejects.toThrow("Conecte o Google Calendar antes de sincronizar");
    expect(getGoogleCalendarAuthStatus()).toBe("token_expired");
  });

  it("erro de autorização retorna mensagem amigável", async () => {
    mockGoogleIdentity({ error: "access_denied", error_description: "Usuário negou acesso." });
    await expect(requestGoogleCalendarAccess({ clientId: "client-id" })).rejects.toThrow("Usuário negou acesso.");
    expect(getGoogleCalendarAuthStatus()).toBe("auth_error");
  });

  it("persiste somente flag operacional de preferência", () => {
    setGoogleCalendarPreferenceEnabled(true);
    expect(isGoogleCalendarPreferenceEnabled()).toBe(true);
    expect(window.localStorage.getItem("safraVision.googleCalendar.enabled")).toBe("true");
    expect(window.localStorage.getItem("access_token")).toBeNull();

    disconnectGoogleCalendar();
    expect(isGoogleCalendarPreferenceEnabled()).toBe(false);
  });

  it("permite reuso sem prompt de consentimento quando já houve conexão", async () => {
    const requestAccessToken = mockGoogleIdentity({ access_token: "token", expires_in: 3600 });
    await requestGoogleCalendarAccess({ clientId: "client-id", prompt: "" });
    expect(requestAccessToken).toHaveBeenCalledWith({ prompt: "" });
  });

  it("ensureGoogleCalendarAccess não força consentimento no reuso e orienta reconexão", async () => {
    const requestAccessToken = mockGoogleIdentity({ error: "interaction_required", error_description: "Interaction required" });
    setGoogleCalendarPreferenceEnabled(true);
    await expect(ensureGoogleCalendarAccess({ clientId: "client-id", interactive: false })).rejects.toThrow("Precisa renovar autorização do Google Calendar");
    expect(requestAccessToken).toHaveBeenCalledWith({ prompt: "" });
  });
});

describe("UI da agenda e fallback", () => {
  it("botão aparece quando item tem agendamento", () => {
    expect(getGoogleCalendarAgendaActionState({ data: "2026-06-10" })).toMatchObject({ disabled: false, primaryLabel: "Enviar para Google Calendar" });
  });

  it("botão desabilita quando item não tem data", () => {
    expect(getGoogleCalendarAgendaActionState({ data: "" })).toMatchObject({ disabled: true, helperText: "Defina um agendamento antes de enviar ao Google Calendar." });
  });

  it("item sincronizado mostra link Abrir no Google Calendar", () => {
    expect(getGoogleCalendarAgendaActionState({ data: "2026-06-10", googleCalendarEventId: "evt1", googleCalendarHtmlLink: "https://calendar.google.com" })).toMatchObject({ primaryLabel: "Atualizar no Google Calendar", showOpenLink: true });
  });

  it("item com erro mostra Tentar novamente", () => {
    expect(getGoogleCalendarAgendaActionState({ data: "2026-06-10", googleCalendarStatus: "error", googleCalendarLastError: "Falha" })).toMatchObject({ primaryLabel: "Tentar novamente", helperText: "Falha" });
  });

  it("gera ICS para ambiente sem OAuth configurado", () => {
    const ics = buildAgendaItemIcs(item);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Luiz Reinaldo Bredow - Visita");
  });
});

async function authorizeGoogleCalendar(expiresIn = 3600) {
  mockGoogleIdentity({ access_token: "token", expires_in: expiresIn });
  await requestGoogleCalendarAccess({ clientId: "client-id" });
}

function mockGoogleIdentity(response: { access_token?: string; expires_in?: number; error?: string; error_description?: string }) {
  const requestAccessToken = vi.fn(() => tokenCallback(response));
  let tokenCallback: (response: typeof response) => void = () => undefined;
  vi.stubGlobal("window", buildTestWindow({
    google: {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn((config) => {
            tokenCallback = config.callback;
            return { requestAccessToken };
          }),
        },
      },
    },
  }));
  vi.stubGlobal("document", {
    querySelector: vi.fn(() => null),
    createElement: vi.fn(() => ({ set src(_value: string) {}, async: true, defer: true, onload: null as null | (() => void), onerror: null as null | (() => void) })),
    head: { appendChild: vi.fn((script: { onload?: () => void }) => script.onload?.()) },
  });
  return requestAccessToken;
}
