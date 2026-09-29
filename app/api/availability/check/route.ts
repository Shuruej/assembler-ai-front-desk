import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { checkGoogleCalendarAvailability, validateGoogleCalendarConfig } from "@/lib/google-calendar";
import { getReviewerSessionId } from "@/lib/reviewer";

type CheckAvailabilityRequestBody = {
  call_id?: unknown;
  requested_date?: unknown;
};

const DEFAULT_BUSINESS_DAYS = "mon,tue,wed,thu,fri,sat,sun";
const DAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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
    .select("agent_id, agents (*)")
    .eq("id", callId)
    .single();

  if (callError || !call) {
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

  if (sharedCalendar?.status === "configured") {
    try {
      const config = validateGoogleCalendarConfig(sharedCalendar.config);
      const availableTimes = await checkGoogleCalendarAvailability(
        null,
        requestedDate,
        agent?.business_hours_start ?? "09:00",
        agent?.business_hours_end ?? "18:00",
        normalizeAppointmentDuration(agent?.appointment_duration_minutes),
        config.calendarId,
        config.timeZone,
      );
      return Response.json({ available_times: availableTimes, source: "google_calendar_shared" });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Shared Google Calendar availability check failed." }, { status: 502 });
    }
  }

  if (agent?.google_calendar_connected && agent.google_refresh_token) {
    try {
      const availableTimes = await checkGoogleCalendarAvailability(
        agent.google_refresh_token,
        requestedDate,
        agent.business_hours_start ?? "09:00",
        agent.business_hours_end ?? "18:00",
        normalizeAppointmentDuration(agent.appointment_duration_minutes),
        "primary",
        agent.timezone ?? "UTC",
      );

      return Response.json({
        available_times: availableTimes,
        source: "google_calendar",
      });
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Google Calendar availability check failed.",
        },
        { status: 502 },
      );
    }
  }

  if (agent && !getBusinessDays(agent.business_days).has(getDayCode(requestedDate))) {
    return Response.json({
      available_times: [],
      source: "closed",
    });
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
    source: "internal",
  });
}
