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
import { calcularQuantidadeComercial, DOSE_UNIDADES, isOrcamentoBloqueado, recalcularItem } from "@/lib/orcamentoUtils";
import { gerarPdfOrcamento } from "@/lib/orcamentoPdf";
import { formatDateBR } from "@/utils/dateUtils";

const STATUS_OFICIAIS: OrcamentoStatus[] = ["Rascunho", "Enviado", "Em revisão", "Reenviado", "Aprovado", "Perdido", "Expirado", "Cancelado"];
const STATUS_LEGADO: OrcamentoStatus[] = ["Aberto", "Em negociação", "Recusado", "Vencido", "Reprovado"];
const CANAIS_ENVIO = ["WhatsApp", "E-mail", "Presencial", "Ligação", "Outro"] as const;
const validade7 = (base: string) => new Date(new Date(base).getTime() + 7 * 86400000).toISOString().slice(0, 10);

const novoItem = (idx: number, areaHa = 0): OrcamentoItem => ({ id: `i${Date.now()}-${idx}`, produtoId: "", produtoNome: "", categoria: "", unidadeProduto: "LT", dosePorHa: 0, unidadeDose: "L/ha", areaHa, quantidadeTotal: 0, precoUnitario: 0, valorTotalItem: 0, custoPorHaItem: 0 });

export default function Orcamentos() {
  const { orcamentos, setOrcamentos, clientes, produtos, empresas, oportunidades, vendedores, formasPagamento, prazosPagamento, proximasAcoes, setProximasAcoes, setOportunidades, setHistoricoFunil } = useAppStore();
  const [params] = useSearchParams();
  const vendedoresAtivos = vendedores.filter((v) => v.ativo);
  const formasPagamentoAtivas = formasPagamento.filter((f) => f.ativo);
  const prazosPagamentoAtivos = prazosPagamento.filter((p) => p.ativo);
  const formasPagamentoFallback = ["Boleto", "Pix", "Dinheiro", "Cartão", "Safra", "Barter", "Outro"];
  const prazosPagamentoFallback = ["À vista", "7 dias", "14 dias", "21 dias", "28 dias", "30 dias", "45 dias", "60 dias", "Safra", "Barter", "Outro"];
  const empresaPadrao = empresas.find((e) => e.padrao && e.ativa)?.id || empresas.find((e) => e.ativa)?.id || "";
  const formaPagamentoPadrao = formasPagamentoAtivas.find((f) => f.padrao)?.nome || formasPagamentoAtivas[0]?.nome || formasPagamentoFallback[0];
  const prazoPagamentoPadrao = prazosPagamentoAtivos.find((p) => p.padrao)?.nome || prazosPagamentoAtivos[0]?.nome || prazosPagamentoFallback[0];
  const now = new Date().toISOString();

  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Orcamento | null>(null);
  const [motivoRevisao, setMotivoRevisao] = useState("");
  const [form, setForm] = useState<Orcamento>({ id: "", codigo: `ORC-${Date.now()}`, versao: 1, clienteId: "", empresaId: empresaPadrao, vendedor: "", data: now.slice(0, 10), validade: validade7(now.slice(0, 10)), status: "Rascunho", areaAplicacaoHa: 0, itens: [], subtotal: 0, descontoTotal: 0, valorTotal: 0, custoPorHectare: 0, createdAt: now, updatedAt: now, prazoPagamento: prazoPagamentoPadrao, formaPagamento: formaPagamentoPadrao });

  const isLegacy = Boolean(edit?.id && !edit?.oportunidadeId);
  const oportunidadesAbertasCliente = oportunidades.filter((o) => o.clienteId === form.clienteId && !["Ganha", "Perdida", "Cancelada", "Suspensa/Sem timing"].includes(o.etapa));
  const statusOptions = Array.from(new Set([...(isLegacy ? [...STATUS_LEGADO, ...STATUS_OFICIAIS] : STATUS_OFICIAIS), form.status]));
  const orcamentoBloqueado = isOrcamentoBloqueado(form, oportunidades);

  const recalc = (next: Orcamento) => {
    const itens = next.itens.map((it) => {
      const p = produtos.find((pp) => pp.id === it.produtoId);
      return p ? recalcularItem(it, p) : it;
    });
    const subtotal = itens.reduce((s, i) => s + i.valorTotalItem, 0);
    const valorTotal = Math.max(0, subtotal - (next.descontoTotal || 0));
    return { ...next, itens, subtotal, valorTotal, custoPorHectare: next.areaAplicacaoHa > 0 ? valorTotal / next.areaAplicacaoHa : 0 };
  };

  const novoOrcamento = () => {
    const current = new Date().toISOString();
    setEdit(null);
    setMotivoRevisao("");
    setForm({ id: "", codigo: `ORC-${Date.now()}`, versao: 1, clienteId: "", empresaId: empresaPadrao, vendedor: "", data: current.slice(0, 10), validade: validade7(current.slice(0, 10)), status: "Rascunho", areaAplicacaoHa: 0, itens: [], subtotal: 0, descontoTotal: 0, valorTotal: 0, custoPorHectare: 0, createdAt: current, updatedAt: current, prazoPagamento: prazoPagamentoPadrao, formaPagamento: formaPagamentoPadrao });
    setOpen(true);
  };

  const criarNovaVersao = (origem: Orcamento) => {
    if (isOrcamentoBloqueado(origem, oportunidades)) return toast.error("Orçamento bloqueado: oportunidade já fechada.");
    const irmas = orcamentos.filter((o) => (o.orcamentoOrigemId || o.id) === (origem.orcamentoOrigemId || origem.id));
    const proximaVersao = Math.max(...irmas.map((i) => i.versao || 1), origem.versao || 1) + 1;
    const current = new Date().toISOString();
    setEdit(null);
    setForm(recalc({ ...origem, id: "", versao: proximaVersao, status: "Rascunho", motivoRevisao: "", dataEnvio: undefined, canalEnvio: undefined, substituiOrcamentoId: origem.id, orcamentoOrigemId: origem.orcamentoOrigemId || origem.id, createdAt: current, updatedAt: current, itens: origem.itens.map((it, idx) => ({ ...it, id: `${it.id}-v${proximaVersao}-${idx}` })) }));
    setMotivoRevisao("");
    setOpen(true);
  };

  const save = () => {
    if (orcamentoBloqueado) return toast.error("Orçamento bloqueado: oportunidade já fechada. Para nova negociação, crie uma nova oportunidade.");
    const payload = recalc({ ...form, motivoRevisao: motivoRevisao || form.motivoRevisao, updatedAt: new Date().toISOString() });
    if (!payload.clienteId) return toast.error("Cliente obrigatório");
    if (!isLegacy && !payload.oportunidadeId) return toast.error("Oportunidade obrigatória para novo orçamento");
    if (payload.status === "Enviado" && (!payload.canalEnvio || !payload.dataEnvio)) return toast.error("Informe canal e data de envio");

    const idNovo = payload.id || `orc${Date.now()}`;
    setOrcamentos((prev) => edit ? prev.map((o) => (o.id === edit.id ? payload : o)) : [{ ...payload, id: idNovo, createdAt: new Date().toISOString(), orcamentoOrigemId: payload.orcamentoOrigemId || idNovo }, ...prev]);

    if (payload.oportunidadeId && payload.status === "Enviado") {
      const oportunidadeAtual = oportunidades.find((o) => o.id === payload.oportunidadeId);
      setOportunidades((prev) => prev.map((o) => o.id === payload.oportunidadeId && !["Ganha", "Perdida", "Cancelada", "Suspensa/Sem timing"].includes(o.etapa) ? { ...o, etapa: "Orçamento enviado", orcamentoId: idNovo, updatedAt: new Date().toISOString() } : o));
      if (oportunidadeAtual && oportunidadeAtual.etapa !== "Orçamento enviado") {
        const current = new Date().toISOString();
        setHistoricoFunil((prev) => [{ id: `hf${Date.now()}-${idNovo}`, oportunidadeId: oportunidadeAtual.id, clienteId: oportunidadeAtual.clienteId, etapaAnterior: oportunidadeAtual.etapa, etapaNova: "Orçamento enviado", dataMovimento: current, vendedor: oportunidadeAtual.vendedor || oportunidadeAtual.responsavel || payload.responsavel || payload.vendedor, observacao: `Orçamento ${payload.codigo} marcado como enviado.`, createdAt: current }, ...prev]);
      }
      if (!payload.proximaAcaoId) {
        setProximasAcoes((prev) => [{ id: `pa${Date.now()}`, clienteId: payload.clienteId, oportunidadeId: payload.oportunidadeId, orcamentoId: idNovo, responsavel: payload.responsavel || payload.vendedor || "", descricao: `Follow-up de orçamento enviado ${payload.codigo} v${payload.versao || 1}`, tipo: "Follow-up", data: payload.validade || payload.data, status: "Pendente", origem: "Orçamento", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...prev]);
      }
    }

    if (payload.oportunidadeId && ["Em revisão", "Reenviado"].includes(payload.status)) {
      const oportunidadeAtual = oportunidades.find((o) => o.id === payload.oportunidadeId);
      setOportunidades((prev) => prev.map((o) => o.id === payload.oportunidadeId && !["Ganha", "Perdida", "Cancelada", "Suspensa/Sem timing"].includes(o.etapa) ? { ...o, etapa: "Negociação", orcamentoId: idNovo, updatedAt: new Date().toISOString() } : o));
      if (oportunidadeAtual && oportunidadeAtual.etapa !== "Negociação") {
        const current = new Date().toISOString();
        setHistoricoFunil((prev) => [{ id: `hf${Date.now()}-${idNovo}-neg`, oportunidadeId: oportunidadeAtual.id, clienteId: oportunidadeAtual.clienteId, etapaAnterior: oportunidadeAtual.etapa, etapaNova: "Negociação", dataMovimento: current, vendedor: oportunidadeAtual.vendedor || oportunidadeAtual.responsavel || payload.responsavel || payload.vendedor, observacao: `Orçamento ${payload.codigo} entrou em ${payload.status}.`, createdAt: current }, ...prev]);
      }
    }

    if (payload.status === "Aprovado") toast.message("Orçamento aprovado. Feche a oportunidade como Ganha para criar negócio.");
    if (payload.status === "Perdido") toast.message("Orçamento perdido. Feche a oportunidade como Perdida e informe motivo.");
    setOpen(false);
    toast.success("Orçamento salvo");
  };

  useEffect(() => {
    const editId = params.get("edit");
    if (editId) {
      const orcamento = orcamentos.find((x) => x.id === editId);
      if (!orcamento) return;
      setEdit(orcamento);
      setForm(orcamento);
      setMotivoRevisao(orcamento.motivoRevisao || "");
      setOpen(true);
      return;
    }

    if (params.get("new")) {
      novoOrcamento();
      return;
    }

    const oportunidadeId = params.get("oportunidadeId");
    if (!oportunidadeId) return;
    const op = oportunidades.find((x) => x.id === oportunidadeId);
    if (!op) return;
    const itens = (op.itensEstimados || []).map((it, idx) => ({ ...novoItem(idx), produtoId: it.produtoId, produtoNome: it.produtoNome || "", categoria: it.categoria || "", unidadeProduto: (it.unidadeProduto as OrcamentoItem["unidadeProduto"]) || "LT", dosePorHa: it.dosePorHa || 0, unidadeDose: it.unidadeDose || "L/ha", areaHa: it.areaHa || 0, quantidadeTotal: it.quantidadeTotal || 0, precoUnitario: it.precoUnitario || 0, valorTotalItem: it.valorTotalItem || 0, custoPorHaItem: it.custoPorHaItem || 0, observacoes: it.observacoes }));
    setEdit(null);
    setForm((f) => recalc({ ...f, clienteId: op.clienteId, oportunidadeId: op.id, responsavel: op.responsavel || f.responsavel || "", vendedor: op.responsavel || f.vendedor || "", segmento: op.segmento || f.segmento || "", areaAplicacaoHa: itens.length ? Math.max(...itens.map((i) => i.areaHa || 0), 0) : 0, itens }));
    setOpen(true);
  }, [params, oportunidades, orcamentos]);

  return <div className="space-y-3"><Button onClick={novoOrcamento}>Novo orçamento</Button>
    {orcamentos.map((o) => <Card key={o.id} className="p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="flex-1 text-sm"><div className="font-semibold">{o.codigo} v{o.versao || 1} · {clientes.find((c) => c.id === o.clienteId)?.nome || "Sem cliente"}</div>
          <div className="text-muted-foreground">Status: {o.status} · Validade: {formatDateBR(o.validade)} · Vendedor: {o.vendedor || "-"}</div>
          <div className="text-muted-foreground">Oportunidade: {o.oportunidadeId || "Legado/sem vínculo"} · Envio: {o.canalEnvio || "-"} {o.dataEnvio ? `em ${formatDateBR(o.dataEnvio)}` : ""}</div></div>
        <div className="text-sm font-semibold">{fmtBRL(o.valorTotal)}</div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => { setEdit(o); setForm(o); setMotivoRevisao(o.motivoRevisao || ""); setOpen(true); }}>{isOrcamentoBloqueado(o, oportunidades) ? "Ver orçamento" : "Abrir/Editar"}</Button>
          <Button size="sm" variant="outline" onClick={() => gerarPdfOrcamento(o, clientes.find((c) => c.id === o.clienteId), empresas.find((e) => e.id === o.empresaId), oportunidades.find((op) => op.id === o.oportunidadeId))}>PDF</Button>
          <Button size="sm" onClick={() => criarNovaVersao(o)} disabled={isOrcamentoBloqueado(o, oportunidades)}>Criar nova versão</Button>
        </div>
      </div>
    </Card>)}

    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto max-w-6xl"><DialogHeader><DialogTitle>{edit ? "Editar" : "Novo"} orçamento</DialogTitle></DialogHeader>
      {orcamentoBloqueado && <Card className="border-amber-500 bg-amber-50 p-3 text-amber-900">Orçamento bloqueado: oportunidade já fechada. Para nova negociação, crie uma nova oportunidade.</Card>}
      <fieldset disabled={orcamentoBloqueado} className="space-y-2">
      <Card className="p-3 space-y-2"><h3 className="font-semibold">Dados da proposta</h3><div className="grid gap-2 md:grid-cols-5">
        <div><Label>Código</Label><Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} disabled={orcamentoBloqueado} /></div>
        <div><Label>Versão</Label><Input value={form.versao || 1} disabled /></div>
        <div><Label>Cliente</Label><Select value={form.clienteId} onValueChange={(v) => setForm({ ...form, clienteId: v, oportunidadeId: undefined })} disabled={orcamentoBloqueado}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Oportunidade vinculada</Label><Select value={form.oportunidadeId || (isLegacy ? "legacy" : "")} onValueChange={(v) => setForm({ ...form, oportunidadeId: v === "legacy" ? undefined : v })} disabled={orcamentoBloqueado}><SelectTrigger><SelectValue placeholder="Obrigatório para novo orçamento" /></SelectTrigger><SelectContent>{isLegacy && <SelectItem value="legacy">Legado/sem vínculo</SelectItem>}{oportunidadesAbertasCliente.map((o) => <SelectItem key={o.id} value={o.id}>{o.etapa} · {o.necessidade || o.id}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Empresa</Label><Select value={form.empresaId} onValueChange={(v) => setForm({ ...form, empresaId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{empresas.filter((e) => e.ativa).map((e) => <SelectItem key={e.id} value={e.id}>{e.nomeFantasia}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Vendedor/Responsável</Label><Select value={form.responsavel || form.vendedor || ""} onValueChange={(v) => setForm({ ...form, responsavel: v, vendedor: v })}><SelectTrigger><SelectValue placeholder="Selecione o vendedor" /></SelectTrigger><SelectContent>{vendedoresAtivos.length ? vendedoresAtivos.map((v) => <SelectItem key={v.id} value={v.nome}>{v.nome}</SelectItem>) : <SelectItem value="Sem vendedor cadastrado">Sem vendedor cadastrado</SelectItem>}</SelectContent></Select></div>
        <div><Label>Data</Label><Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></div>
        <div><Label>Validade</Label><Input type="date" value={form.validade || ""} onChange={(e) => setForm({ ...form, validade: e.target.value })} /></div>
        <div><Label>Status</Label><Select value={form.status} onValueChange={(v: OrcamentoStatus) => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Motivo revisão</Label><Input value={motivoRevisao} onChange={(e) => setMotivoRevisao(e.target.value)} /></div>
      </div></Card>

      <Card className="p-3 space-y-2"><h3 className="font-semibold">Itens da proposta</h3>
        {form.itens.map((it, idx) => { const p = produtos.find((x) => x.id === it.produtoId); const area = it.areaHa || form.areaAplicacaoHa; const calc = calcularQuantidadeComercial((p?.unidade || it.unidadeProduto), it.dosePorHa, it.unidadeDose, area); const total = calc.quantidadeComercial * it.precoUnitario; const precoBase = calc.precoBaseDivisor > 0 ? it.precoUnitario / calc.precoBaseDivisor : it.precoUnitario; return <div key={it.id} className="grid gap-2 md:grid-cols-10">
          <div className="md:col-span-2"><Label>Produto</Label><Select value={it.produtoId} onValueChange={(v) => { const pp = produtos.find((x) => x.id === v); const itens = [...form.itens]; itens[idx] = recalcularItem({ ...it, produtoId: v, precoUnitario: it.precoUnitario || pp?.precoLista || 0 }, pp!); setForm(recalc({ ...form, itens })); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{produtos.map((pr) => <SelectItem key={pr.id} value={pr.id}>{pr.nome}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Dose/ha</Label><Input type="number" value={it.dosePorHa} onChange={(e) => { const itens = [...form.itens]; itens[idx] = { ...it, dosePorHa: +e.target.value }; setForm(recalc({ ...form, itens })); }} /></div>
          <div><Label>Unid. dose</Label><Select value={it.unidadeDose} onValueChange={(v: UnidadeDose) => { const itens = [...form.itens]; itens[idx] = { ...it, unidadeDose: v }; setForm(recalc({ ...form, itens })); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DOSE_UNIDADES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Área</Label><Input type="number" value={it.areaHa} onChange={(e) => { const itens = [...form.itens]; itens[idx] = { ...it, areaHa: +e.target.value }; setForm(recalc({ ...form, itens })); }} /></div>
          <div><Label>Qtd. calculada</Label><Input value={`${calc.quantidadeComercial.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${p?.unidade || it.unidadeProduto}`} disabled /></div>
          <div><Label>Unid. comercial</Label><Input value={p?.unidade || it.unidadeProduto} disabled /></div>
          <div><Label>Valor unit.</Label><Input type="number" value={it.precoUnitario} onChange={(e) => { const itens = [...form.itens]; itens[idx] = { ...it, precoUnitario: +e.target.value }; setForm(recalc({ ...form, itens })); }} /></div>
          <div><Label>Subtotal item</Label><Input value={fmtBRL(total)} disabled /></div>
          <div><Label>Custo técnico/ha</Label><Input value={`${fmtBRL(it.custoPorHaItem || 0)}/ha`} disabled /></div>
          <div className="md:col-span-10 text-xs text-muted-foreground">Necessidade técnica: {calc.necessidadeTecnica.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {calc.unidadeBase} → Quantidade comercial: {calc.quantidadeComercial.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {p?.unidade || it.unidadeProduto} (volume comercial: {calc.volumeComercial.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {calc.unidadeBase}). Preço base: {fmtBRL(precoBase)}/{calc.unidadeBase}. Valor total: {fmtBRL(total)}. Custo técnico: {fmtBRL(it.custoPorHaItem || 0)}/ha.</div>
        </div>; })}
        <Button variant="outline" onClick={() => setForm((f) => ({ ...f, itens: [...f.itens, novoItem(f.itens.length, f.areaAplicacaoHa)] }))}>Adicionar item</Button>
      </Card>

      <Card className="p-3"><h3 className="font-semibold">Condições comerciais</h3><div className="grid gap-2 md:grid-cols-4">
        <div><Label>Forma de pagamento</Label><Select value={form.formaPagamento || formaPagamentoPadrao} onValueChange={(v) => setForm({ ...form, formaPagamento: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(formasPagamentoAtivas.length ? formasPagamentoAtivas.map((f) => f.nome) : formasPagamentoFallback).map((nome) => <SelectItem key={nome} value={nome}>{nome}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Prazo pagamento</Label><Select value={form.prazoPagamento || prazoPagamentoPadrao} onValueChange={(v) => setForm({ ...form, prazoPagamento: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(prazosPagamentoAtivos.length ? prazosPagamentoAtivos.map((p) => p.nome) : prazosPagamentoFallback).map((nome) => <SelectItem key={nome} value={nome}>{nome}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Desconto total</Label><Input type="number" value={form.descontoTotal || 0} onChange={(e) => setForm(recalc({ ...form, descontoTotal: +e.target.value }))} /></div>
        <div><Label>Canal de envio</Label><Select value={form.canalEnvio || ""} onValueChange={(v) => setForm({ ...form, canalEnvio: v })}><SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger><SelectContent>{CANAIS_ENVIO.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Data envio</Label><Input type="date" value={form.dataEnvio || ""} onChange={(e) => setForm({ ...form, dataEnvio: e.target.value })} /></div>
        <div className="md:col-span-3"><Label>Observações comerciais</Label><Input value={form.observacoes || ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
      </div></Card>

      <Card className="p-3"><h3 className="font-semibold">Totais</h3><div className="grid gap-2 md:grid-cols-4 text-sm"><div>Subtotal: <b>{fmtBRL(form.subtotal)}</b></div><div>Desconto: <b>{fmtBRL(form.descontoTotal || 0)}</b></div><div>Valor total: <b>{fmtBRL(form.valorTotal)}</b></div><div>Custo médio/ha: <b>{fmtBRL(form.custoPorHectare)}/ha</b></div></div></Card>

      </fieldset>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save} disabled={orcamentoBloqueado}>Salvar</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
