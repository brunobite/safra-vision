import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAppStore } from "@/store/AppStore";
import { CategoriaProduto, CATEGORIAS_PRODUTO, FrenteComercial, Lancamento, OrcamentoItem, OrigemNegocio, StatusFunil, StatusLancamento, TipoLancamento, TipoProximaAcao, UnidadeDose } from "@/types";
import { GlobalFilters } from "@/components/GlobalFilters";
import { toast } from "sonner";
import { ArrowRight, Eraser, Pencil, Save, Search, Trash2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

const FRENTES: FrenteComercial[] = ["Venda Direta", "Nutrição Especial", "Geo Pampa", "Canal de Vendas"];
const STATUSES: StatusLancamento[] = ["Aberto", "Concluído", "Atrasado", "Cancelado", "Aguardando cliente", "Aguardando parceiro", "Em negociação"];
const PROX_TIPOS: TipoProximaAcao[] = ["Visita", "Ligação", "Enviar orçamento", "Cobrar retorno", "Pós-venda", "Outro"];

interface ProdutoDraft { produtoId: string; precoUnitario: number; dosePorHa: number; unidadeDose: UnidadeDose; areaHa: number; quantidade: number; }
interface FormState extends Omit<Lancamento, "id"> { oppNome: string; oppCategoria: CategoriaProduto; oppValor: number; oppAreaAplicacaoHa: number; oppCultura: string; oppObservacoes: string; oppStatus: StatusFunil; oppDataProxAcao: string; oppTipoProxAcao: TipoProximaAcao; oppProdutos: ProdutoDraft[]; }

const empty = (): FormState => ({ data: new Date().toISOString().slice(0, 10), clienteId: "", tipo: "Visita", frente: "Venda Direta", status: "Aberto", oQueFoiRealizado: "", vendedor: "Bruno", geraOportunidade: false, proximaAcao: "", dataProximaAcao: "", tipoProximaAcao: "Visita", oppNome: "", oppCategoria: "Adjuvantes", oppValor: 0, oppAreaAplicacaoHa: 0, oppCultura: "", oppObservacoes: "", oppStatus: "Novo", oppDataProxAcao: "", oppTipoProxAcao: "Visita", oppProdutos: [] });

export default function Lancamentos() {
  const { lancamentos, setLancamentos, clientes, clienteById, filtered, vendedores, negocios, setNegocios, setClientes, setProximasAcoes, produtos, setOrcamentos, empresas } = useAppStore();
  const [form, setForm] = useState<FormState>(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    const clienteId = params.get("clienteId");
    if (clienteId) {
      setForm(f => ({ ...f, clienteId }));
      setParams({});
    }
  }, [params]);

  const reset = () => { setForm(empty()); setEditId(null); };
  const addProduto = () => setForm(f => ({ ...f, oppProdutos: [...f.oppProdutos, { produtoId: "", precoUnitario: 0, dosePorHa: 0, unidadeDose: "L/ha", areaHa: f.oppAreaAplicacaoHa || 0, quantidade: 0 }] }));

  const salvar = (gerarOrcamento = false) => {
    if (!form.clienteId || !form.data || !form.oQueFoiRealizado) return toast.error("Preencha os campos obrigatórios da visita.");
    const id = editId || `l${Date.now()}`;
    let negocioId = form.negocioId;
    if (form.geraOportunidade) {
      const negId = negocioId || `n${Date.now()}`;
      const hoje = new Date().toISOString().slice(0, 10);
      setNegocios(prev => [{ id: negId, nome: form.oppNome || `Oportunidade ${clienteById(form.clienteId)?.nome}`, clienteId: form.clienteId, vendedor: form.vendedor || "Bruno", origem: "Visita" as OrigemNegocio, produtos: form.oppProdutos.map(p => p.produtoId).filter(Boolean), categoria: form.oppCategoria, valorPotencial: form.oppValor || 0, status: form.oppStatus, previsaoFechamento: form.oppDataProxAcao, dataCriacao: hoje, ultimaAtualizacao: hoje, proximaAcao: form.proximaAcao || "", dataProximaAcao: form.dataProximaAcao || "", observacoes: [form.oppCultura && `Cultura: ${form.oppCultura}`, form.oppObservacoes].filter(Boolean).join(" | "), lancamentoId: id }, ...prev.filter(n => n.id !== negId)]);
      negocioId = negId;
    }
    const lanc: Lancamento = { id, data: form.data, clienteId: form.clienteId, tipo: "Visita" as TipoLancamento, frente: form.frente, status: form.status, oQueFoiRealizado: form.oQueFoiRealizado, vendedor: form.vendedor, geraOportunidade: form.geraOportunidade, negocioId, proximaAcao: form.proximaAcao, dataProximaAcao: form.dataProximaAcao, tipoProximaAcao: form.tipoProximaAcao };
    setLancamentos(prev => editId ? prev.map(l => l.id === editId ? lanc : l) : [lanc, ...prev]);

    setClientes(prev => prev.map(c => c.id !== form.clienteId ? c : { ...c, ultimaVisita: form.data, proximaAcao: form.proximaAcao || c.proximaAcao, dataProximaAcao: form.dataProximaAcao || c.dataProximaAcao, tipoProximaAcao: form.tipoProximaAcao, statusAtual: form.geraOportunidade ? "Ativo" : "Visita" }));
    if (form.proximaAcao && form.dataProximaAcao) {
      const now = new Date().toISOString();
      setProximasAcoes(prev => [{ id: `pa${Date.now()}`, clienteId: form.clienteId, negocioId, responsavel: form.vendedor, descricao: form.proximaAcao!, tipo: form.tipoProximaAcao || "Visita", data: form.dataProximaAcao!, status: "Pendente", origem: "Lançamento", createdAt: now, updatedAt: now }, ...prev]);
    }

    if (gerarOrcamento && negocioId) {
      const now = new Date();
      const empresaPadrao = empresas.find(e => e.padrao && e.ativa)?.id || empresas.find(e => e.ativa)?.id;
      const itens: OrcamentoItem[] = form.oppProdutos.filter(p => p.produtoId).map((p, idx) => {
        const prod = produtos.find(pp => pp.id === p.produtoId)!;
        const area = p.areaHa || form.oppAreaAplicacaoHa || 0;
        const q = p.quantidade || p.dosePorHa * area;
        const total = q * p.precoUnitario;
        return { id: `i${Date.now()}-${idx}`, produtoId: prod.id, produtoNome: prod.nome, categoria: prod.categoria, unidadeProduto: prod.unidade, dosePorHa: p.dosePorHa || 0, unidadeDose: p.unidadeDose, areaHa: area, quantidadeTotal: q, precoUnitario: p.precoUnitario || prod.precoLista, valorTotalItem: total, custoPorHaItem: area > 0 ? total / area : 0 };
      });
      const subtotal = itens.reduce((s, i) => s + i.valorTotalItem, 0);
      setOrcamentos(prev => [{ id: `orc${Date.now()}`, codigo: `ORC-${Date.now()}`, clienteId: form.clienteId, negocioId, empresaId: empresaPadrao, vendedor: form.vendedor || "", data: now.toISOString().slice(0, 10), validade: new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10), status: "Rascunho", areaAplicacaoHa: form.oppAreaAplicacaoHa, itens, subtotal, descontoTotal: 0, valorTotal: subtotal, custoPorHectare: form.oppAreaAplicacaoHa > 0 ? subtotal / form.oppAreaAplicacaoHa : 0, createdAt: now.toISOString(), updatedAt: now.toISOString() }, ...prev]);
      nav("/orcamentos");
    }

    toast.success(gerarOrcamento ? "Visita, oportunidade e orçamento criados." : "Fluxo salvo.");
    reset();
  };

  const lista = useMemo(() => filtered.lancamentos.filter(l => !busca || clienteById(l.clienteId)?.nome.toLowerCase().includes(busca.toLowerCase())).sort((a, b) => b.data.localeCompare(a.data)), [filtered.lancamentos, busca, clienteById]);

  return <div className="space-y-6"><GlobalFilters />
    <Card className="p-5 space-y-4">
      <h2 className="text-base font-semibold">Fluxo guiado: Visita → Oportunidade → Orçamento</h2>
      <div className="grid gap-3 md:grid-cols-3"><div><Label>Data *</Label><Input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></div><div><Label>Cliente *</Label><Select value={form.clienteId} onValueChange={v => setForm({ ...form, clienteId: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></div><div><Label>Vendedor</Label><Select value={form.vendedor} onValueChange={v => setForm({ ...form, vendedor: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{vendedores.map(v => <SelectItem key={v.id} value={v.nome}>{v.nome}</SelectItem>)}</SelectContent></Select></div></div>
      <div><Label>O que foi realizado? *</Label><Textarea rows={2} value={form.oQueFoiRealizado} onChange={e => setForm({ ...form, oQueFoiRealizado: e.target.value })} /></div>
      <div className="rounded-md border p-3"><Switch checked={!!form.geraOportunidade} onCheckedChange={v => setForm({ ...form, geraOportunidade: v })} /> <Label className="ml-2">Existe oportunidade de negócio?</Label></div>
      {form.geraOportunidade && <div className="space-y-3 rounded-md border bg-primary/5 p-3"><h3 className="font-medium">Oportunidade gerada</h3><div className="grid gap-3 md:grid-cols-3"><div><Label>Título</Label><Input value={form.oppNome} onChange={e => setForm({ ...form, oppNome: e.target.value })} /></div><div><Label>Categoria</Label><Select value={form.oppCategoria} onValueChange={(v: CategoriaProduto) => setForm({ ...form, oppCategoria: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIAS_PRODUTO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div><div><Label>Valor potencial</Label><Input type="number" value={form.oppValor} onChange={e => setForm({ ...form, oppValor: +e.target.value })} /></div><div><Label>Área de aplicação (ha)</Label><Input type="number" value={form.oppAreaAplicacaoHa} onChange={e => setForm({ ...form, oppAreaAplicacaoHa: +e.target.value })} /></div><div><Label>Cultura</Label><Input value={form.oppCultura} onChange={e => setForm({ ...form, oppCultura: e.target.value })} /></div></div>
      {form.oppProdutos.map((it, idx) => <div key={idx} className="grid gap-2 rounded border p-2 md:grid-cols-5"><Select value={it.produtoId} onValueChange={v => { const p = produtos.find(x => x.id === v); const next = [...form.oppProdutos]; next[idx] = { ...it, produtoId: v, precoUnitario: p?.precoLista || 0 }; setForm({ ...form, oppProdutos: next }); }}><SelectTrigger><SelectValue placeholder="Produto" /></SelectTrigger><SelectContent>{produtos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent></Select><Input type="number" placeholder="Preço" value={it.precoUnitario} onChange={e => { const next=[...form.oppProdutos]; next[idx]={...it,precoUnitario:+e.target.value}; setForm({...form,oppProdutos:next}); }} /><Input type="number" placeholder="Dose" value={it.dosePorHa} onChange={e => { const next=[...form.oppProdutos]; next[idx]={...it,dosePorHa:+e.target.value}; setForm({...form,oppProdutos:next}); }} /><Input type="number" placeholder="Área ha" value={it.areaHa} onChange={e => { const next=[...form.oppProdutos]; next[idx]={...it,areaHa:+e.target.value}; setForm({...form,oppProdutos:next}); }} /><Button variant="ghost" onClick={() => setForm({ ...form, oppProdutos: form.oppProdutos.filter((_, i) => i !== idx) })}><Trash2 className="h-4 w-4" /></Button></div>)}
      <Button variant="outline" onClick={addProduto}>Adicionar produto</Button></div>}
      <div className="grid gap-2 md:grid-cols-3"><div><Label>Próxima ação</Label><Input value={form.proximaAcao || ""} onChange={e => setForm({ ...form, proximaAcao: e.target.value })} /></div><div><Label>Tipo</Label><Select value={form.tipoProximaAcao || "Visita"} onValueChange={(v: TipoProximaAcao) => setForm({ ...form, tipoProximaAcao: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PROX_TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div><div><Label>Data</Label><Input type="date" value={form.dataProximaAcao || ""} onChange={e => setForm({ ...form, dataProximaAcao: e.target.value })} /></div></div>
      <div className="flex flex-wrap gap-2"><Button onClick={() => salvar(false)}><Save className="mr-1 h-4 w-4" />Salvar visita e oportunidade</Button>{form.geraOportunidade && <Button variant="secondary" onClick={() => salvar(true)}>Salvar e gerar orçamento</Button>}<Button variant="outline" onClick={reset}><Eraser className="mr-1 h-4 w-4" />Limpar</Button></div>
    </Card>
    <Card className="p-0"><div className="flex items-center gap-2 border-b p-4"><Search className="h-4 w-4" /><Input className="max-w-md" placeholder="Buscar cliente..." value={busca} onChange={e => setBusca(e.target.value)} /><Badge variant="outline" className="ml-auto">{lista.length}</Badge></div><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Oportunidade</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{lista.map(l => <TableRow key={l.id}><TableCell>{l.data}</TableCell><TableCell>{clienteById(l.clienteId)?.nome}</TableCell><TableCell>{l.negocioId ? "Sim" : "Não"}</TableCell><TableCell><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => nav('/funil')}><ArrowRight className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost"><Pencil className="h-3.5 w-3.5" /></Button></div></TableCell></TableRow>)}</TableBody></Table></Card>
  </div>;
}
