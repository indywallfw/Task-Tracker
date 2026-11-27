import "server-only";
import { and, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { db, notificationLog, notificationSettings, projects, pushSubscriptions, tasks, todos } from "@/db";
import { todayISO } from "@/lib/constants";
import { formatTime } from "@/lib/todo-meta";
import { claimOnce, DEFAULT_SETTINGS, notifyUsers, pushReady } from "@/lib/push";

/**
 * Run every minute by Cloud Scheduler (POST /api/cron/notify):
 * - to-do reminders whose time has come (within the last 20 minutes, so a late run
 *   still sends them but a fresh deploy doesn't flood people with old ones)
 * - each person's "due today" summary, once a day at their chosen hour
 * Times are in the server's time zone (TZ=Asia/Kolkata on Cloud Run).
 */
export async function runNotificationJobs(now = new Date()) {
  if (!pushReady()) return { reminders: 0, summaries: 0, skipped: "VAPID keys not set" };
  const subscribed = (await db.selectDistinct({ userId: pushSubscriptions.userId }).from(pushSubscriptions)).map((r) => r.userId);
  if (!subscribed.length) return { reminders: 0, summaries: 0 };
  const prefs = new Map(
    (await db.select().from(notificationSettings).where(inArray(notificationSettings.userId, subscribed))).map((p) => [p.userId, p]),
  );
  const pref = (userId: string) => prefs.get(userId) ?? { userId, ...DEFAULT_SETTINGS };

  const reminders = await sendReminders(now, subscribed.filter((u) => pref(u).reminders));
  const summaries = await sendSummaries(now, subscribed.filter((u) => pref(u).dailySummary), pref);

  // keep the send log small
  await db.delete(notificationLog).where(sql`${notificationLog.sentAt} < now() - interval '30 days'`);
  return { reminders, summaries };
}

const local = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00`);

/** When a reminder fires: minutes before the due time; all-day dates count from 9:00, or from midnight for "on the day at …". */
export function reminderTime(dueDate: string, dueTime: string | null, minutes: number) {
  if (minutes < 0) return new Date(local(dueDate, "00:00").getTime() - minutes * 60000);
  return new Date(local(dueDate, dueTime ?? "09:00").getTime() - minutes * 60000);
}

async function sendReminders(now: Date, userIds: string[]) {
  if (!userIds.length) return 0;
  const rows = await db
    .select({
      id: todos.id,
      userId: todos.userId,
      title: todos.title,
      dueDate: todos.dueDate,
      dueTime: todos.dueTime,
      reminders: todos.reminders,
      taskId: todos.taskId,
      listId: todos.listId,
    })
    .from(todos)
    .where(
      and(
        inArray(todos.userId, userIds),
        isNull(todos.completedAt),
        sql`cardinality(${todos.reminders}) > 0`,
        gte(todos.dueDate, todayISO(-1)),
        lte(todos.dueDate, todayISO(30)),
      ),
    );
  let sent = 0;
  for (const t of rows) {
    for (const m of t.reminders) {
      const at = reminderTime(t.dueDate!, t.dueTime, m);
      if (at > now || now.getTime() - at.getTime() > 20 * 60000) continue;
      if (!(await claimOnce(`rem:${t.id}:${t.dueDate}:${t.dueTime ?? ""}:${m}`))) continue;
      const when = t.dueTime ? `Due ${t.dueDate === todayISO() ? "today" : t.dueDate} at ${formatTime(t.dueTime)}` : `Due ${t.dueDate === todayISO() ? "today" : t.dueDate}`;
      sent += await notifyUsers([t.userId], "reminders", {
        title: t.title,
        body: when,
        url: t.taskId ? `/tasks/${t.taskId}` : t.listId ? `/todos/list/${t.listId}` : "/todos/today",
        tag: `todo-${t.id}`,
      });
    }
  }
  return sent;
}

async function sendSummaries(now: Date, userIds: string[], pref: (u: string) => { summaryHour: number }) {
  const today = todayISO();
  let sent = 0;
  for (const userId of userIds) {
    const hour = pref(userId).summaryHour;
    // within three hours of their chosen hour, so a missed run still catches up the same morning
    if (now.getHours() < hour || now.getHours() >= hour + 3) continue;
    if (!(await claimOnce(`sum:${userId}:${today}`))) continue;
    const [mine] = await db
      .select({
        today: sql<number>`count(*) filter (where ${todos.dueDate} = ${today})::int`,
        overdue: sql<number>`count(*) filter (where ${todos.dueDate} < ${today})::int`,
      })
      .from(todos)
      .where(and(eq(todos.userId, userId), isNull(todos.completedAt), isNull(todos.parentId), lte(todos.dueDate, today)));
    const [work] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(
        and(
          eq(tasks.assigneeId, userId),
          ne(tasks.status, "done"),
          lte(tasks.dueDate, today),
          // tasks already mirrored as sprint to-dos are counted there
          sql`not exists (select 1 from ${todos} where ${todos.taskId} = ${tasks.id} and ${todos.userId} = ${userId})`,
        ),
      );
    const parts = [
      mine.today ? `${mine.today} to-do${mine.today === 1 ? "" : "s"} due today` : "",
      mine.overdue ? `${mine.overdue} overdue` : "",
      work.n ? `${work.n} task${work.n === 1 ? "" : "s"} due` : "",
    ].filter(Boolean);
    if (!parts.length) continue;
    sent += await notifyUsers([userId], "dailySummary", {
      title: "Today in IndypenDance",
      body: parts.join(" · "),
      url: "/todos/today",
      tag: "daily-summary",
    });
  }
  return sent;
}
