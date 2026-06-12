import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export type SupabaseAccessStatus = "pendente" | "ativo" | "bloqueado" | "inativo" | "pending" | "active" | "blocked" | "inactive";
export type SupabaseUserRole = "administrador" | "admin" | "gestor" | "vendedor" | "visualizador" | "operacional" | "consulta" | "user";

export type FreshSupabaseAccessContext = {
  session: Session | null;
  user: User | null;
  email: string | null;
  userId: string | null;
  role: SupabaseUserRole | null;
  accessStatus: SupabaseAccessStatus | null;
  error: string | null;
};

const SUPABASE_ACCESS_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(message)), ms);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeoutId));
  });
}

const emptyAccessContext = (error: string): FreshSupabaseAccessContext => ({
  session: null,
  user: null,
  email: null,
  userId: null,
  role: null,
  accessStatus: null,
  error,
});

export async function getFreshSupabaseAccessContext(): Promise<FreshSupabaseAccessContext> {
  if (!isSupabaseConfigured || !supabase) {
    return emptyAccessContext("Supabase não configurado.");
  }

  try {
    const { data: sessionData, error: sessionError } = await withTimeout(
      supabase.auth.getSession(),
      SUPABASE_ACCESS_TIMEOUT_MS,
      "Tempo excedido ao buscar sessão Supabase.",
    );
    if (sessionError) return emptyAccessContext(sessionError.message);

    const session = sessionData.session;
    const user = session?.user ?? null;
    if (!session || !user) return emptyAccessContext("Usuário não autenticado.");

    const baseContext = {
      session,
      user,
      email: user.email ?? null,
      userId: user.id,
      role: null,
      accessStatus: null,
    } satisfies Omit<FreshSupabaseAccessContext, "error">;

    const { data: profile, error: profileError } = await withTimeout(
      Promise.resolve(
        supabase
          .from("user_profiles")
          .select("status, papel")
          .eq("user_id", user.id)
          .maybeSingle(),
      ),
      SUPABASE_ACCESS_TIMEOUT_MS,
      "Tempo excedido ao buscar profile Supabase.",
    );

    if (profileError) {
      return { ...baseContext, error: profileError.message };
    }

    if (!profile) {
      return { ...baseContext, role: user.email?.toLowerCase() === "bitencourttec@gmail.com" ? "administrador" : null, accessStatus: user.email?.toLowerCase() === "bitencourttec@gmail.com" ? "ativo" : null, error: "Perfil de acesso não encontrado." };
    }

    return {
      ...baseContext,
      role: (profile.papel as SupabaseUserRole | null) ?? null,
      accessStatus: (profile.status as SupabaseAccessStatus | null) ?? null,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao buscar sessão Supabase.";
    return emptyAccessContext(message);
  }
}
