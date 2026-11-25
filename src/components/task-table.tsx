import Link from "next/link";
import type { TaskCard } from "@/lib/tasks-query";
import { PRIORITIES, STATUSES } from "@/lib/constants";
import { Avatar } from "./avatar";
import { DueDate, PriorityText, StatusPill } from "./task-bits";

/** Sort keys: built-in columns, or "f:<field>" for a project field. A leading "-" sorts descending. */
export type Sort = { key: string; desc: boolean };

const BUILT_IN = ["number", "title", "status", "priority", "due", "assignee"];

export function parseSort(raw: unknown, fields: string[]): Sort {
  const s = typeof raw === "string" ? raw : "";
  const desc = s.startsWith("-");
  const key = desc ? s.slice(1) : s;
  if (BUILT_IN.includes(key) || (key.startsWith("f:") && fields.includes(key.slice(2)))) return { key, desc };
  // same default as the Notion view: most urgent first
  return { key: "priority", desc: true };
}

const statusRank = new Map(STATUSES.map((s, i) => [s.value as string, i]));
const priorityRank = new Map(PRIORITIES.map((p, i) => [p.value as string, i]));
const text = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compare(a: TaskCard, b: TaskCard, key: string): number {
  switch (key) {
    case "number":
      return a.number - b.number;
    case "title":
      return text.compare(a.title, b.title);
    case "status":
      return (statusRank.get(a.status) ?? 0) - (statusRank.get(b.status) ?? 0);
    case "priority":
      return (priorityRank.get(a.priority) ?? 0) - (priorityRank.get(b.priority) ?? 0);
    case "due":
      return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
    case "assignee":
      return text.compare(a.assigneeName ?? "￿", b.assigneeName ?? "￿");
    default: {
      const f = key.slice(2);
      const va = a.properties[f] ?? "";
      const vb = b.properties[f] ?? "";
      // empty values always go last
      if (!va || !vb) return (va ? 0 : 1) - (vb ? 0 : 1);
      return text.compare(va, vb);
    }
  }
}

function Th({ k, label, sort, sortHref, className = "" }: {
  k: string;
  label: string;
  sort: Sort;
  sortHref: (sort: string) => string;
  className?: string;
}) {
  const active = sort.key === k;
  const next = active && !sort.desc ? `-${k}` : k;
  return (
    <th className={`whitespace-nowrap px-3 py-2 text-left font-medium ${className}`}>
      <Link href={sortHref(next)} className={`hover:text-stone-900 ${active ? "text-stone-900" : ""}`}>
        {label}
        {active && <span className="ml-1 text-stone-400">{sort.desc ? "↓" : "↑"}</span>}
      </Link>
    </th>
  );
}

/** Notion-style table: one row per task, one column per property, sortable headers. */
export function TaskTable({
  tasks,
  fields,
  sort,
  sortHref,
}: {
  tasks: TaskCard[];
  fields: string[];
  sort: Sort;
  sortHref: (sort: string) => string;
}) {
  if (tasks.length === 0) return <p className="py-4 text-sm text-stone-500">No tasks here.</p>;
  const sorted = [...tasks].sort((a, b) => {
    const c = compare(a, b, sort.key);
    // keep empty field values last in both directions
    const emptyLast = sort.key.startsWith("f:") && (!a.properties[sort.key.slice(2)] || !b.properties[sort.key.slice(2)]);
    return (sort.desc && !emptyLast ? -c : c) || a.number - b.number;
  });

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-500">
          <tr>
            <Th sort={sort} sortHref={sortHref} k="number" label="ID" className="w-20" />
            <Th sort={sort} sortHref={sortHref} k="title" label="Task" className="min-w-72" />
            <Th sort={sort} sortHref={sortHref} k="status" label="Status" />
            <Th sort={sort} sortHref={sortHref} k="priority" label="Priority" />
            <Th sort={sort} sortHref={sortHref} k="due" label="Due" />
            <Th sort={sort} sortHref={sortHref} k="assignee" label="Owner" />
            {fields.map((f) => (
              <Th key={f} sort={sort} sortHref={sortHref} k={`f:${f}`} label={f} />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {sorted.map((t) => (
            <tr key={t.id} className="align-top hover:bg-stone-50">
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-stone-400">
                {t.projectKey}-{t.number}
              </td>
              <td className="px-3 py-2">
                <Link
                  href={`/tasks/${t.id}`}
                  className={`hover:underline ${t.status === "done" ? "text-stone-400 line-through" : "font-medium"}`}
                >
                  {t.title}
                </Link>
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                <StatusPill status={t.status} />
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                <PriorityText priority={t.priority} />
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                <DueDate date={t.dueDate} done={t.status === "done"} />
              </td>
              <td className="px-3 py-2">{t.assigneeName && <Avatar name={t.assigneeName} />}</td>
              {fields.map((f) => {
                const v = t.properties[f] ?? "";
                const long = v.length > 40;
                return (
                  <td key={f} className={`px-3 py-2 text-xs text-stone-600 ${long ? "min-w-80" : "whitespace-nowrap"}`}>
                    <span className="line-clamp-2" title={long ? v : undefined}>
                      {v}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
