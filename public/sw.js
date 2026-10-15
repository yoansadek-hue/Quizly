// Service worker de Quizly : uniquement les notifications (aucun cache, pour ne jamais bloquer une mise à jour)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Quizly", {
    body: d.body || "", icon: "/icons/icon-192.png?v=3", badge: "/icons/icon-192.png?v=3", data: { url: d.url || "/" }, tag: d.url || "quizly"
  }));
});
// un appui sur la notification ouvre Quizly (ou le remet au premier plan) à la bonne page
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("navigate" in c) { await c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  })());
});
