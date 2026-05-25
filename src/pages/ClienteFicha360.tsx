import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/store/AppStore";
import { fmtBRL, fmtNum } from "@/utils/calculations";
import { formatDateBR } from "@/lib/clientesUtils";

interface TimelineItem {
  id: string;
  data: string;
  tipo: string;
  titulo: string;
  detalhe?: string;
  status?: string;
}

export default function ClienteFicha360() {
  const nav = useNavigate();
  const { id } = useParams();
  const { clienteById, lancamentos, proximasAcoes, orcamentos, negocios } = useAppStore();
  const cliente = clienteById(id || "");

  const visitas = useMemo(() => lancamentos.filter((l) => l.clienteId === id && l.tipo === "Visita"), [lancamentos, id]);
  const ultimaVisita = useMemo(() => [...visitas].sort((a, b) => b.data.localeCompare(a.data))[0]?.data, [visitas]);
  const acoesCliente = useMemo(() => proximasAcoes.filter((a) => a.clienteId === id), [proximasAcoes, id]);
  const proximaPendente = useMemo(() => acoesCliente.filter((a) => a.status === "Pendente").sort((a, b) => a.data.localeCompare(b.data))[0], [acoesCliente]);

  const realizadoCliente = useMemo(() => {
    const lancado = lancamentos.filter((l) => l.clienteId === id).reduce((acc, l) => acc + (l.vendaRs || 0), 0);
    const ganho = negocios.filter((n) => n.clienteId === id && n.status === "Fechado ganho").reduce((acc, n) => acc + (n.valorFechado || 0), 0);
    return Math.max(lancado, ganho);
  }, [id, lancamentos, negocios]);

  const timeline = useMemo<TimelineItem[]>(() => {
    const itens: TimelineItem[] = [];
    proximasAcoes.filter((a) => a.clienteId === id).forEach((a) => itens.push({ id: `a-${a.id}`, data: a.data, tipo: "Próxima ação", titulo: `${a.tipo}: ${a.descricao}`, detalhe: a.objetivo, status: a.status }));
    lancamentos.filter((l) => l.clienteId === id).forEach((l) => itens.push({ id: `l-${l.id}`, data: l.data, tipo: l.tipo, titulo: l.oQueFoiRealizado || l.eventoAcao || l.tipo, detalhe: l.observacao, status: l.status }));
    orcamentos.filter((o) => o.clienteId === id).forEach((o) => itens.push({ id: `o-${o.id}`, data: o.data, tipo: "Orçamento", titulo: `Orçamento ${o.codigo}`, detalhe: fmtBRL(o.valorTotal), status: o.status }));
    negocios.filter((n) => n.clienteId === id).forEach((n) => itens.push({ id: `n-${n.id}`, data: n.ultimaAtualizacao || n.dataCriacao, tipo: "Negócio", titulo: n.nome || n.categoria, detalhe: fmtBRL(n.valorFechado || n.valorPotencial), status: n.status }));
    return itens.sort((a, b) => b.data.localeCompare(a.data));
  }, [id, proximasAcoes, lancamentos, orcamentos, negocios]);

  if (!cliente) return <Card className="p-4">Cliente não encontrado.</Card>;

  const diasSemContato = ultimaVisita ? Math.floor((Date.now() - new Date(ultimaVisita).getTime()) / 86400000) : "—";
  const acoesAbertas = acoesCliente.filter((a) => ["Pendente", "Em andamento", "Reagendada"].includes(a.status)).length;
  const acoesVencidas = acoesCliente.filter((a) => a.status === "Pendente" && a.data < new Date().toISOString().slice(0, 10)).length;
  const orcAbertos = orcamentos.filter((o) => o.clienteId === id && ["Rascunho", "Enviado"].includes(o.status)).length;
  const negociosGanhos = negocios.filter((n) => n.clienteId === id && n.status === "Fechado ganho").length;

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
        <div>Dias sem contato: <b>{diasSemContato}</b></div><div>Total visitas: <b>{visitas.length}</b></div><div>Ações abertas: <b>{acoesAbertas}</b></div><div>Ações vencidas: <b>{acoesVencidas}</b></div><div>Orçamentos abertos: <b>{orcAbertos}</b></div><div>Negócios ganhos: <b>{negociosGanhos}</b></div>
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
        <Button size="sm" onClick={() => nav(`/proximas-acoes?clienteId=${cliente.id}`)}>Criar próxima ação</Button>
        <Button size="sm" variant="outline" onClick={() => nav(`/lancamentos?clienteId=${cliente.id}&tipo=Visita`)}>Registrar visita</Button>
        <Button size="sm" variant="outline" onClick={() => nav(`/lancamentos?clienteId=${cliente.id}&tipo=WhatsApp`)}>Registrar WhatsApp</Button>
        <Button size="sm" variant="outline" onClick={() => nav(`/lancamentos?clienteId=${cliente.id}&tipo=Ligação`)}>Registrar ligação</Button>
        <Button size="sm" variant="outline" onClick={() => nav(`/orcamentos?clienteId=${cliente.id}`)}>Criar orçamento</Button>
        <Button size="sm" variant="outline" onClick={() => nav(`/clientes?edit=${cliente.id}`)}>Editar cliente</Button>
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
