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
const toText = (value?: string | number | null) => (value === null || value === undefined || String(value).trim() === "" ? "-" : String(value));

export function gerarPdfOrcamento(orcamento: Orcamento, cliente?: Cliente, empresa?: Empresa) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margem = 12;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = margem;

  if (empresa?.logoDataUrl) {
    try { doc.addImage(empresa.logoDataUrl, "PNG", margem, y, 28, 14); } catch { /* noop */ }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("ORÇAMENTO COMERCIAL", pageWidth / 2, y + 6, { align: "center" });
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.roundedRect(pageWidth - 68, y, 56, 16, 1, 1);
  doc.text(`Código: ${toText(orcamento.codigo)}`, pageWidth - 65, y + 5);
  doc.text(`Data: ${toText(orcamento.data)}`, pageWidth - 65, y + 9.5);
  doc.text(`Validade: ${toText(orcamento.validade)}`, pageWidth - 65, y + 14);
  y += 22;

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
  const clienteLinhas = [
    `Nome/Razão social: ${toText(cliente?.nome)}`,
    `CPF/CNPJ: ${toText(cliente?.documento)}`,
    `Inscrição estadual: ${toText(cliente?.inscricaoEstadual)}`,
    `Endereço: ${toText(cliente?.endereco)}`,
    `Cidade/UF: ${toText(cliente?.cidade)}`,
    `Telefone: ${toText(cliente?.telefone)}`,
    `E-mail: ${toText(cliente?.email)}`,
    `Contato: ${toText(cliente?.nomeContato)}`,
  ];

  autoTable(doc, {
    startY: y,
    theme: "grid",
    head: [["Empresa", "Cliente"]],
    body: [[empresaLinhas.join("\n"), clienteLinhas.join("\n")]],
    styles: { fontSize: 8.5, cellPadding: 2, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [36, 99, 63] },
    columnStyles: { 0: { cellWidth: 93 }, 1: { cellWidth: 93 } },
    margin: { left: margem, right: margem },
  });

  const afterHeader = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  autoTable(doc, {
    startY: afterHeader + 4,
    head: [["Item", "Produto", "Linha/Categoria", "Dose/ha", "Área", "Qtd total", "Preço unit.", "Valor total", "Custo/ha"]],
    body: orcamento.itens.map((it, idx) => [
      idx + 1,
      toText(it.produtoNome),
      toText(it.categoria),
      `${toText(it.dosePorHa)} ${toText(it.unidadeDose)}`,
      `${toText(it.areaHa)} ha`,
      toText(it.quantidadeTotal),
      `${fmtBRL(it.precoUnitario)}/${toText(it.unidadeProduto)}`,
      fmtBRL(it.valorTotalItem),
      `${fmtBRL(it.custoPorHaItem)}/ha`,
    ]),
    styles: { fontSize: 8, overflow: "linebreak", cellPadding: 1.6 },
    headStyles: { fillColor: [45, 45, 45] },
    columnStyles: { 0: { cellWidth: 10, halign: "center" }, 1: { cellWidth: 30 }, 2: { cellWidth: 23 }, 3: { cellWidth: 20 }, 4: { cellWidth: 14, halign: "right" }, 5: { cellWidth: 18, halign: "right" }, 6: { cellWidth: 23, halign: "right" }, 7: { cellWidth: 24, halign: "right" }, 8: { cellWidth: 18, halign: "right" } },
    margin: { left: margem, right: margem },
  });

  y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? afterHeader) + 7;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Resumo final", margem, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  [
    `Valor total: ${fmtBRL(orcamento.valorTotal)}`,
    `Custo médio por hectare: ${fmtBRL(orcamento.custoPorHectare)}/ha`,
    `Validade: ${toText(orcamento.validade)}`,
    `Prazo de pagamento: ${toText(orcamento.prazoPagamento)}`,
    `Forma de pagamento: ${toText(orcamento.formaPagamento)}`,
  ].forEach((linha) => { doc.text(linha, margem, y); y += 4.4; });

  const aceite = "Declaro estar ciente das condições comerciais apresentadas neste orçamento. A aprovação deste documento autoriza o consultor a encaminhar a negociação para a empresa responsável pelo faturamento. Este orçamento não substitui pedido formal, nota fiscal, receituário agronômico ou demais documentos exigidos pela legislação aplicável.";
  y += 2;
  doc.text(doc.splitTextToSize(aceite, 186), margem, y);
  y += 18;
  doc.line(margem, y, 90, y); doc.text("Assinatura do cliente", margem, y + 4);
  doc.line(120, y, 196, y); doc.text("Assinatura do consultor", 120, y + 4);
  y += 10;
  doc.text("Nome do cliente: ____________________", margem, y);
  doc.text("Data: ____/____/______", 120, y);
  y += 6;
  doc.text("Nome do consultor: __________________", margem, y);
  doc.text("Data: ____/____/______", 120, y);

  doc.save(`orcamento-${sanitizeForFileName(cliente?.nome, "cliente")}-${sanitizeForFileName(orcamento.codigo, "codigo")}.pdf`);
}
