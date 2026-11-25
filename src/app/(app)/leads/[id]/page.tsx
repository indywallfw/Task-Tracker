import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db, leadActivities, leads, tasks, users } from "@/db";
import { requireUser } from "@/lib/auth";
import { getActiveProjects, getActiveUsers } from "@/lib/data";
import { queryTasks } from "@/lib/tasks-query";
import { ACTIVITY_KINDS, LEAD_PRODUCTS, LEAD_SOURCES, LEAD_STAGES } from "@/lib/constants";
import {
  addLeadActivity,
  createLeadTask,
  deleteLead,
  deleteLeadActivity,
  updateLead,
  updateLeadField,
} from "@/actions/leads";
import { ActionForm } from "@/components/action-form";
import { AutoSubmitInput, AutoSubmitSelect } from "@/components/auto-submit";
import { Avatar } from "@/components/avatar";
import { ConfirmButton } from "@/components/confirm-button";
import { TaskList } from "@/components/task-list";

const creator = alias(users, "creator");
const isId = (v: string) => z.string().uuid().safeParse(v).success;

export async function generateMetadata({ params }: PageProps<"/leads/[id]">) {
  const { id } = await params;
  if (!isId(id)) return {};
  const [l] = await db.select({ company: leads.company }).from(leads).where(eq(leads.id, id));
  return { title: l?.company ?? "Lead" };
}

const KIND_ICON: Record<string, string> = { note: "📝", call: "📞", email: "✉️", meeting: "🤝", stage: "➜" };

export default async function LeadPage({ params }: PageProps<"/leads/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!isId(id)) notFound();
  const [row] = await db
    .select({ lead: leads, creatorName: creator.name })
    .from(leads)
    .leftJoin(creator, eq(creator.id, leads.createdById))
    .where(eq(leads.id, id));
  if (!row) notFound();
  const { lead } = row;

  const [people, projectList, log, followUps] = await Promise.all([
    getActiveUsers(),
    getActiveProjects(),
    db
      .select({
        id: leadActivities.id,
        kind: leadActivities.kind,
        body: leadActivities.body,
        createdAt: leadActivities.createdAt,
        authorId: leadActivities.authorId,
        author: users.name,
      })
      .from(leadActivities)
      .leftJoin(users, eq(users.id, leadActivities.authorId))
      .where(eq(leadActivities.leadId, id))
      .orderBy(desc(leadActivities.createdAt)),
    queryTasks([eq(tasks.leadId, id)]),
  ]);
  const savedKey = lead.updatedAt.getTime();

  return (
    <div className="mx-auto flex max-w-6xl gap-10 px-8 py-8">
      <div className="min-w-0 flex-1">
        <nav className="mb-3 text-sm text-stone-500">
          <Link href="/leads" className="hover:underline">
            Leads
          </Link>{" "}
          / {lead.company}
        </nav>

        {/* keyed on updatedAt so the fields show the saved values after each save */}
        <ActionForm action={updateLead} submitLabel="Save details" className="space-y-4" key={savedKey}>
          <input type="hidden" name="id" value={lead.id} />
          <input
            name="company"
            defaultValue={lead.company}
            required
            className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none"
            aria-label="Company"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Contact name" name="contactName" value={lead.contactName} />
            <Field label="Email" name="email" type="email" value={lead.email} />
            <Field label="Phone" name="phone" type="tel" value={lead.phone} />
            <Field label="Website" name="website" value={lead.website} />
          </div>
          <div>
            <label className="label" htmlFor="notes">
              Notes
            </label>
            <textarea
              className="input"
              id="notes"
              name="notes"
              rows={5}
              defaultValue={lead.notes}
              placeholder="What they need, budget, decision makers, competitors…"
            />
          </div>
        </ActionForm>
        {(lead.email || lead.phone || lead.website) && (
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            {lead.email && (
              <a className="text-blue-700 underline" href={`mailto:${lead.email}`}>
                Email {lead.contactName || lead.email}
              </a>
            )}
            {lead.phone && (
              <a className="text-blue-700 underline" href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}>
                Call {lead.phone}
              </a>
            )}
            {lead.website && (
              <a
                className="text-blue-700 underline"
                href={/^https?:\/\//i.test(lead.website) ? lead.website : `https://${lead.website}`}
                target="_blank"
                rel="noreferrer"
              >
                Open website
              </a>
            )}
          </div>
        )}

        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-stone-700">Follow-up tasks</h2>
          <TaskList tasks={followUps} showProject empty="No tasks for this lead yet." />
          {projectList.length > 0 ? (
            <ActionForm action={createLeadTask} submitLabel="Add task" className="mt-3 flex flex-wrap items-center gap-2" resetOnSuccess>
              <input type="hidden" name="leadId" value={lead.id} />
              <input className="input min-w-56 flex-1 py-1.5" name="title" placeholder="e.g. Send proposal" required aria-label="Task title" />
              <select className="input w-44 py-1.5" name="projectId" defaultValue={projectList[0].id} aria-label="Project">
                {projectList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.key} · {p.name}
                  </option>
                ))}
              </select>
              <select className="input w-40 py-1.5" name="assigneeId" defaultValue={lead.ownerId ?? user.id} aria-label="Assignee">
                <option value="">Unassigned</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input className="input w-40 py-1.5" type="date" name="dueDate" aria-label="Due date" />
            </ActionForm>
          ) : (
            <p className="mt-2 text-sm text-stone-500">
              <Link href="/projects" className="underline">
                Create a project
              </Link>{" "}
              (for example &ldquo;Sales&rdquo;) to add follow-up tasks.
            </p>
          )}
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-stone-700">Activity</h2>
          <ActionForm action={addLeadActivity} submitLabel="Log" className="mb-5 space-y-2" resetOnSuccess>
            <input type="hidden" name="leadId" value={lead.id} />
            <div className="flex gap-2">
              <select className="input w-32 py-1.5" name="kind" defaultValue="call" aria-label="Activity type">
                {ACTIVITY_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
              <textarea className="input" name="body" rows={2} placeholder="What happened, what was agreed, next step…" required />
            </div>
          </ActionForm>
          <ol className="space-y-4">
            {log.map((a) => (
              <li key={a.id} className="flex gap-3">
                <span className="w-6 shrink-0 text-center" title={a.kind}>
                  {KIND_ICON[a.kind] ?? "•"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-stone-500">
                    <span className="font-medium text-stone-700">{a.author ?? "Former user"}</span>
                    {a.createdAt.toLocaleString()}
                    {a.kind !== "stage" && (a.authorId === user.id || user.role === "admin") && (
                      <form action={deleteLeadActivity} className="ml-auto">
                        <input type="hidden" name="id" value={a.id} />
                        <button className="text-stone-400 hover:text-red-700">Delete</button>
                      </form>
                    )}
                  </div>
                  <p className={`mt-0.5 whitespace-pre-wrap text-sm ${a.kind === "stage" ? "text-stone-500" : ""}`}>{a.body}</p>
                </div>
              </li>
            ))}
            {log.length === 0 && <p className="text-sm text-stone-400">Nothing logged yet.</p>}
          </ol>
        </section>
      </div>

      <aside key={savedKey} className="w-64 shrink-0 space-y-5 pt-8">
        <Property label="Stage">
          <form action={updateLeadField}>
            <input type="hidden" name="id" value={lead.id} />
            <AutoSubmitSelect className="input py-1.5" name="stage" defaultValue={lead.stage}>
              {LEAD_STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </AutoSubmitSelect>
          </form>
        </Property>
        <Property label="Owner">
          <form action={updateLeadField}>
            <input type="hidden" name="id" value={lead.id} />
            <AutoSubmitSelect className="input py-1.5" name="ownerId" defaultValue={lead.ownerId ?? ""}>
              <option value="">No owner</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </AutoSubmitSelect>
          </form>
        </Property>
        <Property label="Next follow-up">
          <form action={updateLeadField}>
            <input type="hidden" name="id" value={lead.id} />
            <AutoSubmitInput className="input py-1.5" type="date" name="nextFollowUp" defaultValue={lead.nextFollowUp ?? ""} />
          </form>
        </Property>
        <Property label="Source">
          <form action={updateLeadField}>
            <input type="hidden" name="id" value={lead.id} />
            <AutoSubmitSelect className="input py-1.5" name="source" defaultValue={lead.source}>
              <option value="">Unknown</option>
              {LEAD_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </AutoSubmitSelect>
          </form>
        </Property>
        <Property label="Interested in">
          <ActionForm action={updateLead} submitLabel="Save products" className="space-y-1.5">
            <input type="hidden" name="id" value={lead.id} />
            <input type="hidden" name="productsField" value="1" />
            {LEAD_PRODUCTS.map((p) => (
              <label key={p.value} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="products" value={p.value} defaultChecked={lead.products.includes(p.value)} />
                {p.label}
              </label>
            ))}
          </ActionForm>
        </Property>
        <div className="border-t border-stone-200 pt-4 text-xs text-stone-500">
          <p className="flex items-center gap-1.5">
            Added by {row.creatorName ?? "unknown"} <Avatar name={row.creatorName} />
          </p>
          <p>{lead.createdAt.toLocaleString()}</p>
          {lead.closedAt && (
            <p>
              {lead.stage === "won" ? "Won" : "Closed"} {lead.closedAt.toLocaleDateString()}
            </p>
          )}
        </div>
        <form action={deleteLead}>
          <input type="hidden" name="id" value={lead.id} />
          <ConfirmButton className="btn-danger w-full" message="Delete this lead and its activity log? Linked tasks are kept.">
            Delete lead
          </ConfirmButton>
        </form>
      </aside>
    </div>
  );
}

function Field({ label, name, value, type = "text" }: { label: string; name: string; value: string; type?: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input className="input" id={name} name={name} type={type} defaultValue={value} />
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
