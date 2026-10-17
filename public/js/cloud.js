// Sauvegarde dans le cloud (Firestore) pour les comptes Google : vies, records, statistiques, joueurs habituels.
// Les comptes locaux restent sur l'appareil. Si Firestore n'est pas activé, rien ne casse : tout reste sur l'appareil.
import { firebaseApp, googleUid } from "./auth.js";

const KEYS = ["me", "daily", "dailyHist", "ach", "notifStart", "profiles", "roster", "history", "recent", "stats", "best2", "bestChrono", "bestMillion"]; // ce qui est sauvegardé
const RECORDS = ["best2", "bestChrono", "bestMillion"]; // pour un record, on garde toujours le plus grand
let fs = null, ref = null, uid = null, dirty = new Set(), timer = null, state = "local";
const k = (name) => `quizly:${uid}:${name}`;
const atKey = () => `quizly:${uid}:cloudAt`;
const getAt = () => { try { return JSON.parse(localStorage.getItem(atKey()) || "{}"); } catch { return {}; } };
const setAt = (o) => { try { localStorage.setItem(atKey(), JSON.stringify(o)); } catch {} };

async function load() {
  if (fs) return fs;
  const m = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  fs = { ...m, db: m.getFirestore(firebaseApp()) };
  return fs;
}

// on observe les écritures du jeu : toute donnée sauvegardée qui change part dans le cloud (regroupées toutes les 3 s)
const rawSet = Storage.prototype.setItem;
Storage.prototype.setItem = function (key, value) {
  rawSet.call(this, key, value);
  if (this !== localStorage || !uid || !ref) return;
  const name = KEYS.find((n) => key === k(n));
  if (!name) return;
  const at = getAt(); at[name] = Date.now(); rawSet.call(localStorage, atKey(), JSON.stringify(at));
  dirty.add(name);
  clearTimeout(timer); timer = setTimeout(push, 3000);
};

async function push() {
  if (!ref || !dirty.size) return;
  const names = [...dirty]; dirty = new Set();
  const at = getAt(), data = {};
  names.forEach((n) => { data[`data.${n}`] = localStorage.getItem(k(n)); data[`at.${n}`] = at[n] || Date.now(); });
  try { await fs.updateDoc(ref, data); state = "cloud"; }
  catch {
    try { // le document n'existe pas encore : on le crée
      const full = { data: {}, at: {} };
      names.forEach((n) => { full.data[n] = localStorage.getItem(k(n)); full.at[n] = at[n] || Date.now(); });
      await fs.setDoc(ref, full, { merge: true }); state = "cloud";
    } catch (e) { names.forEach((n) => dirty.add(n)); state = "error"; console.warn("Sauvegarde cloud impossible :", e.message); }
  }
}

// à la connexion : on récupère le cloud et on fusionne avec ce qu'il y a sur l'appareil
let pending = null;
export function startCloud(id) {
  if (state === "cloud" && uid === id) return Promise.resolve("cloud"); // déjà branché
  if (!id || id !== googleUid()) return Promise.resolve(state === "cloud" ? "cloud" : "local"); // Google pas encore prêt : on réessaiera
  if (pending && pending.id === id) return pending.p; // déjà en cours
  const p = connect(id).finally(() => { if (pending && pending.p === p) pending = null; });
  pending = { id, p };
  return p;
}
async function connect(id) {
  uid = null; ref = null; state = "local";
  try {
    await load();
    uid = id;
    ref = fs.doc(fs.db, "users", id);
    const snap = await fs.getDoc(ref);
    const cloud = snap.exists() ? snap.data() : { data: {}, at: {} };
    const at = getAt();
    for (const n of KEYS) {
      const local = localStorage.getItem(k(n)), remote = cloud.data ? cloud.data[n] : null;
      if (remote == null) { if (local != null) dirty.add(n); continue; } // seulement sur l'appareil : on l'envoie
      if (RECORDS.includes(n)) { // record : le plus grand des deux
        const best = Math.max(+local || 0, +remote || 0);
        rawSet.call(localStorage, k(n), String(best));
        if (best !== (+remote || 0)) dirty.add(n);
        continue;
      }
      if (n === "stats" && local) { // statistiques : on additionne au mieux sans compter deux fois
        try {
          const a = JSON.parse(local), b = JSON.parse(remote), m = { themes: {}, games: {} };
          for (const src of [a, b]) {
            for (const [t, v] of Object.entries(src.themes || {})) { const c = (m.themes[t] ||= { ok: 0, n: 0 }); if (v.n > c.n) { c.n = v.n; c.ok = v.ok; } }
            for (const [g, v] of Object.entries(src.games || {})) m.games[g] = Math.max(m.games[g] || 0, v);
          }
          rawSet.call(localStorage, k(n), JSON.stringify(m)); dirty.add(n);
        } catch { rawSet.call(localStorage, k(n), remote); }
        continue;
      }
      // le reste : la version la plus récente gagne
      if (local == null || (cloud.at && (cloud.at[n] || 0) > (at[n] || 0))) { rawSet.call(localStorage, k(n), remote); at[n] = cloud.at ? cloud.at[n] : Date.now(); }
      else if (local !== remote) dirty.add(n);
    }
    setAt(at);
    state = "cloud";
    if (dirty.size) push();
    return "cloud";
  } catch (e) {
    console.warn("Cloud indisponible :", e.message);
    uid = null; ref = null; state = "error";
    return "error";
  }
}
export const cloudState = () => state;
export const cloudFs = () => (state === "cloud" && fs && uid ? { fs, uid } : null); // pour les amis // « cloud », « local » (compte local) ou « error »
addEventListener("pagehide", () => { if (dirty.size) push(); }); // on envoie ce qui reste avant de fermer
