import { useMemo, useState } from "react";
import { useAppStore } from "@/store/AppStore";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProximaAcao, StatusProximaAcao, TipoProximaAcao } from "@/types";
import { Badge } from "@/components/ui/badge";

const TIPOS: TipoProximaAcao[] = ["Visita", "Ligação", "Enviar orçamento", "Cobrar retorno", "Pós-venda", "Renovação", "Outro"];
const STATUSES: StatusProximaAcao[] = ["Pendente", "Concluída", "Cancelada"];

export default function ProximasAcoes() {
  const { proximasAcoes, setProximasAcoes, clientes, vendedores, clienteById } = useAppStore();
  const [form, setForm] = useState<Partial<ProximaAcao>>({ data: new Date().toISOString().slice(0,10), tipo: "Visita", status: "Pendente" });
  const [fStatus, setFStatus] = useState("__all__");
  const hoje = new Date().toISOString().slice(0, 10);

  const salvar = () => {
    if (!form.data || !form.descricao || !form.objetivo || !form.responsavel) return;
    const now = new Date().toISOString();
    const item: ProximaAcao = { id: `pa${Date.now()}`, descricao: form.descricao, objetivo: form.objetivo, observacoes: form.observacoes, data: form.data, tipo: form.tipo || "Outro", status: form.status || "Pendente", responsavel: form.responsavel, clienteId: form.clienteId, createdAt: now, updatedAt: now, origem: "Avulsa" };
    setProximasAcoes((p) => [item, ...p]);
    setForm({ data: new Date().toISOString().slice(0,10), tipo: "Visita", status: "Pendente" });
  };

  const lista = useMemo(() => proximasAcoes.filter((a) => fStatus === "__all__" || a.status === fStatus).sort((a,b)=>a.data.localeCompare(b.data)), [proximasAcoes, fStatus]);
  const badge = (a: ProximaAcao) => {
    if (a.status === "Concluída") return <Badge className="bg-emerald-600">Concluída</Badge>;
    if (a.status === "Cancelada") return <Badge variant="outline">Cancelada</Badge>;
    if (a.data < hoje) return <Badge variant="destructive">Vencida</Badge>;
    return <Badge className="bg-amber-500">Pendente</Badge>;
  };

  return <div className="space-y-4"><Card className="p-4 grid gap-3 md:grid-cols-3">
    <div><Label>Data</Label><Input type="date" value={form.data || ""} onChange={(e)=>setForm({...form,data:e.target.value})}/></div>
    <div><Label>Cliente</Label><Select value={form.clienteId || "__none__"} onValueChange={(v)=>setForm({...form,clienteId:v==="__none__"?undefined:v})}><SelectTrigger><SelectValue placeholder="Opcional"/></SelectTrigger><SelectContent><SelectItem value="__none__">Avulsa</SelectItem>{clientes.map(c=><SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></div>
    <div><Label>Responsável</Label><Select value={form.responsavel || "__none__"} onValueChange={(v)=>setForm({...form,responsavel:v==="__none__"?undefined:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__none__">Não definido</SelectItem>{vendedores.map(v=><SelectItem key={v.id} value={v.nome}>{v.nome}</SelectItem>)}</SelectContent></Select></div>
    <div><Label>Tipo</Label><Select value={form.tipo || "Visita"} onValueChange={(v: TipoProximaAcao)=>setForm({...form,tipo:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{TIPOS.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
    <div><Label>Status</Label><Select value={form.status || "Pendente"} onValueChange={(v: StatusProximaAcao)=>setForm({...form,status:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{STATUSES.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
    <div><Label>Objetivo</Label><Input value={form.objetivo || ""} onChange={(e)=>setForm({...form,objetivo:e.target.value})}/></div>
    <div className="md:col-span-2"><Label>Descrição</Label><Input value={form.descricao || ""} onChange={(e)=>setForm({...form,descricao:e.target.value})}/></div>
    <div className="md:col-span-3"><Label>Observações</Label><Input value={form.observacoes || ""} onChange={(e)=>setForm({...form,observacoes:e.target.value})}/></div>
    <Button onClick={salvar}>Criar ação obrigatória</Button>
  </Card>
  <Card className="p-4"><div className="mb-3 w-60"><Label>Filtro status</Label><Select value={fStatus} onValueChange={setFStatus}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__all__">Todos</SelectItem>{STATUSES.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
  <div className="space-y-2">{lista.map((a)=><div key={a.id} className="rounded-xl border bg-card p-3 text-sm">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><b>{clienteById(a.clienteId || "")?.nome || "Sem cliente"}</b>{badge(a)}</div>
    <div className="grid gap-1 text-muted-foreground md:grid-cols-2"><span><b className="text-foreground">Data:</b> {a.data}</span><span><b className="text-foreground">Tipo:</b> {a.tipo}</span><span><b className="text-foreground">Responsável:</b> {a.responsavel || "—"}</span><span><b className="text-foreground">Objetivo:</b> {a.objetivo || "—"}</span><span><b className="text-foreground">Descrição:</b> {a.descricao}</span><span><b className="text-foreground">Observações:</b> {a.observacoes || "—"}</span></div>
    <div className="mt-3"><Select value={a.status} onValueChange={(v: StatusProximaAcao)=>setProximasAcoes(prev=>prev.map(x=>x.id===a.id?{...x,status:v,updatedAt:new Date().toISOString()}:x))}><SelectTrigger className="w-full md:w-44"><SelectValue/></SelectTrigger><SelectContent>{STATUSES.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
    </div>)}</div></Card></div>;
}
