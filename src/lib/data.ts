import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, docs, projects, users } from "@/db";

export type DocNode = {
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  children: DocNode[];
};

export async function getDocTree(): Promise<DocNode[]> {
  const rows = await db
    .select({ id: docs.id, title: docs.title, icon: docs.icon, parentId: docs.parentId })
    .from(docs)
    .orderBy(asc(docs.position), asc(docs.createdAt));
  const byId = new Map<string, DocNode>();
  rows.forEach((r) => byId.set(r.id, { ...r, children: [] }));
  const roots: DocNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function getActiveProjects() {
  return db
    .select({ id: projects.id, name: projects.name, key: projects.key })
    .from(projects)
    .where(eq(projects.archived, false))
    .orderBy(asc(projects.name));
}

export async function getActiveUsers() {
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.name));
}

/** Breadcrumb chain from the root to the given doc. */
export async function getDocPath(id: string) {
  const rows = await db
    .select({ id: docs.id, title: docs.title, parentId: docs.parentId })
    .from(docs);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const chain: { id: string; title: string }[] = [];
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift({ id: cur.id, title: cur.title });
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}
