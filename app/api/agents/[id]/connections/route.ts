import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { validateAgentBlueprint } from "@/lib/assembler/blueprint";
import { encryptSecret, validateOutboundConfig } from "@/lib/assembler/connections";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from("agent_connections")
    .select("id,connection_key,name,kind,config,status,created_at,updated_at")
    .eq("agent_id", id).order("created_at", { ascending: true });
  if (error) return Response.json({ error: "Could not load connections." }, { status: 500 });
  return Response.json(data ?? []);
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON request." }, { status: 400 }); }
  if (!body || typeof body.connection_key !== "string") return Response.json({ error: "connection_key is required." }, { status: 400 });
  const supabase = createSupabaseServiceRoleClient();
  const { data: agent } = await supabase.from("agents").select("id,blueprint").eq("id", id).single();
  if (!agent?.blueprint) return Response.json({ error: "Agent blueprint not found." }, { status: 404 });
  let blueprint;
  try { blueprint = validateAgentBlueprint(agent.blueprint); }
  catch { return Response.json({ error: "Stored blueprint is invalid." }, { status: 500 }); }
  const requirement = blueprint.connections.find((connection) => connection.id === body.connection_key);
  if (!requirement || requirement.kind === "calendar") return Response.json({ error: "This connection is not configurable here." }, { status: 400 });
  let config;
  let encryptedSecret: string | undefined;
  try {
    config = validateOutboundConfig(body.config, requirement.kind);
    if (body.secret !== undefined) {
      if (typeof body.secret !== "string" || body.secret.length > 4096) throw new Error("Invalid connection secret.");
      if (body.secret) encryptedSecret = encryptSecret(body.secret);
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid connection." }, { status: 400 });
  }
  const { data: existing } = await supabase.from("agent_connections").select("encrypted_secret").eq("agent_id", id).eq("connection_key", requirement.id).maybeSingle();
  const { data, error } = await supabase.from("agent_connections").upsert({
    agent_id: id, connection_key: requirement.id, name: requirement.name, kind: requirement.kind,
    config, encrypted_secret: encryptedSecret ?? existing?.encrypted_secret ?? null,
    status: "configured", updated_at: new Date().toISOString(),
  }, { onConflict: "agent_id,connection_key" }).select("id,connection_key,name,kind,config,status,created_at,updated_at").single();
  if (error) return Response.json({ error: "Could not save connection." }, { status: 500 });
  return Response.json(data);
}
