import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDocTree, type DocNode } from "@/lib/data";
import { createDoc } from "@/actions/docs";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Docs" };

function Tree({ nodes }: { nodes: DocNode[] }) {
  return (
    <ul className="space-y-1 border-l border-stone-200 pl-4">
      {nodes.map((n) => (
        <li key={n.id}>
          <Link href={`/docs/${n.id}`} className="text-sm hover:underline">
            {n.icon ? `${n.icon} ` : "📄 "}
            {n.title || "Untitled"}
          </Link>
          {n.children.length > 0 && <Tree nodes={n.children} />}
        </li>
      ))}
    </ul>
  );
}

export default async function DocsPage() {
  await requireUser();
  const tree = await getDocTree();
  return (
    <div className="mx-auto max-w-3xl px-4 py-5 md:px-8 md:py-8">
      <PageHeader
        title="Docs"
        subtitle="Company knowledge, processes and client context. Pages can nest as deep as you like."
        actions={
          <form action={createDoc}>
            <button className="btn">New page</button>
          </form>
        }
      />
      {tree.length ? (
        <div className="card p-5">
          <Tree nodes={tree} />
        </div>
      ) : (
        <p className="text-sm text-stone-500">
          No pages yet. Create one, or <Link href="/settings/import" className="underline">import from Notion</Link>.
        </p>
      )}
    </div>
  );
}
