import { OrcamentoItem, Produto, UnidadeDose } from "@/types";

export const DOSE_UNIDADES: UnidadeDose[] = ["L/ha", "mL/ha", "kg/ha", "g/ha", "ton/ha", "un/ha"];

const BASE_VOLUME_LT: Record<string, number> = { LT: 1, L: 1, ML: 0.001, GAL: 5, GL: 5, BD: 20, KG: 0, G: 0, TON: 0 };

const round = (value: number, digits = 6) => Number(value.toFixed(digits));

export function calcularQuantidadeComercial(unidadeProduto: Produto["unidade"], dose: number, unidadeDose: UnidadeDose, area: number) {
  const doseSafe = dose || 0;
  const areaSafe = area || 0;
  const doseLHa = unidadeDose === "mL/ha" ? doseSafe / 1000 : unidadeDose === "L/ha" ? doseSafe : 0;
  const doseKgHa = unidadeDose === "g/ha" ? doseSafe / 1000 : unidadeDose === "kg/ha" ? doseSafe : unidadeDose === "ton/ha" ? doseSafe * 1000 : 0;

  if (["LT", "GAL", "BD"].includes(unidadeProduto)) {
    const litrosNecessarios = doseLHa * areaSafe;
    if (unidadeProduto === "LT") {
      const quantidadeComercial = round(litrosNecessarios);
      return { quantidadeComercial, necessidadeTecnica: round(litrosNecessarios), volumeComercial: quantidadeComercial, unidadeBase: "L", precoBaseDivisor: 1, resumo: `${quantidadeComercial.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L necessários` };
    }
    const porVasilhame = BASE_VOLUME_LT[unidadeProduto] ?? 1;
    const quantidadeComercial = Math.ceil(Math.max(0, litrosNecessarios) / porVasilhame);
    const volumeComercial = quantidadeComercial * porVasilhame;
    return { quantidadeComercial, necessidadeTecnica: round(litrosNecessarios), volumeComercial, unidadeBase: "L", precoBaseDivisor: porVasilhame, resumo: `${round(litrosNecessarios).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L necessários → ${quantidadeComercial} ${unidadeProduto} (${volumeComercial.toLocaleString("pt-BR")} L comerciais)` };
  }

  if (["KG", "TON"].includes(unidadeProduto)) {
    const kgNecessarios = doseKgHa * areaSafe;
    if (unidadeProduto === "KG") {
      const quantidadeComercial = round(kgNecessarios);
      return { quantidadeComercial, necessidadeTecnica: round(kgNecessarios), volumeComercial: quantidadeComercial, unidadeBase: "kg", precoBaseDivisor: 1, resumo: `${quantidadeComercial.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg necessários` };
    }
    const quantidadeComercial = round(kgNecessarios / 1000);
    return { quantidadeComercial, necessidadeTecnica: round(kgNecessarios), volumeComercial: round(quantidadeComercial * 1000), unidadeBase: "kg", precoBaseDivisor: 1000, resumo: `${round(kgNecessarios).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg necessários → ${quantidadeComercial.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} TON` };
  }

  const doseTotal = doseSafe * areaSafe;
  return { quantidadeComercial: round(doseTotal), necessidadeTecnica: round(doseTotal), volumeComercial: round(doseTotal), unidadeBase: "un", precoBaseDivisor: 1, resumo: `${round(doseTotal).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${unidadeProduto}` };
}

export function recalcularItem(base: OrcamentoItem, produto: Produto): OrcamentoItem {
  const calc = calcularQuantidadeComercial(produto.unidade, base.dosePorHa, base.unidadeDose, base.areaHa);
  const precoUnitario = base.precoUnitario || 0;
  const desconto = base.desconto || 0;
  const precoLiquido = Math.max(0, precoUnitario - desconto);
  const valorTotalItem = round(calc.quantidadeComercial * precoLiquido, 2);
  const doseBaseHa = calc.unidadeBase === "L"
    ? (base.unidadeDose === "mL/ha" ? base.dosePorHa / 1000 : base.unidadeDose === "L/ha" ? base.dosePorHa : 0)
    : calc.unidadeBase === "kg"
      ? (base.unidadeDose === "g/ha" ? base.dosePorHa / 1000 : base.unidadeDose === "kg/ha" ? base.dosePorHa : base.unidadeDose === "ton/ha" ? base.dosePorHa * 1000 : 0)
      : base.dosePorHa;
  const precoBase = calc.precoBaseDivisor > 0 ? precoLiquido / calc.precoBaseDivisor : precoLiquido;
  const custoPorHaItem = round(precoBase * doseBaseHa, 2);

  return {
    ...base,
    produtoNome: produto.nome,
    categoria: produto.categoria,
    unidadeProduto: produto.unidade,
    quantidadeTotal: calc.quantidadeComercial,
    precoMinimo: produto.precoMinimo || 0,
    controlaEstoque: !!produto.controlaEstoque,
    representacaoComissionado: !!produto.representacaoComissionado || !produto.controlaEstoque,
    estoqueDisponivel: Math.max(0, (produto.estoqueAtual || 0) - (produto.estoqueReservado || 0)),
    abaixoPrecoMinimo: precoLiquido < (produto.precoMinimo || 0),
    valorTotalItem,
    custoPorHaItem,
    observacoes: `Resumo: ${calc.resumo}`,
  };
}


const statusComerciaisAtuais = new Set(["Enviado", "Reenviado", "Aprovado"]);
const toTs = (value?: string) => (value ? new Date(value).getTime() : 0);

export function getOrcamentoAtualDaOportunidade(oportunidadeId: string, orcamentos: { oportunidadeId?: string; status: string; dataEnvio?: string; versao?: number; updatedAt: string; createdAt: string; }[]) {
  const vinculados = orcamentos.filter((o) => o.oportunidadeId === oportunidadeId);
  if (!vinculados.length) return null;

  const comerciais = vinculados.filter((o) => statusComerciaisAtuais.has(o.status));
  if (comerciais.length) {
    return [...comerciais].sort((a, b) => {
      const byEnvio = toTs(b.dataEnvio) - toTs(a.dataEnvio);
      if (byEnvio !== 0) return byEnvio;
      const byVersao = (b.versao || 0) - (a.versao || 0);
      if (byVersao !== 0) return byVersao;
      return toTs(b.updatedAt) - toTs(a.updatedAt);
    })[0];
  }

  return [...vinculados].sort((a, b) => {
    const byVersao = (b.versao || 0) - (a.versao || 0);
    if (byVersao !== 0) return byVersao;
    const byUpdated = toTs(b.updatedAt) - toTs(a.updatedAt);
    if (byUpdated !== 0) return byUpdated;
    return toTs(b.createdAt) - toTs(a.createdAt);
  })[0];
}

export function isOrcamentoBloqueado(orcamento: { oportunidadeId?: string }, oportunidades: { id: string; etapa: string }[]) {
  if (!orcamento.oportunidadeId) return false;
  const oportunidade = oportunidades.find((o) => o.id === orcamento.oportunidadeId);
  return !!oportunidade && ["Ganha", "Perdida", "Cancelada"].includes(oportunidade.etapa);
}
