import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type AccessStatus = "pending" | "active" | "blocked" | "inactive";
type UserRole = "admin" | "user";
type AccessProfile = { accessStatus: AccessStatus; role: UserRole };

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  accessStatus: AccessStatus;
  role: UserRole;
  isLocalMode: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccess: () => Promise<AccessProfile>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const AUTH_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(message)), ms);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeoutId));
  });
}
const adminEmails = new Set(
  (import.meta.env.VITE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email: string) => email.trim().toLowerCase())
    .filter(Boolean),
);

export function AuthStoreProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>("pending");
  const [role, setRole] = useState<UserRole>("user");

  const isLocalMode = !isSupabaseConfigured;

  const refreshProfile = useCallback(async (currentUser: User | null): Promise<AccessProfile> => {
    const fallbackProfile: AccessProfile = { accessStatus: "pending", role: "user" };

    if (!supabase || !currentUser) {
      setAccessStatus(fallbackProfile.accessStatus);
      setRole(fallbackProfile.role);
      return fallbackProfile;
    }

    try {
      const { data, error: profileError } = await withTimeout(
        Promise.resolve(
          supabase
            .from("profiles")
            .select("status, role")
            .eq("id", currentUser.id)
            .maybeSingle(),
        ),
        AUTH_TIMEOUT_MS,
        "Tempo excedido ao buscar profile Supabase.",
      );

      if (profileError) {
        setError(profileError.message);
        setAccessStatus(fallbackProfile.accessStatus);
        setRole(fallbackProfile.role);
        return fallbackProfile;
      }

      const nextProfile: AccessProfile = {
        accessStatus: (data?.status as AccessStatus) ?? fallbackProfile.accessStatus,
        role: (data?.role as UserRole) ?? fallbackProfile.role,
      };

      setAccessStatus(nextProfile.accessStatus);
      setRole(nextProfile.role);
      return nextProfile;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido ao buscar profile Supabase.";
      setError(message);
      setAccessStatus(fallbackProfile.accessStatus);
      setRole(fallbackProfile.role);
      return fallbackProfile;
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
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
        setAccessStatus("pending");
        setRole("user");
      } finally {
        if (isMounted) setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [refreshProfile]);

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
        data: shouldBootstrapAsAdmin ? { requested_role: "admin" } : {},
        emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}login`,
      },
    });
    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    setAccessStatus("pending");
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;

    const { error: signOutError } = await supabase.auth.signOut();

    setUser(null);
    setSession(null);
    setAccessStatus("pending");
    setRole("user");
    setError(signOutError ? signOutError.message : null);
  }, []);

  const refreshAccess = useCallback(async () => {
    return refreshProfile(user);
  }, [refreshProfile, user]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    session,
    loading,
    error,
    accessStatus,
    role,
    isLocalMode,
    signIn,
    signUp,
    signOut,
    refreshAccess,
    clearError: () => setError(null),
  }), [user, session, loading, error, accessStatus, role, isLocalMode, signIn, signUp, signOut, refreshAccess]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthStoreProvider");
  }
  return context;
}
