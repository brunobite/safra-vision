import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAppStore } from "@/store/AppStore";
import { CategoriaProduto, CATEGORIAS_PRODUTO, EtapaOportunidade, FrenteComercial, Lancamento, OrcamentoItem, StatusFunil, StatusLancamento, TipoLancamento, TipoProximaAcao, UnidadeDose } from "@/types";
import { GlobalFilters } from "@/components/GlobalFilters";
import { toast } from "sonner";
import { ArrowRight, Eraser, Eye, Pencil, Plus, Save, Search, Trash2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtBRL } from "@/utils/calculations";

const FRENTES: FrenteComercial[] = ["Venda Direta", "Nutrição Especial", "Geo Pampa", "Canal de Vendas"];
const STATUSES: StatusLancamento[] = ["Aberto", "Concluído", "Atrasado", "Cancelado", "Aguardando cliente", "Aguardando parceiro", "Em negociação"];
const PROX_TIPOS: TipoProximaAcao[] = ["Visita", "Ligação", "Enviar orçamento", "Cobrar retorno", "Pós-venda", "Outro"];
const DOSES: UnidadeDose[] = ["L/ha", "mL/ha", "kg/ha", "g/ha", "ton/ha", "un/ha"];

interface ProdutoDraft { produtoId: string; precoUnitario: number; dosePorHa: number; unidadeDose: UnidadeDose; areaHa: number; }
interface FormState extends Omit<Lancamento, "id"> { oppNome: string; oppCategoria: CategoriaProduto; oppAreaAplicacaoHa: number; oppCultura: string; oppObservacoes: string; oppStatus: StatusFunil; oppDataProxAcao: string; oppTipoProxAcao: TipoProximaAcao; oppProdutos: ProdutoDraft[]; }

const empty = (): FormState => ({ data: new Date().toISOString().slice(0, 10), clienteId: "", tipo: "Visita", frente: "Venda Direta", status: "Aberto", oQueFoiRealizado: "", vendedor: "Bruno", geraOportunidade: false, proximaAcao: "", dataProximaAcao: "", tipoProximaAcao: "Visita", oppNome: "", oppCategoria: "Adjuvantes", oppAreaAplicacaoHa: 0, oppCultura: "", oppObservacoes: "", oppStatus: "Novo", oppDataProxAcao: "", oppTipoProxAcao: "Visita", oppProdutos: [] });

const qConvert = (dose: number, unidadeDose: UnidadeDose, unidadeProduto: string, area: number) => {
  const doseTotal = dose * area;
  if (unidadeProduto === "TON" && unidadeDose === "kg/ha") return { comercial: doseTotal / 1000, base: `${doseTotal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg / ${(doseTotal / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} TON` };
  if (unidadeProduto === "LT" && unidadeDose === "mL/ha") return { comercial: doseTotal / 1000, base: `${doseTotal.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mL / ${(doseTotal / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} LT` };
  if (unidadeProduto === "KG" && unidadeDose === "g/ha") return { comercial: doseTotal / 1000, base: `${doseTotal.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} g / ${(doseTotal / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} KG` };
  return { comercial: doseTotal, base: `${doseTotal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${unidadeProduto}` };
};

const toFormState = (l: Lancamento): FormState => ({
  ...empty(),
  ...l,
  tipo: l.tipo || "Visita",
  frente: l.frente || "Venda Direta",
  status: l.status || "Aberto",
  oQueFoiRealizado: l.oQueFoiRealizado || "",
  vendedor: l.vendedor || "Bruno",
  geraOportunidade: !!l.negocioId || !!l.geraOportunidade,
  proximaAcao: l.proximaAcao || "",
  dataProximaAcao: l.dataProximaAcao || "",
  tipoProximaAcao: l.tipoProximaAcao || "Visita",
});

export default function Lancamentos() {
  const { lancamentos, setLancamentos, clientes, clienteById, filtered, vendedores, setClientes, setProximasAcoes, produtos, setOrcamentos, empresas, negocios, oportunidades, setOportunidades } = useAppStore();
  const [form, setForm] = useState<FormState>(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLancamento, setDetailsLancamento] = useState<Lancamento | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    const clienteId = params.get("clienteId");
    if (clienteId) {
      setForm(f => ({ ...f, clienteId }));
      setOpen(true);
      setParams({});
    }
  }, [params, setParams]);

  const reset = () => { setForm(empty()); setEditId(null); setStep(1); setOpen(false); };
  const addProduto = () => setForm(f => ({ ...f, oppProdutos: [...f.oppProdutos, { produtoId: "", precoUnitario: 0, dosePorHa: 0, unidadeDose: "L/ha", areaHa: f.oppAreaAplicacaoHa || 0 }] }));

  const abrirEdicao = (id: string) => {
    const lanc = lancamentos.find(l => l.id === id);
    if (!lanc) return toast.error("Lançamento não encontrado.");
    setForm(toFormState(lanc));
    setEditId(lanc.id);
    setStep(1);
    setOpen(true);
  };

  const abrirDetalhes = (lanc: Lancamento) => {
    setDetailsLancamento(lanc);
    setDetailsOpen(true);
  };

  const mapStatusToEtapa = (status: StatusFunil): EtapaOportunidade => {
    if (status === "Novo") return "Identificada";
    if (status === "Qualificado") return "Qualificação";
    if (status === "Em negociação") return "Negociação";
    if (status === "Proposta enviada") return "Orçamento enviado";
    if (status === "Aguardando cliente" || status === "Aguardando parceiro") return "Orçamento em elaboração";
    if (status === "Fechado ganho") return "Ganha";
    if (status === "Fechado perdido") return "Perdida";
    return "Identificada";
  };

  const salvar = (gerarOrcamento = false) => {
    if (!form.clienteId || !form.data || !form.oQueFoiRealizado) return toast.error("Preencha os campos obrigatórios da visita.");
    const id = editId || `l${Date.now()}`;
    const agora = new Date();
    const hoje = agora.toISOString().slice(0, 10);
    let negocioId = form.negocioId;
    let oportunidadeId = form.oportunidadeId;
    const itensCalculados: OrcamentoItem[] = form.oppProdutos.filter(p => p.produtoId).map((p, idx) => {
      const prod = produtos.find(pp => pp.id === p.produtoId)!;
      const area = p.areaHa || form.oppAreaAplicacaoHa || 0;
      const calc = qConvert(p.dosePorHa, p.unidadeDose, prod.unidade, area);
      const total = calc.comercial * p.precoUnitario;
      return { id: `i${Date.now()}-${idx}`, produtoId: prod.id, produtoNome: prod.nome, categoria: prod.categoria, unidadeProduto: prod.unidade, dosePorHa: p.dosePorHa || 0, unidadeDose: p.unidadeDose, areaHa: area, quantidadeTotal: calc.comercial, precoUnitario: p.precoUnitario || prod.precoLista, valorTotalItem: total, custoPorHaItem: area > 0 ? total / area : 0, observacoes: `Resumo: ${calc.base}` };
    });

    if (form.geraOportunidade) {
      const oppId = oportunidadeId || `opp${Date.now()}`;
      const valorEstimado = itensCalculados.reduce((s, i) => s + i.valorTotalItem, 0);
      const observacoes = [
        form.oppCultura && `Cultura: ${form.oppCultura}`,
        form.oppObservacoes,
        form.oQueFoiRealizado && `Visita: ${form.oQueFoiRealizado}`,
      ].filter(Boolean).join(" | ");
      setOportunidades(prev => [{
        id: oppId,
        clienteId: form.clienteId,
        origem: "Visita",
        segmento: form.oppCategoria || CATEGORIAS_PRODUTO[0],
        necessidade: form.oppNome || form.oQueFoiRealizado,
        valorEstimado,
        responsavel: form.vendedor || "Bruno",
        etapa: mapStatusToEtapa(form.oppStatus),
        previsaoFechamento: form.oppDataProxAcao || undefined,
        observacoes: observacoes || undefined,
        createdAt: oportunidades.find(o => o.id === oppId)?.createdAt || agora.toISOString(),
        updatedAt: agora.toISOString(),
      }, ...prev.filter(o => o.id !== oppId)]);
      oportunidadeId = oppId;
    }

    const lanc: Lancamento = { id, data: form.data, clienteId: form.clienteId, tipo: "Visita" as TipoLancamento, frente: form.frente, status: form.status, oQueFoiRealizado: form.oQueFoiRealizado, vendedor: form.vendedor, geraOportunidade: form.geraOportunidade, negocioId: form.geraOportunidade ? undefined : negocioId, oportunidadeId, proximaAcao: form.proximaAcao, dataProximaAcao: form.dataProximaAcao, tipoProximaAcao: form.tipoProximaAcao };
    setLancamentos(prev => editId ? prev.map(l => l.id === editId ? lanc : l) : [lanc, ...prev]);

    setClientes(prev => prev.map(c => c.id !== form.clienteId ? c : { ...c, ultimaVisita: form.data, proximaAcao: form.proximaAcao || c.proximaAcao, dataProximaAcao: form.dataProximaAcao || c.dataProximaAcao, tipoProximaAcao: form.tipoProximaAcao, statusAtual: form.geraOportunidade ? "Ativo" : "Visita" }));
    if (form.proximaAcao && form.dataProximaAcao) setProximasAcoes(prev => [{
      id: `pa${Date.now()}`,
      clienteId: form.clienteId,
      oportunidadeId: form.geraOportunidade ? oportunidadeId : undefined,
      responsavel: form.vendedor,
      descricao: form.proximaAcao!,
      tipo: form.tipoProximaAcao || "Visita",
      data: form.dataProximaAcao!,
      status: "Pendente",
      origem: "Lançamento",
      createdAt: agora.toISOString(),
      updatedAt: agora.toISOString(),
    }, ...prev]);

    if (gerarOrcamento && form.geraOportunidade && oportunidadeId) {
      const empresaPadrao = empresas.find(e => e.padrao && e.ativa)?.id || empresas.find(e => e.ativa)?.id;
      const subtotal = itensCalculados.reduce((s, i) => s + i.valorTotalItem, 0);
      setOrcamentos(prev => [{ id: `orc${Date.now()}`, codigo: `ORC-${Date.now()}`, clienteId: form.clienteId, oportunidadeId, empresaId: empresaPadrao, vendedor: form.vendedor || "", data: hoje, validade: new Date(agora.getTime() + 7 * 86400000).toISOString().slice(0, 10), status: "Rascunho", areaAplicacaoHa: form.oppAreaAplicacaoHa, itens: itensCalculados, subtotal, descontoTotal: 0, valorTotal: subtotal, custoPorHectare: form.oppAreaAplicacaoHa > 0 ? subtotal / form.oppAreaAplicacaoHa : 0, createdAt: agora.toISOString(), updatedAt: agora.toISOString() }, ...prev]);
      nav(`/orcamentos?oportunidadeId=${oportunidadeId}`);
    }

    toast.success(gerarOrcamento ? "Visita, oportunidade comercial e orçamento criados." : "Fluxo salvo.");
    reset();
  };

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return filtered.lancamentos
      .filter(l => {
        if (!termo) return true;
        const alvo = [
          clienteById(l.clienteId)?.nome,
          l.oQueFoiRealizado,
          l.proximaAcao,
          l.status,
          l.frente,
          l.vendedor,
          l.tipo,
        ].map(v => (v || "").toLowerCase());
        return alvo.some(v => v.includes(termo));
      })
      .sort((a, b) => b.data.localeCompare(a.data));
  }, [filtered.lancamentos, busca, clienteById]);

  return <div className="space-y-6"><GlobalFilters />
    <Card className="p-5 space-y-4"><div className="flex items-center justify-between"><h2 className="text-base font-semibold">Fluxo guiado: Visita → Oportunidade → Orçamento</h2><Button onClick={() => { setOpen(true); setStep(1); }}><Plus className="mr-1 h-4 w-4" />Novo lançamento</Button></div></Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto max-w-4xl"><DialogHeader><DialogTitle>{step === 1 ? "Etapa 1 — Dados da visita" : "Etapa 2 — Configurar oportunidade"}</DialogTitle></DialogHeader>
{step === 1 && <div className="space-y-3"><div className="grid gap-3 md:grid-cols-3"><div><Label>Data *</Label><Input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></div><div><Label>Cliente *</Label><Select value={form.clienteId} onValueChange={v => setForm({ ...form, clienteId: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></div><div><Label>Vendedor</Label><Select value={form.vendedor} onValueChange={v => setForm({ ...form, vendedor: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{vendedores.map(v => <SelectItem key={v.id} value={v.nome}>{v.nome}</SelectItem>)}</SelectContent></Select></div></div>
      <div className="grid gap-3 md:grid-cols-2"><div><Label>Frente comercial</Label><Select value={form.frente} onValueChange={(v: FrenteComercial) => setForm({ ...form, frente: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{FRENTES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent></Select></div><div><Label>Status</Label><Select value={form.status} onValueChange={(v: StatusLancamento) => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div></div>
      <div><Label>O que foi realizado? *</Label><Textarea rows={2} value={form.oQueFoiRealizado} onChange={e => setForm({ ...form, oQueFoiRealizado: e.target.value })} /></div>
      <div className="grid gap-3 md:grid-cols-3"><div><Label>Próxima ação</Label><Input value={form.proximaAcao || ""} onChange={e => setForm({ ...form, proximaAcao: e.target.value })} /></div><div><Label>Tipo</Label><Select value={form.tipoProximaAcao || "Visita"} onValueChange={(v: TipoProximaAcao) => setForm({ ...form, tipoProximaAcao: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PROX_TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div><div><Label>Data da próxima ação</Label><Input type="date" value={form.dataProximaAcao || ""} onChange={e => setForm({ ...form, dataProximaAcao: e.target.value })} /></div></div>
      <div className="rounded-md border p-3 space-y-2"><p className="font-medium">Esta visita gerou uma oportunidade comercial?</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setForm({ ...form, geraOportunidade: false }); salvar(false); }}>Não, salvar somente visita</Button><Button onClick={() => { setForm({ ...form, geraOportunidade: true }); setStep(2); }}>Sim, configurar oportunidade</Button></div></div></div>}

      {step === 2 && <div className="space-y-3"><div className="grid gap-3 md:grid-cols-3"><div><Label>Título da oportunidade</Label><Input value={form.oppNome} onChange={e => setForm({ ...form, oppNome: e.target.value })} /></div><div><Label>Cultura relacionada</Label><Input value={form.oppCultura} onChange={e => setForm({ ...form, oppCultura: e.target.value })} /></div><div><Label>Área de aplicação (ha)</Label><Input type="number" value={form.oppAreaAplicacaoHa} onChange={e => setForm({ ...form, oppAreaAplicacaoHa: +e.target.value })} /></div></div>
      <div><Label>Observações da oportunidade</Label><Textarea value={form.oppObservacoes} onChange={e => setForm({ ...form, oppObservacoes: e.target.value })} /></div>
      {form.oppProdutos.map((it, idx) => { const p = produtos.find(x => x.id === it.produtoId); const area = it.areaHa || form.oppAreaAplicacaoHa; const calc = qConvert(it.dosePorHa, it.unidadeDose, p?.unidade || "LT", area || 0); const total = calc.comercial * (it.precoUnitario || 0); return <Card key={idx} className="p-3 space-y-2"><div className="grid gap-2 md:grid-cols-6"><div className="md:col-span-2"><Label>Produto</Label><Select value={it.produtoId} onValueChange={v => { const pp = produtos.find(x => x.id === v); const next = [...form.oppProdutos]; next[idx] = { ...it, produtoId: v, precoUnitario: pp?.precoLista || 0 }; setForm({ ...form, oppProdutos: next }); }}><SelectTrigger><SelectValue placeholder="Produto" /></SelectTrigger><SelectContent>{produtos.map(pr => <SelectItem key={pr.id} value={pr.id}>{pr.nome}</SelectItem>)}</SelectContent></Select></div><div><Label>Dose/ha</Label><Input type="number" value={it.dosePorHa} onChange={e => { const next=[...form.oppProdutos]; next[idx]={...it,dosePorHa:+e.target.value}; setForm({...form,oppProdutos:next}); }} /></div><div><Label>Unidade da dose</Label><Select value={it.unidadeDose} onValueChange={(v: UnidadeDose) => { const next=[...form.oppProdutos]; next[idx]={...it,unidadeDose:v}; setForm({...form,oppProdutos:next}); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DOSES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div><div><Label>Área (ha)</Label><Input type="number" value={it.areaHa} onChange={e => { const next=[...form.oppProdutos]; next[idx]={...it,areaHa:+e.target.value}; setForm({...form,oppProdutos:next}); }} /></div><Button variant="ghost" className="self-end" onClick={() => setForm({ ...form, oppProdutos: form.oppProdutos.filter((_, i) => i !== idx) })}><Trash2 className="h-4 w-4" /></Button></div>
      {p && <div className="rounded-md border bg-muted/30 p-2 text-sm">Produto: <b>{p.nome}</b> · Unidade comercial: <b>{p.unidade}</b> · Preço lista: <b>{fmtBRL(p.precoLista)}/{p.unidade}</b> · Preço mínimo: <b>{fmtBRL(p.precoMinimo)}</b> · Estoque: <b>{p.estoqueAtual}</b></div>}
      <div className="grid gap-2 md:grid-cols-4"><div><Label>Preço unitário venda</Label><Input type="number" value={it.precoUnitario} onChange={e => { const next=[...form.oppProdutos]; next[idx]={...it,precoUnitario:+e.target.value}; setForm({...form,oppProdutos:next}); }} /></div><div className="text-sm">Quantidade calculada:<br /><b>{calc.base}</b></div><div className="text-sm">Valor total:<br /><b>{fmtBRL(total)}</b></div><div className="text-sm">Custo por hectare:<br /><b>{fmtBRL(area > 0 ? total / area : 0)}/ha</b></div></div>
      {p?.unidade === "GAL" || p?.unidade === "BD" ? <div className="text-xs text-amber-700">Produto cadastrado por embalagem. Confirme se a quantidade informada corresponde à unidade comercial do produto.</div> : null}
      <div className="rounded-md border p-2 text-sm"><b>Cálculo do item</b><ul className="list-disc ml-5"><li>Produto cadastrado em: {p?.unidade || "-"}</li><li>Preço considerado: {fmtBRL(it.precoUnitario)}/{p?.unidade || "-"}</li><li>Dose informada: {it.dosePorHa} {it.unidadeDose}</li><li>Área aplicada: {area || 0} ha</li><li>Quantidade calculada: {calc.base}</li><li>Valor total do item: {fmtBRL(total)}</li><li>Custo por hectare: {fmtBRL(area > 0 ? total / area : 0)}/ha</li></ul></div></Card>; })}
      <Button variant="outline" onClick={addProduto}>Adicionar produto</Button>
      <div className="rounded-md border p-3 text-sm">Resumo da oportunidade: Total {fmtBRL(form.oppProdutos.reduce((s, it) => { const p = produtos.find(x => x.id === it.produtoId); const calc = qConvert(it.dosePorHa, it.unidadeDose, p?.unidade || "LT", it.areaHa || form.oppAreaAplicacaoHa || 0); return s + calc.comercial * it.precoUnitario; }, 0))} · Produtos {form.oppProdutos.length} · Cliente {clienteById(form.clienteId)?.nome || "-"} · Área total {form.oppAreaAplicacaoHa} ha · Próxima ação {form.proximaAcao || "-"}</div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setStep(1)}>Voltar para visita</Button><Button onClick={() => { setForm({ ...form, geraOportunidade: true }); salvar(false); }}><Save className="mr-1 h-4 w-4" />Salvar visita e oportunidade</Button><Button variant="secondary" onClick={() => { setForm({ ...form, geraOportunidade: true }); salvar(true); }}>Salvar e gerar orçamento da oportunidade</Button><Button variant="outline" onClick={reset}><Eraser className="mr-1 h-4 w-4" />Limpar</Button></div></div>}
    </DialogContent></Dialog>

    <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}><DialogContent className="max-h-[90vh] overflow-y-auto max-w-3xl"><DialogHeader><DialogTitle>Detalhes do lançamento</DialogTitle></DialogHeader>
      {detailsLancamento && <div className="space-y-3 text-sm">
        <div className="grid gap-2 md:grid-cols-2">
          <p><b>Data:</b> {detailsLancamento.data}</p><p><b>Cliente:</b> {clienteById(detailsLancamento.clienteId)?.nome || "-"}</p>
          <p><b>Tipo:</b> {detailsLancamento.tipo || "-"}</p><p><b>Frente:</b> {detailsLancamento.frente || "-"}</p>
          <p><b>Status:</b> {detailsLancamento.status || "-"}</p><p><b>Vendedor:</b> {detailsLancamento.vendedor || "-"}</p>
          <p><b>Próxima ação:</b> {detailsLancamento.proximaAcao || "-"}</p><p><b>Data da próxima ação:</b> {detailsLancamento.dataProximaAcao || "-"}</p>
          <p><b>Tipo da próxima ação:</b> {detailsLancamento.tipoProximaAcao || "-"}</p><p><b>Oportunidade:</b> {detailsLancamento.oportunidadeId || detailsLancamento.negocioId ? "Sim" : "Não"}</p>
          <p className="md:col-span-2"><b>Oportunidade vinculada:</b> {detailsLancamento.oportunidadeId ? `${oportunidades.find(o => o.id === detailsLancamento.oportunidadeId)?.necessidade || "Oportunidade"} (${detailsLancamento.oportunidadeId})` : "Sem vínculo"}</p>
          <p className="md:col-span-2"><b>Negócio vinculado (legado):</b> {detailsLancamento.negocioId ? `${negocios.find(n => n.id === detailsLancamento.negocioId)?.nome || "Negócio"} (${detailsLancamento.negocioId})` : "Sem vínculo"}</p>
        </div>
        <div><b>O que foi realizado?</b><p className="whitespace-pre-wrap rounded-md border p-2 mt-1">{detailsLancamento.oQueFoiRealizado || "-"}</p></div>
      </div>}
    </DialogContent></Dialog>

    <Card className="p-0"><div className="flex items-center gap-2 border-b p-4"><Search className="h-4 w-4" /><Input className="max-w-md" placeholder="Buscar cliente, ação, status, frente..." value={busca} onChange={e => setBusca(e.target.value)} /><Badge variant="outline" className="ml-auto">{lista.length}</Badge></div>
      <div className="hidden md:block"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Tipo</TableHead><TableHead>Frente</TableHead><TableHead>Status</TableHead><TableHead>O que foi realizado?</TableHead><TableHead>Próxima ação</TableHead><TableHead>Data próxima ação</TableHead><TableHead>Oportunidade</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{lista.map(l => <TableRow key={l.id}><TableCell>{l.data}</TableCell><TableCell>{clienteById(l.clienteId)?.nome}</TableCell><TableCell>{l.tipo || "-"}</TableCell><TableCell>{l.frente || "-"}</TableCell><TableCell>{l.status || "-"}</TableCell><TableCell className="max-w-[280px]"><p className="line-clamp-3 whitespace-pre-wrap">{l.oQueFoiRealizado || "-"}</p></TableCell><TableCell>{l.proximaAcao || "-"}</TableCell><TableCell>{l.dataProximaAcao || "-"}</TableCell><TableCell>{l.oportunidadeId || l.negocioId ? "Sim" : "Não"}</TableCell><TableCell><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => abrirDetalhes(l)}><Eye className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" onClick={() => nav('/funil')}><ArrowRight className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" onClick={() => abrirEdicao(l.id)}><Pencil className="h-3.5 w-3.5" /></Button></div></TableCell></TableRow>)}</TableBody></Table></div>
      <div className="grid gap-3 p-4 md:hidden">{lista.map(l => <Card key={l.id} className="p-3 space-y-2"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold">{clienteById(l.clienteId)?.nome || "-"}</p><p className="text-xs text-muted-foreground">{l.data} · {l.tipo || "-"}</p></div><Badge variant="outline">{l.status || "-"}</Badge></div><p className="text-sm"><b>Frente:</b> {l.frente || "-"}</p><p className="text-sm whitespace-pre-wrap line-clamp-4"><b>Realizado:</b> {l.oQueFoiRealizado || "-"}</p><p className="text-sm"><b>Próxima:</b> {l.proximaAcao || "-"} {l.dataProximaAcao ? `(${l.dataProximaAcao})` : ""}</p><p className="text-sm"><b>Oportunidade:</b> {l.oportunidadeId || l.negocioId ? "Sim" : "Não"}</p><div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => abrirDetalhes(l)}>Ver detalhes</Button><Button size="icon" variant="ghost" onClick={() => abrirEdicao(l.id)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" onClick={() => nav('/funil')}><ArrowRight className="h-3.5 w-3.5" /></Button></div></Card>)}</div>
    </Card>
  </div>;
}
