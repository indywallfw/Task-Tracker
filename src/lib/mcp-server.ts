import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, asc, desc, eq, ilike, isNull, ne, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { comments, db, docs, projects, tasks, users } from "@/db";
import type { CurrentUser } from "./auth";
import { STATUSES, PRIORITIES } from "./constants";
import { getDocTree, type DocNode } from "./data";
import { insertTask, patchTask, type TaskPatch } from "./task-service";
import { queryTasks, type TaskCard } from "./tasks-query";
import { htmlToText, markdownToHtml } from "./text";

/**
 * MCP server exposing the workspace to Claude. Every call runs as the user who
 * owns the API token, with the same data the web app shows them.
 */

const statusEnum = z.enum(STATUSES.map((s) => s.value) as [string, ...string[]]);
const priorityEnum = z.enum(PRIORITIES.map((p) => p.value) as [string, ...string[]]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const json = (v: unknown) => text(JSON.stringify(v, null, 2));
const fail = (s: string) => ({ content: [{ type: "text" as const, text: s }], isError: true });
const like = (q: string) => `%${q.replace(/[%_]/g, "\\$&")}%`;

function taskSummary(t: TaskCard) {
  return {
    ref: `${t.projectKey}-${t.number}`,
    id: t.id,
    title: t.title,
    project: t.projectName,
    status: t.status,
    priority: t.priority,
    assignee: t.assigneeName,
    dueDate: t.dueDate,
  };
}

async function findTask(ref: string) {
  if (uuidRe.test(ref)) {
    const [t] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, ref));
    return t?.id ?? null;
  }
  const m = ref.trim().match(/^([A-Za-z][A-Za-z0-9]*)-(\d+)$/);
  if (!m) return null;
  const [t] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(projects.key, m[1].toUpperCase()), eq(tasks.number, Number(m[2]))));
  return t?.id ?? null;
}

async function findProject(keyOrName: string) {
  const v = keyOrName.trim();
  const [p] = await db
    .select({ id: projects.id, key: projects.key, name: projects.name })
    .from(projects)
    .where(
      uuidRe.test(v)
        ? eq(projects.id, v)
        : or(eq(projects.key, v.toUpperCase()), ilike(projects.name, v)),
    );
  return p ?? null;
}

/** "me", an email, or a full name. */
async function findPerson(v: string, me: CurrentUser) {
  if (v.trim().toLowerCase() === "me") return me.id;
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.active, true), or(eq(users.email, v.trim().toLowerCase()), ilike(users.name, v.trim()))));
  return u?.id ?? null;
}

function outline(nodes: DocNode[], depth = 0): string {
  return nodes
    .map((n) => `${"  ".repeat(depth)}- ${n.title || "Untitled"} (id: ${n.id})\n${outline(n.children, depth + 1)}`)
    .join("");
}

export function buildMcpServer(me: CurrentUser) {
  const server = new McpServer(
    { name: "workspace", version: "1.0.0" },
    {
      instructions:
        "This is the team's internal workspace: projects with tasks (referenced like OPS-12) and a wiki of docs. " +
        "Use search tools before creating things to avoid duplicates. Dates are YYYY-MM-DD. " +
        "Write task descriptions, comments and docs in Markdown.",
    },
  );

  server.registerTool(
    "whoami",
    { title: "Who am I", description: "Shows which workspace user this connection acts as.", annotations: { readOnlyHint: true } },
    async () => json(me),
  );

  server.registerTool(
    "list_projects",
    { title: "List projects", description: "Lists active projects with their keys.", annotations: { readOnlyHint: true } },
    async () => {
      const rows = await db
        .select({ key: projects.key, name: projects.name, description: projects.description, id: projects.id })
        .from(projects)
        .where(eq(projects.archived, false))
        .orderBy(asc(projects.name));
      return json(rows);
    },
  );

  server.registerTool(
    "list_people",
    { title: "List people", description: "Lists active teammates who can be assigned tasks.", annotations: { readOnlyHint: true } },
    async () => {
      const rows = await db
        .select({ name: users.name, email: users.email, role: users.role })
        .from(users)
        .where(eq(users.active, true))
        .orderBy(asc(users.name));
      return json(rows);
    },
  );

  server.registerTool(
    "search_tasks",
    {
      title: "Search tasks",
      description:
        "Finds tasks. All filters are optional. assignee accepts 'me', 'none', an email or a name. Done tasks are excluded unless includeDone is true.",
      inputSchema: {
        query: z.string().optional().describe("Text to match in title or description"),
        project: z.string().optional().describe("Project key (e.g. OPS) or name"),
        assignee: z.string().optional(),
        status: statusEnum.optional(),
        dueBefore: isoDate.optional().describe("Only tasks due on or before this date"),
        includeDone: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (a) => {
      const where: SQL[] = [];
      if (a.query) where.push(or(ilike(tasks.title, like(a.query)), ilike(tasks.description, like(a.query)))!);
      if (a.project) {
        const p = await findProject(a.project);
        if (!p) return fail(`No project matches "${a.project}". Use list_projects.`);
        where.push(eq(tasks.projectId, p.id));
      }
      if (a.assignee) {
        if (a.assignee === "none") where.push(isNull(tasks.assigneeId));
        else {
          const id = await findPerson(a.assignee, me);
          if (!id) return fail(`No teammate matches "${a.assignee}". Use list_people.`);
          where.push(eq(tasks.assigneeId, id));
        }
      }
      if (a.status) where.push(eq(tasks.status, a.status as never));
      else if (!a.includeDone) where.push(ne(tasks.status, "done"));
      let rows = await queryTasks(where);
      if (a.dueBefore) rows = rows.filter((t) => t.dueDate && t.dueDate <= a.dueBefore!);
      return json(rows.slice(0, a.limit ?? 50).map(taskSummary));
    },
  );

  server.registerTool(
    "get_task",
    {
      title: "Get task",
      description: "Full details of one task, including description and comments.",
      inputSchema: { ref: z.string().describe("Task reference like OPS-12, or its id") },
      annotations: { readOnlyHint: true },
    },
    async ({ ref }) => {
      const id = await findTask(ref);
      if (!id) return fail(`No task ${ref}.`);
      const [t] = await queryTasks([eq(tasks.id, id)]);
      const [full] = await db.select().from(tasks).where(eq(tasks.id, id));
      const thread = await db
        .select({ author: users.name, body: comments.body, at: comments.createdAt })
        .from(comments)
        .leftJoin(users, eq(users.id, comments.authorId))
        .where(eq(comments.taskId, id))
        .orderBy(asc(comments.createdAt));
      return json({
        ...taskSummary(t),
        description: htmlToText(full.description),
        linkedDocId: full.linkedDocId,
        createdAt: full.createdAt,
        comments: thread,
      });
    },
  );

  server.registerTool(
    "create_task",
    {
      title: "Create task",
      description: "Creates a task in a project. Returns its reference (e.g. OPS-13).",
      inputSchema: {
        project: z.string().describe("Project key or name"),
        title: z.string().min(1).max(300),
        description: z.string().optional().describe("Markdown"),
        assignee: z.string().optional().describe("'me', an email or a name"),
        status: statusEnum.optional(),
        priority: priorityEnum.optional(),
        dueDate: isoDate.optional(),
      },
    },
    async (a) => {
      const p = await findProject(a.project);
      if (!p) return fail(`No project matches "${a.project}". Use list_projects.`);
      let assigneeId: string | null = null;
      if (a.assignee) {
        assigneeId = await findPerson(a.assignee, me);
        if (!assigneeId) return fail(`No teammate matches "${a.assignee}". Use list_people.`);
      }
      const t = await insertTask({
        projectId: p.id,
        title: a.title,
        description: a.description ? markdownToHtml(a.description) : "",
        status: a.status as never,
        priority: a.priority as never,
        assigneeId,
        dueDate: a.dueDate ?? null,
        creatorId: me.id,
      });
      return json({ ref: t.ref, id: t.id, url: `/tasks/${t.id}` });
    },
  );

  server.registerTool(
    "update_task",
    {
      title: "Update task",
      description:
        "Changes a task's fields. Only the fields you pass change. Pass assignee or dueDate as an empty string to clear it.",
      inputSchema: {
        ref: z.string(),
        title: z.string().min(1).max(300).optional(),
        description: z.string().optional().describe("Markdown; replaces the whole description"),
        status: statusEnum.optional(),
        priority: priorityEnum.optional(),
        assignee: z.string().optional(),
        dueDate: z.union([isoDate, z.literal("")]).optional(),
      },
      annotations: { idempotentHint: true },
    },
    async (a) => {
      const id = await findTask(a.ref);
      if (!id) return fail(`No task ${a.ref}.`);
      const patch: TaskPatch = {};
      if (a.title) patch.title = a.title;
      if (a.description !== undefined) patch.description = markdownToHtml(a.description);
      if (a.status) patch.status = a.status as never;
      if (a.priority) patch.priority = a.priority as never;
      if (a.dueDate !== undefined) patch.dueDate = a.dueDate || null;
      if (a.assignee !== undefined) {
        if (a.assignee === "") patch.assigneeId = null;
        else {
          const uid = await findPerson(a.assignee, me);
          if (!uid) return fail(`No teammate matches "${a.assignee}". Use list_people.`);
          patch.assigneeId = uid;
        }
      }
      await patchTask(id, patch);
      const [t] = await queryTasks([eq(tasks.id, id)]);
      return json(taskSummary(t));
    },
  );

  server.registerTool(
    "add_comment",
    {
      title: "Comment on task",
      description: "Adds a comment to a task as the connected user.",
      inputSchema: { ref: z.string(), body: z.string().min(1).max(10000) },
    },
    async ({ ref, body }) => {
      const id = await findTask(ref);
      if (!id) return fail(`No task ${ref}.`);
      await db.insert(comments).values({ taskId: id, authorId: me.id, body });
      return text(`Comment added to ${ref}.`);
    },
  );

  server.registerTool(
    "list_docs",
    { title: "List docs", description: "Outline of all doc pages with their ids.", annotations: { readOnlyHint: true } },
    async () => text(outline(await getDocTree()) || "No docs yet."),
  );

  server.registerTool(
    "search_docs",
    {
      title: "Search docs",
      description: "Finds doc pages whose title or text matches.",
      inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(50).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ query, limit }) => {
      const rows = await db
        .select({ id: docs.id, title: docs.title, text: docs.contentText, updatedAt: docs.updatedAt })
        .from(docs)
        .where(or(ilike(docs.title, like(query)), ilike(docs.contentText, like(query))))
        .orderBy(desc(docs.updatedAt))
        .limit(limit ?? 15);
      return json(rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt, preview: r.text.slice(0, 300) })));
    },
  );

  server.registerTool(
    "get_doc",
    {
      title: "Read doc",
      description: "Reads a doc page's full content.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const [d] = await db.select().from(docs).where(eq(docs.id, id));
      if (!d) return fail(`No doc ${id}.`);
      const children = await db.select({ id: docs.id, title: docs.title }).from(docs).where(eq(docs.parentId, id));
      return json({ id: d.id, title: d.title, parentId: d.parentId, updatedAt: d.updatedAt, content: htmlToText(d.content), children });
    },
  );

  server.registerTool(
    "create_doc",
    {
      title: "Create doc",
      description: "Creates a doc page from Markdown, optionally nested under another page.",
      inputSchema: {
        title: z.string().min(1).max(300),
        markdown: z.string().optional(),
        parentId: z.string().uuid().optional(),
      },
    },
    async (a) => {
      if (a.parentId) {
        const [p] = await db.select({ id: docs.id }).from(docs).where(eq(docs.id, a.parentId));
        if (!p) return fail(`No parent doc ${a.parentId}.`);
      }
      const html = a.markdown ? markdownToHtml(a.markdown) : "";
      const [d] = await db
        .insert(docs)
        .values({
          title: a.title,
          parentId: a.parentId ?? null,
          content: html,
          contentText: htmlToText(html),
          position: Date.now(),
          createdById: me.id,
          updatedById: me.id,
        })
        .returning({ id: docs.id });
      return json({ id: d.id, url: `/docs/${d.id}` });
    },
  );

  server.registerTool(
    "update_doc",
    {
      title: "Update doc",
      description: "Renames a doc and/or changes its content. mode 'append' adds Markdown to the end; 'replace' overwrites it.",
      inputSchema: {
        id: z.string().uuid(),
        title: z.string().min(1).max(300).optional(),
        markdown: z.string().optional(),
        mode: z.enum(["append", "replace"]).optional().describe("Default: append"),
      },
    },
    async (a) => {
      const [d] = await db.select().from(docs).where(eq(docs.id, a.id));
      if (!d) return fail(`No doc ${a.id}.`);
      const set: Partial<typeof docs.$inferInsert> = { updatedById: me.id };
      if (a.title) set.title = a.title;
      if (a.markdown !== undefined) {
        const added = markdownToHtml(a.markdown);
        set.content = a.mode === "replace" ? added : d.content + added;
        set.contentText = htmlToText(set.content);
      }
      await db.update(docs).set(set).where(eq(docs.id, a.id));
      return text(`Updated "${a.title ?? d.title}".`);
    },
  );

  return server;
}
