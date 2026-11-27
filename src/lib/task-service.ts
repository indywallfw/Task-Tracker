import "server-only";
import { and, eq, max, sql } from "drizzle-orm";
import { db, projects, tasks } from "@/db";
import type { Priority, TaskStatus } from "@/db/schema";
import { syncTaskTodos } from "./sprint-todos";
import { notifyAssigned } from "./task-notify";

/** Creates a task with the next per-project number. Shared by the UI and the MCP connector. */
export async function insertTask(input: {
  projectId: string;
  title: string;
  creatorId: string;
  description?: string;
  status?: TaskStatus;
  priority?: Priority;
  assigneeId?: string | null;
  dueDate?: string | null;
  leadId?: string | null;
  properties?: Record<string, string>;
  sprintId?: string | null;
}) {
  const status = input.status ?? "todo";
  const created = await db.transaction(async (tx) => {
    const [proj] = await tx
      .update(projects)
      .set({ taskCounter: sql`${projects.taskCounter} + 1` })
      .where(eq(projects.id, input.projectId))
      .returning({ n: projects.taskCounter, key: projects.key });
    if (!proj) throw new Error("Project not found");
    const [pos] = await tx
      .select({ p: max(tasks.position) })
      .from(tasks)
      .where(and(eq(tasks.projectId, input.projectId), eq(tasks.status, status)));
    const [task] = await tx
      .insert(tasks)
      .values({
        projectId: input.projectId,
        number: proj.n,
        title: input.title,
        description: input.description ?? "",
        status,
        priority: input.priority ?? "none",
        assigneeId: input.assigneeId ?? null,
        dueDate: input.dueDate ?? null,
        leadId: input.leadId ?? null,
        properties: input.properties ?? {},
        sprintId: input.sprintId ?? null,
        creatorId: input.creatorId,
        position: (pos?.p ?? 0) + 1000,
        completedAt: status === "done" ? new Date() : null,
      })
      .returning();
    return { ...task, ref: `${proj.key}-${proj.n}` };
  });
  if (created.assigneeId && created.assigneeId !== input.creatorId) await notifyAssigned([created.id], input.creatorId, "assigned");
  return created;
}

export type TaskPatch = Partial<{
  title: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string | null;
  dueDate: string | null;
  linkedDocId: string | null;
  description: string;
}>;

/** actorId: who made the change, so a new owner hears about it (and the actor doesn't). */
export async function patchTask(id: string, patch: TaskPatch, actorId?: string) {
  const [before] = patch.assigneeId !== undefined ? await db.select({ a: tasks.assigneeId }).from(tasks).where(eq(tasks.id, id)) : [];
  const set: Record<string, unknown> = { ...patch };
  if (patch.status) set.completedAt = patch.status === "done" ? new Date() : null;
  const [t] = await db.update(tasks).set(set).where(eq(tasks.id, id)).returning();
  await syncTaskTodos([id]);
  if (actorId && patch.assigneeId && patch.assigneeId !== before?.a) await notifyAssigned([id], actorId, "assigned");
  return t;
}
