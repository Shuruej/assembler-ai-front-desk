import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = createSupabaseServiceRoleClient();
  const { data: smsLogs, error } = await supabase
    .from("sms_logs")
    .select("*")
    .eq("agent_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(smsLogs ?? []);
}
