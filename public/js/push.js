// Notifications sur tous vos appareils : inscription de l'appareil et envoi à un ami
const b64 = (s) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const pushState = () => (!pushSupported() ? "unsupported" : Notification.permission); // granted, denied, default

// inscrit cet appareil ; ask = true : demande l'autorisation (à appeler depuis un appui sur un bouton)
export async function enablePush(uid, ask) {
  if (!pushSupported() || !uid) return "unsupported";
  if (Notification.permission !== "granted") {
    if (!ask) return Notification.permission;
    const p = await Notification.requestPermission();
    if (p !== "granted") return p;
  }
  try {
    const { key } = await (await fetch("/api/push/key")).json();
    if (!key) return "off"; // clés pas encore réglées sur le serveur
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub && localStorage.getItem("quizly:pushKey") !== key) { await sub.unsubscribe(); sub = null; } // la clé du serveur a changé
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
    localStorage.setItem("quizly:pushKey", key);
    await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid, sub: sub.toJSON() }) });
    return "granted";
  } catch (e) { console.warn("Notifications :", e.message); return "error"; }
}
// envoie une notification à tous les appareils d'un compte
export function sendPush(to, body, url) {
  fetch("/api/push/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, title: "Quizly", body, url }) }).catch(() => {});
}
