"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { moveLead } from "@/actions/leads";
import type { LeadCard } from "@/lib/leads";
import { positionBetween } from "@/lib/position";
import { Avatar } from "./avatar";
import { FollowUp, ProductTags } from "./lead-bits";

type Stage = { value: string; label: string; dot: string; open: boolean };

export function LeadBoard({ leads, stages }: { leads: LeadCard[]; stages: Stage[] }) {
  // Local copy so cards move instantly; re-synced whenever the server sends new data.
  const [source, setSource] = useState(leads);
  const [items, setItems] = useState(leads);
  if (source !== leads) {
    setSource(leads);
    setItems(leads);
  }
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function drop(stage: string, beforeId: string | null) {
    const id = dragId;
    setDragId(null);
    setOverCol(null);
    if (!id) return;
    const column = items.filter((l) => l.stage === stage && l.id !== id).sort((a, b) => a.position - b.position);
    const idx = beforeId ? column.findIndex((l) => l.id === beforeId) : column.length;
    const position = positionBetween(column[idx - 1]?.position, column[idx]?.position);
    setItems((all) => all.map((l) => (l.id === id ? { ...l, stage, position } : l)));
    startTransition(() => moveLead(id, stage, position));
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {stages.map((s) => {
        const column = items.filter((l) => l.stage === s.value).sort((a, b) => a.position - b.position);
        return (
          <section
            key={s.value}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(s.value);
            }}
            onDragLeave={() => setOverCol((c) => (c === s.value ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              drop(s.value, null);
            }}
            className={`flex w-60 shrink-0 flex-col rounded-lg p-2 ${
              overCol === s.value ? "bg-stone-200/80" : "bg-stone-100"
            }`}
          >
            <header className="mb-2 flex items-center gap-2 px-1 text-sm font-medium text-stone-700">
              <span className={`h-2 w-2 rounded-full ${s.dot}`} />
              {s.label}
              <span className="text-stone-400">{column.length}</span>
            </header>
            <div className="flex min-h-16 flex-col gap-2">
              {column.map((l) => (
                <article
                  key={l.id}
                  draggable
                  onDragStart={() => setDragId(l.id)}
                  onDragEnd={() => setDragId(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    drop(s.value, l.id);
                  }}
                  className={`card cursor-grab p-3 shadow-sm active:cursor-grabbing ${
                    dragId === l.id ? "opacity-40" : ""
                  }`}
                >
                  <Link href={`/leads/${l.id}`} className="block text-sm font-medium leading-snug hover:underline">
                    {l.company}
                  </Link>
                  {l.contactName && <div className="mt-0.5 truncate text-xs text-stone-500">{l.contactName}</div>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <ProductTags products={l.products} />
                    <FollowUp date={l.nextFollowUp} open={s.open} />
                    <span className="ml-auto">
                      <Avatar name={l.ownerName} />
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
