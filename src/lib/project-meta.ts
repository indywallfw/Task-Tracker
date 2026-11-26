// Shared between server and client code.

export const PROJECT_STATUSES = [
  { value: "planned", label: "Planned", dot: "bg-sky-400", pending: true },
  { value: "active", label: "In progress", dot: "bg-amber-400", pending: true },
  { value: "on_hold", label: "On hold", dot: "bg-stone-400", pending: true },
  { value: "done", label: "Done", dot: "bg-emerald-500", pending: false },
] as const;

export const projectStatus = (v: string) => PROJECT_STATUSES.find((s) => s.value === v) ?? PROJECT_STATUSES[1];

export const SPRINT_STATUSES = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
] as const;
