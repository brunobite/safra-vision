import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export type SupabaseAccessStatus = "pending" | "active" | "blocked" | "inactive";
export type SupabaseUserRole = "admin" | "user";

export type FreshSupabaseAccessContext = {
  session: Session | null;
  user: User | null;
  email: string | null;
  userId: string | null;
  role: SupabaseUserRole | null;
  accessStatus: SupabaseAccessStatus | null;
  error: string | null;
};

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
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
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

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("status, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return { ...baseContext, error: profileError.message };
    }

    if (!profile) {
      return { ...baseContext, error: "Profile não encontrado." };
    }

    return {
      ...baseContext,
      role: (profile.role as SupabaseUserRole | null) ?? null,
      accessStatus: (profile.status as SupabaseAccessStatus | null) ?? null,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao buscar sessão Supabase.";
    return emptyAccessContext(message);
  }
}
