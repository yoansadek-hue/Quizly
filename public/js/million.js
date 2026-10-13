// Qui veut gagner des millions : écran commun (sur l'appareil et en ligne) + partie sur l'appareil
import { PRIZES, SAFE, millionLevel, wonAt, safeAt, euros, publicVote } from "./local.js";

const LEVELS = ["", "Facile", "Moyen", "Difficile", "Expert", "Légende"];
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- Écran ---------- */
export function millionUI($) {
  let H = {}, tid = null, locked = false;

  function ladder(n) {
    const ol = $("mLadder");
    ol.replaceChildren();
    PRIZES.forEach((p, i) => {
      const li = document.createElement("li");
      li.textContent = euros(p);
      if (SAFE.includes(i + 1)) li.classList.add("safe");
      if (i < n) li.classList.add("done");
      if (i === n) li.classList.add("now");
      ol.append(li);
    });
    // centre le gain en cours, une fois l'écran affiché (sinon les mesures valent 0)
    requestAnimationFrame(() => {
      const cur = ol.children[n];
      if (cur) ol.scrollLeft = Math.max(0, cur.offsetLeft - ol.offsetLeft - ol.clientWidth / 2 + cur.clientWidth / 2);
    });
  }
  function stopClock() { clearInterval(tid); tid = null; $("mBar").style.animationPlayState = "paused"; }
  function clock(sec, total) {
    stopClock();
    $("mClockrow").hidden = !sec;
    if (!sec) return;
    const bar = $("mBar"), end = Date.now() + sec * 1000;
    bar.style.setProperty("--dur", total + "s");
    bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = "";
    bar.style.animationDelay = `-${total - sec}s`;
    bar.style.animationPlayState = "running";
    const tick = () => { const s = Math.max(0, Math.ceil((end - Date.now()) / 1000)); $("mClock").textContent = s; $("mClock").classList.toggle("urgent", s > 0 && s <= 5); };
    tick(); tid = setInterval(tick, 250);
  }
  function setJokers(j) {
    [["mFifty", "fifty"], ["mPublic", "public"], ["mSwap", "swap"]].forEach(([id, k]) => {
      const b = $(id);
      b.disabled = !j[k]; b.classList.toggle("used", !j[k]);
      b.onclick = () => { if (locked || !j[k]) return; j[k] = 0; b.disabled = true; b.classList.add("used"); H.joker && H.joker(k); };
    });
  }
  // m : { n, tag, q, img, options, jokers, time, total, info }
  function render(m, handlers) {
    H = handlers; locked = !!m.watch;
    $("s-million").classList.toggle("watch", !!m.watch); // éliminé : on regarde les autres jouer
    document.querySelector(".mjokers").hidden = !!m.watch;
    $("mStep").textContent = m.who || `Question ${m.n + 1} / 15`; // sur un téléphone à plusieurs : le nom du joueur
    $("mAv").replaceChildren(m.avName ? avatarEl(m.avName, m.avPhoto) : "");
    $("mWon").textContent = euros(PRIZES[m.n]);
    $("mTag").textContent = m.tag;
    $("mText").textContent = m.q;
    const ql = m.q.length;
    $("mText").dataset.len = ql > 170 ? "xl" : ql > 120 ? "l" : ql > 80 ? "m" : "s";
    const im = $("mImg");
    if (m.img) { im.hidden = false; im.onerror = () => { im.hidden = true; }; im.src = m.img; } else { im.hidden = true; im.removeAttribute("src"); }
    const box = $("mOpts");
    box.replaceChildren();
    box.classList.toggle("long", m.options.some((o) => o.length > 24));
    m.options.forEach((o, i) => {
      const b = document.createElement("button");
      b.className = "btn white"; b.dataset.i = i;
      const t = document.createElement("span"); t.textContent = o;
      const p = document.createElement("small"); p.className = "pct";
      b.append(t, p);
      b.style.animation = `pop .25s ${i * 50}ms backwards`;
      b.onclick = () => { if (locked) return; lock(i); H.pick && H.pick(i); };
      if (m.watch) b.disabled = true;
      box.append(b);
    });
    if (!m.watch) setJokers(m.jokers);
    $("mStop").hidden = m.n === 0 || !!m.watch;
    $("mStop").disabled = false;
    $("mStop").textContent = `Je m'arrête avec ${euros(wonAt(m.n))}`;
    $("mStop").onclick = () => { if (!locked) H.stop && H.stop(); };
    const base = m.n ? `Palier assuré : ${euros(safeAt(m.n))}` : "Paliers sûrs : 1 500 € et 48 000 €";
    info(m.info || (m.who ? `Question ${m.n + 1} / 15 · ${base}` : base));
    ladder(m.n);
    clock(m.time || 0, m.total || m.time || 0);
  }
  function btns() { return [...document.querySelectorAll("#mOpts .btn")]; }
  function lock(i) {
    locked = true; stopClock();
    btns().forEach((b) => { b.disabled = true; if (+b.dataset.i === i) b.classList.add("picked"); });
    $("mStop").disabled = true;
    ["mFifty", "mPublic", "mSwap"].forEach((id) => ($(id).disabled = true));
  }
  function fifty(keep) {
    btns().forEach((b) => { if (!keep.includes(+b.dataset.i)) { b.disabled = true; b.classList.add("gone"); } });
  }
  function showPublic(perc) {
    btns().forEach((b) => { const v = perc[+b.dataset.i] || 0; b.querySelector(".pct").textContent = b.classList.contains("gone") ? "" : `Public : ${v} %`; });
  }
  function reveal({ answer, picked, correct }) {
    locked = true; stopClock();
    btns().forEach((b) => {
      b.disabled = true;
      const txt = b.querySelector("span").textContent;
      if (txt === answer) b.classList.add("right");
      else if (+b.dataset.i === picked && !correct) b.classList.add("wrong");
    });
  }
  function info(t) { $("mInfo").textContent = t; }
  return { render, lock, fifty, showPublic, reveal, info, stopClock };
}

/* ---------- Partie sur un téléphone, à plusieurs ----------
   Chacun a sa propre échelle et ses 3 jokers. On joue à tour de rôle, une question chacun.
   Celui qui repart avec le plus d'argent gagne. */
export function millionLocal({ $, show, flash, ask, ui, getQ, onEnd, stat, photoOf }) {
  const L = { run: 0, list: [], cur: -1, q: null, removed: [], retry: null };
  const P = () => L.list[L.cur];

  async function load(d) {
    const run = L.run;
    const slow = setTimeout(() => { if (run === L.run) { $("loadText").textContent = "L'IA prépare la question…"; $("loadErr").hidden = true; show("s-load"); } }, 300);
    try { return await getQ(d); } finally { clearTimeout(slow); }
  }
  function turn() { // joueur suivant encore en jeu
    const n = L.list.length;
    for (let k = 1; k <= n; k++) { const i = (L.cur + k) % n; if (!L.list[i].out) { L.cur = i; return ask1(); } }
    finish();
  }
  async function ask1() {
    const run = L.run, p = P(), d = millionLevel(p.n);
    let q;
    try { q = await load(d); }
    catch (e) {
      if (run !== L.run) return;
      $("loadText").textContent = `Impossible de charger la question : ${e.message}`;
      $("loadErr").hidden = false; show("s-load");
      L.retry = ask1;
      return;
    }
    if (run !== L.run) return; // partie quittée entre-temps
    L.q = { ...q, options: shuffle(q.o) }; L.removed = [];
    ui.render({ n: p.n, who: L.list.length > 1 ? p.name : "", avName: p.name, avPhoto: photoOf ? photoOf(p.name) : "", tag: `${q.t} · ${LEVELS[d]}`, q: q.q, img: q.img, options: L.q.options, jokers: p.jok }, { pick, joker, stop });
    show("s-million");
  }
  function after(ms) { const run = L.run; setTimeout(() => run === L.run && turn(), ms); }
  function pick(i) {
    const run = L.run, p = P();
    ui.info(`${L.list.length > 1 ? p.name + " : r" : "R"}éponse verrouillée…`);
    setTimeout(() => { // un peu de suspense
      if (run !== L.run) return;
      const ok = L.q.options[i] === L.q.a;
      if (stat) stat(L.q.t, ok); // pour le Profil
      ui.reveal({ answer: L.q.a, picked: i, correct: ok });
      flash(ok ? "ok" : "ko");
      if (ok) {
        p.n++; p.won = wonAt(p.n);
        if (p.n === 15) { p.out = true; ui.info(`${p.name} gagne 1 000 000 € !`); return after(2200); }
        ui.info(`Bonne réponse ! ${p.name} a ${euros(p.won)}.`);
        after(1800);
      } else {
        p.out = true; p.won = safeAt(p.n);
        ui.info(`Mauvaise réponse. ${p.name} repart avec ${euros(p.won)}.`);
        after(2600);
      }
    }, 1100);
  }
  function joker(k) {
    if (k === "fifty") {
      const wrong = shuffle(L.q.options.map((o, i) => i).filter((i) => L.q.options[i] !== L.q.a));
      L.removed = wrong.slice(0, 2);
      ui.fifty(L.q.options.map((o, i) => i).filter((i) => !L.removed.includes(i)));
    } else if (k === "public") ui.showPublic(publicVote(L.q.options, L.q.a, millionLevel(P().n), L.removed));
    else if (k === "swap") ask1();
  }
  function stop() {
    const p = P(), v = wonAt(p.n);
    ask(`${p.name} s'arrête ?`, `${p.name} repart avec ${euros(v)}.`, "Je m'arrête", () => {
      p.out = true; p.won = v;
      ui.reveal({ answer: L.q.a, picked: -1, correct: false });
      ui.info(`${p.name} repart avec ${euros(v)}. La réponse était : ${L.q.a}`);
      after(2400);
    });
  }
  function finish() { L.run++; ui.stopClock(); onEnd(L.list); }

  return {
    start(names) {
      L.run++; L.cur = -1;
      L.list = names.map((name) => ({ name, n: 0, won: 0, out: false, jok: { fifty: 1, public: 1, swap: 1 } }));
      turn();
    },
    quit() { L.run++; ui.stopClock(); },
    retry() { if (L.retry) { const f = L.retry; L.retry = null; f(); } }
  };
}

/* ---------- Photo de profil (ou initiale colorée) ---------- */
const AV_COLORS = ["#ffe14d", "#34e3b0", "#ff6b8b", "#62c7ff", "#c4b8ff", "#ffb36b"];
export function avatarEl(name, photo, big) {
  const cls = "avatar" + (big ? " big" : "");
  if (photo) {
    const im = document.createElement("img");
    im.className = cls; im.alt = ""; im.referrerPolicy = "no-referrer"; im.src = photo;
    im.onerror = () => im.replaceWith(avatarEl(name, "", big)); // photo introuvable : initiale
    return im;
  }
  const s = document.createElement("span");
  s.className = cls;
  const n = String(name || "?").trim();
  s.textContent = n.charAt(0).toUpperCase() || "?";
  let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  s.style.background = AV_COLORS[h % AV_COLORS.length];
  return s;
}

/* ---------- Extrait musical (Devine la chanson) ---------- */
export function setAudio($, url) {
  const a = $("qAudio"), b = $("qPlay");
  a.pause();
  if (!url) { b.hidden = true; a.removeAttribute("src"); return; }
  a.src = url; b.hidden = false;
  const label = () => (b.textContent = a.paused ? "Écouter l'extrait" : "Arrêter l'extrait");
  b.onclick = (e) => { e.stopPropagation(); if (a.paused) { a.currentTime = 0; a.play().then(label).catch(label); } else { a.pause(); label(); } };
  a.onended = a.onpause = label;
  label();
  a.play().then(label).catch(label); // lance tout de suite si le téléphone l'autorise, sinon il faut toucher le bouton
}
