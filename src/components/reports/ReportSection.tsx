import { Card } from "@/components/ui/card";

export function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="report-section p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </Card>
  );
}
