import { formatDate, productLabel, stageDot, stageLabel, todayISO } from "@/lib/constants";

export function StagePill({ stage }: { stage: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-stone-600">
      <span className={`h-2 w-2 rounded-full ${stageDot(stage)}`} />
      {stageLabel(stage)}
    </span>
  );
}

const PRODUCT_STYLE: Record<string, string> = {
  firewall: "bg-sky-50 text-sky-800 ring-sky-200",
  vapt: "bg-violet-50 text-violet-800 ring-violet-200",
};
const SHORT: Record<string, string> = { firewall: "Firewall", vapt: "VAPT" };

export function ProductTags({ products }: { products: string[] }) {
  if (!products.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {products.map((p) => (
        <span
          key={p}
          title={productLabel(p)}
          className={`rounded px-1.5 py-0.5 text-[11px] ring-1 ring-inset ${PRODUCT_STYLE[p] ?? "bg-stone-50 text-stone-700 ring-stone-200"}`}
        >
          {SHORT[p] ?? productLabel(p)}
        </span>
      ))}
    </span>
  );
}

/** Next follow-up date, red when it has passed on an open lead. */
export function FollowUp({ date, open = true }: { date: string | null; open?: boolean }) {
  if (!date || !open) return null;
  const late = date < todayISO();
  return (
    <span className={`text-xs ${late ? "font-medium text-red-700" : "text-stone-500"}`}>
      {late ? "Overdue · " : "Follow up "}
      {formatDate(date)}
    </span>
  );
}
