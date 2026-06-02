-- Sprint 32: amplia a sincronização local/nuvem para os cadastros operacionais
-- que já existem no IndexedDB/AppStore, mantendo o padrão payload jsonb + RLS por usuário.

create table if not exists public.metas_empresa (like public.clientes including all);
create table if not exists public.metas_pessoais (like public.clientes including all);
create table if not exists public.metas_vendedor (like public.clientes including all);
create table if not exists public.metas_categoria (like public.clientes including all);
create table if not exists public.regras_comissao (like public.clientes including all);
create table if not exists public.configuracoes (like public.clientes including all);
create table if not exists public.empresas (like public.clientes including all);
create table if not exists public.eventos (like public.clientes including all);
create table if not exists public.prioridades_p1 (like public.clientes including all);

alter table public.metas_empresa enable row level security;
alter table public.metas_pessoais enable row level security;
alter table public.metas_vendedor enable row level security;
alter table public.metas_categoria enable row level security;
alter table public.regras_comissao enable row level security;
alter table public.configuracoes enable row level security;
alter table public.empresas enable row level security;
alter table public.eventos enable row level security;
alter table public.prioridades_p1 enable row level security;

do $$
declare
  tbl text;
  tables text[] := array[
    'metas_empresa',
    'metas_pessoais',
    'metas_vendedor',
    'metas_categoria',
    'regras_comissao',
    'configuracoes',
    'empresas',
    'eventos',
    'prioridades_p1'
  ];
begin
  foreach tbl in array tables loop
    execute format('alter table public.%I drop constraint if exists %I;', tbl, tbl || '_pkey');
    execute format('alter table public.%I add constraint %I primary key (user_id, id);', tbl, tbl || '_pkey');

    execute format('drop policy if exists %I on public.%I;', tbl || '_select_own', tbl);
    execute format('drop policy if exists %I on public.%I;', tbl || '_insert_own', tbl);
    execute format('drop policy if exists %I on public.%I;', tbl || '_update_own', tbl);
    execute format('drop policy if exists %I on public.%I;', tbl || '_delete_own', tbl);

    execute format('create policy %I on public.%I for select using (auth.uid() = user_id);', tbl || '_select_own', tbl);
    execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id);', tbl || '_insert_own', tbl);
    execute format('create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', tbl || '_update_own', tbl);
    execute format('create policy %I on public.%I for delete using (auth.uid() = user_id);', tbl || '_delete_own', tbl);

    execute format('drop trigger if exists %I on public.%I;', 'set_' || tbl || '_updated_at', tbl);
    execute format('create trigger %I before update on public.%I for each row execute procedure public.touch_updated_at();', 'set_' || tbl || '_updated_at', tbl);
  end loop;
end $$;
