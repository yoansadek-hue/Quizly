// Le « juice » de Quizly : des sons synthétisés (aucun fichier à télécharger), l'onde sous le doigt,
// les Q-Bucks qui s'envolent vers le compteur et les nombres qui défilent.
// Tout passe par sfx(nom) ; les sons se coupent dans Paramètres (« Sons »).

let ctx = null, out = null, noiseBuf = null, on = true;
const AC = window.AudioContext || window.webkitAudioContext;

// Créer le contexte audio coûte une image entière sur un téléphone : on le fait quand l'appli ne fait rien
// (jamais pendant un geste). Il naît « en pause » ; le son ne peut démarrer qu'après un vrai geste (iPhone,
// navigateurs) : la fin d'un appui le réveille, ce qui ne coûte presque rien.
function make() {
  if (ctx || !AC || !on) return;
  try { ctx = new AC(); } catch { return; }
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
  out = ctx.createGain(); out.gain.value = 0.55;
  out.connect(comp).connect(ctx.destination);
}
const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
addEventListener("load", () => idle(make, { timeout: 4000 }));
function wake() {
  if (!on) return;
  if (!ctx) return idle(make, { timeout: 1000 }); // pas encore prêt : à la prochaine pause
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
}
["click", "keydown", "touchend"].forEach((ev) => addEventListener(ev, wake, { capture: true, passive: true }));

// une note : forme d'onde, fréquence (avec glissé), départ, durée, volume
function tone(f, t, dur, { type = "sine", to = 0, gain = 0.15, attack = 0.006 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + t;
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(out); o.start(t0); o.stop(t0 + dur + 0.02);
}
// un souffle filtré (glissement d'écran, déclic)
function noise(t, dur, { from = 800, to = 2400, q = 1.2, gain = 0.06 } = {}) {
  if (!noiseBuf) { // un souffle blanc d'une demi-seconde, préparé au premier besoin
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t0 = ctx.currentTime + t;
  s.buffer = noiseBuf; f.type = "bandpass"; f.Q.value = q;
  f.frequency.setValueAtTime(from, t0); f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(out); s.start(t0); s.stop(t0 + dur + 0.02);
}

const SFX = {
  tap() { tone(520, 0, 0.05, { to: 340, gain: 0.07 }); noise(0, 0.03, { from: 3000, to: 1800, gain: 0.025 }); },
  select() { tone(660, 0, 0.07, { type: "triangle", to: 990, gain: 0.08 }); },
  toggle() { tone(440, 0, 0.05, { type: "triangle", gain: 0.06 }); tone(880, 0.045, 0.07, { type: "triangle", gain: 0.06 }); },
  ok() { // deux notes qui montent et une étincelle
    tone(1046.5, 0, 0.14, { type: "triangle", gain: 0.16 }); tone(1568, 0.08, 0.22, { type: "triangle", gain: 0.16 });
    tone(3136, 0.12, 0.16, { gain: 0.04 });
  },
  ko() { tone(240, 0, 0.26, { type: "sawtooth", to: 110, gain: 0.07 }); tone(180, 0.02, 0.3, { type: "square", to: 90, gain: 0.05 }); },
  coin() { tone(988, 0, 0.08, { type: "square", gain: 0.05 }); tone(1319, 0.07, 0.22, { type: "square", gain: 0.05 }); tone(2637, 0.07, 0.18, { gain: 0.03 }); },
  win() { // petite fanfare : arpège puis accord
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.18, { type: "triangle", gain: 0.13 }));
    [1046.5, 1318.5, 1568].forEach((f) => tone(f, 0.38, 0.6, { type: "triangle", gain: 0.08 }));
    noise(0.36, 0.5, { from: 4000, to: 9000, q: 0.8, gain: 0.03 });
  },
  lose() { [392, 349.23, 293.66].forEach((f, i) => tone(f, i * 0.16, 0.26, { type: "triangle", gain: 0.11 })); },
  unlock() { [1568, 2093, 2637, 3136, 4186].forEach((f, i) => tone(f, i * 0.055, 0.22, { gain: 0.06 })); },
  level() { tone(392, 0, 0.36, { type: "triangle", to: 1175, gain: 0.1 }); [784, 988, 1175].forEach((f, i) => tone(f, 0.3 + i * 0.07, 0.2, { type: "triangle", gain: 0.1 })); },
  tick() { tone(1250, 0, 0.035, { gain: 0.07 }); },
  tock() { tone(880, 0, 0.04, { gain: 0.07 }); },
  whoosh() { noise(0, 0.22, { from: 500, to: 2600, q: 0.9, gain: 0.05 }); },
  pop() { tone(320, 0, 0.09, { to: 720, gain: 0.08 }); },
  go() { tone(523.25, 0, 0.12, { type: "triangle", gain: 0.1 }); tone(1046.5, 0.1, 0.3, { type: "triangle", gain: 0.12 }); }
};
let last = {};
export function sfx(name) {
  if (!on || !SFX[name] || !ctx || ctx.state !== "running") return;
  const now = performance.now(); // pas deux fois le même son dans la même rafale
  if (now - (last[name] || 0) < 45) return;
  last[name] = now;
  try { SFX[name](); } catch {}
}
export function soundOn(v) { on = !!v; if (!on && ctx) ctx.suspend().catch(() => {}); if (on && !ctx && document.readyState === "complete") idle(make, { timeout: 4000 }); }

/* ---------- l'onde sous le doigt et le son des appuis ---------- */
// le son part au « clic » (le navigateur n'en envoie pas si le doigt a glissé : un balayage reste muet) ;
// l'onde attend un instant pour ne pas fleurir au départ d'un balayage, sauf si l'appui est déjà fini
const RIPPLE = ".btn, .mode, .daily, .qdaily, .clubcard, .setacct, .fcard, .quest";
const TAP = ".btn, .chip, .mode, .iconbtn, .coinchip, #btnUser, .tab, .ftab, .scope button, .seg button, .shoptabs button, .daily, .qdaily, .item, .fcard, .frow, .goback, .link, .penbtn, .avedit, .card, .reactfab, .quest, .qchest, .clubcard";
const QUIET = ".grid .btn, #mOpts .btn, .tab"; // les réponses (le verdict sonne juste après) et la barre (elle a son tic)
addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest(TAP);
  if (!t || t.disabled || t.getAttribute("aria-disabled") === "true" || t.matches(QUIET)) return;
  sfx(t.matches(".chip, .ftab, .scope button, .seg button, .shoptabs button") ? "select" : "tap");
}, { capture: true, passive: true });
let press = null;
function ripple() {
  const p = press; press = null;
  if (!p) return;
  clearTimeout(p.timer);
  const r = p.t.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2;
  const s = document.createElement("span");
  s.className = "ripple";
  s.style.cssText = `width:${d}px;height:${d}px;left:${p.x - r.left - d / 2}px;top:${p.y - r.top - d / 2}px`;
  p.t.append(s);
  setTimeout(() => s.remove(), 650);
}
addEventListener("pointerdown", (e) => {
  const t = e.target.closest && e.target.closest(RIPPLE);
  if (press) clearTimeout(press.timer);
  press = null;
  if (!t || t.disabled || document.body.classList.contains("calm")) return;
  press = { t, x: e.clientX, y: e.clientY, timer: setTimeout(ripple, 90) };
}, { passive: true });
addEventListener("pointermove", (e) => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) { clearTimeout(press.timer); press = null; } }, { passive: true });
addEventListener("pointerup", ripple, { passive: true });
addEventListener("pointercancel", () => { if (press) { clearTimeout(press.timer); press = null; } }, { passive: true });
addEventListener("change", (e) => { if (e.target.matches && e.target.matches(".tgl")) sfx("toggle"); });

/* ---------- les nombres qui défilent ---------- */
export function countUp(el, to, { from, dur = 700 } = {}) {
  if (!el) return;
  const a = from ?? (parseInt(el.textContent.replace(/\D/g, ""), 10) || 0);
  if (a === to || document.body.classList.contains("calm")) { el.textContent = to; return; }
  const t0 = performance.now();
  cancelAnimationFrame(el._cu);
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(a + (to - a) * e);
    if (k < 1) el._cu = requestAnimationFrame(step);
  };
  el._cu = requestAnimationFrame(step);
}

/* ---------- des Q-Bucks qui s'envolent vers le compteur ---------- */
export function coinFly(n = 5, from) {
  const chip = document.getElementById("btnCoins");
  if (!chip || chip.hidden || !chip.offsetParent || document.body.classList.contains("calm")) return bump(chip);
  const to = chip.querySelector(".coin") || chip, tr = to.getBoundingClientRect();
  const fr = from ? from.getBoundingClientRect() : { left: innerWidth / 2 - 10, top: innerHeight * 0.45, width: 20, height: 20 };
  const x0 = fr.left + fr.width / 2, y0 = fr.top + fr.height / 2, x1 = tr.left + tr.width / 2, y1 = tr.top + tr.height / 2;
  const k = Math.min(8, Math.max(3, n));
  for (let i = 0; i < k; i++) {
    const c = document.createElement("i");
    c.className = "flycoin";
    document.body.append(c);
    const sx = x0 + (Math.random() - 0.5) * 90, sy = y0 + (Math.random() - 0.5) * 50;
    const mx = (sx + x1) / 2 + (Math.random() - 0.5) * 120, my = Math.min(sy, y1) - 60 - Math.random() * 80;
    const a = c.animate([
      { transform: `translate(${sx}px,${sy}px) scale(.2)`, opacity: 0 },
      { transform: `translate(${sx}px,${sy - 18}px) scale(1.1)`, opacity: 1, offset: 0.18 },
      { transform: `translate(${mx}px,${my}px) scale(1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${x1}px,${y1}px) scale(.55)`, opacity: 0.9 }
    ], { duration: 720 + i * 60, delay: i * 55, easing: "cubic-bezier(.5,0,.6,1)", fill: "both" });
    a.onfinish = () => { c.remove(); if (i === 0) { bump(chip); sfx("coin"); } };
  }
}
function bump(el) {
  if (!el) return;
  el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
  clearTimeout(el._bt); el._bt = setTimeout(() => el.classList.remove("bump"), 600);
}
