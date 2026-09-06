import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type CheckAvailabilityRequestBody = {
  call_id?: unknown;
  requested_date?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(request: Request) {
  let body: CheckAvailabilityRequestBody;

  try {
    body = (await request.json()) as CheckAvailabilityRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  if (!isNonEmptyString(body.call_id)) {
    return Response.json({ error: "call_id is required." }, { status: 400 });
  }

  if (!isNonEmptyString(body.requested_date)) {
    return Response.json({ error: "requested_date is required." }, { status: 400 });
  }

  const callId = body.call_id.trim();
  const requestedDate = body.requested_date.trim();

  if (!isValidDateOnly(requestedDate)) {
    return Response.json(
      { error: "requested_date must be in YYYY-MM-DD format." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data: call, error: callError } = await supabase
    .from("calls")
    .select("agent_id")
    .eq("id", callId)
    .single();

  if (callError || !call) {
    return Response.json({ error: "Call not found." }, { status: 404 });
  }

  const { data: slots, error: slotsError } = await supabase
    .from("agent_slots")
    .select("slot_time")
    .eq("agent_id", call.agent_id)
    .eq("slot_date", requestedDate)
    .eq("is_booked", false)
    .order("slot_time", { ascending: true });

  if (slotsError) {
    return Response.json({ error: slotsError.message }, { status: 500 });
  }

  return Response.json({
    available_times: (slots ?? []).map((slot) => slot.slot_time),
  });
}
