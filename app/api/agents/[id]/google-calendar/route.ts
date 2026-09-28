import {
  getGoogleCalendarMetadata,
  getGoogleCalendarServiceAccountEmail,
  isGoogleCalendarServiceAccountConfigured,
  type GoogleCalendarConfig,
} from "@/lib/google-calendar";
import { getReviewerSessionId } from "@/lib/reviewer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ id: string }> };

function publicConnection(connection: { status: string; config: unknown } | null) {
  const serviceAccountEmail = isGoogleCalendarServiceAccountConfigured()
    ? getGoogleCalendarServiceAccountEmail()
    : null;
  const config =
    connection?.config && typeof connection.config === "object" && !Array.isArray(connection.config)
      ? (connection.config as Partial<GoogleCalendarConfig>)
      : null;
  return {
    ready: Boolean(serviceAccountEmail),
    service_account_email: serviceAccountEmail,
    status: connection?.status ?? "not_connected",
    config: config?.calendarId ? config : null,
  };
}

async function getConnection(agentId: string, reviewerId: string | null) {
  const supabase = createSupabaseServiceRoleClient();
  if (reviewerId) {
    const { data, error } = await supabase
      .from("reviewer_calendar_connections")
      .select("id,config,status")
      .eq("reviewer_id", reviewerId)
      .eq("agent_id", agentId)
      .maybeSingle();
    if (error) throw new Error("Could not load reviewer Google Calendar connection.");
    return { supabase, connection: data };
  }

  const { data, error } = await supabase
    .from("agent_connections")
    .select("id,config,status")
    .eq("agent_id", agentId)
    .eq("connection_key", "google_calendar")
    .maybeSingle();
  if (error) throw new Error("Could not load Google Calendar connection.");
  return { supabase, connection: data };
}

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const reviewerId = await getReviewerSessionId(request);
    const { connection } = await getConnection(id, reviewerId);
    return Response.json(publicConnection(connection));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load Google Calendar." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON request." }, { status: 400 }); }

  try {
    if (!isGoogleCalendarServiceAccountConfigured()) {
      throw new Error("Shared Google Calendar access is not configured on this server.");
    }
    if (typeof body.calendar_id !== "string") {
      throw new Error("Calendar ID is required.");
    }

    const reviewerId = await getReviewerSessionId(request);
    const { supabase } = await getConnection(id, reviewerId);
    const config = await getGoogleCalendarMetadata(null, body.calendar_id);

    if (body.action === "test") return Response.json(config);
    if (body.action !== "save") {
      return Response.json({ error: "Unsupported Google Calendar action." }, { status: 400 });
    }

    if (reviewerId) {
      const { data, error } = await supabase.from("reviewer_calendar_connections").upsert(
        {
          reviewer_id: reviewerId,
          agent_id: id,
          config,
          status: "configured",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "reviewer_id,agent_id" },
      ).select("status,config").single();
      if (error) throw new Error("Could not save reviewer Google Calendar setup.");
      return Response.json(publicConnection(data));
    }

    const { data, error } = await supabase.from("agent_connections").upsert(
      {
        agent_id: id,
        connection_key: "google_calendar",
        name: "Google Calendar",
        kind: "google_calendar",
        config,
        encrypted_secret: null,
        status: "configured",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "agent_id,connection_key" },
    ).select("status,config").single();
    if (error) throw new Error("Could not save Google Calendar setup.");
    return Response.json(publicConnection(data));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Google Calendar request failed." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  const reviewerId = await getReviewerSessionId(request);
  const supabase = createSupabaseServiceRoleClient();
  const query = reviewerId
    ? supabase.from("reviewer_calendar_connections").delete().eq("reviewer_id", reviewerId).eq("agent_id", id)
    : supabase.from("agent_connections").delete().eq("agent_id", id).eq("connection_key", "google_calendar");
  const { error } = await query;
  if (error) return Response.json({ error: "Could not disconnect Google Calendar." }, { status: 500 });
  return Response.json({ disconnected: true });
}
