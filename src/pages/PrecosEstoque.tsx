import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAppStore } from "@/store/AppStore";
import { fmtBRL, fmtNum } from "@/utils/calculations";
import { Save, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";

function estoqueStatus(disp: number) {
  if (disp <= 0) return { cls: "bg-destructive/15 text-destructive", label: "Sem estoque" };
  if (disp < 20) return { cls: "bg-warning/15 text-warning", label: "Baixo" };
  return { cls: "bg-success/15 text-success", label: "Adequado" };
}

export default function PrecosEstoque() {
  const { produtos, setProdutos } = useAppStore();
  const [edits, setEdits] = useState<Record<string, Partial<{ precoLista: number; precoMinimo: number; precoPromocional: number; validadePreco: string; estoqueAtual: number; estoqueReservado: number }>>>({});

  const upd = (id: string, k: string, v: any) => setEdits(prev => ({ ...prev, [id]: { ...prev[id], [k]: v } }));

  const salvarLinha = (id: string) => {
    const e = edits[id]; if (!e) return;
    setProdutos(prev => prev.map(p => p.id === id ? { ...p, ...e, ultimaAtualizacao: new Date().toISOString().slice(0,10) } : p));
    setEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
    toast.success("Atualizado.");
  };

  const reservar = (id: string, qtd: number) => {
    setProdutos(prev => prev.map(p => p.id === id ? { ...p, estoqueReservado: Math.max(0, p.estoqueReservado + qtd) } : p));
    toast.success(qtd > 0 ? "Estoque reservado." : "Reserva liberada.");
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="precos">
        <TabsList>
          <TabsTrigger value="precos">Lista de preços</TabsTrigger>
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
        </TabsList>

        <TabsContent value="precos">
          <Card className="overflow-x-auto p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Produto</TableHead><TableHead>Fornecedor</TableHead>
                <TableHead>Preço lista</TableHead><TableHead>Preço mínimo</TableHead>
                <TableHead>Promocional</TableHead><TableHead>Validade</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {produtos.map(p => {
                  const e = edits[p.id] || {};
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.nome} <span className="ml-1 text-[10px] text-muted-foreground">{p.codigo}</span></TableCell>
                      <TableCell>{p.fornecedor}</TableCell>
                      <TableCell><Input type="number" className="h-8 w-28" value={e.precoLista ?? p.precoLista} onChange={ev => upd(p.id, "precoLista", +ev.target.value)} /></TableCell>
                      <TableCell><Input type="number" className="h-8 w-28" value={e.precoMinimo ?? p.precoMinimo} onChange={ev => upd(p.id, "precoMinimo", +ev.target.value)} /></TableCell>
                      <TableCell><Input type="number" className="h-8 w-28" value={e.precoPromocional ?? p.precoPromocional ?? 0} onChange={ev => upd(p.id, "precoPromocional", +ev.target.value)} /></TableCell>
                      <TableCell><Input type="date" className="h-8 w-36" value={e.validadePreco ?? p.validadePreco ?? ""} onChange={ev => upd(p.id, "validadePreco", ev.target.value)} /></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" disabled={!edits[p.id]} onClick={() => salvarLinha(p.id)}><Save className="mr-1 h-3 w-3" /> Salvar</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="estoque">
          <Card className="overflow-x-auto p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Produto</TableHead><TableHead>Un.</TableHead>
                <TableHead>Atual</TableHead><TableHead>Reservado</TableHead>
                <TableHead className="text-right">Disponível</TableHead>
                <TableHead>Local</TableHead><TableHead>Atualização</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {produtos.map(p => {
                  const e = edits[p.id] || {};
                  const at = e.estoqueAtual ?? p.estoqueAtual;
                  const re = e.estoqueReservado ?? p.estoqueReservado;
                  const disp = at - re;
                  const st = estoqueStatus(disp);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.nome}</TableCell>
                      <TableCell>{p.unidade}</TableCell>
                      <TableCell><Input type="number" className="h-8 w-24" value={at} onChange={ev => upd(p.id, "estoqueAtual", +ev.target.value)} /></TableCell>
                      <TableCell><Input type="number" className="h-8 w-24" value={re} onChange={ev => upd(p.id, "estoqueReservado", +ev.target.value)} /></TableCell>
                      <TableCell className="text-right font-semibold">{fmtNum(disp)}</TableCell>
                      <TableCell>{p.localEstoque}</TableCell>
                      <TableCell>{p.ultimaAtualizacao}</TableCell>
                      <TableCell><Badge className={st.cls}>{st.label}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => reservar(p.id, 10)} title="Reservar 10"><Lock className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => reservar(p.id, -10)} title="Liberar 10"><Unlock className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="outline" disabled={!edits[p.id]} onClick={() => salvarLinha(p.id)}><Save className="mr-1 h-3 w-3" /> Salvar</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
