import { GoogleAuth } from "google-auth-library";
import { getAccessTokenFromRefreshToken } from "./google-calendar";

export type GoogleSheetsConfig = {
  spreadsheetId: string;
  spreadsheetTitle: string;
  sheetName: string;
};

type SpreadsheetMetadataResponse = {
  spreadsheetId?: string;
  properties?: { title?: string };
  sheets?: Array<{ properties?: { title?: string; sheetId?: number; index?: number } }>;
  error?: { message?: string };
};

type ValuesResponse = {
  values?: unknown[][];
  error?: { message?: string };
};

const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export function getGoogleSheetsServiceAccountEmail(): string | null {
  const value = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL?.trim();
  return value || null;
}

export function isGoogleSheetsServiceAccountConfigured(): boolean {
  return Boolean(
    getGoogleSheetsServiceAccountEmail() &&
      process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY?.trim(),
  );
}

async function getServiceAccountAccessToken(): Promise<string> {
  const clientEmail = getGoogleSheetsServiceAccountEmail();
  const encodedKey = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!clientEmail || !encodedKey) {
    throw new Error("Google Sheets service account is not configured.");
  }

  const auth = new GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: encodedKey.replace(/\\n/g, "\n"),
    },
    scopes: [GOOGLE_SHEETS_SCOPE],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Google service account did not return an access token.");
  return token.token;
}

export function parseGoogleSpreadsheetId(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const id = match?.[1] ?? trimmed;
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(id)) throw new Error("Enter a valid Google Sheets URL or spreadsheet ID.");
  return id;
}

export function validateGoogleSheetsConfig(value: unknown): GoogleSheetsConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Google Sheets configuration.");
  const config = value as Record<string, unknown>;
  if (typeof config.spreadsheetId !== "string" || typeof config.spreadsheetTitle !== "string" || typeof config.sheetName !== "string") throw new Error("Google Sheets setup is incomplete.");
  const spreadsheetId = parseGoogleSpreadsheetId(config.spreadsheetId);
  const spreadsheetTitle = config.spreadsheetTitle.trim();
  const sheetName = config.sheetName.trim();
  if (!spreadsheetTitle || !sheetName) throw new Error("Google Sheets setup is incomplete.");
  return { spreadsheetId, spreadsheetTitle, sheetName };
}
function a1(sheetName: string, range: string): string {
  const escaped = sheetName.replaceAll("'", "''");
  return `'${escaped}'!${range}`;
}

async function googleFetch(
  refreshToken: string | null,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const accessToken = refreshToken
    ? await getAccessTokenFromRefreshToken(refreshToken)
    : await getServiceAccountAccessToken();
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(10000),
  });
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function googleError(data: { error?: { message?: string } }, fallback: string): Error {
  return new Error(data.error?.message ?? fallback);
}
export async function getGoogleSpreadsheetMetadata(
  refreshToken: string | null,
  spreadsheetValue: string,
): Promise<{ spreadsheetId: string; spreadsheetTitle: string; sheets: string[] }> {
  const spreadsheetId = parseGoogleSpreadsheetId(spreadsheetValue);
  const fields = encodeURIComponent("spreadsheetId,properties.title,sheets.properties(sheetId,title,index)");
  const response = await googleFetch(refreshToken, `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=${fields}`);
  const data = await parseJson<SpreadsheetMetadataResponse>(response);
  if (!response.ok) throw googleError(data, "Could not open that Google Sheet.");

  const sheets = (data.sheets ?? [])
    .map((sheet) => sheet.properties?.title)
    .filter((title): title is string => Boolean(title));

  if (!data.properties?.title || sheets.length === 0) {
    throw new Error("Google returned an incomplete spreadsheet.");
  }

  return {
    spreadsheetId,
    spreadsheetTitle: data.properties.title,
    sheets,
  };
}
export async function createGoogleSpreadsheet(
  refreshToken: string,
  title: string,
  sheetName: string,
): Promise<GoogleSheetsConfig> {
  const spreadsheetTitle = title.trim();
  const tabTitle = sheetName.trim();
  if (!spreadsheetTitle || spreadsheetTitle.length > 120) throw new Error("Spreadsheet name is required.");
  if (!tabTitle || tabTitle.length > 100) throw new Error("Sheet tab name is required.");

  const response = await googleFetch(refreshToken, GOOGLE_SHEETS_API, {
    method: "POST",
    body: JSON.stringify({
      properties: { title: spreadsheetTitle },
      sheets: [{ properties: { title: tabTitle } }],
    }),
  });
  const data = await parseJson<SpreadsheetMetadataResponse>(response);
  if (!response.ok || !data.spreadsheetId) throw googleError(data, "Could not create Google Sheet.");

  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetTitle: data.properties?.title ?? spreadsheetTitle,
    sheetName: tabTitle,
  };
}
export async function appendRecordToGoogleSheet(
  refreshToken: string | null,
  config: GoogleSheetsConfig,
  record: {
    recordType: string;
    callId: string | null;
    payload: Record<string, unknown>;
    fields: Array<{ key: string; label: string }>;
  },
): Promise<void> {
  const headers = ["Captured at", "Record type", "Call ID", ...record.fields.map((field) => field.label)];
  const firstRowRange = encodeURIComponent(a1(config.sheetName, "1:1"));
  const valuesBase = `${GOOGLE_SHEETS_API}/${encodeURIComponent(config.spreadsheetId)}/values`;

  const firstRowResponse = await googleFetch(refreshToken, `${valuesBase}/${firstRowRange}`);
  const firstRowData = await parseJson<ValuesResponse>(firstRowResponse);
  if (!firstRowResponse.ok) throw googleError(firstRowData, "Could not read the configured sheet tab.");

  const existingHeaders = firstRowData.values?.[0]?.map((value) => String(value)) ?? [];
  if (existingHeaders.length === 0) {
    const headerResponse = await googleFetch(refreshToken, `${valuesBase}/${firstRowRange}?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ values: [headers] }),
    });
    const headerData = await parseJson<ValuesResponse>(headerResponse);
    if (!headerResponse.ok) throw googleError(headerData, "Could not create Google Sheets headers.");
  } else if (headers.some((header, index) => existingHeaders[index] !== header)) {
    throw new Error("The configured tab already has different columns. Use an empty tab for Assembler records.");
  }
  const row = [
    new Date().toISOString(),
    record.recordType,
    record.callId ?? "",
    ...record.fields.map((field) => record.payload[field.key] ?? ""),
  ];
  const appendRange = encodeURIComponent(a1(config.sheetName, "A:ZZ"));
  const appendResponse = await googleFetch(
    refreshToken,
    `${valuesBase}/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({ values: [row] }),
    },
  );
  const appendData = await parseJson<ValuesResponse>(appendResponse);
  if (!appendResponse.ok) throw googleError(appendData, "Could not append the record to Google Sheets.");
}
