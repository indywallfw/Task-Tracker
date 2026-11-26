import { cookies } from "next/headers";

export const THEME_COOKIE = "tt_theme";
export const THEMES = [
  { value: "dark", label: "Dark", hint: "The default" },
  { value: "light", label: "Light", hint: "" },
  { value: "system", label: "Match this device", hint: "Follows your phone or computer setting" },
] as const;
export type Theme = (typeof THEMES)[number]["value"];

export const isTheme = (v: unknown): v is Theme => THEMES.some((t) => t.value === v);

/** The theme chosen on this device; dark unless changed in Settings → Display. */
export async function getTheme(): Promise<Theme> {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(v) ? v : "dark";
}

export const THEME_COLORS = { dark: "#1a1817", light: "#fbfbfa" };
