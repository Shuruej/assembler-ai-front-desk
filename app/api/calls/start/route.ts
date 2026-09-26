import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { buildRuntimeSystemPrompt } from "@/lib/assemblyai/client";
import { normalizeAgentFollowUpPreferences } from "@/lib/follow-up-preferences";

type StartCallRequestBody = {
  assemblyai_agent_id?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: Request) {
  let body: StartCallRequestBody;

  try {
    body = (await request.json()) as StartCallRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  if (!isNonEmptyString(body.assemblyai_agent_id)) {
    return Response.json(
      { error: "assemblyai_agent_id is required." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServiceRoleClient();
  const assemblyAIAgentId = body.assemblyai_agent_id.trim();

  let { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id,name,business_name,industry,agent_purpose,business_knowledge,business_hours_start,business_hours_end,business_days,timezone,confirmation_call_enabled,feedback_enabled,blueprint")
    .eq("assemblyai_agent_id", assemblyAIAgentId)
    .single();
  if (agentError?.code === "42703" || agentError?.code === "PGRST204") {
    ({ data: agent, error: agentError } = await supabase.from("agents").select("id,name,business_name,industry,agent_purpose,business_knowledge,business_hours_start,business_hours_end,business_days,timezone,confirmation_call_enabled,feedback_enabled").eq("assemblyai_agent_id", assemblyAIAgentId).single());
  }

  if (agentError || !agent) {
    return Response.json(
      { error: "No agent found for the provided assemblyai_agent_id." },
      { status: 404 },
    );
  }

  const { data: call, error: callError } = await supabase
    .from("calls")
    .insert({
      agent_id: agent.id,
      started_at: new Date().toISOString(),
      status: "in_progress",
    })
    .select()
    .single();

  if (callError) {
    return Response.json({ error: callError.message }, { status: 500 });
  }

  const preferences = normalizeAgentFollowUpPreferences(agent);

  return Response.json(
    {
      ...call,
      ...preferences,
      session_prompt: buildRuntimeSystemPrompt({
        name: agent.name ?? "the AI receptionist",
        businessName: agent.business_name ?? "the business",
        industry: agent.industry,
        agentPurpose: agent.agent_purpose,
        businessKnowledge: agent.business_knowledge,
        businessHoursStart: agent.business_hours_start,
        businessHoursEnd: agent.business_hours_end,
        businessDays: agent.business_days,
        timezone: agent.timezone,
        confirmationCallEnabled: preferences.confirmation_call_enabled,
        feedbackEnabled: preferences.feedback_enabled,
        blueprint: agent.blueprint,
      }),
      timezone: agent.timezone ?? "Asia/Karachi",
      uses_blueprint: Boolean(agent.blueprint),
    },
    { status: 201 },
  );
}
