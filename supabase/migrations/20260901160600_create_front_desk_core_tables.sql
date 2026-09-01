create extension if not exists pgcrypto;

create table agents (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  industry text,
  name text not null,
  assemblyai_agent_id text,
  created_at timestamptz not null default now()
);

comment on table agents is 'A configured voice agent instance for a business.';
comment on column agents.industry is 'Free-text business category, such as dental, salon, restaurant, or general.';
comment on column agents.name is 'The agent persona or display name.';

create table calls (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null,
  caller_number text,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds int,
  transcript text,
  summary text,
  status text not null,
  created_at timestamptz not null default now(),
  constraint calls_agent_id_fkey foreign key (agent_id) references agents(id)
);

comment on table calls is 'A single voice interaction handled by an agent.';
comment on column calls.status is 'Call status, such as in_progress, completed, or missed.';

create index calls_agent_id_idx on calls(agent_id);

create table leads (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null,
  customer_name text,
  phone_number text,
  requested_service text,
  preferred_datetime timestamptz,
  notes text,
  status text not null,
  created_at timestamptz not null default now(),
  constraint leads_call_id_fkey foreign key (call_id) references calls(id)
);

comment on table leads is 'A captured inquiry or booking intent from a call.';
comment on column leads.requested_service is 'Generic requested service, booking, product inquiry, or other business need.';
comment on column leads.status is 'Lead status, such as new, confirmed, or follow_up_needed.';

create index leads_call_id_idx on leads(call_id);
