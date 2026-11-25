import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { comments, db, docs, leads, projects, tasks, users } from "@/db";
import { requireUser } from "@/lib/auth";
import { getActiveUsers } from "@/lib/data";
import { PRIORITIES, STATUSES } from "@/lib/constants";
import { addComment, deleteComment, deleteTask, updateTask } from "@/actions/tasks";
import { ActionForm } from "@/components/action-form";
import { AutoSubmitInput, AutoSubmitSelect } from "@/components/auto-submit";
import { Avatar } from "@/components/avatar";
import { ConfirmButton } from "@/components/confirm-button";
import { TaskDescription } from "@/components/task-description";

const creator = alias(users, "creator");

const isId = (v: string) => z.string().uuid().safeParse(v).success;

export async function generateMetadata({ params }: PageProps<"/tasks/[id]">) {
  const { id } = await params;
  if (!isId(id)) return {};
  const [t] = await db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, id));
  return { title: t?.title ?? "Task" };
}

export default async function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const [row] = await db
    .select({ task: tasks, project: projects, creatorName: creator.name })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(creator, eq(creator.id, tasks.creatorId))
    .where(eq(tasks.id, id));
  if (!row) notFound();
  const { task, project } = row;

  const [people, thread, docList] = await Promise.all([
    getActiveUsers(),
    db
      .select({ id: comments.id, body: comments.body, createdAt: comments.createdAt, authorId: comments.authorId, author: users.name })
      .from(comments)
      .leftJoin(users, eq(users.id, comments.authorId))
      .where(eq(comments.taskId, id))
      .orderBy(asc(comments.createdAt)),
    db.select({ id: docs.id, title: docs.title }).from(docs).orderBy(asc(docs.title)),
  ]);
  const [lead] = task.leadId
    ? await db.select({ id: leads.id, company: leads.company }).from(leads).where(eq(leads.id, task.leadId))
    : [];
  const linkedDoc = docList.find((d) => d.id === task.linkedDocId);

  return (
    <div className="mx-auto flex max-w-6xl gap-10 px-8 py-8">
      <div className="min-w-0 flex-1">
        <nav className="mb-3 text-sm text-stone-500">
          <Link href={`/projects/${project.id}`} className="hover:underline">
            {project.name}
          </Link>{" "}
          / <span className="font-mono">{project.key}-{task.number}</span>
          {lead && (
            <>
              {" · for lead "}
              <Link href={`/leads/${lead.id}`} className="text-blue-700 hover:underline">
                {lead.company}
              </Link>
            </>
          )}
        </nav>

        <form action={updateTask} key={task.title}>
          <input type="hidden" name="id" value={task.id} />
          <input
            name="title"
            defaultValue={task.title}
            className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none"
            aria-label="Title"
          />
          <p className="mt-1 text-xs text-stone-400">Press Enter to save the title.</p>
        </form>

        <div className="mt-6">
          <TaskDescription id={task.id} html={task.description} />
        </div>

        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-stone-700">Comments</h2>
          <div className="space-y-4">
            {thread.map((c) => (
              <div key={c.id} className="flex gap-3">
                <Avatar name={c.author ?? "?"} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-stone-500">
                    <span className="font-medium text-stone-700">{c.author ?? "Former user"}</span>
                    {c.createdAt.toLocaleString()}
                    {(c.authorId === user.id || user.role === "admin") && (
                      <form action={deleteComment} className="ml-auto">
                        <input type="hidden" name="id" value={c.id} />
                        <button className="text-stone-400 hover:text-red-700">Delete</button>
                      </form>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
                </div>
              </div>
            ))}
            {thread.length === 0 && <p className="text-sm text-stone-400">No comments yet.</p>}
          </div>
          <ActionForm action={addComment} submitLabel="Comment" className="mt-4 space-y-2" resetOnSuccess>
            <input type="hidden" name="taskId" value={task.id} />
            <textarea className="input" name="body" rows={3} placeholder="Write a comment…" required />
          </ActionForm>
        </section>
      </div>

      {/* keyed on updatedAt so the fields remount with fresh values after each save */}
      <aside key={task.updatedAt.getTime()} className="w-64 shrink-0 space-y-5 pt-8">
        <Property label="Status">
          <form action={updateTask}>
            <input type="hidden" name="id" value={task.id} />
            <AutoSubmitSelect className="input py-1.5" name="status" defaultValue={task.status}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </AutoSubmitSelect>
          </form>
        </Property>
        <Property label="Assignee">
          <form action={updateTask}>
            <input type="hidden" name="id" value={task.id} />
            <AutoSubmitSelect className="input py-1.5" name="assigneeId" defaultValue={task.assigneeId ?? ""}>
              <option value="">Unassigned</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </AutoSubmitSelect>
          </form>
        </Property>
        <Property label="Priority">
          <form action={updateTask}>
            <input type="hidden" name="id" value={task.id} />
            <AutoSubmitSelect className="input py-1.5" name="priority" defaultValue={task.priority}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </AutoSubmitSelect>
          </form>
        </Property>
        <Property label="Due date">
          <form action={updateTask}>
            <input type="hidden" name="id" value={task.id} />
            <AutoSubmitInput className="input py-1.5" type="date" name="dueDate" defaultValue={task.dueDate ?? ""} />
          </form>
        </Property>
        <Property label="Linked doc">
          <form action={updateTask}>
            <input type="hidden" name="id" value={task.id} />
            <AutoSubmitSelect className="input py-1.5" name="linkedDocId" defaultValue={task.linkedDocId ?? ""}>
              <option value="">None</option>
              {docList.map((d) => (
                <option key={d.id} value={d.id}>{d.title || "Untitled"}</option>
              ))}
            </AutoSubmitSelect>
          </form>
          {linkedDoc && (
            <Link href={`/docs/${linkedDoc.id}`} className="mt-1 block text-sm text-blue-700 underline">
              Open “{linkedDoc.title || "Untitled"}”
            </Link>
          )}
        </Property>
        <div className="border-t border-stone-200 pt-4 text-xs text-stone-500">
          <p>Created by {row.creatorName ?? "unknown"}</p>
          <p>{task.createdAt.toLocaleString()}</p>
          {task.completedAt && <p>Completed {task.completedAt.toLocaleString()}</p>}
        </div>
        <form action={deleteTask}>
          <input type="hidden" name="id" value={task.id} />
          <ConfirmButton className="btn-danger w-full" message="Delete this task and its comments?">
            Delete task
          </ConfirmButton>
        </form>
      </aside>
    </div>
  );
}

function Property({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      {children}
    </div>
  );
}
