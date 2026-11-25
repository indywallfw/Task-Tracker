import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { authUrl, googleConfigured, redirectUri } from "@/lib/google";

const STATE_COOKIE = "g_oauth_state";

/** Starts "Connect Google Calendar": sends the person to Google's consent screen. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/calendar?google=not_configured", request.url));
  }
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authUrl(state, redirectUri(request.nextUrl.origin)));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/api/google",
    maxAge: 600,
  });
  return res;
}
