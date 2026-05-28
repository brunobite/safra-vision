-- Sprint 17C: permite os mesmos ids locais para usuários diferentes nas tabelas sincronizáveis.
-- Mantém RLS por user_id e troca a chave primária simples (id) por chave composta (user_id, id).

do $$
declare
  tbl text;
  tables text[] := array[
    'clientes',
    'lancamentos',
    'oportunidades',
    'orcamentos',
    'negocios',
    'proximas_acoes',
    'vendedores',
    'produtos',
    'formas_pagamento',
    'prazos_pagamento',
    'app_config',
    'sync_meta'
  ];
begin
  foreach tbl in array tables loop
    execute format('alter table public.%I drop constraint if exists %I;', tbl, tbl || '_pkey');
    execute format('alter table public.%I add constraint %I primary key (user_id, id);', tbl, tbl || '_pkey');
  end loop;
end $$;
