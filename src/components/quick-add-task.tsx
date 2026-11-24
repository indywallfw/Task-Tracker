"use client";

import { useActionState, useEffect, useRef } from "react";
import { createTask } from "@/actions/tasks";
import { STATUSES } from "@/lib/constants";

export function QuickAddTask({
  projectId,
  people,
}: {
  projectId: string;
  people: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(createTask, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      titleRef.current?.focus();
    }
  }, [state]);

  return (
    <form ref={ref} action={action} className="card mb-6 flex flex-wrap items-center gap-2 p-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input
        ref={titleRef}
        className="input min-w-64 flex-1 border-transparent py-1.5 focus:border-stone-300"
        name="title"
        placeholder="Add a task and press Enter…"
        required
      />
      <select className="input w-36 py-1.5" name="status" defaultValue="todo" aria-label="Status">
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <select className="input w-40 py-1.5" name="assigneeId" defaultValue="" aria-label="Assignee">
        <option value="">Unassigned</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <input className="input w-40 py-1.5" type="date" name="dueDate" aria-label="Due date" />
      <button className="btn py-1.5" disabled={pending}>
        Add
      </button>
      {state?.error && <p className="w-full px-2 text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
