// Display helpers for to-dos, lists and events (safe to use on server and client).

/** Full class names so Tailwind keeps them. */
export const COLORS = {
  stone: { dot: "bg-stone-400", soft: "bg-stone-100 text-stone-800 border-stone-300" },
  red: { dot: "bg-red-500", soft: "bg-red-50 text-red-800 border-red-300" },
  orange: { dot: "bg-orange-500", soft: "bg-orange-50 text-orange-800 border-orange-300" },
  amber: { dot: "bg-amber-500", soft: "bg-amber-50 text-amber-800 border-amber-300" },
  green: { dot: "bg-green-600", soft: "bg-green-50 text-green-800 border-green-300" },
  teal: { dot: "bg-teal-600", soft: "bg-teal-50 text-teal-800 border-teal-300" },
  blue: { dot: "bg-blue-600", soft: "bg-blue-50 text-blue-800 border-blue-300" },
  violet: { dot: "bg-violet-600", soft: "bg-violet-50 text-violet-800 border-violet-300" },
  pink: { dot: "bg-pink-500", soft: "bg-pink-50 text-pink-800 border-pink-300" },
} as const;

export type ColorKey = keyof typeof COLORS;
export const COLOR_KEYS = Object.keys(COLORS) as ColorKey[];
export const color = (k: string) => COLORS[(k in COLORS ? k : "stone") as ColorKey];

/** p1–p4, like Todoist: the checkbox ring takes the priority colour. */
export const TODO_PRIORITIES = [
  { value: 1, label: "Priority 1", ring: "border-red-600 bg-red-50", text: "text-red-700" },
  { value: 2, label: "Priority 2", ring: "border-orange-500 bg-orange-50", text: "text-orange-700" },
  { value: 3, label: "Priority 3", ring: "border-blue-600 bg-blue-50", text: "text-blue-700" },
  { value: 4, label: "Priority 4", ring: "border-stone-400", text: "text-stone-500" },
] as const;

export const todoPriority = (p: number) => TODO_PRIORITIES.find((x) => x.value === p) ?? TODO_PRIORITIES[3];

/** "17:00" → "5:00 PM" in the viewer's style. */
export function formatTime(hhmm: string | null) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "Today", "Tomorrow", "Yesterday", weekday within a week, else "Dec 5" (with year if not this year). */
export function relativeDay(iso: string, today: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const date = new Date(y, m - 1, d);
  if (diff > 1 && diff < 7) return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(y !== ty ? { year: "numeric" } : {}),
  });
}
