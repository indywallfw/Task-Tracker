import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getProductCards } from "@/lib/products";
import { createProduct, setProductArchived } from "@/actions/products";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Products" };

export default async function ProductsPage() {
  const user = await requireUser();
  const rows = await getProductCards();

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 md:px-8 md:py-8">
      <PageHeader
        title="Products"
        subtitle="Each product holds its projects, team, tasks, sprints and documents."
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        {rows.map((p) => (
          <div key={p.id} className={`card p-4 ${p.archived ? "opacity-60" : ""}`}>
            <Link href={`/products/${p.id}`} className="block">
              <div className="font-medium">{p.name}</div>
              {p.description && <p className="mt-1 line-clamp-2 text-sm text-stone-500">{p.description}</p>}
              <p className="mt-3 flex flex-wrap gap-x-3 text-xs text-stone-500">
                <span>
                  {p.pendingProjects} pending {p.pendingProjects === 1 ? "project" : "projects"}
                </span>
                <span>
                  {p.openTasks} open {p.openTasks === 1 ? "task" : "tasks"}
                </span>
                <span>
                  {p.members} {p.members === 1 ? "person" : "people"}
                </span>
                {p.archived && <span>archived</span>}
              </p>
            </Link>
            {user.role === "admin" && p.archived && (
              <form action={setProductArchived} className="mt-2">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="archived" value="false" />
                <button className="text-xs text-stone-500 underline">Restore</button>
              </form>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-stone-500">No products yet. Create the first one below.</p>}
      </div>

      <section className="card p-5">
        <h2 className="mb-4 font-medium">New product</h2>
        <ActionForm action={createProduct} submitLabel="Create product">
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input className="input" id="name" name="name" placeholder="e.g. Indywall Firewall" required />
          </div>
          <div>
            <label className="label" htmlFor="description">Description</label>
            <textarea className="input" id="description" name="description" rows={3} />
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
