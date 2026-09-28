alter table public.agent_connections
  drop constraint if exists agent_connections_kind_check;

alter table public.agent_connections
  add constraint agent_connections_kind_check
  check (kind in ('http', 'webhook', 'google_sheets'));
