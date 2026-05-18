import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppStore } from "@/store/AppStore";
import { fmtBRL, fmtNum } from "@/utils/calculations";

const STATUSES = ["Aberto", "Em andamento", "Concluído", "Atrasado"] as const;

export default function PrioridadesP1() {
  const { prioridadesP1, setPrioridadesP1, clienteById } = useAppStore();

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-base font-semibold">Prioridades P1</h2>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-12">#</TableHead><TableHead>Cliente</TableHead><TableHead>ABC</TableHead>
            <TableHead>Rota</TableHead><TableHead>Cidade</TableHead>
            <TableHead className="text-right">Área (ha)</TableHead><TableHead className="text-right">Potencial</TableHead>
            <TableHead>Retorno</TableHead><TableHead>Ação recomendada</TableHead><TableHead className="w-44">Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {prioridadesP1.sort((a, b) => a.ordem - b.ordem).map(p => {
              const c = clienteById(p.clienteId);
              if (!c) return null;
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-semibold">{p.ordem}</TableCell>
                  <TableCell>{c.nome}</TableCell>
                  <TableCell><Badge variant="outline">{c.abc}</Badge></TableCell>
                  <TableCell>{c.rota}</TableCell><TableCell>{c.cidade}</TableCell>
                  <TableCell className="text-right">{fmtNum(c.areaHa)}</TableCell>
                  <TableCell className="text-right">{fmtBRL(c.potencialTotal)}</TableCell>
                  <TableCell>{c.retorno}</TableCell>
                  <TableCell className="max-w-[260px]">{p.acaoRecomendada}</TableCell>
                  <TableCell>
                    <Select value={p.status} onValueChange={(v: typeof STATUSES[number]) => setPrioridadesP1(prev => prev.map(x => x.id === p.id ? { ...x, status: v } : x))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}