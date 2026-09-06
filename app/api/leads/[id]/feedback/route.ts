import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { normalizeAgentFollowUpPreferences } from "@/lib/follow-up-preferences";
import { logSimulatedSms } from "@/lib/sms";

type FeedbackRequestBody = {
  feedback_rating?: unknown;
  feedback_notes?: unknown;
};

function normalizeOptionalString(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string when provided.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRating(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("feedback_rating must be an integer when provided.");
  }

  if (value < 1 || value > 5) {
    throw new Error("feedback_rating must be between 1 and 5.");
  }

  return value;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let body: FeedbackRequestBody;

  try {
    body = (await request.json()) as FeedbackRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  let feedbackRating: number | null;
  let feedbackNotes: string | null;

  try {
    feedbackRating = normalizeRating(body.feedback_rating);
    feedbackNotes = normalizeOptionalString(body.feedback_notes, "feedback_notes");
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request body." },
      { status: 400 },
    );
  }

  if (feedbackRating === null) {
    return Response.json(
      { error: "feedback_rating is required." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data: contextLead, error: contextError } = await supabase
    .from("leads")
    .select("calls (agents (*))")
    .eq("id", id)
    .single();
  const call = Array.isArray(contextLead?.calls) ? contextLead.calls[0] : contextLead?.calls;
  const agent = Array.isArray(call?.agents) ? call.agents[0] : call?.agents;
  if (contextError || !agent) {
    return Response.json({ error: "Lead context not found." }, { status: 404 });
  }
  if (!normalizeAgentFollowUpPreferences(agent).feedback_enabled) {
    return Response.json({ status: "disabled", message: "Feedback collection is disabled for this agent." });
  }
  const { data: lead, error } = await supabase
    .from("leads")
    .update({
      feedback_rating: feedbackRating,
      feedback_notes: feedbackNotes,
    })
    .eq("id", id)
    .select()
    .single();

  if (error || !lead) {
    return Response.json(
      { error: error?.message ?? "Lead not found." },
      { status: error ? 500 : 404 },
    );
  }

  if (agent.id && feedbackRating <= 2) {
    await logSimulatedSms({
      agentId: agent.id,
      leadId: lead.id,
      toNumber: null,
      purpose: "feedback_alert",
      message: `Low satisfaction rating (${feedbackRating}/5) reported. Notes: ${feedbackNotes ?? "No notes provided"}.`,
    });
  }

  if (agent.id && feedbackRating >= 4) {
    await logSimulatedSms({
      agentId: agent.id,
      leadId: lead.id,
      toNumber: lead.phone_number,
      purpose: "review_request",
      message:
        "Thanks for the great feedback! We'd love a quick review: [review link placeholder].",
    });
  }

  return Response.json(lead);
}
