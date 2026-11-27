import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db, oauthClients, oauthCodes, oauthGrants, users } from "@/db";
import type { CurrentUser } from "./auth";
import { publicOrigin } from "./google";

// OAuth 2.1 authorization server for remote MCP clients such as Claude
// (claude.ai, Claude desktop and mobile, Claude Code). Each person signs in
// with their own Workspace account and Claude then acts as them.
//
// Supports dynamic client registration (RFC 7591), client ID metadata documents
// (an https URL as client_id), PKCE S256 only, and rotating refresh tokens.

export const ACCESS_TTL_S = 60 * 60; // 1 hour
const CODE_TTL_MS = 5 * 60 * 1000;
export const SCOPE = "workspace";

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const token = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;

export const issuer = (h: Headers) => publicOrigin(h);

export function authServerMetadata(h: Headers) {
  const iss = issuer(h);
  return {
    issuer: iss,
    authorization_endpoint: `${iss}/oauth/authorize`,
    token_endpoint: `${iss}/api/oauth/token`,
    registration_endpoint: `${iss}/api/oauth/register`,
    revocation_endpoint: `${iss}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE],
    client_id_metadata_document_supported: true,
  };
}

export function protectedResourceMetadata(h: Headers) {
  const iss = issuer(h);
  return {
    resource: `${iss}/api/mcp`,
    authorization_servers: [iss],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Workspace",
  };
}

/** https anywhere, or http only on this machine (loopback redirects used by desktop apps). */
function allowedRedirect(uri: string) {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    // custom schemes (e.g. app callbacks) are allowed if they look like one
    return /^[a-z][a-z0-9+.-]*:\/\/?[^\s]+$/i.test(uri) && !/^(javascript|data|file|vbscript):/i.test(uri);
  }
}

export async function registerClient(body: unknown) {
  const b = (body ?? {}) as { client_name?: unknown; redirect_uris?: unknown };
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (uris.length === 0 || uris.length > 10 || !uris.every(allowedRedirect)) {
    return { error: "invalid_redirect_uri" as const };
  }
  const name = typeof b.client_name === "string" && b.client_name.trim() ? b.client_name.trim().slice(0, 100) : "Unnamed app";
  const id = token("ttc_");
  await db.insert(oauthClients).values({ id, name, redirectUris: uris });
  return { client: { client_id: id, client_name: name, redirect_uris: uris } };
}

/** Looks up a registered client, or fetches a client ID metadata document when client_id is an https URL. */
export async function getClient(clientId: string) {
  const [row] = await db.select().from(oauthClients).where(eq(oauthClients.id, clientId));
  if (row && !clientId.startsWith("https://")) return row;
  if (!clientId.startsWith("https://")) return null;
  try {
    const res = await fetch(clientId, { signal: AbortSignal.timeout(5000), headers: { accept: "application/json" } });
    if (!res.ok) return row ?? null;
    const doc = (await res.json()) as { client_id?: string; client_name?: string; redirect_uris?: unknown };
    const uris = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.filter((u): u is string => typeof u === "string") : [];
    if (doc.client_id !== clientId || uris.length === 0 || !uris.every(allowedRedirect)) return row ?? null;
    const name = (doc.client_name || new URL(clientId).hostname).slice(0, 100);
    await db
      .insert(oauthClients)
      .values({ id: clientId, name, redirectUris: uris })
      .onConflictDoUpdate({ target: oauthClients.id, set: { name, redirectUris: uris } });
    return { id: clientId, name, redirectUris: uris, createdAt: row?.createdAt ?? new Date() };
  } catch {
    return row ?? null;
  }
}

/** Exact match, except loopback addresses may use any port (RFC 8252). */
export function redirectMatches(registered: string[], uri: string) {
  if (registered.includes(uri)) return true;
  try {
    const u = new URL(uri);
    if (u.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) return false;
    return registered.some((r) => {
      const v = new URL(r);
      return v.protocol === u.protocol && v.hostname === u.hostname && v.pathname === u.pathname && v.search === u.search;
    });
  } catch {
    return false;
  }
}

export async function createCode(input: { clientId: string; userId: string; redirectUri: string; codeChallenge: string }) {
  const code = token("tta_");
  // tidy up expired codes while we're here
  await db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, new Date()));
  await db.insert(oauthCodes).values({ id: sha(code), ...input, expiresAt: new Date(Date.now() + CODE_TTL_MS) });
  return code;
}

type TokenResult =
  | { ok: true; body: { access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string; scope: string } }
  | { ok: false; error: string; description: string };

const bad = (error: string, description: string): TokenResult => ({ ok: false, error, description });

function newTokens() {
  const access = token("tto_");
  const refresh = token("ttr_");
  return {
    access,
    refresh,
    row: { accessHash: sha(access), refreshHash: sha(refresh), accessExpiresAt: new Date(Date.now() + ACCESS_TTL_S * 1000) },
  };
}

const success = (t: ReturnType<typeof newTokens>): TokenResult => ({
  ok: true,
  body: { access_token: t.access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: t.refresh, scope: SCOPE },
});

export async function exchangeCode(p: { code?: string; clientId?: string; redirectUri?: string; verifier?: string }): Promise<TokenResult> {
  if (!p.code || !p.clientId || !p.redirectUri || !p.verifier) return bad("invalid_request", "code, client_id, redirect_uri and code_verifier are required");
  // single use: delete as we read
  const [c] = await db.delete(oauthCodes).where(eq(oauthCodes.id, sha(p.code))).returning();
  if (!c || c.expiresAt < new Date()) return bad("invalid_grant", "Code is invalid or expired");
  if (c.clientId !== p.clientId || c.redirectUri !== p.redirectUri) return bad("invalid_grant", "Code was issued to a different client or redirect");
  const challenge = createHash("sha256").update(p.verifier).digest("base64url");
  if (challenge !== c.codeChallenge) return bad("invalid_grant", "PKCE verification failed");
  const t = newTokens();
  await db.insert(oauthGrants).values({ clientId: c.clientId, userId: c.userId, ...t.row });
  return success(t);
}

export async function refreshGrant(p: { refreshToken?: string; clientId?: string }): Promise<TokenResult> {
  if (!p.refreshToken) return bad("invalid_request", "refresh_token is required");
  const [g] = await db.select().from(oauthGrants).where(eq(oauthGrants.refreshHash, sha(p.refreshToken)));
  if (!g || (p.clientId && p.clientId !== g.clientId)) return bad("invalid_grant", "Refresh token is invalid or was revoked");
  const t = newTokens();
  // rotate: the old refresh token stops working
  const updated = await db
    .update(oauthGrants)
    .set(t.row)
    .where(and(eq(oauthGrants.id, g.id), eq(oauthGrants.refreshHash, g.refreshHash)))
    .returning({ id: oauthGrants.id });
  if (updated.length === 0) return bad("invalid_grant", "Refresh token was already used");
  return success(t);
}

/** Revokes the grant that owns this access or refresh token (RFC 7009: always succeeds). */
export async function revokeByToken(t: string) {
  const h = sha(t);
  await db.delete(oauthGrants).where(eq(oauthGrants.refreshHash, h));
  await db.delete(oauthGrants).where(eq(oauthGrants.accessHash, h));
}

/** Resolves an OAuth access token to its active user. */
export async function userFromAccessToken(t: string): Promise<CurrentUser | null> {
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, grantId: oauthGrants.id, lastUsedAt: oauthGrants.lastUsedAt })
    .from(oauthGrants)
    .innerJoin(users, eq(users.id, oauthGrants.userId))
    .where(and(eq(oauthGrants.accessHash, sha(t)), gt(oauthGrants.accessExpiresAt, new Date()), eq(users.active, true)));
  if (!row) return null;
  // don't write on every call
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 5 * 60 * 1000) {
    await db.update(oauthGrants).set({ lastUsedAt: new Date() }).where(eq(oauthGrants.id, row.grantId));
  }
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}
