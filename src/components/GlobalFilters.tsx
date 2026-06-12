import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROTAS_NOMES } from "@/data/mockData";
import { useAppStore } from "@/store/AppStore";
import { Filter, X } from "lucide-react";

const FRENTES = ["Venda Direta", "Cooperagro", "Tritec", "Nutrição Especial", "Geo Pampa"];
const STATUSES = ["Aberto", "Concluído", "Atrasado", "Cancelado", "Aguardando cliente", "Aguardando parceiro", "Em negociação"];
const ALL = "__all__";
const EMPTY_FILTERS = { dataInicial: "", dataFinal: "", mes: "", abc: "", prioridade: "", rota: "", status: "", frente: "", vendedor: "" };

export function GlobalFilters() {
  const { filters, setFilters, vendedores } = useAppStore();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);

  const activeFiltersCount = useMemo(() => Object.values(filters).filter(Boolean).length, [filters]);

  const upd = (k: keyof typeof filters, v: string) =>
    setDraft(prev => ({ ...prev, [k]: v === ALL ? "" : v }));

  const openModal = () => {
    setDraft(filters);
    setOpen(true);
  };

  const applyFilters = () => {
    setFilters(draft);
    setOpen(false);
  };

  const clearDraft = () => {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
  };

  return (
    <Card className="p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Dashboard</h2>

        <Button
          type="button"
          variant="ghost"
          className="h-auto px-1.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          onClick={openModal}
        >
          <Filter className="mr-1 h-3.5 w-3.5" />
          <span>Filtros{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ""}</span>
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Filter className="h-4 w-4 text-primary" /> Filtros do Dashboard
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[calc(85vh-140px)] overflow-y-auto px-6 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div><Label className="text-xs">Data inicial</Label><Input type="date" value={draft.dataInicial} onChange={e => upd("dataInicial", e.target.value)} /></div>
              <div><Label className="text-xs">Data final</Label><Input type="date" value={draft.dataFinal} onChange={e => upd("dataFinal", e.target.value)} /></div>
              <div><Label className="text-xs">Mês</Label><Input type="month" value={draft.mes} onChange={e => upd("mes", e.target.value)} /></div>
              <div><Label className="text-xs">ABC</Label>
                <Select value={draft.abc || ALL} onValueChange={v => upd("abc", v)}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent><SelectItem value={ALL}>Todos</SelectItem>{["A", "B", "C"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Prioridade</Label>
                <Select value={draft.prioridade || ALL} onValueChange={v => upd("prioridade", v)}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent><SelectItem value={ALL}>Todas</SelectItem>{["P1", "P2", "P3"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Rota</Label>
                <Select value={draft.rota || ALL} onValueChange={v => upd("rota", v)}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent><SelectItem value={ALL}>Todas</SelectItem>{ROTAS_NOMES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Status</Label>
                <Select value={draft.status || ALL} onValueChange={v => upd("status", v)}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent><SelectItem value={ALL}>Todos</SelectItem>{STATUSES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Frente</Label>
                <Select value={draft.frente || ALL} onValueChange={v => upd("frente", v)}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent><SelectItem value={ALL}>Todas</SelectItem>{FRENTES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Vendedor</Label>
                <Select value={draft.vendedor || ALL} onValueChange={v => upd("vendedor", v)}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent><SelectItem value={ALL}>Todos</SelectItem>{vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-row items-center justify-between gap-2 border-t px-6 py-4 sm:justify-between">
            <Button type="button" variant="ghost" onClick={clearDraft}>
              <X className="mr-1 h-3 w-3" /> Limpar filtros
            </Button>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
              <Button type="button" onClick={applyFilters}>Aplicar filtros</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
