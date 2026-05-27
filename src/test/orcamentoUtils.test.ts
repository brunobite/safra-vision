import { describe, expect, it } from "vitest";
import { calcularQuantidadeComercial, recalcularItem } from "@/lib/orcamentoUtils";
import { OrcamentoItem, Produto } from "@/types";

const baseItem: OrcamentoItem = {
  id: "1", produtoId: "p1", produtoNome: "", categoria: "", unidadeProduto: "LT", dosePorHa: 0, unidadeDose: "L/ha", areaHa: 0,
  quantidadeTotal: 0, precoUnitario: 0, valorTotalItem: 0, custoPorHaItem: 0,
};

const mkProduto = (unidade: Produto["unidade"]): Produto => ({ id: "p1", nome: "STAR SOL", categoria: "Fungicida", unidade, precoLista: 0, ativo: true, createdAt: "", updatedAt: "" });

describe("orcamentoUtils vasilhame", () => {
  it("GAL 5L area 120", () => {
    const calc = calcularQuantidadeComercial("GAL", 0.03, "L/ha", 120);
    expect(calc.necessidadeTecnica).toBe(3.6);
    expect(calc.quantidadeComercial).toBe(1);
    expect(calc.volumeComercial).toBe(5);
    const item = recalcularItem({ ...baseItem, dosePorHa: 0.03, unidadeDose: "L/ha", areaHa: 120, precoUnitario: 590 }, mkProduto("GAL"));
    expect(item.valorTotalItem).toBe(590);
    expect(item.custoPorHaItem).toBe(3.54);
  });

  it("GAL 5L area 1600", () => {
    const calc = calcularQuantidadeComercial("GAL", 0.03, "L/ha", 1600);
    expect(calc.necessidadeTecnica).toBe(48);
    expect(calc.quantidadeComercial).toBe(10);
    expect(calc.volumeComercial).toBe(50);
    const item = recalcularItem({ ...baseItem, dosePorHa: 0.03, unidadeDose: "L/ha", areaHa: 1600, precoUnitario: 590 }, mkProduto("GAL"));
    expect(item.valorTotalItem).toBe(5900);
    expect(item.custoPorHaItem).toBe(3.54);
  });

  it("BD 20L area 1600", () => {
    const calc = calcularQuantidadeComercial("BD", 0.03, "L/ha", 1600);
    expect(calc.necessidadeTecnica).toBe(48);
    expect(calc.quantidadeComercial).toBe(3);
    expect(calc.volumeComercial).toBe(60);
  });

  it("LT", () => {
    const item = recalcularItem({ ...baseItem, dosePorHa: 0.03, unidadeDose: "L/ha", areaHa: 120, precoUnitario: 118 }, mkProduto("LT"));
    expect(item.quantidadeTotal).toBe(3.6);
    expect(item.valorTotalItem).toBe(424.8);
    expect(item.custoPorHaItem).toBe(3.54);
  });

  it("mL/ha para GAL", () => {
    const calc = calcularQuantidadeComercial("GAL", 30, "mL/ha", 120);
    expect(calc.necessidadeTecnica).toBe(3.6);
    expect(calc.quantidadeComercial).toBe(1);
    const item = recalcularItem({ ...baseItem, dosePorHa: 30, unidadeDose: "mL/ha", areaHa: 120, precoUnitario: 590 }, mkProduto("GAL"));
    expect(item.custoPorHaItem).toBe(3.54);
  });
});
