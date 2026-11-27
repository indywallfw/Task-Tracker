import "server-only";
import { and, eq, inArray, isNotNull, max, ne } from "drizzle-orm";
import { db, projects, sprints, tasks, todos } from "@/db";

/**
 * Keeps sprint work and personal To-dos in step.
 *
 * Every open task in a running or planned sprint shows up in its owner's To-dos, due on the
 * task's due date or else the sprint's last day. Changing the task (title, due date, owner,
 * done) updates that to-do; taking it out of the sprint removes it. Ticking the to-do off
 * marks the task done, and un-ticking reopens it. Other to-dos linked to a task (reminders
 * added from the sprint board) are ticked off when the task is done.
 */
export async function syncTaskTodos(taskIds: string[]) {
  const ids = [...new Set(taskIds)].filter(Boolean);
  if (!ids.length) return;
  const rows = await db
    .select({
      id: tasks.id,
      number: tasks.number,
      title: tasks.title,
      status: tasks.status,
      dueDate: tasks.dueDate,
      assigneeId: tasks.assigneeId,
      completedAt: tasks.completedAt,
      key: projects.key,
      sprintId: tasks.sprintId,
      sprintName: sprints.name,
      sprintEnd: sprints.endDate,
      sprintStatus: sprints.status,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(sprints, eq(sprints.id, tasks.sprintId))
    .where(inArray(tasks.id, ids));

  const linked = await db.select().from(todos).where(inArray(todos.taskId, ids));

  for (const t of rows) {
    const mine = linked.filter((x) => x.taskId === t.id);
    const done = t.status === "done";
    const title = `${t.key}-${t.number} ${t.title}`.slice(0, 300);
    const wanted = !!t.sprintId && !!t.assigneeId && t.sprintStatus !== "completed";

    for (const x of mine) {
      if (x.source === "sprint") {
        if (!wanted || x.userId !== t.assigneeId) {
          // out of the sprint or handed to someone else: drop the open copy, keep a ticked-off one as history
          if (!x.completedAt) await db.delete(todos).where(eq(todos.id, x.id));
          continue;
        }
        await db
          .update(todos)
          .set({
            title,
            dueDate: t.dueDate ?? t.sprintEnd ?? x.dueDate,
            notes: `In ${t.sprintName ?? "a sprint"}. Ticking this off marks ${t.key}-${t.number} done.`,
            completedAt: done ? (x.completedAt ?? t.completedAt ?? new Date()) : null,
          })
          .where(eq(todos.id, x.id));
      } else if (done && !x.completedAt) {
        await db.update(todos).set({ completedAt: new Date() }).where(eq(todos.id, x.id));
      }
    }

    if (wanted && !done && !mine.some((x) => x.source === "sprint" && x.userId === t.assigneeId)) {
      const [pos] = await db.select({ p: max(todos.position) }).from(todos).where(eq(todos.userId, t.assigneeId!));
      await db.insert(todos).values({
        userId: t.assigneeId!,
        title,
        notes: `In ${t.sprintName ?? "a sprint"}. Ticking this off marks ${t.key}-${t.number} done.`,
        dueDate: t.dueDate ?? t.sprintEnd ?? null,
        priority: 4,
        taskId: t.id,
        source: "sprint",
        position: (pos?.p ?? 0) + 1000,
      });
    }
  }
}

/** Syncs every task in a sprint (after it starts, completes, moves dates or is deleted). */
export async function syncSprintTodos(sprintId: string) {
  const rows = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.sprintId, sprintId));
  await syncTaskTodos(rows.map((r) => r.id));
}

/**
 * The other direction: a sprint to-do was ticked or un-ticked, so the task follows.
 * Returns the task id when it changed it.
 */
export async function taskFollowsTodo(todoId: string) {
  const [x] = await db
    .select({ taskId: todos.taskId, completedAt: todos.completedAt })
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.source, "sprint"), isNotNull(todos.taskId)));
  if (!x?.taskId) return null;
  const [t] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, x.taskId));
  if (!t) return null;
  if (x.completedAt && t.status !== "done") {
    await db.update(tasks).set({ status: "done", completedAt: x.completedAt }).where(eq(tasks.id, x.taskId));
  } else if (!x.completedAt && t.status === "done") {
    await db.update(tasks).set({ status: "todo", completedAt: null }).where(eq(tasks.id, x.taskId));
  } else return null;
  await syncTaskTodos([x.taskId]);
  return x.taskId;
}

/** Backfill: makes sure every open sprint task has its owner's to-do. */
export async function syncAllSprintTodos() {
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .innerJoin(sprints, eq(sprints.id, tasks.sprintId))
    .where(and(ne(sprints.status, "completed"), isNotNull(tasks.assigneeId), ne(tasks.status, "done")));
  await syncTaskTodos(rows.map((r) => r.id));
}

