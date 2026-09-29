import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { createGoogleCalendarEvent, validateGoogleCalendarConfig } from "@/lib/google-calendar";
import { appendRecordToGoogleSheet, isGoogleSheetsServiceAccountConfigured, validateGoogleSheetsConfig } from "@/lib/google-sheets";
import { decryptSecret } from "@/lib/assembler/connections";
import { getReviewerSessionId } from "@/lib/reviewer";
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

const DEFAULT_BUSINESS_DAYS = "mon,tue,wed,thu,fri,sat,sun";
const DAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

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

function getDayCode(dateISO: string): string {
  return DAY_CODES[new Date(`${dateISO}T00:00:00`).getDay()];
}

function getBusinessDays(value: unknown): Set<string> {
  const rawDays = typeof value === "string" && value.trim().length > 0
    ? value
    : DEFAULT_BUSINESS_DAYS;

  return new Set(
    rawDays
      .split(",")
      .map((day) => day.trim().toLowerCase())
      .filter((day) => DAY_CODES.includes(day)),
  );
}

function normalizeAppointmentDuration(value: unknown): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 480
    ? value
    : 60;
}

function generateBookingId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let bookingId = "";

  for (let index = 0; index < 8; index += 1) {
    bookingId += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return bookingId;
}

function mergeBookingNotes(
  existingValue: string | null,
  newValue: string | null,
): string | null {
  const existingNotes =
    typeof existingValue === "string" && existingValue.trim().length > 0
      ? existingValue.trim()
      : null;

  return newValue && existingNotes
    ? `${existingNotes}\n\nBooking: ${newValue}`
    : newValue ?? existingNotes;
}

async function logBookingConfirmationSms({
  agentId,
  lead,
}: {
  agentId: string;
  lead: {
    id: string;
    customer_name: string | null;
    phone_number: string | null;
    confirmed_date: string | null;
    confirmed_time: string | null;
    booking_id: string | null;
  };
}) {
  await logSimulatedSms({
    agentId,
    leadId: lead.id,
    toNumber: lead.phone_number,
    purpose: "booking_confirmation",
    message: `Hi ${lead.customer_name ?? "there"}, your appointment is confirmed for ${lead.confirmed_date} at ${lead.confirmed_time}. Booking ID: ${lead.booking_id}.`,
  });
}

type BookingSheetsSync = "not_connected" | "synced" | "failed";

async function syncBookingToGoogleSheet({
  supabase,
  reviewerId,
  agentId,
  callId,
  lead,
}: {
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>;
  reviewerId: string | null;
  agentId: string;
  callId: string;
  lead: {
    booking_id?: string | null;
    customer_name?: string | null;
    phone_number?: string | null;
    requested_service?: string | null;
    confirmed_date?: string | null;
    confirmed_time?: string | null;
    google_event_id?: string | null;
  };
}): Promise<BookingSheetsSync> {
  const reviewerLookup = reviewerId
    ? await supabase
        .from("reviewer_sheet_connections")
        .select("config,status")
        .eq("reviewer_id", reviewerId)
        .eq("agent_id", agentId)
        .maybeSingle()
    : null;
  const ownerLookup = !reviewerLookup?.data || reviewerLookup.data.status !== "configured"
    ? await supabase
        .from("agent_connections")
        .select("kind,config,encrypted_secret,status")
        .eq("agent_id", agentId)
        .eq("connection_key", "google_sheets")
        .maybeSingle()
    : null;

  const connection = (reviewerLookup?.data?.status === "configured"
    ? reviewerLookup.data
    : ownerLookup?.data) as {
    kind?: string;
    config?: unknown;
    encrypted_secret?: string | null;
    status?: string;
  } | null;

  if (
    !connection ||
    connection.status !== "configured" ||
    (!reviewerId && connection.kind !== "google_sheets") ||
    (!reviewerId && !connection.encrypted_secret && !isGoogleSheetsServiceAccountConfigured())
  ) {
    return "not_connected";
  }

  try {
    const payload: Record<string, unknown> = {
      booking_id: lead.booking_id ?? "",
      customer_name: lead.customer_name ?? "",
      phone_number: lead.phone_number ?? "",
      requested_service: lead.requested_service ?? "",
      booking_date: lead.confirmed_date ?? "",
      booking_time: lead.confirmed_time ?? "",
      google_event_id: lead.google_event_id ?? "",
    };
    await appendRecordToGoogleSheet(
      !reviewerId && connection.encrypted_secret
        ? decryptSecret(connection.encrypted_secret)
        : null,
      validateGoogleSheetsConfig(connection.config),
      {
        recordType: "booking",
        callId,
        payload,
        fields: [
          { key: "booking_id", label: "Booking ID" },
          { key: "customer_name", label: "Customer name" },
          { key: "phone_number", label: "Phone number" },
          { key: "requested_service", label: "Requested service" },
          { key: "booking_date", label: "Booking date" },
          { key: "booking_time", label: "Booking time" },
          { key: "google_event_id", label: "Google Calendar event ID" },
        ],
      },
    );
    return "synced";
  } catch (error) {
    console.error(
      "Google Sheets booking sync failed.",
      error instanceof Error ? error.message : "Unknown sync error",
    );
    return "failed";
  }
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
  const { data: call, error: callLookupError } = await supabase
    .from("calls")
    .select("agent_id, agents (*)")
    .eq("id", callId)
    .single();

  if (callLookupError || !call) {
    return Response.json({ error: "Call not found." }, { status: 404 });
  }

  const agent = Array.isArray(call.agents) ? call.agents[0] : call.agents;
  const reviewerId = request.headers.get("x-assembler-reviewer-id") ?? await getReviewerSessionId(request);
  const reviewerCalendarLookup = reviewerId
    ? await supabase.from("reviewer_calendar_connections").select("config,status").eq("reviewer_id", reviewerId).eq("agent_id", call.agent_id).maybeSingle()
    : null;
  const demoCalendarLookup = !reviewerCalendarLookup?.data || reviewerCalendarLookup.data.status !== "configured"
    ? await supabase.from("agent_connections").select("config,status").eq("agent_id", call.agent_id).eq("connection_key", "google_calendar").maybeSingle()
    : null;
  const sharedCalendar = reviewerCalendarLookup?.data?.status === "configured"
    ? reviewerCalendarLookup.data
    : demoCalendarLookup?.data;
  const hasSharedCalendar = sharedCalendar?.status === "configured";
  const hasLegacyCalendar = Boolean(agent?.google_calendar_connected && agent.google_refresh_token);

  if (hasSharedCalendar || hasLegacyCalendar) {
    try {
      const sharedConfig = hasSharedCalendar ? validateGoogleCalendarConfig(sharedCalendar.config) : null;
      const bookingId = generateBookingId();
      const googleEventId = await createGoogleCalendarEvent(
        sharedConfig ? null : agent.google_refresh_token,
        slotDate,
        slotTime,
        normalizeAppointmentDuration(agent.appointment_duration_minutes),
        `Appointment: ${customerName}`,
        [
          requestedService ? `Service: ${requestedService}` : null,
          notes ? `Notes: ${notes}` : null,
        ].filter(Boolean).join("\n\n"),
        sharedConfig?.calendarId ?? "primary",
        sharedConfig?.timeZone ?? agent.timezone ?? "UTC",
      );
      const { data: existingLead, error: leadLookupError } = await supabase
        .from("leads")
        .select("*")
        .eq("call_id", callId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (leadLookupError) {
        return Response.json({ error: leadLookupError.message }, { status: 500 });
      }

      const nextNotes = mergeBookingNotes(existingLead?.notes ?? null, notes);
      const leadWrite = existingLead
        ? await supabase
            .from("leads")
            .update({
              customer_name: existingLead.customer_name ?? customerName,
              phone_number: existingLead.phone_number ?? phoneNumber,
              requested_service: existingLead.requested_service ?? requestedService,
              booking_id: existingLead.booking_id ?? bookingId,
              confirmed_date: slotDate,
              confirmed_time: slotTime,
              confirmation_status: "confirmed",
              status: "confirmed",
              notes: nextNotes,
              google_event_id: googleEventId,
            })
            .eq("id", existingLead.id)
            .select()
            .single()
        : await supabase
            .from("leads")
            .insert({
              call_id: callId,
              customer_name: customerName,
              phone_number: phoneNumber,
              requested_service: requestedService,
              is_spam: false,
              status: "new",
              booking_id: bookingId,
              confirmed_date: slotDate,
              confirmed_time: slotTime,
              confirmation_status: "confirmed",
              notes,
              google_event_id: googleEventId,
            })
            .select()
            .single();

      if (leadWrite.error || !leadWrite.data) {
        return Response.json(
          { error: leadWrite.error?.message ?? "Failed to save lead." },
          { status: 500 },
        );
      }

      await logBookingConfirmationSms({
        agentId: call.agent_id,
        lead: leadWrite.data,
      });
      const googleSheetsSync = await syncBookingToGoogleSheet({
        supabase,
        reviewerId,
        agentId: call.agent_id,
        callId,
        lead: leadWrite.data,
      });

      return Response.json({ ...leadWrite.data, google_sheets_sync: googleSheetsSync });
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Google Calendar booking failed.",
        },
        { status: 502 },
      );
    }
  }

  if (agent && !getBusinessDays(agent.business_days).has(getDayCode(slotDate))) {
    return Response.json(
      { error: "This business is closed on that day." },
      { status: 400 },
    );
  }

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

  let googleSheetsSync: BookingSheetsSync = "not_connected";
  if (call.agent_id) {
    await logBookingConfirmationSms({
      agentId: call.agent_id,
      lead,
    });
    googleSheetsSync = await syncBookingToGoogleSheet({
      supabase,
      reviewerId,
      agentId: call.agent_id,
      callId,
      lead,
    });
  }

  return Response.json({ ...lead, google_sheets_sync: googleSheetsSync });
}
