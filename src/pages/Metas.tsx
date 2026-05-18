import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppStore } from "@/store/AppStore";
import { fmtBRL, fmtPct, statusCor } from "@/utils/calculations";
import { MetaEmpresa, MetaPessoal, FrenteComercial } from "@/types";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

const FRENTES: FrenteComercial[] = ["Venda Direta", "Cooperagro", "Tritec", "Nutrição Especial", "Geo Pampa"];

function StatusBadge({ pct }: { pct: number }) {
  const c = statusCor(pct);
  const cls = c === "success" ? "bg-success/15 text-success border-success/30"
    : c === "warning" ? "bg-warning/15 text-warning border-warning/30"
    : "bg-destructive/15 text-destructive border-destructive/30";
  return <Badge variant="outline" className={cls}>{c === "success" ? "No alvo" : c === "warning" ? "Próximo" : "Atenção"}</Badge>;
}

export default function Metas() {
  const { metasEmpresa, setMetasEmpresa, metasPessoais, setMetasPessoais, lancamentos } = useAppStore();

  const realizadoPorMes = useMemo(() => {
    const m: Record<string, number> = {};
    lancamentos.forEach(l => {
      if (l.tipo === "Venda" || l.status === "Concluído") {
        const mes = l.data.slice(0, 7);
        m[mes] = (m[mes] || 0) + (l.vendaRs || 0);
      }
    });
    return m;
  }, [lancamentos]);

  const realizadoPorFrente = useMemo(() => {
    const m: Record<string, number> = {};
    lancamentos.forEach(l => { m[l.frente] = (m[l.frente] || 0) + (l.vendaRs || 0); });
    return m;
  }, [lancamentos]);

  // Empresa dialog
  const [empOpen, setEmpOpen] = useState(false);
  const [empEdit, setEmpEdit] = useState<MetaEmpresa | null>(null);
  const [empForm, setEmpForm] = useState<Omit<MetaEmpresa, "id">>({ mes: "", metaTotal: 0, vendaDireta: 0, cooperagro: 0, tritec: 0, observacao: "" });

  const openEmp = (m?: MetaEmpresa) => {
    if (m) { setEmpEdit(m); setEmpForm({ ...m }); }
    else { setEmpEdit(null); setEmpForm({ mes: "", metaTotal: 0, vendaDireta: 0, cooperagro: 0, tritec: 0, observacao: "" }); }
    setEmpOpen(true);
  };
  const saveEmp = () => {
    if (!empForm.mes) return toast.error("Informe o mês.");
    if (empEdit) setMetasEmpresa(prev => prev.map(x => x.id === empEdit.id ? { ...empForm, id: empEdit.id } : x));
    else setMetasEmpresa(prev => [...prev, { ...empForm, id: `me-${Date.now()}` }]);
    setEmpOpen(false); toast.success("Meta salva.");
  };

  // Pessoal dialog
  const [pesOpen, setPesOpen] = useState(false);
  const [pesEdit, setPesEdit] = useState<MetaPessoal | null>(null);
  const [pesForm, setPesForm] = useState<Omit<MetaPessoal, "id">>({ frente: "Venda Direta", comissaoAlvo: 0, participacao: 0, percComissao: 0, metaFaturamento: 0, observacao: "" });

  const openPes = (m?: MetaPessoal) => {
    if (m) { setPesEdit(m); setPesForm({ ...m }); }
    else { setPesEdit(null); setPesForm({ frente: "Venda Direta", comissaoAlvo: 0, participacao: 0, percComissao: 0, metaFaturamento: 0, observacao: "" }); }
    setPesOpen(true);
  };
  const savePes = () => {
    if (pesEdit) setMetasPessoais(prev => prev.map(x => x.id === pesEdit.id ? { ...pesForm, id: pesEdit.id } : x));
    else setMetasPessoais(prev => [...prev, { ...pesForm, id: `mp-${Date.now()}` }]);
    setPesOpen(false); toast.success("Meta salva.");
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="empresa">
        <TabsList>
          <TabsTrigger value="empresa">Metas da empresa</TabsTrigger>
          <TabsTrigger value="pessoal">Metas pessoais</TabsTrigger>
        </TabsList>

        <TabsContent value="empresa" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openEmp()}><Plus className="mr-1 h-4 w-4" /> Nova meta mensal</Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {[...metasEmpresa].sort((a, b) => a.mes.localeCompare(b.mes)).map(m => {
              const real = realizadoPorMes[m.mes] || 0;
              const pct = m.metaTotal ? real / m.metaTotal : 0;
              return (
                <Card key={m.id} className="p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Mês</p>
                      <p className="text-lg font-semibold">{m.mes}</p>
                    </div>
                    <div className="flex gap-1">
                      <StatusBadge pct={pct} />
                      <Button size="icon" variant="ghost" onClick={() => openEmp(m)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setMetasEmpresa(prev => prev.filter(x => x.id !== m.id))}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Meta</span><span className="font-medium">{fmtBRL(m.metaTotal)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Realizado</span><span className="font-medium">{fmtBRL(real)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Gap</span><span className={real - m.metaTotal >= 0 ? "font-medium text-success" : "font-medium text-destructive"}>{fmtBRL(real - m.metaTotal)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">%</span><span className="font-semibold">{fmtPct(pct)}</span></div>
                    <Progress value={Math.min(pct * 100, 100)} className="mt-2" />
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="pessoal" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openPes()}><Plus className="mr-1 h-4 w-4" /> Nova meta por frente</Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {metasPessoais.map(m => {
              const real = realizadoPorFrente[m.frente] || 0;
              const pct = m.metaFaturamento ? real / m.metaFaturamento : 0;
              const comReal = real * (m.percComissao / 100);
              return (
                <Card key={m.id} className="p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Frente</p>
                      <p className="text-lg font-semibold">{m.frente}</p>
                    </div>
                    <div className="flex gap-1">
                      <StatusBadge pct={pct} />
                      <Button size="icon" variant="ghost" onClick={() => openPes(m)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setMetasPessoais(prev => prev.filter(x => x.id !== m.id))}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Meta faturamento</span><span>{fmtBRL(m.metaFaturamento)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Realizado</span><span>{fmtBRL(real)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Comissão alvo</span><span>{fmtBRL(m.comissaoAlvo)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Comissão estimada</span><span>{fmtBRL(comReal)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Gap</span><span className={real - m.metaFaturamento >= 0 ? "text-success" : "text-destructive"}>{fmtBRL(real - m.metaFaturamento)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">%</span><span className="font-semibold">{fmtPct(pct)}</span></div>
                    <Progress value={Math.min(pct * 100, 100)} className="mt-2" />
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={empOpen} onOpenChange={setEmpOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{empEdit ? "Editar meta" : "Nova meta mensal"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Mês (YYYY-MM)</Label><Input type="month" value={empForm.mes} onChange={e => setEmpForm({ ...empForm, mes: e.target.value })} /></div>
            <div><Label>Meta total</Label><Input type="number" value={empForm.metaTotal} onChange={e => setEmpForm({ ...empForm, metaTotal: +e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>Venda Direta</Label><Input type="number" value={empForm.vendaDireta} onChange={e => setEmpForm({ ...empForm, vendaDireta: +e.target.value })} /></div>
              <div><Label>Cooperagro</Label><Input type="number" value={empForm.cooperagro} onChange={e => setEmpForm({ ...empForm, cooperagro: +e.target.value })} /></div>
              <div><Label>Tritec</Label><Input type="number" value={empForm.tritec} onChange={e => setEmpForm({ ...empForm, tritec: +e.target.value })} /></div>
            </div>
            <div><Label>Observação</Label><Input value={empForm.observacao || ""} onChange={e => setEmpForm({ ...empForm, observacao: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={saveEmp}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pesOpen} onOpenChange={setPesOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{pesEdit ? "Editar meta" : "Nova meta por frente"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Frente</Label>
              <Select value={pesForm.frente} onValueChange={(v: FrenteComercial) => setPesForm({ ...pesForm, frente: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FRENTES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Meta faturamento</Label><Input type="number" value={pesForm.metaFaturamento} onChange={e => setPesForm({ ...pesForm, metaFaturamento: +e.target.value })} /></div>
              <div><Label>Comissão alvo</Label><Input type="number" value={pesForm.comissaoAlvo} onChange={e => setPesForm({ ...pesForm, comissaoAlvo: +e.target.value })} /></div>
              <div><Label>Participação (%)</Label><Input type="number" value={pesForm.participacao} onChange={e => setPesForm({ ...pesForm, participacao: +e.target.value })} /></div>
              <div><Label>% Comissão</Label><Input type="number" value={pesForm.percComissao} onChange={e => setPesForm({ ...pesForm, percComissao: +e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={savePes}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}