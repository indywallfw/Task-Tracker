"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Result = {
  docs: number;
  projects: number;
  tasks: number;
  warnings: string[];
  error?: string;
};

export function NotionImportForm() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/import/notion", { method: "POST", body: new FormData(e.currentTarget) });
      setResult(await res.json());
      router.refresh();
    } catch {
      setResult({ docs: 0, projects: 0, tasks: 0, warnings: [], error: "Upload failed. Check your connection." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="file" name="file" accept=".zip" required className="block text-sm" />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="databasesAsTasks" defaultChecked className="mt-1" />
        <span>
          Turn Notion databases that have a <strong>Status</strong> column into projects with tasks. Other
          databases become doc pages with a table.
        </span>
      </label>
      <button className="btn" disabled={busy}>
        {busy ? "Importing… this can take a minute" : "Import"}
      </button>

      {result?.error && <p className="text-sm text-red-700">{result.error}</p>}
      {result && !result.error && (
        <div className="rounded-md bg-green-50 p-4 text-sm text-green-900">
          <p className="font-medium">
            Imported {result.docs} pages, {result.projects} projects and {result.tasks} tasks.
          </p>
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
