import { mintVoiceToken } from "@/lib/assemblyai/token";

export async function GET(request: Request) {
  try {
    const agentId = new URL(request.url).searchParams.get("agent_id")?.trim();
    return Response.json({ ...await mintVoiceToken(), ...(agentId ? { agent_id: agentId } : {}) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Failed to create AssemblyAI voice token." }, { status: 502 });
  }
}
