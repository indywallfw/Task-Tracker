import { registerClient } from "@/lib/oauth";
import { jsonCors, preflight } from "@/lib/cors";

// Dynamic client registration (RFC 7591): Claude registers itself before the first sign-in.
// Registering grants nothing; each person still has to sign in and click Allow.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const r = await registerClient(body);
  if ("error" in r) {
    return jsonCors({ error: r.error, error_description: "redirect_uris must be 1–10 https (or localhost) URLs" }, { status: 400 });
  }
  return jsonCors(
    {
      ...r.client,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201 },
  );
}
export const OPTIONS = preflight;
