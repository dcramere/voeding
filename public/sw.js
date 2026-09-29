// DCRAMERE Coaching — service worker for push notifications.
// Pushes arrive without content; the text is fetched from the API with the user's own session cookie.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    let list = [];
    try {
      const r = await fetch("/api/push/pending", { credentials: "include" });
      if (r.ok) list = (await r.json()).notificaties || [];
    } catch (err) { /* offline: show the generic notification below */ }
    // browsers (iOS in particular) require a visible notification for every push
    if (!list.length) list = [{ titel: "DCRAMERE Coaching", tekst: "Er is iets nieuws voor u.", url: "/app/" }];
    for (const n of list) {
      await self.registration.showNotification(n.titel, {
        body: n.tekst, icon: "/img/icon-192.png", badge: "/img/icon-48.png", tag: n.url, renotify: true, data: { url: n.url },
      });
    }
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/app/", self.location.origin);
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const area = url.pathname.split("/")[1]; // "app" or "coach"
    const win = wins.find((w) => new URL(w.url).pathname.split("/")[1] === area);
    if (win) { await win.focus(); if ("navigate" in win) await win.navigate(url.href); return; }
    await self.clients.openWindow(url.href);
  })());
});
