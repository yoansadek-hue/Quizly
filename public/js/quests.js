// Défis quotidiens et hebdomadaires : on avance en jouant, on récupère des Q-Bucks
// k : ce qui fait avancer le défi ; n : l'objectif ; r : la récompense ; max : on garde le meilleur (pas un total)
const DAILY = [
  { id: "d-daily", txt: "Faire le Défi du jour", k: "daily", n: 1, r: 15 },
  { id: "d-good15", txt: "Trouver 15 bonnes réponses", k: "good", n: 15, r: 20 },
  { id: "d-good30", txt: "Trouver 30 bonnes réponses", k: "good", n: 30, r: 35 },
  { id: "d-games3", txt: "Jouer 3 parties", k: "game", n: 3, r: 20 },
  { id: "d-online", txt: "Jouer une partie en ligne", k: "online", n: 1, r: 20 },
  { id: "d-run5", txt: "Enchaîner 5 bonnes réponses", k: "run", n: 5, r: 25, max: true },
  { id: "d-chrono", txt: "Jouer une partie de Chrono", k: "chrono", n: 1, r: 15 },
  { id: "d-million", txt: "Jouer à Qui veut gagner des millions", k: "million", n: 1, r: 15 },
  { id: "d-score7", txt: "Faire 7/10 ou plus au Défi du jour", k: "dailyScore", n: 7, r: 30, max: true }
];
const WEEKLY = [
  { id: "w-good150", txt: "Trouver 150 bonnes réponses", k: "good", n: 150, r: 120 },
  { id: "w-games15", txt: "Jouer 15 parties", k: "game", n: 15, r: 100 },
  { id: "w-daily5", txt: "Faire 5 Défis du jour", k: "daily", n: 5, r: 120 },
  { id: "w-online5", txt: "Jouer 5 parties en ligne", k: "online", n: 5, r: 110 },
  { id: "w-win3", txt: "Gagner 3 parties en ligne", k: "win", n: 3, r: 150 },
  { id: "w-run10", txt: "Enchaîner 10 bonnes réponses", k: "run", n: 10, r: 130, max: true },
  { id: "w-perfect", txt: "Faire 10/10 au Défi du jour", k: "dailyScore", n: 10, r: 200, max: true }
];
const CHEST = 25; // coffre : les 3 défis du jour récupérés

const parisDay = (t = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(t);
function weekOf(day) { // semaine ISO (du lundi au dimanche), heure de Paris
  const d = new Date(`${day}T12:00:00Z`), wd = (d.getUTCDay() + 6) % 7; // 0 = lundi
  const thu = new Date(d); thu.setUTCDate(d.getUTCDate() - wd + 3);
  const jan4 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 4));
  const w = 1 + Math.round(((thu - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return { key: `${thu.getUTCFullYear()}-S${w}`, left: 7 - wd };
}
const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
function pick(pool, n, seed, keep) { // le même tirage pour tout le monde ce jour-là (ou cette semaine-là)
  const out = keep ? pool.filter((q) => q.id === keep) : [];
  const rest = pool.filter((q) => q.id !== keep);
  let h = hash(seed);
  while (out.length < n && rest.length) { h = (h * 1103515245 + 12345) >>> 0; out.push(rest.splice(h % rest.length, 1)[0]); }
  return out;
}

export function initQuests({ $, uid, earn, onChange }) {
  const key = () => `quizly:${uid()}:quests`;
  function load() {
    let s = {}; try { s = JSON.parse(localStorage.getItem(key()) || "{}") || {}; } catch {}
    const day = parisDay(), wk = weekOf(day).key;
    if (s.day !== day) Object.assign(s, { day, d: {}, gotD: [] }); // nouveau jour : les défis du jour repartent de zéro
    if (s.week !== wk) Object.assign(s, { week: wk, w: {}, gotW: [] });
    return s;
  }
  const save = (s) => { try { localStorage.setItem(key(), JSON.stringify(s)); } catch {} };
  const today = (s) => pick(DAILY, 3, `d-${s.day}`, "d-daily");
  const week = (s) => pick(WEEKLY, 3, `w-${s.week}`);
  const val = (bag, q) => Math.min(q.n, bag[q.k] || 0);
  const ready = (s) => [...today(s).filter((q) => val(s.d, q) >= q.n && !s.gotD.includes(q.id)), ...week(s).filter((q) => val(s.w, q) >= q.n && !s.gotW.includes(q.id))].length
    + (today(s).every((q) => s.gotD.includes(q.id)) && !s.gotD.includes("chest") ? 1 : 0);

  function changed(s) { save(s); onChange && onChange(ready(s)); if (!$("s-quests").hidden) render(); }
  // un événement de jeu : il fait avancer les défis du jour et de la semaine
  function tick(k, n = 1) { if (!uid()) return; const s = load(); s.d[k] = (s.d[k] || 0) + n; s.w[k] = (s.w[k] || 0) + n; changed(s); }
  function best(k, v) { if (!uid()) return; const s = load(); s.d[k] = Math.max(s.d[k] || 0, v); s.w[k] = Math.max(s.w[k] || 0, v); changed(s); }
  function claim(q, weekly) {
    const s = load(), got = weekly ? s.gotW : s.gotD;
    if (got.includes(q.id) || val(weekly ? s.w : s.d, q) < q.n) return;
    got.push(q.id); save(s);
    earn(q.r, "défi");
    changed(s);
  }
  function claimChest() {
    const s = load();
    if (s.gotD.includes("chest") || !today(s).every((q) => s.gotD.includes(q.id))) return;
    s.gotD.push("chest"); save(s); earn(CHEST, "coffre"); changed(s);
  }
  function card(q, bag, got, weekly) {
    const v = val(bag, q), done = v >= q.n, taken = got.includes(q.id);
    const c = document.createElement("div"); c.className = "quest" + (taken ? " taken" : done ? " ready" : "");
    const t = document.createElement("div"); t.className = "qtxt";
    const b = document.createElement("b"); b.textContent = q.txt;
    const bar = document.createElement("div"); bar.className = "qbar"; const i = document.createElement("i"); i.style.width = `${Math.round((100 * v) / q.n)}%`; bar.append(i);
    const p = document.createElement("small"); p.textContent = q.max ? (done ? "Réussi" : `Meilleur : ${v} / ${q.n}`) : `${v} / ${q.n}`;
    t.append(b, bar, p);
    const btn = document.createElement("button"); btn.className = "btn sm qbtn " + (taken ? "white" : done ? "sun" : "white wait");
    btn.innerHTML = ""; const coin = document.createElement("span"); coin.className = "coin"; btn.append(coin, document.createTextNode(` ${q.r}`));
    if (taken) { btn.textContent = "Récupéré"; btn.disabled = true; }
    else if (done) btn.onclick = () => claim(q, weekly);
    else btn.disabled = true;
    c.append(t, btn); return c;
  }
  function render() {
    const s = load(), wk = weekOf(s.day);
    save(s);
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
    $("qDayLeft").textContent = `encore ${24 - now.getHours()} h`;
    $("qWeekLeft").textContent = wk.left > 1 ? `encore ${wk.left} jours` : "dernier jour";
    $("qDayList").replaceChildren(...today(s).map((q) => card(q, s.d, s.gotD, false)));
    $("qWeekList").replaceChildren(...week(s).map((q) => card(q, s.w, s.gotW, true)));
    // le coffre : les 3 défis du jour récupérés
    const all = today(s).every((q) => s.gotD.includes(q.id)), open = s.gotD.includes("chest");
    const ch = $("qChest"); ch.className = "qchest" + (open ? " open" : all ? " ready" : "");
    ch.replaceChildren();
    const ico = document.createElementNS("http://www.w3.org/2000/svg", "svg"); ico.setAttribute("class", "qchico"); ico.setAttribute("viewBox", "0 0 24 24"); ico.setAttribute("aria-hidden", "true");
    const ip = document.createElementNS("http://www.w3.org/2000/svg", "path"); ip.setAttribute("fill", "currentColor");
    ip.setAttribute("d", open ? "M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" : "M20 7h-2.2A3 3 0 0 0 12 4.5 3 3 0 0 0 6.2 7H4v5h1v9h14v-9h1V7zM9 5.5a1 1 0 0 1 1 1V7H9a.75.75 0 0 1 0-1.5zm6 0A.75.75 0 0 1 15 7h-1v-.5a1 1 0 0 1 1-1zM6 9h5v1.5H6zm7 0h5v1.5h-5zM7 12h4v7H7zm6 0h4v7h-4z"); ico.append(ip);
    const tx = document.createElement("div"); tx.className = "qtxt";
    const b = document.createElement("b"); b.textContent = open ? "Coffre du jour ouvert" : "Coffre du jour";
    const sm = document.createElement("small"); sm.textContent = open ? "Revenez demain pour un nouveau coffre." : all ? `Ouvrez-le : +${CHEST} Q-Bucks.` : "Récupérez les 3 défis du jour pour l'ouvrir.";
    tx.append(b, sm); ch.append(ico, tx);
    if (all && !open) { const btn = document.createElement("button"); btn.className = "btn sun sm qbtn"; btn.textContent = "Ouvrir"; btn.onclick = claimChest; ch.append(btn); }
  }
  // vos chiffres de la semaine (pour les défis du club)
  const weekStats = () => { const s = load(); return { week: s.week, good: s.w.good || 0, game: s.w.game || 0, daily: s.w.daily || 0 }; };
  return { tick, best, render, weekStats, ready: () => ready(load()) };
}
