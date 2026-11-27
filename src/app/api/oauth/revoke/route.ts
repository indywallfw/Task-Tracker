import { revokeByToken } from "@/lib/oauth";
import { CORS, preflight } from "@/lib/cors";

// Token revocation (RFC 7009). Always answers 200.
export async function POST(request: Request) {
  const p = new URLSearchParams(await request.text());
  const t = p.get("token");
  if (t) await revokeByToken(t);
  return new Response(null, { status: 200, headers: CORS });
}
export const OPTIONS = preflight;
