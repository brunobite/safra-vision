import { useMemo } from "react";
import { GlobalFilters } from "@/components/GlobalFilters";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { useAppStore } from "@/store/AppStore";
import { calcDashboard, fmtBRL, fmtNum, fmtPct } from "@/utils/calculations";
import {
  Target, TrendingUp, AlertTriangle, Wallet, Footprints, FileText, Star, Users,
  Car, Receipt, CalendarDays, Layers, Clock, CheckCircle2, Percent, Banknote, ListChecks,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from "recharts";

const COLORS = ["hsl(158 64% 22%)", "hsl(36 90% 50%)", "hsl(200 70% 45%)", "hsl(280 50% 50%)", "hsl(0 70% 50%)"];

export default function Dashboard() {
  const { clientes, metasEmpresa, metasPessoais, filtered, lancamentos, clienteById } = useAppStore();

  const metaPessoalTotal = metasPessoais.reduce((s, m) => s + m.metaFaturamento, 0);
  const kpis = useMemo(
    () => calcDashboard(filtered.lancamentos, clientes, metasEmpresa, metaPessoalTotal),
    [filtered.lancamentos, clientes, metasEmpresa, metaPessoalTotal]
  );

  const abcData = useMemo(() => {
    const m = { A: 0, B: 0, C: 0 };
    clientes.forEach(c => { m[c.abc]++; });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [clientes]);

  const statusData = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.lancamentos.forEach(l => { m[l.status] = (m[l.status] || 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [filtered.lancamentos]);

  const vendasPorMes = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.lancamentos.forEach(l => {
      if (l.tipo === "Venda" || l.status === "Concluído") {
        const mes = l.data.slice(0, 7);
        m[mes] = (m[mes] || 0) + (l.vendaRs || 0);
      }
    });
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([mes, valor]) => ({ mes, valor }));
  }, [filtered.lancamentos]);

  const porFrente = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.lancamentos.forEach(l => { m[l.frente] = (m[l.frente] || 0) + (l.vendaRs || 0); });
    return Object.entries(m).map(([frente, valor]) => ({ frente, valor }));
  }, [filtered.lancamentos]);

  const metaXReal = useMemo(() => {
    const real: Record<string, number> = {};
    lancamentos.forEach(l => {
      if (l.tipo === "Venda" || l.status === "Concluído") {
        const mes = l.data.slice(0, 7);
        real[mes] = (real[mes] || 0) + (l.vendaRs || 0);
      }
    });
    return metasEmpresa.map(m => ({ mes: m.mes, Meta: m.metaTotal, Realizado: real[m.mes] || 0 }));
  }, [metasEmpresa, lancamentos]);

  return (
    <div className="space-y-6">
      <GlobalFilters />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <KpiCard label="Meta empresa" value={fmtBRL(kpis.metaEmpresa)} icon={Target} />
        <KpiCard label="Realizado empresa" value={fmtBRL(kpis.realizadoEmpresa)} icon={TrendingUp} tone="success" />
        <KpiCard label="% atingimento" value={fmtPct(kpis.pctEmpresa)} icon={Percent} tone={kpis.pctEmpresa >= 1 ? "success" : kpis.pctEmpresa >= 0.8 ? "warning" : "destructive"} />
        <KpiCard label="Gap empresa" value={fmtBRL(kpis.gapEmpresa)} icon={AlertTriangle} tone={kpis.gapEmpresa >= 0 ? "success" : "destructive"} />
        <KpiCard label="Comissão estimada" value={fmtBRL(kpis.comissaoEstimada)} icon={Wallet} tone="warning" />
        <KpiCard label="Meta pessoal" value={fmtBRL(kpis.metaPessoal)} icon={Target} />
        <KpiCard label="Realizado pessoal" value={fmtBRL(kpis.realizadoPessoal)} icon={Banknote} tone="success" />
        <KpiCard label="% pessoal" value={fmtPct(kpis.pctPessoal)} icon={Percent} tone={kpis.pctPessoal >= 1 ? "success" : kpis.pctPessoal >= 0.8 ? "warning" : "destructive"} />
        <KpiCard label="Visitas realizadas" value={fmtNum(kpis.visitas)} icon={Footprints} />
        <KpiCard label="Propostas enviadas" value={fmtNum(kpis.propostas)} icon={FileText} />
        <KpiCard label="P1 atendidos" value={fmtNum(kpis.p1Atendidos)} icon={Star} tone="warning" />
        <KpiCard label="Clientes A atendidos" value={fmtNum(kpis.aAtendidos)} icon={Users} />
        <KpiCard label="Km rodados" value={fmtNum(kpis.km)} icon={Car} />
        <KpiCard label="Despesas" value={fmtBRL(kpis.despesas)} icon={Receipt} tone="destructive" />
        <KpiCard label="Eventos lançados" value={fmtNum(kpis.eventos)} icon={CalendarDays} />
        <KpiCard label="Pipeline aberto" value={fmtBRL(kpis.pipelineAberto)} icon={Layers} tone="muted" />
        <KpiCard label="Pendências abertas" value={fmtNum(kpis.pendencias)} icon={Clock} tone={kpis.pendencias > 0 ? "warning" : "success"} />
        <KpiCard label="Total clientes" value={fmtNum(clientes.length)} icon={CheckCircle2} />
        <KpiCard label="Lançamentos" value={fmtNum(filtered.lancamentos.length)} icon={ListChecks} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Clientes por categoria ABC</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={abcData} dataKey="value" nameKey="name" outerRadius={90} label>
                {abcData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Lançamentos por status</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" outerRadius={90} label>
                {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Vendas por mês</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={vendasPorMes}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="mes" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} />
              <Bar dataKey="valor" fill="hsl(158 64% 22%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Vendas por frente comercial</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={porFrente}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="frente" fontSize={10} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} />
              <Bar dataKey="valor" fill="hsl(36 90% 50%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">Evolução mensal: meta x realizado</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={metaXReal}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="mes" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} />
              <Legend />
              <Line type="monotone" dataKey="Meta" stroke="hsl(158 64% 22%)" strokeWidth={2} />
              <Line type="monotone" dataKey="Realizado" stroke="hsl(36 90% 50%)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}