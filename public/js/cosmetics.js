// Cosmétiques : on gagne des jetons en jouant, on les dépense dans la Boutique.
// Cadre de photo, bulle de chat et bannière de profil sont visibles par les autres joueurs.
import { setFrame } from "./million.js";

// id : [catégorie, nom, prix, succès requis (article exclusif)]
export const ITEMS = {
  // cadres de photo
  "fr-ink": ["frame", "Encre", 0], "fr-sun": ["frame", "Citron", 40], "fr-mint": ["frame", "Menthe", 40], "fr-coral": ["frame", "Pamplemousse", 40],
  "fr-sky": ["frame", "Ciel", 40], "fr-peach": ["frame", "Abricot", 40], "fr-ice": ["frame", "Glace", 120], "fr-neon": ["frame", "Néon", 180],
  "fr-lava": ["frame", "Lave", 220], "fr-gold": ["frame", "Or", 260], "fr-rainbow": ["frame", "Arc-en-ciel", 400], "fr-crown": ["frame", "Millionnaire", 0, "million"],
  // bulles du chat
  "sk-classic": ["bubble", "Classique", 0], "sk-ink": ["bubble", "Nuit", 80], "sk-pastel": ["bubble", "Pastel", 80], "sk-candy": ["bubble", "Bonbon", 100],
  "sk-neon": ["bubble", "Néon", 160], "sk-gold": ["bubble", "Or", 240],
  // bannières du profil
  "bn-plain": ["banner", "Myrtille", 0], "bn-stripes": ["banner", "Rayures", 80], "bn-check": ["banner", "Damier", 100], "bn-sunset": ["banner", "Coucher de soleil", 120],
  "bn-lagoon": ["banner", "Lagon", 120], "bn-galaxy": ["banner", "Galaxie", 220], "bn-aurora": ["banner", "Aurore", 300], "bn-streak": ["banner", "Série de feu", 0, "streak7"]
};
// rareté, selon le prix
export function rarity(id) {
  const [, , p, need] = ITEMS[id];
  return need ? ["Exclusif", "x"] : p === 0 ? ["De base", "b"] : p <= 50 ? ["Commun", "c"] : p <= 150 ? ["Rare", "r"] : p <= 260 ? ["Épique", "e"] : ["Légendaire", "l"];
}
const DEFAULT = { frame: "fr-ink", bubble: "sk-classic", banner: "bn-plain" };
const CATS = [["frame", "Cadres"], ["bubble", "Bulles"], ["banner", "Bannières"]];

export function initCosmetics({ $, ask, uid, name, photo, achs, avatarEl, onChange }) {
  const k = (n) => `quizly:${uid()}:${n}`;
  const read = (n, d) => { try { return JSON.parse(localStorage.getItem(k(n)) || "null") ?? d; } catch { return d; } };
  const write = (n, v) => { try { localStorage.setItem(k(n), JSON.stringify(v)); } catch {} };
  const coins = () => +read("coins", 0) || 0;
  const owned = () => new Set([...read("owned", []), "fr-ink", "sk-classic", "bn-plain"]);
  const equipped = () => ({ ...DEFAULT, ...read("cos", {}) });
  let tab = "frame";

  // jetons gagnés en jouant (avec un petit « +5 » qui s'envole)
  function earn(n, why) {
    if (!uid() || !n) return;
    write("coins", coins() + n);
    const t = $("coinPop");
    t.textContent = `+${n} jeton${n > 1 ? "s" : ""}${why ? ` · ${why}` : ""}`;
    t.hidden = false; t.classList.remove("go"); void t.offsetWidth; t.classList.add("go");
    clearTimeout(t._t); t._t = setTimeout(() => (t.hidden = true), 1600);
  }
  const unlocked = (id) => { const need = ITEMS[id][3]; return !need || achs().includes(need); };

  function apply() { // ce qui est équipé s'affiche partout
    const e = equipped();
    if (name()) setFrame(name(), e.frame);
    document.body.dataset.banner = e.banner;
    onChange && onChange(e);
  }
  function equip(id) {
    const cat = ITEMS[id][0], e = equipped();
    e[cat] = id; write("cos", e);
    apply(); render();
  }
  // offre du jour : un article (pas encore à vous) à -40 %, le même pour tout le monde ce jour-là
  const day = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(Date.now());
  function deal() {
    const pool = Object.keys(ITEMS).filter((id) => ITEMS[id][2] > 0 && !ITEMS[id][3]);
    let h = 0; for (const ch of day()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const own = owned(), list = pool.filter((id) => !own.has(id));
    const id = (list.length ? list : pool)[h % (list.length || pool.length)];
    return { id, price: Math.round(ITEMS[id][2] * 0.6) };
  }
  const priceOf = (id) => (deal().id === id ? deal().price : ITEMS[id][2]);
  let sel = null; // l'article essayé
  function preview(id, big) {
    const [cat] = ITEMS[id];
    const p = document.createElement("div"); p.className = `pv pv-${cat}`;
    if (cat === "frame") { // seulement ce cadre-là
      const a = avatarEl(name() || "?", photo(), true);
      [...a.classList].filter((x) => x.startsWith("fr-")).forEach((x) => a.classList.remove(x));
      a.classList.add(id); p.append(a);
    } else if (cat === "bubble") { const b = document.createElement("span"); b.className = `bubble-pv ${id}`; b.textContent = "Trop facile"; p.append(b); }
    else p.classList.add(id);
    return p;
  }
  // l'aperçu en direct : vous, avec l'article essayé (le reste : ce que vous portez)
  function tryOn() {
    const e = equipped(), s = sel && ITEMS[sel] ? sel : null, cat = s && ITEMS[s][0];
    const fr = cat === "frame" ? s : e.frame, bu = cat === "bubble" ? s : e.bubble, bn = cat === "banner" ? s : e.banner;
    $("tryBan").className = `tryban ${bn}`;
    const a = avatarEl(name() || "?", photo(), true);
    [...a.classList].filter((x) => x.startsWith("fr-")).forEach((x) => a.classList.remove(x)); a.classList.add(fr);
    $("tryAv").replaceChildren(a); $("tryName").textContent = name() || "Vous";
    $("tryBub").className = `trybub ${bu}`;
    const btn = $("tryBtn");
    if (!s) { $("tryItem").textContent = "Touchez un article pour l'essayer"; $("tryHow").textContent = "Vous voyez ici ce que vous portez."; $("tryRar").hidden = true; btn.hidden = true; return; }
    const [, nm, , need] = ITEMS[s], [rl, rk] = rarity(s), own = owned().has(s), price = priceOf(s);
    $("tryItem").textContent = nm;
    $("tryRar").hidden = false; $("tryRar").textContent = rl; $("tryRar").className = `rar r-${rk}`;
    btn.hidden = false; btn.disabled = false; btn.className = "btn sm";
    if (e[cat] === s) { btn.textContent = "Équipé"; btn.disabled = true; btn.classList.add("white"); $("tryHow").textContent = "Vous le portez déjà."; }
    else if (own) { btn.textContent = "Équiper"; btn.classList.add("mint"); btn.onclick = () => equip(s); $("tryHow").textContent = "Il est à vous."; }
    else if (need && !unlocked(s)) { btn.textContent = "Verrouillé"; btn.disabled = true; btn.classList.add("white"); $("tryHow").textContent = need === "million" ? "Débloquez le succès Millionnaire." : "Débloquez le succès Régulier (7 défis d'affilée)."; }
    else if (need) { btn.textContent = "Obtenir"; btn.classList.add("sun"); btn.onclick = () => { write("owned", [...owned(), s]); equip(s); }; $("tryHow").textContent = "Offert grâce à votre succès."; }
    else { btn.textContent = `${price} jetons`; btn.classList.add(coins() >= price ? "sun" : "white"); btn.onclick = () => buy(s); $("tryHow").textContent = coins() >= price ? "Touchez pour l'acheter." : `Il vous manque ${price - coins()} jetons.`; }
  }
  function render() {
    $("coinCount").textContent = coins();
    $("shopCoins").textContent = coins();
    document.querySelectorAll("#shopTabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.c === tab)));
    const e = equipped(), own = owned(), d = deal();
    // offre du jour
    const [, dn, dp] = ITEMS[d.id];
    $("dealPv").replaceChildren(preview(d.id)); $("dealName").textContent = dn; $("dealOld").textContent = dp; $("dealNew").textContent = d.price;
    const now = new Date(), mid = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" })); const left = 24 - mid.getHours();
    $("dealLeft").textContent = own.has(d.id) ? "déjà à vous" : `encore ${left} h`;
    $("dealCard").classList.toggle("got", own.has(d.id));
    $("dealCard").onclick = () => { tab = ITEMS[d.id][0]; sel = d.id; render(); };
    // la grille
    const ids = Object.keys(ITEMS).filter((id) => ITEMS[id][0] === tab);
    $("shopOwned").textContent = `${ids.filter((id) => own.has(id)).length} / ${ids.length} possédés`;
    $("shopGrid").replaceChildren(...ids.map((id) => {
      const [cat, nm, , need] = ITEMS[id], [rl, rk] = rarity(id);
      const card = document.createElement("button"); card.className = `item r-${rk}` + (e[cat] === id ? " on" : "") + (sel === id ? " sel" : "");
      const rb = document.createElement("span"); rb.className = `rar r-${rk}`; rb.textContent = rl;
      const t = document.createElement("b"); t.textContent = nm;
      const st = document.createElement("small"); st.className = "st";
      st.textContent = e[cat] === id ? "Équipé" : own.has(id) ? "Possédé" : need ? (unlocked(id) ? "Offert" : "Verrouillé") : `${priceOf(id)} jetons${d.id === id ? " · −40 %" : ""}`;
      if (!own.has(id) && !need) st.classList.add("price");
      card.append(rb, preview(id), t, st);
      card.onclick = () => { sel = id; $("shopMsg").textContent = ""; render(); $("tryOn").scrollIntoView({ behavior: "smooth", block: "nearest" }); };
      return card;
    }));
    tryOn();
  }
  function buy(id) {
    const nm = ITEMS[id][1], price = priceOf(id);
    if (coins() < price) { $("shopMsg").textContent = `Il vous manque ${price - coins()} jetons pour « ${nm} ».`; return; }
    ask(`Acheter « ${nm} » ?`, `${price} jetons. Vous en avez ${coins()}.`, "Acheter", () => {
      write("coins", coins() - price);
      write("owned", [...owned(), id]);
      equip(id);
    });
  }
  // les onglets Cadres · Bulles · Bannières
  $("shopTabs").replaceChildren(...CATS.map(([c, label]) => {
    const b = document.createElement("button"); b.dataset.c = c; b.textContent = label;
    b.onclick = () => { tab = c; sel = null; $("shopMsg").textContent = ""; render(); };
    return b;
  }));
  return { earn, apply, render, coins, equipped, get: () => equipped() };
}
