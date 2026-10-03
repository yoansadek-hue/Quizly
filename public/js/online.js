// Jeu en ligne : le serveur mène la partie, ce fichier affiche ce qu'il envoie.
const LEVELS = ["", "Facile", "Moyen", "Difficile", "Expert", "Légende"];
const PALETTE = ["#ffd84d", "#29d9a1", "#ff9a9a", "#c9ceff", "#ffb86b", "#7fe7ff", "#d7a8ff", "#b7f171", "#ff9ed8", "#ffffff", "#9ad0ff", "#ffe98a"];
const HEART = "\u2665\uFE0E"; // cœur « texte » (jamais l'emoji rouge)

export function initOnline({ $, show, flash, confetti, me }) {
  const O = { cfg: null, editing: false, ws: null, you: null, host: null, active: false, inRoom: false, tid: null, cur: null, answered: false };
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
      O.active = false; O.inRoom = false; O.you = null; stopClock();
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
      case "load": stopClock(); $("loadText").textContent = "L'IA prépare la question…"; $("loadErr").hidden = true; show("s-load"); break;
      case "fail": $("loadText").textContent = m.msg; $("loadErr").hidden = O.you !== O.host; show("s-load"); break;
      case "q": renderQ(m); break;
      case "result": renderResult(m); break;
      case "level": renderLevel(m); break;
      case "end": renderEnd(m); break;
      case "host": O.host = m.host; break;
    }
  }

  /* ----- salle d'attente ----- */
  function renderLobby(m) {
    $("lobbyCode").textContent = m.code;
    const ul = $("lobbyList");
    ul.replaceChildren();
    m.players.forEach((p, i) => {
      const li = document.createElement("li");
      li.className = "chip";
      li.style.background = PALETTE[(p.ci || 0) % PALETTE.length];
      li.style.setProperty("--i", i);
      if (p.photo) { const im = document.createElement("img"); im.className = "avatar"; im.alt = ""; im.referrerPolicy = "no-referrer"; im.src = p.photo; li.append(im); }
      const s = document.createElement("span");
      s.textContent = p.name + (p.id === m.host ? " · hôte" : "");
      li.append(s);
      ul.append(li);
    });
    const host = m.host === m.you;
    $("lobbyCount").textContent = `${m.players.length} / 20 joueurs`;
    $("lobbyInfo").textContent = `${plural(m.cfg.themes.length, "thème")} · ${m.cfg.time ? m.cfg.time + " s" : "sans limite"} · ${plural(m.cfg.lives, "vie")}`;
    $("btnLobbyStart").hidden = !host;
    $("btnLobbyStart").disabled = m.players.length < 2;
    $("btnLobbyStart").textContent = m.players.length < 2 ? "Il faut au moins 2 joueurs" : "Lancer la partie";
    $("btnLobbyEdit").hidden = !host;
    $("lobbyWait").hidden = host && m.players.length >= 2;
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
    const mine = m.who === O.you;
    $("scene").classList.add("compact");
    const card = $("card");
    card.classList.remove("flipped"); card.style.animation = "none"; void card.offsetWidth; card.style.animation = "";
    $("whoName").textContent = mine ? `${m.name} (vous)` : m.name;
    $("whoName").classList.remove("retry");
    $("whoLives").hidden = false; $("whoLives").textContent = `${HEART} ${m.lives}`;
    $("alive").hidden = false; $("alive").textContent = mine ? "C'est à vous de jouer" : `${m.alive} joueurs en vie`;
    $("tag").textContent = m.tag;
    const ql = m.q.length;
    $("qText").textContent = m.q;
    const qi = $("qImg");
    if (m.img) { qi.hidden = false; qi.onerror = () => { qi.hidden = true; }; qi.src = m.img; } else { qi.hidden = true; qi.removeAttribute("src"); }
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
    $("endLead").textContent = m.winner ? "Vainqueur" : "Partie terminée";
    $("winner").textContent = m.winner || "Égalité";
    $("endNote").textContent = "";
    const ol = $("ranking");
    ol.replaceChildren();
    m.ranking.forEach((p, i) => {
      const li = document.createElement("li");
      li.className = "rk" + (i === 0 ? " first" : "");
      li.style.animationDelay = `${0.35 + i * 0.12}s`;
      const pos = document.createElement("span"); pos.className = "pos"; pos.textContent = i + 1;
      const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = p.name;
      const st = document.createElement("span"); st.className = "st";
      st.textContent = `${p.score} bonne${p.score > 1 ? "s" : ""} · ${HEART} ${p.lives}`;
      li.append(pos, nm, st);
      ol.append(li);
    });
    show("s-end");
    confetti();
  }

  /* ----- boutons de la salle ----- */
  $("btnLobbyStart").onclick = () => send({ t: "start" });
  $("btnLeave").onclick = () => { api.leave(); show("s-mode"); };
  $("lobbyCode").onclick = () => {
    try { navigator.clipboard.writeText($("lobbyCode").textContent); $("lobbyMsg").textContent = "Code copié."; } catch {}
  };
  return api;
}
