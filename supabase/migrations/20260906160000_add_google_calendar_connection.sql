alter table agents
  add column google_refresh_token text,
  add column google_calendar_connected boolean not null default false;

alter table leads
  add column google_event_id text;
