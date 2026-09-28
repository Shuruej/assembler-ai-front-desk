import { getGoogleServiceAccountAccessToken, getGoogleServiceAccountEmail, isGoogleServiceAccountConfigured } from "./google-service-account";

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleFreeBusyResponse = {
  calendars?: Record<string, {
    busy?: {
      start: string;
      end: string;
    }[];
    errors?: Array<{ reason?: string; message?: string }>;
  }>;
  error?: {
    message?: string;
  };
};

type GoogleEventResponse = {
  id?: string;
  error?: {
    message?: string;
  };
};

type GoogleCalendarMetadataResponse = {
  id?: string;
  summary?: string;
  timeZone?: string;
  error?: { message?: string };
};

export type GoogleCalendarConfig = {
  calendarId: string;
  calendarTitle: string;
  timeZone: string;
};

const GOOGLE_OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_FREE_BUSY_URL =
  "https://www.googleapis.com/calendar/v3/freeBusy";
const GOOGLE_CALENDAR_API =
  "https://www.googleapis.com/calendar/v3/calendars";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export type GoogleIntegration = "calendar" | "sheets";

function requireGoogleEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for Google integrations.`);
  }

  return value;
}

function normalizeBusinessHour(value: string, fallback: number): number {
  const match = value.trim().match(/^([01]?\d|2[0-3])(?::[0-5]\d)?$/);
  if (!match) return fallback;

  return Number(match[1]);
}

function normalizeBusinessHours(
  businessHoursStart: string,
  businessHoursEnd: string,
) {
  const startHour = normalizeBusinessHour(businessHoursStart, 9);
  const endHour = normalizeBusinessHour(businessHoursEnd, 18);

  return startHour < endHour
    ? { startHour, endHour }
    : { startHour: 9, endHour: 18 };
}

function normalizeDurationMinutes(value: number): number {
  return Number.isInteger(value) && value > 0 && value <= 480 ? value : 60;
}

function formatTime(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatTimeFromMinutes(totalMinutes: number): string {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function toUtcIso(dateISO: string, timeString: string, timeZone = "UTC"): string {
  const [year, month, day] = dateISO.split("-").map(Number);
  const [hour, minute] = timeString.split(":").map(Number);
  const targetLocal = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = targetLocal;

  for (let index = 0; index < 2; index += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const localAtGuess = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    guess = targetLocal - (localAtGuess - guess);
  }

  return new Date(guess).toISOString();
}

async function parseGoogleResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text) return {} as T;

  return JSON.parse(text) as T;
}

function getGoogleErrorMessage(data: GoogleTokenResponse | GoogleFreeBusyResponse | GoogleEventResponse | GoogleCalendarMetadataResponse): string | null {
  if ("error_description" in data && data.error_description) {
    return data.error_description;
  }

  if (typeof data.error === "string") {
    return data.error;
  }

  return data.error?.message ?? null;
}

export function getGoogleOAuthUrl(agentId: string, integration: GoogleIntegration = "calendar"): string {
  const url = new URL(GOOGLE_OAUTH_URL);
  url.searchParams.set("client_id", requireGoogleEnv("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", requireGoogleEnv("GOOGLE_REDIRECT_URI"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", integration === "sheets" ? GOOGLE_SHEETS_SCOPE : GOOGLE_CALENDAR_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", `${integration}:${agentId}`);

  return url.toString();
}

export function parseGoogleOAuthState(value: string): { agentId: string; integration: GoogleIntegration } {
  const separator = value.indexOf(":");
  if (separator === -1) return { agentId: value, integration: "calendar" };
  const integration = value.slice(0, separator);
  const agentId = value.slice(separator + 1);
  if ((integration !== "calendar" && integration !== "sheets") || !agentId) throw new Error("Invalid Google OAuth state.");
  return { agentId, integration };
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: requireGoogleEnv("GOOGLE_CLIENT_ID"),
        client_secret: requireGoogleEnv("GOOGLE_CLIENT_SECRET"),
        code,
        redirect_uri: requireGoogleEnv("GOOGLE_REDIRECT_URI"),
        grant_type: "authorization_code",
      }),
    });
    const data = await parseGoogleResponse<GoogleTokenResponse>(response);

    if (!response.ok) {
      throw new Error(getGoogleErrorMessage(data) ?? response.statusText);
    }

    return data;
  } catch (error) {
    throw new Error(
      `Google request failed: ${
        error instanceof Error ? error.message : "token exchange failed"
      }`,
    );
  }
}

export async function getAccessTokenFromRefreshToken(
  refreshToken: string,
): Promise<string> {
  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: requireGoogleEnv("GOOGLE_CLIENT_ID"),
        client_secret: requireGoogleEnv("GOOGLE_CLIENT_SECRET"),
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const data = await parseGoogleResponse<GoogleTokenResponse>(response);

    if (!response.ok || !data.access_token) {
      throw new Error(
        getGoogleErrorMessage(data) ?? "Google did not return an access token.",
      );
    }

    return data.access_token;
  } catch (error) {
    throw new Error(
      `Google request failed: ${
        error instanceof Error ? error.message : "refresh token exchange failed"
      }`,
    );
  }
}

export function getGoogleCalendarServiceAccountEmail(): string | null {
  return getGoogleServiceAccountEmail();
}

export function isGoogleCalendarServiceAccountConfigured(): boolean {
  return isGoogleServiceAccountConfigured();
}

async function getCalendarAccessToken(refreshToken: string | null): Promise<string> {
  return refreshToken
    ? getAccessTokenFromRefreshToken(refreshToken)
    : getGoogleServiceAccountAccessToken([GOOGLE_CALENDAR_SCOPE]);
}

export function validateGoogleCalendarConfig(value: unknown): GoogleCalendarConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Google Calendar configuration.");
  }
  const config = value as Record<string, unknown>;
  if (
    typeof config.calendarId !== "string" ||
    typeof config.calendarTitle !== "string" ||
    typeof config.timeZone !== "string"
  ) {
    throw new Error("Google Calendar setup is incomplete.");
  }
  const calendarId = config.calendarId.trim();
  const calendarTitle = config.calendarTitle.trim();
  const timeZone = config.timeZone.trim();
  if (!calendarId || !calendarTitle || !timeZone) {
    throw new Error("Google Calendar setup is incomplete.");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  } catch {
    throw new Error("Google Calendar returned an invalid timezone.");
  }
  return { calendarId, calendarTitle, timeZone };
}

export async function getGoogleCalendarMetadata(
  refreshToken: string | null,
  calendarIdValue: string,
): Promise<GoogleCalendarConfig> {
  const calendarId = calendarIdValue.trim();
  if (!calendarId || calendarId.length > 320) {
    throw new Error("Enter a valid Google Calendar ID.");
  }
  const accessToken = await getCalendarAccessToken(refreshToken);
  const response = await fetch(
    `${GOOGLE_CALENDAR_API}/${encodeURIComponent(calendarId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    },
  );
  const data = await parseGoogleResponse<GoogleCalendarMetadataResponse>(response);
  if (!response.ok || !data.id) {
    throw new Error(
      getGoogleErrorMessage(data) ??
        "Could not open that Google Calendar. Share it with the Assembler service account first.",
    );
  }
  return {
    calendarId: data.id,
    calendarTitle: data.summary?.trim() || data.id,
    timeZone: data.timeZone?.trim() || "UTC",
  };
}

export async function checkGoogleCalendarAvailability(
  refreshToken: string | null,
  dateISO: string,
  businessHoursStart: string,
  businessHoursEnd: string,
  durationMinutes: number,
  calendarId = "primary",
  timeZone = "UTC",
): Promise<string[]> {
  try {
    const accessToken = await getCalendarAccessToken(refreshToken);
    const { startHour, endHour } = normalizeBusinessHours(
      businessHoursStart,
      businessHoursEnd,
    );
    const normalizedDurationMinutes = normalizeDurationMinutes(durationMinutes);
    const timeMin = toUtcIso(dateISO, formatTime(startHour), timeZone);
    const timeMax = toUtcIso(dateISO, formatTime(endHour), timeZone);
    const response = await fetch(GOOGLE_FREE_BUSY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        items: [{ id: calendarId }],
      }),
    });
    const data = await parseGoogleResponse<GoogleFreeBusyResponse>(response);

    if (!response.ok) {
      throw new Error(getGoogleErrorMessage(data) ?? response.statusText);
    }

    const calendarResult = data.calendars?.[calendarId];
    if (calendarResult?.errors?.length) {
      throw new Error(calendarResult.errors[0]?.message ?? "Google Calendar access failed.");
    }
    const busyPeriods = calendarResult?.busy ?? [];
    const startMinutes = startHour * 60;
    const endMinutes = endHour * 60;
    const candidateSlots = [];

    for (
      let minutes = startMinutes;
      minutes + normalizedDurationMinutes <= endMinutes;
      minutes += normalizedDurationMinutes
    ) {
      const slotStart = formatTimeFromMinutes(minutes);
      candidateSlots.push({
        start: new Date(toUtcIso(dateISO, slotStart, timeZone)),
        end: new Date(
          toUtcIso(dateISO, formatTimeFromMinutes(minutes + normalizedDurationMinutes), timeZone),
        ),
        time: slotStart,
      });
    }

    return candidateSlots
      .filter((slot) =>
        busyPeriods.every((busyPeriod) => {
          const busyStart = new Date(busyPeriod.start);
          const busyEnd = new Date(busyPeriod.end);

          return slot.end <= busyStart || slot.start >= busyEnd;
        }),
      )
      .map((slot) => slot.time);
  } catch (error) {
    throw new Error(
      `Google request failed: ${
        error instanceof Error ? error.message : "availability check failed"
      }`,
    );
  }
}

export async function createGoogleCalendarEvent(
  refreshToken: string | null,
  dateISO: string,
  timeString: string,
  durationMinutes: number,
  summary: string,
  description: string,
  calendarId = "primary",
  timeZone = "UTC",
): Promise<string> {
  try {
    const accessToken = await getCalendarAccessToken(refreshToken);
    const start = new Date(toUtcIso(dateISO, timeString, timeZone));
    const end = new Date(start);
    end.setUTCMinutes(start.getUTCMinutes() + normalizeDurationMinutes(durationMinutes));
    const response = await fetch(`${GOOGLE_CALENDAR_API}/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary,
        description,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      }),
    });
    const data = await parseGoogleResponse<GoogleEventResponse>(response);

    if (!response.ok || !data.id) {
      throw new Error(
        getGoogleErrorMessage(data) ?? "Google did not return an event id.",
      );
    }

    return data.id;
  } catch (error) {
    throw new Error(
      `Google request failed: ${
        error instanceof Error ? error.message : "event creation failed"
      }`,
    );
  }
}
