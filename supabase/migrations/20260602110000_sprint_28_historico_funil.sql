create table if not exists public.historico_funil (like public.clientes including all);

alter table public.historico_funil enable row level security;

drop policy if exists historico_funil_select_own on public.historico_funil;
drop policy if exists historico_funil_insert_own on public.historico_funil;
drop policy if exists historico_funil_update_own on public.historico_funil;
drop policy if exists historico_funil_delete_own on public.historico_funil;

create policy historico_funil_select_own on public.historico_funil
  for select using (auth.uid() = user_id);
create policy historico_funil_insert_own on public.historico_funil
  for insert with check (auth.uid() = user_id);
create policy historico_funil_update_own on public.historico_funil
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy historico_funil_delete_own on public.historico_funil
  for delete using (auth.uid() = user_id);

alter table public.historico_funil drop constraint if exists historico_funil_pkey;
alter table public.historico_funil add constraint historico_funil_pkey primary key (user_id, id);

drop trigger if exists set_historico_funil_updated_at on public.historico_funil;
create trigger set_historico_funil_updated_at before update on public.historico_funil for each row execute procedure public.touch_updated_at();
