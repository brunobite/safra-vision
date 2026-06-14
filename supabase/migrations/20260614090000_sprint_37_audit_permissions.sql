create extension if not exists pgcrypto;

alter table public.user_profiles add column if not exists permissions_customized boolean not null default false;

create table if not exists public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_profile_id uuid references public.user_profiles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  resource text not null,
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_import boolean not null default false,
  can_export boolean not null default false,
  can_manage boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_profile_id, resource)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  actor_email text,
  actor_nome text,
  actor_papel text,
  action text not null,
  resource text not null,
  entity_id text,
  entity_label text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists user_permissions_profile_idx on public.user_permissions(user_profile_id);
create index if not exists user_permissions_user_idx on public.user_permissions(user_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_resource_idx on public.audit_logs(resource);

create or replace function public.record_audit_log(
  p_action text,
  p_resource text,
  p_entity_id text default null,
  p_entity_label text default null,
  p_before_data jsonb default null,
  p_after_data jsonb default null,
  p_metadata jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  profile public.user_profiles%rowtype;
  log_id uuid;
begin
  select * into profile from public.user_profiles where user_id = auth.uid() limit 1;
  insert into public.audit_logs(actor_user_id, actor_email, actor_nome, actor_papel, action, resource, entity_id, entity_label, before_data, after_data, metadata, user_agent)
  values (auth.uid(), coalesce(profile.email, (select email from auth.users where id = auth.uid())), profile.nome, profile.papel, p_action, p_resource, p_entity_id, p_entity_label, p_before_data, p_after_data, p_metadata, p_metadata->>'user_agent')
  returning id into log_id;
  return log_id;
end;
$$;

grant execute on function public.record_audit_log(text,text,text,text,jsonb,jsonb,jsonb) to authenticated;

alter table public.user_permissions enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "user_permissions_admin_all" on public.user_permissions;
create policy "user_permissions_admin_all" on public.user_permissions for all using (public.is_active_user_admin()) with check (public.is_active_user_admin());
drop policy if exists "user_permissions_select_own" on public.user_permissions;
create policy "user_permissions_select_own" on public.user_permissions for select using (auth.uid() = user_id);

drop policy if exists "audit_logs_admin_select" on public.audit_logs;
create policy "audit_logs_admin_select" on public.audit_logs for select using (public.is_active_user_admin());
drop policy if exists "audit_logs_no_direct_insert" on public.audit_logs;
create policy "audit_logs_no_direct_insert" on public.audit_logs for insert with check (false);

drop trigger if exists set_user_permissions_updated_at on public.user_permissions;
create trigger set_user_permissions_updated_at before update on public.user_permissions for each row execute procedure public.touch_updated_at();
