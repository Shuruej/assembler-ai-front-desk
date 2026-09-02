import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = createSupabaseServiceRoleClient();

  const { data: lead, error } = await supabase
    .from("leads")
    .select(
      `
      *,
      calls (
        *,
        agents (
          business_name,
          industry,
          name
        )
      )
    `,
    )
    .eq("id", id)
    .single();

  if (error || !lead) {
    return Response.json({ error: "Lead not found." }, { status: 404 });
  }

  const call = Array.isArray(lead.calls) ? lead.calls[0] : lead.calls;
  const agent = Array.isArray(call?.agents) ? call.agents[0] : call?.agents;

  if (!call || !agent) {
    return Response.json({ error: "Lead context not found." }, { status: 404 });
  }

  return Response.json({
    lead: {
      id: lead.id,
      call_id: lead.call_id,
      customer_name: lead.customer_name,
      phone_number: lead.phone_number,
      requested_service: lead.requested_service,
      preferred_datetime: lead.preferred_datetime,
      notes: lead.notes,
      status: lead.status,
      confirmation_status: lead.confirmation_status,
      booking_id: lead.booking_id,
      confirmed_date: lead.confirmed_date,
      confirmed_time: lead.confirmed_time,
      feedback_rating: lead.feedback_rating,
      feedback_notes: lead.feedback_notes,
    },
    business_name: agent.business_name,
    industry: agent.industry,
    agent_name: agent.name,
  });
}
