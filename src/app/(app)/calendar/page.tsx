import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, events } from "@/db";
import { requireUser } from "@/lib/auth";
import { todayISO } from "@/lib/constants";
import { getCalendarItems, type CalItem } from "@/lib/calendar";
import { addDays, addMonths, fromISO, RECURRENCES, toISO } from "@/lib/recurrence";
import { COLOR_KEYS, color, formatTime } from "@/lib/todo-meta";
import { getGoogleAccount, listGoogleCalendars, type GoogleCalendar } from "@/lib/google";
import { deleteEvent, saveEvent } from "@/actions/events";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { GoogleBox } from "@/components/google-box";

export const metadata = { title: "Calendar" };

const HOUR_PX = 44;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Monday on or before the date. */
const weekStart = (iso: string) => addDays(iso, -((fromISO(iso).getDay() + 6) % 7));

const GOOGLE_MESSAGES: Record<string, { text: string; ok?: boolean }> = {
  connected: { text: "Google Calendar connected. Your events now show here.", ok: true },
  denied: { text: "Google Calendar wasn't connected: access was declined." },
  expired: { text: "That sign-in link expired. Try connecting again." },
  error: { text: "Couldn't connect Google Calendar. Check the server log for details." },
  not_configured: { text: "Google sign-in isn't set up on this server yet (see below)." },
};

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayISO();
  const view = sp.view === "week" ? "week" : "month";
  const date = isoDate.catch(today).parse(sp.date);
  const editId = z.uuid().safeParse(sp.event).success ? String(sp.event) : null;
  const newAt = typeof sp.new === "string" ? sp.new : null; // "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM"

  const from = view === "month" ? weekStart(date.slice(0, 8) + "01") : weekStart(date);
  const to = addDays(from, view === "month" ? 41 : 6);

  const href = (p: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { view, date, ...p };
    Object.entries(merged).forEach(([k, v]) => v && q.set(k, v));
    return `/calendar?${q}`;
  };
  const here = href({});
  const linkBase = `${here}&`;

  const [{ items, googleError }, editing, google] = await Promise.all([
    // also load the coming week, for the "Next 7 days" list beside any view
    getCalendarItems(user.id, from < today ? from : today, to > addDays(today, 6) ? to : addDays(today, 6), linkBase),
    editId
      ? db
          .select()
          .from(events)
          .where(and(eq(events.id, editId), eq(events.userId, user.id)))
          .then((r) => r[0] ?? null)
      : null,
    getGoogleAccount(user.id),
  ]);
  const calendars: GoogleCalendar[] | null = google ? await listGoogleCalendars(user.id).catch(() => null) : null;

  const prev = view === "month" ? addMonths(date.slice(0, 8) + "01", -1) : addDays(date, -7);
  const next = view === "month" ? addMonths(date.slice(0, 8) + "01", 1) : addDays(date, 7);
  const heading =
    view === "month"
      ? fromISO(date).toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : `${fromISO(from).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${fromISO(to).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  const message = typeof sp.google === "string" ? GOOGLE_MESSAGES[sp.google] : undefined;
  const showForm = !!(editing || newAt);

  return (
    <div className="lg:flex lg:min-h-screen">
      <div className="min-w-0 flex-1 px-4 py-5 md:px-6 md:py-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="mr-2 text-2xl font-semibold tracking-tight">{heading}</h1>
          <div className="flex items-center rounded-md border border-stone-300 bg-white text-sm">
            <Link href={href({ date: prev })} className="px-2.5 py-1 hover:bg-stone-100" aria-label="Previous">
              ‹
            </Link>
            <Link href={href({ date: today })} className="border-x border-stone-300 px-3 py-1 hover:bg-stone-100">
              Today
            </Link>
            <Link href={href({ date: next })} className="px-2.5 py-1 hover:bg-stone-100" aria-label="Next">
              ›
            </Link>
          </div>
          <div className="flex rounded-md border border-stone-300 bg-white p-0.5 text-sm">
            {(["month", "week"] as const).map((v) => (
              <Link
                key={v}
                href={href({ view: v })}
                className={`rounded px-3 py-1 capitalize ${view === v ? "bg-stone-900 text-white" : "text-stone-600"}`}
              >
                {v}
              </Link>
            ))}
          </div>
          <Link href={href({ new: date === today ? today : date })} className="btn ml-auto py-1.5">
            + New event
          </Link>
        </div>

        {message && (
          <p className={`mb-3 rounded-md px-3 py-2 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"}`}>
            {message.text}
          </p>
        )}
        {googleError && <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{googleError}</p>}

        {view === "month" ? (
          <MonthGrid from={from} month={date.slice(0, 7)} today={today} items={items} href={href} />
        ) : (
          <WeekGrid from={from} today={today} items={items} href={href} />
        )}

        <Legend />
      </div>

      <aside className="space-y-6 border-t border-stone-200 bg-white/50 px-4 py-6 md:px-6 lg:w-80 lg:shrink-0 lg:border-t-0 lg:border-l lg:px-5">
        {showForm ? (
          <EventForm
            key={editing?.id ?? newAt}
            editing={editing}
            newAt={newAt}
            today={today}
            back={here}
          />
        ) : (
          <Agenda items={items.filter((i) => i.date >= today && i.date <= addDays(today, 6))} today={today} />
        )}
        <GoogleBox connected={google} calendars={calendars} />
      </aside>
    </div>
  );
}

// ---------- item rendering ----------

function itemStyle(c: string) {
  return c.startsWith("#")
    ? { className: "border", style: { backgroundColor: `${c}22`, borderColor: `${c}88`, color: "#1c1917" } }
    : { className: `border ${color(c).soft}`, style: undefined };
}

function Chip({ item }: { item: CalItem }) {
  const s = itemStyle(item.color);
  const label = (
    <>
      {item.source === "todo" && <span className="mr-1">{item.done ? "☑" : "○"}</span>}
      {item.start && <span className="mr-1 font-medium">{formatTime(item.start).replace(/:00(?=\s?[AP]M)/i, "")}</span>}
      <span className={item.done ? "line-through opacity-60" : ""}>{item.title}</span>
      {item.repeats && <span className="ml-1 opacity-60">↻</span>}
    </>
  );
  const cls = `block truncate rounded px-1.5 py-0.5 text-[11px] leading-4 ${s.className}`;
  if (!item.href) return <span className={cls} style={s.style}>{label}</span>;
  return item.external ? (
    <a href={item.href} target="_blank" rel="noreferrer" className={`${cls} hover:opacity-80`} style={s.style} title={item.title}>
      {label}
    </a>
  ) : (
    <Link href={item.href} className={`${cls} hover:opacity-80`} style={s.style} title={item.title}>
      {label}
    </Link>
  );
}

const onDay = (items: CalItem[], d: string) => items.filter((i) => i.date <= d && i.endDate >= d);

function MonthGrid({
  from,
  month,
  today,
  items,
  href,
}: {
  from: string;
  month: string;
  today: string;
  items: CalItem[];
  href: (p: Record<string, string | undefined>) => string;
}) {
  const days = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  const MAX = 4;
  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50 text-xs text-stone-500">
        {days.slice(0, 7).map((d) => (
          <div key={d} className="px-2 py-1.5">
            {fromISO(d).toLocaleDateString(undefined, { weekday: "short" })}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const list = onDay(items, d);
          const inMonth = d.startsWith(month);
          return (
            <div
              key={d}
              className={`group relative min-h-28 border-b border-r border-stone-100 p-1 ${inMonth ? "" : "bg-stone-50/70"}`}
            >
              <div className="mb-1 flex items-center justify-between">
                <Link
                  href={href({ view: "week", date: d })}
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    d === today ? "bg-red-600 font-semibold text-white" : inMonth ? "text-stone-700 hover:bg-stone-100" : "text-stone-400"
                  }`}
                >
                  {Number(d.slice(8))}
                </Link>
                <Link
                  href={href({ new: d })}
                  className="hidden px-1 text-stone-400 hover:text-stone-800 group-hover:block"
                  aria-label={`New event on ${d}`}
                >
                  +
                </Link>
              </div>
              <div className="space-y-0.5">
                {list.slice(0, MAX).map((i) => (
                  <Chip key={i.key + d} item={i} />
                ))}
                {list.length > MAX && (
                  <Link href={href({ view: "week", date: d })} className="block px-1 text-[11px] text-stone-500 hover:underline">
                    +{list.length - MAX} more
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Side-by-side columns for overlapping timed items. */
function layoutDay(timed: CalItem[]) {
  const sorted = [...timed].sort((a, b) => minutes(a.start!) - minutes(b.start!));
  const placed: { item: CalItem; lane: number; lanes: number; top: number; bottom: number }[] = [];
  let cluster: typeof placed = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => (c.lanes = lanes));
    cluster = [];
  };
  for (const item of sorted) {
    const top = minutes(item.start!);
    const bottom = Math.max(top + 25, item.end && minutes(item.end) > top ? minutes(item.end) : top + 30);
    if (top >= clusterEnd) flush();
    const used = new Set(cluster.filter((c) => c.bottom > top).map((c) => c.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    const p = { item, lane, lanes: 1, top, bottom };
    cluster.push(p);
    placed.push(p);
    clusterEnd = Math.max(clusterEnd, bottom);
  }
  flush();
  return placed;
}

function WeekGrid({
  from,
  today,
  items,
  href,
}: {
  from: string;
  today: string;
  items: CalItem[];
  href: (p: Record<string, string | undefined>) => string;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const timed = items.filter((i) => i.start);
  // show 7am–9pm, widened to fit anything earlier or later
  const firstHour = Math.min(7, ...timed.map((i) => Math.floor(minutes(i.start!) / 60)));
  const lastHour = Math.max(21, ...timed.map((i) => Math.ceil(minutes(i.end ?? i.start!) / 60)));
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  return (
    <div className="card overflow-x-auto">
      <div className="grid min-w-[640px] grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-stone-200 bg-stone-50">
        <div />
        {days.map((d) => (
          <Link
            key={d}
            href={href({ new: d })}
            className="border-l border-stone-200 px-2 py-1.5 text-xs text-stone-500 hover:bg-stone-100"
            title="New event"
          >
            {fromISO(d).toLocaleDateString(undefined, { weekday: "short" })}{" "}
            <span className={`ml-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-sm ${d === today ? "bg-red-600 font-semibold text-white" : "text-stone-800"}`}>
              {Number(d.slice(8))}
            </span>
          </Link>
        ))}
      </div>
      {/* all-day row: all-day events, undated-time to-dos and team tasks */}
      <div className="grid min-w-[640px] grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-stone-200">
        <div className="px-1 py-1 text-right text-[10px] text-stone-400">all day</div>
        {days.map((d) => (
          <div key={d} className="min-h-8 space-y-0.5 border-l border-stone-100 p-1">
            {onDay(items, d)
              .filter((i) => !i.start)
              .map((i) => (
                <Chip key={i.key + d} item={i} />
              ))}
          </div>
        ))}
      </div>
      <div className="grid min-w-[640px] grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
        <div>
          {hours.map((h) => (
            <div key={h} className="relative text-right text-[10px] text-stone-400" style={{ height: HOUR_PX }}>
              <span className="absolute -top-1.5 right-1">
                {new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" })}
              </span>
            </div>
          ))}
        </div>
        {days.map((d) => (
          <div key={d} className="relative border-l border-stone-100">
            {hours.map((h) => (
              <Link
                key={h}
                href={href({ new: `${d}T${String(h).padStart(2, "0")}:00` })}
                className="block border-t border-stone-100 hover:bg-stone-50"
                style={{ height: HOUR_PX }}
                aria-label={`New event ${d} ${h}:00`}
              />
            ))}
            {d === today && nowMin >= firstHour * 60 && nowMin <= lastHour * 60 && (
              <div
                className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500"
                style={{ top: ((nowMin - firstHour * 60) / 60) * HOUR_PX }}
              />
            )}
            {layoutDay(timed.filter((i) => i.date === d)).map(({ item, lane, lanes, top, bottom }) => {
              const s = itemStyle(item.color);
              const style = {
                ...s.style,
                top: ((top - firstHour * 60) / 60) * HOUR_PX,
                height: ((bottom - top) / 60) * HOUR_PX - 2,
                left: `calc(${(lane / lanes) * 100}% + 2px)`,
                width: `calc(${100 / lanes}% - 4px)`,
              };
              const body = (
                <>
                  <div className={`font-medium ${item.done ? "line-through opacity-60" : ""}`}>
                    {item.source === "todo" ? (item.done ? "☑ " : "○ ") : ""}
                    {item.title}
                  </div>
                  <div className="opacity-70">
                    {formatTime(item.start!)}
                    {item.end ? ` – ${formatTime(item.end)}` : ""}
                    {item.location ? ` · ${item.location}` : ""}
                  </div>
                </>
              );
              const cls = `absolute z-20 overflow-hidden rounded px-1.5 py-0.5 text-[11px] leading-4 hover:opacity-90 ${s.className}`;
              return item.external ? (
                <a key={item.key} href={item.href} target="_blank" rel="noreferrer" className={cls} style={style} title={item.title}>
                  {body}
                </a>
              ) : (
                <Link key={item.key} href={item.href ?? "#"} className={cls} style={style} title={item.title}>
                  {body}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend() {
  const rows = [
    ["border border-blue-300 bg-blue-50", "Your events"],
    ["border border-[#4285f488] bg-[#4285f422]", "Google Calendar"],
    ["border border-stone-300 bg-stone-100", "To-dos (coloured by priority)"],
    ["border border-violet-300 bg-violet-50", "Team tasks assigned to you"],
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-4 text-xs text-stone-500">
      {rows.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded ${c}`} />
          {l}
        </span>
      ))}
    </div>
  );
}

function Agenda({ items, today }: { items: CalItem[]; today: string }) {
  const days = [...new Set(items.map((i) => i.date))].sort();
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-stone-800">Next 7 days</h2>
      {days.length === 0 && <p className="text-sm text-stone-400">Nothing scheduled.</p>}
      <div className="space-y-3">
        {days.map((d) => (
          <div key={d}>
            <div className="mb-1 text-xs font-medium text-stone-500">
              {d === today ? "Today" : fromISO(d).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
            </div>
            <div className="space-y-1">
              {items
                .filter((i) => i.date === d)
                .map((i) => (
                  <Chip key={i.key} item={i} />
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- event form ----------

function EventForm({
  editing,
  newAt,
  today,
  back,
}: {
  editing: typeof events.$inferSelect | null;
  newAt: string | null;
  today: string;
  back: string;
}) {
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  let date = today;
  let endDate = "";
  let start = "09:00";
  let end = "10:00";
  if (editing) {
    date = toISO(editing.startsAt);
    const last = editing.allDay ? toISO(new Date(editing.endsAt.getTime() - 1)) : toISO(editing.endsAt);
    endDate = last !== date ? last : "";
    start = hhmm(editing.startsAt);
    end = hhmm(editing.endsAt);
  } else if (newAt) {
    const m = newAt.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?$/);
    if (m) {
      date = m[1];
      if (m[2]) {
        start = `${m[2]}:${m[3]}`;
        end = `${String(Math.min(23, Number(m[2]) + 1)).padStart(2, "0")}:${m[3]}`;
      }
    }
  }
  const allDay = editing?.allDay ?? false;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-stone-800">{editing ? "Edit event" : "New event"}</h2>
        <Link href={back} className="text-sm text-stone-500 hover:text-stone-900">
          Close
        </Link>
      </div>
      <ActionForm action={saveEvent} submitLabel={editing ? "Save" : "Add event"} className="group space-y-3">
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <input type="hidden" name="back" value={back} />
        <input className="input" name="title" defaultValue={editing?.title} placeholder="Title" required autoFocus maxLength={200} />
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" name="allDay" defaultChecked={allDay} /> All day
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-stone-500">
            Date
            <input className="input mt-0.5 py-1.5" type="date" name="date" defaultValue={date} required />
          </label>
          <label className="text-xs text-stone-500">
            Ends on <span className="text-stone-400">(optional)</span>
            <input className="input mt-0.5 py-1.5" type="date" name="endDate" defaultValue={endDate} />
          </label>
          <label className="text-xs text-stone-500 group-has-[[name=allDay]:checked]:hidden">
            Starts
            <input className="input mt-0.5 py-1.5" type="time" name="start" defaultValue={start} />
          </label>
          <label className="text-xs text-stone-500 group-has-[[name=allDay]:checked]:hidden">
            Ends
            <input className="input mt-0.5 py-1.5" type="time" name="end" defaultValue={end} />
          </label>
        </div>
        <input className="input" name="location" defaultValue={editing?.location} placeholder="Location or meeting link" maxLength={300} />
        <textarea className="input" name="notes" defaultValue={editing?.notes} placeholder="Notes" rows={3} />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-stone-500">
            Repeat
            <select className="input mt-0.5 py-1.5" name="recurrence" defaultValue={editing?.recurrence ?? ""}>
              <option value="">Doesn’t repeat</option>
              {RECURRENCES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-stone-500">
            Until <span className="text-stone-400">(optional)</span>
            <input className="input mt-0.5 py-1.5" type="date" name="repeatUntil" defaultValue={editing?.repeatUntil ?? ""} />
          </label>
        </div>
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="mb-1 text-xs text-stone-500">Colour</legend>
          {COLOR_KEYS.map((c) => (
            <label key={c} className="cursor-pointer" title={c}>
              <input type="radio" name="color" value={c} defaultChecked={c === (editing?.color ?? "blue")} className="peer sr-only" />
              <span className={`block h-5 w-5 rounded-full ring-offset-1 peer-checked:ring-2 peer-checked:ring-stone-700 ${color(c).dot}`} />
            </label>
          ))}
        </fieldset>
        {editing?.recurrence && <p className="text-xs text-stone-500">Changes apply to every repeat of this event.</p>}
      </ActionForm>
      {editing && (
        <form action={deleteEvent} className="mt-3">
          <input type="hidden" name="id" value={editing.id} />
          <input type="hidden" name="back" value={back} />
          <ConfirmButton className="btn-danger w-full" message={editing.recurrence ? "Delete this event and all its repeats?" : "Delete this event?"}>
            Delete event
          </ConfirmButton>
        </form>
      )}
    </section>
  );
}
