create table if not exists public.reviewer_sheet_connections (
  id uuid primary key default gen_random_uuid(),
  reviewer_id text not null,
  agent_id uuid not null references public.agents(id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'configured' check (status in ('configured')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reviewer_id, agent_id)
);

alter table public.reviewer_sheet_connections enable row level security;

revoke all on public.reviewer_sheet_connections from anon, authenticated;
grant select, insert, update, delete on public.reviewer_sheet_connections to service_role;
