import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GlobalFilters } from "@/components/GlobalFilters";
import { useAppStore } from "@/store/AppStore";
import { fmtBRL, fmtNum, fmtPct } from "@/utils/calculations";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </Card>
  );
}

export default function Relatorios() {
  const { filtered, clientes, clienteById, produtos, regras, metasEmpresa } = useAppStore();
  const lancs = filtered.lancamentos;
  const negs = filtered.negocios;

  const negPorVendedor = useMemo(() => {
    const m: Record<string, { qtd: number; potencial: number; fechado: number }> = {};
    negs.forEach(n => {
      m[n.vendedor] ||= { qtd: 0, potencial: 0, fechado: 0 };
      m[n.vendedor].qtd++; m[n.vendedor].potencial += n.valorPotencial;
      if (n.status === "Fechado ganho") m[n.vendedor].fechado += n.valorFechado || 0;
    });
    return m;
  }, [negs]);

  const negPorCategoria = useMemo(() => {
    const m: Record<string, { qtd: number; potencial: number; fechado: number }> = {};
    negs.forEach(n => {
      m[n.categoria] ||= { qtd: 0, potencial: 0, fechado: 0 };
      m[n.categoria].qtd++; m[n.categoria].potencial += n.valorPotencial;
      if (n.status === "Fechado ganho") m[n.categoria].fechado += n.valorFechado || 0;
    });
    return m;
  }, [negs]);

  const propostas = useMemo(() => {
    const total = negs.length || 1;
    const ganhas = negs.filter(n => n.status === "Fechado ganho").length;
    const perdidas = negs.filter(n => n.status === "Fechado perdido").length;
    const enviadas = lancs.filter(l => l.tipo === "Proposta").length;
    return { enviadas, ganhas, perdidas, conversao: ganhas / total };
  }, [negs, lancs]);

  const aproveitamento = useMemo(() => {
    const pot = clientes.reduce((s, c) => s + c.potencialTotal, 0) || 1;
    const real = negs.filter(n => n.status === "Fechado ganho").reduce((s, n) => s + (n.valorFechado || 0), 0);
    return real / pot;
  }, [clientes, negs]);

  const visitasPorVendedor = useMemo(() => {
    const m: Record<string, { qtd: number; comOpp: number }> = {};
    lancs.filter(l => l.tipo === "Visita").forEach(l => {
      const v = l.vendedor || "—";
      m[v] ||= { qtd: 0, comOpp: 0 };
      m[v].qtd++; if (l.geraOportunidade) m[v].comOpp++;
    });
    return m;
  }, [lancs]);

  const clientesAVisitados = useMemo(() => new Set(lancs.filter(l => l.tipo === "Visita" && clienteById(l.clienteId)?.abc === "A").map(l => l.clienteId)).size, [lancs, clienteById]);
  const clientesP1Visitados = useMemo(() => new Set(lancs.filter(l => l.tipo === "Visita" && clienteById(l.clienteId)?.prioridade === "P1").map(l => l.clienteId)).size, [lancs, clienteById]);
  const clientesSemVisita = useMemo(() => {
    const vis = new Set(lancs.filter(l => l.tipo === "Visita").map(l => l.clienteId));
    return clientes.filter(c => !vis.has(c.id));
  }, [lancs, clientes]);

  const produtosMaisNegociados = useMemo(() => {
    const m: Record<string, number> = {};
    negs.forEach(n => n.produtos.forEach(pid => { m[pid] = (m[pid] || 0) + 1; }));
    return Object.entries(m).sort((a,b) => b[1] - a[1]).slice(0,10);
  }, [negs]);

  const estoqueBaixo = produtos.filter(p => (p.estoqueAtual - p.estoqueReservado) > 0 && (p.estoqueAtual - p.estoqueReservado) < 20);
  const semEstoque = produtos.filter(p => (p.estoqueAtual - p.estoqueReservado) <= 0);

  const metaTotal = metasEmpresa.reduce((s,m) => s + m.metaTotal, 0);
  const realizado = negs.filter(n => n.status === "Fechado ganho").reduce((s,n) => s + (n.valorFechado || 0), 0);
  const pctMeta = metaTotal ? realizado / metaTotal : 0;

  return (
    <div className="space-y-4">
      <GlobalFilters />

      <Tabs defaultValue="comercial">
        <TabsList>
          <TabsTrigger value="comercial">Comerciais</TabsTrigger>
          <TabsTrigger value="visitas">Visitas</TabsTrigger>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="comissao">Comissão</TabsTrigger>
        </TabsList>

        <TabsContent value="comercial" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Negócios por vendedor">
              <Table><TableHeader><TableRow><TableHead>Vendedor</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead className="text-right">Potencial</TableHead><TableHead className="text-right">Fechado</TableHead></TableRow></TableHeader>
                <TableBody>{Object.entries(negPorVendedor).map(([v,r]) => <TableRow key={v}><TableCell>{v}</TableCell><TableCell className="text-right">{r.qtd}</TableCell><TableCell className="text-right">{fmtBRL(r.potencial)}</TableCell><TableCell className="text-right">{fmtBRL(r.fechado)}</TableCell></TableRow>)}</TableBody>
              </Table>
            </Section>
            <Section title="Negócios por categoria de produto">
              <Table><TableHeader><TableRow><TableHead>Categoria</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead className="text-right">Potencial</TableHead><TableHead className="text-right">Fechado</TableHead></TableRow></TableHeader>
                <TableBody>{Object.entries(negPorCategoria).map(([c,r]) => <TableRow key={c}><TableCell>{c}</TableCell><TableCell className="text-right">{r.qtd}</TableCell><TableCell className="text-right">{fmtBRL(r.potencial)}</TableCell><TableCell className="text-right">{fmtBRL(r.fechado)}</TableCell></TableRow>)}</TableBody>
              </Table>
            </Section>
            <Section title="Propostas">
              <div className="grid grid-cols-4 gap-2 text-sm">
                <div><p className="text-muted-foreground">Enviadas</p><p className="text-xl font-semibold">{propostas.enviadas}</p></div>
                <div><p className="text-muted-foreground">Ganhas</p><p className="text-xl font-semibold text-success">{propostas.ganhas}</p></div>
                <div><p className="text-muted-foreground">Perdidas</p><p className="text-xl font-semibold text-destructive">{propostas.perdidas}</p></div>
                <div><p className="text-muted-foreground">Taxa conversão</p><p className="text-xl font-semibold">{fmtPct(propostas.conversao)}</p></div>
              </div>
            </Section>
            <Section title="Aproveitamento do potencial">
              <p className="text-3xl font-bold">{fmtPct(aproveitamento)}</p>
              <p className="text-xs text-muted-foreground mt-1">Realizado / Potencial total da carteira</p>
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="visitas" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Visitas por vendedor">
              <Table><TableHeader><TableRow><TableHead>Vendedor</TableHead><TableHead className="text-right">Visitas</TableHead><TableHead className="text-right">Geraram oport.</TableHead></TableRow></TableHeader>
                <TableBody>{Object.entries(visitasPorVendedor).map(([v,r]) => <TableRow key={v}><TableCell>{v}</TableCell><TableCell className="text-right">{r.qtd}</TableCell><TableCell className="text-right">{r.comOpp}</TableCell></TableRow>)}</TableBody>
              </Table>
            </Section>
            <Section title="Cobertura ABC/P1">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><p className="text-muted-foreground">Clientes A visitados</p><p className="text-xl font-semibold">{clientesAVisitados}</p></div>
                <div><p className="text-muted-foreground">Clientes P1 visitados</p><p className="text-xl font-semibold">{clientesP1Visitados}</p></div>
              </div>
            </Section>
            <Section title="Clientes sem visita no período">
              <Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>ABC</TableHead><TableHead>Prio.</TableHead><TableHead>Vendedor</TableHead></TableRow></TableHeader>
                <TableBody>{clientesSemVisita.slice(0,15).map(c => <TableRow key={c.id}><TableCell>{c.nome}</TableCell><TableCell>{c.abc}</TableCell><TableCell>{c.prioridade}</TableCell><TableCell>{c.vendedor||"—"}</TableCell></TableRow>)}</TableBody>
              </Table>
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="produtos" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Produtos mais negociados">
              <Table><TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="text-right">Vezes</TableHead></TableRow></TableHeader>
                <TableBody>{produtosMaisNegociados.map(([pid,c]) => { const p = produtos.find(x => x.id === pid); return <TableRow key={pid}><TableCell>{p?.nome || pid}</TableCell><TableCell className="text-right">{c}</TableCell></TableRow>; })}</TableBody>
              </Table>
            </Section>
            <Section title="Estoque baixo / sem estoque">
              <Table><TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="text-right">Disponível</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {[...semEstoque, ...estoqueBaixo].map(p => { const d = p.estoqueAtual - p.estoqueReservado; return (
                    <TableRow key={p.id}><TableCell>{p.nome}</TableCell><TableCell className="text-right">{fmtNum(d)}</TableCell><TableCell><Badge className={d<=0?"bg-destructive/15 text-destructive":"bg-warning/15 text-warning"}>{d<=0?"Sem estoque":"Baixo"}</Badge></TableCell></TableRow>
                  ); })}
                </TableBody>
              </Table>
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="comissao" className="space-y-4">
          <Section title="Relatório de comissão">
            <Table><TableHeader><TableRow><TableHead>Regra</TableHead><TableHead>Tipo</TableHead><TableHead>Aplicar sobre</TableHead><TableHead className="text-right">Base</TableHead><TableHead className="text-right">% Atingido</TableHead><TableHead className="text-right">Comissão estimada</TableHead></TableRow></TableHeader>
              <TableBody>
                {regras.filter(r => r.ativo).map(r => {
                  let base = 0; let comissao = 0;
                  if (r.aplicarSobre === "negocio_fechado" || r.aplicarSobre === "realizado_empresa") base = realizado;
                  else if (r.aplicarSobre === "meta_empresa") base = metaTotal;
                  else if (r.aplicarSobre === "categoria") base = negs.filter(n => n.categoria === r.alvo && n.status === "Fechado ganho").reduce((s,n) => s + (n.valorFechado || 0), 0);
                  if (r.tipo === "fixa") comissao = base * ((r.percentual || 0)/100);
                  else if (r.faixas) { const f = r.faixas.find(f => pctMeta*100 >= f.min && pctMeta*100 <= f.max); if (f) comissao = base * (f.percentual/100); }
                  return <TableRow key={r.id}><TableCell>{r.nome}</TableCell><TableCell>{r.tipo}</TableCell><TableCell>{r.aplicarSobre}</TableCell><TableCell className="text-right">{fmtBRL(base)}</TableCell><TableCell className="text-right">{fmtPct(pctMeta)}</TableCell><TableCell className="text-right font-semibold text-success">{fmtBRL(comissao)}</TableCell></TableRow>;
                })}
              </TableBody>
            </Table>
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
