alter table agents
  add column business_hours_start text,
  add column business_hours_end text,
  add column timezone text default 'Asia/Karachi';

alter table calls
  add column call_type text not null default 'inbound';

alter table calls
  add constraint calls_call_type_check
  check (call_type in ('inbound', 'confirmation'));

alter table leads
  add column is_spam boolean not null default false,
  add column booking_id text,
  add column confirmed_date date,
  add column confirmed_time text,
  add column confirmation_status text not null default 'pending',
  add column feedback_rating int,
  add column feedback_notes text;

alter table leads
  add constraint leads_confirmation_status_check
  check (
    confirmation_status in (
      'pending',
      'confirmed',
      'declined',
      'no_answer',
      'not_applicable'
    )
  );

alter table leads
  add constraint leads_feedback_rating_check
  check (feedback_rating is null or feedback_rating between 1 and 5);
