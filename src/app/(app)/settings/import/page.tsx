import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { NotionImportForm } from "@/components/notion-import-form";
import { TickTickImportForm } from "@/components/ticktick-import-form";

export const metadata = { title: "Import" };

export default async function ImportPage() {
  const user = await requireUser();
  return (
    <div className="space-y-10">
      <div className="space-y-6">
        <h2 className="text-lg font-semibold">TickTick → your To-dos</h2>
        <section className="card p-5 text-sm leading-6">
          <h3 className="mb-2 font-medium">1. Back up TickTick</h3>
          <ol className="list-decimal space-y-1 pl-5 text-stone-700">
            <li>
              In TickTick on the web, open <strong>Settings</strong>, find <strong>Backup</strong> under Account, and click <strong>Generate backup</strong>.
            </li>
            <li>Save the .csv file it downloads.</li>
          </ol>
          <p className="mt-3 text-stone-500">
            Lists and their colours, dates and times, priority, tags, notes, checklists, sub-tasks, repeats, reminders and
            done tasks all come across. Importing again later updates what&apos;s already here, so nothing is doubled. Using
            Claude with the TickTick connector? Ask it to sync TickTick into your To-dos instead.
          </p>
        </section>
        <section className="card p-5">
          <h3 className="mb-4 font-medium">2. Upload the backup</h3>
          <TickTickImportForm />
        </section>
      </div>

      {user.role === "admin" && (
      <div className="space-y-6">
      <h2 className="text-lg font-semibold">Notion → docs and projects</h2>
      <p className="text-sm text-stone-500">Bring your existing Notion pages and databases across.</p>

      <section className="card p-5 text-sm leading-6">
        <h2 className="mb-2 font-medium">1. Export from Notion</h2>
        <ol className="list-decimal space-y-1 pl-5 text-stone-700">
          <li>In Notion, open <strong>Settings → General → Export all workspace content</strong> (or use ••• → Export on a single page).</li>
          <li>Choose <strong>Markdown &amp; CSV</strong>, and turn on <strong>Include subpages</strong>.</li>
          <li>Download the .zip Notion emails you. Don&apos;t unzip it.</li>
        </ol>
        <p className="mt-3 text-stone-500">
          Tip: add your team on the{" "}
          <Link href="/settings/people" className="underline">
            People
          </Link>{" "}
          tab first, so Notion assignees can be matched to them by name or email.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="mb-4 font-medium">2. Upload the export</h2>
        <NotionImportForm />
      </section>
      </div>
      )}
    </div>
  );
}
