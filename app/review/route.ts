import { NextResponse } from "next/server";
import { createReviewerSessionCookie, verifyReviewerAccessToken } from "@/lib/reviewer";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const publicOrigin = `${forwardedProto}://${forwardedHost}`;
  const token = url.searchParams.get("token");
  if (!(await verifyReviewerAccessToken(token))) {
    return NextResponse.redirect(new URL("/private-demo?error=invalid", publicOrigin), 302);
  }

  const session = await createReviewerSessionCookie();
  const response = NextResponse.redirect(new URL("/", publicOrigin), 302);
  response.cookies.set({
    name: session.name,
    value: session.value,
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 3,
  });
  return response;
}
