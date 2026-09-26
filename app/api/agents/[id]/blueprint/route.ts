import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { updateAssemblyAIAgent } from "@/lib/assemblyai/client";
import { BlueprintValidationError, validateAgentBlueprint } from "@/lib/assembler/blueprint";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON request." }, { status: 400 }); }
  let blueprint;
  try { blueprint = validateAgentBlueprint(body?.blueprint); }
  catch (error) { return Response.json({ error: error instanceof BlueprintValidationError ? "Blueprint is invalid. Review field and reference values." : "Invalid request." }, { status: 400 }); }
  const supabase = createSupabaseServiceRoleClient();
  const { data: agent } = await supabase.from("agents").select("id,assemblyai_agent_id,name,business_name,industry,agent_purpose,business_knowledge,business_hours_start,business_hours_end,business_days,timezone,confirmation_call_enabled,feedback_enabled").eq("id", id).single();
  if (!agent?.assemblyai_agent_id) return Response.json({ error: "Agent not found." }, { status: 404 });
  try {
    await updateAssemblyAIAgent(agent.assemblyai_agent_id, {
      name: agent.name, businessName: agent.business_name, industry: agent.industry,
      agentPurpose: agent.agent_purpose, businessKnowledge: agent.business_knowledge,
      businessHoursStart: agent.business_hours_start, businessHoursEnd: agent.business_hours_end,
      businessDays: agent.business_days, timezone: agent.timezone,
      confirmationCallEnabled: agent.confirmation_call_enabled, feedbackEnabled: agent.feedback_enabled,
      blueprint,
    });
  } catch { return Response.json({ error: "Could not update the live voice agent." }, { status: 502 }); }
  const { data, error } = await supabase.from("agents").update({ blueprint }).eq("id", id).select("id,blueprint").single();
  if (error) return Response.json({ error: "Live agent updated, but blueprint storage failed. Retry to synchronize." }, { status: 500 });
  return Response.json(data);
}
