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

const STATUS: OrcamentoStatus[] = ["Rascunho", "Enviado", "Em revisão", "Reenviado", "Aprovado", "Perdido", "Expirado", "Cancelado", "Aberto", "Em negociação", "Recusado", "Vencido", "Reprovado"];
const validade7 = (base: string) => new Date(new Date(base).getTime() + 7 * 86400000).toISOString().slice(0, 10);

export default function Orcamentos() {
const { orcamentos, setOrcamentos, clientes, produtos, empresas, negocios, oportunidades, formasPagamento, proximasAcoes, setNegocios, setProximasAcoes } = useAppStore();
const [params] = useSearchParams();
const empresaPadrao = empresas.find(e => e.padrao && e.ativa)?.id || empresas.find(e => e.ativa)?.id || "";
const formaPagamentoPadrao = formasPagamento.find((f) => f.padrao && f.ativo)?.nome || formasPagamento.find((f) => f.ativo)?.nome || "";
const [open, setOpen] = useState(false);
const [edit, setEdit] = useState<Orcamento | null>(null);
const [form, setForm] = useState<Orcamento>({ id: "", codigo: `ORC-${Date.now()}`, clienteId: "", empresaId: empresaPadrao, vendedor: "", data: new Date().toISOString().slice(0, 10), validade: validade7(new Date().toISOString().slice(0, 10)), status: "Aberto", areaAplicacaoHa: 0, itens: [], subtotal: 0, descontoTotal: 0, valorTotal: 0, custoPorHectare: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), prazoPagamento: "", formaPagamento: formaPagamentoPadrao });

useEffect(() => { const negocioId = params.get("negocioId"); if (!negocioId) return; const n = negocios.find(x => x.id === negocioId); if (!n) return; const ja = orcamentos.find(o => o.negocioId===negocioId); if (ja) { setEdit(ja); setForm(ja); setOpen(true); return; } setForm(f=>({ ...f, clienteId: n.clienteId, negocioId: n.id, vendedor: n.vendedor })); setOpen(true); }, [params, negocios, orcamentos]);

const recalc = (next: Orcamento) => { const itens = next.itens.map((it)=>{ const p = produtos.find(pp=>pp.id===it.produtoId); return p ? recalcularItem(it,p) : it; }); const total = itens.reduce((s,i)=>s+i.valorTotalItem,0); return { ...next, itens, subtotal: total, valorTotal: total, custoPorHectare: next.areaAplicacaoHa>0 ? total/next.areaAplicacaoHa : 0 }; };
const save = () => { const payload = recalc({ ...form, updatedAt: new Date().toISOString() }); if (!payload.clienteId) return toast.error("Cliente obrigatório"); setOrcamentos(p => edit ? p.map(o => o.id === edit.id ? payload : o) : [{ ...payload, id: `orc${Date.now()}`, createdAt: new Date().toISOString() }, ...p]); if (payload.status === "Aprovado") { const valor = payload.valorTotal || 0; setNegocios(prev => { const existente = payload.negocioId ? prev.find(n => n.id === payload.negocioId) : prev.find(n => n.clienteId === payload.clienteId && n.status === "Fechado ganho" && Math.abs((n.valorFechado || 0) - valor) < 0.01); if (existente) return prev.map(n => n.id === existente.id ? { ...n, status: "Fechado ganho", valorFechado: n.valorFechado || valor, ultimaAtualizacao: new Date().toISOString().slice(0,10) } : n); return [{ id: `n${Date.now()}`, nome: `Negócio ${payload.codigo}`, clienteId: payload.clienteId, vendedor: payload.vendedor || "", origem: "Outro", produtos: [], categoria: "Outros", valorPotencial: valor, valorFechado: valor, status: "Fechado ganho", dataCriacao: payload.data, ultimaAtualizacao: new Date().toISOString().slice(0,10) }, ...prev]; }); } if ((payload.status === "Perdido" || payload.status === "Recusado" || payload.status === "Vencido") && payload.data) { setProximasAcoes(prev => [{ id: `pa${Date.now()}`, clienteId: payload.clienteId, orcamentoId: payload.id, responsavel: payload.responsavel || payload.vendedor || "", descricao: `Follow-up pós orçamento perdido: ${payload.codigo}`, tipo: "Ligação", data: payload.data, status: "Pendente", origem: "Orçamento", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...prev]); } setOpen(false); toast.success("Orçamento salvo"); };
useEffect(() => {
  setForm((prev) => prev.formaPagamento ? prev : { ...prev, formaPagamento: formaPagamentoPadrao });
}, [formaPagamentoPadrao]);

const addItem = () => setForm(f => ({ ...f, itens: [...f.itens, { id: `i${Date.now()}`, produtoId: "", produtoNome: "", categoria: "", unidadeProduto: "LT", dosePorHa: 0, unidadeDose: "L/ha", areaHa: f.areaAplicacaoHa, quantidadeTotal: 0, precoUnitario: 0, valorTotalItem: 0, custoPorHaItem: 0 }] }));

return <div className="space-y-3"><Button onClick={() => { setEdit(null); setOpen(true); }}>Novo orçamento</Button>
{orcamentos.map(o => <Card key={o.id} className="p-3">
  <div className="flex flex-col gap-2 md:flex-row md:items-center">
    <div className="flex-1 text-sm">
      <div className="font-semibold">{o.codigo} · {clientes.find(c=>c.id===o.clienteId)?.nome || "Sem cliente"}</div>
      <div className="text-muted-foreground">Empresa: {empresas.find(e=>e.id===o.empresaId)?.nomeFantasia || "-"} · Validade: {o.validade} · {o.status}</div>
      <div className="text-muted-foreground">Forma: {o.formaPagamento || "-"} · Prazo: {o.prazoPagamento || "-"}</div>
    </div>
    <div className="text-sm font-semibold">{fmtBRL(o.valorTotal)}</div>
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => { setEdit(o); setForm(o); setOpen(true); }}>Abrir/Editar</Button>
      <Button size="sm" onClick={() => gerarPdfOrcamento(o, clientes.find(c=>c.id===o.clienteId), empresas.find(e=>e.id===o.empresaId))}>PDF</Button>
    </div>
  </div>
  </Card>)}
<Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto max-w-5xl"><DialogHeader><DialogTitle>{edit ? "Editar" : "Novo"} orçamento</DialogTitle></DialogHeader>
<div className="grid gap-2 md:grid-cols-5">
<div><Label>Data</Label><Input type="date" value={form.data} onChange={e=>setForm({...form,data:e.target.value})} /></div>
<div><Label>Segmento comercial</Label><Input value={form.segmento || ""} onChange={e=>setForm({...form,segmento:e.target.value})} /></div>
<div><Label>Responsável</Label><Input value={form.responsavel || form.vendedor || ""} onChange={e=>setForm({...form,responsavel:e.target.value, vendedor:e.target.value})} /></div><div><Label>Cliente</Label><Select value={form.clienteId} onValueChange={v=>setForm({...form, clienteId:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{clientes.map(c=><SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></div><div><Label>Oportunidade vinculada</Label><Select value={form.oportunidadeId || "legacy"} onValueChange={v=>setForm({...form, oportunidadeId:v === "legacy" ? undefined : v})}><SelectTrigger><SelectValue placeholder="Opcional"/></SelectTrigger><SelectContent><SelectItem value="legacy">Orçamento legado/sem vínculo</SelectItem>{oportunidades.filter(o=>o.clienteId===form.clienteId).map(o=><SelectItem key={o.id} value={o.id}>{o.etapa} · {o.necessidade || o.id}</SelectItem>)}</SelectContent></Select></div>
<div><Label>Empresa</Label><Select value={form.empresaId} onValueChange={v=>setForm({...form, empresaId:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{empresas.filter(e=>e.ativa).map(e=><SelectItem key={e.id} value={e.id}>{e.nomeFantasia}</SelectItem>)}</SelectContent></Select></div>
<div><Label>Área aplicada (ha)</Label><Input type="number" value={form.areaAplicacaoHa} onChange={e=>setForm(recalc({ ...form, areaAplicacaoHa:+e.target.value }))}/></div>
<div><Label>Status</Label><Select value={form.status} onValueChange={(v: OrcamentoStatus)=>setForm({...form,status:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{STATUS.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
<div><Label>Prazo de pagamento</Label><Input value={form.prazoPagamento || ""} onChange={e=>setForm({...form,prazoPagamento:e.target.value})} /></div>


<div><Label>Próxima ação</Label><Select value={form.proximaAcaoId || "none"} onValueChange={v=>setForm({...form,proximaAcaoId:v === "none" ? undefined : v})}><SelectTrigger><SelectValue placeholder="Opcional"/></SelectTrigger><SelectContent><SelectItem value="none">Sem vínculo</SelectItem>{proximasAcoes.map(a=><SelectItem key={a.id} value={a.id}>{a.descricao}</SelectItem>)}</SelectContent></Select></div>

<div className="md:col-span-2"><Label>Observações</Label><Input value={form.observacoes || ""} onChange={e=>setForm({...form,observacoes:e.target.value})} /></div>
<div><Label>Forma de pagamento</Label><Select value={form.formaPagamento || ""} onValueChange={v=>setForm({...form,formaPagamento:v})}><SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger><SelectContent>{formasPagamento.filter(f=>f.ativo).map(f=><SelectItem key={f.id} value={f.nome}>{f.nome}</SelectItem>)}</SelectContent></Select></div></div>

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
