import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActiveUsers } from "@/lib/data";
import { leadFilters, queryLeads } from "@/lib/leads";
import { LEAD_PRODUCTS, LEAD_STAGES } from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { LeadBoard } from "@/components/lead-board";
import { LeadList } from "@/components/lead-list";
import { QuickAddLead } from "@/components/quick-add-lead";

export const metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const user = await requireUser();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string).trim() : undefined);
  const view = sp.view === "list" ? "list" : "board";
  const q = str("q");
  const owner = str("owner");
  const product = str("product");
  const closed = sp.closed === "1";

  const [rows, people] = await Promise.all([
    queryLeads(leadFilters({ q, owner, product, openOnly: !closed, meId: user.id })),
    getActiveUsers(),
  ]);
  const stages = LEAD_STAGES.filter((s) => closed || s.open).map((s) => ({ ...s }));
  const openCount = rows.filter((l) => LEAD_STAGES.find((s) => s.value === l.stage)?.open).length;

  const link = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { view, q, owner, product, closed: closed ? "1" : undefined, ...patch };
    Object.entries(merged).forEach(([k, v]) => v && next.set(k, v));
    return `/leads?${next}`;
  };

  return (
    <div className="px-4 py-5 md:px-8 md:py-8">
      <PageHeader
        title="Leads"
        subtitle={`${openCount} open ${openCount === 1 ? "lead" : "leads"} in the pipeline.`}
        actions={
          <div className="flex rounded-md border border-stone-300 bg-white p-0.5 text-sm">
            {(["board", "list"] as const).map((v) => (
              <Link
                key={v}
                href={link({ view: v })}
                className={`rounded px-3 py-1 capitalize ${view === v ? "bg-stone-900 text-white" : "text-stone-600"}`}
              >
                {v}
              </Link>
            ))}
          </div>
        }
      />

      <form className="mb-5 flex flex-wrap items-center gap-2" action="/leads">
        <input type="hidden" name="view" value={view} />
        <input className="input w-56 py-1.5" name="q" defaultValue={q} placeholder="Company, contact, notes…" />
        <select className="input w-44 py-1.5" name="owner" defaultValue={owner ?? ""} aria-label="Owner">
          <option value="">Any owner</option>
          <option value="me">Owned by me</option>
          <option value="none">No owner</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select className="input w-48 py-1.5" name="product" defaultValue={product ?? ""} aria-label="Product">
          <option value="">Any product</option>
          {LEAD_PRODUCTS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-stone-600">
          <input type="checkbox" name="closed" value="1" defaultChecked={closed} />
          Show won and lost
        </label>
        <button className="btn-secondary py-1.5">Apply</button>
        {(q || owner || product || closed) && (
          <Link href={`/leads?view=${view}`} className="text-sm text-stone-500 underline">
            Clear
          </Link>
        )}
      </form>

      <QuickAddLead people={people} meId={user.id} />

      {view === "board" ? <LeadBoard leads={rows} stages={stages} /> : <LeadList leads={rows} empty="No leads match." />}
    </div>
  );
}
