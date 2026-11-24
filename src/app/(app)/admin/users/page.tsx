import { asc } from "drizzle-orm";
import { db, users } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { createUser, resetPassword, updateUser } from "@/actions/users";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "People" };

export default async function UsersPage() {
  const me = await requireAdmin();
  const all = await db.select().from(users).orderBy(asc(users.name));

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <PageHeader title="People" subtitle="Add teammates, set their role and turn off access when they leave." />

      <section className="card mb-8 p-5">
        <h2 className="mb-4 font-medium">Add a person</h2>
        <ActionForm action={createUser} submitLabel="Add person" className="grid grid-cols-2 gap-4" resetOnSuccess>
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input className="input" id="name" name="name" required />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" required />
          </div>
          <div>
            <label className="label" htmlFor="password">Temporary password</label>
            <input className="input" id="password" name="password" minLength={10} required />
          </div>
          <div>
            <label className="label" htmlFor="role">Role</label>
            <select className="input" id="role" name="role" defaultValue="member">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </ActionForm>
      </section>

      <section className="card divide-y divide-stone-200">
        {all.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-48 flex-1">
              <div className="font-medium">
                {u.name} {u.id === me.id && <span className="text-xs text-stone-400">(you)</span>}
              </div>
              <div className="text-sm text-stone-500">{u.email}</div>
            </div>
            <form action={updateUser} key={`${u.role}-${u.active}`} className="flex items-center gap-3">
              <input type="hidden" name="id" value={u.id} />
              <select name="role" defaultValue={u.role} className="input w-28 py-1">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="active" defaultChecked={u.active} /> Active
              </label>
              <button className="btn-secondary py-1">Save</button>
            </form>
            {u.id !== me.id && (
              <details className="w-full">
                <summary className="cursor-pointer text-xs text-stone-500">Reset password</summary>
                <ActionForm action={resetPassword} submitLabel="Set new password" className="mt-2 flex items-start gap-2">
                  <input type="hidden" name="id" value={u.id} />
                  <input className="input max-w-xs py-1" name="password" placeholder="New temporary password" minLength={10} required />
                </ActionForm>
              </details>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
