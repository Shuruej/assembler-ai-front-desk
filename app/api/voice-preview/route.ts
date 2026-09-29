import { isVoiceId, voicePreviewSession } from "@/lib/assemblyai/voices";
import { mintVoiceToken } from "@/lib/assemblyai/token";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON with a voice_id." }, { status: 400 });
  }

  const voiceId =
    body && typeof body === "object" && "voice_id" in body
      ? (body as { voice_id?: unknown }).voice_id
      : undefined;
  if (!isVoiceId(voiceId)) {
    return Response.json({ error: "Unsupported AssemblyAI voice ID." }, { status: 400 });
  }

  try {
    const token = await mintVoiceToken(60, 60);
    return Response.json(
      { ...token, session: voicePreviewSession(voiceId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Failed to create AssemblyAI preview token." }, { status: 502 });
  }
}
