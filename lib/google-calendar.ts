type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleFreeBusyResponse = {
  calendars?: {
    primary?: {
      busy?: {
        start: string;
        end: string;
      }[];
    };
  };
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

const GOOGLE_OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_FREE_BUSY_URL =
  "https://www.googleapis.com/calendar/v3/freeBusy";
const GOOGLE_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

function requireGoogleEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for Google Calendar integration.`);
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

function toUtcIso(dateISO: string, timeString: string): string {
  return `${dateISO}T${timeString}:00Z`;
}

async function parseGoogleResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text) return {} as T;

  return JSON.parse(text) as T;
}

function getGoogleErrorMessage(data: GoogleTokenResponse | GoogleFreeBusyResponse | GoogleEventResponse): string | null {
  if ("error_description" in data && data.error_description) {
    return data.error_description;
  }

  if (typeof data.error === "string") {
    return data.error;
  }

  return data.error?.message ?? null;
}

export function getGoogleOAuthUrl(agentId: string): string {
  const url = new URL(GOOGLE_OAUTH_URL);
  url.searchParams.set("client_id", requireGoogleEnv("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", requireGoogleEnv("GOOGLE_REDIRECT_URI"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", agentId);

  return url.toString();
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
      `Google Calendar request failed: ${
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
      `Google Calendar request failed: ${
        error instanceof Error ? error.message : "refresh token exchange failed"
      }`,
    );
  }
}

export async function checkGoogleCalendarAvailability(
  refreshToken: string,
  dateISO: string,
  businessHoursStart: string,
  businessHoursEnd: string,
  durationMinutes: number,
): Promise<string[]> {
  try {
    const accessToken = await getAccessTokenFromRefreshToken(refreshToken);
    const { startHour, endHour } = normalizeBusinessHours(
      businessHoursStart,
      businessHoursEnd,
    );
    const normalizedDurationMinutes = normalizeDurationMinutes(durationMinutes);
    const timeMin = toUtcIso(dateISO, formatTime(startHour));
    const timeMax = toUtcIso(dateISO, formatTime(endHour));
    const response = await fetch(GOOGLE_FREE_BUSY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        items: [{ id: "primary" }],
      }),
    });
    const data = await parseGoogleResponse<GoogleFreeBusyResponse>(response);

    if (!response.ok) {
      throw new Error(getGoogleErrorMessage(data) ?? response.statusText);
    }

    const busyPeriods = data.calendars?.primary?.busy ?? [];
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
        start: new Date(toUtcIso(dateISO, slotStart)),
        end: new Date(
          toUtcIso(dateISO, formatTimeFromMinutes(minutes + normalizedDurationMinutes)),
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
      `Google Calendar request failed: ${
        error instanceof Error ? error.message : "availability check failed"
      }`,
    );
  }
}

export async function createGoogleCalendarEvent(
  refreshToken: string,
  dateISO: string,
  timeString: string,
  durationMinutes: number,
  summary: string,
  description: string,
): Promise<string> {
  try {
    const accessToken = await getAccessTokenFromRefreshToken(refreshToken);
    const start = new Date(toUtcIso(dateISO, timeString));
    const end = new Date(start);
    end.setUTCMinutes(start.getUTCMinutes() + normalizeDurationMinutes(durationMinutes));
    const response = await fetch(GOOGLE_EVENTS_URL, {
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
      `Google Calendar request failed: ${
        error instanceof Error ? error.message : "event creation failed"
      }`,
    );
  }
}
