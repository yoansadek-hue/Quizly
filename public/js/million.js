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
    H = handlers; locked = false;
    $("mStep").textContent = `Question ${m.n + 1} / 15`;
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
      box.append(b);
    });
    setJokers(m.jokers);
    $("mStop").hidden = m.n === 0;
    $("mStop").disabled = false;
    $("mStop").textContent = `Je m'arrête avec ${euros(wonAt(m.n))}`;
    $("mStop").onclick = () => { if (!locked) H.stop && H.stop(); };
    info(m.info || (m.n ? `Palier assuré : ${euros(safeAt(m.n))}` : "Les paliers sûrs sont à 1 500 € et 48 000 €."));
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

/* ---------- Partie sur l'appareil (un joueur) ---------- */
export function millionLocal({ $, show, flash, ask, ui, getQ, onEnd }) {
  const L = { run: 0, n: 0, q: null, jok: null, removed: [], retry: null };

  async function load(d) {
    const run = L.run;
    const slow = setTimeout(() => { if (run === L.run) { $("loadText").textContent = "L'IA prépare la question…"; $("loadErr").hidden = true; show("s-load"); } }, 300);
    try { return await getQ(d); } finally { clearTimeout(slow); }
  }
  async function next(swap) {
    const run = L.run, n = L.n, d = millionLevel(n);
    let q;
    try { q = await load(d); }
    catch (e) {
      if (run !== L.run) return;
      $("loadText").textContent = `Impossible de charger la question : ${e.message}`;
      $("loadErr").hidden = false; show("s-load");
      L.retry = () => next(swap);
      return;
    }
    if (run !== L.run) return; // partie quittée entre-temps
    L.q = { ...q, options: shuffle(q.o) }; L.removed = [];
    ui.render({ n, tag: `${q.t} · ${LEVELS[d]}`, q: q.q, img: q.img, options: L.q.options, jokers: L.jok }, { pick, joker, stop });
    show("s-million");
  }
  function pick(i) {
    const run = L.run;
    ui.info("Réponse verrouillée…");
    setTimeout(() => { // un peu de suspense
      if (run !== L.run) return;
      const ok = L.q.options[i] === L.q.a;
      ui.reveal({ answer: L.q.a, picked: i, correct: ok });
      flash(ok ? "ok" : "ko");
      if (ok) {
        L.n++;
        if (L.n === 15) return setTimeout(() => run === L.run && finish(PRIZES[14]), 1500);
        ui.info(`Bonne réponse ! Vous avez ${euros(wonAt(L.n))}.`);
        setTimeout(() => run === L.run && next(), 1700);
      } else {
        ui.info(`Mauvaise réponse. Vous repartez avec ${euros(safeAt(L.n))}.`);
        setTimeout(() => run === L.run && finish(safeAt(L.n)), 2400);
      }
    }, 1100);
  }
  function joker(k) {
    if (k === "fifty") {
      const wrong = shuffle(L.q.options.map((o, i) => i).filter((i) => L.q.options[i] !== L.q.a));
      L.removed = wrong.slice(0, 2);
      ui.fifty(L.q.options.map((o, i) => i).filter((i) => !L.removed.includes(i)));
    } else if (k === "public") ui.showPublic(publicVote(L.q.options, L.q.a, millionLevel(L.n), L.removed));
    else if (k === "swap") next(true);
  }
  function stop() {
    const v = wonAt(L.n);
    ask("Vous arrêtez ?", `Vous repartez avec ${euros(v)}.`, "Je m'arrête", () => {
      ui.reveal({ answer: L.q.a, picked: -1, correct: false });
      ui.info(`La bonne réponse était : ${L.q.a}`);
      const run = L.run;
      setTimeout(() => run === L.run && finish(v), 1800);
    });
  }
  function finish(amount) { L.run++; ui.stopClock(); onEnd(amount, L.n); }

  return {
    start() { L.run++; L.n = 0; L.jok = { fifty: 1, public: 1, swap: 1 }; next(); },
    quit() { L.run++; ui.stopClock(); },
    retry() { if (L.retry) { const f = L.retry; L.retry = null; f(); } }
  };
}
