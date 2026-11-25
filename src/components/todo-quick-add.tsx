"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { addTodo } from "@/actions/todos";
import { parseQuickAdd } from "@/lib/todo-parse";
import { recurrenceLabel } from "@/lib/recurrence";
import { formatTime, relativeDay, todoPriority } from "@/lib/todo-meta";

/**
 * Todoist-style quick add. Typing "Call Sam tomorrow 5pm p1 #Work @phone every week"
 * shows chips for what was understood; the server parses the same way on save.
 */
export function TodoQuickAdd({
  today,
  listNames,
  listId,
  parentId,
  defaultDate,
  placeholder = "Add a to-do… try “Pay rent every month p1” or “Call Sam tomorrow 5pm #Work”",
  compact,
}: {
  today: string;
  listNames: string[];
  listId?: string;
  parentId?: string;
  defaultDate?: string;
  placeholder?: string;
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState(addTodo, undefined);
  const [text, setText] = useState("");
  const ref = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      setText(""); // eslint-disable-line react-hooks/set-state-in-effect -- clears the preview after a successful save
      input.current?.focus();
    }
  }, [state]);

  const p = useMemo(() => parseQuickAdd(text, today, listNames), [text, today, listNames]);
  const chips: string[] = [];
  const date = p.dueDate ?? (defaultDate && !parentId ? defaultDate : null);
  if (date) chips.push(`📅 ${relativeDay(date, today)}${p.dueTime ? ` ${formatTime(p.dueTime)}` : ""}`);
  if (p.recurrence) chips.push(`↻ ${recurrenceLabel(p.recurrence)}`);
  if (p.priority < 4) chips.push(todoPriority(p.priority).label);
  if (p.listName) chips.push(`# ${p.listName}`);
  for (const l of p.labels) chips.push(`@${l}`);

  return (
    <form ref={ref} action={action} className={compact ? "mt-1" : "card mb-4 p-2"}>
      {listId && <input type="hidden" name="listId" value={listId} />}
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      {defaultDate && <input type="hidden" name="defaultDate" value={defaultDate} />}
      <div className="flex items-center gap-2">
        <span className={`text-lg leading-none text-red-600 ${compact ? "pl-1" : "pl-2"}`} aria-hidden>
          +
        </span>
        <input
          ref={input}
          name="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={`min-w-0 flex-1 bg-transparent outline-none ${compact ? "py-1 text-sm" : "py-1.5 text-sm"}`}
          placeholder={placeholder}
          aria-label={parentId ? "Add a sub-item" : "Add a to-do"}
          autoComplete="off"
          maxLength={500}
        />
        {text.trim() && (
          <button className="btn py-1" disabled={pending}>
            Add
          </button>
        )}
      </div>
      {text.trim() && chips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5 pl-7">
          {chips.map((c) => (
            <span key={c} className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-700">
              {c}
            </span>
          ))}
          {p.title && <span className="px-1 text-xs text-stone-400">→ “{p.title}”</span>}
        </div>
      )}
      {state?.error && <p className="mt-1 pl-7 text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
