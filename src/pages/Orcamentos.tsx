import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppStore } from "@/store/AppStore";
import { Orcamento, OrcamentoItem, OrcamentoStatus, UnidadeDose } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtBRL } from "@/utils/calculations";
import { toast } from "sonner";

const UNIDADES: UnidadeDose[] = ["L/ha", "mL/ha", "kg/ha", "g/ha", "ton/ha", "un/ha"];
const STATUS: OrcamentoStatus[] = ["Rascunho", "Enviado", "Aprovado", "Reprovado", "Cancelado"];
const validade7 = (data: string) => { const d = new Date(data + "T00:00:00"); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); };

export default function Orcamentos() {
  const { orcamentos, setOrcamentos, clientes, produtos, empresas, negocios } = useAppStore();
  const [params, setParams] = useSearchParams();
  const negocioId = params.get("negocioId");
  const empresaPadrao = empresas.find(e => e.padrao && e.ativa)?.id || empresas.find(e => e.ativa)?.id || "";
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Orcamento | null>(null);
  const [form, setForm] = useState<Orcamento>({ id: "", codigo: `ORC-${Date.now()}`, clienteId: "", empresaId: empresaPadrao, vendedor: "", data: new Date().toISOString().slice(0, 10), validade: validade7(new Date().toISOString().slice(0, 10)), status: "Rascunho", areaAplicacaoHa: 0, itens: [], subtotal: 0, descontoTotal: 0, valorTotal: 0, custoPorHectare: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

  useEffect(() => {
    if (!negocioId) return;
    const n = negocios.find(x => x.id === negocioId);
    if (!n) return;
    const itens: OrcamentoItem[] = n.produtos.map((pid, idx) => {
      const p = produtos.find(pp => pp.id === pid);
      return { id: `i${Date.now()}-${idx}`, produtoId: pid, produtoNome: p?.nome || "Produto", categoria: p?.categoria || "", unidadeProduto: p?.unidade || "LT", dosePorHa: 0, unidadeDose: "L/ha", areaHa: clientes.find(c => c.id === n.clienteId)?.areaHa || 0, quantidadeTotal: 0, precoUnitario: p?.precoLista || 0, valorTotalItem: 0, custoPorHaItem: 0 };
    });
    setForm(f => ({ ...f, clienteId: n.clienteId, negocioId: n.id, vendedor: n.vendedor, empresaId: empresaPadrao, areaAplicacaoHa: clientes.find(c => c.id === n.clienteId)?.areaHa || 0, itens }));
    setEdit(null); setOpen(true); setParams({});
  }, [negocioId]);

  const total = useMemo(() => form.itens.reduce((s, i) => s + (i.quantidadeTotal * i.precoUnitario), 0), [form.itens]);

  const save = () => {
    if (!form.clienteId || !form.empresaId) return toast.error("Preencha cliente e empresa");
    const payload = { ...form, subtotal: total, valorTotal: total, custoPorHectare: form.areaAplicacaoHa > 0 ? total / form.areaAplicacaoHa : 0, updatedAt: new Date().toISOString() };
    setOrcamentos(p => edit ? p.map(o => o.id === edit.id ? payload : o) : [{ ...payload, id: `orc${Date.now()}`, createdAt: new Date().toISOString() }, ...p]);
    setOpen(false);
  };

  return <div className="space-y-3"><Button onClick={() => { setEdit(null); setOpen(true); }}>Novo orçamento</Button>
    {orcamentos.map(o => <Card key={o.id} className="p-3 flex gap-2"><div className="flex-1">{o.codigo} - {fmtBRL(o.valorTotal)} - {o.status}</div><Button size="sm" variant="outline" onClick={() => { setEdit(o); setForm(o); setOpen(true); }}>Editar</Button><Button size="sm">PDF</Button></Card>)}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>Orçamento</DialogTitle></DialogHeader>
      <div className="grid md:grid-cols-4 gap-2"><div><Label>Cliente</Label><Select value={form.clienteId} onValueChange={v => setForm({ ...form, clienteId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></div><div><Label>Empresa</Label><Select value={form.empresaId || ""} onValueChange={v => setForm({ ...form, empresaId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{empresas.filter(e => e.ativa).map(e => <SelectItem key={e.id} value={e.id}>{e.nomeFantasia}</SelectItem>)}</SelectContent></Select></div><div><Label>Validade</Label><Input type="date" value={form.validade || ""} onChange={e => setForm({ ...form, validade: e.target.value })} /></div></div>
      {form.itens.map((it, idx) => <Card key={it.id} className="p-2 mt-2 grid md:grid-cols-5 gap-2"><Select value={it.produtoId} onValueChange={v => { const p = produtos.find(pp => pp.id === v); const itens = [...form.itens]; itens[idx] = { ...it, produtoId: v, produtoNome: p?.nome || "", precoUnitario: p?.precoLista || 0, unidadeProduto: p?.unidade || "LT", categoria: p?.categoria || "" }; setForm({ ...form, itens }); }}><SelectTrigger><SelectValue placeholder="Produto" /></SelectTrigger><SelectContent>{produtos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent></Select><Input type="number" placeholder="Qtd" value={it.quantidadeTotal} onChange={e => { const itens = [...form.itens]; itens[idx] = { ...it, quantidadeTotal: +e.target.value }; setForm({ ...form, itens }); }} /><Input type="number" placeholder="Preço" value={it.precoUnitario} onChange={e => { const itens = [...form.itens]; itens[idx] = { ...it, precoUnitario: +e.target.value }; setForm({ ...form, itens }); }} /><Select value={it.unidadeDose} onValueChange={(v: UnidadeDose) => { const itens = [...form.itens]; itens[idx] = { ...it, unidadeDose: v }; setForm({ ...form, itens }); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select><Button variant="ghost" onClick={() => setForm({ ...form, itens: form.itens.filter((_, i) => i !== idx) })}>Remover</Button></Card>)}
      <Button variant="outline" onClick={() => setForm({ ...form, itens: [...form.itens, { id: `i${Date.now()}`, produtoId: "", produtoNome: "", categoria: "", unidadeProduto: "LT", dosePorHa: 0, unidadeDose: "L/ha", areaHa: form.areaAplicacaoHa, quantidadeTotal: 0, precoUnitario: 0, valorTotalItem: 0, custoPorHaItem: 0 }] })}>Adicionar item</Button>
      <div>Valor total: {fmtBRL(total)}</div>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></DialogFooter>
    </DialogContent></Dialog></div>;
}
