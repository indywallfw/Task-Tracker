import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray, ne, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, products, projects, tasks } from "@/db";
import { requireUser } from "@/lib/auth";
import { getActiveUsers } from "@/lib/data";
import { assigneeFilter, queryTasks, titleFilter } from "@/lib/tasks-query";
import { STATUSES } from "@/lib/constants";
import { PROJECT_STATUSES } from "@/lib/project-meta";
import { getActiveProducts } from "@/lib/products";
import { setProjectProduct, setProjectSprintTracker, setProjectStatus, updateProjectText } from "@/actions/products";
import { Avatar } from "@/components/avatar";
import { DueDate, PriorityText, StatusPill } from "@/components/task-bits";
import type { TaskCard } from "@/lib/tasks-query";
import { AutoSubmitSelect, SubmitOnBlurTextarea } from "@/components/auto-submit";
import { setProjectArchived, updateProject } from "@/actions/tasks";
import { PageHeader } from "@/components/page-header";
import { Kanban } from "@/components/kanban";
import { TaskTable, parseSort } from "@/components/task-table";
import { QuickAddTask } from "@/components/quick-add-task";

const PLAN_HINT = ["Approach, milestones, scope, risks…", "", "1. Discovery", "2. Build", "3. Launch"].join("\n");

const isId =(v: string) => z.string().uuid().safeParse(v).success;

export async function generateMetadata({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  if (!isId(id)) return {};
  const [p] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, id));
  return { title: p?.name ?? "Project" };
}

export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) notFound();

  const view = sp.view === "list" ? "list" : sp.view === "board" ? "board" : "overview";
  const assignee = typeof sp.assignee === "string" ? sp.assignee : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim() : undefined;
  const sort = parseSort(sp.sort, project.fields);

  const where = [
    eq(tasks.projectId, id),
    // the overview shows what is moving: work in progress, and urgent/high priority (P0/P1) work
    view === "overview"
      ? and(ne(tasks.status, "done"), or(eq(tasks.status, "in_progress"), inArray(tasks.priority, ["urgent", "high"])))
      : undefined,
    assigneeFilter(assignee, user.id),
    titleFilter(q),
  ].filter(Boolean) as SQL[];
  const [rows, people, productList, product] = await Promise.all([
    queryTasks(where),
    getActiveUsers(),
    getActiveProducts(),
    project.productId
      ? db.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, project.productId)).then((r) => r[0])
      : undefined,
  ]);

  const link = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { view, assignee, q, sort: sp.sort === undefined ? undefined : String(sp.sort), ...patch };
    Object.entries(merged).forEach(([k, v]) => v && next.set(k, v));
    return `/projects/${id}?${next}`;
  };

  return (
    <div className="px-4 py-5 md:px-8 md:py-8">
      <div className="mb-1 text-xs text-stone-500">
        {product ? (
          <>
            <Link href="/products" className="hover:underline">
              Products
            </Link>
            {" / "}
            <Link href={`/products/${product.id}`} className="hover:underline">
              {product.name}
            </Link>
          </>
        ) : (
          <Link href="/projects" className="hover:underline">
            Projects
          </Link>
        )}
      </div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-sm text-stone-500">{project.key}</span>
            {project.name}
          </span>
        }
        actions={
          <>
            <form action={setProjectStatus}>
              <input type="hidden" name="projectId" value={project.id} />
              <AutoSubmitSelect className="input w-36 py-1.5" name="status" defaultValue={project.status} aria-label="Project status">
                {PROJECT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </AutoSubmitSelect>
            </form>
            <div className="flex rounded-md border border-stone-300 bg-white p-0.5 text-sm">
              {(["overview", "board", "list"] as const).map((v) => (
                <Link
                  key={v}
                  href={link({ view: v === "overview" ? undefined : v })}
                  className={`rounded px-3 py-1 capitalize ${view === v ? "bg-stone-900 text-white" : "text-stone-600"}`}
                >
                  {v}
                </Link>
              ))}
            </div>
          </>
        }
      />

      {view === "overview" ? (
        <div className="space-y-8">
          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <h2 className="label">Description</h2>
              <form action={updateProjectText} key={`d${project.updatedAt.getTime()}`}>
                <input type="hidden" name="projectId" value={project.id} />
                <SubmitOnBlurTextarea
                  className="input min-h-40"
                  name="description"
                  defaultValue={project.description}
                  rows={7}
                  placeholder="What this project is and why it matters. Saves when you click away."
                />
              </form>
            </section>
            <section>
              <h2 className="label">Proposed plan</h2>
              <form action={updateProjectText} key={`p${project.updatedAt.getTime()}`}>
                <input type="hidden" name="projectId" value={project.id} />
                <SubmitOnBlurTextarea
                  className="input min-h-40 font-mono text-sm"
                  name="plan"
                  defaultValue={project.plan}
                  rows={7}
                  placeholder={PLAN_HINT}
                />
              </form>
            </section>
          </div>

          <section>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="label mb-0">In progress and high priority, by person ({rows.length})</h2>
              <Link href={link({ view: "list" })} className="text-xs text-stone-500 hover:underline">
                All tasks →
              </Link>
            </div>
            <p className="mb-3 text-xs text-stone-500">
              Tasks in progress, plus anything Urgent (P0) or High (P1) that isn&apos;t done yet.
            </p>
            <QuickAddTask projectId={id} people={people} />
            {rows.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {byPerson(rows).map((g) => (
                  <PersonTasks key={g.id ?? "none"} name={g.name} tasks={g.tasks} />
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500">
                Nothing in progress or high priority. See all tasks in the list view.
              </p>
            )}
          </section>
        </div>
      ) : (
        <>
          <form className="mb-5 flex flex-wrap items-center gap-2" action={`/projects/${id}`}>
            <input type="hidden" name="view" value={view} />
            <input className="input w-56 py-1.5" name="q" defaultValue={q} placeholder="Filter by title…" />
            <select className="input w-48 py-1.5" name="assignee" defaultValue={assignee ?? ""}>
              <option value="">Everyone</option>
              <option value="me">Assigned to me</option>
              <option value="none">Unassigned</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button className="btn-secondary py-1.5">Apply</button>
            {(q || assignee) && (
              <Link href={link({ q: undefined, assignee: undefined })} className="text-sm text-stone-500 underline">
                Clear
              </Link>
            )}
          </form>

          <QuickAddTask projectId={id} people={people} />

          {view === "board" ? (
            <Kanban tasks={rows} statuses={STATUSES.map((s) => ({ value: s.value, label: s.label, dot: s.dot }))} />
          ) : (
            <TaskTable tasks={rows} fields={project.fields} sort={sort} sortHref={(s) => link({ sort: s })} />
          )}
        </>
      )}

      <details className="mt-10 max-w-xl">
        <summary className="cursor-pointer text-sm text-stone-500">Project settings</summary>
        <form action={updateProject} key={project.updatedAt.getTime()} className="card mt-3 space-y-3 p-4">
          <input type="hidden" name="id" value={project.id} />
          <div>
            <label className="label" htmlFor="pname">Name</label>
            <input className="input" id="pname" name="name" defaultValue={project.name} required />
          </div>
          <div>
            <label className="label" htmlFor="pfields">Table fields</label>
            <textarea
              className="input font-mono text-xs"
              id="pfields"
              name="fields"
              rows={Math.max(3, project.fields.length + 1)}
              defaultValue={project.fields.join("\n")}
            />
            <p className="mt-1 text-xs text-stone-500">
              One per line, in column order. Extra columns shown in the list view, like Category or Effort.
            </p>
          </div>
          <button className="btn-secondary">Save</button>
        </form>
        {project.productId && (
          <form action={setProjectSprintTracker} className="card mt-3 p-4">
            <input type="hidden" name="projectId" value={project.id} />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="sprintTracker" defaultChecked={project.sprintTracker} className="mt-0.5" />
              <span>
                <span className="font-medium">Show under Sprints</span>
                <span className="block text-xs text-stone-500">
                  For sprint tracking like Weekly Sprints: listed in the product&apos;s Sprints section instead of with its projects.
                </span>
              </span>
            </label>
            <button className="btn-secondary mt-3">Save</button>
          </form>
        )}
        <form action={setProjectProduct} className="card mt-3 p-4">
          <input type="hidden" name="projectId" value={project.id} />
          <label className="label" htmlFor="pproduct">Product</label>
          <AutoSubmitSelect className="input" id="pproduct" name="productId" defaultValue={project.productId ?? ""}>
            <option value="">No product</option>
            {productList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </AutoSubmitSelect>
        </form>
        {user.role === "admin" && (
          <form action={setProjectArchived} className="mt-3">
            <input type="hidden" name="id" value={project.id} />
            <input type="hidden" name="archived" value="true" />
            <button className="btn-danger">Archive project</button>
          </form>
        )}
      </details>
    </div>
  );
}

const RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

/** Groups tasks by owner (people A–Z, unassigned last); in-progress first, then by priority and due date. */
function byPerson(rows: TaskCard[]) {
  const groups = new Map<string, { id: string | null; name: string; tasks: TaskCard[] }>();
  for (const t of rows) {
    const key = t.assigneeId ?? "";
    if (!groups.has(key)) groups.set(key, { id: t.assigneeId, name: t.assigneeName ?? "Not yet assigned", tasks: [] });
    groups.get(key)!.tasks.push(t);
  }
  const sorted = [...groups.values()].sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || a.name.localeCompare(b.name));
  for (const g of sorted)
    g.tasks.sort(
      (a, b) =>
        Number(b.status === "in_progress") - Number(a.status === "in_progress") ||
        RANK[a.priority] - RANK[b.priority] ||
        (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"),
    );
  return sorted;
}

function PersonTasks({ name, tasks: list }: { name: string; tasks: TaskCard[] }) {
  const working = list.filter((t) => t.status === "in_progress").length;
  return (
    <div className="card p-3">
      <div className="mb-2 flex items-center gap-2">
        {name === "Not yet assigned" ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-stone-300 text-xs text-stone-400">?</span>
        ) : (
          <Avatar name={name} />
        )}
        <span className="font-medium">{name}</span>
        <span className="ml-auto text-xs text-stone-500">
          {working} in progress · {list.length - working} more high priority
        </span>
      </div>
      <ul className="divide-y divide-stone-100">
        {list.map((t) => (
          <li key={t.id}>
            <Link href={`/tasks/${t.id}`} className="flex items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-stone-50">
              <span className="w-16 shrink-0 font-mono text-xs text-stone-400">
                {t.projectKey}-{t.number}
              </span>
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="hidden sm:inline">
                  <StatusPill status={t.status} />
                </span>
                <PriorityText priority={t.priority} />
                <DueDate date={t.dueDate} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
