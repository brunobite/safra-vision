import { describe, expect, it } from "vitest";
import { applyImport, buildImportPreview, parseCsv, parseNumber, PRODUCT_IMPORT_HEADERS } from "@/lib/importService";
import { calcularMetaCarteira, calcularPotencialCarteira, calcularRealizadoCarteira } from "@/utils/businessRules";
import { Cliente, Orcamento, Produto, TicketMedioRegra } from "@/types";

describe("auditoria importação e cálculos", () => {
  it("parseNumber suporta formatos com vírgula/ponto e milhar", () => {
    expect(parseNumber("800")).toBe(800);
    expect(parseNumber("800,5")).toBe(800.5);
    expect(parseNumber("800.5")).toBe(800.5);
    expect(parseNumber("2.300")).toBe(2300);
    expect(parseNumber("2.300,50")).toBe(2300.5);
    expect(parseNumber("-30,123456")).toBe(-30.123456);
    expect(parseNumber("-30.123456")).toBe(-30.123456);
  });

  it("inclui precoMinimo no modelo oficial de produtos na ordem esperada", () => {
    expect(PRODUCT_IMPORT_HEADERS).toEqual([
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
    ]);
  });

  it("importa produtos preenchendo precoMinimo e mantendo precoVenda em precoLista", () => {
    const csv = `codigo;sku;nome;categoria;unidade;fornecedor;marca;precoVenda;precoMinimo;custo;controlaEstoque;estoqueAtual;estoqueReservado;localEstoque;status;observacoes
P1;SKU1;Produto 1;Adjuvantes;LT;Fornecedor;Marca;120,50;110.25;82,30;sim;10;2;Depósito;ativo;obs`;
    const preview = buildImportPreview("produtos.csv", "produtos", parseCsv(csv));
    const result = applyImport("produtos", "add", [], preview);
    const produto = result.data[0] as Produto;
    expect(produto.precoLista).toBe(120.5);
    expect(produto.precoMinimo).toBe(110.25);
    expect(produto.custo).toBe(82.3);
  });

  it("avisa sobre precoMinimo vazio, maior que venda e menor que custo sem bloquear importação", () => {
    const csv = `codigo;nome;unidade;precoVenda;precoMinimo;custo
VAZIO;Preço Mínimo Vazio;KG;100;;80
MAIOR;Preço Mínimo Maior;KG;100;120;70
MENOR;Preço Mínimo Menor;KG;100;60;70`;
    const preview = buildImportPreview("produtos.csv", "produtos", parseCsv(csv));
    expect(preview.validRows).toBe(3);
    expect(preview.rows[0].warnings).toContain("Preço mínimo vazio; será importado com preço mínimo 0.");
    expect(preview.rows[0].warnings).toContain("Preço mínimo menor que custo; revisar limite comercial.");
    expect(preview.rows[1].warnings).toContain("Preço mínimo maior que preço de venda.");
    expect(preview.rows[2].warnings).toContain("Preço mínimo menor que custo; revisar limite comercial.");

    const result = applyImport("produtos", "add", [], preview);
    const produtoVazio = result.data[0] as Produto;
    expect(produtoVazio.precoMinimo).toBe(0);
  });

  it("importa clientes com persistência de campos oficiais", () => {
    const csv = `id_importacao;nome;vendedor;abc;prioridade;rota;cidade;endereco;area_total_ha;status_atual;inativo_manual;frequencia_retorno;cpf_cnpj;inscricao_estadual;telefone;email;nome_contato;latitude;longitude;coordenadas;link_mapa;observacoes
id1;Cliente 1;Vendedor A;B;P1;Rota X;Cidade Y;Rua 1;800,5;Ativo;não;30 dias;123;IE-1;5199999;a@a.com;Contato;-30,123456;-51.123456;coord;http://mapa;obs`;
    const preview = buildImportPreview("clientes.csv", "clientes", parseCsv(csv));
    const result = applyImport("clientes", "add", [], preview);
    const cliente = result.data[0] as Cliente;
    expect(cliente.nome).toBe("Cliente 1");
    expect(cliente.vendedor).toBe("Vendedor A");
    expect(cliente.abc).toBe("B");
    expect(cliente.prioridade).toBe("P1");
    expect(cliente.rota).toBe("Rota X");
    expect(cliente.documento).toBe("123");
    expect(cliente.inscricaoEstadual).toBe("IE-1");
    expect(cliente.telefone).toBe("5199999");
    expect(cliente.latitude).toBe(-30.123456);
    expect(cliente.longitude).toBe(-51.123456);
  });

  it("calcula potencial/meta e realizado sem duplicar negócio+orçamento vinculado", () => {
    const clientes: Cliente[] = [{ id: "c1", nome: "C", abc: "A", prioridade: "P1", rota: "R", cidade: "X", areaHa: 100, potencialTotal: 0, statusAtual: "Ativo", frequenciaRetorno: "30 dias", retorno: "" }];
    const tickets: TicketMedioRegra[] = [{ id: "t1", categoria: "Adjuvantes", valorMedioHa: 10, ativo: true }];
    expect(calcularPotencialCarteira(clientes, tickets)).toBe(1000);
    expect(calcularMetaCarteira(clientes, tickets, 20)).toBe(200);
    const orcamentos: Orcamento[] = [
      { id: "o1", codigo: "1", clienteId: "c1", negocioId: "n1", vendedor: "v", data: "2026-01-01", status: "Aprovado", areaAplicacaoHa: 1, itens: [], subtotal: 0, descontoTotal: 0, valorTotal: 300, custoPorHectare: 0, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
      { id: "o2", codigo: "2", clienteId: "c1", vendedor: "v", data: "2026-01-01", status: "Aprovado", areaAplicacaoHa: 1, itens: [], subtotal: 0, descontoTotal: 0, valorTotal: 200, custoPorHectare: 0, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    ];
    const realizado = calcularRealizadoCarteira([{ id: "n1", clienteId: "c1", vendedor: "v", origem: "Outro", produtos: [], categoria: "Outros", valorPotencial: 0, valorFechado: 500, status: "Fechado ganho", dataCriacao: "2026-01-01", ultimaAtualizacao: "2026-01-01" }], orcamentos);
    expect(realizado).toBe(700);
  });
});

