const COOKIE_NAME = "assembler_review_session";

function bytes(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).slice().buffer as ArrayBuffer;
}

function base64url(data: ArrayBuffer): string {
  const raw = String.fromCharCode(...new Uint8Array(data));
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").map((part) => {
      const index = part.indexOf("=");
      if (index === -1) return [part.trim(), ""];
      return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
    }),
  );
}

function isLocalHost(host: string): boolean {
  const hostname = host.split(":")[0].toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function isLocalReviewerRequest(request: Request): boolean {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return isLocalHost(host);
}

async function signSessionId(sessionId: string): Promise<string> {
  const secret = process.env.REVIEWER_SESSION_SECRET?.trim() || process.env.CONNECTION_ENCRYPTION_KEY?.trim();
  if (!secret) throw new Error("Reviewer session secret is not configured.");
  const key = await crypto.subtle.importKey("raw", bytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(await crypto.subtle.sign("HMAC", key, bytes(sessionId)));
}

export async function createReviewerSessionCookie(): Promise<{ name: string; value: string }> {
  const sessionId = crypto.randomUUID();
  const signature = await signSessionId(sessionId);
  return { name: COOKIE_NAME, value: `${sessionId}.${signature}` };
}

export async function getReviewerSessionId(request: Request): Promise<string | null> {
  if (isLocalReviewerRequest(request)) return null;
  const cookie = parseCookies(request.headers.get("cookie"))[COOKIE_NAME];
  if (!cookie) return null;
  const dot = cookie.indexOf(".");
  if (dot <= 0) return null;
  const sessionId = cookie.slice(0, dot);
  const signature = cookie.slice(dot + 1);
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !signature) return null;
  const expected = await signSessionId(sessionId);
  if (expected.length !== signature.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0 ? sessionId : null;
}

export async function verifyReviewerAccessToken(token: string | null): Promise<boolean> {
  const expected = process.env.REVIEWER_ACCESS_TOKEN?.trim();
  if (!expected || !token || expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export const REVIEWER_COOKIE_NAME = COOKIE_NAME;
