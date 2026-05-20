import { Cliente, Empresa, Orcamento } from "@/types";
import { fmtBRL } from "@/utils/calculations";

export function gerarPdfOrcamento(orcamento: Orcamento, cliente?: Cliente, empresa?: Empresa) {
  const html = `<!doctype html><html><head><meta charset='utf-8'><title>${orcamento.codigo}</title></head><body>
  <h1>ORÇAMENTO COMERCIAL</h1>
  <p><b>Código:</b> ${orcamento.codigo} | <b>Data:</b> ${orcamento.data} | <b>Validade:</b> ${orcamento.validade || "-"}</p>
  <h3>Empresa</h3><p>${empresa?.razaoSocial || "-"}<br/>${empresa?.endereco || "-"}</p>
  <h3>Cliente</h3><p>${cliente?.nome || "-"}<br/>${cliente?.endereco || "-"}</p>
  <table border='1' cellspacing='0' cellpadding='4'><thead><tr><th>Item</th><th>Produto</th><th>Linha/Categoria</th><th>Dose por hectare</th><th>Área aplicada</th><th>Quantidade total</th><th>Preço unitário</th><th>Valor total</th><th>Custo por hectare</th></tr></thead><tbody>
  ${orcamento.itens.map((it, idx) => `<tr><td>${idx + 1}</td><td>${it.produtoNome}</td><td>${it.categoria}</td><td>${it.dosePorHa} ${it.unidadeDose}</td><td>${it.areaHa} ha</td><td>${it.observacoes?.replace("Resumo: ", "") || it.quantidadeTotal}</td><td>${fmtBRL(it.precoUnitario)}/${it.unidadeProduto}</td><td>${fmtBRL(it.valorTotalItem)}</td><td>${fmtBRL(it.custoPorHaItem)}/ha</td></tr>`).join("")}
  </tbody></table>
  <h3>Condições comerciais</h3><p>Prazo de pagamento: ${orcamento.prazoPagamento || "-"}<br/>Forma de pagamento: ${orcamento.formaPagamento || "-"}<br/>Tipo de cobrança: ${orcamento.tipoCobranca || "-"}<br/>Observações: ${orcamento.observacoes || empresa?.observacoesComerciaisPadrao || "-"}</p>
  <p><b>Valor total:</b> ${fmtBRL(orcamento.valorTotal)}<br/><b>Custo médio por hectare:</b> ${fmtBRL(orcamento.custoPorHectare)}/ha</p>
  <p>Aceite: _________________________________________</p><p>Assinatura do cliente: _____________________</p><p>Assinatura do consultor: _____________________</p>
  <script>window.print();</script>
  </body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
