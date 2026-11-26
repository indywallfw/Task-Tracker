"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { isTheme, THEME_COOKIE } from "@/lib/theme";

/** Saves the display theme for this device (a cookie, so each phone or computer can differ). */
export async function setTheme(formData: FormData) {
  await requireUser();
  const theme = formData.get("theme");
  if (!isTheme(theme)) return;
  (await cookies()).set(THEME_COOKIE, theme, {
    path: "/",
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: 60 * 60 * 24 * 400,
  });
  revalidatePath("/", "layout");
}
