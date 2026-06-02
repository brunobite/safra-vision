import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/store/AppStore";
import { fmtBRL, fmtNum } from "@/utils/calculations";
import { formatDateBR } from "@/utils/dateUtils";
import { gerarPdfOrcamento } from "@/lib/orcamentoPdf";
import type { Lancamento, ProximaAcao } from "@/types";

interface TimelineItem {
  id: string;
  data: string;
  tipo: string;
  titulo: string;
  detalhe?: string;
  status?: string;
}

type VisitaConsolidada = { id: string; data: string; origem: "lancamento" | "acao"; lancamento?: Lancamento; acao?: ProximaAcao };

const STATUS_ATIVOS = ["Pendente", "Em andamento", "Reagendada"];
const STATUS_VISITA_REALIZADA = ["Concluída", "Realizada"];

function isLancamentoCancelado(status?: string) {
  return ["Cancelado", "Cancelada"].includes(status || "");
}

function acaoTemLancamento(acao: ProximaAcao, lancamentos: Lancamento[]) {
  return !!acao.lancamentoId || lancamentos.some((lancamento) => lancamento.proximaAcaoId === acao.id || lancamento.origemAcaoId === acao.id || lancamento.acaoAgendaId === acao.id);
}

export default function ClienteFicha360() {
  const nav = useNavigate();
  const { id } = useParams();
  const { clienteById, lancamentos, proximasAcoes, relatoriosVisita, orcamentos, negocios, empresas, oportunidades } = useAppStore();
  const cliente = clienteById(id || "");

  const relatoriosCliente = useMemo(() => relatoriosVisita.filter((relatorio) => relatorio.clienteId === id).sort((a, b) => `${b.dataVisita}T${b.horario || ""}`.localeCompare(`${a.dataVisita}T${a.horario || ""}`)), [relatoriosVisita, id]);
  const lancamentosVisita = useMemo(() => lancamentos.filter((l) => l.clienteId === id && l.tipo === "Visita" && !isLancamentoCancelado(l.status)), [lancamentos, id]);
  const acoesCliente = useMemo(() => proximasAcoes.filter((a) => a.clienteId === id), [proximasAcoes, id]);
  const visitas = useMemo<VisitaConsolidada[]>(() => {
    const visitasLancadas = lancamentosVisita.map((lancamento) => ({ id: `l-${lancamento.id}`, data: lancamento.data, origem: "lancamento" as const, lancamento }));
    const visitasDeAcoes = acoesCliente
      .filter((acao) => acao.tipo === "Visita" && STATUS_VISITA_REALIZADA.includes(acao.status) && !acaoTemLancamento(acao, lancamentosVisita))
      .map((acao) => ({ id: `a-visita-${acao.id}`, data: acao.dataConclusao?.slice(0, 10) || acao.data, origem: "acao" as const, acao }));
    return [...visitasLancadas, ...visitasDeAcoes].sort((a, b) => b.data.localeCompare(a.data));
  }, [acoesCliente, lancamentosVisita]);
  const ultimaVisita = useMemo(() => visitas[0]?.data, [visitas]);
  const proximaPendente = useMemo(() => acoesCliente.filter((a) => STATUS_ATIVOS.includes(a.status)).sort((a, b) => a.data.localeCompare(b.data))[0], [acoesCliente]);

  const realizadoCliente = useMemo(() => {
    const lancado = lancamentos.filter((l) => l.clienteId === id).reduce((acc, l) => acc + (l.vendaRs || 0), 0);
    const ganho = negocios.filter((n) => n.clienteId === id && n.status === "Fechado ganho").reduce((acc, n) => acc + (n.valorFechado || 0), 0);
    return Math.max(lancado, ganho);
  }, [id, lancamentos, negocios]);



  const orcamentosCliente = useMemo(() => orcamentos.filter((o) => o.clienteId === id).sort((a,b)=> (b.data || "").localeCompare(a.data || "")), [orcamentos, id]);
  const timeline = useMemo<TimelineItem[]>(() => {
    const itens: TimelineItem[] = [];
    acoesCliente.forEach((a) => {
      if (a.tipo === "Visita" && STATUS_VISITA_REALIZADA.includes(a.status) && !acaoTemLancamento(a, lancamentosVisita)) {
        itens.push({ id: `a-visita-${a.id}`, data: a.dataConclusao?.slice(0, 10) || a.data, tipo: "Visita", titulo: a.descricao || "Visita concluída", detalhe: a.observacoes || a.objetivo, status: a.status });
        return;
      }
      itens.push({ id: `a-${a.id}`, data: a.data, tipo: "Próxima ação", titulo: `${a.tipo}: ${a.descricao}`, detalhe: a.objetivo, status: a.status });
    });
    relatoriosCliente.forEach((relatorio) => itens.push({ id: `rv-${relatorio.id}`, data: relatorio.dataVisita, tipo: "Relatório de visita", titulo: relatorio.resumoVisita, detalhe: relatorio.necessidadeIdentificada || relatorio.resultadoVisita, status: relatorio.resultadoVisita }));
    lancamentos.filter((l) => l.clienteId === id && !isLancamentoCancelado(l.status)).forEach((l) => itens.push({ id: `l-${l.id}`, data: l.data, tipo: l.tipo, titulo: l.oQueFoiRealizado || l.eventoAcao || l.tipo, detalhe: l.observacao, status: l.status }));
    oportunidades.filter((o) => o.clienteId === id).forEach((o) => itens.push({ id: `op-${o.id}`, data: o.updatedAt || o.createdAt, tipo: "Oportunidade", titulo: o.necessidade || o.segmento || "Oportunidade comercial", detalhe: fmtBRL(o.valorFinal || o.valorEstimado || 0), status: o.etapa }));
    orcamentos.filter((o) => o.clienteId === id).forEach((o) => itens.push({ id: `o-${o.id}`, data: o.data, tipo: "Orçamento", titulo: `Orçamento ${o.codigo}`, detalhe: fmtBRL(o.valorTotal), status: o.status }));
    negocios.filter((n) => n.clienteId === id).forEach((n) => itens.push({ id: `n-${n.id}`, data: n.ultimaAtualizacao || n.dataCriacao, tipo: "Negócio", titulo: n.nome || n.categoria, detalhe: fmtBRL(n.valorFechado || n.valorPotencial), status: n.status }));
    return itens.sort((a, b) => b.data.localeCompare(a.data));
  }, [id, acoesCliente, lancamentos, lancamentosVisita, relatoriosCliente, oportunidades, orcamentos, negocios]);

  if (!cliente) return <Card className="p-4">Cliente não encontrado.</Card>;

  const diasSemContato = ultimaVisita ? Math.floor((Date.now() - new Date(ultimaVisita).getTime()) / 86400000) : "—";
  const acoesAbertas = acoesCliente.filter((a) => STATUS_ATIVOS.includes(a.status)).length;
  const acoesVencidas = acoesCliente.filter((a) => STATUS_ATIVOS.includes(a.status) && a.data < new Date().toISOString().slice(0, 10)).length;
  const orcAbertos = orcamentos.filter((o) => o.clienteId === id && ["Aberto", "Rascunho", "Em negociação"].includes(o.status)).length;
  const orcEnviados = orcamentos.filter((o) => o.clienteId === id && o.status === "Enviado").length;
  const orcAprovados = orcamentos.filter((o) => o.clienteId === id && o.status === "Aprovado").length;
  const orcPerdidos = orcamentos.filter((o) => o.clienteId === id && ["Recusado", "Vencido", "Reprovado", "Cancelado"].includes(o.status)).length;
  const negociosGanhos = negocios.filter((n) => n.clienteId === id && n.status === "Fechado ganho").length;
  const oppGanhas = oportunidades.filter((o) => o.clienteId === id && o.etapa === "Ganha");
  const oppPerdidas = oportunidades.filter((o) => o.clienteId === id && o.etapa === "Perdida");

  return <div className="space-y-4">
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{cliente.nome}</h1>
          <p className="text-sm text-muted-foreground">{cliente.localidade || cliente.endereco || "Localidade não informada"} • {cliente.cidade || "Sem cidade"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">ABC {cliente.abc}</Badge><Badge variant="outline">{cliente.prioridade}</Badge><Badge>{cliente.statusAtual}</Badge>
        </div>
      </div>
    </Card>

    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold">Resumo comercial</h2>
      <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
        <div>Potencial: <b>{fmtBRL(cliente.potencialTotal || 0)}</b></div><div>Realizado: <b>{fmtBRL(realizadoCliente)}</b></div><div>Gap: <b>{fmtBRL((cliente.potencialTotal || 0) - realizadoCliente)}</b></div><div>Última visita: <b>{formatDateBR(ultimaVisita) || "—"}</b></div><div>Próxima ação: <b>{proximaPendente ? formatDateBR(proximaPendente.data) : "—"}</b></div>
        <div>Dias sem contato: <b>{diasSemContato}</b></div><div>Total visitas: <b>{visitas.length}</b></div><div>Relatórios de visita: <b>{relatoriosCliente.length}</b></div><div>Ações abertas: <b>{acoesAbertas}</b></div><div>Ações vencidas: <b>{acoesVencidas}</b></div><div>Orç. abertos: <b>{orcAbertos}</b></div><div>Orç. enviados: <b>{orcEnviados}</b></div><div>Orç. aprovados: <b>{orcAprovados}</b></div><div>Orç. perdidos: <b>{orcPerdidos}</b></div><div>Negócios ganhos: <b>{negociosGanhos}</b></div>
      </div>
    </Card>

    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold">Dados cadastrais e localização</h2>
      <div className="grid gap-1 text-sm md:grid-cols-2">
        <span><b>Rota:</b> {cliente.rota || "—"}</span><span><b>Vendedor:</b> {cliente.vendedor || "—"}</span><span><b>Área total:</b> {fmtNum(cliente.areaHa || 0)} ha</span><span><b>Contato:</b> {cliente.nomeContato || "—"}</span><span><b>Telefone:</b> {cliente.telefone || "—"}</span><span><b>E-mail:</b> {cliente.email || "—"}</span><span><b>Documento:</b> {cliente.documento || "—"}</span><span><b>Inscrição estadual:</b> {cliente.inscricaoEstadual || "—"}</span><span><b>Latitude/Longitude:</b> {cliente.latitude && cliente.longitude ? `${cliente.latitude}, ${cliente.longitude}` : cliente.coordenadas || "—"}</span><span><b>Mapa:</b> {cliente.linkMapa ? <a href={cliente.linkMapa} className="text-primary underline" target="_blank" rel="noreferrer">Abrir mapa</a> : "—"}</span><span className="md:col-span-2"><b>Observações:</b> {cliente.observacao || cliente.observacaoLocalizacao || "—"}</span>
      </div>
    </Card>

    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold">Ações rápidas</h2>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => nav(`/agenda?action=nova-acao&clienteId=${cliente.id}`)}>Criar próxima ação</Button>
        <Button size="sm" variant="outline" onClick={() => nav(`/agenda?action=visita-concluida&clienteId=${cliente.id}`)}>Registrar visita</Button>
        <Button size="sm" variant="outline" onClick={() => nav(`/agenda?action=nova-acao&tipo=WhatsApp&clienteId=${cliente.id}`)}>Registrar WhatsApp</Button>
        <Button size="sm" variant="outline" onClick={() => nav(`/agenda?action=nova-acao&tipo=Ligação&clienteId=${cliente.id}`)}>Registrar ligação</Button>
        <Button size="sm" variant="outline" onClick={() => nav(`/orcamentos?clienteId=${cliente.id}`)}>Criar orçamento</Button>
        <Button size="sm" variant="outline" onClick={() => nav(`/clientes?edit=${cliente.id}`)}>Editar cliente</Button>
      </div>
    </Card>



    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Histórico comercial e relatórios de visita</h2>
        <Badge variant="outline">{relatoriosCliente.length} relatório(s)</Badge>
      </div>
      <div className="space-y-2">
        {relatoriosCliente.length === 0 && <div className="rounded border border-dashed p-3 text-sm text-muted-foreground">Nenhum relatório de visita registrado para este cliente.</div>}
        {relatoriosCliente.slice(0, 5).map((relatorio) => <div key={relatorio.id} className="rounded border p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <b>{formatDateBR(relatorio.dataVisita)} {relatorio.horario ? `às ${relatorio.horario}` : ""}</b>
              <div className="text-xs text-muted-foreground">{relatorio.vendedor || "Sem vendedor"} • {relatorio.fazenda || "Fazenda não informada"} • {relatorio.cidade || "Cidade não informada"}</div>
            </div>
            <Badge variant={relatorio.oportunidadeId ? "default" : "outline"}>{relatorio.resultadoVisita}</Badge>
          </div>
          <div className="mt-2"><b>Resumo:</b> {relatorio.resumoVisita}</div>
          <div className="mt-1 text-muted-foreground"><b className="text-foreground">Necessidade:</b> {relatorio.necessidadeIdentificada || "—"}</div>
          <div className="mt-1 text-muted-foreground"><b className="text-foreground">Próxima ação recomendada:</b> {relatorio.proximaAcaoRecomendada || "—"}</div>
          <div className="mt-1 text-xs text-muted-foreground">Vínculos: ação {relatorio.acaoId || "—"} • lançamento {relatorio.lancamentoId || "—"} • oportunidade {relatorio.oportunidadeId || "—"}</div>
        </div>)}
      </div>
    </Card>


    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold">Orçamentos e versões</h2>
      <div className="space-y-2">
        {orcamentosCliente.map((o) => <div key={o.id} className="rounded border p-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><b>{o.codigo} v{o.versao || 1}</b><Badge variant="outline">{o.status}</Badge></div>
          <div className="text-muted-foreground">Oportunidade: {o.oportunidadeId || "Sem vínculo"} · Envio: {formatDateBR(o.dataEnvio)} · Validade: {formatDateBR(o.validade)}</div>
          <div>Valor total: <b>{fmtBRL(o.valorTotal)}</b></div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => nav(`/orcamentos?edit=${o.id}`)}>Abrir orçamento</Button>
            <Button size="sm" onClick={() => gerarPdfOrcamento(o, cliente, empresas.find((e) => e.id === o.empresaId), oportunidades.find((op) => op.id === o.oportunidadeId))}>PDF</Button>
          </div>
        </div>)}
      </div>
    </Card>


    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold">Fechamento comercial</h2>
      <div className="grid gap-2 text-sm md:grid-cols-2">
        <div>Oportunidades ganhas: <b>{oppGanhas.length}</b></div><div>Oportunidades perdidas: <b>{oppPerdidas.length}</b></div>
      </div>
      <div className="mt-2 space-y-2 text-xs">
        {[...oppGanhas,...oppPerdidas].sort((a,b)=>(b.dataFechamento||"").localeCompare(a.dataFechamento||"")).map((o)=>{
          const neg = negocios.find((n)=>n.oportunidadeId===o.id);
          const orc = orcamentos.find((x)=>x.id===neg?.orcamentoId || x.oportunidadeId===o.id);
          const pos = proximasAcoes.find((a)=>a.oportunidadeId===o.id && ["Pendente","Em andamento"].includes(a.status));
          return <div key={o.id} className="rounded border p-2">
            <div><b>{o.etapa}</b> • {formatDateBR(o.dataFechamento)} • Valor: {fmtBRL(o.valorFinal||o.valorEstimado||0)}</div>
            <div>Negócio: {neg ? `${neg.id} (${fmtBRL(neg.valorFechado||neg.valorPotencial||0)})` : "Não gerado"}</div>
            <div>Orçamento vinculado: {orc?.codigo || "Sem vínculo"}</div>
            <div>Motivo da perda: {o.motivoPerda || "—"}</div>
            <div>Próxima ação pós-venda: {pos ? `${pos.tipo} em ${formatDateBR(pos.data)}` : "—"}</div>
          </div>;
        })}
      </div>
    </Card>

    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold">Timeline comercial</h2>
      <div className="space-y-2">
        {timeline.map((item) => <div key={item.id} className="rounded border p-2 text-sm"><div className="flex justify-between gap-2"><b>{item.tipo}</b><span>{formatDateBR(item.data)}</span></div><div>{item.titulo}</div><div className="text-xs text-muted-foreground">{item.detalhe || "—"} {item.status ? `• ${item.status}` : ""}</div></div>)}
      </div>
    </Card>
  </div>;
}
