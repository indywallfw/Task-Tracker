import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, isNull, ne, type SQL } from "drizzle-orm";
import { z } from "zod";
import { projects, tasks } from "@/db";
import type { Product } from "@/db";
import { requireUser } from "@/lib/auth";
import { getActiveUsers } from "@/lib/data";
import {
  getLinkableDocs,
  getProduct,
  getProductDocs,
  getProductMembers,
  getProductProjects,
  getProductSprints,
  getUnassignedProjects,
} from "@/lib/products";
import { assigneeFilter, queryTasks, titleFilter, type TaskCard } from "@/lib/tasks-query";
import { STATUSES, formatDate } from "@/lib/constants";
import { PROJECT_STATUSES, projectStatus } from "@/lib/project-meta";
import { PRODUCT_TEMPLATES } from "@/lib/product-templates";
import { createProject } from "@/actions/tasks";
import {
  addProductMember,
  addProductStarters,
  addTasksToSprint,
  createProductDoc,
  createSprint,
  createSprintTask,
  deleteSprint,
  linkDocToProduct,
  removeProductMember,
  setProductArchived,
  setProjectProduct,
  setProjectStatus,
  setSprintStatus,
  setTaskSprint,
  updateMemberRole,
  updateProduct,
  updateSprint,
} from "@/actions/products";
import { toISO } from "@/lib/recurrence";
import { ActionForm } from "@/components/action-form";
import { AutoSubmitSelect, SubmitOnBlurTextarea } from "@/components/auto-submit";
import { Avatar } from "@/components/avatar";
import { ConfirmButton } from "@/components/confirm-button";
import { Kanban } from "@/components/kanban";
import { PageHeader } from "@/components/page-header";
import { TaskTable, parseSort } from "@/components/task-table";

const TABS = [
  ["overview", "Overview"],
  ["projects", "Projects"],
  ["tasks", "Tasks"],
  ["sprints", "Sprints"],
  ["people", "People"],
  ["docs", "Docs"],
] as const;
type Tab = (typeof TABS)[number][0];

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export async function generateMetadata({ params }: PageProps<"/products/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return {};
  return { title: (await getProduct(id))?.name ?? "Product" };
}

export default async function ProductPage({ params, searchParams }: PageProps<"/products/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const product = await getProduct(id);
  if (!product) notFound();

  const tab: Tab = TABS.some(([t]) => t === sp.tab) ? (sp.tab as Tab) : "overview";
  const base = `/products/${id}`;

  return (
    <div className="px-4 py-5 md:px-8 md:py-8">
      <div className="mb-1 text-xs text-stone-500">
        <Link href="/products" className="hover:underline">
          Products
        </Link>
      </div>
      <PageHeader title={product.name} subtitle={product.archived ? "Archived" : undefined} />

      <nav className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-stone-200 text-sm">
        {TABS.map(([t, label]) => (
          <Link
            key={t}
            href={t === "overview" ? base : `${base}?tab=${t}`}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 ${
              tab === t ? "border-stone-900 font-medium text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <Overview product={product} />}
      {tab === "projects" && <ProjectsTab productId={id} show={str(sp.show)} />}
      {tab === "tasks" && <TasksTab productId={id} sp={sp} userId={user.id} />}
      {tab === "sprints" && <SprintsTab productId={id} selected={str(sp.sprint)} />}
      {tab === "people" && <PeopleTab productId={id} />}
      {tab === "docs" && <DocsTab productId={id} />}

      {tab === "overview" && !product.archived && (
        <details className="mt-10 max-w-xl">
          <summary className="cursor-pointer text-sm text-stone-500">Add starter pieces</summary>
          <ActionForm action={addProductStarters} submitLabel="Add" className="card mt-3 space-y-3 p-4">
            <input type="hidden" name="productId" value={product.id} />
            {PRODUCT_TEMPLATES.map((t) => (
              <label key={t.value} className="flex items-start gap-2 text-sm">
                <input type="checkbox" name={`template_${t.value}`} className="mt-0.5" />
                <span>
                  <span className="font-medium">{t.label}</span>
                  <span className="block text-xs text-stone-500">{t.hint}</span>
                </span>
              </label>
            ))}
          </ActionForm>
        </details>
      )}

      {tab === "overview" && user.role === "admin" && !product.archived && (
        <details className="mt-10 max-w-xl">
          <summary className="cursor-pointer text-sm text-stone-500">Product settings</summary>
          <form action={updateProduct} key={product.updatedAt.getTime()} className="card mt-3 space-y-3 p-4">
            <input type="hidden" name="id" value={product.id} />
            <div>
              <label className="label" htmlFor="pname">Name</label>
              <input className="input" id="pname" name="name" defaultValue={product.name} required />
            </div>
            <button className="btn-secondary">Save</button>
          </form>
          <form action={setProductArchived} className="mt-3">
            <input type="hidden" name="id" value={product.id} />
            <input type="hidden" name="archived" value="true" />
            <button className="btn-danger">Archive product</button>
          </form>
        </details>
      )}
    </div>
  );
}

// ---------- overview ----------

async function Overview({ product }: { product: Product }) {
  const [projectRows, members, sprintRows, docRows] = await Promise.all([
    getProductProjects(product.id),
    getProductMembers(product.id),
    getProductSprints(product.id),
    getProductDocs(product.id),
  ]);
  const pending = projectRows.filter((p) => p.status !== "done" && !p.archived);
  const active = sprintRows.find((s) => s.status === "active");
  const base = `/products/${product.id}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-6">
        <section>
          <h2 className="label">Description</h2>
          <form action={updateProduct} key={product.updatedAt.getTime()}>
            <input type="hidden" name="id" value={product.id} />
            <SubmitOnBlurTextarea
              className="input min-h-24"
              name="description"
              defaultValue={product.description}
              rows={4}
              placeholder="What is this product, who is it for, where is it headed? Saves when you click away."
            />
          </form>
        </section>

        <section>
          <SectionHead title={`Pending projects (${pending.length})`} href={`${base}?tab=projects`} link="All projects" />
          {pending.length ? (
            <ul className="card divide-y divide-stone-100">
              {pending.map((p) => (
                <ProjectRow key={p.id} p={p} />
              ))}
            </ul>
          ) : (
            <Empty>
              No pending projects. <Link href={`${base}?tab=projects`} className="underline">Add one</Link>.
            </Empty>
          )}
        </section>
      </div>

      <aside className="space-y-6">
        <section>
          <SectionHead title="Current sprint" href={`${base}?tab=sprints`} link="Sprints" />
          {active ? (
            <Link href={`${base}?tab=sprints&sprint=${active.id}`} className="card block p-3 hover:bg-stone-50">
              <div className="font-medium">{active.name}</div>
              <SprintDates s={active} />
              {active.goal && <p className="mt-1 line-clamp-2 text-sm text-stone-600">{active.goal}</p>}
              <Progress done={active.done} total={active.total} />
            </Link>
          ) : (
            <Empty>No sprint running.</Empty>
          )}
        </section>

        <section>
          <SectionHead title={`People (${members.length})`} href={`${base}?tab=people`} link="Manage" />
          {members.length ? (
            <ul className="space-y-1.5">
              {members.map((m) => (
                <li key={m.userId} className="flex items-center gap-2 text-sm">
                  <Avatar name={m.name} size="md" />
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  {m.role && <span className="text-xs text-stone-500">{m.role}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nobody added yet.</Empty>
          )}
        </section>

        <section>
          <SectionHead title={`Docs (${docRows.length})`} href={`${base}?tab=docs`} link="Manage" />
          {docRows.length ? (
            <ul className="space-y-0.5">
              {docRows.map((d) => (
                <li key={d.id}>
                  <Link href={`/docs/${d.id}`} className="block truncate rounded px-1 py-1 text-sm hover:bg-stone-100">
                    {d.icon ?? "📄"} {d.title || "Untitled"}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No documents linked. Add the build plan, specs and so on.</Empty>
          )}
        </section>
      </aside>
    </div>
  );
}

// ---------- projects ----------

type ProjectRowData = Awaited<ReturnType<typeof getProductProjects>>[number];

function ProjectRow({ p, editable }: { p: ProjectRowData; editable?: boolean }) {
  const st = projectStatus(p.status);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
      <Link href={`/projects/${p.id}`} className="min-w-0 flex-1 hover:underline">
        <span className="mr-2 font-mono text-xs text-stone-400">{p.key}</span>
        <span className="font-medium">{p.name}</span>
        {p.description && <span className="block truncate text-xs text-stone-500">{p.description}</span>}
      </Link>
      <span className="text-xs text-stone-500">
        {p.open} open / {p.total} tasks
      </span>
      {editable ? (
        <form action={setProjectStatus}>
          <input type="hidden" name="projectId" value={p.id} />
          <AutoSubmitSelect className="input w-32 py-1 text-xs" name="status" defaultValue={p.status} aria-label="Project status">
            {PROJECT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </AutoSubmitSelect>
        </form>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-xs text-stone-600">
          <span className={`h-2 w-2 rounded-full ${st.dot}`} />
          {st.label}
        </span>
      )}
    </li>
  );
}

async function ProjectsTab({ productId, show }: { productId: string; show?: string }) {
  const [rows, unassigned] = await Promise.all([getProductProjects(productId), getUnassignedProjects()]);
  const filter = show === "all" || show === "done" ? show : "pending";
  const visible = rows.filter((p) =>
    filter === "all" ? true : filter === "done" ? p.status === "done" || p.archived : p.status !== "done" && !p.archived,
  );
  const base = `/products/${productId}?tab=projects`;

  return (
    <div className="max-w-4xl space-y-8">
      <section>
        <div className="mb-2 flex items-center gap-1 text-sm">
          {(
            [
              ["pending", "Pending"],
              ["done", "Done"],
              ["all", "All"],
            ] as const
          ).map(([v, label]) => (
            <Link
              key={v}
              href={v === "pending" ? base : `${base}&show=${v}`}
              className={`rounded-md px-2.5 py-1 ${filter === v ? "bg-stone-200/70 font-medium" : "text-stone-500 hover:bg-stone-100"}`}
            >
              {label} ({rows.filter((p) => (v === "all" ? true : v === "done" ? p.status === "done" || p.archived : p.status !== "done" && !p.archived)).length})
            </Link>
          ))}
        </div>
        {visible.length ? (
          <ul className="card divide-y divide-stone-100">
            {visible.map((p) => (
              <ProjectRow key={p.id} p={p} editable />
            ))}
          </ul>
        ) : (
          <Empty>Nothing here.</Empty>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-3 font-medium">New project</h2>
          <ActionForm action={createProject} submitLabel="Create project" className="grid grid-cols-3 gap-3">
            <input type="hidden" name="productId" value={productId} />
            <div className="col-span-2">
              <label className="label" htmlFor="name">Name</label>
              <input className="input" id="name" name="name" required />
            </div>
            <div>
              <label className="label" htmlFor="key">Key</label>
              <input className="input uppercase" id="key" name="key" placeholder="ABC" maxLength={6} required />
            </div>
            <div className="col-span-3">
              <label className="label" htmlFor="status">Status</label>
              <select className="input" id="status" name="status" defaultValue="planned">
                {PROJECT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-3">
              <label className="label" htmlFor="description">Description</label>
              <textarea className="input" id="description" name="description" rows={2} />
            </div>
          </ActionForm>
        </section>

        <section className="card p-4">
          <h2 className="mb-3 font-medium">Add an existing project</h2>
          {unassigned.length ? (
            <form action={setProjectProduct} className="space-y-3">
              <input type="hidden" name="productId" value={productId} />
              <select className="input" name="projectId" required defaultValue="">
                <option value="" disabled>
                  Pick a project…
                </option>
                {unassigned.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.key} · {p.name}
                  </option>
                ))}
              </select>
              <button className="btn-secondary">Add to product</button>
            </form>
          ) : (
            <p className="text-sm text-stone-500">Every project already belongs to a product.</p>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------- tasks ----------

async function TasksTab({
  productId,
  sp,
  userId,
}: {
  productId: string;
  sp: Record<string, string | string[] | undefined>;
  userId: string;
}) {
  const showAll = sp.show === "all";
  const assignee = str(sp.assignee);
  const project = z.uuid().safeParse(sp.project).success ? String(sp.project) : undefined;
  const q = str(sp.q)?.trim();
  const where = [
    eq(projects.productId, productId),
    showAll ? undefined : ne(tasks.status, "done"),
    project ? eq(tasks.projectId, project) : undefined,
    assigneeFilter(assignee, userId),
    titleFilter(q),
  ].filter(Boolean) as SQL[];
  const [rows, people, projectRows] = await Promise.all([queryTasks(where), getActiveUsers(), getProductProjects(productId)]);

  const link = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams({ tab: "tasks" });
    const merged = { show: showAll ? "all" : undefined, assignee, project, q, sort: str(sp.sort), ...patch };
    Object.entries(merged).forEach(([k, v]) => v && next.set(k, v));
    return `/products/${productId}?${next}`;
  };

  return (
    <div>
      <form className="mb-4 flex flex-wrap items-center gap-2" action={`/products/${productId}`}>
        <input type="hidden" name="tab" value="tasks" />
        {showAll && <input type="hidden" name="show" value="all" />}
        <input className="input w-56 py-1.5" name="q" defaultValue={q} placeholder="Filter by title…" />
        <select className="input w-48 py-1.5" name="project" defaultValue={project ?? ""}>
          <option value="">All projects</option>
          {projectRows.map((p) => (
            <option key={p.id} value={p.id}>
              {p.key} · {p.name}
            </option>
          ))}
        </select>
        <select className="input w-44 py-1.5" name="assignee" defaultValue={assignee ?? ""}>
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
        <Link href={link({ show: showAll ? undefined : "all" })} className="ml-auto text-sm text-stone-500 underline">
          {showAll ? "Show pending only" : "Include done tasks"}
        </Link>
      </form>
      <p className="mb-2 text-sm text-stone-500">
        {rows.length} {showAll ? "" : "pending "}
        {rows.length === 1 ? "task" : "tasks"} across {projectRows.length} {projectRows.length === 1 ? "project" : "projects"}
      </p>
      <TaskTable tasks={rows} fields={[]} sort={parseSort(sp.sort, [])} sortHref={(s) => link({ sort: s })} />
    </div>
  );
}

// ---------- sprints ----------

type SprintRow = Awaited<ReturnType<typeof getProductSprints>>[number];

async function SprintsTab({ productId, selected }: { productId: string; selected?: string }) {
  const sprintRows = await getProductSprints(productId);
  const current =
    sprintRows.find((s) => s.id === selected) ?? sprintRows.find((s) => s.status === "active") ?? sprintRows.find((s) => s.status === "planned");
  const base = `/products/${productId}?tab=sprints`;

  const [projectRows, people] = await Promise.all([getProductProjects(productId), getActiveUsers()]);
  const [sprintTasks, backlog] = current
    ? await Promise.all([
        queryTasks([eq(tasks.sprintId, current.id)]),
        current.status === "completed"
          ? Promise.resolve([] as TaskCard[])
          : queryTasks([eq(projects.productId, productId), ne(tasks.status, "done"), isNull(tasks.sprintId)]),
      ])
    : [[], []];

  return (
    <div className="grid gap-6 xl:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="space-y-4">
        <ul className="space-y-1">
          {sprintRows.map((s) => (
            <li key={s.id}>
              <Link
                href={`${base}&sprint=${s.id}`}
                className={`block rounded-md px-2 py-1.5 text-sm ${s.id === current?.id ? "bg-stone-200/70 font-medium" : "hover:bg-stone-100"}`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      s.status === "active" ? "bg-amber-400" : s.status === "planned" ? "bg-sky-400" : "bg-emerald-500"
                    }`}
                  />
                  <span className="truncate">{s.name}</span>
                </span>
                <span className="block pl-4 text-xs font-normal text-stone-500">
                  {s.status === "completed" ? "Completed" : s.status === "active" ? "Active" : "Planned"} · {s.done}/{s.total} done
                </span>
              </Link>
            </li>
          ))}
          {sprintRows.length === 0 && <li className="px-2 text-sm text-stone-500">No sprints yet.</li>}
        </ul>

        <details className="card p-3" open={sprintRows.length === 0}>
          <summary className="cursor-pointer text-sm font-medium">+ New sprint</summary>
          <ActionForm action={createSprint} submitLabel="Create sprint" className="mt-3 space-y-2">
            <input type="hidden" name="productId" value={productId} />
            <input className="input" name="name" placeholder={`Sprint ${sprintRows.length + 1}`} defaultValue={`Sprint ${sprintRows.length + 1}`} required />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-stone-500">
                Starts
                <input className="input mt-0.5 py-1.5" type="date" name="startDate" />
              </label>
              <label className="text-xs text-stone-500">
                Ends
                <input className="input mt-0.5 py-1.5" type="date" name="endDate" />
              </label>
            </div>
            <textarea className="input" name="goal" rows={2} placeholder="Sprint goal" />
          </ActionForm>
        </details>
      </aside>

      {current ? (
        <SprintDetail
          sprint={current}
          sprintTasks={sprintTasks}
          backlog={backlog}
          projectOptions={projectRows.filter((p) => p.status !== "done")}
          people={people}
        />
      ) : (
        <Empty>Create a sprint to plan work from this product&apos;s projects into it.</Empty>
      )}
    </div>
  );
}

function SprintDetail({
  sprint,
  sprintTasks,
  backlog,
  projectOptions,
  people,
}: {
  sprint: SprintRow;
  sprintTasks: TaskCard[];
  backlog: TaskCard[];
  projectOptions: { id: string; key: string; name: string }[];
  people: { id: string; name: string }[];
}) {
  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{sprint.name}</h2>
          <SprintDates s={sprint} />
          {sprint.goal && <p className="mt-1 text-sm text-stone-600">{sprint.goal}</p>}
          <div className="mt-2 max-w-sm">
            <Progress done={sprint.done} total={sprint.total} />
          </div>
        </div>
        {sprint.status !== "completed" && (
          <form action={setSprintStatus}>
            <input type="hidden" name="sprintId" value={sprint.id} />
            <input type="hidden" name="status" value={sprint.status === "planned" ? "active" : "completed"} />
            <button className={sprint.status === "planned" ? "btn" : "btn-secondary"}>
              {sprint.status === "planned" ? "Start sprint" : "Complete sprint"}
            </button>
          </form>
        )}
      </div>
      {sprint.status === "active" && (
        <p className="text-xs text-stone-500">Completing the sprint sends its unfinished tasks back to the backlog.</p>
      )}

      {sprint.status !== "completed" && projectOptions.length > 0 && (
        <details className="card p-4" open={sprintTasks.length === 0}>
          <summary className="cursor-pointer font-medium">+ Add a task to this sprint</summary>
          <ActionForm action={createSprintTask} submitLabel="Add task" resetOnSuccess className="mt-3 space-y-3">
            <input type="hidden" name="sprintId" value={sprint.id} />
            <input className="input" name="title" placeholder="What needs doing?" required aria-label="Task title" />
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-xs text-stone-500">
                Project
                <select className="input mt-0.5 py-1.5" name="projectId" required defaultValue={projectOptions[0].id}>
                  {projectOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.key} · {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-stone-500">
                Owner
                <select className="input mt-0.5 py-1.5" name="assigneeId" defaultValue="">
                  <option value="">Unassigned</option>
                  {people.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-stone-500">
                Due
                <input className="input mt-0.5 py-1.5" type="date" name="dueDate" defaultValue={sprint.endDate ?? ""} />
              </label>
            </div>
            <div className="flex flex-wrap items-end gap-3 rounded-md bg-stone-50 p-2">
              <label className="flex items-center gap-2 self-center text-sm">
                <input type="checkbox" name="remind" />
                Remind me in To-dos
              </label>
              <label className="text-xs text-stone-500">
                On
                <input className="input mt-0.5 py-1.5" type="date" name="remindDate" />
              </label>
              <label className="text-xs text-stone-500">
                At
                <input className="input mt-0.5 py-1.5" type="time" name="remindTime" />
              </label>
              <p className="w-full text-xs text-stone-500">Leave the date empty to be reminded on the due date.</p>
            </div>
          </ActionForm>
        </details>
      )}

      {sprintTasks.length ? (
        <Kanban tasks={sprintTasks} statuses={STATUSES.map((s) => ({ value: s.value, label: s.label, dot: s.dot }))} />
      ) : (
        <Empty>No tasks in this sprint yet{sprint.status === "completed" ? "." : ". Add some from the backlog below."}</Empty>
      )}

      {sprintTasks.some((t) => t.status !== "done") && sprint.status !== "completed" && (
        <details>
          <summary className="cursor-pointer text-sm text-stone-500">Take tasks out of this sprint</summary>
          <ul className="mt-2 space-y-1">
            {sprintTasks
              .filter((t) => t.status !== "done")
              .map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-stone-400">
                    {t.projectKey}-{t.number}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <form action={setTaskSprint}>
                    <input type="hidden" name="taskId" value={t.id} />
                    <input type="hidden" name="sprintId" value="" />
                    <button className="text-xs text-stone-500 hover:text-red-700">Remove</button>
                  </form>
                </li>
              ))}
          </ul>
        </details>
      )}

      {sprint.status !== "completed" && (
        <section className="card p-4">
          <h3 className="mb-1 font-medium">Backlog</h3>
          <p className="mb-3 text-xs text-stone-500">Pending tasks from this product&apos;s projects that aren&apos;t in a sprint.</p>
          {backlog.length ? (
            <form action={addTasksToSprint}>
              <input type="hidden" name="sprintId" value={sprint.id} />
              <ul className="max-h-96 space-y-0.5 overflow-y-auto">
                {backlog.map((t) => (
                  <li key={t.id}>
                    <label className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-stone-50">
                      <input type="checkbox" name="taskId" value={t.id} />
                      <span className="w-16 shrink-0 font-mono text-xs text-stone-400">
                        {t.projectKey}-{t.number}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      {t.assigneeName && <Avatar name={t.assigneeName} />}
                    </label>
                  </li>
                ))}
              </ul>
              <button className="btn-secondary mt-3">Add ticked tasks to {sprint.name}</button>
            </form>
          ) : (
            <p className="text-sm text-stone-500">The backlog is empty.</p>
          )}
        </section>
      )}

      <details className="max-w-xl">
        <summary className="cursor-pointer text-sm text-stone-500">Sprint settings</summary>
        <form action={updateSprint} key={sprint.updatedAt.getTime()} className="card mt-3 space-y-2 p-4">
          <input type="hidden" name="sprintId" value={sprint.id} />
          <input className="input" name="name" defaultValue={sprint.name} required aria-label="Sprint name" />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-stone-500">
              Starts
              <input className="input mt-0.5 py-1.5" type="date" name="startDate" defaultValue={sprint.startDate ?? ""} />
            </label>
            <label className="text-xs text-stone-500">
              Ends
              <input className="input mt-0.5 py-1.5" type="date" name="endDate" defaultValue={sprint.endDate ?? ""} />
            </label>
          </div>
          <textarea className="input" name="goal" rows={2} defaultValue={sprint.goal} placeholder="Sprint goal" />
          <button className="btn-secondary">Save</button>
        </form>
        <div className="mt-3 flex gap-2">
          {sprint.status === "completed" && (
            <form action={setSprintStatus}>
              <input type="hidden" name="sprintId" value={sprint.id} />
              <input type="hidden" name="status" value="active" />
              <button className="btn-secondary">Reopen sprint</button>
            </form>
          )}
          <form action={deleteSprint}>
            <input type="hidden" name="sprintId" value={sprint.id} />
            <ConfirmButton className="btn-danger" message={`Delete ${sprint.name}? Its tasks stay, just without a sprint.`}>
              Delete sprint
            </ConfirmButton>
          </form>
        </div>
      </details>
    </div>
  );
}

// ---------- people ----------

async function PeopleTab({ productId }: { productId: string }) {
  const [members, users] = await Promise.all([getProductMembers(productId), getActiveUsers()]);
  const memberIds = new Set(members.map((m) => m.userId));
  const others = users.filter((u) => !memberIds.has(u.id));

  return (
    <div className="max-w-2xl space-y-6">
      {members.length ? (
        <ul className="card divide-y divide-stone-100">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <Avatar name={m.name} size="md" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{m.name}</div>
                <div className="truncate text-xs text-stone-500">{m.email}</div>
              </div>
              <form action={updateMemberRole} key={m.role}>
                <input type="hidden" name="productId" value={productId} />
                <input type="hidden" name="userId" value={m.userId} />
                <input className="input w-40 py-1 text-sm" name="role" defaultValue={m.role} placeholder="Role" aria-label={`Role of ${m.name}`} />
              </form>
              <form action={removeProductMember}>
                <input type="hidden" name="productId" value={productId} />
                <input type="hidden" name="userId" value={m.userId} />
                <button className="text-xs text-stone-500 hover:text-red-700">Remove</button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Nobody is on this product yet.</Empty>
      )}
      <p className="text-xs text-stone-500">Edit a role and press Enter to save it.</p>

      <section className="card p-4">
        <h2 className="mb-3 font-medium">Add a person</h2>
        {others.length ? (
          <ActionForm action={addProductMember} submitLabel="Add" className="flex flex-wrap items-end gap-2" resetOnSuccess>
            <input type="hidden" name="productId" value={productId} />
            <select className="input w-56" name="userId" defaultValue="" required aria-label="Person">
              <option value="" disabled>
                Pick a person…
              </option>
              {others.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <input className="input w-48" name="role" placeholder="Role, e.g. Developer" aria-label="Role" />
          </ActionForm>
        ) : (
          <p className="text-sm text-stone-500">Everyone in the workspace is already on this product.</p>
        )}
      </section>
    </div>
  );
}

// ---------- docs ----------

async function DocsTab({ productId }: { productId: string }) {
  const [linked, linkable] = await Promise.all([getProductDocs(productId), getLinkableDocs(productId)]);

  return (
    <div className="max-w-2xl space-y-6">
      {linked.length ? (
        <ul className="card divide-y divide-stone-100">
          {linked.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
              <Link href={`/docs/${d.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                {d.icon ?? "📄"} {d.title || "Untitled"}
              </Link>
              <span className="text-xs text-stone-500">edited {formatDate(toISO(d.updatedAt))}</span>
              <form action={linkDocToProduct}>
                <input type="hidden" name="docId" value={d.id} />
                <input type="hidden" name="productId" value="" />
                <button className="text-xs text-stone-500 hover:text-red-700" title="The page itself is kept">
                  Unlink
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No documents linked yet.</Empty>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-3 font-medium">New document</h2>
          <form action={createProductDoc} className="space-y-2">
            <input type="hidden" name="productId" value={productId} />
            <input className="input" name="title" placeholder="e.g. Build plan" aria-label="Title" />
            <button className="btn-secondary">Create and open</button>
          </form>
        </section>
        <section className="card p-4">
          <h2 className="mb-3 font-medium">Link an existing page</h2>
          {linkable.length ? (
            <form action={linkDocToProduct} className="space-y-2">
              <input type="hidden" name="productId" value={productId} />
              <select className="input" name="docId" defaultValue="" required aria-label="Page">
                <option value="" disabled>
                  Pick a page…
                </option>
                {linkable.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title || "Untitled"}
                    {d.productId ? " (linked to another product)" : ""}
                  </option>
                ))}
              </select>
              <button className="btn-secondary">Link</button>
            </form>
          ) : (
            <p className="text-sm text-stone-500">No other pages to link.</p>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------- bits ----------

function SectionHead({ title, href, link }: { title: string; href: string; link: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h2 className="label mb-0">{title}</h2>
      <Link href={href} className="text-xs text-stone-500 hover:underline">
        {link} →
      </Link>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500">{children}</p>;
}

function SprintDates({ s }: { s: { startDate: string | null; endDate: string | null } }) {
  if (!s.startDate && !s.endDate) return null;
  return (
    <div className="text-xs text-stone-500">
      {s.startDate ? formatDate(s.startDate) : "?"} – {s.endDate ? formatDate(s.endDate) : "?"}
    </div>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mt-2">
      <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs text-stone-500">
        {done}/{total} tasks done
      </div>
    </div>
  );
}
