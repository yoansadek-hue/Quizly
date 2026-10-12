import { euros } from "./local.js";
// Jeu en ligne : le serveur mène la partie, ce fichier affiche ce qu'il envoie.
const LEVELS = ["", "Facile", "Moyen", "Difficile", "Expert", "Légende"];
const PALETTE = ["#ffd84d", "#29d9a1", "#ff9a9a", "#c9ceff", "#ffb86b", "#7fe7ff", "#d7a8ff", "#b7f171", "#ff9ed8", "#ffffff", "#9ad0ff", "#ffe98a"];
const HEART = "\u2665\uFE0E"; // cœur « texte » (jamais l'emoji rouge)

export function initOnline({ $, show, flash, confetti, me, record, millionUI, avatarEl, setAudio, stat }) {
  const photoOf = (id) => (O.pl && O.pl[id] ? O.pl[id].photo : "") || ""; // photo d'un joueur du salon
  const theme = (tag) => String(tag || "").split(" · ")[0]; // « Drapeaux · Facile » → « Drapeaux »
  const mu = millionUI($); // écran « Qui veut gagner des millions »
  const O = { cfg: null, editing: false, ws: null, you: null, host: null, active: false, inRoom: false, tid: null, cur: null, answered: false, board: [], chrono: false };
  const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
  const msg = (t) => { $("onMsg").textContent = t; $("lobbyMsg").textContent = t; };

  function connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
      const timer = setTimeout(() => { ws.close(); reject(new Error("Le serveur ne répond pas.")); }, 20000);
      ws.onopen = () => { clearTimeout(timer); O.ws = ws; resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error("Connexion au serveur impossible.")); };
      ws.onmessage = (e) => { try { onMsg(JSON.parse(e.data)); } catch {} };
      ws.onclose = () => {
        if (O.ws !== ws) return;
        O.ws = null;
        if (O.active) { api.leave(); msg("Connexion perdue."); show("s-online"); }
      };
    });
  }
  const send = (o) => { if (O.ws && O.ws.readyState === 1) O.ws.send(JSON.stringify(o)); };

  async function open(first) {
    msg("");
    try { if (!O.ws) await connect(); O.active = true; send(first); }
    catch (e) { api.leave(); msg(e.message); show("s-online"); }
  }

  const api = {
    active: () => O.active,
    create: (cfg) => open({ t: "create", ...me(), ...cfg }),
    join: (code) => open({ t: "join", ...me(), code: String(code || "").trim() }),
    leave() {
      if (O.ws) { send({ t: "leave" }); const w = O.ws; O.ws = null; w.close(); }
      O.active = false; O.inRoom = false; O.you = null; stopClock(); mu.stopClock(); O.mout = false; O.watch = false;
      tvMode(false);
    },
    level: (up) => send({ t: "level", up }),
    retry: () => send({ t: "retry" }),
    again: () => send({ t: "again" }),
    next: () => send({ t: "next" }),
    config: (cfg) => send({ t: "config", ...cfg }),
    cfg: () => O.cfg,
    setEditing: (v) => { O.editing = !!v; }
  };

  function onMsg(m) {
    switch (m.t) {
      case "lobby": O.inRoom = true; O.you = m.you; O.host = m.host; O.cfg = m.cfg; renderLobby(m); if (!O.editing) show("s-lobby"); break;
      case "error": msg(m.msg); if (!O.inRoom) { api.leave(); show("s-online"); } break;
      case "load": stopClock(); $("loadText").textContent = m.msg || "L'IA prépare la question…"; $("loadErr").hidden = true; show("s-load"); break;
      case "fail": $("loadText").textContent = m.msg; $("loadErr").hidden = O.you !== O.host; show("s-load"); break;
      case "q": renderQ(m); break;
      case "result": renderResult(m); break;
      case "level": renderLevel(m); break;
      case "end": renderEnd(m); break;
      case "host": O.host = m.host; break;
      case "tvflag": tvMode(m.tv, m.kind); break;
      // Chrono en ligne
      case "cgo": O.chrono = true; O.board = []; break;
      case "cq": renderCQ(m); break;
      case "cres": renderCRes(m); break;
      case "cwait": $("alive").textContent = "Chargement de la question… (chrono en pause)"; break;
      case "cboard": O.board = m.list; liveBoard(); if (O.cur && O.cur.chrono && !O.answered) $("alive").textContent = rankText(); break; // ne pas effacer « Bonne réponse »
      // Qui veut gagner des millions en ligne
      case "mq":
        O.cur = null; O.watch = !!m.watch; if (!m.watch) O.mtag = m.tag;
        mu.render({ n: m.n, who: m.watch ? "Vous regardez" : "", avName: me().name, avPhoto: me().photo, tag: m.tag, q: m.q, img: m.img, options: m.options, jokers: m.jok, time: m.time, total: m.total, watch: m.watch, info: m.watch ? watchInfo() : millInfo() }, {
          pick: (i) => send({ t: "answer", i }),
          joker: (k) => send({ t: "mjoker", k }),
          stop: () => send({ t: "mstop" })
        });
        show("s-million");
        break;
      case "mlock": mu.lock(m.i); mu.info(m.i < 0 ? "Vous vous arrêtez. En attente des autres joueurs…" : "Réponse verrouillée. En attente des autres joueurs…"); break;
      case "mfifty": mu.fifty(m.keep); break;
      case "mpublic": mu.showPublic(m.perc); break;
      case "mboard": O.mboard = m.list; if (O.watch) mu.info(watchInfo()); break;
      case "mspec": // spectateur : résultat de la question pour chaque joueur
        mu.reveal({ answer: m.answer, picked: -1, correct: false });
        mu.info(m.results.map((r) => `${r.name} : ${r.stopped ? `s'arrête (${euros(r.won)})` : r.correct ? (r.out ? "1 000 000 € !" : `✓ ${euros(r.won)}`) : `✗ repart avec ${euros(r.won)}`}`).join(" · "));
        break;
      case "mres":
        if (stat && !m.stopped) stat.answer(theme(O.mtag), m.correct);
        mu.reveal(m);
        if (!m.stopped) flash(m.correct ? "ok" : "ko");
        mu.info(m.stopped ? `Vous repartez avec ${euros(m.won)}. La réponse était : ${m.answer}`
          : m.top ? "Un million d'euros ! Bravo !"
          : m.correct ? `Bonne réponse ! Vous avez ${euros(m.won)}.`
          : `${m.timeout ? "Temps écoulé" : "Mauvaise réponse"}. Vous repartez avec ${euros(m.won)}.`);
        if (m.out) { O.mout = true; O.mwon = m.won; } // éliminé : on regarde la suite en direct
        break;
      case "cdone":
        stopClock();
        $("loadText").textContent = `Temps écoulé ! ${m.points} pts · ${m.score} bonne${m.score > 1 ? "s" : ""} réponse${m.score > 1 ? "s" : ""}. En attente des autres joueurs…`;
        $("loadErr").hidden = true; show("s-load");
        break;
    }
  }

  /* ----- salle d'attente ----- */
  function renderLobby(m) {
    $("lobbyCode").textContent = m.code;
    const ul = $("lobbyList");
    ul.replaceChildren();
    O.pl = Object.fromEntries(m.players.map((p) => [p.id, p])); // pour afficher les photos pendant la partie
    m.players.forEach((p, i) => {
      const li = document.createElement("li");
      li.className = "chip";
      li.style.background = PALETTE[(p.ci || 0) % PALETTE.length];
      li.style.setProperty("--i", i);
      li.append(avatarEl(p.name, p.photo));
      const s = document.createElement("span");
      s.textContent = p.name + (p.id === m.host ? " · hôte" : "");
      li.append(s);
      ul.append(li);
    });
    const host = m.host === m.you;
    $("lobbyCount").textContent = `${m.players.length} / 20 joueurs`;
    const chrono = m.cfg.kind === "chrono", mill = m.cfg.kind === "million", need = chrono || mill ? 1 : 2; // Chrono et Millionnaire se jouent aussi seul
    tvMode(m.tv, m.cfg.kind);
    $("lobbyTv").textContent = m.tv
      ? "📺 Télé connectée : les questions s'affichent sur la télé."
      : `📺 Sur une télé : ouvrez ${location.host}/tv.html?code=${m.code}`;
    if (O.qrCode !== m.code) { O.qrCode = m.code; $("lobbyQr").src = qrUrl(joinLink(m.code), 340); } // QR code du salon
    O.chrono = false; O.cur = null;
    O.mout = false; O.watch = false; O.mboard = [];
    $("lobbyInfo").textContent = chrono
      ? `Chrono 60 s · ${plural(m.cfg.themes.length, "thème")} · le plus de points gagne`
      : mill ? `Qui veut gagner des millions · toutes les catégories · ${m.cfg.time ? m.cfg.time + " s par question" : "sans limite"}`
      : `${plural(m.cfg.themes.length, "thème")} · ${m.cfg.time ? m.cfg.time + " s" : "sans limite"} · ${plural(m.cfg.lives, "vie")}${m.cfg.auto ? " · difficulté évolutive" : ""}`;
    $("btnLobbyStart").hidden = !host;
    $("btnLobbyStart").disabled = m.players.length < need;
    $("btnLobbyStart").textContent = m.players.length < need ? "Il faut au moins 2 joueurs" : chrono ? "Lancer le chrono" : mill ? "Lancer l'échelle" : "Lancer la partie";
    $("btnLobbyEdit").hidden = !host;
    $("lobbyWait").hidden = host && m.players.length >= need;
    $("lobbyWait").textContent = host ? "Il faut au moins 2 joueurs pour lancer." : "En attente de l'hôte…";
    msg("");
  }

  /* ----- minuteur ----- */
  function stopClock() {
    clearInterval(O.tid); O.tid = null;
    $("bar30").style.animationPlayState = "paused";
    $("clock").classList.remove("urgent");
  }
  function startClock(ms) {
    stopClock();
    $("btnStopTimer").hidden = true;
    $("clockrow").hidden = !ms;
    if (!ms) return;
    const bar = $("bar30"), clock = $("clock"), end = Date.now() + ms, warn = ms >= 20000 ? 10 : 3;
    bar.style.setProperty("--dur", ms / 1000 + "s");
    bar.style.animationDelay = "";
    bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = ""; bar.style.animationPlayState = "";
    const tick = () => {
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      clock.textContent = s;
      clock.classList.toggle("urgent", s > 0 && s <= warn);
    };
    tick();
    O.tid = setInterval(tick, 250);
  }

  /* ----- question ----- */
  function renderQ(m) {
    O.cur = m; O.answered = false;
    $("liveBoard").hidden = true; // réservé au Chrono
    const mine = m.who === O.you;
    $("scene").classList.add("compact");
    const card = $("card");
    card.classList.remove("flipped"); card.style.animation = "none"; void card.offsetWidth; card.style.animation = "";
    $("whoName").textContent = mine ? `${m.name} (vous)` : m.name;
    $("whoAv").replaceChildren(avatarEl(m.name, photoOf(m.who), true));
    $("whoName").classList.remove("retry");
    $("whoLives").hidden = false; $("whoLives").textContent = `${HEART} ${m.lives}`;
    $("alive").hidden = false; $("alive").textContent = mine ? "C'est à vous de jouer" : `${m.alive} joueurs en vie`;
    $("tag").textContent = m.tag;
    const ql = m.q.length;
    $("qText").textContent = m.q;
    const qi = $("qImg");
    if (m.img) { qi.hidden = false; qi.onerror = () => { qi.hidden = true; }; qi.src = m.img; } else { qi.hidden = true; qi.removeAttribute("src"); }
    setAudio($, m.audio); // Devine la chanson
    $("qText").dataset.len = ql > 170 ? "xl" : ql > 120 ? "l" : ql > 80 ? "m" : "s";
    ["btnSwap", "dockGame", "dockJudge", "dockNext"].forEach((id) => ($(id).hidden = true));
    const box = $("mcq");
    box.replaceChildren();
    box.classList.toggle("long", m.options.some((o) => o.length > 24));
    m.options.forEach((o, i) => {
      const b = document.createElement("button");
      b.className = "btn white"; b.textContent = o; b.style.animation = `pop .35s ${i * 70}ms backwards`;
      if (mine) {
        b.onclick = () => {
          if (O.answered) return;
          O.answered = true; b.classList.add("picked");
          box.querySelectorAll(".btn").forEach((x) => (x.disabled = true));
          send({ t: "answer", i });
        };
      } else b.disabled = true;
      box.append(b);
    });
    box.hidden = false;
    show("s-game");
    startClock(m.ms);
  }

  function renderResult(m) {
    stopClock();
    if (stat && m.who === O.you && O.cur) stat.answer(theme(O.cur.tag), m.correct);
    const btns = [...document.querySelectorAll("#mcq .btn")];
    btns.forEach((b) => { b.disabled = true; if (b.textContent === m.answer) b.classList.add("right"); });
    if (m.picked >= 0 && !m.correct && O.cur) {
      const w = O.cur.options[m.picked];
      btns.forEach((b) => b.textContent === w && b.classList.add("wrong"));
    }
    $("whoLives").textContent = `${HEART} ${Math.max(m.lives, 0)}`;
    $("alive").textContent = m.correct ? "Bonne réponse" : m.dead ? `${m.name} est éliminé` : m.picked < 0 ? "Temps écoulé" : "Mauvaise réponse";
    flash(m.correct ? "ok" : "ko");
    $("dockNext").hidden = !(m.who === O.you || O.host === O.you); // le joueur (ou l'hôte) appuie sur Continuer
  }

  function renderLevel(m) {
    stopClock();
    O.host = m.host;
    const host = m.host === O.you;
    $("lvName").textContent = `${m.diff} · ${LEVELS[m.diff]}`;
    $("btnUp").hidden = !host || m.diff >= 5;
    $("btnStay").hidden = !host;
    $("btnUp").textContent = "Augmenter la difficulté"; $("btnStay").textContent = "Garder ce niveau";
    $("lvWait").hidden = host;
    show("s-level");
  }

  function renderEnd(m) {
    stopClock();
    const chrono = m.kind === "chrono", mill = m.kind === "million";
    if (stat) stat.game(chrono ? "chrono" : mill ? "omillion" : "online");
    O.chrono = false; O.cur = null; O.mout = false; O.watch = false; mu.stopClock(); $("liveBoard").hidden = true;
    $("endLead").textContent = m.winner ? "Vainqueur" : "Partie terminée";
    $("winner").textContent = m.winner || "Égalité";
    $("endNote").textContent = "";
    if (chrono) {
      const mine = m.ranking.find((p) => p.id === O.you);
      if (mine && record) {
        const r = record(mine.points); // record personnel du Chrono, gardé sur l'appareil
        $("endNote").textContent = `${r.rec ? "Nouveau record ! " : ""}Vous : ${mine.points} pts · record : ${r.best} pts`;
      }
    }
    const ol = $("ranking");
    ol.replaceChildren();
    m.ranking.forEach((p, i) => {
      const li = document.createElement("li");
      li.className = "rk" + (i === 0 ? " first" : "");
      li.style.animationDelay = `${0.35 + i * 0.12}s`;
      const pos = document.createElement("span"); pos.className = "pos"; pos.textContent = i + 1;
      const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = p.name;
      const av = avatarEl(p.name, p.photo || photoOf(p.id));
      const st = document.createElement("span"); st.className = "st";
      st.textContent = mill ? `${euros(p.points)} · ${p.score} bonne${p.score > 1 ? "s" : ""}` : chrono ? `${p.points} pts · ${p.score} bonne${p.score > 1 ? "s" : ""}` : `${p.score} bonne${p.score > 1 ? "s" : ""} · ${HEART} ${p.lives}`;
      li.append(pos, av, nm, st);
      ol.append(li);
    });
    show("s-end");
    confetti();
  }

  /* ----- QR code et lien pour rejoindre ----- */
  function joinLink(code) { return `${location.origin}/?join=${code}`; }
  function qrUrl(text, size) { return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(text)}`; }

  /* ----- Mode TV : en Survie, la question est sur la télé, le téléphone sert de manette ----- */
  function tvMode(on, kind) { document.body.classList.toggle("tvmode", !!on && (kind || "survie") === "survie"); }

  /* ----- Millionnaire : textes ----- */
  function millInfo() {
    const n = (O.mboard || []).filter((p) => !p.out).length;
    return n > 1 ? `${n} joueurs encore en jeu` : "";
  }
  function watchInfo() {
    const still = (O.mboard || []).filter((p) => !p.out);
    const me = `Vous : ${euros(O.mwon || 0)}`;
    if (!still.length) return me;
    return `En direct · ${still.map((p) => `${p.name} ${p.answered ? "a répondu" : "réfléchit…"} (${euros(p.won)})`).join(" · ")} · ${me}`;
  }

  /* ----- Chrono en ligne ----- */
  // classement en direct, en haut de l'écran : les 5 premiers, plus vous si vous êtes plus bas
  function liveBoard() {
    const ol = $("liveBoard");
    if (!O.chrono || O.board.length < 2) { ol.hidden = true; return; }
    const mine = O.board.findIndex((p) => p.id === O.you);
    const rows = O.board.map((p, i) => [p, i]).filter(([, i]) => i < 5 || i === mine);
    ol.replaceChildren(...rows.map(([p, i]) => {
      const li = document.createElement("li");
      li.className = (p.id === O.you ? "me" : "") + (p.done ? " done" : "");
      const pos = document.createElement("span"); pos.className = "pos"; pos.textContent = i + 1;
      const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = p.id === O.you ? "Vous" : p.name;
      const av = avatarEl(p.name, photoOf(p.id));
      const pt = document.createElement("span"); pt.className = "pt"; pt.textContent = `${p.points} pts`;
      li.append(pos, av, nm, pt);
      return li;
    }));
    ol.hidden = false;
  }
  function rankText() { // la place est dans le classement en direct : ici, seulement la série
    const s = O.cur ? O.cur.streak : 0;
    if (O.board.length < 2) return `Entraînement${s >= 2 ? ` · Série : ${s}` : ""}`;
    return s >= 2 ? `Série : ${s}` : "";
  }
  function chronoClock(ms, total) {
    stopClock();
    $("btnStopTimer").hidden = true;
    $("clockrow").hidden = false;
    const bar = $("bar30"), clock = $("clock"), end = Date.now() + ms;
    bar.style.setProperty("--dur", total / 1000 + "s");
    bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = "";
    bar.style.animationDelay = `-${(total - ms) / 1000}s`; // la barre reprend là où elle s'était arrêtée
    bar.style.animationPlayState = "running";
    const tick = () => {
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      clock.textContent = s;
      clock.classList.toggle("urgent", s > 0 && s <= 10);
    };
    tick();
    O.tid = setInterval(tick, 200);
  }
  function renderCQ(m) {
    O.cur = { ...m, chrono: true }; O.answered = false;
    $("scene").classList.add("compact");
    const card = $("card");
    card.classList.remove("flipped"); card.style.animation = "none"; void card.offsetWidth; card.style.animation = "";
    $("whoName").textContent = me().name || "Vous";
    $("whoAv").replaceChildren(avatarEl(me().name, me().photo, true));
    $("whoName").classList.remove("retry");
    $("whoLives").hidden = false; $("whoLives").textContent = `${m.points} pts`;
    $("alive").hidden = false; $("alive").textContent = rankText();
    liveBoard();
    $("tag").textContent = m.tag;
    $("qText").textContent = m.q;
    const ql = m.q.length;
    $("qText").dataset.len = ql > 170 ? "xl" : ql > 120 ? "l" : ql > 80 ? "m" : "s";
    const qi = $("qImg");
    if (m.img) { qi.hidden = false; qi.onerror = () => { qi.hidden = true; }; qi.src = m.img; } else { qi.hidden = true; qi.removeAttribute("src"); }
    setAudio($, m.audio); // Devine la chanson
    ["btnSwap", "dockGame", "dockJudge", "dockNext"].forEach((id) => ($(id).hidden = true));
    const box = $("mcq");
    box.replaceChildren();
    box.classList.toggle("long", m.options.some((o) => o.length > 24));
    m.options.forEach((o, i) => {
      const b = document.createElement("button");
      b.className = "btn white"; b.textContent = o; b.style.animation = `pop .25s ${i * 40}ms backwards`;
      b.onclick = () => {
        if (O.answered) return;
        O.answered = true; b.classList.add("picked");
        box.querySelectorAll(".btn").forEach((x) => (x.disabled = true));
        stopClock(); // le temps s'arrête dès qu'on a répondu
        send({ t: "answer", i });
      };
      box.append(b);
    });
    box.hidden = false;
    show("s-game");
    chronoClock(m.ms, m.total);
  }
  function renderCRes(m) {
    stopClock();
    if (stat && O.cur) stat.answer(theme(O.cur.tag), m.correct);
    O.answered = true;
    if (O.cur) O.cur.streak = m.streak;
    const btns = [...document.querySelectorAll("#mcq .btn")];
    btns.forEach((b) => { b.disabled = true; if (b.textContent === m.answer) b.classList.add("right"); });
    if (m.picked >= 0 && !m.correct && O.cur) {
      const w = O.cur.options[m.picked];
      btns.forEach((b) => b.textContent === w && b.classList.add("wrong"));
    }
    $("whoLives").textContent = `${m.points} pts`;
    $("clock").textContent = Math.ceil(m.ms / 1000);
    $("alive").textContent = m.correct ? `Bonne réponse · +${m.gain} pts` : m.picked < 0 ? "Temps écoulé" : "Mauvaise réponse";
    flash(m.correct ? "ok" : "ko");
  }

  /* ----- boutons de la salle ----- */
  $("btnLobbyStart").onclick = () => send({ t: "start" });
  $("btnLeave").onclick = () => { api.leave(); show("s-mode"); };
  // lien direct : quizly…/?join=ABCD ouvre le jeu et rejoint le salon
  $("btnShare").onclick = async () => {
    const code = $("lobbyCode").textContent, url = joinLink(code);
    try {
      if (navigator.share) await navigator.share({ title: "Quizly", text: `Rejoins ma partie Quizly ! Code : ${code}`, url });
      else { await navigator.clipboard.writeText(url); $("lobbyMsg").textContent = "Lien copié."; }
    } catch { /* partage annulé */ }
  };
  $("lobbyCode").onclick = () => {
    try { navigator.clipboard.writeText($("lobbyCode").textContent); $("lobbyMsg").textContent = "Code copié."; } catch {}
  };
  return api;
}
