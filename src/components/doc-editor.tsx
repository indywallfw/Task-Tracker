"use client";

import { useRef, useState } from "react";
import { saveDocContent, saveDocMeta } from "@/actions/docs";
import { RichEditor } from "./editor";

export function DocEditor({
  id,
  title,
  icon,
  html,
}: {
  id: string;
  title: string;
  icon: string | null;
  html: string;
}) {
  const [t, setT] = useState(title === "Untitled" ? "" : title);
  const [ic, setIc] = useState(icon ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function queueMeta(nextTitle: string, nextIcon: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveDocMeta(id, nextTitle, nextIcon || null), 600);
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <input
          value={ic}
          onChange={(e) => {
            setIc(e.target.value);
            queueMeta(t, e.target.value);
          }}
          placeholder="🙂"
          maxLength={4}
          aria-label="Page icon (emoji)"
          className="w-10 shrink-0 rounded-md bg-transparent text-center text-2xl md:w-12 md:text-3xl outline-none placeholder:opacity-30 hover:bg-stone-100"
        />
        <input
          value={t}
          onChange={(e) => {
            setT(e.target.value);
            queueMeta(e.target.value, ic);
          }}
          placeholder="Untitled"
          aria-label="Page title"
          className="min-w-0 flex-1 bg-transparent text-2xl font-semibold md:text-3xl tracking-tight outline-none placeholder:text-stone-300"
        />
      </div>
      <RichEditor initialHtml={html} onSave={(h, text) => saveDocContent(id, h, text)} />
    </div>
  );
}
