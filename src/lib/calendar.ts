import "server-only";
import { and, eq, gte, isNotNull, isNull, lt, lte, ne, or } from "drizzle-orm";
import { db, events, tasks, todos } from "@/db";
import { queryTasks } from "./tasks-query";
import { addDays, fromISO, isRecurrence, occurrencesBetween, toISO } from "./recurrence";
import { GoogleError, getGoogleAccount, listGoogleEvents } from "./google";

// Times are shown in the server's time zone (set TZ when deploying), the same
// zone todayISO() uses for due dates.

export type CalItem = {
  key: string;
  source: "event" | "google" | "todo" | "task";
  title: string;
  /** first day, "YYYY-MM-DD" */
  date: string;
  /** last day (inclusive); equals `date` for single-day items */
  endDate: string;
  /** "HH:MM", absent for all-day items */
  start?: string;
  end?: string;
  /** a COLORS key, or a hex colour for Google calendars */
  color: string;
  href?: string;
  external?: boolean;
  location?: string;
  done?: boolean;
  repeats?: boolean;
};

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** "2026-11-25" + "09:30" → Date in the server's zone. */
export const localDateTime = (date: string, time = "00:00") => new Date(`${date}T${time}:00`);

export async function getCalendarItems(
  userId: string,
  from: string,
  to: string,
  linkBase: string,
): Promise<{ items: CalItem[]; googleError: string | null }> {
  const rangeStart = localDateTime(from);
  const rangeEnd = localDateTime(addDays(to, 1));

  const [own, myTodos, myTasks, google] = await Promise.all([
    db
      .select()
      .from(events)
      .where(
        and(
          eq(events.userId, userId),
          lt(events.startsAt, rangeEnd),
          // one-off events that end before the range can be skipped; repeating ones can't
          or(gte(events.endsAt, rangeStart), isNotNull(events.recurrence)),
        ),
      ),
    db
      .select()
      .from(todos)
      .where(and(eq(todos.userId, userId), isNull(todos.parentId), gte(todos.dueDate, from), lte(todos.dueDate, to))),
    queryTasks([eq(tasks.assigneeId, userId), ne(tasks.status, "done"), gte(tasks.dueDate, from), lte(tasks.dueDate, to)]),
    getGoogleAccount(userId).then(async (a) => {
      if (!a) return { list: [], error: null };
      try {
        return { list: await listGoogleEvents(userId, rangeStart, rangeEnd), error: null };
      } catch (e) {
        console.error("Google Calendar read failed", e);
        const code = e instanceof GoogleError ? e.code : "";
        return {
          list: [],
          error:
            code === "invalid_grant"
              ? "Google Calendar access was revoked or expired. Reconnect it below."
              : code === "403" && /scope/i.test(e instanceof Error ? e.message : "")
                ? "Google didn't give this app calendar access. Disconnect Google below, connect again and tick the calendar box on Google's screen."
                : "Couldn't load Google Calendar events just now.",
        };
      }
    }),
  ]);

  const items: CalItem[] = [];

  for (const e of own) {
    const startDate = toISO(e.startsAt);
    // all-day events end at midnight after their last day
    const lastDay = e.allDay ? toISO(new Date(e.endsAt.getTime() - 1)) : toISO(e.endsAt);
    const spanDays = Math.round((fromISO(lastDay).getTime() - fromISO(startDate).getTime()) / 86400000);
    const dates =
      e.recurrence && isRecurrence(e.recurrence)
        ? occurrencesBetween(startDate, e.recurrence, addDays(from, -spanDays), to, e.repeatUntil)
        : [startDate];
    for (const d of dates) {
      const end = addDays(d, spanDays);
      if (end < from || d > to) continue;
      items.push({
        key: `e:${e.id}:${d}`,
        source: "event",
        title: e.title,
        date: d,
        endDate: e.allDay ? end : d,
        start: e.allDay ? undefined : hhmm(e.startsAt),
        end: e.allDay ? undefined : hhmm(e.endsAt),
        color: e.color,
        href: `${linkBase}event=${e.id}`,
        location: e.location || undefined,
        repeats: !!e.recurrence,
      });
    }
  }

  for (const g of google.list) {
    const date = g.allDay ? g.startDate! : toISO(g.start);
    items.push({
      key: `g:${g.calendarId}:${g.id}`,
      source: "google",
      title: g.title,
      date,
      endDate: g.allDay ? addDays(g.endDate!, -1) : date,
      start: g.allDay ? undefined : hhmm(g.start),
      end: g.allDay ? undefined : hhmm(g.end),
      color: g.color ?? "#4285f4",
      href: g.htmlLink,
      external: true,
      location: g.location,
    });
  }

  for (const t of myTodos) {
    items.push({
      key: `t:${t.id}`,
      source: "todo",
      title: t.title,
      date: t.dueDate!,
      endDate: t.dueDate!,
      start: t.dueTime ?? undefined,
      color: t.priority === 1 ? "red" : t.priority === 2 ? "orange" : t.priority === 3 ? "blue" : "stone",
      href: t.listId ? `/todos/list/${t.listId}` : "/todos/inbox",
      done: !!t.completedAt,
      repeats: !!t.recurrence,
    });
  }

  for (const t of myTasks) {
    items.push({
      key: `k:${t.id}`,
      source: "task",
      title: `${t.projectKey}-${t.number} ${t.title}`,
      date: t.dueDate!,
      endDate: t.dueDate!,
      color: "violet",
      href: `/tasks/${t.id}`,
    });
  }

  items.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? "").localeCompare(b.start ?? "") || a.title.localeCompare(b.title));
  return { items, googleError: google.error };
}
