// Notifications sur tous vos appareils : inscription de l'appareil et envoi à un ami
const b64 = (s) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const pushState = () => (!pushSupported() ? "unsupported" : Notification.permission); // granted, denied, default

// coupées volontairement sur cet appareil (Réglages) : on ne les réactive pas tout seul
export const pushMuted = () => { try { return localStorage.getItem("quizly:pushOff") === "1"; } catch { return false; } };
const setMuted = (v) => { try { v ? localStorage.setItem("quizly:pushOff", "1") : localStorage.removeItem("quizly:pushOff"); } catch {} };

// inscrit cet appareil ; ask = true : demande l'autorisation (à appeler depuis un appui sur un bouton)
export async function enablePush(uid, ask) {
  if (!pushSupported() || !uid) return "unsupported";
  if (!ask && pushMuted()) return "muted";
  if (Notification.permission !== "granted") {
    if (!ask) return Notification.permission;
    const p = await Notification.requestPermission();
    if (p !== "granted") return p;
  }
  if (ask) setMuted(false);
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
// coupe les notifications sur cet appareil : l'abonnement est retiré, le serveur l'oublie ; renvoie l'adresse retirée
export async function disablePush(uid) {
  setMuted(true);
  const sub = await currentSub();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  try { await fetch("/api/push/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid, endpoint }) }); } catch {}
  try { await sub.unsubscribe(); } catch {}
  return endpoint;
}
// envoie une notification à tous les appareils d'un compte
export function sendPush(to, title, body, url) {
  fetch("/api/push/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, title, body, url }) }).catch(() => {});
}
// l'abonnement de cet appareil (pour l'enregistrer dans Firestore)
export async function currentSub() {
  try { const reg = await navigator.serviceWorker.getRegistration("/sw.js"); return reg ? await reg.pushManager.getSubscription() : null; } catch { return null; }
}
