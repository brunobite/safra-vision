import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppStore } from "@/store/AppStore";
import { Orcamento, OrcamentoItem, OrcamentoStatus, UnidadeDose } from "@/types";
import { fmtBRL } from "@/utils/calculations";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { calcularQuantidadeComercial, DOSE_UNIDADES, recalcularItem } from "@/lib/orcamentoUtils";
import { gerarPdfOrcamento } from "@/lib/orcamentoPdf";

const STATUS: OrcamentoStatus[] = ["Rascunho", "Enviado", "Aprovado", "Reprovado", "Cancelado"];
const validade7 = (base: string) => new Date(new Date(base).getTime() + 7 * 86400000).toISOString().slice(0, 10);

export default function Orcamentos() {
const { orcamentos, setOrcamentos, clientes, produtos, empresas, negocios } = useAppStore();
const [params] = useSearchParams();
const empresaPadrao = empresas.find(e => e.padrao && e.ativa)?.id || empresas.find(e => e.ativa)?.id || "";
const [open, setOpen] = useState(false);
const [edit, setEdit] = useState<Orcamento | null>(null);
const [form, setForm] = useState<Orcamento>({ id: "", codigo: `ORC-${Date.now()}`, clienteId: "", empresaId: empresaPadrao, vendedor: "", data: new Date().toISOString().slice(0, 10), validade: validade7(new Date().toISOString().slice(0, 10)), status: "Rascunho", areaAplicacaoHa: 0, itens: [], subtotal: 0, descontoTotal: 0, valorTotal: 0, custoPorHectare: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), prazoPagamento: "" });

useEffect(() => { const negocioId = params.get("negocioId"); if (!negocioId) return; const n = negocios.find(x => x.id === negocioId); if (!n) return; const ja = orcamentos.find(o => o.negocioId===negocioId); if (ja) { setEdit(ja); setForm(ja); setOpen(true); return; } setForm(f=>({ ...f, clienteId: n.clienteId, negocioId: n.id, vendedor: n.vendedor })); setOpen(true); }, [params, negocios, orcamentos]);

const recalc = (next: Orcamento) => { const itens = next.itens.map((it)=>{ const p = produtos.find(pp=>pp.id===it.produtoId); return p ? recalcularItem(it,p) : it; }); const total = itens.reduce((s,i)=>s+i.valorTotalItem,0); return { ...next, itens, subtotal: total, valorTotal: total, custoPorHectare: next.areaAplicacaoHa>0 ? total/next.areaAplicacaoHa : 0 }; };
const save = () => { const payload = recalc({ ...form, updatedAt: new Date().toISOString() }); if (!payload.clienteId) return toast.error("Cliente obrigatório"); setOrcamentos(p => edit ? p.map(o => o.id === edit.id ? payload : o) : [{ ...payload, id: `orc${Date.now()}`, createdAt: new Date().toISOString() }, ...p]); setOpen(false); toast.success("Orçamento salvo"); };
const addItem = () => setForm(f => ({ ...f, itens: [...f.itens, { id: `i${Date.now()}`, produtoId: "", produtoNome: "", categoria: "", unidadeProduto: "LT", dosePorHa: 0, unidadeDose: "L/ha", areaHa: f.areaAplicacaoHa, quantidadeTotal: 0, precoUnitario: 0, valorTotalItem: 0, custoPorHaItem: 0 }] }));

return <div className="space-y-3"><Button onClick={() => { setEdit(null); setOpen(true); }}>Novo orçamento</Button>
{orcamentos.map(o => <Card key={o.id} className="p-3 flex gap-2"><div className="flex-1">{o.codigo} - {fmtBRL(o.valorTotal)} - {o.status}</div><Button size="sm" variant="outline" onClick={() => { setEdit(o); setForm(o); setOpen(true); }}>Editar</Button><Button size="sm" onClick={() => gerarPdfOrcamento(o, clientes.find(c=>c.id===o.clienteId), empresas.find(e=>e.id===o.empresaId))}>PDF</Button></Card>)}
<Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto max-w-5xl"><DialogHeader><DialogTitle>{edit ? "Editar" : "Novo"} orçamento</DialogTitle></DialogHeader>
<div className="grid gap-2 md:grid-cols-5"><div><Label>Cliente</Label><Select value={form.clienteId} onValueChange={v=>setForm({...form, clienteId:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{clientes.map(c=><SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></div>
<div><Label>Empresa</Label><Select value={form.empresaId} onValueChange={v=>setForm({...form, empresaId:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{empresas.filter(e=>e.ativa).map(e=><SelectItem key={e.id} value={e.id}>{e.nomeFantasia}</SelectItem>)}</SelectContent></Select></div>
<div><Label>Área aplicada (ha)</Label><Input type="number" value={form.areaAplicacaoHa} onChange={e=>setForm(recalc({ ...form, areaAplicacaoHa:+e.target.value }))}/></div>
<div><Label>Status</Label><Select value={form.status} onValueChange={(v: OrcamentoStatus)=>setForm({...form,status:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{STATUS.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
<div><Label>Prazo de pagamento</Label><Input value={form.prazoPagamento || ""} onChange={e=>setForm({...form,prazoPagamento:e.target.value})} /></div></div>

{form.itens.map((it, idx) => { const p = produtos.find(x=>x.id===it.produtoId); const area = it.areaHa || form.areaAplicacaoHa; const calc = calcularQuantidadeComercial((p?.unidade || it.unidadeProduto), it.dosePorHa, it.unidadeDose, area); const total = calc.quantidadeComercial * it.precoUnitario; return <Card key={it.id} className="p-3 space-y-2"><div className="grid gap-2 md:grid-cols-6"><div className="md:col-span-2"><Label>Produto</Label><Select value={it.produtoId} onValueChange={v=>{ const pp=produtos.find(x=>x.id===v); const itens=[...form.itens]; itens[idx]=recalcularItem({ ...it, produtoId:v, precoUnitario: it.precoUnitario||pp?.precoLista||0 }, pp!); setForm(recalc({ ...form, itens })); }}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{produtos.map(pr=><SelectItem key={pr.id} value={pr.id}>{pr.nome}</SelectItem>)}</SelectContent></Select></div>
<div><Label>Dose por hectare</Label><Input type="number" value={it.dosePorHa} onChange={e=>{const itens=[...form.itens]; itens[idx]={...it,dosePorHa:+e.target.value}; setForm(recalc({...form,itens}));}}/></div>
<div><Label>Unidade da dose</Label><Select value={it.unidadeDose} onValueChange={(v: UnidadeDose)=>{const itens=[...form.itens]; itens[idx]={...it,unidadeDose:v}; setForm(recalc({...form,itens}));}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{DOSE_UNIDADES.map(u=><SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
<div><Label>Área aplicada</Label><Input type="number" value={it.areaHa} onChange={e=>{const itens=[...form.itens]; itens[idx]={...it,areaHa:+e.target.value}; setForm(recalc({...form,itens}));}}/></div>
<div><Label>Preço unitário venda</Label><Input type="number" value={it.precoUnitario} onChange={e=>{const itens=[...form.itens]; itens[idx]={...it,precoUnitario:+e.target.value}; setForm(recalc({...form,itens}));}}/></div></div>
{p && <div className="rounded-md border p-2 text-sm">Dados do produto: Nome <b>{p.nome}</b> · Linha/categoria <b>{p.categoria}</b> · Unidade comercial cadastrada <b>{p.unidade}</b> · Preço lista <b>{fmtBRL(p.precoLista)}/{p.unidade}</b> · Preço mínimo <b>{fmtBRL(p.precoMinimo)}</b> · Estoque <b>{p.estoqueAtual}</b></div>}
<div className="grid md:grid-cols-4 gap-2 text-sm"><div><Label>Quantidade total calculada</Label><div><b>{calc.resumo}</b></div></div><div><Label>Unidade da quantidade calculada</Label><div><b>{p?.unidade || it.unidadeProduto}</b></div></div><div><Label>Valor total do item</Label><div><b>{fmtBRL(total)}</b></div></div><div><Label>Custo por hectare do item</Label><div><b>{fmtBRL(area>0?total/area:0)}/ha</b></div></div></div>
<div className="rounded border p-2 text-sm"><b>Cálculo do item</b><ul className="list-disc ml-5"><li>Produto cadastrado em: {p?.unidade}</li><li>Preço considerado: {fmtBRL(it.precoUnitario)}/{p?.unidade}</li><li>Dose informada: {it.dosePorHa} {it.unidadeDose}</li><li>Área aplicada: {area} ha</li><li>Quantidade calculada: {calc.resumo}</li><li>Valor total do item: {fmtBRL(total)}</li><li>Custo por hectare: {fmtBRL(area>0?total/area:0)}/ha</li></ul></div>
</Card>; })}
<Button variant="outline" onClick={addItem}>Adicionar item</Button>
<div className="space-y-1 text-sm"><div>Valor total do orçamento: <b>{fmtBRL(form.valorTotal)}</b></div><div>Custo médio por hectare: <b>{fmtBRL(form.custoPorHectare)}/ha</b></div></div>
<DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></DialogFooter>
</DialogContent></Dialog></div>;
}
