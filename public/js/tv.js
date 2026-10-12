// Quizly TV : la télé s'abonne à un salon et affiche la partie en grand. Elle ne joue pas.
import { avatarEl } from "./million.js";
import { euros, PRIZES } from "./local.js";
import { THEMES } from "./questions.js";

const $ = (id) => document.getElementById(id);
const LEVELS = ["", "Facile", "Moyen", "Difficile", "Expert", "Légende"];
const T = { ws: null, code: "", pl: {}, kind: "survie", timer: null, cur: null, board: [], mboard: [] };

function show(id) {
  document.querySelectorAll(".screen").forEach((s) => (s.hidden = s.id !== id));
  if (id !== "tQuestion") $("tAudio").pause();
}
const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
const photo = (id) => (T.pl[id] && T.pl[id].photo) || "";

/* ---------- connexion : la télé crée son propre salon (caché, rejoint uniquement par le QR code) ---------- */
const sendWs = (o) => T.ws && T.ws.readyState === 1 && T.ws.send(JSON.stringify(o));
function connect() {
  $("tMsg").textContent = T.code ? "Reconnexion…" : "Préparation du salon télé…";
  $("tGo").hidden = true;
  if (T.ws) try { T.ws.onclose = null; T.ws.close(); } catch {}
  const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  T.ws = ws;
  ws.onopen = () => sendWs(T.code ? { t: "tv", code: T.code } : { t: "tvcreate", themes: THEMES }); // on retrouve le même salon après une coupure
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); };
  ws.onclose = () => { if (T.ws === ws) setTimeout(() => T.ws === ws && connect(), 3000); }; // le serveur gratuit peut couper : on se reconnecte
}
$("tGo").onclick = () => { T.code = ""; connect(); };
$("tSound").onclick = () => { $("tAudio").play().catch(() => {}); $("tAudio").pause(); $("tSound").hidden = true; }; // un clic autorise le son des extraits
connect();

/* ---------- messages du serveur ---------- */
function onMsg(m) {
  switch (m.t) {
    case "error": // salon perdu (serveur redémarré…) : on en recrée un
      if (T.code) { T.code = ""; sendWs({ t: "tvcreate", themes: THEMES }); }
      else { $("tMsg").textContent = m.msg; $("tGo").hidden = false; show("tJoin"); }
      break;
    case "closed": T.code = ""; sendWs({ t: "tvcreate", themes: THEMES }); break;
    case "tvok": T.code = m.code; break;
    case "lobby": renderLobby(m); break;
    case "load": stopBar(); $("tLoadText").textContent = m.msg || "L'IA prépare la question…"; show("tLoad"); break;
    case "fail": stopBar(); $("tLoadText").textContent = m.msg; show("tLoad"); break;
    case "q": renderQ(m); break;
    case "result": renderResult(m); break;
    case "level":
      stopBar();
      $("tLevelText").textContent = `Niveau actuel : ${LEVELS[m.diff]}`;
      show("tLevel");
      break;
    case "cgo": $("tChronoInfo").textContent = "Tout le monde joue en même temps"; renderBoard(); show("tChrono"); break;
    case "cboard": T.board = m.list; renderBoard(); break;
    case "mq": renderMQ(m); break;
    case "mboard": T.mboard = m.list; renderMLive(); break;
    case "mspec": renderMSpec(m); break;
    case "end": renderEnd(m); break;
  }
}

/* ---------- salle d'attente ---------- */
function renderLobby(m) {
  T.kind = m.cfg.kind || "survie";
  T.pl = Object.fromEntries(m.players.map((p) => [p.id, p]));
  if (m.phase !== "lobby") return; // partie en cours ou podium affiché : on ne repasse pas au salon
  const link = `${location.origin}/?tv=${m.code}`; // lu par le scanner de l'appli (ou l'appareil photo du téléphone)
  if ($("tQr").dataset.code !== m.code) { $("tQr").dataset.code = m.code; $("tQr").src = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=8&data=${encodeURIComponent(link)}`; }
  const kind = { survie: "Survie", chrono: "Chrono 60 s", million: "Qui veut gagner des millions" }[T.kind];
  $("tLobbyInfo").textContent = m.players.length ? `${kind} · ${plural(m.players.length, "joueur")}` : "";
  const host = T.pl[m.host];
  $("tWait").textContent = host ? `${host.name} choisit le mode et lance la partie…` : "En attente du premier joueur…";
  $("tPlayers").replaceChildren(...m.players.map((p) => {
    const c = document.createElement("span"); c.className = "chip";
    c.append(avatarEl(p.name, p.photo), document.createTextNode(p.name));
    return c;
  }));
  show("tLobby");
}

/* ---------- minuteur ---------- */
function stopBar() { cancelAnimationFrame(T.timer); T.timer = null; }
function startBar(sec, total) {
  stopBar();
  $("tBarBox").hidden = !sec;
  if (!sec) return;
  const end = performance.now() + sec * 1000;
  const tick = () => {
    const left = Math.max(0, end - performance.now());
    $("tBar").style.transform = `scaleX(${left / (total * 1000)})`;
    $("tBar").style.background = left < 5000 ? "var(--coral)" : "var(--mint)";
    if (left > 0) T.timer = requestAnimationFrame(tick);
  };
  tick();
}

/* ---------- question ---------- */
function paintQuestion(m) {
  $("tTag").textContent = m.tag;
  $("tText").textContent = m.q;
  const im = $("tImg");
  if (m.img) { im.hidden = false; im.onerror = () => (im.hidden = true); im.src = m.img; } else { im.hidden = true; im.removeAttribute("src"); }
  const au = $("tAudio");
  au.pause();
  if (m.audio) { au.src = m.audio; au.currentTime = 0; au.play().catch(() => {}); } else au.removeAttribute("src"); // l'extrait passe sur la télé
  $("tOpts").replaceChildren(...m.options.map((o, i) => {
    const b = document.createElement("div"); b.className = `opt o${i % 4}`; b.textContent = o; return b;
  }));
  $("tStatus").textContent = "";
  $("tLive").replaceChildren();
}
function reveal(answer, picked) {
  [...$("tOpts").children].forEach((b, i) => {
    if (b.textContent === answer) b.classList.add("right");
    else b.classList.add("dim");
  });
}
function renderQ(m) { // Survie : la question du joueur dont c'est le tour
  T.cur = m;
  paintQuestion(m);
  $("tWho").replaceChildren(avatarEl(m.name, photo(m.who), true), document.createTextNode(`Au tour de ${m.name}`));
  $("tStatus").textContent = `♥︎ ${m.lives} · ${plural(m.alive, "joueur")} en vie`;
  startBar(m.ms ? m.ms / 1000 : 0, m.ms ? m.ms / 1000 : 0);
  show("tQuestion");
}
function renderResult(m) {
  stopBar();
  reveal(m.answer, m.picked);
  $("tStatus").textContent = m.correct ? `Bonne réponse de ${m.name} !` : m.dead ? `${m.name} est éliminé` : m.picked < 0 ? "Temps écoulé" : `Raté pour ${m.name}`;
}

/* ---------- Chrono : classement en direct ---------- */
function renderBoard() {
  const done = T.board.filter((p) => p.done).length;
  if (T.board.length) $("tChronoInfo").textContent = done ? `${done} / ${T.board.length} ont fini` : "Tout le monde joue en même temps";
  $("tBoard").replaceChildren(...T.board.slice(0, 10).map((p, i) => {
    const li = document.createElement("li");
    li.className = (i === 0 ? "first" : "") + (p.done ? " done" : "");
    const pos = document.createElement("span"); pos.className = "pos"; pos.textContent = i + 1;
    const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = p.name + (p.done ? " ✓" : "");
    const pt = document.createElement("span"); pt.textContent = `${p.points} pts`;
    li.append(pos, avatarEl(p.name, photo(p.id)), nm, pt);
    return li;
  }));
}

/* ---------- Millionnaire ---------- */
function renderMQ(m) {
  T.cur = m;
  paintQuestion(m);
  $("tWho").replaceChildren(document.createTextNode(`Question ${m.n + 1} / 15 · ${euros(PRIZES[m.n])}`));
  startBar(m.time, m.total);
  renderMLive();
  show("tQuestion");
}
function renderMLive() {
  if (!T.cur || T.cur.t !== "mq") return;
  const still = T.mboard.filter((p) => !p.out);
  $("tLive").replaceChildren(...still.map((p) => {
    const c = document.createElement("span"); c.className = "chip" + (p.answered ? " ok" : "");
    c.append(avatarEl(p.name, photo(p.id)), document.createTextNode(`${p.name} · ${p.answered ? "a répondu" : "réfléchit…"}`));
    return c;
  }));
  $("tStatus").textContent = still.length ? `${plural(still.length, "joueur")} encore en jeu` : "";
}
function renderMSpec(m) {
  stopBar();
  reveal(m.answer, -1);
  $("tStatus").textContent = m.results.map((r) => `${r.name} : ${r.stopped ? `s'arrête (${euros(r.won)})` : r.correct ? (r.out ? "1 000 000 € !" : `✓ ${euros(r.won)}`) : `✗ ${euros(r.won)}`}`).join(" · ");
  $("tLive").replaceChildren();
}

/* ---------- fin : podium ---------- */
function renderEnd(m) {
  stopBar();
  const fmt = (p) => (m.kind === "million" ? euros(p.points) : m.kind === "chrono" ? `${p.points} pts` : `${p.score} bonne${p.score > 1 ? "s" : ""}`);
  $("tEndLead").textContent = m.winner ? "Vainqueur" : "Partie terminée";
  $("tWinner").textContent = m.winner || "Égalité";
  const top = m.ranking.slice(0, 3);
  const order = [top[1], top[0], top[2]].map((p, k) => [p, [2, 1, 3][k]]).filter(([p]) => p); // 2e · 1er · 3e
  $("tPodium").replaceChildren(...order.map(([p, rank]) => {
    const d = document.createElement("div"); d.className = `step p${rank}`;
    const nm = document.createElement("span"); nm.textContent = p.name;
    const sc = document.createElement("small"); sc.textContent = fmt(p);
    const bl = document.createElement("div"); bl.className = "block"; bl.textContent = rank;
    d.append(avatarEl(p.name, p.photo || photo(p.id)), nm, sc, bl);
    return d;
  }));
  $("tRest").replaceChildren(...m.ranking.slice(3, 8).map((p, i) => {
    const li = document.createElement("li");
    const pos = document.createElement("span"); pos.className = "pos"; pos.textContent = i + 4;
    const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = p.name;
    const sc = document.createElement("span"); sc.textContent = fmt(p);
    li.append(pos, avatarEl(p.name, p.photo || photo(p.id)), nm, sc);
    return li;
  }));
  show("tEnd");
}
