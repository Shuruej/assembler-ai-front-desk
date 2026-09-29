const ASSEMBLYAI_TOKEN_URL = "https://agents.assemblyai.com/v1/token";
const ASSEMBLYAI_WS_URL = "wss://agents.assemblyai.com/v1/ws";
const ASSEMBLYAI_RELAY_URL = process.env.ASSEMBLYAI_RELAY_URL?.replace(/\/$/, "") || null;

type AssemblyAITokenResponse = {
  token?: string;
};

function getTokenUrl(): URL {
  return new URL(ASSEMBLYAI_RELAY_URL ? `${ASSEMBLYAI_RELAY_URL}/token` : ASSEMBLYAI_TOKEN_URL);
}

function getVoiceWebSocketUrl(): string {
  if (!ASSEMBLYAI_RELAY_URL) return ASSEMBLYAI_WS_URL;
  return `${ASSEMBLYAI_RELAY_URL.replace(/^http/, "ws")}/ws`;
}

function requireAssemblyAIApiKey(): string {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing ASSEMBLYAI_API_KEY environment variable.");
  }

  return apiKey;
}


async function parseAssemblyAIError(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/json")) {
    const data = (await response.json()) as { error?: string; detail?: string };
    return data.detail ?? data.error ?? `AssemblyAI token request failed with status ${response.status}.`;
  }

  const text = await response.text();
  return text || `AssemblyAI token request failed with status ${response.status}.`;
}


export async function mintVoiceToken(expires = 300, duration = 1800, signal?: AbortSignal) {
  const url = getTokenUrl();
  url.searchParams.set("expires_in_seconds", String(expires));
  url.searchParams.set("max_session_duration_seconds", String(duration));
  const apiKey = requireAssemblyAIApiKey();
  const timeout = AbortSignal.timeout(15000);
  const response = await fetch(url, { cache: "no-store", signal: signal ? AbortSignal.any([signal, timeout]) : timeout, headers: ASSEMBLYAI_RELAY_URL ? { "x-assemblyai-key": apiKey } : { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok) throw new Error(await parseAssemblyAIError(response));
  const data = await response.json() as AssemblyAITokenResponse;
  if (typeof data.token !== "string" || !data.token) throw new Error("AssemblyAI token response did not include a token.");
  return { token: data.token, ws_url: getVoiceWebSocketUrl() };
}
