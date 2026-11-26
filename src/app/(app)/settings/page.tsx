import { requireUser } from "@/lib/auth";
import { getTheme, THEMES } from "@/lib/theme";
import { setTheme } from "@/actions/settings";
import { AutoSubmitInput } from "@/components/auto-submit";

export const metadata = { title: "Display settings" };

export default async function DisplaySettingsPage() {
  await requireUser();
  const theme = await getTheme();

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="mb-1 font-medium">Theme</h2>
        <p className="mb-4 text-sm text-stone-500">Saved on this device, so your phone and computer can differ.</p>
        <form action={setTheme} key={theme} className="grid gap-2 sm:grid-cols-3">
          {THEMES.map((t) => (
            <label
              key={t.value}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200 p-3 hover:bg-stone-50 has-[:checked]:border-stone-900 has-[:checked]:bg-stone-50"
            >
              <AutoSubmitInput type="radio" name="theme" value={t.value} defaultChecked={theme === t.value} className="mt-1" />
              <span>
                <span className="flex items-center gap-2 text-sm font-medium">
                  <ThemeSwatch value={t.value} />
                  {t.label}
                </span>
                {t.hint && <span className="mt-0.5 block text-xs text-stone-500">{t.hint}</span>}
              </span>
            </label>
          ))}
        </form>
      </section>

      <section className="card p-5 text-sm leading-6">
        <h2 className="mb-1 font-medium">Use it on your phone</h2>
        <p className="mb-3 text-stone-500">
          Every page adapts to phone screens: the menu moves behind the ☰ button and wide boards and tables scroll
          sideways. You can also add it to your home screen so it opens full-screen like an app.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="label">iPhone or iPad (Safari)</div>
            <ol className="list-decimal space-y-0.5 pl-5 text-stone-700">
              <li>Open this site in Safari and sign in.</li>
              <li>Tap the Share button.</li>
              <li>Choose <strong>Add to Home Screen</strong>.</li>
            </ol>
          </div>
          <div>
            <div className="label">Android (Chrome)</div>
            <ol className="list-decimal space-y-0.5 pl-5 text-stone-700">
              <li>Open this site in Chrome and sign in.</li>
              <li>Tap the ⋮ menu.</li>
              <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}

function ThemeSwatch({ value }: { value: string }) {
  const half = "inline-block h-full w-1/2";
  return (
    <span className="inline-flex h-4 w-4 overflow-hidden rounded-full border border-stone-300" aria-hidden>
      {value === "dark" && <span className="h-full w-full bg-[#1a1817]" />}
      {value === "light" && <span className="h-full w-full bg-[#fbfbfa]" />}
      {value === "system" && (
        <>
          <span className={`${half} bg-[#fbfbfa]`} />
          <span className={`${half} bg-[#1a1817]`} />
        </>
      )}
    </span>
  );
}
