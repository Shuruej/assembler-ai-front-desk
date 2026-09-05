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
  timezone?: unknown;
  follow_up_preferences?: unknown;
  confirmation_call_enabled?: boolean | null;
  feedback_enabled?: boolean | null;
};

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
  let timezone: string | null;

  try {
    industry = normalizeOptionalString(body.industry, "industry");
    agentPurpose = normalizeAgentPurpose(body.agent_purpose);
    businessKnowledge = normalizeOptionalString(
      body.business_knowledge,
      "business_knowledge",
    );
    businessHoursStart = normalizeOptionalString(
      body.business_hours_start,
      "business_hours_start",
    );
    businessHoursEnd = normalizeOptionalString(
      body.business_hours_end,
      "business_hours_end",
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
        timezone,
        assemblyai_agent_id: assemblyAIAgent.id,
        ...preferences,
      })
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
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
