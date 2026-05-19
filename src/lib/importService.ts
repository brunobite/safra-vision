import { Cliente, Evento, Lancamento, MetaEmpresa, MetaPessoal, Negocio, PrioridadeP1Item, Produto, RegraComissao, Vendedor } from "@/types";

export type ImportEntity = "clientes" | "vendedores" | "lancamentos" | "negocios" | "produtos" | "metasEmpresa" | "metasPessoais" | "regrasComissao" | "eventos" | "rotas" | "prioridadesP1";
export type ImportMode = "add" | "update" | "replace";

export interface ImportPreviewRow { row: number; normalized: Record<string, unknown>; errors: string[]; }
export interface ImportPreview {
  fileName: string; entity: ImportEntity; columns: string[]; mappedColumns: Record<string, string>; unmappedColumns: string[];
  totalRows: number; validRows: number; errorRows: number; sample: ImportPreviewRow[]; rows: ImportPreviewRow[];
}

const normalizeText = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
const parseBoolean = (value: unknown) => ["sim", "true", "1", "s", "yes"].includes(String(value ?? "").trim().toLowerCase());
const parseNumber = (value: unknown) => {
  if (value == null || value === "") return undefined;
  const raw = String(value).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};
const toIsoDate = (value: unknown) => {
  const txt = String(value ?? "").trim();
  if (!txt) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(txt)) return txt.slice(0,10);
  const br = txt.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const d = new Date(txt);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0,10);
  return undefined;
};

const aliases: Record<ImportEntity, Record<string, string>> = {
  clientes: { cliente:"nome", nome:"nome", "nome do cliente":"nome", abc:"abc", classificacao:"abc", prioridade:"prioridade", rota:"rota", cidade:"cidade", localidade:"localidade", culturas:"culturas", "area ha":"areaHa", area:"areaHa", "potencial total":"potencialTotal", potencial:"potencialTotal", "potencial r$":"potencialTotal", "status atual":"statusAtual", status:"statusAtual", vendedor:"vendedor", responsavel:"vendedor" },
  vendedores: { nome:"nome", vendedor:"nome", responsavel:"nome", email:"email", "e-mail":"email", telefone:"telefone", ativo:"ativo" },
  lancamentos: { data:"data", cliente:"cliente", tipo:"tipo", status:"status", "o que foi realizado":"oQueFoiRealizado", realizado:"oQueFoiRealizado", descricao:"oQueFoiRealizado", oportunidade:"geraOportunidade", "existe oportunidade":"geraOportunidade", "proxima acao":"proximaAcao", "data proxima acao":"dataProximaAcao" },
  negocios: { cliente:"cliente", "nome oportunidade":"nome", oportunidade:"nome", negocio:"nome", "produtos em negociacao":"produtos", produtos:"produtos", categoria:"categoria", "valor potencial":"valorPotencial", "valor fechado":"valorFechado", status:"status", probabilidade:"probabilidade", "previsao fechamento":"previsaoFechamento", vendedor:"vendedor" },
  produtos: { codigo:"codigo", cod:"codigo", sku:"codigo", produto:"nome", nome:"nome", "nome produto":"nome", categoria:"categoria", linha:"linha", unidade:"unidade", fornecedor:"fornecedor", fabricante:"fornecedor", "preco lista":"precoLista", "preco minimo":"precoMinimo", custo:"custo", "estoque atual":"estoqueAtual", "estoque reservado":"estoqueReservado", status:"ativo" },
  metasEmpresa: { mes:"mes", "meta total":"metaTotal", meta:"metaTotal", realizado:"realizadoTotal", "realizado total":"realizadoTotal", observacao:"observacao" },
  metasPessoais: { frente:"frente", vendedor:"vendedor", responsavel:"vendedor", "comissao alvo":"comissaoAlvo", "meta faturamento":"metaFaturamento", "realizado faturamento":"realizadoFaturamento", observacao:"observacao" },
  regrasComissao: { nome:"nome", tipo:"tipo", percentual:"percentual", "aplicar sobre":"aplicarSobre", alvo:"alvo", ativo:"ativo" },
  eventos: { tipo:"tipo", "regiao/parceiro":"regiaoParceiro", parceiro:"regiaoParceiro", regiao:"regiaoParceiro", publico:"publico", "participantes min":"participantesMin", "participantes max":"participantesMax", "custo unitario":"custoUnitario", objetivo:"objetivo", status:"status" },
  rotas: {}, prioridadesP1: { cliente:"cliente", status:"status", ordem:"ordem", "acao recomendada":"acaoRecomendada" },
};

export function parseCsv(content: string): string[][] {
  const rows: string[][] = []; let i=0; let field=""; let row:string[]=[]; let q=false;
  let delimiter = ";";
  if ((content.split(";").length - 1) < (content.split(",").length - 1)) delimiter = ",";
  while(i < content.length){ const c=content[i];
    if(c==='"'){ if(q && content[i+1]==='"'){ field+='"'; i++; } else q=!q; }
    else if(c===delimiter && !q){ row.push(field); field=""; }
    else if((c==='\n' || c==='\r') && !q){ if(c==='\r' && content[i+1]==='\n') i++; row.push(field); if(row.some(v=>v.trim()!=="")) rows.push(row); row=[]; field=""; }
    else field+=c;
    i++;
  }
  row.push(field); if(row.some(v=>v.trim()!=="")) rows.push(row);
  return rows;
}

export function buildImportPreview(fileName:string, entity:ImportEntity, rows:string[][]): ImportPreview {
  const header = (rows[0] ?? []).map(h=>h.trim());
  const map: Record<string,string> = {};
  header.forEach((h)=>{ const target=aliases[entity][normalizeText(h)]; if(target) map[h]=target; });
  const unmappedColumns = header.filter(h=>!map[h]);
  const parsed: ImportPreviewRow[] = rows.slice(1).map((r,idx)=>{
    const normalized: Record<string, unknown> = {};
    for (let c=0;c<header.length;c++) { const t=map[header[c]]; if (t) normalized[t]=r[c]?.trim(); }
    const errors = validateRow(entity, normalized);
    return { row: idx+2, normalized, errors };
  });
  return { fileName, entity, columns: header, mappedColumns: map, unmappedColumns, totalRows: parsed.length, validRows: parsed.filter(r=>!r.errors.length).length, errorRows: parsed.filter(r=>r.errors.length).length, sample: parsed.slice(0,5), rows: parsed };
}

function validateRow(entity:ImportEntity, row:Record<string,unknown>): string[] {
  const errs:string[]=[];
  const required: Record<ImportEntity,string[]> = { clientes:["nome"], vendedores:["nome"], lancamentos:["data","cliente","tipo"], negocios:["cliente","nome"], produtos:["nome"], metasEmpresa:["mes","metaTotal"], metasPessoais:["frente"], regrasComissao:["nome"], eventos:["tipo","regiaoParceiro"], rotas:[], prioridadesP1:["cliente"] };
  for (const f of required[entity]) if(!String(row[f] ?? "").trim()) errs.push(`Campo obrigatório: ${f}`);
  ["areaHa","potencialTotal","valorPotencial","valorFechado","precoLista","precoMinimo","custo","estoqueAtual","estoqueReservado","comissaoAlvo","metaFaturamento","participantesMin","participantesMax","custoUnitario","metaTotal","percentual"].forEach((k)=>{ if(row[k]!=null && row[k]!=="" && parseNumber(row[k])===undefined) errs.push(`Número inválido: ${k}`); });
  ["data","dataProximaAcao","previsaoFechamento"].forEach((k)=>{ if(row[k] && !toIsoDate(row[k])) errs.push(`Data inválida: ${k}`); });
  return errs;
}

export function applyImport<T extends {id:string}>(entity:ImportEntity, mode:ImportMode, current:T[], preview:ImportPreview): {data:T[]; imported:number; updated:number; ignored:number} {
  const valid = preview.rows.filter(r=>!r.errors.length).map(r=>normalizeEntityRow(entity,r.normalized));
  if (mode === "replace") return { data: valid as T[], imported: valid.length, updated:0, ignored:0 };
  const out = [...current]; let imported=0,updated=0,ignored=0;
  valid.forEach((item:any)=>{
    const idx = out.findIndex((x:any)=>isDuplicate(entity,x,item));
    if (idx >= 0) {
      if (mode === "update") { out[idx] = { ...out[idx], ...item }; updated++; }
      else ignored++;
    } else { out.push(item); imported++; }
  });
  return { data: out as T[], imported, updated, ignored };
}

function isDuplicate(entity:ImportEntity, a:any,b:any){
  const nz=(x:string)=>normalizeText(x||"");
  if(a.id && b.id && a.id===b.id) return true;
  if(entity==="clientes") return (nz(a.nome)===nz(b.nome) && nz(a.cidade)===nz(b.cidade)) || nz(a.nome)===nz(b.nome);
  if(entity==="produtos") return a.codigo && b.codigo ? nz(a.codigo)===nz(b.codigo) : nz(a.nome)===nz(b.nome);
  if(entity==="vendedores") return nz(a.nome)===nz(b.nome);
  if(entity==="negocios") return a.clienteId===b.clienteId && nz(a.nome)===nz(b.nome);
  return false;
}

function normalizeEntityRow(entity:ImportEntity, n:Record<string,unknown>): unknown {
  const id = String(n.id || `${entity}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
  if (entity === "clientes") return { id, nome:String(n.nome||""), abc:String(n.abc||"C"), prioridade:String(n.prioridade||"P3"), rota:String(n.rota||""), cidade:String(n.cidade||""), localidade:String(n.localidade||""), culturas:String(n.culturas||""), areaHa:parseNumber(n.areaHa)||0, potencialTotal:parseNumber(n.potencialTotal)||0, statusAtual:String(n.statusAtual||"Ativo"), frequencia:"", retorno:"", vendedor:String(n.vendedor||"") } as Cliente;
  if (entity === "vendedores") return { id, nome:String(n.nome||"") } as Vendedor;
  if (entity === "produtos") return { id, codigo:String(n.codigo||""), nome:String(n.nome||""), categoria:String(n.categoria||"Outros"), linha:String(n.linha||""), unidade:String(n.unidade||"UN"), fornecedor:String(n.fornecedor||""), precoLista:parseNumber(n.precoLista)||0, precoMinimo:parseNumber(n.precoMinimo)||0, custo:parseNumber(n.custo)||0, estoqueAtual:parseNumber(n.estoqueAtual)||0, estoqueReservado:parseNumber(n.estoqueReservado)||0, ativo: parseBoolean(n.ativo || true) } as Produto;
  if (entity === "eventos") return { id, tipo:String(n.tipo||""), regiaoParceiro:String(n.regiaoParceiro||""), publico:String(n.publico||""), participantesMin:parseNumber(n.participantesMin)||0, participantesMax:parseNumber(n.participantesMax)||0, custoUnitario:parseNumber(n.custoUnitario)||0, objetivo:String(n.objetivo||""), evidencia:"", status:String(n.status||"Planejar") } as Evento;
  if (entity === "metasEmpresa") return { id, mes:String(n.mes||""), metaTotal:parseNumber(n.metaTotal)||0, vendaDireta:0, cooperagro:0, tritec:0, observacao:String(n.observacao||"") } as MetaEmpresa;
  if (entity === "metasPessoais") return { id, frente:String(n.frente||"Venda Direta"), comissaoAlvo:parseNumber(n.comissaoAlvo)||0, participacao:0, percComissao:0, metaFaturamento:parseNumber(n.metaFaturamento)||0, observacao:String(n.observacao||"") } as MetaPessoal;
  if (entity === "regrasComissao") return { id, nome:String(n.nome||""), tipo:String(n.tipo||"fixa"), percentual:parseNumber(n.percentual)||0, aplicarSobre:String(n.aplicarSobre||"negocio_fechado"), alvo:String(n.alvo||""), ativo:parseBoolean(n.ativo ?? true) } as RegraComissao;
  if (entity === "lancamentos") return { id, data:toIsoDate(n.data)||new Date().toISOString().slice(0,10), clienteId:String(n.cliente||""), tipo:String(n.tipo||"Visita"), frente:"Venda Direta", status:String(n.status||"Aberto"), oQueFoiRealizado:String(n.oQueFoiRealizado||""), geraOportunidade:parseBoolean(n.geraOportunidade), proximaAcao:String(n.proximaAcao||"") } as unknown as Lancamento;
  if (entity === "negocios") return { id, nome:String(n.nome||""), clienteId:String(n.cliente||""), vendedor:String(n.vendedor||""), origem:"Outro", produtos:String(n.produtos||"").split(",").map(s=>s.trim()).filter(Boolean), categoria:String(n.categoria||"Outros"), valorPotencial:parseNumber(n.valorPotencial)||0, valorFechado:parseNumber(n.valorFechado), status:String(n.status||"Novo"), probabilidade:parseNumber(n.probabilidade)||0, previsaoFechamento:toIsoDate(n.previsaoFechamento), dataCriacao:new Date().toISOString().slice(0,10), ultimaAtualizacao:new Date().toISOString().slice(0,10) } as unknown as Negocio;
  if (entity === "prioridadesP1") return { id, ordem:parseNumber(n.ordem)||1, clienteId:String(n.cliente||""), acaoRecomendada:String(n.acaoRecomendada||""), status:String(n.status||"Aberto") } as PrioridadeP1Item;
  return { id };
}
