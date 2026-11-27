// Service worker: shows push notifications and opens the right page when one is tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "IndypenDance" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "IndypenDance", {
      body: data.body || "",
      icon: "/brand/icon-192.png",
      // Android shows the badge as a single-colour shape in the status bar
      badge: "/brand/badge-96.png",
      tag: data.tag,
      renotify: !!data.tag,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(self.location.origin));
      if (open) return open.navigate(url).then((w) => (w || open).focus());
      return self.clients.openWindow(url);
    }),
  );
});

// the browser replaced the subscription: the page will re-register it on next visit
self.addEventListener("pushsubscriptionchange", () => {});
