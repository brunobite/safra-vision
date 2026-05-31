import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GlobalFilters } from "@/components/GlobalFilters";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { useAppStore } from "@/store/AppStore";
import { calcDashboard, fmtBRL, fmtNum, fmtPct } from "@/utils/calculations";
import { montarDashboardComercialSafra } from "@/utils/businessRules";
import {
  TrendingUp, AlertTriangle, FileText, CalendarDays, Layers, Clock, Percent, Award,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from "recharts";

export default function Dashboard() {
  const { clientes, metasEmpresa, metasPessoais, filtered, lancamentos, negocios, regras, orcamentos, oportunidades, proximasAcoes, appConfig, clienteById, ticketsMedios, metasVendedor } = useAppStore();
  const [acaoFiltro, setAcaoFiltro] = useState<"hoje"|"semana"|"mes"|"atrasadas"|"todas">("hoje");
  const nav = useNavigate();

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
  const taxa = Math.min(100, Math.max(0, appConfig.percentualAcertoEsperado || 0));
  const gestaoComercial = useMemo(() => montarDashboardComercialSafra({
    clientes,
    ticketsMedios,
    percentualAcertoEsperado: taxa,
    metasVendedor,
    negocios,
    orcamentos,
    oportunidades,
    proximasAcoes,
    hojeIso: hoje,
  }), [clientes, ticketsMedios, taxa, metasVendedor, negocios, orcamentos, oportunidades, proximasAcoes, hoje]);
  const potencialCarteira = gestaoComercial.potencialCarteira;
  const metaCarteira = gestaoComercial.metaCarteira;
  const realizado = gestaoComercial.realizado;
  const pct = gestaoComercial.percentualAtingido;
  const gapParaMeta = gestaoComercial.gap;
  const operacionais = useMemo(() => ({
    atrasados: clientes.filter(c => c.statusAtual !== "Inativo" && ((c.dataProximaAcao && c.dataProximaAcao < hoje) || (c.retorno && c.retorno < hoje))).length,
    proximasSemana: proximasAcoes.filter(a=>a.status==="Pendente" && a.data >= hoje).length,
    semVisita: clientes.filter(c=>!lancamentos.some(l=>l.clienteId===c.id && l.tipo==="Visita")).length,
    orcamentosAbertos: orcamentos.filter(o=>["Rascunho","Enviado"].includes(o.status)).length,
    negociosAbertos: negocios.filter(n=>!["Fechado ganho","Fechado perdido"].includes(n.status)).length,
    visitasMes: lancamentos.filter(l=>l.tipo==="Visita" && l.data.slice(0,7)===hoje.slice(0,7)).length,
  }), [clientes, proximasAcoes, lancamentos, orcamentos, negocios, hoje]);


  const executivos = useMemo(() => {
    const topPotencial = [...clientes].sort((a,b)=>(b.potencialTotal||0)-(a.potencialTotal||0)).slice(0,5);
    const semAcao = clientes.filter((c) => !proximasAcoes.some((a) => a.clienteId === c.id && a.status === "Pendente"));
    const rotaCritica = Object.entries(clientes.reduce((m,c)=>{const k=c.rota||"Sem rota"; m[k]=(m[k]||0)+(c.statusAtual!=="Inativo" && !proximasAcoes.some((a)=>a.clienteId===c.id&&a.status==="Pendente")?1:0); return m;}, {} as Record<string,number>)).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const visitasSemana = lancamentos.filter((l) => l.tipo === "Visita" && l.data >= hoje && l.data <= new Date(Date.now()+6*86400000).toISOString().slice(0,10));
    const visitasAtrasadas = proximasAcoes.filter((a) => a.tipo === "Visita" && a.status === "Pendente" && a.data < hoje);
    const semVisitaPlanejada = clientes.filter((c) => !proximasAcoes.some((a)=>a.clienteId===c.id && a.tipo==="Visita" && a.status==="Pendente")).length;
    const porResponsavel = Object.entries(proximasAcoes.filter((a)=>a.status==="Pendente").reduce((m,a)=>{const k=a.responsavel||"Sem responsável"; m[k]=(m[k]||0)+1; return m;}, {} as Record<string,number>));
    return { topPotencial, semAcao, rotaCritica, visitasSemana, visitasAtrasadas, semVisitaPlanejada, porResponsavel };
  }, [clientes, proximasAcoes, lancamentos, hoje]);


  const fechamentoComercial = useMemo(() => {
    const abertas = filtered.oportunidades.filter((o) => !["Ganha", "Perdida", "Cancelada"].includes(o.etapa));
    const ganhas = filtered.oportunidades.filter((o) => o.etapa === "Ganha");
    const perdidas = filtered.oportunidades.filter((o) => o.etapa === "Perdida");
    const taxaConversao = (ganhas.length + perdidas.length) ? ganhas.length / (ganhas.length + perdidas.length) : 0;
    const valorGanho = ganhas.reduce((s, o) => s + (o.valorFinal || o.valorEstimado || 0), 0);
    const valorPerdido = perdidas.reduce((s, o) => s + (o.valorFinal || o.valorEstimado || 0), 0);
    const semProximaAcao = abertas.filter((o) => !proximasAcoes.some((a) => a.oportunidadeId === o.id && ["Pendente", "Em andamento"].includes(a.status))).length;
    const ganhasSemPos = ganhas.filter((o) => !proximasAcoes.some((a) => a.oportunidadeId === o.id && ["Entrega","Acompanhamento técnico","Conferir aplicação","Visita pós-venda","Cobrança comercial futura","Pós-venda"].includes(a.tipo))).length;
    const motivos = Object.entries(perdidas.reduce((m,o)=>{const k=o.motivoPerda||"Não informado"; m[k]=(m[k]||0)+1; return m;}, {} as Record<string,number>)).sort((a,b)=>b[1]-a[1]).slice(0,5);
    return {abertas:abertas.length, ganhas:ganhas.length, perdidas:perdidas.length, taxaConversao, valorGanho, valorPerdido, semProximaAcao, ganhasSemPos, motivos};
  }, [filtered.oportunidades, proximasAcoes]);

  const comercial = useMemo(() => {
    const abertos = orcamentos.filter(o => ["Aberto","Rascunho"].includes(o.status));
    const negociacao = orcamentos.filter(o => o.status === "Em negociação");
    const aprovados = orcamentos.filter(o => o.status === "Aprovado");
    const perdidos = orcamentos.filter(o => ["Recusado","Vencido","Reprovado","Cancelado"].includes(o.status));
    const soma = (arr: typeof orcamentos) => arr.reduce((s,o)=>s+(o.valorTotal||0),0);
    const taxa = (aprovados.length+perdidos.length)>0 ? aprovados.length/(aprovados.length+perdidos.length) : 0;
    const ticket = aprovados.length ? soma(aprovados)/aprovados.length : 0;
    const porAberto = Object.values(clientes.reduce((m,c)=>{const v=abertos.filter(o=>o.clienteId===c.id).reduce((s,o)=>s+o.valorTotal,0); if(v>0)m[c.id]={id:c.id,nome:c.nome,valor:v}; return m;}, {} as Record<string,{id:string,nome:string,valor:number}>)).sort((a,b)=>b.valor-a.valor).slice(0,5);
    const porRealizado = Object.values(clientes.reduce((m,c)=>{const v=negocios.filter(n=>n.clienteId===c.id&&n.status==="Fechado ganho").reduce((s,n)=>s+(n.valorFechado||0),0); if(v>0)m[c.id]={id:c.id,nome:c.nome,valor:v}; return m;}, {} as Record<string,{id:string,nome:string,valor:number}>)).sort((a,b)=>b.valor-a.valor).slice(0,5);
    const hoje = new Date();
    const parados = abertos.filter(o => Math.floor((hoje.getTime()-new Date(o.updatedAt||o.data).getTime())/86400000) >= 15).sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt)).slice(0,5);
    return {abertos:soma(abertos), negociacao:soma(negociacao), aprovados:soma(aprovados), perdidos:soma(perdidos), taxa, ticket, porAberto, porRealizado, parados};
  }, [orcamentos, clientes, negocios]);

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
        <KpiCard label="Gap para meta" value={fmtBRL(gapParaMeta)} icon={AlertTriangle} tone={gapParaMeta <= 0 ? "success" : "destructive"} />
        </div>
        {potencialCarteira === 0 && <p className="mt-3 text-xs text-muted-foreground">Potencial da carteira ainda não configurado.</p>}
        {gestaoComercial.alertasConfiguracao.length > 0 && <div className="mt-3 grid gap-2 md:grid-cols-2">{gestaoComercial.alertasConfiguracao.map((alerta) => <div key={alerta} className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{alerta}</div>)}</div>}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <h2 className="text-sm font-semibold text-foreground">Gestão Comercial Safra 26/27</h2>
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">Status: {gestaoComercial.statusVisual}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 lg:grid-cols-6">
          <KpiCard label="Clientes ativos" value={fmtNum(gestaoComercial.clientesAtivos)} icon={Award} />
          <KpiCard label="Área cadastrada" value={`${fmtNum(gestaoComercial.areaTotalHa)} ha`} icon={Layers} />
          <KpiCard label="Ticket estimado/ha" value={fmtBRL(gestaoComercial.ticketMedioEstimadoHa)} icon={TrendingUp} />
          <KpiCard label="Oportunidades abertas" value={fmtNum(gestaoComercial.oportunidadesAbertas)} icon={Layers} />
          <KpiCard label="Orçamentos aprovados" value={fmtNum(gestaoComercial.orcamentosAprovados)} icon={FileText} tone="success" />
          <KpiCard label="Negócios ganhos" value={fmtNum(gestaoComercial.negociosGanhos)} icon={Award} tone="success" />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Desempenho por vendedor</h2>
          <div className="overflow-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b text-muted-foreground">
                <tr><th className="py-2">Vendedor</th><th>Clientes</th><th>Área</th><th>Potencial</th><th>Meta</th><th>Origem</th><th>Realizado</th><th>Gap</th><th>%</th><th>Opp.</th><th>Ações críticas</th></tr>
              </thead>
              <tbody>
                {gestaoComercial.porVendedor.map((linha) => (
                  <tr key={linha.vendedor} className="border-b last:border-0">
                    <td className="py-2 font-medium">{linha.vendedor}</td>
                    <td>{fmtNum(linha.clientes)}</td>
                    <td>{fmtNum(linha.areaHa)} ha</td>
                    <td>{fmtBRL(linha.potencial)}</td>
                    <td>{fmtBRL(linha.meta)}</td>
                    <td><span className={`rounded px-2 py-0.5 ${linha.origemMeta === "manual" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>{linha.origemMeta === "manual" ? "manual" : "automática"}</span></td>
                    <td>{fmtBRL(linha.realizado)}</td>
                    <td className={linha.gap <= 0 ? "text-emerald-700" : "text-red-700"}>{fmtBRL(linha.gap)}</td>
                    <td>{fmtPct(linha.percentualAtingido)}</td>
                    <td>{fmtNum(linha.oportunidadesAbertas)}</td>
                    <td>{fmtNum(linha.proximasAcoesCriticas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Desempenho por ABC e prioridade</h2>
          <div className="overflow-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="border-b text-muted-foreground">
                <tr><th className="py-2">ABC</th><th>Clientes</th><th>Área</th><th>Potencial</th><th>Realizado</th><th>Gap</th><th>P1 sem ação</th></tr>
              </thead>
              <tbody>
                {gestaoComercial.porAbc.map((linha) => (
                  <tr key={linha.abc} className="border-b last:border-0">
                    <td className="py-2 font-medium">{linha.abc}</td>
                    <td>{fmtNum(linha.clientes)}</td>
                    <td>{fmtNum(linha.areaHa)} ha</td>
                    <td>{fmtBRL(linha.potencial)}</td>
                    <td>{fmtBRL(linha.realizado)}</td>
                    <td className={linha.gap <= 0 ? "text-emerald-700" : "text-red-700"}>{fmtBRL(linha.gap)}</td>
                    <td>{fmtNum(linha.prioritariosSemProximaAcao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Visão por cliente</h2>
        <div className="overflow-auto">
          <table className="w-full min-w-[1120px] text-left text-xs">
            <thead className="border-b text-muted-foreground">
              <tr><th className="py-2">Cliente</th><th>Fazenda</th><th>Cidade</th><th>Vendedor</th><th>ABC</th><th>Prioridade</th><th>Área</th><th>Potencial</th><th>Realizado</th><th>Gap</th><th>Status</th><th>Próxima ação</th></tr>
            </thead>
            <tbody>
              {gestaoComercial.porCliente.slice(0, 25).map((linha) => (
                <tr key={linha.clienteId} className="border-b last:border-0">
                  <td className="py-2 font-medium"><button className="text-primary hover:underline" onClick={() => nav(`/clientes/${linha.clienteId}`)}>{linha.cliente}</button></td>
                  <td>{linha.fazenda}</td>
                  <td>{linha.cidade}</td>
                  <td>{linha.vendedor}</td>
                  <td>{linha.abc}</td>
                  <td>{linha.prioridade}</td>
                  <td>{fmtNum(linha.areaHa)} ha</td>
                  <td>{fmtBRL(linha.potencial)}</td>
                  <td>{fmtBRL(linha.realizado)}</td>
                  <td className={linha.gap <= 0 ? "text-emerald-700" : "text-red-700"}>{fmtBRL(linha.gap)}</td>
                  <td>{linha.statusComercial}</td>
                  <td>{linha.proximaAcao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Alertas gerenciais</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {gestaoComercial.alertas.slice(0, 12).map((alerta) => (
            <div key={alerta.id} className="rounded border p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <b>{alerta.titulo}</b>
                <span className={`rounded px-2 py-0.5 ${alerta.severidade === "alta" ? "bg-red-100 text-red-700" : alerta.severidade === "media" ? "bg-yellow-100 text-yellow-700" : "bg-blue-100 text-blue-700"}`}>{alerta.severidade}</span>
              </div>
              <div className="mt-1 text-muted-foreground">{alerta.detalhe}</div>
            </div>
          ))}
          {!gestaoComercial.alertas.length && <p className="text-xs text-muted-foreground">Nenhum alerta gerencial no momento.</p>}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Agenda de ações</h2>
        <div className="mb-3 flex gap-2">{(["hoje","semana","mes","atrasadas","todas"] as const).map(f=><button key={f} className={`rounded border px-2 py-1 text-xs ${acaoFiltro===f?"bg-primary text-primary-foreground":""}`} onClick={()=>setAcaoFiltro(f)}>{f}</button>)}</div>
        <div className="space-y-2">{proximasAcoes.filter(a=>{const d=a.data; if(acaoFiltro==="hoje") return d===hoje; if(acaoFiltro==="atrasadas") return a.status==="Pendente"&&d<hoje; if(acaoFiltro==="semana") return d>=hoje && d<=new Date(Date.now()+6*86400000).toISOString().slice(0,10); if(acaoFiltro==="mes") return d.slice(0,7)===hoje.slice(0,7); return true;}).map(a=>{const color=(a.status==="Pendente"&&a.data<hoje)?"bg-red-100 text-red-700":a.data===hoje?"bg-blue-100 text-blue-700":a.descricao.toLowerCase().includes("prior")?"bg-yellow-100 text-yellow-700":"bg-emerald-100 text-emerald-700"; return <div key={a.id} className="rounded border p-2 text-xs"><div className="flex justify-between"><b>{clienteById(a.clienteId||"")?.nome||"Sem cliente"}</b><span className={`rounded px-2 py-0.5 ${color}`}>{a.status}</span></div><div>{a.data} • {a.tipo} • {a.responsavel || "Sem responsável"}</div><div>{a.descricao}</div></div>;})}</div>
      </Card>


      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Fechamento comercial</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <KpiCard label="Oportunidades abertas" value={fmtNum(fechamentoComercial.abertas)} />
          <KpiCard label="Ganhas" value={fmtNum(fechamentoComercial.ganhas)} tone="success" />
          <KpiCard label="Perdidas" value={fmtNum(fechamentoComercial.perdidas)} tone="destructive" />
          <KpiCard label="Taxa de conversão" value={fmtPct(fechamentoComercial.taxaConversao)} />
          <KpiCard label="Valor ganho" value={fmtBRL(fechamentoComercial.valorGanho)} tone="success" />
          <KpiCard label="Valor perdido" value={fmtBRL(fechamentoComercial.valorPerdido)} tone="destructive" />
          <KpiCard label="Sem próxima ação" value={fmtNum(fechamentoComercial.semProximaAcao)} tone="warning" />
          <KpiCard label="Ganhas sem pós-venda" value={fmtNum(fechamentoComercial.ganhasSemPos)} tone="warning" />
        </div>
        <div className="mt-2 text-xs"><b>Principais motivos de perda:</b> {fechamentoComercial.motivos.map(([m,q])=>`${m} (${q})`).join(', ') || '—'}</div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Bloco comercial (orçamentos)</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <KpiCard label="Orçamentos abertos" value={fmtBRL(comercial.abertos)} icon={FileText} />
          <KpiCard label="Em negociação" value={fmtBRL(comercial.negociacao)} icon={Layers} />
          <KpiCard label="Aprovado" value={fmtBRL(comercial.aprovados)} icon={Award} tone="success" />
          <KpiCard label="Perdido" value={fmtBRL(comercial.perdidos)} icon={AlertTriangle} tone="destructive" />
          <KpiCard label="Conversão" value={fmtPct(comercial.taxa)} icon={Percent} />
          <KpiCard label="Ticket médio" value={fmtBRL(comercial.ticket)} icon={TrendingUp} />
        </div>
        <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
          <div><b>Top clientes por orçamento aberto:</b> {comercial.porAberto.map(c=>`${c.nome} (${fmtBRL(c.valor)})`).join(", ") || "—"}</div>
          <div><b>Top clientes por realizado:</b> {comercial.porRealizado.map(c=>`${c.nome} (${fmtBRL(c.valor)})`).join(", ") || "—"}</div>
          <div><b>Orçamentos parados (15+ dias):</b> {comercial.parados.map(o=>`${clienteById(o.clienteId)?.nome || o.clienteId} (${o.codigo})`).join(", ") || "—"}</div>
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
        <h2 className="mb-3 text-sm font-semibold text-foreground">Bloco executivo da carteira</h2>
        <div className="grid gap-2 text-xs md:grid-cols-2">
          <div><b>Top clientes por potencial:</b> {executivos.topPotencial.length ? executivos.topPotencial.map((c) => <button key={c.id} className="mr-2 text-primary hover:underline" onClick={() => nav(`/clientes/${c.id}`)}>{c.nome} ({fmtBRL(c.potencialTotal || 0)})</button>) : "—"}</div>
          <div><b>Clientes críticos sem ação:</b> {executivos.semAcao.slice(0,8).length ? executivos.semAcao.slice(0,8).map((c) => <button key={c.id} className="mr-2 text-primary hover:underline" onClick={() => nav(`/clientes/${c.id}`)}>{c.nome}</button>) : "—"}</div>
          <div><b>Rotas críticas:</b> {executivos.rotaCritica.map(([r,q]) => `${r} (${q})`).join(", ") || "—"}</div>
          <div><b>Clientes sem visita planejada:</b> {fmtNum(executivos.semVisitaPlanejada)}</div>
          <div><b>Visitas da semana:</b> {fmtNum(executivos.visitasSemana.length)} | <b>Visitas atrasadas:</b> {fmtNum(executivos.visitasAtrasadas.length)}</div>
          <div><b>Clientes por responsável (ações pendentes):</b> {executivos.porResponsavel.map(([r,q]) => `${r} (${q})`).join(", ") || "—"}</div>
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
