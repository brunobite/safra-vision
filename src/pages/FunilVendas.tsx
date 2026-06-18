import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppStore } from "@/store/AppStore";
import { EtapaOportunidade, HistoricoFunil, MotivoPerdaOportunidade, OportunidadeComercial, OrigemOportunidade, TipoProximaAcao } from "@/types";
import { fmtBRL, fmtPct } from "@/utils/calculations";
import { formatDateBR } from "@/utils/dateUtils";
import { GlobalFilters } from "@/components/GlobalFilters";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Plus, Pencil, Trash2, AlertTriangle, ArrowLeft, ArrowRight, Eye } from "lucide-react";
import { toast } from "sonner";
import { getOrcamentoAtualDaOportunidade } from "@/lib/orcamentoUtils";
import { buildPedidoRascunhoFromOportunidade, getPedidoValorPotencial, pedidoStatusToEtapa } from "@/lib/pedidoWorkflow";
import { getCategoriasComerciais, normalizarCategoriaComercial } from "@/utils/commercialCategories";

const ORIGENS: OrigemOportunidade[] = ["Visita", "Relatório de visita", "Ligação", "WhatsApp", "Indicação", "Manual", "Orçamento", "Outro"];
const ETAPAS_FUNIL: EtapaOportunidade[] = ["Oportunidade identificada", "Qualificação técnica/comercial", "Orçamento solicitado", "Orçamento enviado", "Negociação", "Fechamento encaminhado", "Ganha", "Perdida", "Suspensa/Sem timing"];
const ETAPAS_FECHADAS: EtapaOportunidade[] = ["Ganha", "Perdida", "Suspensa/Sem timing", "Cancelada"];
const MOTIVOS_PERDA: MotivoPerdaOportunidade[] = ["Preço", "Prazo", "Concorrente", "Condição de pagamento", "Cliente adiou decisão", "Sem interesse", "Crédito", "Produto indisponível", "Outro"];
const POS_VENDA_TIPOS: TipoProximaAcao[] = ["Entrega", "Acompanhamento técnico", "Conferir aplicação", "Visita pós-venda", "Cobrança comercial futura", "Outro"];

const etapaCanonical = (etapa: EtapaOportunidade): EtapaOportunidade => {
  const legacy: Partial<Record<EtapaOportunidade, EtapaOportunidade>> = {
    Identificada: "Oportunidade identificada",
    Qualificação: "Qualificação técnica/comercial",
    "Necessidade definida": "Qualificação técnica/comercial",
    "Orçamento em elaboração": "Orçamento solicitado",
    Cancelada: "Suspensa/Sem timing",
  };
  return legacy[etapa] || etapa;
};

const diasDesde = (iso?: string) => {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
};

type OportunidadeForm = Omit<OportunidadeComercial, "id">;
type CloseType = "Ganha" | "Perdida" | "Suspensa/Sem timing";
type CloseForm = { data: string; orcamentoId: string; valorFinal: number; observacoes: string; motivoPerda: MotivoPerdaOportunidade; concorrente: string; createPos: boolean; tipoPos: TipoProximaAcao; dataPos: string; objetivoPos: string };
type MoveState = { oportunidade: OportunidadeComercial; etapaNova: EtapaOportunidade } | null;

export default function FunilVendas() {
  const {
    oportunidades, setOportunidades, historicoFunil, setHistoricoFunil, clientes, clienteById, vendedores, filtered,
    orcamentos, setOrcamentos, proximasAcoes, setProximasAcoes, relatoriosVisita, produtos, metasCategoria, ticketsMedios, negocios,
  } = useAppStore();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<OportunidadeComercial | null>(null);
  const [details, setDetails] = useState<OportunidadeComercial | null>(null);
  const [move, setMove] = useState<MoveState>(null);
  const [moveObs, setMoveObs] = useState("");
  const [form, setForm] = useState<OportunidadeForm>({ clienteId: "", origem: "Manual", etapa: "Oportunidade identificada", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const [closeTarget, setCloseTarget] = useState<OportunidadeComercial | null>(null);
  const [closeType, setCloseType] = useState<CloseType>("Ganha");
  const [closeForm, setCloseForm] = useState<CloseForm>({ data: new Date().toISOString().slice(0, 10), orcamentoId: "", valorFinal: 0, observacoes: "", motivoPerda: "Preço", concorrente: "", createPos: false, tipoPos: "Entrega", dataPos: new Date().toISOString().slice(0, 10), objetivoPos: "" });

  const categorias = useMemo(() => getCategoriasComerciais({ produtos, metasCategoria, ticketsMedios, orcamentos, oportunidades, negocios }), [metasCategoria, negocios, oportunidades, orcamentos, produtos, ticketsMedios]);
  const list = filtered.oportunidades ?? oportunidades;
  const normalizedList = useMemo(() => list.map((o) => ({ ...o, etapa: etapaCanonical(o.etapa) })), [list]);
  const metrics = useMemo(() => {
    const abertas = normalizedList.filter((o) => !ETAPAS_FECHADAS.includes(o.etapa));
    const ganhas = normalizedList.filter((o) => o.etapa === "Ganha");
    const perdidas = normalizedList.filter((o) => o.etapa === "Perdida");
    return { abertas: abertas.length, ganhas: ganhas.length, perdidas: perdidas.length, taxa: ganhas.length + perdidas.length ? ganhas.length / (ganhas.length + perdidas.length) : 0, valorAberto: abertas.reduce((s, o) => s + getPedidoValorPotencial(o, orcamentos), 0) };
  }, [normalizedList, orcamentos]);

  useEffect(() => {
    const clienteId = params.get("clienteId");
    const novo = params.get("new");
    if (clienteId || novo) {
      setEdit(null);
      const cliente = clienteById(clienteId || "");
      setForm({ clienteId: clienteId || "", clienteNome: cliente?.nome, origem: "Manual", etapa: "Oportunidade identificada", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      setOpen(true);
      setParams({});
    }
  }, [clienteById, params, setParams]);

  const addHistorico = (oportunidade: OportunidadeComercial, etapaNova: EtapaOportunidade, observacao: string, etapaAnterior = oportunidade.etapa) => {
    const now = new Date().toISOString();
    const registro: HistoricoFunil = { id: `hf${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, oportunidadeId: oportunidade.id, clienteId: oportunidade.clienteId, etapaAnterior, etapaNova, dataMovimento: now, vendedor: oportunidade.vendedor || oportunidade.responsavel, observacao, createdAt: now };
    setHistoricoFunil((prev) => [registro, ...prev]);
  };

  const save = () => {
    if (!form.clienteId) return toast.error("Selecione cliente");
    const cliente = clienteById(form.clienteId);
    const now = new Date().toISOString();
    const payload: OportunidadeForm = { ...form, segmento: normalizarCategoriaComercial(form.segmento || form.itensEstimados?.[0]?.categoria || "Outros", categorias), clienteNome: cliente?.nome || form.clienteNome, vendedor: form.vendedor || form.responsavel, etapa: etapaCanonical(form.etapa), updatedAt: now };
    if (edit) {
      setOportunidades((prev) => prev.map((o) => (o.id === edit.id ? { ...payload, id: edit.id, createdAt: edit.createdAt } : o)));
      if (edit.etapa !== payload.etapa) addHistorico({ ...payload, id: edit.id }, payload.etapa, "Etapa ajustada na edição da oportunidade.", edit.etapa);
    } else {
      const nova = { ...payload, id: `op${Date.now()}`, createdAt: now };
      const rascunho = buildPedidoRascunhoFromOportunidade(nova, orcamentos, now);
      setOportunidades((prev) => [{ ...nova, orcamentoId: rascunho?.id }, ...prev]);
      if (rascunho) setOrcamentos((prev) => [rascunho, ...prev]);
      addHistorico(nova, nova.etapa, rascunho ? "Oportunidade criada no funil com pedido/orçamento em rascunho." : "Oportunidade criada no funil.", undefined);
    }
    setOpen(false);
    toast.success("Oportunidade salva");
  };

  const requestMove = (oportunidade: OportunidadeComercial, delta: -1 | 1) => {
    const etapaAtual = etapaCanonical(oportunidade.etapa);
    const index = ETAPAS_FUNIL.indexOf(etapaAtual);
    const pedido = getOrcamentoAtualDaOportunidade(oportunidade.id, orcamentos);
    const etapaNova = pedido ? pedidoStatusToEtapa(pedido.status) : ETAPAS_FUNIL[Math.max(0, Math.min(ETAPAS_FUNIL.length - 1, index + delta))];
    if (!etapaNova || etapaNova === etapaAtual) return;
    if (pedido) return toast.info("O funil desta oportunidade é comandado pelo status do pedido/orçamento vinculado.");
    if (etapaNova === "Ganha" || etapaNova === "Perdida") return openClose(oportunidade, etapaNova);
    setMove({ oportunidade, etapaNova });
    setMoveObs("");
  };

  const confirmMove = () => {
    if (!move) return;
    const now = new Date().toISOString();
    const etapaAnterior = move.oportunidade.etapa;
    setOportunidades((prev) => prev.map((o) => (o.id === move.oportunidade.id ? { ...o, etapa: move.etapaNova, updatedAt: now } : o)));
    addHistorico(move.oportunidade, move.etapaNova, moveObs || "Movimentação confirmada pelo usuário.", etapaAnterior);
    setMove(null);
    toast.success("Etapa atualizada com histórico");
  };

  const openClose = (o: OportunidadeComercial, tipo: CloseType) => {
    setCloseTarget(o);
    setCloseType(tipo);
    const orcamento = getOrcamentoAtualDaOportunidade(o.id, orcamentos);
    setCloseForm({ data: new Date().toISOString().slice(0, 10), orcamentoId: orcamento?.id || o.orcamentoId || "", valorFinal: o.valorFinal || orcamento?.valorTotal || o.valorEstimado || 0, observacoes: "", motivoPerda: "Preço", concorrente: o.concorrente || "", createPos: false, tipoPos: "Entrega", dataPos: new Date().toISOString().slice(0, 10), objetivoPos: "" });
  };

  const confirmClose = () => {
    if (!closeTarget) return;
    if (!closeForm.data) return toast.error("Informe data de fechamento");
    if (!closeForm.observacoes.trim()) return toast.error("Informe uma observação de conclusão");
    if (closeType === "Ganha" && (!closeForm.valorFinal || closeForm.valorFinal <= 0)) return toast.error("Oportunidade ganha exige valor final maior que zero");
    if (closeType === "Perdida" && !closeForm.motivoPerda) return toast.error("Oportunidade perdida exige motivo da perda");

    const now = new Date().toISOString();
    setOportunidades((prev) => prev.map((o) => (o.id === closeTarget.id ? { ...o, etapa: closeType, dataFechamento: closeForm.data, valorFinal: closeType === "Ganha" ? Number(closeForm.valorFinal) : o.valorFinal, motivoPerda: closeType === "Perdida" ? closeForm.motivoPerda : o.motivoPerda, concorrente: closeForm.concorrente || o.concorrente, orcamentoId: closeForm.orcamentoId || o.orcamentoId, observacoes: [o.observacoes, closeForm.observacoes].filter(Boolean).join("\n"), updatedAt: now } : o)));
    addHistorico(closeTarget, closeType, closeForm.observacoes, closeTarget.etapa);

    if (closeForm.createPos) {
      setProximasAcoes((prev) => [{ id: `pa${Date.now()}`, clienteId: closeTarget.clienteId, oportunidadeId: closeTarget.id, orcamentoId: closeForm.orcamentoId || undefined, responsavel: closeTarget.vendedor || closeTarget.responsavel || "", descricao: closeForm.objetivoPos || `Próxima ação - ${closeType}`, tipo: closeForm.tipoPos, data: closeForm.dataPos, status: "Pendente", origem: "Negócio", createdAt: now, updatedAt: now }, ...prev]);
    }

    setCloseTarget(null);
    toast.success(`Oportunidade marcada como ${closeType}`);
  };

  const oportunidadeAlertas = (o: OportunidadeComercial) => {
    const orcamentoAtual = getOrcamentoAtualDaOportunidade(o.id, orcamentos);
    const proxima = proximasAcoes.find((a) => a.oportunidadeId === o.id && ["Pendente", "Em andamento", "Reagendada"].includes(a.status));
    const alertas: string[] = [];
    if (!proxima && !ETAPAS_FECHADAS.includes(o.etapa)) alertas.push("sem próxima ação");
    if (diasDesde(o.updatedAt || o.createdAt) >= 14 && !ETAPAS_FECHADAS.includes(o.etapa)) alertas.push("parada há muitos dias");
    if (!o.previsaoFechamento && !ETAPAS_FECHADAS.includes(o.etapa)) alertas.push("sem previsão de fechamento");
    if (o.etapa === "Negociação" && !orcamentoAtual && !o.orcamentoId) alertas.push("negociação sem orçamento");
    return alertas;
  };

  const renderVinculos = (o: OportunidadeComercial) => {
    const orcamento = o.orcamentoId ? orcamentos.find((item) => item.id === o.orcamentoId) : getOrcamentoAtualDaOportunidade(o.id, orcamentos);
    const relatorio = relatoriosVisita.find((r) => r.id === o.relatorioVisitaId || r.oportunidadeId === o.id);
    const proxima = proximasAcoes.find((a) => a.id === o.proximaAcaoId || (a.oportunidadeId === o.id && ["Pendente", "Em andamento", "Reagendada"].includes(a.status)));
    return <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
      <span>Cliente: {o.clienteNome || clienteById(o.clienteId)?.nome || o.clienteId}</span>
      <span>Relatório de visita: {relatorio ? `${formatDateBR(relatorio.dataVisita)} · ${relatorio.resultadoVisita}` : o.relatorioVisitaId || "—"}</span>
      <span>Orçamento: {orcamento ? `${orcamento.codigo} · ${fmtBRL(orcamento.valorTotal)}` : "—"}</span>
      <span>Próxima ação: {proxima ? `${proxima.tipo} em ${formatDateBR(proxima.data)}` : "—"}</span>
    </div>;
  };

  return <div className="space-y-4">
    <GlobalFilters />
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 className="text-2xl font-semibold">Funil de Vendas</h1>
        <p className="text-sm text-muted-foreground">Safra Vision é a fonte oficial do pipeline; agenda/calendário permanecem somente como espelho operacional.</p>
      </div>
      <Button onClick={() => { setEdit(null); setForm({ clienteId: "", origem: "Manual", etapa: "Oportunidade identificada", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />Nova oportunidade</Button>
    </div>

    <div className="grid gap-3 md:grid-cols-4">
      <KpiCard title="Abertas" value={metrics.abertas} />
      <KpiCard title="Valor aberto" value={fmtBRL(metrics.valorAberto)} />
      <KpiCard title="Ganhas" value={metrics.ganhas} />
      <KpiCard title="Taxa ganho/perda" value={fmtPct(metrics.taxa)} />
    </div>

    <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-5">
      {ETAPAS_FUNIL.map((etapa) => {
        const cards = normalizedList.filter((o) => o.etapa === etapa);
        return <div key={etapa} className="rounded-lg border bg-muted/20 p-2">
          <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{etapa}</h2><Badge variant="outline">{cards.length}</Badge></div>
          <div className="space-y-2">
            {cards.length === 0 && <div className="rounded border border-dashed bg-background p-3 text-xs text-muted-foreground">Sem oportunidades nesta etapa.</div>}
            {cards.map((o) => {
              const alertas = oportunidadeAlertas(o);
              const index = ETAPAS_FUNIL.indexOf(o.etapa);
              return <Card key={o.id} className="p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div><b>{o.necessidade || o.segmento || "Oportunidade comercial"}</b><div className="text-xs text-muted-foreground">{o.vendedor || o.responsavel || "Sem vendedor"} · {o.origemTipo || o.origem}</div></div>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setDetails(o)}><Eye className="h-3 w-3" /></Button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-xs"><span>Potencial: <b>{fmtBRL(getPedidoValorPotencial(o, orcamentos))}</b></span><span>Prob.: <b>{fmtPct((o.probabilidade || 0) / 100)}</b></span><span className="col-span-2">Fechamento: <b>{formatDateBR(o.previsaoFechamento) || "—"}</b></span></div>
                {renderVinculos(o)}
                {alertas.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{alertas.map((a) => <Badge key={a} variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />{a}</Badge>)}</div>}
                <div className="mt-2 flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={index <= 0} onClick={() => requestMove(o, -1)}><ArrowLeft className="h-3 w-3" /></Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={index >= ETAPAS_FUNIL.length - 1} onClick={() => requestMove(o, 1)}><ArrowRight className="h-3 w-3" /></Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => openClose(o, "Ganha")}>Ganha</Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => openClose(o, "Perdida")}>Perdida</Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => nav(`/orcamentos?oportunidadeId=${o.id}`)}>Orçamento</Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => nav(`/proximas-acoes?clienteId=${o.clienteId}&oportunidadeId=${o.id}`)}>Ação</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEdit(o); const { id, ...rest } = o; setForm({ ...rest, etapa: etapaCanonical(rest.etapa) }); setOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setOportunidades((prev) => prev.filter((x) => x.id !== o.id))}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </Card>;
            })}
          </div>
        </div>;
      })}
    </div>

    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{edit ? "Editar" : "Nova"} oportunidade</DialogTitle></DialogHeader><div className="grid gap-3 md:grid-cols-2">
      <div><Label>Cliente</Label><Select value={form.clienteId || ""} onValueChange={(v) => { const c = clienteById(v); setForm({ ...form, clienteId: v, clienteNome: c?.nome }); }}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Vendedor</Label><Select value={form.vendedor || form.responsavel || ""} onValueChange={(v) => setForm({ ...form, vendedor: v, responsavel: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{vendedores.filter((v) => v.ativo).map((v) => <SelectItem key={v.id} value={v.nome}>{v.nome}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Etapa atual</Label><Select value={form.etapa} onValueChange={(v: EtapaOportunidade) => setForm({ ...form, etapa: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ETAPAS_FUNIL.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Origem</Label><Select value={form.origem || "Manual"} onValueChange={(v: OrigemOportunidade) => setForm({ ...form, origem: v, origemTipo: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ORIGENS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Categoria comercial</Label><Select value={form.segmento || "Outros"} onValueChange={(v) => setForm({ ...form, segmento: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categorias.map((categoria) => <SelectItem key={categoria} value={categoria}>{categoria}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Valor estimado</Label><Input type="number" value={form.valorEstimado || 0} onChange={(e) => setForm({ ...form, valorEstimado: Number(e.target.value) })} /></div>
      <div><Label>Probabilidade (%)</Label><Input type="number" min={0} max={100} value={form.probabilidade || 0} onChange={(e) => setForm({ ...form, probabilidade: Number(e.target.value) })} /></div>
      <div><Label>Previsão de fechamento</Label><Input type="date" value={form.previsaoFechamento || ""} onChange={(e) => setForm({ ...form, previsaoFechamento: e.target.value })} /></div>
      <div><Label>Produtos de interesse</Label><Input value={(form.produtosInteresse || []).join(", ")} onChange={(e) => setForm({ ...form, produtosInteresse: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></div>
      <div className="md:col-span-2"><Label>Necessidade / critérios de avanço</Label><Textarea value={form.necessidade || ""} onChange={(e) => setForm({ ...form, necessidade: e.target.value })} placeholder="Descreva necessidade, critério técnico/comercial e próximos passos para avançar." /></div>
      <div><Label>Relatório de visita ID</Label><Input value={form.relatorioVisitaId || ""} onChange={(e) => setForm({ ...form, relatorioVisitaId: e.target.value })} /></div>
      <div><Label>Ação ID</Label><Input value={form.acaoId || ""} onChange={(e) => setForm({ ...form, acaoId: e.target.value })} /></div>
      <div><Label>Lançamento ID</Label><Input value={form.lancamentoId || ""} onChange={(e) => setForm({ ...form, lancamentoId: e.target.value })} /></div>
      <div><Label>Orçamento ID</Label><Input value={form.orcamentoId || ""} onChange={(e) => setForm({ ...form, orcamentoId: e.target.value })} /></div>
      <div className="md:col-span-2"><Label>Observações</Label><Textarea value={form.observacoes || ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
    </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={!!move} onOpenChange={(v) => !v && setMove(null)}><DialogContent><DialogHeader><DialogTitle>Mover etapa do funil</DialogTitle></DialogHeader><div className="space-y-3 text-sm"><div>{move?.oportunidade.etapa} → <b>{move?.etapaNova}</b></div><div><Label>Observação da movimentação</Label><Textarea value={moveObs} onChange={(e) => setMoveObs(e.target.value)} placeholder="Registre por que a oportunidade avançou ou retrocedeu." /></div></div><DialogFooter><Button variant="outline" onClick={() => setMove(null)}>Cancelar</Button><Button onClick={confirmMove}>Confirmar movimento</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={!!closeTarget} onOpenChange={(v) => !v && setCloseTarget(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Marcar oportunidade como {closeType}</DialogTitle></DialogHeader><div className="grid gap-3 md:grid-cols-2"><div><Label>Data de fechamento/conclusão</Label><Input type="date" value={closeForm.data} onChange={(e) => setCloseForm({ ...closeForm, data: e.target.value })} /></div>{closeType === "Ganha" && <><div><Label>Orçamento vinculado</Label><Select value={closeForm.orcamentoId || "none"} onValueChange={(v) => { const orc = orcamentos.find((o) => o.id === v); setCloseForm({ ...closeForm, orcamentoId: v === "none" ? "" : v, valorFinal: orc?.valorTotal || closeForm.valorFinal }); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem orçamento</SelectItem>{orcamentos.filter((o) => o.oportunidadeId === closeTarget?.id).map((o) => <SelectItem key={o.id} value={o.id}>{o.codigo} - {fmtBRL(o.valorTotal)}</SelectItem>)}</SelectContent></Select></div><div><Label>Valor final obrigatório</Label><Input type="number" value={closeForm.valorFinal || 0} onChange={(e) => setCloseForm({ ...closeForm, valorFinal: Number(e.target.value) })} /></div></>}{closeType === "Perdida" && <><div><Label>Motivo da perda obrigatório</Label><Select value={closeForm.motivoPerda} onValueChange={(v: MotivoPerdaOportunidade) => setCloseForm({ ...closeForm, motivoPerda: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MOTIVOS_PERDA.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div><div><Label>Concorrente</Label><Input value={closeForm.concorrente} onChange={(e) => setCloseForm({ ...closeForm, concorrente: e.target.value })} /></div></>}<div className="md:col-span-2"><Label>Observação obrigatória</Label><Textarea value={closeForm.observacoes} onChange={(e) => setCloseForm({ ...closeForm, observacoes: e.target.value })} /></div><div><Label>Criar próxima ação?</Label><Select value={closeForm.createPos ? "sim" : "nao"} onValueChange={(v) => setCloseForm({ ...closeForm, createPos: v === "sim" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nao">Não</SelectItem><SelectItem value="sim">Sim</SelectItem></SelectContent></Select></div>{closeForm.createPos && <><div><Label>Tipo</Label><Select value={closeForm.tipoPos} onValueChange={(v: TipoProximaAcao) => setCloseForm({ ...closeForm, tipoPos: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{POS_VENDA_TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div><div><Label>Data ação</Label><Input type="date" value={closeForm.dataPos} onChange={(e) => setCloseForm({ ...closeForm, dataPos: e.target.value })} /></div><div><Label>Objetivo</Label><Input value={closeForm.objetivoPos} onChange={(e) => setCloseForm({ ...closeForm, objetivoPos: e.target.value })} /></div></>}</div><DialogFooter><Button variant="outline" onClick={() => setCloseTarget(null)}>Cancelar</Button><Button onClick={confirmClose}>Confirmar conclusão</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={!!details} onOpenChange={(v) => !v && setDetails(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Detalhes da oportunidade</DialogTitle></DialogHeader>{details && <div className="space-y-3 text-sm"><div><b>{details.necessidade || "Oportunidade comercial"}</b><div className="text-muted-foreground">{details.clienteNome || clienteById(details.clienteId)?.nome} · {details.etapa}</div></div>{renderVinculos(details)}<div>Valor estimado: <b>{fmtBRL(details.valorEstimado || 0)}</b> · Probabilidade: <b>{fmtPct((details.probabilidade || 0) / 100)}</b> · Previsão: <b>{formatDateBR(details.previsaoFechamento) || "—"}</b></div><div>Observações: {details.observacoes || "—"}</div><div><h3 className="font-semibold">Histórico de movimentações</h3><div className="mt-2 space-y-2">{historicoFunil.filter((h) => h.oportunidadeId === details.id).sort((a, b) => b.dataMovimento.localeCompare(a.dataMovimento)).map((h) => <div key={h.id} className="rounded border p-2 text-xs"><b>{h.etapaAnterior || "—"} → {h.etapaNova}</b><div>{formatDateBR(h.dataMovimento)} · {h.vendedor || "Sem vendedor"}</div><div className="text-muted-foreground">{h.observacao || "—"}</div></div>)}</div></div></div>}</DialogContent></Dialog>
  </div>;
}
