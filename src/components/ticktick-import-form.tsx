"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Result = { lists: number; created: number; updated: number; subtasks: number; completed: number; warnings: string[]; error?: string };

export function TickTickImportForm() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/import/ticktick", { method: "POST", body: new FormData(e.currentTarget) });
      setResult(await res.json());
      router.refresh();
    } catch {
      setResult({ lists: 0, created: 0, updated: 0, subtasks: 0, completed: 0, warnings: [], error: "Upload failed. Check your connection." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="file" name="file" accept=".csv,.json" required className="block text-sm" />
      <button className="btn" disabled={busy}>
        {busy ? "Importing…" : "Import to my To-dos"}
      </button>
      {result?.error && <p className="text-sm text-red-700">{result.error}</p>}
      {result && !result.error && (
        <div className="rounded-md bg-green-50 p-4 text-sm text-green-900">
          <p className="font-medium">
            {result.created} new and {result.updated} updated to-dos, {result.subtasks} checklist items, {result.lists} new lists.{" "}
            {result.completed > 0 && `${result.completed} were already done in TickTick and are under Completed.`}
          </p>
          <Link href="/todos" className="mt-1 inline-block underline">
            Open To-dos →
          </Link>
          {result.warnings.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-amber-800">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
