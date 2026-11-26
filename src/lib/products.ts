import "server-only";
import { and, asc, count, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { db, docs, productMembers, products, projects, sprints, tasks, users } from "@/db";

export async function getActiveProducts() {
  return db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(eq(products.archived, false))
    .orderBy(asc(products.name));
}

/** Products with the numbers shown on their cards. */
export async function getProductCards() {
  const [rows, projectCounts, taskCounts, memberCounts] = await Promise.all([
    db.select().from(products).orderBy(asc(products.archived), asc(products.name)),
    db
      .select({ productId: projects.productId, pending: count() })
      .from(projects)
      .where(and(ne(projects.status, "done"), eq(projects.archived, false)))
      .groupBy(projects.productId),
    db
      .select({ productId: projects.productId, open: count() })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(ne(tasks.status, "done"))
      .groupBy(projects.productId),
    db.select({ productId: productMembers.productId, n: count() }).from(productMembers).groupBy(productMembers.productId),
  ]);
  const by = <T extends { productId: string | null }>(list: T[]) => new Map(list.map((r) => [r.productId, r]));
  const p = by(projectCounts);
  const t = by(taskCounts);
  const m = by(memberCounts);
  return rows.map((r) => ({
    ...r,
    pendingProjects: p.get(r.id)?.pending ?? 0,
    openTasks: t.get(r.id)?.open ?? 0,
    members: m.get(r.id)?.n ?? 0,
  }));
}

export async function getProduct(id: string) {
  const [p] = await db.select().from(products).where(eq(products.id, id));
  return p ?? null;
}

/** The product's projects, with open/total task counts. */
export async function getProductProjects(productId: string) {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      key: projects.key,
      description: projects.description,
      status: projects.status,
      archived: projects.archived,
      open: sql<number>`count(${tasks.id}) filter (where ${tasks.status} <> 'done')`.mapWith(Number),
      total: count(tasks.id),
    })
    .from(projects)
    .leftJoin(tasks, eq(tasks.projectId, projects.id))
    .where(eq(projects.productId, productId))
    .groupBy(projects.id)
    .orderBy(asc(projects.archived), asc(projects.name));
}

/** Projects not yet in any product, for "add an existing project". */
export async function getUnassignedProjects() {
  return db
    .select({ id: projects.id, name: projects.name, key: projects.key })
    .from(projects)
    .where(and(isNull(projects.productId), eq(projects.archived, false)))
    .orderBy(asc(projects.name));
}

export async function getProductMembers(productId: string) {
  return db
    .select({ userId: users.id, name: users.name, email: users.email, role: productMembers.role })
    .from(productMembers)
    .innerJoin(users, eq(users.id, productMembers.userId))
    .where(eq(productMembers.productId, productId))
    .orderBy(asc(users.name));
}

/** Sprints with how many of their tasks are done. */
export async function getProductSprints(productId: string) {
  return db
    .select({
      id: sprints.id,
      name: sprints.name,
      goal: sprints.goal,
      startDate: sprints.startDate,
      endDate: sprints.endDate,
      status: sprints.status,
      updatedAt: sprints.updatedAt,
      done: sql<number>`count(${tasks.id}) filter (where ${tasks.status} = 'done')`.mapWith(Number),
      total: count(tasks.id),
    })
    .from(sprints)
    .leftJoin(tasks, eq(tasks.sprintId, sprints.id))
    .where(eq(sprints.productId, productId))
    .groupBy(sprints.id)
    .orderBy(
      sql`case ${sprints.status} when 'active' then 0 when 'planned' then 1 else 2 end`,
      asc(sprints.startDate),
      desc(sprints.createdAt),
    );
}

export async function getProductDocs(productId: string) {
  return db
    .select({ id: docs.id, title: docs.title, icon: docs.icon, updatedAt: docs.updatedAt })
    .from(docs)
    .where(eq(docs.productId, productId))
    .orderBy(asc(docs.title));
}

/** Docs that can still be linked: every page not already linked to this product. */
export async function getLinkableDocs(productId: string) {
  return db
    .select({ id: docs.id, title: docs.title, productId: docs.productId })
    .from(docs)
    .where(sql`${docs.productId} is distinct from ${productId}`)
    .orderBy(asc(docs.title));
}
