-- Sprint 36A: gestão em cascata Conta/Empresa → Administrador → Gestores → Vendedores → Usuários.
-- Mantém vendedor_nome como legado/cache e passa a vincular usuários por vendedor_id.

alter table public.user_profiles
  add column if not exists vendedor_id uuid,
  add column if not exists empresa_id uuid,
  add column if not exists gestor_id uuid,
  add column if not exists equipe_id uuid;

alter table public.user_invites
  add column if not exists vendedor_id uuid,
  add column if not exists empresa_id uuid,
  add column if not exists gestor_id uuid,
  add column if not exists equipe_id uuid;

create index if not exists user_profiles_vendedor_id_idx on public.user_profiles (vendedor_id);
create index if not exists user_profiles_empresa_id_idx on public.user_profiles (empresa_id);
create index if not exists user_profiles_gestor_id_idx on public.user_profiles (gestor_id);
create index if not exists user_invites_vendedor_id_idx on public.user_invites (vendedor_id);
create index if not exists user_invites_empresa_id_idx on public.user_invites (empresa_id);

-- Compatibilidade: tenta resolver vendedor_nome existente contra o cadastro sincronizado de vendedores.
-- A tabela vendedores guarda o objeto operacional em payload jsonb; só preenche quando a correspondência por nome é única.
with vendedores_unicos as (
  select
    lower(trim(payload->>'nome')) as nome_normalizado,
    min(id::uuid) as vendedor_id,
    count(*) as total
  from public.vendedores
  where deleted_at is null
    and payload ? 'nome'
    and nullif(trim(payload->>'nome'), '') is not null
    and id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  group by lower(trim(payload->>'nome'))
)
update public.user_profiles profile
set vendedor_id = vendedor.vendedor_id,
    updated_at = now()
from vendedores_unicos vendedor
where profile.vendedor_id is null
  and nullif(trim(profile.vendedor_nome), '') is not null
  and lower(trim(profile.vendedor_nome)) = vendedor.nome_normalizado
  and vendedor.total = 1;

with vendedores_unicos as (
  select
    lower(trim(payload->>'nome')) as nome_normalizado,
    min(id::uuid) as vendedor_id,
    count(*) as total
  from public.vendedores
  where deleted_at is null
    and payload ? 'nome'
    and nullif(trim(payload->>'nome'), '') is not null
    and id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  group by lower(trim(payload->>'nome'))
)
update public.user_invites invite
set vendedor_id = vendedor.vendedor_id,
    updated_at = now()
from vendedores_unicos vendedor
where invite.vendedor_id is null
  and nullif(trim(invite.vendedor_nome), '') is not null
  and lower(trim(invite.vendedor_nome)) = vendedor.nome_normalizado
  and vendedor.total = 1;

-- Bruno permanece com acesso total, ativo e sem possibilidade de bloqueio acidental por migration.
update public.user_profiles
set papel = 'administrador',
    status = 'ativo',
    aprovado_em = coalesce(aprovado_em, now()),
    vendedor_id = null,
    vendedor_nome = null,
    updated_at = now()
where lower(email) = 'bitencourttec@gmail.com';

create or replace function public.ensure_current_user_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_email text;
  invite public.user_invites%rowtype;
  has_active_admin boolean;
begin
  select lower(coalesce(email, '')) into current_email from auth.users where id = auth.uid();
  if current_email is null or current_email = '' then
    return;
  end if;

  select exists (
    select 1 from public.user_profiles
    where papel = 'administrador' and status = 'ativo'
  ) into has_active_admin;

  select * into invite
  from public.user_invites
  where lower(email) = current_email
    and status in ('convite_enviado', 'pendente')
    and expires_at > now()
  order by created_at desc
  limit 1;

  insert into public.user_profiles (user_id, email, nome, papel, vendedor_id, vendedor_nome, empresa_id, gestor_id, equipe_id, status, aprovado_em)
  values (
    auth.uid(),
    current_email,
    invite.nome,
    case when current_email = 'bitencourttec@gmail.com' or not has_active_admin then 'administrador' else coalesce(invite.papel, 'visualizador') end,
    case when current_email = 'bitencourttec@gmail.com' or not has_active_admin then null else invite.vendedor_id end,
    case when current_email = 'bitencourttec@gmail.com' or not has_active_admin then null else invite.vendedor_nome end,
    invite.empresa_id,
    invite.gestor_id,
    invite.equipe_id,
    case when current_email = 'bitencourttec@gmail.com' or not has_active_admin then 'ativo' else 'pendente' end,
    case when current_email = 'bitencourttec@gmail.com' or not has_active_admin then now() else null end
  )
  on conflict (email) do update set
    user_id = coalesce(public.user_profiles.user_id, excluded.user_id),
    nome = coalesce(public.user_profiles.nome, excluded.nome),
    vendedor_id = coalesce(public.user_profiles.vendedor_id, excluded.vendedor_id),
    vendedor_nome = coalesce(public.user_profiles.vendedor_nome, excluded.vendedor_nome),
    empresa_id = coalesce(public.user_profiles.empresa_id, excluded.empresa_id),
    gestor_id = coalesce(public.user_profiles.gestor_id, excluded.gestor_id),
    equipe_id = coalesce(public.user_profiles.equipe_id, excluded.equipe_id),
    papel = case
      when current_email = 'bitencourttec@gmail.com' then 'administrador'
      else public.user_profiles.papel
    end,
    status = case
      when current_email = 'bitencourttec@gmail.com' then 'ativo'
      else public.user_profiles.status
    end,
    aprovado_em = case
      when current_email = 'bitencourttec@gmail.com' then coalesce(public.user_profiles.aprovado_em, now())
      else public.user_profiles.aprovado_em
    end,
    updated_at = now();

  if invite.id is not null then
    update public.user_invites set status = 'aceito', updated_at = now() where id = invite.id;
  end if;
end;
$$;

grant execute on function public.ensure_current_user_profile() to authenticated;
