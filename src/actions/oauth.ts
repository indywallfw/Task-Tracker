"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createCode, getClient, issuer, redirectMatches } from "@/lib/oauth";

/** Builds the URL that hands the result back to the app (Claude). */
function back(redirectUri: string, params: Record<string, string | undefined>) {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return u.toString();
}

/** The Allow / Cancel buttons on the connector consent screen. */
export async function decideOAuth(formData: FormData) {
  const user = await requireUser();
  const get = (k: string) => (formData.get(k) as string | null) ?? "";
  const clientId = get("client_id");
  const redirectUri = get("redirect_uri");
  const state = get("state") || undefined;
  const codeChallenge = get("code_challenge");

  const client = await getClient(clientId);
  if (!client || !redirectMatches(client.redirectUris, redirectUri)) redirect("/");
  const iss = issuer(await headers());

  if (get("decision") !== "allow") {
    redirect(back(redirectUri, { error: "access_denied", state, iss }));
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) {
    redirect(back(redirectUri, { error: "invalid_request", error_description: "PKCE S256 code_challenge required", state, iss }));
  }
  const code = await createCode({ clientId, userId: user.id, redirectUri, codeChallenge });
  redirect(back(redirectUri, { code, state, iss }));
}
