"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray, isNull, max } from "drizzle-orm";
import { z } from "zod";
import { db, docs } from "@/db";
import { requireUser } from "@/lib/auth";

export async function createDoc(formData: FormData) {
  const user = await requireUser();
  const parentRaw = formData.get("parentId");
  const parentId = parentRaw ? z.string().uuid().parse(parentRaw) : null;
  const [row] = await db
    .select({ p: max(docs.position) })
    .from(docs)
    .where(parentId ? eq(docs.parentId, parentId) : isNull(docs.parentId));
  const [doc] = await db
    .insert(docs)
    .values({
      parentId,
      title: "Untitled",
      position: (row?.p ?? 0) + 1000,
      createdById: user.id,
      updatedById: user.id,
    })
    .returning({ id: docs.id });
  revalidatePath("/", "layout");
  redirect(`/docs/${doc.id}`);
}

export async function saveDocContent(id: string, html: string, text: string) {
  const user = await requireUser();
  z.string().uuid().parse(id);
  await db
    .update(docs)
    .set({ content: html, contentText: text.slice(0, 200000), updatedById: user.id })
    .where(eq(docs.id, id));
}

export async function saveDocMeta(id: string, title: string, icon: string | null) {
  const user = await requireUser();
  z.string().uuid().parse(id);
  await db
    .update(docs)
    .set({ title: title.trim().slice(0, 300) || "Untitled", icon: icon?.trim() || null, updatedById: user.id })
    .where(eq(docs.id, id));
  revalidatePath("/", "layout");
}

export async function moveDoc(formData: FormData) {
  await requireUser();
  const id = z.string().uuid().parse(formData.get("id"));
  const parentRaw = formData.get("parentId");
  const parentId = parentRaw ? z.string().uuid().parse(parentRaw) : null;
  if (parentId) {
    // refuse to move a page under itself or one of its descendants
    const all = await db.select({ id: docs.id, parentId: docs.parentId }).from(docs);
    const parentOf = new Map(all.map((d) => [d.id, d.parentId]));
    let cur: string | null | undefined = parentId;
    while (cur) {
      if (cur === id) throw new Error("Can't move a page inside itself.");
      cur = parentOf.get(cur);
    }
  }
  await db.update(docs).set({ parentId }).where(eq(docs.id, id));
  revalidatePath("/", "layout");
}

export async function deleteDoc(formData: FormData) {
  await requireUser();
  const id = z.string().uuid().parse(formData.get("id"));
  // delete the page and every page nested under it
  const all = await db.select({ id: docs.id, parentId: docs.parentId }).from(docs);
  const toDelete = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of all) {
      if (d.parentId && toDelete.has(d.parentId) && !toDelete.has(d.id)) {
        toDelete.add(d.id);
        grew = true;
      }
    }
  }
  const [doc] = await db.select({ parentId: docs.parentId }).from(docs).where(eq(docs.id, id));
  await db.delete(docs).where(inArray(docs.id, [...toDelete]));
  revalidatePath("/", "layout");
  redirect(doc?.parentId ? `/docs/${doc.parentId}` : "/docs");
}
