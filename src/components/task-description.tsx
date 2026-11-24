"use client";

import { updateTaskDescription } from "@/actions/tasks";
import { RichEditor } from "./editor";

export function TaskDescription({ id, html }: { id: string; html: string }) {
  return (
    <RichEditor
      initialHtml={html}
      minHeight="min-h-40"
      placeholder="Add details, context, acceptance criteria…"
      onSave={(h) => updateTaskDescription(id, h)}
    />
  );
}
