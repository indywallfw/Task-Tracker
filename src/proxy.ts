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
    const login = new URL("/login", request.url);
    // come back here after signing in (e.g. the Claude connector consent screen)
    if (pathname !== "/") login.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  // API routes authenticate themselves (session cookie or API token).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon|api/|\\.well-known/).*)"],
};
