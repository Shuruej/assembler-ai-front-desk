create table agent_slots (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id),
  slot_date date not null,
  slot_time text not null,
  is_booked boolean not null default false,
  lead_id uuid references leads(id),
  created_at timestamptz not null default now(),
  constraint agent_slots_unique unique (agent_id, slot_date, slot_time)
);

create index agent_slots_agent_id_idx on agent_slots(agent_id);

create or replace function book_agent_slot_for_call(
  p_call_id uuid,
  p_slot_date date,
  p_slot_time text,
  p_customer_name text,
  p_phone_number text,
  p_requested_service text,
  p_notes text,
  p_booking_id text
)
returns jsonb
language plpgsql
as $$
declare
  v_agent_id uuid;
  v_slot agent_slots%rowtype;
  v_existing_lead leads%rowtype;
  v_lead_id uuid;
  v_existing_notes text;
  v_next_notes text;
  v_lead jsonb;
begin
  select calls.agent_id
  into v_agent_id
  from calls
  where calls.id = p_call_id;

  if v_agent_id is null then
    raise exception 'Call not found.';
  end if;

  select *
  into v_slot
  from agent_slots
  where agent_slots.agent_id = v_agent_id
    and agent_slots.slot_date = p_slot_date
    and agent_slots.slot_time = p_slot_time
  for update;

  if v_slot.id is null or v_slot.is_booked then
    raise exception 'That time is no longer available.';
  end if;

  select *
  into v_existing_lead
  from leads
  where leads.call_id = p_call_id
  order by leads.created_at asc
  limit 1
  for update;

  v_existing_notes := case
    when v_existing_lead.notes is not null and length(btrim(v_existing_lead.notes)) > 0
      then btrim(v_existing_lead.notes)
    else null
  end;

  v_next_notes := case
    when p_notes is not null and v_existing_notes is not null
      then v_existing_notes || E'\n\nBooking: ' || p_notes
    when p_notes is not null
      then p_notes
    else v_existing_notes
  end;

  if v_existing_lead.id is not null then
    update leads
    set
      customer_name = coalesce(leads.customer_name, p_customer_name),
      phone_number = coalesce(leads.phone_number, p_phone_number),
      requested_service = coalesce(leads.requested_service, p_requested_service),
      booking_id = coalesce(leads.booking_id, p_booking_id),
      confirmed_date = p_slot_date,
      confirmed_time = p_slot_time,
      confirmation_status = 'confirmed',
      status = 'confirmed',
      notes = v_next_notes
    where leads.id = v_existing_lead.id
    returning leads.id into v_lead_id;
  else
    insert into leads (
      call_id,
      customer_name,
      phone_number,
      requested_service,
      is_spam,
      status,
      booking_id,
      confirmed_date,
      confirmed_time,
      confirmation_status,
      notes
    )
    values (
      p_call_id,
      p_customer_name,
      p_phone_number,
      p_requested_service,
      false,
      'new',
      p_booking_id,
      p_slot_date,
      p_slot_time,
      'confirmed',
      p_notes
    )
    returning leads.id into v_lead_id;
  end if;

  update agent_slots
  set
    is_booked = true,
    lead_id = v_lead_id
  where agent_slots.id = v_slot.id;

  select to_jsonb(leads.*)
  into v_lead
  from leads
  where leads.id = v_lead_id;

  return v_lead;
end;
$$;
