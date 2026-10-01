import { THEMES, fetchAI } from "./questions.js";
import { watch, signIn, logout } from "./auth.js";

const $ = (id) => document.getElementById(id);
const LEVELS = ["", "Facile", "Moyen", "Difficile", "Expert", "Légende"];
const MODES = {
  classic: { name: "Classique", desc: "Réponse à l'oral, le groupe valide. Carte retournable à volonté, joker 4 choix.", qcm: false, time: 30, joker: true, lives: true },
  qcm: { name: "QCM", desc: "Toutes les questions en 4 choix, correction automatique.", qcm: true, time: 30, joker: false, lives: true },
  sudden: { name: "Mort subite", desc: "Une erreur et vous sortez : ni vie, ni joker. 20 secondes.", qcm: false, time: 20, joker: false, lives: false },
  flash: { name: "Éclair", desc: "QCM chronométré : 10 secondes par question.", qcm: true, time: 10, joker: false, lives: true }
};
const M = () => MODES[S.mode];
const S = {
  uid: null, count: 4, slots: [], players: [], themes: new Set(THEMES),
  i: -1, diff: 1, q: null, buf: [], loading: null, joker: false, locked: false, tid: null, left: 30, elim: 0, mode: "classic", played: new Set()
};

/* ---------- Écrans & effets ---------- */
function show(id) {
  document.querySelectorAll(".screen").forEach((s) => (s.hidden = s.id !== id));
  $("bar").hidden = id === "s-login";
  window.scrollTo(0, 0);
}
function flash(kind) {
  const fx = $("fx");
  fx.className = "";
  void fx.offsetWidth;
  fx.className = kind;
  if (kind === "ko") { document.body.classList.remove("shake"); void document.body.offsetWidth; document.body.classList.add("shake"); }
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

/* ---------- Base de profils (par compte) ---------- */
const dbKey = () => `quizly:${S.uid}:profiles`;
function getDB() { try { return JSON.parse(localStorage.getItem(dbKey()) || "{}"); } catch { return {}; } }
function saveDB() {
  const db = getDB();
  S.players.forEach((p) => (db[p.name.toLowerCase()] = { name: p.name, lives: p.lives }));
  try { localStorage.setItem(dbKey(), JSON.stringify(db)); } catch {}
}

/* ---------- Nombre de joueurs ---------- */
function setCount(d) {
  S.count = Math.min(12, Math.max(2, S.count + d));
  const n = $("cNum");
  n.textContent = S.count;
  n.classList.remove("tick"); void n.offsetWidth; n.classList.add("tick");
}

/* ---------- Noms + import de profil ---------- */
const rosterKey = () => `quizly:${S.uid}:roster`;
function loadRoster() {
  try { S.slots = JSON.parse(localStorage.getItem(rosterKey()) || "[]").map((x) => ({ name: x.name || "", lives: x.lives || 0, imported: !!x.imported })); }
  catch { S.slots = []; }
  S.count = Math.min(12, Math.max(2, S.slots.length || 4));
  $("cNum").textContent = S.count;
}
function saveRoster() { try { localStorage.setItem(rosterKey(), JSON.stringify(S.slots)); } catch {} }

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
  // garde les premiers joueurs, retire ceux du bas si le nombre baisse, ajoute des champs vides s'il monte
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
    wrap.style.animation = `in .4s ${i * 50}ms both`;
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

/* ---------- Thèmes ---------- */
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
const setAllThemes = (on) => { S.themes = new Set(on ? THEMES : []); renderThemes(); };

/* ---------- Questions : 100 % IA ---------- */
const unused = (d) => S.buf.filter((q) => !q.u && q.d === d);
function fill() {
  const d = S.diff;
  if (S.loading && S.loading.d === d) return S.loading.p;
  const p = fetchAI([...S.themes], d, 10)
    .then((qs) => { S.buf.push(...qs.map((q) => ({ ...q, d }))); })
    .finally(() => { if (S.loading && S.loading.p === p) S.loading = null; });
  S.loading = { d, p };
  return p;
}
async function getQuestion() {
  if (!unused(S.diff).length) await fill();
  const pool = unused(S.diff);
  if (!pool.length) throw new Error("L'IA n'a renvoyé aucune question valide.");
  const q = pool[Math.floor(Math.random() * pool.length)];
  q.u = true;
  if (unused(S.diff).length < 4) fill().catch(() => {});
  return q;
}

/* ---------- Partie ---------- */
const alive = () => S.players.filter((p) => !p.dead);
const kill = (p) => { p.dead = true; p.outAt = ++S.elim; };

function startGame() {
  if (!S.themes.size) { $("setupMsg").textContent = "Choisissez au moins un thème."; return; }
  $("setupMsg").textContent = "";
  S.players = S.slots.map((s) => ({ name: s.name, lives: s.lives, joker: true, dead: false, score: 0, outAt: 0 }));
  saveDB(); saveRoster();
  S.elim = 0; S.played = new Set(); S.i = -1; S.diff = 1; S.buf = []; S.loading = null;
  nextTurn();
}

function nextTurn() {
  const a = alive();
  if (a.length <= 1) return endGame(a[0]);
  do { S.i = (S.i + 1) % S.players.length; } while (S.players[S.i].dead);
  loadAndPlay();
}

async function loadAndPlay() {
  show("s-load");
  $("loadText").textContent = "L'IA prépare vos questions…";
  $("loadErr").hidden = true;
  try { S.q = await getQuestion(); }
  catch (e) { $("loadText").textContent = `Génération impossible : ${e.message}`; $("loadErr").hidden = false; return; }
  prepareCard();
}

function prepareCard() {
  const p = S.players[S.i], m = M();
  S.joker = false; S.locked = false;
  $("card").classList.remove("flipped");
  delete $("card").dataset.seen;
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
  $("mcq").hidden = true; $("dockJudge").hidden = true;
  $("btnJoker").hidden = !(m.joker && p.joker);
  $("dockGame").hidden = $("btnJoker").hidden;
  show("s-game");
  startTimer();
  if (m.qcm) { S.joker = true; renderChoices(); }
}

/* ---------- Minuteur 30 s ---------- */
function startTimer() {
  stopTimer();
  const time = M().time, warn = time >= 20 ? 10 : 3;
  S.left = time;
  const bar = $("bar30"), clock = $("clock");
  bar.style.setProperty("--dur", time + "s");
  bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = ""; bar.style.animationPlayState = "";
  clock.textContent = S.left; clock.classList.remove("urgent");
  S.tid = setInterval(() => {
    S.left--;
    clock.textContent = Math.max(S.left, 0);
    if (S.left <= warn) clock.classList.add("urgent");
    if (S.left <= 0) timeUp();
  }, 1000);
}
function stopTimer() { clearInterval(S.tid); S.tid = null; $("bar30").style.animationPlayState = "paused"; $("clock").classList.remove("urgent"); }

function timeUp() {
  if (S.locked) return;
  S.locked = true; stopTimer();
  $("dockGame").hidden = true;
  if (M().qcm) {
    document.querySelectorAll("#mcq .btn").forEach((b) => { b.disabled = true; if (b.textContent === S.q.a) b.classList.add("right"); });
    setTimeout(() => { $("mcq").hidden = true; finish(false); }, 1800);
    return;
  }
  $("mcq").hidden = true;
  $("backTag").textContent = "Temps écoulé";
  $("card").classList.add("flipped");
  setTimeout(() => finish(false), 2200);
}

/* ---------- Actions ---------- */
function flip() {
  if (S.joker || S.locked || M().qcm) return;
  const c = $("card"), first = !c.dataset.seen;
  c.classList.toggle("flipped");           // la carte se retourne autant de fois qu'on veut
  if (first) {
    c.dataset.seen = "1";
    stopTimer();
    $("dockGame").hidden = true;
    setTimeout(() => ($("dockJudge").hidden = false), 350);
  }
}

function renderChoices() {
  $("dockGame").hidden = true;
  const box = $("mcq");
  box.replaceChildren();
  [...new Set(S.q.o)].sort(() => Math.random() - 0.5).forEach((o, i) => {
    const b = document.createElement("button");
    b.className = "btn white"; b.textContent = o; b.style.animation = `pop .35s ${i * 70}ms both`;
    b.onclick = () => pickOption(o, b);
    box.append(b);
  });
  box.hidden = false;
}

function useJoker() {
  S.joker = true;
  S.players[S.i].joker = false;
  renderChoices();
}

function pickOption(o, btn) {
  if (S.locked) return;
  S.locked = true; stopTimer();
  const ok = o === S.q.a;
  document.querySelectorAll("#mcq .btn").forEach((b) => { b.disabled = true; if (b.textContent === S.q.a) b.classList.add("right"); });
  if (!ok) btn.classList.add("wrong");
  setTimeout(() => { $("mcq").hidden = true; finish(ok); }, 1300);
}

function judge(ok) { if (S.locked) return; S.locked = true; finish(ok); }

function finish(correct) {
  if (correct) S.players[S.i].score++;
  flash(correct ? "ok" : "ko");
  setTimeout(() => resolve(correct), 500);
}

function resolve(correct) {
  if (correct) return afterTurn();
  const p = S.players[S.i];
  if (M().lives && p.lives > 0) {
    $("reviveName").textContent = p.name;
    $("lifeCount").textContent = p.lives;
    show("s-revive");
  } else { kill(p); afterTurn(); }
}

function revive(useLife) {
  const p = S.players[S.i];
  if (useLife) p.lives--; else kill(p);
  saveDB();
  afterTurn();
}

/* Le niveau est demandé quand tous les joueurs encore en jeu ont joué */
function afterTurn() {
  if (alive().length <= 1) return endGame(alive()[0]);
  S.played.add(S.i);
  if (!alive().every((p) => S.played.has(S.players.indexOf(p)))) return nextTurn();
  S.played.clear();
  $("lvName").textContent = `${S.diff} · ${LEVELS[S.diff]}`;
  $("btnUp").hidden = S.diff >= 5;
  show("s-level");
}
function chooseLevel(up) { if (up) S.diff = Math.min(S.diff + 1, 5); nextTurn(); }

function endGame(w) {
  if (w) w.lives++;
  S.players.forEach((p, i) => { if (S.slots[i]) { S.slots[i].lives = p.lives; S.slots[i].imported = true; } });
  saveDB(); saveRoster();
  $("winner").textContent = w ? w.name : "Égalité";
  $("endNote").textContent = w ? "+1 vie gagnée" : "Personne ne gagne de vie";
  const order = [...S.players].sort((a, b) => (b === w) - (a === w) || b.outAt - a.outAt);
  const ol = $("ranking");
  ol.replaceChildren();
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

/* ---------- Compte ---------- */
async function login(kind) {
  $("loginMsg").textContent = "";
  try { await signIn(kind); } catch (e) { $("loginMsg").textContent = e.message; }
}

/* ---------- Événements ---------- */
document.querySelectorAll("[data-provider]").forEach((b) => (b.onclick = () => login(b.dataset.provider)));
// « Sortir » : abandonne la partie en cours et revient au choix du mode de jeu
$("btnUser").onclick = () => { stopTimer(); show("s-mode"); };
$("btnLogout").onclick = async () => { stopTimer(); try { localStorage.removeItem(SESS); } catch {} await logout(); S.uid = null; show("s-login"); };
$("cMinus").onclick = () => setCount(-1);
$("cPlus").onclick = () => setCount(1);
$("btnCount").onclick = () => { renderSlots(); show("s-names"); };
$("btnNames").onclick = () => {
  const err = validateNames();
  $("namesMsg").textContent = err;
  if (!err) { renderThemes(); show("s-themes"); }
};
$("themesAll").onclick = () => setAllThemes(true);
$("themesNone").onclick = () => setAllThemes(false);
$("btnStart").onclick = startGame;
$("btnRetry").onclick = loadAndPlay;
$("card").onclick = flip;
$("card").addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), flip()));
$("btnJoker").onclick = useJoker;
$("btnOk").onclick = () => judge(true);
$("btnKo").onclick = () => judge(false);
$("btnUseLife").onclick = () => revive(true);
$("btnDie").onclick = () => revive(false);
$("btnUp").onclick = () => chooseLevel(true);
$("btnStay").onclick = () => chooseLevel(false);
$("btnAgain").onclick = () => show("s-mode");

const SESS = "quizly:session";
const getSess = () => { try { return JSON.parse(localStorage.getItem(SESS) || "null"); } catch { return null; } };
function renderModes() {
  const box = $("modes");
  box.replaceChildren();
  Object.entries(MODES).forEach(([id, m], i) => {
    const b = document.createElement("button");
    b.className = "mode"; b.dataset.m = id; b.style.animationDelay = `${i * 70}ms`;
    const t = document.createElement("strong"); t.textContent = m.name;
    const d = document.createElement("span"); d.textContent = m.desc;
    b.append(t, d);
    b.onclick = () => { S.mode = id; $("modeLabel").textContent = `Mode : ${m.name}`; show("s-count"); };
    box.append(b);
  });
}

function enter(uid, name) {
  S.uid = uid;
  $("userName").textContent = (name || "Compte").split(" ")[0] + " · Sortir";
  loadRoster();
  renderModes();
  show("s-mode");
}

// Session mémorisée : on entre directement dans le menu, Firebase confirme ensuite en arrière-plan
const saved = getSess();
if (saved) enter(saved.uid, saved.name);

watch((user) => {
  if (user) {
    const name = user.displayName || user.email || "Compte";
    try { localStorage.setItem(SESS, JSON.stringify({ uid: user.uid, name })); } catch {}
    if (S.uid !== user.uid) enter(user.uid, name);
  } else {
    try { localStorage.removeItem(SESS); } catch {}
    S.uid = null; stopTimer(); show("s-login");
  }
});
