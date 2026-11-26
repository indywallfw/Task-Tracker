"use client";

import { useState, type ReactNode } from "react";

/**
 * On phones, folds its children behind a button so side panels don't push the page down.
 * From md up the children are always shown and the button is hidden.
 */
export function MobileToggle({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-md px-2 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-200/50 md:hidden"
      >
        {label}
        <span className="text-xs text-stone-400" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      <div
        className={`${open ? "" : "hidden"} md:block ${className}`}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
      >
        {children}
      </div>
    </>
  );
}
