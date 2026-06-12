import { AlertTriangle, CheckCircle2, ShieldCheck, UserRound } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppStore } from "@/store/AppStore";
import { useAuth } from "@/store/AuthStore";
import { canCreate, canDelete, canEdit, canManageUsers, canView } from "@/lib/permissions";

const permissionChecks = [
  { label: "Clientes", route: "/clientes", entity: "clientes" as const },
  { label: "Agenda", route: "/agenda", entity: "agenda" as const },
  { label: "Lançamentos", route: "/lancamentos", entity: "lancamentos" as const },
  { label: "Oportunidades/negócios", route: "/funil", entity: "funil" as const },
  { label: "Orçamentos", route: "/orcamentos", entity: "orcamentos" as const },
  { label: "Relatórios", route: "/relatorios", entity: "relatorios" as const },
];

const statusBadgeVariant = (status: string) => {
  if (status === "ativo" || status === "active") return "default";
  if (status === "pendente" || status === "pending") return "secondary";
  return "destructive";
};

export default function MeuAcesso() {
  const { user, nome, role, accessStatus, vendedorId, vendedorNome, empresaId } = useAuth();
  const { vendedores, empresas } = useAppStore();

  const vendedor = vendedores.find((item) => item.id === vendedorId);
  const vendedorLabel = vendedor?.nome || vendedorNome || "Sem vínculo";
  const empresa = empresas.find((item) => item.id === empresaId);
  const empresaLabel = empresa?.nomeFantasia || empresa?.razaoSocial || empresaId || "Conta principal";
  const isPending = accessStatus === "pendente" || accessStatus === "pending";
  const isBlocked = ["inativo", "inactive", "bloqueado", "blocked"].includes(accessStatus);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold"><UserRound className="h-5 w-5" /> Meu acesso</h2>
        <p className="text-sm text-muted-foreground">Consulte seu papel, vínculo operacional e permissões principais no Safra Vision.</p>
      </div>

      {isPending && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Seu acesso está aguardando liberação pelo administrador da conta.</AlertDescription>
        </Alert>
      )}
      {isBlocked && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Seu acesso está inativo ou bloqueado. Contate o administrador.</AlertDescription>
        </Alert>
      )}
      {role === "vendedor" && !vendedorId && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Vendedor sem vínculo operacional.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Identificação</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><span className="text-muted-foreground">Nome</span><div className="font-medium">{nome || user?.user_metadata?.nome || "Não informado"}</div></div>
            <div><span className="text-muted-foreground">Email</span><div className="font-medium">{user?.email || "Não autenticado"}</div></div>
            <div className="flex flex-wrap gap-2"><Badge>{role}</Badge><Badge variant={statusBadgeVariant(accessStatus)}>{accessStatus}</Badge></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Vínculos</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><span className="text-muted-foreground">Empresa/conta vinculada</span><div className="font-medium">{empresaLabel}</div></div>
            <div><span className="text-muted-foreground">Vendedor vinculado</span><div className="font-medium">{vendedorLabel}{vendedor && !vendedor.ativo ? " (vendedor inativo)" : ""}</div></div>
            <p className="text-xs text-muted-foreground">Cascata preparada: Conta/Empresa → Administrador → Gestores → Vendedores → Usuários vinculados.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" /> Permissões principais</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {permissionChecks.map((permission) => (
            <div key={permission.label} className="rounded-md border p-3 text-sm">
              <div className="mb-2 flex items-center justify-between gap-2"><span className="font-medium">{permission.label}</span>{canView(permission.route, role) && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}</div>
              <div className="flex flex-wrap gap-1">
                <Badge variant={canView(permission.route, role) ? "default" : "outline"}>ver</Badge>
                <Badge variant={canCreate(permission.entity, role) ? "default" : "outline"}>criar</Badge>
                <Badge variant={canEdit(permission.entity, role) ? "default" : "outline"}>editar</Badge>
                <Badge variant={canDelete(permission.entity, role) ? "default" : "outline"}>excluir</Badge>
              </div>
            </div>
          ))}
          <div className="rounded-md border p-3 text-sm">
            <div className="mb-2 font-medium">Usuários e acessos</div>
            <Badge variant={canManageUsers(role) ? "default" : "outline"}>{canManageUsers(role) ? "administra" : "sem gestão crítica"}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
