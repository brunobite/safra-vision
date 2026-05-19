import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppStore } from "@/store/AppStore";
import { Negocio, StatusFunil, STATUS_FUNIL, CATEGORIAS_PRODUTO, CategoriaProduto, OrigemNegocio } from "@/types";
import { fmtBRL, fmtNum, fmtPct } from "@/utils/calculations";
import { GlobalFilters } from "@/components/GlobalFilters";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Plus, Pencil, Trash2, Trophy, X, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const ORIGENS: OrigemNegocio[] = ["Visita", "Ligação", "WhatsApp", "Evento", "Indicação", "Outro"];

const empty: Omit<Negocio, "id"> = {
  nome: "", clienteId: "", vendedor: "Bruno", origem: "Visita",
  produtos: [], categoria: "Adjuvantes",
  valorPotencial: 0, status: "Novo", probabilidade: 30,
  previsaoFechamento: "", dataCriacao: new Date().toISOString().slice(0,10),
  ultimaAtualizacao: new Date().toISOString().slice(0,10),
  proximaAcao: "", dataProximaAcao: "",
};

export default function FunilVendas() {
  const { negocios, setNegocios, clientes, clienteById, vendedores, filtered } = useAppStore();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Negocio | null>(null);
  const [form, setForm] = useState<Omit<Negocio, "id">>(empty);
  const [lossOpen, setLossOpen] = useState<Negocio | null>(null);
  const [motivo, setMotivo] = useState("");

  const list = filtered.negocios;

  const metrics = useMemo(() => {
    const abertos = list.filter(n => !["Fechado ganho","Fechado perdido"].includes(n.status));
    const ganhos = list.filter(n => n.status === "Fechado ganho");
    const perdidos = list.filter(n => n.status === "Fechado perdido");
    const valorPotAberto = abertos.reduce((s,n) => s + n.valorPotencial, 0);
    const ponderado = abertos.reduce((s,n) => s + n.valorPotencial * (n.probabilidade/100), 0);
    const taxa = (ganhos.length + perdidos.length) ? ganhos.length / (ganhos.length + perdidos.length) : 0;
    const hoje = new Date().toISOString().slice(0,10);
    const proxIni = new Date(); const proxFim = new Date(); proxFim.setDate(proxFim.getDate()+7);
    const vencidas = list.filter(n => n.dataProximaAcao && n.dataProximaAcao < hoje && !["Fechado ganho","Fechado perdido"].includes(n.status)).length;
    const semana = list.filter(n => n.dataProximaAcao && n.dataProximaAcao >= proxIni.toISOString().slice(0,10) && n.dataProximaAcao <= proxFim.toISOString().slice(0,10)).length;
    return { pipelineAberto: abertos.length, valorPotAberto, ponderado, ganhos: ganhos.length, perdidos: perdidos.length, taxa, vencidas, semana };
  }, [list]);

  const openNew = () => { setEdit(null); setForm({ ...empty, dataCriacao: new Date().toISOString().slice(0,10), ultimaAtualizacao: new Date().toISOString().slice(0,10) }); setOpen(true); };
  const openEdit = (n: Negocio) => { setEdit(n); const { id, ...rest } = n; void id; setForm(rest); setOpen(true); };

  const save = () => {
    if (!form.clienteId) return toast.error("Selecione cliente.");
    const updated = { ...form, ultimaAtualizacao: new Date().toISOString().slice(0,10) };
    if (edit) setNegocios(prev => prev.map(n => n.id === edit.id ? { ...updated, id: edit.id } : n));
    else setNegocios(prev => [{ ...updated, id: `n${Date.now()}` }, ...prev]);
    setOpen(false); toast.success("Negócio salvo.");
  };

  const mudarStatus = (n: Negocio, status: StatusFunil) => {
    if (status === "Fechado perdido") { setLossOpen(n); setMotivo(""); return; }
    setNegocios(prev => prev.map(x => x.id === n.id ? { ...x, status, ultimaAtualizacao: new Date().toISOString().slice(0,10), valorFechado: status === "Fechado ganho" ? (x.valorFechado ?? x.valorPotencial) : x.valorFechado } : x));
    toast.success(`Negócio movido para ${status}.`);
  };

  const confirmarPerda = () => {
    if (!lossOpen) return;
    setNegocios(prev => prev.map(x => x.id === lossOpen.id ? { ...x, status: "Fechado perdido", motivoPerda: motivo, ultimaAtualizacao: new Date().toISOString().slice(0,10) } : x));
    toast.success("Negócio marcado como perdido.");
    setLossOpen(null);
  };

  const colunas: StatusFunil[] = STATUS_FUNIL;

  return (
    <div className="space-y-4">
      <GlobalFilters />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        <KpiCard label="Pipeline aberto" value={fmtNum(metrics.pipelineAberto)} />
        <KpiCard label="Valor potencial aberto" value={fmtBRL(metrics.valorPotAberto)} tone="muted" />
        <KpiCard label="Valor ponderado" value={fmtBRL(metrics.ponderado)} tone="warning" />
        <KpiCard label="Negócios ganhos" value={fmtNum(metrics.ganhos)} tone="success" />
        <KpiCard label="Negócios perdidos" value={fmtNum(metrics.perdidos)} tone="destructive" />
        <KpiCard label="Taxa de conversão" value={fmtPct(metrics.taxa)} tone={metrics.taxa >= 0.5 ? "success" : "warning"} />
        <KpiCard label="Ações vencidas" value={fmtNum(metrics.vencidas)} tone={metrics.vencidas>0?"destructive":"success"} />
        <KpiCard label="Ações da semana" value={fmtNum(metrics.semana)} />
      </div>

      <div className="flex justify-end">
        <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Novo negócio</Button>
      </div>

      <div className="grid grid-flow-col auto-cols-[280px] gap-3 overflow-x-auto pb-3">
        {colunas.map(col => {
          const items = list.filter(n => n.status === col);
          const total = items.reduce((s,n) => s + n.valorPotencial, 0);
          return (
            <div key={col} className="rounded-md border border-border bg-muted/30 p-2">
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold">{col}</h3>
                <Badge variant="outline">{items.length}</Badge>
              </div>
              <p className="mb-2 px-1 text-[11px] text-muted-foreground">{fmtBRL(total)}</p>
              <div className="space-y-2">
                {items.map(n => {
                  const c = clienteById(n.clienteId);
                  return (
                    <Card key={n.id} className="p-3 text-xs">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <div className="font-semibold">{c?.nome}</div>
                        <Badge variant="outline" className="text-[10px]">{n.probabilidade}%</Badge>
                      </div>
                      <p className="text-muted-foreground">{n.nome}</p>
                      <p className="mt-1">{n.categoria}</p>
                      <p className="font-medium text-foreground">{fmtBRL(n.valorPotencial)}</p>
                      <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                        <span>👤 {n.vendedor}</span>
                        {n.previsaoFechamento && <span>📅 {n.previsaoFechamento}</span>}
                      </div>
                      {n.proximaAcao && <p className="mt-1 text-[11px] italic text-muted-foreground">→ {n.proximaAcao}</p>}
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => openEdit(n)}><Pencil className="h-3 w-3" /></Button>
                        {n.status !== "Fechado ganho" && <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => mudarStatus(n, "Fechado ganho")} title="Ganho"><Trophy className="h-3 w-3 text-success" /></Button>}
                        {n.status !== "Fechado perdido" && <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => mudarStatus(n, "Fechado perdido")} title="Perdido"><X className="h-3 w-3 text-destructive" /></Button>}
                        <Select value={n.status} onValueChange={(v: StatusFunil) => mudarStatus(n, v)}>
                          <SelectTrigger className="h-7 px-2 text-[10px] w-auto"><ArrowRight className="h-3 w-3" /></SelectTrigger>
                          <SelectContent>{STATUS_FUNIL.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => { if (!window.confirm("Esta ação não pode ser desfeita nesta versão. Deseja continuar?")) return; setNegocios(prev => prev.filter(x => x.id !== n.id)); toast.success("Excluído."); }}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                      </div>
                    </Card>
                  );
                })}
                {items.length === 0 && <p className="px-1 py-3 text-center text-[11px] text-muted-foreground">Vazio</p>}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{edit ? "Editar negócio" : "Novo negócio"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2"><Label>Nome</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
            <div><Label>Cliente *</Label>
              <Select value={form.clienteId} onValueChange={v => setForm({ ...form, clienteId: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Vendedor</Label>
              <Select value={form.vendedor} onValueChange={v => setForm({ ...form, vendedor: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{vendedores.map(v => <SelectItem key={v.id} value={v.nome}>{v.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Origem</Label>
              <Select value={form.origem} onValueChange={(v: OrigemNegocio) => setForm({ ...form, origem: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ORIGENS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={(v: CategoriaProduto) => setForm({ ...form, categoria: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIAS_PRODUTO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Valor potencial</Label><Input type="number" value={form.valorPotencial} onChange={e => setForm({ ...form, valorPotencial: +e.target.value })} /></div>
            <div><Label>Valor fechado</Label><Input type="number" value={form.valorFechado || 0} onChange={e => setForm({ ...form, valorFechado: +e.target.value })} /></div>
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={(v: StatusFunil) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_FUNIL.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Probabilidade (%)</Label><Input type="number" value={form.probabilidade} onChange={e => setForm({ ...form, probabilidade: +e.target.value })} /></div>
            <div><Label>Previsão fechamento</Label><Input type="date" value={form.previsaoFechamento || ""} onChange={e => setForm({ ...form, previsaoFechamento: e.target.value })} /></div>
            <div><Label>Próxima ação</Label><Input value={form.proximaAcao || ""} onChange={e => setForm({ ...form, proximaAcao: e.target.value })} /></div>
            <div><Label>Data próxima ação</Label><Input type="date" value={form.dataProximaAcao || ""} onChange={e => setForm({ ...form, dataProximaAcao: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Observações</Label><Textarea rows={2} value={form.observacoes || ""} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!lossOpen} onOpenChange={(v) => !v && setLossOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar motivo da perda</DialogTitle></DialogHeader>
          <Textarea rows={3} placeholder="Motivo..." value={motivo} onChange={e => setMotivo(e.target.value)} />
          <DialogFooter><Button variant="outline" onClick={() => setLossOpen(null)}>Cancelar</Button><Button onClick={confirmarPerda}>Confirmar perda</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
