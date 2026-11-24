import "server-only";
import { and, asc, eq, ilike, isNull, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, projects, tasks, users } from "@/db";

export type TaskCard = {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  position: number;
  assigneeId: string | null;
  assigneeName: string | null;
  projectId: string;
  projectKey: string;
  projectName: string;
};

const assignee = alias(users, "assignee");

export async function queryTasks(where: SQL[]): Promise<TaskCard[]> {
  return db
    .select({
      id: tasks.id,
      number: tasks.number,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      position: tasks.position,
      assigneeId: tasks.assigneeId,
      assigneeName: assignee.name,
      projectId: tasks.projectId,
      projectKey: projects.key,
      projectName: projects.name,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
    .where(and(...where))
    .orderBy(asc(tasks.position), asc(tasks.createdAt));
}

export function assigneeFilter(value: string | undefined, meId: string): SQL | undefined {
  if (!value) return undefined;
  if (value === "me") return eq(tasks.assigneeId, meId);
  if (value === "none") return isNull(tasks.assigneeId);
  return eq(tasks.assigneeId, value);
}

export function titleFilter(q: string | undefined): SQL | undefined {
  return q ? ilike(tasks.title, `%${q.replace(/[%_]/g, "\\$&")}%`) : undefined;
}
