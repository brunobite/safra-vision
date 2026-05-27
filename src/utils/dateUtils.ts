export function formatDateBR(date?: string): string {
  if (!date || !String(date).trim()) return "-";
  const value = String(date).trim();

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("pt-BR");
  }

  return value;
}
