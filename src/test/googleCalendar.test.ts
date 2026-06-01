import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAgendaItemIcs,
  buildCalendarEventFromAgendaItem,
  createGoogleCalendarEvent,
  disconnectGoogleCalendar,
  resetGoogleCalendarAuthForTests,
  getGoogleCalendarAgendaActionState,
  getGoogleCalendarAuthStatus,
  hasGoogleCalendarAccess,
  metadataAfterGoogleCalendarDelete,
  metadataAfterGoogleCalendarError,
  metadataAfterGoogleCalendarReschedule,
  metadataAfterGoogleCalendarSuccess,
  requestGoogleCalendarAccess,
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

beforeEach(() => {
  resetGoogleCalendarAuthForTests();
  disconnectGoogleCalendar();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("payload do Google Calendar", () => {
  it("cria título e descrição com dados comerciais", () => {
    const payload = buildCalendarEventFromAgendaItem(item);
    expect(payload.summary).toBe("Safra Vision — Visita — Luiz Reinaldo Bredow");
    expect(payload.description).toContain("Cliente: Luiz Reinaldo Bredow");
    expect(payload.description).toContain("Fazenda: Fazenda Boa Vista");
    expect(payload.description).toContain("Vendedor: BRUNO");
    expect(payload.description).toContain("Objetivo: Planejar safra");
    expect(payload.description).toContain("Evento criado pelo Safra Vision");
    expect(payload.location).toBe("Fazenda Boa Vista — Bagé");
  });

  it("cria horário com dateTime e duração padrão quando há hora", () => {
    const payload = buildCalendarEventFromAgendaItem(item);
    expect(payload.start).toEqual({ dateTime: "2026-06-10T09:30:00" });
    expect(payload.end).toEqual({ dateTime: "2026-06-10T10:30:00" });
  });

  it("bloqueia envio quando não há data", () => {
    expect(() => buildCalendarEventFromAgendaItem({ ...item, data: "" })).toThrow("Defina um agendamento antes de enviar ao Google Calendar.");
  });

  it("trata data sem hora como evento de dia inteiro", () => {
    const payload = buildCalendarEventFromAgendaItem({ ...item, horario: "" });
    expect(payload.start).toEqual({ date: "2026-06-10" });
    expect(payload.end).toEqual({ date: "2026-06-11" });
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
  });

  it("item com googleCalendarEventId atualiza evento e não cria duplicado", async () => {
    await authorizeGoogleCalendar();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "evt1" }) });
    vi.stubGlobal("fetch", fetchMock);
    const result = await upsertGoogleCalendarEventForAgendaItem({ ...item, googleCalendarEventId: "evt1" });
    expect(result.operation).toBe("updated");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/primary/events/evt1"), expect.objectContaining({ method: "PUT" }));
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
});

describe("token e autorização", () => {
  it("sem token bloqueia chamada à API", async () => {
    await expect(createGoogleCalendarEvent(buildCalendarEventFromAgendaItem(item))).rejects.toThrow("Conecte o Google Calendar antes de sincronizar");
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
    expect(ics).toContain("SUMMARY:Safra Vision — Visita — Luiz Reinaldo Bredow");
  });
});

async function authorizeGoogleCalendar(expiresIn = 3600) {
  mockGoogleIdentity({ access_token: "token", expires_in: expiresIn });
  await requestGoogleCalendarAccess({ clientId: "client-id" });
}

function mockGoogleIdentity(response: { access_token?: string; expires_in?: number; error?: string; error_description?: string }) {
  const requestAccessToken = vi.fn(() => tokenCallback(response));
  let tokenCallback: (response: typeof response) => void = () => undefined;
  vi.stubGlobal("window", {
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
  });
  vi.stubGlobal("document", {
    querySelector: vi.fn(() => null),
    createElement: vi.fn(() => ({ set src(_value: string) {}, async: true, defer: true, onload: null as null | (() => void), onerror: null as null | (() => void) })),
    head: { appendChild: vi.fn((script: { onload?: () => void }) => script.onload?.()) },
  });
}
