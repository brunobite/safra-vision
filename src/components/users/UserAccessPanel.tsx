import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { BRUNO_ADMIN_EMAIL, canManageUsers, permissionActions, permissionResources, resourceLabels, roleTemplate, type PermissionAction, type UserPermission } from "@/lib/permissions";
import { useAuth } from "@/store/AuthStore";
import { recordAuditLog } from "@/lib/audit";

type Papel = "administrador" | "gestor" | "vendedor" | "visualizador";
type StatusPerfil = "pendente" | "ativo" | "inativo" | "bloqueado";

type UserProfileRow = {
  id: string;
  user_id: string | null;
  nome: string | null;
  email: string;
  papel: Papel;
  vendedor_id: string | null;
  vendedor_nome: string | null;
  empresa_id: string | null;
  status: StatusPerfil;
  created_at: string;
  aprovado_em: string | null;
  permissions_customized?: boolean | null;
  superior_user_id: string | null;
  superior_nome: string | null;
  superior_papel: Papel | null;
};

type CreateUserForm = {
  email: string;
  password: string;
  confirmPassword: string;
  nome: string;
  papel: Papel;
  status: StatusPerfil;
  superior_user_id: string;
};

type AdminCreateUserResponse = {
  ok?: boolean;
  profile?: UserProfileRow;
  error?: string;
};

const papeis: Papel[] = ["administrador", "gestor", "vendedor", "visualizador"];
const statuses: StatusPerfil[] = ["pendente", "ativo", "inativo", "bloqueado"];
const initialForm: CreateUserForm = {
  email: "",
  password: "",
  confirmPassword: "",
  nome: "",
  papel: "vendedor",
  status: "ativo",
  superior_user_id: "",
};

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

async function readFunctionErrorMessage(error: unknown): Promise<string> {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      const payload = await context.json().catch(() => null) as { error?: string; message?: string } | null;
      if (payload?.error || payload?.message) return payload.error || payload.message || "Erro ao cadastrar usuário.";
    }
  }
  return error instanceof Error ? error.message : "Erro ao cadastrar usuário.";
}

export function UserAccessPanel() {
  const { role, user, isLocalMode, refreshAccess } = useAuth();
  const [profiles, setProfiles] = useState<UserProfileRow[]>([]);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<CreateUserForm>(initialForm);
  const [expandedProfileId, setExpandedProfileId] = useState<string | null>(null);
  const [permissionDrafts, setPermissionDrafts] = useState<Record<string, UserPermission[]>>({});


  const authContext = { role, accessStatus: "ativo" as const, email: user?.email };
  const canManage = canManageUsers(authContext);

  const loadUsers = useCallback(async () => {
    if (!supabase || !canManage) return;
    setLoading(true);
    try {
      const { data: profilesData, error: profilesError } = await supabase
        .from("user_profiles")
        .select("id,user_id,nome,email,papel,vendedor_id,vendedor_nome,empresa_id,status,created_at,aprovado_em,permissions_customized,superior_user_id,superior_nome,superior_papel")
        .order("created_at", { ascending: false });
      if (profilesError) throw profilesError;
      setProfiles((profilesData ?? []) as UserProfileRow[]);
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


  const loadPermissions = useCallback(async (profile: UserProfileRow) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("user_permissions")
      .select("id,user_profile_id,user_id,resource,can_view,can_create,can_edit,can_delete,can_import,can_export,can_manage")
      .eq("user_profile_id", profile.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    const rows = (data ?? []) as UserPermission[];
    const fallback = roleTemplate(profile.papel);
    setPermissionDrafts((current) => ({ ...current, [profile.id]: permissionResources.map((resource) => rows.find((row) => row.resource === resource) ?? fallback.find((row) => row.resource === resource)!) }));
  }, []);

  const togglePermissions = async (profile: UserProfileRow) => {
    const next = expandedProfileId === profile.id ? null : profile.id;
    setExpandedProfileId(next);
    if (next && !permissionDrafts[profile.id]) await loadPermissions(profile);
  };

  const updatePermissionDraft = (profileId: string, resource: string, action: PermissionAction, checked: boolean) => {
    setPermissionDrafts((current) => ({
      ...current,
      [profileId]: (current[profileId] ?? []).map((permission) => permission.resource === resource ? { ...permission, [action]: checked } : permission),
    }));
  };

  const applyRoleTemplate = (profile: UserProfileRow) => {
    if (profile.email.toLowerCase() === BRUNO_ADMIN_EMAIL) return;
    setPermissionDrafts((current) => ({ ...current, [profile.id]: roleTemplate(profile.papel) }));
  };

  const savePermissions = async (profile: UserProfileRow) => {
    if (!supabase) return;
    if (profile.email.toLowerCase() === BRUNO_ADMIN_EMAIL) {
      toast.error("Bruno mantém acesso total protegido.");
      return;
    }
    const draft = permissionDrafts[profile.id] ?? roleTemplate(profile.papel);
    const payload = draft.map((permission) => ({ ...permission, id: undefined, user_profile_id: profile.id, user_id: profile.user_id }));
    const beforeData = permissionDrafts[profile.id];
    const { error: deleteError } = await supabase.from("user_permissions").delete().eq("user_profile_id", profile.id);
    if (deleteError) { toast.error(deleteError.message); return; }
    const { error: insertError } = await supabase.from("user_permissions").insert(payload);
    if (insertError) { toast.error(insertError.message); return; }
    await supabase.from("user_profiles").update({ permissions_customized: true }).eq("id", profile.id);
    await recordAuditLog({ action: "alterar_permissoes", resource: "usuarios_acessos", entityId: profile.id, entityLabel: profile.email, beforeData, afterData: payload });
    toast.success("Permissões salvas.");
    await loadUsers();
  };

  useEffect(() => {
    setDraftNames(Object.fromEntries(profiles.map((profile) => [profile.id, profile.nome ?? ""])));
  }, [profiles]);

  const activeAdmins = useMemo(() => profiles.filter((profile) => profile.papel === "administrador" && profile.status === "ativo" && profile.user_id), [profiles]);
  const activeManagers = useMemo(() => profiles.filter((profile) => profile.papel === "gestor" && profile.status === "ativo" && profile.user_id), [profiles]);

  const hierarchyOptionsFor = useCallback((papel: Papel, currentUserId?: string | null) => {
    if (papel === "gestor") return activeAdmins.filter((profile) => profile.user_id !== currentUserId);
    if (papel === "vendedor") return activeManagers.filter((profile) => profile.user_id !== currentUserId);
    if (papel === "visualizador") return [...activeAdmins, ...activeManagers].filter((profile) => profile.user_id !== currentUserId);
    return [];
  }, [activeAdmins, activeManagers]);

  const hierarchyLabelFor = (papel: Papel) => papel === "gestor" ? "Administrador responsável" : papel === "vendedor" ? "Gestor responsável" : papel === "visualizador" ? "Superior hierárquico (opcional)" : "Superior hierárquico";

  const resolveSuperior = useCallback((papel: Papel, superiorUserId: string | null | undefined) => {
    if (papel === "administrador") return { superior_user_id: null, superior_nome: null, superior_papel: null };
    if (!superiorUserId) return { superior_user_id: null, superior_nome: null, superior_papel: null };
    const superior = profiles.find((profile) => profile.user_id === superiorUserId);
    return { superior_user_id: superiorUserId, superior_nome: superior?.nome || superior?.email || null, superior_papel: superior?.papel ?? null };
  }, [profiles]);

  const createUser = async () => {
    if (!supabase || !user) return;
    const email = form.email.trim().toLowerCase();
    const nome = form.nome.trim();
    const password = form.password;

    if (!email || !isValidEmail(email)) {
      toast.error("Informe um email válido.");
      return;
    }
    if (!password || password.length < 8) {
      toast.error("Informe uma senha inicial com pelo menos 8 caracteres.");
      return;
    }
    if (password !== form.confirmPassword) {
      toast.error("A confirmação de senha não confere.");
      return;
    }
    if (!nome) {
      toast.error("Informe o nome do usuário.");
      return;
    }
    if (email === BRUNO_ADMIN_EMAIL) {
      toast.error("Bruno é um administrador protegido e não pode ser alterado por este fluxo.");
      return;
    }
    if (form.papel === "gestor" && !form.superior_user_id) {
      toast.error("Selecione o administrador responsável pelo gestor.");
      return;
    }
    if (form.papel === "vendedor" && !form.superior_user_id) {
      toast.error("Selecione o gestor responsável pelo vendedor.");
      return;
    }

    setLoading(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessão Supabase obrigatória para cadastrar usuário.");

      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          email,
          password,
          nome,
          papel: form.papel,
          vendedor_id: null,
          vendedor_nome: form.papel === "vendedor" ? nome : null,
          status: form.status,
          ...resolveSuperior(form.papel, form.superior_user_id),
        },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (error) throw new Error(await readFunctionErrorMessage(error));
      const payload = data as AdminCreateUserResponse | null;
      if (payload?.error) throw new Error(payload.error);
      if (!payload?.ok) throw new Error("Resposta inesperada ao cadastrar usuário.");
      if (payload.profile?.id) {
        const defaultPermissions = roleTemplate(form.papel).map((permission) => ({ ...permission, user_profile_id: payload.profile!.id, user_id: payload.profile!.user_id }));
        await supabase.from("user_permissions").insert(defaultPermissions);
        await recordAuditLog({ action: "criar_usuario", resource: "usuarios_acessos", entityId: payload.profile.id, entityLabel: payload.profile.email, afterData: { profile: payload.profile, permissions: defaultPermissions } });
      }

      setForm(initialForm);
      toast.success("Usuário cadastrado com sucesso.");
      await loadUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao cadastrar usuário.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (profile: UserProfileRow, changes: Partial<UserProfileRow>) => {
    if (!supabase || !user) return;
    setLoading(true);
    try {
      const isBruno = profile.email.toLowerCase() === BRUNO_ADMIN_EMAIL;
      const approving = (changes.status === "ativo" || isBruno) && profile.status !== "ativo";
      const nextPapel = (isBruno ? "administrador" : changes.papel ?? profile.papel) as Papel;
      const hierarchyChanges = "superior_user_id" in changes ? resolveSuperior(nextPapel, changes.superior_user_id) : nextPapel !== profile.papel ? resolveSuperior(nextPapel, null) : {};
      const payload = {
        ...changes,
        ...hierarchyChanges,
        papel: nextPapel,
        status: isBruno ? "ativo" : changes.status,
        vendedor_id: null,
        vendedor_nome: nextPapel === "vendedor" ? (changes.nome ?? profile.nome) : null,
        aprovado_por: approving ? user.id : undefined,
        aprovado_em: approving ? new Date().toISOString() : undefined,
      };
      const cleanPayload = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
      const { error } = await supabase.from("user_profiles").update(cleanPayload).eq("id", profile.id);
      if (error) throw error;
      await recordAuditLog({ action: "editar_usuario", resource: "usuarios_acessos", entityId: profile.id, entityLabel: profile.email, beforeData: profile, afterData: cleanPayload });
      if ("papel" in changes && changes.papel !== profile.papel) await recordAuditLog({ action: "alterar_papel_usuario", resource: "usuarios_acessos", entityId: profile.id, entityLabel: profile.email, beforeData: { papel: profile.papel }, afterData: { papel: cleanPayload.papel } });
      if ("superior_user_id" in changes && cleanPayload.superior_user_id !== profile.superior_user_id) {
        await recordAuditLog({ action: "alterar_superior_hierarquico", resource: "usuarios_acessos", entityId: profile.id, entityLabel: profile.email, beforeData: { superior_user_id: profile.superior_user_id, superior_nome: profile.superior_nome, superior_papel: profile.superior_papel }, afterData: { superior_user_id: cleanPayload.superior_user_id, superior_nome: cleanPayload.superior_nome, superior_papel: cleanPayload.superior_papel } });
        if (nextPapel === "vendedor" || profile.papel === "vendedor") await recordAuditLog({ action: "alterar_equipe_gestor", resource: "usuarios_acessos", entityId: profile.id, entityLabel: profile.email, beforeData: { gestor_user_id: profile.superior_user_id, vendedor_user_id: profile.user_id }, afterData: { gestor_user_id: cleanPayload.superior_user_id, vendedor_user_id: profile.user_id } });
      }
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
            <p className="text-sm text-muted-foreground">Cadastre usuários diretamente, defina papel operacional, status de acesso e escopo comercial (usuário = agente operacional).</p>
          </div>
          <Button variant="outline" onClick={() => void loadUsers()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
        </div>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-8">
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="usuario@empresa.com" autoComplete="off" /></div>
          <div><Label>Senha inicial</Label><Input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder="Mínimo 8 caracteres" autoComplete="new-password" /></div>
          <div><Label>Confirmar senha</Label><Input type="password" value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} placeholder="Repita a senha" autoComplete="new-password" /></div>
          <div><Label>Nome</Label><Input value={form.nome} onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} placeholder="Nome do usuário" /></div>
          <div><Label>Papel</Label><Select value={form.papel} onValueChange={(value) => setForm((current) => ({ ...current, papel: value as Papel, superior_user_id: "" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{papeis.map((papel) => <SelectItem key={papel} value={papel}>{papel}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Status de acesso</Label><Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as StatusPerfil }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{statuses.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>{form.papel === "administrador" ? "Superior hierárquico" : hierarchyLabelFor(form.papel)}</Label>{form.papel === "administrador" ? <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">Topo da hierarquia</div> : <Select value={form.superior_user_id || "__none__"} onValueChange={(value) => setForm((current) => ({ ...current, superior_user_id: value === "__none__" ? "" : value }))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{form.papel === "visualizador" && <SelectItem value="__none__">Sem vínculo</SelectItem>}{hierarchyOptionsFor(form.papel).map((profile) => <SelectItem key={profile.user_id!} value={profile.user_id!}>{profile.nome || profile.email} · {profile.papel}</SelectItem>)}</SelectContent></Select>}</div>
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground xl:col-span-1">Usuários ativos são os agentes comerciais. Para papel vendedor, o nome do usuário será exibido comercialmente.</div>
          <div className="flex items-end md:col-span-3 xl:col-span-8"><Button className="w-full md:w-auto" onClick={() => void createUser()} disabled={loading}><Plus className="mr-2 h-4 w-4" />Cadastrar usuário</Button></div>
        </div>
      </Card>


      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Usuário</TableHead><TableHead>Status</TableHead><TableHead>Papel</TableHead><TableHead>Superior hierárquico</TableHead><TableHead>Agente comercial</TableHead><TableHead>Aprovação</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {profiles.length === 0 ? <TableRow><TableCell colSpan={7} className="text-sm text-muted-foreground">Nenhum usuário cadastrado.</TableCell></TableRow> : profiles.map((profile) => (
              <React.Fragment key={profile.id}>
              <TableRow>
                <TableCell><div className="space-y-1"><Input className="h-8 min-w-52" value={draftNames[profile.id] ?? profile.nome ?? ""} placeholder="Sem nome" onChange={(event) => setDraftNames((current) => ({ ...current, [profile.id]: event.target.value }))} onBlur={(event) => { const nome = event.target.value.trim(); if (nome !== (profile.nome ?? "")) void updateProfile(profile, { nome }); }} /></div><div className="text-xs text-muted-foreground">{profile.email}</div></TableCell>
                <TableCell><Badge variant={profile.status === "ativo" ? "default" : profile.status === "pendente" ? "secondary" : "destructive"}>{profile.status}</Badge></TableCell>
                <TableCell><Select value={profile.papel} disabled={profile.email.toLowerCase() === BRUNO_ADMIN_EMAIL} onValueChange={(value) => { const nextPapel = value as Papel; const options = hierarchyOptionsFor(nextPapel, profile.user_id); if ((nextPapel === "gestor" || nextPapel === "vendedor") && !options[0]?.user_id) { toast.error(nextPapel === "gestor" ? "Cadastre um administrador ativo antes de promover para gestor." : "Cadastre um gestor ativo antes de promover para vendedor."); return; } const applyTemplate = window.confirm("Deseja aplicar o modelo padrão deste papel? Cancelar mantém permissões personalizadas."); void updateProfile(profile, { papel: nextPapel, superior_user_id: nextPapel === "administrador" ? null : options[0]?.user_id ?? null }).then(() => { if (applyTemplate) { setPermissionDrafts((current) => ({ ...current, [profile.id]: roleTemplate(nextPapel) })); void savePermissions({ ...profile, papel: nextPapel }); } }); }}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>{papeis.map((papel) => <SelectItem key={papel} value={papel}>{papel}</SelectItem>)}</SelectContent></Select></TableCell>
                <TableCell>{profile.papel === "administrador" ? <span className="text-sm text-muted-foreground">Topo da hierarquia</span> : <Select value={profile.superior_user_id || "__none__"} onValueChange={(value) => void updateProfile(profile, { superior_user_id: value === "__none__" ? null : value })}><SelectTrigger className="w-56"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{profile.papel === "visualizador" && <SelectItem value="__none__">Sem vínculo</SelectItem>}{hierarchyOptionsFor(profile.papel, profile.user_id).map((superior) => <SelectItem key={superior.user_id!} value={superior.user_id!}>{superior.nome || superior.email} · {superior.papel}</SelectItem>)}</SelectContent></Select>}<div className="mt-1 text-xs text-muted-foreground">{profile.superior_nome || (profile.papel === "administrador" ? "" : "Sem vínculo")}</div></TableCell>
                <TableCell><div className="text-sm">{profile.papel === "vendedor" ? (profile.nome || profile.email) : "—"}</div>{profile.vendedor_id && <div className="text-xs text-muted-foreground">Legado: {profile.vendedor_nome || profile.vendedor_id}</div>}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{profile.aprovado_em ? new Date(profile.aprovado_em).toLocaleString("pt-BR") : "Pendente"}</TableCell>
                <TableCell><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => void togglePermissions(profile)}>Permissões</Button>{statuses.map((status) => <Button key={status} size="sm" variant={status === profile.status ? "default" : "outline"} disabled={loading || (profile.email.toLowerCase() === BRUNO_ADMIN_EMAIL && status !== "ativo")} onClick={() => void updateProfile(profile, { status })}>{status === "ativo" && profile.status !== "ativo" ? "Reativar" : status}</Button>)}</div></TableCell>
              </TableRow>
              {expandedProfileId === profile.id && <TableRow>
                <TableCell colSpan={7}>
                  <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div><strong>Matriz de permissões</strong><p className="text-xs text-muted-foreground">{profile.permissions_customized ? "Permissões personalizadas" : "Modelo do papel"}</p></div>
                      <div className="flex gap-2"><Button size="sm" variant="outline" disabled={profile.email.toLowerCase() === BRUNO_ADMIN_EMAIL} onClick={() => applyRoleTemplate(profile)}>Aplicar modelo do papel</Button><Button size="sm" disabled={profile.email.toLowerCase() === BRUNO_ADMIN_EMAIL} onClick={() => void savePermissions(profile)}>Salvar permissões</Button></div>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead>Módulo</TableHead>{permissionActions.map((action) => <TableHead key={action} className="text-center">{action.replace("can_", "")}</TableHead>)}</TableRow></TableHeader>
                        <TableBody>{(permissionDrafts[profile.id] ?? roleTemplate(profile.papel)).map((permission) => <TableRow key={permission.resource}><TableCell>{resourceLabels[permission.resource]}</TableCell>{permissionActions.map((action) => <TableCell key={action} className="text-center"><input type="checkbox" checked={Boolean(permission[action])} disabled={profile.email.toLowerCase() === BRUNO_ADMIN_EMAIL} onChange={(event) => updatePermissionDraft(profile.id, permission.resource, action, event.target.checked)} /></TableCell>)}</TableRow>)}</TableBody>
                      </Table>
                    </div>
                  </div>
                </TableCell>
              </TableRow>}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
