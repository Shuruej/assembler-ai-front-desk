import { createAssemblyAIAgent } from "@/lib/assemblyai/client";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  normalizeAgentFollowUpPreferences,
  normalizeFollowUpPreferences,
} from "@/lib/follow-up-preferences";

type CreateAgentRequestBody = {
  business_name?: unknown;
  industry?: unknown;
  name?: unknown;
  agent_purpose?: unknown;
  business_knowledge?: unknown;
  business_hours_start?: unknown;
  business_hours_end?: unknown;
  business_days?: unknown;
  appointment_duration_minutes?: unknown;
  timezone?: unknown;
  follow_up_preferences?: unknown;
  confirmation_call_enabled?: boolean | null;
  feedback_enabled?: boolean | null;
};

const DEFAULT_BUSINESS_DAYS = "mon,tue,wed,thu,fri,sat,sun";
const DEFAULT_BUSINESS_HOURS_START = "09:00";
const DEFAULT_BUSINESS_HOURS_END = "18:00";
const DEFAULT_APPOINTMENT_DURATION_MINUTES = 60;
const DAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const VALID_AGENT_PURPOSES = new Set([
  "general_receptionist",
  "appointment_booking",
  "product_inquiry",
  "customer_support",
  "lead_qualification",
  "feedback_collection",
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeOptionalString(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string when provided.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeAgentPurpose(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "general_receptionist";
  }

  if (typeof value !== "string") {
    throw new Error("agent_purpose must be a string when provided.");
  }

  const trimmed = value.trim();

  if (!VALID_AGENT_PURPOSES.has(trimmed)) {
    throw new Error("agent_purpose is not supported.");
  }

  return trimmed;
}

function normalizeBusinessTimeString(value: unknown, fieldName: string, fallback: string): string {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string when provided.`);
  }

  const trimmed = value.trim();

  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(trimmed)) {
    throw new Error(`${fieldName} must use HH:MM format.`);
  }

  return trimmed;
}

function parseBusinessHour(value: string | null, fallback: number): number {
  if (!value) return fallback;

  const match = value.trim().match(/^([01]?\d|2[0-3])(?::[0-5]\d)?$/);
  if (!match) return fallback;

  return Number(match[1]);
}

function parseBusinessTime(value: string | null, fallbackHour: number): number {
  if (!value) return fallbackHour * 60;

  const match = value.trim().match(/^([01]?\d|2[0-3])(?::([0-5]\d))?$/);
  if (!match) return fallbackHour * 60;

  return Number(match[1]) * 60 + Number(match[2] ?? "0");
}

function normalizeAppointmentDuration(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_APPOINTMENT_DURATION_MINUTES;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("appointment_duration_minutes must be an integer.");
  }

  if (value <= 0 || value > 480) {
    throw new Error("appointment_duration_minutes must be between 1 and 480.");
  }

  return value;
}

function normalizeBusinessDays(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return DEFAULT_BUSINESS_DAYS;
  }

  const validDays = value
    .split(",")
    .map((day) => day.trim().toLowerCase())
    .filter((day) => DAY_CODES.includes(day));

  return validDays.length > 0
    ? Array.from(new Set(validDays)).join(",")
    : DEFAULT_BUSINESS_DAYS;
}

function getDayCode(date: Date): string {
  return DAY_CODES[date.getDay()];
}

function formatSlotTime(totalMinutes: number): string {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatSlotDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function buildInitialAgentSlots(
  agentId: string,
  businessHoursStart: string | null,
  businessHoursEnd: string | null,
  businessDays: string,
  appointmentDurationMinutes: number,
) {
  const startMinutes = parseBusinessTime(businessHoursStart, 9);
  const endMinutes = parseBusinessTime(businessHoursEnd, 18);
  const normalizedStartMinutes = startMinutes < endMinutes ? startMinutes : 9 * 60;
  const normalizedEndMinutes = startMinutes < endMinutes ? endMinutes : 18 * 60;
  const openDays = new Set(businessDays.split(",").map((day) => day.trim()));
  const today = new Date();
  const slots: {
    agent_id: string;
    slot_date: string;
    slot_time: string;
  }[] = [];

  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    const slotDate = new Date(today);
    slotDate.setDate(today.getDate() + dayOffset);

    if (!openDays.has(getDayCode(slotDate))) {
      continue;
    }

    for (
      let minutes = normalizedStartMinutes;
      minutes + appointmentDurationMinutes <= normalizedEndMinutes;
      minutes += appointmentDurationMinutes
    ) {
      slots.push({
        agent_id: agentId,
        slot_date: formatSlotDate(slotDate),
        slot_time: formatSlotTime(minutes),
      });
    }
  }

  return slots;
}

export async function GET() {
  const supabase = createSupabaseServiceRoleClient();
  const { data: agents, error } = await supabase
    .from("agents")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(agents ?? []);
}

export async function POST(request: Request) {
  let body: CreateAgentRequestBody;

  try {
    body = (await request.json()) as CreateAgentRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  if (!isNonEmptyString(body.business_name)) {
    return Response.json({ error: "business_name is required." }, { status: 400 });
  }

  if (!isNonEmptyString(body.name)) {
    return Response.json({ error: "name is required." }, { status: 400 });
  }

  let industry: string | null;
  let agentPurpose: string;
  let businessKnowledge: string | null;
  let businessHoursStart: string | null;
  let businessHoursEnd: string | null;
  let businessDays: string;
  let appointmentDurationMinutes: number;
  let timezone: string | null;

  try {
    industry = normalizeOptionalString(body.industry, "industry");
    agentPurpose = normalizeAgentPurpose(body.agent_purpose);
    businessKnowledge = normalizeOptionalString(
      body.business_knowledge,
      "business_knowledge",
    );
    businessHoursStart = normalizeBusinessTimeString(
      body.business_hours_start,
      "business_hours_start",
      DEFAULT_BUSINESS_HOURS_START,
    );
    businessHoursEnd = normalizeBusinessTimeString(
      body.business_hours_end,
      "business_hours_end",
      DEFAULT_BUSINESS_HOURS_END,
    );
    businessDays = normalizeBusinessDays(body.business_days);
    appointmentDurationMinutes = normalizeAppointmentDuration(
      body.appointment_duration_minutes,
    );
    timezone = normalizeOptionalString(body.timezone, "timezone");
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request body." },
      { status: 400 },
    );
  }

  const businessName = body.business_name.trim();
  const name = body.name.trim();
  for (const key of ["confirmation_call_enabled", "feedback_enabled"] as const) {
    if (body[key] != null && typeof body[key] !== "boolean") {
      return Response.json({ error: `${key} must be a boolean.` }, { status: 400 });
    }
  }
  const uiPreferences = normalizeFollowUpPreferences(body.follow_up_preferences);
  const preferences = normalizeAgentFollowUpPreferences({
    confirmation_call_enabled:
      typeof body.confirmation_call_enabled === "boolean"
        ? body.confirmation_call_enabled
        : uiPreferences.confirm_appointments_by_phone,
    feedback_enabled:
      typeof body.feedback_enabled === "boolean"
        ? body.feedback_enabled
        : uiPreferences.collect_feedback_after_confirmation,
  });

  try {
    const assemblyAIAgent = await createAssemblyAIAgent({
      businessName,
      industry,
      name,
      agentPurpose,
      businessKnowledge,
      businessHoursStart,
      businessHoursEnd,
      timezone,
      confirmationCallEnabled: preferences.confirmation_call_enabled,
      feedbackEnabled: preferences.feedback_enabled,
    });

    const supabase = createSupabaseServiceRoleClient();
    const { data: agent, error } = await supabase
      .from("agents")
      .insert({
        business_name: businessName,
        industry,
        name,
        agent_purpose: agentPurpose,
        business_knowledge: businessKnowledge,
        business_hours_start: businessHoursStart,
        business_hours_end: businessHoursEnd,
        business_days: businessDays,
        appointment_duration_minutes: appointmentDurationMinutes,
        timezone,
        assemblyai_agent_id: assemblyAIAgent.id,
        ...preferences,
      })
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    try {
      const slots = buildInitialAgentSlots(
        agent.id,
        businessHoursStart,
        businessHoursEnd,
        businessDays,
        appointmentDurationMinutes,
      );

      if (slots.length > 0) {
        const { error: slotError } = await supabase.from("agent_slots").insert(slots);

        if (slotError) {
          console.error("Failed to create initial agent slots.", slotError);
        }
      }
    } catch (slotError) {
      console.error("Failed to create initial agent slots.", slotError);
    }

    return Response.json(agent, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create voice agent.",
      },
      { status: 500 },
    );
  }
}
