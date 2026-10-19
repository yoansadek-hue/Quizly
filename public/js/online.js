import { euros } from "./local.js";
import { setFrame } from "./million.js";
import { styleName, titleEl } from "./cosmetics.js";
// Jeu en ligne : le serveur mène la partie, ce fichier affiche ce qu'il envoie.
const LEVELS = ["", "Facile", "Moyen", "Difficile", "Expert", "Légende"];
const PALETTE = ["#ffe14d", "#34e3b0", "#ff6b8b", "#62c7ff", "#c4b8ff", "#ffb36b", "#f6f3ff", "#9df0d4"]; // couleurs des jetons
const HEART = "\u2665\uFE0E"; // cœur « texte » (jamais l'emoji rouge)

export function initOnline({ $, show, flash, confetti, me, record, millionUI, avatarEl, setAudio, stat, setMode, noteQ, recent, addFriend, isFriend, imp }) {
  const photoOf = (id) => (O.pl && O.pl[id] ? O.pl[id].photo : "") || ""; // photo d'un joueur du salon
  const theme = (tag) => String(tag || "").split(" · ")[0]; // « Drapeaux · Facile » → « Drapeaux »
  const mu = millionUI($); // écran « Qui veut gagner des millions »
  const O = { cfg: null, editing: false, ws: null, you: null, host: null, active: false, inRoom: false, tid: null, cur: null, answered: false, board: [], chrono: false };
  const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;

  /* ----- retour dans la partie après une coupure (60 s) ----- */
  const RJ = "quizly:rejoin";
  const getSess = () => { try { return JSON.parse(localStorage.getItem(RJ) || "null"); } catch { return null; } };
  const saveSess = (m) => { if (m.tok) try { localStorage.setItem(RJ, JSON.stringify({ code: m.code, pid: m.you, tok: m.tok, at: Date.now() })); } catch {} };
  const clearSess = () => { try { localStorage.removeItem(RJ); } catch {} };
  function touchSess() { // « je suis encore là » : sert à savoir si on peut revenir en rouvrant l'appli
    if (Date.now() - (O.touched || 0) < 5000) return;
    O.touched = Date.now();
    const s = getSess(); if (s) { s.at = Date.now(); try { localStorage.setItem(RJ, JSON.stringify(s)); } catch {} }
  }
  async function reconnect() {
    const s = getSess();
    if (!s) { api.leave(); msg("Connexion perdue."); return show("s-online"); }
    O.reconnecting = true;
    O.dropAt = O.dropAt || Date.now();
    stopClock(); mu.stopClock();
    $("loadText").textContent = "Connexion perdue. Reconnexion…"; $("loadErr").hidden = true; show("s-load");
    while (O.reconnecting && Date.now() - O.dropAt < 60000) {
      try { await connect(); O.dropAt = 0; send({ t: "rejoin", code: s.code, pid: s.pid, tok: s.tok }); return; } // la suite arrive avec « resume »
      catch { await new Promise((r) => setTimeout(r, 2500)); }
    }
    if (O.reconnecting) { O.reconnecting = false; api.leave(); msg("Connexion perdue : la partie a continué sans vous."); show("s-online"); }
  }
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
        if (O.active && O.inRoom) return reconnect(); // coupure en salon ou en partie : on revient tout seul
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
    // on envoie les questions vues récemment : le serveur évite de les reposer
    create: (cfg) => open({ t: "create", ...me(), hist: recent ? recent() : [], ...cfg }),
    join: (code) => open({ t: "join", ...me(), hist: recent ? recent() : [], code: String(code || "").trim() }),
    leave() {
      clearSess(); O.reconnecting = false; O.dropAt = 0;
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
    closeReacts: () => closeReacts(),
    // appli rouverte moins de 60 s après l'avoir quittée : on retourne dans la partie
    tryRejoin() {
      if (O.active || O.reconnecting) return true; // déjà en route
      const s = getSess();
      if (!s || Date.now() - s.at > 60000) { clearSess(); return false; }
      O.reconnecting = true;
      $("loadText").textContent = "Retour dans la partie…"; $("loadErr").hidden = true; show("s-load");
      open({ t: "rejoin", code: s.code, pid: s.pid, tok: s.tok });
      return true;
    },
    setEditing: (v) => { O.editing = !!v; }
  };

  function onMsg(m) {
    if (O.inRoom) touchSess();
    if (noteQ && (m.t === "q" || m.t === "cq" || (m.t === "mq" && !m.watch))) noteQ({ q: m.q, img: m.img, audio: m.audio }); // mémorisée pour les prochaines parties
    switch (m.t) {
      case "lobby": O.inRoom = true; O.you = m.you; O.host = m.host; O.cfg = m.cfg; saveSess(m); renderLobby(m); if (!O.editing) show("s-lobby"); break;
      case "resume": // de retour dans la salle : l'écran de la partie suit
        O.inRoom = true; O.reconnecting = false; O.you = m.you; O.host = m.host; O.cfg = m.cfg; saveSess(m);
        if (setMode) setMode(m.cfg.kind);
        renderLobby(m);
        if (m.phase === "lobby") show("s-lobby");
        break;
      case "rejoinfail":
        clearSess();
        if (O.reconnecting) { O.reconnecting = false; api.leave(); msg("Impossible de revenir dans la partie : elle a continué sans vous."); show("s-online"); }
        break;
      case "kicked": api.leave(); msg("L'hôte vous a retiré du salon."); show("s-online"); break;
      case "react": showReact(m); break;
      case "error": msg(m.msg); if (!O.inRoom) { api.leave(); show("s-online"); } break;
      case "load": stopClock(); $("loadText").textContent = m.msg || "L'IA prépare la question…"; $("loadErr").hidden = true; show("s-load"); break;
      case "fail": $("loadText").textContent = m.msg; $("loadErr").hidden = O.you !== O.host; show("s-load"); break;
      case "q": renderQ(m); break;
      case "result": renderResult(m); break;
      case "level": renderLevel(m); break;
      case "end": renderEnd(m); break;
      case "host": O.host = m.host; break;
      // Les Parieurs en ligne
      case "bets": if (O.cur) { O.cur.bets = m.bets; O.cur.count = m.count; if (m.odds) O.cur.odds = m.odds; renderBets(); } break;
      case "go": goAnswer(m); break;
      // L'Imposteur en ligne
      case "imp": renderImp(m); break;
      case "ivoted": if (O.imp && O.imp.phase === "vote") { O.imp.count = m.count; O.imp.total = m.total; impVoteScreen(); } break;
      case "iclued": if (O.imp && O.imp.phase === "clue") { O.imp.count = m.count; O.imp.total = m.total; if (m.id === O.you) O.imp.mine = m.text; if (m.id === O.you || O.imp.mine != null) impClueScreen(); } break;
      case "iclueerr": imp.clueError(m.msg); break;
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
      case "mboard": O.mboard = m.list; millLive(); if (O.watch) mu.info(watchInfo()); break;
      case "mout": // qui vient d'être éliminé (ou de s'arrêter)
        m.list.forEach((r, i) => setTimeout(() => toast(
          r.top ? `${r.name} gagne 1 000 000 € !` : r.stopped ? `${r.name} s'arrête avec ${euros(r.won)}` : `${r.name} est éliminé (${euros(r.won)})`), i * 1200));
        break;
      case "chat":
        showChat(m);
        O.chatLog = [...O.chatLog, m].slice(-40); renderLog();
        if (menu.hidden && m.id !== O.you) fab.classList.add("unread"); // un point sur la bulle : message non lu
        break;
      case "chatlog": O.chatLog = m.list.slice(-40); renderLog(); break;
      case "mspec": // spectateur : résultat de la question pour chaque joueur
        mu.reveal({ answer: m.answer, picked: -1, correct: false });
        mu.info(m.results.map((r) => `${r.name} : ${r.stopped ? `s'arrête (${euros(r.won)})` : r.correct ? (r.out ? "1 000 000 € !" : `juste, ${euros(r.won)}`) : `raté, repart avec ${euros(r.won)}`}`).join(" · "));
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
    m.players.forEach((p) => setFrame(p.name, (p.cos || {}).frame)); // le cadre de chacun
    m.players.forEach((p, i) => {
      const li = document.createElement("li");
      li.className = "chip";
      li.style.background = PALETTE[(p.ci || 0) % PALETTE.length];
      li.style.setProperty("--i", i);
      li.append(avatarEl(p.name, p.photo));
      if (p.id !== m.you) { // toucher un autre joueur : l'ajouter en ami (et, pour l'hôte, le gérer)
        li.classList.add("tap"); li.tabIndex = 0; li.setAttribute("role", "button");
        li.onclick = () => pickPlayer(p);
        li.onkeydown = (e) => (e.key === "Enter" || e.key === " ") && pickPlayer(p);
      }
      const s = document.createElement("span");
      s.textContent = p.name + (p.id === m.host ? " · hôte" : "");
      styleName(s, p.cos); li.append(s); // sa couleur de pseudo
      const ti = titleEl(p.cos); if (ti) li.append(ti); // et son titre
      ul.append(li);
    });
    const host = m.host === m.you;
    $("lobbyCount").textContent = `${m.players.length} / 20 joueurs`;
    const chrono = m.cfg.kind === "chrono", mill = m.cfg.kind === "million", teams = m.cfg.kind === "equipes", bets = m.cfg.kind === "parieurs", impo = m.cfg.kind === "imposteur", need = chrono || mill ? 1 : impo ? 3 : 2; // Chrono et Millionnaire se jouent aussi seul
    $("betBox").hidden = true;
    tvMode(m.tv, m.cfg.kind);
    // salon télé : pas de code à donner, on rejoint seulement en scannant la télé
    $("lobbyCode").hidden = !!m.tvRoom;
    // QR code du salon : vos amis le scannent avec Quizly (En ligne › Scanner)
    $("lobbyQr").hidden = !!m.tvRoom;
    if (!m.tvRoom && $("lobbyQr").dataset.code !== m.code) {
      $("lobbyQr").dataset.code = m.code;
      $("lobbyQr").src = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=8&data=${encodeURIComponent(`${location.origin}/?tv=${m.code}`)}`;
    }
    $("lobbyHint").textContent = m.tvRoom ? "Salon télé : vos amis rejoignent en scannant le QR code de la télé." : "Vos amis scannent le QR code (En ligne › Scanner) ou tapent le code.";
    O.chrono = false; O.cur = null;
    O.mout = false; O.watch = false; O.mboard = [];
    if (O.chatRoom !== m.code) { O.chatRoom = m.code; O.chatLog = []; renderLog(); fab.classList.remove("unread"); }
    $("lobbyInfo").textContent = chrono
      ? `Chrono 60 s · ${plural(m.cfg.themes.length, "thème")} · le plus de points gagne`
      : mill ? `Qui veut gagner des millions · toutes les catégories · ${m.cfg.time ? m.cfg.time + " s par question" : "sans limite"}`
      : impo ? `L'Imposteur · ${plural(m.cfg.themes.length, "thème")} · ${m.cfg.time ? m.cfg.time + " s de discussion" : "discussion sans limite"} · 3 joueurs ou plus`
      : bets ? `Les Parieurs · ${plural(m.cfg.themes.length, "thème")} · ${m.cfg.time ? m.cfg.time + " s" : "sans limite"} · 3 questions par joueur · 100 jetons au départ`
      : teams ? `Équipes · ${plural(m.cfg.themes.length, "thème")} · ${m.cfg.time ? m.cfg.time + " s" : "sans limite"} · 3 questions par joueur${m.cfg.auto ? " · difficulté évolutive" : ""}`
      : `${plural(m.cfg.themes.length, "thème")} · ${m.cfg.time ? m.cfg.time + " s" : "sans limite"} · ${plural(m.cfg.lives, "vie")}${m.cfg.auto ? " · difficulté évolutive" : ""}`;
    $("btnLobbyStart").hidden = !host;
    $("btnLobbyStart").disabled = m.players.length < need;
    $("btnLobbyStart").textContent = m.players.length < need ? `Il faut au moins ${need} joueurs` : chrono ? "Lancer le chrono" : mill ? "Lancer l'échelle" : "Lancer la partie";
    $("btnLobbyEdit").hidden = !host;
    $("lobbyWait").hidden = host && m.players.length >= need;
    $("lobbyWait").textContent = host ? `Il faut au moins ${need} joueurs pour lancer.` : "En attente de l'hôte…";
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
    const bets = O.cfg && O.cfg.kind === "parieurs";
    $("whoLives").hidden = false; $("whoLives").textContent = m.teams ? `Équipe ${m.team}` : bets ? jetons(m.tokens ?? tokensOf(m.who)) : `${HEART} ${m.lives}`;
    $("alive").hidden = false;
    $("alive").textContent = m.teams ? `${mine ? "À vous de jouer · " : ""}${teamLine(m.teams)}`
      : bets ? (m.bet ? (mine ? "Les autres parient sur vous…" : `Pariez : ${m.name} va-t-il réussir ?`) : mine ? "À vous de répondre !" : `${m.name} répond…`)
      : mine ? "C'est à vous de jouer" : `${m.alive} joueurs en vie`;
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
          if (O.answered || (O.cur && O.cur.bet)) return; // Parieurs : on attend la fin des paris
          O.answered = true; b.classList.add("picked");
          box.querySelectorAll(".btn").forEach((x) => (x.disabled = true));
          send({ t: "answer", i });
        };
      }
      b.disabled = !mine || !!m.bet;
      box.append(b);
    });
    box.hidden = false;
    renderBets();
    show("s-game");
    startClock(m.ms);
  }

  /* ----- Les Parieurs : avant la réponse, les autres parient leurs jetons ----- */
  const jetons = (n) => `${n || 0} jeton${n > 1 ? "s" : ""}`;
  const tokensOf = (id) => ((O.cur && O.cur.board) || []).find((p) => p.id === id)?.points || 0;
  let betAmt = 10;
  function renderBets() {
    const m = O.cur, on = !!m && O.cfg && O.cfg.kind === "parieurs";
    $("betBox").hidden = !on;
    if (!on) return;
    const mine = m.who === O.you, list = m.bets || [], my = list.find((b) => b.id === O.you), have = tokensOf(O.you);
    // les commandes : seulement pendant les paris, pour ceux qui ne répondent pas et n'ont pas encore parié
    const can = m.bet && !mine && !my && have > 0;
    $("betCtrl").hidden = !can;
    if (can) {
      const boost = (m.rescued || []).includes(me().name) ? "Coup de pouce : +10 jetons ! " : "";
      $("betQ").textContent = `${m.final ? "Manche finale : gains doublés ! " : ""}${boost}Vous avez ${jetons(have)}. Combien misez-vous ?`;
      const amts = [10, 25, 50].filter((a) => a < have).concat(have);
      if (!amts.includes(betAmt)) betAmt = amts[0];
      $("betAmts").replaceChildren(...amts.map((a) => {
        const b = document.createElement("button"); b.className = "chip"; b.textContent = a === have ? `Tout (${a})` : a;
        b.setAttribute("aria-pressed", String(a === betAmt));
        b.onclick = () => { betAmt = a; renderBets(); };
        return b;
      }));
      const odds = m.odds || { yes: 3, no: 3 }, x = m.final ? 2 : 1; // la cote : parier contre la majorité rapporte plus
      $("betYes").textContent = `${m.name} réussit · ×${+(odds.yes * x).toFixed(1)}`; $("betNo").textContent = `${m.name} se trompe · ×${+(odds.no * x).toFixed(1)}`;
    }
    // les paris de tout le monde, en direct (puis gagnés ou perdus)
    $("betList").replaceChildren(...list.map((b) => {
      const li = document.createElement("li");
      li.className = b.won === true ? "won" : b.won === false ? "lost" : "";
      const n = document.createElement("b"); n.textContent = b.id === O.you ? "Vous" : b.name;
      const t = document.createElement("span");
      t.textContent = !b.amt ? "passe" : `${b.yes ? "réussit" : "se trompe"} · ${b.amt}${b.won === true ? ` · +${b.delta ?? b.amt}` : b.won === false ? ` · −${b.amt}` : ""}`;
      li.append(n, t); return li;
    }));
    // celui qui répond ne voit que le nombre de paris sur lui : les montants restent secrets jusqu'au résultat
    const n = m.count || 0, secret = `${n ? `${n} pari${n > 1 ? "s" : ""} sur vous` : "Pas encore de pari sur vous"} · montants secrets`;
    $("betWait").hidden = !(mine ? !m.done : m.bet && (my || have <= 0));
    $("betWait").textContent = mine ? (m.bet ? `Les autres parient sur vous… ${secret}` : secret) : have <= 0 ? "Plus de jetons : vous regardez ce tour." : "Pari placé. En attente des autres…";
  }
  const placeBet = (yes, amt) => { if (!O.cur || !O.cur.bet) return; send({ t: "bet", yes, amt }); $("betCtrl").hidden = true; };
  $("betYes").onclick = () => placeBet(true, betAmt);
  $("betNo").onclick = () => placeBet(false, betAmt);
  $("betPass").onclick = () => placeBet(false, 0);
  function goAnswer(m) { // les paris sont fermés : celui qui répond peut répondre
    if (!O.cur) return;
    O.cur.bet = false; O.cur.bets = m.bets; O.cur.count = m.count;
    const mine = O.cur.who === O.you;
    document.querySelectorAll("#mcq .btn").forEach((b) => (b.disabled = !mine || O.answered));
    $("alive").textContent = mine ? "À vous de répondre !" : `${O.cur.name} répond…`;
    renderBets();
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
    let mood = m.correct; // le flash : bonne réponse, ou (pour un parieur) pari gagné
    if (m.teams) { // Équipes : personne n'est éliminé, on montre les scores
      $("alive").textContent = `${m.correct ? "Bonne réponse" : m.picked < 0 ? "Temps écoulé" : "Mauvaise réponse"} · ${teamLine(m.teams)}`;
    } else if (m.bets) { // Les Parieurs : la réponse, puis ce que chacun gagne ou perd
      const my = m.bets.find((b) => b.id === O.you), verdict = m.correct ? "Bonne réponse" : m.picked < 0 ? "Temps écoulé" : "Mauvaise réponse";
      $("whoLives").textContent = jetons(m.tokens);
      $("alive").textContent = m.who === O.you ? `${verdict}${m.gain ? ` · +${m.gain} jetons` : ""}${m.revenge ? ` · vengeance +${m.revenge} !` : ""}`
        : my ? `${verdict} · pari ${my.won ? `gagné : +${my.delta} (cote ×${my.cote}${m.final ? ", doublé" : ""})` : `perdu : −${my.amt}`} · vous avez ${jetons(my.tokens)}` : verdict;
      if (my) mood = my.won;
      if (O.cur) { O.cur.bet = false; O.cur.done = true; O.cur.bets = m.bets; O.cur.board = m.board; renderBets(); } // le résultat dévoile tous les paris
    } else {
      $("whoLives").textContent = `${HEART} ${Math.max(m.lives, 0)}`;
      $("alive").textContent = m.correct ? "Bonne réponse" : m.dead ? `${m.name} est éliminé` : m.picked < 0 ? "Temps écoulé" : "Mauvaise réponse";
    }
    flash(mood ? "ok" : "ko");
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
    const chrono = m.kind === "chrono", mill = m.kind === "million", teams = m.kind === "equipes", bets = m.kind === "parieurs", impo = m.kind === "imposteur";
    if (stat) stat.game(chrono ? "chrono" : mill ? "omillion" : teams ? "oteams" : bets ? "obets" : impo ? "oimp" : "online");
    O.imp = null; if (imp) imp.stop();
    $("betBox").hidden = true;
    if (stat && stat.win && !teams && m.winner && m.ranking && m.ranking.length > 1 && m.ranking[0].id === O.you) stat.win(); // victoire : pour les défis
    O.chrono = false; O.cur = null; O.mout = false; O.watch = false; mu.stopClock(); $("liveBoard").hidden = true;
    $("endLead").textContent = m.winner ? "Vainqueur" : "Partie terminée";
    $("winner").textContent = m.winner || "Égalité";
    $("endNote").textContent = "";
    if (teams && m.mvp) $("endNote").textContent = `Meilleur joueur : ${m.mvp.name} (${m.mvp.points} pts)`;
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
      st.textContent = impo ? `${p.points} pts · imposteur ${p.score}×` : teams ? `${p.points} pts` : bets ? `${jetons(p.points)} · ${p.score} bonne${p.score > 1 ? "s" : ""}` : mill ? `${euros(p.points)} · ${p.score} bonne${p.score > 1 ? "s" : ""}` : chrono ? `${p.points} pts · ${p.score} bonne${p.score > 1 ? "s" : ""}` : `${p.score} bonne${p.score > 1 ? "s" : ""} · ${HEART} ${p.lives}`;
      li.append(pos, av, nm, st);
      ol.append(li);
    });
    show("s-end");
    confetti();
  }

  /* ----- l'hôte : retirer un joueur, donner son rôle ----- */
  function pickPlayer(p) {
    if (O.sel === p.id && !$("lobbyActions").hidden) { $("lobbyActions").hidden = true; O.sel = null; return; }
    O.sel = p.id; O.selP = p;
    $("pactName").textContent = p.name; $("pactMsg").textContent = "";
    const host = O.host === O.you;
    $("btnSetHost").hidden = $("btnKick").hidden = !host;
    $("btnAddFromLobby").hidden = !p.uid || !addFriend || (isFriend && isFriend(p.uid));
    $("lobbyActions").hidden = false;
  }
  $("btnAddFromLobby").onclick = async () => {
    const p = O.selP; if (!p || !addFriend) return;
    $("btnAddFromLobby").disabled = true;
    $("pactMsg").textContent = await addFriend(p.uid, p.name);
    $("btnAddFromLobby").disabled = false; $("btnAddFromLobby").hidden = true;
  };
  $("btnSetHost").onclick = () => { if (O.sel) send({ t: "sethost", id: O.sel }); $("lobbyActions").hidden = true; O.sel = null; };
  $("btnKick").onclick = () => { if (O.sel) send({ t: "kick", id: O.sel }); $("lobbyActions").hidden = true; O.sel = null; };

  /* ----- réactions : des mots qui s'envolent, vus par tout le salon ----- */
  const REACTS = ["Trop facile", "Tu dors ?", "Pleure pas", "Même pas peur", "Je suis trop fort", "Cadeau !", "Bruh"]; // des piques pour chambrer les autres
  // le rond des réactions : un appui ouvre le menu, un appui sur une réaction l'envoie et referme
  const menu = $("reactMenu"), fab = $("reactFab");
  const quick = document.createElement("div"); quick.className = "quick"; menu.append(quick); // les réactions rapides, en haut du panneau
  REACTS.forEach((t, i) => {
    const b = document.createElement("button");
    b.className = `chip react r${i}`; b.textContent = t;
    b.style.animationDelay = `${i * 35}ms`;
    b.onclick = () => {
      closeReacts();
      if (Date.now() - (O.reacted || 0) < 900) return; // pas de rafale
      O.reacted = Date.now(); send({ t: "react", r: i });
    };
    quick.append(b);
  });
  // écrire un message (80 caractères) : il s'envole chez tout le monde, comme les réactions
  const row = document.createElement("div"); row.className = "chatrow";
  const inp = document.createElement("input"); inp.type = "text"; inp.maxLength = 80; inp.placeholder = "Écrire un message…"; inp.setAttribute("enterkeyhint", "send");
  const go = document.createElement("button"); go.className = "btn sun sm"; go.textContent = "Envoyer";
  const sendChat = () => {
    const t = inp.value.trim(); if (!t) return;
    if (Date.now() - (O.reacted || 0) < 1500) return;
    O.reacted = Date.now(); send({ t: "chat", text: t }); inp.value = ""; closeReacts();
  };
  go.onclick = sendChat; inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sendChat(); } });
  inp.addEventListener("focus", () => clearTimeout(O.reactT)); // on écrit : le menu ne se referme pas tout seul
  row.append(inp, go);
  // l'historique : tous les messages écrits du salon, comme un vrai chat
  const log = document.createElement("div"); log.className = "chatlog"; log.id = "chatLog";
  menu.append(log, row);
  O.chatLog = [];
  function renderLog() {
    log.replaceChildren(...(O.chatLog.length ? O.chatLog.map((c) => {
      const l = document.createElement("p"); l.className = "cl" + (c.id === O.you ? " me" : "");
      const n = document.createElement("b"); n.textContent = c.id === O.you ? "Vous" : c.name;
      l.append(n, document.createTextNode(` ${c.text}`)); return l;
    }) : [Object.assign(document.createElement("p"), { className: "cl empty", textContent: "Aucun message pour l'instant." })]));
    log.scrollTop = log.scrollHeight;
  }
  renderLog();
  function closeReacts() { menu.hidden = true; fab.setAttribute("aria-expanded", "false"); fab.classList.remove("open"); }
  // la bulle se déplace au doigt (sa place est retenue) ; un simple appui ouvre le menu
  try { const pos = JSON.parse(localStorage.getItem("quizly:fabPos") || "null"); if (pos) { fab.style.left = pos.x + "px"; fab.style.top = pos.y + "px"; fab.style.right = "auto"; } } catch {}
  let drag = null;
  fab.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, moved: false }; fab.setPointerCapture(e.pointerId); });
  fab.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
    drag.moved = true;
    const w = fab.offsetWidth, x = Math.min(innerWidth - w - 4, Math.max(4, e.clientX - w / 2)), y = Math.min(innerHeight - w - 4, Math.max(60, e.clientY - w / 2));
    fab.style.left = x + "px"; fab.style.top = y + "px"; fab.style.right = "auto";
  });
  fab.addEventListener("pointerup", () => {
    if (drag && drag.moved) { try { localStorage.setItem("quizly:fabPos", JSON.stringify({ x: parseInt(fab.style.left), y: parseInt(fab.style.top) })); } catch {} fab.dataset.dragged = "1"; }
    drag = null;
  });
  fab.onclick = () => {
    if (fab.dataset.dragged) { delete fab.dataset.dragged; return; } // c'était un déplacement, pas un appui
    const open = menu.hidden;
    clearTimeout(O.reactT);
    if (open) { O.unread = 0; fab.classList.remove("unread"); renderLog(); }
    menu.hidden = !open; fab.setAttribute("aria-expanded", String(open)); fab.classList.toggle("open", open);
  };
  document.addEventListener("pointerdown", (e) => { if (!menu.hidden && !menu.contains(e.target) && !fab.contains(e.target)) closeReacts(); });
  function showChat(m) {
    const d = document.createElement("div");
    d.className = `bubble chat ${m.sk || ""}`;
    const n = document.createElement("b"); n.textContent = m.id === O.you ? "Vous" : m.name;
    d.append(n, document.createTextNode(` ${m.text}`));
    d.style.left = `${6 + Math.random() * 40}vw`;
    d.onanimationend = () => d.remove();
    document.body.append(d);
    setTimeout(() => d.remove(), 6000);
  }
  // message bref en haut de l'écran (ex. : « Cyril est éliminé »)
  function toast(t) {
    const el = $("gameToast"); el.textContent = t; el.hidden = false;
    clearTimeout(O.toastT); O.toastT = setTimeout(() => (el.hidden = true), 3500);
  }
  // Millionnaire : l'avancement de chaque joueur, toujours visible
  function millLive() {
    const box = $("mLive");
    const list = O.mboard || [];
    box.hidden = list.length < 2;
    box.replaceChildren(...list.map((p) => {
      const c = document.createElement("span");
      c.className = "mlp" + (p.out ? " out" : p.answered ? " ok" : "") + (p.id === O.you ? " me" : "");
      const nm = document.createElement("b"); nm.textContent = p.id === O.you ? "Vous" : p.name;
      const v = document.createElement("small"); v.textContent = p.out ? `${euros(p.won)} · sorti` : euros(p.won);
      c.append(avatarEl(p.name, photoOf(p.id)), nm, v);
      return c;
    }));
  }
  function showReact(m) {
    const d = document.createElement("div");
    d.className = `bubble r${m.r} ${m.sk || ""}`;
    const n = document.createElement("b"); n.textContent = m.id === O.you ? "Vous" : m.name;
    d.append(n, document.createTextNode(` ${REACTS[m.r] || ""}`));
    d.style.left = `${8 + Math.random() * 62}vw`;
    d.onanimationend = () => d.remove();
    document.body.append(d);
    setTimeout(() => d.remove(), 4000);
  }

  /* ----- Équipes en ligne ----- */
  function teamLine(teams) { return teams.map((t) => `${t.name} ${t.points}`).join(" · ") + " pts"; }

  /* ----- Mode TV : en Survie, la question est sur la télé, le téléphone sert de manette ----- */
  /* ----- L'Imposteur : sa carte en secret, la discussion, le vote, la dernière chance ----- */
  function renderImp(m) {
    O.imp = m; O.cur = null; $("betBox").hidden = true;
    const host = O.host === O.you;
    if (m.phase === "clue") impClueScreen();
    else if (m.phase === "talk") imp.talk(m, host ? () => send({ t: "impvote" }) : null);
    else if (m.phase === "vote") impVoteScreen();
    else if (m.phase === "guess") imp.guess(m, m.you ? (i) => send({ t: "iguess", i }) : null);
    else if (m.phase === "result") {
      const me = m.board.find((p) => p.id === O.you);
      flash(me && me.gain ? "ok" : "ko"); // vous avez gagné des points cette manche ?
      imp.result(m, host ? () => send({ t: "next" }) : null, m.last ? "Voir le classement" : "Manche suivante");
    }
    show("s-imp");
  }
  function impClueScreen() { imp.clue(O.imp, (text) => send({ t: "iclue", text })); }
  function impVoteScreen() {
    const m = O.imp;
    imp.vote({ ...m, info: "Touchez celui que vous soupçonnez.", players: m.players.map((p) => ({ ...p, self: p.id === O.you })),
      wait: m.picked != null ? `Vote enregistré · ${m.count || 0} / ${m.total || m.players.length} ont voté` : `${m.count || 0} / ${m.total || m.players.length} ont voté` },
    (p) => { if (m.picked != null) return; m.picked = p.id; send({ t: "vote", id: p.id }); impVoteScreen(); });
  }
  function tvMode(on, kind) { document.body.classList.toggle("tvmode", !!on && ["survie", "equipes", "parieurs"].includes(kind || "survie")); }

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
  $("lobbyCode").onclick = () => {
    try { navigator.clipboard.writeText($("lobbyCode").textContent); $("lobbyMsg").textContent = "Code copié."; } catch {}
  };
  return api;
}
