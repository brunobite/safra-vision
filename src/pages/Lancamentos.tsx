import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAppStore } from "@/store/AppStore";
import { Lancamento, TipoLancamento, FrenteComercial, StatusLancamento } from "@/types";
import { fmtBRL, getMes, getSemana } from "@/utils/calculations";
import { GlobalFilters } from "@/components/GlobalFilters";
import { toast } from "sonner";
import { Pencil, Trash2, Save, Eraser, Search } from "lucide-react";

const TIPOS: TipoLancamento[] = ["Visita", "Ligação", "WhatsApp", "Proposta", "Venda", "Evento", "Orçamento", "Em negociação"];
const FRENTES: FrenteComercial[] = ["Venda Direta", "Cooperagro", "Tritec", "Nutrição Especial", "Geo Pampa"];
const STATUSES: StatusLancamento[] = ["Aberto", "Concluído", "Atrasado", "Cancelado", "Aguardando cliente", "Aguardando parceiro", "Em negociação"];

const empty: Omit<Lancamento, "id"> = {
  data: new Date().toISOString().slice(0, 10),
  clienteId: "",
  tipo: "Visita",
  frente: "Venda Direta",
  status: "Aberto",
  vendaRs: 0, comissaoRs: 0, km: 0, despesaRs: 0,
  eventoAcao: "", observacao: "",
};

export default function Lancamentos() {
  const { lancamentos, setLancamentos, clientes, clienteById, filtered } = useAppStore();
  const [form, setForm] = useState<Omit<Lancamento, "id">>(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const cliente = clienteById(form.clienteId);

  const reset = () => { setForm(empty); setEditId(null); };

  const salvar = () => {
    if (!form.clienteId) return toast.error("Selecione um cliente.");
    if (!form.data) return toast.error("Informe a data.");
    if (editId) {
      setLancamentos(prev => prev.map(l => l.id === editId ? { ...form, id: editId } : l));
      toast.success("Lançamento atualizado.");
    } else {
      setLancamentos(prev => [{ ...form, id: `l${Date.now()}` }, ...prev]);
      toast.success("Lançamento criado.");
    }
    reset();
  };

  const editar = (l: Lancamento) => {
    const { id, ...rest } = l;
    void id;
    setForm(rest); setEditId(l.id);
  };

  const excluir = (id: string) => {
    setLancamentos(prev => prev.filter(l => l.id !== id));
    toast.success("Lançamento excluído.");
  };

  const lista = useMemo(() => {
    const f = filtered.lancamentos;
    const q = busca.toLowerCase();
    return f.filter(l => !q || clienteById(l.clienteId)?.nome.toLowerCase().includes(q))
      .sort((a, b) => b.data.localeCompare(a.data));
  }, [filtered.lancamentos, busca, clienteById]);

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="mb-4 text-base font-semibold">{editId ? "Editar lançamento" : "Novo lançamento"}</h2>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          <div><Label>Data *</Label><Input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></div>
          <div><Label>Cliente *</Label>
            <Select value={form.clienteId} onValueChange={v => setForm({ ...form, clienteId: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Tipo *</Label>
            <Select value={form.tipo} onValueChange={(v: TipoLancamento) => setForm({ ...form, tipo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Frente comercial</Label>
            <Select value={form.frente} onValueChange={(v: FrenteComercial) => setForm({ ...form, frente: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FRENTES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Status</Label>
            <Select value={form.status} onValueChange={(v: StatusLancamento) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Venda (R$)</Label><Input type="number" value={form.vendaRs} onChange={e => setForm({ ...form, vendaRs: +e.target.value })} /></div>
          <div><Label>Comissão (R$)</Label><Input type="number" value={form.comissaoRs} onChange={e => setForm({ ...form, comissaoRs: +e.target.value })} /></div>
          <div><Label>Km</Label><Input type="number" value={form.km} onChange={e => setForm({ ...form, km: +e.target.value })} /></div>
          <div><Label>Despesa (R$)</Label><Input type="number" value={form.despesaRs} onChange={e => setForm({ ...form, despesaRs: +e.target.value })} /></div>
          <div><Label>Evento / Ação</Label><Input value={form.eventoAcao || ""} onChange={e => setForm({ ...form, eventoAcao: e.target.value })} /></div>
          <div className="md:col-span-2 lg:col-span-2"><Label>Observação</Label><Textarea rows={2} value={form.observacao || ""} onChange={e => setForm({ ...form, observacao: e.target.value })} /></div>
        </div>

        {cliente && (
          <div className="mt-4 grid gap-2 rounded-md bg-secondary p-3 text-xs sm:grid-cols-2 md:grid-cols-5">
            <div><span className="text-muted-foreground">ABC:</span> <Badge variant="outline">{cliente.abc}</Badge></div>
            <div><span className="text-muted-foreground">Prioridade:</span> <Badge variant="outline">{cliente.prioridade}</Badge></div>
            <div><span className="text-muted-foreground">Rota:</span> {cliente.rota}</div>
            <div><span className="text-muted-foreground">Cidade:</span> {cliente.cidade}</div>
            <div><span className="text-muted-foreground">Semana/Mês:</span> {getSemana(form.data)} / {getMes(form.data)}</div>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button onClick={salvar}><Save className="mr-1 h-4 w-4" /> Salvar</Button>
          <Button variant="outline" onClick={reset}><Eraser className="mr-1 h-4 w-4" /> Limpar</Button>
        </div>
      </Card>

      <GlobalFilters />

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Últimos lançamentos ({lista.length})</h3>
          <div className="relative w-64">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-7" placeholder="Buscar cliente..." value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Tipo</TableHead>
                <TableHead>Frente</TableHead><TableHead>Status</TableHead>
                <TableHead className="text-right">Venda</TableHead><TableHead className="text-right">Comissão</TableHead>
                <TableHead className="text-right">Km</TableHead><TableHead className="w-24 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Nenhum lançamento.</TableCell></TableRow>}
              {lista.map(l => {
                const c = clienteById(l.clienteId);
                return (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap">{l.data}</TableCell>
                    <TableCell>{c?.nome || "—"}</TableCell>
                    <TableCell>{l.tipo}</TableCell>
                    <TableCell>{l.frente}</TableCell>
                    <TableCell><Badge variant="outline">{l.status}</Badge></TableCell>
                    <TableCell className="text-right">{fmtBRL(l.vendaRs)}</TableCell>
                    <TableCell className="text-right">{fmtBRL(l.comissaoRs)}</TableCell>
                    <TableCell className="text-right">{l.km}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => editar(l)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
                              <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => excluir(l.id)}>Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}