import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { apiTokens, db, users } from "@/db";
import type { CurrentUser } from "./auth";
import { userFromAccessToken } from "./oauth";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function issueToken(userId: string, name: string) {
  const token = `tt_${randomBytes(32).toString("base64url")}`;
  await db.insert(apiTokens).values({ userId, name, tokenHash: hash(token) });
  return token;
}

/** Resolves "Authorization: Bearer ..." (a personal tt_ token or an OAuth tto_ token) to an active user. */
export async function userFromBearer(header: string | null): Promise<CurrentUser | null> {
  const o = header?.match(/^Bearer\s+(tto_[A-Za-z0-9_-]+)$/);
  if (o) return userFromAccessToken(o[1]);
  const m = header?.match(/^Bearer\s+(tt_[A-Za-z0-9_-]+)$/);
  if (!m) return null;
  const tokenHash = hash(m[1]);
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, tokenId: apiTokens.id })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(and(eq(apiTokens.tokenHash, tokenHash), eq(users.active, true)));
  if (!row) return null;
  await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.tokenId));
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}
