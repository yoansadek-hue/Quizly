// Quizly TV : la télé crée son salon (caché, rejoint par QR code) et affiche la partie comme un plateau télé.
import { avatarEl, setFrame } from "./million.js";
import { euros, PRIZES, SAFE } from "./local.js";
import { THEMES } from "./questions.js";

const $ = (id) => document.getElementById(id);
const LEVELS = ["", "Facile", "Moyen", "Difficile", "Expert", "Légende"];
const KIND = { survie: "Survie", chrono: "Chrono 60 s", million: "Qui veut gagner des millions", equipes: "Équipes", parieurs: "Les Parieurs", imposteur: "L'Imposteur", royale: "Le Dernier Debout", duel: "Le Duel" };
const TAUNTS = ["Trop facile", "Tu dors ?", "Pleure pas", "Même pas peur", "Je suis trop fort", "Cadeau !", "Bruh"];
const T = { ws: null, code: "", pl: {}, kind: "survie", raf: 0, last: null, board: [], mboard: [], who: null, craf: 0 };

function show(id) {
  document.querySelectorAll(".screen").forEach((s) => (s.hidden = s.id !== id));
  if (id !== "tGame") $("tAudio").pause();
}
const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
const photo = (id) => (T.pl[id] && T.pl[id].photo) || "";
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/* ---------- connexion : la télé crée son propre salon ---------- */
const sendWs = (o) => T.ws && T.ws.readyState === 1 && T.ws.send(JSON.stringify(o));
function connect() {
  $("tMsg").textContent = T.code ? "Reconnexion…" : "Préparation du salon télé…";
  $("tGo").hidden = true;
  if (T.ws) try { T.ws.onclose = null; T.ws.close(); } catch {}
  const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  T.ws = ws;
  ws.onopen = () => sendWs(T.code ? { t: "tv", code: T.code } : { t: "tvcreate", themes: THEMES });
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); };
  ws.onclose = () => { if (T.ws === ws) setTimeout(() => T.ws === ws && connect(), 3000); }; // le serveur gratuit peut couper
}
$("tGo").onclick = () => { T.code = ""; connect(); };
$("tSound").onclick = () => { $("tAudio").play().catch(() => {}); $("tAudio").pause(); $("tSound").hidden = true; };
connect();

/* ---------- messages du serveur ---------- */
function onMsg(m) {
  switch (m.t) {
    case "error":
      if (T.code) { T.code = ""; sendWs({ t: "tvcreate", themes: THEMES }); }
      else { $("tMsg").textContent = m.msg; $("tGo").hidden = false; show("tJoin"); }
      break;
    case "closed": T.code = ""; sendWs({ t: "tvcreate", themes: THEMES }); break;
    case "tvok": T.code = m.code; break;
    case "lobby": renderLobby(m); break;
    case "load": stopRing(); $("tLoadText").textContent = m.msg || "L'IA prépare la question…"; show("tLoad"); break;
    case "fail": stopRing(); $("tLoadText").textContent = m.msg; show("tLoad"); break;
    case "q": renderQ(m); break;
    case "result": renderResult(m); break;
    case "level": renderLevel(m); break;
    case "cgo": startChrono(m.ms); break;
    case "cboard": T.board = m.list; renderRace(); break;
    case "mq": renderMQ(m); break;
    case "mboard": T.mboard = m.list; renderMSide(); break;
    case "mspec": renderMSpec(m); break;
    case "mout": break; // visible dans la colonne de droite
    case "bets": betCount(m.count); break;
    case "rope": renderDuel(m); break;
    case "rcount": $("gLive").replaceChildren(el("span", "chip", `${m.n} / ${m.total} ont répondu`)); break;
    case "imp": renderImp(m); break;
    case "ivoted": $("tImpLive").replaceChildren(el("span", "chip", `${m.count} / ${m.total} ont voté`)); break;
    case "iclued": $("tImpLive").replaceChildren(el("span", "chip", `${m.count} / ${m.total} indices écrits`)); break;
    case "go": betsGo(m); break;
    case "end": if (m.kind === "duel" && !$("tDuel").hidden) duelFinale(m); else renderEnd(m); break; // la corde casse, puis le podium
    case "react": bubble(m.name, TAUNTS[m.r] || "", `r${m.r} ${m.sk || ""}`); break;
    case "chat": chat(m.name, m.text, m.sk); break;
    case "host": T.host = m.host; hostTheme(); break;
  }
}

/* ---------- salle d'attente ---------- */
function renderLobby(m) {
  T.kind = m.cfg.kind || "survie";
  T.pl = Object.fromEntries(m.players.map((p) => [p.id, p]));
  T.host = m.host; hostTheme();
  m.players.forEach((p) => setFrame(p.name, (p.cos || {}).frame)); // cadres des joueurs
  if (m.phase !== "lobby") return;
  const link = `${location.origin}/?tv=${m.code}`; // lu par le scanner de l'appli (ou l'appareil photo)
  if ($("tQr").dataset.code !== m.code) { $("tQr").dataset.code = m.code; $("tQr").src = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=8&data=${encodeURIComponent(link)}`; }
  $("tLobbyInfo").textContent = m.players.length ? `${KIND[T.kind]} · ${plural(m.players.length, "joueur")}` : "";
  const host = T.pl[m.host];
  $("tWait").textContent = host ? `${host.name} choisit le mode et lance la partie…` : "Le premier qui scanne choisit le mode et lance la partie.";
  $("tPlayers").replaceChildren(...m.players.map((p) => { const c = el("span", "chip"); c.append(avatarEl(p.name, p.photo), document.createTextNode(p.name)); return c; }));
  T.who = null;
  show("tLobby");
}

/* ---------- minuteur en anneau ---------- */
function stopRing() { cancelAnimationFrame(T.raf); T.raf = 0; }
function ring(arcId, clockId, ringId, sec, total) {
  stopRing();
  $(ringId).hidden = !sec;
  if (!sec) return;
  const end = performance.now() + sec * 1000, len = 264;
  const tick = () => {
    const left = Math.max(0, end - performance.now()), s = Math.ceil(left / 1000);
    $(arcId).style.strokeDashoffset = len * (1 - left / (total * 1000));
    $(clockId).textContent = s;
    $(ringId).classList.toggle("urgent", s <= 5);
    if (left > 0) T.raf = requestAnimationFrame(tick);
  };
  tick();
}

/* ---------- la question ---------- */
function paint(m) {
  $("gVerdict").hidden = true;
  $("gTag").textContent = m.tag;
  const card = $("gCard"); card.classList.remove("enter"); void card.offsetWidth; card.classList.add("enter");
  $("gText").textContent = m.q;
  const im = $("gImg");
  if (m.img) { im.hidden = false; im.onerror = () => (im.hidden = true); im.src = m.img; } else { im.hidden = true; im.removeAttribute("src"); }
  const au = $("tAudio"); au.pause();
  if (m.audio) { au.src = `/api/audio?u=${encodeURIComponent(m.audio)}`; au.currentTime = 0; au.play().catch(() => {}); } else au.removeAttribute("src"); // l'extrait passe sur la télé
  $("gOpts").replaceChildren(...m.options.map((o, i) => el("div", `opt o${i % 4}`, o)));
  $("gLive").replaceChildren();
}
function reveal(answer, picked) {
  [...$("gOpts").children].forEach((b, i) => {
    if (b.textContent === answer) b.classList.add("right");
    else if (i === picked) b.classList.add("wrong");
    else b.classList.add("dim");
  });
}
function verdict(text, kind) { const v = $("gVerdict"); v.className = `verdict ${kind}`; v.textContent = text; v.hidden = false; }
// écran « Au tour de… » quand le joueur change
function splash(name, ph) {
  const s = $("gSplash");
  $("gSplashAv").replaceChildren(avatarEl(name, ph, true));
  $("gSplashName").textContent = name;
  s.hidden = false; s.style.animation = "none"; void s.offsetWidth; s.style.animation = "";
  clearTimeout(T.splashT); T.splashT = setTimeout(() => (s.hidden = true), 1400);
}

/* ---------- Le Duel ---------- */
function duelFinale(m) {
  clearInterval(T.dtid);
  const w = m.winner;
  if (w) $("tDuelKnot").style.left = $("tDuelA").textContent.includes(w) ? "8%" : "92%"; // le nœud file vers le gagnant
  $("tDuelMsg").textContent = w ? `La corde a cédé : ${w} gagne le duel !` : "Égalité : la corde tient bon !";
  if (w) setTimeout(() => $("tDuelTrack").classList.add("snap"), 450);
  setTimeout(() => { $("tDuelTrack").classList.remove("snap"); renderEnd(m); }, w ? 2900 : 1800);
}
function renderDuel(m) {
  stopRing(); clearInterval(T.dtid);
  const [a, b] = m.players;
  const side = (p) => { const d = el("div"); d.append(avatarEl(p.name, p.photo || photo(p.id), true), el("span", null, p.name), el("small", null, `${p.score}`)); return d.childNodes; };
  $("tDuelA").replaceChildren(...side(a)); $("tDuelB").replaceChildren(...side(b));
  $("tDuelKnot").style.left = `${50 + (m.rope / m.steps) * 42}%`; // a tire vers la gauche, b vers la droite
  if (m.by && m.ok) $("tDuelMsg").textContent = `${(m.by === a.id ? a : b).name} tire !`;
  const end = Date.now() + m.left;
  const tick = () => { const t = Math.max(0, Math.ceil((end - Date.now()) / 1000)); $("tDuelTime").textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
  tick(); T.dtid = setInterval(tick, 500);
  show("tDuel");
}

/* ---------- L'Imposteur ---------- */
function renderImp(m) {
  stopRing();
  $("tImpRound").textContent = `L'Imposteur · manche ${m.round} / ${m.rounds}`;
  const live = $("tImpLive");
  if (m.phase === "clue") {
    $("tImpTitle").textContent = m.q;
    $("tImpText").textContent = "Chacun écrit un indice sur son téléphone… L'imposteur, lui, ne connaît pas la réponse !";
    live.replaceChildren(el("span", "chip", `${m.count || 0} / ${m.total} indices écrits`));
  } else if (m.phase === "talk") {
    $("tImpTitle").textContent = m.q;
    $("tImpText").textContent = m.clues ? "Les indices sont tombés ! Lequel sonne faux ?" : "Discutez ! Un imposteur ne connaît pas la réponse…";
    live.replaceChildren(...(m.clues || []).map((c) => el("span", "chip", `${c.name} : ${c.clue}`)));
  } else if (m.phase === "vote") {
    $("tImpTitle").textContent = "Qui est l'imposteur ?";
    $("tImpText").textContent = "Votez sur vos téléphones.";
    live.replaceChildren(el("span", "chip", `${m.count || 0} / ${m.total} ont voté`));
  } else if (m.phase === "guess") {
    $("tImpTitle").textContent = `${m.name} est démasqué !`;
    $("tImpText").textContent = "Dernière chance : il doit écrire la bonne réponse…";
    live.replaceChildren();
  } else if (m.phase === "result") {
    $("tImpTitle").textContent = m.caught && !m.guessed ? `${m.impName} était l'imposteur !` : m.caught ? `${m.impName} a trouvé la réponse !` : `L'imposteur était ${m.impName} !`;
    $("tImpText").textContent = `La réponse : ${m.answer}`;
    live.replaceChildren(...[...m.board].sort((a, b) => b.points - a.points).map((p) => {
      const c = el("span", "chip"); c.append(avatarEl(p.name, p.photo || photo(p.id)), document.createTextNode(` ${p.name} · ${p.points} pts${p.gain ? ` (+${p.gain})` : ""}`)); return c;
    }));
    if (m.caught && !m.guessed) confetti();
  }
  show("tImp");
}

/* ---------- Survie et Équipes ---------- */
function renderQ(m) {
  T.last = m;
  paint(m);
  $("gWho").replaceChildren(avatarEl(m.name, photo(m.who), true), el("span", null, m.name));
  $("gCount").textContent = m.royale ? `${m.alive} debout · ${m.sec} s` : m.teams ? `Équipe ${m.team}` : `Question ${m.qn || ""}`.trim();
  const sec = m.ms ? m.ms / 1000 : 0;
  ring("gArc", "gClock", "gRing", sec, sec);
  renderSide(m.board, m.who, m.teams);
  if (m.bet) { verdict(`${m.final ? "Manche finale, gains doublés ! " : ""}Faites vos paris : ${m.name} va-t-il réussir ?`, "bet"); betCount(0); }
  show("tGame");
  if (T.who !== m.who && (m.board || []).length > 1) splash(m.name, photo(m.who));
  T.who = m.who;
}
// Les Parieurs : les paris de chacun, sous la question (puis gagnés ou perdus)
function betChips(list) {
  $("gLive").replaceChildren(...(list || []).map((b) => {
    const c = el("span", "chip" + (b.won === true ? " won" : b.won === false ? " lost" : ""));
    c.append(avatarEl(b.name, photo(b.id)), document.createTextNode(` ${b.name} · ${!b.amt ? "passe" : `${b.yes ? "réussit" : "se trompe"} · ${b.amt}`}${b.won === true ? ` · +${b.delta ?? b.amt}` : b.won === false ? ` · −${b.amt}` : ""}`));
    return c;
  }));
}
// avant le résultat, la télé ne montre que le nombre de paris (celui qui répond la regarde aussi)
function betCount(n) {
  $("gLive").replaceChildren(el("span", "chip", n ? `${n} pari${n > 1 ? "s" : ""} placé${n > 1 ? "s" : ""} · montants secrets` : "En attente des paris…"));
}
function betsGo(m) { // les paris sont fermés : la réponse arrive
  $("gVerdict").hidden = true;
  betCount(m.count);
  const sec = m.ms ? m.ms / 1000 : 0;
  ring("gArc", "gClock", "gRing", sec, sec);
}
function renderResult(m) {
  stopRing();
  if (m.royale) { // Le Dernier Debout : qui tombe à cette manche
    reveal(m.answer, -1);
    verdict(m.saved ? "Tout le monde s'est trompé : personne ne tombe !" : m.out.length ? `Éliminé${m.out.length > 1 ? "s" : ""} : ${m.out.join(", ")}` : "Tout le monde reste debout !", m.out.length ? "ko" : "ok");
    $("gLive").replaceChildren(el("span", "chip", `${m.alive} encore debout`));
    return renderSide(m.board, null, null);
  }
  reveal(m.answer, m.picked);
  verdict(m.correct ? `Bonne réponse de ${m.name} !${m.gain ? ` +${m.gain} jetons` : ""}${m.revenge ? ` · vengeance +${m.revenge}` : ""}` : m.dead ? `${m.name} est éliminé` : m.picked < 0 ? "Temps écoulé !" : `Raté pour ${m.name}`, m.correct ? "ok" : "ko");
  if (m.bets) betChips(m.bets);
  renderSide(m.board, m.who, m.teams);
}
// colonne de droite : les joueurs (Survie) ou les équipes
function renderSide(board, cur, teams) {
  const side = $("gSide");
  if (!board) return;
  if (teams) {
    const max = Math.max(1, ...teams.map((t) => t.points));
    side.replaceChildren(el("h3", null, "Équipes"), ...teams.map((t, k) => {
      const d = el("div", `team t${k}`);
      const h = el("div", "th"); h.append(el("span", null, t.name), el("span", "tp", `${t.points}`));
      const ms = el("div", "tm");
      board.filter((p) => p.team === k).forEach((p) => ms.append(el("span", p.id === cur ? "cur" : "", p.name)));
      d.style.opacity = 0.75 + 0.25 * (t.points / max);
      d.append(h, ms); return d;
    }));
    return;
  }
  if (T.kind === "royale") { // Le Dernier Debout : les survivants en haut
    side.replaceChildren(el("h3", null, `Debout · ${board.filter((p) => !p.dead).length}`), ...[...board].sort((a, b) => a.dead - b.dead || b.score - a.score).map((p) => {
      const r = el("div", "prow" + (p.dead ? " dead" : ""));
      r.append(avatarEl(p.name, photo(p.id)), el("span", "pn", p.name), el("span", "pv", p.dead ? "éliminé" : `${p.score} ✓`));
      return r;
    }));
    return;
  }
  if (T.kind === "parieurs") { // les plus riches en haut
    side.replaceChildren(el("h3", null, "Jetons"), ...[...board].sort((a, b) => b.points - a.points).map((p) => {
      const r = el("div", "prow" + (p.id === cur ? " cur" : ""));
      r.append(avatarEl(p.name, photo(p.id)), el("span", "pn", p.name), el("span", "pv", `${p.points}`));
      return r;
    }));
    return;
  }
  const rows = [...board].sort((a, b) => (a.dead - b.dead) || b.score - a.score);
  side.replaceChildren(el("h3", null, `Joueurs · ${board.filter((p) => !p.dead).length} en vie`), ...rows.map((p) => {
    const r = el("div", "prow" + (p.id === cur ? " cur" : "") + (p.dead ? " dead" : ""));
    r.append(avatarEl(p.name, photo(p.id)), el("span", "pn", p.name), el("span", "pv hearts", p.dead ? "éliminé" : "♥︎".repeat(Math.max(0, Math.min(p.lives, 5))) || "♥︎ 0"));
    return r;
  }));
}
function renderLevel(m) {
  stopRing();
  $("tLevelText").textContent = `Niveau ${LEVELS[m.diff]}`;
  $("tLevels").replaceChildren(...[1, 2, 3, 4, 5].map((n) => { const s = el("span", n <= m.diff ? "on" : "", n); s.style.animationDelay = `${n * 0.08}s`; return s; }));
  show("tLevel");
}

/* ---------- Millionnaire ---------- */
function renderMQ(m) {
  T.last = m;
  paint(m);
  $("gWho").replaceChildren(el("span", null, `Pour ${euros(PRIZES[m.n])}`));
  $("gCount").textContent = `Question ${m.n + 1} / 15`;
  ring("gArc", "gClock", "gRing", m.time, m.total);
  T.mn = m.n;
  renderMSide();
  show("tGame");
}
function renderMSide() {
  if (!T.last || T.last.t !== "mq") return;
  const n = T.mn || 0;
  const lad = el("ol", "ladder");
  PRIZES.forEach((p, i) => {
    const li = el("li", (i < n ? "done " : "") + (i === n ? "now " : "") + (SAFE.includes(i + 1) ? "safe" : ""));
    li.append(el("span", "n", i + 1), el("span", null, euros(p)));
    lad.append(li);
  });
  $("gSide").replaceChildren(el("h3", null, "Échelle"), lad);
  $("gLive").replaceChildren(...T.mboard.map((p) => {
    const c = el("span", "chip" + (p.out ? " out" : p.answered ? " ok" : ""));
    c.append(avatarEl(p.name, photo(p.id)), document.createTextNode(`${p.name} · ${euros(p.won)}${p.out ? " · sorti" : ""}`)); // la couleur dit qui a répondu
    return c;
  }));
}
function renderMSpec(m) {
  stopRing();
  reveal(m.answer, -1);
  const out = m.results.filter((r) => !r.correct || r.stopped);
  verdict(out.length ? out.map((r) => (r.stopped ? `${r.name} s'arrête (${euros(r.won)})` : r.out && r.correct ? `${r.name} : 1 000 000 € !` : `${r.name} éliminé (${euros(r.won)})`)).join(" · ") : "Tout le monde a juste !", out.length ? "info" : "ok");
}

/* ---------- Chrono : la course ---------- */
function startChrono(ms) {
  T.board = [];
  const total = (ms || 60000) / 1000, end = performance.now() + ms;
  cancelAnimationFrame(T.craf);
  const tick = () => { // compte à rebours indicatif (chacun a son propre chrono, en pause pendant les corrections)
    const left = Math.max(0, end - performance.now());
    $("cArc").style.strokeDashoffset = 264 * (1 - left / (total * 1000));
    $("cClock").textContent = Math.ceil(left / 1000);
    if (left > 0) T.craf = requestAnimationFrame(tick);
  };
  tick();
  renderRace(); show("tChrono");
}
function renderRace() {
  const ol = $("cRace");
  const before = new Map([...ol.children].map((li) => [li.dataset.id, li.getBoundingClientRect().top])); // pour animer les dépassements
  const max = Math.max(1, ...T.board.map((p) => p.points));
  const done = T.board.filter((p) => p.done).length;
  $("cInfo").textContent = done ? `${done} / ${T.board.length} ont fini` : "Tout le monde joue en même temps";
  ol.replaceChildren(...T.board.slice(0, 8).map((p, i) => {
    const li = el("li", p.done ? "done" : ""); li.dataset.id = p.id;
    const tr = el("div", "track"), bar = el("i"); bar.style.width = `${(100 * p.points) / max}%`; tr.append(bar);
    const mid = el("div", "mid"); mid.append(el("span", "rn", p.name + (p.done ? " · fini" : "")), tr); // le nom au-dessus de sa barre
    li.append(el("span", "pos", i + 1), avatarEl(p.name, photo(p.id)), mid, el("span", null, `${p.points} pts`));
    return li;
  }));
  [...ol.children].forEach((li) => { const t0 = before.get(li.dataset.id); if (t0 == null) return; const dy = t0 - li.getBoundingClientRect().top; if (dy) { li.style.transition = "none"; li.style.transform = `translateY(${dy}px)`; requestAnimationFrame(() => { li.style.transition = ""; li.style.transform = ""; }); } });
}

/* ---------- fin : podium et confettis ---------- */
function renderEnd(m) {
  stopRing(); clearInterval(T.dtid); cancelAnimationFrame(T.craf);
  const fmt = (p) => (m.kind === "million" ? euros(p.points) : m.kind === "parieurs" ? `${p.points} jetons` : m.kind === "imposteur" ? `${p.points} pts` : m.kind === "royale" || m.kind === "duel" ? `${p.score} bonne${p.score > 1 ? "s" : ""}` : m.kind === "chrono" || m.kind === "equipes" ? `${p.points} pts` : `${p.score} bonne${p.score > 1 ? "s" : ""}`);
  $("tEndLead").textContent = m.winner ? "Vainqueur" : "Partie terminée";
  $("tWinner").textContent = m.winner || "Égalité";
  const top = m.ranking.slice(0, 3);
  const order = [top[1], top[0], top[2]].map((p, k) => [p, [2, 1, 3][k]]).filter(([p]) => p); // 2e · 1er · 3e
  $("tPodium").replaceChildren(...order.map(([p, rank]) => {
    const d = el("div", `step p${rank}`);
    d.append(avatarEl(p.name, p.photo || photo(p.id)), el("span", null, p.name), el("small", null, fmt(p)), el("div", "block", rank));
    return d;
  }));
  $("tRest").replaceChildren(...m.ranking.slice(3, 8).map((p, i) => {
    const li = el("li");
    li.append(el("span", "pos", i + 4), avatarEl(p.name, p.photo || photo(p.id)), el("span", "nm", p.name), el("span", null, fmt(p)));
    return li;
  }));
  show("tEnd");
  confetti();
}
function confetti() {
  const cols = ["#ffe14d", "#34e3b0", "#ff3b5c", "#62c7ff", "#f6f3ff"];
  for (let i = 0; i < 90; i++) {
    const c = el("div", "conf");
    c.style.left = `${Math.random() * 100}vw`; c.style.background = cols[i % cols.length];
    c.style.animationDuration = `${2.2 + Math.random() * 2}s`; c.style.animationDelay = `${Math.random() * 0.8}s`;
    document.body.append(c); setTimeout(() => c.remove(), 5000);
  }
}

/* ---------- réactions et messages des joueurs ---------- */
// la télé prend le thème de l'appli de l'hôte (Myrtille, Minuit, Océan…)
function hostTheme() {
  const th = ((T.pl[T.host] || {}).cos || {}).theme;
  if (th) document.documentElement.dataset.theme = th; else delete document.documentElement.dataset.theme;
}
// le chat : les messages s'empilent en bas à droite, restent quelques secondes puis s'effacent
function chat(name, text, sk) {
  const box = $("tChat"), d = el("div", `cmsg ${sk || ""}`);
  d.append(el("b", null, name), el("span", null, text));
  box.append(d);
  while (box.children.length > 5) box.firstElementChild.remove(); // les plus anciens laissent la place
  setTimeout(() => { d.classList.add("out"); setTimeout(() => d.remove(), 400); }, 9000);
}
function bubble(name, text, cls) {
  const d = el("div", `bubble ${cls}`);
  d.append(el("b", null, name), document.createTextNode(` ${text}`));
  d.style.left = `${6 + Math.random() * 50}vw`;
  d.onanimationend = () => d.remove();
  document.body.append(d);
}
