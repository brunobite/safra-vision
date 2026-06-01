create table if not exists public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  google_account_email text null,
  refresh_token text not null,
  scope text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz null
);

create unique index if not exists google_calendar_connections_one_active_per_user
  on public.google_calendar_connections (user_id)
  where revoked_at is null;

alter table public.google_calendar_connections enable row level security;

create policy "Users can read their own Google Calendar connection status"
  on public.google_calendar_connections
  for select
  using (auth.uid() = user_id);

revoke all on table public.google_calendar_connections from anon;
revoke all on table public.google_calendar_connections from authenticated;
grant select (id, user_id, google_account_email, scope, connected_at, updated_at, revoked_at)
  on public.google_calendar_connections to authenticated;
