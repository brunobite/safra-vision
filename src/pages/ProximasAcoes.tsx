import { useMemo, useState } from "react";
import { useAppStore } from "@/store/AppStore";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProximaAcao, StatusProximaAcao, TipoProximaAcao } from "@/types";

const TIPOS: TipoProximaAcao[] = ["Visita", "Ligação", "Enviar orçamento", "Cobrar retorno", "Pós-venda", "Renovação", "Outro"];
const STATUSES: StatusProximaAcao[] = ["Pendente", "Concluída", "Cancelada"];

export default function ProximasAcoes() {
  const { proximasAcoes, setProximasAcoes, clientes, vendedores, clienteById } = useAppStore();
  const [form, setForm] = useState<Partial<ProximaAcao>>({ data: new Date().toISOString().slice(0,10), tipo: "Visita", status: "Pendente" });
  const [fStatus, setFStatus] = useState("__all__");

  const salvar = () => {
    if (!form.data || !form.descricao) return;
    const now = new Date().toISOString();
    const item: ProximaAcao = { id: `pa${Date.now()}`, descricao: form.descricao, data: form.data, tipo: form.tipo || "Outro", status: form.status || "Pendente", responsavel: form.responsavel, clienteId: form.clienteId, createdAt: now, updatedAt: now, origem: "Avulsa" };
    setProximasAcoes((p) => [item, ...p]);
    setForm({ data: new Date().toISOString().slice(0,10), tipo: "Visita", status: "Pendente" });
  };

  const lista = useMemo(() => proximasAcoes.filter((a) => fStatus === "__all__" || a.status === fStatus).sort((a,b)=>a.data.localeCompare(b.data)), [proximasAcoes, fStatus]);

  return <div className="space-y-4"><Card className="p-4 grid gap-3 md:grid-cols-3">
    <div><Label>Data</Label><Input type="date" value={form.data || ""} onChange={(e)=>setForm({...form,data:e.target.value})}/></div>
    <div><Label>Cliente</Label><Select value={form.clienteId || "__none__"} onValueChange={(v)=>setForm({...form,clienteId:v==="__none__"?undefined:v})}><SelectTrigger><SelectValue placeholder="Opcional"/></SelectTrigger><SelectContent><SelectItem value="__none__">Avulsa</SelectItem>{clientes.map(c=><SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></div>
    <div><Label>Responsável</Label><Select value={form.responsavel || "__none__"} onValueChange={(v)=>setForm({...form,responsavel:v==="__none__"?undefined:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__none__">Não definido</SelectItem>{vendedores.map(v=><SelectItem key={v.id} value={v.nome}>{v.nome}</SelectItem>)}</SelectContent></Select></div>
    <div><Label>Tipo</Label><Select value={form.tipo || "Visita"} onValueChange={(v: TipoProximaAcao)=>setForm({...form,tipo:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{TIPOS.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
    <div><Label>Status</Label><Select value={form.status || "Pendente"} onValueChange={(v: StatusProximaAcao)=>setForm({...form,status:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{STATUSES.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
    <div className="md:col-span-3"><Label>Descrição</Label><Input value={form.descricao || ""} onChange={(e)=>setForm({...form,descricao:e.target.value})}/></div>
    <Button onClick={salvar}>Criar ação</Button>
  </Card>
  <Card className="p-4"><div className="mb-3 w-60"><Label>Filtro status</Label><Select value={fStatus} onValueChange={setFStatus}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__all__">Todos</SelectItem>{STATUSES.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
  <div className="space-y-2">{lista.map((a)=><div key={a.id} className="rounded border p-2 text-sm flex flex-wrap gap-3 items-center"><b>{a.data}</b><span>{clienteById(a.clienteId || "")?.nome || "Sem cliente"}</span><span>{a.tipo}</span><span>{a.descricao}</span><span>{a.responsavel || "—"}</span><Select value={a.status} onValueChange={(v: StatusProximaAcao)=>setProximasAcoes(prev=>prev.map(x=>x.id===a.id?{...x,status:v,updatedAt:new Date().toISOString()}:x))}><SelectTrigger className="w-36"><SelectValue/></SelectTrigger><SelectContent>{STATUSES.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>)}</div></Card></div>;
}
