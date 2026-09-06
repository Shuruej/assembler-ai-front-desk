import { updateAssemblyAIAgent } from "@/lib/assemblyai/client";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type UpdateAgentRequestBody = {
  business_name?: unknown;
  industry?: unknown;
  name?: unknown;
  agent_purpose?: unknown;
  business_knowledge?: unknown;
  business_hours_start?: unknown;
  business_hours_end?: unknown;
  business_days?: unknown;
  appointment_duration_minutes?: unknown;
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

function normalizeBusinessTimeString(
  value: unknown,
  fieldName: string,
  fallback: string,
): string {
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

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = createSupabaseServiceRoleClient();
  const { data: agent, error } = await supabase
    .from("agents")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !agent) {
    return Response.json({ error: "Agent not found." }, { status: 404 });
  }

  return Response.json(agent);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let body: UpdateAgentRequestBody;

  try {
    body = (await request.json()) as UpdateAgentRequestBody;
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
  let businessHoursStart: string;
  let businessHoursEnd: string;
  let businessDays: string;
  let appointmentDurationMinutes: number;

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
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request body." },
      { status: 400 },
    );
  }

  const businessName = body.business_name.trim();
  const name = body.name.trim();
  const supabase = createSupabaseServiceRoleClient();
  const { data: existingAgent, error: lookupError } = await supabase
    .from("agents")
    .select("*")
    .eq("id", id)
    .single();

  if (lookupError || !existingAgent) {
    return Response.json({ error: "Agent not found." }, { status: 404 });
  }

  if (!existingAgent.assemblyai_agent_id) {
    return Response.json(
      { error: "Agent is missing an AssemblyAI agent id." },
      { status: 400 },
    );
  }

  try {
    await updateAssemblyAIAgent(existingAgent.assemblyai_agent_id, {
      businessName,
      industry,
      name,
      agentPurpose,
      businessKnowledge,
      businessHoursStart,
      businessHoursEnd,
      timezone: existingAgent.timezone,
      confirmationCallEnabled: existingAgent.confirmation_call_enabled,
      feedbackEnabled: existingAgent.feedback_enabled,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update AssemblyAI agent.",
      },
      { status: 502 },
    );
  }

  const { data: agent, error } = await supabase
    .from("agents")
    .update({
      business_name: businessName,
      industry,
      name,
      agent_purpose: agentPurpose,
      business_knowledge: businessKnowledge,
      business_hours_start: businessHoursStart,
      business_hours_end: businessHoursEnd,
      business_days: businessDays,
      appointment_duration_minutes: appointmentDurationMinutes,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(agent);
}
