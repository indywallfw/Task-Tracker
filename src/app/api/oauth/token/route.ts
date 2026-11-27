import { exchangeCode, refreshGrant } from "@/lib/oauth";
import { jsonCors, preflight } from "@/lib/cors";

/** Reads form-encoded (standard) or JSON bodies. */
async function params(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const j = await request.json().catch(() => ({}));
    return Object.fromEntries(Object.entries(j ?? {}).map(([k, v]) => [k, String(v)]));
  }
  return Object.fromEntries(new URLSearchParams(await request.text()));
}

/** Client id from the body, or from HTTP Basic auth if the client sends it that way. */
function clientId(p: Record<string, string>, request: Request) {
  if (p.client_id) return p.client_id;
  const m = request.headers.get("authorization")?.match(/^Basic\s+(.+)$/i);
  if (!m) return undefined;
  return decodeURIComponent(Buffer.from(m[1], "base64").toString().split(":")[0]);
}

export async function POST(request: Request) {
  const p = await params(request);
  const cid = clientId(p, request);
  const r =
    p.grant_type === "authorization_code"
      ? await exchangeCode({ code: p.code, clientId: cid, redirectUri: p.redirect_uri, verifier: p.code_verifier })
      : p.grant_type === "refresh_token"
        ? await refreshGrant({ refreshToken: p.refresh_token, clientId: cid })
        : ({ ok: false, error: "unsupported_grant_type", description: "Use authorization_code or refresh_token" } as const);
  if (!r.ok) return jsonCors({ error: r.error, error_description: r.description }, { status: 400 });
  return jsonCors(r.body);
}
export const OPTIONS = preflight;
