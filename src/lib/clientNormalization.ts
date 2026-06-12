import type { Cliente, TicketMedioRegra } from "@/types";

export type ClienteLike = Omit<Partial<Cliente>, "areaHa" | "potencialTotal" | "potencialCalculado"> & { areaHa?: unknown; potencialTotal?: unknown; potencialCalculado?: unknown } & Record<string, unknown>;

export type ClientDataAudit = {
  total: number;
  potencialCalculadoBoolean: number;
  semVendedor: number;
  semNome: number;
  semCidade: number;
  semLocalidade: number;
  semCulturas: number;
  espacosExtras: number;
  areaHaInvalida: number;
  potencialTotalInvalido: number;
  criticalErrors: number;
  warnings: number;
  canPublishOfficial: boolean;
  blockers: string[];
};

const TEXT_FIELDS: Array<keyof Cliente> = ["nome", "cidade", "localidade", "vendedor", "statusAtual", "abc", "prioridade", "rota", "culturas"];
const EXTRA_SPACES_PATTERN = /^\s|\s$|\s{2,}/;

export function parseClienteNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean" || value == null || value === "") return undefined;
  const text = String(value).trim().replace(/\s/g, "");
  if (!text) return undefined;
  const hasComma = text.includes(",");
  const hasDot = text.includes(".");
  let raw = text;
  if (hasComma && hasDot) {
    raw = text.lastIndexOf(",") > text.lastIndexOf(".") ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (hasComma) {
    raw = text.replace(",", ".");
  } else if (hasDot) {
    const parts = text.split(".");
    if (parts.length > 2) raw = text.replace(/\./g, "");
    else {
      const [integerPart, decimalPart] = parts;
      const integerDigits = integerPart.replace("-", "");
      raw = !text.startsWith("-") && decimalPart.length === 3 && integerDigits.length >= 1 && integerDigits.length <= 3 ? text.replace(".", "") : text;
    }
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeTextValue(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function hasText(value: unknown) {
  return normalizeTextValue(value) !== "";
}

function hasExtraSpaces(value: unknown) {
  return typeof value === "string" && EXTRA_SPACES_PATTERN.test(value);
}

export function normalizeClienteForPersistence<T extends ClienteLike>(cliente: T, ticketsMedios: TicketMedioRegra[] = []): T & ClienteLike {
  const normalized: ClienteLike = { ...cliente };

  TEXT_FIELDS.forEach((field) => {
    if (field in normalized || normalized[field] != null) normalized[field] = normalizeTextValue(normalized[field]);
  });

  if (!hasText(normalized.localidade) && hasText(normalized.cidade)) normalized.localidade = normalized.cidade;

  const areaHa = parseClienteNumber(normalized.areaHa);
  normalized.areaHa = areaHa ?? 0;

  const potencialTotal = parseClienteNumber(normalized.potencialTotal);
  normalized.potencialTotal = potencialTotal ?? 0;

  const potencialCalculadoAtual = normalized.potencialCalculado;
  if (typeof potencialCalculadoAtual === "boolean") {
    normalized.potencialCalculado = normalized.potencialTotal;
  } else if (potencialCalculadoAtual !== undefined) {
    const potencialCalculado = parseClienteNumber(potencialCalculadoAtual);
    normalized.potencialCalculado = potencialCalculado ?? normalized.potencialTotal;
  }

  return normalized as T & ClienteLike;
}

export function normalizeClientesForPersistence<T extends ClienteLike>(clientes: T[] = [], ticketsMedios: TicketMedioRegra[] = []) {
  return clientes.map((cliente) => normalizeClienteForPersistence(cliente, ticketsMedios));
}

export function auditClientesForPersistence(clientes: ClienteLike[] = []): ClientDataAudit {
  const audit: ClientDataAudit = {
    total: clientes.length,
    potencialCalculadoBoolean: 0,
    semVendedor: 0,
    semNome: 0,
    semCidade: 0,
    semLocalidade: 0,
    semCulturas: 0,
    espacosExtras: 0,
    areaHaInvalida: 0,
    potencialTotalInvalido: 0,
    criticalErrors: 0,
    warnings: 0,
    canPublishOfficial: true,
    blockers: [],
  };

  clientes.forEach((cliente) => {
    if (typeof cliente.potencialCalculado === "boolean") audit.potencialCalculadoBoolean += 1;
    if (!hasText(cliente.vendedor)) audit.semVendedor += 1;
    if (!hasText(cliente.nome)) audit.semNome += 1;
    if (!hasText(cliente.cidade)) audit.semCidade += 1;
    if (!hasText(cliente.localidade)) audit.semLocalidade += 1;
    if (!hasText(cliente.culturas)) audit.semCulturas += 1;
    if ([cliente.nome, cliente.cidade, cliente.vendedor].some(hasExtraSpaces)) audit.espacosExtras += 1;
    if (parseClienteNumber(cliente.areaHa) === undefined) audit.areaHaInvalida += 1;
    if (parseClienteNumber(cliente.potencialTotal) === undefined) audit.potencialTotalInvalido += 1;
  });

  const criticalEntries: Array<[number, string]> = [
    [audit.potencialCalculadoBoolean, "cliente(s) com potencialCalculado boolean"],
    [audit.semNome, "cliente(s) sem nome"],
    [audit.semCidade, "cliente(s) sem cidade"],
    [audit.areaHaInvalida, "cliente(s) com areaHa inválida"],
    [audit.potencialTotalInvalido, "cliente(s) com potencialTotal inválido"],
  ];

  audit.blockers = criticalEntries.filter(([count]) => count > 0).map(([count, label]) => `${count} ${label}`);
  audit.criticalErrors = criticalEntries.reduce((sum, [count]) => sum + count, 0);
  audit.warnings = audit.semVendedor + audit.semLocalidade + audit.semCulturas + audit.espacosExtras;
  audit.canPublishOfficial = audit.criticalErrors === 0;

  return audit;
}
