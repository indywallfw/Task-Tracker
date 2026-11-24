import { formatDate, priorityMeta, statusDot, statusLabel, todayISO } from "@/lib/constants";

export function StatusPill({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-stone-600">
      <span className={`h-2 w-2 rounded-full ${statusDot(status)}`} />
      {statusLabel(status)}
    </span>
  );
}

export function PriorityText({ priority }: { priority: string }) {
  if (priority === "none") return null;
  const p = priorityMeta(priority);
  return <span className={`text-xs ${p.className}`}>{p.label}</span>;
}

export function DueDate({ date, done }: { date: string | null; done?: boolean }) {
  if (!date) return null;
  const overdue = !done && date < todayISO();
  return (
    <span className={`text-xs ${overdue ? "font-medium text-red-700" : "text-stone-500"}`}>
      {overdue ? "Overdue · " : ""}
      {formatDate(date)}
    </span>
  );
}
