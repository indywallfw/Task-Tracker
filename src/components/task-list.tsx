import Link from "next/link";
import type { TaskCard } from "@/lib/tasks-query";
import { STATUSES } from "@/lib/constants";
import { Avatar } from "./avatar";
import { DueDate, PriorityText, StatusPill } from "./task-bits";

export function TaskList({
  tasks,
  showProject,
  empty = "No tasks here.",
}: {
  tasks: TaskCard[];
  showProject: boolean;
  empty?: string;
}) {
  if (tasks.length === 0) return <p className="py-4 text-sm text-stone-500">{empty}</p>;
  const order = new Map(STATUSES.map((s, i) => [s.value as string, i]));
  const sorted = [...tasks].sort(
    (a, b) => (order.get(a.status) ?? 0) - (order.get(b.status) ?? 0) || a.position - b.position,
  );
  return (
    <div className="card divide-y divide-stone-100">
      {sorted.map((t) => (
        <Link
          key={t.id}
          href={`/tasks/${t.id}`}
          className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-stone-50"
        >
          <span className="w-16 shrink-0 font-mono text-xs text-stone-400">
            {t.projectKey}-{t.number}
          </span>
          <span className={`min-w-0 flex-1 truncate ${t.status === "done" ? "text-stone-400 line-through" : ""}`}>
            {t.title}
          </span>
          {showProject && <span className="hidden text-xs text-stone-500 md:inline">{t.projectName}</span>}
          <span className="w-16 text-right">
            <PriorityText priority={t.priority} />
          </span>
          <span className="w-28 text-right">
            <DueDate date={t.dueDate} done={t.status === "done"} />
          </span>
          <span className="w-28">
            <StatusPill status={t.status} />
          </span>
          <span className="w-6">
            <Avatar name={t.assigneeName} />
          </span>
        </Link>
      ))}
    </div>
  );
}
