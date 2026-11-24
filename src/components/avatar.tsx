import { initials } from "@/lib/constants";

const COLORS = ["bg-rose-200", "bg-amber-200", "bg-lime-200", "bg-sky-200", "bg-violet-200", "bg-teal-200"];

export function Avatar({ name, size = "sm" }: { name: string | null | undefined; size?: "sm" | "md" }) {
  if (!name) return null;
  const color = COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  const dim = size === "sm" ? "h-5 w-5 text-[10px]" : "h-7 w-7 text-xs";
  return (
    <span
      title={name}
      className={`${color} ${dim} inline-flex shrink-0 items-center justify-center rounded-full font-medium text-stone-700`}
    >
      {initials(name)}
    </span>
  );
}
