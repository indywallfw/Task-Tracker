"use client";

import { useEffect, useState } from "react";
import { forgetPushEndpoint, savePushSubscription, sendTestNotification } from "@/actions/notifications";

type State = "checking" | "unsupported" | "blocked" | "off" | "on" | "working";

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function deviceName() {
  const ua = navigator.userAgent;
  // the Android app opens the site with this referrer / display mode
  if (document.referrer.startsWith("android-app://") || /wv\)|IndypenDance/.test(ua)) return "Android app";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

/** Turns notifications on or off for the device you're on, and sends a test. */
export function PushSetup({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // keep the server's copy fresh (it may have been dropped or belong to someone else)
        await savePushSubscription(sub.toJSON(), deviceName());
        setState("on");
      } else setState("off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function turnOn() {
    setState("working");
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "blocked" : "off");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
      await savePushSubscription(sub.toJSON(), deviceName());
      setState("on");
      const { sent } = await sendTestNotification();
      setMessage(sent ? "Done. A test notification is on its way." : "Turned on, but the test didn't go out. Try the test button.");
    } catch (e) {
      setState("off");
      setMessage(e instanceof Error ? e.message : "Couldn't turn notifications on.");
    }
  }

  async function turnOff() {
    setState("working");
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await forgetPushEndpoint(sub.endpoint);
      await sub.unsubscribe();
    }
    setState("off");
    setMessage("");
  }

  async function test() {
    setMessage("");
    const { sent } = await sendTestNotification();
    setMessage(sent ? `Sent to ${sent} device${sent === 1 ? "" : "s"}.` : "Nothing was sent. Turn notifications on for this device first.");
  }

  if (!publicKey) return <p className="text-sm text-amber-800">Notifications aren&apos;t set up on this server yet.</p>;

  return (
    <div className="space-y-3 text-sm">
      {state === "checking" && <p className="text-stone-500">Checking this device…</p>}
      {state === "unsupported" && (
        <p className="text-stone-600">
          This browser can&apos;t receive notifications. On iPhone, add IndypenDance to your Home Screen first and open it from
          there.
        </p>
      )}
      {state === "blocked" && (
        <p className="text-amber-800">
          Notifications are blocked for this site. Allow them in your browser&apos;s site settings (the icon left of the address),
          then reload this page.
        </p>
      )}
      {(state === "off" || state === "working") && (
        <button className="btn" onClick={turnOn} disabled={state === "working"}>
          {state === "working" ? "Working…" : "Turn on notifications on this device"}
        </button>
      )}
      {state === "on" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-green-50 px-2.5 py-1 text-green-800">On for this device</span>
          <button className="btn-secondary" onClick={test}>
            Send a test
          </button>
          <button className="text-stone-500 underline" onClick={turnOff}>
            Turn off here
          </button>
        </div>
      )}
      {message && <p className="text-stone-600">{message}</p>}
    </div>
  );
}
