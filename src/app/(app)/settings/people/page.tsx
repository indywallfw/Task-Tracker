import { asc } from "drizzle-orm";
import { db, users } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { createUser, resetPassword, updateUser } from "@/actions/users";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "People" };

export default async function PeoplePage() {
  const me = await requireAdmin();
  const all = await db.select().from(users).orderBy(asc(users.name));

  return (
    <div className="space-y-6">
      <p className="text-sm text-stone-500">Add teammates, set their role and turn off access when they leave.</p>

      <section className="card p-5">
        <h2 className="mb-4 font-medium">Add a person</h2>
        <ActionForm action={createUser} submitLabel="Add person" className="grid gap-4 sm:grid-cols-2" resetOnSuccess>
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input className="input" id="name" name="name" autoComplete="off" required />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" autoComplete="off" required />
          </div>
          <div>
            <label className="label" htmlFor="password">Temporary password</label>
            <input className="input" id="password" name="password" autoComplete="new-password" minLength={10} required />
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
          <div key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
            <div className="min-w-0 flex-1 basis-56">
              <div className="font-medium">
                {u.name} {u.id === me.id && <span className="text-xs text-stone-400">(you)</span>}
                {!u.active && <span className="ml-1 rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-500">No access</span>}
              </div>
              <div className="truncate text-sm text-stone-500">{u.email}</div>
            </div>
            <form action={updateUser} key={`${u.role}-${u.active}`} className="flex items-center gap-3">
              <input type="hidden" name="id" value={u.id} />
              <select name="role" defaultValue={u.role} className="input w-28 py-1" aria-label={`Role for ${u.name}`}>
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
                <summary className="cursor-pointer py-1 text-xs text-stone-500">Reset password</summary>
                <ActionForm action={resetPassword} submitLabel="Set new password" className="mt-2 flex flex-wrap items-start gap-2">
                  <input type="hidden" name="id" value={u.id} />
                  <input
                    className="input py-1 sm:max-w-xs"
                    name="password"
                    placeholder="New temporary password"
                    autoComplete="new-password"
                    minLength={10}
                    required
                    aria-label={`New password for ${u.name}`}
                  />
                </ActionForm>
              </details>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
