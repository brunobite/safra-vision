create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nome text,
  role text not null default 'user' check (role in ('admin', 'user')),
  status text not null default 'pending' check (status in ('pending', 'active', 'blocked', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_admin_select_all" on public.profiles;
create policy "profiles_admin_select_all" on public.profiles
  for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.status = 'active'
  ));

drop policy if exists "profiles_admin_update_all" on public.profiles;
create policy "profiles_admin_update_all" on public.profiles
  for update
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.status = 'active'
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.status = 'active'
  ));

drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_admin_all" on public.profiles;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.touch_updated_at();

create table if not exists public.clientes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.lancamentos (like public.clientes including all);
create table if not exists public.oportunidades (like public.clientes including all);
create table if not exists public.orcamentos (like public.clientes including all);
create table if not exists public.negocios (like public.clientes including all);
create table if not exists public.proximas_acoes (like public.clientes including all);
create table if not exists public.vendedores (like public.clientes including all);
create table if not exists public.produtos (like public.clientes including all);
create table if not exists public.formas_pagamento (like public.clientes including all);
create table if not exists public.prazos_pagamento (like public.clientes including all);
create table if not exists public.app_config (like public.clientes including all);
create table if not exists public.sync_meta (like public.clientes including all);

alter table public.clientes enable row level security;
alter table public.lancamentos enable row level security;
alter table public.oportunidades enable row level security;
alter table public.orcamentos enable row level security;
alter table public.negocios enable row level security;
alter table public.proximas_acoes enable row level security;
alter table public.vendedores enable row level security;
alter table public.produtos enable row level security;
alter table public.formas_pagamento enable row level security;
alter table public.prazos_pagamento enable row level security;
alter table public.app_config enable row level security;
alter table public.sync_meta enable row level security;

create or replace function public.apply_user_scoped_policies(table_name text)
returns void
language plpgsql
as $$
begin
  execute format('drop policy if exists %I on public.%I;', table_name || '_select_own', table_name);
  execute format('drop policy if exists %I on public.%I;', table_name || '_insert_own', table_name);
  execute format('drop policy if exists %I on public.%I;', table_name || '_update_own', table_name);
  execute format('drop policy if exists %I on public.%I;', table_name || '_delete_own', table_name);

  execute format('create policy %I on public.%I for select using (auth.uid() = user_id);', table_name || '_select_own', table_name);
  execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id);', table_name || '_insert_own', table_name);
  execute format('create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', table_name || '_update_own', table_name);
  execute format('create policy %I on public.%I for delete using (auth.uid() = user_id);', table_name || '_delete_own', table_name);
end;
$$;

select public.apply_user_scoped_policies('clientes');
select public.apply_user_scoped_policies('lancamentos');
select public.apply_user_scoped_policies('oportunidades');
select public.apply_user_scoped_policies('orcamentos');
select public.apply_user_scoped_policies('negocios');
select public.apply_user_scoped_policies('proximas_acoes');
select public.apply_user_scoped_policies('vendedores');
select public.apply_user_scoped_policies('produtos');
select public.apply_user_scoped_policies('formas_pagamento');
select public.apply_user_scoped_policies('prazos_pagamento');
select public.apply_user_scoped_policies('app_config');
select public.apply_user_scoped_policies('sync_meta');

drop function public.apply_user_scoped_policies(text);

drop trigger if exists set_clientes_updated_at on public.clientes;
drop trigger if exists set_lancamentos_updated_at on public.lancamentos;
drop trigger if exists set_oportunidades_updated_at on public.oportunidades;
drop trigger if exists set_orcamentos_updated_at on public.orcamentos;
drop trigger if exists set_negocios_updated_at on public.negocios;
drop trigger if exists set_proximas_acoes_updated_at on public.proximas_acoes;
drop trigger if exists set_vendedores_updated_at on public.vendedores;
drop trigger if exists set_produtos_updated_at on public.produtos;
drop trigger if exists set_formas_pagamento_updated_at on public.formas_pagamento;
drop trigger if exists set_prazos_pagamento_updated_at on public.prazos_pagamento;
drop trigger if exists set_app_config_updated_at on public.app_config;
drop trigger if exists set_sync_meta_updated_at on public.sync_meta;

create trigger set_clientes_updated_at before update on public.clientes for each row execute procedure public.touch_updated_at();
create trigger set_lancamentos_updated_at before update on public.lancamentos for each row execute procedure public.touch_updated_at();
create trigger set_oportunidades_updated_at before update on public.oportunidades for each row execute procedure public.touch_updated_at();
create trigger set_orcamentos_updated_at before update on public.orcamentos for each row execute procedure public.touch_updated_at();
create trigger set_negocios_updated_at before update on public.negocios for each row execute procedure public.touch_updated_at();
create trigger set_proximas_acoes_updated_at before update on public.proximas_acoes for each row execute procedure public.touch_updated_at();
create trigger set_vendedores_updated_at before update on public.vendedores for each row execute procedure public.touch_updated_at();
create trigger set_produtos_updated_at before update on public.produtos for each row execute procedure public.touch_updated_at();
create trigger set_formas_pagamento_updated_at before update on public.formas_pagamento for each row execute procedure public.touch_updated_at();
create trigger set_prazos_pagamento_updated_at before update on public.prazos_pagamento for each row execute procedure public.touch_updated_at();
create trigger set_app_config_updated_at before update on public.app_config for each row execute procedure public.touch_updated_at();
create trigger set_sync_meta_updated_at before update on public.sync_meta for each row execute procedure public.touch_updated_at();
