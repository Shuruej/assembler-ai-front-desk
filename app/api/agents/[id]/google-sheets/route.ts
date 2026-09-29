import { decryptSecret } from "@/lib/assembler/connections";
import {
  createGoogleSpreadsheet,
  getGoogleSheetsServiceAccountEmail,
  getGoogleSpreadsheetMetadata,
  isGoogleSheetsServiceAccountConfigured,
  type GoogleSheetsConfig,
} from "@/lib/google-sheets";
import { getReviewerSessionId } from "@/lib/reviewer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ id: string }> };

function publicConnection(
  connection: { status: string; config: unknown } | null,
  request: Request,
) {
  const serviceAccountEmail = isGoogleSheetsServiceAccountConfigured()
    ? getGoogleSheetsServiceAccountEmail()
    : null;
  const oauthAllowed = new URL(request.url).hostname === "localhost";
  const config =
    connection?.config && typeof connection.config === "object" && !Array.isArray(connection.config)
      ? (connection.config as Partial<GoogleSheetsConfig>)
      : null;
  return {
    authorized: Boolean(serviceAccountEmail) || Boolean(connection),
    auth_mode: serviceAccountEmail ? "service_account" : connection ? "oauth" : "none",
    service_account_email: serviceAccountEmail,
    oauth_available: oauthAllowed,
    status: connection?.status ?? "not_connected",
    config: config?.spreadsheetId ? config : null,
  };
}

async function getConnection(agentId: string, reviewerId: string | null) {
  const supabase = createSupabaseServiceRoleClient();
  if (reviewerId) {
    const { data, error } = await supabase
      .from("reviewer_sheet_connections")
      .select("id,config,status")
      .eq("reviewer_id", reviewerId)
      .eq("agent_id", agentId)
      .maybeSingle();
    if (error) throw new Error("Could not load reviewer Google Sheets connection.");
    if (data?.status === "configured") return { supabase, connection: { ...data, kind: "google_sheets", encrypted_secret: null } };
    const fallback = await supabase.from("agent_connections").select("id,kind,config,encrypted_secret,status").eq("agent_id", agentId).eq("connection_key", "google_sheets").maybeSingle();
    if (fallback.error) throw new Error("Could not load demo Google Sheets connection.");
    return { supabase, connection: fallback.data };
  }
  const { data, error } = await supabase
    .from("agent_connections")
    .select("id,kind,config,encrypted_secret,status")
    .eq("agent_id", agentId)
    .eq("connection_key", "google_sheets")
    .maybeSingle();
  if (error) throw new Error("Could not load Google Sheets connection.");
  return { supabase, connection: data };
}

function connectionToken(connection: { kind?: string; encrypted_secret?: string | null } | null): string | null {
  if (isGoogleSheetsServiceAccountConfigured()) return null;
  if (!connection?.encrypted_secret) throw new Error("Google Sheets is not configured.");
  return decryptSecret(connection.encrypted_secret);
}

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const reviewerId = await getReviewerSessionId(request);
    const { connection } = await getConnection(id, reviewerId);
    return Response.json(publicConnection(connection, request));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load Google Sheets." }, { status: 500 });
  }
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON request." }, { status: 400 }); }

  try {
    const reviewerId = await getReviewerSessionId(request);
    const { supabase, connection } = await getConnection(id, reviewerId);
    const token = connectionToken(connection);
    const action = body.action;

    if (action === "test" || action === "save") {
      if (typeof body.spreadsheet !== "string") throw new Error("Paste a Google Sheets URL or spreadsheet ID.");
      const metadata = await getGoogleSpreadsheetMetadata(token, body.spreadsheet);
      if (action === "test") return Response.json(metadata);
      if (typeof body.sheet_name !== "string" || !metadata.sheets.includes(body.sheet_name)) throw new Error("Choose a valid sheet tab.");

      const config: GoogleSheetsConfig = {
        spreadsheetId: metadata.spreadsheetId,
        spreadsheetTitle: metadata.spreadsheetTitle,
        sheetName: body.sheet_name,
      };

      if (reviewerId) {
        const { data, error } = await supabase.from("reviewer_sheet_connections").upsert(
          { reviewer_id: reviewerId, agent_id: id, config, status: "configured", updated_at: new Date().toISOString() },
          { onConflict: "reviewer_id,agent_id" },
        ).select("status,config").single();
        if (error) throw new Error("Could not save reviewer Google Sheets setup.");
        return Response.json(publicConnection(data, request));
      }

      const { data, error } = await supabase.from("agent_connections").upsert(
        {
          agent_id: id,
          connection_key: "google_sheets",
          name: "Google Sheets",
          kind: "google_sheets",
          config,
          encrypted_secret: connection?.encrypted_secret ?? null,
          status: "configured",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "agent_id,connection_key" },
      ).select("status,config").single();
      if (error) throw new Error("Could not save Google Sheets setup.");
      return Response.json(publicConnection(data, request));
    }

    if (action === "create") {
      if (reviewerId) throw new Error("Public reviewers should connect an existing shared Sheet.");
      if (!connection?.encrypted_secret) throw new Error("Create-new requires owner OAuth.");
      if (typeof body.title !== "string" || typeof body.sheet_name !== "string") throw new Error("Spreadsheet name and sheet tab name are required.");
      const config = await createGoogleSpreadsheet(decryptSecret(connection.encrypted_secret), body.title, body.sheet_name);
      const { data, error } = await supabase.from("agent_connections").update({ config, status: "configured", updated_at: new Date().toISOString() }).eq("agent_id", id).eq("connection_key", "google_sheets").select("status,config").single();
      if (error) throw new Error("Could not save the new Google Sheet.");
      return Response.json(publicConnection(data, request), { status: 201 });
    }

    return Response.json({ error: "Unsupported Google Sheets action." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Google Sheets request failed." }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  const reviewerId = await getReviewerSessionId(request);
  const supabase = createSupabaseServiceRoleClient();
  const query = reviewerId
    ? supabase.from("reviewer_sheet_connections").delete().eq("reviewer_id", reviewerId).eq("agent_id", id)
    : supabase.from("agent_connections").delete().eq("agent_id", id).eq("connection_key", "google_sheets");
  const { error } = await query;
  if (error) return Response.json({ error: "Could not disconnect Google Sheets." }, { status: 500 });
  return Response.json({ disconnected: true });
}
