import { useMemo, useState } from "react";
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
import { Lancamento, TipoLancamento, FrenteComercial, StatusLancamento, StatusFunil, CategoriaProduto, CATEGORIAS_PRODUTO, STATUS_FUNIL, OrigemNegocio } from "@/types";
import { GlobalFilters } from "@/components/GlobalFilters";
import { toast } from "sonner";
import { Pencil, Trash2, Save, Eraser, Search, Link2, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const TIPOS: TipoLancamento[] = ["Visita", "Ligação", "WhatsApp", "Proposta", "Venda", "Evento", "Orçamento", "Em negociação"];
const FRENTES: FrenteComercial[] = ["Venda Direta", "Nutrição Especial", "Geo Pampa", "Canal de Vendas"];
const STATUSES: StatusLancamento[] = ["Aberto", "Concluído", "Atrasado", "Cancelado", "Aguardando cliente", "Aguardando parceiro", "Em negociação"];

interface FormState extends Omit<Lancamento, "id"> {
  // opp fields
  oppNome?: string;
  oppProdutos?: string;
  oppCategoria?: CategoriaProduto;
  oppValor?: number;
  oppStatus?: StatusFunil;
  oppPrevisao?: string;
  oppProxAcao?: string;
  oppDataProxAcao?: string;
  proximaAcao?: string;
  dataProximaAcao?: string;
}

const empty: FormState = {
  data: new Date().toISOString().slice(0, 10),
  clienteId: "",
  tipo: "Visita",
  frente: "Venda Direta",
  status: "Aberto",
  oQueFoiRealizado: "",
  vendedor: "Bruno",
  geraOportunidade: false,
  oppNome: "", oppProdutos: "", oppCategoria: "Adjuvantes", oppValor: 0,
  oppStatus: "Novo", oppPrevisao: "", oppProxAcao: "", oppDataProxAcao: "",
  proximaAcao: "", dataProximaAcao: "",
};

export default function Lancamentos() {
  const { lancamentos, setLancamentos, clientes, clienteById, filtered, vendedores, negocios, setNegocios, setClientes, setProximasAcoes } = useAppStore();
  const [form, setForm] = useState<FormState>(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const nav = useNavigate();

  const reset = () => { setForm(empty); setEditId(null); };

  const salvar = () => {
    if (!form.clienteId) return toast.error("Selecione um cliente.");
    if (!form.data) return toast.error("Informe a data.");
    if (!form.oQueFoiRealizado) return toast.error("Descreva o que foi realizado.");
    const id = editId || `l${Date.now()}`;
    let negocioId = form.negocioId;
    if (form.geraOportunidade) {
      const negId = negocioId || `n${Date.now()}`;
      const hoje = new Date().toISOString().slice(0, 10);
      const newNeg = {
        id: negId,
        nome: form.oppNome || `Oportunidade ${clienteById(form.clienteId)?.nome}`,
        clienteId: form.clienteId,
        vendedor: form.vendedor || "Bruno",
        origem: (form.tipo === "Visita" ? "Visita" : form.tipo === "Ligação" ? "Ligação" : form.tipo === "WhatsApp" ? "WhatsApp" : form.tipo === "Evento" ? "Evento" : "Outro") as OrigemNegocio,
        produtos: [],
        categoria: form.oppCategoria || "Adjuvantes",
        valorPotencial: form.oppValor || 0,
        status: form.oppStatus || "Novo",
        previsaoFechamento: form.oppPrevisao,
        dataCriacao: hoje,
        ultimaAtualizacao: hoje,
        proximaAcao: form.oppProxAcao,
        dataProximaAcao: form.oppDataProxAcao,
        observacoes: form.oppProdutos,
        lancamentoId: id,
      };
      setNegocios(prev => negocioId ? prev.map(n => n.id === negId ? { ...n, ...newNeg, dataCriacao: n.dataCriacao } : n) : [newNeg, ...prev]);
      negocioId = negId;
    }
    const lanc: Lancamento = {
      id,
      data: form.data,
      clienteId: form.clienteId,
      tipo: form.tipo,
      frente: form.frente,
      status: form.status,
      oQueFoiRealizado: form.oQueFoiRealizado,
      vendedor: form.vendedor,
      geraOportunidade: form.geraOportunidade,
      negocioId,
    };
    if (editId) setLancamentos(prev => prev.map(l => l.id === editId ? lanc : l));
    else setLancamentos(prev => [lanc, ...prev]);
    setClientes(prev=>prev.map(c=>c.id!==form.clienteId?c:{...c, ultimaVisita: form.tipo==="Visita"?form.data:c.ultimaVisita, proximaAcao: form.proximaAcao || c.proximaAcao, dataProximaAcao: form.dataProximaAcao || c.dataProximaAcao}));
    if (form.proximaAcao && form.dataProximaAcao) { const now = new Date().toISOString(); setProximasAcoes(prev=>[{id:`pa${Date.now()}`, clienteId: form.clienteId, responsavel: form.vendedor, descricao: form.proximaAcao!, tipo: "Visita", data: form.dataProximaAcao!, status:"Pendente", origem:"Lançamento", createdAt: now, updatedAt: now}, ...prev]); }
    toast.success(editId ? "Lançamento atualizado." : "Lançamento criado.");
    reset();
  };

  const editar = (l: Lancamento) => {
    const neg = l.negocioId ? negocios.find(n => n.id === l.negocioId) : undefined;
    setForm({
      data: l.data, clienteId: l.clienteId, tipo: l.tipo, frente: l.frente, status: l.status,
      oQueFoiRealizado: l.oQueFoiRealizado || "", vendedor: l.vendedor || "Bruno",
      geraOportunidade: !!l.geraOportunidade, negocioId: l.negocioId,
      oppNome: neg?.nome, oppProdutos: neg?.observacoes, oppCategoria: neg?.categoria, oppValor: neg?.valorPotencial,
      oppStatus: neg?.status, oppPrevisao: neg?.previsaoFechamento,
      oppProxAcao: neg?.proximaAcao, oppDataProxAcao: neg?.dataProximaAcao,
    });
    setEditId(l.id);
  };

  const excluir = (id: string) => {
    if (!window.confirm("Esta ação não pode ser desfeita nesta versão. Deseja continuar?")) return;
    setLancamentos(prev => prev.filter(l => l.id !== id));
    toast.success("Lançamento excluído.");
  };
  const evoluir = (l: Lancamento) => { editar(l); setForm(f => ({ ...f, geraOportunidade: true })); };

  const lista = useMemo(() => {
    const q = busca.toLowerCase();
    return filtered.lancamentos
      .filter(l => !q || clienteById(l.clienteId)?.nome.toLowerCase().includes(q))
      .sort((a, b) => b.data.localeCompare(a.data));
  }, [filtered.lancamentos, busca, clienteById]);

  return (
    <div className="space-y-6">
      <GlobalFilters />

      <Card className="p-5">
        <h2 className="mb-4 text-base font-semibold">{editId ? "Editar visita" : "Novo lançamento de visita"}</h2>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          <div><Label>Data *</Label><Input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></div>
          <div><Label>Cliente *</Label>
            <Select value={form.clienteId} onValueChange={v => setForm({ ...form, clienteId: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Vendedor/Responsável</Label>
            <Select value={form.vendedor} onValueChange={v => setForm({ ...form, vendedor: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{vendedores.map(v => <SelectItem key={v.id} value={v.nome}>{v.nome}</SelectItem>)}</SelectContent>
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
          <div><Label>Status *</Label>
            <Select value={form.status} onValueChange={(v: StatusLancamento) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="md:col-span-3 lg:col-span-4">
            <Label>O que foi realizado? *</Label>
            <Textarea rows={2} value={form.oQueFoiRealizado} onChange={e => setForm({ ...form, oQueFoiRealizado: e.target.value })} />
          </div>
          <div><Label>Próxima ação</Label><Input value={form.proximaAcao || ""} onChange={e => setForm({ ...form, proximaAcao: e.target.value })} /></div>
          <div><Label>Data próxima ação</Label><Input type="date" value={form.dataProximaAcao || ""} onChange={e => setForm({ ...form, dataProximaAcao: e.target.value })} /></div>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
          <Switch checked={!!form.geraOportunidade} onCheckedChange={v => setForm({ ...form, geraOportunidade: v })} id="opp" />
          <Label htmlFor="opp" className="cursor-pointer">Existe oportunidade de negócio?</Label>
        </div>

        {form.geraOportunidade && (
          <div className="mt-4 grid gap-4 rounded-md border border-primary/30 bg-primary/5 p-4 md:grid-cols-3 lg:grid-cols-4">
            <div className="md:col-span-2"><Label>Nome da oportunidade</Label><Input value={form.oppNome} onChange={e => setForm({ ...form, oppNome: e.target.value })} /></div>
            <div><Label>Categoria</Label>
              <Select value={form.oppCategoria} onValueChange={(v: CategoriaProduto) => setForm({ ...form, oppCategoria: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIAS_PRODUTO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Valor potencial (R$)</Label><Input type="number" value={form.oppValor} onChange={e => setForm({ ...form, oppValor: +e.target.value })} /></div>
            <div className="md:col-span-2 lg:col-span-2"><Label>Produtos em negociação</Label><Input placeholder="Ex.: ADJ Performance, Nutri K..." value={form.oppProdutos} onChange={e => setForm({ ...form, oppProdutos: e.target.value })} /></div>
            <div><Label>Status do negócio</Label>
              <Select value={form.oppStatus} onValueChange={(v: StatusFunil) => setForm({ ...form, oppStatus: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_FUNIL.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
                        <div><Label>Previsão fechamento</Label><Input type="date" value={form.oppPrevisao} onChange={e => setForm({ ...form, oppPrevisao: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Próxima ação</Label><Input value={form.oppProxAcao} onChange={e => setForm({ ...form, oppProxAcao: e.target.value })} /></div>
            <div><Label>Data próxima ação</Label><Input type="date" value={form.oppDataProxAcao} onChange={e => setForm({ ...form, oppDataProxAcao: e.target.value })} /></div>
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <Button onClick={salvar}><Save className="mr-1 h-4 w-4" /> {editId ? "Atualizar" : "Salvar"}</Button>
          <Button variant="outline" onClick={reset}><Eraser className="mr-1 h-4 w-4" /> Limpar</Button>
        </div>
      </Card>

      <Card className="p-0">
        <div className="flex items-center gap-2 border-b border-border p-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input className="max-w-md" placeholder="Buscar cliente..." value={busca} onChange={e => setBusca(e.target.value)} />
          <Badge variant="outline" className="ml-auto">{lista.length} lançamentos</Badge>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Vendedor</TableHead>
              <TableHead>Tipo</TableHead><TableHead>Status</TableHead>
              <TableHead>Oportunidade</TableHead><TableHead>Próxima ação</TableHead><TableHead>Data</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {lista.map(l => {
                const c = clienteById(l.clienteId);
                const neg = l.negocioId ? negocios.find(n => n.id === l.negocioId) : undefined;
                return (
                  <TableRow key={l.id}>
                    <TableCell>{l.data}</TableCell>
                    <TableCell className="font-medium">{c?.nome}</TableCell>
                    <TableCell>{l.vendedor || "—"}</TableCell>
                    <TableCell>{l.tipo}</TableCell>
                    <TableCell><Badge variant="outline">{l.status}</Badge></TableCell>
                    <TableCell>{neg ? <Badge variant="outline" className="bg-primary/10 text-primary">{neg.nome}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="max-w-[180px] truncate">{neg?.proximaAcao || "—"}</TableCell>
                    <TableCell>{neg?.dataProximaAcao || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {neg && <Button size="icon" variant="ghost" title="Ver negócio" onClick={() => nav("/funil")}><Link2 className="h-3.5 w-3.5" /></Button>}
                        {!neg && <Button size="icon" variant="ghost" title="Evoluir para negócio" onClick={() => evoluir(l)}><ArrowRight className="h-3.5 w-3.5" /></Button>}
                        <Button size="icon" variant="ghost" onClick={() => editar(l)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => excluir(l.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
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
