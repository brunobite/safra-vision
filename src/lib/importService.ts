import { Cliente, ClienteCulturaArea, Empresa, Evento, FormaPagamento, Lancamento, MetaEmpresa, MetaPessoal, Negocio, PrioridadeP1Item, Produto, RegraComissao, TicketMedioRegra, Vendedor } from "@/types";

export type ImportEntity = "clientes" | "vendedores" | "lancamentos" | "negocios" | "produtos" | "metasEmpresa" | "metasPessoais" | "regrasComissao" | "eventos" | "rotas" | "prioridadesP1" | "empresas" | "formasPagamento" | "ticketsMedios";
export type ImportMode = "add" | "update" | "replace";

type ImportableRecord = { id: string } & Record<string, unknown>;

export interface ImportPreviewRow { row: number; normalized: Record<string, unknown>; errors: string[]; warnings: string[]; duplicateKey?: string; }
export interface ImportPreview {
  fileName: string; entity: ImportEntity; columns: string[]; mappedColumns: Record<string, string>; unmappedColumns: string[];
  totalRows: number; validRows: number; errorRows: number; warningRows: number; duplicateRows: number; missingRequiredRows: number; sample: ImportPreviewRow[]; rows: ImportPreviewRow[];
}

export const IMPORT_TEMPLATES: Record<string, string[]> = {
  clientes: ["id_importacao","nome","vendedor","abc","prioridade","rota","cidade","endereco","area_total_ha","status_atual","inativo_manual","frequencia_retorno","cpf_cnpj","inscricao_estadual","telefone","email","nome_contato","latitude","longitude","coordenadas","link_mapa","observacoes"],
  produtos: ["Nome do produto","Linha/categoria","Unidade comercial","Preço lista","Preço mínimo","Custo","Margem","Estoque atual","Estoque reservado","Empresa","Ativo"],
  empresas: ["Nome fantasia","Razão social","CNPJ","Inscrição estadual","Endereço","Cidade/UF","Telefone","E-mail","Responsável padrão","Observações comerciais","Ativa","Empresa padrão"],
  formasPagamento: ["Nome","Ativo","Padrão"],
  metas: ["Tipo de meta","Responsável","Período","Mês","Ano","Valor meta","Categoria","Observações"],
  estoquePrecos: ["Produto","Empresa","Unidade comercial","Preço lista","Preço mínimo","Custo","Estoque atual","Estoque reservado","Data atualização"],
  ticketsMedios: ["Linha/categoria","Valor médio por hectare","Ativo"],
};

const normalizeText = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
const parseBoolean = (value: unknown) => ["sim", "true", "1", "s", "yes"].includes(String(value ?? "").trim().toLowerCase());
export const parseNumber = (value: unknown) => {
  if (value == null || value === "") return undefined;

  const text = String(value).trim().replace(/\s/g, "");
  if (!text) return undefined;

  const hasComma = text.includes(",");
  const hasDot = text.includes(".");

  let raw = text;

  if (hasComma && hasDot) {
    raw = text.lastIndexOf(",") > text.lastIndexOf(".")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  } else if (hasComma) {
    raw = text.replace(",", ".");
  } else if (hasDot) {
    const parts = text.split(".");

    if (parts.length > 2) {
      raw = text.replace(/\./g, "");
    } else {
      const [integerPart, decimalPart] = parts;
      const integerDigits = integerPart.replace("-", "");

      const looksLikeThousands =
        !text.startsWith("-") &&
        decimalPart.length === 3 &&
        integerDigits.length >= 1 &&
        integerDigits.length <= 3;

      raw = looksLikeThousands ? text.replace(".", "") : text;
    }
  }

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
  clientes: { cliente:"nome", "id_importacao":"idImportacao", "fonte":"fonte", nome:"nome", "nome do cliente":"nome", "razao social":"nome", "fazenda_propriedade":"localidade", abc:"abc", prioridade:"prioridade", rota:"rota", cidade:"cidade", localidade:"endereco", endereco:"endereco", vendedor:"vendedor", culturas:"culturas", cultura:"cultura", culturasdetalhes:"culturasDetalhes", "area_total_ha":"areaHa", area_ha:"areaHa", "status_atual":"statusAtual", "inativo_manual":"inativoManual", "inativo manual":"inativoManual", "frequencia_retorno":"frequenciaRetorno", "frequencia de retorno":"frequenciaRetorno", "cpf_cnpj":"documento", documento:"documento", "inscricao_estadual":"inscricaoEstadual", "inscrição estadual":"inscricaoEstadual", telefone:"telefone", "e-mail":"email", email:"email", "nome_contato":"nomeContato", "nome do contato":"nomeContato", latitude:"latitude", longitude:"longitude", coordenadas:"coordenadas", link_mapa:"linkMapa", observacoes:"observacao", observação:"observacao", "area soja":"areaSoja", "area arroz":"areaArroz", "area milho":"areaMilho", "area trigo":"areaTrigo", "area pastagem":"areaPastagem", "area aveia":"areaAveia" },
  vendedores: { nome:"nome", vendedor:"nome", responsavel:"nome", email:"email", "e-mail":"email", ativo:"ativo" },
  lancamentos: { data:"data", cliente:"cliente", tipo:"tipo", status:"status", descricao:"oQueFoiRealizado" },
  negocios: { cliente:"cliente", oportunidade:"nome", negocio:"nome", produtos:"produtos", categoria:"categoria", "valor potencial":"valorPotencial", "valor fechado":"valorFechado", status:"status", probabilidade:"probabilidade", vendedor:"vendedor" },
  produtos: { produto:"nome", "nome do produto":"nome", "nome comercial":"nome", descricao:"nome", "linha/categoria":"categoria", linha:"categoria", categoria:"categoria", unidade:"unidade", "unidade comercial":"unidade", un:"unidade", embalagem:"unidade", "preco lista":"precoLista", preco:"precoLista", "valor unitario":"precoLista", "valor venda":"precoLista", "preco minimo":"precoMinimo", custo:"custo", margem:"margem", "estoque atual":"estoqueAtual", "estoque reservado":"estoqueReservado", "local estoque":"localEstoque", "local de estoque":"localEstoque", "controla estoque":"controlaEstoque", "controle estoque":"controlaEstoque", "tem estoque":"controlaEstoque", empresa:"empresa", ativo:"ativo" },
  metasEmpresa: { mes:"mes", "meta total":"metaTotal", meta:"metaTotal", observacao:"observacao" }, metasPessoais: { frente:"frente", "meta faturamento":"metaFaturamento", "comissao alvo":"comissaoAlvo", observacao:"observacao" },
  regrasComissao: { nome:"nome", tipo:"tipo", percentual:"percentual", "aplicar sobre":"aplicarSobre", alvo:"alvo", ativo:"ativo" }, eventos: { tipo:"tipo", parceiro:"regiaoParceiro", publico:"publico" }, rotas: {}, prioridadesP1: { cliente:"cliente", status:"status", ordem:"ordem", "acao recomendada":"acaoRecomendada" }, empresas: { "nome fantasia":"nomeFantasia", "razao social":"razaoSocial", cnpj:"cnpj", endereco:"endereco", "cidade/uf":"cidadeUf", email:"email", "e-mail":"email", "responsavel padrao":"consultorPadrao", "observacoes comerciais":"observacoesComerciaisPadrao", ativa:"ativa", "empresa padrao":"padrao" }, formasPagamento: { nome:"nome", ativo:"ativo", padrao:"padrao" }, ticketsMedios: { "linha/categoria":"categoria", "valor medio por hectare":"valorMedioHa", ativo:"ativo" },
};
export function parseCsv(content: string): string[][] { const rows:string[][]=[]; let i=0; let field=""; let row:string[]=[]; let q=false; const delimiter=(content.split(";").length-1)<(content.split(",").length-1)?",":";"; while(i<content.length){const c=content[i]; if(c==='"'){ if(q&&content[i+1]==='"'){field+='"';i++;} else q=!q;} else if(c===delimiter&&!q){row.push(field);field="";} else if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&content[i+1]==='\n')i++; row.push(field); if(row.some(v=>v.trim()!==""))rows.push(row); row=[]; field="";} else field+=c; i++;} row.push(field); if(row.some(v=>v.trim()!==""))rows.push(row); return rows; }
export function buildImportPreview(fileName:string, entity:ImportEntity, rows:string[][]): ImportPreview { const header=(rows[0]??[]).map(h=>h.trim()); const map:Record<string,string>={}; header.forEach(h=>{const t=aliases[entity][normalizeText(h)]; if(t) map[h]=t;}); const parsed=rows.slice(1).map((r,idx)=>{ const normalized:Record<string,unknown>={}; for(let c=0;c<header.length;c++){const t=map[header[c]]; if(t) normalized[t]=r[c]?.trim();} const errors=validateRow(entity,normalized); const warnings=warnRow(entity,normalized); return {row:idx+2, normalized, errors, warnings, duplicateKey:getDuplicateKey(entity, normalized)}; }); const duplicateRows=parsed.filter((r,i)=>r.duplicateKey && parsed.findIndex(x=>x.duplicateKey===r.duplicateKey) !== i).length; const missingRequiredRows=parsed.filter(r=>r.errors.some(e=>e.includes("Campo obrigatório"))).length; return { fileName, entity, columns:header, mappedColumns:map, unmappedColumns:header.filter(h=>!map[h]), totalRows:parsed.length, validRows:parsed.filter(r=>!r.errors.length).length, errorRows:parsed.filter(r=>r.errors.length).length, warningRows:parsed.filter(r=>r.warnings.length).length, duplicateRows, missingRequiredRows, sample:parsed.slice(0,5), rows:parsed}; }
function validateRow(entity:ImportEntity,row:Record<string,unknown>): string[]{ const errs:string[]=[]; const required: Record<ImportEntity,string[]> = { clientes:["nome"], vendedores:["nome"], lancamentos:["data","cliente","tipo"], negocios:["cliente","nome"], produtos:["nome","unidade"], metasEmpresa:["mes","metaTotal"], metasPessoais:["frente"], regrasComissao:["nome"], eventos:["tipo"], rotas:[], prioridadesP1:["cliente"], empresas:["nomeFantasia"], formasPagamento:["nome"], ticketsMedios:["categoria"]}; for(const f of required[entity]) if(!String(row[f]??"").trim()) errs.push(`Campo obrigatório: ${f}`); ["areaHa","areaSoja","areaArroz","areaMilho","areaTrigo","areaPastagem","areaAveia","precoLista","precoMinimo","custo","margem","estoqueAtual","estoqueReservado","latitude","longitude"].forEach((k)=>{ if(row[k]!=null && row[k]!=="" && parseNumber(row[k])===undefined) errs.push(`Número inválido: ${k}`);}); const unidade = String(row.unidade ?? "").trim().toUpperCase(); if (entity==="produtos" && unidade && !["LT","KG","TON","GAL","BD"].includes(unidade)) errs.push("Unidade inválida"); return errs; }
function warnRow(entity:ImportEntity,row:Record<string,unknown>): string[]{ const w:string[]=[];  if(entity==="produtos"&&parseNumber(row.precoLista)===undefined) w.push("Produto sem preço"); return w; }
function getDuplicateKey(entity:ImportEntity,row:Record<string,unknown>) { const nz=(x:unknown)=>normalizeText(String(x||"")); if(entity==="clientes") return `${nz(row.nome)}|${nz(row.documento)||nz(row.cidade)}`; if(entity==="produtos") return `${nz(row.nome)}|${nz(row.unidade)}`; return undefined; }
export function applyImport<T extends ImportableRecord>(entity:ImportEntity, mode:ImportMode, current:T[], preview:ImportPreview): {data:T[]; imported:number; updated:number; ignored:number; duplicates:number} { const valid=preview.rows.filter(r=>!r.errors.length).filter(r => entity !== "clientes" || parseBoolean(r.normalized.importarApp ?? "sim")).map(r=>normalizeEntityRow(entity,r.normalized) as ImportableRecord); if(mode==="replace") return {data:valid as T[], imported:valid.length, updated:0, ignored:0, duplicates:0}; const out:ImportableRecord[]=[...current]; let imported=0,updated=0,ignored=0,duplicates=0; valid.forEach((item)=>{const idx=out.findIndex((x)=>isDuplicate(entity,x,item)); if(idx>=0){duplicates++; if(mode==="update"){ out[idx]={...out[idx],...item}; updated++; } else ignored++; } else { out.push(item); imported++; }}); return {data:out as T[], imported, updated, ignored, duplicates}; }
function isDuplicate(entity:ImportEntity,a:ImportableRecord,b:ImportableRecord){ const nz=(x:unknown)=>normalizeText(String(x||"")); if(a.id&&b.id&&a.id===b.id) return true; if(entity==="clientes") return nz(a.nome)===nz(b.nome)&& (nz(a.documento)===nz(b.documento)||nz(a.cidade)===nz(b.cidade)); if(entity==="produtos") return nz(a.nome)===nz(b.nome)&&nz(a.unidade)===nz(b.unidade); if(entity==="empresas") return nz(a.cnpj)&&nz(a.cnpj)===nz(b.cnpj); if(entity==="formasPagamento") return nz(a.nome)===nz(b.nome); if(entity==="ticketsMedios") return nz(a.categoria)===nz(b.categoria); return false; }
function mapCulturas(n:Record<string,unknown>): ClienteCulturaArea[] { const m:[string,string][]=[["Soja","areaSoja"],["Arroz","areaArroz"],["Milho","areaMilho"],["Trigo","areaTrigo"],["Pastagem","areaPastagem"],["Aveia","areaAveia"]]; return m.map(([c,k])=>({id:`${c}-${Date.now()}`,cultura:c,areaHa:parseNumber(n[k])||0})).filter(x=>x.areaHa>0); }
function normalizeEntityRow(entity:ImportEntity, n:Record<string,unknown>): unknown { const id=String(n.id||`${entity}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`); if(entity==="clientes") return { id,nome:String(n.nome||""),abc:String(n.abc||"C"),prioridade:String(n.prioridade||"P3"),rota:String(n.rota||""),cidade:String(n.cidade||""),localidade:String(n.localidade||""),culturas:String(n.culturas||""),culturasDetalhes: undefined,areaHa:parseNumber(n.areaHa)||0,potencialTotal:0,statusAtual:String(n.statusAtual||"Ativo"),frequenciaRetorno:String(n.frequenciaRetorno||""),retorno:"",inativoManual:parseBoolean(n.inativoManual),email:String(n.email||""),nomeContato:String(n.nomeContato||""),observacao:String(n.observacao||""),documento:String(n.documento||""),inscricaoEstadual:String(n.inscricaoEstadual||""),telefone:String(n.telefone||""), ...(String(n.vendedor ?? "").trim() ? { vendedor: String(n.vendedor).trim() } : {}), ...(String(n.endereco ?? n.localidade ?? "").trim() ? { endereco: String(n.endereco ?? n.localidade).trim() } : {}), ...(parseNumber(n.latitude) !== undefined ? { latitude: parseNumber(n.latitude) } : {}), ...(parseNumber(n.longitude) !== undefined ? { longitude: parseNumber(n.longitude) } : {}), ...(String(n.coordenadas ?? "").trim() ? { coordenadas: String(n.coordenadas).trim() } : {}), ...(String(n.linkMapa ?? "").trim() ? { linkMapa: String(n.linkMapa).trim() } : {}) } as Cliente;
  if(entity==="vendedores") return { id, nome:String(n.nome||""), telefone:String(n.telefone||""), email:String(n.email||""), ativo:parseBoolean(n.ativo??true) } as Vendedor;
  if(entity==="produtos") { const estoqueAtual=parseNumber(n.estoqueAtual)||0; const estoqueReservado=parseNumber(n.estoqueReservado)||0; const localEstoque=String(n.localEstoque||""); return { id,codigo:String(n.codigo||""),nome:String(n.nome||""),categoria:String(n.categoria||"Outros"),unidade:String(n.unidade||"KG").toUpperCase(),fornecedor:"",precoLista:parseNumber(n.precoLista)||0,precoMinimo:parseNumber(n.precoMinimo)||0,custo:parseNumber(n.custo)||0,margem:parseNumber(n.margem),controlaEstoque:parseBoolean(n.controlaEstoque) ?? Boolean(estoqueAtual || estoqueReservado || localEstoque),estoqueAtual,estoqueReservado,localEstoque,ativo:parseBoolean(n.ativo??true)} as Produto; }
  if(entity==="empresas") return { id,nomeFantasia:String(n.nomeFantasia||""),razaoSocial:String(n.razaoSocial||""),cnpj:String(n.cnpj||""),inscricaoEstadual:String(n.inscricaoEstadual||""),endereco:String(n.endereco||""),cidadeUf:String(n.cidadeUf||""),telefone:String(n.telefone||""),email:String(n.email||""),consultorPadrao:String(n.consultorPadrao||""),observacoesComerciaisPadrao:String(n.observacoesComerciaisPadrao||""),ativa:parseBoolean(n.ativa??true),padrao:parseBoolean(n.padrao??false),logoDataUrl:"" } as Empresa;
  if(entity==="formasPagamento") return { id, nome:String(n.nome||""), ativo:parseBoolean(n.ativo??true), padrao:parseBoolean(n.padrao??false) } as FormaPagamento;
  if(entity==="ticketsMedios") return { id, categoria:String(n.categoria||"Outros"), valorMedioHa:parseNumber(n.valorMedioHa)||0, ativo:parseBoolean(n.ativo ?? true) } as TicketMedioRegra;
  if(entity==="eventos") return { id, tipo:String(n.tipo||""), regiaoParceiro:String(n.regiaoParceiro||""), publico:String(n.publico||""), participantesMin:0, participantesMax:0, custoUnitario:0, objetivo:"", evidencia:"", status:"Planejar" } as Evento;
  if(entity==="metasEmpresa") return { id, mes:String(n.mes||""), metaTotal:parseNumber(n.metaTotal)||0, vendaDireta:0, cooperagro:0, tritec:0, observacao:String(n.observacao||"") } as MetaEmpresa;
  if(entity==="metasPessoais") return { id, frente:String(n.frente||"Venda Direta"), comissaoAlvo:parseNumber(n.comissaoAlvo)||0, participacao:0, percComissao:0, metaFaturamento:parseNumber(n.metaFaturamento)||0, observacao:String(n.observacao||"") } as MetaPessoal;
  if(entity==="regrasComissao") return { id, nome:String(n.nome||""), tipo:"fixa", percentual:parseNumber(n.percentual)||0, aplicarSobre:"negocio_fechado", ativo:parseBoolean(n.ativo ?? true) } as RegraComissao;
  if(entity==="lancamentos") return { id, data:toIsoDate(n.data)||new Date().toISOString().slice(0,10), clienteId:String(n.cliente||""), tipo:String(n.tipo||"Visita"), frente:"Venda Direta", status:String(n.status||"Aberto"), oQueFoiRealizado:String(n.oQueFoiRealizado||"") } as Lancamento;
  if(entity==="negocios") return { id, nome:String(n.nome||""), clienteId:String(n.cliente||""), vendedor:String(n.vendedor||""), origem:"Outro", produtos:String(n.produtos||"").split(",").map(s=>s.trim()).filter(Boolean), categoria:String(n.categoria||"Outros"), valorPotencial:parseNumber(n.valorPotencial)||0, status:"Novo", probabilidade:0, dataCriacao:new Date().toISOString().slice(0,10), ultimaAtualizacao:new Date().toISOString().slice(0,10) } as unknown as Negocio;
  if(entity==="prioridadesP1") return { id, ordem:parseNumber(n.ordem)||1, clienteId:String(n.cliente||""), acaoRecomendada:String(n.acaoRecomendada||""), status:String(n.status||"Aberto") } as PrioridadeP1Item;
  return { id }; }
