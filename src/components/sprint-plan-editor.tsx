"use client";

import { saveSprintPlan } from "@/actions/products";
import { RichEditor } from "./editor";

/** The product's sprint planning notes, edited in place on the Sprints tab. */
export function SprintPlanEditor({ productId, html }: { productId: string; html: string }) {
  return (
    <RichEditor
      initialHtml={html}
      onSave={(h) => saveSprintPlan(productId, h)}
      placeholder="How this team plans sprints: cadence, who's on it, how work gets picked…"
      minHeight="min-h-32"
    />
  );
}
