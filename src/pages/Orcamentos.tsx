import { useMemo, useState } from "react";
import { useAppStore } from "@/store/AppStore";
import { Orcamento, OrcamentoItem, OrcamentoStatus, UnidadeDose } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtBRL } from "@/utils/calculations";
import { toast } from "sonner";

const STATUS: OrcamentoStatus[] = ["Rascunho", "Enviado", "Aprovado", "Reprovado", "Cancelado"];
const UNIDADES: UnidadeDose[] = ["L/ha", "mL/ha", "kg/ha", "g/ha", "ton/ha", "un/ha"];
const ALL = "__all__";
type OrcamentoDisplayConfig = { key?: string; value?: boolean };

const safeDiv = (v: number, d: number) => d > 0 ? v / d : 0;
const doseNorm = (dose:number, unidade:UnidadeDose) => unidade === "mL/ha" ? dose/1000 : unidade === "g/ha" ? dose/1000 : dose;
const qtde = (dose:number, unidade:UnidadeDose, area:number) => doseNorm(dose, unidade) * area;
const precoNorm = (preco:number, unidadeProduto:string, unidadeDose:UnidadeDose) => unidadeProduto === "TON" && unidadeDose === "kg/ha" ? preco/1000 : preco;
const fmtQtd = (v:number)=>new Intl.NumberFormat("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
const slug = (v:string)=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");

export default function Orcamentos(){
  const { orcamentos, setOrcamentos, clientes, produtos, vendedores, ticketsMedios, setNegocios, negocios } = useAppStore();
  const showCustoConfig = ticketsMedios.find((x) => (x as OrcamentoDisplayConfig).key === "showCustoPorHectare") as OrcamentoDisplayConfig | undefined;
  const showCusto = showCustoConfig?.value ?? true;
  const [open,setOpen]=useState(false); const [edit,setEdit]=useState<Orcamento| null>(null);
  const [fCliente,setFCliente]=useState(""); const [fStatus,setFStatus]=useState("");
  const [form,setForm]=useState<Orcamento>({id:"",clienteId:"",vendedor:"",data:new Date().toISOString().slice(0,10),status:"Rascunho",areaAplicacaoHa:0,itens:[],subtotal:0,descontoTotal:0,valorTotal:0,custoPorHectare:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  const filtered = useMemo(()=>orcamentos.filter(o=>(!fCliente||o.clienteId===fCliente)&&(!fStatus||o.status===fStatus)),[orcamentos,fCliente,fStatus]);

  const recalc=(draft:Orcamento)=>{const itens=draft.itens.map(i=>{const quantidadeTotal=qtde(i.dosePorHa,i.unidadeDose,i.areaHa);const pu=precoNorm(i.precoUnitario,i.unidadeProduto,i.unidadeDose);const valorTotalItem=quantidadeTotal*pu;return {...i,quantidadeTotal,valorTotalItem,custoPorHaItem:safeDiv(valorTotalItem,i.areaHa)};}); const subtotal=itens.reduce((s,i)=>s+i.valorTotalItem,0); const valorTotal=Math.max(0,subtotal-(draft.descontoTotal||0)); return {...draft,itens,subtotal,valorTotal,custoPorHectare:safeDiv(valorTotal,draft.areaAplicacaoHa)};};
  const save=()=>{if(!form.clienteId) return toast.error("Selecione cliente"); const payload=recalc({...form,updatedAt:new Date().toISOString()}); if(edit) setOrcamentos(p=>p.map(o=>o.id===edit.id?payload:o)); else setOrcamentos(p=>[{...payload,id:`orc${Date.now()}`,createdAt:new Date().toISOString()},...p]); setOpen(false); toast.success("Orçamento salvo");};
  const exportPdf=(orcamento:Orcamento)=>{
    const cliente = clientes.find(c=>c.id===orcamento.clienteId)?.nome || "cliente";
    const dataRef = new Date(orcamento.data).toISOString().slice(0,10);
    const calculado = recalc(orcamento);
    const lines:string[] = [];
    const line = (text:string)=>lines.push(text);
    line(`Cliente: ${cliente}`);
    line(`Vendedor: ${orcamento.vendedor || "-"}`);
    line(`Data: ${orcamento.data}`);
    line(`Validade: ${orcamento.validade || "-"}`);
    line(`Área de aplicação: ${fmtQtd(orcamento.areaAplicacaoHa)} ha`);
    line("Itens:");
    calculado.itens.forEach((it, idx)=>{
      const precoConvertido = precoNorm(it.precoUnitario, it.unidadeProduto, it.unidadeDose);
      line(`${idx+1}. ${it.produtoNome} (${it.unidadeProduto})`);
      line(`   Dose: ${fmtQtd(it.dosePorHa)} ${it.unidadeDose} | Qtd: ${fmtQtd(it.quantidadeTotal)} | Preço: ${fmtBRL(precoConvertido)} | Total: ${fmtBRL(it.valorTotalItem)}`);
      if(showCusto) line(`   Custo/ha: ${fmtBRL(it.custoPorHaItem)}/ha`);
    });
    line(`Subtotal: ${fmtBRL(calculado.subtotal)}`);
    line(`Desconto: ${fmtBRL(calculado.descontoTotal)}`);
    line(`Total: ${fmtBRL(calculado.valorTotal)}`);
    if(showCusto) line(`Custo médio por hectare: ${fmtBRL(calculado.custoPorHectare)}/ha`);
    line(`Condições comerciais: ${orcamento.formaPagamento || "-"}`);
    line(`Observações: ${orcamento.observacoes || "-"}`);
    const escapePdf = (text: string) => text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    const content = ["BT","/F1 11 Tf","50 790 Td","(Orcamento Comercial) Tj","0 -16 Td",...lines.map((l)=>`(${escapePdf(l)}) Tj\n0 -14 Td`),"ET"].join("\n");
    const pdf = `%PDF-1.3
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>endobj
4 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
5 0 obj<< /Length ${content.length} >>stream
${content}
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
0000000243 00000 n 
0000000313 00000 n 
trailer<< /Root 1 0 R /Size 6 >>
startxref
${350 + content.length}
%%EOF`;
    const blob = new Blob([pdf], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orcamento-${slug(cliente)}-${dataRef}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const changeStatus=(o:Orcamento,status:OrcamentoStatus)=>{setOrcamentos(p=>p.map(x=>x.id===o.id?{...x,status,updatedAt:new Date().toISOString()}:x)); if(status==="Aprovado"&&o.negocioId&&window.confirm("Este orçamento foi aprovado. Deseja marcar o negócio vinculado como Fechado ganho?")){setNegocios(p=>p.map(n=>n.id===o.negocioId?{...n,status:"Fechado ganho",ultimaAtualizacao:new Date().toISOString().slice(0,10)}:n));} if(status==="Reprovado"&&o.negocioId&&window.confirm("Este orçamento foi reprovado. Deseja marcar o negócio vinculado como Fechado perdido?")){setNegocios(p=>p.map(n=>n.id===o.negocioId?{...n,status:"Fechado perdido",ultimaAtualizacao:new Date().toISOString().slice(0,10)}:n));}};

  return <div className="space-y-4"><div className="flex gap-2 flex-wrap"><Select value={fCliente || ALL} onValueChange={(v) => setFCliente(v === ALL ? "" : v)}><SelectTrigger className="w-52"><SelectValue placeholder="Filtrar cliente"/></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos</SelectItem>{clientes.map(c=><SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select><Select value={fStatus || ALL} onValueChange={(v) => setFStatus(v === ALL ? "" : v)}><SelectTrigger className="w-48"><SelectValue placeholder="Filtrar status"/></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos</SelectItem>{STATUS.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select><Button onClick={()=>{setEdit(null); setForm({...form,id:"",clienteId:"",itens:[],descontoTotal:0,areaAplicacaoHa:0,status:"Rascunho"}); setOpen(true);}}>Novo orçamento</Button></div>
  <Card className="p-0 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Status</TableHead><TableHead>Total</TableHead><TableHead>Custo/ha</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{filtered.map(o=><TableRow key={o.id}><TableCell>{clientes.find(c=>c.id===o.clienteId)?.nome||"-"}</TableCell><TableCell>{o.status}</TableCell><TableCell>{fmtBRL(o.valorTotal)}</TableCell><TableCell>{fmtBRL(o.custoPorHectare)}/ha</TableCell><TableCell className="flex gap-1"><Button size="sm" variant="outline" onClick={()=>{setEdit(o); setForm(o); setOpen(true);}}>Editar orçamento</Button><Button size="sm" onClick={()=>exportPdf(o)}>Gerar PDF</Button><Button size="sm" variant="outline" onClick={()=>window.print()}>Imprimir</Button><Select value={o.status} onValueChange={(v:OrcamentoStatus)=>changeStatus(o,v)}><SelectTrigger className="h-8 w-28"><SelectValue/></SelectTrigger><SelectContent>{STATUS.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></TableCell></TableRow>)}</TableBody></Table></Card>
  <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>{edit?"Editar orçamento":"Novo orçamento"}</DialogTitle></DialogHeader><div className="grid md:grid-cols-4 gap-3"><div><Label>Cliente</Label><Select value={form.clienteId} onValueChange={v=>setForm({...form,clienteId:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{clientes.map(c=><SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></div><div><Label>Vendedor</Label><Select value={form.vendedor} onValueChange={v=>setForm({...form,vendedor:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{vendedores.map(v=><SelectItem key={v.id} value={v.nome}>{v.nome}</SelectItem>)}</SelectContent></Select></div><div><Label>Área aplicação (ha)</Label><Input type="number" inputMode="decimal" step="0.01" placeholder="Ex.: 200" value={form.areaAplicacaoHa} onChange={e=>setForm({...form,areaAplicacaoHa:+e.target.value})}/></div><div><Label>Desconto</Label><Input type="number" inputMode="decimal" step="0.01" placeholder="Ex.: 1000,00" value={form.descontoTotal} onChange={e=>setForm({...form,descontoTotal:+e.target.value})}/></div></div>
  <div className="space-y-2">{form.areaAplicacaoHa<=0&&<p className="text-xs text-amber-600">Informe área de aplicação para cálculo por hectare.</p>} {recalc(form).itens.map((it,idx)=>{const produto=produtos.find(p=>p.id===it.produtoId); const precoConvertido=precoNorm(it.precoUnitario,it.unidadeProduto,it.unidadeDose); const embalagem=it.unidadeProduto==="GAL"||it.unidadeProduto==="BD"; return <Card key={it.id} className="p-3 space-y-2"><div className="grid md:grid-cols-2 gap-2"><div><Label>Produto</Label><Select value={it.produtoId} onValueChange={v=>{const p=produtos.find(x=>x.id===v); if(!p) return; const n={...it,produtoId:p.id,produtoNome:p.nome,categoria:p.categoria,unidadeProduto:p.unidade,precoUnitario:p.precoLista}; const itens=[...form.itens];itens[idx]=n;setForm({...form,itens});}}><SelectTrigger><SelectValue placeholder="Selecione o produto"/></SelectTrigger><SelectContent>{produtos.map(p=><SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent></Select></div><div><Label>Dose por hectare</Label><Input type="number" inputMode="decimal" step="0.01" placeholder="Ex.: 300" value={it.dosePorHa} onChange={e=>{const itens=[...form.itens];itens[idx]={...it,dosePorHa:+e.target.value};setForm({...form,itens});}}/></div><div><Label>Unidade da dose</Label><Select value={it.unidadeDose} onValueChange={(v:UnidadeDose)=>{const itens=[...form.itens];itens[idx]={...it,unidadeDose:v};setForm({...form,itens});}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{UNIDADES.map(u=><SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div><div><Label>Área aplicada no item (ha)</Label><Input type="number" inputMode="decimal" step="0.01" placeholder="Ex.: 200" value={it.areaHa} onChange={e=>{const itens=[...form.itens];itens[idx]={...it,areaHa:+e.target.value};setForm({...form,itens});}}/></div><div><Label>Preço unitário de venda</Label><Input type="number" inputMode="decimal" step="0.01" placeholder="Ex.: 3200,00" value={it.precoUnitario} onChange={e=>{const itens=[...form.itens];itens[idx]={...it,precoUnitario:+e.target.value};setForm({...form,itens});}}/></div><div className="flex items-end"><Button variant="ghost" onClick={()=>setForm({...form,itens:form.itens.filter((_,i)=>i!==idx)})}>Excluir</Button></div><div><Label>Quantidade total calculada</Label><Input readOnly value={`${fmtQtd(it.quantidadeTotal)} ${it.unidadeProduto==="TON"&&it.unidadeDose==="kg/ha"?"kg":it.unidadeProduto}`}/></div><div><Label>Valor total do item</Label><Input readOnly value={fmtBRL(it.valorTotalItem)}/></div><div><Label>Custo por hectare do item</Label><Input readOnly value={`${fmtBRL(it.custoPorHaItem)}/ha`}/></div></div>
  {produto && <div className="rounded border p-2 text-sm space-y-1"><p className="font-medium">Produto selecionado:</p><p>Unidade comercial: {produto.unidade}</p><p>Preço lista: {fmtBRL(produto.precoLista)} / {produto.unidade}</p>{produto.precoMinimo>0&&<p>Preço mínimo: {fmtBRL(produto.precoMinimo)} / {produto.unidade}</p>}<p>Categoria: {produto.categoria}</p><p className="text-xs text-slate-600">Informe a dose na unidade agronômica de aplicação. O sistema converterá automaticamente quando necessário.</p>{produto.unidade==="TON"&&it.unidadeDose==="kg/ha"&&<p className="text-xs text-blue-700">Produto cadastrado em TON. Para dose em kg/ha, informe a dose normalmente em kg/ha. O sistema converterá o preço de tonelada para kg automaticamente.</p>}{embalagem&&<p className="text-xs text-amber-700">Produto cadastrado por embalagem. Confirme se o preço unitário corresponde à unidade usada no orçamento.</p>}</div>}
  <div className="rounded border bg-slate-50 p-2 text-sm space-y-1"><p className="font-medium">Cálculo do item:</p><p>Dose: {fmtQtd(it.dosePorHa)} {it.unidadeDose}</p><p>Área: {fmtQtd(it.areaHa)} ha</p><p>Quantidade total: {fmtQtd(it.quantidadeTotal)} {it.unidadeProduto==="TON"&&it.unidadeDose==="kg/ha"?"kg":it.unidadeProduto}{it.unidadeProduto==="TON"&&it.unidadeDose==="kg/ha"&&` / ${fmtQtd(it.quantidadeTotal/1000)} ton`}</p><p>Preço considerado: {fmtBRL(precoConvertido)}{it.unidadeProduto==="TON"&&it.unidadeDose==="kg/ha"?"/kg":`/${it.unidadeProduto}`}</p><p>Total do item: {fmtBRL(it.valorTotalItem)}</p><p>Custo por hectare: {fmtBRL(it.custoPorHaItem)}/ha</p></div></Card>;})}<Button variant="outline" onClick={()=>setForm({...form,itens:[...form.itens,{id:`i${Date.now()}`,produtoId:"",produtoNome:"",categoria:"",unidadeProduto:"LT",dosePorHa:0,unidadeDose:"L/ha",areaHa:form.areaAplicacaoHa,quantidadeTotal:0,precoUnitario:0,valorTotalItem:0,custoPorHaItem:0} as OrcamentoItem]})}>Adicionar item</Button></div>
  <div className="text-sm space-y-1"><p>Subtotal: {fmtBRL(recalc(form).subtotal)}</p><p>Desconto: {fmtBRL(recalc(form).descontoTotal)}</p><p>Total do orçamento: {fmtBRL(recalc(form).valorTotal)}</p>{showCusto && <p>Custo médio por hectare: {fmtBRL(recalc(form).custoPorHectare)}/ha</p>}</div>
  <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button><Button onClick={save}>Gerar orçamento</Button></DialogFooter></DialogContent></Dialog></div>
}
