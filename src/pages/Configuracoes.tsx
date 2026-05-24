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
import { BaseMode, ImportLog, RegraComissao, AplicarSobre, FaixaComissao, CATEGORIAS_PRODUTO_PADRAO, Empresa, FormaPagamento } from "@/types";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getLocalDbStats, LocalDbStats, replaceLocalDatabase, resetLocalDatabase, saveStore } from "@/lib/localRepository";
import { clearLocalAppDeviceData } from "@/lib/clientCleanup";
import { exportAllEntitiesToCsv } from "@/lib/csvService";
import { exportWorkbook } from "@/lib/excelService";
import { downloadBackupJson, parseBackupPayload } from "@/lib/backupService";
import { applyImport, buildImportPreview, IMPORT_TEMPLATES, ImportEntity, ImportMode, ImportPreview, parseCsv } from "@/lib/importService";
import { saveAsTextFile } from "@/lib/fileDownload";
import { openAppDb, promisifyRequest } from "@/lib/db";

const APLICAR: { v: AplicarSobre; label: string }[] = [
  { v: "realizado_empresa", label: "Realizado empresa" }, { v: "realizado_pessoal", label: "Realizado pessoal" },
  { v: "negocio_fechado", label: "Negócio fechado" }, { v: "categoria", label: "Categoria de produto" },
  { v: "frente_comercial", label: "Frente comercial" }, { v: "meta_empresa", label: "Meta empresa" }, { v: "meta_pessoal", label: "Meta pessoal" },
];
const emptyRegra: Omit<RegraComissao, "id"> = { nome: "", tipo: "fixa", percentual: 1, aplicarSobre: "negocio_fechado", ativo: true, faixas: [{ min: 80, max: 89, percentual: 0.5 }] };

const defaultEmpresa: Empresa = { id: "", nomeFantasia: "", razaoSocial: "", cnpj: "", inscricaoEstadual: "", endereco: "", cidadeUf: "", telefone: "", email: "", consultorPadrao: "", observacoesComerciaisPadrao: "", ativa: true, padrao: false, logoDataUrl: "" };

export default function Configuracoes() {
  const {
    regras, setRegras, vendedores, setVendedores, ticketsMedios, setTicketsMedios, dbError, isSaving, lastSavedAt, saveError,
    clientes, lancamentos, negocios, produtos, metasEmpresa, metasPessoais, eventos, metasVendedor, metasCategoria, prioridadesP1, orcamentos, setOrcamentos, empresas, setEmpresas, formasPagamento, setFormasPagamento,
    setClientes, setLancamentos, setNegocios, setProdutos, setMetasEmpresa, setMetasPessoais, setEventos, setMetasVendedor, setMetasCategoria, setPrioridadesP1, appConfig, setAppConfig,
  } = useAppStore();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<RegraComissao | null>(null);
  const [form, setForm] = useState<Omit<RegraComissao, "id">>(emptyRegra);
  const [novoVend, setNovoVend] = useState("");
  const [novoTel, setNovoTel] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [stats, setStats] = useState<LocalDbStats | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [importEntity, setImportEntity] = useState<ImportEntity>("clientes");
  const [importMode, setImportMode] = useState<ImportMode>("add");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [baseMode, setBaseMode] = useState<BaseMode>((localStorage.getItem("baseMode") as BaseMode) || "teste");
  const [importLogs, setImportLogs] = useState<ImportLog[]>([]);
  const [lastBackupAt, setLastBackupAt] = useState<string>("");
  const [dadosEmpresa, setDadosEmpresa] = useState<Empresa>(defaultEmpresa);
  const categoriasTicket = [...new Set([...CATEGORIAS_PRODUTO_PADRAO, ...ticketsMedios.map((t) => t.categoria)])];
  const isCategoriaPadrao = (categoria: string) => CATEGORIAS_PRODUTO_PADRAO.includes(categoria as (typeof CATEGORIAS_PRODUTO_PADRAO)[number]);


  const loadStats = async () => {
    try { setStats(await getLocalDbStats()); } catch (error) { console.error(error); }
  };
  useEffect(() => { void loadStats();
    void (async () => {
      const db = await openAppDb();
      const tx = db.transaction("importLogs", "readonly");
      const logs = await promisifyRequest(tx.objectStore("importLogs").getAll()) as ImportLog[];
      setImportLogs(logs.sort((a,b)=>b.dataHora.localeCompare(a.dataHora)));
      db.close();
    })();
  }, []);

  const exportPayload = {
    clientes, vendedores, lancamentos, negocios, produtos, metasEmpresa, metasPessoais, regrasComissao: regras, eventos,
    configuracoes: ticketsMedios, metasVendedor, metasCategoria, prioridadesP1, orcamentos, empresas, formasPagamento,
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
      setOrcamentos((restored.orcamentos ?? []) as never[]);
      setEmpresas((restored.empresas ?? []) as never[]);
      setFormasPagamento((restored.formasPagamento ?? []) as never[]);

      toast.success("Backup restaurado com sucesso.");
      void loadStats();
    } catch {
      toast.error("Arquivo de backup inválido ou incompatível com o aplicativo.");
    } finally {
      event.target.value = "";
    }
  };



  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext && ["xlsx", "xls", "xml"].includes(ext)) {
        toast.error("Importação Excel ainda não suportada. Exporte a planilha como CSV e tente novamente.");
        return;
      }
      const hasBackup = window.confirm("Backup recomendado antes de homologar dados reais.\nDeseja continuar sem gerar backup agora?");
      if (!hasBackup) { downloadBackupJson(exportPayload); setLastBackupAt(new Date().toISOString()); toast.message("Backup gerado. Selecione o arquivo novamente para importar."); return; }
      if (baseMode === "operacional") toast.warning("Use base Operacional apenas após validar os dados importados.");
      toast.message("Você está importando dados em ambiente de teste/homologação.");
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) throw new Error();
      const preview = buildImportPreview(file.name, importEntity, rows);
      setImportPreview(preview);
      setPreviewOpen(true);
    } catch {
      toast.error("Arquivo inválido ou sem dados para importação.");
    } finally {
      event.target.value = "";
    }
  };

  const confirmImport = () => {
    if (!importPreview) return;
    if (importMode === "replace" && !window.confirm("Esta ação substituirá todos os dados atuais desta entidade pelos dados importados. Essa ação não pode ser desfeita nesta versão. Deseja continuar?")) return;

    const apply = (entity: ImportEntity, current: never[], setter: (v: never[])=>void) => {
      const result = applyImport(entity, importMode, current as { id: string }[], importPreview);
      setter(result.data as never[]);
      toast.success(`Importação concluída: ${result.imported} criados, ${result.updated} atualizados, ${result.ignored} ignorados, ${result.duplicates} duplicidades.`);
      return result;
    };

    let summary = { imported: 0, updated: 0, ignored: 0, duplicates: 0 };
    if (importEntity === "clientes") summary = apply("clientes", clientes as never[], setClientes) || summary;
    if (importEntity === "vendedores") summary = apply("vendedores", vendedores as never[], setVendedores);
    if (importEntity === "lancamentos") summary = apply("lancamentos", lancamentos as never[], setLancamentos);
    if (importEntity === "negocios") summary = apply("negocios", negocios as never[], setNegocios);
    if (importEntity === "produtos") summary = apply("produtos", produtos as never[], setProdutos);
    if (importEntity === "metasEmpresa") summary = apply("metasEmpresa", metasEmpresa as never[], setMetasEmpresa);
    if (importEntity === "metasPessoais") summary = apply("metasPessoais", metasPessoais as never[], setMetasPessoais);
    if (importEntity === "regrasComissao") summary = apply("regrasComissao", regras as never[], setRegras);
    if (importEntity === "eventos") summary = apply("eventos", eventos as never[], setEventos);
    if (importEntity === "prioridadesP1") summary = apply("prioridadesP1", prioridadesP1 as never[], setPrioridadesP1);
    if (importEntity === "empresas") summary = apply("empresas", empresas as never[], setEmpresas as never);
    if (importEntity === "formasPagamento") summary = apply("formasPagamento", formasPagamento as never[], setFormasPagamento as never);
    if (importEntity === "ticketsMedios") summary = apply("ticketsMedios", ticketsMedios as never[], setTicketsMedios as never);
    const log: ImportLog = { id: `ilog-${Date.now()}`, arquivo: importPreview.fileName, dataHora: new Date().toISOString(), entidade: importEntity, registrosLidos: importPreview.totalRows, registrosCriados: summary.imported, registrosAtualizados: summary.updated, registrosIgnorados: summary.ignored, erros: importPreview.errorRows, avisos: importPreview.rows.reduce((a,r)=>a+r.warnings.length,0) };
    setImportLogs((prev)=>[log, ...prev]);
    void saveStore("importLogs", [log, ...importLogs]);
    setPreviewOpen(false);
    setImportPreview(null);
    void loadStats();
  };

  const downloadTemplate = (key: keyof typeof IMPORT_TEMPLATES) => {
    const csv = `${IMPORT_TEMPLATES[key].join(";")}\n`;
    saveAsTextFile(`template_${key}.csv`, csv, "text/csv;charset=utf-8");
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

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) { toast.error("Use PNG ou JPG/JPEG."); return; }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error());
      reader.readAsDataURL(file);
    });
    setDadosEmpresa((prev) => ({ ...prev, logoDataUrl: dataUrl }));
    event.target.value = "";
  };

  return <div className="space-y-4">
    <Card className="p-4">
      <div className="grid gap-2 md:grid-cols-3 items-end">
        <div>
          <Label>Taxa de acerto da carteira (%)</Label>
          <Input type="number" min={0} max={100} step="0.01" value={appConfig.percentualAcertoEsperado} onChange={(e)=>{const v=Math.min(100,Math.max(0,Number(e.target.value||0))); setAppConfig({ ...appConfig, percentualAcertoEsperado: v });}} />
        </div>
        <p className="text-xs text-muted-foreground md:col-span-2">Valor padrão sugerido: 12. Usado no Dashboard para calcular meta da carteira.</p>
      </div>
    </Card>
    {dbError && <Card className="border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{dbError}</Card>}
    <Tabs defaultValue="comissao">
      <TabsList>
        <TabsTrigger value="comissao">Regras de comissão</TabsTrigger>
        <TabsTrigger value="vendedores">Vendedores</TabsTrigger>
        <TabsTrigger value="tickets">Regras comerciais</TabsTrigger>
        <TabsTrigger value="dados-empresa">Empresas</TabsTrigger>
        <TabsTrigger value="banco-local">Banco local</TabsTrigger>
      </TabsList>

      <TabsContent value="comissao" className="space-y-3">{/* unchanged table */}
        <div className="flex justify-end"><Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Nova regra</Button></div>
        <Card className="overflow-x-auto p-0"><Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead>Aplicar sobre</TableHead><TableHead>Alvo</TableHead><TableHead>Percentual / Faixas</TableHead><TableHead>Ativo</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{regras.map(r => <TableRow key={r.id}><TableCell className="font-medium">{r.nome}</TableCell><TableCell><Badge variant="outline">{r.tipo}</Badge></TableCell><TableCell>{APLICAR.find(a => a.v === r.aplicarSobre)?.label}</TableCell><TableCell>{r.alvo || "—"}</TableCell><TableCell className="text-xs">{r.tipo === "fixa" ? `${r.percentual}%` : r.faixas?.map(f => `${f.min}-${f.max}%: ${f.percentual}%`).join(" | ")}</TableCell><TableCell>{r.ativo ? <Badge className="bg-success/15 text-success">Sim</Badge> : <Badge variant="outline">Não</Badge>}</TableCell><TableCell className="text-right"><Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" onClick={() => { if (!window.confirm("Esta ação não pode ser desfeita nesta versão. Deseja continuar?")) return; setRegras(prev => prev.filter(x => x.id !== r.id)); toast.success("Excluída."); void loadStats(); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></TableCell></TableRow>)}</TableBody></Table></Card>
      </TabsContent>

      <TabsContent value="vendedores" className="space-y-3"><Card className="p-4"><div className="grid gap-2 md:grid-cols-4"><Input placeholder="Nome" value={novoVend} onChange={e => setNovoVend(e.target.value)} /><Input placeholder="Telefone" value={novoTel} onChange={e => setNovoTel(e.target.value)} /><Input placeholder="E-mail" value={novoEmail} onChange={e => setNovoEmail(e.target.value)} /><Button onClick={() => { if (!novoVend) return; setVendedores(prev => [...prev, { id: `v${Date.now()}`, nome: novoVend, telefone: novoTel, email: novoEmail, ativo: true }]); setNovoVend("");setNovoTel("");setNovoEmail(""); toast.success("Vendedor adicionado."); void loadStats(); }}><Plus className="mr-1 h-4 w-4" />Adicionar</Button></div><div className="mt-4 space-y-2">{vendedores.map(v => <div key={v.id} className="flex items-center justify-between rounded border p-2 text-sm"><div>{v.nome} • {v.telefone||"-"} • {v.email||"-"} • {v.ativo?"Ativo":"Inativo"}</div><button className="ml-2 text-destructive" onClick={() => { if (!window.confirm("Esta ação não pode ser desfeita nesta versão. Deseja continuar?")) return; setVendedores(prev => prev.filter(x => x.id !== v.id)); void loadStats(); }}>Excluir</button></div>)}</div></Card></TabsContent>

      <TabsContent value="tickets" className="space-y-3"><Card className="p-4 space-y-3"><div className="text-sm font-semibold">Ticket médio por linha/categoria</div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Linha/categoria</TableHead><TableHead>Valor médio por hectare</TableHead><TableHead>Ativo</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{categoriasTicket.map((categoria) => { const regra = ticketsMedios.find((t) => t.categoria === categoria); return <TableRow key={categoria}><TableCell className="font-medium">{categoria}</TableCell><TableCell><Input type="number" step="0.01" value={regra?.valorMedioHa ?? 0} onChange={(e) => { const valor = Number(e.target.value || 0); setTicketsMedios((prev) => regra ? prev.map((t) => t.id === regra.id ? { ...t, valorMedioHa: valor } : t) : [...prev, { id: `tm${Date.now()}`, categoria, valorMedioHa: valor, ativo: true }]); }} /></TableCell><TableCell><Switch checked={regra?.ativo ?? true} onCheckedChange={(ativo) => setTicketsMedios((prev) => regra ? prev.map((t) => t.id === regra.id ? { ...t, ativo } : t) : [...prev, { id: `tm${Date.now()}`, categoria, valorMedioHa: 0, ativo }])} /></TableCell><TableCell className="text-right">{!isCategoriaPadrao(categoria) && regra ? <Button size="sm" variant="ghost" onClick={() => setTicketsMedios((prev) => prev.filter((x) => x.id !== regra.id))}>Remover</Button> : <span className="text-xs text-muted-foreground">Padrão</span>}</TableCell></TableRow>;})}</TableBody></Table></div><div className="rounded border p-3 space-y-2"><div className="text-sm font-medium">Criar nova linha de produto</div><div className="grid gap-2 md:grid-cols-4"><Input id="nova-cat" placeholder="Nome da linha/categoria" /><Input id="novo-ticket" type="number" step="0.01" placeholder="Valor médio por ha" /><Select defaultValue="1"><SelectTrigger id="novo-ativo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">Ativo</SelectItem><SelectItem value="0">Inativo</SelectItem></SelectContent></Select><Button onClick={() => { const nomeEl = document.getElementById('nova-cat') as HTMLInputElement | null; const valorEl = document.getElementById('novo-ticket') as HTMLInputElement | null; const ativoEl = document.querySelector('#novo-ativo [data-state]') ? '1' : '1'; const categoria = nomeEl?.value.trim() || ''; if (!categoria) return toast.error('Informe o nome da linha/categoria.'); if (categoriasTicket.some((c) => c.toLowerCase() === categoria.toLowerCase())) return toast.error('Esta categoria já existe.'); setTicketsMedios((prev) => [...prev, { id: `tm${Date.now()}`, categoria, valorMedioHa: Number(valorEl?.value || 0), ativo: ativoEl === '1' }]); if (nomeEl) nomeEl.value = ''; if (valorEl) valorEl.value = '0'; toast.success('Linha/categoria criada.'); }}>Adicionar linha</Button></div></div></Card></TabsContent>


      <TabsContent value="dados-empresa" className="space-y-3"><Card className="p-4 space-y-3">
        <div className="text-sm font-semibold">Cadastro de empresas</div>
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>Nome fantasia</Label><Input value={dadosEmpresa.nomeFantasia || ""} onChange={e=>setDadosEmpresa({...dadosEmpresa,nomeFantasia:e.target.value})} /></div>
          <div><Label>Razão social</Label><Input value={dadosEmpresa.razaoSocial || ""} onChange={e=>setDadosEmpresa({...dadosEmpresa,razaoSocial:e.target.value})} /></div>
          <div><Label>CNPJ</Label><Input value={dadosEmpresa.cnpj || ""} onChange={e=>setDadosEmpresa({...dadosEmpresa,cnpj:e.target.value})} /></div>
          <div><Label>Inscrição estadual</Label><Input value={dadosEmpresa.inscricaoEstadual || ""} onChange={e=>setDadosEmpresa({...dadosEmpresa,inscricaoEstadual:e.target.value})} /></div>
          <div><Label>Endereço</Label><Input value={dadosEmpresa.endereco || ""} onChange={e=>setDadosEmpresa({...dadosEmpresa,endereco:e.target.value})} /></div>
          <div><Label>Cidade/UF</Label><Input value={dadosEmpresa.cidadeUf || ""} onChange={e=>setDadosEmpresa({...dadosEmpresa,cidadeUf:e.target.value})} /></div>
          <div><Label>Telefone</Label><Input value={dadosEmpresa.telefone || ""} onChange={e=>setDadosEmpresa({...dadosEmpresa,telefone:e.target.value})} /></div>
          <div><Label>E-mail</Label><Input value={dadosEmpresa.email || ""} onChange={e=>setDadosEmpresa({...dadosEmpresa,email:e.target.value})} /></div>
          <div><Label>Logo da empresa</Label><Input type="file" accept="image/png,image/jpeg" onChange={handleLogoUpload} /></div>
          <div><Label>Consultor padrão/responsável</Label><Input value={dadosEmpresa.consultorPadrao || ""} onChange={e=>setDadosEmpresa({...dadosEmpresa,consultorPadrao:e.target.value})} /></div>
          <div><Label>Observações comerciais padrão</Label><Input value={dadosEmpresa.observacoesComerciaisPadrao || ""} onChange={e=>setDadosEmpresa({...dadosEmpresa,observacoesComerciaisPadrao:e.target.value})} /></div>
        </div>
        <Button onClick={()=>{ if(!dadosEmpresa.nomeFantasia) return toast.error("Nome fantasia obrigatório"); if(dadosEmpresa.id){ setEmpresas(prev=>prev.map(e=>e.id===dadosEmpresa.id?dadosEmpresa:e)); } else { setEmpresas(prev=>[...prev,{...dadosEmpresa,id:`emp${Date.now()}`}]); } setDadosEmpresa(defaultEmpresa); toast.success("Empresa salva."); }}>Salvar empresa</Button>
        <div className="space-y-2">{empresas.map((e)=><div key={e.id} className="flex justify-between border rounded p-2 text-sm"><div>{e.nomeFantasia} {e.padrao?"(Padrão)":""} {e.ativa?"":"(Inativa)"}</div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>setEmpresas(prev=>prev.map(x=>({...x,padrao:x.id===e.id})))}>Marcar padrão</Button><Button size="sm" variant="outline" onClick={()=>setEmpresas(prev=>prev.map(x=>x.id===e.id?{...x,ativa:!x.ativa}:x))}>{e.ativa?"Inativar":"Ativar"}</Button><Button size="sm" variant="outline" onClick={()=>setDadosEmpresa(e)}>Editar</Button><Button size="sm" variant="destructive" onClick={()=>{if(!window.confirm("Excluir empresa?"))return; setEmpresas(prev=>prev.filter(x=>x.id!==e.id));}}>Excluir</Button></div></div>)}</div>
        <div className="rounded border p-3 space-y-2">
          <div className="text-sm font-semibold">Formas de pagamento</div>
          <div className="grid gap-2 md:grid-cols-3">
            <Input id="nova-forma" placeholder="Nova forma" />
            <Button onClick={() => { const nomeEl = document.getElementById("nova-forma") as HTMLInputElement | null; const nome = nomeEl?.value.trim() || ""; if (!nome) return; setFormasPagamento(prev => [...prev, { id: `fp${Date.now()}`, nome, ativo: true, padrao: prev.length===0 } as FormaPagamento]); if (nomeEl) nomeEl.value = ""; }}>Adicionar</Button>
          </div>
          {formasPagamento.map((fp) => <div key={fp.id} className="flex items-center justify-between gap-2 text-sm border rounded p-2"><Input value={fp.nome} onChange={e=>setFormasPagamento(prev=>prev.map(x=>x.id===fp.id?{...x,nome:e.target.value}:x))} /><div className="flex gap-1"><Button size="sm" variant="outline" onClick={()=>setFormasPagamento(prev=>prev.map(x=>({...x,padrao:x.id===fp.id})))}>Padrão</Button><Button size="sm" variant="outline" onClick={()=>setFormasPagamento(prev=>prev.map(x=>x.id===fp.id?{...x,ativo:!x.ativo}:x))}>{fp.ativo?"Inativar":"Ativar"}</Button><Button size="sm" variant="destructive" onClick={()=>{if(window.confirm("Excluir forma de pagamento?"))setFormasPagamento(prev=>prev.filter(x=>x.id!==fp.id));}}>Excluir</Button></div></div>)}
        </div>
      </Card></TabsContent>

      <TabsContent value="banco-local">
        <Card className="space-y-3 p-4 text-sm">
          <div className="text-xs font-semibold">Base: {baseMode === "teste" ? "Teste" : "Operacional"}</div><div><b>Status do banco:</b> {stats?.status || "ativo"}</div>
          <div><b>Tipo:</b> {stats?.tipo || "IndexedDB"}</div>
          <div><b>Data da primeira criação:</b> {stats?.createdAt ? new Date(stats.createdAt).toLocaleString("pt-BR") : "-"}</div>
          <div><b>Última atualização:</b> {stats?.updatedAt ? new Date(stats.updatedAt).toLocaleString("pt-BR") : "-"}</div>
          <div>
            <b>Persistência:</b>{" "}
            {saveError
              ? "Erro ao salvar dados locais"
              : isSaving
                ? "Salvando..."
                : "Dados salvos localmente"}
          </div>
          {lastSavedAt && <div><b>Último salvamento em memória:</b> {new Date(lastSavedAt).toLocaleString("pt-BR")}</div>}
          <div className="rounded border p-3"><div className="font-semibold mb-1">Diagnóstico da base local</div><div className="text-xs text-amber-600 mb-2">Antes de importar dados reais, gere um backup da base atual.</div><div className="grid gap-1">{stats && Object.entries(stats.counts).map(([k, v]) => <div key={k}>{k}: {v}</div>)}</div><div className="mt-2 text-xs">Versão schema IndexedDB: 6</div></div>
          <div className="rounded border p-3"><Label>Modo da base</Label><Select value={baseMode} onValueChange={(v: BaseMode)=>{ setBaseMode(v); localStorage.setItem("baseMode", v); if (v === "operacional") toast.warning("Use base Operacional apenas após validar os dados importados.");}}><SelectTrigger className="mt-2 max-w-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="teste">Teste</SelectItem><SelectItem value="operacional">Operacional</SelectItem></SelectContent></Select><div className="mt-2 text-xs text-amber-600">Você está importando dados em ambiente de teste/homologação.</div></div>
          <Button variant="destructive" onClick={async () => {
            if (!window.confirm("Esta ação apagará os dados locais deste navegador. Essa ação não pode ser desfeita nesta versão. Deseja continuar?")) return;
            await resetLocalDatabase();
            toast.success("Base local limpa. Recarregando aplicação sem dados operacionais.");
            window.location.reload();
          }}>Limpar base local</Button>
          <Button variant="outline" onClick={async () => {
            if (!window.confirm("Esta ação removerá IndexedDB/cache/localStorage/sessionStorage e service worker deste dispositivo. Deseja continuar?")) return;
            await clearLocalAppDeviceData();
            toast.success("Dados locais deste dispositivo foram removidos.");
            window.location.reload();
          }}>Limpar dados locais deste dispositivo</Button>
          <Card className="space-y-2 border-dashed p-3">
            <div className="font-semibold">Exportação e backup</div>
            <p className="text-xs text-muted-foreground">Use estas opções para salvar seus dados fora do navegador, enviar por e-mail, WhatsApp ou guardar em local seguro.</p>

          <Card className="space-y-3 border-dashed p-3">
            <div className="font-semibold">Importação de dados</div>
            <p className="text-xs text-muted-foreground">Backup recomendado antes de homologar dados reais.</p><div className="text-xs">Último backup manual: {lastBackupAt ? new Date(lastBackupAt).toLocaleString("pt-BR") : "não registrado"}</div>
            <div className="grid gap-2 md:grid-cols-3">
              <Select value={importEntity} onValueChange={(v: ImportEntity) => setImportEntity(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="clientes">clientes</SelectItem><SelectItem value="vendedores">vendedores</SelectItem><SelectItem value="lancamentos">lancamentos</SelectItem><SelectItem value="negocios">negocios</SelectItem><SelectItem value="produtos">produtos</SelectItem><SelectItem value="metasEmpresa">metasEmpresa</SelectItem><SelectItem value="metasPessoais">metasPessoais</SelectItem><SelectItem value="regrasComissao">regrasComissao</SelectItem><SelectItem value="eventos">eventos</SelectItem><SelectItem value="prioridadesP1">prioridadesP1</SelectItem>
              </SelectContent></Select>
              <Select value={importMode} onValueChange={(v: ImportMode) => setImportMode(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="add">Adicionar novos registros</SelectItem><SelectItem value="update">Atualizar registros existentes</SelectItem><SelectItem value="replace">Substituir base da entidade selecionada</SelectItem>
              </SelectContent></Select>
              <Button variant="outline" onClick={() => { downloadBackupJson(exportPayload); setLastBackupAt(new Date().toISOString()); }}>Gerar backup antes de importar</Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={() => downloadTemplate("clientes")}>Modelo CSV clientes</Button><Button variant="outline" onClick={() => downloadTemplate("produtos")}>Modelo CSV produtos</Button><Button variant="outline" onClick={() => downloadTemplate("empresas")}>Modelo CSV empresas</Button><Button variant="outline" onClick={() => downloadTemplate("formasPagamento")}>Modelo CSV formas pagamento</Button><Button variant="outline" onClick={() => downloadTemplate("metas")}>Modelo CSV metas</Button><Button variant="outline" onClick={() => downloadTemplate("estoquePrecos")}>Modelo CSV estoque/preços</Button><Button variant="outline" onClick={() => downloadTemplate("ticketsMedios")}>Modelo CSV tickets médios</Button>
              <Button onClick={() => importFileRef.current?.click()}>Importar CSV</Button>
              <Button variant="secondary" onClick={() => toast.error("Importação Excel ainda não suportada. Exporte a planilha como CSV e tente novamente.")}>Importar Excel/XML</Button>
            </div>
            <input ref={importFileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
          </Card>
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
  
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>Prévia da importação</DialogTitle></DialogHeader>{importPreview && <div className="space-y-2 text-sm">
      <div><b>Arquivo:</b> {importPreview.fileName}</div><div><b>Entidade:</b> {importPreview.entity}</div><div><b>Modo:</b> {importMode}</div>
      <div><b>Linhas lidas:</b> {importPreview.totalRows} | <b>Válidas:</b> {importPreview.validRows} | <b>Com erro:</b> {importPreview.errorRows} | <b>Com aviso:</b> {importPreview.warningRows}</div><div><b>Possíveis duplicidades:</b> {importPreview.duplicateRows} | <b>Obrigatórios ausentes:</b> {importPreview.missingRequiredRows}</div>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Linha</TableHead><TableHead>Dados normalizados</TableHead><TableHead>Erros</TableHead></TableRow></TableHeader><TableBody>{importPreview.sample.map(r => <TableRow key={r.row}><TableCell>{r.row}</TableCell><TableCell className="max-w-md whitespace-pre-wrap text-xs">{JSON.stringify(r.normalized)}</TableCell><TableCell className="text-xs text-destructive">{r.errors.join("; ") || "—"}</TableCell></TableRow>)}</TableBody></Table></div>
      <div className="text-xs text-muted-foreground">Colunas não reconhecidas: {importPreview.unmappedColumns.join(", ") || "nenhuma"}</div>
    </div>}<DialogFooter><Button variant="outline" onClick={() => setPreviewOpen(false)}>Cancelar</Button><Button onClick={confirmImport}>Confirmar importação</Button></DialogFooter></DialogContent></Dialog>
</div>;
}
