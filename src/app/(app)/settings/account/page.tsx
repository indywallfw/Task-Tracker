import { requireUser } from "@/lib/auth";
import { changePassword, logout } from "@/actions/auth";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "Account" };

export default async function AccountSettingsPage() {
  const user = await requireUser();

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="mb-3 font-medium">Your account</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="label">Name</dt>
            <dd>{user.name}</dd>
          </div>
          <div className="min-w-0">
            <dt className="label">Email</dt>
            <dd className="truncate">{user.email}</dd>
          </div>
          <div>
            <dt className="label">Role</dt>
            <dd className="capitalize">{user.role}</dd>
          </div>
        </dl>
      </section>

      <section className="card p-5">
        <h2 className="mb-4 font-medium">Change password</h2>
        <ActionForm action={changePassword} submitLabel="Change password" resetOnSuccess>
          <div>
            <label className="label" htmlFor="current">Current password</label>
            <input className="input" id="current" name="current" type="password" autoComplete="current-password" required />
          </div>
          <div>
            <label className="label" htmlFor="next">New password (10+ characters)</label>
            <input className="input" id="next" name="next" type="password" autoComplete="new-password" minLength={10} required />
          </div>
        </ActionForm>
      </section>

      <form action={logout}>
        <button className="btn-secondary w-full sm:w-auto">Sign out</button>
      </form>
    </div>
  );
}
