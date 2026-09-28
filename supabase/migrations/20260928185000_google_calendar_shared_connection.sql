alter table public.agent_connections
  drop constraint if exists agent_connections_kind_check;

alter table public.agent_connections
  add constraint agent_connections_kind_check
  check (kind in ('http', 'webhook', 'google_sheets', 'google_calendar'));

create table if not exists public.reviewer_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  reviewer_id text not null,
  agent_id uuid not null references public.agents(id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'configured' check (status in ('configured')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reviewer_id, agent_id)
);

alter table public.reviewer_calendar_connections enable row level security;
revoke all on public.reviewer_calendar_connections from anon, authenticated;
grant select, insert, update, delete on public.reviewer_calendar_connections to service_role;
