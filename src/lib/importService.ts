import { Cliente, ClienteCulturaArea, Empresa, Evento, FormaPagamento, Lancamento, MetaEmpresa, MetaPessoal, Negocio, PrioridadeP1Item, Produto, RegraComissao, TicketMedioRegra, Vendedor } from "@/types";
import { categoriaComercialExiste, getCategoriasComerciais, normalizarCategoriaComercial } from "@/utils/commercialCategories";

export type ImportEntity = "clientes" | "vendedores" | "lancamentos" | "negocios" | "produtos" | "metasEmpresa" | "metasPessoais" | "regrasComissao" | "eventos" | "rotas" | "prioridadesP1" | "empresas" | "formasPagamento" | "ticketsMedios";
export type ImportMode = "add" | "update" | "add_update" | "replace";

export type ImportableRecord = { id: string } & Record<string, unknown>;

export interface ImportPreviewRow {
  row: number;
  normalized: Record<string, unknown>;
  errors: string[];
  warnings: string[];
  duplicateKey?: string;
}

export interface ImportPreview {
  fileName: string;
  entity: ImportEntity;
  columns: string[];
  mappedColumns: Record<string, string>;
  unmappedColumns: string[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  duplicateRows: number;
  missingRequiredRows: number;
  sample: ImportPreviewRow[];
  rows: ImportPreviewRow[];
}

export const PRODUCT_IMPORT_HEADERS = [
  "codigo",
  "sku",
  "nome",
  "categoria",
  "unidade",
  "fornecedor",
  "marca",
  "precoVenda",
  "precoMinimo",
  "custo",
  "controlaEstoque",
  "estoqueAtual",
  "estoqueReservado",
  "localEstoque",
  "status",
  "observacoes",
];


export const PRODUCT_STANDARD_UNITS = [
  "LT",
  "L",
  "ML",
  "GL",
  "GAL",
  "KG",
  "G",
  "TON",
  "SC",
  "UN",
  "CX",
  "BD",
  "DOSE",
  "PACOTE",
  "KG/HA",
  "L/HA",
  "ML/HA",
  "G/HA",
] as const;

export const normalizeProductUnit = (value: unknown) => String(value ?? "").trim().toUpperCase();
export const isStandardProductUnit = (value: unknown) => PRODUCT_STANDARD_UNITS.includes(normalizeProductUnit(value) as (typeof PRODUCT_STANDARD_UNITS)[number]);

export const PRODUCT_IMPORT_EXAMPLES: Record<string, string>[] = [
  {
    codigo: "ADJ-001",
    sku: "SAFRA-ADJ-001",
    nome: "Adjuvante Max",
    categoria: "Adjuvantes",
    unidade: "LT",
    fornecedor: "Safra Insumos",
    marca: "Safra",
    precoVenda: "120,50",
    precoMinimo: "110,00",
    custo: "82,30",
    controlaEstoque: "sim",
    estoqueAtual: "150",
    estoqueReservado: "20",
    localEstoque: "Depósito Bagé",
    status: "ativo",
    observacoes: "Produto com controle de estoque inicial.",
  },
  {
    codigo: "REP-001",
    sku: "REP-NUTRI-001",
    nome: "Nutrição Especial Representada",
    categoria: "Nutrição",
    unidade: "KG",
    fornecedor: "Parceiro Representado",
    marca: "Marca Parceira",
    precoVenda: "95,00",
    precoMinimo: "0",
    custo: "0",
    controlaEstoque: "não",
    estoqueAtual: "",
    estoqueReservado: "",
    localEstoque: "",
    status: "ativo",
    observacoes: "Produto representado/comissionado sem controle de estoque.",
  },
];

export const IMPORT_TEMPLATES: Record<string, string[]> = {
  clientes: ["id_importacao", "nome", "vendedor", "abc", "prioridade", "rota", "cidade", "endereco", "area_total_ha", "status_atual", "inativo_manual", "frequencia_retorno", "cpf_cnpj", "inscricao_estadual", "telefone", "email", "nome_contato", "latitude", "longitude", "coordenadas", "link_mapa", "observacoes"],
  produtos: PRODUCT_IMPORT_HEADERS,
  empresas: ["Nome fantasia", "Razão social", "CNPJ", "Inscrição estadual", "Endereço", "Cidade/UF", "Telefone", "E-mail", "Responsável padrão", "Observações comerciais", "Ativa", "Empresa padrão"],
  formasPagamento: ["Nome", "Ativo", "Padrão"],
  metas: ["Tipo de meta", "Responsável", "Período", "Mês", "Ano", "Valor meta", "Categoria", "Observações"],
  estoquePrecos: ["Produto", "Empresa", "Unidade comercial", "Preço lista", "Preço mínimo", "Custo", "Estoque atual", "Estoque reservado", "Data atualização"],
  ticketsMedios: ["Linha/categoria", "Valor médio por hectare", "Ativo"],
};

const normalizeText = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
const compactKey = (value: unknown) => normalizeText(String(value ?? "")).replace(/[\s._-]+/g, "");
const hasValue = (value: unknown) => String(value ?? "").trim() !== "";

export const parseBoolean = (value: unknown): boolean | undefined => {
  const text = normalizeText(String(value ?? ""));
  if (!text) return undefined;
  if (["sim", "true", "1", "s", "yes", "y"].includes(text)) return true;
  if (["nao", "não", "false", "0", "n", "no"].includes(text)) return false;
  return undefined;
};

export const parseNumber = (value: unknown) => {
  if (value == null || value === "") return undefined;
  const text = String(value).trim().replace(/\s/g, "");
  if (!text) return undefined;
  const hasComma = text.includes(",");
  const hasDot = text.includes(".");
  let raw = text;
  if (hasComma && hasDot) {
    raw = text.lastIndexOf(",") > text.lastIndexOf(".") ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (hasComma) {
    raw = text.replace(",", ".");
  } else if (hasDot) {
    const parts = text.split(".");
    if (parts.length > 2) raw = text.replace(/\./g, "");
    else {
      const [integerPart, decimalPart] = parts;
      const integerDigits = integerPart.replace("-", "");
      raw = !text.startsWith("-") && decimalPart.length === 3 && integerDigits.length >= 1 && integerDigits.length <= 3 ? text.replace(".", "") : text;
    }
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

const toIsoDate = (value: unknown) => {
  const txt = String(value ?? "").trim();
  if (!txt) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(txt)) return txt.slice(0, 10);
  const br = txt.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const d = new Date(txt);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return undefined;
};

const aliases: Record<ImportEntity, Record<string, string>> = {
  clientes: { cliente: "nome", id_importacao: "idImportacao", fonte: "fonte", nome: "nome", "nome do cliente": "nome", "razao social": "nome", fazenda_propriedade: "localidade", abc: "abc", prioridade: "prioridade", rota: "rota", cidade: "cidade", localidade: "endereco", endereco: "endereco", vendedor: "vendedor", culturas: "culturas", cultura: "cultura", culturasdetalhes: "culturasDetalhes", area_total_ha: "areaHa", area_ha: "areaHa", status_atual: "statusAtual", inativo_manual: "inativoManual", "inativo manual": "inativoManual", frequencia_retorno: "frequenciaRetorno", "frequencia de retorno": "frequenciaRetorno", cpf_cnpj: "documento", documento: "documento", inscricao_estadual: "inscricaoEstadual", "inscrição estadual": "inscricaoEstadual", telefone: "telefone", "e-mail": "email", email: "email", nome_contato: "nomeContato", "nome do contato": "nomeContato", latitude: "latitude", longitude: "longitude", coordenadas: "coordenadas", link_mapa: "linkMapa", observacoes: "observacao", observação: "observacao", "area soja": "areaSoja", "area arroz": "areaArroz", "area milho": "areaMilho", "area trigo": "areaTrigo", "area pastagem": "areaPastagem", "area aveia": "areaAveia" },
  vendedores: { nome: "nome", vendedor: "nome", responsavel: "nome", email: "email", "e-mail": "email", ativo: "ativo" },
  lancamentos: { data: "data", cliente: "cliente", tipo: "tipo", status: "status", descricao: "oQueFoiRealizado" },
  negocios: { cliente: "cliente", oportunidade: "nome", negocio: "nome", produtos: "produtos", categoria: "categoria", "valor potencial": "valorPotencial", "valor fechado": "valorFechado", status: "status", probabilidade: "probabilidade", vendedor: "vendedor" },
  produtos: { codigo: "codigo", código: "codigo", sku: "sku", produto: "nome", nome: "nome", "nome do produto": "nome", "nome comercial": "nome", descricao: "nome", "linha/categoria": "categoria", linha: "categoria", categoria: "categoria", unidade: "unidade", "unidade comercial": "unidade", un: "unidade", embalagem: "unidade", precoVenda: "precoVenda", precovenda: "precoVenda", "preco venda": "precoVenda", "preço venda": "precoVenda", "preco lista": "precoLista", "preço lista": "precoLista", preco: "precoVenda", "valor unitario": "precoVenda", "valor venda": "precoVenda", "preco minimo": "precoMinimo", precominimo: "precoMinimo", "preço minimo": "precoMinimo", "preço mínimo": "precoMinimo", custo: "custo", margem: "margem", fornecedor: "fornecedor", empresa: "fornecedor", marca: "marca", controlaEstoque: "controlaEstoque", controlaestoque: "controlaEstoque", "controla estoque": "controlaEstoque", "controle estoque": "controlaEstoque", "tem estoque": "controlaEstoque", estoqueAtual: "estoqueAtual", estoqueatual: "estoqueAtual", "estoque atual": "estoqueAtual", estoqueReservado: "estoqueReservado", estoquereservado: "estoqueReservado", "estoque reservado": "estoqueReservado", localEstoque: "localEstoque", localestoque: "localEstoque", "local estoque": "localEstoque", "local de estoque": "localEstoque", status: "status", ativo: "ativo", observacoes: "observacoes", observação: "observacoes" },
  metasEmpresa: { mes: "mes", "meta total": "metaTotal", meta: "metaTotal", observacao: "observacao" },
  metasPessoais: { frente: "frente", "meta faturamento": "metaFaturamento", "comissao alvo": "comissaoAlvo", observacao: "observacao" },
  regrasComissao: { nome: "nome", tipo: "tipo", percentual: "percentual", "aplicar sobre": "aplicarSobre", alvo: "alvo", ativo: "ativo" },
  eventos: { tipo: "tipo", parceiro: "regiaoParceiro", publico: "publico" },
  rotas: {},
  prioridadesP1: { cliente: "cliente", status: "status", ordem: "ordem", "acao recomendada": "acaoRecomendada" },
  empresas: { "nome fantasia": "nomeFantasia", "razao social": "razaoSocial", cnpj: "cnpj", endereco: "endereco", "cidade/uf": "cidadeUf", email: "email", "e-mail": "email", "responsavel padrao": "consultorPadrao", "observacoes comerciais": "observacoesComerciaisPadrao", ativa: "ativa", "empresa padrao": "padrao" },
  formasPagamento: { nome: "nome", ativo: "ativo", padrao: "padrao" },
  ticketsMedios: { "linha/categoria": "categoria", "valor medio por hectare": "valorMedioHa", ativo: "ativo" },
};

export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  let field = "";
  let row: string[] = [];
  let quoted = false;
  const delimiter = (content.split(";").length - 1) < (content.split(",").length - 1) ? "," : ";";
  while (i < content.length) {
    const c = content[i];
    if (c === '"') {
      if (quoted && content[i + 1] === '"') { field += '"'; i += 1; }
      else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(field); field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && content[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = []; field = "";
    } else field += c;
    i += 1;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  return rows;
}

export function buildImportPreview(fileName: string, entity: ImportEntity, rows: string[][], options: { categoriasComerciais?: readonly string[] } = {}): ImportPreview {
  const header = (rows[0] ?? []).map((h) => h.trim().replace(/^\uFEFF/, ""));
  const map: Record<string, string> = {};
  header.forEach((h) => {
    const direct = aliases[entity][h] ?? aliases[entity][normalizeText(h)] ?? aliases[entity][compactKey(h)];
    if (direct) map[h] = direct;
  });
  const categoriasComerciais = getCategoriasComerciais({ extras: options.categoriasComerciais ? [...options.categoriasComerciais] : [] });
  const parsed = rows.slice(1).map((r, idx) => {
    const normalized: Record<string, unknown> = {};
    for (let c = 0; c < header.length; c += 1) {
      const target = map[header[c]];
      if (target) normalized[target] = r[c]?.trim();
    }
    const categoriaOriginal = normalized.categoria;
    if ((entity === "produtos" || entity === "ticketsMedios" || entity === "negocios") && hasValue(categoriaOriginal)) {
      const categoriaNormalizada = normalizarCategoriaComercial(categoriaOriginal, categoriasComerciais);
      normalized.categoria = categoriaNormalizada;
    }
    const errors = validateRow(entity, normalized);
    const warnings = warnRow(entity, normalized, categoriasComerciais);
    if ((entity === "produtos" || entity === "ticketsMedios" || entity === "negocios") && hasValue(normalized.categoria) && !categoriaComercialExiste(normalized.categoria, categoriasComerciais)) {
      warnings.push(`Nova categoria detectada: ${normalized.categoria}. Será adicionada às categorias comerciais.`);
      categoriasComerciais.push(String(normalized.categoria));
    }
    return { row: idx + 2, normalized, errors, warnings, duplicateKey: getDuplicateKey(entity, normalized) };
  });
  const duplicateRows = parsed.filter((r, i) => r.duplicateKey && parsed.findIndex((x) => x.duplicateKey === r.duplicateKey) !== i).length;
  const missingRequiredRows = parsed.filter((r) => r.errors.some((e) => e.includes("Campo obrigatório"))).length;
  return {
    fileName,
    entity,
    columns: header,
    mappedColumns: map,
    unmappedColumns: header.filter((h) => !map[h]),
    totalRows: parsed.length,
    validRows: parsed.filter((r) => !r.errors.length).length,
    errorRows: parsed.filter((r) => r.errors.length).length,
    warningRows: parsed.filter((r) => r.warnings.length).length,
    duplicateRows,
    missingRequiredRows,
    sample: parsed.slice(0, 8),
    rows: parsed,
  };
}

function validateRow(entity: ImportEntity, row: Record<string, unknown>): string[] {
  const errs: string[] = [];
  const required: Record<ImportEntity, string[]> = { clientes: ["nome"], vendedores: ["nome"], lancamentos: ["data", "cliente", "tipo"], negocios: ["cliente", "nome"], produtos: ["nome", "unidade"], metasEmpresa: ["mes", "metaTotal"], metasPessoais: ["frente"], regrasComissao: ["nome"], eventos: ["tipo"], rotas: [], prioridadesP1: ["cliente"], empresas: ["nomeFantasia"], formasPagamento: ["nome"], ticketsMedios: ["categoria"] };
  required[entity].forEach((f) => { if (!hasValue(row[f])) errs.push(`Campo obrigatório: ${f}`); });
  ["areaHa", "areaSoja", "areaArroz", "areaMilho", "areaTrigo", "areaPastagem", "areaAveia", "precoVenda", "precoLista", "precoMinimo", "custo", "margem", "estoqueAtual", "estoqueReservado", "latitude", "longitude"].forEach((k) => {
    if (hasValue(row[k]) && parseNumber(row[k]) === undefined) errs.push(`Número inválido: ${k}`);
  });
  if (entity === "produtos") {
    const unidade = normalizeProductUnit(row.unidade);
    if (unidade) row.unidade = unidade;
    if (hasValue(row.controlaEstoque) && parseBoolean(row.controlaEstoque) === undefined) errs.push("Controle de estoque inválido");
    const controlaEstoque = parseBoolean(row.controlaEstoque) ?? Boolean(hasValue(row.estoqueAtual) || hasValue(row.estoqueReservado) || hasValue(row.localEstoque));
    if (controlaEstoque) {
      if (!hasValue(row.estoqueAtual) || parseNumber(row.estoqueAtual) === undefined) errs.push("Estoque atual obrigatório para produto com controle de estoque");
      if (hasValue(row.estoqueReservado) && parseNumber(row.estoqueReservado) === undefined) errs.push("Estoque reservado inválido");
    }
    const status = normalizeText(String(row.status ?? row.ativo ?? "ativo"));
    if (status && !["ativo", "inativo", "sim", "true", "1", "nao", "não", "false", "0"].includes(status)) errs.push("Status inválido");
  }
  return errs;
}

function warnRow(entity: ImportEntity, row: Record<string, unknown>, categoriasComerciais: readonly string[] = []): string[] {
  const warnings: string[] = [];
  if (entity === "produtos") {
    const categoria = normalizarCategoriaComercial(row.categoria || "Outros", categoriasComerciais);
    if (hasValue(row.categoria)) row.categoria = categoria;
    const precoVenda = parseNumber(row.precoVenda ?? row.precoLista);
    const precoMinimo = parseNumber(row.precoMinimo);
    const custo = parseNumber(row.custo) ?? 0;
    const unidade = normalizeProductUnit(row.unidade);
    if (unidade && !isStandardProductUnit(unidade)) warnings.push(`Nova unidade detectada: ${unidade}. Revise antes de importar.`);
    if (precoVenda === undefined) warnings.push("Produto sem preço; será importado com preço 0.");
    if (!hasValue(row.precoMinimo)) warnings.push("Preço mínimo vazio; será importado com preço mínimo 0.");
    const precoMinimoEfetivo = hasValue(row.precoMinimo) ? precoMinimo : 0;
    if (precoMinimo !== undefined && precoVenda !== undefined && precoMinimo > precoVenda) warnings.push("Preço mínimo maior que preço de venda.");
    if (precoMinimoEfetivo !== undefined && precoMinimoEfetivo < custo) warnings.push("Preço mínimo menor que custo; revisar limite comercial.");
  }
  return warnings;
}

export function getDuplicateKey(entity: ImportEntity, row: Record<string, unknown>) {
  const nz = (x: unknown) => normalizeText(String(x || ""));
  if (entity === "clientes") return `${nz(row.nome)}|${nz(row.documento) || nz(row.cidade)}`;
  if (entity === "produtos") {
    const codigoSku = nz(row.codigo) || nz(row.sku);
    if (codigoSku) return `codigo-sku|${codigoSku}`;
    return `nome-fornecedor|${nz(row.nome)}|${nz(row.fornecedor)}`;
  }
  return undefined;
}

function mapCulturas(n: Record<string, unknown>): ClienteCulturaArea[] {
  const m: [string, string][] = [["Soja", "areaSoja"], ["Arroz", "areaArroz"], ["Milho", "areaMilho"], ["Trigo", "areaTrigo"], ["Pastagem", "areaPastagem"], ["Aveia", "areaAveia"]];
  return m.map(([c, k]) => ({ id: `${c}-${Date.now()}`, cultura: c, areaHa: parseNumber(n[k]) || 0 })).filter((x) => x.areaHa > 0);
}

function statusToActive(status: unknown, ativo: unknown): boolean {
  const statusText = normalizeText(String(status ?? ""));
  if (statusText === "inativo") return false;
  if (statusText === "ativo" || !statusText) return parseBoolean(ativo) ?? true;
  return parseBoolean(status ?? ativo) ?? true;
}

function normalizeEntityRow(entity: ImportEntity, n: Record<string, unknown>): unknown {
  const id = String(n.id || `${entity}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  if (entity === "clientes") return { id, nome: String(n.nome || ""), abc: String(n.abc || "C"), prioridade: String(n.prioridade || "P3"), rota: String(n.rota || ""), cidade: String(n.cidade || ""), localidade: String(n.localidade || ""), culturas: String(n.culturas || ""), culturasDetalhes: mapCulturas(n), areaHa: parseNumber(n.areaHa) || 0, potencialTotal: 0, statusAtual: String(n.statusAtual || "Ativo"), frequenciaRetorno: String(n.frequenciaRetorno || ""), retorno: "", inativoManual: parseBoolean(n.inativoManual) ?? false, email: String(n.email || ""), nomeContato: String(n.nomeContato || ""), observacao: String(n.observacao || ""), documento: String(n.documento || ""), inscricaoEstadual: String(n.inscricaoEstadual || ""), telefone: String(n.telefone || ""), ...(String(n.vendedor ?? "").trim() ? { vendedor: String(n.vendedor).trim() } : {}), ...(String(n.endereco ?? n.localidade ?? "").trim() ? { endereco: String(n.endereco ?? n.localidade).trim() } : {}), ...(parseNumber(n.latitude) !== undefined ? { latitude: parseNumber(n.latitude) } : {}), ...(parseNumber(n.longitude) !== undefined ? { longitude: parseNumber(n.longitude) } : {}), ...(String(n.coordenadas ?? "").trim() ? { coordenadas: String(n.coordenadas).trim() } : {}), ...(String(n.linkMapa ?? "").trim() ? { linkMapa: String(n.linkMapa).trim() } : {}) } as Cliente;
  if (entity === "vendedores") return { id, nome: String(n.nome || ""), telefone: String(n.telefone || ""), email: String(n.email || ""), ativo: parseBoolean(n.ativo) ?? true } as Vendedor;
  if (entity === "produtos") {
    const controlaEstoque = parseBoolean(n.controlaEstoque) ?? Boolean(hasValue(n.estoqueAtual) || hasValue(n.estoqueReservado) || hasValue(n.localEstoque));
    const estoqueAtual = controlaEstoque ? parseNumber(n.estoqueAtual) ?? 0 : 0;
    const estoqueReservado = controlaEstoque ? parseNumber(n.estoqueReservado) ?? 0 : 0;
    const precoLista = parseNumber(n.precoVenda ?? n.precoLista) ?? 0;
    const custo = parseNumber(n.custo) ?? 0;
    const margem = parseNumber(n.margem) ?? (precoLista > 0 ? ((precoLista - custo) / precoLista) * 100 : undefined);
    const now = new Date().toISOString();
    return { id, codigo: String(n.codigo || ""), sku: String(n.sku || ""), nome: String(n.nome || ""), categoria: normalizarCategoriaComercial(n.categoria || "Outros"), unidade: normalizeProductUnit(n.unidade || "KG"), fornecedor: String(n.fornecedor || ""), marca: String(n.marca || ""), precoLista, precoMinimo: parseNumber(n.precoMinimo) ?? 0, custo, margem, controlaEstoque, estoqueAtual, estoqueReservado, localEstoque: controlaEstoque ? String(n.localEstoque || "") : "", ativo: statusToActive(n.status, n.ativo), observacoes: String(n.observacoes || ""), ultimaAtualizacao: now, createdAt: now, updatedAt: now } as Produto;
  }
  if (entity === "empresas") return { id, nomeFantasia: String(n.nomeFantasia || ""), razaoSocial: String(n.razaoSocial || ""), cnpj: String(n.cnpj || ""), inscricaoEstadual: String(n.inscricaoEstadual || ""), endereco: String(n.endereco || ""), cidadeUf: String(n.cidadeUf || ""), telefone: String(n.telefone || ""), email: String(n.email || ""), consultorPadrao: String(n.consultorPadrao || ""), observacoesComerciaisPadrao: String(n.observacoesComerciaisPadrao || ""), ativa: parseBoolean(n.ativa) ?? true, padrao: parseBoolean(n.padrao) ?? false, logoDataUrl: "" } as Empresa;
  if (entity === "formasPagamento") return { id, nome: String(n.nome || ""), ativo: parseBoolean(n.ativo) ?? true, padrao: parseBoolean(n.padrao) ?? false } as FormaPagamento;
  if (entity === "ticketsMedios") return { id, categoria: normalizarCategoriaComercial(n.categoria || "Outros"), valorMedioHa: parseNumber(n.valorMedioHa) || 0, ativo: parseBoolean(n.ativo) ?? true } as TicketMedioRegra;
  if (entity === "eventos") return { id, tipo: String(n.tipo || ""), regiaoParceiro: String(n.regiaoParceiro || ""), publico: String(n.publico || ""), participantesMin: 0, participantesMax: 0, custoUnitario: 0, objetivo: "", evidencia: "", status: "Planejar" } as Evento;
  if (entity === "metasEmpresa") return { id, mes: String(n.mes || ""), metaTotal: parseNumber(n.metaTotal) || 0, vendaDireta: 0, cooperagro: 0, tritec: 0, observacao: String(n.observacao || "") } as MetaEmpresa;
  if (entity === "metasPessoais") return { id, frente: String(n.frente || "Venda Direta"), comissaoAlvo: parseNumber(n.comissaoAlvo) || 0, participacao: 0, percComissao: 0, metaFaturamento: parseNumber(n.metaFaturamento) || 0, observacao: String(n.observacao || "") } as MetaPessoal;
  if (entity === "regrasComissao") return { id, nome: String(n.nome || ""), tipo: "fixa", percentual: parseNumber(n.percentual) || 0, aplicarSobre: "negocio_fechado", ativo: parseBoolean(n.ativo) ?? true } as RegraComissao;
  if (entity === "lancamentos") return { id, data: toIsoDate(n.data) || new Date().toISOString().slice(0, 10), clienteId: String(n.cliente || ""), tipo: String(n.tipo || "Visita"), frente: "Venda Direta", status: String(n.status || "Aberto"), oQueFoiRealizado: String(n.oQueFoiRealizado || "") } as Lancamento;
  if (entity === "negocios") return { id, nome: String(n.nome || ""), clienteId: String(n.cliente || ""), vendedor: String(n.vendedor || ""), origem: "Outro", produtos: String(n.produtos || "").split(",").map((s) => s.trim()).filter(Boolean), categoria: normalizarCategoriaComercial(n.categoria || "Outros"), valorPotencial: parseNumber(n.valorPotencial) || 0, status: "Novo", probabilidade: 0, dataCriacao: new Date().toISOString().slice(0, 10), ultimaAtualizacao: new Date().toISOString().slice(0, 10) } as unknown as Negocio;
  if (entity === "prioridadesP1") return { id, ordem: parseNumber(n.ordem) || 1, clienteId: String(n.cliente || ""), acaoRecomendada: String(n.acaoRecomendada || ""), status: String(n.status || "Aberto") } as PrioridadeP1Item;
  return { id };
}

export function isDuplicate(entity: ImportEntity, a: ImportableRecord, b: ImportableRecord) {
  const nz = (x: unknown) => normalizeText(String(x || ""));
  if (a.id && b.id && a.id === b.id) return true;
  if (entity === "clientes") return nz(a.nome) === nz(b.nome) && (nz(a.documento) === nz(b.documento) || nz(a.cidade) === nz(b.cidade));
  if (entity === "produtos") {
    const aCodigoSku = nz(a.codigo) || nz(a.sku);
    const bCodigoSku = nz(b.codigo) || nz(b.sku);
    if (aCodigoSku && bCodigoSku) return aCodigoSku === bCodigoSku;
    return nz(a.nome) === nz(b.nome) && nz(a.fornecedor) === nz(b.fornecedor);
  }
  if (entity === "empresas") return Boolean(nz(a.cnpj)) && nz(a.cnpj) === nz(b.cnpj);
  if (entity === "formasPagamento") return nz(a.nome) === nz(b.nome);
  if (entity === "ticketsMedios") return nz(a.categoria) === nz(b.categoria);
  return false;
}

function mergeImportRecord(entity: ImportEntity, existing: ImportableRecord, imported: ImportableRecord): ImportableRecord {
  if (entity !== "produtos") return { ...existing, ...imported, id: existing.id };
  const cleanImported = Object.fromEntries(Object.entries(imported).filter(([, value]) => value !== undefined && value !== ""));
  return { ...existing, ...cleanImported, id: existing.id, createdAt: existing.createdAt ?? imported.createdAt, updatedAt: new Date().toISOString(), ultimaAtualizacao: new Date().toISOString() };
}

export function applyImport<T extends ImportableRecord>(entity: ImportEntity, mode: ImportMode, current: T[], preview: ImportPreview): { data: T[]; imported: number; updated: number; ignored: number; duplicates: number } {
  const valid = preview.rows
    .filter((r) => !r.errors.length)
    .filter((r) => entity !== "clientes" || parseBoolean(r.normalized.importarApp ?? "sim") !== false)
    .map((r) => normalizeEntityRow(entity, r.normalized) as ImportableRecord);

  if (mode === "replace") return { data: valid as T[], imported: valid.length, updated: 0, ignored: 0, duplicates: 0 };

  const out: ImportableRecord[] = [...current];
  let imported = 0;
  let updated = 0;
  let ignored = preview.rows.filter((r) => r.errors.length).length;
  let duplicates = 0;

  valid.forEach((item) => {
    const idx = out.findIndex((x) => isDuplicate(entity, x, item));
    if (idx >= 0) {
      duplicates += 1;
      if (mode === "update" || mode === "add_update") {
        out[idx] = mergeImportRecord(entity, out[idx], item);
        updated += 1;
      } else ignored += 1;
    } else if (mode === "add" || mode === "add_update") {
      out.push(item);
      imported += 1;
    } else ignored += 1;
  });

  return { data: out as T[], imported, updated, ignored, duplicates };
}
