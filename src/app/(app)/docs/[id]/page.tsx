import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, docs, projects, tasks, users } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDocPath } from "@/lib/data";
import { createDoc, deleteDoc, moveDoc } from "@/actions/docs";
import { DocEditor } from "@/components/doc-editor";
import { ConfirmButton } from "@/components/confirm-button";
import { AutoSubmitSelect } from "@/components/auto-submit";

const isId = (v: string) => z.string().uuid().safeParse(v).success;

export async function generateMetadata({ params }: PageProps<"/docs/[id]">) {
  const { id } = await params;
  if (!isId(id)) return {};
  const [d] = await db.select({ title: docs.title }).from(docs).where(eq(docs.id, id));
  return { title: d?.title || "Untitled" };
}

export default async function DocPage({ params }: PageProps<"/docs/[id]">) {
  await requireUser();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const [doc] = await db
    .select({ doc: docs, updatedBy: users.name })
    .from(docs)
    .leftJoin(users, eq(users.id, docs.updatedById))
    .where(eq(docs.id, id));
  if (!doc) notFound();

  const [path, children, allDocs, linkedTasks] = await Promise.all([
    getDocPath(id),
    db.select({ id: docs.id, title: docs.title, icon: docs.icon }).from(docs).where(eq(docs.parentId, id)).orderBy(asc(docs.position)),
    db.select({ id: docs.id, title: docs.title }).from(docs).orderBy(asc(docs.title)),
    db
      .select({ id: tasks.id, title: tasks.title, number: tasks.number, key: projects.key, status: tasks.status })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(eq(tasks.linkedDocId, id)),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 md:px-8 md:py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-1 break-words text-sm text-stone-500">
        <Link href="/docs" className="hover:underline">Docs</Link>
        {path.slice(0, -1).map((p) => (
          <span key={p.id} className="min-w-0">
            {" / "}
            <Link href={`/docs/${p.id}`} className="hover:underline">{p.title || "Untitled"}</Link>
          </span>
        ))}
        <span className="ml-auto text-xs">
          Edited {doc.doc.updatedAt.toLocaleString()}
          {doc.updatedBy ? ` by ${doc.updatedBy}` : ""}
        </span>
      </nav>

      {/* key forces a fresh editor when navigating between docs */}
      <DocEditor key={id} id={id} title={doc.doc.title} icon={doc.doc.icon} html={doc.doc.content} />

      {(children.length > 0 || linkedTasks.length > 0) && (
        <div className="mt-10 grid gap-6 border-t border-stone-200 pt-6 sm:grid-cols-2">
          {children.length > 0 && (
            <div>
              <div className="label">Sub-pages</div>
              <ul className="space-y-1 text-sm">
                {children.map((c) => (
                  <li key={c.id}>
                    <Link href={`/docs/${c.id}`} className="hover:underline">
                      {c.icon ? `${c.icon} ` : "📄 "}
                      {c.title || "Untitled"}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {linkedTasks.length > 0 && (
            <div>
              <div className="label">Linked tasks</div>
              <ul className="space-y-1 text-sm">
                {linkedTasks.map((t) => (
                  <li key={t.id}>
                    <Link href={`/tasks/${t.id}`} className="hover:underline">
                      <span className="font-mono text-xs text-stone-400">{t.key}-{t.number}</span> {t.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-stone-200 pt-6">
        <form action={createDoc}>
          <input type="hidden" name="parentId" value={id} />
          <button className="btn-secondary">+ Sub-page</button>
        </form>
        <form action={moveDoc} className="flex min-w-0 items-center gap-2 text-sm text-stone-500">
          <input type="hidden" name="id" value={id} />
          Move under
          <AutoSubmitSelect className="input w-full min-w-0 py-1.5 sm:w-56" name="parentId" defaultValue={doc.doc.parentId ?? ""}>
            <option value="">(Top level)</option>
            {allDocs
              .filter((d) => d.id !== id)
              .map((d) => (
                <option key={d.id} value={d.id}>{d.title || "Untitled"}</option>
              ))}
          </AutoSubmitSelect>
        </form>
        <form action={deleteDoc} className="ml-auto">
          <input type="hidden" name="id" value={id} />
          <ConfirmButton className="btn-danger" message="Delete this page and all of its sub-pages? This can't be undone.">
            Delete page
          </ConfirmButton>
        </form>
      </div>
    </div>
  );
}
