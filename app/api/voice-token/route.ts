const ASSEMBLYAI_TOKEN_URL = "https://agents.assemblyai.com/v1/token";

type AssemblyAITokenResponse = {
  token?: string;
};

function requireAssemblyAIApiKey(): string {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing ASSEMBLYAI_API_KEY environment variable.");
  }

  return apiKey;
}

function getAgentIdFromRequest(request: Request): string | null {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agent_id")?.trim();

  return agentId && agentId.length > 0 ? agentId : null;
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

export async function GET(request: Request) {
  const agentId = getAgentIdFromRequest(request);

  try {
    const url = new URL(ASSEMBLYAI_TOKEN_URL);
    url.searchParams.set("expires_in_seconds", "300");
    url.searchParams.set("max_session_duration_seconds", "1800");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${requireAssemblyAIApiKey()}`,
      },
    });

    if (!response.ok) {
      return Response.json(
        { error: await parseAssemblyAIError(response) },
        { status: response.status },
      );
    }

    const data = (await response.json()) as AssemblyAITokenResponse;

    if (!data.token) {
      return Response.json(
        { error: "AssemblyAI token response did not include a token." },
        { status: 502 },
      );
    }

    if (agentId) {
      return Response.json({ token: data.token, agent_id: agentId });
    }

    return Response.json({ token: data.token });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create AssemblyAI voice token.",
      },
      { status: 500 },
    );
  }
}
