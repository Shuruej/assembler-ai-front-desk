import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type StartConfirmationCallRequestBody = {
  lead_id?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: Request) {
  let body: StartConfirmationCallRequestBody;

  try {
    body = (await request.json()) as StartConfirmationCallRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  if (!isNonEmptyString(body.lead_id)) {
    return Response.json({ error: "lead_id is required." }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const leadId = body.lead_id.trim();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("calls (agent_id)")
    .eq("id", leadId)
    .single();

  const call = Array.isArray(lead?.calls) ? lead?.calls[0] : lead?.calls;

  if (leadError || !lead || !call?.agent_id) {
    return Response.json(
      { error: "No lead call found for the provided lead_id." },
      { status: 404 },
    );
  }

  const { data: confirmationCall, error: callError } = await supabase
    .from("calls")
    .insert({
      agent_id: call.agent_id,
      started_at: new Date().toISOString(),
      status: "in_progress",
      call_type: "confirmation",
    })
    .select()
    .single();

  if (callError) {
    return Response.json({ error: callError.message }, { status: 500 });
  }

  return Response.json(confirmationCall, { status: 201 });
}
