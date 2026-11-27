import "server-only";
import Papa from "papaparse";
import { and, eq, inArray, max } from "drizzle-orm";
import { db, todoLists, todos } from "@/db";
import { COLOR_KEYS, type ColorKey } from "@/lib/todo-meta";
import type { Recurrence } from "@/lib/recurrence";

/**
 * Imports TickTick tasks into a person's To-dos.
 *
 * Accepts either TickTick's backup file (Settings → Backup → Generate backup, a .csv)
 * or JSON in the shape TickTick's API returns (what the TickTick connector gives Claude).
 * Lists, colours, dates and times, all-day dates, priority, tags, notes, checklist items,
 * sub-tasks, repeats, reminders and done/not done all come across. Every item keeps its
 * TickTick id, so importing again updates what is already here instead of duplicating it.
 */

export type TickTickItem = {
  id: string;
  title: string;
  status?: number;
  sortOrder?: number;
  completedTime?: string | null;
};

export type TickTickTask = {
  id: string;
  projectId?: string;
  title: string;
  content?: string | null;
  desc?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  isAllDay?: boolean | null;
  priority?: number | null;
  reminders?: string[] | null;
  repeatFlag?: string | null;
  status?: number | null;
  completedTime?: string | null;
  tags?: string[] | null;
  items?: TickTickItem[] | null;
  parentId?: string | null;
  sortOrder?: number | null;
  kind?: string | null;
};

export type TickTickProject = { id: string; name: string; color?: string | null; sortOrder?: number | null };

export type TickTickData = { projects: TickTickProject[]; tasks: TickTickTask[] };

export type ImportSummary = {
  lists: number;
  created: number;
  updated: number;
  subtasks: number;
  completed: number;
  warnings: string[];
};

// ---------- reading the input ----------

/** Reads a TickTick backup .csv or API-shaped JSON into one shape. */
export function parseTickTick(text: string, fileName = ""): TickTickData {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (fileName.toLowerCase().endsWith(".json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return fromJson(JSON.parse(trimmed));
  }
  return fromBackupCsv(trimmed);
}

function fromJson(raw: unknown): TickTickData {
  const projects: TickTickProject[] = [];
  const tasks: TickTickTask[] = [];
  const take = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(take);
    const o = v as Record<string, unknown>;
    // { result: [...] } from the connector, { projects, tasks } from a hand-made file,
    // { project, tasks } from "project with tasks"
    if ("result" in o) take(o.result);
    if (Array.isArray(o.projects)) o.projects.forEach((p) => projects.push(p as TickTickProject));
    if (o.project && typeof o.project === "object") projects.push(o.project as TickTickProject);
    if (Array.isArray(o.tasks)) o.tasks.forEach(take);
    if (typeof o.id === "string" && typeof o.title === "string") tasks.push(o as unknown as TickTickTask);
  };
  take(raw);
  return { projects, tasks };
}

/**
 * TickTick's backup is a CSV with a few lines of preamble, then a header row with columns like
 * "Folder Name","List Name","Title","Kind","Tags","Content","Is Check list","Start Date","Due Date",
 * "Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone",
 * "Is All Day","Is Floating","Column Name","Column Order","View Mode","taskId","parentId".
 * Checklist items sit in Content, one per line, starting with ▫ (open) or ▪ (done).
 */
function fromBackupCsv(text: string): TickTickData {
  const lines = text.split(/\r?\n/);
  const headerAt = lines.findIndex((l) => /"?List Name"?/.test(l) && /"?Title"?/.test(l));
  if (headerAt < 0) throw new Error("This doesn't look like a TickTick backup (no List Name / Title columns).");
  const parsed = Papa.parse<Record<string, string>>(lines.slice(headerAt).join("\n"), { header: true, skipEmptyLines: true });
  const projects = new Map<string, TickTickProject>();
  const tasks: TickTickTask[] = [];
  parsed.data.forEach((r, i) => {
    const listName = (r["List Name"] ?? "").trim() || "Inbox";
    const projectId = listName.toLowerCase() === "inbox" ? "inbox" : `list:${listName}`;
    if (projectId !== "inbox" && !projects.has(projectId)) projects.set(projectId, { id: projectId, name: listName });
    const isChecklist = /^(y|yes|true|1)$/i.test(r["Is Check list"] ?? "") || (r["Kind"] ?? "").toUpperCase() === "CHECKLIST";
    const content = r["Content"] ?? "";
    const items: TickTickItem[] = [];
    const notes: string[] = [];
    if (isChecklist) {
      content.split(/\r?\n/).forEach((line, n) => {
        const m = line.match(/^\s*([▫▪])\s*(.*)$/);
        if (m) items.push({ id: `${r["taskId"] || i}-item-${n}`, title: m[2].trim(), status: m[1] === "▪" ? 1 : 0, sortOrder: n });
        else if (line.trim()) notes.push(line);
      });
    }
    const status = Number(r["Status"] ?? 0);
    tasks.push({
      id: (r["taskId"] ?? "").trim() || `row-${i}`,
      projectId,
      title: (r["Title"] ?? "").trim(),
      content: isChecklist ? notes.join("\n") : content,
      startDate: r["Start Date"] || null,
      dueDate: r["Due Date"] || null,
      isAllDay: /^(y|yes|true|1)$/i.test(r["Is All Day"] ?? ""),
      priority: Number(r["Priority"] ?? 0),
      reminders: (r["Reminder"] ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
      repeatFlag: r["Repeat"] || null,
      status: status === 0 ? 0 : 2,
      completedTime: r["Completed Time"] || null,
      tags: (r["Tags"] ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      items,
      parentId: (r["parentId"] ?? "").trim() || null,
      sortOrder: Number(r["Order"] ?? i),
      kind: r["Kind"] || null,
    });
  });
  return { projects: [...projects.values()], tasks };
}

// ---------- mapping TickTick values ----------

/** TickTick 5 high, 3 medium, 1 low, 0 none → p1, p2, p3, p4. */
const mapPriority = (p?: number | null) => (p === 5 ? 1 : p === 3 ? 2 : p === 1 ? 3 : 4);

const pad = (n: number) => String(n).padStart(2, "0");

/** TickTick dates look like 2026-11-14T17:15:00+0530. */
function parseInstant(s?: string | null) {
  if (!s) return null;
  const fixed = s.trim().replace(" ", "T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(fixed);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Due date (and time unless all-day) in this server's time zone. All-day dates keep their own calendar day. */
function dueParts(t: TickTickTask): { dueDate: string | null; dueTime: string | null } {
  const raw = t.dueDate || t.startDate;
  if (!raw) return { dueDate: null, dueTime: null };
  if (t.isAllDay) {
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return { dueDate: m ? m[1] : null, dueTime: null };
  }
  const d = parseInstant(raw);
  if (!d) return { dueDate: null, dueTime: null };
  return {
    dueDate: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    dueTime: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** "TRIGGER:-PT15M" → 15 (minutes before), "TRIGGER:PT0S" → 0, "TRIGGER:P0DT9H0M0S" → -540 (9:00 on the day). */
export function parseTrigger(s: string): number | null {
  const m = s.replace(/^TRIGGER:/i, "").trim().match(/^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m) return null;
  const mins = Number(m[2] ?? 0) * 10080 + Number(m[3] ?? 0) * 1440 + Number(m[4] ?? 0) * 60 + Number(m[5] ?? 0);
  return m[1] ? mins : -mins;
}

/** Maps an RRULE onto the repeats this app has; anything else is kept as a note. */
function mapRepeat(rrule?: string | null): { recurrence: Recurrence | null; note: string | null } {
  if (!rrule) return { recurrence: null, note: null };
  const r = rrule.replace(/^RRULE:/i, "").toUpperCase();
  const get = (k: string) => r.match(new RegExp(`(?:^|;)${k}=([^;]+)`))?.[1];
  const freq = get("FREQ");
  const interval = Number(get("INTERVAL") ?? 1);
  const byday = get("BYDAY");
  let recurrence: Recurrence | null = null;
  if (freq === "DAILY" && interval === 1) recurrence = "daily";
  else if (freq === "WEEKLY" && byday && byday.split(",").sort().join(",") === "FR,MO,TH,TU,WE") recurrence = "weekdays";
  else if (freq === "WEEKLY" && interval === 1 && (!byday || !byday.includes(","))) recurrence = "weekly";
  else if (freq === "WEEKLY" && interval === 2 && (!byday || !byday.includes(","))) recurrence = "biweekly";
  else if (freq === "MONTHLY" && interval === 1) recurrence = "monthly";
  else if (freq === "YEARLY" && interval === 1) recurrence = "yearly";
  return { recurrence, note: recurrence ? null : `Repeats in TickTick as: ${rrule}` };
}

/** Nearest of this app's list colours to a TickTick hex colour, by hue. */
function mapColor(hex?: string | null): ColorKey {
  const m = hex?.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return "stone";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx - mn < 0.12) return "stone";
  let h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
  h = (h * 60 + 360) % 360;
  const hues: [ColorKey, number][] = [["red", 0], ["orange", 28], ["amber", 45], ["green", 130], ["teal", 175], ["blue", 220], ["violet", 270], ["pink", 330], ["red", 360]];
  const best = hues.reduce((a, b2) => (Math.abs(b2[1] - h) < Math.abs(a[1] - h) ? b2 : a));
  return COLOR_KEYS.includes(best[0]) ? best[0] : "stone";
}

const isDone = (status?: number | null, completedTime?: string | null) => (status ?? 0) !== 0 || !!completedTime;

// ---------- writing ----------

export async function importTickTick(userId: string, data: TickTickData): Promise<ImportSummary> {
  const summary: ImportSummary = { lists: 0, created: 0, updated: 0, subtasks: 0, completed: 0, warnings: [] };

  // lists: matched by TickTick id first, then by name
  const existingLists = await db.select().from(todoLists).where(eq(todoLists.userId, userId));
  const listFor = new Map<string, string | null>();
  const [lpos] = await db.select({ p: max(todoLists.position) }).from(todoLists).where(eq(todoLists.userId, userId));
  let nextListPos = (lpos?.p ?? 0) + 1000;
  const projects = [...data.projects].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  for (const p of projects) {
    if (!p.id || p.id.startsWith("inbox") || p.name.toLowerCase() === "inbox") continue;
    const found =
      existingLists.find((l) => l.externalId === p.id) ??
      existingLists.find((l) => !l.externalId && l.name.toLowerCase() === p.name.trim().toLowerCase());
    if (found) {
      if (!found.externalId) await db.update(todoLists).set({ externalId: p.id }).where(eq(todoLists.id, found.id));
      listFor.set(p.id, found.id);
    } else {
      const [l] = await db
        .insert(todoLists)
        .values({ userId, name: p.name.trim().slice(0, 80) || "TickTick", color: mapColor(p.color), position: nextListPos, externalId: p.id })
        .returning({ id: todoLists.id });
      nextListPos += 1000;
      listFor.set(p.id, l.id);
      summary.lists++;
    }
  }
  const listIdOf = (projectId?: string) => (!projectId || projectId.startsWith("inbox") ? null : (listFor.get(projectId) ?? null));
  const unknownLists = new Set(
    data.tasks.map((t) => t.projectId).filter((p): p is string => !!p && !p.startsWith("inbox") && !listFor.has(p)),
  );
  if (unknownLists.size) summary.warnings.push(`${unknownLists.size} list(s) weren't included, so their tasks went to the Inbox.`);

  // what is already here from TickTick
  const ids = [...data.tasks.map((t) => t.id), ...data.tasks.flatMap((t) => (t.items ?? []).map((i) => `${t.id}:${i.id}`))];
  const existing = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 500) {
    const rows = await db
      .select({ id: todos.id, externalId: todos.externalId })
      .from(todos)
      .where(and(eq(todos.userId, userId), inArray(todos.externalId, ids.slice(i, i + 500))));
    rows.forEach((r) => existing.set(r.externalId!, r.id));
  }

  const [pos] = await db.select({ p: max(todos.position) }).from(todos).where(eq(todos.userId, userId));
  const base = (pos?.p ?? 0) + 1000;
  // parents first, so sub-tasks can point at them; keep TickTick's order inside each list
  const sorted = [...data.tasks].sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const idFor = new Map<string, string>();

  for (const [n, t] of sorted.entries()) {
    if (!t.title?.trim() && !(t.items?.length)) continue;
    const { dueDate, dueTime } = dueParts(t);
    const repeat = mapRepeat(t.repeatFlag);
    const notes = [t.content, t.desc, repeat.note].map((s) => (s ?? "").trim()).filter(Boolean).join("\n\n");
    const reminders = (t.reminders ?? []).map(parseTrigger).filter((m): m is number => m !== null);
    const done = isDone(t.status, t.completedTime);
    const values = {
      title: (t.title || "Untitled").trim().slice(0, 300),
      notes: notes.slice(0, 10000),
      listId: listIdOf(t.projectId),
      parentId: t.parentId ? (idFor.get(t.parentId) ?? existing.get(t.parentId) ?? null) : null,
      dueDate,
      dueTime: dueDate ? dueTime : null,
      priority: mapPriority(t.priority),
      labels: (t.tags ?? []).map((s) => s.trim()).filter(Boolean),
      recurrence: repeat.recurrence,
      reminders: dueDate ? reminders : [],
      completedAt: done ? (parseInstant(t.completedTime) ?? new Date()) : null,
    };
    const have = existing.get(t.id);
    let rowId: string;
    if (have) {
      await db.update(todos).set(values).where(eq(todos.id, have));
      rowId = have;
      summary.updated++;
    } else {
      const [row] = await db
        .insert(todos)
        .values({ ...values, userId, source: "ticktick", externalId: t.id, position: base + n * 1000 })
        .returning({ id: todos.id });
      rowId = row.id;
      summary.created++;
    }
    idFor.set(t.id, rowId);
    if (done) summary.completed++;

    // checklist items become sub-items
    for (const [k, item] of (t.items ?? []).entries()) {
      if (!item.title?.trim()) continue;
      const ext = `${t.id}:${item.id}`;
      const itemValues = {
        title: item.title.trim().slice(0, 300),
        listId: values.listId,
        parentId: rowId,
        completedAt: isDone(item.status, item.completedTime) ? (parseInstant(item.completedTime) ?? new Date()) : null,
      };
      const haveItem = existing.get(ext);
      if (haveItem) await db.update(todos).set(itemValues).where(eq(todos.id, haveItem));
      else
        await db
          .insert(todos)
          .values({ ...itemValues, userId, source: "ticktick", externalId: ext, position: (item.sortOrder ?? k) * 1000 + k })
          .returning({ id: todos.id });
      summary.subtasks++;
    }
  }
  return summary;
}
