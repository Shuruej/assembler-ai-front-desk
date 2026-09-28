import { getGoogleOAuthUrl } from "@/lib/google-calendar";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const hostname = forwardedHost.split(":")[0].toLowerCase();
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  if (!isLocal) {
    const forwardedProto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
    const setupUrl = new URL("/agents/" + id + "/google-sheets", forwardedProto + "://" + forwardedHost);
    setupUrl.searchParams.set("error", "Google Sheets sign-in is disabled in the public demo.");
    return Response.redirect(setupUrl, 302);
  }
  return Response.redirect(getGoogleOAuthUrl(id, "sheets"), 302);
}
