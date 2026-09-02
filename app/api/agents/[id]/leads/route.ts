import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = createSupabaseServiceRoleClient();

  const { data: calls, error: callsError } = await supabase
    .from("calls")
    .select("id")
    .eq("agent_id", id);

  if (callsError) {
    return Response.json({ error: callsError.message }, { status: 500 });
  }

  const callIds = calls?.map((call) => call.id) ?? [];

  if (callIds.length === 0) {
    return Response.json([]);
  }

  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("*")
    .in("call_id", callIds)
    .order("created_at", { ascending: false });

  if (leadsError) {
    return Response.json({ error: leadsError.message }, { status: 500 });
  }

  return Response.json(leads ?? []);
}
