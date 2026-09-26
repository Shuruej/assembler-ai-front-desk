import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { validateAgentBlueprint } from "@/lib/assembler/blueprint";
import { RecordValidationError, validateRecordPayload } from "@/lib/assembler/records";

export async function PATCH(request: Request, context: { params: Promise<{ id: string; recordId: string }> }) {
  const { id, recordId } = await context.params;
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON request." }, { status: 400 }); }
  if (!body || typeof body.payload !== "object" || body.payload === null || Array.isArray(body.payload)) return Response.json({ error: "payload must be an object." }, { status: 400 });
  const supabase = createSupabaseServiceRoleClient();
  const [{ data: agent }, { data: existing }] = await Promise.all([
    supabase.from("agents").select("blueprint").eq("id", id).single(),
    supabase.from("agent_records").select("id,payload").eq("id", recordId).eq("agent_id", id).single(),
  ]);
  if (!agent?.blueprint || !existing) return Response.json({ error: "Agent or record not found." }, { status: 404 });
  let payload;
  try { payload = validateRecordPayload(validateAgentBlueprint(agent.blueprint), { ...existing.payload, ...body.payload }); }
  catch (error) { return Response.json({ error: error instanceof RecordValidationError ? error.message : "Invalid blueprint." }, { status: 400 }); }
  const { data, error } = await supabase.from("agent_records").update({ payload, updated_at: new Date().toISOString() }).eq("id", recordId).eq("agent_id", id).select("id,call_id,record_type,payload,status,created_at,updated_at").single();
  if (error) return Response.json({ error: "Could not update record." }, { status: 500 });
  return Response.json(data);
}
