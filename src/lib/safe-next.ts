/** Only same-site paths, so a crafted ?next= can't send people to another site after signing in. */
export function safeNext(v: unknown) {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/";
}
