import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = createSupabaseServiceRoleClient();
  const { data: calls, error } = await supabase
    .from("calls")
    .select("*")
    .eq("agent_id", id)
    .order("started_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(calls ?? []);
}
