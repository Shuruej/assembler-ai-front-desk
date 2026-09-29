import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type SmsPurpose =
  | "booking_confirmation"
  | "verification_code"
  | "escalation_alert"
  | "feedback_alert"
  | "review_request";

type SmsInput = {
  agentId: string;
  leadId?: string | null;
  toNumber?: string | null;
  purpose: SmsPurpose;
  message: string;
};

function twilioConfig() {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  return sid && token && from ? { sid, token, from } : null;
}

async function writeSmsLog(input: SmsInput, _status: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from("sms_logs").insert({
    agent_id: input.agentId,
    lead_id: input.leadId ?? null,
    to_number: input.toNumber ?? null,
    purpose: input.purpose,
    message: input.message,
  });
  if (error) console.error("Failed to log SMS.", error);
}

export async function sendSms(input: SmsInput) {
  if (!input.toNumber) {
    await writeSmsLog(input, "missing_number");
    return { sent: false, provider: "none" as const };
  }

  const config = twilioConfig();
  if (!config) {
    await writeSmsLog(input, "simulated");
    return { sent: false, provider: "simulated" as const };
  }

  const body = new URLSearchParams({
    To: input.toNumber,
    From: config.from,
    Body: input.message,
  });
  const auth = Buffer.from(`${config.sid}:${config.token}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.sid}/Messages.json`,
    { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, body },
  );
  if (!response.ok) {
    await writeSmsLog(input, "failed");
    throw new Error("SMS provider rejected the message.");
  }
  await writeSmsLog(input, "sent");
  return { sent: true, provider: "twilio" as const };
}

/** Backward-compatible entry point used by existing booking/escalation flows. */
export async function logSimulatedSms(input: SmsInput) {
  try {
    return await sendSms(input);
  } catch (error) {
    console.error("SMS delivery failed.", error);
    return { sent: false, provider: "failed" as const };
  }
}

export function createVerificationCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
