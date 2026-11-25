import "server-only";
import { and, asc, eq, ilike, inArray, isNull, max, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, leadActivities, leads, users } from "@/db";
import type { Lead, LeadStage } from "@/db/schema";
import { LEAD_PRODUCTS, LEAD_SOURCES, OPEN_LEAD_STAGES, stageLabel } from "./constants";

/** Shared lead logic for the web app and the Claude (MCP) connector. */

export type LeadCard = {
  id: string;
  company: string;
  contactName: string;
  stage: string;
  products: string[];
  source: string;
  nextFollowUp: string | null;
  position: number;
  ownerId: string | null;
  ownerName: string | null;
  updatedAt: Date;
};

const owner = alias(users, "owner");

export async function queryLeads(where: (SQL | undefined)[], limit = 500): Promise<LeadCard[]> {
  return db
    .select({
      id: leads.id,
      company: leads.company,
      contactName: leads.contactName,
      stage: leads.stage,
      products: leads.products,
      source: leads.source,
      nextFollowUp: leads.nextFollowUp,
      position: leads.position,
      ownerId: leads.ownerId,
      ownerName: owner.name,
      updatedAt: leads.updatedAt,
    })
    .from(leads)
    .leftJoin(owner, eq(owner.id, leads.ownerId))
    .where(and(...where.filter(Boolean)))
    .orderBy(asc(leads.position), asc(leads.createdAt))
    .limit(limit);
}

const like = (q: string) => `%${q.replace(/[%_]/g, "\\$&")}%`;

/** Filters shared by the leads page and the search_leads tool. */
export function leadFilters(f: {
  q?: string;
  owner?: string; // "me", "none" or a user id
  product?: string;
  stage?: string;
  openOnly?: boolean;
  meId: string;
}): SQL[] {
  const out: SQL[] = [];
  if (f.q) {
    const p = like(f.q);
    out.push(
      or(
        ilike(leads.company, p),
        ilike(leads.contactName, p),
        ilike(leads.email, p),
        ilike(leads.notes, p),
      )!,
    );
  }
  if (f.owner === "me") out.push(eq(leads.ownerId, f.meId));
  else if (f.owner === "none") out.push(isNull(leads.ownerId));
  else if (f.owner) out.push(eq(leads.ownerId, f.owner));
  if (f.product) out.push(sql`${f.product} = any(${leads.products})`);
  if (f.stage) out.push(eq(leads.stage, f.stage as LeadStage));
  else if (f.openOnly) out.push(inArray(leads.stage, OPEN_LEAD_STAGES as unknown as LeadStage[]));
  return out;
}

const productValues = new Set<string>(LEAD_PRODUCTS.map((p) => p.value));
const sourceValues = new Set<string>(LEAD_SOURCES.map((s) => s.value));
export const cleanProducts = (v: string[]) => [...new Set(v.filter((p) => productValues.has(p)))];
export const cleanSource = (v: string | undefined) => (v && sourceValues.has(v) ? v : "");

export type LeadInput = {
  company: string;
  contactName?: string;
  email?: string;
  phone?: string;
  website?: string;
  stage?: LeadStage;
  products?: string[];
  source?: string;
  ownerId?: string | null;
  nextFollowUp?: string | null;
  notes?: string;
};

export async function insertLead(input: LeadInput, createdById: string): Promise<Lead> {
  const stage = input.stage ?? "new";
  const [pos] = await db.select({ p: max(leads.position) }).from(leads).where(eq(leads.stage, stage));
  const [lead] = await db
    .insert(leads)
    .values({
      company: input.company,
      contactName: input.contactName ?? "",
      email: input.email ?? "",
      phone: input.phone ?? "",
      website: input.website ?? "",
      stage,
      products: cleanProducts(input.products ?? []),
      source: cleanSource(input.source),
      ownerId: input.ownerId ?? null,
      nextFollowUp: input.nextFollowUp ?? null,
      notes: input.notes ?? "",
      position: (pos?.p ?? 0) + 1000,
      closedAt: stage === "won" || stage === "lost" ? new Date() : null,
      createdById,
    })
    .returning();
  return lead;
}

export type LeadPatch = Partial<Omit<LeadInput, "company">> & { company?: string; position?: number };

/** Updates a lead and records stage changes in its activity log. */
export async function patchLead(id: string, patch: LeadPatch, actorId: string): Promise<Lead | undefined> {
  const [before] = await db.select().from(leads).where(eq(leads.id, id));
  if (!before) return undefined;
  const set: Partial<typeof leads.$inferInsert> = { ...patch };
  if (patch.products) set.products = cleanProducts(patch.products);
  if (patch.source !== undefined) set.source = cleanSource(patch.source);
  const stageChanged = patch.stage && patch.stage !== before.stage;
  if (stageChanged) set.closedAt = patch.stage === "won" || patch.stage === "lost" ? new Date() : null;
  const [after] = await db.update(leads).set(set).where(eq(leads.id, id)).returning();
  if (stageChanged) {
    await db.insert(leadActivities).values({
      leadId: id,
      authorId: actorId,
      kind: "stage",
      body: `Moved from ${stageLabel(before.stage)} to ${stageLabel(patch.stage!)}`,
    });
  }
  return after;
}

export async function logActivity(leadId: string, authorId: string, kind: string, body: string) {
  await db.insert(leadActivities).values({ leadId, authorId, kind, body: body.slice(0, 10000) });
  // touching the lead keeps "recently active" sorting honest
  await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, leadId));
}
