import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { corsHeaders, getBearerToken, getRequiredEnv, responseJson } from "../_shared/googleCalendar.ts";

type Papel = "administrador" | "gestor" | "vendedor" | "visualizador";
type StatusPerfil = "ativo" | "pendente" | "inativo" | "bloqueado";

type AdminCreateUserPayload = {
  email?: string;
  password?: string;
  nome?: string;
  papel?: Papel;
  vendedor_id?: string | null;
  vendedor_nome?: string | null;
  empresa_id?: string | null;
  status?: StatusPerfil;
};

const papeis = new Set<Papel>(["administrador", "gestor", "vendedor", "visualizador"]);
const statuses = new Set<StatusPerfil>(["ativo", "pendente", "inativo", "bloqueado"]);
const BRUNO_ADMIN_EMAIL = "bitencourttec@gmail.com";

function normalizeEmail(email: unknown): string {
  return String(email ?? "").trim().toLowerCase();
}

function assertValidPayload(payload: AdminCreateUserPayload) {
  const email = normalizeEmail(payload.email);
  const password = String(payload.password ?? "");
  const nome = String(payload.nome ?? "").trim();
  const papel = payload.papel;
  const status = payload.status ?? "ativo";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email obrigatório e válido.");
  if (!password || password.length < 8) throw new Error("Senha obrigatória com pelo menos 8 caracteres.");
  if (!nome) throw new Error("Nome obrigatório.");
  if (!papel || !papeis.has(papel)) throw new Error("Papel inválido.");
  if (!statuses.has(status)) throw new Error("Status de acesso inválido.");
  if (papel === "vendedor" && !payload.vendedor_id) throw new Error("Vendedor vinculado obrigatório para papel vendedor.");
  if (email === BRUNO_ADMIN_EMAIL) throw new Error("Bruno é um administrador protegido e não pode ser alterado por este fluxo.");

  return { email, password, nome, papel, status };
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return responseJson({ ok: false, error: "Método não permitido." }, 405);

  const token = getBearerToken(req);
  const service = createClient(getRequiredEnv("SUPABASE_URL"), getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: requesterData, error: requesterError } = await service.auth.getUser(token);
  if (requesterError || !requesterData.user) throw new Error("Sessão Supabase inválida ou expirada.");

  const requesterEmail = normalizeEmail(requesterData.user.email);
  const { data: adminProfile, error: adminError } = await service
    .from("user_profiles")
    .select("id,papel,status,email")
    .eq("user_id", requesterData.user.id)
    .maybeSingle();
  if (adminError) throw adminError;
  const isProtectedAdmin = requesterEmail === BRUNO_ADMIN_EMAIL;
  const isActiveAdmin = adminProfile?.papel === "administrador" && adminProfile.status === "ativo";
  if (!isProtectedAdmin && !isActiveAdmin) throw new Error("Apenas administradores ativos podem cadastrar usuários.");

  const payload = (await req.json().catch(() => null)) as AdminCreateUserPayload | null;
  if (!payload) throw new Error("Payload inválido.");
  const { email, password, nome, papel, status } = assertValidPayload(payload);

  const vendedorId = papel === "vendedor" ? payload.vendedor_id ?? null : null;
  const vendedorNome = papel === "vendedor" ? payload.vendedor_nome ?? null : null;
  const empresaId = payload.empresa_id ?? null;

  const { data: existingProfile, error: existingProfileError } = await service
    .from("user_profiles")
    .select("id,user_id,email")
    .eq("email", email)
    .maybeSingle();
  if (existingProfileError) throw existingProfileError;

  let userId = existingProfile?.user_id ?? null;
  let authCreated = false;

  if (!userId) {
    const { data: createdUser, error: createError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome, papel },
    });

    if (createError) {
      const message = createError.message.toLowerCase().includes("already") || createError.message.toLowerCase().includes("registered")
        ? "Usuário já existe no Auth. Vincule ou atualize o perfil existente sem recriar o Auth."
        : createError.message;
      throw new Error(message);
    }

    userId = createdUser.user?.id ?? null;
    authCreated = true;
  }

  if (!userId) throw new Error("Não foi possível identificar o usuário no Supabase Auth.");

  const profilePayload = {
    user_id: userId,
    email,
    nome,
    papel,
    vendedor_id: vendedorId,
    vendedor_nome: vendedorNome,
    empresa_id: empresaId,
    status,
    aprovado_por: requesterData.user.id,
    aprovado_em: new Date().toISOString(),
  };

  const { data: profile, error: profileError } = await service
    .from("user_profiles")
    .upsert(profilePayload, { onConflict: "email" })
    .select("id,user_id,nome,email,papel,vendedor_id,vendedor_nome,empresa_id,status,created_at,aprovado_em")
    .single();
  if (profileError) throw profileError;

  return responseJson({ ok: true, authCreated, profile });
}

Deno.serve((req) => handle(req).catch((error) => responseJson({ ok: false, error: error instanceof Error ? error.message : "Erro ao cadastrar usuário." }, 400)));
