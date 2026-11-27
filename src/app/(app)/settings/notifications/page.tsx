import { desc, eq } from "drizzle-orm";
import { db, pushSubscriptions } from "@/db";
import { requireUser } from "@/lib/auth";
import { getNotificationSettings, vapidPublicKey } from "@/lib/push";
import { removePushSubscription, updateNotificationSettings } from "@/actions/notifications";
import { PushSetup } from "@/components/push-setup";

export const metadata = { title: "Notifications" };

const KINDS = [
  { name: "reminders", label: "To-do reminders", hint: "At the reminder time on a to-do, e.g. 15 minutes before it's due." },
  { name: "assigned", label: "Tasks assigned to me", hint: "When someone gives you a task or adds one of your tasks to a sprint." },
  { name: "comments", label: "Comments on my tasks", hint: "When someone comments on a task you own or created." },
  { name: "dailySummary", label: "Morning summary", hint: "What's due today and overdue, once a day." },
] as const;

const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString("en-IN", { hour: "numeric", hour12: true });

export default async function NotificationsPage() {
  const user = await requireUser();
  const [settings, devices] = await Promise.all([
    getNotificationSettings(user.id),
    db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id)).orderBy(desc(pushSubscriptions.createdAt)),
  ]);

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="mb-1 font-medium">This device</h2>
        <p className="mb-4 text-sm text-stone-500">
          Turn notifications on in each browser or phone where you want them, including the Android app.
        </p>
        <PushSetup publicKey={vapidPublicKey()} />
      </section>

      <section className="card p-5">
        <h2 className="mb-4 font-medium">What to notify me about</h2>
        <form action={updateNotificationSettings} className="space-y-3" key={JSON.stringify(settings)}>
          {KINDS.map((k) => (
            <label key={k.name} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name={k.name} defaultChecked={settings[k.name]} className="mt-0.5" />
              <span>
                <span className="font-medium">{k.label}</span>
                <span className="block text-xs text-stone-500">{k.hint}</span>
              </span>
            </label>
          ))}
          <label className="flex items-center gap-2 pl-6 text-sm text-stone-600">
            Send the summary at
            <select name="summaryHour" defaultValue={settings.summaryHour} className="input w-auto py-1">
              {Array.from({ length: 18 }, (_, i) => i + 5).map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-secondary">Save</button>
        </form>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-medium">Devices getting notifications</h2>
        {devices.length ? (
          <ul className="divide-y divide-stone-100 text-sm">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2">
                <span className="flex-1">{d.device || "Unknown device"}</span>
                <span className="text-xs text-stone-500">since {d.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                <form action={removePushSubscription}>
                  <input type="hidden" name="id" value={d.id} />
                  <button className="text-xs text-stone-500 hover:text-red-700">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">None yet.</p>
        )}
      </section>
    </div>
  );
}
