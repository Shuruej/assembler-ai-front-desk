import { normalizeFollowUpPreferences } from "@/lib/follow-up-preferences";

// Kept for callers of the older guided configuration API. Configuration is local.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    body = value as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  if (typeof body.description !== "string" || !body.description.trim()) {
    return Response.json({ error: "Business description is required." }, { status: 400 });
  }
  const description = body.description.trim();
  const calledMatch = description.match(/\bcalled\s+([^.,]+?)(?=\s+(?:we|i|our)\b|[.,]|$)/i);
  const hoursMatch = description.match(/\bfrom\s+([0-9]{1,2}(?::[0-9]{2})?\s*(?:AM|PM)?)\s+to\s+([0-9]{1,2}(?::[0-9]{2})?\s*(?:AM|PM)?)/i);
  const lower = description.toLowerCase();
  const agentPurpose = /appointment|book/.test(lower) ? "appointment_booking" : /support|help/.test(lower) ? "customer_support" : /product|pricing/.test(lower) ? "product_inquiry" : /qualify|lead/.test(lower) ? "lead_qualification" : /feedback/.test(lower) ? "feedback_collection" : "general_receptionist";
  const industry = /restaurant/.test(lower) ? "Restaurant" : /real estate|property/.test(lower) ? "Property" : /repair|vehicle/.test(lower) ? "Auto repair" : /store|order|ecommerce/.test(lower) ? "Retail" : /helpdesk|device/.test(lower) ? "IT support" : "General service business";
  return Response.json({
    business_name: calledMatch?.[1]?.trim() || "Your business",
    industry,
    name: "Ava",
    agent_purpose: agentPurpose,
    business_knowledge: `${description}\n\nDo not invent exact prices or unknown business details.`,
    business_hours_start: hoursMatch?.[1]?.trim() || "09:00",
    business_hours_end: hoursMatch?.[2]?.trim() || "17:00",
    timezone: "Asia/Karachi",
    follow_up_preferences: normalizeFollowUpPreferences(body.follow_up_preferences),
  });
}
