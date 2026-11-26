"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SettingsTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav
      aria-label="Settings sections"
      className="-mx-4 mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b [scrollbar-width:none] border-stone-200 px-4 md:mx-0 md:px-0"
    >
      {tabs.map((t) => {
        const active = t.href === "/settings" ? path === "/settings" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-sm ${
              active
                ? "border-stone-900 font-medium text-stone-900"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
