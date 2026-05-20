import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { Cliente, Empresa, Orcamento } from "@/types";
import { fmtBRL } from "@/utils/calculations";

const sanitizeForFileName = (value?: string, fallback = "sem-valor") => {
  const normalized = (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return normalized || fallback;
};

const toText = (value?: string | number | null) => {
  if (value === null || value === undefined) return "-";
  const parsed = String(value).trim();
  return parsed.length > 0 ? parsed : "-";
};

export function gerarPdfOrcamento(orcamento: Orcamento, cliente?: Cliente, empresa?: Empresa) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margem = 14;
  let y = margem;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("ORÇAMENTO COMERCIAL", margem, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Código: ${toText(orcamento.codigo)}`, margem, y);
  y += 5;
  doc.text(`Data: ${toText(orcamento.data)} | Validade: ${toText(orcamento.validade)}`, margem, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.text("Empresa", margem, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  const empresaLinhas = [
    `Nome fantasia: ${toText(empresa?.nomeFantasia)}`,
    `Razão social: ${toText(empresa?.razaoSocial)}`,
    `CNPJ: ${toText(empresa?.cnpj)}`,
    `Inscrição estadual: ${toText(empresa?.inscricaoEstadual)}`,
    `Endereço: ${toText(empresa?.endereco)}`,
    `Cidade/UF: ${toText(empresa?.cidadeUf)}`,
    `Telefone: ${toText(empresa?.telefone)}`,
    `E-mail: ${toText(empresa?.email)}`,
  ];
  empresaLinhas.forEach((linha) => {
    doc.text(linha, margem, y);
    y += 4.5;
  });
  y += 3;

  doc.setFont("helvetica", "bold");
  doc.text("Cliente", margem, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  const clienteLinhas = [
    `Nome/Razão social: ${toText(cliente?.nome)}`,
    `CPF/CNPJ: ${toText(cliente?.cpfCnpj)}`,
    `Inscrição estadual: ${toText(cliente?.inscricaoEstadual)}`,
    `Endereço: ${toText(cliente?.endereco)}`,
    `Cidade/UF: ${toText(cliente?.cidadeUf)}`,
    `Telefone: ${toText(cliente?.telefone)}`,
    `E-mail: ${toText(cliente?.email)}`,
    `Contato: ${toText(cliente?.contato)}`,
  ];
  clienteLinhas.forEach((linha) => {
    doc.text(linha, margem, y);
    y += 4.5;
  });
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [["Item", "Produto", "Linha/Categoria", "Dose por hectare", "Área aplicada", "Quantidade total", "Preço unitário", "Valor total", "Custo por hectare"]],
    body: orcamento.itens.map((it, idx) => [
      idx + 1,
      toText(it.produtoNome),
      toText(it.categoria),
      `${toText(it.dosePorHa)} ${toText(it.unidadeDose)}`,
      `${toText(it.areaHa)} ha`,
      toText(it.observacoes?.replace("Resumo: ", "") || it.quantidadeTotal),
      `${fmtBRL(it.precoUnitario)}/${toText(it.unidadeProduto)}`,
      fmtBRL(it.valorTotalItem),
      `${fmtBRL(it.custoPorHaItem)}/ha`,
    ]),
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.8 },
    headStyles: { fillColor: [28, 84, 45] },
    margin: { left: margem, right: margem },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  doc.setFont("helvetica", "bold");
  doc.text("Resumo", margem, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.text(`Valor total: ${fmtBRL(orcamento.valorTotal)}`, margem, y);
  y += 4.5;
  doc.text(`Custo médio por hectare: ${fmtBRL(orcamento.custoPorHectare)}/ha`, margem, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.text("Condições comerciais", margem, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  const condicoes = [
    `Prazo de pagamento: ${toText(orcamento.prazoPagamento)}`,
    `Forma de pagamento: ${toText(orcamento.formaPagamento)}`,
    `Tipo de cobrança: ${toText(orcamento.tipoCobranca)}`,
    `Observações: ${toText(orcamento.observacoes || empresa?.observacoesComerciaisPadrao)}`,
  ];
  condicoes.forEach((linha) => {
    const wrapped = doc.splitTextToSize(linha, 180);
    doc.text(wrapped, margem, y);
    y += wrapped.length * 4.5;
  });
  y += 2;

  const aceite =
    "Declaro estar ciente das condições comerciais apresentadas neste orçamento. A aprovação deste documento autoriza o consultor a encaminhar a negociação para a empresa responsável pelo faturamento. Este orçamento não substitui pedido formal, nota fiscal, receituário agronômico ou demais documentos exigidos pela legislação aplicável.";
  const aceiteWrapped = doc.splitTextToSize(aceite, 180);
  doc.text(aceiteWrapped, margem, y);
  y += aceiteWrapped.length * 4.5 + 8;

  const assinaturaY = y;
  doc.line(margem, assinaturaY, 90, assinaturaY);
  doc.line(120, assinaturaY, 196, assinaturaY);
  doc.text("Assinatura do cliente", margem, assinaturaY + 5);
  doc.text("Assinatura do consultor", 120, assinaturaY + 5);

  const clienteSlug = sanitizeForFileName(cliente?.nome, "cliente");
  const codigoSlug = sanitizeForFileName(orcamento.codigo, "codigo");
  doc.save(`orcamento-${clienteSlug}-${codigoSlug}.pdf`);
}
