-- Sprint 38: usuário ativo passa a ser o agente comercial operacional.
-- O cadastro legado public.vendedores é preservado apenas para compatibilidade/fallback.

create extension if not exists pgcrypto;

create table if not exists public.user_team_members (
  id uuid primary key default gen_random_uuid(),
  gestor_user_id uuid not null references auth.users(id) on delete cascade,
  vendedor_user_id uuid not null references auth.users(id) on delete cascade,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gestor_user_id, vendedor_user_id)
);

create index if not exists user_team_members_gestor_idx on public.user_team_members(gestor_user_id) where ativo;
create index if not exists user_team_members_vendedor_idx on public.user_team_members(vendedor_user_id) where ativo;

drop trigger if exists set_user_team_members_updated_at on public.user_team_members;
create trigger set_user_team_members_updated_at before update on public.user_team_members for each row execute procedure public.touch_updated_at();

alter table public.user_team_members enable row level security;

drop policy if exists "user_team_members_admin_all" on public.user_team_members;
create policy "user_team_members_admin_all" on public.user_team_members for all using (public.is_active_user_admin()) with check (public.is_active_user_admin());

drop policy if exists "user_team_members_gestor_select" on public.user_team_members;
create policy "user_team_members_gestor_select" on public.user_team_members for select using (auth.uid() = gestor_user_id or auth.uid() = vendedor_user_id);

-- Garante que novos vendedores não dependam do cadastro legado: o próprio perfil é o agente.
update public.user_profiles
set vendedor_nome = coalesce(nullif(trim(nome), ''), vendedor_nome),
    vendedor_id = null
where papel = 'vendedor'
  and status = 'ativo';
