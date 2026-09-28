import { NextRequest, NextResponse } from "next/server";
import { getReviewerSessionId, isLocalReviewerRequest } from "@/lib/reviewer";

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
    return NextResponse.json({ error: "Private reviewer demo." }, { status: 401 });
  }
  return NextResponse.rewrite(new URL("/private-demo", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2)$).*)"],
};
