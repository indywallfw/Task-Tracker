import { redirect } from "next/navigation";
import { connection } from "next/server";
import { count } from "drizzle-orm";
import { db, users } from "@/db";
import { setupAdmin } from "@/actions/auth";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "Set up" };

export default async function SetupPage() {
  await connection(); // always check the live user count, never prerender
  const [{ n }] = await db.select({ n: count() }).from(users);
  if (n > 0) redirect("/login");

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Welcome</h1>
      <p className="mb-6 text-sm text-stone-500">
        Create the first admin account. You can add your team afterwards.
      </p>
      <ActionForm action={setupAdmin} submitLabel="Create admin account">
        <div>
          <label className="label" htmlFor="name">Your name</label>
          <input className="input" id="name" name="name" required autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password (10+ characters)</label>
          <input className="input" id="password" name="password" type="password" minLength={10} required />
        </div>
      </ActionForm>
    </>
  );
}
