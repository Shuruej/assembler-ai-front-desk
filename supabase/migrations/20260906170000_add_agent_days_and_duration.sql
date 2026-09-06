alter table agents
  add column business_days text not null default 'mon,tue,wed,thu,fri,sat,sun',
  add column appointment_duration_minutes int not null default 60;
