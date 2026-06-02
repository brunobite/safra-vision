-- Sprint 27: relatórios de visita como histórico comercial oficial do Safra Vision.
-- O Google Calendar permanece apenas como espelho operacional de agenda/rota.

create table if not exists public.relatorios_visita (like public.clientes including all);

alter table public.relatorios_visita enable row level security;

drop policy if exists relatorios_visita_select_own on public.relatorios_visita;
drop policy if exists relatorios_visita_insert_own on public.relatorios_visita;
drop policy if exists relatorios_visita_update_own on public.relatorios_visita;
drop policy if exists relatorios_visita_delete_own on public.relatorios_visita;

create policy relatorios_visita_select_own on public.relatorios_visita
  for select using (auth.uid() = user_id);
create policy relatorios_visita_insert_own on public.relatorios_visita
  for insert with check (auth.uid() = user_id);
create policy relatorios_visita_update_own on public.relatorios_visita
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy relatorios_visita_delete_own on public.relatorios_visita
  for delete using (auth.uid() = user_id);

drop trigger if exists set_relatorios_visita_updated_at on public.relatorios_visita;
create trigger set_relatorios_visita_updated_at
  before update on public.relatorios_visita
  for each row execute procedure public.touch_updated_at();

alter table public.relatorios_visita drop constraint if exists relatorios_visita_pkey;
alter table public.relatorios_visita add constraint relatorios_visita_pkey primary key (user_id, id);
