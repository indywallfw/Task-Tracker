"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type SaveState = "idle" | "saving" | "saved" | "error";

export function RichEditor({
  initialHtml,
  onSave,
  placeholder = "Start writing…",
  minHeight = "min-h-[50vh]",
}: {
  initialHtml: string;
  onSave: (html: string, text: string) => Promise<void>;
  placeholder?: string;
  minHeight?: string;
}) {
  const router = useRouter();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: initialHtml,
    editorProps: {
      attributes: { class: `prose-doc ${minHeight}` },
      // links open on click: pages in this app in the same tab, other sites in a new one
      handleClick: (_view, _pos, event) => {
        const a = (event.target as HTMLElement | null)?.closest("a");
        const href = a?.getAttribute("href");
        if (!href || event.button !== 0) return false;
        event.preventDefault();
        const url = new URL(href, window.location.href);
        if (url.origin === window.location.origin) router.push(url.pathname + url.search + url.hash);
        else window.open(url.href, "_blank", "noopener,noreferrer");
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        try {
          await saveRef.current(editor.getHTML(), editor.getText());
          setSaveState("saved");
        } catch {
          setSaveState("error");
        }
      }, 800);
    },
  });

  // Flush a pending save when leaving the page.
  useEffect(() => {
    return () => {
      if (timer.current && editor) {
        clearTimeout(timer.current);
        void saveRef.current(editor.getHTML(), editor.getText());
      }
    };
  }, [editor]);

  return (
    <div>
      {editor && <Toolbar editor={editor} saveState={saveState} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor, saveState }: { editor: Editor; saveState: SaveState }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      code: e.isActive("codeBlock"),
      link: e.isActive("link"),
      table: e.isActive("table"),
    }),
  });
  const c = () => editor.chain().focus();
  const btn = (active: boolean, label: string, run: () => void, title?: string) => (
    <button
      type="button"
      title={title ?? label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className={`rounded px-2 py-1 text-xs ${active ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-200"}`}
    >
      {label}
    </button>
  );
  return (
    <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-0.5 border-b border-stone-200 bg-[var(--background)] py-1.5">
      {btn(s.bold, "B", () => c().toggleBold().run(), "Bold")}
      {btn(s.italic, "I", () => c().toggleItalic().run(), "Italic")}
      {btn(s.strike, "S", () => c().toggleStrike().run(), "Strikethrough")}
      <span className="mx-1 h-4 w-px bg-stone-300" />
      {btn(s.h1, "H1", () => c().toggleHeading({ level: 1 }).run())}
      {btn(s.h2, "H2", () => c().toggleHeading({ level: 2 }).run())}
      {btn(s.h3, "H3", () => c().toggleHeading({ level: 3 }).run())}
      <span className="mx-1 h-4 w-px bg-stone-300" />
      {btn(s.bullet, "• List", () => c().toggleBulletList().run())}
      {btn(s.ordered, "1. List", () => c().toggleOrderedList().run())}
      {btn(s.task, "☑ Checklist", () => c().toggleTaskList().run())}
      {btn(s.quote, "Quote", () => c().toggleBlockquote().run())}
      {btn(s.code, "Code", () => c().toggleCodeBlock().run())}
      {btn(s.link, "Link", () => {
        if (s.link) return c().unsetLink().run();
        const url = window.prompt("Link URL");
        if (url) c().setLink({ href: url }).run();
      })}
      {s.table
        ? <>
            {btn(false, "+ Row", () => c().addRowAfter().run())}
            {btn(false, "+ Col", () => c().addColumnAfter().run())}
            {btn(false, "− Row", () => c().deleteRow().run())}
            {btn(false, "− Col", () => c().deleteColumn().run())}
            {btn(false, "Delete table", () => c().deleteTable().run())}
          </>
        : btn(false, "Table", () => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
      <span className="ml-auto pr-1 text-xs text-stone-400">
        {saveState === "saving" && "Saving…"}
        {saveState === "saved" && "Saved"}
        {saveState === "error" && <span className="text-red-600">Couldn&apos;t save — check your connection</span>}
      </span>
    </div>
  );
}
