import "server-only";
import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { db, notificationLog, notificationSettings, pushSubscriptions } from "@/db";

/**
 * Web Push: the same notifications reach desktop browsers and the Android app
 * (which is the site in a Trusted Web Activity, so Chrome delivers them for it).
 *
 * Needs VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in the environment; without them
 * nothing is sent and Settings says notifications aren't set up.
 */

export type NotificationKind = "reminders" | "assigned" | "comments" | "dailySummary" | "test";
export type PushPayload = { title: string; body?: string; url?: string; tag?: string };

let configured: boolean | null = null;
export function pushReady() {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (configured = false);
  // the subject is how push services can reach whoever runs the server: the site's own address
  const subject = process.env.VAPID_SUBJECT || process.env.APP_URL || "https://localhost";
  webpush.setVapidDetails(subject, pub, priv);
  return (configured = true);
}

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? "";

export const DEFAULT_SETTINGS = { reminders: true, assigned: true, comments: true, dailySummary: true, summaryHour: 8 };

export async function getNotificationSettings(userId: string) {
  const [s] = await db.select().from(notificationSettings).where(eq(notificationSettings.userId, userId));
  return s ?? { userId, ...DEFAULT_SETTINGS };
}

/**
 * Sends to every device of each person who wants this kind of notification.
 * Never throws: a failed notification must not break the action that caused it.
 * Devices the push service says are gone are forgotten.
 */
export async function notifyUsers(userIds: string[], kind: NotificationKind, payload: PushPayload) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length || !pushReady()) return 0;
  try {
    const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, ids));
    if (!subs.length) return 0;
    let wanted = new Set(ids);
    if (kind !== "test") {
      const prefs = await db.select().from(notificationSettings).where(inArray(notificationSettings.userId, ids));
      wanted = new Set(ids.filter((id) => (prefs.find((p) => p.userId === id) ?? DEFAULT_SETTINGS)[kind]));
    }
    const body = JSON.stringify({ ...payload, url: payload.url ?? "/" });
    let sent = 0;
    await Promise.all(
      subs
        .filter((s) => wanted.has(s.userId))
        .map(async (s) => {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 12 });
            sent++;
          } catch (e) {
            const code = (e as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
            else console.error("Push failed", code, (e as Error).message);
          }
        }),
    );
    return sent;
  } catch (e) {
    console.error("Notify failed", e);
    return 0;
  }
}

/** Claims a notification key; true only the first time, so scheduled sends happen once. */
export async function claimOnce(key: string) {
  const rows = await db.insert(notificationLog).values({ key }).onConflictDoNothing().returning({ key: notificationLog.key });
  return rows.length > 0;
}
