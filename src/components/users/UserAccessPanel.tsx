import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { canManageUsers } from "@/lib/permissions";
import { useAuth } from "@/store/AuthStore";
import { useAppStore } from "@/store/AppStore";

type Papel = "administrador" | "gestor" | "vendedor" | "visualizador";
type StatusPerfil = "pendente" | "ativo" | "inativo" | "bloqueado";
type StatusConvite = "convite_enviado" | "pendente" | "aceito" | "expirado" | "cancelado";

type UserProfileRow = {
  id: string;
  user_id: string | null;
  nome: string | null;
  email: string;
  papel: Papel;
  vendedor_nome: string | null;
  status: StatusPerfil;
  created_at: string;
  aprovado_em: string | null;
};

type UserInviteRow = {
  id: string;
  email: string;
  nome: string | null;
  papel: Papel;
  vendedor_nome: string | null;
  status: StatusConvite;
  expires_at: string | null;
  created_at: string;
};

const papeis: Papel[] = ["administrador", "gestor", "vendedor", "visualizador"];
const statuses: StatusPerfil[] = ["pendente", "ativo", "inativo", "bloqueado"];

export function UserAccessPanel() {
  const { role, user, isLocalMode, refreshAccess } = useAuth();
  const { vendedores } = useAppStore();
  const [profiles, setProfiles] = useState<UserProfileRow[]>([]);
  const [invites, setInvites] = useState<UserInviteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", nome: "", papel: "vendedor" as Papel, vendedor_nome: "" });

  const canManage = canManageUsers(role);
  const vendedoresAtivos = useMemo(() => vendedores.filter((vendedor) => vendedor.ativo), [vendedores]);

  const loadUsers = useCallback(async () => {
    if (!supabase || !canManage) return;
    setLoading(true);
    try {
      const [{ data: profilesData, error: profilesError }, { data: invitesData, error: invitesError }] = await Promise.all([
        supabase.from("user_profiles").select("id,user_id,nome,email,papel,vendedor_nome,status,created_at,aprovado_em").order("created_at", { ascending: false }),
        supabase.from("user_invites").select("id,email,nome,papel,vendedor_nome,status,expires_at,created_at").order("created_at", { ascending: false }),
      ]);
      if (profilesError) throw profilesError;
      if (invitesError) throw invitesError;
      setProfiles((profilesData ?? []) as UserProfileRow[]);
      setInvites((invitesData ?? []) as UserInviteRow[]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao carregar usuários.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const createInvite = async () => {
    if (!supabase || !user) return;
    const email = form.email.trim().toLowerCase();
    if (!email) {
      toast.error("Informe o email do usuário.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        email,
        nome: form.nome.trim() || null,
        papel: form.papel,
        vendedor_nome: form.papel === "vendedor" ? form.vendedor_nome || null : null,
        status: "convite_enviado" as StatusConvite,
        criado_por: user.id,
        expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
      };
      const { error: inviteError } = await supabase.from("user_invites").insert(payload);
      if (inviteError) throw inviteError;

      const { error: upsertError } = await supabase.from("user_profiles").upsert({
        email,
        nome: payload.nome,
        papel: payload.papel,
        vendedor_nome: payload.vendedor_nome,
        status: "pendente" as StatusPerfil,
        criado_por: user.id,
      }, { onConflict: "email" });
      if (upsertError) throw upsertError;

      setForm({ email: "", nome: "", papel: "vendedor", vendedor_nome: "" });
      toast.success("Convite cadastrado e usuário marcado como pendente.");
      await loadUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao cadastrar convite.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (profile: UserProfileRow, changes: Partial<UserProfileRow>) => {
    if (!supabase || !user) return;
    setLoading(true);
    try {
      const approving = changes.status === "ativo" && profile.status !== "ativo";
      const payload = {
        ...changes,
        vendedor_nome: changes.papel && changes.papel !== "vendedor" ? null : changes.vendedor_nome,
        aprovado_por: approving ? user.id : undefined,
        aprovado_em: approving ? new Date().toISOString() : undefined,
      };
      const { error } = await supabase.from("user_profiles").update(payload).eq("id", profile.id);
      if (error) throw error;
      toast.success("Perfil atualizado.");
      await loadUsers();
      if (profile.user_id === user.id) await refreshAccess();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao atualizar perfil.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (!canManage) {
    return <Card className="p-4 text-sm text-muted-foreground">A seção Usuários e acessos é restrita a administradores.</Card>;
  }

  if (isLocalMode) {
    return <Card className="p-4 text-sm text-muted-foreground">Modo local ativo. Configure Supabase para gerenciar usuários persistidos em nuvem.</Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" /> Usuários e acessos</h3>
            <p className="text-sm text-muted-foreground">Cadastre convites, aprove pendências, defina papel operacional e vincule vendedores.</p>
          </div>
          <Button variant="outline" onClick={() => void loadUsers()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="usuario@empresa.com" /></div>
          <div><Label>Nome</Label><Input value={form.nome} onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} placeholder="Nome do usuário" /></div>
          <div><Label>Papel</Label><Select value={form.papel} onValueChange={(value) => setForm((current) => ({ ...current, papel: value as Papel }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{papeis.map((papel) => <SelectItem key={papel} value={papel}>{papel}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Vendedor vinculado</Label><Select value={form.vendedor_nome || "__none"} onValueChange={(value) => setForm((current) => ({ ...current, vendedor_nome: value === "__none" ? "" : value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">Sem vínculo</SelectItem>{vendedoresAtivos.map((vendedor) => <SelectItem key={vendedor.id} value={vendedor.nome}>{vendedor.nome}</SelectItem>)}</SelectContent></Select></div>
          <div className="flex items-end"><Button className="w-full" onClick={() => void createInvite()} disabled={loading}><Plus className="mr-2 h-4 w-4" />Cadastrar/Convidar</Button></div>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Usuário</TableHead><TableHead>Status</TableHead><TableHead>Papel</TableHead><TableHead>Vendedor</TableHead><TableHead>Aprovação</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {profiles.length === 0 ? <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">Nenhum usuário cadastrado.</TableCell></TableRow> : profiles.map((profile) => (
              <TableRow key={profile.id}>
                <TableCell><div className="font-medium">{profile.nome || "Sem nome"}</div><div className="text-xs text-muted-foreground">{profile.email}</div></TableCell>
                <TableCell><Badge variant={profile.status === "ativo" ? "default" : profile.status === "pendente" ? "secondary" : "destructive"}>{profile.status}</Badge></TableCell>
                <TableCell><Select value={profile.papel} onValueChange={(value) => void updateProfile(profile, { papel: value as Papel })}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>{papeis.map((papel) => <SelectItem key={papel} value={papel}>{papel}</SelectItem>)}</SelectContent></Select></TableCell>
                <TableCell><Select value={profile.vendedor_nome || "__none"} onValueChange={(value) => void updateProfile(profile, { vendedor_nome: value === "__none" ? null : value })}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">Sem vínculo</SelectItem>{vendedoresAtivos.map((vendedor) => <SelectItem key={vendedor.id} value={vendedor.nome}>{vendedor.nome}</SelectItem>)}</SelectContent></Select></TableCell>
                <TableCell className="text-xs text-muted-foreground">{profile.aprovado_em ? new Date(profile.aprovado_em).toLocaleString("pt-BR") : "Pendente"}</TableCell>
                <TableCell><div className="flex flex-wrap gap-2">{statuses.map((status) => <Button key={status} size="sm" variant={status === profile.status ? "default" : "outline"} disabled={loading || (profile.email.toLowerCase() === "bitencourttec@gmail.com" && status !== "ativo")} onClick={() => void updateProfile(profile, { status })}>{status === "ativo" && profile.status !== "ativo" ? "Aprovar" : status}</Button>)}</div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-4 space-y-2">
        <h4 className="text-sm font-semibold">Convites/liberações</h4>
        <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Nome</TableHead><TableHead>Papel</TableHead><TableHead>Vendedor</TableHead><TableHead>Status</TableHead><TableHead>Expira em</TableHead></TableRow></TableHeader><TableBody>{invites.length === 0 ? <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">Nenhum convite registrado.</TableCell></TableRow> : invites.map((invite) => <TableRow key={invite.id}><TableCell>{invite.email}</TableCell><TableCell>{invite.nome || "—"}</TableCell><TableCell>{invite.papel}</TableCell><TableCell>{invite.vendedor_nome || "—"}</TableCell><TableCell>{invite.status}</TableCell><TableCell>{invite.expires_at ? new Date(invite.expires_at).toLocaleDateString("pt-BR") : "—"}</TableCell></TableRow>)}</TableBody></Table></div>
      </Card>
    </div>
  );
}
