import { normalizeFollowUpPreferences } from "@/lib/follow-up-preferences";

type ConfigureAgentRequestBody = {
  description?: unknown;
  follow_up_preferences?: unknown;
};

type AgentPurpose =
  | "general_receptionist"
  | "appointment_booking"
  | "product_inquiry"
  | "customer_support"
  | "lead_qualification"
  | "feedback_collection";

type AgentConfig = {
  business_name: string;
  industry: string;
  name: string;
  agent_purpose: AgentPurpose;
  business_knowledge: string;
  business_hours_start: string;
  business_hours_end: string;
  timezone: string;
};

type AssemblyAIChatCompletionResponse = {
  choices?: {
    message?: {
      content?: unknown;
    };
  }[];
};

const ASSEMBLYAI_LLM_GATEWAY_URL =
  "https://llm-gateway.assemblyai.com/v1/chat/completions";
const CONFIG_MODEL = "claude-sonnet-4-6";
const VALID_AGENT_PURPOSES = new Set<AgentPurpose>([
  "general_receptionist",
  "appointment_booking",
  "product_inquiry",
  "customer_support",
  "lead_qualification",
  "feedback_collection",
]);

const DEFAULT_CONFIG: AgentConfig = {
  business_name: "Your business",
  industry: "General service business",
  name: "Ava",
  agent_purpose: "general_receptionist",
  business_knowledge:
    "Answer customer questions, capture useful lead details, and avoid inventing unknown information.",
  business_hours_start: "09:00",
  business_hours_end: "17:00",
  timezone: "Asia/Karachi",
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeString(value: unknown, fallback: string): string {
  return isNonEmptyString(value) ? value.trim() : fallback;
}

function normalizePurpose(value: unknown): AgentPurpose {
  return typeof value === "string" && VALID_AGENT_PURPOSES.has(value as AgentPurpose)
    ? (value as AgentPurpose)
    : DEFAULT_CONFIG.agent_purpose;
}

function getFallbackPurpose(description: string): AgentPurpose {
  const lowerDescription = description.toLowerCase();

  if (
    lowerDescription.includes("appointment") ||
    lowerDescription.includes("booking") ||
    lowerDescription.includes("book")
  ) {
    return "appointment_booking";
  }

  if (
    lowerDescription.includes("support") ||
    lowerDescription.includes("help")
  ) {
    return "customer_support";
  }

  if (
    lowerDescription.includes("product") ||
    lowerDescription.includes("pricing")
  ) {
    return "product_inquiry";
  }

  if (
    lowerDescription.includes("qualify") ||
    lowerDescription.includes("lead")
  ) {
    return "lead_qualification";
  }

  if (lowerDescription.includes("feedback")) {
    return "feedback_collection";
  }

  return "general_receptionist";
}

function getFallbackIndustry(description: string): string {
  const lowerDescription = description.toLowerCase();

  if (lowerDescription.includes("dental clinic")) return "Dental clinic";
  if (lowerDescription.includes("clinic")) return "Clinic";
  if (lowerDescription.includes("salon")) return "Salon";
  if (lowerDescription.includes("restaurant")) return "Restaurant";
  if (lowerDescription.includes("gym")) return "Gym";
  if (lowerDescription.includes("legal")) return "Legal office";

  return DEFAULT_CONFIG.industry;
}

function getFallbackTimezone(description: string): string {
  const lowerDescription = description.toLowerCase();

  if (
    lowerDescription.includes("karachi") ||
    lowerDescription.includes("pakistan")
  ) {
    return "Asia/Karachi";
  }

  return DEFAULT_CONFIG.timezone;
}

function inferConfigFromDescription(description: string): AgentConfig {
  const calledMatch = description.match(
    /\bcalled\s+([^.,]+?)(?=\s+(?:we|i|our)\b|[.,]|$)/i,
  );
  const hoursMatch = description.match(
    /\bfrom\s+([0-9]{1,2}(?::[0-9]{2})?\s*(?:AM|PM)?)\s+to\s+([0-9]{1,2}(?::[0-9]{2})?\s*(?:AM|PM)?)/i,
  );
  const businessName = calledMatch?.[1]?.trim() || DEFAULT_CONFIG.business_name;
  const businessKnowledge = [
    description.trim(),
    "Do not invent exact prices or unknown business details.",
  ].join("\n\n");

  return {
    business_name: businessName,
    industry: getFallbackIndustry(description),
    name: "Ava",
    agent_purpose: getFallbackPurpose(description),
    business_knowledge: businessKnowledge,
    business_hours_start:
      hoursMatch?.[1]?.trim() || DEFAULT_CONFIG.business_hours_start,
    business_hours_end:
      hoursMatch?.[2]?.trim() || DEFAULT_CONFIG.business_hours_end,
    timezone: getFallbackTimezone(description),
  };
}

function normalizeConfig(value: unknown): AgentConfig {
  const config = typeof value === "object" && value !== null ? value : {};
  const fields = config as Partial<Record<keyof AgentConfig, unknown>>;

  return {
    business_name: normalizeString(
      fields.business_name,
      DEFAULT_CONFIG.business_name,
    ),
    industry: normalizeString(fields.industry, DEFAULT_CONFIG.industry),
    name: normalizeString(fields.name, DEFAULT_CONFIG.name),
    agent_purpose: normalizePurpose(fields.agent_purpose),
    business_knowledge: normalizeString(
      fields.business_knowledge,
      DEFAULT_CONFIG.business_knowledge,
    ),
    business_hours_start: normalizeString(
      fields.business_hours_start,
      DEFAULT_CONFIG.business_hours_start,
    ),
    business_hours_end: normalizeString(
      fields.business_hours_end,
      DEFAULT_CONFIG.business_hours_end,
    ),
    timezone: normalizeString(fields.timezone, DEFAULT_CONFIG.timezone),
  };
}

function parseContent(content: unknown): unknown {
  if (typeof content === "string") {
    const trimmed = content.trim();
    const jsonText = trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");

    return JSON.parse(jsonText) as unknown;
  }

  return content;
}

export async function POST(request: Request) {
  let body: ConfigureAgentRequestBody;

  try {
    body = (await request.json()) as ConfigureAgentRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  if (!isNonEmptyString(body.description)) {
    return Response.json(
      { error: "Business description is required." },
      { status: 400 },
    );
  }

  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  // Preferences come from explicit controls, never from model inference.
  const followUpPreferences = normalizeFollowUpPreferences(body.follow_up_preferences);
  const configResponse = (config: AgentConfig) => Response.json({
    ...config,
    follow_up_preferences: followUpPreferences,
  });

  if (!apiKey) {
    return Response.json(
      { error: "Missing ASSEMBLYAI_API_KEY environment variable." },
      { status: 500 },
    );
  }

  let response: Response;

  try {
    response = await fetch(ASSEMBLYAI_LLM_GATEWAY_URL, {
      method: "POST",
      headers: {
        authorization: apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CONFIG_MODEL,
        temperature: 0.2,
        max_tokens: 900,
        messages: [
          {
            role: "system",
            content:
              "Extract an editable AI receptionist configuration from the user's business description. Do not invent specific prices, policies, services, or facts that were not provided. Use neutral defaults for missing fields. Default timezone to Asia/Karachi only when timezone or location cannot be inferred safely. Return only JSON with exactly these string fields: business_name, industry, name, agent_purpose, business_knowledge, business_hours_start, business_hours_end, timezone. The agent_purpose must be one of: general_receptionist, appointment_booking, product_inquiry, customer_support, lead_qualification, feedback_collection.",
          },
          {
            role: "user",
            content: body.description.trim(),
          },
        ],
      }),
    });
  } catch {
    return configResponse(inferConfigFromDescription(body.description.trim()));
  }

  const responseText = await response.text();
  let data: AssemblyAIChatCompletionResponse = {};

  if (responseText) {
    try {
      data = JSON.parse(responseText) as AssemblyAIChatCompletionResponse;
    } catch {
      data = {};
    }
  }

  if (!response.ok) {
    return configResponse(inferConfigFromDescription(body.description.trim()));
  }

  try {
    const parsed = parseContent(data.choices?.[0]?.message?.content);
    return configResponse(normalizeConfig(parsed));
  } catch {
    return configResponse(inferConfigFromDescription(body.description.trim()));
  }
}
