import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type EndCallRequestBody = {
  call_id?: unknown;
  transcript?: unknown;
  summary?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("summary must be a string when provided.");
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(request: Request) {
  let body: EndCallRequestBody;

  try {
    body = (await request.json()) as EndCallRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  if (!isNonEmptyString(body.call_id)) {
    return Response.json({ error: "call_id is required." }, { status: 400 });
  }

  if (body.transcript !== undefined && typeof body.transcript !== "string") {
    return Response.json(
      { error: "transcript must be a string when provided." },
      { status: 400 },
    );
  }

  let summary: string | null;

  try {
    summary = normalizeOptionalString(body.summary);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request body." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServiceRoleClient();
  const callId = body.call_id.trim();
  const endedAt = new Date();

  const { data: existingCall, error: lookupError } = await supabase
    .from("calls")
    .select("started_at")
    .eq("id", callId)
    .single();

  if (lookupError || !existingCall) {
    return Response.json(
      { error: "No call found for the provided call_id." },
      { status: 404 },
    );
  }

  const startedAt = new Date(existingCall.started_at);
  const durationSeconds = Math.max(
    0,
    Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
  );

  const update: {
    ended_at: string;
    duration_seconds: number;
    transcript: string;
    status: string;
    summary?: string;
  } = {
    ended_at: endedAt.toISOString(),
    duration_seconds: durationSeconds,
    transcript: body.transcript?.trim() ?? "",
    status: "completed",
  };

  if (summary) {
    update.summary = summary;
  }

  const { data: call, error: updateError } = await supabase
    .from("calls")
    .update(update)
    .eq("id", callId)
    .select()
    .single();

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  return Response.json(call);
}
