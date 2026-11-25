"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, tasks } from "@/db";
import { requireUser } from "@/lib/auth";

/** Sets one of the project's extra fields (table columns) on a task. */
export async function updateTaskProperty(formData: FormData) {
  await requireUser();
  const id = z.string().uuid().parse(formData.get("id"));
  const field = z.string().trim().min(1).max(60).parse(formData.get("field"));
  const value = z.string().trim().max(10000).parse(formData.get("value") ?? "");
  const [t] = await db
    .update(tasks)
    .set({
      properties: value
        ? sql`${tasks.properties} || jsonb_build_object(${field}::text, ${value}::text)`
        : sql`${tasks.properties} - ${field}::text`,
    })
    .where(eq(tasks.id, id))
    .returning({ projectId: tasks.projectId });
  revalidatePath(`/tasks/${id}`);
  if (t) revalidatePath(`/projects/${t.projectId}`);
}
