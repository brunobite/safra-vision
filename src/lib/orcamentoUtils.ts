import { OrcamentoItem, Produto, UnidadeDose } from "@/types";

export const DOSE_UNIDADES: UnidadeDose[] = ["L/ha", "mL/ha", "kg/ha", "g/ha", "ton/ha", "un/ha"];

export function calcularQuantidadeComercial(unidadeProduto: Produto["unidade"], dose: number, unidadeDose: UnidadeDose, area: number) {
  const doseTotal = (dose || 0) * (area || 0);
  if (unidadeProduto === "TON" && unidadeDose === "kg/ha") return { quantidadeComercial: doseTotal / 1000, resumo: `${doseTotal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg / ${(doseTotal / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} TON` };
  if (unidadeProduto === "LT" && unidadeDose === "mL/ha") return { quantidadeComercial: doseTotal / 1000, resumo: `${doseTotal.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mL / ${(doseTotal / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} LT` };
  if (unidadeProduto === "KG" && unidadeDose === "g/ha") return { quantidadeComercial: doseTotal / 1000, resumo: `${doseTotal.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} g / ${(doseTotal / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} KG` };
  return { quantidadeComercial: doseTotal, resumo: `${doseTotal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${unidadeProduto}` };
}

export function recalcularItem(base: OrcamentoItem, produto: Produto): OrcamentoItem {
  const calc = calcularQuantidadeComercial(produto.unidade, base.dosePorHa, base.unidadeDose, base.areaHa);
  const valorTotalItem = calc.quantidadeComercial * (base.precoUnitario || 0);
  return { ...base, produtoNome: produto.nome, categoria: produto.categoria, unidadeProduto: produto.unidade, quantidadeTotal: calc.quantidadeComercial, valorTotalItem, custoPorHaItem: base.areaHa > 0 ? valorTotalItem / base.areaHa : 0, observacoes: `Resumo: ${calc.resumo}` };
}
