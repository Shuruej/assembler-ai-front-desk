import { readFileSync } from "node:fs";
import { GoogleAuth } from "google-auth-library";

type GoogleServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

function getCredentials(): GoogleServiceAccountCredentials | null {
  try {
    const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64?.trim();
    const inline =
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ||
      process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON?.trim();
    const file =
      process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim() ||
      process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE?.trim();
    const raw = encoded
      ? Buffer.from(encoded, "base64url").toString("utf8")
      : inline || (file ? readFileSync(file, "utf8") : "");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GoogleServiceAccountCredentials>;
    if (!parsed.client_email || !parsed.private_key) return null;
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  } catch {
    return null;
  }
}

export function getGoogleServiceAccountEmail(): string | null {
  return getCredentials()?.client_email ?? null;
}

export function isGoogleServiceAccountConfigured(): boolean {
  return Boolean(getCredentials());
}

export async function getGoogleServiceAccountAccessToken(
  scopes: string[],
): Promise<string> {
  const credentials = getCredentials();
  if (!credentials) throw new Error("Google service account is not configured.");

  const auth = new GoogleAuth({ credentials, scopes });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Google service account did not return an access token.");
  return token.token;
}
