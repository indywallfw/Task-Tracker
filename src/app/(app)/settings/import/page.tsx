import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { NotionImportForm } from "@/components/notion-import-form";

export const metadata = { title: "Import from Notion" };

export default async function ImportPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
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
  );
}
