import Link from "next/link";
import type { LeadCard } from "@/lib/leads";
import { LEAD_STAGES, sourceLabel } from "@/lib/constants";
import { Avatar } from "./avatar";
import { FollowUp, ProductTags, StagePill } from "./lead-bits";

const isOpen = (stage: string) => LEAD_STAGES.find((s) => s.value === stage)?.open ?? true;

export function LeadList({ leads, empty = "No leads here." }: { leads: LeadCard[]; empty?: string }) {
  if (leads.length === 0) return <p className="py-4 text-sm text-stone-500">{empty}</p>;
  const order = new Map(LEAD_STAGES.map((s, i) => [s.value as string, i]));
  const sorted = [...leads].sort(
    (a, b) => (order.get(a.stage) ?? 0) - (order.get(b.stage) ?? 0) || a.position - b.position,
  );
  return (
    <div className="card divide-y divide-stone-100">
      {sorted.map((l) => (
        <Link key={l.id} href={`/leads/${l.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-stone-50">
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">{l.company}</span>
            {l.contactName && <span className="text-stone-500"> · {l.contactName}</span>}
          </span>
          <span className="hidden w-32 md:block">
            <ProductTags products={l.products} />
          </span>
          <span className="hidden w-20 text-xs text-stone-500 lg:block">{l.source ? sourceLabel(l.source) : ""}</span>
          <span className="w-40 text-right">
            <FollowUp date={l.nextFollowUp} open={isOpen(l.stage)} />
          </span>
          <span className="w-28">
            <StagePill stage={l.stage} />
          </span>
          <span className="w-6">
            <Avatar name={l.ownerName} />
          </span>
        </Link>
      ))}
    </div>
  );
}
