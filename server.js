import "dotenv/config";
import express from "express";
import { WebSocketServer } from "ws";
import { LOCAL_THEMES, makeLocal } from "./public/js/local.js";

const app = express();
app.use(express.json({ limit: "60kb" }));

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
  512: "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",
};
app.get("/icons/icon-:n.png", (req, res) => {
  const b = ICONS[req.params.n];
  if (!b) return res.sendStatus(404);
  res.type("png").set("Cache-Control", "public, max-age=86400").send(Buffer.from(b, "base64"));
});
app.use(express.static("public"));

/* ====================== Génération des questions ====================== */
const SYSTEM = `Quiz en français. Réponds uniquement par un tableau JSON compact, sans texte ni Markdown :
[{"t":thème,"q":question,"a":bonne réponse courte,"w":[3 mauvaises réponses plausibles],"c":certitude de 1 à 5}]
Fiabilité : n'écris que des faits dont tu es absolument certain ; une seule bonne réponse indiscutable ; aucune question ambiguë.
Évite : les événements postérieurs à 2023, les classements, records, statistiques ou palmarès qui ont pu changer, les « le plus / le meilleur » sans consensus, les chiffres très précis. Si tu hésites, change de question. "c" = ta certitude (5 = certain à 100 %).
Thème « Musique » : musique moderne uniquement (2000 à aujourd'hui) : rap US et FR, R&B, pop actuelle, afrobeats. Jamais de classique ni de variété ancienne.`;

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

async function generate(themes, diff, count, avoid) {
  if (!KEY) throw new Error("AI_API_KEY manquante côté serveur");
  const prompt = `${count} questions, thèmes : ${themes.join(", ")}. Difficulté ${diff}/5. Varie les sous-thèmes, les époques et les pays, mais reste sur des faits établis. Graine ${Math.random().toString(36).slice(2, 7)}.` +
    (avoid.length ? `\nDéjà posées (ne pas reposer ni reformuler) :\n- ${avoid.join("\n- ")}` : "");
  const r = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.6,
      ...(MODEL.includes("gpt-oss") ? { reasoning_effort: EFFORT } : {}),
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }]
    })
  });
  if (r.status === 429) { const e = new Error("L'IA est saturée, réessayez dans une minute."); e.status = 429; throw e; }
  if (!r.ok) throw new Error(`API ${r.status} ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const text = data.choices?.[0]?.message?.content || "";
  const raw = JSON.parse(text.replace(/```json|```/g, "").trim());
  const list = Array.isArray(raw) ? raw : (Object.values(raw || {}).find(Array.isArray) || []);
  const questions = list
    .map((x) => ({
      t: String(x?.t || themes[0]), d: diff, q: String(x?.q || ""), a: String(x?.a || ""),
      c: x?.c == null ? 5 : Number(x.c),
      w: (Array.isArray(x?.w) ? x.w : Array.isArray(x?.o) ? x.o : []).map(String).filter((o) => o !== String(x?.a)).slice(0, 3)
    }))
    .filter((x) => x.q && x.a && x.w.length === 3 && x.c >= 4) // on écarte les questions dont l'IA doute
    .map(({ w, c, ...x }) => ({ ...x, o: [x.a, ...w] }));
  if (!questions.length) throw new Error("Réponse vide");
  return questions;
}

const hits = new Map(); // 10 requêtes / minute / IP
app.post("/api/questions", async (req, res) => {
  const now = Date.now();
  const recent = (hits.get(req.ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 10) return res.status(429).json({ error: "Trop de requêtes, patientez." });
  hits.set(req.ip, [...recent, now]);

  const themes = (Array.isArray(req.body.themes) ? req.body.themes : []).slice(0, 15).map((t) => String(t).slice(0, 30));
  const diff = Math.min(Math.max(+req.body.difficulty || 1, 1), 5);
  const count = Math.min(Math.max(+req.body.count || 6, 1), 10);
  const avoid = (Array.isArray(req.body.avoid) ? req.body.avoid : []).slice(-20).map((x) => String(x).slice(0, 70));
  if (!themes.length) return res.status(400).json({ error: "Aucun thème" });
  try { res.json({ questions: await generate(themes, diff, count, avoid) }); }
  catch (e) {
    console.error(e.message);
    res.status(e.status || 502).json({ error: e.status === 429 ? e.message : "Génération impossible, réessayez." });
  }
});

/* ====================== Salles en ligne (WebSocket) ====================== */
const rooms = new Map();
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join(""); } while (rooms.has(c)); return c; };
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const players = (room) => [...room.players.values()];
const alive = (room) => players(room).filter((p) => !p.dead);
const cast = (room, o) => players(room).forEach((p) => send(p.ws, o));
const clean = (s, n = 20) => String(s || "").replace(/[<>]/g, "").trim().slice(0, n);
const clamp = (v, a, b) => Math.min(b, Math.max(a, Number.isFinite(v) ? v : a));
const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);

function lobbyMsg(room, p) {
  return {
    t: "lobby", code: room.code, host: room.hostId, you: p.id, phase: room.phase, cfg: room.cfg,
    players: players(room).filter((x) => !x.left).map(({ id, name, photo, ci }) => ({ id, name, photo, ci }))
  };
}
const castLobby = (room) => players(room).forEach((p) => !p.left && send(p.ws, lobbyMsg(room, p)));

function okPhoto(s) {
  s = String(s || "");
  if (s.startsWith("https://lh3.googleusercontent.com/")) return s.slice(0, 300);
  return /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s) && s.length <= 9000 ? s : ""; // photo d'un compte local
}

function join(ws, room, name, photo) {
  const base = clean(name) || "Joueur";
  let n = base, k = 2;
  while (players(room).some((p) => !p.left && p.name.toLowerCase() === n.toLowerCase())) n = `${base} ${k++}`;
  const p = {
    id: Math.random().toString(36).slice(2, 9), ws, name: n,
    photo: okPhoto(photo),
    lives: 0, score: 0, points: 0, dead: false, outAt: 0, left: false, ci: room.nextCi++
  };
  room.players.set(p.id, p); ws.room = room; ws.pid = p.id;
  return p;
}

function resetRoom(room) {
  clearTimeout(room.timer);
  Object.assign(room, { phase: "lobby", diff: 1, buf: [], asked: [], played: new Set(), i: -1, elim: 0, q: null, loading: null });
  room.players.forEach((p, id) => { if (p.left) room.players.delete(id); });
}

/* --- questions d'une salle --- */
function fill(room) {
  const d = room.diff;
  if (room.loading && room.loading.d === d) return room.loading.p;
  const themes = shuffle(room.cfg.themes.filter((t) => !LOCAL_THEMES.includes(t))).slice(0, 5);
  if (!themes.length) return Promise.resolve();
  const p = generate(themes, d, 6, room.asked.filter((q) => !q.startsWith("~")).slice(-15).map((q) => q.slice(0, 70)))
    .then((qs) => qs.forEach((q) => {
      if (!room.asked.some((a) => norm(a) === norm(q.q)) && !room.buf.some((b) => norm(b.q) === norm(q.q))) room.buf.push({ ...q, d });
    }))
    .finally(() => { if (room.loading && room.loading.p === p) room.loading = null; });
  room.loading = { d, p };
  return p;
}
async function takeQuestion(room) {
  // thèmes « sans IA » (drapeaux, capitales, calcul…) : fabriqués ici, toujours justes
  const locals = room.cfg.themes.filter((t) => LOCAL_THEMES.includes(t));
  const withAI = room.cfg.themes.length > locals.length;
  if (locals.length && (!withAI || Math.random() < locals.length / room.cfg.themes.length)) {
    for (let i = 0; i < 8; i++) {
      const lq = makeLocal(locals[Math.floor(Math.random() * locals.length)], room.diff);
      if (!room.asked.includes(lq.key) || i === 7) { room.asked.push(lq.key); return lq; }
    }
  }
  for (let t = 0; t < 3; t++) {
    const pool = room.buf.filter((q) => !q.u && q.d === room.diff);
    if (pool.length) {
      const q = pool[Math.floor(Math.random() * pool.length)];
      q.u = true; room.asked.push(q.q);
      if (room.buf.filter((x) => !x.u && x.d === room.diff).length < 3) fill(room).catch(() => {});
      return q;
    }
    await fill(room);
  }
  throw new Error("L'IA n'a renvoyé aucune nouvelle question.");
}

/* --- déroulement --- */
function startGame(room) {
  Object.assign(room, { phase: "load", diff: 1, buf: [], asked: [], played: new Set(), i: -1, elim: 0, loading: null });
  players(room).forEach((p) => Object.assign(p, { lives: room.cfg.lives, score: 0, points: 0, dead: false, outAt: 0 }));
  nextTurn(room);
}
function nextTurn(room) {
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
  room.phase = "q";
  const ms = room.cfg.time * 1000;
  clearTimeout(room.timer);
  if (ms) room.timer = setTimeout(() => resolveTurn(room, false, -1), ms);
  cast(room, {
    t: "q", who: p.id, name: p.name, lives: p.lives, alive: alive(room).length, total: ps.filter((x) => !x.left).length + ps.filter((x) => x.left && !x.dead).length,
    tag: `${q.t} · ${LEVELS[room.diff]}`, q: q.q, img: q.img || null, options: room.q.options, ms, diff: room.diff
  });
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
  if (correct) { p.score++; p.points += 10 * room.diff; }
  else { p.lives--; if (p.lives <= 0) { p.dead = true; p.outAt = ++room.elim; } }
  cast(room, { t: "result", who: p.id, name: p.name, correct, picked, answer: room.q.a, lives: p.lives, dead: p.dead });
  room.timer = setTimeout(() => afterTurn(room), 25000); // filet de sécurité : normalement le bouton « Continuer » fait avancer
}
function afterTurn(room) {
  if (!rooms.has(room.code)) return;
  clearTimeout(room.timer);
  if (alive(room).length <= 1) return endGame(room);
  const p = players(room)[room.i];
  if (p) room.played.add(p.id);
  if (!alive(room).every((x) => room.played.has(x.id))) return nextTurn(room);
  room.played.clear();
  askLevel(room);
}
function askLevel(room) {
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
    ranking: order.map((p) => ({ name: p.name, score: p.score, points: p.points, lives: Math.max(p.lives, 0), photo: p.photo }))
  });
}

function leave(ws) {
  const room = ws.room; if (!room) return;
  ws.room = null;
  const me = room.players.get(ws.pid); if (!me) return;
  const lobbyLike = room.phase === "lobby" || room.phase === "end";
  if (lobbyLike) room.players.delete(me.id);
  else { me.left = true; if (!me.dead) { me.dead = true; me.outAt = ++room.elim; } }
  const present = players(room).filter((p) => !p.left);
  if (!present.length) { clearTimeout(room.timer); rooms.delete(room.code); return; }
  if (room.hostId === me.id) { room.hostId = present[0].id; cast(room, { t: "host", host: room.hostId }); }
  if (lobbyLike) return castLobby(room);
  if (alive(room).length <= 1) return endGame(room);
  const turn = players(room)[room.i];
  if (turn && turn.id === me.id && room.phase === "q") { clearTimeout(room.timer); afterTurn(room); }
  else if (room.phase === "level" && room.hostId !== me.id) askLevel(room);
  else if (room.phase === "level") askLevel(room);
}

function readCfg(m) {
  const themes = (Array.isArray(m.themes) ? m.themes : []).map((t) => clean(t, 30)).filter(Boolean).slice(0, 60);
  if (!themes.length) return "Choisissez au moins un thème.";
  return { themes, time: clamp(+m.time, 0, 120), lives: clamp(+m.lives || 2, 1, 5) };
}

function handle(ws, m) {
  if (m.t === "create") {
    if (ws.room) leave(ws);
    const themes = (Array.isArray(m.themes) ? m.themes : []).map((t) => clean(t, 30)).filter(Boolean).slice(0, 60);
    if (!themes.length) return send(ws, { t: "error", msg: "Choisissez au moins un thème." });
    const now = Date.now(), recent = (hits.get("c" + ws.ip) || []).filter((t) => now - t < 60000);
    if (recent.length >= 6) return send(ws, { t: "error", msg: "Trop de salles créées, patientez." });
    hits.set("c" + ws.ip, [...recent, now]);
    const room = {
      code: newCode(), hostId: null, players: new Map(), phase: "lobby",
      cfg: { themes, time: clamp(+m.time, 0, 120), lives: clamp(+m.lives || 2, 1, 5) },
      diff: 1, buf: [], asked: [], played: new Set(), i: -1, elim: 0, q: null, timer: null, loading: null, nextCi: 0
    };
    rooms.set(room.code, room);
    room.hostId = join(ws, room, m.name, m.photo).id;
    return castLobby(room);
  }
  if (m.t === "join") {
    const room = rooms.get(String(m.code || "").toUpperCase().trim());
    if (!room) return send(ws, { t: "error", msg: "Salle introuvable." });
    if (room.phase !== "lobby") return send(ws, { t: "error", msg: "La partie a déjà commencé." });
    if (players(room).length >= 20) return send(ws, { t: "error", msg: "Salle pleine (20 joueurs)." });
    if (ws.room) leave(ws);
    join(ws, room, m.name, m.photo);
    return castLobby(room);
  }
  const room = ws.room, me = room && room.players.get(ws.pid);
  if (!me) return;
  const host = me.id === room.hostId;
  if (m.t === "start" && host && room.phase === "lobby") {
    if (players(room).length < 2) return send(ws, { t: "error", msg: "Il faut au moins 2 joueurs." });
    startGame(room);
  } else if (m.t === "answer") answer(room, me, Number(m.i));
  else if (m.t === "level" && host && room.phase === "level") chooseLevel(room, !!m.up);
  else if (m.t === "retry" && host && room.phase === "error") loadQuestion(room);
  else if (m.t === "again") { if (host && room.phase === "end") { resetRoom(room); castLobby(room); } else send(ws, lobbyMsg(room, me)); }
  else if (m.t === "config" && host && room.phase === "lobby") {
    const c = readCfg(m);
    if (typeof c === "string") return send(ws, { t: "error", msg: c });
    room.cfg = c; castLobby(room);
  }
  else if (m.t === "next" && room.phase === "result" && (host || players(room)[room.i]?.id === me.id)) afterTurn(room);
  else if (m.t === "leave") leave(ws);
}

const port = process.env.PORT || 3000;
const server = app.listen(port, () => console.log(`Quizly sur http://localhost:${port}`));
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 20480 });
wss.on("connection", (ws, req) => {
  ws.ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));
  ws.on("message", (buf) => { let m; try { m = JSON.parse(buf); } catch { return; } try { handle(ws, m); } catch (e) { console.error(e); } });
  ws.on("close", () => leave(ws));
});
setInterval(() => wss.clients.forEach((ws) => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); }), 30000);
