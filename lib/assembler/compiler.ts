import { AGENT_BLUEPRINT_SCHEMA, BlueprintValidationError, validateAgentBlueprint, type AgentBlueprint } from "./blueprint";

const GATEWAY_URL = "https://llm-gateway.assemblyai.com/v1/chat/completions";
const SYSTEM_PROMPT = [
  "You are designing a deployable business voice agent. Translate the user's intent into a specific, coherent blueprint, not a template.",
  "Infer requirements only from the described workflow. Do not invent external vendors, credentials, APIs, facts, schedules, or policies. If a capability needs an external system, state a generic connection requirement unless the user explicitly names a vendor.",
  "Use only the allowed tool kinds, operations, rule operators/actions, and workflow types in the schema. Match each tool kind to its operation: internal_record/create_record, http/http_request, webhook/send_webhook, calendar/check_availability or create_booking, escalation/escalate. Tools are capability plans, not executable code. Do not include arbitrary code or dangerous actions.",
  "Keep data fields relevant. Convert explicit policies into structured rules where possible, including escalation conditions. Rules must have a source, operator, and action; reference an existing tool or outcome when the action needs a target.",
  "For every calendar/http/webhook tool include a matching connectionId. Use empty arrays for categories that do not apply. Do not assume appointments, leads, Calendar, or receptionist work for every agent.",
  "Use lowercase snake_case machine IDs, unique within each category. In workflow references, use only IDs from fields, tools, connections, rules, or outcomes. Use null for absent connectionId, rule value (only with exists), or rule target; use [] for absent field options or workflow references.",
  "For calendar/check_availability tools include a required string requested_date input. For calendar/create_booking include required string slot_date, slot_time, customer_name, and phone_number inputs. For escalation/escalate include a required string reason input. These exact keys are runtime contracts.",
  "For each tool, set outcomeId to an existing meaningful outcome ID when successful execution directly achieves that outcome; otherwise null. Do not assign a completed outcome to a mere availability lookup.",
  "The blueprint is a design for review, not a claim that any connection or generated tool is configured or running.",
].join("\n");

export class CompilerError extends Error {
  constructor(public code: "missing_key" | "gateway_failure" | "malformed_response" | "invalid_blueprint", message: string) { super(message); }
}

export async function compileAgentBlueprint(intent: string): Promise<AgentBlueprint> {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) throw new CompilerError("missing_key", "The blueprint compiler is not configured.");
  let response: Response;
  try {
    response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { authorization: key, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ASSEMBLER_COMPILER_MODEL || "openai/gpt-5-nano",
        stream: false,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: intent }],
        response_format: { type: "json_schema", json_schema: { name: "agent_blueprint", strict: true, schema: AGENT_BLUEPRINT_SCHEMA } },
      }),
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    throw new CompilerError("gateway_failure", "The blueprint service could not be reached. Please retry.");
  }
  if (!response.ok) throw new CompilerError("gateway_failure", "The blueprint service could not complete the request. Please retry.");
  let content: unknown;
  try {
    const payload = await response.json();
    content = payload?.choices?.[0]?.message?.content;
  } catch {
    throw new CompilerError("malformed_response", "The blueprint service returned an unreadable response. Please retry.");
  }
  if (typeof content !== "string") throw new CompilerError("malformed_response", "The blueprint service returned an incomplete response. Please retry.");
  let parsed: unknown;
  try { parsed = JSON.parse(content); }
  catch { throw new CompilerError("malformed_response", "The blueprint service returned invalid JSON. Please retry."); }
  try { return validateAgentBlueprint(parsed); }
  catch (error) {
    if (error instanceof BlueprintValidationError) {
      console.error("Blueprint validation failed:", error.message);
      throw new CompilerError("invalid_blueprint", "The generated blueprint was incomplete. Please retry or clarify your description.");
    }
    throw error;
  }
}
