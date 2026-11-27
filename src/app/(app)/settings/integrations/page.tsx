import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { apiTokens, db, oauthClients, oauthGrants } from "@/db";
import { requireUser } from "@/lib/auth";
import { getGoogleAccount, listGoogleCalendars, type GoogleCalendar } from "@/lib/google";
import { disconnectApp, revokeToken } from "@/actions/tokens";
import { CopyText } from "@/components/copy-text";
import { publicOrigin } from "@/lib/google";
import { ConfirmButton } from "@/components/confirm-button";
import { GoogleBox } from "@/components/google-box";
import { TokenForm } from "@/components/token-form";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const user = await requireUser();
  const [tokens, apps, google] = await Promise.all([
    db
      .select({ id: apiTokens.id, name: apiTokens.name, createdAt: apiTokens.createdAt, lastUsedAt: apiTokens.lastUsedAt })
      .from(apiTokens)
      .where(eq(apiTokens.userId, user.id))
      .orderBy(desc(apiTokens.createdAt)),
    db
      .select({ id: oauthGrants.id, name: oauthClients.name, createdAt: oauthGrants.createdAt, lastUsedAt: oauthGrants.lastUsedAt })
      .from(oauthGrants)
      .innerJoin(oauthClients, eq(oauthClients.id, oauthGrants.clientId))
      .where(eq(oauthGrants.userId, user.id))
      .orderBy(desc(oauthGrants.createdAt)),
    getGoogleAccount(user.id),
  ]);
  const calendars: GoogleCalendar[] | null = google ? await listGoogleCalendars(user.id).catch(() => null) : null;
  const h = await headers();
  const origin = publicOrigin(h);
  const mcpUrl = `${origin}/api/mcp`;

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="mb-1 font-medium">Claude</h2>
        <p className="mb-4 text-sm text-stone-500">
          Use Workspace from Claude anywhere: claude.ai, the desktop and mobile apps, and Claude Code. Each person connects
          their own Claude account and signs in as themselves, so Claude only sees what they can see.
        </p>
        <div className="label">Connector URL</div>
        <CopyText value={mcpUrl} />
        <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm">
          <li>
            In Claude (web or desktop), open <span className="font-medium">Settings → Connectors</span> and choose{" "}
            <span className="font-medium">Add custom connector</span>.
          </li>
          <li>Name it “Workspace”, paste the URL above, and click Add. Leave the advanced OAuth fields empty.</li>
          <li>Click Connect, sign in here if asked, then click Allow. It then works on Claude for iPhone and Android too.</li>
        </ol>
        <p className="mt-3 text-xs text-stone-500">
          On a Claude Team or Enterprise plan, an owner adds the connector once for the organisation; each person then just
          clicks Connect. In Claude Code, run{" "}
          <code className="break-all rounded bg-stone-100 px-1 font-mono">claude mcp add --transport http workspace {mcpUrl}</code>{" "}
          and then <code className="rounded bg-stone-100 px-1 font-mono">/mcp</code> to sign in.
        </p>

        {apps.length > 0 && (
          <>
            <div className="label mt-6">Connected apps</div>
            <ul className="divide-y divide-stone-100 border-y border-stone-200">
              {apps.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <span className="text-xs text-stone-500">
                    Connected {a.createdAt.toLocaleDateString()}
                    {a.lastUsedAt ? `, last used ${a.lastUsedAt.toLocaleDateString()}` : ""}
                  </span>
                  <form action={disconnectApp}>
                    <input type="hidden" name="id" value={a.id} />
                    <ConfirmButton className="py-1 text-xs text-red-700 hover:underline" message={`Disconnect ${a.name}? It will need to sign in again.`}>
                      Disconnect
                    </ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          </>
        )}

        <details className="mt-6 text-sm">
          <summary className="cursor-pointer text-stone-600">Personal tokens (for scripts and other tools)</summary>
          <p className="mb-3 mt-2 text-stone-500">
            A token lets a program act as you without signing in. Only use one where the sign-in above isn&apos;t possible.
          </p>
          <TokenForm mcpUrl={mcpUrl} />
          {tokens.length > 0 && (
            <ul className="mt-5 divide-y divide-stone-100 border-t border-stone-200">
              {tokens.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  <span className="text-xs text-stone-500">
                    {t.lastUsedAt ? `Last used ${t.lastUsedAt.toLocaleDateString()}` : "Never used"}
                  </span>
                  <form action={revokeToken}>
                    <input type="hidden" name="id" value={t.id} />
                    <ConfirmButton className="py-1 text-xs text-red-700 hover:underline" message={`Revoke “${t.name}”? Anything using it stops working.`}>
                      Revoke
                    </ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </details>
      </section>

      <div className="card p-5 [&>section]:border-t-0 [&>section]:pt-0">
        <GoogleBox connected={google} calendars={calendars} />
      </div>
    </div>
  );
}
