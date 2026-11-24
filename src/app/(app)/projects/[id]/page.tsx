import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, projects, tasks } from "@/db";
import { requireUser } from "@/lib/auth";
import { getActiveUsers } from "@/lib/data";
import { assigneeFilter, queryTasks, titleFilter } from "@/lib/tasks-query";
import { STATUSES } from "@/lib/constants";
import { setProjectArchived, updateProject } from "@/actions/tasks";
import { PageHeader } from "@/components/page-header";
import { Kanban } from "@/components/kanban";
import { TaskList } from "@/components/task-list";
import { QuickAddTask } from "@/components/quick-add-task";

const isId = (v: string) => z.string().uuid().safeParse(v).success;

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

  const view = sp.view === "list" ? "list" : "board";
  const assignee = typeof sp.assignee === "string" ? sp.assignee : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim() : undefined;

  const where = [eq(tasks.projectId, id), assigneeFilter(assignee, user.id), titleFilter(q)].filter(
    Boolean,
  ) as SQL[];
  const [rows, people] = await Promise.all([queryTasks(where), getActiveUsers()]);

  const link = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { view, assignee, q, ...patch };
    Object.entries(merged).forEach(([k, v]) => v && next.set(k, v));
    return `/projects/${id}?${next}`;
  };

  return (
    <div className="px-8 py-8">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-sm text-stone-500">{project.key}</span>
            {project.name}
          </span>
        }
        subtitle={project.description || undefined}
        actions={
          <div className="flex rounded-md border border-stone-300 bg-white p-0.5 text-sm">
            {(["board", "list"] as const).map((v) => (
              <Link
                key={v}
                href={link({ view: v })}
                className={`rounded px-3 py-1 capitalize ${view === v ? "bg-stone-900 text-white" : "text-stone-600"}`}
              >
                {v}
              </Link>
            ))}
          </div>
        }
      />

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
        <TaskList tasks={rows} showProject={false} />
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
            <label className="label" htmlFor="pdesc">Description</label>
            <textarea className="input" id="pdesc" name="description" rows={2} defaultValue={project.description} />
          </div>
          <button className="btn-secondary">Save</button>
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
