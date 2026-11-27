"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNull, max, ne } from "drizzle-orm";
import { z } from "zod";
import { db, docs, productMembers, products, projects, sprints, tasks, todos } from "@/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { PROJECT_STATUSES, SPRINT_STATUSES } from "@/lib/project-meta";
import { PRODUCT_TEMPLATES, seedProductTemplates } from "@/lib/product-templates";
import { insertTask } from "@/lib/task-service";
import { syncSprintTodos, syncTaskTodos } from "@/lib/sprint-todos";
import type { FormState } from "./auth";

const id = z.uuid();
const optionalId = z
  .string()
  .optional()
  .transform((v) => v || null)
  .pipe(z.uuid().nullable());
const optionalDate = z
  .string()
  .optional()
  .transform((v) => v || null)
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());

const refresh = (productId?: string | null) => {
  revalidatePath("/", "layout");
  // sprint tasks are mirrored in people's To-dos
  revalidatePath("/todos", "layout");
  if (productId) revalidatePath(`/products/${productId}`);
};

// ---------- products ----------

const productSchema = z.object({
  name: z.string().trim().min(1, "Give the product a name").max(80),
  description: z.string().trim().max(5000).optional().default(""),
});

export async function createProduct(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const [p] = await db
    .insert(products)
    .values({ ...parsed.data, createdById: user.id })
    .returning({ id: products.id });
  // the creator is on the product team from the start
  await db.insert(productMembers).values({ productId: p.id, userId: user.id, role: "Owner" });
  // optional starter pieces ticked on the form
  const chosen = PRODUCT_TEMPLATES.map((t) => t.value).filter((v) => formData.get(`template_${v}`) === "on");
  if (chosen.length) await seedProductTemplates({ id: p.id, name: parsed.data.name }, user.id, chosen);
  refresh();
  redirect(`/products/${p.id}`);
}

export async function updateProduct(formData: FormData) {
  await requireUser();
  const productId = id.parse(formData.get("id"));
  const patch: { name?: string; description?: string } = {};
  if (formData.has("name")) patch.name = productSchema.shape.name.parse(formData.get("name"));
  if (formData.has("description")) patch.description = z.string().trim().max(5000).parse(formData.get("description"));
  await db.update(products).set(patch).where(eq(products.id, productId));
  refresh(productId);
}

/** Saves the sprint planning notes edited on the product's Sprints tab. */
export async function saveSprintPlan(productId: string, html: string) {
  await requireUser();
  await db
    .update(products)
    .set({ sprintPlan: z.string().max(200000).parse(html) })
    .where(eq(products.id, id.parse(productId)));
  revalidatePath(`/products/${productId}`);
}

export async function setProductArchived(formData: FormData) {
  await requireAdmin();
  const productId = id.parse(formData.get("id"));
  const archived = formData.get("archived") === "true";
  await db.update(products).set({ archived }).where(eq(products.id, productId));
  refresh(productId);
  if (archived) redirect("/products");
}

// ---------- people ----------

export async function addProductMember(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const productId = id.parse(formData.get("productId"));
  const userId = z.uuid("Pick a person").safeParse(formData.get("userId"));
  if (!userId.success) return { error: "Pick a person to add." };
  const role = z.string().trim().max(60).parse(formData.get("role") ?? "");
  await db
    .insert(productMembers)
    .values({ productId, userId: userId.data, role })
    .onConflictDoUpdate({ target: [productMembers.productId, productMembers.userId], set: { role } });
  refresh(productId);
  return { ok: "Added." };
}

export async function updateMemberRole(formData: FormData) {
  await requireUser();
  const productId = id.parse(formData.get("productId"));
  const userId = id.parse(formData.get("userId"));
  const role = z.string().trim().max(60).parse(formData.get("role") ?? "");
  await db
    .update(productMembers)
    .set({ role })
    .where(and(eq(productMembers.productId, productId), eq(productMembers.userId, userId)));
  refresh(productId);
}

export async function removeProductMember(formData: FormData) {
  await requireUser();
  const productId = id.parse(formData.get("productId"));
  const userId = id.parse(formData.get("userId"));
  await db.delete(productMembers).where(and(eq(productMembers.productId, productId), eq(productMembers.userId, userId)));
  refresh(productId);
}

// ---------- projects ----------

/** Moves a project into a product (or out of every product when productId is empty). */
export async function setProjectProduct(formData: FormData) {
  await requireUser();
  const projectId = id.parse(formData.get("projectId"));
  const productId = optionalId.parse(formData.get("productId") ?? "");
  const [before] = await db.select({ productId: projects.productId }).from(projects).where(eq(projects.id, projectId));
  await db.update(projects).set({ productId }).where(eq(projects.id, projectId));
  // sprints belong to a product, so tasks leaving it leave its sprints too
  if (before?.productId && before.productId !== productId) {
    const old = db.select({ id: sprints.id }).from(sprints).where(eq(sprints.productId, before.productId));
    await db
      .update(tasks)
      .set({ sprintId: null })
      .where(and(eq(tasks.projectId, projectId), inArray(tasks.sprintId, old)));
  }
  refresh(before?.productId);
  refresh(productId);
  revalidatePath(`/projects/${projectId}`);
}

/** Lists a project in its product's Sprints section (like Weekly Sprints) or with the other projects. */
export async function setProjectSprintTracker(formData: FormData) {
  await requireUser();
  const projectId = id.parse(formData.get("projectId"));
  const on = formData.get("sprintTracker") === "on";
  const [p] = await db
    .update(projects)
    .set({ sprintTracker: on })
    .where(eq(projects.id, projectId))
    .returning({ productId: projects.productId });
  refresh(p?.productId);
  revalidatePath(`/projects/${projectId}`);
}

export async function setProjectStatus(formData: FormData) {
  await requireUser();
  const projectId = id.parse(formData.get("projectId"));
  const status = z.enum(PROJECT_STATUSES.map((s) => s.value)).parse(formData.get("status"));
  const [p] = await db
    .update(projects)
    .set({ status })
    .where(eq(projects.id, projectId))
    .returning({ productId: projects.productId });
  refresh(p?.productId);
  revalidatePath(`/projects/${projectId}`);
}

/** Saves the project's description or proposed plan (whichever field the form sends). */
export async function updateProjectText(formData: FormData) {
  await requireUser();
  const projectId = id.parse(formData.get("projectId"));
  const patch: { description?: string; plan?: string } = {};
  if (formData.has("description")) patch.description = z.string().trim().max(5000).parse(formData.get("description"));
  if (formData.has("plan")) patch.plan = z.string().trim().max(50000).parse(formData.get("plan"));
  const [p] = await db
    .update(projects)
    .set(patch)
    .where(eq(projects.id, projectId))
    .returning({ productId: projects.productId });
  refresh(p?.productId);
  revalidatePath(`/projects/${projectId}`);
}

// ---------- sprints ----------

const sprintSchema = z.object({
  name: z.string().trim().min(1, "Give the sprint a name").max(80),
  goal: z.string().trim().max(2000).optional().default(""),
  startDate: optionalDate,
  endDate: optionalDate,
});

export async function createSprint(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const productId = id.parse(formData.get("productId"));
  const parsed = sprintSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.startDate && d.endDate && d.endDate < d.startDate) return { error: "The sprint ends before it starts." };
  const [s] = await db.insert(sprints).values({ ...d, productId }).returning({ id: sprints.id });
  refresh(productId);
  redirect(`/products/${productId}?tab=sprints&sprint=${s.id}`);
}

export async function updateSprint(formData: FormData) {
  await requireUser();
  const sprintId = id.parse(formData.get("sprintId"));
  const d = sprintSchema.parse(Object.fromEntries(formData));
  const [s] = await db.update(sprints).set(d).where(eq(sprints.id, sprintId)).returning({ productId: sprints.productId });
  await syncSprintTodos(sprintId);
  refresh(s?.productId);
}

/**
 * Starts or completes a sprint. Completing one sends its unfinished tasks back
 * to the backlog (no sprint) so they can be planned into the next one.
 */
export async function setSprintStatus(formData: FormData) {
  await requireUser();
  const sprintId = id.parse(formData.get("sprintId"));
  const status = z.enum(SPRINT_STATUSES.map((s) => s.value)).parse(formData.get("status"));
  const [s] = await db.update(sprints).set({ status }).where(eq(sprints.id, sprintId)).returning({ productId: sprints.productId });
  const inSprint = (await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.sprintId, sprintId))).map((r) => r.id);
  if (status === "completed") {
    await db.update(tasks).set({ sprintId: null }).where(and(eq(tasks.sprintId, sprintId), ne(tasks.status, "done")));
  }
  await syncTaskTodos(inSprint);
  refresh(s?.productId);
}

export async function deleteSprint(formData: FormData) {
  await requireUser();
  const sprintId = id.parse(formData.get("sprintId"));
  const inSprint = (await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.sprintId, sprintId))).map((r) => r.id);
  const [s] = await db.delete(sprints).where(eq(sprints.id, sprintId)).returning({ productId: sprints.productId });
  await syncTaskTodos(inSprint);
  refresh(s?.productId);
  redirect(`/products/${s?.productId}?tab=sprints`);
}

/** Adds the ticked tasks to a sprint; only tasks from the sprint's own product are accepted. */
export async function addTasksToSprint(formData: FormData) {
  await requireUser();
  const sprintId = id.parse(formData.get("sprintId"));
  const taskIds = z.array(z.uuid()).max(500).parse(formData.getAll("taskId").map(String));
  const [s] = await db.select({ productId: sprints.productId }).from(sprints).where(eq(sprints.id, sprintId));
  if (!s || !taskIds.length) return;
  const own = db.select({ id: projects.id }).from(projects).where(eq(projects.productId, s.productId));
  await db
    .update(tasks)
    .set({ sprintId })
    .where(and(inArray(tasks.id, taskIds), inArray(tasks.projectId, own)));
  await syncTaskTodos(taskIds);
  refresh(s.productId);
}

/** Puts one task in a sprint, or takes it out when sprintId is empty. */
export async function setTaskSprint(formData: FormData) {
  await requireUser();
  const taskId = id.parse(formData.get("taskId"));
  const sprintId = optionalId.parse(formData.get("sprintId") ?? "");
  const [t] = await db
    .select({ projectId: tasks.projectId, productId: projects.productId })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(eq(tasks.id, taskId));
  if (!t) return;
  if (sprintId) {
    const [s] = await db.select({ productId: sprints.productId }).from(sprints).where(eq(sprints.id, sprintId));
    if (!s || s.productId !== t.productId) throw new Error("That sprint belongs to another product.");
  }
  await db.update(tasks).set({ sprintId }).where(eq(tasks.id, taskId));
  await syncTaskTodos([taskId]);
  refresh(t.productId);
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath(`/projects/${t.projectId}`);
}

/**
 * Creates a task straight into a sprint. The task lands in the chosen project's
 * task list like any other; "remind me" also adds a to-do for the person adding it.
 */
export async function createSprintTask(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const sprintId = id.parse(formData.get("sprintId"));
  const title = z.string().trim().max(300).parse(formData.get("title") ?? "");
  if (!title) return { error: "Give the task a title." };
  const projectId = z.uuid().safeParse(formData.get("projectId"));
  if (!projectId.success) return { error: "Pick the project the task belongs to." };
  const assigneeId = optionalId.parse(formData.get("assigneeId") ?? "");
  const dueDate = optionalDate.parse(formData.get("dueDate") ?? "");
  const remind = formData.get("remind") === "on";
  const remindDate = optionalDate.parse(formData.get("remindDate") ?? "") ?? dueDate;
  const remindTime = z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(z.string().regex(/^\d{2}:\d{2}$/).nullable())
    .parse(formData.get("remindTime") ?? "");

  const [s] = await db.select({ productId: sprints.productId, name: sprints.name }).from(sprints).where(eq(sprints.id, sprintId));
  const [p] = await db.select({ productId: projects.productId }).from(projects).where(eq(projects.id, projectId.data));
  if (!s || !p || p.productId !== s.productId) return { error: "That project isn't part of this product." };

  const task = await insertTask({ projectId: projectId.data, title, creatorId: user.id, assigneeId, dueDate, sprintId });
  // the owner gets the task in their To-dos automatically
  await syncTaskTodos([task.id]);
  if (remind) {
    const [own] = await db
      .select({ id: todos.id })
      .from(todos)
      .where(and(eq(todos.taskId, task.id), eq(todos.userId, user.id), eq(todos.source, "sprint")));
    if (own) {
      // your own task: the reminder date and time go on that same to-do
      if (remindDate)
        await db
          .update(todos)
          .set({ dueDate: remindDate, dueTime: remindTime, reminders: remindTime ? [0] : [] })
          .where(eq(todos.id, own.id));
    } else {
      const [pos] = await db.select({ p: max(todos.position) }).from(todos).where(eq(todos.userId, user.id));
      await db.insert(todos).values({
        userId: user.id,
        title: `${task.ref} ${title}`.slice(0, 300),
        notes: `Sprint task in ${s.name}`,
        dueDate: remindDate,
        dueTime: remindDate ? remindTime : null,
        reminders: remindDate && remindTime ? [0] : [],
        taskId: task.id,
        source: "reminder",
        position: (pos?.p ?? 0) + 1000,
      });
    }
  }
  refresh(s.productId);
  revalidatePath(`/projects/${projectId.data}`);
  return { ok: remind ? `Added ${task.ref} with a reminder in your To-dos.` : `Added ${task.ref}.` };
}

/** Adds the starter pieces (sprint planning, Weekly Sprints, Launch Readiness Pipeline) to an existing product. */
export async function addProductStarters(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const productId = id.parse(formData.get("productId"));
  const chosen = PRODUCT_TEMPLATES.map((t) => t.value).filter((v) => formData.get(`template_${v}`) === "on");
  if (!chosen.length) return { error: "Tick at least one." };
  const [p] = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, productId));
  if (!p) return { error: "Product not found." };
  await seedProductTemplates(p, user.id, chosen);
  refresh(productId);
  return { ok: "Added." };
}

// ---------- docs ----------

/** A new top-level page linked to the product, e.g. a build plan. */
export async function createProductDoc(formData: FormData) {
  const user = await requireUser();
  const productId = id.parse(formData.get("productId"));
  const title = z.string().trim().max(300).parse(formData.get("title") ?? "") || "Untitled";
  const [row] = await db.select({ p: max(docs.position) }).from(docs).where(isNull(docs.parentId));
  const [doc] = await db
    .insert(docs)
    .values({ title, productId, position: (row?.p ?? 0) + 1000, createdById: user.id, updatedById: user.id })
    .returning({ id: docs.id });
  refresh(productId);
  redirect(`/docs/${doc.id}`);
}

export async function linkDocToProduct(formData: FormData) {
  await requireUser();
  const productId = optionalId.parse(formData.get("productId") ?? "");
  const docId = z.uuid().safeParse(formData.get("docId"));
  if (!docId.success) return;
  await db.update(docs).set({ productId }).where(eq(docs.id, docId.data));
  refresh(productId);
  revalidatePath(`/docs/${docId.data}`);
}
