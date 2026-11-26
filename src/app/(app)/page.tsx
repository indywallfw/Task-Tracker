import Link from "next/link";
import { desc, eq, ne } from "drizzle-orm";
import { db, docs, tasks, users } from "@/db";
import { requireUser } from "@/lib/auth";
import { queryTasks } from "@/lib/tasks-query";
import { leadFilters, queryLeads } from "@/lib/leads";
import { LeadList } from "@/components/lead-list";
import { todayISO } from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { TaskList } from "@/components/task-list";

export const metadata = { title: "My work" };

export default async function HomePage() {
  const user = await requireUser();
  const [mine, recentDocs, myLeads] = await Promise.all([
    queryTasks([eq(tasks.assigneeId, user.id), ne(tasks.status, "done")]),
    db
      .select({ id: docs.id, title: docs.title, icon: docs.icon, updatedAt: docs.updatedAt, by: users.name })
      .from(docs)
      .leftJoin(users, eq(users.id, docs.updatedById))
      .orderBy(desc(docs.updatedAt))
      .limit(8),
    queryLeads(leadFilters({ owner: "me", openOnly: true, meId: user.id })),
  ]);

  const today = todayISO();
  const weekAhead = todayISO(7);
  const overdue = mine.filter((t) => t.dueDate && t.dueDate < today);
  const soon = mine.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= weekAhead);
  const later = mine.filter((t) => !t.dueDate || t.dueDate > weekAhead);
  const followUps = myLeads
    .filter((l) => l.nextFollowUp && l.nextFollowUp <= weekAhead)
    .sort((a, b) => a.nextFollowUp!.localeCompare(b.nextFollowUp!));

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 md:px-8 md:py-8">
      <PageHeader
        title={`Hi, ${user.name.split(" ")[0]}`}
        subtitle={`${mine.length} open ${mine.length === 1 ? "task is" : "tasks are"} assigned to you.`}
      />

      {overdue.length > 0 && (
        <Section title="Overdue">
          <TaskList tasks={overdue} showProject />
        </Section>
      )}
      <Section title="Due in the next 7 days">
        <TaskList tasks={soon} showProject empty="Nothing due this week." />
      </Section>
      {followUps.length > 0 && (
        <Section title="Lead follow-ups this week">
          <LeadList leads={followUps} />
        </Section>
      )}
      <Section title="Later / no due date">
        <TaskList tasks={later} showProject empty="Nothing else assigned to you." />
      </Section>

      <Section title="Recently updated docs">
        <div className="card divide-y divide-stone-100">
          {recentDocs.map((d) => (
            <Link key={d.id} href={`/docs/${d.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-stone-50">
              <span className="min-w-0 flex-1 truncate">
                {d.icon ? `${d.icon} ` : ""}
                {d.title || "Untitled"}
              </span>
              <span className="text-xs text-stone-500">
                {d.by ? `${d.by} · ` : ""}
                {d.updatedAt.toLocaleDateString()}
              </span>
            </Link>
          ))}
          {recentDocs.length === 0 && <p className="px-4 py-3 text-sm text-stone-500">No docs yet.</p>}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-medium text-stone-700">{title}</h2>
      {children}
    </section>
  );
}
