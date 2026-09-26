import { NextResponse } from "next/server";
import { compileAgentBlueprint, CompilerError } from "@/lib/assembler/compiler";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Send a valid JSON request." }, { status: 400 }); }
  const intent = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).intent : null;
  if (typeof intent !== "string" || intent.trim().length < 20 || intent.trim().length > 5000) {
    return NextResponse.json({ error: "Describe the agent in 20 to 5,000 characters." }, { status: 400 });
  }
  try {
    const blueprint = await compileAgentBlueprint(intent.trim());
    return NextResponse.json({ blueprint });
  } catch (error) {
    if (error instanceof CompilerError) {
      const status = error.code === "missing_key" ? 503 : error.code === "gateway_failure" ? 502 : 422;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("Unexpected blueprint compilation error:", error);
    return NextResponse.json({ error: "Could not design the blueprint. Please retry." }, { status: 500 });
  }
}
