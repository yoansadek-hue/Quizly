import { THEMES, fetchAI } from "./questions.js";
import { watch, signIn, logout } from "./auth.js";
import { initOnline } from "./online.js";
import { makeLocal, LOCAL_THEMES, SONG_THEME, euros } from "./local.js";
import { millionUI, millionLocal, avatarEl, setAudio } from "./million.js";
import { startScan, stopScan, tvCodeFrom } from "./scan.js";
import { startCloud, cloudState } from "./cloud.js";
import { initFriends, friendCodeFrom } from "./friends.js";
import { enablePush, pushState } from "./push.js";

const VERSION = "2.11.3"; // à mettre à jour à chaque version (voir CHANGELOG.md)

const $ = (id) => document.getElementById(id);
const LEVELS = ["", "Facile", "Moyen", "Difficile", "Expert", "Légende"];
const MODES = {
  online: { name: "En ligne", desc: "Une salle et un code : chacun joue sur son téléphone. Survie, Chrono 60 s ou Qui veut gagner des millions.", qcm: true, time: 30, joker: false, lives: true, online: true },
  classic: { name: "Classique", desc: "Réponse à l'oral, le groupe valide. Carte retournable à volonté, jokers 4 choix.", qcm: false, time: 30, joker: true, lives: true },
  qcm: { name: "QCM", desc: "Toutes les questions en 4 choix, correction automatique.", qcm: true, time: 30, joker: false, lives: true },
  teams: { name: "Équipes", desc: "Sur un téléphone, en équipes qui jouent chacune leur tour. 3 questions par joueur, les points s'additionnent.", qcm: true, time: 30, joker: false, lives: false, teams: true },
  solo: { name: "Solo", desc: "Seul face aux questions : QCM, 3 vies, battez votre record.", qcm: true, time: 30, joker: false, lives: true, solo: true },
  million: { name: "Qui veut gagner des millions", desc: "Seul ou à plusieurs sur un téléphone : 15 questions, 3 jokers, des paliers sûrs. Visez le million !", qcm: true, time: 0, joker: false, lives: false, million: true },
  // types de salon, choisis depuis « En ligne »
  chrono: { name: "Chrono en ligne", qcm: true, time: 60, joker: false, lives: false, online: true, chrono: true, hidden: true },
  oteams: { name: "Équipes en ligne", qcm: true, time: 30, joker: false, lives: false, online: true, teams: true, hidden: true },
  omillion: { name: "Millionnaire en ligne", qcm: true, time: 30, joker: false, lives: false, online: true, million: true, hidden: true }
};
const TIMES = [10, 15, 20, 30, 45, 60, 0];
const JOKERS = [0, 1, 2, 3, 5];
const S = {
  used: new Set(), // questions déjà posées dans la partie en cours
  uid: null, firstName: "", count: 4, slots: [], players: [], themes: new Set(), active: new Set(), rand: false, photo: "",
  i: -1, diff: 1, q: null, buf: [], loading: null, joker: false, locked: false, tid: null, left: 30,
  rest: [], qn: 0, editRoom: false, elim: 0, mode: "classic", played: new Set(), asked: [], inGame: false, pending: false, resume: false,
  cfg: { time: 30, jokers: 1, lives: 2, auto: false } // auto : difficulté évolutive
};
const M = () => MODES[S.mode];
document.querySelectorAll(".ver").forEach((e) => (e.textContent = `Quizly v${VERSION} · par YoskanGame`));
const online = initOnline({ $, show, flash, confetti, me: () => ({ name: S.firstName || "Joueur", photo: S.photo || "" }), record: chronoRecord, millionUI, avatarEl, setAudio, noteQ: noteRecent, recent: () => getRecent().arr.slice(-300), setMode: (kind) => (S.mode = KIND_MODE[kind] || "online"), stat: { answer: (t, ok) => statAnswer(t, ok), game: (k) => statGame(k) } });
// record personnel du Chrono en ligne (gardé sur l'appareil, par compte)
function chronoRecord(points) {
  const key = `quizly:${S.uid}:bestChrono`;
  let best = 0; try { best = +localStorage.getItem(key) || 0; } catch {}
  const rec = points > best;
  if (rec) try { localStorage.setItem(key, points); } catch {}
  return { rec, best: Math.max(best, points) };
}

// pas de zoom (pincement iOS)
["gesturestart", "gesturechange", "gestureend"].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault()));

/* ---------- Écrans & effets ---------- */
// pendant une partie, le bouton du haut affiche « Quitter » au lieu de « Menu »
const PLAYING = ["s-game", "s-million", "s-level", "s-revive", "s-load", "s-bet"];
let curScreen = "";
function userLabel() {
  let on = false; try { on = online.active(); } catch {}
  const quit = (PLAYING.includes(curScreen) && (S.inGame || on)) || (on && curScreen === "s-lobby");
  $("userName").textContent = `${S.firstName || "Compte"} · ${quit ? "Quitter" : "Profil"}`;
  $("btnUser").setAttribute("aria-label", quit ? "Quitter la partie" : "Ouvrir mon profil");
}
function show(id) {
  if (curScreen === "s-scan" && id !== "s-scan") stopScan(); // on coupe la caméra en quittant le scanner
  curScreen = id;
  if (id === "s-lobby") { $("btnInvite").hidden = !friends.ready(); friends.hideInvitePanel(); } // inviter ses amis dans le salon
  if (id === "s-mode") try { menuPushUI(); } catch {}
  $("btnFriends").hidden = $("btnNotifs").hidden = id === "s-login" || PLAYING.includes(id) || id === "s-lobby"; // Amis et cloche, hors partie
  if (id === "s-end") setTimeout(() => friends.syncRecords(), 800); // nouveaux records visibles par les amis
  // rond des réactions : seulement pendant une partie en ligne
  let onl = false; try { onl = online.active(); online.closeReacts(); } catch {}
  $("reactFab").hidden = !(onl && ["s-game", "s-million", "s-load"].includes(id));
  const au = document.getElementById("qAudio"); if (au && id !== "s-game") au.pause(); // l'extrait s'arrête quand on quitte la question
  document.querySelectorAll(".screen").forEach((s) => (s.hidden = s.id !== id));
  userLabel();
  $("bar").hidden = id === "s-login" || id === "s-local";
  window.scrollTo(0, 0);
  const sp = document.getElementById("splash"); // le jeu est prêt : on retire l'écran de démarrage
  if (sp) { sp.classList.add("off"); setTimeout(() => sp.remove(), 450); }
}
function flash(kind) {
  const fx = $("fx");
  fx.className = ""; void fx.offsetWidth; fx.className = kind;
  if (kind === "ko") { // secousse sans toucher aux ancêtres des boutons fixes
    const keys = [0, -10, 10, -8, 8, 0].map((x) => ({ transform: `translateX(${x}px)` }));
    ["scene", "mcq"].forEach((id) => { const el = $(id); if (el && el.offsetParent) el.animate(keys, { duration: 450 }); });
  }
}
function confetti() {
  const cols = ["#ffe14d", "#34e3b0", "#ff6b8b", "#62c7ff", "#f6f3ff"];
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
  const box = $("themes");
  box.replaceChildren();
  box.classList.toggle("dim", S.rand);
  const r = document.createElement("button");
  r.className = "chip rand"; r.textContent = "Aléatoire";
  r.setAttribute("aria-pressed", S.rand);
  // Aléatoire : les autres thèmes sont verrouillés tant qu'il est actif
  const lock = () => { box.classList.toggle("dim", S.rand); box.querySelectorAll(".chip:not(.rand)").forEach((c) => (c.disabled = S.rand)); };
  r.onclick = () => { S.rand = !S.rand; r.setAttribute("aria-pressed", S.rand); lock(); };
  box.append(r);
  THEMES.forEach((t, i) => {
    const b = document.createElement("button");
    b.className = "chip"; b.style.setProperty("--i", i + 1); b.textContent = t;
    b.setAttribute("aria-pressed", S.themes.has(t));
    b.disabled = S.rand;
    b.onclick = () => { if (S.rand) return; S.themes.has(t) ? S.themes.delete(t) : S.themes.add(t); b.setAttribute("aria-pressed", S.themes.has(t)); };
    box.append(b);
  });
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
  opts($("optTime"), TIMES, S.cfg.time, (v) => (v ? `${v} s` : "Sans limite"), (v) => (S.cfg.time = v));
  $("autoRow").hidden = !!M().million; // le Millionnaire a déjà son échelle
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
  const p = fetchAI(aiThemes.sort(() => Math.random() - 0.5).slice(0, 5), d, 6, getAvoid())
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
  const lq = await pickLocalQ(locals.length ? locals : LOCAL_THEMES.filter((t) => t !== SONG_THEME), S.diff);
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
  saveStats(st);
}
function statGame(kind) {
  if (!S.uid) return;
  const st = getStats();
  st.games[kind] = (st.games[kind] || 0) + 1;
  saveStats(st);
}
const GAME_NAMES = { classic: "Classique", qcm: "QCM", solo: "Solo", teams: "Équipes", million: "Millionnaire", online: "En ligne", chrono: "Chrono", omillion: "Millionnaire en ligne" };
function renderProfile() {
  const st = getStats();
  const best = (k) => { try { return +localStorage.getItem(`quizly:${S.uid}:${k}`) || 0; } catch { return 0; } };
  $("profName").textContent = S.firstName || "Profil";
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
  party: ["Party", "Sur un seul téléphone, entre amis : Classique, QCM, Équipes et Qui veut gagner des millions.", [
    ["classic"], ["qcm"], ["teams"],
    ["million", "Qui veut gagner des millions", "À plusieurs : chacun son échelle de 15 questions et ses 3 jokers. Celui qui repart avec le plus gagne."]
  ]],
  solosec: ["Solo", "Seul face aux questions : Solo et Qui veut gagner des millions.", [
    ["solo"],
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
    grid.append(modeCard(id, name || m.name, desc || m.desc, () => (solo ? millionSolo() : chooseMode(id)), i));
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

function chooseMode(id) {
  S.mode = id;
  S.mSolo = false;
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
const saveProfiles = (p) => { try { localStorage.setItem(profKey, JSON.stringify(p)); } catch {} };
const oldLocals = () => { try { return JSON.parse(localStorage.getItem("quizly:locals") || "[]"); } catch { return []; } };
// QR code de la télé scanné avec l'appareil photo du téléphone : quizly…/?tv=ABCDEFGH rejoint le salon télé dès la connexion
let pendingJoin = new URLSearchParams(location.search).get("tv");
function enter(uid, name, photo) {
  S.uid = uid;
  setUser(name, photo);
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
  me: () => ({ name: S.firstName || "Joueur", photo: S.photo || "" }),
  records: () => { const b = (k) => { try { return +localStorage.getItem(`quizly:${S.uid}:${k}`) || 0; } catch { return 0; } }; return { best2: b("best2"), bestChrono: b("bestChrono"), bestMillion: b("bestMillion") }; },
  joinRoom: (code) => { chooseMode("online"); online.join(code); },
  roomInfo: () => (online.cfg() ? { code: $("lobbyCode").textContent, kind: online.cfg().kind } : null),
  openFriends: () => openFriends(),
  openNotifs: () => openNotifs(),
  showScreen: (id) => { if (id === "s-friends") friends.render(); show(id); }
});
function openNotifs() { friends.renderNotifs(); adminUI(); show("s-notifs"); }
$("btnNotifs").onclick = openNotifs;
function openFriends() { friends.render(); friends.syncRecords(); pushUI(); show("s-friends"); }
// bandeau des notifications dans l'onglet Amis
function menuPushUI() { // bandeau du menu : tant que les notifications ne sont ni acceptées ni refusées
  let later = false; try { later = Date.now() - (+localStorage.getItem("quizly:pushLater") || 0) < 3 * 86400000; } catch {}
  $("menuPush").hidden = pushState() !== "default" || later;
}
$("btnMenuPush").onclick = async () => { $("btnMenuPush").disabled = true; pushUI(await enablePush(S.uid, true)); $("btnMenuPush").disabled = false; menuPushUI(); };
$("btnMenuPushNo").onclick = () => { try { localStorage.setItem("quizly:pushLater", String(Date.now())); } catch {} menuPushUI(); }; // redemandé dans 3 jours
function pushUI(st) {
  st = st || pushState();
  const ios = /iphone|ipad/i.test(navigator.userAgent), installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const box = $("pushBox");
  if (st === "granted") { box.hidden = true; return; }
  box.hidden = false;
  $("btnPush").hidden = st === "denied" || (st === "unsupported");
  $("pushText").textContent = st === "denied" ? "Les notifications sont bloquées : autorisez-les dans les réglages du téléphone, pour Quizly."
    : st === "unsupported" ? (ios && !installed ? "Pour recevoir les notifications sur iPhone, installez Quizly : Partager › Sur l'écran d'accueil." : "Ce navigateur ne permet pas les notifications.")
    : st === "off" ? "Les notifications ne sont pas encore prêtes sur le serveur."
    : "Soyez prévenu quand un ami vous ajoute ou vous invite, même appli fermée.";
}
$("btnPush").onclick = async () => { $("btnPush").disabled = true; pushUI(await enablePush(S.uid, true)); $("btnPush").disabled = false; };
$("btnFriends").onclick = openFriends;
// petite animation d'appui sur les boutons du haut (et :active fonctionne aussi sur iPhone)
document.addEventListener("touchstart", () => {}, { passive: true });
["btnUser", "btnFriends", "btnNotifs"].forEach((id) => $(id).addEventListener("pointerdown", (e) => {
  const b = e.currentTarget; b.classList.remove("tap"); void b.offsetWidth; b.classList.add("tap");
  setTimeout(() => b.classList.remove("tap"), 400);
}));
let pendingAmi = new URLSearchParams(location.search).get("ami"); // QR code ami scanné avec l'appareil photo
async function afterCloud() {
  setUser(S.gName, S.gPhoto); // nom et photo personnalisés récupérés du cloud
  await friends.start();
  enablePush(S.uid, false).then(pushUI); // réinscrit cet appareil aux notifications (sans rien demander)
  if (new URLSearchParams(location.search).get("notifs")) { try { history.replaceState(null, "", location.pathname); } catch {} openNotifs(); } // annonce touchée
  if (new URLSearchParams(location.search).get("amis")) { try { history.replaceState(null, "", location.pathname); } catch {} openFriends(); } // ouvert depuis une notification
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
    () => { S.inGame = false; S.resume = false; stopTimer(); million.quit(); show("s-mode"); },
    () => { if (S.resume) resumeTimer(); S.resume = false; });
};
$("cfNo").onclick = () => { $("confirm").hidden = true; const f = S.onNo; S.onYes = S.onNo = null; if (f) f(); };
$("cfYes").onclick = () => { $("confirm").hidden = true; const f = S.onYes; S.onYes = S.onNo = null; if (f) f(); };
$("btnResetLives").onclick = () => ask("Réinitialiser les vies ?", "Toutes les vies de tous les joueurs reviendront à 0.", "Réinitialiser", resetLives);
document.querySelectorAll("[data-back]").forEach((b) => (b.onclick = () => {
  let t = b.dataset.back;
  if (t === "auto") t = M().online ? "s-roomtype" : M().solo ? "s-mode" : M().teams ? "s-teams" : "s-names";
  if (t === "s-themes" && M().million) t = "s-roomtype"; // le Millionnaire n'a pas d'écran de thèmes
  if (t === "s-lobby") { S.editRoom = false; online.setEditing(false); }
  if (t === "s-mode" && S.menuSec && ["s-count", "s-themes"].includes(curScreen)) t = "s-sub"; // retour à la liste Party / Solo
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
  if (M().million) return startMillion(); // Millionnaire : pas de choix de thèmes
  if (M().teams) { renderTeams(); return show("s-teams"); } // Équipes : on forme les équipes
  renderThemes(); show("s-themes");
};
$("btnThemes").onclick = () => {
  if (!S.rand && !S.themes.size) { $("setupMsg").textContent = "Choisissez au moins un thème, ou « Aléatoire »."; return; }
  $("setupMsg").textContent = "";
  S.active = S.rand ? new Set(THEMES) : new Set(S.themes);
  if (M().chrono) return submitRoom(); // Chrono : 60 s fixes, pas de vies, on crée la salle tout de suite
  $("btnTime").textContent = M().joker || M().online ? "Valider" : "Lancer la partie";
  renderTime(); show("s-time");
};
$("btnTime").onclick = () => {
  if (M().online && (M().million || M().teams)) return submitRoom(); // Millionnaire et Équipes en ligne : pas de vies
  if (M().online) { renderLivesOpt(); show("s-jokers"); }
  else if (M().joker) { renderJokers(); show("s-jokers"); }
  else startGame();
};
function submitRoom() {
  const cfg = { auto: S.cfg.auto, kind: M().chrono ? "chrono" : M().million ? "million" : M().teams ? "equipes" : "survie", themes: [...S.active], time: S.cfg.time, lives: S.cfg.lives };
  if (S.editRoom) { S.editRoom = false; online.setEditing(false); online.config(cfg); } // l'hôte modifie la salle
  else online.create(cfg);
}
$("btnStart").onclick = () => (M().online ? submitRoom() : startGame());
$("btnRetry").onclick = () => (M().online ? online.retry() : M().million ? million.retry() : loadAndPlay());
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
  ["omillion", "million", "Qui veut gagner des millions", "La même échelle de 15 questions pour tous, chacun avec ses jokers. Celui qui repart avec le plus gagne."]
];
const KIND_MODE = { survie: "online", chrono: "chrono", million: "omillion", equipes: "oteams" };
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
$("btnRoomCreate").onclick = () => { S.editRoom = false; online.setEditing(false); renderRoomModes(null); show("s-roomtype"); };
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
  setUser(S.gName, S.gPhoto); renderProfile(); friends.syncRecords(); // vos amis voient le nouveau nom et la nouvelle photo
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
  $("adminUid").textContent = S.uid || "";
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
  const text = $("adminText").value.trim();
  if (text.length < 3) { $("adminMsg").textContent = "Écrivez un message."; return; }
  $("btnAdminSend").disabled = true; $("adminMsg").textContent = "Envoi…";
  try {
    const { saved, sent, ok } = await friends.announce(text, localStorage.getItem(ADMIN));
    const push = ok ? `Notification envoyée à ${sent} appareil${sent > 1 ? "s" : ""}.` : "Notification non envoyée : clé développeur refusée par le serveur.";
    const bell = saved ? " Annonce ajoutée dans la cloche de tout le monde." : " Mais pas ajoutée dans la cloche : la règle « announces » de Firestore refuse votre identifiant.";
    $("adminMsg").textContent = push + bell;
    if (saved || ok) $("adminText").value = "";
  } catch { $("adminMsg").textContent = "Échec de l'envoi."; }
  $("btnAdminSend").disabled = false;
};
