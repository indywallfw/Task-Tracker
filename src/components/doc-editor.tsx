"use client";

import { useEffect, useRef, useState } from "react";
import { saveDocContent, saveDocMeta } from "@/actions/docs";
import { RichEditor } from "./editor";

/** Grows the title box to fit its text. */
function fitTitle(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.dataset.docTitle = "";
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

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

  useEffect(() => {
    // Re-fit when the width changes (rotating a phone, resizing the window).
    const onResize = () => document.querySelectorAll<HTMLTextAreaElement>("textarea[data-doc-title]").forEach(fitTitle);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div>
      <div className="mb-2 flex items-start gap-3">
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
        {/* A textarea, not an input, so long titles wrap onto more lines instead of being cut off. */}
        <textarea
          ref={fitTitle}
          value={t}
          rows={1}
          onChange={(e) => {
            // Titles are one line of text: drop any pasted line breaks.
            const v = e.target.value.replace(/[\r\n]+/g, " ");
            setT(v);
            queueMeta(v, ic);
            fitTitle(e.target);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          placeholder="Untitled"
          aria-label="Page title"
          className="min-w-0 flex-1 resize-none overflow-hidden break-words bg-transparent text-2xl font-semibold leading-tight tracking-tight outline-none placeholder:text-stone-300 md:text-3xl"
        />
      </div>
      <RichEditor initialHtml={html} onSave={(h, text) => saveDocContent(id, h, text)} />
    </div>
  );
}
