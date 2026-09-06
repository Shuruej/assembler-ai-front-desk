import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { logSimulatedSms } from "@/lib/sms";

type BookSlotRequestBody = {
  call_id?: unknown;
  slot_date?: unknown;
  slot_time?: unknown;
  customer_name?: unknown;
  phone_number?: unknown;
  requested_service?: unknown;
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

function isValidDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function generateBookingId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let bookingId = "";

  for (let index = 0; index < 8; index += 1) {
    bookingId += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return bookingId;
}

export async function POST(request: Request) {
  let body: BookSlotRequestBody;

  try {
    body = (await request.json()) as BookSlotRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  if (!isNonEmptyString(body.call_id)) {
    return Response.json({ error: "call_id is required." }, { status: 400 });
  }

  if (!isNonEmptyString(body.slot_date)) {
    return Response.json({ error: "slot_date is required." }, { status: 400 });
  }

  if (!isNonEmptyString(body.slot_time)) {
    return Response.json({ error: "slot_time is required." }, { status: 400 });
  }

  if (!isNonEmptyString(body.customer_name)) {
    return Response.json({ error: "customer_name is required." }, { status: 400 });
  }

  if (!isNonEmptyString(body.phone_number)) {
    return Response.json({ error: "phone_number is required." }, { status: 400 });
  }

  const callId = body.call_id.trim();
  const slotDate = body.slot_date.trim();
  const slotTime = body.slot_time.trim();
  const customerName = body.customer_name.trim();
  const phoneNumber = body.phone_number.trim();
  let requestedService: string | null;
  let notes: string | null;

  try {
    requestedService = normalizeOptionalString(
      body.requested_service,
      "requested_service",
    );
    notes = normalizeOptionalString(body.notes, "notes");
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request body." },
      { status: 400 },
    );
  }

  if (!isValidDateOnly(slotDate)) {
    return Response.json(
      { error: "slot_date must be in YYYY-MM-DD format." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data: lead, error } = await supabase.rpc("book_agent_slot_for_call", {
    p_call_id: callId,
    p_slot_date: slotDate,
    p_slot_time: slotTime,
    p_customer_name: customerName,
    p_phone_number: phoneNumber,
    p_requested_service: requestedService,
    p_notes: notes,
    p_booking_id: generateBookingId(),
  });

  if (error) {
    if (error.message.includes("That time is no longer available.")) {
      return Response.json(
        { error: "That time is no longer available." },
        { status: 409 },
      );
    }

    if (error.message.includes("Call not found.")) {
      return Response.json({ error: "Call not found." }, { status: 404 });
    }

    return Response.json({ error: error.message }, { status: 500 });
  }

  const { data: call, error: callLookupError } = await supabase
    .from("calls")
    .select("agent_id")
    .eq("id", callId)
    .single();

  if (callLookupError) {
    console.error("Failed to resolve call for simulated SMS.", callLookupError);
  }

  if (call?.agent_id) {
    await logSimulatedSms({
      agentId: call.agent_id,
      leadId: lead.id,
      toNumber: lead.phone_number,
      purpose: "booking_confirmation",
      message: `Hi ${lead.customer_name ?? "there"}, your appointment is confirmed for ${lead.confirmed_date} at ${lead.confirmed_time}. Booking ID: ${lead.booking_id}.`,
    });
  }

  return Response.json(lead);
}
