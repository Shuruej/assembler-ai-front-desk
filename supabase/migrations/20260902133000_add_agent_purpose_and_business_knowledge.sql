alter table agents
  add column agent_purpose text not null default 'general_receptionist',
  add column business_knowledge text;

alter table agents
  add constraint agents_agent_purpose_check
  check (
    agent_purpose in (
      'general_receptionist',
      'appointment_booking',
      'product_inquiry',
      'customer_support',
      'lead_qualification',
      'feedback_collection'
    )
  );

comment on column agents.agent_purpose is 'Purpose template used to generate the voice agent prompt and workflow behavior.';
comment on column agents.business_knowledge is 'Lightweight business facts, FAQs, policies, products, services, and support notes used in the generated prompt.';
