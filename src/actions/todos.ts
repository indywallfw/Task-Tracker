"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, max, sql } from "drizzle-orm";
import { z } from "zod";
import { db, todoLists, todos } from "@/db";
import { requireUser } from "@/lib/auth";
import { todayISO } from "@/lib/constants";
import { isRecurrence, nextOccurrence } from "@/lib/recurrence";
import { parseQuickAdd } from "@/lib/todo-parse";
import { taskFollowsTodo } from "@/lib/sprint-todos";
import { COLOR_KEYS } from "@/lib/todo-meta";
import type { FormState } from "./auth";

const refresh = () => {
  revalidatePath("/todos", "layout");
  revalidatePath("/calendar");
  revalidatePath("/");
};

const optionalUuid = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.uuid().nullable());

/** A to-do owned by the signed-in user, or throws. */
async function ownTodo(id: string, userId: string) {
  const [t] = await db.select().from(todos).where(and(eq(todos.id, z.uuid().parse(id)), eq(todos.userId, userId)));
  if (!t) throw new Error("To-do not found");
  return t;
}

async function ownList(id: string | null, userId: string) {
  if (!id) return null;
  const [l] = await db.select({ id: todoLists.id }).from(todoLists).where(and(eq(todoLists.id, id), eq(todoLists.userId, userId)));
  if (!l) throw new Error("List not found");
  return l.id;
}

/** Quick add: the text is parsed for date, time, priority, #list, @labels and repeats. */
export async function addTodo(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const text = z.string().trim().max(500).parse(formData.get("text") ?? "");
  if (!text) return { error: "Type a to-do first." };
  const lists = await db.select({ id: todoLists.id, name: todoLists.name }).from(todoLists).where(eq(todoLists.userId, user.id));
  const p = parseQuickAdd(text, todayISO(), lists.map((l) => l.name));
  if (!p.title) return { error: "Give the to-do a name, not just a date." };

  // the view it was added from fills in what the text didn't say
  const listId = p.listName
    ? lists.find((l) => l.name === p.listName)!.id
    : await ownList(optionalUuid.parse(formData.get("listId") ?? undefined), user.id);
  const parentId = optionalUuid.parse(formData.get("parentId") ?? undefined);
  if (parentId) await ownTodo(parentId, user.id);
  const defaultDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null).parse(formData.get("defaultDate"));

  const [pos] = await db.select({ p: max(todos.position) }).from(todos).where(eq(todos.userId, user.id));
  await db.insert(todos).values({
    userId: user.id,
    title: p.title.slice(0, 300),
    listId,
    parentId,
    dueDate: p.dueDate ?? defaultDate,
    dueTime: p.dueTime,
    priority: p.priority,
    labels: p.labels,
    recurrence: p.recurrence,
    // a to-do with a time reminds you at that time unless you change it
    reminders: p.dueTime ? [0] : [],
    position: (pos?.p ?? 0) + 1000,
  });
  refresh();
  return { ok: "Added." };
}

const updateSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1, "Give the to-do a name").max(300),
  notes: z.string().max(10000).optional().default(""),
  dueDate: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
  dueTime: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(z.string().regex(/^\d{2}:\d{2}$/).nullable()),
  priority: z.coerce.number().int().min(1).max(4),
  listId: optionalUuid,
  labels: z.string().optional().default(""),
  recurrence: z
    .string()
    .optional()
    .transform((v) => (isRecurrence(v) ? v : null)),
});

export async function updateTodo(formData: FormData) {
  const user = await requireUser();
  const d = updateSchema.parse(Object.fromEntries(formData));
  const before = await ownTodo(d.id, user.id);
  const reminderField = String(formData.get("reminder") ?? "");
  // giving a to-do a time for the first time turns on "at the time", like a new to-do
  const timeJustAdded = !before.dueTime && !!d.dueTime && !before.reminders.length && reminderField === "";
  await db
    .update(todos)
    .set({
      title: d.title,
      notes: d.notes.trim(),
      dueDate: d.dueDate,
      // a time or a repeat means nothing without a date
      dueTime: d.dueDate ? d.dueTime : null,
      recurrence: d.dueDate ? d.recurrence : null,
      priority: d.priority,
      // a reminder needs a date; "moreReminders" carries extra ones from TickTick through unchanged
      reminders: timeJustAdded
        ? [0]
        : d.dueDate && reminderField !== ""
        ? [
            ...new Set(
              [String(formData.get("reminder") ?? ""), ...String(formData.get("moreReminders") ?? "").split(",")]
                .filter((v) => v.trim() !== "")
                .map(Number)
                .filter((n) => Number.isInteger(n) && Math.abs(n) <= 40320),
            ),
          ]
        : [],
      listId: await ownList(d.listId, user.id),
      labels: [
        ...new Set(
          d.labels
            .split(/[,\s]+/)
            .map((l) => l.replace(/^@/, "").trim().toLowerCase())
            .filter(Boolean),
        ),
      ].slice(0, 20),
    })
    .where(eq(todos.id, d.id));
  refresh();
}

/**
 * Ticks a to-do off (or back on). A repeating to-do moves to its next date instead,
 * skipping dates already in the past, like Todoist.
 */
export async function toggleTodo(formData: FormData) {
  const user = await requireUser();
  const t = await ownTodo(String(formData.get("id")), user.id);
  if (!t.completedAt && t.recurrence && t.dueDate && isRecurrence(t.recurrence)) {
    const today = todayISO();
    let next = nextOccurrence(t.dueDate, t.recurrence);
    for (let i = 0; next < today && i < 1000; i++) next = nextOccurrence(next, t.recurrence);
    await db.update(todos).set({ dueDate: next }).where(eq(todos.id, t.id));
    // sub-items start over for the next round
    await db.update(todos).set({ completedAt: null }).where(eq(todos.parentId, t.id));
  } else {
    await db
      .update(todos)
      .set({ completedAt: t.completedAt ? null : new Date() })
      .where(eq(todos.id, t.id));
    // a sprint to-do carries its task with it
    const taskId = await taskFollowsTodo(t.id);
    if (taskId) {
      revalidatePath(`/tasks/${taskId}`);
      revalidatePath("/products", "layout");
      revalidatePath("/projects", "layout");
    }
  }
  refresh();
}

/** Moves a to-do's due date: "today", "tomorrow", "+7" (days later) or "none". */
export async function rescheduleTodo(formData: FormData) {
  const user = await requireUser();
  const t = await ownTodo(String(formData.get("id")), user.id);
  const to = String(formData.get("to"));
  const dueDate = to === "today" ? todayISO() : to === "tomorrow" ? todayISO(1) : to === "+7" ? todayISO(7) : null;
  await db
    .update(todos)
    .set({ dueDate, ...(dueDate ? {} : { dueTime: null, recurrence: null }) })
    .where(eq(todos.id, t.id));
  refresh();
}

/** Moves every overdue open to-do to today. */
export async function rescheduleOverdue() {
  const user = await requireUser();
  await db
    .update(todos)
    .set({ dueDate: todayISO() })
    .where(
      and(eq(todos.userId, user.id), sql`${todos.completedAt} is null`, sql`${todos.dueDate} < ${todayISO()}`),
    );
  refresh();
}

export async function deleteTodo(formData: FormData) {
  const user = await requireUser();
  const t = await ownTodo(String(formData.get("id")), user.id);
  await db.delete(todos).where(eq(todos.id, t.id));
  refresh();
}

// ---------- lists ----------

const listSchema = z.object({
  name: z.string().trim().min(1, "Name the list").max(60),
  color: z.enum(COLOR_KEYS as [string, ...string[]]).catch("stone"),
});

export async function createTodoList(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = listSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const existing = await db.select({ name: todoLists.name }).from(todoLists).where(eq(todoLists.userId, user.id));
  if (existing.some((l) => l.name.toLowerCase() === parsed.data.name.toLowerCase())) {
    return { error: "You already have a list with that name." };
  }
  const [pos] = await db.select({ p: max(todoLists.position) }).from(todoLists).where(eq(todoLists.userId, user.id));
  const [l] = await db
    .insert(todoLists)
    .values({ ...parsed.data, userId: user.id, position: (pos?.p ?? 0) + 1000 })
    .returning({ id: todoLists.id });
  refresh();
  redirect(`/todos/list/${l.id}`);
}

export async function updateTodoList(formData: FormData) {
  const user = await requireUser();
  const id = z.uuid().parse(formData.get("id"));
  const d = listSchema.parse(Object.fromEntries(formData));
  await db.update(todoLists).set(d).where(and(eq(todoLists.id, id), eq(todoLists.userId, user.id)));
  refresh();
}

/** Deletes a list; its to-dos move to the Inbox rather than being lost. */
export async function deleteTodoList(formData: FormData) {
  const user = await requireUser();
  const id = z.uuid().parse(formData.get("id"));
  await db.delete(todoLists).where(and(eq(todoLists.id, id), eq(todoLists.userId, user.id)));
  refresh();
  redirect("/todos/inbox");
}
