"use client";

import { useActionState, useEffect, useRef } from "react";
import { createLead } from "@/actions/leads";
import { LEAD_PRODUCTS, LEAD_SOURCES } from "@/lib/constants";

export function QuickAddLead({ people, meId }: { people: { id: string; name: string }[]; meId: string }) {
  const [state, action, pending] = useActionState(createLead, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      firstRef.current?.focus();
    }
  }, [state]);

  return (
    <form ref={ref} action={action} className="card mb-6 flex flex-wrap items-center gap-2 p-2">
      <input
        ref={firstRef}
        className="input min-w-48 flex-1 border-transparent py-1.5 focus:border-stone-300"
        name="company"
        placeholder="Add a lead: company name…"
        required
        aria-label="Company"
      />
      <input className="input w-40 py-1.5" name="contactName" placeholder="Contact name" aria-label="Contact name" />
      <input className="input w-48 py-1.5" name="email" type="email" placeholder="Email" aria-label="Email" />
      {LEAD_PRODUCTS.map((p) => (
        <label key={p.value} className="flex items-center gap-1 text-sm text-stone-600" title={p.label}>
          <input type="checkbox" name="products" value={p.value} />
          {p.value === "vapt" ? "VAPT" : "Firewall"}
        </label>
      ))}
      <select className="input w-32 py-1.5" name="source" defaultValue="" aria-label="Source">
        <option value="">Source…</option>
        {LEAD_SOURCES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <select className="input w-40 py-1.5" name="ownerId" defaultValue={meId} aria-label="Owner">
        <option value="">No owner</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button className="btn py-1.5" disabled={pending}>
        Add lead
      </button>
      {state?.error && <p className="w-full px-2 text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
