-- Sprint 39: hierarquia direta em user_profiles para UX de Usuários e acessos.

alter table public.user_profiles
  add column if not exists superior_user_id uuid null references auth.users(id) on delete set null,
  add column if not exists superior_nome text null,
  add column if not exists superior_papel text null check (superior_papel is null or superior_papel in ('administrador', 'gestor'));

create index if not exists user_profiles_superior_user_id_idx on public.user_profiles(superior_user_id) where superior_user_id is not null;

-- Migra vínculos ativos legados gestor -> vendedor para o campo genérico do subordinado.
update public.user_profiles vendedor
set superior_user_id = member.gestor_user_id,
    superior_nome = coalesce(nullif(trim(gestor.nome), ''), gestor.email),
    superior_papel = gestor.papel
from public.user_team_members member
join public.user_profiles gestor on gestor.user_id = member.gestor_user_id
where member.ativo
  and vendedor.user_id = member.vendedor_user_id
  and vendedor.papel = 'vendedor'
  and vendedor.superior_user_id is null;

-- Administradores permanecem explicitamente no topo.
update public.user_profiles
set superior_user_id = null,
    superior_nome = null,
    superior_papel = null
where papel = 'administrador';

-- Permite que superiores diretos enxerguem os perfis subordinados necessários para escopo de equipe.
drop policy if exists "user_profiles_superior_select" on public.user_profiles;
create policy "user_profiles_superior_select" on public.user_profiles
  for select using (auth.uid() = superior_user_id);
