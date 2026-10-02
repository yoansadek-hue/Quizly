import { THEMES, fetchAI } from "./questions.js";
import { watch, signIn, logout } from "./auth.js";

const $ = (id) => document.getElementById(id);
const LEVELS = ["", "Facile", "Moyen", "Difficile", "Expert", "Légende"];
const MODES = {
  classic: { name: "Classique", desc: "Réponse à l'oral, le groupe valide. Carte retournable à volonté, jokers 4 choix.", qcm: false, time: 30, joker: true, lives: true },
  qcm: { name: "QCM", desc: "Toutes les questions en 4 choix, correction automatique.", qcm: true, time: 30, joker: false, lives: true },
  solo: { name: "Solo", desc: "Seul face aux questions : QCM, 3 vies, battez votre record.", qcm: true, time: 30, joker: false, lives: true, solo: true }
};
const TIMES = [10, 15, 20, 30, 45, 60, 0];
const JOKERS = [0, 1, 2, 3, 5];
const S = {
  uid: null, firstName: "", count: 4, slots: [], players: [], themes: new Set(),
  i: -1, diff: 1, q: null, buf: [], loading: null, joker: false, locked: false, tid: null, left: 30,
  rest: [], elim: 0, mode: "classic", played: new Set(), asked: [], inGame: false, pending: false, resume: false,
  cfg: { time: 30, jokers: 1 }
};
const M = () => MODES[S.mode];

// pas de zoom (pincement iOS)
["gesturestart", "gesturechange", "gestureend"].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault()));

/* ---------- Écrans & effets ---------- */
function show(id) {
  document.querySelectorAll(".screen").forEach((s) => (s.hidden = s.id !== id));
  $("bar").hidden = id === "s-login";
  window.scrollTo(0, 0);
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
  const cols = ["#ffd84d", "#29d9a1", "#ff5c5c", "#ffffff", "#c9ceff"];
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
  const n = Math.min(12, Math.max(2, S.count + d));
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
  S.count = Math.min(12, Math.max(2, S.slots.length || 4));
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
  THEMES.forEach((t, i) => {
    const b = document.createElement("button");
    b.className = "chip"; b.style.setProperty("--i", i); b.textContent = t;
    b.setAttribute("aria-pressed", S.themes.has(t));
    b.onclick = () => { S.themes.has(t) ? S.themes.delete(t) : S.themes.add(t); b.setAttribute("aria-pressed", S.themes.has(t)); };
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
const renderTime = () => opts($("optTime"), TIMES, S.cfg.time, (v) => (v ? `${v} s` : "Sans limite"), (v) => (S.cfg.time = v));
const renderJokers = () => opts($("optJokers"), JOKERS, S.cfg.jokers, String, (v) => (S.cfg.jokers = v));

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
  try { localStorage.setItem(histKey(), JSON.stringify([...getHist(), q].slice(-250))); } catch {}
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
const getAvoid = () => [...new Set([...getHist().slice(-8), ...S.asked])].slice(-15).map((q) => q.slice(0, 70));

function fill() {
  const d = S.diff;
  if (S.loading && S.loading.d === d) return S.loading.p;
  const p = fetchAI([...S.themes].sort(() => Math.random() - 0.5).slice(0, 5), d, 6, getAvoid())
    .then((qs) => {
      qs.forEach((q) => { if (!seen(q.q) && !S.buf.some((b) => similar(b.q, q.q))) S.buf.push({ ...q, d }); });
      saveBank();
    })
    .finally(() => { if (S.loading && S.loading.p === p) S.loading = null; });
  S.loading = { d, p };
  return p;
}
async function getQuestion() {
  for (let t = 0; t < 3; t++) {
    const pool = usable(S.diff);
    if (pool.length) {
      const q = pool[Math.floor(Math.random() * pool.length)];
      q.u = true; remember(q.q); saveBank();
      if (usable(S.diff).length < 3) fill().catch(() => {});
      return q;
    }
    await fill();
  }
  throw new Error("L'IA n'a renvoyé aucune nouvelle question.");
}

/* ---------- Partie ---------- */
const alive = () => S.players.filter((p) => !p.dead);
const over = () => (M().solo ? alive().length === 0 : alive().length <= 1);
const kill = (p) => { p.dead = true; p.outAt = ++S.elim; };

function startGame() {
  if (!S.themes.size) return;
  const m = M();
  S.players = S.slots.map((s) => ({ name: s.name, lives: m.solo ? 3 : s.lives, jokers: m.joker ? S.cfg.jokers : 0, dead: false, score: 0, outAt: 0 }));
  if (!m.solo) saveDB();
  saveRoster();
  S.elim = 0; S.played = new Set(); S.asked = []; S.inGame = true;
  S.i = -1; S.diff = 1; S.loading = null;
  const bank = loadBank();
  S.buf = bank.filter((q) => S.themes.has(q.t) && !seen(q.q));
  S.rest = bank.filter((q) => !S.themes.has(q.t));
  nextTurn();
}

function nextTurn() {
  if (!S.inGame) return;
  if (over()) return endGame(alive()[0]);
  do { S.i = (S.i + 1) % S.players.length; } while (S.players[S.i].dead);
  loadAndPlay();
}

async function loadAndPlay() {
  if (!usable(S.diff).length) show("s-load"); // le chargement ne s'affiche que s'il faut vraiment attendre l'IA
  $("loadText").textContent = "L'IA prépare vos questions…";
  $("loadErr").hidden = true;
  try {
    const q = await getQuestion();
    if (!S.inGame) return;
    S.q = q;
  } catch (e) {
    if (!S.inGame) return;
    $("loadText").textContent = `Génération impossible : ${e.message}`; $("loadErr").hidden = false; return;
  }
  prepareCard();
}

function prepareCard() {
  const p = S.players[S.i], m = M();
  S.joker = false; S.locked = false;
  const card = $("card");
  card.style.transition = "none"; card.classList.remove("flipped"); delete card.dataset.seen;
  replay(card); void card.offsetWidth; card.style.transition = "";
  const n = alive().length;
  $("alive").hidden = !!m.solo;
  $("alive").textContent = `${n} joueur${n > 1 ? "s" : ""} en vie sur ${S.players.length}`;
  $("scene").classList.toggle("compact", m.qcm);
  $("whoName").textContent = p.name;
  $("whoLives").textContent = `❤ ${p.lives}`;
  $("whoLives").hidden = !m.lives;
  $("tag").textContent = `${S.q.t} · ${LEVELS[S.diff]}`;
  $("backTag").textContent = "Réponse";
  $("qText").textContent = S.q.q;
  $("aText").textContent = S.q.a;
  $("tap").textContent = "Touchez pour voir la réponse";
  $("tap").hidden = m.qcm;
  $("mcq").hidden = true; $("dockJudge").hidden = true; $("dockNext").hidden = true;
  $("btnSwap").hidden = false;
  $("btnJoker").textContent = `Joker : 4 choix (${p.jokers})`;
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
  $("btnStopTimer").hidden = false;
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
  $("btnStopTimer").hidden = false;
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
    $("dockGame").hidden = true; $("btnSwap").hidden = true;
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
  $("btnSwap").hidden = true;
  if (correct) S.players[S.i].score++;
  if (!quiet) flash(correct ? "ok" : "ko");
  setTimeout(() => resolve(correct), quiet ? 0 : 500);
}

function resolve(correct) {
  if (!S.inGame) return;
  if (correct) return afterTurn();
  const p = S.players[S.i];
  if (M().solo) { p.lives--; if (p.lives <= 0) kill(p); return afterTurn(); } // solo : pas de question, la vie part toute seule
  if (M().lives && p.lives > 0) {
    $("reviveName").textContent = p.name;
    $("lifeCount").textContent = p.lives;
    show("s-revive");
  } else { kill(p); afterTurn(); }
}

function revive(useLife) {
  const p = S.players[S.i];
  if (useLife) p.lives--; else kill(p);
  if (!M().solo) saveDB();
  afterTurn();
}

/* Le niveau est demandé quand tous les joueurs encore en jeu ont joué */
function afterTurn() {
  if (!S.inGame) return;
  if (over()) return endGame(alive()[0]);
  S.played.add(S.i);
  if (!alive().every((p) => S.played.has(S.players.indexOf(p)))) return nextTurn();
  S.played.clear();
  $("lvName").textContent = `${S.diff} · ${LEVELS[S.diff]}`;
  $("btnUp").hidden = S.diff >= 5;
  show("s-level");
}
function chooseLevel(up) { if (up) S.diff = Math.min(S.diff + 1, 5); nextTurn(); }

function endGame(w) {
  S.inGame = false;
  const ol = $("ranking");
  ol.replaceChildren();
  if (M().solo) {
    const p = S.players[0], key = `quizly:${S.uid}:best`;
    let best = 0; try { best = +localStorage.getItem(key) || 0; } catch {}
    const rec = p.score > best;
    if (rec) try { localStorage.setItem(key, p.score); } catch {}
    $("endLead").textContent = "Score final";
    $("winner").textContent = `${p.score}`;
    $("endNote").textContent = rec ? "Nouveau record !" : `Record : ${best}`;
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
    st.textContent = `${p.score} bonne${p.score > 1 ? "s" : ""} · ❤ ${p.lives}`;
    li.append(pos, nm, st);
    ol.append(li);
  });
  show("s-end");
  confetti();
}

/* ---------- Compte, modes, navigation ---------- */
async function login(kind) {
  $("loginMsg").textContent = "";
  try { await signIn(kind); } catch (e) { $("loginMsg").textContent = e.message; }
}

const SESS = "quizly:session";
const getSess = () => { try { return JSON.parse(localStorage.getItem(SESS) || "null"); } catch { return null; } };

function setUser(name, photo) {
  const first = (name || "Compte").split(" ")[0];
  S.firstName = first;
  $("userName").textContent = `${first} · Menu`;
  const img = $("userPhoto"), ini = $("userInit");
  ini.textContent = first.charAt(0).toUpperCase();
  img.hidden = !photo; ini.hidden = !!photo;
  if (photo) img.src = photo;
}

function renderModes() {
  const box = $("modes");
  box.replaceChildren();
  Object.entries(MODES).forEach(([id, m], i) => {
    const b = document.createElement("button");
    b.className = "mode"; b.dataset.m = id; b.style.animationDelay = `${i * 70}ms`;
    const t = document.createElement("strong"); t.textContent = m.name;
    const d = document.createElement("span"); d.textContent = m.desc;
    b.append(t, d);
    b.onclick = () => chooseMode(id);
    box.append(b);
  });
}

function chooseMode(id) {
  S.mode = id;
  S.cfg.time = M().time;
  $("modeLabel").textContent = `Mode : ${M().name}`;
  loadRoster();
  if (M().solo) {
    S.slots = [{ name: S.firstName || "Moi", lives: 0, imported: false }]; S.count = 1; // pas de nom ni d'import en solo
    renderThemes();
    show("s-themes");
  } else show("s-count");
}

function enter(uid, name, photo) {
  S.uid = uid;
  setUser(name, photo);
  loadRoster();
  renderModes();
  show("s-mode");
}

const saved = getSess();
if (saved) enter(saved.uid, saved.name, saved.photo);

watch((user) => {
  if (user) {
    const name = user.displayName || user.email || "Compte";
    try { localStorage.setItem(SESS, JSON.stringify({ uid: user.uid, name, photo: user.photoURL || "" })); } catch {}
    if (S.uid !== user.uid) enter(user.uid, name, user.photoURL); else setUser(name, user.photoURL);
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
  if (!S.inGame) { stopTimer(); return show("s-mode"); }
  S.resume = !!S.tid; stopTimer();
  ask("Quitter la partie ?", "Êtes-vous sûr ? La partie en cours sera perdue.", "Quitter",
    () => { S.inGame = false; S.resume = false; stopTimer(); show("s-mode"); },
    () => { if (S.resume) resumeTimer(); S.resume = false; });
};
$("cfNo").onclick = () => { $("confirm").hidden = true; const f = S.onNo; S.onYes = S.onNo = null; if (f) f(); };
$("cfYes").onclick = () => { $("confirm").hidden = true; const f = S.onYes; S.onYes = S.onNo = null; if (f) f(); };
$("btnResetLives").onclick = () => ask("Réinitialiser les vies ?", "Toutes les vies de tous les joueurs reviendront à 0.", "Réinitialiser", resetLives);
document.querySelectorAll("[data-back]").forEach((b) => (b.onclick = () => {
  let t = b.dataset.back;
  if (t === "auto") t = M().solo ? "s-mode" : "s-names";
  show(t);
}));
$("btnLogout").onclick = async () => { try { localStorage.removeItem(SESS); } catch {} await logout(); S.uid = null; show("s-login"); };

$("cMinus").onclick = () => setCount(-1);
$("cPlus").onclick = () => setCount(1);
$("btnCount").onclick = () => { renderSlots(); show("s-names"); };
$("btnNames").onclick = () => {
  const err = validateNames();
  $("namesMsg").textContent = err;
  if (!err) { renderThemes(); show("s-themes"); }
};
$("btnThemes").onclick = () => {
  if (!S.themes.size) { $("setupMsg").textContent = "Choisissez au moins un thème."; return; }
  $("setupMsg").textContent = "";
  if (M().fixed) return startGame(); // mort subite : durée imposée
  $("btnTime").textContent = M().joker ? "Valider" : "Lancer la partie";
  renderTime(); show("s-time");
};
$("btnTime").onclick = () => { if (M().joker) { renderJokers(); show("s-jokers"); } else startGame(); };
$("btnStart").onclick = startGame;
$("btnRetry").onclick = loadAndPlay;
$("btnSwap").onclick = () => { if (S.locked || !S.inGame) return; stopTimer(); loadAndPlay(); };
$("btnStopTimer").onclick = stopTimer;
$("card").onclick = flip;
$("card").addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), flip()));
$("btnJoker").onclick = useJoker;
$("btnNext").onclick = () => { $("dockNext").hidden = true; $("mcq").hidden = true; finish(S.pending, true); };
$("btnOk").onclick = () => judge(true);
$("btnKo").onclick = () => judge(false);
$("btnUseLife").onclick = () => revive(true);
$("btnDie").onclick = () => revive(false);
$("btnUp").onclick = () => chooseLevel(true);
$("btnStay").onclick = () => chooseLevel(false);
$("btnAgain").onclick = () => {
  if (M().solo) { renderThemes(); show("s-themes"); } else show("s-count"); // même mode, sans lancer la partie
};

// pendant la saisie d'un nom, les boutons fixes du bas sont masqués
document.addEventListener("focusin", (e) => { if (e.target.matches && e.target.matches("input[type=text]")) document.body.classList.add("typing"); });
document.addEventListener("focusout", () => document.body.classList.remove("typing"));
