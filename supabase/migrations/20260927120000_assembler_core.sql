-- Assembler data is additive; legacy leads, slots, and confirmation calls remain intact.
alter table public.agents add column blueprint jsonb;
alter table public.calls add column outcome_key text;

create table public.agent_records (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  call_id uuid references public.calls(id) on delete set null,
  record_type text not null check (record_type ~ '^[a-z][a-z0-9_]{0,63}$'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agent_records_agent_created_idx on public.agent_records(agent_id, created_at desc);
create index agent_records_call_idx on public.agent_records(call_id);
alter table public.agent_records enable row level security;
revoke all on public.agent_records from anon, authenticated;

create table public.agent_connections (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  connection_key text not null check (connection_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  name text not null,
  kind text not null check (kind in ('http', 'webhook')),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  encrypted_secret text,
  status text not null default 'configured',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, connection_key)
);
alter table public.agent_connections enable row level security;
revoke all on public.agent_connections from anon, authenticated;

create table public.agent_tool_logs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  call_id uuid references public.calls(id) on delete set null,
  tool_id text not null,
  tool_kind text not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  success boolean not null,
  argument_keys text[] not null default '{}',
  result_summary text,
  error_code text,
  duration_ms integer not null check (duration_ms >= 0)
);
create index agent_tool_logs_agent_started_idx on public.agent_tool_logs(agent_id, started_at desc);
alter table public.agent_tool_logs enable row level security;
revoke all on public.agent_tool_logs from anon, authenticated;

-- Newer projects may not grant Data API privileges to service_role by default.
grant select, insert, update, delete on public.agent_records, public.agent_connections, public.agent_tool_logs to service_role;
