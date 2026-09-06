import { getGoogleOAuthUrl } from "@/lib/google-calendar";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  return Response.redirect(getGoogleOAuthUrl(id), 302);
}
