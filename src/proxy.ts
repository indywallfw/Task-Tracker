import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: real session validation happens on the server in
// requireUser(). This just sends visitors without a cookie to the login page.
const PUBLIC = ["/login", "/setup"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }
  if (!request.cookies.has("tt_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // API routes authenticate themselves (session cookie or API token).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
