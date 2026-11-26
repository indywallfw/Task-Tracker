import { notFound } from "next/navigation";
import { and, eq, gte, isNotNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db, tasks, todos } from "@/db";
import { requireUser } from "@/lib/auth";
import { todayISO } from "@/lib/constants";
import { addDays } from "@/lib/recurrence";
import { getLabels, getTodoLists, openCounts, queryTodos, todoFilters as f } from "@/lib/todos";
import { queryTasks } from "@/lib/tasks-query";
import { COLOR_KEYS, color, relativeDay } from "@/lib/todo-meta";
import { createTodoList, deleteTodoList, rescheduleOverdue, updateTodoList } from "@/actions/todos";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { TaskList } from "@/components/task-list";
import { TodoGroup, TodoNavLink } from "@/components/todo-item";
import { TodoQuickAdd } from "@/components/todo-quick-add";
import { MobileToggle } from "@/components/mobile-toggle";

type View =
  | { kind: "today" }
  | { kind: "upcoming" }
  | { kind: "inbox" }
  | { kind: "completed" }
  | { kind: "list"; id: string }
  | { kind: "label"; name: string };

function parseView(parts: string[] | undefined): View | null {
  const [a, b, ...rest] = parts ?? [];
  if (rest.length) return null;
  if (!a) return { kind: "today" };
  if (["today", "upcoming", "inbox", "completed"].includes(a) && !b) return { kind: a } as View;
  if (a === "list" && b && z.uuid().safeParse(b).success) return { kind: "list", id: b };
  if (a === "label" && b) return { kind: "label", name: decodeURIComponent(b).toLowerCase() };
  return null;
}

export async function generateMetadata({ params }: PageProps<"/todos/[[...view]]">) {
  const v = parseView((await params).view);
  const names = { today: "Today", upcoming: "Upcoming", inbox: "Inbox", completed: "Completed" } as const;
  return { title: v && v.kind in names ? names[v.kind as keyof typeof names] : "To-dos" };
}

export default async function TodosPage({ params }: PageProps<"/todos/[[...view]]">) {
  const user = await requireUser();
  const view = parseView((await params).view);
  if (!view) notFound();

  const today = todayISO();
  const [lists, counts, labels] = await Promise.all([getTodoLists(user.id), openCounts(user.id), getLabels(user.id)]);
  const list = view.kind === "list" ? lists.find((l) => l.id === view.id) : undefined;
  if (view.kind === "list" && !list) notFound();
  const listNames = lists.map((l) => l.name);

  const todayCount = await db.$count(todos, and(eq(todos.userId, user.id), f.open(), f.dueBy(today)));

  let body: React.ReactNode;
  let title: React.ReactNode;
  let subtitle: React.ReactNode = null;

  if (view.kind === "today") {
    const [due, doneToday, teamTasks] = await Promise.all([
      queryTodos(user.id, [f.open(), f.dueBy(today)]),
      queryTodos(user.id, [f.done(), gte(todos.completedAt, new Date(`${today}T00:00:00`))]),
      queryTasks([eq(tasks.assigneeId, user.id), ne(tasks.status, "done"), isNotNull(tasks.dueDate)]).then((r) =>
        r.filter((t) => t.dueDate! <= today),
      ),
    ]);
    const overdue = due.filter((t) => t.dueDate! < today);
    const dueToday = due.filter((t) => t.dueDate === today);
    title = "Today";
    subtitle = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    body = (
      <>
        <TodoQuickAdd today={today} listNames={listNames} defaultDate={today} />
        <TodoGroup
          title="Overdue"
          todos={overdue}
          today={today}
          lists={lists}
          action={
            <form action={rescheduleOverdue}>
              <button className="text-xs text-red-700 hover:underline">Move all to today</button>
            </form>
          }
        />
        <TodoGroup
          title={overdue.length ? "Today" : undefined}
          todos={dueToday}
          today={today}
          lists={lists}
          empty={overdue.length ? undefined : "Nothing due today. Enjoy it, or add something above."}
        />
        {teamTasks.length > 0 && (
          <section className="mb-6">
            <div className="mb-2 border-b border-stone-200 pb-1 text-sm font-semibold text-stone-800">
              Team tasks due <span className="font-normal text-stone-500">· assigned to you</span>
            </div>
            <TaskList tasks={teamTasks} showProject />
          </section>
        )}
        {doneToday.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm text-stone-500">Completed today ({doneToday.length})</summary>
            <div className="mt-2">
              <TodoGroup todos={doneToday} today={today} lists={lists} />
            </div>
          </details>
        )}
      </>
    );
  } else if (view.kind === "upcoming") {
    const until = addDays(today, 30);
    const [overdue, upcoming] = await Promise.all([
      queryTodos(user.id, [f.open(), f.dueBy(addDays(today, -1))]),
      queryTodos(user.id, [f.open(), f.dueBetween(today, until)]),
    ]);
    // the next 7 days always show, so there is somewhere to plan into; later days only when used
    const days = new Set([...Array.from({ length: 7 }, (_, i) => addDays(today, i)), ...upcoming.map((t) => t.dueDate!)]);
    title = "Upcoming";
    subtitle = "The next 30 days";
    body = (
      <>
        <TodoQuickAdd today={today} listNames={listNames} />
        <TodoGroup title="Overdue" todos={overdue} today={today} lists={lists} />
        {[...days].sort().map((d) => (
          <TodoGroup
            key={d}
            title={relativeDay(d, today)}
            subtitle={new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            todos={upcoming.filter((t) => t.dueDate === d)}
            today={today}
            lists={lists}
            empty={<span className="text-xs">Nothing planned</span>}
          />
        ))}
      </>
    );
  } else if (view.kind === "completed") {
    const done = await queryTodos(user.id, [f.done(), gte(todos.completedAt, new Date(`${addDays(today, -30)}T00:00:00`))]);
    done.sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime());
    title = "Completed";
    subtitle = "The last 30 days";
    body = <TodoGroup todos={done} today={today} lists={lists} empty="Nothing completed yet." />;
  } else {
    const where = view.kind === "inbox" ? f.inbox() : view.kind === "list" ? f.list(view.id) : f.label(view.name);
    const [open, doneCount] = await Promise.all([
      queryTodos(user.id, [f.open(), where]),
      db.$count(todos, and(eq(todos.userId, user.id), f.done(), where)),
    ]);
    const noDate = open.filter((t) => !t.dueDate);
    const dated = open.filter((t) => t.dueDate);
    title =
      view.kind === "inbox" ? (
        "Inbox"
      ) : view.kind === "list" ? (
        <span className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${color(list!.color).dot}`} />
          {list!.name}
        </span>
      ) : (
        `@${view.name}`
      );
    subtitle = `${open.length} open${doneCount ? ` · ${doneCount} done` : ""}`;
    body = (
      <>
        <TodoQuickAdd
          today={today}
          listNames={listNames}
          listId={view.kind === "list" ? view.id : undefined}
          placeholder={view.kind === "label" ? `Add a to-do — include @${view.name} to tag it` : undefined}
        />
        <TodoGroup title={noDate.length ? "Scheduled" : undefined} todos={dated} today={today} lists={lists} showList={view.kind !== "list"} />
        <TodoGroup
          title={dated.length ? "No date" : undefined}
          todos={noDate}
          today={today}
          lists={lists}
          showList={view.kind !== "list"}
          empty={dated.length ? undefined : "All clear."}
        />
        {view.kind === "list" && (
          <details className="mt-8 max-w-md">
            <summary className="cursor-pointer text-sm text-stone-500">List settings</summary>
            <form action={updateTodoList} className="card mt-3 space-y-3 p-4" key={list!.updatedAt.getTime()}>
              <input type="hidden" name="id" value={list!.id} />
              <div>
                <label className="label" htmlFor="lname">Name</label>
                <input className="input" id="lname" name="name" defaultValue={list!.name} required maxLength={60} />
              </div>
              <ColorPicker value={list!.color} />
              <button className="btn-secondary">Save</button>
            </form>
            <form action={deleteTodoList} className="mt-3">
              <input type="hidden" name="id" value={list!.id} />
              <ConfirmButton className="btn-danger" message="Delete this list? Its to-dos move to the Inbox.">
                Delete list
              </ConfirmButton>
            </form>
          </details>
        )}
      </>
    );
  }

  return (
    <div className="md:flex md:min-h-screen">
      <nav
        className="border-b border-stone-200 px-2 py-1 md:w-56 md:shrink-0 md:border-r md:border-b-0 md:px-3 md:py-8"
        aria-label="To-do views"
      >
        <MobileToggle label="Views and lists" className="space-y-5 pb-3 md:pb-0">
        <div className="space-y-0.5">
          <TodoNavLink href="/todos/inbox" active={view.kind === "inbox"} count={counts.get("inbox")}>
            📥 Inbox
          </TodoNavLink>
          <TodoNavLink href="/todos" active={view.kind === "today"} count={todayCount}>
            📅 Today
          </TodoNavLink>
          <TodoNavLink href="/todos/upcoming" active={view.kind === "upcoming"}>
            🗓️ Upcoming
          </TodoNavLink>
          <TodoNavLink href="/todos/completed" active={view.kind === "completed"}>
            ✅ Completed
          </TodoNavLink>
        </div>
        <div>
          <div className="label px-2">My lists</div>
          <div className="space-y-0.5">
            {lists.map((l) => (
              <TodoNavLink key={l.id} href={`/todos/list/${l.id}`} active={view.kind === "list" && view.id === l.id} count={counts.get(l.id)}>
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${color(l.color).dot}`} />
                  <span className="truncate">{l.name}</span>
                </span>
              </TodoNavLink>
            ))}
          </div>
          <details className="mt-1 px-2">
            <summary className="cursor-pointer text-sm text-stone-500 hover:text-stone-800">+ New list</summary>
            <ActionForm action={createTodoList} submitLabel="Create" className="mt-2 space-y-2">
              <input className="input py-1.5" name="name" placeholder="e.g. Work, Home" required maxLength={60} />
              <ColorPicker value="blue" />
            </ActionForm>
          </details>
        </div>
        {labels.length > 0 && (
          <div>
            <div className="label px-2">Labels</div>
            <div className="space-y-0.5">
              {labels.map((l) => (
                <TodoNavLink key={l} href={`/todos/label/${encodeURIComponent(l)}`} active={view.kind === "label" && view.name === l}>
                  @{l}
                </TodoNavLink>
              ))}
            </div>
          </div>
        )}
        </MobileToggle>
      </nav>

      <div className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-5">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
          </div>
          {body}
        </div>
      </div>
    </div>
  );
}

function ColorPicker({ value }: { value: string }) {
  return (
    <fieldset className="flex flex-wrap gap-1.5">
      <legend className="sr-only">Colour</legend>
      {COLOR_KEYS.map((c) => (
        <label key={c} className="cursor-pointer" title={c}>
          <input type="radio" name="color" value={c} defaultChecked={c === value} className="peer sr-only" />
          <span className={`block h-5 w-5 rounded-full ring-offset-1 peer-checked:ring-2 peer-checked:ring-stone-700 ${color(c).dot}`} />
        </label>
      ))}
    </fieldset>
  );
}
