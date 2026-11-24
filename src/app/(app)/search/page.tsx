import Link from "next/link";
import { desc, ilike, or } from "drizzle-orm";
import { db, docs, tasks } from "@/db";
import { requireUser } from "@/lib/auth";
import { queryTasks } from "@/lib/tasks-query";
import { PageHeader } from "@/components/page-header";
import { TaskList } from "@/components/task-list";

export const metadata = { title: "Search" };

function snippet(text: string, q: string) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text.slice(0, 160);
  const start = Math.max(0, i - 60);
  return (start > 0 ? "…" : "") + text.slice(start, i + q.length + 100) + "…";
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const pattern = `%${q.replace(/[%_]/g, "\\$&")}%`;

  const [docHits, taskHits] = q
    ? await Promise.all([
        db
          .select({ id: docs.id, title: docs.title, icon: docs.icon, text: docs.contentText })
          .from(docs)
          .where(or(ilike(docs.title, pattern), ilike(docs.contentText, pattern)))
          .orderBy(desc(docs.updatedAt))
          .limit(30),
        queryTasks([or(ilike(tasks.title, pattern), ilike(tasks.description, pattern))!]),
      ])
    : [[], []];

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <PageHeader title="Search" />
      <form className="mb-8">
        <input className="input text-base" name="q" defaultValue={q} placeholder="Search docs and tasks…" autoFocus />
      </form>
      {q && (
        <>
          <h2 className="mb-2 text-sm font-medium text-stone-700">Docs ({docHits.length})</h2>
          <div className="card mb-8 divide-y divide-stone-100">
            {docHits.map((d) => (
              <Link key={d.id} href={`/docs/${d.id}`} className="block px-4 py-3 hover:bg-stone-50">
                <div className="text-sm font-medium">
                  {d.icon ? `${d.icon} ` : ""}
                  {d.title || "Untitled"}
                </div>
                <div className="mt-0.5 line-clamp-2 text-xs text-stone-500">{snippet(d.text, q)}</div>
              </Link>
            ))}
            {docHits.length === 0 && <p className="px-4 py-3 text-sm text-stone-500">No matching docs.</p>}
          </div>
          <h2 className="mb-2 text-sm font-medium text-stone-700">Tasks ({taskHits.length})</h2>
          <TaskList tasks={taskHits.slice(0, 50)} showProject empty="No matching tasks." />
        </>
      )}
    </div>
  );
}
