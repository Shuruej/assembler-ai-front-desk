create table sms_logs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id),
  lead_id uuid references leads(id),
  to_number text,
  purpose text not null,
  message text not null,
  created_at timestamptz not null default now(),
  constraint sms_logs_purpose_check check (
    purpose in (
      'booking_confirmation',
      'escalation_alert',
      'feedback_alert',
      'review_request'
    )
  )
);

create index sms_logs_agent_id_idx on sms_logs(agent_id);
