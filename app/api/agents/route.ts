import { createAssemblyAIAgent } from "@/lib/assemblyai/client";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type CreateAgentRequestBody = {
  business_name?: unknown;
  industry?: unknown;
  name?: unknown;
  agent_purpose?: unknown;
  business_knowledge?: unknown;
};

const VALID_AGENT_PURPOSES = new Set([
  "general_receptionist",
  "appointment_booking",
  "product_inquiry",
  "customer_support",
  "lead_qualification",
  "feedback_collection",
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeOptionalString(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string when provided.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeAgentPurpose(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "general_receptionist";
  }

  if (typeof value !== "string") {
    throw new Error("agent_purpose must be a string when provided.");
  }

  const trimmed = value.trim();

  if (!VALID_AGENT_PURPOSES.has(trimmed)) {
    throw new Error("agent_purpose is not supported.");
  }

  return trimmed;
}

export async function GET() {
  const supabase = createSupabaseServiceRoleClient();
  const { data: agents, error } = await supabase
    .from("agents")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(agents ?? []);
}

export async function POST(request: Request) {
  let body: CreateAgentRequestBody;

  try {
    body = (await request.json()) as CreateAgentRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  if (!isNonEmptyString(body.business_name)) {
    return Response.json({ error: "business_name is required." }, { status: 400 });
  }

  if (!isNonEmptyString(body.name)) {
    return Response.json({ error: "name is required." }, { status: 400 });
  }

  let industry: string | null;
  let agentPurpose: string;
  let businessKnowledge: string | null;

  try {
    industry = normalizeOptionalString(body.industry, "industry");
    agentPurpose = normalizeAgentPurpose(body.agent_purpose);
    businessKnowledge = normalizeOptionalString(
      body.business_knowledge,
      "business_knowledge",
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request body." },
      { status: 400 },
    );
  }

  const businessName = body.business_name.trim();
  const name = body.name.trim();

  try {
    const assemblyAIAgent = await createAssemblyAIAgent({
      businessName,
      industry,
      name,
      agentPurpose,
      businessKnowledge,
    });

    const supabase = createSupabaseServiceRoleClient();
    const { data: agent, error } = await supabase
      .from("agents")
      .insert({
        business_name: businessName,
        industry,
        name,
        agent_purpose: agentPurpose,
        business_knowledge: businessKnowledge,
        assemblyai_agent_id: assemblyAIAgent.id,
      })
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json(agent, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create voice agent.",
      },
      { status: 500 },
    );
  }
}
