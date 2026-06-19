import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppStore } from "@/store/AppStore";
import { useAuth } from "@/store/AuthStore";
import { canDelete, canEdit, canManage, canView, isAdminRole, normalizeRole } from "@/lib/permissions";
import { saveEntityCloudFirst } from "@/lib/operationalPersistence";
import { aplicarBaixaVendaFaturada, aplicarLiberacaoReserva } from "@/lib/estoqueWorkflow";
import { recordAuditLog } from "@/lib/audit";
import { fmtBRL } from "@/utils/calculations";
import { formatDateBR } from "@/utils/dateUtils";
import { Negocio, NegocioStatus } from "@/types";
import { toast } from "sonner";

const STATUS: NegocioStatus[] = ["Fechado", "Pendente de faturamento", "Faturado", "Entregue", "Cancelado"];
const sameText = (a?: string | null, b?: string | null) => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

export default function NegociosPage() {
  const { negocios, setNegocios, produtos, setProdutos } = useAppStore();
  const { role, accessStatus, user, session, vendedorNome, vendedorId, permissions, accountOwnerUserId } = useAuth();
  const permissionContext = { role, accessStatus, email: user?.email, vendedorNome, vendedorId, permissions };
  const canViewNegocios = canView("negocios", permissionContext);
  const canEditNegocios = canEdit("negocios", permissionContext) || canManage("negocios", permissionContext);
  const canCancelNegocios = canDelete("negocios", permissionContext) || canManage("negocios", permissionContext);
  const persistenceOptions = { session, accessStatus, accountOwnerUserId, actorUserId: user?.id, actorNome: vendedorNome || user?.user_metadata?.nome || user?.email, actorPapel: role };
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [clienteFiltro, setClienteFiltro] = useState("");
  const normalizedRole = normalizeRole(role);
  const isAdmin = isAdminRole(role);

  const canSeeNegocio = (negocio: Negocio) => {
    if (isAdmin) return true;
    const ids = [negocio.vendedorUserId, negocio.responsavelUserId, negocio.createdByUserId].filter(Boolean);
    if (normalizedRole === "vendedor") return ids.includes(user?.id) || sameText(vendedorNome, negocio.vendedorNome || negocio.responsavelNome || negocio.vendedor || negocio.responsavel);
    return ids.includes(user?.id) || sameText(vendedorNome, negocio.vendedorNome || negocio.responsavelNome || negocio.vendedor || negocio.responsavel);
  };

  const filtrados = useMemo(() => negocios.filter(canSeeNegocio).filter((negocio) => statusFiltro === "todos" || negocio.status === statusFiltro).filter((negocio) => !clienteFiltro || (negocio.clienteNome || negocio.clienteId).toLowerCase().includes(clienteFiltro.toLowerCase())), [negocios, statusFiltro, clienteFiltro, user?.id, vendedorNome, normalizedRole]);

  const updateNegocio = async (negocio: Negocio, patch: Partial<Negocio>, auditAction: string) => {
    if (!canEditNegocios || !canSeeNegocio(negocio)) return toast.error("Você não tem permissão para alterar este negócio.");
    const current = new Date().toISOString();
    const next = { ...negocio, ...patch, updatedAt: current, ultimaAtualizacao: current, updatedByUserId: user?.id };
    try {
      await saveEntityCloudFirst("negocios", next, { ...persistenceOptions, auditAction, resource: "negocios", beforeData: negocio, afterData: next, auditMetadata: { orcamentoId: negocio.orcamentoId, oportunidadeId: negocio.oportunidadeId, clienteId: negocio.clienteId, valor: negocio.valorTotal || negocio.valorFechado } });
      setNegocios((prev) => prev.map((item) => item.id === negocio.id ? next : item));
      toast.success("Negócio atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar negócio.");
    }
  };

  const ajustarEstoque = async (negocio: Negocio, modo: "cancelar" | "faturar") => {
    const itens = negocio.itens || [];
    const current = new Date().toISOString();
    const produtosAtualizados = modo === "cancelar" ? aplicarLiberacaoReserva(itens, produtos, current) : aplicarBaixaVendaFaturada(itens, produtos, current);
    for (const produto of produtosAtualizados.filter((produto) => produtos.some((original) => original.id === produto.id && original !== produto))) {
      const before = produtos.find((p) => p.id === produto.id);
      await saveEntityCloudFirst("produtos", produto, { ...persistenceOptions, auditAction: modo === "cancelar" ? "liberar_reserva_negocio" : "baixar_estoque_venda_faturada", resource: "produtos", beforeData: before, afterData: produto, auditMetadata: { negocioId: negocio.id, orcamentoId: negocio.orcamentoId } });
    }
    setProdutos(produtosAtualizados);
  };

  const cancelar = async (negocio: Negocio) => {
    if (!canCancelNegocios) return toast.error("Você não tem permissão para cancelar negócios.");
    try { if (negocio.estoqueReservado && !negocio.estoqueBaixado) await ajustarEstoque(negocio, "cancelar"); } catch (error) { return toast.error(error instanceof Error ? error.message : "Falha ao liberar reserva."); }
    await updateNegocio(negocio, { status: "Cancelado", estoqueReservado: false }, "cancelar_negocio");
    void recordAuditLog({ action: "liberar_reserva_negocio", resource: "negocios", entityId: negocio.id, entityLabel: negocio.codigo, metadata: { orcamentoId: negocio.orcamentoId } });
  };

  const faturar = async (negocio: Negocio) => {
    if (!canEditNegocios) return toast.error("Você não tem permissão para faturar negócios.");
    try { if (negocio.estoqueReservado && !negocio.estoqueBaixado) await ajustarEstoque(negocio, "faturar"); } catch (error) { return toast.error(error instanceof Error ? error.message : "Falha ao baixar estoque."); }
    await updateNegocio(negocio, { status: "Faturado", estoqueReservado: false, estoqueBaixado: true, estoqueBaixadoAt: new Date().toISOString() }, "faturar_negocio");
    void recordAuditLog({ action: "baixar_estoque_venda_faturada", resource: "negocios", entityId: negocio.id, entityLabel: negocio.codigo, metadata: { orcamentoId: negocio.orcamentoId } });
  };

  if (!canViewNegocios) return <Card className="p-4">Você não tem permissão para visualizar negócios.</Card>;

  return <div className="space-y-3">
    <div><h1 className="text-2xl font-semibold">Negócios / Vendas</h1><p className="text-sm text-muted-foreground">Vendas operacionais criadas a partir de orçamentos aprovados.</p></div>
    <Card className="grid gap-3 p-3 md:grid-cols-3"><div><Label>Status</Label><Select value={statusFiltro} onValueChange={setStatusFiltro}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div><div><Label>Cliente</Label><Input value={clienteFiltro} onChange={(e) => setClienteFiltro(e.target.value)} placeholder="Filtrar cliente" /></div></Card>
    {filtrados.map((negocio) => <Card key={negocio.id} className="p-3"><div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center"><div className="text-sm"><div className="font-semibold">{negocio.codigo || negocio.id} · {negocio.clienteNome || negocio.clienteId}</div><div className="text-muted-foreground">Responsável: {negocio.responsavelNome || negocio.vendedorNome || negocio.vendedor || "-"} · Fechamento: {formatDateBR(negocio.dataFechamento || negocio.dataCriacao)} · Prev. faturamento: {formatDateBR(negocio.dataPrevistaFaturamento)}</div><div className="text-muted-foreground">Status: {negocio.status} · Origem: {negocio.origem}{negocio.orcamentoId ? `/${negocio.orcamentoId}` : ""} · Margem: {(negocio.margemPercentual || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</div></div><div className="flex flex-wrap items-center gap-2"><b>{fmtBRL(negocio.valorTotal || negocio.valorFechado || negocio.valorPotencial || 0)}</b><Select value={String(negocio.status)} onValueChange={(value) => void updateNegocio(negocio, { status: value as NegocioStatus }, "editar_negocio")} disabled={!canEditNegocios || !canSeeNegocio(negocio)}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent>{STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select><Button size="sm" onClick={() => void faturar(negocio)} disabled={!canEditNegocios || negocio.status === "Faturado" || negocio.status === "Entregue" || negocio.status === "Cancelado"}>Marcar faturado</Button><Button size="sm" variant="destructive" onClick={() => void cancelar(negocio)} disabled={!canCancelNegocios || negocio.status === "Cancelado" || negocio.status === "Faturado" || negocio.status === "Entregue"}>Cancelar</Button></div></div></Card>)}
    {!filtrados.length && <Card className="p-4 text-sm text-muted-foreground">Nenhum negócio encontrado.</Card>}
  </div>;
}
