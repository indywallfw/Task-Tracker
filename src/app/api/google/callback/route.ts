import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { GoogleError, connectGoogle, publicOrigin, redirectUri } from "@/lib/google";

const STATE_COOKIE = "g_oauth_state";

/** Google sends the person back here after they allow (or refuse) calendar access. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", publicOrigin(request.headers)));
  const back = (result: string) => {
    const res = NextResponse.redirect(new URL(`/calendar?google=${result}`, publicOrigin(request.headers)));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/google" });
    return res;
  };

  const q = request.nextUrl.searchParams;
  const state = q.get("state") ?? "";
  const expected = request.cookies.get(STATE_COOKIE)?.value ?? "";
  const sameState =
    !!expected && state.length === expected.length && timingSafeEqual(Buffer.from(state), Buffer.from(expected));
  if (!sameState) return back("expired");
  if (q.get("error")) return back("denied");
  const code = q.get("code");
  if (!code) return back("error");

  try {
    await connectGoogle(user.id, code, redirectUri(request.headers));
  } catch (e) {
    if (e instanceof GoogleError && e.code === "missing_scope") return back("no_calendar");
    console.error("Google Calendar connect failed", e);
    return back("error");
  }
  return back("connected");
}
