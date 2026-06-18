import type { Cliente, Orcamento, ProximaAcao } from "@/types";
import { fmtBRL } from "@/utils/calculations";
import { formatDateBR } from "@/utils/dateUtils";

export type CanalProposta = "WhatsApp" | "E-mail";

const cleanPhone = (phone?: string) => (phone || "").replace(/\D/g, "");

export function montarMensagemProposta(orcamento: Orcamento, cliente?: Cliente, vendedorNome?: string) {
  return [
    `Olá, ${cliente?.nome || "cliente"}.`,
    `Segue proposta ${orcamento.codigo} no valor de ${fmtBRL(orcamento.valorTotal)}.`,
    `Validade: ${formatDateBR(orcamento.validade) || "a confirmar"}.`,
    `Condição: ${orcamento.formaPagamento || "a confirmar"} / ${orcamento.prazoPagamento || "a confirmar"}.`,
    "A proposta foi gerada em PDF para conferência/anexo.",
    "Qualquer dúvida fico à disposição.",
    vendedorNome || orcamento.responsavelNome || orcamento.vendedorNome || orcamento.responsavel || orcamento.vendedor || "",
  ].filter(Boolean).join("\n");
}

export function montarAssuntoProposta(orcamento: Orcamento) {
  return `Proposta ${orcamento.codigo}`;
}

export function montarWhatsAppUrl(cliente: Cliente | undefined, mensagem: string) {
  const phone = cleanPhone(cliente?.telefone);
  const text = encodeURIComponent(mensagem);
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}

export function montarMailtoUrl(cliente: Cliente | undefined, assunto: string, mensagem: string) {
  return `mailto:${encodeURIComponent(cliente?.email || "")}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(mensagem)}`;
}

export function getDataFollowUpProposta(orcamento: Pick<Orcamento, "validade">, now = new Date()) {
  if (orcamento.validade) return orcamento.validade;
  return new Date(now.getTime() + 3 * 86400000).toISOString().slice(0, 10);
}

export function hasFollowUpPendenteParaOrcamento(proximasAcoes: ProximaAcao[], orcamentoId: string) {
  return proximasAcoes.some((acao) => acao.orcamentoId === orcamentoId && acao.status === "Pendente" && acao.origem === "Orçamento");
}
