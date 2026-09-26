import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from("agent_tool_logs")
    .select("id,call_id,tool_id,tool_kind,started_at,completed_at,success,argument_keys,result_summary,error_code,duration_ms")
    .eq("agent_id", id).order("started_at", { ascending: false }).limit(100);
  if (error) return Response.json({ error: "Could not load tool logs." }, { status: 500 });
  return Response.json(data ?? []);
}
