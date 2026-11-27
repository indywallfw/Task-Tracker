"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, notificationSettings, pushSubscriptions } from "@/db";
import { requireUser } from "@/lib/auth";
import { notifyUsers } from "@/lib/push";

const subSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

/** Remembers this device for the signed-in person (or moves it to them if someone else used it). */
export async function savePushSubscription(sub: unknown, device: string) {
  const user = await requireUser();
  const s = subSchema.parse(sub);
  await db
    .insert(pushSubscriptions)
    .values({ userId: user.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, device: device.slice(0, 80) })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: user.id, p256dh: s.keys.p256dh, auth: s.keys.auth, device: device.slice(0, 80) },
    });
  revalidatePath("/settings/notifications");
}

export async function removePushSubscription(formData: FormData) {
  const user = await requireUser();
  const id = z.uuid().parse(formData.get("id"));
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, user.id)));
  revalidatePath("/settings/notifications");
}

/** The browser turned this device off: forget it by endpoint. */
export async function forgetPushEndpoint(endpoint: string) {
  const user = await requireUser();
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)));
  revalidatePath("/settings/notifications");
}

export async function sendTestNotification(): Promise<{ sent: number }> {
  const user = await requireUser();
  const sent = await notifyUsers([user.id], "test", {
    title: "Notifications are on",
    body: "This is how reminders and updates from IndypenDance will look.",
    url: "/settings/notifications",
    tag: "test",
  });
  return { sent };
}

export async function updateNotificationSettings(formData: FormData) {
  const user = await requireUser();
  const on = (k: string) => formData.get(k) === "on";
  const summaryHour = z.coerce.number().int().min(0).max(23).catch(8).parse(formData.get("summaryHour"));
  const values = {
    reminders: on("reminders"),
    assigned: on("assigned"),
    comments: on("comments"),
    dailySummary: on("dailySummary"),
    summaryHour,
  };
  await db
    .insert(notificationSettings)
    .values({ userId: user.id, ...values })
    .onConflictDoUpdate({ target: notificationSettings.userId, set: values });
  revalidatePath("/settings/notifications");
}
