"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/actions/auth";
import { createDoc } from "@/actions/docs";
import type { CurrentUser } from "@/lib/auth";
import type { DocNode } from "@/lib/data";

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={`block truncate rounded-md px-2 py-1.5 text-sm ${
        active ? "bg-stone-200/70 font-medium text-stone-900" : "text-stone-600 hover:bg-stone-200/50"
      }`}
    >
      {children}
    </Link>
  );
}

function DocItem({ node, depth }: { node: DocNode; depth: number }) {
  const path = usePathname();
  const active = path === `/docs/${node.id}`;
  const [open, setOpen] = useState(false);
  return (
    <li>
      <div
        className={`group flex items-center rounded-md pr-1 text-sm ${
          active ? "bg-stone-200/70 font-medium" : "hover:bg-stone-200/50"
        }`}
        style={{ paddingLeft: depth * 12 }}
      >
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`w-5 shrink-0 text-xs text-stone-400 ${node.children.length ? "" : "invisible"}`}
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? "▾" : "▸"}
        </button>
        <Link href={`/docs/${node.id}`} className="min-w-0 flex-1 truncate py-1 text-stone-700">
          {node.icon ? `${node.icon} ` : ""}
          {node.title || "Untitled"}
        </Link>
        <form action={createDoc} className="hidden group-hover:block">
          <input type="hidden" name="parentId" value={node.id} />
          <button className="px-1 text-stone-400 hover:text-stone-800" title="Add sub-page">
            +
          </button>
        </form>
      </div>
      {open && node.children.length > 0 && (
        <ul>
          {node.children.map((c) => (
            <DocItem key={c.id} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function Sidebar({
  user,
  projects,
  docTree,
}: {
  user: CurrentUser;
  projects: { id: string; name: string; key: string }[];
  docTree: DocNode[];
}) {
  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-stone-200 bg-stone-100/60">
      <div className="px-4 py-4">
        <div className="text-sm font-semibold">Workspace</div>
        <div className="truncate text-xs text-stone-500">{user.name}</div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2 pb-4">
        <div className="space-y-0.5">
          <NavLink href="/">My work</NavLink>
          <NavLink href="/search">Search</NavLink>
        </div>

        <div>
          <div className="flex items-center justify-between px-2 pb-1">
            <Link href="/projects" className="label mb-0 hover:text-stone-800">
              Projects
            </Link>
          </div>
          <div className="space-y-0.5">
            {projects.map((p) => (
              <NavLink key={p.id} href={`/projects/${p.id}`}>
                <span className="mr-1.5 font-mono text-xs text-stone-400">{p.key}</span>
                {p.name}
              </NavLink>
            ))}
            {projects.length === 0 && (
              <Link href="/projects" className="block px-2 py-1 text-sm text-stone-400 hover:text-stone-700">
                + Create a project
              </Link>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between px-2 pb-1">
            <Link href="/docs" className="label mb-0 hover:text-stone-800">
              Docs
            </Link>
            <form action={createDoc}>
              <button className="text-stone-400 hover:text-stone-800" title="New page">
                +
              </button>
            </form>
          </div>
          <ul>
            {docTree.map((n) => (
              <DocItem key={n.id} node={n} depth={0} />
            ))}
          </ul>
        </div>

        {user.role === "admin" && (
          <div>
            <div className="label px-2">Admin</div>
            <div className="space-y-0.5">
              <NavLink href="/admin/users">People</NavLink>
              <NavLink href="/admin/import">Import from Notion</NavLink>
            </div>
          </div>
        )}
      </nav>

      <div className="flex items-center justify-between border-t border-stone-200 px-4 py-3">
        <Link href="/account" className="text-sm text-stone-600 hover:text-stone-900">
          Account
        </Link>
        <form action={logout}>
          <button className="text-sm text-stone-500 hover:text-stone-900">Sign out</button>
        </form>
      </div>
    </aside>
  );
}
