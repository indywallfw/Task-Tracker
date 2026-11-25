// Todoist-style quick add: "Call Sam tomorrow 5pm p1 #Work @phone every week".
// Pure and dependency-free so the browser can preview what the server will save.
import { addDays, addMonths, fromISO, nextOccurrence, toISO, type Recurrence } from "./recurrence";

export type ParsedTodo = {
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  priority: number;
  listName: string | null;
  labels: string[];
  recurrence: Recurrence | null;
  /** The pieces of the input that were understood, for the preview chips. */
  matches: { kind: "date" | "time" | "priority" | "list" | "label" | "repeat"; text: string }[];
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY = "(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday)?";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*";

const weekdayIndex = (w: string) => WEEKDAYS.findIndex((d) => d.startsWith(w.slice(0, 3).toLowerCase()));

/** The next given weekday strictly after `today` (or today itself when `allowToday`). */
function nextWeekday(today: string, idx: number, allowToday = false) {
  const diff = (idx - fromISO(today).getDay() + 7) % 7;
  return addDays(today, diff === 0 && !allowToday ? 7 : diff);
}

/** "Dec 5" → the next Dec 5 on or after today. */
function upcomingMonthDay(today: string, month: number, day: number, year?: number) {
  const t = fromISO(today);
  const y = year ?? t.getFullYear();
  let d = new Date(y, month, day);
  if (d.getMonth() !== month) return null; // e.g. Feb 31
  if (!year && toISO(d) < today) d = new Date(y + 1, month, day);
  return toISO(d);
}

function to24h(h: number, m: number, ampm?: string) {
  if (ampm) {
    const pm = ampm.toLowerCase().startsWith("p");
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * @param today "YYYY-MM-DD" in the user's time zone
 * @param listNames the user's list names; "#name" only counts when it matches one
 */
export function parseQuickAdd(input: string, today: string, listNames: string[] = []): ParsedTodo {
  let text = ` ${input} `;
  const out: ParsedTodo = {
    title: "",
    dueDate: null,
    dueTime: null,
    priority: 4,
    listName: null,
    labels: [],
    recurrence: null,
    matches: [],
  };

  // Each rule removes what it matched from `text`. Boundaries are spaces so words
  // inside other words ("monday" in "mondays", "p1" in "ap1") are left alone.
  const take = (re: RegExp, kind: ParsedTodo["matches"][number]["kind"], fn: (m: RegExpMatchArray) => boolean) => {
    const m = text.match(re);
    if (!m || !fn(m)) return false;
    out.matches.push({ kind, text: m[0].trim() });
    text = text.replace(m[0], " ");
    return true;
  };
  const W = (s: string) => new RegExp(`\\s(${s})(?=[\\s,.!?]|$)`, "i");

  // ---- repeat ----
  void (take(W(`every\\s+${WEEKDAY}`), "repeat", (m) => {
    out.recurrence = "weekly";
    out.dueDate = nextWeekday(today, weekdayIndex(m[2]), true);
    return true;
  }) ||
    take(W("every\\s+(?:day|morning|evening|night)|daily"), "repeat", () => ((out.recurrence = "daily"), true)) ||
    take(W("every\\s+(?:weekday|workday)|weekdays"), "repeat", () => ((out.recurrence = "weekdays"), true)) ||
    take(W("every\\s+(?:other|2)\\s+weeks?|biweekly|fortnightly"), "repeat", () => ((out.recurrence = "biweekly"), true)) ||
    take(W("every\\s+week|weekly"), "repeat", () => ((out.recurrence = "weekly"), true)) ||
    take(W("every\\s+month|monthly"), "repeat", () => ((out.recurrence = "monthly"), true)) ||
    take(W("every\\s+year|yearly|annually"), "repeat", () => ((out.recurrence = "yearly"), true)));

  // ---- date ----
  if (!out.dueDate) {
    void (take(W("today|tod|tonight"), "date", () => ((out.dueDate = today), true)) ||
      take(W("tomorrow|tmr|tmrw"), "date", () => ((out.dueDate = addDays(today, 1)), true)) ||
      take(W("yesterday"), "date", () => ((out.dueDate = addDays(today, -1)), true)) ||
      take(W("next\\s+week"), "date", () => ((out.dueDate = nextWeekday(today, 1)), true)) ||
      take(W("next\\s+month"), "date", () => ((out.dueDate = addMonths(today.slice(0, 8) + "01", 1)), true)) ||
      take(W("in\\s+(\\d{1,3})\\s+(days?|weeks?|months?)"), "date", (m) => {
        const n = Number(m[2]);
        const unit = m[3].toLowerCase();
        out.dueDate = unit.startsWith("d") ? addDays(today, n) : unit.startsWith("w") ? addDays(today, 7 * n) : addMonths(today, n);
        return true;
      }) ||
      take(W(`(?:next\\s+|this\\s+|on\\s+)?${WEEKDAY}`), "date", (m) => {
        const idx = weekdayIndex(m[2]);
        if (idx < 0) return false;
        out.dueDate = nextWeekday(today, idx);
        return true;
      }) ||
      take(W("(\\d{4})-(\\d{2})-(\\d{2})"), "date", (m) => {
        const iso = `${m[2]}-${m[3]}-${m[4]}`;
        if (toISO(fromISO(iso)) !== iso) return false;
        out.dueDate = iso;
        return true;
      }) ||
      take(W(`(?:on\\s+)?${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`), "date", (m) => {
        const d = upcomingMonthDay(today, MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()), Number(m[3]), m[4] ? Number(m[4]) : undefined);
        return d ? ((out.dueDate = d), true) : false;
      }) ||
      take(W(`(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}(?:\\s+(\\d{4}))?`), "date", (m) => {
        const d = upcomingMonthDay(today, MONTHS.indexOf(m[3].slice(0, 3).toLowerCase()), Number(m[2]), m[4] ? Number(m[4]) : undefined);
        return d ? ((out.dueDate = d), true) : false;
      }));
  }

  // ---- time ----
  void (take(W("(?:at\\s+)?(noon|midday)"), "time", () => ((out.dueTime = "12:00"), true)) ||
    take(W("(?:at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s?(am|pm|a\\.m\\.|p\\.m\\.)"), "time", (m) => {
      const t = to24h(Number(m[2]), Number(m[3] ?? 0), m[4]);
      return t ? ((out.dueTime = t), true) : false;
    }) ||
    take(W("(?:at\\s+)?([01]?\\d|2[0-3]):([0-5]\\d)"), "time", (m) => ((out.dueTime = to24h(Number(m[2]), Number(m[3]))), true)));
  if (/tonight/i.test(out.matches.find((x) => x.kind === "date")?.text ?? "") && !out.dueTime) out.dueTime = "20:00";

  // ---- priority, list, labels ----
  take(W("p([1-4])|!!([1-4])"), "priority", (m) => ((out.priority = Number(m[2] ?? m[3])), true));
  const byName = new Map(listNames.map((n) => [n.toLowerCase().replace(/\s+/g, ""), n]));
  take(/\s#([\p{L}\p{N}_-]+)(?=\s|$)/u, "list", (m) => {
    const name = byName.get(m[1].toLowerCase());
    return name ? ((out.listName = name), true) : false;
  });
  for (let i = 0; i < 10; i++) {
    if (!take(/\s@([\p{L}\p{N}_-]+)(?=\s|$)/u, "label", (m) => (out.labels.push(m[1].toLowerCase()), true))) break;
  }

  // a repeat with no date starts today (or the next weekday)
  if (out.recurrence && !out.dueDate) {
    out.dueDate = out.recurrence === "weekdays" && [0, 6].includes(fromISO(today).getDay()) ? nextOccurrence(today, "weekdays") : today;
  }
  // a time on its own means today
  if (out.dueTime && !out.dueDate) out.dueDate = today;

  out.title = text.replace(/\s+/g, " ").trim();
  return out;
}
