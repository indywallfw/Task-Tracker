import { AppMark } from "@/components/id-mark";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-4">
      <div className="flex items-center gap-3">
        <AppMark size={44} />
        <span className="text-lg font-semibold tracking-tight">IndypenDance</span>
      </div>
      <div className="card w-full max-w-sm p-6 shadow-sm">{children}</div>
    </main>
  );
}
