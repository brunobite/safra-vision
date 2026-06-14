import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { normalizeAccessStatus, normalizeRole, type AccessStatus, type UserPermission, type UserRole } from "@/lib/permissions";

type AccessProfile = {
  accessStatus: AccessStatus;
  role: UserRole;
  vendedorNome: string | null;
  vendedorId: string | null;
  empresaId: string | null;
  nome: string | null;
  profileId: string | null;
  permissions: UserPermission[];
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  accessStatus: AccessStatus;
  role: UserRole;
  vendedorNome: string | null;
  vendedorId: string | null;
  empresaId: string | null;
  nome: string | null;
  profileId: string | null;
  permissions: UserPermission[];
  isLocalMode: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccess: () => Promise<AccessProfile>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const AUTH_TIMEOUT_MS = 8000;
const BRUNO_ADMIN_EMAIL = "bitencourttec@gmail.com";

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(resolve).catch(reject).finally(() => window.clearTimeout(timeoutId));
  });
}

const adminEmails = new Set(
  [BRUNO_ADMIN_EMAIL, ...(import.meta.env.VITE_ADMIN_EMAILS ?? "").split(",")]
    .map((email: string) => email.trim().toLowerCase())
    .filter(Boolean),
);

const localAdminProfile: AccessProfile = {
  accessStatus: "ativo",
  role: "administrador",
  vendedorNome: null,
  vendedorId: null,
  empresaId: null,
  nome: "Administrador local",
  profileId: "local",
  permissions: [],
};

export function AuthStoreProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>(isSupabaseConfigured ? "pendente" : "ativo");
  const [role, setRole] = useState<UserRole>(isSupabaseConfigured ? "visualizador" : "administrador");
  const [vendedorNome, setVendedorNome] = useState<string | null>(null);
  const [vendedorId, setVendedorId] = useState<string | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [nome, setNome] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<UserPermission[]>([]);

  const isLocalMode = !isSupabaseConfigured;

  const applyProfile = useCallback((profile: AccessProfile) => {
    setAccessStatus(profile.accessStatus);
    setRole(profile.role);
    setVendedorNome(profile.vendedorNome);
    setVendedorId(profile.vendedorId);
    setEmpresaId(profile.empresaId);
    setNome(profile.nome);
    setProfileId(profile.profileId);
    setPermissions(profile.permissions);
  }, []);

  const refreshProfile = useCallback(async (currentUser: User | null): Promise<AccessProfile> => {
    if (!supabase || !currentUser) {
      const fallbackProfile = supabase ? { accessStatus: "pendente", role: "visualizador", vendedorNome: null, vendedorId: null, empresaId: null, nome: null, profileId: null, permissions: [] } satisfies AccessProfile : localAdminProfile;
      applyProfile(fallbackProfile);
      return fallbackProfile;
    }

    const email = currentUser.email?.trim().toLowerCase() ?? "";

    try {
      const { error: ensureError } = await withTimeout(
        Promise.resolve(supabase.rpc("ensure_current_user_profile")),
        AUTH_TIMEOUT_MS,
        "Tempo excedido ao preparar perfil de acesso.",
      );
      if (ensureError) console.warn("Não foi possível executar fallback de perfil:", ensureError.message);

      const { data, error: profileError } = await withTimeout(
        Promise.resolve(
          supabase
            .from("user_profiles")
            .select("id, status, papel, vendedor_id, vendedor_nome, empresa_id, nome, email")
            .eq("user_id", currentUser.id)
            .maybeSingle(),
        ),
        AUTH_TIMEOUT_MS,
        "Tempo excedido ao buscar perfil Supabase.",
      );

      if (profileError) {
        setError(profileError.message);
        const fallbackProfile: AccessProfile = adminEmails.has(email)
          ? { accessStatus: "ativo", role: "administrador", vendedorNome: null, vendedorId: null, empresaId: null, nome: currentUser.user_metadata?.nome ?? null, profileId: null, permissions: [] }
          : { accessStatus: "pendente", role: "visualizador", vendedorNome: null, vendedorId: null, empresaId: null, nome: null, profileId: null, permissions: [] };
        applyProfile(fallbackProfile);
        return fallbackProfile;
      }

      const { data: permissionsData, error: permissionsError } = data?.id
        ? await withTimeout(
            Promise.resolve(supabase.from("user_permissions").select("id,user_profile_id,user_id,resource,can_view,can_create,can_edit,can_delete,can_import,can_export,can_manage").eq("user_profile_id", data.id)),
            AUTH_TIMEOUT_MS,
            "Tempo excedido ao buscar permissões do usuário.",
          )
        : { data: [], error: null };
      if (permissionsError) console.warn("Não foi possível carregar permissões granulares:", permissionsError.message);

      const brunoFallback = adminEmails.has(email);
      const nextProfile: AccessProfile = data
        ? {
            accessStatus: normalizeAccessStatus(data.status),
            role: normalizeRole(data.papel),
            vendedorNome: data.nome ?? data.vendedor_nome ?? null,
            vendedorId: data.user_id ?? data.vendedor_id ?? null,
            empresaId: data.empresa_id ?? null,
            nome: data.nome ?? null,
            profileId: data.id ?? null,
            permissions: (permissionsData ?? []) as UserPermission[],
          }
        : {
            accessStatus: brunoFallback ? "ativo" : "pendente",
            role: brunoFallback ? "administrador" : "visualizador",
            vendedorNome: null,
            vendedorId: null,
            empresaId: null,
            nome: currentUser.user_metadata?.nome ?? null,
            profileId: null,
            permissions: [],
          };

      applyProfile(nextProfile);
      return nextProfile;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido ao buscar perfil Supabase.";
      setError(message);
      const fallbackProfile: AccessProfile = adminEmails.has(email)
        ? { accessStatus: "ativo", role: "administrador", vendedorNome: null, vendedorId: null, empresaId: null, nome: currentUser.user_metadata?.nome ?? null, profileId: null, permissions: [] }
        : { accessStatus: "pendente", role: "visualizador", vendedorNome: null, vendedorId: null, empresaId: null, nome: null, profileId: null, permissions: [] };
      applyProfile(fallbackProfile);
      return fallbackProfile;
    }
  }, [applyProfile]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      applyProfile(localAdminProfile);
      return;
    }

    let isMounted = true;

    void (async () => {
      try {
        const { data, error: sessionError } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_TIMEOUT_MS,
          "Tempo excedido ao buscar sessão Supabase.",
        );
        if (!isMounted) return;
        if (sessionError) setError(sessionError.message);
        setSession(data.session);
        setUser(data.session?.user ?? null);
        await refreshProfile(data.session?.user ?? null);
      } catch (error) {
        if (!isMounted) return;
        const message = error instanceof Error ? error.message : "Erro desconhecido ao buscar sessão Supabase.";
        setError(message);
        setSession(null);
        setUser(null);
        await refreshProfile(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!isMounted) return;
      setLoading(true);
      try {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        await refreshProfile(nextSession?.user ?? null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido ao atualizar sessão Supabase.";
        setError(message);
        applyProfile({ accessStatus: "pendente", role: "visualizador", vendedorNome: null, vendedorId: null, empresaId: null, nome: null, profileId: null, permissions: [] });
      } finally {
        if (isMounted) setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [applyProfile, refreshProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      setError("Supabase não configurado. App em modo local.");
      return;
    }

    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setError(signInError.message);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      setError("Supabase não configurado. App em modo local.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const shouldBootstrapAsAdmin = adminEmails.has(normalizedEmail);

    setError(null);
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: shouldBootstrapAsAdmin ? { requested_role: "administrador" } : {},
        emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}login`,
      },
    });
    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    setAccessStatus(shouldBootstrapAsAdmin ? "ativo" : "pendente");
    setRole(shouldBootstrapAsAdmin ? "administrador" : "visualizador");
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;

    const { error: signOutError } = await supabase.auth.signOut();

    setUser(null);
    setSession(null);
    applyProfile({ accessStatus: "pendente", role: "visualizador", vendedorNome: null, vendedorId: null, empresaId: null, nome: null, profileId: null, permissions: [] });
    setError(signOutError ? signOutError.message : null);
  }, [applyProfile]);

  const refreshAccess = useCallback(async () => refreshProfile(user), [refreshProfile, user]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    session,
    loading,
    error,
    accessStatus,
    role,
    vendedorNome,
    vendedorId,
    empresaId,
    nome,
    profileId,
    permissions,
    isLocalMode,
    signIn,
    signUp,
    signOut,
    refreshAccess,
    clearError: () => setError(null),
  }), [user, session, loading, error, accessStatus, role, vendedorNome, vendedorId, empresaId, nome, profileId, isLocalMode, signIn, signUp, signOut, refreshAccess, permissions]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthStoreProvider");
  }
  return context;
}
