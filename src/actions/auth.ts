"use server";

import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { db, users } from "@/db";
import { createSession, destroySession, requireUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";

export type FormState = { error?: string; ok?: string } | undefined;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter your email and password." };
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email));
  const ok = user && user.active && (await verifyPassword(parsed.data.password, user.passwordHash));
  if (!ok) return { error: "Wrong email or password." };
  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

const setupSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(10, "Password must be at least 10 characters"),
});

/** Creates the first admin. Only works while there are no users at all. */
export async function setupAdmin(_: FormState, formData: FormData): Promise<FormState> {
  const [{ n }] = await db.select({ n: count() }).from(users);
  if (n > 0) return { error: "Setup is already complete. Sign in instead." };
  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const [user] = await db
    .insert(users)
    .values({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await hashPassword(parsed.data.password),
      role: "admin",
    })
    .returning();
  await createSession(user.id);
  redirect("/");
}

const passwordSchema = z.object({
  current: z.string().min(1),
  next: z.string().min(10, "New password must be at least 10 characters"),
});

export async function changePassword(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const [user] = await db.select().from(users).where(eq(users.id, me.id));
  if (!(await verifyPassword(parsed.data.current, user.passwordHash))) {
    return { error: "Current password is wrong." };
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.next) })
    .where(eq(users.id, me.id));
  return { ok: "Password changed." };
}
