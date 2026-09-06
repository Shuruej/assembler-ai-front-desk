import { exchangeCodeForTokens } from "@/lib/google-calendar";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const agentId = requestUrl.searchParams.get("state");
  const dashboardUrl = new URL("/dashboard", requestUrl.origin);

  if (!code || !agentId) {
    dashboardUrl.searchParams.set(
      "error",
      "Google Calendar connection is missing a code or agent id.",
    );
    return Response.redirect(dashboardUrl, 302);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.refresh_token) {
      // Google may omit refresh_token after prior consent. Revoke prior access and reconnect; prompt=consent asks Google to issue it again.
      dashboardUrl.searchParams.set(
        "error",
        "Google did not return a refresh token. Revoke prior access and reconnect Google Calendar.",
      );
      return Response.redirect(dashboardUrl, 302);
    }

    const supabase = createSupabaseServiceRoleClient();
    const { error } = await supabase
      .from("agents")
      .update({
        google_refresh_token: tokens.refresh_token,
        google_calendar_connected: true,
      })
      .eq("id", agentId);

    if (error) {
      dashboardUrl.searchParams.set("error", error.message);
      return Response.redirect(dashboardUrl, 302);
    }

    return Response.redirect(dashboardUrl, 302);
  } catch (error) {
    dashboardUrl.searchParams.set(
      "error",
      error instanceof Error
        ? error.message
        : "Failed to connect Google Calendar.",
    );
    return Response.redirect(dashboardUrl, 302);
  }
}
