import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppStore } from "@/store/AppStore";
import { RegraComissao, AplicarSobre, FaixaComissao, CATEGORIAS_PRODUTO } from "@/types";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const APLICAR: { v: AplicarSobre; label: string }[] = [
  { v: "realizado_empresa", label: "Realizado empresa" },
  { v: "realizado_pessoal", label: "Realizado pessoal" },
  { v: "negocio_fechado", label: "Negócio fechado" },
  { v: "categoria", label: "Categoria de produto" },
  { v: "frente_comercial", label: "Frente comercial" },
  { v: "meta_empresa", label: "Meta empresa" },
  { v: "meta_pessoal", label: "Meta pessoal" },
];

const emptyRegra: Omit<RegraComissao, "id"> = {
  nome: "", tipo: "fixa", percentual: 1, aplicarSobre: "negocio_fechado", ativo: true, faixas: [{ min: 80, max: 89, percentual: 0.5 }],
};

export default function Configuracoes() {
  const { regras, setRegras, vendedores, setVendedores } = useAppStore();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<RegraComissao | null>(null);
  const [form, setForm] = useState<Omit<RegraComissao, "id">>(emptyRegra);
  const [novoVend, setNovoVend] = useState("");

  const openNew = () => { setEdit(null); setForm(emptyRegra); setOpen(true); };
  const openEdit = (r: RegraComissao) => { setEdit(r); const { id, ...rest } = r; void id; setForm(rest); setOpen(true); };
  const save = () => {
    if (!form.nome) return toast.error("Nome obrigatório.");
    if (edit) setRegras(prev => prev.map(r => r.id === edit.id ? { ...form, id: edit.id } : r));
    else setRegras(prev => [...prev, { ...form, id: `rc${Date.now()}` }]);
    setOpen(false); toast.success("Regra salva.");
  };

  const addFaixa = () => setForm(f => ({ ...f, faixas: [...(f.faixas || []), { min: 0, max: 100, percentual: 0 }] }));
  const updFaixa = (i: number, k: keyof FaixaComissao, v: number) => setForm(f => ({ ...f, faixas: (f.faixas || []).map((x, idx) => idx === i ? { ...x, [k]: v } : x) }));
  const rmFaixa = (i: number) => setForm(f => ({ ...f, faixas: (f.faixas || []).filter((_, idx) => idx !== i) }));

  return (
    <div className="space-y-4">
      <Tabs defaultValue="comissao">
        <TabsList>
          <TabsTrigger value="comissao">Regras de comissão</TabsTrigger>
          <TabsTrigger value="vendedores">Vendedores</TabsTrigger>
        </TabsList>

        <TabsContent value="comissao" className="space-y-3">
          <div className="flex justify-end"><Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Nova regra</Button></div>
          <Card className="overflow-x-auto p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nome</TableHead><TableHead>Tipo</TableHead>
                <TableHead>Aplicar sobre</TableHead><TableHead>Alvo</TableHead>
                <TableHead>Percentual / Faixas</TableHead><TableHead>Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {regras.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.nome}</TableCell>
                    <TableCell><Badge variant="outline">{r.tipo}</Badge></TableCell>
                    <TableCell>{APLICAR.find(a => a.v === r.aplicarSobre)?.label}</TableCell>
                    <TableCell>{r.alvo || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.tipo === "fixa" ? `${r.percentual}%` : r.faixas?.map(f => `${f.min}-${f.max}%: ${f.percentual}%`).join(" | ")}
                    </TableCell>
                    <TableCell>{r.ativo ? <Badge className="bg-success/15 text-success">Sim</Badge> : <Badge variant="outline">Não</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => { if (!window.confirm("Esta ação não pode ser desfeita nesta versão. Deseja continuar?")) return; setRegras(prev => prev.filter(x => x.id !== r.id)); toast.success("Excluída."); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="vendedores" className="space-y-3">
          <Card className="p-4">
            <div className="flex gap-2">
              <Input placeholder="Nome do vendedor" value={novoVend} onChange={e => setNovoVend(e.target.value)} className="max-w-xs" />
              <Button onClick={() => { if (!novoVend) return; setVendedores(prev => [...prev, { id: `v${Date.now()}`, nome: novoVend }]); setNovoVend(""); toast.success("Vendedor adicionado."); }}><Plus className="mr-1 h-4 w-4" />Adicionar</Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {vendedores.map(v => (
                <Badge key={v.id} variant="outline" className="px-3 py-1">
                  {v.nome}
                  <button className="ml-2 text-destructive" onClick={() => { if (!window.confirm("Esta ação não pode ser desfeita nesta versão. Deseja continuar?")) return; setVendedores(prev => prev.filter(x => x.id !== v.id)); }}>×</button>
                </Badge>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{edit ? "Editar regra" : "Nova regra de comissão"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2"><Label>Nome da regra</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
            <div><Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v: "fixa" | "escalonada") => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="fixa">Fixa</SelectItem><SelectItem value="escalonada">Escalonada</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Aplicar sobre</Label>
              <Select value={form.aplicarSobre} onValueChange={(v: AplicarSobre) => setForm({ ...form, aplicarSobre: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{APLICAR.map(a => <SelectItem key={a.v} value={a.v}>{a.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {(form.aplicarSobre === "categoria" || form.aplicarSobre === "frente_comercial") && (
              <div><Label>Alvo</Label>
                {form.aplicarSobre === "categoria" ? (
                  <Select value={form.alvo || ""} onValueChange={v => setForm({ ...form, alvo: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{CATEGORIAS_PRODUTO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                ) : <Input value={form.alvo || ""} onChange={e => setForm({ ...form, alvo: e.target.value })} />}
              </div>
            )}
            {form.tipo === "fixa" && (
              <div><Label>Percentual (%)</Label><Input type="number" step="0.1" value={form.percentual || 0} onChange={e => setForm({ ...form, percentual: +e.target.value })} /></div>
            )}
            <div className="flex items-end gap-2"><Switch checked={form.ativo} onCheckedChange={v => setForm({ ...form, ativo: v })} /><Label>Ativo</Label></div>
          </div>

          {form.tipo === "escalonada" && (
            <div className="mt-3 rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-sm font-semibold">Faixas escalonadas</Label>
                <Button size="sm" variant="outline" onClick={addFaixa}><Plus className="mr-1 h-3 w-3" /> Faixa</Button>
              </div>
              <div className="space-y-2">
                {(form.faixas || []).map((f, i) => (
                  <div key={i} className="grid grid-cols-4 gap-2">
                    <Input type="number" placeholder="Mín %" value={f.min} onChange={e => updFaixa(i, "min", +e.target.value)} />
                    <Input type="number" placeholder="Máx %" value={f.max} onChange={e => updFaixa(i, "max", +e.target.value)} />
                    <Input type="number" step="0.1" placeholder="% comissão" value={f.percentual} onChange={e => updFaixa(i, "percentual", +e.target.value)} />
                    <Button size="icon" variant="ghost" onClick={() => rmFaixa(i)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
