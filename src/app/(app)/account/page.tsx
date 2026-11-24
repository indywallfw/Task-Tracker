import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { apiTokens, db } from "@/db";
import { requireUser } from "@/lib/auth";
import { changePassword } from "@/actions/auth";
import { revokeToken } from "@/actions/tokens";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { PageHeader } from "@/components/page-header";
import { TokenForm } from "@/components/token-form";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser();
  const tokens = await db
    .select({ id: apiTokens.id, name: apiTokens.name, createdAt: apiTokens.createdAt, lastUsedAt: apiTokens.lastUsedAt })
    .from(apiTokens)
    .where(eq(apiTokens.userId, user.id))
    .orderBy(desc(apiTokens.createdAt));
  const h = await headers();
  const origin = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const mcpUrl = `${origin}/api/mcp`;

  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <PageHeader title="Account" subtitle={`${user.name} · ${user.email} · ${user.role}`} />

      <section className="card mb-6 p-5">
        <h2 className="mb-1 font-medium">Connect Claude</h2>
        <p className="mb-4 text-sm text-stone-500">
          Create a personal token to let Claude read and update tasks and docs as you. The connector address is{" "}
          <code className="rounded bg-stone-100 px-1 font-mono text-xs">{mcpUrl}</code>.
        </p>
        <TokenForm mcpUrl={mcpUrl} />
        {tokens.length > 0 && (
          <ul className="mt-5 divide-y divide-stone-100 border-t border-stone-200">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="flex-1">{t.name}</span>
                <span className="text-xs text-stone-500">
                  {t.lastUsedAt ? `Last used ${t.lastUsedAt.toLocaleDateString()}` : "Never used"}
                </span>
                <form action={revokeToken}>
                  <input type="hidden" name="id" value={t.id} />
                  <ConfirmButton className="text-xs text-red-700 hover:underline" message={`Revoke “${t.name}”? Anything using it stops working.`}>
                    Revoke
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-4 font-medium">Change password</h2>
        <ActionForm action={changePassword} submitLabel="Change password" resetOnSuccess>
          <div>
            <label className="label" htmlFor="current">Current password</label>
            <input className="input" id="current" name="current" type="password" required />
          </div>
          <div>
            <label className="label" htmlFor="next">New password (10+ characters)</label>
            <input className="input" id="next" name="next" type="password" minLength={10} required />
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
