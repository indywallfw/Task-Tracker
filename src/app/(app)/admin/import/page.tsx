import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { NotionImportForm } from "@/components/notion-import-form";

export const metadata = { title: "Import from Notion" };

export default async function ImportPage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <PageHeader title="Import from Notion" subtitle="Bring your existing pages and databases across." />

      <section className="card mb-6 p-5 text-sm leading-6">
        <h2 className="mb-2 font-medium">1. Export from Notion</h2>
        <ol className="list-decimal space-y-1 pl-5 text-stone-700">
          <li>In Notion, open <strong>Settings → General → Export all workspace content</strong> (or use ••• → Export on a single page).</li>
          <li>Choose <strong>Markdown &amp; CSV</strong>, and turn on <strong>Include subpages</strong>.</li>
          <li>Download the .zip Notion emails you. Don&apos;t unzip it.</li>
        </ol>
        <p className="mt-3 text-stone-500">
          Tip: add your team on the People page first, so Notion assignees can be matched to them by name or email.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="mb-4 font-medium">2. Upload the export</h2>
        <NotionImportForm />
      </section>
    </div>
  );
}
