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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { useAppStore } from "@/store/AppStore";
import { Produto } from "@/types";
import { PRODUCT_STANDARD_UNITS, normalizeProductUnit } from "@/lib/importService";
import { fmtBRL, fmtNum } from "@/utils/calculations";
import { controlaEstoqueProduto, estoqueDisponivelProduto } from "@/utils/productStock";
import { getCategoriasComerciais, normalizarCategoriaComercial } from "@/utils/commercialCategories";
import { ArrowLeft, Boxes, Eye, Pencil, Plus, Search, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

const ALL = "__all__";
const UNIDADES = PRODUCT_STANDARD_UNITS;

const empty: Omit<Produto, "id"> = {
  codigo: "",
  nome: "",
  categoria: "Adjuvantes",
  unidade: "LT",
  fornecedor: "",
  precoLista: 0,
  precoMinimo: 0,
  custo: 0,
  margem: 0,
  controlaEstoque: false,
  estoqueAtual: 0,
  estoqueReservado: 0,
  localEstoque: "",
  ativo: true,
  observacoes: "",
};

function estoqueStatus(disponivel: number) {
  if (disponivel < 0) return { label: "Reservado acima do estoque", cls: "bg-destructive/15 text-destructive" };
  if (disponivel === 0) return { label: "Sem estoque disponível", cls: "bg-amber-100 text-amber-800" };
  if (disponivel < 10) return { label: "Estoque baixo", cls: "bg-amber-100 text-amber-800" };
  return { label: "Disponível", cls: "bg-success/15 text-success" };
}

export default function Produtos() {
  const { produtos, setProdutos, ticketsMedios, negocios, oportunidades, orcamentos } = useAppStore();
  const [busca, setBusca] = useState("");
  const [fCat, setFCat] = useState("");
  const [fForn, setFForn] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fControleEstoque, setFControleEstoque] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Produto | null>(null);
  const [form, setForm] = useState(empty);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fornecedores = useMemo(() => Array.from(new Set(produtos.map((p) => p.fornecedor).filter(Boolean) as string[])), [produtos]);
  const categorias = useMemo(() => getCategoriasComerciais({ produtos, ticketsMedios, negocios, oportunidades, orcamentos }), [negocios, oportunidades, orcamentos, produtos, ticketsMedios]);

  const list = useMemo(() => produtos.filter((p) =>
    (!busca || p.nome.toLowerCase().includes(busca.toLowerCase()) || p.codigo.toLowerCase().includes(busca.toLowerCase())) &&
    (!fCat || p.categoria === fCat) && (!fForn || p.fornecedor === fForn) &&
    (!fStatus || (fStatus === "ativo" ? p.ativo : !p.ativo)) &&
    (!fControleEstoque || (fControleEstoque === "com" ? controlaEstoqueProduto(p) : !controlaEstoqueProduto(p)))
  ), [produtos, busca, fCat, fForn, fStatus, fControleEstoque]);

  const selectedProduct = useMemo(() => produtos.find((p) => p.id === selectedId) ?? null, [produtos, selectedId]);

  const vinculosProduto = useMemo(() => {
    if (!selectedProduct) return { negocios: 0, oportunidades: 0, orcamentos: 0 };
    return {
      negocios: negocios.filter((n) => n.produtos?.includes(selectedProduct.id) || n.itensEstimados?.some((i) => i.produtoId === selectedProduct.id)).length,
      oportunidades: oportunidades.filter((o) => o.produtosInteresse?.includes(selectedProduct.id) || o.itensEstimados?.some((i) => i.produtoId === selectedProduct.id)).length,
      orcamentos: orcamentos.filter((o) => o.itens?.some((i) => i.produtoId === selectedProduct.id)).length,
    };
  }, [negocios, oportunidades, orcamentos, selectedProduct]);

  const openNew = () => {
    setEdit(null);
    setForm({ ...empty });
    setOpen(true);
  };

  const openEdit = (p: Produto) => {
    setEdit(p);
    const { id, ...rest } = p;
    void id;
    setForm({ ...empty, ...rest, controlaEstoque: controlaEstoqueProduto(p) });
    setOpen(true);
  };

  const save = () => {
    if (!form.nome || !form.codigo) return toast.error("Código e nome obrigatórios.");
    const unidade = normalizeProductUnit(form.unidade);
    if (!unidade) return toast.error("Unidade obrigatória.");
    const categoria = normalizarCategoriaComercial(form.categoria, categorias);
    const controlaEstoque = controlaEstoqueProduto(form);
    const disponivel = estoqueDisponivelProduto(form);
    const margem = form.precoLista > 0 ? (((form.precoLista - form.custo) / form.precoLista) * 100) : 0;
    const now = new Date().toISOString();
    if (controlaEstoque && disponivel < 0) toast.warning("Estoque disponível negativo: revise estoque atual e reservado.");

    if (edit) {
      setProdutos((prev) => prev.map((p) => p.id === edit.id ? { ...p, ...form, categoria, unidade, controlaEstoque, margem, id: edit.id, createdAt: p.createdAt, updatedAt: now, ultimaAtualizacao: now.slice(0, 10) } : p));
    } else {
      const novo: Produto = { ...form, categoria, unidade, controlaEstoque, margem, id: `p${Date.now()}`, createdAt: now, updatedAt: now, ultimaAtualizacao: now.slice(0, 10) };
      setProdutos((prev) => [...prev, novo]);
      setSelectedId(novo.id);
    }
    setOpen(false);
    toast.success("Produto salvo no cadastro mestre.");
  };

  const excluir = (p: Produto) => {
    if (!window.confirm("Esta ação não pode ser desfeita nesta versão. Deseja continuar?")) return;
    setProdutos((prev) => prev.filter((x) => x.id !== p.id));
    if (selectedId === p.id) setSelectedId(null);
    toast.success("Produto excluído.");
  };

  const ajustarEstoque = (p: Produto) => {
    openEdit(p);
    toast.info(controlaEstoqueProduto(p) ? "Ajuste estoque atual, reservado e local na ficha do produto." : "Produto sem controle de estoque: ative o controle para editar estoque.");
  };

  const renderStatus = (p: Produto) => p.ativo
    ? <Badge className="bg-success/15 text-success">Ativo</Badge>
    : <Badge variant="outline">Inativo</Badge>;

  const renderEstoqueBadge = (p: Produto) => {
    if (!controlaEstoqueProduto(p)) return <Badge variant="outline">Representação</Badge>;
    const status = estoqueStatus(estoqueDisponivelProduto(p));
    return <Badge className={status.cls}>{status.label}</Badge>;
  };

  if (selectedProduct) {
    const controlaEstoque = controlaEstoqueProduto(selectedProduct);
    const disponivel = estoqueDisponivelProduto(selectedProduct);
    const status = controlaEstoque ? estoqueStatus(disponivel) : { label: "Sem controle de estoque", cls: "bg-muted text-muted-foreground" };
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Button variant="ghost" className="mb-2 px-0" onClick={() => setSelectedId(null)}><ArrowLeft className="mr-2 h-4 w-4" />Voltar para Produtos</Button>
            <h2 className="text-2xl font-semibold tracking-tight">Ficha do produto</h2>
            <p className="text-sm text-muted-foreground">Cadastro mestre com preço, custo, estoque e vínculos operacionais.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => ajustarEstoque(selectedProduct)}><Boxes className="mr-2 h-4 w-4" />Ajustar estoque</Button>
            <Button onClick={() => openEdit(selectedProduct)}><Pencil className="mr-2 h-4 w-4" />Editar produto</Button>
          </div>
        </div>

        {controlaEstoque && disponivel < 0 && (
          <Alert className="border-destructive/30 bg-destructive/5 text-destructive">
            <TriangleAlert className="h-4 w-4" />
            <AlertTitle>Estoque disponível negativo</AlertTitle>
            <AlertDescription>O estoque reservado é maior que o estoque atual. Ajuste os campos antes de confirmar novas reservas.</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{selectedProduct.codigo}</div>
                <h3 className="text-xl font-semibold">{selectedProduct.nome}</h3>
                <p className="text-sm text-muted-foreground">{selectedProduct.categoria} · {selectedProduct.unidade}</p>
              </div>
              <div className="flex flex-wrap gap-2">{renderStatus(selectedProduct)}<Badge className={status.cls}>{controlaEstoque ? status.label : "Sem controle de estoque"}</Badge></div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Info label="Fornecedor/empresa" value={selectedProduct.fornecedor || "Não informado"} />
              <Info label="Controle de estoque" value={controlaEstoque ? "Com controle de estoque" : "Sem controle de estoque"} />
              <Info label="Local de estoque" value={controlaEstoque ? selectedProduct.localEstoque || "Não informado" : "Não aplicável"} />
              <Info label="Preço de venda" value={fmtBRL(selectedProduct.precoLista)} />
              <Info label="Preço mínimo" value={fmtBRL(selectedProduct.precoMinimo)} />
              <Info label="Custo" value={fmtBRL(selectedProduct.custo)} />
              <Info label="Margem" value={`${Number(selectedProduct.margem || 0).toFixed(2).replace(".", ",")}%`} />
              <Info label="Criado em" value={selectedProduct.createdAt ? new Date(selectedProduct.createdAt).toLocaleString("pt-BR") : "Dado local legado"} />
              <Info label="Atualizado em" value={selectedProduct.updatedAt ? new Date(selectedProduct.updatedAt).toLocaleString("pt-BR") : selectedProduct.ultimaAtualizacao || "Não informado"} />
            </div>
            {selectedProduct.observacoes && <div className="mt-4 rounded-md bg-muted/50 p-3 text-sm"><b>Observações:</b> {selectedProduct.observacoes}</div>}
          </Card>

          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 font-semibold"><Boxes className="h-4 w-4" />Estoque do produto</h3>
            {controlaEstoque ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  <Metric label="Estoque atual" value={fmtNum(selectedProduct.estoqueAtual)} />
                  <Metric label="Estoque reservado" value={fmtNum(selectedProduct.estoqueReservado)} />
                  <Metric label="Estoque disponível" value={fmtNum(disponivel)} danger={disponivel < 0} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Disponível = estoque atual − estoque reservado.</p>
              </>
            ) : (
              <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">Produto sem controle de estoque — representação/comissão. Indicadores de estoque não aplicáveis.</div>
            )}
          </Card>
        </div>

        <Card className="p-4">
          <h3 className="mb-3 font-semibold">Vínculos atuais e histórico futuro</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <Metric label="Funil/negócios" value={String(vinculosProduto.negocios)} />
            <Metric label="Oportunidades" value={String(vinculosProduto.oportunidades)} />
            <Metric label="Orçamentos" value={String(vinculosProduto.orcamentos)} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">A ficha preserva os vínculos existentes para consumo pelo funil, oportunidades e orçamentos; histórico detalhado fica preparado para sprints futuras.</p>
        </Card>

        {renderDialog()}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Produtos</h2>
          <p className="text-sm text-muted-foreground">Cadastro central de produtos, preços, estoque e reservas.</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Novo produto</Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Label className="text-xs">Buscar</Label>
            <Search className="absolute left-2 top-[30px] h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-7" placeholder="Nome ou código..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <FilterSelect label="Categoria" value={fCat} width="w-40" options={categorias} onChange={setFCat} />
          <FilterSelect label="Fornecedor" value={fForn} width="w-40" options={fornecedores} onChange={setFForn} />
          <div><Label className="text-xs">Controle estoque</Label>
            <Select value={fControleEstoque || ALL} onValueChange={(v) => setFControleEstoque(v === ALL ? "" : v)}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>Todos</SelectItem><SelectItem value="com">Com controle de estoque</SelectItem><SelectItem value="sem">Sem controle de estoque</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Status</Label>
            <Select value={fStatus || ALL} onValueChange={(v) => setFStatus(v === ALL ? "" : v)}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>Todos</SelectItem><SelectItem value="ativo">Ativo</SelectItem><SelectItem value="inativo">Inativo</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="cadastro" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 md:w-auto">
          <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
          <TabsTrigger value="precos">Preços</TabsTrigger>
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
          <TabsTrigger value="reservas">Reservas</TabsTrigger>
        </TabsList>
        <TabsContent value="cadastro">{renderCadastroTable()}</TabsContent>
        <TabsContent value="precos">{renderPrecosTable()}</TabsContent>
        <TabsContent value="estoque">{renderEstoqueTable()}</TabsContent>
        <TabsContent value="reservas">{renderReservasTable()}</TabsContent>
      </Tabs>

      {renderMobileCards()}
      {renderDialog()}
    </div>
  );

  function renderCadastroTable() {
    return (
      <Card className="hidden overflow-x-auto p-0 md:block">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Código</TableHead><TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead>Un.</TableHead><TableHead>Fornecedor</TableHead><TableHead>Controle</TableHead><TableHead>Local</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>{list.map((p) => <TableRow key={p.id}>
            <TableCell className="font-mono text-xs">{p.codigo}</TableCell><TableCell className="font-medium">{p.nome}</TableCell><TableCell>{p.categoria}</TableCell><TableCell>{p.unidade}</TableCell><TableCell>{p.fornecedor}</TableCell><TableCell>{controlaEstoqueProduto(p) ? <Badge variant="outline">Com estoque</Badge> : <Badge variant="outline">Representação</Badge>}</TableCell><TableCell>{controlaEstoqueProduto(p) ? p.localEstoque || "-" : "Não aplicável"}</TableCell><TableCell>{renderStatus(p)}</TableCell><TableCell className="text-right">{renderActions(p)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </Card>
    );
  }

  function renderPrecosTable() {
    return (
      <Card className="hidden overflow-x-auto p-0 md:block">
        <Table>
          <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>Fornecedor</TableHead><TableHead className="text-right">Preço venda</TableHead><TableHead className="text-right">Preço mín.</TableHead><TableHead className="text-right">Custo</TableHead><TableHead className="text-right">Margem</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>{list.map((p) => <TableRow key={p.id}><TableCell><button className="text-left font-medium hover:underline" onClick={() => setSelectedId(p.id)}>{p.nome}<span className="block font-mono text-xs text-muted-foreground">{p.codigo}</span></button></TableCell><TableCell>{p.fornecedor || "-"}</TableCell><TableCell className="text-right">{fmtBRL(p.precoLista)}</TableCell><TableCell className="text-right">{fmtBRL(p.precoMinimo)}</TableCell><TableCell className="text-right">{fmtBRL(p.custo)}</TableCell><TableCell className="text-right">{`${Number(p.margem || 0).toFixed(2).replace(".", ",")}%`}</TableCell><TableCell className="text-right">{renderActions(p)}</TableCell></TableRow>)}</TableBody>
        </Table>
      </Card>
    );
  }

  function renderEstoqueTable() {
    return (
      <Card className="hidden overflow-x-auto p-0 md:block">
        <Table>
          <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>Un.</TableHead><TableHead className="text-right">Atual</TableHead><TableHead className="text-right">Reservado</TableHead><TableHead className="text-right">Disponível</TableHead><TableHead>Local</TableHead><TableHead>Status estoque</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>{list.map((p) => { const controla = controlaEstoqueProduto(p); const disp = estoqueDisponivelProduto(p); return <TableRow key={p.id}><TableCell><button className="text-left font-medium hover:underline" onClick={() => setSelectedId(p.id)}>{p.nome}<span className="block font-mono text-xs text-muted-foreground">{p.codigo}</span></button></TableCell><TableCell>{p.unidade}</TableCell><TableCell className="text-right">{controla ? fmtNum(p.estoqueAtual) : "N/A"}</TableCell><TableCell className="text-right">{controla ? fmtNum(p.estoqueReservado) : "N/A"}</TableCell><TableCell className={controla && disp < 0 ? "text-right font-semibold text-destructive" : "text-right"}>{controla ? fmtNum(disp) : "Não aplicável"}</TableCell><TableCell>{controla ? p.localEstoque || "-" : "Não aplicável"}</TableCell><TableCell>{renderEstoqueBadge(p)}</TableCell><TableCell className="text-right">{renderActions(p, true)}</TableCell></TableRow>; })}</TableBody>
        </Table>
      </Card>
    );
  }

  function renderReservasTable() {
    const reservados = list.filter((p) => controlaEstoqueProduto(p) && p.estoqueReservado > 0);
    return (
      <Card className="hidden overflow-x-auto p-0 md:block">
        <Table>
          <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="text-right">Estoque atual</TableHead><TableHead className="text-right">Reservado</TableHead><TableHead className="text-right">Disponível</TableHead><TableHead>Local</TableHead><TableHead>Alerta</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>{reservados.map((p) => { const disp = estoqueDisponivelProduto(p); return <TableRow key={p.id}><TableCell><button className="text-left font-medium hover:underline" onClick={() => setSelectedId(p.id)}>{p.nome}<span className="block font-mono text-xs text-muted-foreground">{p.codigo}</span></button></TableCell><TableCell className="text-right">{fmtNum(p.estoqueAtual)}</TableCell><TableCell className="text-right">{fmtNum(p.estoqueReservado)}</TableCell><TableCell className={disp < 0 ? "text-right font-semibold text-destructive" : "text-right"}>{fmtNum(disp)}</TableCell><TableCell>{p.localEstoque || "-"}</TableCell><TableCell>{disp < 0 ? <Badge className="bg-destructive/15 text-destructive">Reserva acima do estoque</Badge> : <Badge variant="outline">Reserva vinculada ao produto</Badge>}</TableCell><TableCell className="text-right">{renderActions(p, true)}</TableCell></TableRow>; })}</TableBody>
        </Table>
        {reservados.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum produto com estoque reservado nos filtros atuais.</p>}
      </Card>
    );
  }

  function renderMobileCards() {
    return (
      <div className="space-y-2 md:hidden">
        {list.map((p) => {
          const controla = controlaEstoqueProduto(p);
          const disp = estoqueDisponivelProduto(p);
          return (
            <Card key={p.id} className="space-y-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <button className="text-left" onClick={() => setSelectedId(p.id)}><div className="font-semibold">{p.nome}</div><div className="text-xs text-muted-foreground">{p.codigo} · {p.unidade}</div></button>
                {renderStatus(p)}
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <span>Preço: <b>{fmtBRL(p.precoLista)}</b></span><span>Custo: <b>{fmtBRL(p.custo)}</b></span>
                {controla ? (<>
                  <span>Atual: <b>{fmtNum(p.estoqueAtual)}</b></span><span>Reservado: <b>{fmtNum(p.estoqueReservado)}</b></span>
                  <span className={disp < 0 ? "text-destructive" : ""}>Disponível: <b>{fmtNum(disp)}</b></span><span>Local: <b>{p.localEstoque || "-"}</b></span>
                </>) : <span className="col-span-2"><Badge variant="outline">Representação</Badge> Produto sem controle de estoque</span>}
              </div>
              <div className="flex justify-end gap-1">{renderActions(p, true)}</div>
            </Card>
          );
        })}
      </div>
    );
  }

  function renderActions(p: Produto, estoque = false) {
    return <><Button size="icon" variant="ghost" title="Abrir ficha" onClick={() => setSelectedId(p.id)}><Eye className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" title={estoque ? "Ajustar estoque" : "Editar"} onClick={() => estoque ? ajustarEstoque(p) : openEdit(p)}>{estoque ? <Boxes className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}</Button><Button size="icon" variant="ghost" title="Excluir" onClick={() => excluir(p)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></>;
  }

  function renderDialog() {
    const controlaEstoque = controlaEstoqueProduto(form);
    const disponivel = estoqueDisponivelProduto(form);
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{edit ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-3">
            <div><Label>Código/SKU</Label><Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Nome</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div><Label>Categoria</Label><Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Unidade</Label><Input list="unidades-produto" value={form.unidade} onChange={(e) => setForm({ ...form, unidade: normalizeProductUnit(e.target.value) })} /><datalist id="unidades-produto">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist><p className="mt-1 text-xs text-muted-foreground">Sugestões padrão disponíveis; novas unidades comerciais também são permitidas.</p></div>
            <div><Label>Fornecedor/empresa</Label><Input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} /></div>
            <div><Label>Preço de venda</Label><Input type="number" step="0.01" value={form.precoLista} onChange={(e) => setForm({ ...form, precoLista: +e.target.value })} /></div>
            <div><Label>Preço mínimo</Label><Input type="number" step="0.01" value={form.precoMinimo} onChange={(e) => setForm({ ...form, precoMinimo: +e.target.value })} /></div>
            <div><Label>Custo</Label><Input type="number" step="0.01" value={form.custo} onChange={(e) => setForm({ ...form, custo: +e.target.value })} /></div>
            <div><Label>Margem (%)</Label><Input type="number" value={form.precoLista > 0 ? (((form.precoLista - form.custo) / form.precoLista) * 100).toFixed(2) : 0} disabled /></div>
            <div className="rounded-md border p-3 md:col-span-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>Controla estoque?</Label>
                  <p className="text-xs text-muted-foreground">Marque “Sim” apenas para produtos com controle físico de estoque.</p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span>Não</span>
                  <Switch checked={controlaEstoque} onCheckedChange={(checked) => setForm({ ...form, controlaEstoque: checked })} />
                  <span>Sim</span>
                </div>
              </div>
            </div>
            {controlaEstoque ? (<>
              <div><Label>Estoque atual</Label><Input type="number" value={form.estoqueAtual} onChange={(e) => setForm({ ...form, estoqueAtual: +e.target.value })} /></div>
              <div><Label>Estoque reservado</Label><Input type="number" value={form.estoqueReservado} onChange={(e) => setForm({ ...form, estoqueReservado: +e.target.value })} /></div>
              <div><Label>Estoque disponível</Label><Input className={disponivel < 0 ? "border-destructive text-destructive" : ""} type="number" value={disponivel} disabled /></div>
              <div><Label>Local estoque</Label><Input value={form.localEstoque} onChange={(e) => setForm({ ...form, localEstoque: e.target.value })} /></div>
            </>) : (
              <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground md:col-span-3">Produto sem controle de estoque — representação/comissão. Preço, custo, fornecedor, categoria e uso comercial continuam disponíveis; dados de estoque existentes são preservados.</div>
            )}
            <div><Label>Status</Label><Select value={form.ativo ? "1" : "0"} onValueChange={(v) => setForm({ ...form, ativo: v === "1" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">Ativo</SelectItem><SelectItem value="0">Inativo</SelectItem></SelectContent></Select></div>
            <div className="md:col-span-3"><Label>Observações</Label><Textarea rows={2} value={form.observacoes || ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
          </div>
          {controlaEstoque && disponivel < 0 && <p className="text-sm text-destructive">Alerta: estoque disponível negativo ({fmtNum(disponivel)}). O produto será salvo para preservar dados, mas deve ser revisado.</p>}
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border p-3"><div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 font-medium">{value}</div></div>;
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return <div className="rounded-md border p-3"><div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div><div className={danger ? "mt-1 text-xl font-semibold text-destructive" : "mt-1 text-xl font-semibold"}>{value}</div></div>;
}

function FilterSelect({ label, value, width, options, onChange }: { label: string; value: string; width: string; options: string[]; onChange: (value: string) => void }) {
  return <div><Label className="text-xs">{label}</Label><Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}><SelectTrigger className={width}><SelectValue placeholder="Todos" /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos</SelectItem>{options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></div>;
}
