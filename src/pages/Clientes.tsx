import { useMemo, useState } from "react";
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
import { Cliente, ABC, Prioridade } from "@/types";
import { fmtBRL, fmtNum } from "@/utils/calculations";
import { Plus, Pencil, Trash2, Eye, Search } from "lucide-react";
import { toast } from "sonner";

const ALL = "__all__";
const empty: Omit<Cliente, "id"> = {
  nome: "", abc: "A", prioridade: "P2", rota: "Rota Norte", cidade: "", localidade: "", culturas: "",
  areaHa: 0, potencialTotal: 0, statusAtual: "Ativo", frequencia: "Mensal", retorno: "Médio",
};

export default function Clientes() {
  const { clientes, setClientes } = useAppStore();
  const [busca, setBusca] = useState("");
  const [fAbc, setFAbc] = useState(""); const [fPri, setFPri] = useState(""); const [fRota, setFRota] = useState(""); const [fStatus, setFStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Cliente | null>(null);
  const [form, setForm] = useState<Omit<Cliente, "id">>(empty);
  const [view, setView] = useState<Cliente | null>(null);

  const cidades = useMemo(() => Array.from(new Set(clientes.map(c => c.cidade))), [clientes]);
  const statuses = useMemo(() => Array.from(new Set(clientes.map(c => c.statusAtual))), [clientes]);

  const lista = useMemo(() => clientes.filter(c =>
    (!busca || c.nome.toLowerCase().includes(busca.toLowerCase())) &&
    (!fAbc || c.abc === fAbc) && (!fPri || c.prioridade === fPri) &&
    (!fRota || c.rota === fRota) && (!fStatus || c.statusAtual === fStatus)
  ), [clientes, busca, fAbc, fPri, fRota, fStatus]);

  const totais = useMemo(() => ({
    potencial: lista.reduce((s, c) => s + c.potencialTotal, 0),
    area: lista.reduce((s, c) => s + c.areaHa, 0),
  }), [lista]);

  const openNew = () => { setEdit(null); setForm(empty); setOpen(true); };
  const openEdit = (c: Cliente) => { setEdit(c); const { id, ...rest } = c; void id; setForm(rest); setOpen(true); };
  const save = () => {
    if (!form.nome) return toast.error("Nome obrigatório.");
    if (edit) setClientes(prev => prev.map(c => c.id === edit.id ? { ...form, id: edit.id } : c));
    else setClientes(prev => [...prev, { ...form, id: `c${Date.now()}` }]);
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
            <TableHead>Cliente</TableHead><TableHead>ABC</TableHead><TableHead>Prio</TableHead>
            <TableHead>Rota</TableHead><TableHead>Cidade</TableHead><TableHead>Culturas</TableHead>
            <TableHead className="text-right">Área (ha)</TableHead><TableHead className="text-right">Potencial</TableHead>
            <TableHead>Status</TableHead><TableHead>Freq.</TableHead><TableHead>Retorno</TableHead><TableHead className="text-right">Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {lista.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.nome}</TableCell>
                <TableCell><Badge variant="outline">{c.abc}</Badge></TableCell>
                <TableCell><Badge variant="outline">{c.prioridade}</Badge></TableCell>
                <TableCell>{c.rota}</TableCell><TableCell>{c.cidade}</TableCell><TableCell className="max-w-[160px] truncate">{c.culturas}</TableCell>
                <TableCell className="text-right">{fmtNum(c.areaHa)}</TableCell>
                <TableCell className="text-right">{fmtBRL(c.potencialTotal)}</TableCell>
                <TableCell>{c.statusAtual}</TableCell><TableCell>{c.frequencia}</TableCell><TableCell>{c.retorno}</TableCell>
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
            <div><Label>Prioridade</Label><Select value={form.prioridade} onValueChange={(v: Prioridade) => setForm({ ...form, prioridade: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["P1","P2","P3"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Rota</Label><Select value={form.rota} onValueChange={v => setForm({ ...form, rota: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROTAS_NOMES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Cidade</Label><Input value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} /></div>
            <div><Label>Localidade</Label><Input value={form.localidade} onChange={e => setForm({ ...form, localidade: e.target.value })} /></div>
            <div><Label>Culturas</Label><Input value={form.culturas} onChange={e => setForm({ ...form, culturas: e.target.value })} /></div>
            <div><Label>Área (ha)</Label><Input type="number" value={form.areaHa} onChange={e => setForm({ ...form, areaHa: +e.target.value })} /></div>
            <div><Label>Potencial total</Label><Input type="number" value={form.potencialTotal} onChange={e => setForm({ ...form, potencialTotal: +e.target.value })} /></div>
            <div><Label>Status atual</Label><Input value={form.statusAtual} onChange={e => setForm({ ...form, statusAtual: e.target.value })} /></div>
            <div><Label>Frequência</Label><Input value={form.frequencia} onChange={e => setForm({ ...form, frequencia: e.target.value })} /></div>
            <div><Label>Retorno</Label><Input value={form.retorno} onChange={e => setForm({ ...form, retorno: e.target.value })} /></div>
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
              <div><span className="text-muted-foreground">Frequência:</span> {view.frequencia}</div>
              <div><span className="text-muted-foreground">Retorno:</span> {view.retorno}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}