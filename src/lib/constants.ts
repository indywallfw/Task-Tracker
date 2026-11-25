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

export const LEAD_STAGES = [
  { value: "new", label: "New", dot: "bg-stone-300", open: true },
  { value: "contacted", label: "Contacted", dot: "bg-sky-400", open: true },
  { value: "qualified", label: "Qualified", dot: "bg-indigo-400", open: true },
  { value: "proposal", label: "Proposal sent", dot: "bg-amber-400", open: true },
  { value: "negotiation", label: "Negotiation", dot: "bg-orange-400", open: true },
  { value: "won", label: "Won", dot: "bg-emerald-500", open: false },
  { value: "lost", label: "Lost", dot: "bg-red-400", open: false },
] as const;

export const OPEN_LEAD_STAGES = LEAD_STAGES.filter((s) => s.open).map((s) => s.value);

export const LEAD_PRODUCTS = [
  { value: "firewall", label: "Indywall Firewall" },
  { value: "vapt", label: "VAPT Scanner Suite" },
] as const;

export const LEAD_SOURCES = [
  { value: "referral", label: "Referral" },
  { value: "website", label: "Website" },
  { value: "event", label: "Event" },
  { value: "outbound", label: "Outbound" },
  { value: "partner", label: "Partner" },
  { value: "other", label: "Other" },
] as const;

export const ACTIVITY_KINDS = [
  { value: "note", label: "Note" },
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
] as const;

export const stageLabel = (s: string) => LEAD_STAGES.find((x) => x.value === s)?.label ?? s;
export const stageDot = (s: string) => LEAD_STAGES.find((x) => x.value === s)?.dot ?? "bg-stone-300";
export const productLabel = (p: string) => LEAD_PRODUCTS.find((x) => x.value === p)?.label ?? p;
export const sourceLabel = (s: string) => LEAD_SOURCES.find((x) => x.value === s)?.label ?? s;

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
