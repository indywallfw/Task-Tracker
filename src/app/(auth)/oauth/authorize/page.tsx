import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { decideOAuth } from "@/actions/oauth";
import { getCurrentUser } from "@/lib/auth";
import { getClient, issuer, redirectMatches } from "@/lib/oauth";

export const metadata = { title: "Connect to Claude" };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function Problem({ text }: { text: string }) {
  return (
    <>
      <h1 className="mb-2 text-xl font-semibold">Can&apos;t connect</h1>
      <p className="text-sm text-stone-500">{text}</p>
    </>
  );
}

/**
 * OAuth consent screen. Claude sends people here when they add the IndypenDance
 * connector; they sign in (if needed) and choose Allow or Cancel.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const p = {
    response_type: one(sp.response_type),
    client_id: one(sp.client_id),
    redirect_uri: one(sp.redirect_uri),
    state: one(sp.state),
    code_challenge: one(sp.code_challenge),
    code_challenge_method: one(sp.code_challenge_method),
  };

  // Problems we can't safely report back to the app are shown here instead.
  const client = p.client_id ? await getClient(p.client_id) : null;
  if (!client) return <Problem text="This app isn't registered. Try removing and re-adding the connector in Claude." />;
  if (!p.redirect_uri || !redirectMatches(client.redirectUris, p.redirect_uri)) {
    return <Problem text="The app asked to return to an address it didn't register, so the request was stopped." />;
  }

  const iss = issuer(await headers());
  const fail = (error: string, description: string) => {
    const u = new URL(p.redirect_uri);
    u.searchParams.set("error", error);
    u.searchParams.set("error_description", description);
    if (p.state) u.searchParams.set("state", p.state);
    u.searchParams.set("iss", iss);
    redirect(u.toString());
  };
  if (p.response_type !== "code") fail("unsupported_response_type", "Only response_type=code is supported");
  if (p.code_challenge_method !== "S256" || !p.code_challenge) fail("invalid_request", "PKCE with S256 is required");

  const user = await getCurrentUser();
  if (!user) {
    const here = `/oauth/authorize?${new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][])}`;
    redirect(`/login?next=${encodeURIComponent(here)}`);
  }

  let returnHost = p.redirect_uri;
  try {
    returnHost = new URL(p.redirect_uri).host || p.redirect_uri;
  } catch {}

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Connect {client.name}?</h1>
      <p className="mb-4 text-sm text-stone-500">
        Signed in as <span className="font-medium text-stone-800">{user.name}</span> ({user.email})
      </p>
      <p className="mb-2 text-sm">
        {client.name} will be able to read and change the tasks, projects, docs, leads and to-dos you can see here,
        acting as you.
      </p>
      <p className="mb-6 text-xs text-stone-500">
        You&apos;ll go back to <span className="font-mono">{returnHost}</span>. You can disconnect it any time in Settings →
        Integrations.
      </p>
      <form action={decideOAuth} className="flex gap-2">
        {Object.entries(p).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <button name="decision" value="allow" className="btn flex-1">
          Allow
        </button>
        <button name="decision" value="deny" className="btn-secondary flex-1">
          Cancel
        </button>
      </form>
    </>
  );
}
