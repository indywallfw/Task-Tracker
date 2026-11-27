import { redirect } from "next/navigation";
import { count } from "drizzle-orm";
import { db, users } from "@/db";
import { login } from "@/actions/auth";
import { ActionForm } from "@/components/action-form";
import { getCurrentUser } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  const [{ n }] = await db.select({ n: count() }).from(users);
  if (n === 0) redirect("/setup");

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Sign in</h1>
      <p className="mb-6 text-sm text-stone-500">Use the account your admin created for you.</p>
      <ActionForm action={login} submitLabel="Sign in">
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" required />
        </div>
      </ActionForm>
    </>
  );
}
