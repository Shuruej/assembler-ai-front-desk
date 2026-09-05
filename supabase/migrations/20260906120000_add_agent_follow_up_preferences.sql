alter table public.agents
  add column confirmation_call_enabled boolean not null default true,
  add column feedback_enabled boolean not null default true;

-- Enforce the dependency for all writers, including direct database updates.
create function public.normalize_agent_follow_up_preferences()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.confirmation_call_enabled := coalesce(new.confirmation_call_enabled, true);
  new.feedback_enabled := new.confirmation_call_enabled and coalesce(new.feedback_enabled, true);
  return new;
end;
$$;

create trigger normalize_agent_follow_up_preferences
before insert or update on public.agents
for each row execute function public.normalize_agent_follow_up_preferences();

alter table public.agents
  add constraint agents_feedback_requires_confirmation
  check (confirmation_call_enabled or not feedback_enabled);
