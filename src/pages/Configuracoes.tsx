import { ChangeEvent, useEffect, useRef, useState } from "react";
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
import { RegraComissao, AplicarSobre, FaixaComissao } from "@/types";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getLocalDbStats, LocalDbStats, replaceLocalDatabase, resetLocalDatabase } from "@/lib/localRepository";
import { exportAllEntitiesToCsv } from "@/lib/csvService";
import { exportWorkbook } from "@/lib/excelService";
import { downloadBackupJson, parseBackupPayload } from "@/lib/backupService";

const APLICAR: { v: AplicarSobre; label: string }[] = [
  { v: "realizado_empresa", label: "Realizado empresa" }, { v: "realizado_pessoal", label: "Realizado pessoal" },
  { v: "negocio_fechado", label: "Negócio fechado" }, { v: "categoria", label: "Categoria de produto" },
  { v: "frente_comercial", label: "Frente comercial" }, { v: "meta_empresa", label: "Meta empresa" }, { v: "meta_pessoal", label: "Meta pessoal" },
];
const emptyRegra: Omit<RegraComissao, "id"> = { nome: "", tipo: "fixa", percentual: 1, aplicarSobre: "negocio_fechado", ativo: true, faixas: [{ min: 80, max: 89, percentual: 0.5 }] };

export default function Configuracoes() {
  const {
    regras, setRegras, vendedores, setVendedores, dbError,
    clientes, lancamentos, negocios, produtos, metasEmpresa, metasPessoais, eventos, metasVendedor, metasCategoria, prioridadesP1,
    setClientes, setLancamentos, setNegocios, setProdutos, setMetasEmpresa, setMetasPessoais, setEventos, setMetasVendedor, setMetasCategoria, setPrioridadesP1,
  } = useAppStore();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<RegraComissao | null>(null);
  const [form, setForm] = useState<Omit<RegraComissao, "id">>(emptyRegra);
  const [novoVend, setNovoVend] = useState("");
  const [stats, setStats] = useState<LocalDbStats | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadStats = async () => {
    try { setStats(await getLocalDbStats()); } catch (error) { console.error(error); }
  };
  useEffect(() => { void loadStats(); }, []);

  const exportPayload = {
    clientes, vendedores, lancamentos, negocios, produtos, metasEmpresa, metasPessoais, regrasComissao: regras, eventos,
    configuracoes: [], metasVendedor, metasCategoria, prioridadesP1,
  };

  const handleRestoreFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const restored = parseBackupPayload(content);
      const ok = window.confirm("Esta ação substituirá os dados locais atuais pelos dados do backup selecionado. Essa ação não pode ser desfeita nesta versão. Deseja continuar?");
      if (!ok) return;

      await replaceLocalDatabase({ ...restored, regrasComissao: restored.regrasComissao });
      setClientes(restored.clientes as never[]);
      setVendedores(restored.vendedores as never[]);
      setLancamentos(restored.lancamentos as never[]);
      setNegocios(restored.negocios as never[]);
      setProdutos(restored.produtos as never[]);
      setMetasEmpresa(restored.metasEmpresa as never[]);
      setMetasPessoais(restored.metasPessoais as never[]);
      setRegras(restored.regrasComissao as never[]);
      setEventos(restored.eventos as never[]);
      setMetasVendedor((restored.metasVendedor ?? []) as never[]);
      setMetasCategoria((restored.metasCategoria ?? []) as never[]);
      setPrioridadesP1((restored.prioridadesP1 ?? []) as never[]);

      toast.success("Backup restaurado com sucesso.");
      void loadStats();
    } catch {
      toast.error("Arquivo de backup inválido ou incompatível com o aplicativo.");
    } finally {
      event.target.value = "";
    }
  };

  const openNew = () => { setEdit(null); setForm(emptyRegra); setOpen(true); };
  const openEdit = (r: RegraComissao) => { setEdit(r); const { id, ...rest } = r; void id; setForm(rest); setOpen(true); };
  const save = () => {
    if (!form.nome) return toast.error("Nome obrigatório.");
    if (edit) setRegras(prev => prev.map(r => r.id === edit.id ? { ...form, id: edit.id } : r));
    else setRegras(prev => [...prev, { ...form, id: `rc${Date.now()}` }]);
    setOpen(false); toast.success("Regra salva."); void loadStats();
  };

  const addFaixa = () => setForm(f => ({ ...f, faixas: [...(f.faixas || []), { min: 0, max: 100, percentual: 0 }] }));
  const updFaixa = (i: number, k: keyof FaixaComissao, v: number) => setForm(f => ({ ...f, faixas: (f.faixas || []).map((x, idx) => idx === i ? { ...x, [k]: v } : x) }));
  const rmFaixa = (i: number) => setForm(f => ({ ...f, faixas: (f.faixas || []).filter((_, idx) => idx !== i) }));

  return <div className="space-y-4">
    {dbError && <Card className="border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{dbError}</Card>}
    <Tabs defaultValue="comissao">
      <TabsList>
        <TabsTrigger value="comissao">Regras de comissão</TabsTrigger>
        <TabsTrigger value="vendedores">Vendedores</TabsTrigger>
        <TabsTrigger value="banco-local">Banco local</TabsTrigger>
      </TabsList>

      <TabsContent value="comissao" className="space-y-3">{/* unchanged table */}
        <div className="flex justify-end"><Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Nova regra</Button></div>
        <Card className="overflow-x-auto p-0"><Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead>Aplicar sobre</TableHead><TableHead>Alvo</TableHead><TableHead>Percentual / Faixas</TableHead><TableHead>Ativo</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{regras.map(r => <TableRow key={r.id}><TableCell className="font-medium">{r.nome}</TableCell><TableCell><Badge variant="outline">{r.tipo}</Badge></TableCell><TableCell>{APLICAR.find(a => a.v === r.aplicarSobre)?.label}</TableCell><TableCell>{r.alvo || "—"}</TableCell><TableCell className="text-xs">{r.tipo === "fixa" ? `${r.percentual}%` : r.faixas?.map(f => `${f.min}-${f.max}%: ${f.percentual}%`).join(" | ")}</TableCell><TableCell>{r.ativo ? <Badge className="bg-success/15 text-success">Sim</Badge> : <Badge variant="outline">Não</Badge>}</TableCell><TableCell className="text-right"><Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" onClick={() => { if (!window.confirm("Esta ação não pode ser desfeita nesta versão. Deseja continuar?")) return; setRegras(prev => prev.filter(x => x.id !== r.id)); toast.success("Excluída."); void loadStats(); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></TableCell></TableRow>)}</TableBody></Table></Card>
      </TabsContent>

      <TabsContent value="vendedores" className="space-y-3"><Card className="p-4"><div className="flex gap-2"><Input placeholder="Nome do vendedor" value={novoVend} onChange={e => setNovoVend(e.target.value)} className="max-w-xs" /><Button onClick={() => { if (!novoVend) return; setVendedores(prev => [...prev, { id: `v${Date.now()}`, nome: novoVend }]); setNovoVend(""); toast.success("Vendedor adicionado."); void loadStats(); }}><Plus className="mr-1 h-4 w-4" />Adicionar</Button></div><div className="mt-4 flex flex-wrap gap-2">{vendedores.map(v => <Badge key={v.id} variant="outline" className="px-3 py-1">{v.nome}<button className="ml-2 text-destructive" onClick={() => { if (!window.confirm("Esta ação não pode ser desfeita nesta versão. Deseja continuar?")) return; setVendedores(prev => prev.filter(x => x.id !== v.id)); void loadStats(); }}>×</button></Badge>)}</div></Card></TabsContent>

      <TabsContent value="banco-local">
        <Card className="space-y-3 p-4 text-sm">
          <div><b>Status do banco:</b> {stats?.status || "ativo"}</div>
          <div><b>Tipo:</b> {stats?.tipo || "IndexedDB"}</div>
          <div><b>Data da primeira criação:</b> {stats?.createdAt ? new Date(stats.createdAt).toLocaleString("pt-BR") : "-"}</div>
          <div><b>Última atualização:</b> {stats?.updatedAt ? new Date(stats.updatedAt).toLocaleString("pt-BR") : "-"}</div>
          <div className="grid gap-1">{stats && Object.entries(stats.counts).map(([k, v]) => <div key={k}>{k}: {v}</div>)}</div>
          <Button variant="destructive" onClick={async () => {
            if (!window.confirm("Esta ação apagará os dados locais deste navegador. Essa ação não pode ser desfeita nesta versão. Deseja continuar?")) return;
            await resetLocalDatabase();
            toast.success("Base local limpa. Recarregando dados de demonstração...");
            window.location.reload();
          }}>Limpar base local</Button>
          <Card className="space-y-2 border-dashed p-3">
            <div className="font-semibold">Exportação e backup</div>
            <p className="text-xs text-muted-foreground">Use estas opções para salvar seus dados fora do navegador, enviar por e-mail, WhatsApp ou guardar em local seguro.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={() => exportWorkbook(exportPayload)}>Exportar Excel</Button>
              <Button variant="outline" onClick={() => exportAllEntitiesToCsv(exportPayload)}>Exportar CSV</Button>
              <Button variant="outline" onClick={() => downloadBackupJson(exportPayload)}>Gerar backup JSON</Button>
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>Restaurar backup JSON</Button>
            </div>
            <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleRestoreFile} />
          </Card>
        </Card>
      </TabsContent>
    </Tabs>

    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{edit ? "Editar regra" : "Nova regra de comissão"}</DialogTitle></DialogHeader><div className="grid gap-3 md:grid-cols-2"><div className="md:col-span-2"><Label>Nome da regra</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div><div><Label>Tipo</Label><Select value={form.tipo} onValueChange={(v: "fixa" | "escalonada") => setForm({ ...form, tipo: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fixa">Fixa</SelectItem><SelectItem value="escalonada">Escalonada</SelectItem></SelectContent></Select></div><div><Label>Aplicar sobre</Label><Select value={form.aplicarSobre} onValueChange={(v: AplicarSobre) => setForm({ ...form, aplicarSobre: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{APLICAR.map(a => <SelectItem key={a.v} value={a.v}>{a.label}</SelectItem>)}</SelectContent></Select></div>{form.tipo === "fixa" && (<div><Label>Percentual (%)</Label><Input type="number" step="0.1" value={form.percentual || 0} onChange={e => setForm({ ...form, percentual: +e.target.value })} /></div>)}<div className="flex items-end gap-2"><Switch checked={form.ativo} onCheckedChange={v => setForm({ ...form, ativo: v })} /><Label>Ativo</Label></div></div>{form.tipo === "escalonada" && <div className="mt-3 rounded-md border border-border p-3"><div className="mb-2 flex items-center justify-between"><Label className="text-sm font-semibold">Faixas escalonadas</Label><Button size="sm" variant="outline" onClick={addFaixa}><Plus className="mr-1 h-3 w-3" /> Faixa</Button></div><div className="space-y-2">{(form.faixas || []).map((f, i) => <div key={i} className="grid grid-cols-4 gap-2"><Input type="number" placeholder="Mín %" value={f.min} onChange={e => updFaixa(i, "min", +e.target.value)} /><Input type="number" placeholder="Máx %" value={f.max} onChange={e => updFaixa(i, "max", +e.target.value)} /><Input type="number" step="0.1" placeholder="% comissão" value={f.percentual} onChange={e => updFaixa(i, "percentual", +e.target.value)} /><Button size="icon" variant="ghost" onClick={() => rmFaixa(i)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div>)}</div></div>}<DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
