import { NextResponse } from "next/server";
import { assembleAgentBlueprint, STARTER_WORKFLOWS, type StarterId } from "@/lib/assembler/compiler";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Send a valid JSON request." }, { status: 400 }); }
  const intent = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).intent : null;
  const starterId = body && typeof body === "object" && !Array.isArray(body) ? ((body as Record<string, unknown>).starterId ?? null) : null;
  if (typeof intent !== "string" || intent.trim().length < 20 || intent.trim().length > 5000) {
    return NextResponse.json({ error: "Describe the agent in 20 to 5,000 characters." }, { status: 400 });
  }
  if (starterId !== null && (typeof starterId !== "string" || !STARTER_WORKFLOWS.some((starter) => starter.id === starterId))) {
    return NextResponse.json({ error: "Choose a valid starter workflow or start from scratch." }, { status: 400 });
  }
  try {
    const blueprint = assembleAgentBlueprint(intent.trim(), starterId as StarterId | null);
    return NextResponse.json({ blueprint });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not assemble the blueprint." }, { status: 422 });
  }
}
