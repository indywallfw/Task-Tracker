import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull, lte, gte, sql, type SQL } from "drizzle-orm";
import { db, todoLists, todos, type Todo, type TodoList } from "@/db";

export type TodoRow = Todo & { subtasks: Todo[] };

export async function getTodoLists(userId: string): Promise<TodoList[]> {
  return db.select().from(todoLists).where(eq(todoLists.userId, userId)).orderBy(asc(todoLists.position));
}

/** Open to-dos per list id ("inbox" for none), for the sidebar counts. */
export async function openCounts(userId: string) {
  const rows = await db
    .select({ listId: todos.listId, n: sql<number>`count(*)::int` })
    .from(todos)
    .where(and(eq(todos.userId, userId), isNull(todos.completedAt), isNull(todos.parentId)))
    .groupBy(todos.listId);
  return new Map(rows.map((r) => [r.listId ?? "inbox", r.n]));
}

/** Every label the user has used, alphabetically. */
export async function getLabels(userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ l: sql<string>`unnest(${todos.labels})` })
    .from(todos)
    .where(eq(todos.userId, userId));
  return rows.map((r) => r.l).sort();
}

/**
 * Top-level to-dos matching `where`, each with its sub-items.
 * Ordered by date, time, priority, then manual order.
 */
export async function queryTodos(userId: string, where: (SQL | undefined)[]): Promise<TodoRow[]> {
  const top = await db
    .select()
    .from(todos)
    .where(and(eq(todos.userId, userId), isNull(todos.parentId), ...where))
    .orderBy(
      sql`${todos.dueDate} asc nulls last`,
      sql`${todos.dueTime} asc nulls last`,
      asc(todos.priority),
      asc(todos.position),
    );
  if (!top.length) return [];
  const subs = await db
    .select()
    .from(todos)
    .where(inArray(todos.parentId, top.map((t) => t.id)))
    .orderBy(asc(todos.position));
  return top.map((t) => ({ ...t, subtasks: subs.filter((s) => s.parentId === t.id) }));
}

export const todoFilters = {
  open: () => isNull(todos.completedAt),
  done: () => isNotNull(todos.completedAt),
  dueBy: (iso: string) => lte(todos.dueDate, iso),
  dueBetween: (from: string, to: string) => and(gte(todos.dueDate, from), lte(todos.dueDate, to)),
  inbox: () => isNull(todos.listId),
  list: (id: string) => eq(todos.listId, id),
  label: (l: string) => sql`${l} = any(${todos.labels})`,
};
