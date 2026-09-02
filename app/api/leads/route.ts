import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type CreateLeadRequestBody = {
  call_id?: unknown;
  customer_name?: unknown;
  phone_number?: unknown;
  requested_service?: unknown;
  preferred_datetime?: unknown;
  notes?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeOptionalString(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string when provided.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasSingleRepeatedCharacter(value: string): boolean {
  if (value.length === 0) return false;

  return value.split("").every((character) => character === value[0]);
}

function isJunkCustomerName(customerName: string | null): boolean {
  if (!customerName) return true;

  const normalized = customerName.trim().toLowerCase();
  const compact = normalized.replace(/\s+/g, "");

  return (
    compact.length === 0 ||
    compact === "test" ||
    compact === "asdf" ||
    compact === "na" ||
    compact === "n/a" ||
    /^\d+$/.test(compact) ||
    hasSingleRepeatedCharacter(compact)
  );
}

function isJunkPhoneNumber(phoneNumber: string | null): boolean {
  if (!phoneNumber) return true;

  const digits = phoneNumber.replace(/\D/g, "");

  return digits.length < 7 || hasSingleRepeatedCharacter(digits);
}

function isSpamLead(customerName: string | null, phoneNumber: string | null): boolean {
  return isJunkCustomerName(customerName) || isJunkPhoneNumber(phoneNumber);
}

export async function POST(request: Request) {
  let body: CreateLeadRequestBody;

  try {
    body = (await request.json()) as CreateLeadRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  if (!isNonEmptyString(body.call_id)) {
    return Response.json({ error: "call_id is required." }, { status: 400 });
  }

  let customerName: string | null;
  let phoneNumber: string | null;
  let requestedService: string | null;
  let preferredDatetime: string | null;
  let notes: string | null;

  try {
    customerName = normalizeOptionalString(body.customer_name, "customer_name");
    phoneNumber = normalizeOptionalString(body.phone_number, "phone_number");
    requestedService = normalizeOptionalString(
      body.requested_service,
      "requested_service",
    );
    preferredDatetime = normalizeOptionalString(
      body.preferred_datetime,
      "preferred_datetime",
    );
    notes = normalizeOptionalString(body.notes, "notes");
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request body." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      call_id: body.call_id.trim(),
      customer_name: customerName,
      phone_number: phoneNumber,
      requested_service: requestedService,
      preferred_datetime: preferredDatetime,
      is_spam: isSpamLead(customerName, phoneNumber),
      notes,
      status: "new",
    })
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(lead, { status: 201 });
}
