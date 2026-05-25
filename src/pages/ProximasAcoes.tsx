import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/store/AppStore";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lancamento, ProximaAcao, StatusProximaAcao, TipoLancamento, TipoProximaAcao } from "@/types";
import { Badge } from "@/components/ui/badge";

const TIPOS: TipoProximaAcao[] = ["Visita", "Ligação", "WhatsApp", "Enviar orçamento", "Cobrar retorno", "Pós-venda", "Renovação", "Outro"];
const STATUSES: StatusProximaAcao[] = ["Pendente", "Em andamento", "Realizada", "Reagendada", "Cancelada", "Concluída"];
const TIPO_LANCAMENTO: Record<TipoProximaAcao, TipoLancamento> = {
  "Visita": "Visita",
  "Ligação": "Ligação",
  "WhatsApp": "WhatsApp",
  "Enviar orçamento": "Orçamento",
  "Cobrar retorno": "Em negociação",
  "Pós-venda": "Visita",
  "Renovação": "Proposta",
  "Outro": "Evento",
};

export default function ProximasAcoes() {
  const { proximasAcoes, setProximasAcoes, clientes, vendedores, clienteById, setLancamentos } = useAppStore();
  const [form, setForm] = useState<Partial<ProximaAcao>>({ data: new Date().toISOString().slice(0,10), tipo: "Visita", status: "Pendente" });
  const [buscaCliente, setBuscaCliente] = useState("");
  const [fStatus, setFStatus] = useState("__all__");
  const [fGrupo, setFGrupo] = useState<"responsavel"|"vendedor">("responsavel");
  const nav = useNavigate();
  const hoje = new Date().toISOString().slice(0, 10);
  const semanaFim = new Date();
  semanaFim.setDate(semanaFim.getDate() + 7);
  const dataSemanaFim = semanaFim.toISOString().slice(0,10);

  const clientesFiltrados = useMemo(() => {
    const termo = buscaCliente.trim().toLowerCase();
    if (!termo) return clientes.slice(0, 30);
    return clientes.filter((c) =>
      [c.nome, c.localidade || "", c.cidade, c.rota, c.vendedor || ""]
        .some((campo) => campo.toLowerCase().includes(termo))
    ).slice(0, 30);
  }, [buscaCliente, clientes]);

  const salvar = () => {
    if (!form.clienteId || !form.data || !form.descricao || !form.objetivo || !form.responsavel) return;
    const now = new Date().toISOString();
    const item: ProximaAcao = { id: `pa${Date.now()}`, descricao: form.descricao, objetivo: form.objetivo, observacoes: form.observacoes, data: form.data, tipo: form.tipo || "Outro", status: form.status || "Pendente", responsavel: form.responsavel, clienteId: form.clienteId, createdAt: now, updatedAt: now, origem: "Avulsa" };
    setProximasAcoes((p) => [item, ...p]);
    setBuscaCliente("");
    setForm({ data: new Date().toISOString().slice(0,10), tipo: "Visita", status: "Pendente" });
  };

  const lista = useMemo(() => proximasAcoes.filter((a) => fStatus === "__all__" || a.status === fStatus).sort((a,b)=>a.data.localeCompare(b.data)), [proximasAcoes, fStatus]);
  const abertas = useMemo(() => proximasAcoes.filter(a => !["Realizada", "Concluída", "Cancelada"].includes(a.status)), [proximasAcoes]);
  const hojeAcoes = abertas.filter(a => a.data === hoje);
  const semanaAcoes = abertas.filter(a => a.data >= hoje && a.data <= dataSemanaFim);
  const atrasadas = abertas.filter(a => a.data < hoje);
  const semAgenda = clientes.filter(c => !abertas.some(a => a.clienteId === c.id));
  const p1SemAgenda = clientes.filter(c => c.prioridade === "P1" && !abertas.some(a => a.clienteId === c.id));
  const aSemVisita = clientes.filter(c => c.abc === "A" && !proximasAcoes.some(a => a.clienteId === c.id && a.tipo === "Visita"));
  const altoPotencialSemAcao = clientes.filter(c => c.potencialTotal >= 300000 && !abertas.some(a => a.clienteId === c.id));
  const visitasMes = proximasAcoes.filter(a => a.tipo === "Visita" && ["Realizada", "Concluída"].includes(a.status) && a.updatedAt.slice(0,7) === hoje.slice(0,7)).length;
  const taxaConclusao = proximasAcoes.length ? Math.round((proximasAcoes.filter(a => ["Realizada", "Concluída"].includes(a.status)).length / proximasAcoes.length) * 100) : 0;

  const porGrupo = lista.reduce((acc, a) => {
    const cliente = clienteById(a.clienteId || "");
    const key = fGrupo === "responsavel" ? (a.responsavel || "Sem responsável") : (cliente?.vendedor || "Sem vendedor");
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {} as Record<string, ProximaAcao[]>);

  const concluirAcao = (acao: ProximaAcao, gerarLancamento: boolean) => {
    const now = new Date().toISOString();
    setProximasAcoes(prev => prev.map(x => x.id === acao.id ? { ...x, status: "Realizada", updatedAt: now } : x));
    if (!gerarLancamento || !acao.clienteId) return;
    const lanc: Lancamento = {
      id: `lpa${Date.now()}`,
      data: now.slice(0,10),
      clienteId: acao.clienteId,
      tipo: TIPO_LANCAMENTO[acao.tipo] || "Visita",
      frente: "Venda Direta",
      status: "Concluído",
      oQueFoiRealizado: acao.descricao,
      vendedor: acao.responsavel,
      observacao: [acao.objetivo, acao.observacoes].filter(Boolean).join(" | "),
    };
    setLancamentos(prev => [lanc, ...prev]);
  };

  return <div className="space-y-4">
    <Card className="p-4 grid gap-3 md:grid-cols-4">{[
      ["Ações de hoje", hojeAcoes.length], ["Ações da semana", semanaAcoes.length], ["Ações vencidas", atrasadas.length], ["Próximas visitas", abertas.filter(a => a.tipo === "Visita").length],
      ["Clientes sem ação", semAgenda.length], ["P1 sem agenda", p1SemAgenda.length], ["Clientes A sem visita", aSemVisita.length], ["Alto potencial sem próxima ação", altoPotencialSemAcao.length],
      ["Visitas realizadas no mês", visitasMes], ["Taxa de conclusão", `${taxaConclusao}%`],
    ].map(([k,v]) => <div key={String(k)} className="rounded border p-2 text-sm"><div className="text-muted-foreground">{k}</div><div className="text-lg font-semibold">{v}</div></div> )}</Card>

  <Card className="p-4 grid gap-3 md:grid-cols-3">
    <div><Label>Data</Label><Input type="date" value={form.data || ""} onChange={(e)=>setForm({...form,data:e.target.value})}/></div>
    <div className="space-y-2"><Label>Cliente</Label>
      <Input value={buscaCliente} onChange={(e)=>setBuscaCliente(e.target.value)} placeholder="Buscar por nome, fazenda, cidade, rota ou vendedor" />
      <Select value={form.clienteId || "__none__"} onValueChange={(v)=>setForm({...form,clienteId:v==="__none__"?undefined:v})}>
        <SelectTrigger><SelectValue placeholder="Selecione o cliente"/></SelectTrigger><SelectContent><SelectItem value="__none__">Selecione...</SelectItem>{clientesFiltrados.map(c=><SelectItem key={c.id} value={c.id}>{c.nome} • {c.localidade || c.cidade} • {c.rota}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <div><Label>Responsável</Label><Select value={form.responsavel || "__none__"} onValueChange={(v)=>setForm({...form,responsavel:v==="__none__"?undefined:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__none__">Não definido</SelectItem>{vendedores.map(v=><SelectItem key={v.id} value={v.nome}>{v.nome}</SelectItem>)}</SelectContent></Select></div>
    <div><Label>Tipo</Label><Select value={form.tipo || "Visita"} onValueChange={(v: TipoProximaAcao)=>setForm({...form,tipo:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{TIPOS.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
    <div><Label>Status</Label><Select value={form.status || "Pendente"} onValueChange={(v: StatusProximaAcao)=>setForm({...form,status:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{STATUSES.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
    <div><Label>Objetivo</Label><Input value={form.objetivo || ""} onChange={(e)=>setForm({...form,objetivo:e.target.value})}/></div>
    <div className="md:col-span-2"><Label>Descrição</Label><Input value={form.descricao || ""} onChange={(e)=>setForm({...form,descricao:e.target.value})}/></div>
    <div className="md:col-span-3"><Label>Observações</Label><Input value={form.observacoes || ""} onChange={(e)=>setForm({...form,observacoes:e.target.value})}/></div>
    <Button onClick={salvar}>Criar ação obrigatória</Button>
  </Card>

  <Card className="p-4">
  <div className="mb-3 flex gap-3"><div className="w-60"><Label>Filtro status</Label><Select value={fStatus} onValueChange={setFStatus}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__all__">Todos</SelectItem>{STATUSES.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div><div className="w-60"><Label>Agrupar por</Label><Select value={fGrupo} onValueChange={(v:"responsavel"|"vendedor")=>setFGrupo(v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="responsavel">Responsável</SelectItem><SelectItem value="vendedor">Vendedor</SelectItem></SelectContent></Select></div></div>
  <div className="space-y-4">{Object.entries(porGrupo).map(([g, items])=><div key={g}><h3 className="mb-2 font-semibold">{g} <span className="text-muted-foreground">({items.length})</span></h3><div className="space-y-2">{items.map((a)=><div key={a.id} className="rounded-xl border bg-card p-3 text-sm">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><button className="font-semibold text-primary hover:underline" onClick={() => a.clienteId && nav(`/clientes/${a.clienteId}`)}>{clienteById(a.clienteId || "")?.nome || "Sem cliente"}</button><Badge variant={a.data < hoje && a.status === "Pendente" ? "destructive" : "outline"}>{a.status}</Badge></div>
    <div className="grid gap-1 text-muted-foreground md:grid-cols-2"><span><b className="text-foreground">Data:</b> {a.data}</span><span><b className="text-foreground">Tipo:</b> {a.tipo}</span><span><b className="text-foreground">Responsável:</b> {a.responsavel || "—"}</span><span><b className="text-foreground">Objetivo:</b> {a.objetivo || "—"}</span><span><b className="text-foreground">Descrição:</b> {a.descricao}</span><span><b className="text-foreground">Observações:</b> {a.observacoes || "—"}</span>
    <span><b className="text-foreground">Rota:</b> {clienteById(a.clienteId || "")?.rota || "—"}</span><span><b className="text-foreground">Cidade:</b> {clienteById(a.clienteId || "")?.cidade || "—"}</span><span><b className="text-foreground">ABC/Prioridade:</b> {(clienteById(a.clienteId || "")?.abc || "-") + "/" + (clienteById(a.clienteId || "")?.prioridade || "-")}</span><span><b className="text-foreground">Geo:</b> {clienteById(a.clienteId || "")?.latitude && clienteById(a.clienteId || "")?.longitude ? "Com geolocalização" : "Sem geolocalização"}</span></div>
    <div className="mt-3 flex flex-wrap gap-2"><Select value={a.status} onValueChange={(v: StatusProximaAcao)=>setProximasAcoes(prev=>prev.map(x=>x.id===a.id?{...x,status:v,updatedAt:new Date().toISOString()}:x))}><SelectTrigger className="w-full md:w-44"><SelectValue/></SelectTrigger><SelectContent>{STATUSES.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
    <Button size="sm" variant="outline" onClick={() => concluirAcao(a, false)}>Concluir</Button>
    <Button size="sm" onClick={() => concluirAcao(a, true)}>Concluir + gerar lançamento</Button></div>
    </div>)}</div></div>)}</div></Card></div>;
}
