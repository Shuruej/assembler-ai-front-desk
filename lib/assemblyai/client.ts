const ASSEMBLYAI_AGENTS_BASE_URL = "https://agents.assemblyai.com";

export type CreateAssemblyAIAgentInput = {
  name: string;
  businessName: string;
  industry?: string | null;
};

export type AssemblyAIAgent = {
  id: string;
  name: string;
  system_prompt?: string;
  greeting?: string | null;
  voice?: {
    voice_id?: string;
  };
  created_at?: string;
  updated_at?: string;
};

type AssemblyAIErrorResponse = {
  detail?: string;
  error?: string;
  code?: string;
};

function requireAssemblyAIApiKey(): string {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing ASSEMBLYAI_API_KEY environment variable.");
  }

  return apiKey;
}

async function parseAssemblyAIResponse(response: Response) {
  const contentType = response.headers.get("content-type");

  if (!contentType?.includes("application/json")) {
    return null;
  }

  return response.json();
}

export async function createAssemblyAIAgent({
  name,
  businessName,
  industry,
}: CreateAssemblyAIAgentInput): Promise<AssemblyAIAgent> {
  const response = await fetch(`${ASSEMBLYAI_AGENTS_BASE_URL}/v1/agents`, {
    method: "POST",
    headers: {
      Authorization: requireAssemblyAIApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      system_prompt: [
        `You are ${name}, a professional voice front-desk agent for ${businessName}.`,
        industry
          ? `The business category is ${industry}.`
          : "The business category may vary.",
        "Help callers with general inquiries, service requests, booking intent, hours, and follow-up needs.",
        "Keep responses concise, natural, and suitable for a live voice conversation.",
        "Do not invent business-specific details that have not been provided.",
      ].join(" "),
      greeting: `Thanks for calling ${businessName}. How can I help you today?`,
      voice: { voice_id: "alba" },
      tools: [
        {
          type: "function",
          name: "capture_lead",
          description:
            "Capture a generic booking request, inquiry, or follow-up lead once you have gathered enough caller information to log it. Use this for any industry when the caller expresses clear interest, asks for a booking, requests a service, or wants follow-up.",
          parameters: {
            type: "object",
            properties: {
              customer_name: {
                type: "string",
                description: "The caller's name.",
              },
              phone_number: {
                type: "string",
                description:
                  "The caller's phone number, preferably including country code if available.",
              },
              requested_service: {
                type: "string",
                description:
                  "The service, product, booking, or inquiry the caller is interested in.",
              },
              preferred_datetime: {
                type: "string",
                description:
                  "The caller's preferred date and time in ISO 8601 format if possible.",
                format: "date-time",
              },
              notes: {
                type: "string",
                description:
                  "Any useful context, constraints, or follow-up notes from the conversation.",
              },
            },
            required: ["customer_name", "phone_number"],
          },
        },
      ],
    }),
  });

  const data = await parseAssemblyAIResponse(response);

  if (!response.ok) {
    const error = data as AssemblyAIErrorResponse | null;
    throw new Error(
      error?.detail ??
        error?.error ??
        `AssemblyAI agent creation failed with status ${response.status}.`,
    );
  }

  return data as AssemblyAIAgent;
}
