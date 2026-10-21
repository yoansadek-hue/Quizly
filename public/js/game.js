import { THEMES, fetchAI } from "./questions.js";
import { watch, signIn, logout } from "./auth.js";
import { initOnline } from "./online.js";
import { makeLocal, LOCAL_THEMES, IMP_LOCAL_OK, SONG_THEME, euros } from "./local.js";
import { millionUI, millionLocal, avatarEl, setAudio, stopAudio } from "./million.js";
import { startScan, stopScan, tvCodeFrom } from "./scan.js";
import { startCloud, cloudState } from "./cloud.js";
import { initFriends, friendCodeFrom } from "./friends.js";
import { enablePush, disablePush, pushMuted, pushState, currentSub } from "./push.js";
import { initCosmetics, styleName, titleOf } from "./cosmetics.js";
import { initQuests } from "./quests.js";
import { impUI, IMP_PTS, answerMatches } from "./impostor.js";

const VERSION = "2.36.0"; // à mettre à jour à chaque version (voir CHANGELOG.md)

const $ = (id) => document.getElementById(id);
const LEVELS = ["", "Facile", "Moyen", "Difficile", "Expert", "Légende"];
const imp = impUI($, avatarEl); // l'écran de L'Imposteur (un téléphone et en ligne)
const MODES = {
  online: { name: "En ligne", desc: "Une salle et un code : chacun joue sur son téléphone. Survie, Chrono 60 s ou Qui veut gagner des millions.", qcm: true, time: 30, joker: false, lives: true, online: true },
  classic: { name: "Classique", desc: "Réponse à l'oral, le groupe valide. Carte retournable à volonté, jokers 4 choix.", qcm: false, time: 30, joker: true, lives: true },
  qcm: { name: "QCM", desc: "Toutes les questions en 4 choix, correction automatique.", qcm: true, time: 30, joker: false, lives: true },
  teams: { name: "Équipes", desc: "Sur un téléphone, en équipes qui jouent chacune leur tour. 3 questions par joueur, les points s'additionnent.", qcm: true, time: 30, joker: false, lives: false, teams: true },
  solo: { name: "Solo", desc: "Seul face aux questions : QCM, 3 vies, battez votre record.", qcm: true, time: 30, joker: false, lives: true, solo: true },
  million: { name: "Qui veut gagner des millions", desc: "Seul ou à plusieurs sur un téléphone : 15 questions, 3 jokers, des paliers sûrs. Visez le million !", qcm: true, time: 0, joker: false, lives: false, million: true },
  impostor: { name: "L'Imposteur", desc: "Tout le monde voit la bonne réponse sauf l'imposteur, qui doit faire semblant de la connaître. Discutez, puis votez pour le démasquer.", qcm: true, time: 60, joker: false, lives: false, impostor: true },
  // types de salon, choisis depuis « En ligne »
  chrono: { name: "Chrono en ligne", qcm: true, time: 60, joker: false, lives: false, online: true, chrono: true, hidden: true },
  oteams: { name: "Équipes en ligne", qcm: true, time: 30, joker: false, lives: false, online: true, teams: true, hidden: true },
  obets: { name: "Les Parieurs", qcm: true, time: 30, joker: false, lives: false, online: true, bets: true, hidden: true },
  oduel: { name: "Le Duel", qcm: true, time: 120, joker: false, lives: false, online: true, duel: true, hidden: true },
  oroyale: { name: "Le Dernier Debout", qcm: true, time: 15, joker: false, lives: false, online: true, royale: true, hidden: true },
  oimp: { name: "L'Imposteur en ligne", qcm: true, time: 60, joker: false, lives: false, online: true, impostor: true, hidden: true },
  omillion: { name: "Millionnaire en ligne", qcm: true, time: 30, joker: false, lives: false, online: true, million: true, hidden: true }
};
const TIMES = [10, 15, 20, 30, 45, 60, 0];
const JOKERS = [0, 1, 2, 3, 5];
const S = {
  used: new Set(), // questions déjà posées dans la partie en cours
  uid: null, firstName: "", count: 4, slots: [], players: [], themes: new Set(), active: new Set(), rand: false, photo: "",
  i: -1, diff: 1, q: null, buf: [], loading: null, joker: false, locked: false, tid: null, left: 30,
  rest: [], qn: 0, editRoom: false, elim: 0, mode: "classic", played: new Set(), asked: [], inGame: false, pending: false, resume: false,
  cfg: { time: 30, jokers: 1, lives: 2, auto: true } // auto : difficulté évolutive (par défaut)
};
const M = () => MODES[S.mode];
document.querySelectorAll(".ver").forEach((e) => (e.textContent = `Quizly v${VERSION} · par YoskanGame`));
const online = initOnline({ $, show, flash, confetti, imp, isChamp: (uid) => friends.isChamp(uid), me: () => ({ name: S.firstName || "Joueur", photo: S.photo || "", uid: S.uid || "", cos: cosm.get() }),
  addFriend: (uid, name) => friends.addByUid(uid, name), isFriend: (uid) => friends.isFriend(uid), record: saveRecord, millionUI, avatarEl, setAudio, noteQ: noteRecent, recent: () => getRecent().arr.slice(-300).map((x) => String(x).slice(0, 220)), setMode: (kind) => (S.mode = KIND_MODE[kind] || "online"), stat: { answer: (t, ok) => statAnswer(t, ok), game: (k) => statGame(k), win: () => quests.tick("win") } });
// record personnel (gardé sur l'appareil, par compte, puis synchronisé) : en ligne il compte autant que seul
// k : « bestChrono » (Chrono) ou « bestMillion » (Qui veut gagner des millions)
function saveRecord(points, k = "bestChrono") {
  const key = `quizly:${S.uid}:${k}`;
  let best = 0; try { best = +localStorage.getItem(key) || 0; } catch {}
  const rec = points > best;
  if (rec) try { localStorage.setItem(key, points); } catch {}
  return { rec, best: Math.max(best, points) };
}

// pas de zoom (pincement iOS)
["gesturestart", "gesturechange", "gestureend"].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault()));

/* ---------- Écrans & effets ---------- */
// pendant une partie, le bouton du haut affiche « Quitter » au lieu de « Menu »
const PLAYING = ["s-game", "s-million", "s-level", "s-revive", "s-load", "s-bet", "s-daily", "s-imp"];
let curScreen = "";
function userLabel() {
  let on = false; try { on = online.active(); } catch {}
  const quit = (PLAYING.includes(curScreen) && (S.inGame || on)) || (on && curScreen === "s-lobby");
  $("userName").textContent = `${S.firstName || "Compte"} · Quitter`;
  // hors partie : vos Q-Bucks à la place du bouton Profil (le Profil est dans la barre du bas) ; un appui ouvre la Boutique
  $("btnUser").hidden = !quit; $("btnCoins").hidden = quit;
  try { $("coinCount").textContent = cosm.coins(); } catch {}
}
function show(id) {
  if (curScreen === "s-scan" && id !== "s-scan") stopScan(); // on coupe la caméra en quittant le scanner
  curScreen = id;
  if (id === "s-lobby") { $("btnInvite").hidden = !friends.ready(); friends.hideInvitePanel(); } // inviter ses amis dans le salon
  if (id === "s-mode") { try { dailyCard(); } catch {} try { menuPushUI(); } catch {} }
  $("btnNotifs").hidden = $("btnProfile").hidden = id === "s-login" || PLAYING.includes(id) || id === "s-lobby"; // la cloche et le Profil, hors partie
  tabbar(id); // la barre d'onglets du bas
  if (id === "s-end") setTimeout(() => friends.syncRecords(), 800); // nouveaux records visibles par les amis
  // rond des réactions : seulement pendant une partie en ligne
  // le chat reste ouvert d'une question à l'autre (on peut finir sa phrase) ; il se ferme seulement hors du jeu
  let onl = false; try { onl = online.active(); } catch {}
  const chat = onl && !S.soloChrono && ["s-lobby", "s-game", "s-million", "s-load", "s-imp"].includes(id); // le chat : dès la salle d'attente, puis pendant toute la partie
  if (id !== "s-imp") imp.stop(); // le compte à rebours de l'Imposteur s'arrête en quittant son écran
  if (!chat) try { online.closeReacts(); } catch {}
  $("reactFab").hidden = !chat;
  if (id !== "s-game") stopAudio(); // l'extrait s'arrête quand on quitte la question
  document.querySelectorAll(".screen").forEach((s) => { s.hidden = s.id !== id; if (s.id !== id) s.classList.remove("noanim"); swipeClean(s); }); // jamais d'écran resté décalé
  userLabel();
  try { friends.setPlaying(playingName(id)); } catch {} // vos amis voient à quoi vous jouez
  $("bar").hidden = id === "s-login" || id === "s-local";
  window.scrollTo(0, 0);
  const sp = document.getElementById("splash"); // le jeu est prêt : on retire l'écran de démarrage
  if (sp) { sp.classList.add("off"); setTimeout(() => sp.remove(), 450); }
}
// le jeu en cours, montré à vos amis (« joue à Survie en ligne »), ou null hors partie
const ONLINE_NAMES = { survie: "Survie en ligne", chrono: "Chrono en ligne", million: "Qui veut gagner des millions en ligne", equipes: "Équipes en ligne", parieurs: "Les Parieurs", imposteur: "L'Imposteur en ligne", royale: "Le Dernier Debout", duel: "Le Duel" };
function playingName(id) {
  let on = false; try { on = online.active(); } catch {}
  if (on && S.soloChrono) return ["s-game", "s-load", "s-end"].includes(id) ? "Chrono" : null;
  if (on) { const k = (online.cfg() || {}).kind; return ["s-lobby", "s-game", "s-million", "s-load", "s-imp", "s-level", "s-end"].includes(id) ? ONLINE_NAMES[k] || "En ligne" : null; }
  if (id === "s-daily") return "Défi du jour";
  if ((PLAYING.includes(id) || id === "s-imp") && S.inGame !== false) return M() ? M().name : null;
  return null;
}
function flash(kind) {
  if (setting("vibrate")) { if (navigator.vibrate) navigator.vibrate(kind === "ok" ? 30 : [40, 60, 40]); else if (hapSw) hapSw.click(); } // réglage « vibrations » (iPhone : un tic)
  const fx = $("fx");
  fx.className = ""; void fx.offsetWidth; fx.className = kind;
  if (kind === "ko") { // secousse sans toucher aux ancêtres des boutons fixes
    const keys = [0, -10, 10, -8, 8, 0].map((x) => ({ transform: `translateX(${x}px)` }));
    ["scene", "mcq"].forEach((id) => { const el = $(id); if (el && el.offsetParent) el.animate(keys, { duration: 450 }); });
  }
}
function confetti() {
  const cols = ["#ffe14d", "#34e3b0", "#ff3b5c", "#62c7ff", "#f6f3ff"];
  for (let n = 0; n < 60; n++) {
    const c = document.createElement("i");
    c.className = "conf";
    c.style.cssText = `left:${Math.random() * 100}vw;background:${cols[n % 5]};--t:${2 + Math.random() * 2.5}s;animation-delay:${Math.random() * .8}s`;
    document.body.append(c);
    setTimeout(() => c.remove(), 5500);
  }
}

/* ---------- Profils (par compte) ---------- */
const dbKey = () => `quizly:${S.uid}:profiles`;
function getDB() { try { return JSON.parse(localStorage.getItem(dbKey()) || "{}"); } catch { return {}; } }
function saveDB() {
  const db = getDB();
  S.players.forEach((p) => (db[p.name.toLowerCase()] = { name: p.name, lives: p.lives }));
  try { localStorage.setItem(dbKey(), JSON.stringify(db)); } catch {}
}

/* ---------- Nombre de joueurs ---------- */
function setCount(d) {
  const n = Math.min(20, Math.max(2, S.count + d)); // le Millionnaire seul a sa propre carte (partie Solo)
  if (n === S.count) return; // aux bornes : aucune animation
  S.count = n;
  const el = $("cNum");
  el.textContent = n;
  el.classList.remove("tick"); void el.offsetWidth; el.classList.add("tick");
}

/* ---------- Noms + import de profil ---------- */
const rosterKey = () => `quizly:${S.uid}:roster`;
function loadRoster() {
  try { S.slots = JSON.parse(localStorage.getItem(rosterKey()) || "[]").map((x) => ({ name: x.name || "", lives: x.lives || 0, imported: !!x.imported })); }
  catch { S.slots = []; }
  S.count = Math.min(20, Math.max(2, S.slots.length || 4));
  $("cNum").textContent = S.count;
}
function saveRoster() { if (M().solo) return; try { localStorage.setItem(rosterKey(), JSON.stringify(S.slots)); } catch {} }

function refresh(slot, input, found) {
  const p = slot.name && getDB()[slot.name.toLowerCase()];
  found.className = "found"; found.replaceChildren();
  if (!p) { found.hidden = true; return; }
  found.hidden = false;
  const t = document.createElement("span");
  const plural = (n) => `${n} vie${n > 1 ? "s" : ""}`;
  if (slot.imported) { found.className = "found done"; t.textContent = `Importé · ${plural(slot.lives)}`; found.append(t); return; }
  t.textContent = `Profil trouvé · ${plural(p.lives)}`;
  const b = document.createElement("button");
  b.textContent = "Importer";
  b.onclick = () => { slot.lives = p.lives; slot.imported = true; slot.name = p.name; input.value = p.name; refresh(slot, input, found); saveRoster(); };
  found.append(t, b);
}

function renderSlots() {
  const box = $("slots");
  box.replaceChildren();
  S.slots = Array.from({ length: S.count }, (_, i) => S.slots[i] || { name: "", lives: 0, imported: false });
  S.slots.forEach((slot, i) => {
    const wrap = document.createElement("div");
    wrap.className = "slot";
    const input = document.createElement("input");
    input.type = "text"; input.maxLength = 20; input.placeholder = `Joueur ${i + 1}`; input.autocomplete = "off";
    input.value = slot.name;
    const found = document.createElement("div");
    found.className = "found"; found.hidden = true;
    input.addEventListener("input", () => {
      slot.name = input.value.trim(); slot.lives = 0; slot.imported = false;
      refresh(slot, input, found); saveRoster();
    });
    refresh(slot, input, found);
    wrap.append(input, found);
    wrap.style.animation = `in .4s ${i * 50}ms backwards`;
    box.append(wrap);
  });
  // clavier : « Suivant » passe au joueur suivant, « Entrée » sur le dernier ouvre la page suivante
  const inputs = [...box.querySelectorAll("input")];
  inputs.forEach((inp, i) => {
    const last = i === inputs.length - 1;
    inp.setAttribute("enterkeyhint", last ? "go" : "next");
    inp.setAttribute("autocapitalize", "words");
    inp.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (!last) inputs[i + 1].focus();
      else { inp.blur(); $("btnNames").click(); }
    });
  });
  saveRoster();
}
function validateNames() {
  const names = S.slots.map((s) => s.name.toLowerCase());
  if (names.some((n) => !n)) return "Tous les joueurs doivent avoir un nom.";
  if (new Set(names).size !== names.length) return "Deux joueurs ont le même nom.";
  return "";
}

/* ---------- Thèmes & réglages ---------- */
function renderThemes() {
  try { renderCustom(); $("customMsg").textContent = ""; } catch {} // thèmes personnalisés au-dessus
  const box = $("themes");
  box.replaceChildren();
  box.classList.remove("dim");
  const r = document.createElement("button");
  r.className = "chip rand"; r.textContent = "Aléatoire";
  // Aléatoire : un appui décoche tous les autres thèmes ; un second appui l'enlève (plus rien n'est coché)
  r.onclick = () => { S.rand = !S.rand; S.themes.clear(); syncThemes(); };
  box.append(r);
  THEMES.forEach((t, i) => {
    const b = document.createElement("button");
    b.className = "chip"; b.style.setProperty("--i", i + 1); b.textContent = t; b.dataset.t = t;
    b.onclick = () => pickTheme(t);
    box.append(b);
  });
  syncThemes();
}
// un thème touché : Aléatoire se décoche, et ce thème se coche ou se décoche
function pickTheme(t) { S.rand = false; S.themes.has(t) ? S.themes.delete(t) : S.themes.add(t); syncThemes(); }
function syncThemes() { // l'état coché de chaque pastille ; Aléatoire actif : les autres thèmes sont grisés et verrouillés
  $("themes").classList.toggle("dim", !!S.rand);
  document.querySelectorAll("#themes .chip").forEach((c) => {
    const rand = c.classList.contains("rand");
    c.setAttribute("aria-pressed", String(rand ? !!S.rand : S.themes.has(c.dataset.t)));
    if (!rand) c.disabled = !!S.rand;
  });
  if ($("customList")) $("customList").classList.toggle("dim", !!S.rand);
  document.querySelectorAll("#customList .ctog").forEach((c) => { c.setAttribute("aria-pressed", String(S.themes.has(c.textContent))); c.disabled = !!S.rand; });
}

function opts(box, values, current, label, onPick) {
  box.replaceChildren();
  values.forEach((v, i) => {
    const b = document.createElement("button");
    b.className = "chip"; b.style.setProperty("--i", i); b.textContent = label(v);
    b.setAttribute("aria-pressed", v === current);
    b.onclick = () => { onPick(v); [...box.children].forEach((c) => c.setAttribute("aria-pressed", c === b)); };
    box.append(b);
  });
}
function renderTime() {
  const imp = !!M().impostor; // L'Imposteur : c'est le temps de discussion
  $("timeTitle").textContent = imp ? "Temps de discussion" : "Temps par question";
  $("timeLead").textContent = imp ? "Le temps pour donner vos indices avant de voter." : "Choisissez la durée dont chaque joueur dispose.";
  opts($("optTime"), imp ? [30, 60, 90, 120, 180, 0] : TIMES, S.cfg.time, (v) => (v ? (v >= 60 && !(v % 60) ? `${v / 60} min` : `${v} s`) : "Sans limite"), (v) => (S.cfg.time = v));
  $("autoRow").hidden = !!M().million || imp; // le Millionnaire a déjà son échelle
  opts($("optAuto"), [true, false], S.cfg.auto, (v) => (v ? "Évolutive" : "Au choix"), (v) => (S.cfg.auto = v));
}
function renderJokers() {
  $("jkTitle").textContent = "Jokers par joueur"; $("jkText").textContent = "Un joker propose 4 choix de réponse.";
  $("btnStart").textContent = "Lancer la partie";
  opts($("optJokers"), JOKERS, S.cfg.jokers, String, (v) => (S.cfg.jokers = v));
}
function renderLivesOpt() {
  $("jkTitle").textContent = "Vies par joueur"; $("jkText").textContent = "Nombre d'erreurs avant l'élimination.";
  $("btnStart").textContent = S.editRoom ? "Enregistrer" : "Créer la salle";
  opts($("optJokers"), [1, 2, 3, 5], S.cfg.lives, String, (v) => (S.cfg.lives = v));
}

/* ---------- Questions : 100 % IA, sans répétition ---------- */
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const toks = (s) => new Set(norm(s).split(" ").filter((w) => w.length > 2));
function similar(a, b) {
  if (norm(a) === norm(b)) return true;
  const A = toks(a), B = toks(b), m = Math.min(A.size, B.size);
  if (m < 3) return false;
  let n = 0; A.forEach((w) => B.has(w) && n++);
  return n / m >= 0.8;
}
const histKey = () => `quizly:${S.uid}:history`;
function getHist() { try { return JSON.parse(localStorage.getItem(histKey()) || "[]"); } catch { return []; } }
function remember(q) {
  S.asked.push(q);
  try { localStorage.setItem(histKey(), JSON.stringify([...getHist(), q].slice(-600))); } catch {}
}
const seen = (q) => S.asked.some((x) => similar(x, q)) || getHist().some((x) => similar(x, q));
const usable = (d) => S.buf.filter((q) => !q.u && q.d === d && !seen(q.q));
const bankKey = () => `quizly:${S.uid}:bank`;
function loadBank() { try { return JSON.parse(localStorage.getItem(bankKey()) || "[]"); } catch { return []; } }
// les questions générées mais pas encore posées sont gardées pour les prochaines parties (moins d'appels à l'IA)
function saveBank() {
  try { localStorage.setItem(bankKey(), JSON.stringify([...S.rest, ...S.buf.filter((q) => !q.u)].slice(-120).map(({ u, ...q }) => q))); } catch {}
}
function ask(title, text, yes, onYes, onNo) {
  $("cfTitle").textContent = title; $("cfText").textContent = text; $("cfYes").textContent = yes;
  S.onYes = onYes; S.onNo = onNo || null;
  $("cfNo").hidden = onNo === false; // false : un seul bouton (simple message)
  $("confirm").hidden = false;
}
function resetLives() {
  const db = getDB();
  Object.values(db).forEach((p) => (p.lives = 0));
  try { localStorage.setItem(dbKey(), JSON.stringify(db)); } catch {}
  S.slots.forEach((s) => (s.lives = 0));
  saveRoster(); renderSlots();
}
function replay(el) { el.style.animation = "none"; void el.offsetWidth; el.style.animation = ""; }
const getAvoid = () => [...new Set([...getHist().slice(-8), ...S.asked])].filter((q) => !q.startsWith("~")).slice(-15).map((q) => q.slice(0, 70));

function fill() {
  const d = S.diff;
  if (S.loading && S.loading.d === d) return S.loading.p;
  const aiThemes = [...S.active].filter((t) => !LOCAL_THEMES.includes(t));
  const p = fetchAI(aiThemes.sort(() => Math.random() - 0.5).slice(0, 5), d, 6, getAvoid(), !!M().impostor)
    .then((qs) => {
      qs.forEach((q) => { if (!seen(q.q) && !S.buf.some((b) => similar(b.q, q.q))) S.buf.push({ ...q, d }); });
      saveBank();
    })
    .finally(() => { if (S.loading && S.loading.p === p) S.loading = null; });
  S.loading = { d, p };
  return p;
}
/* ---------- jamais deux fois la même question dans une partie ---------- */
const plainTxt = (x) => String(x).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const sigs = (q) => [q.key, `${plainTxt(q.q)}|${plainTxt(q.a)}`].filter(Boolean);
const isNewQ = (q) => q && !sigs(q).some((k) => S.used.has(k));
const markQ = (q) => { sigs(q).forEach((k) => S.used.add(k)); noteRecent(q); };
// questions vues lors des parties précédentes (sur tous vos appareils, via le cloud) : on évite de les reposer
const recentKey = () => `quizly:${S.uid}:recent`;
const histSig = (q) => `${plainTxt(q.q)}|${q.img || q.audio || ""}`;
let recentCache = null;
function getRecent() {
  if (!recentCache || recentCache.uid !== S.uid) {
    let arr = []; try { arr = JSON.parse(localStorage.getItem(recentKey()) || "[]"); } catch {}
    recentCache = { uid: S.uid, arr, set: new Set(arr) };
  }
  return recentCache;
}
function noteRecent(q) {
  if (!q || !q.q || !S.uid) return;
  const r = getRecent(), k = histSig(q);
  if (r.set.has(k)) return;
  r.arr.push(k); r.set.add(k);
  if (r.arr.length > 900) { r.set.delete(r.arr.shift()); }
  try { localStorage.setItem(recentKey(), JSON.stringify(r.arr)); } catch {}
}
const isFresh = (q) => !getRecent().set.has(histSig(q)); // pas vue récemment
// « Devine la chanson » et « Logos » viennent du serveur (iTunes, Wikidata) ; le reste est fabriqué sur place
async function makeAnyLocal(theme, d) {
  const api = theme === SONG_THEME ? "song" : theme === "Logos" ? "logo" : null;
  if (api) {
    const avoid = [...S.used].filter((k) => k.startsWith(`~${api}:`)).slice(-250).join(",");
    try { const r = await fetch(`/api/${api}?d=${d}&avoid=${encodeURIComponent(avoid)}`); if (r.ok) return await r.json(); } catch {}
  }
  return makeLocal(theme, d);
}
// une question sans IA jamais posée : thèmes choisis, puis niveaux voisins, puis les autres thèmes
async function pickLocalQ(themes, d) {
  const others = LOCAL_THEMES.filter((t) => !themes.includes(t));
  const plan = [[themes, d], [themes, Math.max(1, d - 1)], [themes, Math.min(5, d + 1)], [others.length ? others : themes, d]];
  for (const [ts, dd] of plan) {
    for (let i = 0; i < 40; i++) {
      const q = await makeAnyLocal(ts[Math.floor(Math.random() * ts.length)], dd);
      // les 25 premiers essais : seulement des questions jamais vues récemment ; ensuite, jamais vues dans cette partie
      if (isNewQ(q) && (i >= 25 || isFresh(q))) { markQ(q); return q; }
    }
  }
  return null;
}
// photo d'un joueur : la vôtre, ou celle d'un compte local du même nom
function photoOf(name) {
  if (!name) return "";
  if (S.firstName && name.toLowerCase() === S.firstName.toLowerCase()) return S.photo || "";
  const p = getProfiles()[name.toLowerCase()];
  return (p && p.photo) || "";
}
async function getQuestion() {
  // thèmes « sans IA » (drapeaux, capitales, calcul…) : question fabriquée sur place, toujours juste
  const locals = [...S.active].filter((t) => LOCAL_THEMES.includes(t));
  const withAI = S.active.size > locals.length;
  if (locals.length && (!withAI || Math.random() < locals.length / S.active.size)) {
    const lq = await pickLocalQ(locals, S.diff);
    if (lq) { S.asked.push(lq.key); return lq; }
  }
  for (let t = 0; t < 3; t++) {
    const all = usable(S.diff).filter(isNewQ), fresh = all.filter(isFresh);
    const pool = fresh.length ? fresh : all; // d'abord les questions jamais vues
    if (pool.length) {
      const q = pool[Math.floor(Math.random() * pool.length)];
      q.u = true; remember(q.q); markQ(q); saveBank();
      if (usable(S.diff).length < 3) fill().catch(() => {});
      return q;
    }
    try { await fill(); } catch { break; } // IA indisponible : on passe aux questions sans IA
  }
  // l'IA ne répond pas : la partie continue avec des questions sans IA plutôt que de s'arrêter
  const lq = await pickLocalQ(locals.length ? locals : M().impostor ? IMP_LOCAL_OK : LOCAL_THEMES.filter((t) => t !== SONG_THEME), S.diff);
  if (lq) { S.asked.push(lq.key); return lq; }
  throw new Error("L'IA n'a renvoyé aucune nouvelle question.");
}

/* ---------- Partie ---------- */
const alive = () => S.players.filter((p) => !p.dead);
const over = () => (M().teams ? false : M().solo ? alive().length === 0 : alive().length <= 1);
const kill = (p) => { p.dead = true; p.outAt = ++S.elim; };

function startGame() {
  if (!S.active.size) return;
  const m = M();
  S.players = S.slots.map((s) => ({ name: s.name, lives: m.solo ? 3 : s.lives, jokers: m.joker ? S.cfg.jokers : 0, dead: false, score: 0, points: 0, streak: 0, outAt: 0 }));
  if (!m.solo) saveDB();
  saveRoster();
  S.retry = false; S.qn = 0; S.elim = 0; S.played = new Set(); S.asked = []; S.used = new Set(); S.inGame = true;
  S.bet = 0; S.lastBet = undefined; S.betMsg = ""; // question à mise (Solo)
  if (m.teams) { // ordre de passage : A1, B1, A2, B2… (une petite équipe repasse plus souvent)
    S.players.forEach((p, i) => (p.team = S.teamOf[i]));
    const groups = Array.from({ length: S.nTeams }, (_, t) => S.players.map((p, i) => i).filter((i) => S.players[i].team === t));
    const len = Math.max(...groups.map((g) => g.length));
    S.order = [];
    for (let r = 0; r < len; r++) groups.forEach((g) => S.order.push(g[r % g.length]));
    S.turn = 0;
  }
  statGame(S.mode);
  S.i = -1; S.diff = 1; S.loading = null;
  const bank = loadBank();
  S.buf = bank.filter((q) => S.active.has(q.t) && !seen(q.q));
  S.rest = bank.filter((q) => !S.active.has(q.t));
  if (m.impostor) return impStart();
  nextTurn();
}

function nextTurn() {
  if (!S.inGame) return;
  S.retry = false;
  if (M().teams) { // Équipes : ordre de passage fixe, une équipe après l'autre
    if (S.turn >= S.order.length * TEAM_ROUNDS) return endTeams();
    S.i = S.order[S.turn % S.order.length]; S.turn++;
    return loadAndPlay();
  }
  if (over()) return endGame(alive()[0]);
  do { S.i = (S.i + 1) % S.players.length; } while (S.players[S.i].dead);
  loadAndPlay();
}

async function loadAndPlay() {
  const slow = setTimeout(() => S.inGame && show("s-load"), 250); // le chargement ne s'affiche que si l'attente se prolonge
  $("loadText").textContent = "L'IA prépare vos questions…";
  $("loadErr").hidden = true;
  try {
    const q = await getQuestion();
    clearTimeout(slow);
    if (!S.inGame) return;
    S.q = q;
    if (offerBet()) return; // Solo : parfois une question à mise, avant d'afficher la question
  } catch (e) {
    clearTimeout(slow);
    if (!S.inGame) return;
    show("s-load");
    $("loadText").textContent = `Génération impossible : ${e.message}`; $("loadErr").hidden = false; return;
  }
  prepareCard();
}

function prepareCard() {
  const p = S.players[S.i], m = M();
  const betMsg = S.betMsg; S.betMsg = ""; // résultat de la mise précédente (Solo)
  S.joker = false; S.locked = false;
  const card = $("card");
  card.style.transition = "none"; card.classList.remove("flipped"); delete card.dataset.seen;
  replay(card); void card.offsetWidth; card.style.transition = "";
  const n = alive().length;
  $("alive").hidden = false;
  $("alive").textContent = m.teams ? teamLine(p)
    : m.solo
    ? `${betMsg ? `${betMsg} · ` : ""}Points : ${p.points} · Série : ${p.streak || 0}${S.bet ? ` · Mise : ${S.bet} pts` : ""}`
    : `${n} joueur${n > 1 ? "s" : ""} en vie sur ${S.players.length}`;
  $("scene").classList.toggle("compact", m.qcm);
  $("liveBoard").hidden = true; // réservé au Chrono en ligne
  $("whoName").textContent = p.name;
  $("whoAv").replaceChildren(avatarEl(p.name, photoOf(p.name), true));
  $("whoName").classList.toggle("retry", !!S.retry); // nom en rouge quand la question est reposée après une vie utilisée
  $("whoLives").textContent = `♥︎ ${p.lives}`;
  $("whoLives").hidden = !m.lives;
  $("tag").textContent = `${S.q.t} · ${LEVELS[S.diff]}`;
  $("backTag").textContent = "Réponse";
  $("qText").textContent = S.q.q;
  const qi = $("qImg"); // image de la question (drapeaux)
  const badImg = () => { // image introuvable : un logo illisible est remplacé par une autre question
    qi.hidden = true;
    if (S.q && S.q.logo && S.inGame && !S.locked) { stopTimer(); loadAndPlay(); }
  };
  if (S.q.img) { qi.hidden = false; qi.onerror = badImg; qi.onload = () => { if (S.q.logo && qi.naturalWidth < 32) badImg(); }; qi.src = S.q.img; }
  else { qi.hidden = true; qi.onload = null; qi.removeAttribute("src"); }
  setAudio($, S.q.audio); // Devine la chanson
  $("aText").textContent = S.q.a;
  // police adaptée à la longueur pour que le texte reste dans la carte
  const ql = S.q.q.length, al = S.q.a.length;
  $("qText").dataset.len = ql > 170 ? "xl" : ql > 120 ? "l" : ql > 80 ? "m" : "s"; // la taille se règle en CSS (téléphone / tablette)
  $("aText").dataset.len = al > 60 ? "l" : al > 35 ? "m" : "s";
  // remet à zéro tout état « rouge » de la question précédente
  $("fx").className = ""; $("clock").classList.remove("urgent");
  $("mcq").hidden = true; $("dockJudge").hidden = true; $("dockNext").hidden = true;
  $("btnSwap").hidden = !!m.solo; // en solo : pas de changement de question
  $("btnJoker").textContent = `Joker : ${new Set(S.q.o || []).size || 4} choix (${p.jokers})`; // 2 choix pour Vrai ou faux
  $("btnJoker").hidden = !(m.joker && p.jokers > 0);
  $("dockGame").hidden = $("btnJoker").hidden;
  show("s-game");
  startTimer();
  if (m.qcm) { S.joker = true; renderChoices(); }
}

/* ---------- Minuteur ---------- */
function runTimer() {
  const warn = S.cfg.time >= 20 ? 10 : 3, clock = $("clock");
  clearInterval(S.tid);
  S.tid = setInterval(() => {
    S.left--;
    clock.textContent = Math.max(S.left, 0);
    if (S.left <= warn) clock.classList.add("urgent");
    if (S.left <= 0) timeUp();
  }, 1000);
}
function startTimer() {
  stopTimer();
  const time = S.cfg.time;
  $("clockrow").hidden = !time;
  if (!time) return;
  S.left = time;
  const bar = $("bar30"), clock = $("clock");
  bar.style.setProperty("--dur", time + "s");
  bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = ""; bar.style.animationPlayState = "";
  clock.textContent = time; clock.classList.remove("urgent");
  $("btnStopTimer").hidden = !!M().solo; // en solo : on ne peut pas arrêter le temps
  runTimer();
}
function stopTimer() {
  clearInterval(S.tid); S.tid = null;
  $("bar30").style.animationPlayState = "paused";
  $("clock").classList.remove("urgent");
  $("btnStopTimer").hidden = true;
}
function resumeTimer() {
  if (S.left <= 0) return;
  $("bar30").style.animationPlayState = "running";
  $("btnStopTimer").hidden = !!M().solo; // en solo : on ne peut pas arrêter le temps
  runTimer();
}

function timeUp() {
  if (S.locked) return;
  S.locked = true; stopTimer();
  $("dockGame").hidden = true; $("dockJudge").hidden = true; $("btnSwap").hidden = true;
  if (M().qcm || S.joker) {
    document.querySelectorAll("#mcq .btn").forEach((b) => { b.disabled = true; if (b.textContent === S.q.a) b.classList.add("right"); });
    S.pending = false; flash("ko");
    $("dockNext").hidden = false;
    return;
  }
  $("backTag").textContent = "Temps écoulé";
  $("card").classList.add("flipped");
  setTimeout(() => finish(false), 2200);
}

/* ---------- Actions ---------- */
function flip() {
  if (S.joker || S.locked || M().qcm) return;
  const c = $("card"), first = !c.dataset.seen;
  c.classList.toggle("flipped"); // retournable autant de fois que l'on veut ; le minuteur continue
  if (first) {
    c.dataset.seen = "1";
    $("dockGame").hidden = true; // « Changer de question » reste disponible même carte retournée
    setTimeout(() => { if (!S.locked) $("dockJudge").hidden = false; }, 350);
  }
}

function renderChoices() {
  $("dockGame").hidden = true;
  const list = [...new Set(S.q.o)].sort(() => Math.random() - 0.5);
  const box = $("mcq");
  box.replaceChildren();
  box.classList.toggle("long", list.some((o) => o.length > 24));
  list.forEach((o, i) => {
    const b = document.createElement("button");
    b.className = "btn white"; b.textContent = o; b.style.animation = `pop .35s ${i * 70}ms backwards`;
    b.onclick = () => pickOption(o, b);
    box.append(b);
  });
  box.hidden = false;
}

function useJoker() {
  S.joker = true;
  S.players[S.i].jokers--;
  $("btnSwap").hidden = true;
  renderChoices();
}

function pickOption(o, btn) {
  if (S.locked) return;
  S.locked = true; stopTimer(); $("btnSwap").hidden = true;
  const ok = o === S.q.a;
  document.querySelectorAll("#mcq .btn").forEach((b) => { b.disabled = true; if (b.textContent === S.q.a) b.classList.add("right"); });
  if (!ok) btn.classList.add("wrong");
  S.pending = ok;
  flash(ok ? "ok" : "ko");
  $("dockNext").hidden = false; // le groupe prend son temps, puis appuie sur Continuer
}

function judge(ok) { if (S.locked) return; S.locked = true; stopTimer(); finish(ok); }

function finish(correct, quiet) {
  if (!S.inGame) return;
  if (S.q) statAnswer(S.q.t, correct); // pour le Profil
  $("btnSwap").hidden = true;
  const pl = S.players[S.i];
  if (correct) { pl.score++; pl.streak = (pl.streak || 0) + 1; pl.points += 10 * S.diff + (M().solo ? Math.min(pl.streak - 1, 5) * 5 : 0); } // 10 pts × niveau, + bonus de série en solo
  else pl.streak = 0;
  if (S.bet) { // question à mise : on gagne ou on perd la mise
    pl.points = Math.max(0, pl.points + (correct ? S.bet : -S.bet));
    S.betMsg = correct ? `Mise gagnée : +${S.bet} pts` : `Mise perdue : −${S.bet} pts`; // affiché sur la question suivante
    S.bet = 0;
  }
  if (!quiet) flash(correct ? "ok" : "ko");
  setTimeout(() => resolve(correct), quiet ? 0 : 500);
}

function resolve(correct) {
  if (!S.inGame) return;
  if (correct || M().teams) return afterTurn();
  const p = S.players[S.i];
  if (M().solo) { p.lives--; if (p.lives <= 0) kill(p); return afterTurn(); } // solo : pas de question, la vie part toute seule
  if (M().lives && p.lives > 0) {
    $("reviveName").textContent = p.name;
    $("lifeCount").textContent = p.lives;
    show("s-revive");
  } else { kill(p); afterTurn(); }
}

/* ---------- Question à mise (Solo) ---------- */
// Environ une question sur quatre, à partir de la 3e et avec au moins 20 points.
function offerBet() {
  const p = S.players[S.i];
  S.bet = 0;
  if (!M().solo || S.retry || S.qn < 2 || p.points < 20 || S.qn - (S.lastBet ?? -9) < 3 || Math.random() > 0.25) return false;
  S.lastBet = S.qn;
  $("betTag").textContent = `${S.q.t} · ${LEVELS[S.diff]}`;
  $("betInfo").textContent = `Vous avez ${p.points} pts. Bonne réponse : vous gagnez la mise en plus. Mauvaise : vous la perdez.`;
  const box = $("betOpts");
  box.replaceChildren();
  [[0, "Ne pas miser", "white"], [0.25, "", "white"], [0.5, "", "sun"], [1, "", "coral"]].forEach(([k, label, look]) => {
    const v = Math.round(p.points * k);
    const b = document.createElement("button");
    b.className = `btn ${look}`;
    b.textContent = k ? `${k === 1 ? "Tout miser" : `Miser ${k * 100} %`} (${v} pts)` : label;
    b.onclick = () => { S.bet = v; prepareCard(); };
    box.append(b);
  });
  show("s-bet");
  return true;
}

function revive(useLife) {
  const p = S.players[S.i];
  // les vies ne sont enregistrées qu'en fin de partie : quitter en cours de route ne les consomme pas
  if (useLife) { p.lives--; S.retry = true; return loadAndPlay(); } // même joueur, nouvelle question
  kill(p);
  afterTurn();
}

/* Le niveau est demandé quand tous les joueurs encore en jeu ont joué */
function afterTurn() {
  if (!S.inGame) return;
  if (M().teams) {
    if (S.turn >= S.order.length * TEAM_ROUNDS) return endTeams();
    if (S.turn % S.order.length) return nextTurn();
    // un tour complet de toutes les équipes : niveau suivant (automatique) ou proposé
    if (S.cfg.auto) return chooseLevel(true);
    $("lvName").textContent = `${S.diff} · ${LEVELS[S.diff]}`;
    $("btnUp").hidden = S.diff >= 5; $("btnStay").hidden = false; $("lvWait").hidden = true;
    $("btnUp").textContent = `Augmenter la difficulté (${10 * (S.diff + 1)} pts)`;
    $("btnStay").textContent = `Garder ce niveau (${10 * S.diff} pts)`;
    return show("s-level");
  }
  if (over()) return endGame(alive()[0]);
  if (M().solo) { S.qn++; if (S.qn % 3) return nextTurn(); } // solo : difficulté proposée toutes les 3 questions
  S.played.add(S.i);
  if (!alive().every((p) => S.played.has(S.players.indexOf(p)))) return nextTurn();
  S.played.clear();
  if (S.cfg.auto) return chooseLevel(true); // difficulté évolutive : on monte sans demander
  $("lvName").textContent = `${S.diff} · ${LEVELS[S.diff]}`;
  $("btnUp").hidden = S.diff >= 5;
  $("btnStay").hidden = false; $("lvWait").hidden = true;
  $("btnUp").textContent = M().solo ? `Augmenter la difficulté (${10 * (S.diff + 1)} pts)` : "Augmenter la difficulté";
  $("btnStay").textContent = M().solo ? `Garder ce niveau (${10 * S.diff} pts)` : "Garder ce niveau";
  show("s-level");
}
function chooseLevel(up) { if (up) S.diff = Math.min(S.diff + 1, 5); nextTurn(); }

function endGame(w) {
  S.inGame = false;
  const ol = $("ranking");
  ol.replaceChildren();
  if (M().solo) {
    const p = S.players[0], key = `quizly:${S.uid}:best2`;
    let best = 0; try { best = +localStorage.getItem(key) || 0; } catch {}
    const rec = p.points > best;
    if (rec) try { localStorage.setItem(key, p.points); } catch {}
    $("endLead").textContent = "Score final";
    $("winner").textContent = `${p.points} pts`;
    $("endNote").textContent = `${rec ? "Nouveau record ! " : ""}Record : ${Math.max(best, p.points)} pts · ${p.score} bonne${p.score > 1 ? "s" : ""} réponse${p.score > 1 ? "s" : ""}`;
    show("s-end");
    if (rec) confetti();
    return;
  }
  if (w) w.lives++;
  S.players.forEach((p, i) => { if (S.slots[i]) { S.slots[i].lives = p.lives; S.slots[i].imported = true; } });
  saveDB(); saveRoster();
  $("endLead").textContent = "Vainqueur";
  $("winner").textContent = w ? w.name : "Égalité";
  $("endNote").textContent = w ? "+1 vie gagnée" : "Personne ne gagne de vie";
  const order = [...S.players].sort((a, b) => (b === w) - (a === w) || b.outAt - a.outAt);
  order.forEach((p, i) => {
    const li = document.createElement("li");
    li.className = "rk" + (i === 0 ? " first" : "");
    li.style.animationDelay = `${0.35 + i * 0.12}s`;
    const pos = document.createElement("span"); pos.className = "pos"; pos.textContent = i + 1;
    const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = p.name;
    const st = document.createElement("span"); st.className = "st";
    st.textContent = `${p.score} bonne${p.score > 1 ? "s" : ""} · ♥︎ ${p.lives}`;
    li.append(pos, avatarEl(p.name, photoOf(p.name)), nm, st);
    ol.append(li);
  });
  show("s-end");
  confetti();
}

/* ---------- Équipes ---------- */
const TEAM_NAMES = ["Rouge", "Bleue", "Verte", "Jaune"];
const TEAM_ROUNDS = 3; // 3 questions par joueur
const teamPts = (t) => S.players.filter((p) => p.team === t).reduce((a, p) => a + p.points, 0);
function teamLine(p) { // « Équipe Rouge · Rouge 40 · Bleue 30 »
  const scores = TEAM_NAMES.slice(0, S.nTeams).map((n, t) => `${n} ${teamPts(t)}`).join(" · ");
  return `Équipe ${TEAM_NAMES[p.team]} · ${scores} pts`;
}
function shuffleTeams() {
  const idx = S.slots.map((s, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  S.teamOf = [];
  idx.forEach((p, k) => (S.teamOf[p] = k % S.nTeams));
}
function renderTeams() {
  const n = S.slots.length;
  S.nTeams = Math.min(S.nTeams || 2, n);
  if (!S.teamOf || S.teamOf.length !== n || S.teamOf.some((t) => t >= S.nTeams)) shuffleTeams();
  opts($("optTeams"), [2, 3, 4].filter((v) => v <= n), S.nTeams, (v) => `${v} équipes`, (v) => { S.nTeams = v; shuffleTeams(); drawTeams(); });
  $("teamsMsg").textContent = "";
  drawTeams();
}
function drawTeams() {
  const box = $("teamBoxes");
  box.replaceChildren();
  for (let t = 0; t < S.nTeams; t++) {
    const d = document.createElement("div");
    d.className = `team t${t}`;
    const h = document.createElement("h3"); h.textContent = `Équipe ${TEAM_NAMES[t]}`;
    const list = document.createElement("div"); list.className = "members";
    S.slots.forEach((s, i) => {
      if (S.teamOf[i] !== t) return;
      const b = document.createElement("button");
      b.className = "chip"; b.append(avatarEl(s.name, photoOf(s.name)), document.createTextNode(s.name));
      b.onclick = () => { S.teamOf[i] = (S.teamOf[i] + 1) % S.nTeams; drawTeams(); }; // toucher = équipe suivante
      list.append(b);
    });
    d.append(h, list);
    box.append(d);
  }
}
function endTeams() {
  S.inGame = false;
  const teams = TEAM_NAMES.slice(0, S.nTeams).map((name, t) => ({ name, pts: teamPts(t), members: S.players.filter((p) => p.team === t) }))
    .sort((a, b) => b.pts - a.pts);
  const tie = teams[0].pts === teams[1].pts;
  const mvp = [...S.players].sort((a, b) => b.points - a.points)[0];
  $("endLead").textContent = tie ? "Partie terminée" : "Équipe gagnante";
  $("winner").textContent = tie ? "Égalité" : teams[0].name;
  $("endNote").textContent = mvp && mvp.points > 0 ? `Meilleur joueur : ${mvp.name} (${mvp.points} pts)` : "";
  const ol = $("ranking");
  ol.replaceChildren();
  teams.forEach((tm, i) => {
    const li = document.createElement("li");
    li.className = "rk" + (i === 0 && !tie ? " first" : "");
    li.style.animationDelay = `${0.35 + i * 0.12}s`;
    const pos = document.createElement("span"); pos.className = "pos"; pos.textContent = i + 1;
    const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = `${tm.name} (${tm.members.map((p) => p.name).join(", ")})`;
    const st = document.createElement("span"); st.className = "st"; st.textContent = `${tm.pts} pts`;
    li.append(pos, nm, st);
    ol.append(li);
  });
  show("s-end");
  confetti();
}
$("btnShuffle").onclick = () => { shuffleTeams(); drawTeams(); };
$("btnTeams").onclick = () => {
  const empty = TEAM_NAMES.slice(0, S.nTeams).findIndex((n, t) => !S.teamOf.includes(t));
  if (empty >= 0) { $("teamsMsg").textContent = `L'équipe ${TEAM_NAMES[empty]} n'a aucun joueur.`; return; }
  renderThemes(); show("s-themes");
};

/* ---------- L'Imposteur (un téléphone) ---------- */
// On se passe le téléphone : chacun découvre sa carte en secret (la question et la réponse ; l'imposteur, seulement
// la question). On discute, puis le groupe désigne un suspect. Démasqué, l'imposteur a une dernière chance : trouver la réponse.
const IMP = {};
const impHead = () => ({ round: IMP.round, rounds: IMP.rounds });
function impStart() {
  // des questions très dures, que l'imposteur ne peut pas trouver seul : pas de calcul, de logique, d'anagramme, ni d'extrait à écouter
  [...S.active].forEach((t) => { if (LOCAL_THEMES.includes(t) && !IMP_LOCAL_OK.includes(t)) S.active.delete(t); });
  if (!S.active.size) THEMES.filter((t) => !LOCAL_THEMES.includes(t)).forEach((t) => S.active.add(t));
  const bank = loadBank(); // les questions gardées d'avant sont trop faciles : on repart de questions neuves, très dures
  S.buf = []; S.rest = bank;
  S.players.forEach((p) => { p.points = 0; p.imp = 0; });
  Object.assign(IMP, { round: 0, rounds: Math.min(6, Math.max(3, S.players.length)), last: -1 });
  impRound();
}
async function impRound() {
  if (!S.inGame) return;
  if (IMP.round >= IMP.rounds) return impEnd();
  IMP.round++;
  S.diff = 5; // toujours le niveau le plus dur : l'imposteur ne doit pas pouvoir deviner
  $("loadText").textContent = "L'IA prépare la question…"; $("loadErr").hidden = true; show("s-load");
  let q;
  try { q = await getQuestion(); } catch (e) { if (!S.inGame) return; $("loadText").textContent = `Génération impossible : ${e.message}`; $("loadErr").hidden = false; IMP.round--; return; }
  if (!S.inGame) return;
  const others = S.players.map((p, i) => i).filter((i) => i !== IMP.last); // jamais deux fois de suite le même imposteur
  IMP.imp = others[Math.floor(Math.random() * others.length)]; IMP.last = IMP.imp;
  S.players[IMP.imp].imp++;
  Object.assign(IMP, { q, k: 0, guessText: null });
  impPass();
}
const impCardOf = (i) => ({ ...impHead(), tag: `${IMP.q.t} · ${LEVELS[S.diff]}`, q: IMP.q.q, img: IMP.q.img || null, imposter: i === IMP.imp, answer: i === IMP.imp ? null : IMP.q.a }); // l'imposteur n'a aucun indice
function impPass() { // au suivant de découvrir sa carte
  if (IMP.k >= S.players.length) return impTalk();
  const p = S.players[IMP.k];
  imp.pass({ ...impHead(), name: p.name, photo: photoOf(p.name) }, () => imp.card(impCardOf(IMP.k), () => { IMP.k++; impPass(); }));
  show("s-imp");
}
function impTalk() {
  // pendant la discussion, le téléphone posé au milieu montre la question, sans la réponse
  const starter = S.players[Math.floor(Math.random() * S.players.length)].name;
  imp.talk({ ...impHead(), tag: `${IMP.q.t} · ${LEVELS[S.diff]}`, q: IMP.q.q, img: IMP.q.img || null, ms: S.cfg.time * 1000, starter }, impVote, impVote);
  show("s-imp");
}
function impVote() {
  imp.vote({ ...impHead(), info: "Mettez-vous d'accord, puis touchez le suspect.", players: S.players.map((p, i) => ({ id: i, name: p.name, photo: photoOf(p.name) })) },
    (p) => ask(`Accuser ${p.name} ?`, "Le groupe pense que c'est l'imposteur.", "Accuser", () => impAccuse(p.id)));
}
function impAccuse(i) {
  IMP.accused = i;
  if (i !== IMP.imp) return impResult(false, false);
  const p = S.players[IMP.imp]; // démasqué : on lui passe le téléphone pour sa dernière chance
  imp.pass({ ...impHead(), name: p.name, photo: photoOf(p.name) }, () =>
    imp.guess({ ...impHead(), q: IMP.q.q }, (text) => { IMP.guessText = text; setTimeout(() => impResult(true, answerMatches(text, IMP.q.a)), 500); })); // il écrit la réponse (fautes permises)
}
function impResult(caught, guessed) {
  const before = S.players.map((p) => p.points);
  const bad = S.players[IMP.imp];
  if (!caught) bad.points += IMP_PTS.hidden;
  else if (guessed) bad.points += IMP_PTS.guessed;
  else S.players.forEach((p, i) => { if (i !== IMP.imp) p.points += IMP_PTS.crew + IMP_PTS.voter; }); // sur un téléphone, tout le monde a voté ensemble
  if (!caught || guessed) flash("ko"); else flash("ok");
  const last = IMP.round >= IMP.rounds;
  imp.result({
    ...impHead(), caught, guessed, guessText: caught ? IMP.guessText || "" : null, impName: bad.name, impPhoto: photoOf(bad.name), accusedName: S.players[IMP.accused]?.name, answer: IMP.q.a,
    board: S.players.map((p, i) => ({ name: p.name, photo: photoOf(p.name), points: p.points, gain: p.points - before[i] }))
  }, impRound, last ? "Voir le classement" : "Manche suivante");
  show("s-imp");
}
function impEnd() {
  S.inGame = false;
  const order = [...S.players].sort((a, b) => b.points - a.points);
  const tie = order.length > 1 && order[0].points === order[1].points;
  $("endLead").textContent = tie ? "Partie terminée" : "Vainqueur";
  $("winner").textContent = tie ? "Égalité" : order[0].name;
  $("endNote").textContent = "L'Imposteur";
  const ol = $("ranking"); ol.replaceChildren();
  order.forEach((p, i) => {
    const li = document.createElement("li"); li.className = "rk" + (i === 0 ? " first" : ""); li.style.animationDelay = `${0.35 + i * 0.12}s`;
    const pos = document.createElement("span"); pos.className = "pos"; pos.textContent = i + 1;
    const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = p.name;
    const st = document.createElement("span"); st.className = "st"; st.textContent = `${p.points} pts · imposteur ${p.imp}×`;
    li.append(pos, avatarEl(p.name, photoOf(p.name)), nm, st); ol.append(li);
  });
  show("s-end");
  confetti();
}

/* ---------- Statistiques (onglet Profil) ---------- */
const statKey = () => `quizly:${S.uid}:stats`;
function getStats() {
  try { return JSON.parse(localStorage.getItem(statKey()) || "null") || { themes: {}, games: {} }; }
  catch { return { themes: {}, games: {} }; }
}
function saveStats(st) { try { localStorage.setItem(statKey(), JSON.stringify(st)); } catch {} }
function statAnswer(theme, ok) {
  if (!theme || !S.uid) return;
  const st = getStats();
  const t = (st.themes[theme] ||= { ok: 0, n: 0 });
  t.n++; if (ok) t.ok++;
  if (ok) cosm.earn(1); // 1 Q-Buck par bonne réponse
  st.run = ok ? (st.run || 0) + 1 : 0; // bonnes réponses d'affilée (toutes parties confondues)
  if (ok) { quests.tick("good"); quests.best("run", st.run); } // les défis avancent
  st.bestRun = Math.max(st.bestRun || 0, st.run);
  saveStats(st);
  checkAch();
}
function statGame(kind) {
  if (!S.uid) return;
  const st = getStats();
  st.games[kind] = (st.games[kind] || 0) + 1;
  saveStats(st);
  cosm.earn(2, "partie"); // 2 Q-Bucks par partie
  quests.tick("game");
  friends.clubSync(); // le club voit vos chiffres de la semaine
  if (["online", "chrono", "omillion", "oteams", "obets", "oimp", "oroyale", "oduel"].includes(kind)) quests.tick("online");
  if (kind === "chrono") quests.tick("chrono");
  if (kind === "million" || kind === "omillion") quests.tick("million");
  checkAch();
}
function renderProfile() {
  const st = getStats();
  const best = (k) => { try { return +localStorage.getItem(`quizly:${S.uid}:${k}`) || 0; } catch { return 0; } };
  $("profName").textContent = S.firstName || "Profil";
  styleName($("profName"), cosm.get()); $("profName").classList.toggle("champ", friends.isChamp("me")); $("profTitle").textContent = titleOf(cosm.get()); $("profTitle").hidden = !titleOf(cosm.get()); // votre couleur de pseudo et votre titre
  $("coinCount").textContent = cosm.coins();
  $("s-profile").querySelector(".profhead").className = `profhead banner ${cosm.get().banner}`; // votre bannière
  $("meEdit").hidden = true;
  $("profAv").replaceChildren(avatarEl(S.firstName, S.photo, true));
  const themes = Object.entries(st.themes).map(([name, t]) => ({ name, ...t, pct: Math.round((100 * t.ok) / t.n) }));
  const tot = themes.reduce((a, t) => a + t.n, 0), good = themes.reduce((a, t) => a + t.ok, 0);
  const games = Object.values(st.games).reduce((a, b) => a + b, 0);
  // Profil allégé : les 3 records, puis une ligne de chiffres
  const short = (v) => (v >= 1000000 ? "1 M€" : v >= 1000 ? `${Math.round(v / 1000)} k€` : `${v} €`); // 100 000 € → 100 k€
  const cards = [["Solo", `${best("best2")}`], ["Chrono", `${best("bestChrono")}`], ["Millionnaire", short(best("bestMillion"))]];
  $("profRecords").replaceChildren(...cards.map(([k, v]) => {
    const d = document.createElement("div"); d.className = "stat";
    const b = document.createElement("strong"); b.textContent = v;
    const s = document.createElement("span"); s.textContent = k;
    d.append(b, s); return d;
  }));
  // trois pastilles : parties, questions, réussite
  $("profStats").replaceChildren(...[[games, "parties"], [tot, "questions"], [tot ? `${Math.round((100 * good) / tot)}%` : "—", "réussite"]].map(([v, k]) => {
    const d = document.createElement("div"); d.className = "bub";
    const b = document.createElement("strong"); b.textContent = v;
    const s = document.createElement("span"); s.textContent = k;
    d.append(b, s); return d;
  }));
  const ranked = themes.filter((t) => t.n >= 5).sort((a, b) => b.pct - a.pct);
  // points forts et thèmes à travailler : jamais le même thème dans les deux listes
  const half = Math.ceil(ranked.length / 2);
  const strong = ranked.slice(0, Math.min(3, half)), weak = ranked.slice(half).slice(-2).reverse();
  // point fort et thème à travailler : deux tuiles colorées, sans phrase
  const tile = (look, label, name) => {
    const d = document.createElement("div"); d.className = `tile ${look}`;
    const s = document.createElement("span"); s.textContent = label;
    const b = document.createElement("strong"); b.textContent = name;
    d.append(s, b); return d;
  };
  $("profSum").replaceChildren(...(ranked.length >= 2 ? [tile("up", "Point fort", strong[0].name), ...(weak.length ? [tile("down", "À travailler", weak[0].name)] : [])] : []));
  // par thème : les 6 plus joués (le reste sur demande), une barre colorée selon la réussite
  const shown = themes.sort((a, b) => b.n - a.n).slice(0, S.allThemes ? 999 : 6);
  $("btnAllThemes").hidden = themes.length <= 6;
  $("btnAllThemes").textContent = S.allThemes ? "Voir moins" : `Voir tous les thèmes (${themes.length})`;
  $("profThemes").replaceChildren(...shown.map((t) => {
    const li = document.createElement("li");
    const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = t.name;
    const bar = document.createElement("span"); bar.className = "bar";
    const i = document.createElement("i"); i.style.width = `${t.pct}%`;
    i.style.background = t.pct >= 70 ? "var(--mint)" : t.pct >= 40 ? "var(--sun)" : "var(--coral)";
    bar.append(i);
    const v = document.createElement("span"); v.className = "v"; v.textContent = `${t.pct}%`;
    li.append(nm, bar, v); return li;
  }));
  $("profEmpty").hidden = themes.length > 0;
  checkAch(); // de nouveaux niveaux peuvent déjà être atteints
  renderAch($("achGrid"), $("achCount"), Object.keys(getAch()), achFacts());
  friends.syncRecords();
  const cs = cloudState();
  $("profCloud").textContent = cs === "cloud" ? "Sauvegardé" : cs === "error" ? "Hors ligne" : "Connexion…"; // petite pastille d'état
  $("profCloud").className = `cloudchip ${cs}`;
}

/* ---------- Qui veut gagner des millions (sur l'appareil) ---------- */
const mui = millionUI($);
const million = millionLocal({
  $, show, flash, ask, ui: mui, stat: statAnswer, photoOf,
  getQ: async (d) => { // il faut 4 choix (50/50 et avis du public)
    S.diff = d;
    let q;
    for (let i = 0; i < 6; i++) {
      try { q = await getQuestion(); }
      catch { q = (await pickLocalQ(LOCAL_THEMES.filter((t) => t !== SONG_THEME), d)) || q; } // IA indisponible : question sans IA, jamais déjà posée
      if (new Set(q.o).size >= 4) break;
    }
    return q;
  },
  onEnd: (list) => {
    S.inGame = false;
    statGame("million");
    const order = [...list].sort((a, b) => b.won - a.won || b.n - a.n);
    const solo = order.length === 1, tie = !solo && order[0].won === order[1].won;
    const top = order[0];
    $("endLead").textContent = solo ? (top.n === 15 ? "Millionnaire !" : "Vous repartez avec") : tie ? "Partie terminée" : "Vainqueur";
    $("winner").textContent = solo ? euros(top.won) : tie ? "Égalité" : top.name;
    $("endNote").textContent = tie ? "" : solo ? millionRecord(top) : `${top.name} repart avec ${euros(top.won)}`;
    const ol = $("ranking");
    ol.replaceChildren();
    if (!solo) order.forEach((p, i) => {
      const li = document.createElement("li");
      li.className = "rk" + (i === 0 && !tie ? " first" : "");
      li.style.animationDelay = `${0.35 + i * 0.12}s`;
      const pos = document.createElement("span"); pos.className = "pos"; pos.textContent = i + 1;
      const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = p.name;
      const st = document.createElement("span"); st.className = "st"; st.textContent = `${euros(p.won)} · ${p.n} bonne${p.n > 1 ? "s" : ""}`;
      li.append(pos, avatarEl(p.name, photoOf(p.name)), nm, st);
      ol.append(li);
    });
    show("s-end");
    if (top.won >= 48000 || !solo) confetti();
  }
});
function millionRecord(p) { // record personnel en solo
  const key = `quizly:${S.uid}:bestMillion`;
  let best = 0; try { best = +localStorage.getItem(key) || 0; } catch {}
  if (p.won > best) try { localStorage.setItem(key, p.won); } catch {}
  return `${p.won > best ? "Nouveau record ! " : ""}${p.n} bonne${p.n > 1 ? "s" : ""} réponse${p.n > 1 ? "s" : ""} · record : ${euros(Math.max(best, p.won))}`;
}
function startMillion() {
  S.active = new Set(THEMES.filter((t) => t !== SONG_THEME)); // toutes les catégories, sans choix (pas d'extrait musical)
  S.players = S.slots.map((s) => ({ name: s.name, lives: s.lives, jokers: 0, dead: false, score: 0, points: 0, streak: 0, outAt: 0 }));
  if (S.slots.length > 1) saveRoster(); // en solo, on garde la liste de joueurs habituelle
  S.asked = []; S.used = new Set(); S.inGame = true; S.diff = 1; S.loading = null;
  const bank = loadBank();
  S.buf = bank.filter((q) => S.active.has(q.t) && !seen(q.q));
  S.rest = bank.filter((q) => !S.active.has(q.t));
  million.start(S.slots.map((s) => s.name));
}

/* ---------- Compte, modes, navigation ---------- */
async function login(kind) {
  $("loginMsg").textContent = "";
  try { await signIn(kind); } catch (e) { $("loginMsg").textContent = e.message; }
}

const SESS = "quizly:session";
const getSess = () => { try { return JSON.parse(localStorage.getItem(SESS) || "null"); } catch { return null; } };

// nom et photo : ceux de Google, sauf si vous les avez personnalisés dans le Profil (gardés dans le cloud)
const meKey = () => `quizly:${S.uid}:me`;
function getMe() { try { return JSON.parse(localStorage.getItem(meKey()) || "{}"); } catch { return {}; } }
function setUser(name, photo) {
  S.gName = name; S.gPhoto = photo; // ce que dit Google
  const o = S.uid ? getMe() : {};
  const first = o.name || (name || "Compte").split(" ")[0];
  photo = o.photo || photo || "";
  S.firstName = first;
  S.photo = photo;
  userLabel();
  const img = $("userPhoto"), ini = $("userInit");
  ini.textContent = first.charAt(0).toUpperCase();
  img.hidden = !photo; ini.hidden = !!photo;
  if (photo) img.src = photo;
}

// menu : 3 blocs (En ligne · Party · Solo). Party et Solo ouvrent leur propre liste de modes.
const SECTIONS = {
  party: ["Party", "Sur un seul téléphone, entre amis : Classique, QCM, Équipes, L'Imposteur et Qui veut gagner des millions.", [
    ["classic"], ["qcm"], ["teams"], ["impostor"],
    ["million", "Qui veut gagner des millions", "À plusieurs : chacun son échelle de 15 questions et ses 3 jokers. Celui qui repart avec le plus gagne."]
  ]],
  solosec: ["Solo", "Seul face aux questions : Solo, Chrono et Qui veut gagner des millions.", [
    ["solo"],
    ["chrono", "Chrono", "Seul contre la montre : 60 secondes pour marquer un maximum de points. La difficulté monte, les séries rapportent. Battez votre record !", "chrono"],
    ["million", "Qui veut gagner des millions", "Seul face à l'échelle : 15 questions, 3 jokers, des paliers sûrs. Visez le million !", true]
  ]]
};
function modeCard(id, name, desc, onClick, i) {
  const b = document.createElement("button");
  b.className = "mode"; b.dataset.m = id; b.style.animationDelay = `${i * 70}ms`;
  const t = document.createElement("strong"); t.textContent = name;
  b.append(t);
  if (desc) { const d = document.createElement("span"); d.textContent = desc; b.append(d); } // les 3 blocs du menu : juste le nom
  b.onclick = onClick;
  return b;
}
function renderModes() {
  S.menuSec = null;
  const grid = document.createElement("div"); grid.className = "modes three";
  grid.append(
    modeCard("online", "En ligne", "Chacun sur son téléphone, avec un code ou la télé.", () => chooseMode("online"), 0),
    modeCard("party", "Party", "Jouer avec tes amis sur un seul téléphone.", () => openSection("party"), 1),
    modeCard("solosec", "Solo", "Seul face aux questions, pour battre tes records.", () => openSection("solosec"), 2)
  );
  $("modes").replaceChildren(grid);
}
function openSection(key) {
  S.menuSec = key;
  const [title, , items] = SECTIONS[key];
  $("subTitle").textContent = title;
  const grid = document.createElement("div"); grid.className = "modes";
  items.forEach(([id, name, desc, solo], i) => {
    const m = MODES[id];
    grid.append(modeCard(id, name || m.name, desc || m.desc, () => (solo === "chrono" ? chronoSolo() : solo ? millionSolo() : chooseMode(id)), i));
  });
  $("subModes").replaceChildren(grid);
  show("s-sub");
}
$("btnSubBack").onclick = () => { S.menuSec = null; show("s-mode"); };
function millionSolo() { // Millionnaire seul : on lance directement, à votre nom
  chooseMode("million");
  S.mSolo = true; // « Rejouer » relancera la partie seul, sans passer par le nombre de joueurs
  S.count = 1;
  S.slots = [{ name: S.firstName || "Moi", lives: 0, imported: false }];
  startMillion();
}

// Chrono seul : la même partie que le Chrono en ligne (60 s, chrono en pause entre les questions, record),
// dans un salon privé lancé tout de suite, sans salle d'attente
function chronoSolo() {
  S.mode = "chrono"; S.mSolo = false; S.soloChrono = true; S.editRoom = false; S.cfg.time = 60;
  renderThemes(); show("s-themes");
}
function chooseMode(id) {
  S.mode = id;
  S.mSolo = false; S.soloChrono = false;
  S.cfg.time = M().time;
  if (M().online) {
    $("onMsg").textContent = "";
    show("s-online"); return;
  }
  $("modeLabel").textContent = `Mode : ${M().name}`;
  loadRoster();
  if (M().solo) {
    S.slots = [{ name: S.firstName || "Moi", lives: 0, imported: false }]; S.count = 1; // pas de nom ni d'import en solo
    renderThemes();
    show("s-themes");
  } else show("s-count");
}

const profKey = "quizly:profiles";
const getProfiles = () => { try { return JSON.parse(localStorage.getItem(profKey) || "{}"); } catch { return {}; } };
// QR code de la télé scanné avec l'appareil photo du téléphone : quizly…/?tv=ABCDEFGH rejoint le salon télé dès la connexion
let pendingJoin = new URLSearchParams(location.search).get("tv");
// notification touchée alors que l'appli était déjà ouverte : le service worker nous envoie l'adresse
function openLink(url) {
  let p; try { p = new URL(url, location.origin).searchParams; } catch { return; }
  if (!S.uid) { if (p.get("tv")) pendingJoin = p.get("tv"); return; } // pas encore connecté : à la connexion
  const tv = p.get("tv"), club = p.get("club");
  if (tv) { // une invitation à jouer : on rejoint le salon tout de suite
    const code = tv.toUpperCase().slice(0, 12);
    if (online.active()) online.leave();
    S.inGame = false; stopTimer();
    chooseMode("online"); online.join(code);
  } else if (p.get("defi")) openDaily();
  else if (p.get("amis")) openFriends();
  else if (p.get("notifs")) openNotifs();
  else if (club) friends.clubInvite(club);
}
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.onmessage = (e) => {
    const d = e.data || {};
    if (d.type !== "link") return;
    if (e.ports && e.ports[0]) e.ports[0].postMessage("ok"); // reçu : le service worker ne recharge pas la page
    openLink(d.url);
  };
}
function enter(uid, name, photo) {
  S.uid = uid;
  setUser(name, photo);
  try { cosm.apply(); } catch {} // vos cosmétiques (thème de fond…) tout de suite, sans attendre le cloud
  // compte Google : on récupère la sauvegarde du cloud (vies, records, statistiques, joueurs)
  startCloud(uid).then((st) => { if (st === "cloud" && S.uid === uid) { loadRoster(); afterCloud(); } });
  loadRoster();
  renderModes();
  show("s-mode");
  if (!pendingJoin && online.tryRejoin()) return; // appli rouverte en pleine partie : on y retourne
  if (pendingJoin) {
    const code = pendingJoin.toUpperCase().slice(0, 12); pendingJoin = null;
    try { history.replaceState(null, "", location.pathname); } catch {}
    chooseMode("online");
    online.join(code);
  }
}

/* ---------- Amis ---------- */
const friends = initFriends({
  $, ask, avatarEl, euros,
  week: () => quests.weekStats(), earn: (n, why) => cosm.earn(n, why), // défis du club
  dev: () => S.uid === DEV_UID, // le développeur a tout le monde en amis
  me: () => ({ name: S.firstName || "Joueur", photo: S.photo || "" }),
  records: () => { const b = (k) => { try { return +localStorage.getItem(`quizly:${S.uid}:${k}`) || 0; } catch { return 0; } }; return { best2: b("best2"), bestChrono: b("bestChrono"), bestMillion: b("bestMillion") }; },
  joinRoom: (code) => { chooseMode("online"); online.join(code); },
  roomInfo: () => (online.cfg() ? { code: $("lobbyCode").textContent, kind: online.cfg().kind } : null),
  openFriends: () => openFriends(),
  openNotifs: () => openNotifs(),
  summary: () => { const st = getStats(), t = Object.values(st.themes || {}); const n = t.reduce((a, x) => a + x.n, 0), ok = t.reduce((a, x) => a + x.ok, 0);
    return { games: Object.values(st.games || {}).reduce((a, b) => a + b, 0), questions: n, pct: n ? Math.round((100 * ok) / n) : 0 }; },
  daily: () => getDaily(),
  achs: () => Object.keys(getAch()),
  cos: () => cosm.get(),
  showScreen: (id) => { if (id === "s-friends") friends.render(); show(id); }
});
function openNotifs() { friends.renderNotifs(); adminUI(); show("s-notifs"); }
$("btnNotifs").onclick = openNotifs;
$("btnProfile").onclick = () => { renderProfile(); show("s-profile"); }; // le Profil, en haut (les Défis sont dans la barre du bas)
function openFriends() { friends.render(); friends.freshen(); friends.syncRecords(); pushUI(); show("s-friends"); }
// bandeau des notifications dans l'onglet Amis
function menuPushUI() { // bandeau du menu : tant que les notifications ne sont ni acceptées ni refusées
  let later = false; try { later = Date.now() - (+localStorage.getItem("quizly:pushLater") || 0) < 3 * 86400000; } catch {}
  $("menuPush").hidden = pushState() !== "default" || later || pushMuted();
}
$("btnMenuPush").onclick = async () => { $("btnMenuPush").disabled = true; await askPush(); $("btnMenuPush").disabled = false; menuPushUI(); };
$("btnMenuPushNo").onclick = () => { try { localStorage.setItem("quizly:pushLater", String(Date.now())); } catch {} menuPushUI(); }; // redemandé dans 3 jours
function pushUI(st) {
  st = st || pushState();
  const ios = /iphone|ipad/i.test(navigator.userAgent), installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const box = $("pushBox");
  if (st === "granted" || st === "muted") { box.hidden = true; return; } // coupées exprès : on ne les redemande pas
  box.hidden = false;
  $("btnPush").hidden = st === "denied" || (st === "unsupported");
  $("pushText").textContent = st === "denied" ? "Les notifications sont bloquées : autorisez-les dans les réglages du téléphone, pour Quizly."
    : st === "unsupported" ? (ios && !installed ? "Pour recevoir les notifications sur iPhone, installez Quizly : Partager › Sur l'écran d'accueil." : "Ce navigateur ne permet pas les notifications.")
    : st === "off" ? "Les notifications ne sont pas encore prêtes sur le serveur."
    : "Soyez prévenu quand un ami vous ajoute ou vous invite, même appli fermée.";
}
async function askPush() { const st = await enablePush(S.uid, true); pushUI(st); if (st === "granted") saveDevice(); return st; }
async function saveDevice() { const sub = await currentSub(); if (sub) friends.saveSub(sub.toJSON()); } // le serveur le retrouve même après s'être endormi
$("btnPush").onclick = async () => { $("btnPush").disabled = true; await askPush(); $("btnPush").disabled = false; };
// barre d'onglets du bas (comme Instagram) : visible sur les écrans principaux, cachée en partie et sur les écrans à bouton fixe
const TAB_OF = { "s-mode": "s-mode", "s-sub": "s-mode", "s-online": "s-mode", "s-friends": "s-friends", "s-friend": "s-friends", "s-shop": "s-shop", "s-profile": "", "s-settings": "s-settings", "s-notifs": "", "s-quests": "s-quests" }; // le Profil : barre visible, aucun onglet allumé
const TAB_ORDER = ["s-shop", "s-friends", "s-mode", "s-quests", "s-settings"]; // dans l'ordre de la barre du bas (Boutique à gauche, Accueil au milieu)
function tabbar(id) {
  const bar = $("tabbar"), on = id in TAB_OF;
  bar.hidden = !on;
  document.body.classList.toggle("withtabs", on);
  bar.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.go === TAB_OF[id]));
  if (on) pillTo(bar.querySelector(".tab.on"));
  if (TAB_ORDER.includes(id)) prepAround(id); // prépare les onglets voisins pour un balayage fluide
}
function goTab(t) {
  const go = t.dataset.go || t;
  if (go === "s-friends") return openFriends();
  if (go === "s-shop") { cosm.render(); return show("s-shop"); }
  if (go === "s-quests") return openQuests();
  if (go === "s-settings") { renderSettings(); return show("s-settings"); }
  show("s-mode");
}
// la bulle de verre : elle s'étire en glissant d'un onglet à l'autre puis reprend sa forme (verre liquide d'iOS),
// grossit comme une loupe sous le doigt, et suit le doigt quand on la fait glisser
const bar = $("tabbar"), pill = $("tabPill"), TABS = [...bar.querySelectorAll(".tab")];
const P = { x: 0, shown: false, anim: null };
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches || setting("calm");
const place = (x, sx = 1, sy = 1) => { P.x = x; pill.style.transform = `translate3d(${x}px,0,0) scale(${sx},${sy})`; };
// petit « tic » ressenti quand la bulle passe d'un onglet à l'autre (comme Instagram) : navigator.vibrate sur Android ;
// sur iPhone (iOS 18+), basculer un interrupteur caché fait vibrer le téléphone
const hapSw = (() => {
  if ("vibrate" in navigator) return null;
  const i = document.createElement("input"); i.type = "checkbox"; i.setAttribute("switch", ""); i.tabIndex = -1;
  if (!("switch" in i)) return null; // trop ancien pour vibrer
  const l = document.createElement("label"); l.setAttribute("aria-hidden", "true"); l.append(i);
  l.style.cssText = "position:fixed;left:-99px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
  document.body.append(l); return l;
})();
function haptic() { if (!setting("vibrate")) return; if (navigator.vibrate) navigator.vibrate(8); else if (hapSw) hapSw.click(); }
// la bulle se cale au même rythme que les pages qui glissent (même durée, même courbe)
function pillGlide(t) {
  if (!t) return;
  if (P.anim) { P.anim.cancel(); P.anim = null; }
  const x0 = P.x, x = t.offsetLeft;
  if (Math.abs(x - x0) > 1 && !still()) {
    P.anim = pill.animate([{ transform: pill.style.transform }, { transform: `translate3d(${x}px,0,0) scale(1,1)` }], { duration: 280, easing: "cubic-bezier(.2,.85,.25,1)" });
    P.anim.onfinish = () => (P.anim = null);
  }
  place(x);
}
const tabsOn = (id) => TABS.forEach((b) => b.classList.toggle("on", b.dataset.go === id));
function pillTo(t, from) {
  if (!t) { pill.classList.remove("show"); P.shown = false; return; }
  const x = t.offsetLeft, w = t.offsetWidth, x0 = from ?? P.x;
  pill.style.width = w + "px";
  if (P.anim) { P.anim.cancel(); P.anim = null; }
  if (P.shown && Math.abs(x - x0) > 1 && !still()) {
    const d = Math.abs(x - x0), k = Math.min(0.55, d / (w * 2.6));
    P.anim = pill.animate([
      { transform: `translate3d(${x0}px,0,0) scale(1,1)` },
      { offset: 0.42, transform: `translate3d(${x0 + (x - x0) * 0.58}px,0,0) scale(${1 + k},${1 - k * 0.32})` },
      { offset: 0.8, transform: `translate3d(${x + (x - x0) * 0.02}px,0,0) scale(${1 - k * 0.08},${1 + k * 0.06})` },
      { transform: `translate3d(${x}px,0,0) scale(1,1)` }
    ], { duration: 380 + Math.min(180, d * 0.5), easing: "cubic-bezier(.22,.8,.3,1)" });
    P.anim.onfinish = () => (P.anim = null);
  }
  place(x);
  pill.classList.add("show"); P.shown = true;
}
// on lance d'abord la bulle, puis on prépare l'écran (sinon le calcul de l'écran retarde l'animation)
const goSoon = (t) => requestAnimationFrame(() => setTimeout(() => goTab(t), 0));
let drag = null;
function dragLoop() { // une image sur deux n'attend pas : la bulle suit le doigt et s'étire selon la vitesse
  if (!drag) return;
  if (drag.moved) {
    const w = pill.offsetWidth, g = drag.geo, lo = g[0].x, hi = g[g.length - 1].x, raw = drag.cx - drag.left - w / 2;
    // au-delà d'Accueil ou de Réglages : la bulle résiste et la barre s'étire de ce côté (élastique, comme Instagram)
    const out = raw < lo ? raw - lo : raw > hi ? raw - hi : 0;
    const x = out ? (out < 0 ? lo : hi) + Math.max(-14, Math.min(14, out * 0.12)) : raw; // la bulle ne déborde que de quelques pixels
    if (!!out !== drag.edge) { drag.edge = !!out; if (out) haptic(); } // on bute contre le bord
    if (out) { bar.style.transformOrigin = out < 0 ? "right center" : "left center"; bar.style.scale = `${1 + Math.min(0.045, Math.abs(out) / bar.offsetWidth * 0.2)} 1`; } // un léger étirement, pas plus
    else bar.style.scale = "";
    drag.v *= 0.82; // l'étirement retombe quand le doigt ralentit
    const k = Math.min(0.4, Math.abs(drag.v) * 0.09);
    place(x, 1 + k, 1 - k * 0.3);
    const mid = x + w / 2, over = g.reduce((a, b) => (Math.abs(mid - (b.x + b.w / 2)) < Math.abs(mid - (a.x + a.w / 2)) ? b : a)).t;
    if (over !== drag.over) { drag.over.classList.remove("over"); over.classList.add("over"); drag.over = over; haptic(); }
  }
  requestAnimationFrame(dragLoop);
}
bar.addEventListener("pointerdown", (e) => {
  const t = e.target.closest(".tab"); if (!t || (e.pointerType === "mouse" && e.button !== 0)) return;
  drag = { id: e.pointerId, x0: e.clientX, cx: e.clientX, t: performance.now(), v: 0, left: bar.getBoundingClientRect().left, moved: false, edge: false, tab: t, over: t, geo: TABS.map((b) => ({ t: b, x: b.offsetLeft, w: b.offsetWidth })) };
  try { bar.setPointerCapture(e.pointerId); } catch {}
  bar.classList.add("press");
  pillTo(t); // la bulle file sous le doigt et devient une loupe
  requestAnimationFrame(dragLoop);
});
bar.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.moved && Math.abs(e.clientX - drag.x0) < 5) return;
  if (!drag.moved) { drag.moved = true; bar.classList.add("drag"); if (P.anim) { P.anim.cancel(); P.anim = null; } }
  const now = performance.now(), dt = Math.max(1, now - drag.t);
  drag.v = drag.v * 0.4 + ((e.clientX - drag.cx) / dt) * 0.6; drag.cx = e.clientX; drag.t = now;
});
function dragEnd(e, cancel) {
  if (!drag || e.pointerId !== drag.id) return;
  const t = cancel ? null : drag.moved ? drag.over : drag.tab, drag0 = drag;
  drag = null;
  bar.classList.remove("press", "drag"); TABS.forEach((b) => b.classList.remove("over"));
  bar.style.scale = ""; // la barre reprend sa taille avec un rebond
  if (t) { if (!drag0.moved && !t.classList.contains("on")) haptic(); TABS.forEach((b) => b.classList.toggle("on", b === t)); pillTo(t, P.x); goSoon(t); } else pillTo(bar.querySelector(".tab.on"), P.x);
}
bar.addEventListener("pointerup", (e) => dragEnd(e));
bar.addEventListener("pointercancel", (e) => dragEnd(e, true));
TABS.forEach((t) => (t.onclick = (e) => { if (e.detail === 0) goTab(t); })); // clavier (au doigt ou à la souris : géré ci-dessus)
addEventListener("resize", () => { if (!bar.hidden) { P.shown = false; pillTo(bar.querySelector(".tab.on")); } });
// balayer l'écran (comme Instagram) : l'écran suit le doigt et l'onglet voisin glisse à côté ; on le lâche, il se cale.
// Règle de sûreté : en dehors d'un geste, un seul écran est visible et aucun n'est déplacé (voir swipeReset).
const PREP = { "s-mode": () => { menuPushUI(); dailyCard(); }, "s-friends": () => friends.render(), "s-shop": () => cosm.render(), "s-quests": () => { renderQuestDaily(); quests.render(); qTab(QTAB); }, "s-settings": () => renderSettings() };
// une ancienne règle (#main>.screen{transform:none!important}) bloquait le déplacement des écrans : d'où les écrans superposés.
// Pendant un geste, on déplace donc avec la même priorité.
function slideTo(el, x, ease) { if (!el) return; if (ease !== undefined) el.style.setProperty("transition", ease, "important"); el.style.setProperty("transform", `translate3d(${x}px,0,0)`, "important"); }
function swipeClean(el) { if (!el) return; ["transform", "transition", "top", "left", "width", "height", "overflow"].forEach((k) => el.style.removeProperty(k)); el.classList.remove("peek", "swiping", "parked"); }
function swipeReset() { // remet tous les écrans en place : seul l'écran courant est visible
  document.body.classList.remove("swipe");
  document.querySelectorAll(".screen").forEach((el) => { swipeClean(el); el.hidden = el.id !== curScreen; });
  swipeClean($("bar")); document.querySelectorAll(".barclone").forEach((el) => el.remove());
}
// les onglets voisins sont préparés à l'avance, quand rien ne bouge : le geste démarre sans à-coup
const prepped = {};
function prepTab(id) { try { PREP[id](); prepped[id] = Date.now(); } catch {} }
// un voisin « garé » : déjà mis en page à sa place, mais invisible ; le balayage n'a plus qu'à l'afficher (comme Instagram)
function park(id) {
  const el = $(id), cur = $(curScreen), main = $("main");
  if (!el || !cur || !el.hidden || !TAB_ORDER.includes(curScreen)) return;
  el.classList.add("parked", "noanim");
  Object.assign(el.style, { top: `${cur.offsetTop}px`, left: `${cur.offsetLeft}px`, width: `${cur.offsetWidth}px`, height: `${Math.max(200, innerHeight - main.getBoundingClientRect().top - scrollY - cur.offsetTop)}px`, overflow: "hidden" });
  el.hidden = false;
}
function prepAround(id) {
  const i = TAB_ORDER.indexOf(id); if (i < 0) return;
  const later = window.requestIdleCallback || ((f) => setTimeout(f, 250));
  [TAB_ORDER[i - 1], TAB_ORDER[i + 1]].filter(Boolean).forEach((n) => later(() => { if (curScreen === id && $(n).hidden) { prepTab(n); park(n); } }));
}
(() => {
  let sw = null, pend = null; // pend : la fin d'un geste en train de se caler
  const scrollsX = (el) => { // le geste appartient à un élément qui défile de côté (onglets, carrousels…)
    for (; el && el !== document.body; el = el.parentElement) {
      if (el.matches("input,textarea,select,[data-noswipe]")) return true;
      const ox = getComputedStyle(el).overflowX;
      if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 2) return true;
    }
    return false;
  };
  function settle() { if (!pend) return; const f = pend; pend = null; clearTimeout(f.t); f.run(); } // termine tout de suite le geste précédent
  function neighbor(dir) { // prépare l'onglet voisin, posé juste à côté de l'écran
    if (sw.nextEl) { sw.nextEl.hidden = true; swipeClean(sw.nextEl); sw.nextEl = null; }
    const id = TAB_ORDER[TAB_ORDER.indexOf(sw.from) + dir];
    sw.dir = dir; sw.next = id || null;
    if (!id) return;
    const el = $(id), top = sw.cur.offsetTop + scrollY;
    if (!el.classList.contains("parked") && Date.now() - (prepped[id] || 0) > 20000) prepTab(id); // d'habitude déjà prêt et garé (prepAround)
    el.classList.remove("parked"); el.classList.add("peek", "noanim");
    // seule la partie visible de l'écran qui arrive est dessinée (moins de travail pour le téléphone)
    Object.assign(el.style, { top: `${top}px`, left: `${sw.cur.offsetLeft}px`, width: `${sw.cur.offsetWidth}px`, height: `${Math.max(200, innerHeight + scrollY - top - $("main").getBoundingClientRect().top - scrollY)}px`, overflow: "hidden" });
    el.hidden = false; sw.nextEl = el;
    const ta = TABS.find((b) => b.dataset.go === sw.from), tb = TABS.find((t) => t.dataset.go === id); // positions de la bulle, mesurées une fois
    sw.pa = ta ? ta.offsetLeft : null; sw.pb = tb ? tb.offsetLeft : null;
    if (!sw.hdr) { // comme sur Instagram, toute la page glisse, en-tête compris : l'onglet qui arrive a le sien
      const real = $("bar"), r = real.getBoundingClientRect(), h = real.cloneNode(true);
      // la copie garde les mêmes id (pour ses styles) : ajoutée en fin de page, $("…") trouve toujours d'abord le vrai en-tête
      h.classList.add("barclone"); h.setAttribute("aria-hidden", "true");
      Object.assign(h.style, { position: "absolute", top: `${r.top + scrollY}px`, left: `${r.left}px`, width: `${r.width}px`, margin: "0" });
      document.body.append(h); sw.hdr = h;
    }
  }
  function paint(dx) { // une image : rien n'est relu dans la page, on ne fait qu'écrire des déplacements
    const W = sw.W;
    slideTo(sw.cur, dx); slideTo(sw.bar, dx);
    if (sw.nextEl) slideTo(sw.nextEl, dx + sw.dir * W);
    if (sw.hdr) { sw.hdr.hidden = !sw.nextEl; slideTo(sw.hdr, dx + sw.dir * W); }
    if (sw.next && sw.pa != null && sw.pb != null) { // la bulle suit les pages, exactement au même rythme, et s'étire selon la vitesse
      if (P.anim) { P.anim.cancel(); P.anim = null; }
      const k = Math.min(0.3, Math.abs(sw.v) * 0.08);
      place(sw.pa + (sw.pb - sw.pa) * Math.min(1, Math.abs(dx) / W), 1 + k, 1 - k * 0.3);
    }
    // au bout (Accueil, Réglages) : la barre s'étire de ce côté, comme quand on tire la bulle
    if (!sw.next && dx) { bar.style.transformOrigin = dx > 0 ? "right center" : "left center"; bar.style.scale = `${1 + Math.min(0.03, Math.abs(dx) / W * 0.12)} 1`; }
    else if (bar.style.scale) bar.style.scale = "";
  }
  function move(e) {
    if (!sw) return;
    if (e.touches.length !== 1) return abort(); // un deuxième doigt : on annule proprement
    const t = e.touches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y;
    if (!sw.lock) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2 || !e.cancelable) { sw = null; return; } // geste vertical (ou défilement déjà lancé) : on laisse défiler
      sw.lock = true; sw.half = false; sw.edge = false; sw.cur.classList.add("swiping"); bar.classList.add("pull"); // la barre suit le doigt sans retard
      sw.W = $("main").clientWidth; sw.bar = $("bar"); // mesuré une fois pour tout le geste
      document.body.classList.add("swipe"); // la barre du bas arrête son flou pendant le geste (très coûteux sur iPhone)
    }
    if (e.cancelable) e.preventDefault();
    const dir = dx < 0 ? 1 : -1;
    if (dir !== sw.dir) neighbor(dir);
    const now = performance.now(); sw.v = (t.clientX - sw.lx) / Math.max(1, now - sw.lt); sw.lx = t.clientX; sw.lt = now;
    sw.dx = sw.next ? dx : dx * 0.28; // au bout (Accueil, Réglages) : ça résiste
    // la bulle passe sur l'onglet voisin à mi-chemin : l'icône s'allume et le téléphone vibre (comme Instagram)
    const half = !!sw.next && Math.abs(dx) > sw.W / 2;
    if (half !== sw.half) { sw.half = half; tabsOn(half ? sw.next : sw.from); haptic(); }
    if (!sw.next !== sw.edge) { sw.edge = !sw.next; if (sw.edge) haptic(); } // on bute contre le bord
    if (!sw.raf) sw.raf = requestAnimationFrame(() => { if (sw) { sw.raf = 0; paint(sw.dx); } }); // au plus un dessin par image
    // filet de sécurité : si la fin du toucher n'arrive jamais (le téléphone l'a avalée), le geste se termine tout seul
    clearTimeout(sw.idle); sw.idle = setTimeout(() => { if (sw && sw.lock) finish(!!sw.next && Math.abs(sw.dx) > sw.W * 0.5); }, 1500);
  }
  function finish(go) {
    const s = sw; sw = null;
    if (s) clearTimeout(s.idle);
    removeEventListener("touchmove", move, { passive: false });
    if (!s || !s.lock) return;
    cancelAnimationFrame(s.raf);
    const W = s.W, ease = "transform .28s cubic-bezier(.2,.85,.25,1)";
    slideTo(s.cur, go ? -s.dir * W : 0, ease); slideTo($("bar"), go ? -s.dir * W : 0, ease);
    slideTo(s.nextEl, go ? 0 : s.dir * W, ease); slideTo(s.hdr, go ? 0 : s.dir * W, ease);
    bar.classList.remove("pull"); bar.style.scale = ""; // la barre reprend sa taille avec un rebond
    if (go && !s.half) haptic(); // lancé d'un coup sec : le tic arrive au changement d'onglet
    tabsOn(go ? s.next : s.from);
    pillGlide(TABS.find((b) => b.dataset.go === (go ? s.next : s.from))); // la bulle se cale avec les pages
    pend = { run: () => { try { if (go) show(s.next); } finally { swipeReset(); } }, t: setTimeout(() => settle(), 290) }; // toujours remis en place, même si l'écran suivant plante
  }
  function abort() { if (sw && sw.lock) finish(false); else { if (sw && sw.hdr) sw.hdr.remove(); sw = null; removeEventListener("touchmove", move, { passive: false }); } }
  function end(e) {
    if (e.touches && e.touches.length) return; // un doigt reste posé : le geste continue
    if (!sw || !sw.lock) { sw = null; removeEventListener("touchmove", move, { passive: false }); return; }
    const W = sw.W;
    finish(!!sw.next && (Math.abs(sw.dx) > W * 0.3 || (Math.abs(sw.v) > 0.45 && Math.sign(sw.v) === -sw.dir)));
  }
  addEventListener("touchstart", (e) => {
    if (sw) { if (e.touches.length > 1) abort(); return; } // un geste est déjà en cours
    settle(); // le geste précédent se termine d'abord
    if (document.querySelector(".screen.peek,.screen.swiping,.barclone") || $("bar").style.getPropertyValue("transform") || document.querySelectorAll(".screen:not([hidden]):not(.parked)").length > 1) { swipeReset(); prepAround(curScreen); } // filet de sécurité
    if (e.touches.length !== 1 || !TAB_ORDER.includes(curScreen) || bar.hidden || e.target.closest("#tabbar,.modal,#confirm") || scrollsX(e.target)) return;
    const p = e.touches[0];
    sw = { x: p.clientX, y: p.clientY, lx: p.clientX, lt: performance.now(), v: 0, dx: 0, dir: 0, from: curScreen, cur: $(curScreen), lock: false, next: null, nextEl: null, hdr: null };
    addEventListener("touchmove", move, { passive: false });
  }, { passive: true });
  addEventListener("touchend", end, { passive: true });
  addEventListener("touchcancel", () => abort(), { passive: true });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { abort(); settle(); swipeReset(); } }); // appli mise en arrière-plan en plein geste
})();
// clavier ouvert : la barre se cache (comme sur iPhone) ; à sa fermeture, on la remet bien en bas
// (sinon l'iPhone peut laisser la barre fixée remontée après la saisie du code d'un salon)
const typing = (el) => el && el.matches && el.matches("input:not([type=checkbox]):not([type=radio]),textarea,[contenteditable]");
document.addEventListener("focusin", (e) => { if (typing(e.target)) document.body.classList.add("kbd"); });
let touching = false; // la barre ne revient pas sous un doigt encore posé (elle volerait l'appui sur un bouton du bas)
addEventListener("pointerdown", () => (touching = true), true);
addEventListener("pointerup", () => setTimeout(() => (touching = false), 50), true);
addEventListener("pointercancel", () => (touching = false), true);
let backT = 0;
function barBack() {
  clearTimeout(backT);
  if (!document.body.classList.contains("kbd") || typing(document.activeElement)) return; // on passe d'un champ à l'autre
  if (touching) { backT = setTimeout(barBack, 150); return; }
  document.body.classList.remove("kbd");
  window.scrollTo(window.scrollX, window.scrollY); // recale les éléments fixés
  if (!bar.hidden) { P.shown = false; pillTo(bar.querySelector(".tab.on")); }
}
document.addEventListener("focusout", (e) => {
  if (!typing(e.target)) return;
  clearTimeout(backT); backT = setTimeout(barBack, 900); // filet : si le clavier ne prévient pas de sa fermeture
});
// le clavier se referme : la zone visible retrouve sa hauteur (on attend la fin de l'appui en cours)
if (window.visualViewport) visualViewport.addEventListener("resize", () => {
  if (visualViewport.height > innerHeight * 0.85 && !typing(document.activeElement)) { clearTimeout(backT); backT = setTimeout(barBack, 120); }
});
// petite animation d'appui sur les boutons du haut (et :active fonctionne aussi sur iPhone)
document.addEventListener("touchstart", () => {}, { passive: true });
["btnUser", "btnCoins", "btnNotifs"].forEach((id) => $(id).addEventListener("pointerdown", (e) => {
  const b = e.currentTarget; b.classList.remove("tap"); void b.offsetWidth; b.classList.add("tap");
  setTimeout(() => b.classList.remove("tap"), 400);
}));
let pendingAmi = new URLSearchParams(location.search).get("ami"); // QR code ami scanné avec l'appareil photo
async function afterCloud() {
  setUser(S.gName, S.gPhoto); // nom et photo personnalisés récupérés du cloud
  cosm.apply();
  coinBackpay();
  questBadge(quests.ready());
  await friends.start();
  enablePush(S.uid, false).then((st) => { pushUI(st); if (st === "granted") saveDevice(); }); // réinscrit cet appareil (sans rien demander)
  if (!S.defiDone && new URLSearchParams(location.search).get("defi")) { S.defiDone = true; try { history.replaceState(null, "", location.pathname); } catch {} openDaily(); } // notification de 10 h touchée (une seule fois)
  if (new URLSearchParams(location.search).get("notifs")) { try { history.replaceState(null, "", location.pathname); } catch {} openNotifs(); } // annonce touchée
  if (new URLSearchParams(location.search).get("amis")) { try { history.replaceState(null, "", location.pathname); } catch {} openFriends(); } // ouvert depuis une notification
  const clubParam = new URLSearchParams(location.search).get("club"); // invitation dans un club touchée
  if (clubParam) { try { history.replaceState(null, "", location.pathname); } catch {} friends.clubInvite(clubParam); }
  if (curScreen === "s-friends") friends.render();
  if (pendingAmi && friends.ready()) { // on ajoute l'ami du lien, puis on montre l'onglet Amis
    const c = pendingAmi; pendingAmi = null;
    try { history.replaceState(null, "", location.pathname); } catch {}
    openFriends(); friends.addByCode(c);
  }
}

// uniquement des comptes Google : une ancienne session de compte local est oubliée
const saved = getSess();
if (saved && (saved.local || String(saved.uid).startsWith("local:"))) { try { localStorage.removeItem(SESS); } catch {} }
else if (saved) enter(saved.uid, saved.name, saved.photo);

watch((user) => {
  if (user) {
    const name = user.displayName || user.email || "Compte";
    try { localStorage.setItem(SESS, JSON.stringify({ uid: user.uid, name, photo: user.photoURL || "" })); } catch {}
    if (S.uid !== user.uid) enter(user.uid, name, user.photoURL); else setUser(name, user.photoURL);
    // Google a confirmé la connexion : on branche le cloud (au lancement, la session est reprise avant que Google réponde)
    startCloud(user.uid).then((st) => { if (st === "cloud" && S.uid === user.uid) { recentCache = null; loadRoster(); afterCloud(); } });
  } else {
    try { localStorage.removeItem(SESS); } catch {}
    S.uid = null; S.inGame = false; stopTimer(); $("confirm").hidden = true; show("s-login");
  }
});

/* ---------- Événements ---------- */
document.querySelectorAll("[data-provider]").forEach((b) => (b.onclick = () => login(b.dataset.provider)));
$("userPhoto").onerror = () => { $("userPhoto").hidden = true; $("userInit").hidden = false; };

// « Sortir » : retour au choix du mode (confirmation si une partie est en cours)
$("btnUser").onclick = () => {
  if (online.active()) {
    ask("Quitter la salle ?", "Vous quitterez la partie en cours.", "Quitter", () => { S.editRoom = false; online.setEditing(false); online.leave(); show("s-mode"); });
    return;
  }
  if (!S.inGame) { stopTimer(); renderProfile(); return show("s-profile"); } // hors partie : le profil
  S.resume = !!S.tid; stopTimer();
  ask("Quitter la partie ?", "Êtes-vous sûr ? La partie en cours sera perdue.", "Quitter",
    () => {
      S.inGame = false; S.resume = false; stopTimer(); million.quit();
      if (D.running) { D.running = false; clearInterval(D.tid); const d = getDaily(); if (d) { setDaily({ ...d, done: true }); noteDailyDay(d); } } // défi du jour quitté exprès : terminé
      show("s-mode");
    },
    () => { if (S.resume) resumeTimer(); S.resume = false; });
};
$("cfNo").onclick = () => { $("confirm").hidden = true; const f = S.onNo; S.onYes = S.onNo = null; if (f) f(); };
$("cfYes").onclick = () => { $("confirm").hidden = true; const f = S.onYes; S.onYes = S.onNo = null; if (f) f(); };
$("btnResetLives").onclick = () => ask("Réinitialiser les vies ?", "Toutes les vies de tous les joueurs reviendront à 0.", "Réinitialiser", resetLives);
document.querySelectorAll("[data-back]").forEach((b) => (b.onclick = () => {
  let t = b.dataset.back;
  if (t === "auto") t = S.soloChrono ? "s-sub" : M().online ? "s-roomtype" : M().solo ? "s-mode" : M().teams ? "s-teams" : "s-names";
  if (t === "s-themes" && M().million) t = "s-roomtype"; // le Millionnaire n'a pas d'écran de thèmes
  if (t === "s-lobby") { S.editRoom = false; online.setEditing(false); }
  if (t === "s-mode" && S.menuSec && ["s-count", "s-themes"].includes(curScreen)) t = "s-sub"; // retour à la liste Party / Solo
  if (t === "s-profile") renderProfile(); // retour au Profil (depuis la Boutique ou les Paramètres) : à jour
  if (curScreen === "s-scan" && S.scanFrom) { t = S.scanFrom; if (t === "s-friends") friends.render(); } // le scanner ramène d'où l'on vient
  show(t);
}));
$("btnLogout").onclick = async () => {
  friends.stop(); try { localStorage.removeItem(SESS); } catch {} online.leave(); await logout(); S.uid = null; show("s-login"); };

$("cMinus").onclick = () => setCount(-1);
$("cPlus").onclick = () => setCount(1);
$("btnCount").onclick = () => {
  if (M().million && S.count === 1) { S.slots = [{ name: S.firstName || "Moi", lives: 0, imported: false }]; return startMillion(); } // solo : pas de nom à saisir
  $("btnNames").textContent = M().million ? "Lancer la partie" : M().teams ? "Former les équipes" : "Choisir les thèmes";
  renderSlots(); show("s-names");
};
$("btnNames").onclick = () => {
  const err = validateNames();
  $("namesMsg").textContent = err;
  if (err) return;
  if (M().impostor && S.slots.length < 3) { $("namesMsg").textContent = "L'Imposteur se joue à 3 joueurs ou plus."; return; }
  if (M().million) return startMillion(); // Millionnaire : pas de choix de thèmes
  if (M().teams) { renderTeams(); return show("s-teams"); } // Équipes : on forme les équipes
  renderThemes(); show("s-themes");
};
$("btnThemes").onclick = () => {
  if (!S.rand && !S.themes.size) { $("setupMsg").textContent = "Choisissez au moins un thème, ou « Aléatoire »."; return; }
  $("setupMsg").textContent = "";
  S.active = S.rand ? new Set(THEMES) : new Set(S.themes);
  if (M().chrono || M().royale || M().duel) return submitRoom(); // Chrono (60 s) et Dernier Debout (15 s, 12 s…) : temps imposé, on crée la salle tout de suite
  $("btnTime").textContent = M().joker || M().online ? "Valider" : "Lancer la partie";
  renderTime(); show("s-time");
};
$("btnTime").onclick = () => {
  if (M().online && (M().million || M().teams || M().bets || M().impostor)) return submitRoom(); // Millionnaire, Équipes, Parieurs et Imposteur en ligne : pas de vies
  if (M().online) { renderLivesOpt(); show("s-jokers"); }
  else if (M().joker) { renderJokers(); show("s-jokers"); }
  else startGame();
};
function submitRoom() {
  const cfg = { auto: S.cfg.auto, kind: M().chrono ? "chrono" : M().million ? "million" : M().teams ? "equipes" : M().bets ? "parieurs" : M().impostor ? "imposteur" : M().royale ? "royale" : M().duel ? "duel" : "survie", themes: [...S.active].filter((t) => !M().impostor || t !== SONG_THEME), time: S.cfg.time, lives: S.cfg.lives };
  if (S.editRoom) { S.editRoom = false; online.setEditing(false); online.config(cfg); } // l'hôte modifie la salle
  else online.create(S.soloChrono ? { ...cfg, solo: true } : cfg); // Chrono seul : lancé tout de suite
}
$("btnStart").onclick = () => (M().online ? submitRoom() : startGame());
$("btnRetry").onclick = () => (M().online ? online.retry() : M().million ? million.retry() : M().impostor ? impRound() : loadAndPlay());
$("btnSwap").onclick = () => { if (S.locked || !S.inGame) return; stopTimer(); loadAndPlay(); };
$("btnStopTimer").onclick = stopTimer;
$("card").onclick = flip;
$("card").addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), flip()));
$("btnJoker").onclick = useJoker;
$("btnNext").onclick = () => {
  if (M().online) { $("dockNext").hidden = true; online.next(); return; } $("dockNext").hidden = true; $("mcq").hidden = true; finish(S.pending, true); };
$("btnOk").onclick = () => judge(true);
$("btnKo").onclick = () => judge(false);
$("btnUseLife").onclick = () => revive(true);
$("btnDie").onclick = () => revive(false);
$("btnUp").onclick = () => (M().online ? online.level(true) : chooseLevel(true));
$("btnStay").onclick = () => (M().online ? online.level(false) : chooseLevel(false));
$("btnAgain").onclick = () => {
  if (M().online && S.soloChrono) { online.leave(); return submitRoom(); } // Chrono seul : on relance directement
  if (M().online) return online.again();
  if (M().million && S.mSolo) return millionSolo(); // Millionnaire seul : on relance directement
  if (M().solo) { renderThemes(); show("s-themes"); } else show("s-count"); // même mode, sans lancer la partie
};

// pendant la saisie d'un nom, les boutons fixes du bas sont masqués
document.addEventListener("focusin", (e) => { if (e.target.matches && e.target.matches("input[type=text]")) document.body.classList.add("typing"); });
document.addEventListener("focusout", () => document.body.classList.remove("typing"));

// jeu en ligne : créer / rejoindre une salle
// créer un salon : on choisit d'abord son mode (Survie ou Chrono)
const ROOM_MODES = [
  ["online", "survie", "Survie", "Chacun son tour, avec des vies. Le dernier en vie gagne."],
  ["chrono", "chrono", "Chrono 60 s", "Tout le monde joue en même temps pendant 60 secondes. Le plus de points gagne."],
  ["oteams", "teams", "Équipes", "Les joueurs sont répartis en équipes qui jouent chacune leur tour. Les points s'additionnent."],
  ["obets", "bets", "Les Parieurs", "Chacun répond à son tour. Avant sa réponse, les autres parient leurs jetons : réussira-t-il ou non ? Le plus riche gagne."],
  ["oduel", "duel", "Le Duel", "À deux : une corde au milieu, chaque bonne réponse la tire vers soi. Chacun ses questions, la vitesse compte. Le premier qui l'amène de son côté gagne, en 2 minutes."],
  ["oroyale", "royale", "Le Dernier Debout", "Jusqu'à 20 joueurs : tout le monde répond en même temps, une erreur et c'est fini. Le temps fond à chaque manche (15 s, 12 s, 10 s…). Le dernier debout gagne."],
  ["oimp", "impostor", "L'Imposteur", "Tout le monde voit la bonne réponse sauf l'imposteur, qui doit faire semblant en discutant. Ensuite, on vote pour le démasquer."],
  ["omillion", "million", "Qui veut gagner des millions", "La même échelle de 15 questions pour tous, chacun avec ses jokers. Celui qui repart avec le plus gagne."]
];
const KIND_MODE = { survie: "online", chrono: "chrono", million: "omillion", equipes: "oteams", parieurs: "obets", imposteur: "oimp", royale: "oroyale", duel: "oduel" };
function renderRoomModes(current) {
  const box = $("roomModes");
  box.replaceChildren();
  ROOM_MODES.forEach(([id, look, name, desc], i) => {
    const b = document.createElement("button");
    b.className = "mode"; b.dataset.m = look; b.style.animationDelay = `${i * 70}ms`;
    const t = document.createElement("strong"); t.textContent = name + (current === id ? " · actuel" : "");
    const d = document.createElement("span"); d.textContent = desc;
    b.append(t, d);
    b.onclick = () => {
      const was = S.mode;
      S.mode = id;
      if (!S.editRoom || was !== id) S.cfg.time = M().time; // on garde le temps choisi si l'hôte ne change pas de mode
      if (M().million) { S.active = new Set(THEMES.filter((t) => t !== SONG_THEME)); $("btnTime").textContent = "Valider"; renderTime(); return show("s-time"); } // pas de choix de thèmes
      renderThemes(); show("s-themes");
    };
    box.append(b);
  });
}
$("btnRoomCreate").onclick = () => { S.soloChrono = false; S.editRoom = false; online.setEditing(false); renderRoomModes(null); show("s-roomtype"); };
$("btnRoomTypeBack").onclick = () => {
  if (S.editRoom) { S.editRoom = false; online.setEditing(false); show("s-lobby"); } // retour au salon sans rien changer
  else show("s-online");
};
$("btnLobbyEdit").onclick = () => {
  const c = online.cfg();
  if (!c) return;
  S.editRoom = true; online.setEditing(true);
  S.mode = KIND_MODE[c.kind] || "online"; // garde le type de salle, même si l'hôte a changé
  S.rand = c.themes.length >= THEMES.length;
  S.themes = new Set(S.rand ? [] : c.themes.filter((t) => THEMES.includes(t)));
  S.cfg.time = c.time; S.cfg.lives = c.lives; S.cfg.auto = !!c.auto;
  renderRoomModes(S.mode); show("s-roomtype"); // l'hôte peut aussi changer le mode du salon
};
$("btnRoomJoin").onclick = () => online.join($("roomCode").value);
// ordinateur branché sur la télé : ouvre le mode télé (salon caché + QR code) sur cet écran
$("btnTvHere").onclick = () => { location.href = "tv.html"; };
// scanner le QR code de la télé depuis l'appli : connexion directe au salon télé
// le même scanner sert depuis « En ligne » et depuis le Profil (on revient là d'où l'on vient)
function openScanner(from) {
  S.scanFrom = from;
  $("scanMsg").textContent = "";
  show("s-scan");
  const onCode = (text) => {
    const ami = friendCodeFrom(text);
    if (ami) { stopScan(); openFriends(); friends.addByCode(ami); return; } // QR code d'un ami
    const code = tvCodeFrom(text);
    if (!code) { $("scanMsg").textContent = "Ce QR code n'est ni un salon ni un ami Quizly."; return setTimeout(() => curScreen === "s-scan" && startScan($("scanVideo"), onCode, onErr), 1500); }
    stopScan();
    $("scanMsg").textContent = "Connexion à la télé…";
    online.join(code);
  };
  const onErr = (msg) => ($("scanMsg").textContent = msg);
  startScan($("scanVideo"), onCode, onErr);
}
$("btnScan").onclick = () => openScanner("s-online");
$("btnScanFriend").onclick = () => openScanner("s-friends");
$("roomCode").addEventListener("input", (e) => (e.target.value = e.target.value.toUpperCase()));
$("roomCode").addEventListener("keydown", (e) => e.key === "Enter" && online.join($("roomCode").value));

$("btnAllThemes").onclick = () => { S.allThemes = !S.allThemes; renderProfile(); };

/* ---------- personnaliser son nom et sa photo ---------- */
function saveMe(o) {
  try { localStorage.setItem(meKey(), JSON.stringify(o)); } catch {}
  setUser(S.gName, S.gPhoto); cosm.apply(); // le cadre suit le nouveau nom renderProfile(); friends.syncRecords(); // vos amis voient le nouveau nom et la nouvelle photo
}
// réduit la photo choisie : petit carré JPEG (assez léger pour le cloud et le jeu en ligne)
function shrinkPhoto(file) {
  return new Promise((ok, ko) => {
    const im = new Image(), url = URL.createObjectURL(file);
    im.onload = () => {
      const c = document.createElement("canvas"), n = 128, s = Math.min(im.width, im.height);
      c.width = c.height = n;
      c.getContext("2d").drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, n, n);
      URL.revokeObjectURL(url);
      let q = 0.8, out = c.toDataURL("image/jpeg", q);
      while (out.length > 11500 && q > 0.3) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
      ok(out);
    };
    im.onerror = () => { URL.revokeObjectURL(url); ko(new Error("image")); };
    im.src = url;
  });
}
$("mePhoto").onchange = async (e) => {
  const f = e.target.files && e.target.files[0]; e.target.value = "";
  if (!f) return;
  try { saveMe({ ...getMe(), photo: await shrinkPhoto(f) }); } catch { $("meMsg").textContent = "Cette image ne peut pas être utilisée."; }
};
$("btnEditName").onclick = () => { $("meEdit").hidden = !$("meEdit").hidden; $("meName").value = S.firstName || ""; $("meMsg").textContent = ""; if (!$("meEdit").hidden) $("meName").focus(); };
$("btnMeSave").onclick = () => {
  const n = $("meName").value.trim().replace(/\s+/g, " ");
  if (n.length < 2) { $("meMsg").textContent = "Au moins 2 caractères."; return; }
  saveMe({ ...getMe(), name: n });
};
$("meName").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("btnMeSave").click(); } });
$("btnMeReset").onclick = () => saveMe({}); // revient au nom et à la photo de Google

/* ---------- mode développeur : envoyer une annonce à tout le monde ---------- */
const ADMIN = "quizly:adminKey";
const DEV_UID = "uIBgcwCCESgPLZdqC2wG14enXJk2"; // le compte du développeur : le seul à voir le mode développeur
function adminUI() {
  const dev = S.uid === DEV_UID, key = dev && localStorage.getItem(ADMIN);
  $("adminBox").hidden = !key; $("btnDev").hidden = !dev || !!key;
  if (key) pushStatus(key);
  $("adminUid").textContent = S.uid || "";
}
// combien d'appareils le serveur retrouve après une mise à jour (il redémarre et oublie ceux en mémoire)
function pushStatus(key) {
  fetch("/api/push/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) })
    .then((r) => r.json()).then((d) => {
      if (!d.ok) return;
      $("adminPush").textContent = !d.push ? "Notifications : clés VAPID absentes sur Render."
        : d.fsErr ? `Notifications : le serveur ne peut pas lire les appareils dans Firestore (${d.fsErr}). Après chaque mise à jour, il ne retrouve personne. Ajoutez cette règle dans Firebase › Firestore › Règles :`
        : `Notifications : ${d.firestore} appareil${d.firestore > 1 ? "s" : ""} enregistré${d.firestore > 1 ? "s" : ""} dans Firestore, retrouvé${d.firestore > 1 ? "s" : ""} même après une mise à jour.`;
      $("adminRule").hidden = !d.fsErr;
    }).catch(() => {});
}
$("btnCopyUid").onclick = () => { try { navigator.clipboard.writeText(S.uid); $("adminMsg").textContent = "Identifiant copié : collez-le dans la règle Firestore."; } catch {} };
$("btnDev").onclick = () => {
  const key = prompt("Clé développeur (ADMIN_KEY réglée sur Render) :");
  if (!key) return;
  fetch("/api/admin/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) })
    .then((r) => r.json()).then((d) => { if (d.ok) { localStorage.setItem(ADMIN, key); adminUI(); } else alert("Clé incorrecte."); })
    .catch(() => alert("Serveur injoignable."));
};
$("btnAdminSend").onclick = async () => {
  const title = $("adminTitle").value.trim(), text = $("adminText").value.trim();
  if (title.length < 2 && text.length < 3) { $("adminMsg").textContent = "Écrivez un titre et une description."; return; }
  $("btnAdminSend").disabled = true; $("adminMsg").textContent = "Envoi…";
  try {
    const { saved, sent, ok, devices, fsErr, why, read } = await friends.announce(title, text, localStorage.getItem(ADMIN));
    let push = ok ? `Notification envoyée à ${sent} appareil${sent > 1 ? "s" : ""} sur ${devices}.` : "Notification non envoyée : clé développeur refusée par le serveur.";
    if (ok && why) push += ` ${why}`;
    else if (ok && !devices) push += fsErr ? ` Firestore refuse la lecture des appareils (${fsErr}) : ajoutez la règle « pushsubs » (voir Mode développeur).` : " Aucun appareil inscrit pour l'instant.";
    const bell = saved ? " Annonce ajoutée dans la cloche de tout le monde." : " Mais pas ajoutée dans la cloche : la règle « announces » de Firestore refuse votre identifiant.";
    $("adminMsg").textContent = push + bell;
    if (saved || ok) { $("adminText").value = ""; $("adminTitle").value = ""; }
  } catch { $("adminMsg").textContent = "Échec de l'envoi."; }
  $("btnAdminSend").disabled = false;
};

/* ---------- Défi du jour : 10 questions, les mêmes pour tout le monde, une seule tentative ---------- */
// fonctions (et non des constantes) : le menu les appelle dès le démarrage, avant que la suite du fichier soit lue
function dayKey() { return `quizly:${S.uid}:daily`; }
function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(Date.now()); }
function getDaily() { try { const d = JSON.parse(localStorage.getItem(dayKey()) || "null"); return d && d.day === today() ? d : null; } catch { return null; } }
function setDaily(d) { try { localStorage.setItem(dayKey(), JSON.stringify(d)); } catch {} }
function dailyCard() {
  const d = getDaily();
  $("btnDaily").hidden = !!(d && d.done !== false) || !S.uid; // au menu tant que le défi du jour n'est pas fait, puis il disparaît
  $("btnDaily").classList.toggle("done", !!d);
  $("dailyTitle").textContent = d ? `Fait : ${d.score} / 10` : "10 questions, une seule tentative";
  $("dailySub").textContent = d ? "Voir le classement du jour" : "Les mêmes pour tout le monde. Battez vos amis.";
  const sk = dailyStreak();
  $("dailyStreak").hidden = sk < 2;
  $("dailyStreak").textContent = `Série : ${sk} jours`;
}
const D = { set: null, i: 0, score: 0, ms: 0, t0: 0, tid: null, lock: false };
const DAILY_SEC = 20;
async function openDaily() {
  if (D.running && S.inGame) return show("s-daily"); // déjà en cours (ex. deuxième appel au lancement) : on ne l'arrête surtout pas
  if (D.opening) return; // déjà en train de se charger
  const d = getDaily();
  if (d && (d.done !== false || d.i == null)) return dailyEnd(); // déjà fait aujourd'hui : le résultat et le classement
  D.opening = true;
  $("loadText").textContent = "Préparation du défi…"; $("loadErr").hidden = true; show("s-load");
  try { D.set = await (await fetch("/api/daily")).json(); }
  catch { D.opening = false; $("loadText").textContent = "Impossible de charger le défi du jour."; $("loadErr").hidden = false; return; }
  D.opening = false;
  if (!D.set.questions || D.set.questions.length < 10) { $("loadText").textContent = "Le défi du jour n'est pas prêt."; return; }
  if (d && d.done === false) { // commencé puis interrompu (appli rechargée, fermée…) : on reprend là où on en était
    Object.assign(D, { i: d.i, score: d.score || 0, ms: d.ms || 0 });
    if (d.shown) { D.i++; D.ms += DAILY_SEC * 1000; } // une question vue mais pas répondue compte comme ratée (pas de triche)
    if (D.i >= 10) { setDaily({ ...d, i: 10, shown: false, done: true }); return dailyEnd(true); }
  } else {
    Object.assign(D, { i: 0, score: 0, ms: 0 });
    statGame("daily");
  }
  setDaily({ day: D.set.day, score: D.score, ms: D.ms, done: false, i: D.i, shown: false }); // une seule tentative
  D.running = true; S.inGame = true;
  $("dPlay").hidden = false; $("dEnd").hidden = true;
  dailyQ();
}
function dailyQ() {
  const q = D.set.questions[D.i];
  D.lock = false;
  setDaily({ day: D.set.day, score: D.score, ms: D.ms, done: false, i: D.i, shown: true }); // vue : si on quitte maintenant, elle compte comme ratée
  $("dStep").textContent = `Question ${D.i + 1} / 10`;
  $("dScore").textContent = `${D.score} bonne${D.score > 1 ? "s" : ""}`;
  $("dTag").textContent = `${q.t} · ${LEVELS[q.d]}`;
  $("dText").textContent = q.q;
  const im = $("dImg");
  if (q.img) { im.hidden = false; im.onerror = () => (im.hidden = true); im.src = q.img; } else { im.hidden = true; im.removeAttribute("src"); }
  const box = $("dOpts");
  box.replaceChildren(...q.o.map((o) => { const b = document.createElement("button"); b.className = "btn white"; b.textContent = o; b.onclick = () => dailyPick(b, o); return b; }));
  box.classList.toggle("long", q.o.some((o) => o.length > 24));
  show("s-daily");
  // minuteur de 20 s
  const bar = $("dBar"); bar.style.setProperty("--dur", `${DAILY_SEC}s`); bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = "";
  D.t0 = Date.now(); clearInterval(D.tid);
  const tick = () => { const s = Math.max(0, DAILY_SEC - Math.floor((Date.now() - D.t0) / 1000)); $("dClock").textContent = s; if (s <= 0) dailyPick(null, null); };
  tick(); D.tid = setInterval(tick, 250);
}
function dailyPick(btn, o) {
  if (!S.inGame) { clearInterval(D.tid); return; } // défi quitté
  if (D.lock) return;
  D.lock = true; clearInterval(D.tid); $("dBar").style.animationPlayState = "paused";
  const q = D.set.questions[D.i], ok = o === q.a;
  D.ms += Math.min(DAILY_SEC * 1000, Date.now() - D.t0);
  if (ok) D.score++;
  statAnswer(q.t, ok);
  [...$("dOpts").children].forEach((b) => { b.disabled = true; if (b.textContent === q.a) b.classList.add("right"); else if (b === btn) b.classList.add("wrong"); });
  flash(ok ? "ok" : "ko");
  setDaily({ day: D.set.day, score: D.score, ms: D.ms, done: D.i === 9, i: D.i + 1, shown: false });
  setTimeout(() => { if (!S.inGame) return; D.i++; if (D.i < 10) dailyQ(); else dailyEnd(true); }, 1200);
}
function dailyEnd(fresh) {
  S.inGame = false; D.running = false; clearInterval(D.tid);
  const d = getDaily() || { score: 0, ms: 0 };
  if (d.done === false) setDaily({ ...d, done: true });
  noteDailyDay(d);
  $("dPlay").hidden = true; $("dEnd").hidden = false;
  $("dFinal").textContent = d.score;
  const sk = dailyStreak();
  $("dNote").textContent = `Temps total : ${Math.round(d.ms / 1000)} s · série : ${sk} jour${sk > 1 ? "s" : ""} · revenez demain.`;
  friends.syncRecords(); // votre résultat devient visible par vos amis
  D.scope = D.scope || "friends";
  renderDailyBoard(d);
  show("s-daily");
  if (fresh && d.score >= 7) confetti();
}
$("btnDaily").onclick = openDaily;
$("btnDailyBack").onclick = openQuests;


/* ---------- Paramètres (gardés sur cet appareil) ---------- */
const SETKEY = "quizly:settings";
const DEFAULTS = { autoplay: true, vibrate: true, calm: false, auto: true, dark: false };
function settings() { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETKEY) || "{}") }; } catch { return { ...DEFAULTS }; } }
function setting(k) { return settings()[k]; }
function saveSetting(k, v) { const s2 = settings(); s2[k] = v; try { localStorage.setItem(SETKEY, JSON.stringify(s2)); } catch {} applySettings(); }
function applySettings() {
  if (setting("dark")) document.documentElement.dataset.mode = "dark"; else delete document.documentElement.dataset.mode; // mode sombre
  document.body.classList.toggle("calm", !!setting("calm"));
  S.cfg.auto = !!setting("auto"); // difficulté proposée par défaut avant chaque partie
}
function renderSettings() {
  const st = settings();
  // compte
  $("setAv").replaceChildren(avatarEl(S.firstName, S.photo, true));
  $("setName").textContent = S.firstName || "Joueur";
  const cs = cloudState();
  $("setAccount").textContent = `Compte Google · ${cs === "cloud" ? "sauvegardé" : cs === "error" ? "hors ligne" : "connexion…"}`;
  // interrupteurs
  document.querySelectorAll("#s-settings .tgl[data-set]").forEach((c) => { c.checked = !!st[c.dataset.set]; c.onchange = () => saveSetting(c.dataset.set, c.checked); });
  // difficulté par défaut
  document.querySelectorAll("#setDiff button").forEach((b) => {
    b.setAttribute("aria-pressed", String(!!st.auto === (b.dataset.v === "1")));
    b.onclick = () => { saveSetting("auto", b.dataset.v === "1"); renderSettings(); };
  });
  $("setDiffRow").querySelector("small").textContent = st.auto ? "Évolutive : elle monte toute seule à chaque tour." : "Au choix : on vous demande à chaque tour.";
  // vibrations : seulement si l'appareil sait vibrer (pas l'iPhone)
  const canVib = "vibrate" in navigator || !!hapSw; // iPhone : à partir d'iOS 18
  $("setVibRow").classList.toggle("off", !canVib);
  $("setVibRow").querySelector(".tgl").disabled = !canVib;
  $("setVibTxt").textContent = canVib ? "Une petite vibration à chaque réponse et en changeant d'onglet." : "Non disponible sur cet appareil.";
  // notifications
  // notifications : un interrupteur (coupées sur cet appareil = plus rien n'arrive, même appli fermée)
  const p = pushState(), on = p === "granted" && !pushMuted();
  $("setPushTxt").textContent = p === "denied" ? "Bloquées : autorisez-les dans les réglages du téléphone, pour Quizly." : p === "unsupported" ? "Sur iPhone, installez d'abord Quizly sur l'écran d'accueil." : on ? "Amis, invitations, défi de 10 h et annonces." : p === "granted" ? "Désactivées sur cet appareil." : "Soyez prévenu même appli fermée.";
  $("setPushTgl").hidden = p === "denied" || p === "unsupported";
  $("setPushTgl").checked = on;
  $("setPushChip").hidden = p !== "denied";
  $("setPushChip").textContent = "Bloquées"; $("setPushChip").className = "schip no";
  // questions vues
  const n = getRecent().arr.length;
  $("setSeenTxt").textContent = n ? `${n} question${n > 1 ? "s" : ""} évitée${n > 1 ? "s" : ""} pour vous proposer du neuf.` : "Aucune pour l'instant.";
  $("setClearSeen").disabled = !n;
  $("setVersion").textContent = `Quizly v${VERSION} · par YoskanGame`;
}
$("setEditMe").onclick = () => { renderProfile(); show("s-profile"); $("btnEditName").click(); };
$("setPushTgl").onchange = async () => {
  const t = $("setPushTgl"); t.disabled = true;
  if (t.checked) await askPush();
  else { const ep = await disablePush(S.uid); if (ep) friends.removeSub(ep); }
  t.disabled = false; renderSettings(); menuPushUI();
};
$("setFabReset").onclick = () => {
  try { localStorage.removeItem("quizly:fabPos"); } catch {}
  const f = $("reactFab"); f.style.left = f.style.top = f.style.right = "";
  $("setFabReset").textContent = "Replacée"; setTimeout(() => ($("setFabReset").textContent = "Replacer"), 1500);
};
$("setClearSeen").onclick = () => ask("Oublier les questions déjà vues ?", "Des questions de vos anciennes parties pourront revenir.", "Oublier", () => {
  try { localStorage.removeItem(`quizly:${S.uid}:recent`); localStorage.removeItem(`quizly:${S.uid}:history`); } catch {}
  recentCache = null; renderSettings(); show("s-settings");
});
// se déconnecter : avec confirmation
{ const doLogout = $("btnLogout").onclick; $("btnLogout").onclick = () => ask("Se déconnecter ?", "Vous retrouverez tout en vous reconnectant avec Google.", "Se déconnecter", doLogout); }
applySettings();

/* ---------- tirer pour rafraîchir, façon Snapchat ----------
   - seulement si la zone du contenu est tout en haut, et pour un geste vraiment vertical ;
   - rien ne bouge avant 24 px (un petit défilement ne déclenche rien) ;
   - le contenu descend avec le doigt (résistance), un jeton se remplit au-dessus ;
   - en relâchant au-delà du seuil : seul l'onglet affiché se met à jour (pas toute l'appli). */
(() => {
  const main = $("main"), ptr = $("ptr"), arc = ptr.querySelector("circle.arc"), LEN = 88, DEAD = 24, NEED = 72;
  let st = null, busy = false;
  const can = () => scrollY <= 0 && !busy && !PLAYING.includes(curScreen) && !["s-lobby", "s-scan", "s-daily"].includes(curScreen);
  const set = (d, p) => {
    main.style.setProperty("--pull", `${d}px`);
    ptr.style.opacity = Math.min(1, d / 40);
    arc.style.strokeDashoffset = LEN * (1 - p);
    ptr.classList.toggle("ready", p >= 1);
  };
  // le suivi du doigt n'est branché qu'en haut de page : ailleurs le défilement reste entièrement fluide
  addEventListener("touchstart", (e) => {
    st = can() && e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, on: false, dy: 0 } : null;
    if (st) addEventListener("touchmove", move, { passive: false });
  }, { passive: true });
  function move(e) {
    if (!st) return;
    const dx = e.touches[0].clientX - st.x, dy = e.touches[0].clientY - st.y;
    if (!st.on) {
      if (dy < DEAD || Math.abs(dx) > dy || scrollY > 0) { if (dy < -4 || Math.abs(dx) > 12) st = null; return; } // pas un vrai tirage
      st.on = true; main.classList.add("pulling");
    }
    st.dy = dy - DEAD;
    const d = 110 * (1 - Math.exp(-st.dy / 110)); // le contenu suit le doigt, de plus en plus difficilement
    set(d, Math.min(1, st.dy / NEED));
    if (e.cancelable) e.preventDefault();
  }
  const end = async () => {
    removeEventListener("touchmove", move, { passive: false });
    if (!st || !st.on) { st = null; return; }
    const go = st.dy >= NEED; st = null;
    main.classList.remove("pulling");
    if (!go) { set(0, 0); return; }
    busy = true; ptr.classList.add("spin"); set(56, 0.75);
    const t0 = Date.now();
    try { await refreshScreen(); } catch {}
    setTimeout(() => { ptr.classList.remove("spin"); set(0, 0); busy = false; }, Math.max(0, 600 - (Date.now() - t0)));
  };
  addEventListener("touchend", end, { passive: true });
  addEventListener("touchcancel", end, { passive: true });
})();
// met à jour seulement l'onglet affiché
async function refreshScreen() {
  if (S.uid) await startCloud(S.uid).catch(() => {});
  switch (curScreen) {
    case "s-mode": renderModes(); dailyCard(); menuPushUI(); break;
    case "s-profile": renderProfile(); break;
    case "s-friends": await friends.refresh(); break;
    case "s-notifs": friends.renderNotifs(); break;
    case "s-settings": renderSettings(); break;
    default: break;
  }
}

/* ---------- Série du Défi du jour ---------- */
function dHistKey() { return `quizly:${S.uid}:dailyHist`; }
function dailyDays() { try { return JSON.parse(localStorage.getItem(dHistKey()) || "[]"); } catch { return []; } }
function noteDailyDay(d) {
  const days = dailyDays();
  if (!days.includes(d.day)) { // une seule fois par jour
    days.push(d.day); try { localStorage.setItem(dHistKey(), JSON.stringify(days.slice(-120))); } catch {}
    cosm.earn(10, "défi du jour");
    quests.tick("daily");
  }
  quests.best("dailyScore", d.score || 0);
  friends.dailyDone(d.day, d); // pour le classement mondial du défi
  checkAch();
}
// jours consécutifs, jusqu'à aujourd'hui (ou hier si le défi du jour n'est pas encore fait)
function dailyStreak() {
  const days = new Set(dailyDays());
  const dayOf = (offset) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(Date.now() - offset * 86400000);
  let k = days.has(dayOf(0)) ? 0 : 1, n = 0;
  while (days.has(dayOf(k))) { n++; k++; }
  return n;
}

/* ---------- Succès ---------- */
// Succès améliorables : chaque famille a plusieurs niveaux (bronze, argent, or, platine, diamant…).
// Chaque niveau reste un succès à part (mêmes id qu'avant pour les anciens : rien n'est perdu, 25 Q-Bucks par niveau).
// famille : [titre, couleur, valeur, comment (seuil), pastille (seuil), niveaux : [id, seuil, nom]]
const k1000 = (n) => (n >= 1000000 ? `${n / 1000000}M` : n >= 1000 ? `${n / 1000}k` : `${n}`);
const ACH_FAM = [
  ["Joueur", "sun", (x) => x.games, (n) => `Jouer ${n} partie${n > 1 ? "s" : ""}`, k1000,
    [["first", 1, "Premiers pas"], ["play10", 10, "Amateur"], ["regular", 25, "Habitué"], ["addict", 100, "Accro"], ["play250", 250, "Passionné"], ["play500", 500, "Inépuisable"]]],
  ["Savant", "sky", (x) => x.good, (n) => `${n} bonnes réponses`, k1000,
    [["good50", 50, "Esprit vif"], ["brain", 100, "Cerveau"], ["encyclo", 500, "Encyclopédie"], ["good1000", 1000, "Puits de science"], ["good2500", 2500, "Génie universel"]]],
  ["Série", "coral", (x) => x.bestRun, (n) => `${n} bonnes réponses d'affilée`, (n) => `${n}×`,
    [["run5", 5, "En forme"], ["run10", 10, "Inarrêtable"], ["run25", 25, "Machine"], ["run50", 50, "Imbattable"]]],
  ["Explorateur", "mint", (x) => x.themes, (n) => `Jouer ${n} thèmes différents`, k1000,
    [["themes5", 5, "Touche-à-tout"], ["themes", 10, "Curieux"], ["themes20", 20, "Explorateur"], ["themes35", 35, "Globe-trotter"]]],
  ["Solo", "sky", (x) => x.best2, (n) => `Record Solo de ${n} points`, k1000,
    [["solo100", 100, "Résistant"], ["solo200", 200, "Survivant"], ["solo500", 500, "Increvable"], ["solo1000", 1000, "Immortel"]]],
  ["Chrono", "peach", (x) => x.bestChrono, (n) => `Record Chrono de ${n} points`, k1000,
    [["chrono150", 150, "Rapide"], ["chrono300", 300, "Éclair"], ["chrono500", 500, "Supersonique"]]],
  ["Millionnaire", "sun", (x) => x.bestMillion, (n) => `Gagner ${euros(n)} au Millionnaire`, k1000,
    [["mil1500", 1500, "Premier palier"], ["safe", 48000, "Palier en poche"], ["million", 1000000, "Millionnaire"]]],
  ["Régularité", "coral", (x) => x.streak, (n) => `${n} défis du jour d'affilée`, (n) => `${n}j`,
    [["streak3", 3, "Assidu"], ["streak7", 7, "Régulier"], ["streak30", 30, "Infatigable"]]],
  ["Sans faute", "mint", (x) => (x.perfect ? 1 : 0), () => "10 / 10 au Défi du jour", () => "10",
    [["perfect", 1, "Sans faute"]]],
  ["En ligne", "peach", (x) => x.onlineGames, (n) => `${n} parties en ligne`, k1000,
    [["online1", 1, "Premier salon"], ["online", 10, "Connecté"], ["online50", 50, "Habitué du salon"], ["online100", 100, "Star du réseau"]]],
  ["Sociable", "mint", (x) => x.friends, (n) => `Avoir ${n} ami${n > 1 ? "s" : ""}`, k1000,
    [["friends1", 1, "Premier ami"], ["social", 5, "Sociable"], ["friends10", 10, "Populaire"], ["friends25", 25, "Célébrité"]]],
  // 2.27 : nouvelles familles
  ["Fidèle", "sky", (x) => x.dailies, (n) => `Faire ${n} défi${n > 1 ? "s" : ""} du jour`, k1000,
    [["daily1", 1, "Premier défi"], ["daily10", 10, "Fidèle"], ["daily50", 50, "Pilier"], ["daily100", 100, "Monument"], ["daily365", 365, "Une année entière"]]],
  ["Party", "coral", (x) => x.party, (n) => `${n} parties Party sur un téléphone`, k1000,
    [["party5", 5, "Animateur"], ["party25", 25, "Roi de la soirée"], ["party100", 100, "Légende des soirées"]]],
  ["Comédien", "coral", (x) => x.imp, (n) => `Jouer ${n} partie${n > 1 ? "s" : ""} de L'Imposteur`, k1000,
    [["imp1", 1, "Suspect"], ["imp10", 10, "Comédien"], ["imp50", 50, "Maître du bluff"]]],
  ["Flambeur", "peach", (x) => x.bets, (n) => `Jouer ${n} partie${n > 1 ? "s" : ""} des Parieurs`, k1000,
    [["bets1", 1, "Petit joueur"], ["bets10", 10, "Flambeur"], ["bets50", 50, "Croupier"]]],
  ["Plateau télé", "sun", (x) => x.mill, (n) => `${n} parties de Qui veut gagner des millions`, k1000,
    [["mill5", 5, "Candidat"], ["mill25", 25, "Habitué du plateau"], ["mill100", 100, "Star du jeu"]]],
  ["Spécialiste", "mint", (x) => x.themeBest, (n) => `${n} bonnes réponses dans un même thème`, k1000,
    [["spec25", 25, "Connaisseur"], ["spec100", 100, "Spécialiste"], ["spec250", 250, "Référence"], ["spec500", 500, "Sommité"]]],
  ["Précision", "sky", (x) => x.pct, (n) => `${n} % de bonnes réponses (après 100 questions)`, (n) => `${n}%`,
    [["pct60", 60, "Fiable"], ["pct75", 75, "Tireur d'élite"], ["pct90", 90, "Infaillible"]]],
  ["Collectionneur", "peach", (x) => x.owned, (n) => `Acheter ${n} article${n > 1 ? "s" : ""} dans la Boutique`, k1000,
    [["own1", 1, "Premier achat"], ["own10", 10, "Collectionneur"], ["own30", 30, "Garde-robe"], ["own60", 60, "Musée"]]],
  ["Fortune", "sun", (x) => x.coins, (n) => `Avoir ${n} Q-Bucks`, k1000,
    [["coins500", 500, "Économe"], ["coins2000", 2000, "Riche"], ["coins5000", 5000, "Fortuné"]]],
  ["Chasseur", "mint", (x) => x.achs, (n) => `Débloquer ${n} succès`, k1000,
    [["ach10", 10, "Chasseur de succès"], ["ach30", 30, "Trophées"], ["ach60", 60, "Vitrine pleine"], ["ach70", 70, "Platine"]]]
];
// la liste à plat de tous les niveaux : [id, titre, comment, pastille, couleur, condition]
const ACH = ACH_FAM.flatMap(([, color, val, how, pin, tiers]) => tiers.map(([id, n, name]) => [id, name, how(n), pin(n), color, (x) => val(x) >= n]));
const TIER_NAMES = ["Bronze", "Argent", "Or", "Platine", "Diamant", "Légende"];
const achKey = () => `quizly:${S.uid}:ach`;
function getAch() { try { return JSON.parse(localStorage.getItem(achKey()) || "{}"); } catch { return {}; } }
function achFacts() {
  const st = getStats(), t = Object.values(st.themes || {}), b = (k) => { try { return +localStorage.getItem(`quizly:${S.uid}:${k}`) || 0; } catch { return 0; } };
  const g = st.games || {}, d = getDaily();
  return {
    games: Object.values(g).reduce((a, v) => a + v, 0), good: t.reduce((a, x) => a + x.ok, 0), themes: Object.keys(st.themes || {}).length,
    bestRun: st.bestRun || 0, best2: b("best2"), bestChrono: b("bestChrono"), bestMillion: b("bestMillion"),
    perfect: !!(d && d.done !== false && d.score === 10) || !!getAch().perfect, streak: dailyStreak(),
    onlineGames: (g.online || 0) + (g.chrono || 0) + (g.omillion || 0) + (g.oteams || 0) + (g.obets || 0) + (g.oimp || 0) + (g.oroyale || 0) + (g.oduel || 0), friends: friends.ready() ? friends.count() : 0,
    // 2.27 : nouvelles familles de succès
    dailies: dailyDays().length, party: (g.classic || 0) + (g.qcm || 0) + (g.teams || 0) + (g.million || 0) + (g.impostor || 0),
    imp: (g.impostor || 0) + (g.oimp || 0), bets: g.obets || 0, mill: (g.million || 0) + (g.omillion || 0),
    themeBest: Math.max(0, ...t.map((x) => x.ok)), // le plus de bonnes réponses dans un même thème
    pct: (() => { const n = t.reduce((a, x) => a + x.n, 0); return n >= 100 ? Math.round((100 * t.reduce((a, x) => a + x.ok, 0)) / n) : 0; })(), // précision, après 100 questions
    owned: cosm.owned(), coins: cosm.coins(), achs: Object.keys(getAch()).length
  };
}
// jetons en cadeau pour ce qui a été fait avant la Boutique : 1 par bonne réponse, 2 par partie, 10 par Défi du jour, 25 par succès
function coinBackpay() {
  if (!S.uid) return;
  try { coinBackpayNow(); } catch (e) { console.warn("Jetons :", e.message); } // ne bloque jamais la suite de la connexion
}
function coinBackpayNow() {
  const x = achFacts();
  const owed = x.good + 2 * x.games + 10 * dailyDays().length + 25 * Object.keys(getAch()).length;
  const gift = cosm.backpay(owed);
  if (gift > 0) setTimeout(() => ask("Cadeau !", `Vous recevez ${gift} Q-Bucks pour vos parties d'avant la Boutique : bonnes réponses, parties, Défis du jour et succès.`, "Merci !", () => {}, false), 600);
}
let achT = null;
function checkAch() { clearTimeout(achT); achT = setTimeout(checkAchNow, 300); } // regroupé : une vérification après une rafale de réponses
function checkAchNow() {
  if (!S.uid) return;
  const have = getAch(), x = achFacts(), fresh = ACH.filter(([id, , , , , ok]) => !have[id] && ok(x));
  if (!fresh.length) return;
  fresh.forEach(([id]) => (have[id] = Date.now()));
  cosm.earn(25 * fresh.length, "succès"); // 25 jetons par succès
  try { localStorage.setItem(achKey(), JSON.stringify(have)); } catch {}
  if (fresh.length > 3) achToast(`${fresh.length} succès débloqués !`); // beaucoup d'un coup (nouveaux niveaux) : une seule annonce
  else fresh.forEach(([, title], i) => setTimeout(() => achToast(title), i * 2200)); // une annonce par succès
  friends.syncRecords(); // vos amis voient vos succès
}
function achToast(title) {
  const el = $("achToast");
  $("achToastName").textContent = title;
  el.hidden = false; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  confetti();
  clearTimeout(el._t); el._t = setTimeout(() => (el.hidden = true), 3200);
}
// la grille des succès (le vôtre ou celui d'un ami) : une carte par famille, avec son niveau (bronze, argent, or…)
// et, pour vous, la progression vers le niveau suivant
function renderAch(box, countEl, owned, facts) {
  const have = new Set(owned || []);
  countEl.textContent = `${ACH.filter(([id]) => have.has(id)).length} / ${ACH.length}`;
  box.replaceChildren(...ACH_FAM.map(([fam, color, val, how, pin, tiers]) => {
    const got = tiers.reduce((g, [id], i) => (have.has(id) ? i + 1 : g), 0), cur = tiers[got - 1], next = tiers[got], max = !next;
    const d = document.createElement("div"); d.className = `ach ${got ? `on ${color} tier${Math.min(got, 6)}` : "off"}${max ? " max" : ""}`;
    const p = document.createElement("span"); p.className = "pin"; p.textContent = got ? pin(cur[1]) : "?";
    const lv = document.createElement("span"); lv.className = "lv"; // le niveau atteint, en étoiles
    lv.textContent = tiers.length > 1 ? tiers.map((_, i) => (i < got ? "★" : "☆")).join("") : "";
    const t = document.createElement("b"); t.textContent = got ? cur[2] : fam;
    const s = document.createElement("small");
    s.textContent = max ? `${TIER_NAMES[Math.min(got, 6) - 1] || ""} · niveau max` : `${got ? `${TIER_NAMES[got - 1]} · ` : ""}Suivant : ${how(next[1]).toLowerCase()}`;
    d.append(p, lv, t, s);
    if (facts && !max) { // la barre vers le niveau suivant (seulement pour vous)
      const v = Math.max(0, val(facts) || 0), from = cur ? cur[1] : 0;
      const bar = document.createElement("span"); bar.className = "achbar";
      const fill = document.createElement("i"); fill.style.width = `${Math.min(100, Math.max(0, (100 * (v - from)) / (next[1] - from)))}%`;
      bar.append(fill);
      const n = document.createElement("small"); n.className = "achn"; n.textContent = `${k1000(Math.min(v, next[1]))} / ${k1000(next[1])}`;
      d.append(bar, n);
    }
    d.title = tiers.map(([, n, name], i) => `${i < got ? "✓" : "·"} ${name} : ${how(n)}`).join("\n");
    return d;
  }));
}
window.__renderAch = renderAch; // utilisé par le profil d'un ami

/* ---------- classement du défi : entre amis ou mondial ---------- */
function rankRow(p, i, txt) {
  const li = document.createElement("li"); li.className = "rk" + (i === 0 ? " first" : "") + (p.you ? " mine" : "");
  const pos = document.createElement("span"); pos.className = "pos"; pos.textContent = i + 1;
  const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = p.you ? `${p.name} (vous)` : p.name;
  if (friends.isChamp(p.you ? "me" : p.uid)) nm.classList.add("champ"); // le champion du Défi du jour
  const st = document.createElement("span"); st.className = "st"; st.textContent = txt;
  li.append(pos, avatarEl(p.name, p.photo), nm, st); return li;
}
// p : « d » (écran du défi) ou « q » (onglet Défis)
async function renderDailyBoard(d, p = "d") {
  const scope = D.scope || "friends", day = today();
  document.querySelectorAll(`#${p}Scope button`).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.s === scope)));
  const fmt = (p) => `${p.daily.score} / 10 · ${Math.round(p.daily.ms / 1000)} s`;
  let list;
  if (scope === "world") {
    $(`${p}Rank`).replaceChildren(Object.assign(document.createElement("p"), { className: "lead small", textContent: "Chargement du classement mondial…" }));
    try { list = await friends.worldDaily(day); } catch { list = []; }
    if (D.scope !== "world") return;
    const i = list.findIndex((p) => p.you);
    $(`${p}MyRank`).textContent = list.length ? (i >= 0 ? `Votre place : ${i + 1}e sur ${list.length} joueur${list.length > 1 ? "s" : ""}` : "Vous n'êtes pas dans les 100 premiers.") : "Personne n'a encore fait le défi aujourd'hui.";
  } else {
    list = friends.ready() ? friends.dailyBoard(day) : [];
    if (!list.length) list = [{ name: S.firstName, photo: S.photo, you: true, daily: d || getDaily() || { score: 0, ms: 0 } }];
    $(`${p}MyRank`).textContent = "";
  }
  list = list.filter((x) => (x.daily && x.daily.score) >= 1); // au moins 1 bonne réponse pour figurer au classement
  $(`${p}Rank`).replaceChildren(...(list.length ? list.map((x, i) => rankRow(x, i, fmt(x))) : [Object.assign(document.createElement("p"), { className: "lead small", textContent: "Personne n'a encore de point au défi aujourd'hui." })]));
}
document.querySelectorAll("#dScope button").forEach((b) => (b.onclick = () => { D.scope = b.dataset.s; renderDailyBoard(getDaily()); }));
document.querySelectorAll("#qScope button").forEach((b) => (b.onclick = () => { D.scope = b.dataset.s; renderDailyBoard(getDaily(), "q"); }));

/* ---------- thèmes personnalisés : n'importe quel sujet, l'IA crée les questions ---------- */
const customKey = () => `quizly:${S.uid}:customThemes`;
function customThemes() { try { return JSON.parse(localStorage.getItem(customKey()) || "[]"); } catch { return []; } }
function saveCustom(list) { try { localStorage.setItem(customKey(), JSON.stringify(list.slice(-12))); } catch {} }
const cleanTheme = (t) => String(t || "").replace(/[,;"«»\n\r<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 50); // pas de virgule : elle séparerait les thèmes
function renderCustom() {
  const box = $("customList");
  box.replaceChildren(...customThemes().map((t) => {
    const c = document.createElement("span"); c.className = "chip custom-chip";
    const b = document.createElement("button"); b.className = "ctog"; b.textContent = t;
    b.setAttribute("aria-pressed", S.themes.has(t));
    b.onclick = () => pickTheme(t);
    const x = document.createElement("button"); x.className = "cdel"; x.textContent = "×"; x.setAttribute("aria-label", `Supprimer le thème ${t}`);
    x.onclick = () => { saveCustom(customThemes().filter((y) => y !== t)); S.themes.delete(t); renderCustom(); };
    c.append(b, x); return c;
  }));
}
function addCustom() {
  const t = cleanTheme($("customIn").value);
  if (t.length < 3) { $("customMsg").textContent = "Écrivez un thème d'au moins 3 lettres."; return; }
  if (THEMES.some((x) => x.toLowerCase() === t.toLowerCase())) { // il existe déjà : on le sélectionne
    const known = THEMES.find((x) => x.toLowerCase() === t.toLowerCase());
    S.rand = false; S.themes.add(known); renderThemes(); $("customMsg").textContent = `« ${known} » existe déjà : il est sélectionné.`; $("customIn").value = ""; return;
  }
  const list = customThemes().filter((x) => x.toLowerCase() !== t.toLowerCase());
  saveCustom([...list, t]); S.rand = false; S.themes.add(t); // ajouté et sélectionné (Aléatoire se décoche)
  $("customIn").value = ""; $("customMsg").textContent = `« ${t} » ajouté : l'IA créera des questions sur ce sujet.`;
  renderCustom(); syncThemes();
}
$("btnCustomAdd").onclick = addCustom;
$("customIn").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } });

/* ---------- cosmétiques : jetons et Boutique ---------- */
const cosm = initCosmetics({
  $, ask, avatarEl, uid: () => S.uid, name: () => S.firstName, photo: () => S.photo,
  dev: () => S.uid === DEV_UID, // le développeur a toute la Boutique
  achs: () => Object.keys(getAch()),
  onChange: () => { if (curScreen === "s-profile") renderProfile(); friends.syncRecords(); } // vos amis voient vos cosmétiques
});
/* ---------- Défis : défi du jour, défis quotidiens et hebdomadaires, la veille ---------- */
const quests = initQuests({ $, uid: () => S.uid, earn: (n, why) => cosm.earn(n, why), onChange: (n) => questBadge(n) });
function questBadge(n) {
  $("questBadge").hidden = !n; $("questBadge").textContent = n > 9 ? "9+" : n;
  // et sur les onglets des Défis : « Du jour » et « Semaine », dès qu'une récompense est à récupérer
  let p = { day: 0, week: 0 }; try { p = quests.parts(); } catch {}
  [["qDayBadge", p.day], ["qWeekBadge", p.week]].forEach(([id, k]) => { $(id).hidden = !k; $(id).textContent = k > 9 ? "9+" : k; });
}
function openQuests() { renderQuestDaily(); quests.render(); qTab(QTAB); questBadge(quests.ready()); show("s-quests"); }
// onglets des Défis : Défi du jour · Du jour · Semaine
let QTAB = "daily";
function qTab(t) {
  QTAB = t;
  [["daily", "qpDaily"], ["day", "qpDay"], ["week", "qpWeek"]].forEach(([k, id]) => ($(id).hidden = k !== t));
  document.querySelectorAll("#qTabs .ftab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
}
document.querySelectorAll("#qTabs .ftab").forEach((b) => (b.onclick = () => qTab(b.dataset.tab)));
function renderQuestDaily() {
  const d = getDaily(), sk = dailyStreak(), box = $("qDaily");
  const done = !!(d && d.done !== false);
  box.hidden = done; $("qRes").hidden = !done;
  if (done) { // déjà fait : le résultat et le classement, directement (comme à la fin du défi)
    $("qFinal").textContent = d.score;
    $("qNote").textContent = `Temps total : ${Math.round((d.ms || 0) / 1000)} s · série : ${sk} jour${sk > 1 ? "s" : ""} · revenez demain.`;
    renderDailyBoard(d, "q");
    return;
  }
  box.className = "qdaily";
  const k = document.createElement("span"); k.className = "dk"; k.textContent = "Défi du jour";
  const t = document.createElement("b"); t.textContent = "10 questions, une seule tentative";
  const sm = document.createElement("small"); sm.textContent = "Les mêmes pour tout le monde. +10 Q-Bucks.";
  const btn = document.createElement("button"); btn.className = "btn sm sun"; btn.textContent = "Jouer"; btn.onclick = openDaily;
  box.replaceChildren(k, t, sm, btn);
}

$("btnCoins").onclick = () => { cosm.render(); show("s-shop"); };

// le champion du Défi du jour vient de changer : les écrans ouverts se mettent à jour
document.addEventListener("quizly:champ", () => {
  if (curScreen === "s-profile") renderProfile();
  else if (curScreen === "s-quests") renderQuestDaily();
  else if (curScreen === "s-daily" && !$("dEnd").hidden) renderDailyBoard(getDaily());
});
// au démarrage : les pastilles des Défis, vos Q-Bucks et vos cosmétiques tout de suite (sans attendre le cloud)
try { questBadge(quests.ready()); } catch {}
try { if (S.uid) { cosm.apply(); userLabel(); } } catch {}
