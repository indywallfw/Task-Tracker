"use client";

import { useActionState, useState } from "react";
import { createToken } from "@/actions/tokens";

export function TokenForm({ mcpUrl }: { mcpUrl: string }) {
  const [state, action, pending] = useActionState(createToken, undefined);
  const [copied, setCopied] = useState(false);
  const command = state?.token
    ? `claude mcp add --transport http workspace ${mcpUrl} --header "Authorization: Bearer ${state.token}"`
    : "";

  return (
    <div className="space-y-3">
      <form action={action} className="flex gap-2">
        <input className="input" name="name" placeholder="Token name, e.g. Claude on my laptop" required />
        <button className="btn shrink-0" disabled={pending}>Create token</button>
      </form>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state?.token && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="mb-2 font-medium text-amber-900">
            Copy this now — it won&apos;t be shown again. Anyone with it can act as you.
          </p>
          <p className="mb-1 text-xs text-stone-600">Add it to Claude Code by running:</p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-stone-900 p-3 font-mono text-xs text-stone-100">
            {command}
          </pre>
          <button
            type="button"
            className="btn-secondary mt-2 py-1"
            onClick={() => {
              void navigator.clipboard.writeText(command);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy command"}
          </button>
        </div>
      )}
    </div>
  );
}
