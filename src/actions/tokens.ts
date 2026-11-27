"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiTokens, db, oauthGrants } from "@/db";
import { requireUser } from "@/lib/auth";
import { issueToken } from "@/lib/api-tokens";

export type TokenState = { error?: string; token?: string } | undefined;

export async function createToken(_: TokenState, formData: FormData): Promise<TokenState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!name) return { error: "Give the token a name, e.g. “Claude on my laptop”." };
  const token = await issueToken(user.id, name);
  revalidatePath("/settings/integrations");
  return { token };
}

export async function revokeToken(formData: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().parse(formData.get("id"));
  await db.delete(apiTokens).where(and(eq(apiTokens.id, id), eq(apiTokens.userId, user.id)));
  revalidatePath("/settings/integrations");
}

/** Disconnects an app (e.g. Claude) that signed in with OAuth. */
export async function disconnectApp(formData: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().parse(formData.get("id"));
  await db.delete(oauthGrants).where(and(eq(oauthGrants.id, id), eq(oauthGrants.userId, user.id)));
  revalidatePath("/settings/integrations");
}
