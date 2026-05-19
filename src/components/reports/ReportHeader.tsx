export function ReportHeader({ title, period, filters }: { title: string; period: string; filters: string[] }) {
  return (
    <header className="space-y-1">
      <h2 className="text-xl font-bold">Safra 26/27 — Controle Operacional</h2>
      <p className="text-base font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground">Data de geração: {new Date().toLocaleString("pt-BR")}</p>
      <p className="text-xs text-muted-foreground">Período analisado: {period}</p>
      {filters.length > 0 && <p className="text-xs text-muted-foreground">Filtros aplicados: {filters.join(" • ")}</p>}
    </header>
  );
}
