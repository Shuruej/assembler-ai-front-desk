import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

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

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id")
    .eq("assemblyai_agent_id", assemblyAIAgentId)
    .single();

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

  return Response.json(call, { status: 201 });
}
