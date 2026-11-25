"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { comments, db, projects, tasks } from "@/db";
import type { Priority, TaskStatus } from "@/db/schema";
import { insertTask } from "@/lib/task-service";
import { requireAdmin, requireUser } from "@/lib/auth";
import { PRIORITIES, STATUSES } from "@/lib/constants";
import type { FormState } from "./auth";

const statusValues = STATUSES.map((s) => s.value) as [string, ...string[]];
const priorityValues = PRIORITIES.map((p) => p.value) as [string, ...string[]];
const optionalUuid = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.string().uuid().nullable());
const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());

// ---------- projects ----------

const projectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,5}$/, "Key must be 2–6 letters or digits, starting with a letter"),
  description: z.string().trim().max(2000).optional().default(""),
});

export async function createProject(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const taken = await db.select({ id: projects.id }).from(projects).where(eq(projects.key, parsed.data.key));
  if (taken.length) return { error: `Key ${parsed.data.key} is already used.` };
  const [p] = await db
    .insert(projects)
    .values({ ...parsed.data, createdById: user.id })
    .returning({ id: projects.id });
  revalidatePath("/", "layout");
  redirect(`/projects/${p.id}`);
}

export async function updateProject(formData: FormData) {
  await requireUser();
  const id = z.string().uuid().parse(formData.get("id"));
  const name = z.string().trim().min(1).max(80).parse(formData.get("name"));
  const description = z.string().trim().max(2000).parse(formData.get("description") ?? "");
  const patch: { name: string; description: string; fields?: string[] } = { name, description };
  if (formData.has("fields")) {
    // one field per line; keep order, drop blanks and duplicates
    const lines = String(formData.get("fields")).split(/\r?\n/).map((l) => l.trim().slice(0, 60)).filter(Boolean);
    patch.fields = [...new Set(lines)].slice(0, 30);
  }
  await db.update(projects).set(patch).where(eq(projects.id, id));
  revalidatePath("/", "layout");
}

export async function setProjectArchived(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const archived = formData.get("archived") === "true";
  await db.update(projects).set({ archived }).where(eq(projects.id, id));
  revalidatePath("/", "layout");
  if (archived) redirect("/projects");
}

// ---------- tasks ----------

const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1, "Give the task a title").max(300),
  status: z.enum(statusValues).optional().default("todo"),
  priority: z.enum(priorityValues).optional().default("none"),
  assigneeId: optionalUuid,
  dueDate: optionalDate,
});

export async function createTask(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = createTaskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  await insertTask({
    projectId: d.projectId,
    title: d.title,
    status: d.status as TaskStatus,
    priority: d.priority as Priority,
    assigneeId: d.assigneeId,
    dueDate: d.dueDate,
    creatorId: user.id,
  });
  revalidatePath(`/projects/${d.projectId}`);
  revalidatePath("/");
  return { ok: "Task added." };
}

const updateTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(300).optional(),
  status: z.enum(statusValues).optional(),
  priority: z.enum(priorityValues).optional(),
  assigneeId: optionalUuid.optional(),
  dueDate: optionalDate.optional(),
  linkedDocId: optionalUuid.optional(),
});

/** Updates whichever task fields are present in the form. */
export async function updateTask(formData: FormData) {
  await requireUser();
  const raw = Object.fromEntries(formData);
  const d = updateTaskSchema.parse(raw);
  const patch: Record<string, unknown> = {};
  if (d.title !== undefined) patch.title = d.title;
  if (d.priority !== undefined) patch.priority = d.priority;
  if ("assigneeId" in raw) patch.assigneeId = d.assigneeId ?? null;
  if ("dueDate" in raw) patch.dueDate = d.dueDate ?? null;
  if ("linkedDocId" in raw) patch.linkedDocId = d.linkedDocId ?? null;
  if (d.status !== undefined) {
    patch.status = d.status;
    patch.completedAt = d.status === "done" ? new Date() : null;
  }
  const [t] = await db.update(tasks).set(patch).where(eq(tasks.id, d.id)).returning({ projectId: tasks.projectId });
  revalidatePath(`/tasks/${d.id}`);
  if (t) revalidatePath(`/projects/${t.projectId}`);
  revalidatePath("/");
}

export async function updateTaskDescription(id: string, html: string) {
  await requireUser();
  z.string().uuid().parse(id);
  await db.update(tasks).set({ description: html }).where(eq(tasks.id, id));
}

/** Called by the kanban board after a drag-and-drop. */
export async function moveTask(id: string, status: string, position: number) {
  await requireUser();
  z.string().uuid().parse(id);
  z.enum(statusValues).parse(status);
  z.number().finite().parse(position);
  const [t] = await db
    .update(tasks)
    .set({
      status: status as never,
      position,
      completedAt: status === "done" ? new Date() : null,
    })
    .where(eq(tasks.id, id))
    .returning({ projectId: tasks.projectId });
  if (t) revalidatePath(`/projects/${t.projectId}`);
  revalidatePath("/");
}

export async function deleteTask(formData: FormData) {
  await requireUser();
  const id = z.string().uuid().parse(formData.get("id"));
  const [t] = await db.delete(tasks).where(eq(tasks.id, id)).returning({ projectId: tasks.projectId });
  revalidatePath("/");
  redirect(t ? `/projects/${t.projectId}` : "/");
}

// ---------- comments ----------

export async function addComment(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const taskId = z.string().uuid().parse(formData.get("taskId"));
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write something first." };
  await db.insert(comments).values({ taskId, authorId: user.id, body: body.slice(0, 10000) });
  revalidatePath(`/tasks/${taskId}`);
  return { ok: "Comment added." };
}

export async function deleteComment(formData: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().parse(formData.get("id"));
  const [c] = await db.select().from(comments).where(eq(comments.id, id));
  if (!c) return;
  if (c.authorId !== user.id && user.role !== "admin") throw new Error("Not allowed");
  await db.delete(comments).where(eq(comments.id, id));
  revalidatePath(`/tasks/${c.taskId}`);
}
