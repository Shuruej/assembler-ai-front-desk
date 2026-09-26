import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { validateAgentBlueprint } from "@/lib/assembler/blueprint";
import { RecordValidationError, validateRecordPayload } from "@/lib/assembler/records";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const callId = new URL(request.url).searchParams.get("call_id");
  const supabase = createSupabaseServiceRoleClient();
  let query = supabase.from("agent_records").select("id,call_id,record_type,payload,status,created_at,updated_at").eq("agent_id", id).order("created_at", { ascending: false }).limit(100);
  if (callId) query = query.eq("call_id", callId);
  const { data, error } = await query;
  if (error) return Response.json({ error: "Could not load records." }, { status: 500 });
  return Response.json(data ?? []);
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON request." }, { status: 400 }); }
  if (!body || typeof body.record_type !== "string") return Response.json({ error: "record_type is required." }, { status: 400 });
  const supabase = createSupabaseServiceRoleClient();
  const { data: agent } = await supabase.from("agents").select("blueprint").eq("id", id).single();
  if (!agent?.blueprint) return Response.json({ error: "Agent blueprint not found." }, { status: 404 });
  let blueprint;
  let payload;
  try {
    blueprint = validateAgentBlueprint(agent.blueprint);
    if (!blueprint.tools.some((tool) => tool.id === body.record_type && tool.kind === "internal_record")) throw new RecordValidationError("Record type is not approved by the blueprint.");
    payload = validateRecordPayload(blueprint, body.payload);
  } catch (error) {
    return Response.json({ error: error instanceof RecordValidationError ? error.message : "Invalid blueprint." }, { status: 400 });
  }
  if (body.call_id != null) {
    if (typeof body.call_id !== "string") return Response.json({ error: "Invalid call_id." }, { status: 400 });
    const { data: call } = await supabase.from("calls").select("id").eq("id", body.call_id).eq("agent_id", id).single();
    if (!call) return Response.json({ error: "Call not found for this agent." }, { status: 404 });
  }
  const { data, error } = await supabase.from("agent_records").insert({ agent_id: id, call_id: body.call_id ?? null, record_type: body.record_type, payload, status: "new" }).select("id,call_id,record_type,payload,status,created_at,updated_at").single();
  if (error) return Response.json({ error: "Could not save record." }, { status: 500 });
  return Response.json(data, { status: 201 });
}
