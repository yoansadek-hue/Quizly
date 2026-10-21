import "dotenv/config";
import express from "express";
import webpush from "web-push";
import { firebaseConfig } from "./public/js/config.js";
import { WebSocketServer } from "ws";
import { answerMatches } from "./public/js/impostor.js";
import { LOCAL_THEMES, IMP_LOCAL_OK, makeLocal, PRIZES, millionLevel, wonAt, safeAt, publicVote, SONG_THEME, songPool, songLabel, SONGS } from "./public/js/local.js";

const app = express();
app.use(express.json({ limit: "60kb" }));

/* ---------- notifications (push) : « Tom vous a ajouté », « Tom vous invite à jouer » ----------
   Les clés se règlent sur Render (Environment) : VAPID_PUBLIC et VAPID_PRIVATE.
   Chaque appareil s'enregistre à l'ouverture de l'appli ; la liste est gardée en mémoire. */
const VAPID_PUBLIC = process.env.VAPID_PUBLIC || "", VAPID_PRIVATE = process.env.VAPID_PRIVATE || "";
const pushOn = !!(VAPID_PUBLIC && VAPID_PRIVATE);
if (pushOn) webpush.setVapidDetails("mailto:contact@quizly.app", VAPID_PUBLIC, VAPID_PRIVATE);
const pushSubs = new Map(); // compte → Map(adresse de l'appareil → abonnement)
const pushHits = new Map();
const cleanUid = (u) => String(u || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 128);
app.get("/api/push/key", (req, res) => res.json({ key: pushOn ? VAPID_PUBLIC : null }));
app.post("/api/push/subscribe", (req, res) => {
  const uid = cleanUid(req.body && req.body.uid), sub = req.body && req.body.sub;
  if (!pushOn || !uid || !sub || typeof sub.endpoint !== "string" || !sub.keys) return res.status(400).json({ ok: false });
  const m = pushSubs.get(uid) || new Map();
  m.set(sub.endpoint, { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh || ""), auth: String(sub.keys.auth || "") } });
  if (m.size > 8) m.delete(m.keys().next().value); // 8 appareils par compte au plus
  pushSubs.set(uid, m);
  res.json({ ok: true });
});
// notifications coupées sur un appareil (Réglages) : on ne lui envoie plus rien
app.post("/api/push/unsubscribe", (req, res) => {
  const endpoint = req.body && req.body.endpoint;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) return res.status(400).json({ ok: false });
  deadSubs.add(endpoint);
  for (const m of pushSubs.values()) m.delete(endpoint);
  res.json({ ok: true });
});
// les appareils inscrits sont aussi enregistrés dans Firestore (collection « pushsubs », lisible par le serveur)
let fsSubs = { at: 0, list: [], err: "" };
const deadSubs = new Set(); // appareils désinscrits (le téléphone a retiré l'autorisation)
async function loadFsSubs() {
  if (Date.now() - fsSubs.at < 120000) return fsSubs.list;
  const out = [];
  try {
    let page = "";
    for (let i = 0; i < 20; i++) {
      const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/pushsubs?pageSize=300&key=${firebaseConfig.apiKey}${page ? `&pageToken=${page}` : ""}`;
      const j = await getJSON(url, {}, 8000);
      for (const d of j.documents || []) {
        const f = d.fields || {}, v = (k) => (f[k] && f[k].stringValue) || "";
        if (v("endpoint")) out.push({ uid: v("uid"), sub: { endpoint: v("endpoint"), keys: { p256dh: v("p256dh"), auth: v("auth") } } });
      }
      if (!j.nextPageToken) break;
      page = j.nextPageToken;
    }
    fsSubs = { at: Date.now(), list: out, err: "" };
  } catch (e) { fsSubs.err = e.message; console.warn("Appareils (Firestore) :", e.message); }
  return fsSubs.list;
}
// tous les appareils d'un compte (ou de tout le monde si uid vide), sans doublon
async function devicesOf(uid, except) {
  const map = new Map();
  for (const [u, m] of pushSubs) if ((!uid || u === uid) && u !== except) for (const sub of m.values()) map.set(sub.endpoint, sub);
  for (const d of await loadFsSubs()) if ((!uid || d.uid === uid) && d.uid !== except) map.set(d.sub.endpoint, d.sub);
  return [...map.values()].filter((x) => !deadSubs.has(x.endpoint));
}
async function pushTo(subs, payload) {
  let sent = 0;
  await Promise.all(subs.map(async (sub) => {
    try { await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600 }); sent++; }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) { deadSubs.add(sub.endpoint); for (const m of pushSubs.values()) m.delete(sub.endpoint); } }
  }));
  return sent;
}

app.post("/api/push/send", async (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress, now = Date.now();
  const recent = (pushHits.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 20) return res.status(429).json({ ok: false }); // pas de rafale
  pushHits.set(ip, [...recent, now]);
  const to = cleanUid(req.body && req.body.to);
  const title = String((req.body && req.body.title) || "").slice(0, 60), body = String((req.body && req.body.body) || "").slice(0, 140);
  const url = String((req.body && req.body.url) || "/").slice(0, 120);
  if (!pushOn || !to) return res.json({ ok: true, sent: 0 });
  const sent = await pushTo(await devicesOf(to), { title, body, url: url.startsWith("/") ? url : "/" });
  res.json({ ok: true, sent });
});

// mode développeur : la clé ADMIN_KEY (réglée sur Render) permet d'envoyer une annonce à tous les appareils inscrits
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const isAdmin = (k) => ADMIN_KEY.length >= 8 && String(k || "") === ADMIN_KEY;
app.post("/api/admin/check", (req, res) => res.json({ ok: isAdmin(req.body && req.body.key) }));
// abonnements envoyés par le téléphone du développeur (lus dans Firestore avec son compte) : marche même si le serveur ne peut pas lire Firestore
const okSub = (x) => x && typeof x.endpoint === "string" && x.endpoint.startsWith("https://") && x.keys && typeof x.keys.p256dh === "string" && typeof x.keys.auth === "string";
app.post("/api/push/broadcast", async (req, res) => {
  if (!isAdmin(req.body && req.body.key)) return res.status(403).json({ ok: false });
  const title = String((req.body && req.body.title) || "").slice(0, 60), body = String((req.body && req.body.body) || "").slice(0, 160);
  if (!pushOn) return res.json({ ok: true, sent: 0, devices: 0, why: "Clés VAPID absentes sur Render." });
  if (!(title || body)) return res.json({ ok: true, sent: 0, devices: 0 });
  const from = cleanUid(req.body && req.body.from), map = new Map();
  for (const s of await devicesOf("", from)) map.set(s.endpoint, s); // pas à vous-même
  for (const d of Array.isArray(req.body.subs) ? req.body.subs.slice(0, 5000) : []) {
    if (okSub(d.sub) && d.uid !== from && !deadSubs.has(d.sub.endpoint)) map.set(d.sub.endpoint, { endpoint: d.sub.endpoint, keys: { p256dh: d.sub.keys.p256dh, auth: d.sub.keys.auth } });
  }
  const sent = await pushTo([...map.values()], { title, body, url: "/?notifs=1" });
  res.json({ ok: true, sent, devices: map.size, fsErr: fsSubs.err || "" });
});
// état des notifications (mode développeur) : combien d'appareils le serveur connaît, et si Firestore lui répond
app.post("/api/push/status", async (req, res) => {
  if (!isAdmin(req.body && req.body.key)) return res.status(403).json({ ok: false });
  fsSubs.at = 0; const fs = await loadFsSubs();
  let mem = 0; for (const m of pushSubs.values()) mem += m.size;
  res.json({ ok: true, push: pushOn, memory: mem, firestore: fs.length, fsErr: fsSubs.err || "" });
});

/* ---------- Défi du jour : les mêmes 10 questions pour tout le monde, chaque jour ---------- */
const parisDay = (t = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(t); // « 2026-10-15 »
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const dailyCache = new Map();
function dailySet(day) {
  if (dailyCache.has(day)) return dailyCache.get(day);
  let seed = 0; for (const c of `quizly-${day}`) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = seeded(seed), real = Math.random;
  Math.random = rnd; // même tirage pour tout le monde ce jour-là (questions sans IA, sans chanson ni logo)
  const pool = LOCAL_THEMES.filter((t) => t !== SONG_THEME && t !== "Logos"), qs = [], used = new Set();
  try {
    for (let i = 0; i < 10; i++) {
      const d = Math.min(5, 1 + Math.floor(i / 2)); // 2 questions par niveau, de Facile à Légende
      for (let t = 0; t < 30; t++) {
        const q = makeLocal(pool[Math.floor(rnd() * pool.length)], d);
        if (!q || used.has(q.key) || new Set(q.o).size < 2) continue;
        used.add(q.key);
        const o = [...q.o]; for (let k = o.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [o[k], o[j]] = [o[j], o[k]]; }
        qs.push({ t: q.t, d, q: q.q, img: q.img || null, o, a: q.a });
        break;
      }
    }
  } finally { Math.random = real; }
  const set = { day, questions: qs };
  dailyCache.set(day, set);
  if (dailyCache.size > 4) dailyCache.delete(dailyCache.keys().next().value);
  return set;
}
// le défi d'aujourd'hui, ou celui d'un des 7 jours précédents (pour revoir ses réponses)
app.get("/api/daily", (req, res) => {
  const today = parisDay(), day = String(req.query.day || today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today || Date.parse(today) - Date.parse(day) > 7 * 86400000) return res.json(dailySet(today));
  res.json(dailySet(day));
});
// chaque jour à 10 h (heure de Paris), le serveur prévient tout le monde que le défi est prêt.
// Il ne s'endort pas grâce à UptimeRobot ; une seule fois par jour, même s'il redémarre ensuite.
let dailyPushedOn = "";
async function dailyPush() {
  const day = parisDay();
  if (!pushOn || dailyPushedOn === day) return 0;
  dailyPushedOn = day;
  return pushTo(await devicesOf(""), { title: "Défi du jour", body: "Les 10 questions du jour sont prêtes. Battez vos amis !", url: "/?defi=1" });
}
setInterval(() => {
  const [h, m] = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false }).format(Date.now()).split(":").map(Number);
  if (h === 10 && m < 10) dailyPush().catch((e) => console.warn("Défi de 10 h :", e.message)); // entre 10 h 00 et 10 h 09
}, 60000);
// envoi manuel possible (mode développeur ou service externe)
app.get("/api/daily/notify", async (req, res) => {
  if (!isAdmin(req.query.key)) return res.status(403).json({ ok: false });
  if (!pushOn) return res.json({ ok: true, sent: 0 });
  dailyPushedOn = ""; // envoi manuel : on force
  const sent = await dailyPush();
  res.json({ ok: true, sent, day: parisDay() });
});

// utilisé par la page de réveil et par un éventuel service qui garde le serveur éveillé
app.get("/health", (req, res) => {
  res.set({ "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" }).json({ ok: true });
});

const KEY = process.env.AI_API_KEY;
const BASE = process.env.AI_BASE_URL || "https://api.groq.com/openai/v1";
const MODEL = process.env.MODEL || "openai/gpt-oss-120b";
const EFFORT = process.env.REASONING_EFFORT || "low"; // low | medium | high : plus haut = plus fiable mais plus de tokens
const LEVELS = ["", "Facile", "Moyen", "Difficile", "Expert", "Légende"];

const ICONS = {
  32: "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",
  180: "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",
  192: "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",
  512: "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"
};
app.get("/icons/icon-:n.png", (req, res) => {
  const b = ICONS[req.params.n];
  if (!b) return res.sendStatus(404);
  res.type("png").set("Cache-Control", "public, max-age=3600").send(Buffer.from(b, "base64"));
});
// pages, scripts et styles : toujours revérifiés auprès du serveur (sinon l'iPhone peut mélanger une ancienne page et un nouveau script)
app.use(express.static("public", { setHeaders: (res, file) => { if (/\.(html|js|css|webmanifest)$/.test(file)) res.set("Cache-Control", "no-cache"); } }));

/* ====================== Génération des questions ====================== */
const SYSTEM = `Tu écris des questions de quiz en français, du niveau d'un bon jeu télévisé. Réponds uniquement par un tableau JSON compact, sans texte ni Markdown :
[{"t":thème,"q":question,"a":bonne réponse,"w":[3 mauvaises réponses],"c":certitude de 1 à 5}]

QUESTION
- Une phrase claire, autonome et précise (le contexte est dans la question : qui, quoi, quel domaine), 140 caractères au plus.
- Une seule bonne réponse, indiscutable et vérifiable. Jamais d'opinion, de « le plus / le meilleur » sans consensus, de chiffre très précis, de classement ou record qui a pu changer, d'événement après 2023.
- La question ne contient pas la réponse ni un mot qui la trahit. Pas de double négation, pas de « Laquelle de ces affirmations ».
- Intéressante : un fait marquant ou étonnant, pas une banalité.

RÉPONSES
- "a" : courte (1 à 5 mots), écrite exactement comme on l'attend.
- "w" : 3 mauvaises réponses de MÊME NATURE que "a" (une ville → 3 villes, une année → 3 années proches, une personne → 3 personnes du même domaine et de la même époque), de longueur et de forme semblables, crédibles pour quelqu'un qui hésite.
- Les mauvaises réponses sont certainement fausses : jamais un synonyme, une partie, une autre écriture ou une réponse aussi acceptable que "a". Jamais de réponse absurde, d'humour, de « toutes / aucune de ces réponses ».

DIFFICULTÉ (1 à 5)
1 : connu de presque tout le monde. 2 : culture générale courante. 3 : amateur du sujet. 4 : passionné. 5 : expert, mais toujours un fait vérifiable.
Plus c'est difficile, plus les mauvaises réponses sont proches de la bonne.

THÈMES
- Un thème peut être un sujet précis écrit par le joueur (« One Piece », « la F1 des années 90 », « Harry Potter », « les volcans »). Chaque question porte alors PRÉCISÉMENT sur ce sujet, jamais sur un domaine voisin plus général. "t" reprend le nom du thème tel qu'il est donné.
- Si un sujet est trop étroit, utilise ses faits les plus documentés (personnages, lieux, dates, auteurs, œuvres) plutôt que d'inventer.
- Thème « Musique » : musique moderne uniquement (2000 à aujourd'hui) : rap US et FR, R&B, pop actuelle, afrobeats.

"c" = ta certitude que la question est juste et sans ambiguïté (5 = certain à 100 %). Si tu hésites, change de question.`;

// relecture : une seconde passe de l'IA écarte les questions fausses, ambiguës ou hors sujet
const CHECK = `Tu vérifies des questions de quiz en français. Pour chacune, réponds "ok": true seulement si : la bonne réponse "a" est exacte, aucune des mauvaises réponses "w" n'est aussi correcte, la question n'est pas ambiguë, et elle porte bien sur son thème "t".
Réponds uniquement par un tableau JSON compact, dans le même ordre : [{"i":numéro,"ok":true|false}]`;

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

async function chat(system, user, effort, temperature) {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature,
      ...(MODEL.includes("gpt-oss") ? { reasoning_effort: effort } : {}),
      messages: [{ role: "system", content: system }, { role: "user", content: user }]
    })
  });
  if (r.status === 429) { const e = new Error("L'IA est saturée, réessayez dans une minute."); e.status = 429; throw e; }
  if (!r.ok) throw new Error(`API ${r.status} ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const text = data.choices?.[0]?.message?.content || "";
  const m = text.replace(/```json|```/g, "").match(/\[[\s\S]*\]/); // le tableau, même entouré de texte
  const raw = JSON.parse(m ? m[0] : text);
  return Array.isArray(raw) ? raw : (Object.values(raw || {}).find(Array.isArray) || []);
}
// contrôles simples, sans IA : une question mal formée ne passe pas
function wellFormed(x) {
  const q = norm(x.q), a = norm(x.a), w = x.w.map(norm);
  if (x.q.length < 12 || x.q.length > 220 || !a || a.length > 60) return false;
  if (new Set([a, ...w]).size < 4 || w.some((o) => !o)) return false; // réponses en double
  if (w.some((o) => (a.length >= 4 && o.includes(a)) || (o.length >= 4 && a.includes(o)))) return false; // une mauvaise réponse contient la bonne (ou l'inverse)
  if (a.length > 3 && q.includes(a)) return false; // la question donne la réponse
  if ([a, ...w].some((o) => /^(toutes|aucune|les deux)\b/.test(o))) return false;
  const lens = [x.a, ...x.w].map((o) => o.length), long = Math.max(...lens), short = Math.min(...lens);
  if (long > 3 * short + 12) return false; // une réponse beaucoup plus longue se repère tout de suite
  return true;
}

// L'Imposteur : l'imposteur ne doit jamais pouvoir trouver la réponse seul
const HARD = `
MODE IMPOSTEUR : questions EXTRÊMEMENT difficiles, encore plus que le niveau 5 : des faits pointus et vérifiables (noms propres, dates, lieux, titres, chiffres marquants) que seul un vrai spécialiste connaît. Personne ne doit pouvoir trouver la réponse par déduction, calcul, logique, étymologie ou élimination : la question ne donne aucun indice. Jamais de culture générale courante. Les 3 mauvaises réponses sont très proches et tout aussi crédibles.`;
async function generate(themes, diff, count, avoid, hard = false) {
  if (!KEY) throw new Error("AI_API_KEY manquante côté serveur");
  const want = count + 3; // un peu plus : certaines seront écartées
  const prompt = `${want} questions, thèmes : ${themes.map((t) => `« ${t} »`).join(", ")}. Difficulté ${diff}/5 (${LEVELS[diff]}).${hard ? HARD : ""} Répartis les questions entre les thèmes, varie les sous-sujets, les époques et les types de réponses (personnes, lieux, dates, œuvres, objets). Graine ${Math.random().toString(36).slice(2, 7)}.` +
    (avoid.length ? `\nDéjà posées (ne pas reposer ni reformuler) :\n- ${avoid.join("\n- ")}` : "");
  const list = await chat(SYSTEM, prompt, EFFORT === "low" ? "medium" : EFFORT, 0.7);
  let questions = list
    .map((x) => ({
      t: String(x?.t || themes[0]).slice(0, 60), d: diff, q: String(x?.q || "").trim(), a: String(x?.a || "").trim(),
      c: x?.c == null ? 5 : Number(x.c),
      w: (Array.isArray(x?.w) ? x.w : Array.isArray(x?.o) ? x.o : []).map((o) => String(o).trim()).filter((o) => o && o !== String(x?.a)).slice(0, 3)
    }))
    .filter((x) => x.q && x.a && x.w.length === 3 && x.c >= 4 && wellFormed(x)); // on écarte les questions dont l'IA doute ou mal formées
  // seconde passe : relecture (si elle échoue, on garde les questions déjà filtrées)
  if (questions.length) try {
    const verdict = await chat(CHECK, JSON.stringify(questions.map(({ t, q, a, w }, i) => ({ i, t, q, a, w }))), "medium", 0);
    const bad = new Set(verdict.filter((v) => v && v.ok === false).map((v) => Number(v.i)));
    const kept = questions.filter((_, i) => !bad.has(i));
    if (kept.length) questions = kept;
  } catch (e) { console.warn("Relecture :", e.message); }
  questions = questions.slice(0, count).map(({ w, c, ...x }) => ({ ...x, o: [x.a, ...w] }));
  if (!questions.length) throw new Error("Réponse vide");
  return questions;
}

const hits = new Map(); // 10 requêtes / minute / IP
/* =====================================================================
   Questions « sans fin » : chansons (iTunes) et logos (Wikidata + icônes Google)
   ===================================================================== */
const plain = (x) => String(x).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
async function getJSON(url, opts = {}, ms = 7000) {
  const ctl = new AbortController(), stop = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { ...opts, signal: ctl.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
  finally { clearTimeout(stop); }
}
const pickOne = (a) => a[Math.floor(Math.random() * a.length)];

/* ---------- Devine la chanson : un artiste, tout son répertoire iTunes ---------- */
// niveau 1 : très connus · 2 : connus · 3 : classiques et plus pointus
const ARTISTS = {
  1: ["Michael Jackson", "Stromae", "Daft Punk", "Queen", "Adele", "Ed Sheeran", "Rihanna", "Beyoncé", "Céline Dion", "Aya Nakamura", "Angèle", "The Weeknd", "Dua Lipa", "ABBA", "Bruno Mars", "Coldplay", "Eminem", "Shakira", "Johnny Hallyday", "Indila", "GIMS", "Jul", "Taylor Swift", "Billie Eilish", "Imagine Dragons", "David Guetta"],
  2: ["Christophe Maé", "Kendji Girac", "Zaz", "Vianney", "Soprano", "Orelsan", "PNL", "Nekfeu", "Damso", "Ninho", "Slimane", "Louane", "Calogero", "Pharrell Williams", "Lady Gaga", "Katy Perry", "Justin Bieber", "Harry Styles", "Arctic Monkeys", "Muse", "Linkin Park", "Avicii", "Black Eyed Peas", "Maroon 5", "Sia"],
  3: ["Jacques Brel", "Édith Piaf", "Joe Dassin", "Charles Aznavour", "Francis Cabrel", "Indochine", "Téléphone", "Daniel Balavoine", "Mylène Farmer", "Michel Sardou", "The Beatles", "Eagles", "Toto", "a-ha", "Renaud", "Jean-Jacques Goldman", "Serge Gainsbourg", "France Gall", "Claude François", "Elvis Presley", "Bob Marley", "Nirvana", "The Rolling Stones", "Led Zeppelin"]
};
const artistCache = new Map(); // artiste → { at, songs: [{ title, audio }] } (gardé 24 h)
const cleanTitle = (t) => String(t).replace(/\s*[\(\[][^\)\]]*[\)\]]/g, "").replace(/\s+-\s+.*$/, "").trim(); // « Titre (feat. X) - Remastered » → « Titre »
async function artistSongs(artist) {
  const c = artistCache.get(artist);
  if (c && Date.now() - c.at < 86400000) return c.songs;
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=song&attribute=artistTerm&limit=80&country=FR`;
  const { results = [] } = await getJSON(url);
  const words = plain(artist).split(" ").filter((w) => w.length >= 3);
  const out = [], seenT = new Set();
  for (const x of results) {
    if (!x.previewUrl || !x.trackName) continue;
    const who = plain(x.artistName || "");
    if (words.length && !words.some((w) => who.includes(w))) continue; // un autre artiste
    if (/karaok|tribute|cover|instrumental|reprise|live|remix|acoustic|version|edit\b|medley/i.test(`${x.trackName} ${x.collectionName || ""}`)) continue;
    const title = cleanTitle(x.trackName), k = plain(title);
    if (!k || seenT.has(k)) continue;
    seenT.add(k);
    out.push({ title, audio: x.previewUrl }); // ordre iTunes : les plus connues d'abord
  }
  artistCache.set(artist, { at: Date.now(), songs: out });
  return out;
}
async function songQuestion(d, isNew = () => true) {
  const levels = d <= 2 ? [1] : d === 3 ? [1, 2] : d === 4 ? [2, 3] : [2, 3, 3];
  const depth = [0, 6, 10, 16, 26, 40][d]; // plus le niveau monte, moins le titre est connu
  for (let t = 0; t < 8; t++) {
    const artist = pickOne(ARTISTS[pickOne(levels)]);
    let songs;
    try { songs = await artistSongs(artist); } catch { continue; }
    if (songs.length < 4) continue;
    const pool = songs.slice(0, Math.max(4, Math.min(depth, songs.length)));
    for (const s of [...pool].sort(() => Math.random() - 0.5)) {
      const q = { t: SONG_THEME, d, q: `Quelle est cette chanson de ${artist} ?`, a: s.title, audio: s.audio, key: `~song:${plain(artist)}:${plain(s.title)}` };
      if (!isNew(q)) continue;
      // les autres choix : d'autres titres du même artiste, de notoriété voisine
      const i = songs.indexOf(s);
      const near = songs.filter((x) => x !== s).sort((x, y) => Math.abs(songs.indexOf(x) - i) - Math.abs(songs.indexOf(y) - i)).slice(0, 8);
      q.o = [s.title, ...shuffle(near).slice(0, 3).map((x) => x.title)];
      return q;
    }
  }
  throw new Error("Extrait musical introuvable.");
}

/* ---------- Logos : des centaines de marques par secteur (Wikidata), icône vérifiée ---------- */
const SECTORS = [
  { qid: "Q786820", q: "Quel constructeur automobile a ce logo ?" },
  { qid: "Q46970", q: "Quelle compagnie aérienne a ce logo ?" },
  { qid: "Q476028", q: "Quel club de football a ce logo ?" },
  { qid: "Q22687", q: "Quelle banque a ce logo ?" }
  // pas de chaînes télé, de maisons de mode ni de studios de jeux : leur logo est presque toujours leur nom écrit
];
const sectorCache = new Map(); // secteur → { at, list: [{ name, dom }] } triée par notoriété
async function sectorBrands(sec) {
  const c = sectorCache.get(sec.qid);
  if (c && Date.now() - c.at < 86400000) return c.list;
  const sparql = `SELECT ?item ?itemLabel ?site ?links WHERE {
    ?item wdt:P31 wd:${sec.qid}; wdt:P856 ?site; wikibase:sitelinks ?links.
    FILTER(?links >= 12)
    SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
  } ORDER BY DESC(?links) LIMIT 200`;
  const j = await getJSON(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`,
    { headers: { Accept: "application/sparql-results+json", "User-Agent": "QuizlyGame/2.7 (jeu de quiz ; https://quizly-np1p.onrender.com)" } }, 12000);
  const list = [], doms = new Set(), names = new Set();
  for (const b of j.results.bindings) {
    const name = b.itemLabel?.value || "";
    let dom = "";
    try { dom = new URL(b.site.value).hostname.replace(/^www\./, ""); } catch { continue; }
    if (!name || /^Q\d+$/.test(name) || doms.has(dom) || names.has(plain(name))) continue;
    if (/^[A-Z0-9&.\- ]{2,5}$/.test(name.trim())) continue; // sigle court (BMW, KLM…) : presque toujours écrit dans le logo
    doms.add(dom); names.add(plain(name));
    list.push({ name, dom });
  }
  sectorCache.set(sec.qid, { at: Date.now(), list });
  return list;
}
const iconOk = new Map(); // site → l'icône existe-t-elle vraiment (pas le globe par défaut) ?
const iconUrl = (dom) => `https://www.google.com/s2/favicons?domain=${dom}&sz=128`;
async function checkIcon(dom) {
  if (iconOk.has(dom)) return iconOk.get(dom);
  let ok = false;
  try {
    const ctl = new AbortController(), stop = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(iconUrl(dom), { signal: ctl.signal }); clearTimeout(stop);
    if (r.ok) {
      const b = Buffer.from(await r.arrayBuffer());
      const png = b.length > 24 && b.readUInt32BE(0) === 0x89504e47;
      ok = png && b.readUInt32BE(16) >= 64 && b.length > 1500; // une vraie icône, assez grande
    }
  } catch { ok = false; }
  iconOk.set(dom, ok);
  return ok;
}
async function logoQuestion(d, isNew = () => true) {
  const window = [0, 15, 30, 55, 90, 200][d]; // les plus connues d'abord, puis de plus en plus pointues
  for (let t = 0; t < 6; t++) {
    const sec = pickOne(SECTORS);
    let list;
    try { list = await sectorBrands(sec); } catch { continue; }
    if (list.length < 8) continue;
    const top = list.slice(0, Math.min(window, list.length));
    const from = d >= 4 ? Math.floor(top.length / 3) : 0; // aux niveaux durs, on évite les plus célèbres
    for (const b of shuffle(top.slice(from)).slice(0, 6)) {
      const q = { t: "Logos", d, q: sec.q, a: b.name, img: iconUrl(b.dom), logo: true, key: `~logo:${b.dom}` };
      if (!isNew(q) || !(await checkIcon(b.dom))) continue;
      const i = list.indexOf(b);
      const near = list.filter((x) => x !== b).sort((x, y) => Math.abs(list.indexOf(x) - i) - Math.abs(list.indexOf(y) - i)).slice(0, 7); // même secteur, notoriété voisine
      q.o = [b.name, ...shuffle(near).slice(0, 3).map((x) => x.name)];
      return q;
    }
  }
  throw new Error("Logo introuvable.");
}

/* ---------- jamais deux fois la même question dans une partie ---------- */
const sigs = (q) => [q.key, `${plain(q.q)}|${plain(q.a)}`].filter(Boolean);
const histSig = (q) => `${plain(q.q)}|${q.img || q.audio || ""}`;
const softOf = (room) => room.soft || (room.soft = new Set(players(room).flatMap((p) => p.hist || []))); // vues par les joueurs lors de parties précédentes
const isNewIn = (set) => (q) => q && !sigs(q).some((k) => set.has(k));
const markIn = (set, q) => sigs(q).forEach((k) => set.add(k));
// question « sans IA » : les chansons et les logos viennent des API, le reste est fabriqué sur place
async function makeAny(theme, d, isNew = () => true) {
  try {
    if (theme === SONG_THEME) return await songQuestion(d, isNew);
    if (theme === "Logos") return await logoQuestion(d, isNew);
  } catch { /* API indisponible : liste intégrée */ }
  return makeLocal(theme, d);
}
// tire une question sans IA jamais posée : d'abord les thèmes choisis, puis les niveaux voisins, puis les autres thèmes
async function pickLocal(themes, d, used, soft) {
  const ok = isNewIn(used);
  const others = LOCAL_THEMES.filter((t) => !themes.includes(t));
  const plan = [[themes, d], [themes, Math.max(1, d - 1)], [themes, Math.min(5, d + 1)], [others.length ? others : themes, d]];
  for (const [ts, dd] of plan) {
    for (let i = 0; i < 40; i++) {
      const q = await makeAny(pickOne(ts), dd, ok);
      // d'abord une question qu'aucun joueur n'a vue récemment ; sinon, jamais vue dans cette partie
      if (ok(q) && (i >= 25 || !soft || !soft.has(histSig(q)))) { markIn(used, q); return q; }
    }
  }
  return null;
}
// extrait musical relayé par le serveur (pour le jouer sans le lecteur du téléphone) : seulement les adresses d'Apple
app.get("/api/audio", async (req, res) => {
  let u;
  try { u = new URL(String(req.query.u || "")); } catch { return res.status(400).end(); }
  if (u.protocol !== "https:" || !/(^|\.)(itunes\.apple\.com|mzstatic\.com|apple\.com)$/.test(u.hostname)) return res.status(403).end();
  try {
    const ctl = new AbortController(), stop = setTimeout(() => ctl.abort(), 10000);
    const r = await fetch(u, { signal: ctl.signal }); clearTimeout(stop);
    if (!r.ok) return res.status(502).end();
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length > 3_000_000) return res.status(413).end();
    res.set("Content-Type", r.headers.get("content-type") || "audio/mp4").set("Cache-Control", "public, max-age=86400").send(b);
  } catch { res.status(502).end(); }
});

app.get("/api/song", async (req, res) => {
  const avoid = new Set(String(req.query.avoid || "").split(",").filter(Boolean).slice(0, 300));
  try { res.json(await songQuestion(clamp(+req.query.d || 1, 1, 5), (q) => !avoid.has(q.key))); }
  catch (e) { res.status(502).json({ error: e.message }); }
});
app.get("/api/logo", async (req, res) => {
  const avoid = new Set(String(req.query.avoid || "").split(",").filter(Boolean).slice(0, 300));
  try { res.json(await logoQuestion(clamp(+req.query.d || 1, 1, 5), (q) => !avoid.has(q.key))); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.post("/api/questions", async (req, res) => {
  const now = Date.now();
  const recent = (hits.get(req.ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 10) return res.status(429).json({ error: "Trop de requêtes, patientez." });
  hits.set(req.ip, [...recent, now]);

  const themes = (Array.isArray(req.body.themes) ? req.body.themes : []).slice(0, 15).map((t) => String(t).slice(0, 60));
  const diff = Math.min(Math.max(+req.body.difficulty || 1, 1), 5);
  const count = Math.min(Math.max(+req.body.count || 6, 1), 10);
  const avoid = (Array.isArray(req.body.avoid) ? req.body.avoid : []).slice(-20).map((x) => String(x).slice(0, 70));
  if (!themes.length) return res.status(400).json({ error: "Aucun thème" });
  try { res.json({ questions: await generate(themes, diff, count, avoid, !!req.body.hard) }); }
  catch (e) {
    console.error(e.message);
    res.status(e.status || 502).json({ error: e.status === 429 ? e.message : "Génération impossible, réessayez." });
  }
});

/* ====================== Salles en ligne (WebSocket) ====================== */
const rooms = new Map();
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const newCode = (n = 4) => { let c; do { c = Array.from({ length: n }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join(""); } while (rooms.has(c)); return c; };
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const players = (room) => [...room.players.values()];
const alive = (room) => players(room).filter((p) => !p.dead);
// les écrans TV (mode Kahoot) reçoivent tout ce qui est envoyé à la salle
const tvs = (room) => room.tvs || (room.tvs = new Set());
// les téléphones cachent la question quand elle est sur la télé : en partie, seulement si la partie a démarré avec la télé
// (le Chrono, le Duel et le Millionnaire sans télé donnent à chacun sa propre question)
const tvFlag = (room) => room.phase === "lobby" || room.phase === "end" ? tvs(room).size > 0 : !!room.tvOn || (tvs(room).size > 0 && !["chrono", "duel", "million", "sprint"].includes(room.cfg.kind));
const LAST = ["q", "result", "level", "load", "fail", "end"];
// avec la télé, les téléphones reçoivent les réponses mais jamais l'énoncé (ni l'image, ni l'extrait)
const forPhone = (room, o) => (room.tvOn && o.t === "q" ? { ...o, q: "", img: null, audio: null } : o);
const cast = (room, o) => {
  if (LAST.includes(o.t)) room.last = { ...o, at: Date.now() }; // dernier état, renvoyé à un joueur qui se reconnecte
  const ph = forPhone(room, o);
  players(room).forEach((p) => send(p.ws, ph)); tvs(room).forEach((ws) => send(ws, o));
};
const clean = (s, n = 20) => String(s || "").replace(/[<>]/g, "").trim().slice(0, n);
const clamp = (v, a, b) => Math.min(b, Math.max(a, Number.isFinite(v) ? v : a));
const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);

function lobbyMsg(room, p) {
  return {
    t: "lobby", code: room.code, host: room.hostId, you: p.id, tok: p.tok, phase: room.phase, cfg: room.cfg, tv: tvFlag(room), tvRoom: !!room.tvRoom,
    players: players(room).filter((x) => !x.left).map(({ id, name, photo, ci, uid, cos }) => ({ id, name, photo, ci, uid, cos }))
  };
}
const castLobby = (room) => {
  players(room).forEach((p) => !p.left && send(p.ws, lobbyMsg(room, p)));
  tvs(room).forEach((ws) => send(ws, lobbyMsg(room, { id: null })));
};

function okPhoto(s) {
  s = String(s || "");
  if (s.startsWith("https://lh3.googleusercontent.com/")) return s.slice(0, 300);
  return /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s) && s.length <= 12000 ? s : ""; // photo personnalisée (réduite)
}

const cleanCos = (c) => { // cosmétiques équipés (cadre, bulle, bannière, thème pour la télé) : de simples noms
  const ok = (v, p) => (typeof v === "string" && v.startsWith(p) && /^[a-z-]{3,20}$/.test(v) ? v : undefined);
  return c && typeof c === "object" ? { frame: ok(c.frame, "fr-"), bubble: ok(c.bubble, "sk-"), banner: ok(c.banner, "bn-"), title: ok(c.title, "ti-"), name: ok(c.name, "nc-"), theme: ok(c.theme, "th-") } : {};
};
function join(ws, room, name, photo, hist, uid, cos) {
  const base = clean(name) || "Joueur";
  let n = base, k = 2;
  while (players(room).some((p) => !p.left && p.name.toLowerCase() === n.toLowerCase())) n = `${base} ${k++}`;
  const p = {
    id: Math.random().toString(36).slice(2, 9), ws, name: n,
    tok: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2), // secret pour revenir après une coupure
    photo: okPhoto(photo),
    lives: 0, score: 0, points: 0, dead: false, outAt: 0, left: false, ci: room.nextCi++,
    hist: (Array.isArray(hist) ? hist : []).slice(-300).map((x) => String(x).slice(0, 220)), // questions vues récemment par ce joueur
    uid: cleanUid(uid), // compte Google : permet aux autres de l'ajouter en ami
    cos: cleanCos(cos)
  };
  room.players.set(p.id, p); ws.room = room; ws.pid = p.id;
  if (!room.hostId || !room.players.has(room.hostId)) room.hostId = p.id; // salon télé : le premier qui scanne est l'hôte
  return p;
}

function resetRoom(room) {
  clearTimeout(room.timer);
  Object.assign(room, { qThemes: null, phase: "lobby", diff: 1, buf: [], asked: [], played: new Set(), i: -1, elim: 0, q: null, loads: new Map() });
  room.players.forEach((p, id) => { clearTimeout(p.ctimer); if (p.left) room.players.delete(id); });
}

/* --- questions d'une salle --- */
function fill(room, d = room.diff) {
  if (room.loads.has(d)) return room.loads.get(d);
  const themes = shuffle((room.qThemes || room.cfg.themes).filter((t) => !LOCAL_THEMES.includes(t))).slice(0, 5);
  if (!themes.length) return Promise.resolve();
  const p = generate(themes, d, 6, room.asked.filter((q) => !q.startsWith("~")).slice(-15).map((q) => q.slice(0, 70)), room.cfg.kind === "imposteur")
    .then((qs) => qs.forEach((q) => {
      if (!room.asked.some((a) => norm(a) === norm(q.q)) && !room.buf.some((b) => norm(b.q) === norm(q.q))) room.buf.push({ ...q, d });
    }))
    .finally(() => { if (room.loads.get(d) === p) room.loads.delete(d); });
  room.loads.set(d, p);
  return p;
}
async function takeQuestion(room) {
  // thèmes « sans IA » (drapeaux, capitales, calcul…) : fabriqués ici, toujours justes
  const all = room.qThemes || room.cfg.themes; // L'Imposteur a sa propre liste de thèmes (voir impStart)
  const locals = all.filter((t) => LOCAL_THEMES.includes(t));
  const withAI = all.length > locals.length;
  if (locals.length && (!withAI || Math.random() < locals.length / all.length)) {
    const lq = await pickLocal(locals, room.diff, room.used || (room.used = new Set()), softOf(room));
    if (lq) { room.asked.push(lq.key); return lq; }
  }
  const used = room.used || (room.used = new Set());
  for (let t = 0; t < 3; t++) {
    const all = room.buf.filter((q) => !q.u && q.d === room.diff && isNewIn(used)(q));
    const fresh = all.filter((q) => !softOf(room).has(histSig(q))), pool = fresh.length ? fresh : all; // d'abord les jamais vues
    if (pool.length) {
      const q = pool[Math.floor(Math.random() * pool.length)];
      q.u = true; room.asked.push(q.q); markIn(used, q);
      if (room.buf.filter((x) => !x.u && x.d === room.diff).length < 3) fill(room).catch(() => {});
      return q;
    }
    try { await fill(room); } catch { break; } // IA indisponible : on passe aux questions sans IA
  }
  // l'IA ne répond pas : la partie continue avec des questions sans IA plutôt que de s'arrêter
  const lq = await pickLocal(locals.length ? locals : room.qThemes ? IMP_LOCAL_OK : LOCAL_THEMES.filter((t) => t !== SONG_THEME), room.diff, used, softOf(room));
  if (lq) { room.asked.push(lq.key); return lq; }
  throw new Error("L'IA n'a renvoyé aucune nouvelle question.");
}

/* --- déroulement --- */
function startGame(room) {
  Object.assign(room, { qThemes: null, phase: "load", diff: 1, qn: 0, buf: [], asked: [], used: new Set(), soft: null, played: new Set(), i: -1, elim: 0, loads: new Map() });
  players(room).forEach((p) => Object.assign(p, { lives: room.cfg.lives, score: 0, points: room.cfg.kind === "parieurs" ? BET_START : 0, dead: false, outAt: 0 }));
  if (room.cfg.kind === "equipes") makeTeams(room);
  if (room.cfg.kind === "parieurs") makeBetOrder(room);
  if (room.cfg.kind === "imposteur") return impStart(room);
  if (room.cfg.kind === "royale") { room.rr = { round: 0 }; return royaleRound(room); }
  if (room.cfg.kind === "duel") return duelStart(room);
  if (room.cfg.kind === "sprint") return sprintStart(room);
  nextTurn(room);
}
function nextTurn(room) {
  if (room.cfg.kind === "equipes" || room.cfg.kind === "parieurs") return teamTurn(room);
  if (alive(room).length <= 1) return endGame(room);
  const ps = players(room);
  do { room.i = (room.i + 1) % ps.length; } while (ps[room.i].dead);
  loadQuestion(room);
}
async function loadQuestion(room) {
  room.phase = "load"; cast(room, { t: "load" });
  let q;
  try { q = await takeQuestion(room); }
  catch (e) { console.error(e.message); room.phase = "error"; return cast(room, { t: "fail", msg: e.status === 429 ? e.message : "L'IA n'a pas répondu." }); }
  if (!rooms.has(room.code) || room.phase !== "load") return;
  const ps = players(room), p = ps[room.i];
  if (!p || p.dead) return nextTurn(room);
  room.q = { ...q, options: shuffle(q.o) };
  const bet = room.cfg.kind === "parieurs";
  room.phase = bet ? "bet" : "q"; // Les Parieurs : d'abord les paris, ensuite la réponse
  const ms = bet ? BET_MS : room.cfg.time * 1000;
  clearTimeout(room.timer);
  let rescued = [];
  if (bet) {
    room.bets = new Map(); room.timer = setTimeout(() => betsDone(room), BET_MS);
    // coup de pouce : ceux qui n'ont plus de jetons en reçoivent 10 pour continuer à parier
    rescued = players(room).filter((x) => !x.left && x.id !== p.id && x.points <= 0).map((x) => { x.points = BET_RESCUE; return x.name; });
  }
  else if (ms) room.timer = setTimeout(() => resolveTurn(room, false, -1), ms);
  cast(room, {
    ...(bet ? { bet: true, bets: [], count: 0, tokens: p.points, final: betFinal(room), odds: { yes: 3, no: 3 }, rescued } : {}),
    ...teamInfo(room, p),
    t: "q", who: p.id, name: p.name, lives: p.lives, alive: alive(room).length, total: ps.filter((x) => !x.left).length + ps.filter((x) => x.left && !x.dead).length,
    tag: `${q.t} · ${LEVELS[room.diff]}`, q: q.q, img: q.img || null, audio: q.audio || null, options: room.q.options, ms, diff: room.diff,
    board: boardOf(room), qn: (room.qn = (room.qn || 0) + 1)
  });
}
// le tableau de tous les joueurs (vies, bonnes réponses, équipe) : affiché par la télé
function boardOf(room) {
  return players(room).filter((x) => !x.left || x.dead).map((x) => ({ id: x.id, name: x.name, lives: x.lives, score: x.score, points: x.points, dead: !!x.dead, team: x.team ?? null }));
}
function answer(room, me, i) {
  const p = players(room)[room.i];
  if (room.phase !== "q" || !p || p.id !== me.id || !Number.isInteger(i) || i < 0 || i >= room.q.options.length) return;
  resolveTurn(room, room.q.options[i] === room.q.a, i);
}
function resolveTurn(room, correct, picked) {
  if (room.phase !== "q") return;
  clearTimeout(room.timer);
  room.phase = "result";
  const p = players(room)[room.i];
  const bet = room.cfg.kind === "parieurs";
  if (correct) { p.score++; p.points += (bet ? BET_WIN : 10) * room.diff; }
  else if (room.cfg.kind !== "equipes" && !bet) { p.lives--; if (p.lives <= 0) { p.dead = true; p.outAt = ++room.elim; } } // en Équipes et chez les Parieurs, personne n'est éliminé
  let revenge = 0;
  if (bet && correct) { // la vengeance : +10 par joueur qui a parié contre lui
    revenge = BET_REVENGE * [...(room.bets || new Map()).values()].filter((b) => !b.yes && b.amt).length;
    p.points += revenge;
  }
  const final = bet && betFinal(room);
  const extra = bet ? { bets: settleBets(room, correct), gain: correct ? BET_WIN * room.diff : 0, revenge, final, tokens: p.points } : {};
  cast(room, { ...teamInfo(room, p), ...extra, t: "result", who: p.id, name: p.name, correct, picked, answer: room.q.a, lives: p.lives, dead: p.dead, board: boardOf(room) });
  room.timer = setTimeout(() => afterTurn(room), 25000); // filet de sécurité : normalement le bouton « Continuer » fait avancer
}
function afterTurn(room) {
  if (!rooms.has(room.code)) return;
  clearTimeout(room.timer);
  if (room.cfg.kind === "equipes" || room.cfg.kind === "parieurs") { // un tour complet : on passe au niveau
    if (room.turn >= room.order.length * TEAM_ROUNDS) return room.cfg.kind === "parieurs" ? endBets(room) : endTeams(room);
    if (room.turn % room.order.length) return nextTurn(room);
    return askLevel(room);
  }
  if (alive(room).length <= 1) return endGame(room);
  const p = players(room)[room.i];
  if (p) room.played.add(p.id);
  if (!alive(room).every((x) => room.played.has(x.id))) return nextTurn(room);
  room.played.clear();
  askLevel(room);
}
function askLevel(room) {
  if (room.cfg.auto) return chooseLevel(room, true); // difficulté évolutive : on monte sans demander
  room.phase = "level";
  cast(room, { t: "level", diff: room.diff, host: room.hostId });
  clearTimeout(room.timer); // pas de minuteur : le choix reste affiché tant que l'hôte n'a pas appuyé sur un bouton
}
function chooseLevel(room, up) {
  clearTimeout(room.timer);
  if (up) room.diff = Math.min(room.diff + 1, 5);
  nextTurn(room);
}
function endGame(room) {
  clearTimeout(room.timer);
  room.phase = "end";
  const w = alive(room)[0];
  const order = [...players(room)].sort((a, b) => (b === w) - (a === w) || b.outAt - a.outAt);
  cast(room, {
    t: "end", winner: w ? w.name : null,
    ranking: order.map((p) => ({ id: p.id, name: p.name, score: p.score, points: p.points, lives: Math.max(p.lives, 0), photo: p.photo }))
  });
}

/* ====================== Équipes en ligne ====================== */
// Les joueurs sont répartis au hasard en équipes qui jouent chacune leur tour (Rouge, Bleue, Rouge, Bleue…).
// Chacun répond à 3 questions, personne n'est éliminé, les points s'additionnent par équipe.
const TEAM_NAMES = ["Rouge", "Bleue", "Verte", "Jaune"];
const TEAM_ROUNDS = 3;
function makeTeams(room) {
  const ps = shuffle(players(room).filter((p) => !p.left));
  const n = ps.length >= 12 ? 4 : ps.length >= 9 ? 3 : 2;
  room.nTeams = n;
  ps.forEach((p, k) => (p.team = k % n));
  const groups = Array.from({ length: n }, (_, t) => ps.filter((p) => p.team === t).map((p) => p.id));
  const len = Math.max(...groups.map((g) => g.length));
  room.order = [];
  for (let r = 0; r < len; r++) groups.forEach((g) => room.order.push(g[r % g.length])); // une petite équipe repasse plus souvent
  room.turn = 0;
}
const teamScores = (room) => TEAM_NAMES.slice(0, room.nTeams).map((name, t) => ({
  name, points: players(room).filter((p) => p.team === t).reduce((a, p) => a + p.points, 0)
}));
function teamInfo(room, p) {
  if (room.cfg.kind !== "equipes" || !p) return {};
  return { team: TEAM_NAMES[p.team], teams: teamScores(room), turn: room.turn, turns: room.order.length * TEAM_ROUNDS };
}
function teamTurn(room) { // Équipes et Parieurs : un ordre de passage fixe, 3 questions par joueur
  const ps = players(room), end = () => (room.cfg.kind === "parieurs" ? endBets(room) : endTeams(room));
  for (let k = 0; k < room.order.length; k++) { // on saute les joueurs partis
    if (room.turn >= room.order.length * TEAM_ROUNDS) return end();
    const id = room.order[room.turn % room.order.length];
    room.turn++;
    const i = ps.findIndex((p) => p.id === id && !p.left);
    if (i >= 0) { room.i = i; return loadQuestion(room); }
  }
  end();
}
function endTeams(room) {
  if (room.phase === "end") return;
  clearTimeout(room.timer);
  room.phase = "end";
  const teams = teamScores(room).map((t, k) => ({ ...t, members: players(room).filter((p) => p.team === k) })).sort((a, b) => b.points - a.points);
  const tie = teams.length > 1 && teams[0].points === teams[1].points;
  const mvp = [...players(room)].sort((a, b) => b.points - a.points)[0];
  cast(room, {
    t: "end", kind: "equipes", winner: tie ? null : `Équipe ${teams[0].name}`,
    mvp: mvp && mvp.points > 0 ? { name: mvp.name, points: mvp.points } : null, // pas de « meilleur joueur » à 0 point
    ranking: teams.map((t, k) => ({ id: `t${k}`, name: `${t.name} (${t.members.map((p) => p.name).join(", ")})`, score: t.members.length, points: t.points, lives: 0, photo: "" }))
  });
}

/* ====================== Le Duel (à deux) ====================== */
// Une corde tendue entre les deux joueurs : chaque bonne réponse la tire d'un cran vers soi. Le premier qui l'amène
// de son côté (DUEL_STEPS crans) gagne ; au bout de 2 minutes, celui de quel côté est la corde gagne.
// Chacun a ses propres questions (comme au Chrono) : la vitesse compte autant que la justesse.
const DUEL_STEPS = 5, DUEL_MS = +process.env.DUEL_MS || 120000;
function duelState(room, extra = {}) {
  const [a, b] = room.duel.side;
  return { t: "rope", rope: room.duel.rope, steps: DUEL_STEPS, left: Math.max(0, room.duel.end - Date.now()), a, b, tv: room.duel.tv, ...extra,
    players: [a, b].map((id) => { const p = room.players.get(id) || {}; return { id, name: p.name, photo: p.photo || "", score: p.score || 0 }; }) };
}
// Les questions sont préparées AVANT le départ (les mêmes pour les deux, de plus en plus dures) : pendant les
// 2 minutes, plus aucune attente de chargement, et personne n'avance pendant que l'autre attend sa question.
const DUEL_READY = +process.env.DUEL_READY || 30, DUEL_POOL = 70; // de quoi tenir 2 minutes sans s'arrêter
const duelLevel = (n) => Math.min(5, 1 + Math.floor(n / 8)); // 8 questions par niveau
async function duelFill(room, upTo) { // ajoute des questions à la réserve commune
  const d = room.duel, tmp = { seen: d.seen };
  while (d.pool.length < upTo && room.phase !== "end" && rooms.has(room.code)) {
    tmp.cdiff = duelLevel(d.pool.length);
    let q;
    try { q = await takeFor(room, tmp); } catch (e) { console.error(e.message); if (++d.fails >= 4) break; continue; }
    d.pool.push({ ...q, d: tmp.cdiff, options: shuffle(q.o) });
    if (room.phase === "dload") cast(room, { t: "load", msg: `Préparation du duel… ${Math.min(d.pool.length, DUEL_READY)} / ${DUEL_READY} questions` });
  }
}
async function duelStart(room) {
  const ps = players(room).filter((p) => !p.left);
  Object.assign(room, { phase: "dload", buf: [], asked: [], loads: new Map(), soft: null });
  room.duel = { rope: 0, side: shuffle(ps.map((p) => p.id)), end: 0, pool: [], seen: new Set(), fails: 0, tv: !!room.tvOn, qi: 0, cur: null }; // side[0] tire vers -, side[1] vers +
  ps.forEach((p) => Object.assign(p, { score: 0, points: 0, streak: 0, di: 0, cq: null, dead: false }));
  clearTimeout(room.timer);
  cast(room, { t: "load", msg: "Préparation du duel…" });
  const ai = room.cfg.themes.some((t) => !LOCAL_THEMES.includes(t));
  if (ai) await Promise.allSettled([1, 2, 3, 4].map((d) => fill(room, d))); // l'IA écrit les 4 niveaux en même temps (plus rapide)
  await duelFill(room, DUEL_READY);
  if (room.phase !== "dload" || !rooms.has(room.code)) return;
  if (room.duel.pool.length < 6) { room.phase = "error"; return cast(room, { t: "fail", msg: "Impossible de préparer assez de questions." }); }
  // c'est parti : le chrono ne démarre que maintenant
  room.phase = "duel"; room.duel.end = Date.now() + DUEL_MS;
  room.timer = setTimeout(() => duelEnd(room), DUEL_MS);
  const st = duelState(room, { start: true });
  players(room).forEach((p) => send(p.ws, st)); tvs(room).forEach((ws) => send(ws, st));
  if (room.duel.tv) duelTvNext(room); else ps.forEach((p) => duelNext(room, p));
  duelFill(room, DUEL_POOL); // la réserve continue de grossir pendant la partie
}
function duelNext(room, p) {
  if (room.phase !== "duel" || p.left) return;
  const q = room.duel.pool[p.di];
  if (!q) { p.cq = null; return setTimeout(() => duelNext(room, p), 300); } // (rare) la réserve n'a pas encore cette question
  p.di++; p.cq = q;
  send(p.ws, { t: "dq", tag: `${q.t} · ${LEVELS[q.d]}`, q: q.q, img: q.img || null, audio: q.audio || null, options: q.options, left: Math.max(0, room.duel.end - Date.now()) });
}
function duelAnswer(room, p, i) {
  if (room.phase !== "duel" || !p.cq || !Number.isInteger(i) || i < 0 || i >= p.cq.options.length) return;
  if (room.duel.tv) return duelTvAnswer(room, p, i);
  const q = p.cq, ok = q.options[i] === q.a;
  p.cq = null;
  if (ok) {
    p.score++; p.points++; p.streak++;
    room.duel.rope += room.duel.side[0] === p.id ? -1 : 1; // la corde vient vers lui
  } else p.streak = 0;
  send(p.ws, { t: "dres", correct: ok, picked: i, answer: q.a });
  const st = duelState(room, { by: p.id, ok });
  players(room).forEach((x) => send(x.ws, st)); tvs(room).forEach((ws) => send(ws, st));
  if (Math.abs(room.duel.rope) >= DUEL_STEPS) return duelEnd(room); // la corde est de son côté : gagné
  setTimeout(() => duelNext(room, p), ok ? 600 : 1500); // une erreur coûte un peu de temps
}
// Avec une télé : une seule question à la fois, affichée sur la télé (les téléphones n'ont que les réponses).
// Le premier qui répond juste tire la corde ; une erreur et c'est à l'autre de tenter sa chance.
const DUEL_QMS = 15000;
const duelPad = (room, q) => ({ t: "dq", tv: true, tag: `${q.t} · ${LEVELS[q.d]}`, q: "", img: null, audio: null, options: q.options, left: Math.max(0, room.duel.end - Date.now()) });
function duelTvNext(room) {
  const d = room.duel;
  if (room.phase !== "duel") return;
  const q = d.pool[d.qi];
  if (!q) return setTimeout(() => duelTvNext(room), 300);
  d.qi++; d.cur = q; d.tried = new Map();
  players(room).forEach((p) => { p.cq = q; send(p.ws, duelPad(room, q)); });
  tvs(room).forEach((ws) => send(ws, { ...duelPad(room, q), q: q.q, img: q.img || null, audio: q.audio || null, ms: DUEL_QMS }));
  clearTimeout(d.qt); d.qt = setTimeout(() => duelTvReveal(room, null), DUEL_QMS);
}
function duelTvAnswer(room, p, i) {
  const d = room.duel, q = d.cur;
  if (!q || d.tried.has(p.id)) return;
  d.tried.set(p.id, i);
  if (q.options[i] === q.a) return duelTvReveal(room, p);
  p.streak = 0;
  send(p.ws, { t: "dres", tv: true, wait: true, correct: false, picked: i, answer: null });
  if (d.side.every((id) => d.tried.has(id) || !room.players.get(id) || room.players.get(id).left)) duelTvReveal(room, null); // les deux se sont trompés
}
function duelTvReveal(room, w) {
  const d = room.duel, q = d.cur;
  if (room.phase !== "duel" || !q) return;
  clearTimeout(d.qt); d.cur = null;
  if (w) { w.score++; w.points++; w.streak++; d.rope += d.side[0] === w.id ? -1 : 1; }
  players(room).forEach((p) => { p.cq = null; send(p.ws, { t: "dres", tv: true, correct: p === w, picked: d.tried.has(p.id) ? d.tried.get(p.id) : -1, answer: q.a, by: w ? w.name : null }); });
  tvs(room).forEach((ws) => send(ws, { t: "dreveal", answer: q.a, by: w ? w.name : null }));
  const st = duelState(room, { by: w ? w.id : null, ok: !!w });
  players(room).forEach((x) => send(x.ws, st)); tvs(room).forEach((ws) => send(ws, st));
  if (Math.abs(d.rope) >= DUEL_STEPS) return duelEnd(room);
  setTimeout(() => duelTvNext(room), 1800); // le temps de voir la bonne réponse sur la télé
}
function duelEnd(room, quitter) {
  if (room.phase !== "duel" && room.phase !== "dload") return; // (parti pendant la préparation : l'autre gagne aussi)
  clearTimeout(room.timer); clearTimeout(room.duel.qt);
  room.phase = "end";
  const d = room.duel, [a, b] = d.side.map((id) => room.players.get(id)).filter(Boolean).length === 2 ? d.side.map((id) => room.players.get(id)) : [null, null];
  let w = null;
  if (quitter && a && b) w = quitter === a.id ? b : a; // l'autre est parti : abandon
  else if (a && b) w = d.rope < 0 ? a : d.rope > 0 ? b : a.score !== b.score ? (a.score > b.score ? a : b) : null;
  const order = [a, b].filter(Boolean).sort((x, y) => (y === w) - (x === w) || y.score - x.score);
  cast(room, {
    t: "end", kind: "duel", winner: w ? w.name : null, rope: d.rope, steps: DUEL_STEPS,
    how: quitter ? "abandon" : Math.abs(d.rope) >= DUEL_STEPS ? "corde" : "temps",
    ranking: order.map((p) => ({ id: p.id, name: p.name, score: p.score, points: p.score, lives: 0, photo: p.photo }))
  });
}

/* ====================== Le Sprint (jusqu'à 8 joueurs) ====================== */
// Une course en ligne droite : 15 questions, les mêmes pour tous, chacun à son rythme (pas de minuteur global).
// Une bonne réponse fait avancer d'une foulée d'autant plus grande qu'elle est rapide ; une erreur fait trébucher
// (on recule un peu). Le premier qui franchit la ligne gagne, même si les autres n'ont pas fini leurs questions.
// Tout le monde voit la piste en direct.
const SPRINT_Q = 15, SPRINT_LEN = +process.env.SPRINT_LEN || 100, SPRINT_MAX = 8, SPRINT_QMS = 15000, SPRINT_TRIP = 3;
const sprintStep = (ms) => Math.round(5 + 7 * Math.max(0, 1 - ms / 9000)); // de 5 (lent) à 12 (immédiat)
function sprintBoard(room) {
  return { t: "sboard", len: SPRINT_LEN, total: SPRINT_Q, list: players(room).map((p) => ({ id: p.id, name: p.name, photo: p.photo || "", dist: p.dist || 0, n: p.si || 0, score: p.score || 0, done: !!p.done, left: !!p.left })) };
}
const sprintQ = (q, n) => ({ t: "sq", tag: `${q.t} · ${LEVELS[q.d]}`, q: q.q, img: q.img || null, audio: q.audio || null, options: q.options, n, total: SPRINT_Q, ms: SPRINT_QMS });
async function sprintStart(room) {
  const ps = players(room).filter((p) => !p.left);
  Object.assign(room, { phase: "sload", buf: [], asked: [], loads: new Map(), soft: null });
  const sp = room.sp = { pool: [], seen: new Set(), fails: 0, tv: !!room.tvOn, qi: 0, cur: null };
  ps.forEach((p) => { clearTimeout(p.ctimer); Object.assign(p, { score: 0, points: 0, streak: 0, dist: 0, si: 0, cq: null, done: false, dead: false }); });
  clearTimeout(room.timer);
  cast(room, { t: "load", msg: "Préparation de la course…" });
  const ai = room.cfg.themes.some((t) => !LOCAL_THEMES.includes(t));
  if (ai) await Promise.allSettled([1, 2, 3, 4, 5].map((d) => fill(room, d))); // l'IA écrit tous les niveaux en même temps
  const tmp = { seen: sp.seen };
  while (sp.pool.length < SPRINT_Q && room.phase === "sload" && rooms.has(room.code)) { // les 15 questions, prêtes avant le départ
    tmp.cdiff = Math.min(5, 1 + Math.floor(sp.pool.length / 3)); // de plus en plus dures
    let q;
    try { q = await takeFor(room, tmp); } catch (e) { console.error(e.message); if (++sp.fails >= 4) break; continue; }
    sp.pool.push({ ...q, d: tmp.cdiff, options: shuffle(q.o) });
    cast(room, { t: "load", msg: `Préparation de la course… ${sp.pool.length} / ${SPRINT_Q} questions` });
  }
  if (room.phase !== "sload" || !rooms.has(room.code)) return;
  if (sp.pool.length < SPRINT_Q) { room.phase = "error"; return cast(room, { t: "fail", msg: "Impossible de préparer les questions de la course." }); }
  room.phase = "sprint"; // partez !
  cast(room, { ...sprintBoard(room), start: true, tv: sp.tv });
  if (sp.tv) sprintTvNext(room); else ps.forEach((p) => sprintNext(room, p));
}
function sprintNext(room, p) {
  if (room.phase !== "sprint" || p.left || p.done) return;
  if (p.si >= SPRINT_Q) { // ses 15 questions sont faites : il attend les autres
    p.done = true; p.cq = null;
    send(p.ws, { t: "sdone" });
    cast(room, sprintBoard(room));
    return sprintCheck(room);
  }
  const q = room.sp.pool[p.si++];
  p.cq = q; p.qAt = Date.now();
  clearTimeout(p.ctimer); p.ctimer = setTimeout(() => sprintAnswer(room, p, -1), SPRINT_QMS + 500);
  send(p.ws, sprintQ(q, p.si));
}
function sprintMove(p, ok, ms, picked) { // la foulée : grande si vite et juste, on trébuche sur une erreur
  let step = 0;
  if (ok) { p.score++; p.streak++; step = sprintStep(ms); }
  else { p.streak = 0; if (picked >= 0) step = -Math.min(p.dist, SPRINT_TRIP); } // sans réponse : on n'avance pas
  p.dist = Math.min(SPRINT_LEN, p.dist + step); p.points = p.dist;
  return step;
}
function sprintAnswer(room, p, i) {
  if (room.phase !== "sprint" || !p.cq || p.done) return;
  if (i !== -1 && (!Number.isInteger(i) || i < 0 || i >= p.cq.options.length)) return;
  if (room.sp.tv) return sprintTvAnswer(room, p, i);
  clearTimeout(p.ctimer);
  const q = p.cq, ok = i >= 0 && q.options[i] === q.a;
  p.cq = null;
  const step = sprintMove(p, ok, Date.now() - p.qAt, i);
  send(p.ws, { t: "sres", correct: ok, picked: i, answer: q.a, step, dist: p.dist });
  cast(room, { ...sprintBoard(room), by: p.id, step });
  if (p.dist >= SPRINT_LEN) return sprintEnd(room, p); // la ligne est franchie
  setTimeout(() => sprintNext(room, p), ok ? 650 : 1500); // une erreur coûte aussi un peu de temps
}
function sprintCheck(room) { // personne n'a franchi la ligne et tout le monde a fini : le plus loin gagne
  if (room.phase === "sprint" && players(room).every((p) => p.left || p.done)) sprintEnd(room, null);
}
// Avec une télé : une question à la fois, sur la télé ; la foulée dépend de la vitesse de chacun sur cette question
function sprintTvNext(room) {
  const sp = room.sp;
  if (room.phase !== "sprint") return;
  if (sp.qi >= SPRINT_Q) return sprintEnd(room, null);
  const q = sp.pool[sp.qi++];
  sp.cur = q; sp.qAt = Date.now(); sp.picks = new Map();
  players(room).forEach((p) => { if (p.left) return; p.cq = q; p.si = sp.qi; send(p.ws, { ...sprintQ(q, sp.qi), tv: true, q: "", img: null, audio: null }); });
  tvs(room).forEach((ws) => send(ws, { ...sprintQ(q, sp.qi), tv: true }));
  clearTimeout(sp.qt); sp.qt = setTimeout(() => sprintTvReveal(room), SPRINT_QMS);
}
function sprintTvAnswer(room, p, i) {
  const sp = room.sp;
  if (!sp.cur || sp.picks.has(p.id) || i < 0) return;
  sp.picks.set(p.id, { i, ms: Date.now() - sp.qAt });
  send(p.ws, { t: "sres", tv: true, wait: true, picked: i });
  tvs(room).forEach((ws) => send(ws, { t: "rcount", n: sp.picks.size, total: players(room).filter((x) => !x.left).length }));
  if (players(room).every((x) => x.left || sp.picks.has(x.id))) sprintTvReveal(room); // tout le monde a répondu
}
function sprintTvReveal(room) {
  const sp = room.sp, q = sp && sp.cur;
  if (room.phase !== "sprint" || !q) return;
  clearTimeout(sp.qt); sp.cur = null;
  const results = [];
  players(room).forEach((p) => {
    if (p.left) return;
    const r = sp.picks.get(p.id), ok = !!r && q.options[r.i] === q.a;
    const step = sprintMove(p, ok, r ? r.ms : SPRINT_QMS, r ? r.i : -1);
    p.cq = null;
    results.push({ id: p.id, name: p.name, ok, step });
    send(p.ws, { t: "sres", tv: true, correct: ok, picked: r ? r.i : -1, answer: q.a, step, dist: p.dist });
  });
  tvs(room).forEach((ws) => send(ws, { t: "sreveal", answer: q.a, results }));
  cast(room, sprintBoard(room));
  const fin = players(room).filter((p) => !p.left && p.dist >= SPRINT_LEN) // le plus rapide sur cette question passe la ligne en premier
    .sort((a, b) => b.dist - a.dist || sp.picks.get(a.id).ms - sp.picks.get(b.id).ms);
  if (fin.length) { sp.over = true; return setTimeout(() => sprintEnd(room, fin[0]), 1500); }
  setTimeout(() => sprintTvNext(room), 1800);
}
function sprintEnd(room, w) {
  if (room.phase !== "sprint" && room.phase !== "sload") return;
  room.phase = "end";
  clearTimeout(room.timer); clearTimeout(room.sp.qt);
  players(room).forEach((p) => { clearTimeout(p.ctimer); p.cq = null; });
  const order = [...players(room)].sort((a, b) => (b === w) - (a === w) || b.dist - a.dist || b.score - a.score);
  if (!w && order.length > 1 && order[0].dist > order[1].dist) w = order[0]; // personne n'a fini la course : le plus loin gagne
  if (!w && order.length === 1) w = order[0];
  cast(room, {
    t: "end", kind: "sprint", winner: w ? w.name : null, how: w && w.dist >= SPRINT_LEN ? "ligne" : "fin", len: SPRINT_LEN,
    ranking: order.map((p) => ({ id: p.id, name: p.name, score: p.score, points: Math.round(p.dist), lives: 0, photo: p.photo }))
  });
}

/* ====================== Le Dernier Debout (battle royale) ====================== */
// Tout le monde répond en même temps à la même question ; ceux qui se trompent (ou ne répondent pas) sont éliminés.
// Le temps diminue à chaque manche (15 s, 12 s, 10 s…) et la difficulté monte, jusqu'à ce qu'il n'en reste qu'un.
// Si tous les survivants se trompent, personne n'est éliminé (sinon il n'y aurait pas de gagnant).
const ROYALE_TIMES = (process.env.ROYALE_TIMES || "15,12,10,8,7,6,5").split(",").map(Number);
const ROYALE_PAUSE = +process.env.ROYALE_PAUSE || 4000; // le temps de voir qui est tombé
const ROYALE_MAX = 20;
const standing = (room) => players(room).filter((p) => !p.dead && !p.left);
async function royaleRound(room) {
  clearTimeout(room.timer);
  const rr = room.rr || (room.rr = { round: 0 });
  if (rr.round > 0 && standing(room).length <= 1) return royaleEnd(room);
  rr.round++;
  room.diff = Math.min(5, 1 + Math.floor((rr.round - 1) / 2)); // de plus en plus dur
  room.phase = "load"; cast(room, { t: "load", msg: `Manche ${rr.round}…` });
  let q;
  try { q = await takeQuestion(room); }
  catch (e) { console.error(e.message); rr.round--; room.phase = "error"; return cast(room, { t: "fail", msg: e.status === 429 ? e.message : "L'IA n'a pas répondu." }); }
  if (!rooms.has(room.code) || room.phase !== "load") return;
  room.q = { ...q, options: shuffle(q.o) };
  rr.answers = new Map();
  const sec = ROYALE_TIMES[Math.min(rr.round - 1, ROYALE_TIMES.length - 1)];
  room.phase = "rq";
  room.timer = setTimeout(() => royaleResolve(room), sec * 1000 + 400); // un peu de marge pour le réseau
  cast(room, {
    t: "q", royale: true, who: null, name: `Manche ${rr.round}`, round: rr.round, sec,
    tag: `${q.t} · ${LEVELS[room.diff]}`, q: q.q, img: q.img || null, audio: q.audio || null, options: room.q.options, ms: sec * 1000,
    alive: standing(room).length, total: players(room).filter((p) => !p.left).length, board: boardOf(room), qn: rr.round
  });
}
function royaleAnswer(room, me, i) {
  const rr = room.rr;
  if (room.phase !== "rq" || me.dead || me.left || rr.answers.has(me.id) || !Number.isInteger(i) || i < 0 || i >= room.q.options.length) return;
  rr.answers.set(me.id, i);
  const o = { t: "rcount", n: rr.answers.size, total: standing(room).length };
  players(room).forEach((p) => send(p.ws, o)); tvs(room).forEach((ws) => send(ws, o));
  if (standing(room).filter((p) => !p.away).every((p) => rr.answers.has(p.id))) royaleResolve(room); // tout le monde a répondu
}
function royaleResolve(room) {
  if (room.phase !== "rq") return;
  clearTimeout(room.timer);
  const rr = room.rr, up = standing(room), res = [];
  up.forEach((p) => {
    const i = rr.answers.has(p.id) ? rr.answers.get(p.id) : -1, ok = i >= 0 && room.q.options[i] === room.q.a;
    if (ok) { p.score++; p.points += 10 * room.diff; }
    res.push({ id: p.id, name: p.name, picked: i, ok });
  });
  const wrong = res.filter((r) => !r.ok), saved = wrong.length === up.length; // tous faux : personne ne tombe
  if (!saved) wrong.forEach((r) => { const p = room.players.get(r.id); p.dead = true; p.outAt = ++room.elim; });
  room.phase = "rres";
  cast(room, { t: "result", royale: true, round: rr.round, answer: room.q.a, results: res, out: saved ? [] : wrong.map((r) => r.name), saved, alive: standing(room).length, board: boardOf(room) });
  // 20 manches au plus (si tout le monde se trompe sans arrêt, la partie finirait jamais) : le plus de bonnes réponses gagne
  room.timer = setTimeout(() => (standing(room).length <= 1 || rr.round >= ROYALE_MAX ? royaleEnd(room) : royaleRound(room)), ROYALE_PAUSE);
}
function royaleEnd(room) {
  if (room.phase === "end") return;
  clearTimeout(room.timer);
  room.phase = "end";
  const order = [...players(room)].sort((a, b) => (a.dead - b.dead) || (b.outAt - a.outAt) || (b.score - a.score));
  const up = order.filter((p) => !p.dead);
  // un seul debout : il gagne ; plusieurs (20 manches atteintes) : le plus de bonnes réponses, sinon égalité
  const w = up.length === 1 ? up[0] : up.length > 1 && up[0].score > up[1].score ? up[0] : null;
  cast(room, {
    t: "end", kind: "royale", winner: w ? w.name : null, rounds: room.rr ? room.rr.round : 0,
    ranking: order.map((p) => ({ id: p.id, name: p.name, score: p.score, points: p.points, lives: 0, photo: p.photo }))
  });
}

/* ====================== L'Imposteur en ligne ====================== */
// Tout le monde reçoit la question et la réponse, sauf l'imposteur (la question seule). On discute (chat ou à voix haute),
// puis chacun vote. Démasqué (majorité nette), l'imposteur a une dernière chance : trouver la réponse parmi 4 choix.
const IMP_PTS = { hidden: 3, guessed: 2, crew: 1, voter: 1 }; // les mêmes que dans impostor.js
const IMP_VOTE_MS = +process.env.IMP_VOTE_MS || 40000, IMP_GUESS_MS = +process.env.IMP_GUESS_MS || 20000, IMP_CLUE_MS = +process.env.IMP_CLUE_MS || 45000;
const present = (room) => players(room).filter((p) => !p.left);
const impHead = (room) => ({ t: "imp", round: room.ir.round, rounds: room.ir.rounds, host: room.hostId });
// chaque joueur garde le dernier écran reçu (pour revenir après une coupure) ; la télé n'a jamais la réponse avant la fin
function impSend(p, o) { p.impLast = { ...o, at: Date.now() }; send(p.ws, o); }
function impTv(room, o) { room.impTv = { ...o, at: Date.now() }; tvs(room).forEach((ws) => send(ws, o)); }
function impStart(room) {
  present(room).forEach((p) => { p.points = 0; p.imp = 0; p.impLast = null; });
  // des questions très dures, que l'imposteur ne peut pas trouver seul : pas de calcul, de logique, d'anagramme…
  const ok = room.cfg.themes.filter((t) => !LOCAL_THEMES.includes(t) || IMP_LOCAL_OK.includes(t));
  room.qThemes = ok.length ? ok : ["Histoire", "Géographie", "Science", "Cinéma", "Art", "Littérature", "Sport"];
  room.ir = { round: 0, rounds: Math.min(6, Math.max(3, present(room).length)), last: null };
  impRound(room);
}
async function impRound(room) {
  clearTimeout(room.timer);
  const ir = room.ir;
  if (present(room).length < 3) return impEnd(room);
  if (ir.round >= ir.rounds) return impEnd(room);
  ir.round++;
  room.diff = 5; // toujours le niveau le plus dur : l'imposteur ne doit pas pouvoir deviner
  room.phase = "load"; cast(room, { t: "load", msg: "L'IA prépare la question…" });
  let q;
  try { q = await takeQuestion(room); }
  catch (e) { console.error(e.message); ir.round--; room.phase = "error"; return cast(room, { t: "fail", msg: e.status === 429 ? e.message : "L'IA n'a pas répondu." }); }
  if (!rooms.has(room.code) || room.phase !== "load") return;
  const ps = present(room);
  if (ps.length < 3) return impEnd(room);
  const pool = ps.filter((p) => p.id !== ir.last); // jamais deux fois de suite le même imposteur
  const bad = pick(pool.length ? pool : ps);
  ir.imp = bad.id; ir.last = bad.id; bad.imp++;
  room.q = q; // l'imposteur écrit sa réponse : pas de choix à préparer
  ir.votes = new Map(); ir.clues = new Map(); ir.guessText = null;
  // 1. chacun écrit un indice en secret ; l'imposteur, lui, n'a que la question (aucun indice)
  room.phase = "iclue";
  room.timer = setTimeout(() => impTalk(room), IMP_CLUE_MS);
  ir.base = { tag: `${q.t} · ${LEVELS[room.diff]}`, q: q.q, img: q.img || null };
  ps.forEach((p) => impSend(p, impCard(room, p, { phase: "clue", ms: IMP_CLUE_MS, count: 0, total: ps.length })));
  impTv(room, { ...impHead(room), ...ir.base, phase: "clue", ms: IMP_CLUE_MS, count: 0, total: ps.length, imposter: false, answer: null });
}
// ce que voit un joueur : la réponse (l'équipe) ou les 4 réponses possibles (l'imposteur)
function impCard(room, p, extra) {
  const bad = p.id === room.ir.imp;
  return { ...impHead(room), ...room.ir.base, ...extra, imposter: bad, answer: bad ? null : room.q.a }; // l'imposteur n'a aucun indice
}
const plainOf = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
function impClue(room, me, text) {
  text = clean(text, 30);
  if (room.phase !== "iclue" || !text || room.ir.clues.has(me.id)) return;
  const a = plainOf(room.q.a);
  if (me.id !== room.ir.imp && a.length >= 3 && plainOf(text).includes(a)) return send(me.ws, { t: "iclueerr", msg: "Ton indice contient la réponse : trouve autre chose !" });
  room.ir.clues.set(me.id, text);
  if (me.impLast && me.impLast.phase === "clue") me.impLast.mine = text;
  const o = { t: "iclued", count: room.ir.clues.size, total: present(room).length, id: me.id, text };
  present(room).forEach((p) => send(p.ws, p.id === me.id ? o : { ...o, text: undefined, id: undefined })); tvs(room).forEach((ws) => send(ws, { ...o, text: undefined, id: undefined }));
  if (impVoters(room).every((p) => room.ir.clues.has(p.id))) impTalk(room); // tout le monde a écrit
}
const impClues = (room) => shuffle(present(room).map((p) => ({ name: p.name, clue: room.ir.clues.get(p.id) || "(pas d'indice)" })));
// 2. les indices sont dévoilés tous en même temps : on discute (chat ouvert), puis on vote
function impTalk(room) {
  if (room.phase !== "iclue") return;
  clearTimeout(room.timer);
  const ir = room.ir;
  ir.list = impClues(room);
  room.phase = "italk";
  const ms = room.cfg.time * 1000;
  if (ms) room.timer = setTimeout(() => impVoteStart(room), ms);
  const extra = { phase: "talk", ms, clues: ir.list };
  present(room).forEach((p) => impSend(p, impCard(room, p, extra)));
  impTv(room, { ...impHead(room), ...ir.base, ...extra, imposter: false, answer: null });
}
function impVoteStart(room) {
  if (room.phase !== "italk") return;
  clearTimeout(room.timer);
  room.phase = "ivote";
  room.timer = setTimeout(() => impTally(room), IMP_VOTE_MS);
  const o = { ...impHead(room), phase: "vote", ms: IMP_VOTE_MS, players: present(room).map(({ id, name, photo }) => ({ id, name, photo })), count: 0, total: present(room).length, clues: room.ir.list };
  present(room).forEach((p) => impSend(p, o));
  impTv(room, o);
}
const impVoters = (room) => present(room).filter((p) => !p.away);
function impVote(room, me, id) {
  const t = room.players.get(String(id));
  if (room.phase !== "ivote" || room.ir.votes.has(me.id) || !t || t.left || t.id === me.id) return;
  room.ir.votes.set(me.id, t.id);
  if (me.impLast && me.impLast.phase === "vote") me.impLast.picked = t.id;
  const o = { t: "ivoted", count: room.ir.votes.size, total: present(room).length };
  present(room).forEach((p) => send(p.ws, o)); tvs(room).forEach((ws) => send(ws, o));
  if (impVoters(room).every((p) => room.ir.votes.has(p.id))) impTally(room); // tout le monde a voté
}
function impTally(room) {
  if (room.phase !== "ivote") return;
  clearTimeout(room.timer);
  const ir = room.ir, n = new Map();
  ir.votes.forEach((t) => n.set(t, (n.get(t) || 0) + 1));
  const top = Math.max(0, ...n.values()), best = [...n].filter(([, v]) => v === top);
  ir.accused = top && best.length === 1 ? best[0][0] : null; // égalité ou aucun vote : personne n'est accusé
  if (ir.accused !== ir.imp) return impResult(room, false, false);
  const bad = room.players.get(ir.imp);
  if (!bad || bad.left) return impResult(room, true, false);
  room.phase = "iguess";
  room.timer = setTimeout(() => impResult(room, true, false), IMP_GUESS_MS);
  const o = { ...impHead(room), phase: "guess", name: bad.name, q: room.q.q, ms: IMP_GUESS_MS }; // il doit écrire la réponse, sans choix
  present(room).forEach((p) => impSend(p, { ...o, you: p.id === bad.id }));
  impTv(room, o);
}
function impGuess(room, me, text) { // fautes d'orthographe permises (voir answerMatches)
  text = clean(text, 60);
  if (room.phase !== "iguess" || me.id !== room.ir.imp || !text) return;
  room.ir.guessText = text;
  impResult(room, true, answerMatches(text, room.q.a));
}
function impResult(room, caught, guessed) {
  clearTimeout(room.timer);
  const ir = room.ir, gains = new Map(), add = (id, v) => { const p = room.players.get(id); if (p) { p.points += v; gains.set(id, (gains.get(id) || 0) + v); } };
  if (!caught) add(ir.imp, IMP_PTS.hidden);
  else if (guessed) add(ir.imp, IMP_PTS.guessed);
  else present(room).forEach((p) => { if (p.id !== ir.imp) add(p.id, IMP_PTS.crew + (ir.votes.get(p.id) === ir.imp ? IMP_PTS.voter : 0)); });
  room.phase = "ires";
  const bad = room.players.get(ir.imp) || {}, name = (id) => room.players.get(id)?.name || "?";
  const o = {
    ...impHead(room), phase: "result", caught, guessed, imp: ir.imp, impName: bad.name, impPhoto: bad.photo || "", accusedName: ir.accused ? name(ir.accused) : null,
    answer: room.q.a, last: ir.round >= ir.rounds, guessText: caught ? ir.guessText || "" : null,
    votes: [...ir.votes].map(([from, to]) => ({ name: name(from), target: name(to), right: to === ir.imp })),
    tally: present(room).map((p) => ({ name: p.name, imp: p.id === ir.imp, n: [...ir.votes.values()].filter((t) => t === p.id).length })).sort((x, y) => y.n - x.n),
    clues: ir.list,
    board: present(room).map((p) => ({ id: p.id, name: p.name, photo: p.photo, points: p.points, gain: gains.get(p.id) || 0 }))
  };
  present(room).forEach((p) => impSend(p, o));
  impTv(room, o);
}
function impEnd(room) {
  if (room.phase === "end") return;
  clearTimeout(room.timer);
  room.phase = "end";
  const order = [...players(room)].sort((a, b) => b.points - a.points);
  const tie = order.length > 1 && order[0].points === order[1].points;
  cast(room, {
    t: "end", kind: "imposteur", winner: tie ? null : order[0]?.name || null,
    ranking: order.map((p) => ({ id: p.id, name: p.name, score: p.imp || 0, points: p.points, lives: 0, photo: p.photo }))
  });
}

/* ====================== Les Parieurs en ligne ====================== */
// Chacun répond à son tour (3 questions par joueur). La question s'affiche avec le nom de celui qui répond,
// et avant qu'il réponde, les autres parient leurs jetons : réussira-t-il ou non ?
// Bonne réponse : +20 jetons × niveau, et +10 par joueur qui a parié contre vous (la vengeance).
// Bon pari : on gagne sa mise × la cote (parier contre la majorité rapporte jusqu'à ×3) ; mauvais pari : on la perd.
// Manche finale : gains des paris doublés. Plus de jetons : 10 jetons de coup de pouce. Le plus riche gagne.
const BET_START = 100, BET_WIN = 20, BET_REVENGE = 10, BET_RESCUE = 10, BET_MS = +process.env.BET_MS || 15000;
const betFinal = (room) => room.cfg.kind === "parieurs" && room.order && room.turn > room.order.length * (TEAM_ROUNDS - 1); // la dernière manche
// la cote d'un côté : 1 + (mises de l'autre côté / mises de ce côté), entre ×1 et ×3 ; personne de ce côté : ×3
function betOdds(room) {
  let yes = 0, no = 0;
  (room.bets || new Map()).forEach((b) => { if (b.amt) b.yes ? (yes += b.amt) : (no += b.amt); });
  const cote = (mine, other) => (mine ? Math.min(3, Math.round((1 + other / mine) * 10) / 10) : 3);
  return { yes: cote(yes, no), no: cote(no, yes) };
}
function makeBetOrder(room) {
  room.order = shuffle(players(room).filter((p) => !p.left).map((p) => p.id));
  room.turn = 0;
}
// ceux qui peuvent parier : tout le monde sauf celui qui répond (et ceux qui n'ont plus de jetons)
const bettors = (room) => players(room).filter((x) => !x.left && !x.away && x.id !== players(room)[room.i]?.id && x.points > 0);
const betList = (room) => [...(room.bets || [])].map(([id, b]) => ({ id, name: room.players.get(id)?.name || "?", yes: b.yes, amt: b.amt }));
function placeBet(room, me, yes, amt) {
  if (room.phase !== "bet" || players(room)[room.i]?.id === me.id || room.bets.has(me.id) || me.points <= 0) return;
  amt = Math.floor(Number(amt));
  if (!Number.isFinite(amt) || amt < 0) return;
  room.bets.set(me.id, { yes: !!yes, amt: Math.min(amt, me.points) }); // 0 : il passe son tour
  castBets(room, { t: "bets" });
  if (bettors(room).every((x) => room.bets.has(x.id))) betsDone(room); // tout le monde a parié : on n'attend plus
}
// celui qui répond ne voit pas les paris sur lui (ni la télé, qu'il regarde aussi) : seulement leur nombre, jusqu'au résultat
const betCount = (room) => betList(room).filter((b) => b.amt).length;
const betsFor = (room, id) => (id === players(room)[room.i]?.id ? { bets: [], count: betCount(room), final: betFinal(room) } : { bets: betList(room), count: betCount(room), odds: betOdds(room), final: betFinal(room) }); // les cotes trahiraient les paris : cachées à celui qui répond
function castBets(room, o) {
  players(room).forEach((p) => send(p.ws, { ...o, ...betsFor(room, p.id) }));
  tvs(room).forEach((ws) => send(ws, { ...o, bets: [], count: betCount(room), final: betFinal(room) }));
}
function betsDone(room) { // les paris sont fermés : celui qui répond peut répondre
  if (room.phase !== "bet") return;
  clearTimeout(room.timer);
  room.phase = "q";
  const ms = room.cfg.time * 1000;
  if (ms) room.timer = setTimeout(() => resolveTurn(room, false, -1), ms);
  if (room.last && room.last.t === "q") room.last = { ...room.last, bet: false, bets: [], ms, at: Date.now() }; // pour qui revient après une coupure
  castBets(room, { t: "go", ms });
}
function settleBets(room, correct) {
  const out = [], odds = betOdds(room), mult = betFinal(room) ? 2 : 1;
  (room.bets || new Map()).forEach((b, id) => {
    const x = room.players.get(id); if (!x || !b.amt) return; // ceux qui ont passé ne gagnent ni ne perdent
    const won = b.yes === correct, cote = b.yes ? odds.yes : odds.no;
    const delta = won ? Math.round(b.amt * cote * mult) : -b.amt;
    x.points = Math.max(0, x.points + delta);
    out.push({ id, name: x.name, yes: b.yes, amt: b.amt, won, delta, cote, tokens: x.points });
  });
  room.bets = new Map();
  return out;
}
function endBets(room) {
  if (room.phase === "end") return;
  clearTimeout(room.timer);
  room.phase = "end";
  const order = [...players(room)].sort((a, b) => b.points - a.points || b.score - a.score);
  const tie = order.length > 1 && order[0].points === order[1].points && order[0].score === order[1].score;
  cast(room, {
    t: "end", kind: "parieurs", winner: tie ? null : order[0]?.name || null,
    ranking: order.map((p) => ({ id: p.id, name: p.name, score: p.score, points: p.points, lives: 0, photo: p.photo }))
  });
}

/* ====================== Chrono en ligne ====================== */
// Chaque joueur a ses propres questions et son propre chrono de 60 s.
// Le temps ne s'écoule que pendant qu'une question est affichée (pause au chargement et à la correction).
const CHRONO_MS = +process.env.CHRONO_MS || 60000; // réglable seulement pour les tests
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function startChrono(room) {
  clearTimeout(room.timer);
  Object.assign(room, { phase: "cload", buf: [], asked: [], loads: new Map(), elim: 0, soft: null, ct: null });
  players(room).forEach((p) => {
    clearTimeout(p.ctimer);
    Object.assign(p, { score: 0, points: 0, streak: 0, cdiff: 1, ms: CHRONO_MS, done: false, seen: new Set(), cq: null, qAt: 0, fails: 0, dead: false, outAt: 0, lives: 0 });
  });
  cast(room, { t: "load", msg: "Préparation du chrono…" });
  const ai = room.cfg.themes.some((t) => !LOCAL_THEMES.includes(t));
  const ready = ai ? Promise.allSettled([fill(room, 1), fill(room, 2)]) : Promise.resolve();
  ready.then(() => {
    if (!rooms.has(room.code) || room.phase !== "cload") return;
    room.phase = "chrono";
    cast(room, { t: "cgo", ms: CHRONO_MS, tv: !!room.tvOn });
    castBoard(room);
    if (room.tvOn) return chronoTvStart(room);
    players(room).forEach((p) => { if (!p.left) chronoNext(room, p); });
  });
}
async function takeFor(room, p) {
  const d = p.cdiff;
  const locals = room.cfg.themes.filter((t) => LOCAL_THEMES.includes(t));
  const withAI = room.cfg.themes.length > locals.length;
  const local = () => pickLocal(locals, d, p.seen, softOf(room));
  const fresh = isNewIn(p.seen);
  if (locals.length && (!withAI || Math.random() < locals.length / room.cfg.themes.length)) { const lq = await local(); if (lq) return lq; }
  for (let t = 0; t < 3; t++) {
    const pool0 = room.buf.filter((q) => q.d === d && fresh(q)), pool1 = pool0.filter((q) => !softOf(room).has(histSig(q)));
    const pool = pool1.length ? pool1 : pool0;
    if (pool.length) {
      const q = pick(pool); markIn(p.seen, q);
      if (pool.length < 4) fill(room, d).catch(() => {});
      return q;
    }
    try { await fill(room, d); } catch (e) { if (t === 2 && !locals.length) throw e; }
  }
  const any = room.buf.filter(fresh); // repli : une question d'un autre niveau
  if (any.length) { const q = pick(any); markIn(p.seen, q); return q; }
  { const lq = await pickLocal(locals.length ? locals : LOCAL_THEMES.filter((t) => t !== SONG_THEME), d, p.seen, softOf(room)); if (lq) return lq; } // IA indisponible
  throw new Error("L'IA n'a renvoyé aucune nouvelle question.");
}
async function chronoNext(room, p) {
  if (room.phase !== "chrono" || p.left || p.done) return;
  p.cq = null;
  const slow = setTimeout(() => send(p.ws, { t: "cwait" }), 400); // « chargement » seulement si ça traîne
  let q;
  try { q = await takeFor(room, p); }
  catch (e) {
    clearTimeout(slow); console.error(e.message);
    if (++p.fails >= 3) return chronoDone(room, p);
    send(p.ws, { t: "cwait" });
    return setTimeout(() => chronoNext(room, p), 2500);
  }
  clearTimeout(slow);
  if (room.phase !== "chrono" || p.left || p.done) return;
  p.fails = 0;
  p.cq = { ...q, options: shuffle(q.o) };
  p.qAt = Date.now();
  clearTimeout(p.ctimer);
  p.ctimer = setTimeout(() => chronoOut(room, p), p.ms);
  send(p.ws, {
    t: "cq", tag: `${q.t} · ${LEVELS[p.cdiff]}`, q: q.q, img: q.img || null, audio: q.audio || null, options: p.cq.options,
    ms: p.ms, total: CHRONO_MS, points: p.points, streak: p.streak, diff: p.cdiff
  });
}
function chronoAnswer(room, p, i) {
  if (room.phase !== "chrono" || !p.cq || p.done || !Number.isInteger(i) || i < 0 || i >= p.cq.options.length) return;
  if (room.ct) return chronoTvAnswer(room, p, i);
  clearTimeout(p.ctimer);
  p.ms = Math.max(0, p.ms - (Date.now() - p.qAt));
  const q = p.cq, ok = q.options[i] === q.a;
  p.cq = null;
  let gain = 0;
  if (ok) {
    p.score++; p.streak++;
    gain = 10 * p.cdiff + Math.min(p.streak - 1, 5) * 5; // 10 pts × niveau + bonus de série
    p.points += gain;
    if (p.score % 3 === 0) p.cdiff = Math.min(5, p.cdiff + 1); // un niveau de plus toutes les 3 bonnes réponses
  } else p.streak = 0;
  send(p.ws, { t: "cres", correct: ok, picked: i, answer: q.a, gain, points: p.points, streak: p.streak, ms: p.ms });
  castBoard(room);
  if (p.ms <= 0) return chronoDone(room, p);
  setTimeout(() => chronoNext(room, p), ok ? 700 : 1500); // le temps de voir la correction (chrono en pause)
}
function chronoOut(room, p) {
  if (room.phase !== "chrono" || p.done || !p.cq) return;
  const q = p.cq;
  p.ms = 0; p.cq = null;
  send(p.ws, { t: "cres", correct: false, picked: -1, answer: q.a, gain: 0, points: p.points, streak: p.streak, ms: 0 });
  setTimeout(() => chronoDone(room, p), 1200);
}
function chronoDone(room, p) {
  if (p.done) return;
  clearTimeout(p.ctimer);
  p.done = true; p.cq = null;
  send(p.ws, { t: "cdone", points: p.points, score: p.score });
  castBoard(room);
  checkChronoEnd(room);
}
// Avec une télé : tout le monde a la même question, affichée sur la télé ; les téléphones n'ont que les réponses.
// Un seul chrono de 60 s pour tous ; une bonne réponse rapporte plus si elle arrive vite.
const CHRONO_QMS = 12000;
const chronoPad = (room, c, p) => ({ t: "cq", tv: true, tag: `${c.cur.t} · ${LEVELS[c.cur.d]}`, q: "", img: null, audio: null, options: c.cur.options,
  ms: Math.max(0, c.end - Date.now()), total: CHRONO_MS, points: p.points, streak: p.streak, diff: c.cur.d });
function chronoTvStart(room) {
  room.ct = { end: Date.now() + CHRONO_MS, n: 0, cdiff: 1, seen: new Set(), cur: null, fails: 0 };
  chronoTvNext(room);
}
async function chronoTvNext(room) {
  const c = room.ct;
  if (room.phase !== "chrono" || room.ct !== c) return;
  if (c.end - Date.now() < 1500) return chronoTvOver(room);
  let q;
  try { q = await takeFor(room, c); }
  catch (e) { console.error(e.message); if (++c.fails >= 3) return chronoTvOver(room); return setTimeout(() => chronoTvNext(room), 1500); }
  if (room.phase !== "chrono" || room.ct !== c) return;
  c.fails = 0; c.n++;
  c.cur = { ...q, options: shuffle(q.o), d: c.cdiff }; c.qAt = Date.now(); c.picks = new Map();
  const qms = Math.min(CHRONO_QMS, Math.max(0, c.end - Date.now()));
  players(room).forEach((p) => { if (p.left) return; p.cq = c.cur; send(p.ws, chronoPad(room, c, p)); });
  tvs(room).forEach((ws) => send(ws, { ...chronoPad(room, c, {}), q: q.q, img: q.img || null, audio: q.audio || null, ms: qms, left: Math.max(0, c.end - Date.now()), n: c.n }));
  clearTimeout(c.qt); c.qt = setTimeout(() => chronoTvReveal(room), qms);
}
function chronoTvAnswer(room, p, i) {
  const c = room.ct, q = c.cur;
  if (!q || c.picks.has(p.id)) return;
  const ok = q.options[i] === q.a;
  let gain = 0;
  if (ok) {
    p.score++; p.streak++;
    gain = 10 * q.d + Math.round(10 * Math.max(0, 1 - (Date.now() - c.qAt) / CHRONO_QMS)) + Math.min(p.streak - 1, 5) * 5; // niveau + rapidité + série
    p.points += gain;
  } else p.streak = 0;
  c.picks.set(p.id, { i, ok, gain });
  send(p.ws, { t: "cres", tv: true, wait: true, correct: false, picked: i, answer: null, gain: 0, points: p.points - gain, streak: p.streak, ms: Math.max(0, c.end - Date.now()) });
  tvs(room).forEach((ws) => send(ws, { t: "rcount", n: c.picks.size, total: players(room).filter((x) => !x.left).length }));
  if (players(room).every((x) => x.left || c.picks.has(x.id))) chronoTvReveal(room); // tout le monde a répondu
}
function chronoTvReveal(room) {
  const c = room.ct, q = c && c.cur;
  if (room.phase !== "chrono" || !q) return;
  clearTimeout(c.qt); c.cur = null;
  const results = [];
  players(room).forEach((p) => {
    if (p.left) return;
    const r = c.picks.get(p.id);
    if (!r) p.streak = 0;
    p.cq = null;
    results.push({ id: p.id, name: p.name, ok: !!(r && r.ok), gain: r ? r.gain : 0 });
    send(p.ws, { t: "cres", tv: true, correct: !!(r && r.ok), picked: r ? r.i : -1, answer: q.a, gain: r ? r.gain : 0, points: p.points, streak: p.streak, ms: Math.max(0, c.end - Date.now()) });
  });
  tvs(room).forEach((ws) => send(ws, { t: "creveal", answer: q.a, results }));
  castBoard(room);
  c.cdiff = Math.min(5, 1 + Math.floor(c.n / 3)); // un niveau de plus toutes les 3 questions
  setTimeout(() => chronoTvNext(room), 1800);
}
function chronoTvOver(room) {
  if (room.phase !== "chrono") return;
  clearTimeout(room.ct.qt);
  players(room).forEach((p) => { p.done = true; p.cq = null; });
  checkChronoEnd(room);
}
function castBoard(room) {
  const list = players(room).filter((p) => !p.left).sort((a, b) => b.points - a.points || b.score - a.score)
    .map((p) => ({ id: p.id, name: p.name, points: p.points, done: !!p.done }));
  cast(room, { t: "cboard", list });
}
function checkChronoEnd(room) {
  if (room.phase !== "chrono" && room.phase !== "cload") return;
  if (players(room).some((p) => !p.left && !p.done) && room.phase === "chrono") return;
  if (room.phase === "cload" && players(room).some((p) => !p.left)) return;
  room.phase = "end";
  players(room).forEach((p) => clearTimeout(p.ctimer));
  const order = [...players(room)].sort((a, b) => b.points - a.points || b.score - a.score);
  const tie = order.length > 1 && order[0].points === order[1].points;
  cast(room, {
    t: "end", kind: "chrono", winner: tie ? null : order[0]?.name || null,
    ranking: order.map((p) => ({ id: p.id, name: p.name, score: p.score, points: p.points, lives: 0, photo: p.photo }))
  });
}

/* ====================== Qui veut gagner des millions en ligne ====================== */
// Tout le monde a la même question au même moment. Chacun a ses 3 jokers et peut s'arrêter.
// Une erreur fait repartir avec le dernier palier ; celui qui repart avec le plus gagne.
const inGame = (room) => players(room).filter((p) => !p.left && !p.mout);
const watchers = (room) => players(room).filter((p) => !p.left && p.mout);

function startMillion(room) {
  clearTimeout(room.timer);
  Object.assign(room, { phase: "mload", buf: [], asked: [], loads: new Map(), mn: 0, mseen: new Set(), soft: null });
  players(room).forEach((p) => {
    clearTimeout(p.ctimer);
    Object.assign(p, { mn: 0, mout: false, mwon: 0, mjok: { fifty: 1, public: 1, swap: room.tvOn ? 0 : 1 }, mq: null, mpick: null, mstop: false, mremoved: [], seen: new Set(), cdiff: 1, dead: false, outAt: 0, lives: 0, score: 0 });
  });
  cast(room, { t: "load", msg: "Préparation de l'échelle…" });
  const ai = room.cfg.themes.some((t) => !LOCAL_THEMES.includes(t));
  (ai ? fill(room, 1).catch(() => {}) : Promise.resolve()).then(() => { if (rooms.has(room.code) && room.phase === "mload") mNext(room); });
}
async function mQuestion(room, holder, d) { // il faut 4 choix pour le 50/50 et l'avis du public
  holder.cdiff = d;
  let q;
  for (let i = 0; i < 6; i++) { q = await takeFor(room, holder); if (new Set(q.o).size >= 4) break; }
  return q;
}
function mWatch(room, tv) { // la question commune, vue par les éliminés et la télé (avec une télé, les téléphones ne l'ont pas)
  const q = room.mshared;
  const left = room.cfg.time ? Math.max(1, Math.round((room.mEnd - Date.now()) / 1000)) : 0;
  return { t: "mq", watch: true, n: room.mn, tag: `${q.t} · ${LEVELS[millionLevel(room.mn)]}`, q: room.tvOn && !tv ? "" : q.q, img: room.tvOn && !tv ? null : q.img || null, audio: room.tvOn && !tv ? null : q.audio || null, options: q.options, jok: {}, time: left, total: room.cfg.time };
}
function mSend(room, p, extra = {}) {
  const left = room.cfg.time ? Math.max(1, Math.round((room.mEnd - Date.now()) / 1000)) : 0;
  send(p.ws, {
    t: "mq", n: room.mn, tag: `${p.mq.t} · ${LEVELS[millionLevel(room.mn)]}`, q: room.tvOn ? "" : p.mq.q, img: room.tvOn ? null : p.mq.img || null, // avec la télé : la question est sur la télé
    options: p.mq.options, jok: p.mjok, time: left, total: room.cfg.time, ...extra
  });
}
async function mNext(room, again) {
  if (!rooms.has(room.code)) return;
  clearTimeout(room.timer);
  room.phase = "mload";
  const d = millionLevel(room.mn);
  let q;
  try { q = await mQuestion(room, { seen: room.mseen }, d); }
  catch (e) { console.error(e.message); room.phase = "merror"; return cast(room, { t: "fail", msg: e.status === 429 ? e.message : "L'IA n'a pas répondu." }); }
  if (!rooms.has(room.code) || room.phase !== "mload") return;
  const now = inGame(room);
  if (!now.length) return mEnd(room);
  room.phase = "mq";
  room.mEnd = Date.now() + room.cfg.time * 1000;
  room.mshared = { ...q, options: shuffle(q.o) }; // la question que voient les spectateurs
  now.forEach((p) => {
    markIn(p.seen, q);
    Object.assign(p, { mq: { ...q, options: room.tvOn ? room.mshared.options : shuffle(q.o) }, mpick: null, mstop: false, mremoved: [] }); // avec la télé : le même ordre que sur l'écran
    mSend(room, p);
  });
  watchers(room).forEach((p) => send(p.ws, mWatch(room))); tvs(room).forEach((w) => send(w, mWatch(room, true))); // les éliminés et la télé suivent la partie en direct
  mBoard(room);
  if (room.cfg.time) room.timer = setTimeout(() => mReveal(room), room.cfg.time * 1000 + 1500);
}
function mAnswer(room, p, i) {
  if (room.phase !== "mq" || p.mout || !p.mq || p.mpick !== null || p.mstop) return;
  if (!Number.isInteger(i) || i < 0 || i >= p.mq.options.length || p.mremoved.includes(i)) return;
  p.mpick = i;
  send(p.ws, { t: "mlock", i });
  mBoard(room); // les spectateurs voient qui a répondu
  mCheck(room);
}
function mStop(room, p) {
  if (room.phase !== "mq" || p.mout || p.mpick !== null || room.mn === 0) return;
  p.mstop = true;
  send(p.ws, { t: "mlock", i: -1 });
  mBoard(room);
  mCheck(room);
}
async function mJoker(room, p, k) {
  if (room.phase !== "mq" || p.mout || !p.mq || p.mpick !== null || p.mstop || !p.mjok[k]) return;
  p.mjok[k] = 0;
  const q = p.mq;
  if (k === "fifty") {
    const wrong = shuffle(q.options.map((o, i) => i).filter((i) => q.options[i] !== q.a));
    p.mremoved = wrong.slice(0, 2);
    send(p.ws, { t: "mfifty", keep: q.options.map((o, i) => i).filter((i) => !p.mremoved.includes(i)) });
  } else if (k === "public") {
    send(p.ws, { t: "mpublic", perc: publicVote(q.options, q.a, millionLevel(room.mn), p.mremoved) });
  } else if (k === "swap") {
    const n = room.mn;
    try {
      const nq = await mQuestion(room, p, millionLevel(n));
      if (room.phase !== "mq" || room.mn !== n || p.mout || p.mpick !== null) return;
      p.mq = { ...nq, options: shuffle(nq.o) }; p.mremoved = [];
      markIn(room.mseen, nq); // cette question ne reviendra pas pour les autres non plus
      mSend(room, p);
    } catch { p.mjok.swap = 1; send(p.ws, { t: "error", msg: "Impossible de changer de question." }); }
  }
}
function mCheck(room) {
  if (room.phase === "mq" && inGame(room).every((p) => p.mpick !== null || p.mstop || p.away)) return mReveal(room);
  if (room.phase !== "end" && !players(room).some((p) => !p.left && !p.mout) && room.phase !== "mres") mEnd(room);
}
function mReveal(room) {
  if (room.phase !== "mq") return;
  clearTimeout(room.timer);
  room.phase = "mres";
  const watching = watchers(room), results = [];
  inGame(room).forEach((p) => {
    const q = p.mq;
    if (p.mstop) {
      p.mout = true; p.mwon = wonAt(p.mn);
      send(p.ws, { t: "mres", correct: false, stopped: true, picked: -1, answer: q.a, won: p.mwon, out: true });
      results.push({ name: p.name, stopped: true, won: p.mwon });
      return;
    }
    const ok = p.mpick !== null && q.options[p.mpick] === q.a;
    if (ok) {
      p.mn++; p.score = p.mn; p.mwon = wonAt(p.mn);
      if (p.mn === 15) p.mout = true; // millionnaire !
    } else { p.mout = true; p.mwon = safeAt(p.mn); }
    send(p.ws, { t: "mres", correct: ok, picked: p.mpick ?? -1, answer: q.a, won: p.mwon, out: p.mout, top: p.mn === 15, timeout: p.mpick === null });
    results.push({ name: p.name, correct: ok, out: p.mout, won: p.mwon });
    p.mq = null;
  });
  if (room.mshared) [...watching.map((p) => p.ws), ...tvs(room)].forEach((w) => send(w, { t: "mspec", answer: room.mshared.a, results }));
  const outNow = results.filter((r) => r.out || r.stopped);
  if (outNow.length) cast(room, { t: "mout", list: outNow.map((r) => ({ name: r.name, won: r.won, stopped: !!r.stopped, top: !!(r.correct && r.out) })) });
  mBoard(room);
  room.mn++;
  room.timer = setTimeout(() => (inGame(room).length ? mNext(room) : mEnd(room)), inGame(room).length ? 3500 : 2500);
}
function mBoard(room) {
  const list = players(room).filter((p) => !p.left).sort((a, b) => b.mwon - a.mwon || b.mn - a.mn)
    .map((p) => ({ id: p.id, name: p.name, won: p.mwon, n: p.mn, out: !!p.mout, answered: room.phase === "mq" && !p.mout && (p.mpick !== null || p.mstop) }));
  cast(room, { t: "mboard", list });
}
function mEnd(room) {
  if (room.phase === "end") return;
  clearTimeout(room.timer);
  room.phase = "end";
  const order = [...players(room)].sort((a, b) => b.mwon - a.mwon || b.mn - a.mn);
  const tie = order.length > 1 && order[0].mwon === order[1].mwon;
  cast(room, {
    t: "end", kind: "million", winner: tie ? null : order[0]?.name || null,
    ranking: order.map((p) => ({ id: p.id, name: p.name, score: p.mn, points: p.mwon, lives: 0, photo: p.photo }))
  });
}

function dropTv(ws) {
  const room = ws.tvRoom; ws.tvRoom = null;
  if (!room) return;
  tvs(room).delete(ws);
  if (room.tvRoom && !tvs(room).size && !players(room).some((p) => !p.left)) { clearTimeout(room.timer); rooms.delete(room.code); return; } // télé partie, salon vide
  if (rooms.has(room.code)) tvNotify(room);
}
// prévient les téléphones qu'une télé est (ou n'est plus) branchée, sans les renvoyer au salon en pleine partie
function tvNotify(room) {
  if (room.phase === "lobby" || room.phase === "end") return castLobby(room);
  players(room).forEach((p) => !p.left && send(p.ws, { t: "tvflag", tv: tvFlag(room), kind: room.cfg.kind }));
  tvs(room).forEach((w) => send(w, lobbyMsg(room, { id: null }))); // la télé apprend les noms et photos
}

/* ---------- coupure de connexion : le joueur a 60 s pour revenir sans perdre sa place ---------- */
const AWAY_MS = 60000;
function drop(ws) {
  const room = ws.room; if (!room) return;
  const me = room.players.get(ws.pid);
  if (!me || room.phase === "lobby" || room.phase === "end") return leave(ws); // pas de partie en cours : on sort
  ws.room = null;
  me.away = true;
  clearTimeout(me.awayTimer);
  me.awayTimer = setTimeout(() => { if (me.away && !me.left) leave({ room, pid: me.id }); }, AWAY_MS);
  if (room.hostId === me.id) { // l'hôte passe à un joueur encore là
    const other = players(room).find((p) => !p.left && !p.away);
    if (other) { room.hostId = other.id; cast(room, { t: "host", host: other.id }); if (room.phase === "level") askLevel(room); }
  }
  const k = room.cfg.kind;
  if (k === "parieurs" && room.phase === "bet" && bettors(room).every((x) => room.bets.has(x.id))) betsDone(room); // on n'attend pas son pari
  if (k === "imposteur" && room.phase === "ivote" && impVoters(room).every((p) => room.ir.votes.has(p.id))) impTally(room); // ni son vote
  if (k === "imposteur" && room.phase === "iclue" && impVoters(room).every((p) => room.ir.clues.has(p.id))) impTalk(room); // ni son indice
  if (k === "royale" && room.phase === "rq" && standing(room).filter((p) => !p.away).every((p) => room.rr.answers.has(p.id))) royaleResolve(room); // ni sa réponse
  if ((k === "survie" || k === "equipes" || k === "parieurs") && room.phase === "q" && players(room)[room.i]?.id === me.id && !room.cfg.time) {
    clearTimeout(room.timer); room.timer = setTimeout(() => resolveTurn(room, false, -1), 30000); // son tour, sans minuteur : on n'attend pas indéfiniment
  }
  if (k === "million") mCheck(room); // on n'attend pas sa réponse pour continuer
}
function rejoin(ws, m) {
  const room = rooms.get(String(m.code || "").toUpperCase().trim());
  const p = room && room.players.get(String(m.pid || ""));
  if (!room || !p || p.left || !p.tok || p.tok !== m.tok) return send(ws, { t: "rejoinfail" });
  if (ws.room && !(ws.room === room && ws.pid === p.id)) leave(ws);
  clearTimeout(p.awayTimer); p.away = false;
  if (p.ws && p.ws !== ws) { p.ws.room = null; try { p.ws.close(); } catch {} } // ancienne connexion encore ouverte
  p.ws = ws; ws.room = room; ws.pid = p.id;
  if (!room.players.get(room.hostId) || room.players.get(room.hostId).left) room.hostId = p.id;
  send(ws, { ...lobbyMsg(room, p), t: "resume" });
  if (room.chat && room.chat.length) send(ws, { t: "chatlog", list: room.chat }); // l'historique du chat
  if (room.phase === "lobby") return castLobby(room);
  const k = room.cfg.kind, L = room.last;
  if (k === "duel" && room.phase === "duel") {
    send(ws, duelState(room));
    if (p.cq && room.duel.tv) send(ws, duelPad(room, p.cq));
    else if (p.cq) send(ws, { t: "dq", tag: `${p.cq.t} · ${LEVELS[p.cq.d]}`, q: p.cq.q, img: p.cq.img || null, audio: p.cq.audio || null, options: p.cq.options, left: Math.max(0, room.duel.end - Date.now()) });
    return;
  }
  if (k === "sprint" && room.phase === "sprint") {
    send(ws, sprintBoard(room));
    if (p.done) return send(ws, { t: "sdone" });
    if (p.cq && room.sp.tv) { if (!room.sp.picks.has(p.id)) send(ws, { ...sprintQ(p.cq, p.si), tv: true, q: "", img: null, audio: null, ms: Math.max(1000, SPRINT_QMS - (Date.now() - room.sp.qAt)) }); }
    else if (p.cq) send(ws, { ...sprintQ(p.cq, p.si), ms: Math.max(1000, SPRINT_QMS - (Date.now() - p.qAt)) });
    return;
  }
  if (k === "chrono") {
    send(ws, { t: "cgo", ms: CHRONO_MS }); castBoard(room);
    if (p.done) return send(ws, { t: "cdone", points: p.points, score: p.score });
    if (room.ct) { if (room.ct.cur && !room.ct.picks.has(p.id)) send(ws, chronoPad(room, room.ct, p)); return; }
    if (p.cq) {
      const left = Math.max(0, p.ms - (Date.now() - p.qAt));
      send(ws, { t: "cq", tag: `${p.cq.t} · ${LEVELS[p.cdiff]}`, q: p.cq.q, img: p.cq.img || null, audio: p.cq.audio || null, options: p.cq.options, ms: left, total: CHRONO_MS, points: p.points, streak: p.streak, diff: p.cdiff });
    }
    return;
  }
  if (k === "million" && room.phase !== "end") {
    mBoard(room);
    if (room.phase === "mq" && !p.mout && p.mq && p.mpick === null && !p.mstop) return mSend(room, p);
    if (room.phase === "mq" && room.mshared) return send(ws, mWatch(room));
    if (L && L.t === "load") send(ws, L);
    return;
  }
  if (k === "imposteur" && ["iclue", "italk", "ivote", "iguess", "ires"].includes(room.phase) && p.impLast) { // son propre écran (sa carte)
    const o = { ...p.impLast };
    if (o.ms) o.ms = Math.max(1000, o.ms - (Date.now() - p.impLast.at));
    return send(ws, o);
  }
  if (L) { // Survie, Équipes, Parieurs, fin de partie : on renvoie le dernier écran
    const o = { ...L };
    if (o.t === "q" && o.ms) o.ms = Math.max(1000, o.ms - (Date.now() - L.at));
    if (o.t === "q" && (room.phase === "bet" || room.phase === "q") && room.cfg.kind === "parieurs") Object.assign(o, betsFor(room, p.id)); // les paris déjà placés (cachés à celui qui répond)
    send(ws, forPhone(room, o));
  }
}

function leave(ws) {
  const room = ws.room; if (!room) return;
  ws.room = null;
  const me = room.players.get(ws.pid); if (!me) return;
  clearTimeout(me.awayTimer); me.away = false;
  const lobbyLike = room.phase === "lobby" || room.phase === "end";
  if (lobbyLike) room.players.delete(me.id);
  else { me.left = true; if (!me.dead) { me.dead = true; me.outAt = ++room.elim; } }
  const present = players(room).filter((p) => !p.left);
  if (!present.length && room.tvRoom && tvs(room).size) { // salon télé : on revient à l'attente, le QR code reste affiché
    clearTimeout(room.timer); players(room).forEach((p) => clearTimeout(p.ctimer));
    room.players.clear(); room.hostId = null;
    resetRoom(room);
    return castLobby(room);
  }
  if (!present.length) { // plus personne : la salle ferme (les écrans TV sont prévenus)
    clearTimeout(room.timer); rooms.delete(room.code);
    tvs(room).forEach((t) => { send(t, { t: "closed" }); t.tvRoom = null; });
    return;
  }
  if (room.hostId === me.id) { room.hostId = present[0].id; cast(room, { t: "host", host: room.hostId }); }
  if (lobbyLike) return castLobby(room);
  if (room.cfg.kind === "chrono") { clearTimeout(me.ctimer); me.done = true; me.cq = null; castBoard(room); return checkChronoEnd(room); }
  if (room.cfg.kind === "million") { if (!me.mout) { me.mout = true; me.mq = null; } return mCheck(room); }
  if (room.cfg.kind === "duel") return duelEnd(room, me.id); // l'autre gagne par abandon
  if (room.cfg.kind === "sprint" && room.phase === "sprint") { // le coureur parti quitte la piste, la course continue
    clearTimeout(me.ctimer); me.cq = null; me.done = true;
    cast(room, sprintBoard(room));
    if (room.sp.tv && room.sp.cur && players(room).every((x) => x.left || room.sp.picks.has(x.id))) return sprintTvReveal(room);
    return sprintCheck(room);
  }
  if (room.cfg.kind === "royale") { // le joueur parti est éliminé (fait plus haut) : la manche continue sans lui
    if (standing(room).length <= 1) return royaleEnd(room);
    if (room.phase === "rq" && standing(room).filter((p) => !p.away).every((p) => room.rr.answers.has(p.id))) royaleResolve(room);
    return;
  }
  if (room.cfg.kind === "imposteur") {
    if (present.length < 3) return impEnd(room); // il faut au moins trois joueurs
    if (me.id === room.ir?.imp && ["iclue", "italk", "ivote", "iguess"].includes(room.phase)) { room.ir.round--; return impRound(room); } // l'imposteur est parti : on rejoue la manche
    if (room.phase === "ivote") { room.ir.votes.delete(me.id); if (impVoters(room).every((p) => room.ir.votes.has(p.id))) impTally(room); }
    if (room.phase === "iclue" && impVoters(room).every((p) => room.ir.clues.has(p.id))) impTalk(room);
    return;
  }
  if (room.cfg.kind === "equipes" || room.cfg.kind === "parieurs") {
    const bet = room.cfg.kind === "parieurs";
    if (present.length < 2) return bet ? endBets(room) : endTeams(room); // il faut au moins deux joueurs
    const cur = players(room)[room.i];
    if (cur && cur.id === me.id && (room.phase === "q" || room.phase === "bet")) { clearTimeout(room.timer); room.bets = new Map(); return afterTurn(room); } // paris annulés : personne ne perd
    if (bet && room.phase === "bet") { room.bets.delete(me.id); if (bettors(room).every((x) => room.bets.has(x.id))) betsDone(room); }
    if (room.phase === "level") askLevel(room);
    return;
  }
  if (alive(room).length <= 1) return endGame(room);
  const turn = players(room)[room.i];
  if (turn && turn.id === me.id && room.phase === "q") { clearTimeout(room.timer); afterTurn(room); }
  else if (room.phase === "level" && room.hostId !== me.id) askLevel(room);
  else if (room.phase === "level") askLevel(room);
}

function readCfg(m) {
  const themes = (Array.isArray(m.themes) ? m.themes : []).map((t) => clean(t, 50)).filter(Boolean).slice(0, 60);
  if (!themes.length) return "Choisissez au moins un thème.";
  return { auto: !!m.auto, kind: ["chrono", "million", "equipes", "parieurs", "imposteur", "royale", "duel", "sprint"].includes(m.kind) ? m.kind : "survie", themes, time: clamp(+m.time, 0, 120), lives: clamp(+m.lives || 2, 1, 5) };
}

function handle(ws, m) {
  if (m.t === "tvcreate") {
    const now = Date.now(), recent = (hits.get("c" + ws.ip) || []).filter((t) => now - t < 60000);
    if (recent.length >= 6) return send(ws, { t: "error", msg: "Trop de salles créées, patientez." });
    hits.set("c" + ws.ip, [...recent, now]);
    const cfg = readCfg({ themes: m.themes, time: 30, lives: 2, kind: "survie" });
    if (typeof cfg === "string") return send(ws, { t: "error", msg: cfg });
    if (ws.tvRoom) dropTv(ws);
    const room = {
      code: newCode(8), tvRoom: true, hostId: null, players: new Map(), phase: "lobby", cfg,
      diff: 1, buf: [], asked: [], played: new Set(), i: -1, elim: 0, q: null, timer: null, loads: new Map(), nextCi: 0
    };
    rooms.set(room.code, room);
    ws.tvRoom = room; tvs(room).add(ws);
    send(ws, { t: "tvok", code: room.code });
    return castLobby(room);
  }
  if (m.t === "tv") { // un écran TV s'abonne à une salle (il ne joue pas)
    const room = rooms.get(String(m.code || "").toUpperCase().trim());
    if (!room) return send(ws, { t: "error", msg: "Salle introuvable. Vérifiez le code affiché sur le téléphone." });
    if (ws.room) leave(ws);
    if (ws.tvRoom) dropTv(ws);
    ws.tvRoom = room;
    tvs(room).add(ws);
    send(ws, { t: "tvok", code: room.code });
    tvNotify(room); // les téléphones savent qu'une télé est branchée
    if (room.phase === "chrono") castBoard(room);
    if (room.phase === "chrono" && room.ct && room.ct.cur) { const q = room.ct.cur; send(ws, { ...chronoPad(room, room.ct, {}), q: q.q, img: q.img || null, ms: Math.max(0, CHRONO_QMS - (Date.now() - room.ct.qAt)), n: room.ct.n }); }
    if (room.phase === "sprint") { send(ws, { ...sprintBoard(room), tv: room.sp.tv }); const q = room.sp.cur; if (room.sp.tv && q) send(ws, { ...sprintQ(q, room.sp.qi), tv: true, ms: Math.max(1000, SPRINT_QMS - (Date.now() - room.sp.qAt)) }); }
    if (room.phase === "duel") { send(ws, duelState(room)); const q = room.duel.cur; if (room.duel.tv && q) send(ws, { ...duelPad(room, q), q: q.q, img: q.img || null, ms: DUEL_QMS }); }
    if (room.phase === "mq" && room.mshared) send(ws, mWatch(room, true));
    if (room.phase === "mq" || room.phase === "mres") mBoard(room);
    if (["iclue", "italk", "ivote", "iguess", "ires"].includes(room.phase) && room.impTv) send(ws, room.impTv); // L'Imposteur (jamais la réponse avant la fin)
    return;
  }
  if (m.t === "create") {
    if (ws.room) leave(ws);
    const cfg = readCfg(m);
    if (typeof cfg === "string") return send(ws, { t: "error", msg: cfg });
    const now = Date.now(), recent = (hits.get("c" + ws.ip) || []).filter((t) => now - t < 60000);
    if (recent.length >= 6) return send(ws, { t: "error", msg: "Trop de salles créées, patientez." });
    hits.set("c" + ws.ip, [...recent, now]);
    const room = {
      code: newCode(), hostId: null, players: new Map(), phase: "lobby",
      cfg,
      diff: 1, buf: [], asked: [], played: new Set(), i: -1, elim: 0, q: null, timer: null, loads: new Map(), nextCi: 0
    };
    rooms.set(room.code, room);
    room.hostId = join(ws, room, m.name, m.photo, m.hist, m.uid, m.cos).id;
    return castLobby(room);
  }
  if (m.t === "join") {
    const room = rooms.get(String(m.code || "").toUpperCase().trim());
    if (!room) return send(ws, { t: "error", msg: "Salle introuvable." });
    if (room.phase !== "lobby") return send(ws, { t: "error", msg: "La partie a déjà commencé." });
    if (players(room).length >= 20) return send(ws, { t: "error", msg: "Salle pleine (20 joueurs)." });
    if (room.cfg.kind === "duel" && players(room).filter((p) => !p.left).length >= 2) return send(ws, { t: "error", msg: "Ce Duel est déjà complet (deux joueurs)." });
    if (room.cfg.kind === "sprint" && players(room).filter((p) => !p.left).length >= SPRINT_MAX) return send(ws, { t: "error", msg: `Ce Sprint est complet (${SPRINT_MAX} coureurs).` });
    if (ws.room) leave(ws);
    join(ws, room, m.name, m.photo, m.hist, m.uid, m.cos);
    if (room.chat && room.chat.length) send(ws, { t: "chatlog", list: room.chat });
    return castLobby(room);
  }
  if (m.t === "rejoin") return rejoin(ws, m);
  const room = ws.room, me = room && room.players.get(ws.pid);
  if (!me) return;
  const host = me.id === room.hostId;
  if (m.t === "start" && host && room.phase === "lobby") {
    room.tvOn = tvs(room).size > 0; // une télé est branchée : les questions passent sur la télé, jamais sur les téléphones
    if (room.cfg.kind === "chrono") return startChrono(room); // le Chrono se joue aussi seul
    if (room.cfg.kind === "million") return startMillion(room); // le Millionnaire aussi
    if (room.cfg.kind === "sprint" && players(room).length > SPRINT_MAX) return send(ws, { t: "error", msg: `Le Sprint se court à ${SPRINT_MAX} au plus.` });
    if (room.cfg.kind === "sprint") return startGame(room); // seul aussi : contre la montre
    if (players(room).length < 2) return send(ws, { t: "error", msg: "Il faut au moins 2 joueurs." });
    if (room.cfg.kind === "duel" && players(room).length !== 2) return send(ws, { t: "error", msg: "Le Duel se joue à deux, exactement." });
    if (room.cfg.kind === "imposteur" && players(room).length < 3) return send(ws, { t: "error", msg: "L'Imposteur se joue à 3 joueurs ou plus." });
    startGame(room);
  } else if (m.t === "answer" && room.cfg.kind === "royale") { royaleAnswer(room, me, Number(m.i));
  } else if (m.t === "answer" && room.cfg.kind === "duel") { duelAnswer(room, me, Number(m.i));
  } else if (m.t === "answer" && room.cfg.kind === "sprint") { sprintAnswer(room, me, Number(m.i));
  } else if (m.t === "answer") {
    if (room.cfg.kind === "chrono") chronoAnswer(room, me, Number(m.i));
    else if (room.cfg.kind === "million") mAnswer(room, me, Number(m.i));
    else answer(room, me, Number(m.i));
  }
  else if (m.t === "mjoker" && room.cfg.kind === "million") mJoker(room, me, String(m.k));
  else if (m.t === "bet" && room.cfg.kind === "parieurs") placeBet(room, me, m.yes, m.amt);
  else if (m.t === "mstop" && room.cfg.kind === "million") mStop(room, me);
  else if (m.t === "retry" && host && room.phase === "merror") mNext(room, true);
  else if (m.t === "level" && host && room.phase === "level") chooseLevel(room, !!m.up);
  else if (m.t === "retry" && host && room.phase === "error") room.cfg.kind === "imposteur" ? impRound(room) : room.cfg.kind === "royale" ? royaleRound(room) : room.cfg.kind === "duel" ? duelStart(room) : room.cfg.kind === "sprint" ? sprintStart(room) : loadQuestion(room);
  else if (m.t === "impvote" && host && room.phase === "italk") impVoteStart(room); // l'hôte lance le vote
  else if (m.t === "vote" && room.cfg.kind === "imposteur") impVote(room, me, m.id);
  else if (m.t === "iclue" && room.cfg.kind === "imposteur") impClue(room, me, m.text);
  else if (m.t === "iguess" && room.cfg.kind === "imposteur") impGuess(room, me, m.text);
  else if (m.t === "next" && host && room.phase === "ires") impRound(room);
  else if (m.t === "again") { if (host && room.phase === "end") { resetRoom(room); castLobby(room); } else send(ws, lobbyMsg(room, me)); }
  else if (m.t === "config" && host && room.phase === "lobby") {
    const c = readCfg(m);
    if (typeof c === "string") return send(ws, { t: "error", msg: c });
    room.cfg = c; castLobby(room);
  }
  else if (m.t === "next" && room.phase === "result" && (host || players(room)[room.i]?.id === me.id)) afterTurn(room);
  else if (m.t === "leave") leave(ws);
  else if (m.t === "kick" && host && room.phase === "lobby") { // l'hôte retire un joueur du salon
    const t = room.players.get(String(m.id));
    if (t && t.id !== me.id) { send(t.ws, { t: "kicked" }); t.ws.room = null; room.players.delete(t.id); castLobby(room); }
  }
  else if (m.t === "sethost" && host) { // l'hôte donne son rôle
    const t = room.players.get(String(m.id));
    if (t && !t.left && !t.away && t.id !== me.id) { room.hostId = t.id; cast(room, { t: "host", host: t.id }); if (room.phase === "lobby") castLobby(room); }
  }
  else if (m.t === "chat") { // message écrit, envoyé à tout le salon (et à la télé)
    const now = Date.now(), text = clean(m.text, 80);
    if (!text || now - (me.lastReact || 0) < 1500) return;
    me.lastReact = now;
    const msg = { t: "chat", text, id: me.id, name: me.name, at: now, sk: (me.cos || {}).bubble };
    room.chat = [...(room.chat || []), msg].slice(-40); // les 40 derniers messages du salon
    cast(room, msg);
  }
  else if (m.t === "react") { // réaction envoyée à tout le salon (et à la télé)
    const now = Date.now(), r = Number(m.r);
    if (now - (me.lastReact || 0) < 800 || !Number.isInteger(r) || r < 0 || r > 6) return; // 7 réactions rapides (dont « Bruh »)
    me.lastReact = now;
    cast(room, { t: "react", r, id: me.id, name: me.name, sk: (me.cos || {}).bubble });
  }
}

// filet de sécurité : une erreur imprévue est notée dans les journaux mais n'arrête plus le serveur (toutes les parties en cours tombaient)
process.on("uncaughtException", (e) => console.error("Erreur imprévue :", e));
process.on("unhandledRejection", (e) => console.error("Promesse rejetée :", e));
const port = process.env.PORT || 3000;
const server = app.listen(port, () => console.log(`Quizly sur http://localhost:${port}`));
// 256 Ko : la photo (12 Ko) et l'historique des questions vues tiennent largement (avant : 20 Ko, un message trop gros arrêtait le serveur)
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 262144 });
wss.on("error", (e) => console.error("WebSocket :", e.message));
wss.on("connection", (ws, req) => {
  ws.ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));
  ws.on("error", (e) => console.warn("Connexion :", e.message)); // message invalide ou trop gros : on ferme ce joueur, jamais le serveur
  ws.on("message", (buf) => { let m; try { m = JSON.parse(buf); } catch { return; } try { handle(ws, m); } catch (e) { console.error(e); } });
  ws.on("close", () => { if (ws.tvRoom) dropTv(ws); drop(ws); });
});
setInterval(() => wss.clients.forEach((ws) => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); }), 30000);
