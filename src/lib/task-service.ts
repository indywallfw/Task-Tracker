import "server-only";
import { and, eq, max, sql } from "drizzle-orm";
import { db, projects, tasks } from "@/db";
import type { Priority, TaskStatus } from "@/db/schema";

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
  return db.transaction(async (tx) => {
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

export async function patchTask(id: string, patch: TaskPatch) {
  const set: Record<string, unknown> = { ...patch };
  if (patch.status) set.completedAt = patch.status === "done" ? new Date() : null;
  const [t] = await db.update(tasks).set(set).where(eq(tasks.id, id)).returning();
  return t;
}
