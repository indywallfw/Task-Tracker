"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, leadActivities, leads } from "@/db";
import type { LeadStage } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ACTIVITY_KINDS, LEAD_STAGES } from "@/lib/constants";
import { insertLead, logActivity, patchLead, type LeadPatch } from "@/lib/leads";
import { insertTask } from "@/lib/task-service";
import type { FormState } from "./auth";

const stageValues = LEAD_STAGES.map((s) => s.value) as [string, ...string[]];
const kindValues = ACTIVITY_KINDS.map((k) => k.value) as [string, ...string[]];
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
const short = (max: number) => z.string().trim().max(max).optional().default("");

function revalidateLead(id?: string) {
  revalidatePath("/leads");
  revalidatePath("/");
  if (id) revalidatePath(`/leads/${id}`);
}

const createSchema = z.object({
  company: z.string().trim().min(1, "Company name is required").max(200),
  contactName: short(200),
  email: z.union([z.literal(""), z.string().trim().email("That email doesn't look right")]).optional().default(""),
  stage: z.enum(stageValues).optional().default("new"),
  ownerId: optionalUuid,
  source: short(40),
});

export async function createLead(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  await insertLead(
    {
      ...d,
      stage: d.stage as LeadStage,
      products: formData.getAll("products").map(String),
    },
    user.id,
  );
  revalidateLead();
  return { ok: "Lead added." };
}

const updateSchema = z.object({
  id: z.string().uuid(),
  company: z.string().trim().min(1).max(200).optional(),
  contactName: z.string().trim().max(200).optional(),
  email: z.union([z.literal(""), z.string().trim().email()]).optional(),
  phone: z.string().trim().max(60).optional(),
  website: z.string().trim().max(300).optional(),
  notes: z.string().max(20000).optional(),
  stage: z.enum(stageValues).optional(),
  source: z.string().max(40).optional(),
  ownerId: optionalUuid.optional(),
  nextFollowUp: optionalDate.optional(),
});

/**
 * Updates whichever lead fields are in the form. A form that edits products
 * includes a hidden "productsField" input so that unticking every box clears them.
 */
export async function updateLead(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = Object.fromEntries(formData);
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...d } = parsed.data;
  const patch: LeadPatch = {};
  for (const k of ["company", "contactName", "email", "phone", "website", "notes", "source"] as const) {
    if (d[k] !== undefined) patch[k] = d[k];
  }
  if (d.stage) patch.stage = d.stage as LeadStage;
  if ("ownerId" in raw) patch.ownerId = d.ownerId ?? null;
  if ("nextFollowUp" in raw) patch.nextFollowUp = d.nextFollowUp ?? null;
  if (formData.has("productsField")) patch.products = formData.getAll("products").map(String);
  await patchLead(id, patch, user.id);
  revalidateLead(id);
  return { ok: "Saved." };
}

/** Plain form-action variant for auto-submitting selects. */
export async function updateLeadField(formData: FormData) {
  await updateLead(undefined, formData);
}

/** Called by the pipeline board after a drag-and-drop. */
export async function moveLead(id: string, stage: string, position: number) {
  const user = await requireUser();
  z.string().uuid().parse(id);
  z.enum(stageValues).parse(stage);
  z.number().finite().parse(position);
  await patchLead(id, { stage: stage as LeadStage, position }, user.id);
  revalidateLead(id);
}

export async function deleteLead(formData: FormData) {
  await requireUser();
  const id = z.string().uuid().parse(formData.get("id"));
  await db.delete(leads).where(eq(leads.id, id));
  revalidateLead();
  redirect("/leads");
}

export async function addLeadActivity(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const leadId = z.string().uuid().parse(formData.get("leadId"));
  const kind = z.enum(kindValues).catch("note").parse(formData.get("kind"));
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write what happened first." };
  await logActivity(leadId, user.id, kind, body);
  revalidateLead(leadId);
  return { ok: "Logged." };
}

export async function deleteLeadActivity(formData: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().parse(formData.get("id"));
  const [a] = await db.select().from(leadActivities).where(eq(leadActivities.id, id));
  if (!a) return;
  if (a.authorId !== user.id && user.role !== "admin") throw new Error("Not allowed");
  await db.delete(leadActivities).where(eq(leadActivities.id, id));
  revalidateLead(a.leadId);
}

const followUpSchema = z.object({
  leadId: z.string().uuid(),
  projectId: z.string().uuid({ message: "Pick a project" }),
  title: z.string().trim().min(1, "Give the task a title").max(300),
  assigneeId: optionalUuid,
  dueDate: optionalDate,
});

/** Creates a task linked to the lead, e.g. "Send proposal". */
export async function createLeadTask(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = followUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const t = await insertTask({
    projectId: d.projectId,
    title: d.title,
    assigneeId: d.assigneeId,
    dueDate: d.dueDate,
    leadId: d.leadId,
    creatorId: user.id,
  });
  revalidateLead(d.leadId);
  revalidatePath(`/projects/${d.projectId}`);
  return { ok: `Created ${t.ref}.` };
}
