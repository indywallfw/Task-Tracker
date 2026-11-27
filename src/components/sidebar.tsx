"use client";

import Link from "next/link";
import { AppMark } from "./id-mark";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/actions/auth";
import { createDoc } from "@/actions/docs";
import { createProductDoc } from "@/actions/products";
import type { CurrentUser } from "@/lib/auth";
import type { DocNode } from "@/lib/data";

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={`block truncate rounded-md px-2 py-2 text-sm md:py-1.5 ${
        active ? "bg-stone-200/70 font-medium text-stone-900" : "text-stone-600 hover:bg-stone-200/50"
      }`}
    >
      {children}
    </Link>
  );
}

function DocItem({ node, depth, defaultOpen = false }: { node: DocNode; depth: number; defaultOpen?: boolean }) {
  const path = usePathname();
  const active = path === `/docs/${node.id}`;
  const [open, setOpen] = useState(defaultOpen);
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
        <Link href={`/docs/${node.id}`} className="min-w-0 flex-1 truncate py-1.5 text-stone-700 md:py-1">
          {node.icon ? `${node.icon} ` : ""}
          {node.title || "Untitled"}
        </Link>
        <form action={createDoc} className="md:hidden md:group-hover:block">
          <input type="hidden" name="parentId" value={node.id} />
          <button className="px-2 py-1 text-stone-400 hover:text-stone-800 md:px-1 md:py-0" title="Add sub-page">
            +
          </button>
        </form>
      </div>
      {open && node.children.length > 0 && (
        <ul>
          {node.children.map((c) => (
            <DocItem key={c.id} node={c} depth={depth + 1} defaultOpen={defaultOpen} />
          ))}
        </ul>
      )}
    </li>
  );
}

function SubHead({ href, children, action }: { href: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-2 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-stone-400">
      <Link href={href} className="hover:text-stone-700">
        {children}
      </Link>
      {action}
    </div>
  );
}

export function Sidebar({
  user,
  projects,
  products,
  docTree,
}: {
  user: CurrentUser;
  projects: { id: string; name: string; key: string; productId: string | null; sprintTracker: boolean }[];
  products: { id: string; name: string }[];
  docTree: DocNode[];
}) {
  const productIds = new Set(products.map((p) => p.id));
  // projects of an archived product are listed with the loose ones so they stay reachable
  const looseProjects = projects.filter((p) => !p.productId || !productIds.has(p.productId));
  // top-level pages linked to a product are listed under it; sub-pages stay with their parent
  const looseDocs = docTree.filter((d) => !d.productId || !productIds.has(d.productId));
  // every page linked to a product shows under it, nested under its parent when that is linked too
  const allDocs: DocNode[] = [];
  const walk = (nodes: DocNode[]) => nodes.forEach((n) => (allDocs.push(n), walk(n.children)));
  walk(docTree);
  const docById = new Map(allDocs.map((d) => [d.id, d]));
  const productDocRoots = (productId: string) =>
    allDocs.filter((d) => d.productId === productId && docById.get(d.parentId ?? "")?.productId !== productId);
  // On phones the sidebar is a drawer behind the ☰ button; on md+ it is always shown.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-stone-200 bg-stone-100/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-md text-xl text-stone-700 hover:bg-stone-200/60"
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="app-sidebar"
        >
          ☰
        </button>
        <Link href="/" className="flex flex-1 items-center gap-2 text-sm font-semibold">
          <AppMark size={24} />
          IndypenDance
        </Link>
        <Link
          href="/search"
          className="flex h-11 w-11 items-center justify-center rounded-md text-stone-600 hover:bg-stone-200/60"
          aria-label="Search"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m13 13 4 4" strokeLinecap="round" />
          </svg>
        </Link>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}

    <aside
      id="app-sidebar"
      className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-stone-200 bg-stone-100 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] transition-transform duration-200 md:sticky md:top-0 md:z-auto md:h-screen md:w-64 md:max-w-none md:translate-x-0 md:bg-stone-100/60 md:p-0 md:transition-none ${
        open ? "translate-x-0 shadow-xl" : "-translate-x-full"
      }`}
      // close the drawer when a link inside it is followed
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) setOpen(false);
      }}
    >
      <div className="flex items-start justify-between px-4 py-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <AppMark size={32} />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">IndypenDance</span>
            <span className="block truncate text-xs text-stone-500">{user.name}</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="-m-2 flex h-10 w-10 items-center justify-center rounded-md text-lg text-stone-500 hover:bg-stone-200/60 md:hidden"
          aria-label="Close menu"
        >
          ✕
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-2 pb-4">
        <div className="space-y-0.5">
          <NavLink href="/">My work</NavLink>
          <NavLink href="/todos">To-dos</NavLink>
          <NavLink href="/calendar">Calendar</NavLink>
          <NavLink href="/leads">Leads</NavLink>
          <NavLink href="/search">Search</NavLink>
        </div>

        <div>
          <div className="flex items-center justify-between px-2 pb-1">
            <Link href="/products" className="label mb-0 hover:text-stone-800">
              Products
            </Link>
          </div>
          <div className="space-y-0.5">
            {products.map((prod) => (
              <div key={prod.id}>
                <NavLink href={`/products/${prod.id}`}>{prod.name}</NavLink>
                <div className="ml-3 space-y-0.5 border-l border-stone-200 pl-1">
                  <SubHead href={`/products/${prod.id}?tab=projects`}>Projects</SubHead>
                  {projects
                    .filter((p) => p.productId === prod.id && !p.sprintTracker)
                    .map((p) => (
                      <NavLink key={p.id} href={`/projects/${p.id}`}>
                        <span className="mr-1.5 font-mono text-xs text-stone-400">{p.key}</span>
                        {p.name}
                      </NavLink>
                    ))}
                  <SubHead href={`/products/${prod.id}?tab=sprints`}>Sprints</SubHead>
                  <NavLink href={`/products/${prod.id}?tab=sprints`}>🏃 Sprint planning</NavLink>
                  {projects
                    .filter((p) => p.productId === prod.id && p.sprintTracker)
                    .map((p) => (
                      <NavLink key={p.id} href={`/projects/${p.id}`}>
                        <span className="mr-1.5 font-mono text-xs text-stone-400">{p.key}</span>
                        {p.name}
                      </NavLink>
                    ))}
                  <SubHead
                    href={`/products/${prod.id}?tab=docs`}
                    action={
                      <form action={createProductDoc}>
                        <input type="hidden" name="productId" value={prod.id} />
                        <button className="px-1 text-sm font-normal text-stone-400 hover:text-stone-800" title={`New page in ${prod.name}`}>
                          +
                        </button>
                      </form>
                    }
                  >
                    Docs
                  </SubHead>
                  <ul>
                    {productDocRoots(prod.id).map((n) => (
                      <DocItem key={n.id} node={n} depth={0} defaultOpen />
                    ))}
                  </ul>
                </div>
              </div>
            ))}
            {products.length === 0 && (
              <Link href="/products" className="block px-2 py-1 text-sm text-stone-400 hover:text-stone-700">
                + Create a product
              </Link>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between px-2 pb-1">
            <Link href="/projects" className="label mb-0 hover:text-stone-800">
              {products.length ? "Other projects" : "Projects"}
            </Link>
          </div>
          <div className="space-y-0.5">
            {looseProjects.map((p) => (
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
              {products.length ? "Other docs" : "Docs"}
            </Link>
            <form action={createDoc}>
              <button className="px-1 text-stone-400 hover:text-stone-800" title="New page">
                +
              </button>
            </form>
          </div>
          <ul>
            {looseDocs.map((n) => (
              <DocItem key={n.id} node={n} depth={0} />
            ))}
          </ul>
        </div>

      </nav>

      <div className="flex items-center justify-between gap-2 border-t border-stone-200 px-2 py-2">
        <div className="flex-1">
          <NavLink href="/settings">⚙ Settings</NavLink>
        </div>
        <form action={logout}>
          <button className="rounded-md px-2 py-2 text-sm text-stone-500 hover:bg-stone-200/50 hover:text-stone-900 md:py-1.5">
            Sign out
          </button>
        </form>
      </div>
    </aside>
    </>
  );
}
