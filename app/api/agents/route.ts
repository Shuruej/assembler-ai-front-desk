import { createAssemblyAIAgent } from "@/lib/assemblyai/client";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type CreateAgentRequestBody = {
  business_name?: unknown;
  industry?: unknown;
  name?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("industry must be a string when provided.");
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

  try {
    industry = normalizeOptionalString(body.industry);
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
    });

    const supabase = createSupabaseServiceRoleClient();
    const { data: agent, error } = await supabase
      .from("agents")
      .insert({
        business_name: businessName,
        industry,
        name,
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
