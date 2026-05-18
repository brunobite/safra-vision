import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { useAppStore } from "@/store/AppStore";
import { rotasInfo } from "@/data/mockData";
import { fmtBRL, fmtNum } from "@/utils/calculations";
import { Route as RouteIcon } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function Rotas() {
  const { clientes } = useAppStore();

  const rotas = useMemo(() => {
    return rotasInfo.map(r => {
      const cs = clientes.filter(c => c.rota === r.nome);
      const count = (k: "abc", v: string) => cs.filter(x => x[k] === v).length;
      const countP = (v: string) => cs.filter(x => x.prioridade === v).length;
      return {
        ...r,
        clientes: cs.length,
        area: cs.reduce((s, c) => s + c.areaHa, 0),
        potencial: cs.reduce((s, c) => s + c.potencialTotal, 0),
        A: count("abc", "A"), B: count("abc", "B"), C: count("abc", "C"),
        P1: countP("P1"), P2: countP("P2"), P3: countP("P3"),
      };
    });
  }, [clientes]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rotas.map(r => (
          <Card key={r.nome} className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary"><RouteIcon className="h-4 w-4" /></div>
              <h3 className="text-base font-semibold">{r.nome}</h3>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded bg-secondary p-2"><p className="text-muted-foreground">Clientes</p><p className="text-sm font-semibold">{r.clientes}</p></div>
              <div className="rounded bg-secondary p-2"><p className="text-muted-foreground">Área</p><p className="text-sm font-semibold">{fmtNum(r.area)} ha</p></div>
              <div className="rounded bg-secondary p-2"><p className="text-muted-foreground">Potencial</p><p className="text-sm font-semibold">{fmtBRL(r.potencial)}</p></div>
              <div className="rounded bg-primary/5 p-2"><p className="text-muted-foreground">A / B / C</p><p className="text-sm font-semibold">{r.A} / {r.B} / {r.C}</p></div>
              <div className="col-span-2 rounded bg-accent/10 p-2"><p className="text-muted-foreground">P1 / P2 / P3</p><p className="text-sm font-semibold">{r.P1} / {r.P2} / {r.P3}</p></div>
            </div>
            <p className="mt-3 text-xs"><span className="font-medium text-foreground">Leitura:</span> <span className="text-muted-foreground">{r.leituraAdministrativa}</span></p>
            <p className="mt-1 text-xs"><span className="font-medium text-foreground">Ação:</span> <span className="text-muted-foreground">{r.acaoOperacional}</span></p>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Potencial total por rota</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={rotas}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="nome" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip formatter={(v: number) => fmtBRL(v)} />
            <Bar dataKey="potencial" fill="hsl(158 64% 22%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}