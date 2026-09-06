import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

// This simulates sending an SMS by logging it instead of calling a real provider. In production, this is where a Twilio (or similar) API call would go.
export async function logSimulatedSms({
  agentId,
  leadId = null,
  toNumber = null,
  purpose,
  message,
}: {
  agentId: string;
  leadId?: string | null;
  toNumber?: string | null;
  purpose:
    | "booking_confirmation"
    | "escalation_alert"
    | "feedback_alert"
    | "review_request";
  message: string;
}) {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { error } = await supabase.from("sms_logs").insert({
      agent_id: agentId,
      lead_id: leadId,
      to_number: toNumber,
      purpose,
      message,
    });

    if (error) {
      console.error("Failed to log simulated SMS.", error);
    }
  } catch (error) {
    console.error("Failed to log simulated SMS.", error);
  }
}
