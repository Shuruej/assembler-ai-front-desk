import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type ConfirmLeadRequestBody = {
  confirmed_date?: unknown;
  confirmed_time?: unknown;
  notes?: unknown;
};

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

function isValidDateOnly(value: string | null): boolean {
  return value === null || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function generateBookingId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let bookingId = "";

  for (let index = 0; index < 8; index += 1) {
    bookingId += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return bookingId;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let body: ConfirmLeadRequestBody;

  try {
    body = (await request.json()) as ConfirmLeadRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  let confirmedDate: string | null;
  let confirmedTime: string | null;
  let notes: string | null;

  try {
    confirmedDate = normalizeOptionalString(body.confirmed_date, "confirmed_date");
    confirmedTime = normalizeOptionalString(body.confirmed_time, "confirmed_time");
    notes = normalizeOptionalString(body.notes, "notes");
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request body." },
      { status: 400 },
    );
  }

  if (!isValidDateOnly(confirmedDate)) {
    return Response.json(
      { error: "confirmed_date must be in YYYY-MM-DD format when provided." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data: existingLead, error: lookupError } = await supabase
    .from("leads")
    .select("booking_id, notes")
    .eq("id", id)
    .single();

  if (lookupError || !existingLead) {
    return Response.json({ error: "Lead not found." }, { status: 404 });
  }

  const existingNotes =
    typeof existingLead.notes === "string" && existingLead.notes.trim().length > 0
      ? existingLead.notes.trim()
      : null;
  const nextNotes =
    notes && existingNotes ? `${existingNotes}\n\nConfirmation: ${notes}` : notes ?? existingNotes;

  const { data: lead, error: updateError } = await supabase
    .from("leads")
    .update({
      booking_id: existingLead.booking_id ?? generateBookingId(),
      confirmed_date: confirmedDate,
      confirmed_time: confirmedTime,
      confirmation_status: "confirmed",
      notes: nextNotes,
    })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  return Response.json(lead);
}
