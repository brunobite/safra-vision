import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAppStore } from "@/store/AppStore";
import { ROTAS_NOMES } from "@/data/mockData";
import { Cliente, ABC, ClienteCulturaArea } from "@/types";
import { fmtBRL, fmtNum } from "@/utils/calculations";
import { computeClienteStatus, CULTURAS_SUGERIDAS, formatDateBR, isClienteAtrasado, normalizarCulturas, parseFrequenciaDias, sugestaoRetornoDias } from "@/lib/clientesUtils";
import { Plus, Pencil, Trash2, Eye, Search } from "lucide-react";
import { toast } from "sonner";

const ALL = "__all__";
const empty: Omit<Cliente, "id"> = {
  nome: "", abc: "A", prioridade: "P2", rota: "Rota Norte", cidade: "", localidade: "", culturas: "",
  areaHa: 0, potencialTotal: 0, statusAtual: "Prospectar", frequenciaRetorno: "30 dias", retorno: "30 dias", vendedor: "", potencialCalculado: false, inativoManual: false,
  documento: "", inscricaoEstadual: "", endereco: "", telefone: "", email: "", nomeContato: "", culturaPrincipal: "", areaAplicacaoPotencial: "",
};

export default function Clientes() {
  const { clientes, setClientes, lancamentos, negocios, ticketsMedios, orcamentos, proximasAcoes } = useAppStore();
  const [busca, setBusca] = useState("");
  const [fAbc, setFAbc] = useState(""); const [fPri, setFPri] = useState(""); const [fRota, setFRota] = useState(""); const [fStatus, setFStatus] = useState(""); const [fCidade, setFCidade] = useState(""); const [fAtrasado, setFAtrasado] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Cliente | null>(null);
  const [form, setForm] = useState<Omit<Cliente, "id">>(empty);
  const [view, setView] = useState<Cliente | null>(null);
  const nav = useNavigate();

  const cidades = useMemo(() => Array.from(new Set(clientes.map(c => c.cidade))), [clientes]);
  const statuses = useMemo(() => Array.from(new Set(clientes.map(c => c.statusAtual))), [clientes]);

  const visitasCliente = (id: string) => lancamentos.filter(l => l.clienteId === id && l.tipo === "Visita");
  const totalVisitas = (id: string) => visitasCliente(id).length;
  const ultimaVisita = (id: string) => visitasCliente(id).sort((a, b) => b.data.localeCompare(a.data))[0]?.data;
  const proximaAcaoPendente = (id: string) => proximasAcoes.find(a => a.clienteId === id && a.status === "Pendente");
  const totalProximasAcoesAbertas = (id: string) => proximasAcoes.filter(a => a.clienteId === id && a.status === "Pendente").length;
  const atrasado = (c: Cliente) => isClienteAtrasado(c, proximasAcoes);
  const lista = useMemo(() => clientes.filter(c =>
    (!busca || c.nome.toLowerCase().includes(busca.toLowerCase())) &&
    (!fAbc || c.abc === fAbc) &&
    (!fPri || c.prioridade === fPri) &&
    (!fRota || c.rota === fRota) && (!fStatus || c.statusAtual === fStatus) &&
    (!fCidade || c.cidade === fCidade) &&
    (!fAtrasado || (fAtrasado === "sim" ? atrasado(c) : !atrasado(c)))
  ), [clientes, busca, fAbc, fPri, fRota, fStatus, fCidade, fAtrasado, proximasAcoes]);

  const totais = useMemo(() => ({
    potencial: lista.reduce((s, c) => s + c.potencialTotal, 0),
    area: lista.reduce((s, c) => s + c.areaHa, 0),
  }), [lista]);
  const ticketAtivo = useMemo(() => ticketsMedios.filter(t=>t.ativo && t.valorMedioHa > 0).reduce((s,t)=>s+t.valorMedioHa,0), [ticketsMedios]);

  useEffect(() => {
    setClientes(prev => prev.map((c) => {
      const potencialTotal = ticketAtivo > 0 ? c.areaHa * ticketAtivo : 0;
      if (c.potencialTotal === potencialTotal && c.potencialCalculado === (ticketAtivo > 0)) return c;
      return { ...c, potencialTotal, potencialCalculado: ticketAtivo > 0 };
    }));
  }, [ticketAtivo, setClientes]);

  const openNew = () => { setEdit(null); setForm(empty); setOpen(true); };
  const openEdit = (c: Cliente) => { setEdit(c); const { id, ...rest } = c; void id; setForm(rest); setOpen(true); };
  const calcStatus = (clienteId: string, inativoManual?: boolean) => {
    if (inativoManual) return "Inativo";
    const now = new Date();
    const hasNeg = negocios.some(n => n.clienteId === clienteId && ((now.getTime()-new Date(n.ultimaAtualizacao||n.dataCriacao).getTime())/86400000) <= 365);
    if (hasNeg) return "Ativo";
    const lastVisit = lancamentos.filter(l => l.clienteId === clienteId && l.tipo === "Visita").sort((a,b)=>b.data.localeCompare(a.data))[0];
    if (!lastVisit) return "Prospectar";
    const days = (now.getTime()-new Date(lastVisit.data).getTime())/86400000;
    return days <= 90 ? "Visita" : "Prospectar";
  };
  
  const save = () => {
    if (!form.nome) return toast.error("Nome obrigatório.");
    const potencialCalculado = ticketAtivo>0 ? form.areaHa * ticketAtivo : 0;
    const base = { ...form, potencialTotal: potencialCalculado, potencialCalculado: ticketAtivo>0, frequenciaRetorno: form.frequenciaRetorno || `${sugestaoRetornoDias(form as Cliente, computeClienteStatus(form as Cliente, lancamentos, negocios, orcamentos), negocios)} dias`, statusAtual: computeClienteStatus({ ...form, id: edit?.id || "novo" } as Cliente, lancamentos, negocios, orcamentos) };
    if (edit) setClientes(prev => prev.map(c => c.id === edit.id ? { ...base, id: edit.id } : c));
    else setClientes(prev => [...prev, { ...base, id: `c${Date.now()}` }]);
    setOpen(false); toast.success("Cliente salvo.");
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Label className="text-xs">Buscar</Label>
            <Search className="absolute left-2 top-[30px] h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-7" placeholder="Nome do cliente..." value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <div><Label className="text-xs">ABC</Label>
            <Select value={fAbc || ALL} onValueChange={v => setFAbc(v === ALL ? "" : v)}><SelectTrigger className="w-28"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>Todos</SelectItem>{["A","B","C"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><Label className="text-xs">Prioridade</Label>
            <Select value={fPri || ALL} onValueChange={v => setFPri(v === ALL ? "" : v)}><SelectTrigger className="w-32"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>Todas</SelectItem>{["P1","P2","P3"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><Label className="text-xs">Rota</Label>
            <Select value={fRota || ALL} onValueChange={v => setFRota(v === ALL ? "" : v)}><SelectTrigger className="w-40"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>Todas</SelectItem>{ROTAS_NOMES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><Label className="text-xs">Status</Label>
            <Select value={fStatus || ALL} onValueChange={v => setFStatus(v === ALL ? "" : v)}><SelectTrigger className="w-36"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>Todos</SelectItem>{statuses.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
          </div>
          <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Novo cliente</Button>
        </div>
        <div className="mt-3 flex gap-4 text-sm">
          <Badge variant="outline">Clientes: {lista.length}</Badge>
          <Badge variant="outline">Área total: {fmtNum(totais.area)} ha</Badge>
          <Badge variant="outline">Potencial: {fmtBRL(totais.potencial)}</Badge>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Cidades disponíveis: {cidades.join(", ")}</p>
      </Card>

      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Cliente</TableHead><TableHead>ABC</TableHead>
            <TableHead>Rota</TableHead><TableHead>Cidade</TableHead><TableHead>Culturas</TableHead>
            <TableHead className="text-right">Área (ha)</TableHead><TableHead className="text-right">Potencial</TableHead>
            <TableHead>Status</TableHead><TableHead>Última visita</TableHead><TableHead>Próxima ação</TableHead><TableHead>Próximo retorno</TableHead><TableHead className="text-right">Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {lista.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.nome}</TableCell>
                <TableCell><Badge variant="outline">{c.abc}</Badge></TableCell>
                                <TableCell>{c.rota}</TableCell><TableCell>{c.cidade}</TableCell><TableCell className="max-w-[160px] truncate">{c.culturas}</TableCell>
                <TableCell className="text-right">{fmtNum(c.areaHa)}</TableCell>
                <TableCell className="text-right">{fmtBRL(c.potencialTotal)}</TableCell>
                <TableCell>{c.statusAtual} {atrasado(c) && <Badge className="ml-1" variant="destructive">Atrasado</Badge>}</TableCell><TableCell>{formatDateBR(ultimaVisita(c.id)) || "Sem visita registrada"}</TableCell><TableCell>{proximaAcaoPendente(c.id)?.descricao || "—"}</TableCell><TableCell>{formatDateBR(proximaAcaoPendente(c.id)?.data || c.retorno)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setView(c)}><Eye className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Excluir cliente?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => { setClientes(prev => prev.filter(x => x.id !== c.id)); toast.success("Cliente excluído."); }}>Excluir</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{edit ? "Editar cliente" : "Novo cliente"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2"><Label>Nome</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
            <div><Label>ABC</Label><Select value={form.abc} onValueChange={(v: ABC) => setForm({ ...form, abc: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["A","B","C"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Prioridade</Label><Select value={form.prioridade} onValueChange={v => setForm({ ...form, prioridade: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["P1","P2","P3"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Rota</Label><Select value={form.rota} onValueChange={v => setForm({ ...form, rota: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROTAS_NOMES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Cidade</Label><Input value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} /></div>
            <div><Label>Localidade</Label><Input value={form.localidade} onChange={e => setForm({ ...form, localidade: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Culturas do cliente</Label><div className="space-y-2">{normalizarCulturas(form.culturasDetalhes, form.culturas).map((item, idx) => <div key={item.id} className="grid grid-cols-12 gap-2"><Select value={item.cultura} onValueChange={v=>{ const next=[...normalizarCulturas(form.culturasDetalhes, form.culturas)]; next[idx]={...item,cultura:v}; setForm({...form,culturasDetalhes:next,culturas:next.map(x=>x.cultura).join(", "),areaHa:next.reduce((s,x)=>s+(x.areaHa||0),0)});}}><SelectTrigger className="col-span-7"><SelectValue/></SelectTrigger><SelectContent>{CULTURAS_SUGERIDAS.map(c=> <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><Input className="col-span-4" type="number" step="0.01" value={item.areaHa} onChange={e=>{ const next=[...normalizarCulturas(form.culturasDetalhes, form.culturas)]; next[idx]={...item,areaHa:+e.target.value}; setForm({...form,culturasDetalhes:next,culturas:next.map(x=>x.cultura).join(", "),areaHa:next.reduce((s,x)=>s+(x.areaHa||0),0)});}} /><Button className="col-span-1" variant="ghost" onClick={()=>{ const next=normalizarCulturas(form.culturasDetalhes, form.culturas).filter((_,i)=>i!==idx); setForm({...form,culturasDetalhes:next,culturas:next.map(x=>x.cultura).join(", "),areaHa:next.reduce((s,x)=>s+(x.areaHa||0),0)});}}><Trash2 className="h-3 w-3"/></Button></div>)}<Button type="button" variant="outline" onClick={()=>{ const next=[...normalizarCulturas(form.culturasDetalhes, form.culturas),{id:`ca-${Date.now()}`,cultura:"Soja",areaHa:0} as ClienteCulturaArea]; setForm({...form,culturasDetalhes:next}); }}>Adicionar cultura</Button></div></div>
            <div><Label>Área (ha)</Label><Input type="number" step="0.01" value={form.areaHa} disabled /></div>
            <div><Label>Potencial total</Label><Input type="number" step="0.01" value={ticketAtivo > 0 ? form.areaHa * ticketAtivo : 0} disabled /></div>
            <div className="md:col-span-2 text-xs text-muted-foreground">Potencial calculado automaticamente com base na área do cliente e nos tickets médios ativos por linha de produto.</div>
            <div><Label>Inativo manual</Label><Select value={form.inativoManual ? "1":"0"} onValueChange={v=>setForm({ ...form, inativoManual: v==="1" })}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="0">Não</SelectItem><SelectItem value="1">Sim</SelectItem></SelectContent></Select></div>
            <div><Label>Status atual</Label><Input value={form.statusAtual} disabled /></div>
            <div><Label>Frequência de retorno</Label><Input value={form.frequenciaRetorno} onChange={e => setForm({ ...form, frequenciaRetorno: e.target.value })} /></div>
            
            <div><Label>CPF/CNPJ</Label><Input value={form.documento || ""} onChange={e => setForm({ ...form, documento: e.target.value })} /></div>
            <div><Label>Inscrição estadual</Label><Input value={form.inscricaoEstadual || ""} onChange={e => setForm({ ...form, inscricaoEstadual: e.target.value })} /></div>
            <div><Label>Telefone</Label><Input value={form.telefone || ""} onChange={e => setForm({ ...form, telefone: e.target.value })} /></div>
            <div><Label>E-mail</Label><Input value={form.email || ""} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Nome do contato</Label><Input value={form.nomeContato || ""} onChange={e => setForm({ ...form, nomeContato: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={save}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!view} onOpenChange={o => !o && setView(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{view?.nome}</DialogTitle></DialogHeader>
          {view && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">ABC:</span> {view.abc}</div>
              <div><span className="text-muted-foreground">Prioridade:</span> {view.prioridade}</div>
              <div><span className="text-muted-foreground">Rota:</span> {view.rota}</div>
              <div><span className="text-muted-foreground">Cidade:</span> {view.cidade}</div>
              <div><span className="text-muted-foreground">Localidade:</span> {view.localidade}</div>
              <div><span className="text-muted-foreground">Culturas:</span> {view.culturas}</div>
              <div><span className="text-muted-foreground">Área:</span> {fmtNum(view.areaHa)} ha</div>
              <div><span className="text-muted-foreground">Potencial:</span> {fmtBRL(view.potencialTotal)}</div>
              <div><span className="text-muted-foreground">Status:</span> {view.statusAtual}</div>
              <div><span className="text-muted-foreground">Frequência:</span> {view.frequenciaRetorno}</div>
              <div><span className="text-muted-foreground">Próximo retorno:</span> {formatDateBR(proximaAcaoPendente(view.id)?.data || view.retorno)}</div>
              <div><span className="text-muted-foreground">Visitas realizadas:</span> {totalVisitas(view.id)}</div>
              <div><span className="text-muted-foreground">Última visita:</span> {formatDateBR(ultimaVisita(view.id)) || "Sem visita registrada"}</div>
              <div><span className="text-muted-foreground">Próxima ação:</span> {proximaAcaoPendente(view.id)?.descricao || "—"}</div>
              <div><span className="text-muted-foreground">Negócios:</span> {negocios.filter(n=>n.clienteId===view.id).length}</div>
              <div><span className="text-muted-foreground">Orçamentos:</span> {orcamentos.filter(o=>o.clienteId===view.id).length}</div>
              <div><span className="text-muted-foreground">Próximas ações abertas:</span> {totalProximasAcoesAbertas(view.id)}</div>
              <div className="col-span-2 mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => nav(`/lancamentos?clienteId=${view.id}`)}>Nova visita</Button><Button size="sm" variant="outline" onClick={() => nav(`/funil?clienteId=${view.id}`)}>Nova oportunidade</Button><Button size="sm" variant="outline" onClick={() => nav(`/orcamentos?clienteId=${view.id}`)}>Novo orçamento</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
