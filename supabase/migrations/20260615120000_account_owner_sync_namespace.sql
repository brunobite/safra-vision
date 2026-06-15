-- Hotfix: base remota única por conta comercial (account owner) e consolidação dos namespaces antigos.

alter table public.user_profiles
  add column if not exists account_owner_user_id uuid references auth.users(id) on delete set null;

create index if not exists user_profiles_account_owner_user_id_idx
  on public.user_profiles(account_owner_user_id) where account_owner_user_id is not null;

update public.user_profiles
set account_owner_user_id = '1edc46d6-f124-46e5-9d8e-8c801c0e13cf'::uuid
where status = 'ativo'
  and coalesce(account_owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> '1edc46d6-f124-46e5-9d8e-8c801c0e13cf'::uuid;

update public.user_profiles
set account_owner_user_id = user_id,
    papel = case when lower(coalesce(email, '')) = 'bitencourttec@gmail.com' then 'administrador' else papel end,
    status = case when lower(coalesce(email, '')) = 'bitencourttec@gmail.com' then 'ativo' else status end
where lower(coalesce(email, '')) = 'bitencourttec@gmail.com'
   or user_id = '1edc46d6-f124-46e5-9d8e-8c801c0e13cf'::uuid;

create or replace function public.current_account_owner_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.account_owner_user_id from public.user_profiles p where p.user_id = auth.uid() limit 1),
    auth.uid()
  )
$$;

grant execute on function public.current_account_owner_user_id() to authenticated;

create or replace function public.apply_account_owner_scoped_policies(table_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  execute format('drop policy if exists %I on public.%I;', table_name || '_select_own', table_name);
  execute format('drop policy if exists %I on public.%I;', table_name || '_insert_own', table_name);
  execute format('drop policy if exists %I on public.%I;', table_name || '_update_own', table_name);
  execute format('drop policy if exists %I on public.%I;', table_name || '_delete_own', table_name);
  execute format('drop policy if exists %I on public.%I;', table_name || '_select_account_owner', table_name);
  execute format('drop policy if exists %I on public.%I;', table_name || '_insert_account_owner', table_name);
  execute format('drop policy if exists %I on public.%I;', table_name || '_update_account_owner', table_name);
  execute format('drop policy if exists %I on public.%I;', table_name || '_delete_account_owner', table_name);

  execute format('create policy %I on public.%I for select using (user_id = public.current_account_owner_user_id());', table_name || '_select_account_owner', table_name);
  execute format('create policy %I on public.%I for insert with check (user_id = public.current_account_owner_user_id());', table_name || '_insert_account_owner', table_name);
  execute format('create policy %I on public.%I for update using (user_id = public.current_account_owner_user_id()) with check (user_id = public.current_account_owner_user_id());', table_name || '_update_account_owner', table_name);
  execute format('create policy %I on public.%I for delete using (user_id = public.current_account_owner_user_id());', table_name || '_delete_account_owner', table_name);
end;
$$;

do $$
declare
  tbl text;
  root_id constant uuid := '1edc46d6-f124-46e5-9d8e-8c801c0e13cf'::uuid;
  tables text[] := array['clientes','lancamentos','oportunidades','historico_funil','orcamentos','negocios','proximas_acoes','relatorios_visita','metas_empresa','metas_pessoais','metas_vendedor','metas_categoria','regras_comissao','configuracoes','empresas','eventos','prioridades_p1','vendedores','produtos','formas_pagamento','prazos_pagamento','app_config','sync_meta'];
begin
  foreach tbl in array tables loop
    execute format($fmt$
      insert into public.%I (id, user_id, payload, created_at, updated_at, deleted_at)
      select distinct on (id) id, %L::uuid, payload, created_at, updated_at, deleted_at
      from public.%I
      where user_id <> %L::uuid
        and user_id in (select user_id from public.user_profiles where account_owner_user_id = %L::uuid or user_id = %L::uuid)
      order by id, coalesce(updated_at, created_at) desc
      on conflict (user_id, id) do update
        set payload = excluded.payload,
            updated_at = greatest(coalesce(public.%I.updated_at, public.%I.created_at), coalesce(excluded.updated_at, excluded.created_at)),
            deleted_at = excluded.deleted_at
        where coalesce(excluded.updated_at, excluded.created_at) >= coalesce(public.%I.updated_at, public.%I.created_at)
    $fmt$, tbl, root_id, tbl, root_id, root_id, root_id, tbl, tbl, tbl, tbl);

    perform public.apply_account_owner_scoped_policies(tbl);
  end loop;
end $$;

insert into public.audit_logs(action, resource, entity_id, entity_label, after_data, metadata)
values ('consolidar_namespace_conta', 'sync', '1edc46d6-f124-46e5-9d8e-8c801c0e13cf', 'Base única Safra Vision', jsonb_build_object('accountOwnerUserId', '1edc46d6-f124-46e5-9d8e-8c801c0e13cf'), jsonb_build_object('migration', '20260615120000_account_owner_sync_namespace', 'preserveDeletedAt', true, 'conflictRule', 'latest_updated_at'));
