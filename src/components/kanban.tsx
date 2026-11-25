"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { moveTask } from "@/actions/tasks";
import type { TaskCard } from "@/lib/tasks-query";
import { positionBetween } from "@/lib/position";
import { Avatar } from "./avatar";
import { DueDate, PriorityText } from "./task-bits";

type Status = { value: string; label: string; dot: string };

export function Kanban({ tasks, statuses }: { tasks: TaskCard[]; statuses: Status[] }) {
  // Local copy so cards move instantly; re-synced whenever the server sends new data.
  const [source, setSource] = useState(tasks);
  const [items, setItems] = useState(tasks);
  if (source !== tasks) {
    setSource(tasks);
    setItems(tasks);
  }
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function drop(status: string, beforeId: string | null) {
    const id = dragId;
    setDragId(null);
    setOverCol(null);
    if (!id) return;
    const column = items.filter((t) => t.status === status && t.id !== id).sort((a, b) => a.position - b.position);
    const idx = beforeId ? column.findIndex((t) => t.id === beforeId) : column.length;
    const position = positionBetween(column[idx - 1]?.position, column[idx]?.position);
    setItems((all) => all.map((t) => (t.id === id ? { ...t, status, position } : t)));
    startTransition(() => moveTask(id, status, position));
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {statuses.map((s) => {
        const column = items.filter((t) => t.status === s.value).sort((a, b) => a.position - b.position);
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
            className={`flex w-72 shrink-0 flex-col rounded-lg p-2 ${
              overCol === s.value ? "bg-stone-200/80" : "bg-stone-100"
            }`}
          >
            <header className="mb-2 flex items-center gap-2 px-1 text-sm font-medium text-stone-700">
              <span className={`h-2 w-2 rounded-full ${s.dot}`} />
              {s.label}
              <span className="text-stone-400">{column.length}</span>
            </header>
            <div className="flex min-h-16 flex-col gap-2">
              {column.map((t) => (
                <article
                  key={t.id}
                  draggable
                  onDragStart={() => setDragId(t.id)}
                  onDragEnd={() => setDragId(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    drop(s.value, t.id);
                  }}
                  className={`card cursor-grab p-3 shadow-sm active:cursor-grabbing ${
                    dragId === t.id ? "opacity-40" : ""
                  }`}
                >
                  <Link href={`/tasks/${t.id}`} className="block text-sm leading-snug hover:underline">
                    {t.title}
                  </Link>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-mono text-[11px] text-stone-400">
                      {t.projectKey}-{t.number}
                    </span>
                    <PriorityText priority={t.priority} />
                    <DueDate date={t.dueDate} done={t.status === "done"} />
                    <span className="ml-auto">
                      <Avatar name={t.assigneeName} />
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
