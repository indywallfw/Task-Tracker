import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { apiTokens, db } from "@/db";
import { requireUser } from "@/lib/auth";
import { getGoogleAccount, listGoogleCalendars, type GoogleCalendar } from "@/lib/google";
import { revokeToken } from "@/actions/tokens";
import { ConfirmButton } from "@/components/confirm-button";
import { GoogleBox } from "@/components/google-box";
import { TokenForm } from "@/components/token-form";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const user = await requireUser();
  const [tokens, google] = await Promise.all([
    db
      .select({ id: apiTokens.id, name: apiTokens.name, createdAt: apiTokens.createdAt, lastUsedAt: apiTokens.lastUsedAt })
      .from(apiTokens)
      .where(eq(apiTokens.userId, user.id))
      .orderBy(desc(apiTokens.createdAt)),
    getGoogleAccount(user.id),
  ]);
  const calendars: GoogleCalendar[] | null = google ? await listGoogleCalendars(user.id).catch(() => null) : null;
  const h = await headers();
  const origin = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const mcpUrl = `${origin}/api/mcp`;

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="mb-1 font-medium">Claude</h2>
        <p className="mb-4 text-sm text-stone-500">
          Create a personal token to let Claude read and update tasks, docs and leads as you. The connector address is{" "}
          <code className="break-all rounded bg-stone-100 px-1 font-mono text-xs">{mcpUrl}</code>.
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
      </section>

      <div className="card p-5 [&>section]:border-t-0 [&>section]:pt-0">
        <GoogleBox connected={google} calendars={calendars} />
      </div>
    </div>
  );
}
