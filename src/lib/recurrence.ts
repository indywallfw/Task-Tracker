// Repeat rules shared by to-dos and calendar events. Pure functions on "YYYY-MM-DD"
// strings, so they work the same on the server and in the browser.

export const RECURRENCES = [
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Every weekday" },
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Every month" },
  { value: "yearly", label: "Every year" },
] as const;

export type Recurrence = (typeof RECURRENCES)[number]["value"];

export const isRecurrence = (v: unknown): v is Recurrence => RECURRENCES.some((r) => r.value === v);
export const recurrenceLabel = (v: string | null) => RECURRENCES.find((r) => r.value === v)?.label ?? "";

const pad = (n: number) => String(n).padStart(2, "0");

export function toISO(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses "YYYY-MM-DD" as a local date at midnight. */
export function fromISO(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Same day-of-month `n` months later, clamped to the month's last day (Jan 31 → Feb 28). */
export function addMonths(iso: string, n: number, dayOfMonth?: number) {
  const d = fromISO(iso);
  const day = dayOfMonth ?? d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, last));
  return toISO(target);
}

/** The next date after `iso` for a repeat rule. */
export function nextOccurrence(iso: string, rule: Recurrence, anchorDay?: number): string {
  switch (rule) {
    case "daily":
      return addDays(iso, 1);
    case "weekdays": {
      let next = addDays(iso, 1);
      while ([0, 6].includes(fromISO(next).getDay())) next = addDays(next, 1);
      return next;
    }
    case "weekly":
      return addDays(iso, 7);
    case "biweekly":
      return addDays(iso, 14);
    case "monthly":
      return addMonths(iso, 1, anchorDay);
    case "yearly":
      return addMonths(iso, 12, anchorDay);
  }
}

/**
 * Dates a repeating item falls on within [from, to] (inclusive), starting at `start`.
 * Monthly/yearly repeats keep the original day of month (31st → last day of short months).
 */
export function occurrencesBetween(
  start: string,
  rule: Recurrence,
  from: string,
  to: string,
  until?: string | null,
): string[] {
  const out: string[] = [];
  const anchor = fromISO(start).getDate();
  const end = until && until < to ? until : to;
  let d = start;
  for (let i = 0; i < 5000 && d <= end; i++) {
    if (d >= from) out.push(d);
    d = nextOccurrence(d, rule, anchor);
  }
  return out;
}
