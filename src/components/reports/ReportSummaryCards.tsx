export function ReportSummaryCards({ items }: { items: { label: string; value: string; tone?: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-md border bg-card p-3">
          <p className="text-xs text-muted-foreground">{item.label}</p>
          <p className={`text-lg font-bold ${item.tone || ""}`}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}
