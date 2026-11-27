"use client";

import { useState } from "react";

/** Shows a value in a code box with a Copy button. */
export function CopyText({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch gap-2">
      <code className="min-w-0 flex-1 break-all rounded-md border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-xs">{value}</code>
      <button
        type="button"
        className="btn-secondary shrink-0 py-1"
        onClick={() => {
          void navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
