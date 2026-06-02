create table if not exists public.historico_funil (like public.clientes including all);

alter table public.historico_funil enable row level security;

select public.apply_user_scoped_policies('historico_funil');

alter table public.historico_funil drop constraint if exists historico_funil_pkey;
alter table public.historico_funil add constraint historico_funil_pkey primary key (user_id, id);

drop trigger if exists set_historico_funil_updated_at on public.historico_funil;
create trigger set_historico_funil_updated_at before update on public.historico_funil for each row execute procedure public.touch_updated_at();
