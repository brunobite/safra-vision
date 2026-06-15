export type NormalizedAccessStatus = "pending" | "active" | "blocked" | "inactive";

export function normalizeAccessStatus(status: string | null | undefined): NormalizedAccessStatus | null {
  if (status == null) return null;
  const normalized = String(status).normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "ativo" || normalized === "active") return "active";
  if (normalized === "pendente" || normalized === "pending") return "pending";
  if (normalized === "bloqueado" || normalized === "blocked") return "blocked";
  if (normalized === "inativo" || normalized === "inactive") return "inactive";
  return null;
}

export function isAccessStatusActive(status: string | null | undefined): boolean {
  return normalizeAccessStatus(status) === "active";
}
