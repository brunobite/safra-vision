import { Cliente, Negocio, Orcamento, TicketMedioRegra } from "@/types";

export function calcularValorMedioHaSegmentosAtivos(ticketsMedios: TicketMedioRegra[]): number {
  return ticketsMedios.filter((t) => t.ativo).reduce((s, t) => s + (t.valorMedioHa || 0), 0);
}

export function calcularPotencialCliente(cliente: Cliente, ticketsMedios: TicketMedioRegra[]): number {
  const valorMedioHa = calcularValorMedioHaSegmentosAtivos(ticketsMedios);
  return (cliente.areaHa || 0) * valorMedioHa;
}

export function calcularPotencialCarteira(clientes: Cliente[], ticketsMedios: TicketMedioRegra[]): number {
  return clientes.reduce((s, c) => s + calcularPotencialCliente(c, ticketsMedios), 0);
}

export function calcularMetaCarteira(clientes: Cliente[], ticketsMedios: TicketMedioRegra[], percentualAcertoEsperado: number): number {
  const taxa = Math.min(100, Math.max(0, percentualAcertoEsperado || 0));
  return calcularPotencialCarteira(clientes, ticketsMedios) * taxa / 100;
}

export function calcularRealizadoCarteira(negocios: Negocio[], orcamentos: Orcamento[]): number {
  const fechados = negocios.filter((n) => n.status === "Fechado ganho");
  const negocioIdsFechados = new Set(fechados.map((n) => n.id));
  const realizadoNegocios = fechados.reduce((s, n) => s + (n.valorFechado || 0), 0);
  const realizadoOrcamentos = orcamentos
    .filter((o) => o.status === "Aprovado")
    .filter((o) => !o.negocioId || !negocioIdsFechados.has(o.negocioId))
    .reduce((s, o) => s + (o.valorTotal || 0), 0);
  return realizadoNegocios + realizadoOrcamentos;
}

