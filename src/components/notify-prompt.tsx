"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Shown on To-dos when this device could get reminders but hasn't been turned on yet
 * (each browser or phone has to say yes once). Hidden after "Not now" on this device.
 */
export function NotifyPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (localStorage.getItem("notify-prompt-dismissed")) return;
      } catch {}
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
      if (Notification.permission === "denied") return;
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) setShow(true);
    })().catch(() => {});
  }, []);

  if (!show) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <span className="flex-1">🔔 Reminders can&apos;t reach this device yet. Turn notifications on to get them here.</span>
      <Link href="/settings/notifications" className="btn py-1.5">
        Turn on
      </Link>
      <button
        type="button"
        className="text-amber-800 underline"
        onClick={() => {
          try {
            localStorage.setItem("notify-prompt-dismissed", "1");
          } catch {}
          setShow(false);
        }}
      >
        Not now
      </button>
    </div>
  );
}
