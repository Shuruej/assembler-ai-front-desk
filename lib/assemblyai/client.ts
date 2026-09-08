const ASSEMBLYAI_AGENTS_BASE_URL = "https://agents.assemblyai.com";

export type CreateAssemblyAIAgentInput = {
  name: string;
  businessName: string;
  industry?: string | null;
  agentPurpose?: string | null;
  businessKnowledge?: string | null;
  businessHoursStart?: string | null;
  businessHoursEnd?: string | null;
  businessDays?: string | null;
  timezone?: string | null;
  confirmationCallEnabled?: boolean | null;
  feedbackEnabled?: boolean | null;
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

type FrontDeskAgentConfig = {
  name: string;
  system_prompt: string;
  greeting: string;
  voice: {
    voice_id: string;
  };
  tools: {
    type: "function";
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string; format?: string }>;
      required: string[];
    };
  }[];
};

const PURPOSE_LABELS: Record<string, string> = {
  general_receptionist: "general receptionist",
  appointment_booking: "appointment booking",
  product_inquiry: "product inquiry",
  customer_support: "customer support",
  lead_qualification: "lead qualification",
  feedback_collection: "feedback collection",
};

const PURPOSE_INSTRUCTIONS: Record<string, string> = {
  general_receptionist:
    "Route the conversation naturally. Answer basic questions from the provided business knowledge, identify the caller's need, and capture follow-up details when staff should respond.",
  appointment_booking:
    "Focus on booking intent. Gather the service requested, preferred date or time, caller name, phone number, and any scheduling notes before capturing the lead.",
  product_inquiry:
    "Answer product, service, pricing, availability, and policy questions from business knowledge first. Capture a lead only when the caller wants follow-up, an availability update, a quote, or contact from staff.",
  customer_support:
    "Help with support questions using the provided business knowledge, policies, and troubleshooting notes. Capture a lead only when the issue is unresolved, sensitive, or needs human follow-up.",
  lead_qualification:
    "Qualify interest by learning the caller's need, budget or priority when volunteered, timeline, fit, and best contact details. Capture the lead when the caller is a plausible opportunity or requests next steps.",
  feedback_collection:
    "Focus on collecting concise feedback, including a rating when appropriate, comments, and whether the caller wants staff follow-up. Capture a lead when feedback needs follow-up or the caller asks to be contacted.",
};

const TOOL_DESCRIPTIONS: Record<string, string> = {
  general_receptionist:
    "Capture a follow-up lead after explicit read-back confirmation when the caller needs staff response, routing, a service request, or a saved inquiry.",
  appointment_booking:
    "Capture a booking-intent lead after explicit read-back confirmation when the caller clearly wants an appointment, reservation, or scheduled service.",
  product_inquiry:
    "Capture a follow-up lead after explicit read-back confirmation only when the caller wants staff contact, an availability update, quote, preorder, or product/service follow-up.",
  customer_support:
    "Capture a support follow-up lead after explicit read-back confirmation only when the issue is unresolved, needs human review, or the caller requests contact from staff.",
  lead_qualification:
    "Capture a qualified lead after explicit read-back confirmation when the caller has a relevant need, buying or service interest, and usable contact details.",
  feedback_collection:
    "Capture a feedback follow-up lead after explicit read-back confirmation when feedback should be logged for staff, includes a requested response, or requires escalation.",
};

const ESCALATE_TO_HUMAN_TOOL_DESCRIPTION =
  "Call this when the caller has a question or need you cannot address, seems frustrated, or is asking something outside normal booking/inquiry scope. This flags the call for a real team member to follow up.";

const CHECK_AVAILABILITY_TOOL_DESCRIPTION =
  "Call this whenever the caller mentions a preferred date for a booking, before promising any specific time. Returns the actual open time slots for that date.";

const BOOK_SLOT_TOOL_DESCRIPTION =
  "Call this once the caller has picked one of the available times from check_availability and explicitly confirmed it. This finalizes the booking.";

const DAY_LABELS: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const ORDERED_DAY_CODES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DEFAULT_BUSINESS_DAYS = "mon,tue,wed,thu,fri,sat,sun";

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

function normalizePurpose(value?: string | null): string {
  return value && PURPOSE_LABELS[value] ? value : "general_receptionist";
}

function normalizeTimezone(value?: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed) return "Asia/Karachi";

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date());
    return trimmed;
  } catch {
    return "Asia/Karachi";
  }
}

function formatCurrentLocalDateTime(timezone?: string | null): string {
  const normalizedTimezone = normalizeTimezone(timezone);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: normalizedTimezone,
    dateStyle: "full",
    timeStyle: "long",
  }).format(new Date());
}

function getBusinessDayCodesForPrompt(businessDays?: string | null): string[] {
  const dayCodes = (businessDays?.trim() || DEFAULT_BUSINESS_DAYS)
    .split(",")
    .map((day) => day.trim().toLowerCase())
    .filter((day) => DAY_LABELS[day]);

  const uniqueDayCodes = Array.from(new Set(dayCodes));

  if (uniqueDayCodes.length === 0) {
    return [...ORDERED_DAY_CODES];
  }

  return ORDERED_DAY_CODES.filter((day) => uniqueDayCodes.includes(day));
}

function formatDayCodesForPrompt(dayCodes: string[]): string {
  const dayLabels = dayCodes.map((day) => DAY_LABELS[day]);

  if (dayLabels.length === 0) {
    return "none";
  }

  if (dayLabels.length === 1) {
    return dayLabels[0];
  }

  if (dayLabels.length === 2) {
    return dayLabels.join(" and ");
  }

  return `${dayLabels.slice(0, -1).join(", ")}, and ${dayLabels[dayLabels.length - 1]}`;
}

function buildFollowUpInstruction({
  confirmationCallEnabled,
  feedbackEnabled,
}: Pick<CreateAssemblyAIAgentInput, "confirmationCallEnabled" | "feedbackEnabled">): string {
  const confirmationEnabled = confirmationCallEnabled !== false;
  const feedbackAllowed = confirmationEnabled && feedbackEnabled !== false;

  if (!confirmationEnabled) {
    return [
      "Follow-up confirmation calls are disabled for this business.",
      "After capture_lead succeeds, do not promise that the team will call, message, email, confirm, or follow up.",
      "Say a neutral response such as: Your request has been saved. Is there anything else I can help you with?",
    ].join(" ");
  }

  if (!feedbackAllowed) {
    return "Follow-up confirmation calls are enabled, but feedback collection after confirmation is disabled.";
  }

  return "Follow-up confirmation calls and feedback collection after confirmation are enabled.";
}

export function buildSystemPrompt({
  name,
  businessName,
  industry,
  agentPurpose,
  businessKnowledge,
  businessHoursStart,
  businessHoursEnd,
  businessDays,
  timezone,
  confirmationCallEnabled,
  feedbackEnabled,
}: CreateAssemblyAIAgentInput): string {
  const normalizedPurpose = normalizePurpose(agentPurpose);
  const knowledge = businessKnowledge?.trim();
  const normalizedTimezone = normalizeTimezone(timezone);
  const hours = businessHoursStart || businessHoursEnd
    ? `Business hours are ${businessHoursStart || "not specified"} to ${
        businessHoursEnd || "not specified"
      } in ${normalizedTimezone}.`
    : `The business timezone is ${normalizedTimezone}.`;
  const openDayCodes = getBusinessDayCodesForPrompt(businessDays);
  const closedDayCodes = ORDERED_DAY_CODES.filter((day) => !openDayCodes.includes(day));
  const factualSchedule = `This business is open on: ${formatDayCodesForPrompt(
    openDayCodes,
  )}, from ${businessHoursStart || "not specified"} to ${
    businessHoursEnd || "not specified"
  } (${normalizedTimezone}). It is CLOSED on: ${formatDayCodesForPrompt(
    closedDayCodes,
  )}. When asked about hours or whether we're open on a specific day, answer strictly based on this list — never say "every day" or "Monday through Sunday" unless business_days literally contains all 7 days. Only offer specific times by calling check_availability for the exact requested date.`;

  return [
    `You are ${name}, a professional ${PURPOSE_LABELS[normalizedPurpose]} voice agent for ${businessName}.`,
    industry
      ? `The business category is ${industry}.`
      : "The business category may vary.",
    hours,
    factualSchedule,
    `Agent purpose: ${PURPOSE_LABELS[normalizedPurpose]}. ${PURPOSE_INSTRUCTIONS[normalizedPurpose]}`,
    knowledge
      ? `Use this business knowledge as your primary source for business-specific answers: ${knowledge}`
      : "No detailed business knowledge was provided, so ask concise clarifying questions and do not invent business-specific details.",
    "Do not invent business-specific details, policies, prices, availability, or commitments that are not in the provided business knowledge or clearly supplied by the caller.",
    "If you cannot help with something, or the caller seems frustrated or asks something clearly outside what you can handle, call escalate_to_human — do not guess or make up an answer. Let the caller know a team member will follow up with them.",
    "When the caller wants to book something and mentions or is asked for a preferred date, call check_availability with that date before offering or promising any specific time. Only offer the exact times returned by the tool result — never invent availability.",
    "If no times are available for that date, apologize, ask if another day works, and call check_availability again for the new date.",
    "Once the caller picks a specific time from the options given and explicitly confirms it (per the mandatory confirmation protocol), call book_slot with the exact date, time, and their name/phone number.",
    buildFollowUpInstruction({ confirmationCallEnabled, feedbackEnabled }),
    "Track the details the caller has already clearly provided in this conversation and reuse them; never ask again for information they have already given.",
    `Tool use guidance for capture_lead: ${TOOL_DESCRIPTIONS[normalizedPurpose]}`,
    "Never call the capture_lead tool until you have read the captured details back to the caller and the caller has explicitly confirmed with an affirmative response such as yes, correct, or that's right. This confirmation step is required even if the caller gave every detail in a single turn. When reading a phone number back, speak each digit individually and clearly, grouped in short pairs or triples with pauses, for example: zero three zero zero, one two three, one two three four, and ask: did I get that number right? If the caller corrects any detail, repeat the corrected version back once more and wait for explicit confirmation again before calling capture_lead. Keep the confirmation exchange brief and natural, using 1-2 short sentences, not robotic or repetitive beyond what is needed.",
    "Keep responses concise, natural, and suitable for a live voice conversation, not robotic.",
  ].join(" ");
}

export function buildRuntimeSystemPrompt(input: CreateAssemblyAIAgentInput): string {
  const normalizedTimezone = normalizeTimezone(input.timezone);
  return [
    buildSystemPrompt(input),
    `Current local date and time for this call: ${formatCurrentLocalDateTime(normalizedTimezone)} (${normalizedTimezone}).`,
    "Resolve relative date phrases such as today, tomorrow, next Wednesday, and this Friday against that current local date and timezone. Do not use model memory or any hardcoded date for relative dates.",
  ].join(" ");
}

function buildFrontDeskAgentConfig({
  name,
  businessName,
  industry,
  agentPurpose,
  businessKnowledge,
  businessHoursStart,
  businessHoursEnd,
  businessDays,
  timezone,
  confirmationCallEnabled,
  feedbackEnabled,
}: CreateAssemblyAIAgentInput): FrontDeskAgentConfig {
  const normalizedPurpose = normalizePurpose(agentPurpose);

  return {
    name,
    system_prompt: buildSystemPrompt({
      name,
      businessName,
      industry,
      agentPurpose: normalizedPurpose,
      businessKnowledge,
      businessHoursStart,
      businessHoursEnd,
      businessDays,
      timezone,
      confirmationCallEnabled,
      feedbackEnabled,
    }),
    greeting: `Thanks for calling ${businessName}. How can I help you today?`,
    voice: { voice_id: "alba" },
    tools: [
      {
        type: "function",
        name: "capture_lead",
        description: TOOL_DESCRIPTIONS[normalizedPurpose],
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
      {
        type: "function",
        name: "escalate_to_human",
        description: ESCALATE_TO_HUMAN_TOOL_DESCRIPTION,
        parameters: {
          type: "object",
          properties: {
            reason: {
              type: "string",
              description: "Brief description of why escalation is needed.",
            },
            customer_name: {
              type: "string",
              description: "The caller's name, if known.",
            },
            phone_number: {
              type: "string",
              description: "The caller's phone number, if known.",
            },
            notes: {
              type: "string",
              description:
                "Any useful context for the human team member who follows up.",
            },
          },
          required: ["reason"],
        },
      },
      {
        type: "function",
        name: "check_availability",
        description: CHECK_AVAILABILITY_TOOL_DESCRIPTION,
        parameters: {
          type: "object",
          properties: {
            requested_date: {
              type: "string",
              description: "Preferred booking date in YYYY-MM-DD format.",
            },
          },
          required: ["requested_date"],
        },
      },
      {
        type: "function",
        name: "book_slot",
        description: BOOK_SLOT_TOOL_DESCRIPTION,
        parameters: {
          type: "object",
          properties: {
            slot_date: {
              type: "string",
              description: "Booking date in YYYY-MM-DD format.",
            },
            slot_time: {
              type: "string",
              description: "Exact time matching one returned by check_availability.",
            },
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
              description: "The requested service, booking, or appointment type.",
            },
            notes: {
              type: "string",
              description:
                "Any useful context, constraints, or booking notes from the conversation.",
            },
          },
          required: ["slot_date", "slot_time", "customer_name", "phone_number"],
        },
      },
    ],
  };
}

export async function createAssemblyAIAgent({
  name,
  businessName,
  industry,
  agentPurpose,
  businessKnowledge,
  businessHoursStart,
  businessHoursEnd,
  businessDays,
  timezone,
  confirmationCallEnabled,
  feedbackEnabled,
}: CreateAssemblyAIAgentInput): Promise<AssemblyAIAgent> {
  const response = await fetch(`${ASSEMBLYAI_AGENTS_BASE_URL}/v1/agents`, {
    method: "POST",
    headers: {
      Authorization: requireAssemblyAIApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildFrontDeskAgentConfig({
      name,
      businessName,
      industry,
      agentPurpose,
      businessKnowledge,
      businessHoursStart,
      businessHoursEnd,
      businessDays,
      timezone,
      confirmationCallEnabled,
      feedbackEnabled,
    })),
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

export async function updateAssemblyAIAgent(
  assemblyaiAgentId: string,
  input: CreateAssemblyAIAgentInput,
): Promise<AssemblyAIAgent> {
  const response = await fetch(
    `${ASSEMBLYAI_AGENTS_BASE_URL}/v1/agents/${assemblyaiAgentId}`,
    {
      method: "PUT",
      headers: {
        Authorization: requireAssemblyAIApiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildFrontDeskAgentConfig(input)),
    },
  );

  const data = await parseAssemblyAIResponse(response);

  if (!response.ok) {
    const error = data as AssemblyAIErrorResponse | null;
    throw new Error(
      error?.detail ??
        error?.error ??
        `AssemblyAI agent update failed with status ${response.status}.`,
    );
  }

  return data as AssemblyAIAgent;
}
