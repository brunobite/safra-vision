import { useMemo, useState } from "react";
import { GlobalFilters } from "@/components/GlobalFilters";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { useAppStore } from "@/store/AppStore";
import { calcDashboard, fmtBRL, fmtNum, fmtPct } from "@/utils/calculations";
import {
  TrendingUp, AlertTriangle, FileText, CalendarDays, Layers, Clock, Percent, Award,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from "recharts";

export default function Dashboard() {
  const { clientes, metasEmpresa, metasPessoais, filtered, lancamentos, negocios, regras, orcamentos, proximasAcoes, appConfig, clienteById } = useAppStore();
  const [acaoFiltro, setAcaoFiltro] = useState<"hoje"|"semana"|"mes"|"atrasadas"|"todas">("hoje");

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
  const potencialCarteira = clientes.reduce((s,c)=>s+(c.potencialTotal||0),0);
  const taxa = Math.min(100, Math.max(0, appConfig.percentualAcertoEsperado || 0));
  const metaCarteira = potencialCarteira * taxa / 100;
  const realizado = negocios.filter(n=>n.status==="Fechado ganho").reduce((s,n)=>s+(n.valorFechado||0),0) + orcamentos.filter(o=>o.status==="Aprovado").reduce((s,o)=>s+o.total,0);
  const pct = metaCarteira>0 ? realizado/metaCarteira : 0;
  const gap = metaCarteira-realizado;
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
        <h2 className="mb-3 text-sm font-semibold text-foreground">Resultado comercial da carteira</h2>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <KpiCard label="Potencial total da carteira" value={fmtBRL(potencialCarteira)} icon={Layers} />
        <KpiCard label="Taxa de acerto" value={`${taxa.toFixed(2)}%`} icon={Percent} />
        <KpiCard label="Meta calculada da carteira" value={fmtBRL(metaCarteira)} icon={TrendingUp} />
        <KpiCard label="Realizado" value={fmtBRL(realizado)} icon={TrendingUp} tone="success" />
        <KpiCard label="% de atingimento" value={fmtPct(pct)} icon={Percent} tone={pct >= 1 ? "success" : pct >= 0.8 ? "warning" : "destructive"} />
        <KpiCard label="Gap da meta" value={fmtBRL(gap)} icon={AlertTriangle} tone={gap <= 0 ? "success" : "destructive"} />
        </div>
        {potencialCarteira === 0 && <p className="mt-3 text-xs text-muted-foreground">Potencial da carteira ainda não configurado.</p>}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Agenda de ações</h2>
        <div className="mb-3 flex gap-2">{(["hoje","semana","mes","atrasadas","todas"] as const).map(f=><button key={f} className={`rounded border px-2 py-1 text-xs ${acaoFiltro===f?"bg-primary text-primary-foreground":""}`} onClick={()=>setAcaoFiltro(f)}>{f}</button>)}</div>
        <div className="space-y-2">{proximasAcoes.filter(a=>{const d=a.data; if(acaoFiltro==="hoje") return d===hoje; if(acaoFiltro==="atrasadas") return a.status==="Pendente"&&d<hoje; if(acaoFiltro==="semana") return d>=hoje && d<=new Date(Date.now()+6*86400000).toISOString().slice(0,10); if(acaoFiltro==="mes") return d.slice(0,7)===hoje.slice(0,7); return true;}).map(a=>{const color=(a.status==="Pendente"&&a.data<hoje)?"bg-red-100 text-red-700":a.data===hoje?"bg-blue-100 text-blue-700":a.descricao.toLowerCase().includes("prior")?"bg-yellow-100 text-yellow-700":"bg-emerald-100 text-emerald-700"; return <div key={a.id} className="rounded border p-2 text-xs"><div className="flex justify-between"><b>{clienteById(a.clienteId||"")?.nome||"Sem cliente"}</b><span className={`rounded px-2 py-0.5 ${color}`}>{a.status}</span></div><div>{a.data} • {a.tipo} • {a.responsavel || "Sem responsável"}</div><div>{a.descricao}</div></div>;})}</div>
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
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
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
