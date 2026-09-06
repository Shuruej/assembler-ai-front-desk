import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { logSimulatedSms } from "@/lib/sms";

type EscalateLeadRequestBody = {
  call_id?: unknown;
  reason?: unknown;
  customer_name?: unknown;
  phone_number?: unknown;
  notes?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeOptionalString(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string when provided.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mergeEscalationNotes(
  existingValue: string | null,
  newValue: string | null,
): string | null {
  const existingNotes =
    typeof existingValue === "string" && existingValue.trim().length > 0
      ? existingValue.trim()
      : null;

  return newValue && existingNotes
    ? `${existingNotes}\n\nEscalation: ${newValue}`
    : newValue ?? existingNotes;
}

async function logEscalationAlert({
  supabase,
  callId,
  lead,
  reason,
}: {
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>;
  callId: string;
  lead: {
    id: string;
    customer_name: string | null;
    phone_number: string | null;
  };
  reason: string;
}) {
  const { data: call, error } = await supabase
    .from("calls")
    .select("agent_id")
    .eq("id", callId)
    .single();

  if (error) {
    console.error("Failed to resolve call for simulated SMS.", error);
  }

  if (call?.agent_id) {
    await logSimulatedSms({
      agentId: call.agent_id,
      leadId: lead.id,
      toNumber: null,
      purpose: "escalation_alert",
      message: `Escalation: ${reason}. Caller: ${lead.customer_name ?? "Unknown"}, ${lead.phone_number ?? "No phone number"}.`,
    });
  }
}

export async function POST(request: Request) {
  let body: EscalateLeadRequestBody;

  try {
    body = (await request.json()) as EscalateLeadRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Request body must be an object." }, { status: 400 });
  }

  if (!isNonEmptyString(body.call_id)) {
    return Response.json({ error: "call_id is required." }, { status: 400 });
  }

  if (!isNonEmptyString(body.reason)) {
    return Response.json({ error: "reason is required." }, { status: 400 });
  }

  let customerName: string | null;
  let phoneNumber: string | null;
  let notes: string | null;

  try {
    customerName = normalizeOptionalString(body.customer_name, "customer_name");
    phoneNumber = normalizeOptionalString(body.phone_number, "phone_number");
    notes = normalizeOptionalString(body.notes, "notes");
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request body." },
      { status: 400 },
    );
  }

  const callId = body.call_id.trim();
  const reason = body.reason.trim();
  const supabase = createSupabaseServiceRoleClient();
  const { data: existingLead, error: lookupError } = await supabase
    .from("leads")
    .select("*")
    .eq("call_id", callId)
    .maybeSingle();

  if (lookupError) {
    return Response.json({ error: lookupError.message }, { status: 500 });
  }

  if (existingLead) {
    const { data: lead, error: updateError } = await supabase
      .from("leads")
      .update({
        needs_human: true,
        escalation_reason: reason,
        notes: mergeEscalationNotes(existingLead.notes, notes),
      })
      .eq("id", existingLead.id)
      .select()
      .single();

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    await logEscalationAlert({ supabase, callId, lead, reason });

    return Response.json(lead);
  }

  const { data: lead, error: insertError } = await supabase
    .from("leads")
    .insert({
      call_id: callId,
      customer_name: customerName,
      phone_number: phoneNumber,
      notes,
      is_spam: false,
      status: "new",
      confirmation_status: "not_applicable",
      needs_human: true,
      escalation_reason: reason,
    })
    .select()
    .single();

  if (insertError) {
    return Response.json({ error: insertError.message }, { status: 500 });
  }

  await logEscalationAlert({ supabase, callId, lead, reason });

  return Response.json(lead, { status: 201 });
}
