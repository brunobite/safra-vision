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
import { EtapaOportunidade, MotivoPerdaOportunidade, OportunidadeComercial, OrigemOportunidade, CATEGORIAS_PRODUTO } from "@/types";
import { fmtBRL, fmtNum, fmtPct } from "@/utils/calculations";
import { GlobalFilters } from "@/components/GlobalFilters";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Plus, Pencil, Trash2, Trophy, X, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const ORIGENS: OrigemOportunidade[] = ["Visita", "Ligação", "WhatsApp", "Indicação", "Manual", "Outro"];
const ETAPAS: EtapaOportunidade[] = ["Identificada", "Qualificação", "Necessidade definida", "Orçamento em elaboração", "Orçamento enviado", "Negociação", "Ganha", "Perdida", "Cancelada"];
const MOTIVOS_PERDA: MotivoPerdaOportunidade[] = ["Preço", "Prazo", "Concorrente", "Condição de pagamento", "Cliente adiou decisão", "Sem interesse", "Crédito", "Produto indisponível", "Outro"];

const empty = (): Omit<OportunidadeComercial, "id"> => ({
  clienteId: "",
  origem: "Visita",
  segmento: "",
  necessidade: "",
  valorEstimado: 0,
  responsavel: "Bruno",
  etapa: "Identificada",
  previsaoFechamento: "",
  probabilidade: 0,
  observacoes: "",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export default function FunilVendas() {
  const { oportunidades, setOportunidades, negocios, setNegocios, clientes, clienteById, vendedores, filtered, orcamentos } = useAppStore();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<OportunidadeComercial | null>(null);
  const [form, setForm] = useState<Omit<OportunidadeComercial, "id">>(empty);
  const [lossOpen, setLossOpen] = useState<OportunidadeComercial | null>(null);
  const [motivo, setMotivo] = useState<MotivoPerdaOportunidade>("Preço");

  const list = filtered.oportunidades;
  const metrics = useMemo(() => {
    const abertos = list.filter((o) => !["Ganha", "Perdida", "Cancelada"].includes(o.etapa));
    const ganhos = list.filter((o) => o.etapa === "Ganha");
    const perdidos = list.filter((o) => o.etapa === "Perdida");
    const valorPotAberto = abertos.reduce((s, o) => s + (o.valorEstimado || 0), 0);
    const ponderado = abertos.reduce((s, o) => s + ((o.valorEstimado || 0) * ((o.probabilidade || 0) / 100)), 0);
    const taxa = (ganhos.length + perdidos.length) ? ganhos.length / (ganhos.length + perdidos.length) : 0;
    return { pipelineAberto: abertos.length, valorPotAberto, ponderado, ganhos: ganhos.length, perdidos: perdidos.length, taxa };
  }, [list]);

  const openNew = () => { setEdit(null); setForm(empty()); setOpen(true); };
  const prefillCliente = params.get("clienteId");
  useEffect(() => {
    if (prefillCliente) {
      setEdit(null);
      setForm({ ...empty(), clienteId: prefillCliente });
      setOpen(true);
      setParams({});
    }
  }, [prefillCliente, setParams]);
  const openEdit = (o: OportunidadeComercial) => { setEdit(o); const { id, ...rest } = o; void id; setForm(rest); setOpen(true); };

  const save = () => {
    if (!form.clienteId) return toast.error("Selecione cliente.");
    const updated = { ...form, updatedAt: new Date().toISOString() };
    if (edit) setOportunidades(prev => prev.map(o => o.id === edit.id ? { ...updated, id: edit.id } : o));
    else setOportunidades(prev => [{ ...updated, id: `op${Date.now()}` }, ...prev]);
    setOpen(false);
    toast.success("Oportunidade salva.");
  };

  const marcarGanha = (o: OportunidadeComercial) => {
    const valor = Number(window.prompt("Informe o valor final da oportunidade", String(o.valorFinal || o.valorEstimado || 0)) || 0);
    if (!Number.isFinite(valor) || valor < 0) return toast.error("Valor final inválido.");
    const hoje = new Date().toISOString();
    setOportunidades(prev => prev.map(x => x.id === o.id ? { ...x, etapa: "Ganha", valorFinal: valor, dataFechamento: hoje.slice(0, 10), updatedAt: hoje } : x));
    setNegocios(prev => {
      const existente = prev.find(n => n.clienteId === o.clienteId && n.status === "Fechado ganho" && n.nome === `Oportunidade ${o.id}`);
      if (existente) return prev.map(n => n.id === existente.id ? { ...n, valorFechado: valor, valorPotencial: valor, ultimaAtualizacao: hoje.slice(0, 10) } : n);
      return [{ id: `n${Date.now()}`, nome: `Oportunidade ${o.id}`, clienteId: o.clienteId, vendedor: o.responsavel || "", origem: "Manual", produtos: [], categoria: o.segmento || "Outros", valorPotencial: valor, valorFechado: valor, status: "Fechado ganho", dataCriacao: hoje.slice(0, 10), ultimaAtualizacao: hoje.slice(0, 10), segmento: o.segmento, responsavel: o.responsavel }, ...prev];
    });
    toast.success("Oportunidade marcada como ganha e negócio gerado.");
  };

  const mudarEtapa = (o: OportunidadeComercial, etapa: EtapaOportunidade) => {
    if (etapa === "Ganha") return marcarGanha(o);
    if (etapa === "Perdida") { setLossOpen(o); setMotivo("Preço"); return; }
    setOportunidades(prev => prev.map(x => x.id === o.id ? { ...x, etapa, updatedAt: new Date().toISOString() } : x));
    toast.success(`Oportunidade movida para ${etapa}.`);
  };

  const confirmarPerda = () => {
    if (!lossOpen) return;
    setOportunidades(prev => prev.map(x => x.id === lossOpen.id ? { ...x, etapa: "Perdida", motivoPerda: motivo, dataFechamento: new Date().toISOString().slice(0, 10), updatedAt: new Date().toISOString() } : x));
    toast.success("Oportunidade marcada como perdida.");
    setLossOpen(null);
  };

  const funilOrcamentos = useMemo(() => {
    const etapas = ["Prospecção", "Contato feito", "Orçamento enviado", "Negociação", "Aprovado", "Perdido"] as const;
    const mapped = {
      "Prospecção": orcamentos.filter(o => ["Rascunho", "Aberto"].includes(o.status)),
      "Contato feito": list.filter(o => ["Identificada", "Qualificação"].includes(o.etapa)).map(o => ({ valorTotal: o.valorEstimado || 0 })),
      "Orçamento enviado": orcamentos.filter(o => o.status === "Enviado"),
      "Negociação": orcamentos.filter(o => o.status === "Em negociação"),
      "Aprovado": orcamentos.filter(o => o.status === "Aprovado"),
      "Perdido": orcamentos.filter(o => ["Recusado", "Vencido", "Reprovado", "Cancelado"].includes(o.status)),
    } as const;
    const rows = etapas.map((etapa) => { const arr = mapped[etapa] as Array<{ valorTotal: number }>; const total = arr.reduce((s, x) => s + (x.valorTotal || 0), 0); return { etapa, qtd: arr.length, valor: total, ticket: arr.length ? total / arr.length : 0 }; });
    return { rows };
  }, [orcamentos, list]);

  return <div className="space-y-4"><GlobalFilters />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
      <KpiCard label="Pipeline aberto" value={fmtNum(metrics.pipelineAberto)} />
      <KpiCard label="Valor estimado aberto" value={fmtBRL(metrics.valorPotAberto)} tone="muted" />
      <KpiCard label="Valor ponderado" value={fmtBRL(metrics.ponderado)} tone="warning" />
      <KpiCard label="Oportunidades ganhas" value={fmtNum(metrics.ganhos)} tone="success" />
      <KpiCard label="Oportunidades perdidas" value={fmtNum(metrics.perdidos)} tone="destructive" />
      <KpiCard label="Taxa de conversão" value={fmtPct(metrics.taxa)} tone={metrics.taxa >= 0.5 ? "success" : "warning"} />
    </div>
    <Card className="p-3"><h3 className="mb-2 text-sm font-semibold">Funil comercial de orçamentos</h3><div className="grid gap-2 md:grid-cols-3">{funilOrcamentos.rows.map(r => <div key={r.etapa} className="rounded border p-2 text-xs"><b>{r.etapa}</b><div>Qtd: {fmtNum(r.qtd)}</div><div>Valor: {fmtBRL(r.valor)}</div><div>Ticket médio: {fmtBRL(r.ticket)}</div></div>)}</div></Card>
    <div className="flex justify-end"><Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Nova oportunidade</Button></div>
    <div className="grid grid-flow-col auto-cols-[280px] gap-3 overflow-x-auto pb-3">{ETAPAS.map(col => { const items = list.filter(o => o.etapa === col); return <div key={col} className="rounded-md border border-border bg-muted/30 p-2"><div className="mb-2 flex items-center justify-between px-1"><h3 className="text-sm font-semibold">{col}</h3><Badge variant="outline">{items.length}</Badge></div><div className="space-y-2">{items.map(o => { const c = clienteById(o.clienteId); return <Card key={o.id} className="p-3 text-xs"><div className="font-semibold">{c?.nome}</div><p>{o.necessidade || "Sem necessidade informada"}</p><p className="font-medium">{fmtBRL(o.valorEstimado || 0)}</p><p className="text-[10px] text-muted-foreground">👤 {o.responsavel || "-"} {o.previsaoFechamento ? `• 📅 ${o.previsaoFechamento}` : ""}</p><div className="mt-2 flex flex-wrap gap-1"><Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => openEdit(o)}><Pencil className="h-3 w-3" /></Button>{o.etapa !== "Ganha" && <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => marcarGanha(o)} title="Ganha"><Trophy className="h-3 w-3 text-success" /></Button>}{o.etapa !== "Perdida" && <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => { setLossOpen(o); setMotivo("Preço"); }} title="Perdida"><X className="h-3 w-3 text-destructive" /></Button>}<Select value={o.etapa} onValueChange={(v: EtapaOportunidade) => mudarEtapa(o, v)}><SelectTrigger className="h-7 px-2 text-[10px] w-auto"><ArrowRight className="h-3 w-3" /></SelectTrigger><SelectContent>{ETAPAS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select><Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => nav(`/orcamentos?oportunidadeId=${o.id}`)}>Gerar orçamento</Button><Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => { if (!window.confirm("Esta ação não pode ser desfeita nesta versão. Deseja continuar?")) return; setOportunidades(prev => prev.filter(x => x.id !== o.id)); toast.success("Excluído."); }}><Trash2 className="h-3 w-3 text-destructive" /></Button></div></Card>; })}{items.length === 0 && <p className="px-1 py-3 text-center text-[11px] text-muted-foreground">Vazio</p>}</div></div>; })}</div>

    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{edit ? "Editar oportunidade" : "Nova oportunidade"}</DialogTitle></DialogHeader><div className="grid gap-3 md:grid-cols-2"><div><Label>Cliente *</Label><Select value={form.clienteId} onValueChange={v => setForm({ ...form, clienteId: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></div><div><Label>Origem</Label><Select value={form.origem} onValueChange={(v: OrigemOportunidade) => setForm({ ...form, origem: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ORIGENS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div><div><Label>Segmento</Label><Select value={form.segmento || ""} onValueChange={v => setForm({ ...form, segmento: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{CATEGORIAS_PRODUTO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div><div><Label>Necessidade</Label><Input value={form.necessidade || ""} onChange={e => setForm({ ...form, necessidade: e.target.value })} /></div><div><Label>Valor estimado</Label><Input type="number" value={form.valorEstimado || 0} onChange={e => setForm({ ...form, valorEstimado: +e.target.value })} /></div><div><Label>Responsável</Label><Select value={form.responsavel || ""} onValueChange={v => setForm({ ...form, responsavel: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{vendedores.map(v => <SelectItem key={v.id} value={v.nome}>{v.nome}</SelectItem>)}</SelectContent></Select></div><div><Label>Etapa</Label><Select value={form.etapa} onValueChange={(v: EtapaOportunidade) => setForm({ ...form, etapa: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ETAPAS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div><div><Label>Previsão de fechamento</Label><Input type="date" value={form.previsaoFechamento || ""} onChange={e => setForm({ ...form, previsaoFechamento: e.target.value })} /></div><div><Label>Probabilidade (%)</Label><Input type="number" min={0} max={100} value={form.probabilidade || 0} onChange={e => setForm({ ...form, probabilidade: +e.target.value })} /></div><div className="md:col-span-2"><Label>Observações</Label><Textarea rows={2} value={form.observacoes || ""} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={!!lossOpen} onOpenChange={(v) => !v && setLossOpen(null)}><DialogContent><DialogHeader><DialogTitle>Registrar motivo da perda</DialogTitle></DialogHeader><Select value={motivo} onValueChange={(v: MotivoPerdaOportunidade) => setMotivo(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MOTIVOS_PERDA.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select><DialogFooter><Button variant="outline" onClick={() => setLossOpen(null)}>Cancelar</Button><Button onClick={confirmarPerda}>Confirmar perda</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
