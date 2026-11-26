import { chooseGoogleCalendars, disconnectGoogle } from "@/actions/events";
import { googleConfigured, type getGoogleAccount, type GoogleCalendar } from "@/lib/google";

/** Google Calendar connection: shown on the calendar page and in Settings → Integrations. */
export function GoogleBox({
  connected,
  calendars,
}: {
  connected: Awaited<ReturnType<typeof getGoogleAccount>>;
  calendars: GoogleCalendar[] | null;
}) {
  return (
    <section className="border-t border-stone-200 pt-5">
      <h2 className="mb-2 text-sm font-semibold text-stone-800">Google Calendar</h2>
      {!googleConfigured() ? (
        <div className="space-y-2 text-xs text-stone-600">
          <p>Not set up on this server yet. An admin needs to:</p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              In Google Cloud Console, enable the <strong>Google Calendar API</strong> and create an OAuth client of type{" "}
              <strong>Web application</strong>.
            </li>
            <li>
              Add <code className="rounded bg-stone-100 px-1">{"<your app URL>"}/api/google/callback</code> as an authorised redirect URI.
            </li>
            <li>
              Put <code className="rounded bg-stone-100 px-1">GOOGLE_CLIENT_ID</code>,{" "}
              <code className="rounded bg-stone-100 px-1">GOOGLE_CLIENT_SECRET</code> and{" "}
              <code className="rounded bg-stone-100 px-1">APP_URL</code> in <code>.env</code> and restart.
            </li>
          </ol>
        </div>
      ) : !connected ? (
        <div className="space-y-2">
          <p className="text-xs text-stone-600">Show your Google events here, next to your own. Read-only: nothing is changed in Google.</p>
          {/* a plain link: the route redirects to Google */}
          <a href="/api/google/connect" className="btn-secondary w-full">
            Connect Google Calendar
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-stone-600">
            Connected as <strong>{connected.email}</strong>
          </p>
          {calendars ? (
            <form action={chooseGoogleCalendars} className="space-y-1.5">
              <div className="label">Show these calendars</div>
              {calendars.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    name="calendarId"
                    value={c.id}
                    defaultChecked={connected.calendarIds.includes(c.id) || (!!c.primary && connected.calendarIds.includes("primary"))}
                  />
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.backgroundColor ?? "#4285f4" }} />
                  <span className="truncate">{c.summary}</span>
                </label>
              ))}
              <button className="btn-secondary mt-1 py-1 text-xs">Save</button>
            </form>
          ) : (
            <p className="text-xs text-amber-800">Couldn&apos;t load your calendar list.</p>
          )}
          <form action={disconnectGoogle}>
            <button className="text-xs text-stone-500 hover:text-red-700">Disconnect Google</button>
          </form>
        </div>
      )}
    </section>
  );
}
