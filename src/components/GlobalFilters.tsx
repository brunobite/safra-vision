import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppStore } from "@/store/AppStore";
import { ROTAS_NOMES } from "@/data/mockData";
import { Filter, X } from "lucide-react";

const FRENTES = ["Venda Direta", "Cooperagro", "Tritec", "Nutrição Especial", "Geo Pampa"];
const STATUSES = ["Aberto", "Concluído", "Atrasado", "Cancelado", "Aguardando cliente", "Aguardando parceiro", "Em negociação"];
const ALL = "__all__";

export function GlobalFilters() {
  const { filters, setFilters, vendedores } = useAppStore();
  const upd = (k: keyof typeof filters, v: string) =>
    setFilters(prev => ({ ...prev, [k]: v === ALL ? "" : v }));

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Filter className="h-4 w-4 text-primary" /> Filtros
        </div>
        <Button variant="ghost" size="sm" onClick={() => setFilters({ dataInicial: "", dataFinal: "", mes: "", abc: "", prioridade: "", rota: "", status: "", frente: "", vendedor: "" })}>
          <X className="mr-1 h-3 w-3" /> Limpar
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        <div><Label className="text-xs">Data inicial</Label><Input type="date" value={filters.dataInicial} onChange={e => upd("dataInicial", e.target.value)} /></div>
        <div><Label className="text-xs">Data final</Label><Input type="date" value={filters.dataFinal} onChange={e => upd("dataFinal", e.target.value)} /></div>
        <div><Label className="text-xs">Mês</Label><Input type="month" value={filters.mes} onChange={e => upd("mes", e.target.value)} /></div>
        <div><Label className="text-xs">ABC</Label>
          <Select value={filters.abc || ALL} onValueChange={v => upd("abc", v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>Todos</SelectItem>{["A","B","C"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Prioridade</Label>
          <Select value={filters.prioridade || ALL} onValueChange={v => upd("prioridade", v)}>
            <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>Todas</SelectItem>{["P1","P2","P3"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Rota</Label>
          <Select value={filters.rota || ALL} onValueChange={v => upd("rota", v)}>
            <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>Todas</SelectItem>{ROTAS_NOMES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Status</Label>
          <Select value={filters.status || ALL} onValueChange={v => upd("status", v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>Todos</SelectItem>{STATUSES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Frente</Label>
          <Select value={filters.frente || ALL} onValueChange={v => upd("frente", v)}>
            <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>Todas</SelectItem>{FRENTES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Vendedor</Label>
          <Select value={filters.vendedor || ALL} onValueChange={v => upd("vendedor", v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>Todos</SelectItem>{vendedores.map(v => <SelectItem key={v.id} value={v.nome}>{v.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
    </Card>
  );
}