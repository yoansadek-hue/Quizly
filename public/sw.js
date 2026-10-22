// Service worker de Quizly : uniquement les notifications (aucun cache, pour ne jamais bloquer une mise à jour)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "", {
    body: d.body || "", icon: "/icons/icon-192.png?v=3", badge: "/icons/icon-192.png?v=3", data: { url: d.url || "/" }, tag: d.url || "quizly"
  }));
});
// un appui sur la notification ouvre Quizly (ou le remet au premier plan) à la bonne page.
// Appli déjà ouverte : on lui envoie l'adresse (rejoindre le salon, ouvrir le défi…) et elle confirme ;
// sans réponse (ancienne version), on la recharge à la bonne adresse. Appli fermée : on l'ouvre à cette adresse.
// (Avant : on « naviguait » la page ; ça échouait en silence quand la page n'était pas contrôlée, et rien ne se passait.)
const ask = (c, url) => new Promise((ok) => {
  const ch = new MessageChannel(), t = setTimeout(() => ok(false), 1500);
  ch.port1.onmessage = () => { clearTimeout(t); ok(true); };
  try { c.postMessage({ type: "link", url }, [ch.port2]); } catch { clearTimeout(t); ok(false); }
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const c = all.find((x) => x.focused) || all[0];
    if (c) {
      try { await c.focus(); } catch {}
      if (await ask(c, url)) return;
      if ("navigate" in c) { try { await c.navigate(url); return; } catch {} }
    }
    return self.clients.openWindow(url);
  })());
});
