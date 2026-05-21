import { useMemo } from "react";
import { GlobalFilters } from "@/components/GlobalFilters";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { useAppStore } from "@/store/AppStore";
import { calcDashboard, fmtBRL, fmtNum, fmtPct } from "@/utils/calculations";
import {
  Target, TrendingUp, AlertTriangle, FileText, CalendarDays, Layers, Clock, Percent, Banknote, Award,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from "recharts";

export default function Dashboard() {
  const { clientes, metasEmpresa, metasPessoais, filtered, lancamentos, negocios, regras, orcamentos, proximasAcoes } = useAppStore();

  const metaPessoalTotal = metasPessoais.reduce((s, m) => s + m.metaFaturamento, 0);
  const kpis = useMemo(
    () => calcDashboard(filtered.lancamentos, clientes, metasEmpresa, metaPessoalTotal, filtered.negocios, regras),
    [filtered.lancamentos, filtered.negocios, clientes, metasEmpresa, metaPessoalTotal, regras]
  );

  const metaXReal = useMemo(() => {
    const real: Record<string, number> = {};
    negocios.filter(n => n.status === "Fechado ganho").forEach(n => {
      const mes = (n.ultimaAtualizacao || n.dataCriacao).slice(0, 7);
      real[mes] = (real[mes] || 0) + (n.valorFechado || 0);
    });
    return metasEmpresa.map(m => ({ mes: m.mes, Meta: m.metaTotal, Realizado: real[m.mes] || 0 }));
  }, [metasEmpresa, negocios]);

  const funilEtapa = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.negocios.forEach(n => { m[n.status] = (m[n.status] || 0) + (n.valorPotencial || 0); });
    return Object.entries(m).map(([etapa, valor]) => ({ etapa, valor }));
  }, [filtered.negocios]);

  const porCategoria = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.negocios.forEach(n => { m[n.categoria] = (m[n.categoria] || 0) + (n.valorPotencial || 0); });
    return Object.entries(m).map(([cat, valor]) => ({ cat, valor }));
  }, [filtered.negocios]);

  const aprovMes = useMemo(() => {
    const real: Record<string, number> = {};
    negocios.filter(n => n.status === "Fechado ganho").forEach(n => {
      const mes = (n.ultimaAtualizacao || n.dataCriacao).slice(0, 7);
      real[mes] = (real[mes] || 0) + (n.valorFechado || 0);
    });
    const potTotal = clientes.reduce((s, c) => s + (c.potencialTotal || 0), 0) || 1;
    return Object.entries(real).sort(([a],[b]) => a.localeCompare(b)).map(([mes, v]) => ({ mes, "%": +((v/potTotal)*100).toFixed(2) }));
  }, [negocios, clientes]);


  const hoje = new Date().toISOString().slice(0,10);
  const operacionais = useMemo(() => ({
    atrasados: clientes.filter(c => c.statusAtual !== "Inativo" && ((c.dataProximaAcao && c.dataProximaAcao < hoje) || (c.retorno && c.retorno < hoje))).length,
    proximasSemana: proximasAcoes.filter(a=>a.status==="Pendente" && a.data >= hoje).length,
    semVisita: clientes.filter(c=>!lancamentos.some(l=>l.clienteId===c.id && l.tipo==="Visita")).length,
    orcamentosAbertos: orcamentos.filter(o=>["Rascunho","Enviado"].includes(o.status)).length,
    negociosAbertos: negocios.filter(n=>!["Fechado ganho","Fechado perdido"].includes(n.status)).length,
    visitasMes: lancamentos.filter(l=>l.tipo==="Visita" && l.data.slice(0,7)===hoje.slice(0,7)).length,
  }), [clientes, proximasAcoes, lancamentos, orcamentos, negocios, hoje]);

  const potXFech = useMemo(() => {
    const m: Record<string, { Potencial: number; Fechado: number }> = {};
    negocios.forEach(n => {
      const mes = (n.ultimaAtualizacao || n.dataCriacao).slice(0, 7);
      m[mes] ??= { Potencial: 0, Fechado: 0 };
      m[mes].Potencial += n.valorPotencial || 0;
      if (n.status === "Fechado ganho") m[mes].Fechado += n.valorFechado || 0;
    });
    return Object.entries(m).sort(([a],[b]) => a.localeCompare(b)).map(([mes, v]) => ({ mes, ...v }));
  }, [negocios]);

  return (
    <div className="space-y-6">
      <GlobalFilters />

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Resultado comercial</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Meta Empresa" value={fmtBRL(kpis.metaEmpresa)} icon={Target} />
        <KpiCard label="Realizado Empresa" value={fmtBRL(kpis.realizadoEmpresa)} icon={TrendingUp} tone="success" />
        <KpiCard label="% Empresa" value={fmtPct(kpis.pctEmpresa)} icon={Percent} tone={kpis.pctEmpresa >= 1 ? "success" : kpis.pctEmpresa >= 0.8 ? "warning" : "destructive"} />
        <KpiCard label="Gap Empresa" value={fmtBRL(kpis.gapEmpresa)} icon={AlertTriangle} tone={kpis.gapEmpresa >= 0 ? "success" : "destructive"} />
        <KpiCard label="Meta Pessoal" value={fmtBRL(kpis.metaPessoal)} icon={Target} />
        <KpiCard label="Realizado Pessoal" value={fmtBRL(kpis.realizadoPessoal)} icon={Banknote} tone="success" />
        <KpiCard label="% Pessoal" value={fmtPct(kpis.pctPessoal)} icon={Percent} tone={kpis.pctPessoal >= 1 ? "success" : kpis.pctPessoal >= 0.8 ? "warning" : "destructive"} />
        <KpiCard label="Gap Pessoal" value={fmtBRL(kpis.gapPessoal)} icon={AlertTriangle} tone={kpis.gapPessoal >= 0 ? "success" : "destructive"} />
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Operação comercial</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <KpiCard label="Pipeline aberto" value={fmtBRL(kpis.pipelineAberto)} icon={Layers} tone="muted" />
        <KpiCard label="Clientes atrasados" value={fmtNum(operacionais.atrasados)} icon={AlertTriangle} tone="destructive" />
        <KpiCard label="Próximas ações" value={fmtNum(operacionais.proximasSemana)} icon={Clock} />
        <KpiCard label="Clientes sem visita" value={fmtNum(operacionais.semVisita)} icon={CalendarDays} tone="warning" />
        <KpiCard label="Orçamentos abertos" value={fmtNum(operacionais.orcamentosAbertos)} icon={FileText} />
        <KpiCard label="Negócios abertos" value={fmtNum(operacionais.negociosAbertos)} icon={Layers} />
        <KpiCard label="Visitas do mês" value={fmtNum(operacionais.visitasMes)} icon={TrendingUp} />
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Funil e pipeline</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Pipeline aberto" value={fmtBRL(kpis.pipelineAberto)} icon={Layers} tone="muted" />
          <KpiCard label="Propostas enviadas" value={fmtNum(kpis.propostas)} icon={FileText} />
          <KpiCard label="Aproveitamento" value={fmtPct(kpis.aproveitamento)} icon={Award} tone={kpis.aproveitamento >= 0.5 ? "success" : "warning"} />
          <KpiCard label="Pendências" value={fmtNum(kpis.pendencias)} icon={Clock} tone={kpis.pendencias > 0 ? "warning" : "success"} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">Meta x Realizado por mês</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={metaXReal}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="mes" fontSize={11} /><YAxis fontSize={11} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} /><Legend />
              <Line type="monotone" dataKey="Meta" stroke="hsl(158 64% 22%)" strokeWidth={2} />
              <Line type="monotone" dataKey="Realizado" stroke="hsl(36 90% 50%)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Funil de vendas por etapa</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={funilEtapa} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" fontSize={11} /><YAxis dataKey="etapa" type="category" fontSize={11} width={130} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} />
              <Bar dataKey="valor" fill="hsl(200 70% 45%)" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Negócios por categoria</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={porCategoria}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="cat" fontSize={10} /><YAxis fontSize={11} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} />
              <Bar dataKey="valor" fill="hsl(158 64% 22%)" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Valor potencial x fechado</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={potXFech}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="mes" fontSize={11} /><YAxis fontSize={11} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} /><Legend />
              <Bar dataKey="Potencial" fill="hsl(280 50% 50%)" radius={[4,4,0,0]} />
              <Bar dataKey="Fechado" fill="hsl(36 90% 50%)" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Aproveitamento por mês (%)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={aprovMes}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="mes" fontSize={11} /><YAxis fontSize={11} />
              <Tooltip />
              <Line type="monotone" dataKey="%" stroke="hsl(158 64% 22%)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
