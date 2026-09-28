import { encryptSecret } from "@/lib/assembler/connections";
import { exchangeCodeForTokens, parseGoogleOAuthState } from "@/lib/google-calendar";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const dashboardUrl = new URL("/dashboard", requestUrl.origin);

  if (!code || !state) {
    dashboardUrl.searchParams.set("error", "Google connection is missing an authorization code or agent id.");
    return Response.redirect(dashboardUrl, 302);
  }

  let agentId: string;
  let integration: "calendar" | "sheets";
  try {
    ({ agentId, integration } = parseGoogleOAuthState(state));
  } catch (error) {
    dashboardUrl.searchParams.set("error", error instanceof Error ? error.message : "Invalid Google authorization state.");
    return Response.redirect(dashboardUrl, 302);
  }
  const successUrl =
    integration === "sheets"
      ? new URL(`/agents/${agentId}/google-sheets`, requestUrl.origin)
      : dashboardUrl;

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      successUrl.searchParams.set(
        "error",
        "Google did not return a refresh token. Revoke prior access and reconnect.",
      );
      return Response.redirect(successUrl, 302);
    }

    const supabase = createSupabaseServiceRoleClient();

    if (integration === "sheets") {
      const { data: existing } = await supabase
        .from("agent_connections")
        .select("config")
        .eq("agent_id", agentId)
        .eq("connection_key", "google_sheets")
        .maybeSingle();
      const existingConfig =
        existing?.config && typeof existing.config === "object" && !Array.isArray(existing.config)
          ? existing.config
          : {};
      const configured =
        typeof (existingConfig as Record<string, unknown>).spreadsheetId === "string";

      const { error } = await supabase.from("agent_connections").upsert(
        {
          agent_id: agentId,
          connection_key: "google_sheets",
          name: "Google Sheets",
          kind: "google_sheets",
          config: existingConfig,
          encrypted_secret: encryptSecret(tokens.refresh_token),
          status: configured ? "configured" : "authorized",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "agent_id,connection_key" },
      );

      if (error) throw new Error("Could not save Google Sheets authorization.");
      successUrl.searchParams.set("connected", "1");
      return Response.redirect(successUrl, 302);
    }
    const { error } = await supabase
      .from("agents")
      .update({
        google_refresh_token: tokens.refresh_token,
        google_calendar_connected: true,
      })
      .eq("id", agentId);

    if (error) throw new Error(error.message);
    return Response.redirect(successUrl, 302);
  } catch (error) {
    successUrl.searchParams.set(
      "error",
      error instanceof Error ? error.message : "Failed to connect Google.",
    );
    return Response.redirect(successUrl, 302);
  }
}
