alter table public.leads
  add column needs_human boolean not null default false,
  add column escalation_reason text;
