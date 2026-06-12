create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  nome text,
  email text not null unique,
  papel text not null default 'visualizador' check (papel in ('administrador', 'gestor', 'vendedor', 'visualizador')),
  vendedor_nome text,
  status text not null default 'pendente' check (status in ('pendente', 'ativo', 'inativo', 'bloqueado')),
  criado_por uuid references auth.users(id),
  aprovado_por uuid references auth.users(id),
  aprovado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  nome text,
  papel text not null default 'vendedor' check (papel in ('administrador', 'gestor', 'vendedor', 'visualizador')),
  vendedor_nome text,
  status text not null default 'convite_enviado' check (status in ('convite_enviado', 'pendente', 'aceito', 'expirado', 'cancelado')),
  token text not null default encode(gen_random_bytes(24), 'hex'),
  criado_por uuid references auth.users(id),
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_profiles_email_idx on public.user_profiles (lower(email));
create index if not exists user_profiles_status_idx on public.user_profiles (status);
create index if not exists user_invites_email_idx on public.user_invites (lower(email));
create index if not exists user_invites_status_idx on public.user_invites (status);

create or replace function public.is_active_user_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles p
    where p.user_id = auth.uid()
      and p.papel = 'administrador'
      and p.status = 'ativo'
  )
  or exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and lower(coalesce(u.email, '')) = 'bitencourttec@gmail.com'
  );
$$;

grant execute on function public.is_active_user_admin() to authenticated;

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

  insert into public.user_profiles (user_id, email, nome, papel, vendedor_nome, status, aprovado_em)
  values (
    auth.uid(),
    current_email,
    invite.nome,
    case when current_email = 'bitencourttec@gmail.com' or not has_active_admin then 'administrador' else coalesce(invite.papel, 'visualizador') end,
    invite.vendedor_nome,
    case when current_email = 'bitencourttec@gmail.com' or not has_active_admin then 'ativo' else 'pendente' end,
    case when current_email = 'bitencourttec@gmail.com' or not has_active_admin then now() else null end
  )
  on conflict (email) do update set
    user_id = coalesce(public.user_profiles.user_id, excluded.user_id),
    nome = coalesce(public.user_profiles.nome, excluded.nome),
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

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, email, nome, papel, status, aprovado_em)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'name'),
    case when lower(coalesce(new.email, '')) = 'bitencourttec@gmail.com' or not exists (select 1 from public.user_profiles where papel = 'administrador' and status = 'ativo') then 'administrador' else 'visualizador' end,
    case when lower(coalesce(new.email, '')) = 'bitencourttec@gmail.com' or not exists (select 1 from public.user_profiles where papel = 'administrador' and status = 'ativo') then 'ativo' else 'pendente' end,
    case when lower(coalesce(new.email, '')) = 'bitencourttec@gmail.com' or not exists (select 1 from public.user_profiles where papel = 'administrador' and status = 'ativo') then now() else null end
  )
  on conflict (email) do update set
    user_id = coalesce(public.user_profiles.user_id, excluded.user_id),
    status = case when excluded.email = 'bitencourttec@gmail.com' then 'ativo' else public.user_profiles.status end,
    papel = case when excluded.email = 'bitencourttec@gmail.com' then 'administrador' else public.user_profiles.papel end,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_user_profiles on auth.users;
create trigger on_auth_user_created_user_profiles
  after insert on auth.users
  for each row execute procedure public.handle_new_user_profile();

alter table public.user_profiles enable row level security;
alter table public.user_invites enable row level security;

drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own" on public.user_profiles
  for select using (auth.uid() = user_id);

drop policy if exists "user_profiles_admin_select" on public.user_profiles;
create policy "user_profiles_admin_select" on public.user_profiles
  for select using (public.is_active_user_admin());

drop policy if exists "user_profiles_admin_insert" on public.user_profiles;
create policy "user_profiles_admin_insert" on public.user_profiles
  for insert with check (public.is_active_user_admin());

drop policy if exists "user_profiles_admin_update" on public.user_profiles;
create policy "user_profiles_admin_update" on public.user_profiles
  for update using (public.is_active_user_admin()) with check (public.is_active_user_admin());

drop policy if exists "user_invites_admin_select" on public.user_invites;
create policy "user_invites_admin_select" on public.user_invites
  for select using (public.is_active_user_admin());

drop policy if exists "user_invites_admin_insert" on public.user_invites;
create policy "user_invites_admin_insert" on public.user_invites
  for insert with check (public.is_active_user_admin());

drop policy if exists "user_invites_admin_update" on public.user_invites;
create policy "user_invites_admin_update" on public.user_invites
  for update using (public.is_active_user_admin()) with check (public.is_active_user_admin());

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
create trigger set_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute procedure public.touch_updated_at();

drop trigger if exists set_user_invites_updated_at on public.user_invites;
create trigger set_user_invites_updated_at
  before update on public.user_invites
  for each row execute procedure public.touch_updated_at();
