import { NextRequest, NextResponse } from "next/server";
import { createReviewerSessionCookie, getReviewerSessionId, isLocalReviewerRequest } from "@/lib/reviewer";

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (isLocalReviewerRequest(request)) return NextResponse.next();
  if (pathname === "/review" || pathname === "/private-demo") return NextResponse.next();

  const reviewerId = await getReviewerSessionId(request);
  if (reviewerId) {
    const response = NextResponse.next();
    response.headers.set("x-assembler-reviewer-id", reviewerId);
    return response;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Start a browser session from the app first." }, { status: 401 });
  }

  const session = await createReviewerSessionCookie();
  const response = NextResponse.redirect(request.nextUrl);
  response.cookies.set({
    name: session.name,
    value: session.value,
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2)$).*)"],
};
