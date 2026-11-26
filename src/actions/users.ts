"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, sessions, users } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import type { FormState } from "./auth";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(10, "Temporary password must be at least 10 characters"),
  role: z.enum(["admin", "member"]),
});

export async function createUser(_: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email));
  if (existing.length) return { error: "Someone already has that email." };
  await db.insert(users).values({
    name: parsed.data.name,
    email: parsed.data.email,
    role: parsed.data.role,
    passwordHash: await hashPassword(parsed.data.password),
  });
  revalidatePath("/settings/people");
  return { ok: `Added ${parsed.data.name}. Share the temporary password with them privately.` };
}

export async function updateUser(formData: FormData) {
  const me = await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const role = z.enum(["admin", "member"]).parse(formData.get("role"));
  const active = formData.get("active") === "on";
  if (id === me.id && (role !== "admin" || !active)) {
    throw new Error("You can't remove your own admin access or deactivate yourself.");
  }
  await db.update(users).set({ role, active }).where(eq(users.id, id));
  if (!active) await db.delete(sessions).where(eq(sessions.userId, id));
  revalidatePath("/settings/people");
}

export async function resetPassword(_: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const password = String(formData.get("password") ?? "");
  if (password.length < 10) return { error: "At least 10 characters." };
  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, id));
  await db.delete(sessions).where(eq(sessions.userId, id));
  return { ok: "Password reset. They'll need to sign in again." };
}
