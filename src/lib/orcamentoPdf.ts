import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { Cliente, Empresa, OportunidadeComercial, Orcamento } from "@/types";
import { fmtBRL } from "@/utils/calculations";
import { calcularQuantidadeComercial } from "@/lib/orcamentoUtils";
import { formatDateBR } from "@/utils/dateUtils";

const sanitizeForFileName = (value?: string, fallback = "sem-valor") => {
  const normalized = (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return normalized || fallback;
};
const toText = (value?: string | number | null) => (value === null || value === undefined || String(value).trim() === "" ? "-" : String(value));

export function gerarPdfOrcamento(orcamento: Orcamento, cliente?: Cliente, empresa?: Empresa, oportunidade?: OportunidadeComercial) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margem = 12;
  let y = margem;
  const width = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(`${toText(empresa?.nomeFantasia)} - PROPOSTA COMERCIAL`, width / 2, y + 6, { align: "center" });
  y += 12;

  autoTable(doc, { startY: y, theme: "grid", head: [["Proposta", "Cliente", "Oportunidade"]], body: [[`Código: ${orcamento.codigo}\nVersão: v${orcamento.versao || 1}\nData: ${formatDateBR(orcamento.data)}\nValidade: ${formatDateBR(orcamento.validade)}\nStatus: ${toText(orcamento.status)}\nVendedor: ${toText(orcamento.responsavel || orcamento.vendedor)}`, `Nome: ${toText(cliente?.nome)}\nCidade: ${toText(cliente?.cidade)}\nContato: ${toText(cliente?.nomeContato)}\nTelefone: ${toText(cliente?.telefone)}\nE-mail: ${toText(cliente?.email)}`, oportunidade ? `Etapa: ${oportunidade.etapa}\nNecessidade: ${toText(oportunidade.necessidade)}\nOrigem: ${oportunidade.origem}` : "Sem oportunidade vinculada (legado/avulso)"]], styles: { fontSize: 8.5, cellPadding: 2, valign: "top" }, margin: { left: margem, right: margem } });

  const y1 = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 3;
  autoTable(doc, {
    startY: y1,
    head: [["Item", "Produto", "Dose/ha", "Área", "Qtd.", "Un.", "Vlr Unit.", "Subtotal", "Custo/ha"]],
    body: orcamento.itens.map((it, idx) => { const calc = calcularQuantidadeComercial(it.unidadeProduto, it.dosePorHa, it.unidadeDose, it.areaHa); return [idx + 1, toText(it.produtoNome), `${toText(it.dosePorHa)} ${toText(it.unidadeDose)}\n${calc.necessidadeTecnica.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${calc.unidadeBase} necessários`, `${toText(it.areaHa)} ha`, calc.quantidadeComercial.toLocaleString("pt-BR", { maximumFractionDigits: 3 }), toText(it.unidadeProduto), fmtBRL(it.precoUnitario), fmtBRL(it.valorTotalItem), fmtBRL(it.custoPorHaItem)]; }),
    styles: { fontSize: 8, cellPadding: 1.6 },
    margin: { left: margem, right: margem },
  });

  y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y1) + 6;
  doc.setFontSize(10);
  doc.text(`Subtotal: ${fmtBRL(orcamento.subtotal)}`, margem, y);
  doc.text(`Desconto: ${fmtBRL(orcamento.descontoTotal || 0)}`, margem + 50, y);
  doc.text(`Total: ${fmtBRL(orcamento.valorTotal)}`, margem + 95, y);
  doc.text(`Custo médio/ha: ${fmtBRL(orcamento.custoPorHectare)}`, margem + 140, y);
  y += 6;
  doc.text(`Forma pagamento: ${toText(orcamento.formaPagamento)} | Prazo: ${toText(orcamento.prazoPagamento)}`, margem, y);
  y += 5;
  doc.text(`Observações comerciais: ${toText(orcamento.observacoes)}`, margem, y);
  y += 10;
  doc.setFontSize(8.5);
  doc.text(`Validade da proposta até ${formatDateBR(orcamento.validade)}. Sujeita a disponibilidade de estoque e confirmação comercial.`, margem, y);

  doc.save(`orcamento-${sanitizeForFileName(cliente?.nome, "cliente")}-${sanitizeForFileName(orcamento.codigo)}-v${orcamento.versao || 1}.pdf`);
}
