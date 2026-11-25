import "server-only";
import JSZip from "jszip";
import Papa from "papaparse";
import { marked } from "marked";
import { eq } from "drizzle-orm";
import { db, docs, projects, tasks, users } from "@/db";
import type { Priority, TaskStatus } from "@/db/schema";

/**
 * Imports a Notion "Markdown & CSV" export (.zip).
 *
 * - Every .md page becomes a doc; the folder structure becomes the page tree.
 *   Child folders may be named with or without the page's Notion id
 *   ("Tasks 1a2b…/" or just "Tasks/"); both are handled.
 * - Links between exported pages are rewritten to point at the new docs.
 * - Each database (.csv) either becomes a project of tasks (when it has a
 *   Status-like column and `databasesAsTasks` is on) or a doc with a table,
 *   with the row pages nested under it. Task databases keep their other
 *   columns as project fields, shown in the table view.
 * - Images and attachments are not copied (their alt text is kept).
 */

export type ImportSummary = {
  docs: number;
  projects: number;
  tasks: number;
  skippedFiles: number;
  warnings: string[];
};

type FileEntry = { path: string; data: Uint8Array };

const ID_SUFFIX = /\s+[0-9a-f]{32}$/i;
const cleanName = (segment: string) => segment.replace(/\.(md|csv)$/i, "").replace(ID_SUFFIX, "").trim();
const stripExt = (p: string) => p.replace(/\.(md|csv)$/i, "");
const dirOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

async function readZip(data: ArrayBuffer | Uint8Array, prefix = "", depth = 0): Promise<FileEntry[]> {
  const zip = await JSZip.loadAsync(data);
  const out: FileEntry[] = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || entry.name.startsWith("__MACOSX/")) continue;
    const bytes = await entry.async("uint8array");
    // big Notion exports are a zip of zips
    if (entry.name.toLowerCase().endsWith(".zip") && depth < 2) {
      out.push(...(await readZip(bytes, prefix, depth + 1)));
    } else {
      out.push({ path: prefix + entry.name, data: bytes });
    }
  }
  return out;
}

function htmlToText(html: string) {
  return html
    .replace(/<(br|\/p|\/h\d|\/li|\/tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function mapStatus(v: string | undefined): TaskStatus {
  const s = (v ?? "").toLowerCase().trim();
  if (/^(not started|to ?do|ready|open|new|blocked)/.test(s)) return "todo";
  if (/(done|complete|closed|shipped|finished)/.test(s)) return "done";
  if (/review|qa|testing|gate check|verify/.test(s)) return "in_review";
  if (/progress|doing|started|active|wip/.test(s)) return "in_progress";
  if (/backlog|later|someday|idea/.test(s)) return "backlog";
  return "todo";
}

function mapPriority(v: string | undefined): Priority {
  const s = (v ?? "").toLowerCase();
  if (/urgent|critical|p0/.test(s)) return "urgent";
  if (/high|p1/.test(s)) return "high";
  if (/med|normal|p2/.test(s)) return "medium";
  if (/low|p3|p4/.test(s)) return "low";
  return "none";
}

function parseDate(v: string | undefined): string | null {
  if (!v) return null;
  // Notion date ranges look like "November 24, 2026 → November 30, 2026"; use the end
  const part = v.split("→").pop()!.trim().replace(/\s*\(.*\)$/, "");
  const iso = part.match(/^\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const d = new Date(part.replace(/\s+\d{1,2}:\d{2}.*$/, ""));
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function findCol(headers: string[], patterns: RegExp[]) {
  for (const p of patterns) {
    const h = headers.find((x) => p.test(x.trim()));
    if (h) return h;
  }
  return undefined;
}

/** Splits a Notion page .md into title, property lines (db rows) and body markdown. */
function splitMarkdown(md: string) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let title: string | undefined;
  if (lines[0]?.startsWith("# ")) {
    title = lines.shift()!.slice(2).trim();
  }
  while (lines[0]?.trim() === "") lines.shift();
  return { title, body: lines.join("\n") };
}

async function uniqueProjectKey(name: string) {
  const base =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 4) || "IMP";
  const key0 = /^[A-Z]/.test(base) ? base.padEnd(2, "X") : `P${base}`.slice(0, 4);
  for (let i = 0; i < 100; i++) {
    const key = i === 0 ? key0 : `${key0.slice(0, 4)}${i}`;
    const taken = await db.select({ id: projects.id }).from(projects).where(eq(projects.key, key));
    if (!taken.length) return key;
  }
  return `IMP${Date.now() % 1000}`;
}

export async function importNotionExport(
  zipData: ArrayBuffer,
  opts: { userId: string; databasesAsTasks: boolean; parentDocId?: string | null },
): Promise<ImportSummary> {
  const summary: ImportSummary = { docs: 0, projects: 0, tasks: 0, skippedFiles: 0, warnings: [] };
  const files = await readZip(zipData);
  const mdFiles = files.filter((f) => f.path.toLowerCase().endsWith(".md"));
  // Notion writes "<db>.csv" (the current view, possibly filtered) and "<db>_all.csv"
  // (every row). Prefer _all, and treat it as if it had the plain name.
  const allCsv = new Set(
    files.filter((f) => /_all\.csv$/i.test(f.path)).map((f) => f.path.replace(/_all\.csv$/i, ".csv").toLowerCase()),
  );
  const csvFiles = files
    .filter((f) => f.path.toLowerCase().endsWith(".csv") && !allCsv.has(f.path.toLowerCase()))
    .map((f) => ({ ...f, path: f.path.replace(/_all\.csv$/i, ".csv") }));
  summary.skippedFiles = files.length - mdFiles.length - files.filter((f) => f.path.toLowerCase().endsWith(".csv")).length;
  const decoder = new TextDecoder("utf-8");

  const people = await db.select({ id: users.id, name: users.name, email: users.email }).from(users);
  const findPerson = (v: string | undefined) => {
    if (!v) return null;
    const first = v.split(",")[0].trim().toLowerCase();
    return people.find((p) => p.name.toLowerCase() === first || p.email.toLowerCase() === first)?.id ?? null;
  };

  // ---- databases first, so their folders can be claimed ----
  const dbFolders = new Map<string, { kind: "tasks" } | { kind: "doc"; docPath: string }>();
  type Csv = { file: FileEntry; rows: Record<string, string>[]; headers: string[] };
  const csvs: Csv[] = csvFiles.map((file) => {
    const parsed = Papa.parse<Record<string, string>>(decoder.decode(file.data).replace(/^﻿/, ""), {
      header: true,
      skipEmptyLines: true,
    });
    return { file, rows: parsed.data, headers: parsed.meta.fields ?? [] };
  });

  // Every page/database gets a doc, keyed by its path without extension.
  // Folder "X abc/" holds the children of page "X abc.md".
  type PageInfo = { key: string; parentKey: string | null; title: string; body: string };
  const pages = new Map<string, PageInfo>();
  type RowPage = { key: string; body: string; props: Record<string, string> };
  const rowPagesByFolder = new Map<string, Map<string, RowPage>>(); // database key -> title -> row page

  for (const f of mdFiles) {
    const key = stripExt(f.path);
    const { title, body } = splitMarkdown(decoder.decode(f.data));
    const segs = key.split("/");
    pages.set(key, {
      key,
      parentKey: segs.length > 1 ? dirOf(key) : null,
      title: title || cleanName(segs[segs.length - 1]),
      body,
    });
  }

  for (const c of csvs) {
    const key = stripExt(c.file.path);
    const statusCol = findCol(c.headers, [/^status$/i, /status/i, /^stage$/i, /^state$/i]);
    if (opts.databasesAsTasks && statusCol) {
      dbFolders.set(key, { kind: "tasks" });
    } else {
      dbFolders.set(key, { kind: "doc", docPath: key });
      if (!pages.has(key)) {
        const segs = key.split("/");
        pages.set(key, {
          key,
          parentKey: segs.length > 1 ? dirOf(key) : null,
          title: cleanName(segs[segs.length - 1]),
          body: "",
        });
      }
    }
  }

  // Newer exports name a page's child folder without the id ("Tasks/" next to
  // "Tasks 1a2b….md"), so map each id-less folder back to its page or database.
  const folderOwner = new Map<string, string | null>(); // folder -> owning key (null = ambiguous)
  for (const key of new Set([...pages.keys(), ...dbFolders.keys()])) {
    const segs = key.split("/");
    const bare = [...segs.slice(0, -1), cleanName(segs[segs.length - 1])].join("/");
    if (bare === key) continue;
    const prev = folderOwner.get(bare);
    folderOwner.set(bare, prev === undefined || prev === key ? key : null);
  }
  const ownerOf = (folder: string) => {
    if (pages.has(folder) || dbFolders.has(folder)) return folder;
    return folderOwner.get(folder) ?? folder;
  };
  for (const p of pages.values()) if (p.parentKey) p.parentKey = ownerOf(p.parentKey);

  // Row pages of a task database become task descriptions, not docs.
  const csvByKey = new Map(csvs.map((c) => [stripExt(c.file.path), c]));
  for (const [dbKey, info] of dbFolders) {
    if (info.kind !== "tasks") continue;
    const headers = new Set(csvByKey.get(dbKey)!.headers.map((x) => x.trim().toLowerCase()));
    const byTitle = new Map<string, RowPage>();
    for (const [key, p] of pages) {
      if (p.parentKey !== dbKey) continue;
      // the "Property: value" lines Notion puts at the top of row pages (already in the CSV)
      const lines = p.body.split("\n");
      const props: Record<string, string> = {};
      while (lines.length) {
        const m = lines[0].match(/^([^:\n]{1,60}):\s(.*)$/);
        if (m && headers.has(m[1].trim().toLowerCase())) props[m[1].trim().toLowerCase()] = m[2].trim();
        else if (lines[0].trim() !== "") break;
        lines.shift();
      }
      if (!byTitle.has(p.title.toLowerCase())) byTitle.set(p.title.toLowerCase(), { key, body: lines.join("\n"), props });
      pages.delete(key);
    }
    rowPagesByFolder.set(dbKey, byTitle);
    // the database's own page only holds a link to the CSV and the view settings
    pages.delete(dbKey);
  }

  // ---- create doc rows (ids first, content after, so links can be rewritten) ----
  const idByKey = new Map<string, string>();
  const keys = [...pages.keys()].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  let pos = 1000;
  for (const key of keys) {
    const p = pages.get(key)!;
    // walk up until we find an ancestor that is an imported page
    let parentKey = p.parentKey;
    while (parentKey && !idByKey.has(parentKey)) parentKey = parentKey.includes("/") ? dirOf(parentKey) : null;
    const [row] = await db
      .insert(docs)
      .values({
        title: p.title.slice(0, 300) || "Untitled",
        parentId: parentKey ? idByKey.get(parentKey)! : (opts.parentDocId ?? null),
        position: (pos += 1000),
        createdById: opts.userId,
        updatedById: opts.userId,
      })
      .returning({ id: docs.id });
    idByKey.set(key, row.id);
    summary.docs++;
  }

  const renderer = new marked.Renderer();
  const rewrite = (fromKey: string) => (href: string) => {
    if (/^[a-z]+:/i.test(href) || href.startsWith("#")) return href;
    let target: string;
    try {
      target = decodeURIComponent(href.split("#")[0]);
    } catch {
      return href;
    }
    const base = dirOf(fromKey);
    const parts = (base ? base + "/" + target : target).split("/");
    const stack: string[] = [];
    for (const s of parts) {
      if (s === "..") stack.pop();
      else if (s !== "." && s !== "") stack.push(s);
    }
    const id = idByKey.get(stripExt(stack.join("/")));
    return id ? `/docs/${id}` : href;
  };

  const toHtml = (md: string, fromKey: string) => {
    const fix = rewrite(fromKey);
    renderer.link = ({ href, tokens }) => {
      const text = renderer.parser.parseInline(tokens);
      return `<a href="${escapeHtml(fix(href))}">${text}</a>`;
    };
    renderer.image = ({ href, text }) =>
      /^https?:/i.test(href) ? `<a href="${escapeHtml(href)}">${escapeHtml(text || "image")}</a>` : escapeHtml(text ? `[image: ${text}]` : "");
    return marked.parse(md, { renderer, async: false, gfm: true }) as string;
  };

  for (const key of keys) {
    const p = pages.get(key)!;
    let html = p.body ? toHtml(p.body, key) : "";
    const dbInfo = dbFolders.get(key);
    if (dbInfo?.kind === "doc") {
      const csv = csvs.find((c) => stripExt(c.file.path) === key)!;
      html += csvToHtmlTable(csv.headers, csv.rows);
    }
    await db
      .update(docs)
      .set({ content: html, contentText: htmlToText(html).slice(0, 200000) })
      .where(eq(docs.id, idByKey.get(key)!));
  }

  // ---- task databases -> projects ----
  for (const c of csvs) {
    const folder = stripExt(c.file.path);
    if (dbFolders.get(folder)?.kind !== "tasks") continue;
    const name = cleanName(folder.split("/").pop()!);
    const h = c.headers;
    const titleCol = findCol(h, [/^name$/i, /^title$/i, /^task$/i, /^task name$/i]) ?? h[0];
    const statusCol = findCol(h, [/^status$/i, /status/i, /^stage$/i, /^state$/i]);
    const assigneeCol = findCol(h, [/^assign/i, /^owner/i, /^person/i, /^responsible/i]);
    const dueCol = findCol(h, [/^due/i, /deadline/i, /^date$/i]);
    const prioCol = findCol(h, [/priority/i]);
    const rows = c.rows.filter((r) => (r[titleCol] ?? "").trim());
    const rowPages = rowPagesByFolder.get(folder) ?? new Map<string, RowPage>();

    // Notion's unique ID column ("Task ID" = 133, shown as IW-133) becomes the task number
    const idCol = findCol(h, [/^task id$/i, /^id$/i, /\bid$/i]);
    const ids = idCol ? rows.map((r) => Number((r[idCol] ?? "").trim())) : [];
    const useIds = !!idCol && ids.every((n) => Number.isInteger(n) && n > 0) && new Set(ids).size === ids.length;
    let prefix: string | undefined;
    if (useIds) {
      for (const rp of rowPages.values()) {
        const m = rp.props[idCol!.trim().toLowerCase()]?.match(/^([A-Z][A-Z0-9]{0,5})-\d+$/);
        if (m) {
          prefix = m[1];
          break;
        }
      }
    }
    const prefixFree =
      !!prefix && !(await db.select({ id: projects.id }).from(projects).where(eq(projects.key, prefix))).length;
    const key = prefixFree ? prefix! : await uniqueProjectKey(name);

    // the original status is worth keeping when it has no direct equivalent here
    const keepStatus = (v: string) => /blocked|ready|gate/i.test(v);
    const keptStatus = !!statusCol && rows.some((r) => keepStatus(r[statusCol] ?? ""));
    const mapped = new Set([titleCol, statusCol, assigneeCol, dueCol, prioCol, useIds ? idCol : undefined]);
    const fields = h.filter((k) => !mapped.has(k) && k.trim());
    if (keptStatus) fields.push("Notion status");

    const [proj] = await db
      .insert(projects)
      .values({
        name: name.slice(0, 80),
        key,
        description: "Imported from Notion",
        fields,
        createdById: opts.userId,
      })
      .returning({ id: projects.id });
    summary.projects++;

    let n = 0;
    for (const [i, r] of rows.entries()) {
      const title = r[titleCol].trim();
      const rowPage = rowPages.get(title.toLowerCase());
      const rowBody = rowPage?.body.trim() ?? "";
      const properties: Record<string, string> = {};
      for (const f of fields) {
        const v = f === "Notion status" ? (keepStatus(r[statusCol!] ?? "") ? r[statusCol!] : "") : r[f];
        if ((v ?? "").trim()) properties[f] = v.trim();
      }
      const assigneeName = assigneeCol ? r[assigneeCol] : undefined;
      const assigneeId = findPerson(assigneeName);
      if (assigneeName && !assigneeId && !summary.warnings.some((w) => w.includes(`"${assigneeName}"`))) {
        summary.warnings.push(`No user matches assignee "${assigneeName}" — those tasks were left unassigned.`);
      }
      const status = mapStatus(statusCol ? r[statusCol] : undefined);
      const number = useIds ? ids[i] : i + 1;
      n = Math.max(n, number);
      await db.insert(tasks).values({
        projectId: proj.id,
        number,
        title: title.slice(0, 300),
        description: rowBody ? toHtml(rowBody, rowPage!.key) : "",
        properties,
        status,
        priority: mapPriority(prioCol ? r[prioCol] : undefined),
        assigneeId,
        dueDate: parseDate(dueCol ? r[dueCol] : undefined),
        creatorId: opts.userId,
        position: (i + 1) * 1000,
        completedAt: status === "done" ? new Date() : null,
      });
      summary.tasks++;
    }
    await db.update(projects).set({ taskCounter: n }).where(eq(projects.id, proj.id));
  }

  if (summary.skippedFiles > 0) {
    summary.warnings.push(
      `${summary.skippedFiles} attachment/image file(s) were not copied. Re-upload important files manually.`,
    );
  }
  return summary;
}

function csvToHtmlTable(headers: string[], rows: Record<string, string>[]) {
  if (!headers.length) return "";
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${headers.map((h) => `<td>${escapeHtml(r[h] ?? "")}</td>`).join("")}</tr>`)
    .join("");
  return `<table><tbody><tr>${head}</tr>${body}</tbody></table>`;
}
