import "server-only";
import { eq } from "drizzle-orm";
import { db, googleAccounts } from "@/db";

// Read-only Google Calendar access per person, using OAuth with offline access.
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (a "Web application" OAuth client
// in Google Cloud, with <APP_URL>/api/google/callback as an authorised redirect URI).

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.readonly"];

export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/**
 * The address people reach the app at. In a container, route handlers see the
 * bind address (e.g. http://0.0.0.0:8080) as the request URL, so prefer APP_URL,
 * then the forwarded / Host headers the proxy (Cloud Run, nginx) passes on.
 */
export function publicOrigin(headers: Headers) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000";
  const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export const redirectUri = (headers: Headers) => `${publicOrigin(headers)}/api/google/callback`;

export function authUrl(state: string, redirect: string) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirect,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    // always ask, so Google returns a refresh token even when reconnecting
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${q}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; id_token?: string };

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...params,
    }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleError(body.error ?? `HTTP ${res.status}`, body.error_description);
  return body;
}

export class GoogleError extends Error {
  constructor(
    public code: string,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

/** Exchanges the sign-in code and saves the connection for `userId`. */
export async function connectGoogle(userId: string, code: string, redirect: string) {
  const t = await tokenRequest({ code, redirect_uri: redirect, grant_type: "authorization_code" });
  if (!t.refresh_token) throw new GoogleError("no_refresh_token", "Google did not grant offline access");
  // the id_token comes straight from Google's token endpoint over TLS, so its claims can be read as is
  const claims = t.id_token ? JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString()) : {};
  const values = {
    email: String(claims.email ?? "Google account"),
    refreshToken: t.refresh_token,
    accessToken: t.access_token,
    accessTokenExpiresAt: new Date(Date.now() + t.expires_in * 1000),
  };
  await db
    .insert(googleAccounts)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: googleAccounts.userId, set: values });
}

export async function getGoogleAccount(userId: string) {
  const [a] = await db.select().from(googleAccounts).where(eq(googleAccounts.userId, userId));
  return a ?? null;
}

/** A valid access token, refreshed when it is about to expire. */
async function accessToken(userId: string) {
  const a = await getGoogleAccount(userId);
  if (!a) return null;
  if (a.accessToken && a.accessTokenExpiresAt && a.accessTokenExpiresAt.getTime() > Date.now() + 60_000) {
    return a.accessToken;
  }
  const t = await tokenRequest({ refresh_token: a.refreshToken, grant_type: "refresh_token" });
  await db
    .update(googleAccounts)
    .set({ accessToken: t.access_token, accessTokenExpiresAt: new Date(Date.now() + t.expires_in * 1000) })
    .where(eq(googleAccounts.userId, userId));
  return t.access_token;
}

async function api<T>(userId: string, path: string): Promise<T> {
  const token = await accessToken(userId);
  if (!token) throw new GoogleError("not_connected");
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new GoogleError(String(res.status), body.error?.message);
  }
  return res.json();
}

export type GoogleCalendar = { id: string; summary: string; primary?: boolean; backgroundColor?: string };

export async function listGoogleCalendars(userId: string): Promise<GoogleCalendar[]> {
  const r = await api<{ items: GoogleCalendar[] }>(userId, "/users/me/calendarList?minAccessRole=reader");
  return r.items.sort((a, b) => Number(!!b.primary) - Number(!!a.primary) || a.summary.localeCompare(b.summary));
}

export type GoogleEvent = {
  id: string;
  calendarId: string;
  title: string;
  /** all-day events have dates, timed ones have instants */
  allDay: boolean;
  start: Date;
  end: Date;
  startDate?: string;
  endDate?: string; // exclusive, as Google sends it
  location?: string;
  htmlLink?: string;
  color?: string;
};

type RawEvent = {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
};

/** Events from the person's chosen calendars between two instants. */
export async function listGoogleEvents(userId: string, from: Date, to: Date): Promise<GoogleEvent[]> {
  const a = await getGoogleAccount(userId);
  if (!a) return [];
  const calendars = await listGoogleCalendars(userId).catch(() => [] as GoogleCalendar[]);
  const colourOf = new Map(calendars.map((c) => [c.id, c.backgroundColor]));
  const results = await Promise.all(
    a.calendarIds.map(async (calendarId) => {
      const q = new URLSearchParams({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "2500",
      });
      const r = await api<{ items: RawEvent[] }>(userId, `/calendars/${encodeURIComponent(calendarId)}/events?${q}`);
      return r.items
        .filter((e) => e.status !== "cancelled")
        .map((e): GoogleEvent => {
          const allDay = !!e.start.date;
          return {
            id: e.id,
            calendarId,
            title: e.summary || "(No title)",
            allDay,
            start: new Date(e.start.dateTime ?? `${e.start.date}T00:00:00`),
            end: new Date(e.end.dateTime ?? `${e.end.date}T00:00:00`),
            startDate: e.start.date,
            endDate: e.end.date,
            location: e.location,
            htmlLink: e.htmlLink,
            color: colourOf.get(calendarId === "primary" ? (calendars.find((c) => c.primary)?.id ?? "") : calendarId),
          };
        });
    }),
  );
  return results.flat();
}

/** Revokes Google's grant (best effort) and forgets the connection. */
export async function disconnectGoogleAccount(userId: string) {
  const a = await getGoogleAccount(userId);
  if (!a) return;
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(a.refreshToken)}`, {
    method: "POST",
    cache: "no-store",
  }).catch(() => {});
  await db.delete(googleAccounts).where(eq(googleAccounts.userId, userId));
}
