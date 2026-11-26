import Link from "next/link";
import { and, asc, count, eq, ne } from "drizzle-orm";
import { db, projects, tasks } from "@/db";
import { requireUser } from "@/lib/auth";
import { createProject, setProjectArchived } from "@/actions/tasks";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const user = await requireUser();
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      key: projects.key,
      description: projects.description,
      archived: projects.archived,
      open: count(tasks.id),
    })
    .from(projects)
    .leftJoin(tasks, and(eq(tasks.projectId, projects.id), ne(tasks.status, "done")))
    .groupBy(projects.id)
    .orderBy(asc(projects.archived), asc(projects.name));

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 md:px-8 md:py-8">
      <PageHeader title="Projects" subtitle="Each project has its own board and task numbering." />

      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        {rows.map((p) => (
          <div key={p.id} className={`card p-4 ${p.archived ? "opacity-60" : ""}`}>
            <Link href={`/projects/${p.id}`} className="block">
              <div className="flex items-center gap-2">
                <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs text-stone-500">{p.key}</span>
                <span className="font-medium">{p.name}</span>
              </div>
              {p.description && <p className="mt-2 line-clamp-2 text-sm text-stone-500">{p.description}</p>}
              <p className="mt-3 text-xs text-stone-500">
                {p.open} open {p.open === 1 ? "task" : "tasks"}
                {p.archived && " · archived"}
              </p>
            </Link>
            {user.role === "admin" && p.archived && (
              <form action={setProjectArchived} className="mt-2">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="archived" value="false" />
                <button className="text-xs text-stone-500 underline">Restore</button>
              </form>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-stone-500">No projects yet. Create the first one below.</p>}
      </div>

      <section className="card p-5">
        <h2 className="mb-4 font-medium">New project</h2>
        <ActionForm action={createProject} submitLabel="Create project" className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="label" htmlFor="name">Name</label>
            <input className="input" id="name" name="name" placeholder="Client onboarding" required />
          </div>
          <div>
            <label className="label" htmlFor="key">Key</label>
            <input className="input uppercase" id="key" name="key" placeholder="ONB" maxLength={6} required />
          </div>
          <div className="col-span-3">
            <label className="label" htmlFor="description">Description</label>
            <textarea className="input" id="description" name="description" rows={2} />
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
