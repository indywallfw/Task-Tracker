// Shared between server and client code.

export const STATUSES = [
  { value: "backlog", label: "Backlog", dot: "bg-stone-300" },
  { value: "todo", label: "To do", dot: "bg-sky-400" },
  { value: "in_progress", label: "In progress", dot: "bg-amber-400" },
  { value: "in_review", label: "In review", dot: "bg-violet-400" },
  { value: "done", label: "Done", dot: "bg-emerald-500" },
] as const;

export const PRIORITIES = [
  { value: "none", label: "No priority", className: "text-stone-400" },
  { value: "low", label: "Low", className: "text-stone-500" },
  { value: "medium", label: "Medium", className: "text-sky-700" },
  { value: "high", label: "High", className: "text-amber-700" },
  { value: "urgent", label: "Urgent", className: "text-red-700 font-medium" },
] as const;

export type StatusValue = (typeof STATUSES)[number]["value"];
export type PriorityValue = (typeof PRIORITIES)[number]["value"];

export const statusLabel = (s: string) => STATUSES.find((x) => x.value === s)?.label ?? s;
export const statusDot = (s: string) => STATUSES.find((x) => x.value === s)?.dot ?? "bg-stone-300";
export const priorityMeta = (p: string) => PRIORITIES.find((x) => x.value === p) ?? PRIORITIES[0];

/** "2026-11-24" in the server's local time zone, optionally offset by some days. */
export function todayISO(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function formatDate(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
