export type AccessStatus = "pendente" | "ativo" | "inativo" | "bloqueado" | "pending" | "active" | "inactive" | "blocked";
export type UserRole = "administrador" | "gestor" | "vendedor" | "visualizador" | "admin" | "operacional" | "consulta" | "user";

export type PermissionEntity =
  | "clientes"
  | "agenda"
  | "produtos"
  | "metas"
  | "funil"
  | "relatorios"
  | "configuracoes"
  | "importacoes"
  | "usuarios"
  | "orcamentos"
  | "lancamentos";

const ADMIN_ROLES = new Set<UserRole>(["administrador", "admin"]);
const READ_ONLY_ROLES = new Set<UserRole>(["visualizador", "consulta"]);

const routePermissions: Record<string, UserRole[]> = {
  "/": ["administrador", "admin", "gestor", "vendedor", "visualizador", "consulta", "operacional", "user"],
  "/clientes": ["administrador", "admin", "gestor", "vendedor", "visualizador", "consulta", "operacional", "user"],
  "/agenda": ["administrador", "admin", "gestor", "vendedor", "visualizador", "consulta", "operacional", "user"],
  "/proximas-acoes": ["administrador", "admin", "gestor", "vendedor", "visualizador", "consulta", "operacional", "user"],
  "/lancamentos": ["administrador", "admin", "gestor", "vendedor", "visualizador", "consulta", "operacional", "user"],
  "/funil": ["administrador", "admin", "gestor", "vendedor", "visualizador", "consulta"],
  "/orcamentos": ["administrador", "admin", "gestor", "vendedor", "visualizador", "consulta"],
  "/produtos": ["administrador", "admin", "visualizador", "consulta"],
  "/metas": ["administrador", "admin", "gestor", "visualizador", "consulta"],
  "/rotas": ["administrador", "admin", "gestor", "vendedor", "visualizador", "consulta"],
  "/prioridades": ["administrador", "admin", "gestor", "vendedor", "visualizador", "consulta"],
  "/eventos": ["administrador", "admin", "gestor", "vendedor", "visualizador", "consulta"],
  "/relatorios": ["administrador", "admin", "gestor", "vendedor", "visualizador", "consulta"],
  "/configuracoes": ["administrador", "admin"],
  "/meu-acesso": ["administrador", "admin", "gestor", "vendedor", "visualizador", "consulta", "operacional", "user"],
};

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

export const isAdminRole = (role: UserRole | string | null | undefined) => ADMIN_ROLES.has(role as UserRole) || normalizeRole(role) === "administrador";
export const isReadOnlyRole = (role: UserRole | string | null | undefined) => READ_ONLY_ROLES.has(role as UserRole) || normalizeRole(role) === "visualizador";

export function canView(route: string, role: UserRole | string | null | undefined): boolean {
  const normalized = normalizeRole(role);
  const allowed = routePermissions[route] ?? routePermissions[`/${route.replace(/^\//, "").split("/")[0]}`];
  return !allowed || allowed.includes(normalized) || (normalized === "administrador" && !route.includes("login"));
}

export function canCreate(entity: PermissionEntity, role: UserRole | string | null | undefined): boolean {
  const normalized = normalizeRole(role);
  if (normalized === "visualizador") return false;
  if (normalized === "administrador") return true;
  if (entity === "usuarios" || entity === "configuracoes" || entity === "importacoes" || entity === "produtos") return false;
  if (normalized === "gestor") return ["clientes", "agenda", "metas", "funil", "relatorios", "orcamentos", "lancamentos"].includes(entity);
  return ["clientes", "agenda", "funil", "orcamentos", "lancamentos"].includes(entity);
}

export function canEdit(entity: PermissionEntity, role: UserRole | string | null | undefined): boolean {
  return canCreate(entity, role);
}

export function canDelete(entity: PermissionEntity, role: UserRole | string | null | undefined): boolean {
  const normalized = normalizeRole(role);
  if (normalized === "administrador") return true;
  if (normalized === "visualizador" || normalized === "vendedor") return false;
  return !["usuarios", "configuracoes", "importacoes", "produtos"].includes(entity);
}

export function canImport(entity: PermissionEntity, role: UserRole | string | null | undefined): boolean {
  return normalizeRole(role) === "administrador" && entity !== "usuarios";
}

export function canManageUsers(role: UserRole | string | null | undefined): boolean {
  return normalizeRole(role) === "administrador";
}

export function isOwnSellerData(vendedorVinculado: string | null | undefined, candidate: string | null | undefined): boolean {
  if (!vendedorVinculado) return true;
  return (candidate ?? "").trim().toLowerCase() === vendedorVinculado.trim().toLowerCase();
}

export function isOwnSellerDataById(
  vendedorIdVinculado: string | null | undefined,
  vendedorNomeVinculado: string | null | undefined,
  candidateVendedorId: string | null | undefined,
  candidateVendedorNome: string | null | undefined,
): boolean {
  if (vendedorIdVinculado) {
    if (candidateVendedorId) return candidateVendedorId === vendedorIdVinculado;
    return isOwnSellerData(vendedorNomeVinculado, candidateVendedorNome);
  }
  return isOwnSellerData(vendedorNomeVinculado, candidateVendedorNome);
}
