import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { validateAgentBlueprint } from "@/lib/assembler/blueprint";
import { decryptSecret, executeOutbound, validateOutboundConfig } from "@/lib/assembler/connections";
import { dispatchBlueprintTool, type ToolExecutors, type ToolResult } from "@/lib/assembler/registry";
import { validateRecordPayload } from "@/lib/assembler/records";
import { appendRecordToGoogleSheet, isGoogleSheetsServiceAccountConfigured, validateGoogleSheetsConfig } from "@/lib/google-sheets";
import { POST as checkAvailability } from "@/app/api/availability/check/route";
import { POST as bookSlot } from "@/app/api/availability/book/route";
import { POST as escalateLead } from "@/app/api/leads/escalate/route";

async function invokeExistingRoute(handler: (request: Request) => Promise<Response>, payload: Record<string, unknown>): Promise<ToolResult> {
  const response = await handler(new Request("http://localhost/internal-tool", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }));
  const data = await response.json();
  return response.ok ? { success: true, data } : { success: false, code: "action_failed", error: typeof data?.error === "string" ? data.error : "The action could not be completed." };
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return Response.json({ success: false, error: "Invalid JSON request." }, { status: 400 }); }
  if (!body || typeof body.call_id !== "string" || typeof body.tool_id !== "string") return Response.json({ success: false, error: "call_id and tool_id are required." }, { status: 400 });
  const supabase = createSupabaseServiceRoleClient();
  const { data: call } = await supabase.from("calls").select("id,agent_id,status").eq("id", body.call_id).single();
  if (!call) return Response.json({ success: false, error: "Call not found." }, { status: 404 });
  if (call.status !== "in_progress") return Response.json({ success: false, error: "This call is no longer active." }, { status: 409 });
  const { data: agent } = await supabase.from("agents").select("id,blueprint,google_calendar_connected").eq("id", call.agent_id).single();
  if (!agent?.blueprint) return Response.json({ success: false, error: "This call has no active blueprint." }, { status: 404 });
  const agentId: string = agent.id;
  let blueprint;
  try { blueprint = validateAgentBlueprint(agent.blueprint); }
  catch { return Response.json({ success: false, error: "Stored blueprint is invalid." }, { status: 500 }); }
  const started = Date.now();
  const tool = blueprint.tools.find((item) => item.id === body.tool_id);
  const args = body.arguments;
  const executors: ToolExecutors = {
    internal_record: async (definition, values) => {
      const payload = validateRecordPayload(blueprint, values, false);
      const { data, error } = await supabase.from("agent_records").insert({ agent_id: agentId, call_id: call.id, record_type: definition.id, payload, status: "new" }).select("id,record_type,status,payload").single();
      if (error) throw new Error("Record could not be saved.");
      let googleSheetsSync: "not_connected" | "synced" | "failed" = "not_connected";
      const { data: sheetsConnection } = await supabase.from("agent_connections").select("kind,config,encrypted_secret,status").eq("agent_id", agentId).eq("connection_key", "google_sheets").maybeSingle();
      if (sheetsConnection?.kind === "google_sheets" && sheetsConnection.status === "configured" && (sheetsConnection.encrypted_secret || isGoogleSheetsServiceAccountConfigured())) {
        try {
          await appendRecordToGoogleSheet(sheetsConnection.encrypted_secret ? decryptSecret(sheetsConnection.encrypted_secret) : null, validateGoogleSheetsConfig(sheetsConnection.config), {
            recordType: definition.id,
            callId: call.id,
            payload,
            fields: blueprint.dataFields.map((field) => ({ key: field.key, label: field.label })),
          });
          googleSheetsSync = "synced";
        } catch (syncError) {
          googleSheetsSync = "failed";
          console.error("Google Sheets sync failed.", syncError instanceof Error ? syncError.message : "Unknown sync error");
        }
      }
      return { success: true, data: { ...data, google_sheets_sync: googleSheetsSync } };
    },
    escalation: async (_definition, values) => invokeExistingRoute(escalateLead, { call_id: call.id, reason: values.reason, customer_name: values.customer_name, phone_number: values.phone_number, notes: values.notes }),
    calendar: async (definition, values) => definition.operation === "check_availability"
      ? invokeExistingRoute(checkAvailability, { call_id: call.id, requested_date: values.requested_date })
      : invokeExistingRoute(bookSlot, { call_id: call.id, slot_date: values.slot_date, slot_time: values.slot_time, customer_name: values.customer_name, phone_number: values.phone_number, requested_service: values.requested_service, notes: values.notes }),
    http: async (definition, values) => runConnection(definition.connectionId!, "http", values),
    webhook: async (definition, values) => runConnection(definition.connectionId!, "webhook", values),
  };
  async function runConnection(connectionId: string, kind: "http" | "webhook", values: Record<string, unknown>): Promise<ToolResult> {
    const { data: connection } = await supabase.from("agent_connections").select("kind,config,encrypted_secret,status").eq("agent_id", agentId).eq("connection_key", connectionId).maybeSingle();
    if (!connection || connection.kind !== kind || connection.status !== "configured") return { success: false, code: "connection_required", error: "A required connection has not been configured." };
    const config = validateOutboundConfig(connection.config, kind);
    const secret = connection.encrypted_secret ? decryptSecret(connection.encrypted_secret) : null;
    return { success: true, data: await executeOutbound(config, values, secret) };
  }
  const result = await dispatchBlueprintTool({
    blueprint,
    toolId: body.tool_id,
    arguments: args,
    executors,
    setOutcome: async (outcomeId) => {
      const { error } = await supabase.from("calls").update({ outcome_key: outcomeId }).eq("id", call.id);
      if (error) console.error("Could not save call outcome.");
    },
  });
  const { error: logError } = await supabase.from("agent_tool_logs").insert({
    agent_id: agentId, call_id: call.id, tool_id: tool?.id ?? "unknown_tool", tool_kind: tool?.kind ?? "unknown",
    started_at: new Date(started).toISOString(), completed_at: new Date().toISOString(),
    success: result.success, argument_keys: tool && args && typeof args === "object" && !Array.isArray(args) ? Object.keys(args).filter((key) => tool.inputs.some((input) => input.key === key)) : [],
    result_summary: result.success ? "Action completed" : "Action failed", error_code: result.code ?? null,
    duration_ms: Date.now() - started,
  });
  if (logError) console.error("Could not save tool log.");
  return Response.json(result, { status: result.success ? 200 : 422 });
}
