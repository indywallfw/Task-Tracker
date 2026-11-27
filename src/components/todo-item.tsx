import Link from "next/link";
import type { Todo, TodoList } from "@/db";
import { deleteTodo, rescheduleTodo, toggleTodo, updateTodo } from "@/actions/todos";
import { RECURRENCES, recurrenceLabel } from "@/lib/recurrence";
import { REMINDER_CHOICES, TODO_PRIORITIES, color, formatTime, relativeDay, reminderLabel, todoPriority } from "@/lib/todo-meta";
import type { TodoRow } from "@/lib/todos";
import { TodoQuickAdd } from "./todo-quick-add";

function Check({ todo, small }: { todo: Todo; small?: boolean }) {
  const done = !!todo.completedAt;
  const p = todoPriority(todo.priority);
  return (
    <form action={toggleTodo} className="shrink-0">
      <input type="hidden" name="id" value={todo.id} />
      <button
        className={`group/check flex items-center justify-center rounded-full border-2 ${small ? "mt-0.5 h-4 w-4" : "mt-0.5 h-5 w-5"} ${
          done ? "border-stone-400 bg-stone-400 text-white" : p.ring
        }`}
        title={done ? "Mark as not done" : todo.recurrence ? "Done — move to the next date" : "Mark as done"}
        aria-label={done ? `Mark “${todo.title}” as not done` : `Complete “${todo.title}”`}
      >
        <span className={`text-[10px] leading-none ${done ? "" : `opacity-0 group-hover/check:opacity-100 ${p.text}`}`}>✓</span>
      </button>
    </form>
  );
}

function DueChip({ todo, today }: { todo: Todo; today: string }) {
  if (!todo.dueDate) return null;
  const overdue = !todo.completedAt && todo.dueDate < today;
  const cls = overdue ? "text-red-700" : todo.dueDate === today ? "text-green-700" : "text-violet-700";
  return (
    <span className={cls}>
      📅 {relativeDay(todo.dueDate, today)}
      {todo.dueTime ? ` ${formatTime(todo.dueTime)}` : ""}
    </span>
  );
}

export function TodoItem({
  todo,
  today,
  lists,
  showList = true,
}: {
  todo: TodoRow;
  today: string;
  lists: TodoList[];
  showList?: boolean;
}) {
  const done = !!todo.completedAt;
  const list = lists.find((l) => l.id === todo.listId);
  const subDone = todo.subtasks.filter((s) => s.completedAt).length;
  const firstNote = todo.notes.split("\n").find((l) => l.trim());

  return (
    <li className="border-b border-stone-100 py-2">
      <div className="flex items-start gap-3">
        <Check todo={todo} />
        <details className="group min-w-0 flex-1">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <div className={`text-sm ${done ? "text-stone-400 line-through" : "text-stone-900"}`}>{todo.title}</div>
            {firstNote && <div className="truncate text-xs text-stone-500">{firstNote}</div>}
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-500">
              <DueChip todo={todo} today={today} />
              {todo.dueDate && todo.reminders.length > 0 && (
                <span title={todo.reminders.map(reminderLabel).join(", ")}>⏰ {reminderLabel(todo.reminders[0])}{todo.reminders.length > 1 ? ` +${todo.reminders.length - 1}` : ""}</span>
              )}
              {todo.taskId && (
                <Link href={`/tasks/${todo.taskId}`} className="text-sky-700 hover:underline">
                  ↗ Open task
                </Link>
              )}
              {todo.recurrence && <span title={recurrenceLabel(todo.recurrence)}>↻ {recurrenceLabel(todo.recurrence)}</span>}
              {todo.subtasks.length > 0 && (
                <span>
                  ☑ {subDone}/{todo.subtasks.length}
                </span>
              )}
              {todo.labels.map((l) => (
                <span key={l} className="text-stone-500">
                  @{l}
                </span>
              ))}
              {showList && (
                <span className="ml-auto flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-full ${list ? color(list.color).dot : "bg-stone-300"}`} />
                  {list?.name ?? "Inbox"}
                </span>
              )}
            </div>
          </summary>

          <div className="mt-3 space-y-3 rounded-md border border-stone-200 bg-stone-50/60 p-3">
            {/* keyed on updatedAt so the fields pick up new values after any change (e.g. a repeat moving on) */}
            <form action={updateTodo} key={todo.updatedAt.getTime()} className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <input type="hidden" name="id" value={todo.id} />
              <input className="input col-span-2 md:col-span-4" name="title" defaultValue={todo.title} aria-label="Title" required />
              <textarea
                className="input col-span-2 md:col-span-4"
                name="notes"
                defaultValue={todo.notes}
                rows={2}
                placeholder="Notes"
                aria-label="Notes"
              />
              <label className="text-xs text-stone-500">
                Date
                <input className="input mt-0.5 py-1.5" type="date" name="dueDate" defaultValue={todo.dueDate ?? ""} />
              </label>
              <label className="text-xs text-stone-500">
                Time
                <input className="input mt-0.5 py-1.5" type="time" name="dueTime" defaultValue={todo.dueTime ?? ""} />
              </label>
              <label className="text-xs text-stone-500">
                Repeat
                <select className="input mt-0.5 py-1.5" name="recurrence" defaultValue={todo.recurrence ?? ""}>
                  <option value="">Doesn’t repeat</option>
                  {RECURRENCES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-stone-500">
                Priority
                <select className="input mt-0.5 py-1.5" name="priority" defaultValue={todo.priority}>
                  {TODO_PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-stone-500">
                Reminder
                <select className="input mt-0.5 py-1.5" name="reminder" defaultValue={todo.reminders[0] ?? ""}>
                  <option value="">None</option>
                  {[...REMINDER_CHOICES.map((c) => c.value), ...todo.reminders.filter((m) => !REMINDER_CHOICES.some((c) => c.value === m))].map((m) => (
                    <option key={m} value={m}>
                      {reminderLabel(m)}
                    </option>
                  ))}
                </select>
                {/* extra reminders from TickTick are kept as they are */}
                <input type="hidden" name="moreReminders" value={todo.reminders.slice(1).join(",")} />
              </label>
              <label className="col-span-1 text-xs text-stone-500 md:col-span-2">
                List
                <select className="input mt-0.5 py-1.5" name="listId" defaultValue={todo.listId ?? ""}>
                  <option value="">Inbox</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-1 text-xs text-stone-500 md:col-span-2">
                Labels
                <input
                  className="input mt-0.5 py-1.5"
                  name="labels"
                  defaultValue={todo.labels.join(", ")}
                  placeholder="e.g. calls, errands"
                />
              </label>
              <div className="col-span-2 md:col-span-4">
                <button className="btn py-1.5">Save</button>
              </div>
            </form>

            {!todo.parentId && (
              <div>
                <div className="label">Sub-items</div>
                <ul>
                  {todo.subtasks.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 py-1">
                      <Check todo={s} small />
                      <span className={`flex-1 text-sm ${s.completedAt ? "text-stone-400 line-through" : ""}`}>{s.title}</span>
                      <form action={deleteTodo}>
                        <input type="hidden" name="id" value={s.id} />
                        <button className="text-xs text-stone-400 hover:text-red-700" aria-label={`Delete “${s.title}”`}>
                          Delete
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
                <TodoQuickAdd today={today} listNames={[]} parentId={todo.id} placeholder="Add a sub-item" compact />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 pt-3 text-xs">
              <span className="text-stone-500">Move to</span>
              {[
                ["today", "Today"],
                ["tomorrow", "Tomorrow"],
                ["+7", "Next week"],
                ["none", "No date"],
              ].map(([to, label]) => (
                <form key={to} action={rescheduleTodo}>
                  <input type="hidden" name="id" value={todo.id} />
                  <input type="hidden" name="to" value={to} />
                  <button className="rounded border border-stone-300 bg-white px-2 py-1 hover:bg-stone-100">{label}</button>
                </form>
              ))}
              <form action={deleteTodo} className="ml-auto">
                <input type="hidden" name="id" value={todo.id} />
                <button className="rounded px-2 py-1 text-red-700 hover:bg-red-50">Delete to-do</button>
              </form>
            </div>
          </div>
        </details>
      </div>
    </li>
  );
}

export function TodoGroup({
  title,
  subtitle,
  todos,
  today,
  lists,
  showList,
  action,
  empty,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  todos: TodoRow[];
  today: string;
  lists: TodoList[];
  showList?: boolean;
  action?: React.ReactNode;
  empty?: React.ReactNode;
}) {
  if (!todos.length && !empty) return null;
  return (
    <section className="mb-6">
      {title && (
        <div className="mb-1 flex items-baseline gap-2 border-b border-stone-200 pb-1">
          <h2 className="text-sm font-semibold text-stone-800">{title}</h2>
          {subtitle && <span className="text-xs text-stone-500">{subtitle}</span>}
          {action && <span className="ml-auto">{action}</span>}
        </div>
      )}
      {todos.length ? (
        <ul>
          {todos.map((t) => (
            <TodoItem key={t.id} todo={t} today={today} lists={lists} showList={showList} />
          ))}
        </ul>
      ) : (
        <p className="py-3 text-sm text-stone-400">{empty}</p>
      )}
    </section>
  );
}

export function TodoNavLink({
  href,
  active,
  children,
  count,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
        active ? "bg-red-50 font-medium text-red-800" : "text-stone-700 hover:bg-stone-100"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {!!count && <span className="text-xs text-stone-400">{count}</span>}
    </Link>
  );
}
