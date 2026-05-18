import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GlobalFilters } from "@/components/GlobalFilters";
import { useAppStore } from "@/store/AppStore";
import { fmtBRL, fmtNum, fmtPct, STATUS_PENDENTE, TIPOS_ATENDIMENTO } from "@/utils/calculations";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </Card>
  );
}

export default function Relatorios() {
  const { filtered, clientes, metasEmpresa, clienteById } = useAppStore();
  const lancs = filtered.lancamentos;

  const porABC = useMemo(() => {
    const m: Record<string, { qtd: number; venda: number }> = { A: { qtd: 0, venda: 0 }, B: { qtd: 0, venda: 0 }, C: { qtd: 0, venda: 0 } };
    lancs.forEach(l => { const c = clienteById(l.clienteId); if (c) { m[c.abc].qtd++; m[c.abc].venda += l.vendaRs || 0; } });
    return m;
  }, [lancs, clienteById]);

  const porRota = useMemo(() => {
    const m: Record<string, { qtd: number; venda: number }> = {};
    lancs.forEach(l => {
      const c = clienteById(l.clienteId); if (!c) return;
      m[c.rota] = m[c.rota] || { qtd: 0, venda: 0 };
      m[c.rota].qtd++; m[c.rota].venda += l.vendaRs || 0;
    });
    return m;
  }, [lancs, clienteById]);

  const porFrente = useMemo(() => {
    const m: Record<string, { qtd: number; venda: number }> = {};
    lancs.forEach(l => { m[l.frente] = m[l.frente] || { qtd: 0, venda: 0 }; m[l.frente].qtd++; m[l.frente].venda += l.vendaRs || 0; });
    return m;
  }, [lancs]);

  const porStatus = useMemo(() => {
    const m: Record<string, number> = {};
    lancs.forEach(l => { m[l.status] = (m[l.status] || 0) + 1; });
    return m;
  }, [lancs]);

  const pendentes = lancs.filter(l => STATUS_PENDENTE.includes(l.status));

  const atendidosIds = new Set(lancs.filter(l => TIPOS_ATENDIMENTO.includes(l.tipo)).map(l => l.clienteId));
  const p1NaoAtendidos = clientes.filter(c => c.prioridade === "P1" && !atendidosIds.has(c.id));
  const aNaoAtendidos = clientes.filter(c => c.abc === "A" && !atendidosIds.has(c.id));

  const realizadoTotal = lancs.filter(l => l.tipo === "Venda" || l.status === "Concluído").reduce((s, l) => s + l.vendaRs, 0);
  const metaTotal = metasEmpresa.reduce((s, m) => s + m.metaTotal, 0);

  const aviso = () => toast.info("Exportação será implementada na próxima versão.");

  return (
    <div className="space-y-6">
      <GlobalFilters />

      <div className="flex gap-2">
        <Button variant="outline" onClick={aviso}><FileDown className="mr-1 h-4 w-4" /> Exportar PDF</Button>
        <Button variant="outline" onClick={aviso}><FileSpreadsheet className="mr-1 h-4 w-4" /> Exportar Excel</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Resumo por período">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Lançamentos</p><p className="text-lg font-semibold">{fmtNum(lancs.length)}</p></div>
            <div><p className="text-xs text-muted-foreground">Realizado</p><p className="text-lg font-semibold">{fmtBRL(realizadoTotal)}</p></div>
            <div><p className="text-xs text-muted-foreground">Meta empresa</p><p className="text-lg font-semibold">{fmtBRL(metaTotal)}</p></div>
            <div><p className="text-xs text-muted-foreground">% atingimento</p><p className="text-lg font-semibold">{fmtPct(metaTotal ? realizadoTotal / metaTotal : 0)}</p></div>
          </div>
        </Section>

        <Section title="Por categoria ABC">
          <Table><TableHeader><TableRow><TableHead>ABC</TableHead><TableHead className="text-right">Lanç.</TableHead><TableHead className="text-right">Venda</TableHead></TableRow></TableHeader>
            <TableBody>{Object.entries(porABC).map(([k, v]) => <TableRow key={k}><TableCell><Badge variant="outline">{k}</Badge></TableCell><TableCell className="text-right">{v.qtd}</TableCell><TableCell className="text-right">{fmtBRL(v.venda)}</TableCell></TableRow>)}</TableBody>
          </Table>
        </Section>

        <Section title="Por rota">
          <Table><TableHeader><TableRow><TableHead>Rota</TableHead><TableHead className="text-right">Lanç.</TableHead><TableHead className="text-right">Venda</TableHead></TableRow></TableHeader>
            <TableBody>{Object.entries(porRota).map(([k, v]) => <TableRow key={k}><TableCell>{k}</TableCell><TableCell className="text-right">{v.qtd}</TableCell><TableCell className="text-right">{fmtBRL(v.venda)}</TableCell></TableRow>)}</TableBody>
          </Table>
        </Section>

        <Section title="Por frente comercial">
          <Table><TableHeader><TableRow><TableHead>Frente</TableHead><TableHead className="text-right">Lanç.</TableHead><TableHead className="text-right">Venda</TableHead></TableRow></TableHeader>
            <TableBody>{Object.entries(porFrente).map(([k, v]) => <TableRow key={k}><TableCell>{k}</TableCell><TableCell className="text-right">{v.qtd}</TableCell><TableCell className="text-right">{fmtBRL(v.venda)}</TableCell></TableRow>)}</TableBody>
          </Table>
        </Section>

        <Section title="Por status">
          <Table><TableHeader><TableRow><TableHead>Status</TableHead><TableHead className="text-right">Qtd</TableHead></TableRow></TableHeader>
            <TableBody>{Object.entries(porStatus).map(([k, v]) => <TableRow key={k}><TableCell><Badge variant="outline">{k}</Badge></TableCell><TableCell className="text-right">{v}</TableCell></TableRow>)}</TableBody>
          </Table>
        </Section>

        <Section title="Pendências abertas">
          <Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>{pendentes.map(l => <TableRow key={l.id}><TableCell>{l.data}</TableCell><TableCell>{clienteById(l.clienteId)?.nome}</TableCell><TableCell><Badge variant="outline">{l.status}</Badge></TableCell></TableRow>)}{pendentes.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Sem pendências</TableCell></TableRow>}</TableBody>
          </Table>
        </Section>

        <Section title="Clientes P1 não atendidos">
          <Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Rota</TableHead><TableHead className="text-right">Potencial</TableHead></TableRow></TableHeader>
            <TableBody>{p1NaoAtendidos.map(c => <TableRow key={c.id}><TableCell>{c.nome}</TableCell><TableCell>{c.rota}</TableCell><TableCell className="text-right">{fmtBRL(c.potencialTotal)}</TableCell></TableRow>)}{p1NaoAtendidos.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Todos atendidos 🎯</TableCell></TableRow>}</TableBody>
          </Table>
        </Section>

        <Section title="Clientes A não atendidos">
          <Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Rota</TableHead><TableHead className="text-right">Potencial</TableHead></TableRow></TableHeader>
            <TableBody>{aNaoAtendidos.map(c => <TableRow key={c.id}><TableCell>{c.nome}</TableCell><TableCell>{c.rota}</TableCell><TableCell className="text-right">{fmtBRL(c.potencialTotal)}</TableCell></TableRow>)}{aNaoAtendidos.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Todos atendidos 🎯</TableCell></TableRow>}</TableBody>
          </Table>
        </Section>
      </div>
    </div>
  );
}