import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAppStore } from "@/store/AppStore";
import { Produto, CATEGORIAS_PRODUTO, CategoriaProduto } from "@/types";
import { fmtBRL, fmtNum } from "@/utils/calculations";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

const ALL = "__all__";
const empty: Omit<Produto, "id"> = {
  codigo: "", nome: "", categoria: "Adjuvantes", linha: "", unidade: "L",
  fornecedor: "", precoLista: 0, precoMinimo: 0, custo: 0, margem: 0,
  estoqueAtual: 0, estoqueReservado: 0, localEstoque: "", ativo: true,
};

export default function Produtos() {
  const { produtos, setProdutos } = useAppStore();
  const [busca, setBusca] = useState(""); const [fCat, setFCat] = useState(""); const [fForn, setFForn] = useState(""); const [fStatus, setFStatus] = useState("");
  const [open, setOpen] = useState(false); const [edit, setEdit] = useState<Produto | null>(null); const [form, setForm] = useState(empty);

  const fornecedores = useMemo(() => Array.from(new Set(produtos.map(p => p.fornecedor).filter(Boolean) as string[])), [produtos]);

  const list = useMemo(() => produtos.filter(p =>
    (!busca || p.nome.toLowerCase().includes(busca.toLowerCase()) || p.codigo.toLowerCase().includes(busca.toLowerCase())) &&
    (!fCat || p.categoria === fCat) && (!fForn || p.fornecedor === fForn) &&
    (!fStatus || (fStatus === "ativo" ? p.ativo : !p.ativo))
  ), [produtos, busca, fCat, fForn, fStatus]);

  const openNew = () => { setEdit(null); setForm(empty); setOpen(true); };
  const openEdit = (p: Produto) => { setEdit(p); const { id, ...rest } = p; void id; setForm(rest); setOpen(true); };
  const save = () => {
    if (!form.nome || !form.codigo) return toast.error("Código e nome obrigatórios.");
    if (edit) setProdutos(prev => prev.map(p => p.id === edit.id ? { ...form, id: edit.id } : p));
    else setProdutos(prev => [...prev, { ...form, id: `p${Date.now()}` }]);
    setOpen(false); toast.success("Produto salvo.");
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Label className="text-xs">Buscar</Label>
            <Search className="absolute left-2 top-[30px] h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-7" placeholder="Nome ou código..." value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <div><Label className="text-xs">Categoria</Label>
            <Select value={fCat || ALL} onValueChange={v => setFCat(v === ALL ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>Todas</SelectItem>{CATEGORIAS_PRODUTO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Fornecedor</Label>
            <Select value={fForn || ALL} onValueChange={v => setFForn(v === ALL ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>Todos</SelectItem>{fornecedores.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Status</Label>
            <Select value={fStatus || ALL} onValueChange={v => setFStatus(v === ALL ? "" : v)}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>Todos</SelectItem><SelectItem value="ativo">Ativo</SelectItem><SelectItem value="inativo">Inativo</SelectItem></SelectContent>
            </Select>
          </div>
          <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Novo produto</Button>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Código</TableHead><TableHead>Nome</TableHead><TableHead>Categoria</TableHead>
            <TableHead>Linha</TableHead><TableHead>Un.</TableHead><TableHead>Fornecedor</TableHead>
            <TableHead className="text-right">Preço lista</TableHead><TableHead className="text-right">Preço mín.</TableHead>
            <TableHead className="text-right">Custo</TableHead><TableHead className="text-right">Margem%</TableHead>
            <TableHead className="text-right">Estoque</TableHead><TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {list.map(p => {
              const disp = p.estoqueAtual - p.estoqueReservado;
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.codigo}</TableCell>
                  <TableCell className="font-medium">{p.nome}</TableCell>
                  <TableCell><Badge variant="outline">{p.categoria}</Badge></TableCell>
                  <TableCell>{p.linha}</TableCell><TableCell>{p.unidade}</TableCell><TableCell>{p.fornecedor}</TableCell>
                  <TableCell className="text-right">{fmtBRL(p.precoLista)}</TableCell>
                  <TableCell className="text-right">{fmtBRL(p.precoMinimo)}</TableCell>
                  <TableCell className="text-right">{fmtBRL(p.custo)}</TableCell>
                  <TableCell className="text-right">{p.margem ?? "-"}</TableCell>
                  <TableCell className="text-right">{fmtNum(disp)}</TableCell>
                  <TableCell>{p.ativo ? <Badge className="bg-success/15 text-success">Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => { setProdutos(prev => prev.filter(x => x.id !== p.id)); toast.success("Excluído."); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{edit ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-3">
            <div><Label>Código</Label><Input value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Nome</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
            <div><Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={(v: CategoriaProduto) => setForm({ ...form, categoria: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIAS_PRODUTO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Linha</Label><Input value={form.linha} onChange={e => setForm({ ...form, linha: e.target.value })} /></div>
            <div><Label>Unidade</Label><Input value={form.unidade} onChange={e => setForm({ ...form, unidade: e.target.value })} /></div>
            <div><Label>Fornecedor</Label><Input value={form.fornecedor} onChange={e => setForm({ ...form, fornecedor: e.target.value })} /></div>
            <div><Label>Preço lista</Label><Input type="number" value={form.precoLista} onChange={e => setForm({ ...form, precoLista: +e.target.value })} /></div>
            <div><Label>Preço mínimo</Label><Input type="number" value={form.precoMinimo} onChange={e => setForm({ ...form, precoMinimo: +e.target.value })} /></div>
            <div><Label>Custo</Label><Input type="number" value={form.custo} onChange={e => setForm({ ...form, custo: +e.target.value })} /></div>
            <div><Label>Margem (%)</Label><Input type="number" value={form.margem || 0} onChange={e => setForm({ ...form, margem: +e.target.value })} /></div>
            <div><Label>Estoque atual</Label><Input type="number" value={form.estoqueAtual} onChange={e => setForm({ ...form, estoqueAtual: +e.target.value })} /></div>
            <div><Label>Estoque reservado</Label><Input type="number" value={form.estoqueReservado} onChange={e => setForm({ ...form, estoqueReservado: +e.target.value })} /></div>
            <div><Label>Local estoque</Label><Input value={form.localEstoque} onChange={e => setForm({ ...form, localEstoque: e.target.value })} /></div>
            <div><Label>Status</Label>
              <Select value={form.ativo ? "1" : "0"} onValueChange={v => setForm({ ...form, ativo: v === "1" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="1">Ativo</SelectItem><SelectItem value="0">Inativo</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3"><Label>Observações</Label><Textarea rows={2} value={form.observacoes || ""} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
