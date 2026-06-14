import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { canView } from "@/lib/permissions";
import { useAuth } from "@/store/AuthStore";

type AuditLogRow = {
  id: string;
  actor_email: string | null;
  actor_nome: string | null;
  actor_papel: string | null;
  action: string;
  resource: string;
  entity_id: string | null;
  entity_label: string | null;
  before_data: unknown;
  after_data: unknown;
  metadata: Record<string, unknown> | null;
  user_agent: string | null;
  created_at: string;
};

const ALL = "__all";

export function AuditLogPanel() {
  const { role, accessStatus, user, permissions } = useAuth();
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AuditLogRow | null>(null);
  const [filters, setFilters] = useState({ start: "", end: "", user: "", role: ALL, resource: ALL, action: "", text: "" });
  const allowed = canView("auditoria_operacional", { role, accessStatus, email: user?.email, permissions });

  const loadLogs = useCallback(async () => {
    if (!supabase || !allowed) return;
    setLoading(true);
    try {
      let query = supabase.from("audit_logs").select("id,actor_email,actor_nome,actor_papel,action,resource,entity_id,entity_label,before_data,after_data,metadata,user_agent,created_at").order("created_at", { ascending: false }).limit(200);
      if (filters.start) query = query.gte("created_at", `${filters.start}T00:00:00.000Z`);
      if (filters.end) query = query.lte("created_at", `${filters.end}T23:59:59.999Z`);
      if (filters.user) query = query.ilike("actor_email", `%${filters.user}%`);
      if (filters.role !== ALL) query = query.eq("actor_papel", filters.role);
      if (filters.resource !== ALL) query = query.eq("resource", filters.resource);
      if (filters.action) query = query.ilike("action", `%${filters.action}%`);
      const { data, error } = await query;
      if (error) throw error;
      setLogs((data ?? []) as AuditLogRow[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar auditoria.");
    } finally {
      setLoading(false);
    }
  }, [allowed, filters]);

  useEffect(() => { void loadLogs(); }, [loadLogs]);

  const filteredLogs = useMemo(() => {
    const needle = filters.text.trim().toLowerCase();
    if (!needle) return logs;
    return logs.filter((log) => JSON.stringify(log).toLowerCase().includes(needle));
  }, [logs, filters.text]);

  if (!allowed) return <Card className="p-4 text-sm text-muted-foreground">Auditoria operacional restrita a usuários autorizados.</Card>;

  return <div className="space-y-4">
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Auditoria operacional</h3><p className="text-sm text-muted-foreground">Rastreie alterações críticas, permissões, cadastros, exportações e sincronização.</p></div><Button variant="outline" onClick={() => void loadLogs()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button></div>
      <div className="grid gap-3 md:grid-cols-4">
        <div><Label>Início</Label><Input type="date" value={filters.start} onChange={(e) => setFilters((f) => ({ ...f, start: e.target.value }))} /></div>
        <div><Label>Fim</Label><Input type="date" value={filters.end} onChange={(e) => setFilters((f) => ({ ...f, end: e.target.value }))} /></div>
        <div><Label>Usuário</Label><Input value={filters.user} onChange={(e) => setFilters((f) => ({ ...f, user: e.target.value }))} placeholder="email" /></div>
        <div><Label>Papel</Label><Select value={filters.role} onValueChange={(v) => setFilters((f) => ({ ...f, role: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos</SelectItem><SelectItem value="administrador">administrador</SelectItem><SelectItem value="gestor">gestor</SelectItem><SelectItem value="vendedor">vendedor</SelectItem><SelectItem value="visualizador">visualizador</SelectItem></SelectContent></Select></div>
        <div><Label>Módulo</Label><Select value={filters.resource} onValueChange={(v) => setFilters((f) => ({ ...f, resource: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos</SelectItem>{Array.from(new Set(logs.map((log) => log.resource))).map((resource) => <SelectItem key={resource} value={resource}>{resource}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Ação</Label><Input value={filters.action} onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))} /></div>
        <div className="md:col-span-2"><Label>Texto livre</Label><div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" value={filters.text} onChange={(e) => setFilters((f) => ({ ...f, text: e.target.value }))} placeholder="entidade, metadata, antes/depois" /></div></div>
      </div>
    </Card>
    <Card className="overflow-x-auto p-0"><Table><TableHeader><TableRow><TableHead>Data/hora</TableHead><TableHead>Usuário</TableHead><TableHead>Papel</TableHead><TableHead>Ação</TableHead><TableHead>Módulo</TableHead><TableHead>Entidade</TableHead><TableHead>Resumo</TableHead></TableRow></TableHeader><TableBody>{filteredLogs.length === 0 ? <TableRow><TableCell colSpan={7} className="text-sm text-muted-foreground">Nenhum log encontrado.</TableCell></TableRow> : filteredLogs.map((log) => <TableRow key={log.id} className="cursor-pointer" onClick={() => setSelected(log)}><TableCell>{new Date(log.created_at).toLocaleString("pt-BR")}</TableCell><TableCell>{log.actor_nome || log.actor_email || "—"}</TableCell><TableCell>{log.actor_papel || "—"}</TableCell><TableCell>{log.action}</TableCell><TableCell>{log.resource}</TableCell><TableCell>{log.entity_label || log.entity_id || "—"}</TableCell><TableCell className="max-w-xs truncate">{JSON.stringify(log.metadata ?? log.after_data ?? {}).slice(0, 140)}</TableCell></TableRow>)}</TableBody></Table></Card>
    {selected && <Card className="space-y-3 p-4"><div className="flex justify-between gap-2"><h4 className="font-semibold">Detalhe da auditoria</h4><Button size="sm" variant="outline" onClick={() => setSelected(null)}>Fechar</Button></div><div className="grid gap-3 md:grid-cols-2"><pre className="max-h-80 overflow-auto rounded bg-muted p-3 text-xs">Antes\n{JSON.stringify(selected.before_data, null, 2)}</pre><pre className="max-h-80 overflow-auto rounded bg-muted p-3 text-xs">Depois\n{JSON.stringify(selected.after_data, null, 2)}</pre></div><pre className="max-h-60 overflow-auto rounded bg-muted p-3 text-xs">Metadata/User agent\n{JSON.stringify({ metadata: selected.metadata, user_agent: selected.user_agent }, null, 2)}</pre></Card>}
  </div>;
}
