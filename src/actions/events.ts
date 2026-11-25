"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, events, googleAccounts } from "@/db";
import { requireUser } from "@/lib/auth";
import { localDateTime } from "@/lib/calendar";
import { addDays, isRecurrence } from "@/lib/recurrence";
import { COLOR_KEYS } from "@/lib/todo-meta";
import { disconnectGoogleAccount, listGoogleCalendars } from "@/lib/google";
import type { FormState } from "./auth";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const time = z.string().regex(/^\d{2}:\d{2}$/);

const eventSchema = z.object({
  id: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(z.uuid().nullable()),
  title: z.string().trim().min(1, "Give the event a title").max(200),
  date: isoDate,
  endDate: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(isoDate.nullable()),
  start: time.catch("09:00"),
  end: time.catch("10:00"),
  allDay: z.string().optional().transform((v) => v === "on"),
  location: z.string().trim().max(300).optional().default(""),
  notes: z.string().trim().max(10000).optional().default(""),
  recurrence: z
    .string()
    .optional()
    .transform((v) => (isRecurrence(v) ? v : null)),
  repeatUntil: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(isoDate.nullable()),
  color: z.enum(COLOR_KEYS as [string, ...string[]]).catch("blue"),
  // where to go back to
  back: z.string().regex(/^\/calendar(\?[\w=&%.-]*)?$/).catch("/calendar"),
});

export async function saveEvent(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = eventSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const lastDay = d.endDate && d.endDate > d.date ? d.endDate : d.date;
  let startsAt: Date;
  let endsAt: Date;
  if (d.allDay) {
    startsAt = localDateTime(d.date);
    endsAt = localDateTime(addDays(lastDay, 1));
  } else {
    startsAt = localDateTime(d.date, d.start);
    endsAt = localDateTime(lastDay, d.end);
    if (endsAt <= startsAt) return { error: "The event has to end after it starts." };
  }
  if (d.repeatUntil && d.repeatUntil < d.date) return { error: "“Repeat until” is before the first date." };

  const values = {
    title: d.title,
    startsAt,
    endsAt,
    allDay: d.allDay,
    location: d.location,
    notes: d.notes,
    recurrence: d.recurrence,
    repeatUntil: d.recurrence ? d.repeatUntil : null,
    color: d.color,
  };
  if (d.id) {
    const r = await db
      .update(events)
      .set(values)
      .where(and(eq(events.id, d.id), eq(events.userId, user.id)))
      .returning({ id: events.id });
    if (!r.length) return { error: "That event no longer exists." };
  } else {
    await db.insert(events).values({ ...values, userId: user.id });
  }
  revalidatePath("/calendar");
  redirect(d.back);
}

export async function deleteEvent(formData: FormData) {
  const user = await requireUser();
  const id = z.uuid().parse(formData.get("id"));
  const back = eventSchema.shape.back.parse(formData.get("back"));
  await db.delete(events).where(and(eq(events.id, id), eq(events.userId, user.id)));
  revalidatePath("/calendar");
  redirect(back);
}

export async function disconnectGoogle() {
  const user = await requireUser();
  await disconnectGoogleAccount(user.id);
  revalidatePath("/calendar");
}

/** Saves which Google calendars to show. */
export async function chooseGoogleCalendars(formData: FormData) {
  const user = await requireUser();
  const available = new Set((await listGoogleCalendars(user.id)).map((c) => c.id));
  const picked = formData.getAll("calendarId").map(String).filter((id) => available.has(id));
  await db
    .update(googleAccounts)
    .set({ calendarIds: picked.slice(0, 20) })
    .where(eq(googleAccounts.userId, user.id));
  revalidatePath("/calendar");
}
