export type AccessStatus = "pendente" | "ativo" | "inativo" | "bloqueado" | "pending" | "active" | "inactive" | "blocked";
export type UserRole = "administrador" | "gestor" | "vendedor" | "visualizador" | "admin" | "operacional" | "consulta" | "user";

export const BRUNO_ADMIN_EMAIL = "bitencourttec@gmail.com";

export const permissionResources = [
  "dashboard", "clientes", "agenda", "proximas_acoes", "lancamentos", "funil", "orcamentos", "produtos", "metas", "rotas", "prioridades", "eventos", "relatorios", "configuracoes", "usuarios_acessos", "sincronizacao", "google_calendar", "importacoes", "empresas", "vendedores", "auditoria_operacional", "excecao_preco_minimo",
] as const;

export const permissionActions = ["can_view", "can_create", "can_edit", "can_delete", "can_import", "can_export", "can_manage"] as const;

export type PermissionResource = (typeof permissionResources)[number];
export type PermissionAction = (typeof permissionActions)[number];
export type PermissionEntity = PermissionResource | "usuarios";

export type UserPermission = {
  id?: string;
  user_profile_id?: string | null;
  user_id?: string | null;
  resource: PermissionResource;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_import: boolean;
  can_export: boolean;
  can_manage: boolean;
};

export type PermissionContext = {
  role?: UserRole | string | null;
  accessStatus?: AccessStatus | string | null;
  email?: string | null;
  vendedorId?: string | null;
  vendedorNome?: string | null;
  permissions?: UserPermission[] | null;
};

const ADMIN_ROLES = new Set<UserRole>(["administrador", "admin"]);
const READ_ONLY_ROLES = new Set<UserRole>(["visualizador", "consulta"]);

export const resourceLabels: Record<PermissionResource, string> = {
  dashboard: "Dashboard", clientes: "Clientes", agenda: "Agenda", proximas_acoes: "Próximas ações", lancamentos: "Lançamentos", funil: "Funil", orcamentos: "Orçamentos", produtos: "Produtos", metas: "Metas", rotas: "Rotas", prioridades: "Prioridades", eventos: "Eventos", relatorios: "Relatórios", configuracoes: "Configurações", usuarios_acessos: "Usuários e acessos", sincronizacao: "Sincronização", google_calendar: "Google Calendar", importacoes: "Importações", empresas: "Empresas", vendedores: "Vendedores", auditoria_operacional: "Auditoria operacional", excecao_preco_minimo: "Exceção preço mínimo",
};

export const routeResourceMap: Record<string, PermissionResource> = {
  "/": "dashboard", "/clientes": "clientes", "/agenda": "agenda", "/proximas-acoes": "proximas_acoes", "/lancamentos": "lancamentos", "/funil": "funil", "/orcamentos": "orcamentos", "/produtos": "produtos", "/metas": "metas", "/rotas": "rotas", "/prioridades": "prioridades", "/eventos": "eventos", "/relatorios": "relatorios", "/configuracoes": "configuracoes", "/meu-acesso": "dashboard",
};

const emptyPermission = (resource: PermissionResource): UserPermission => ({ resource, can_view: false, can_create: false, can_edit: false, can_delete: false, can_import: false, can_export: false, can_manage: false });
const fullPermission = (resource: PermissionResource): UserPermission => ({ resource, can_view: true, can_create: true, can_edit: true, can_delete: true, can_import: true, can_export: true, can_manage: true });
const readPermission = (resource: PermissionResource): UserPermission => ({ ...emptyPermission(resource), can_view: true, can_export: resource === "relatorios" });

export const normalizeRole = (role: UserRole | string | null | undefined): UserRole => {
  if (role === "admin") return "administrador";
  if (role === "consulta") return "visualizador";
  if (role === "operacional" || role === "user") return "vendedor";
  if (role === "gestor" || role === "vendedor" || role === "visualizador" || role === "administrador") return role;
  return "visualizador";
};

export const normalizeAccessStatus = (status: AccessStatus | string | null | undefined): AccessStatus => {
  if (status === "active") return "ativo";
  if (status === "pending") return "pendente";
  if (status === "inactive") return "inativo";
  if (status === "blocked") return "bloqueado";
  if (status === "ativo" || status === "pendente" || status === "inativo" || status === "bloqueado") return status;
  return "pendente";
};

export const isProtectedBruno = (email?: string | null) => (email ?? "").trim().toLowerCase() === BRUNO_ADMIN_EMAIL;
export const isAdminRole = (role: UserRole | string | null | undefined) => ADMIN_ROLES.has(role as UserRole) || normalizeRole(role) === "administrador";
export const isReadOnlyRole = (role: UserRole | string | null | undefined) => READ_ONLY_ROLES.has(role as UserRole) || normalizeRole(role) === "visualizador";

export function roleTemplate(role: UserRole | string | null | undefined): UserPermission[] {
  const normalized = normalizeRole(role);
  if (normalized === "administrador") return permissionResources.map(fullPermission);
  if (normalized === "visualizador") return permissionResources.map(readPermission);
  const allowed = new Set<PermissionResource>(normalized === "gestor"
    ? ["dashboard", "clientes", "agenda", "funil", "orcamentos", "metas", "relatorios"]
    : ["dashboard", "clientes", "agenda", "proximas_acoes", "lancamentos", "funil", "orcamentos", "relatorios"]);
  return permissionResources.map((resource) => {
    if (!allowed.has(resource)) return emptyPermission(resource);
    return { ...readPermission(resource), can_create: resource !== "relatorios" && resource !== "dashboard", can_edit: resource !== "relatorios" && resource !== "dashboard", can_delete: normalized === "gestor" && !["dashboard", "relatorios"].includes(resource), can_export: resource === "relatorios", can_manage: false };
  });
}

export const normalizeResource = (resourceOrRoute: string): PermissionResource => {
  const route = `/${resourceOrRoute.replace(/^\//, "").split("/")[0]}`;
  if (routeResourceMap[resourceOrRoute]) return routeResourceMap[resourceOrRoute];
  if (routeResourceMap[route]) return routeResourceMap[route];
  if (resourceOrRoute === "usuarios") return "usuarios_acessos";
  return permissionResources.includes(resourceOrRoute as PermissionResource) ? resourceOrRoute as PermissionResource : "dashboard";
};

function resolvePermission(resource: string, contextOrRole?: PermissionContext | UserRole | string | null): UserPermission {
  const ctx: PermissionContext = typeof contextOrRole === "object" && contextOrRole !== null ? contextOrRole : { role: contextOrRole };
  const normalizedResource = normalizeResource(resource);
  if (isProtectedBruno(ctx.email)) return fullPermission(normalizedResource);
  if (normalizeAccessStatus(ctx.accessStatus ?? "ativo") !== "ativo") return emptyPermission(normalizedResource);
  const specific = ctx.permissions?.find((permission) => permission.resource === normalizedResource);
  if (specific) return specific;
  return roleTemplate(ctx.role).find((permission) => permission.resource === normalizedResource) ?? emptyPermission(normalizedResource);
}

export const canView = (resource: string, contextOrRole?: PermissionContext | UserRole | string | null) => resolvePermission(resource, contextOrRole).can_view;
export const canCreate = (resource: PermissionEntity | string, contextOrRole?: PermissionContext | UserRole | string | null) => resolvePermission(resource, contextOrRole).can_create;
export const canEdit = (resource: PermissionEntity | string, contextOrRole?: PermissionContext | UserRole | string | null) => resolvePermission(resource, contextOrRole).can_edit;
export const canDelete = (resource: PermissionEntity | string, contextOrRole?: PermissionContext | UserRole | string | null) => resolvePermission(resource, contextOrRole).can_delete;
export const canImport = (resource: PermissionEntity | string, contextOrRole?: PermissionContext | UserRole | string | null) => resolvePermission(resource, contextOrRole).can_import;
export const canExport = (resource: PermissionEntity | string, contextOrRole?: PermissionContext | UserRole | string | null) => resolvePermission(resource, contextOrRole).can_export;
export const canManage = (resource: PermissionEntity | string, contextOrRole?: PermissionContext | UserRole | string | null) => resolvePermission(resource, contextOrRole).can_manage;
export const canManageUsers = (contextOrRole?: PermissionContext | UserRole | string | null) => canManage("usuarios_acessos", contextOrRole) || canEdit("usuarios_acessos", contextOrRole);
export const canSaveBelowMinimumPrice = (contextOrRole?: PermissionContext | UserRole | string | null) => canManage("excecao_preco_minimo", contextOrRole);

export function isOwnSellerData(vendedorVinculado: string | null | undefined, candidate: string | null | undefined): boolean {
  if (!vendedorVinculado) return true;
  return (candidate ?? "").trim().toLowerCase() === vendedorVinculado.trim().toLowerCase();
}

export function isOwnSellerDataById(vendedorIdVinculado: string | null | undefined, vendedorNomeVinculado: string | null | undefined, candidateVendedorId: string | null | undefined, candidateVendedorNome: string | null | undefined): boolean {
  if (vendedorIdVinculado) {
    if (candidateVendedorId) return candidateVendedorId === vendedorIdVinculado;
    return isOwnSellerData(vendedorNomeVinculado, candidateVendedorNome);
  }
  return isOwnSellerData(vendedorNomeVinculado, candidateVendedorNome);
}
