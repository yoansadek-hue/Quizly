// Cosmétiques : on gagne des Q-Bucks en jouant, on les dépense dans la Boutique.
// Cadre de photo, bulle de chat, bannière, titre et couleur du pseudo sont visibles par les autres joueurs ; le thème, seulement par vous.
import { setFrame } from "./million.js";

// id : [catégorie, nom, prix, succès requis (article exclusif)]
export const ITEMS = {
  // cadres de photo
  "fr-ink": ["frame", "Encre", 0], "fr-sun": ["frame", "Citron", 40], "fr-mint": ["frame", "Menthe", 40], "fr-coral": ["frame", "Pamplemousse", 40],
  "fr-sky": ["frame", "Ciel", 40], "fr-peach": ["frame", "Abricot", 40], "fr-cotton": ["frame", "Barbe à papa", 70], "fr-forest": ["frame", "Forêt", 90],
  "fr-ice": ["frame", "Glace", 120], "fr-pixel": ["frame", "Pixel", 140], "fr-neon": ["frame", "Néon", 180], "fr-lava": ["frame", "Lave", 220],
  "fr-gold": ["frame", "Or", 260], "fr-galaxy": ["frame", "Galaxie", 320], "fr-diamond": ["frame", "Diamant", 520],
  "fr-crown": ["frame", "Millionnaire", 0, "million"],
  // bulles du chat
  "sk-classic": ["bubble", "Classique", 0], "sk-mint": ["bubble", "Menthe", 60], "sk-sky": ["bubble", "Ciel", 60], "sk-ink": ["bubble", "Nuit", 80],
  "sk-pastel": ["bubble", "Pastel", 80], "sk-candy": ["bubble", "Bonbon", 100], "sk-neon": ["bubble", "Néon", 160], "sk-lava": ["bubble", "Lave", 190],
  "sk-gold": ["bubble", "Or", 240], "sk-galaxy": ["bubble", "Galaxie", 290],
  // bannières du profil
  "bn-plain": ["banner", "Myrtille", 0], "bn-mint": ["banner", "Menthe", 60], "bn-stripes": ["banner", "Rayures", 80], "bn-check": ["banner", "Damier", 100],
  "bn-sunset": ["banner", "Coucher de soleil", 120], "bn-lagoon": ["banner", "Lagon", 120], "bn-night": ["banner", "Nuit étoilée", 170], "bn-galaxy": ["banner", "Galaxie", 220],
  "bn-fire": ["banner", "Flammes", 250], "bn-aurora": ["banner", "Aurore", 300], "bn-streak": ["banner", "Série de feu", 0, "streak7"],
  // titres, sous le pseudo
  "ti-none": ["title", "Aucun", 0], "ti-rookie": ["title", "Recrue", 30], "ti-curious": ["title", "Curieux", 60], "ti-fast": ["title", "Éclair", 90],
  "ti-brain": ["title", "Cerveau", 120], "ti-pro": ["title", "Pro du quiz", 200], "ti-genius": ["title", "Génie", 320], "ti-legend": ["title", "Légende vivante", 500],
  "ti-million": ["title", "Millionnaire", 0, "million"], "ti-flame": ["title", "Inarrêtable", 0, "streak7"],
  // couleur du pseudo
  "nc-plain": ["name", "Blanc", 0], "nc-sun": ["name", "Citron", 50], "nc-mint": ["name", "Menthe", 50], "nc-coral": ["name", "Pamplemousse", 50],
  "nc-sky": ["name", "Ciel", 50], "nc-gold": ["name", "Or", 220], "nc-neon": ["name", "Néon", 260], "nc-fire": ["name", "Feu", 300],
  // thème de l'appli (visible seulement par vous)
  "th-berry": ["theme", "Myrtille", 0], "th-night": ["theme", "Minuit", 120], "th-ocean": ["theme", "Océan", 150], "th-forest": ["theme", "Forêt", 150],
  "th-sunset": ["theme", "Crépuscule", 200], "th-cherry": ["theme", "Cerise", 200], "th-cosmos": ["theme", "Cosmos", 350]
};
// rareté, selon le prix
export function rarity(id) {
  const [, , p, need] = ITEMS[id];
  return need ? ["Exclusif", "x"] : p === 0 ? ["De base", "b"] : p <= 50 ? ["Commun", "c"] : p <= 150 ? ["Rare", "r"] : p <= 260 ? ["Épique", "e"] : ["Légendaire", "l"];
}
// articles retirés de la Boutique : remboursés à ceux qui les avaient achetés
const REMOVED = { "fr-rainbow": 400, "sk-rainbow": 380, "bn-rainbow": 420, "nc-rainbow": 450 };
const DEFAULT = { frame: "fr-ink", bubble: "sk-classic", banner: "bn-plain", title: "ti-none", name: "nc-plain", theme: "th-berry" };
const CATS = [["frame", "Cadres"], ["bubble", "Bulles"], ["banner", "Bannières"], ["title", "Titres"], ["name", "Pseudo"], ["theme", "Thèmes"]];
const HOW = { title: "Affiché sous votre pseudo, pour tout le monde.", name: "La couleur de votre pseudo, pour tout le monde.", theme: "Le fond de toute l'appli, visible seulement par vous." };
// le pseudo d'un joueur, à sa couleur, et son titre : utilisés partout où un nom s'affiche (salon, amis, profil)
export const titleOf = (cos) => { const t = cos && cos.title; return t && ITEMS[t] && ITEMS[t][0] === "title" && t !== "ti-none" ? ITEMS[t][1] : ""; };
export function styleName(el, cos) {
  [...el.classList].filter((c) => c.startsWith("nc-")).forEach((c) => el.classList.remove(c));
  const n = cos && cos.name; if (n && ITEMS[n] && ITEMS[n][0] === "name" && n !== "nc-plain") el.classList.add("ncol", n); else el.classList.remove("ncol");
  return el;
}
export function titleEl(cos) {
  const t = titleOf(cos); if (!t) return null;
  const s = document.createElement("small"); s.className = "ptitle"; s.textContent = t; return s;
}

export function initCosmetics({ $, ask, uid, name, photo, achs, avatarEl, onChange, dev = () => false }) {
  const k = (n) => `quizly:${uid()}:${n}`;
  const read = (n, d) => { try { return JSON.parse(localStorage.getItem(k(n)) || "null") ?? d; } catch { return d; } };
  const write = (n, v) => { try { localStorage.setItem(k(n), JSON.stringify(v)); } catch {} };
  const coins = () => +read("coins", 0) || 0;
  const owned = () => new Set(dev() ? Object.keys(ITEMS) : [...read("owned", []), ...Object.values(DEFAULT)]);
  const equipped = () => { const e = { ...DEFAULT, ...read("cos", {}) }; for (const c in e) if (!ITEMS[e[c]] || ITEMS[e[c]][0] !== c) e[c] = DEFAULT[c]; return e; }; // un article retiré revient à celui de base
  function refund() { // une seule fois : les Q-Bucks des articles retirés reviennent
    if (!uid()) return;
    const own = read("owned", []), gone = own.filter((id) => REMOVED[id]);
    if (!gone.length) return;
    write("owned", own.filter((id) => !REMOVED[id]));
    write("coins", coins() + gone.reduce((a, id) => a + REMOVED[id], 0));
    write("cos", equipped());
  }
  let tab = "frame";

  // Q-Bucks gagnés en jouant (avec un petit « +5 » qui s'envole)
  function earn(n, why) {
    if (!uid() || !n) return;
    write("coins", coins() + n);
    $("coinCount").textContent = coins(); // le compteur du haut
    const t = $("coinPop");
    t.textContent = `+${n} Q-Buck${n > 1 ? "s" : ""}${why ? ` · ${why}` : ""}`;
    t.hidden = false; t.classList.remove("go"); void t.offsetWidth; t.classList.add("go");
    clearTimeout(t._t); t._t = setTimeout(() => (t.hidden = true), 1600);
  }
  // rattrapage : les Q-Bucks qu'on aurait gagnés avant la Boutique (calcul sans doublon : on compare au total déjà gagné)
  function backpay(owed) {
    if (!uid()) return 0;
    const spent = read("owned", []).reduce((a, id) => a + (ITEMS[id] ? ITEMS[id][2] : 0), 0);
    const gift = Math.floor(owed - coins() - spent);
    if (gift > 0) earn(gift, "cadeau");
    return Math.max(0, gift);
  }
  const unlocked = (id) => { const need = ITEMS[id][3]; return !need || dev() || achs().includes(need); };

  function apply() { // ce qui est équipé s'affiche partout
    refund();
    $("coinCount").textContent = coins();
    const e = equipped();
    if (name()) setFrame(name(), e.frame);
    document.body.dataset.banner = e.banner;
    document.documentElement.dataset.theme = e.theme; // le thème change le fond de toute l'appli
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
    else if (cat === "title") { const t = document.createElement("small"); t.className = "ptitle"; t.textContent = id === "ti-none" ? "—" : ITEMS[id][1]; p.append(t); }
    else if (cat === "name") { const t = document.createElement("b"); t.className = "nm-pv"; t.textContent = name() || "Pseudo"; styleName(t, { name: id }); p.append(t); }
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
    const look = { title: cat === "title" ? s : e.title, name: cat === "name" ? s : e.name };
    styleName($("tryName"), look); $("tryTitle").textContent = titleOf(look); $("tryTitle").hidden = !titleOf(look);
    $("tryBub").className = `trybub ${bu}`;
    const btn = $("tryBtn");
    if (!s) { $("tryItem").textContent = "Touchez un article pour l'essayer"; $("tryHow").textContent = "Vous voyez ici ce que vous portez."; $("tryRar").hidden = true; btn.hidden = true; return; }
    const [, nm, , need] = ITEMS[s], [rl, rk] = rarity(s), own = owned().has(s), price = priceOf(s);
    $("tryItem").textContent = nm + (cat === "theme" ? " (thème)" : "");
    $("tryRar").hidden = false; $("tryRar").textContent = rl; $("tryRar").className = `rar r-${rk}`;
    btn.hidden = false; btn.disabled = false; btn.className = "btn sm";
    if (e[cat] === s) { btn.textContent = "Équipé"; btn.disabled = true; btn.classList.add("white"); $("tryHow").textContent = HOW[cat] || "Vous le portez déjà."; }
    else if (own) { btn.textContent = "Équiper"; btn.classList.add("mint"); btn.onclick = () => equip(s); $("tryHow").textContent = HOW[cat] || "Il est à vous."; }
    else if (need && !unlocked(s)) { btn.textContent = "Verrouillé"; btn.disabled = true; btn.classList.add("white"); $("tryHow").textContent = need === "million" ? "Débloquez le succès Millionnaire." : "Débloquez le succès Régulier (7 défis d'affilée)."; }
    else if (need) { btn.textContent = "Obtenir"; btn.classList.add("sun"); btn.onclick = () => { write("owned", [...owned(), s]); equip(s); }; $("tryHow").textContent = "Offert grâce à votre succès."; }
    else { btn.textContent = `${price} Q-Bucks`; btn.classList.add(coins() >= price ? "sun" : "white"); btn.onclick = () => buy(s); $("tryHow").textContent = coins() >= price ? (HOW[cat] || "Touchez pour l'acheter.") : `Il vous manque ${price - coins()} Q-Bucks.`; }
  }
  function render() {
    $("coinCount").textContent = coins();
    $("shopCoins").textContent = coins();
    const e = equipped(), own = owned(), d = deal();
    document.querySelectorAll("#shopTabs button").forEach((b) => { // chaque onglet montre combien d'articles sont à vous
      b.setAttribute("aria-pressed", String(b.dataset.c === tab));
      const all = Object.keys(ITEMS).filter((id) => ITEMS[id][0] === b.dataset.c);
      b.querySelector("small").textContent = `${all.filter((id) => own.has(id)).length}/${all.length}`;
    });
    // offre du jour
    const [, dn, dp] = ITEMS[d.id];
    $("dealPv").replaceChildren(preview(d.id)); $("dealName").textContent = dn; $("dealOld").textContent = dp; $("dealNew").textContent = d.price;
    const now = new Date(), mid = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" })); const left = 24 - mid.getHours();
    $("dealLeft").textContent = own.has(d.id) ? "déjà à vous" : `encore ${left} h`;
    $("dealCard").classList.toggle("got", own.has(d.id));
    $("dealCard").onclick = () => { tab = ITEMS[d.id][0]; sel = d.id; render(); };
    // la grille, rangée en trois parties : à vous (l'équipé d'abord), à acheter (du moins cher au plus cher), exclusifs
    const ids = Object.keys(ITEMS).filter((id) => ITEMS[id][0] === tab);
    const mine = ids.filter((id) => own.has(id)).sort((a, b) => (e[tab] === b) - (e[tab] === a));
    const shop = ids.filter((id) => !own.has(id) && !ITEMS[id][3]).sort((a, b) => priceOf(a) - priceOf(b));
    const excl = ids.filter((id) => !own.has(id) && ITEMS[id][3]);
    const part = (title, note, list) => {
      if (!list.length) return [];
      const h = document.createElement("h3"); h.className = "shoph"; h.textContent = title;
      if (note) { const n = document.createElement("small"); n.textContent = note; h.append(n); }
      const g = document.createElement("div"); g.className = "shopgrid"; g.append(...list.map(card));
      return [h, g];
    };
    $("shopGrid").replaceChildren(...part("À vous", `${mine.length}/${ids.length}`, mine), ...part("À acheter", "", shop), ...part("Exclusifs", "grâce aux succès", excl));
    tryOn();
  }
  function card(id) { // une carte de la grille
    const e = equipped(), own = owned(), d = deal();
    const [cat, nm, , need] = ITEMS[id], [rl, rk] = rarity(id);
    const card = document.createElement("button"); card.className = `item r-${rk}` + (e[cat] === id ? " on" : "") + (sel === id ? " sel" : "");
    const t = document.createElement("b"); t.textContent = nm;
    const st = document.createElement("small"); st.className = "st";
    st.textContent = e[cat] === id ? "Équipé" : own.has(id) ? "Possédé" : need ? (unlocked(id) ? "Offert" : "Verrouillé") : `${priceOf(id)} Q-Bucks${d.id === id ? " · −40 %" : ""}`;
    if (!own.has(id) && !need) st.classList.add("price");
    card.append(preview(id), t, st);
    card.title = rl; // la rareté se voit à la couleur du haut de la carte
    card.onclick = () => { sel = id; $("shopMsg").textContent = ""; render(); $("tryOn").scrollIntoView({ behavior: "smooth", block: "nearest" }); };
    return card;
  }
  function buy(id) {
    const nm = ITEMS[id][1], price = priceOf(id);
    if (coins() < price) { $("shopMsg").textContent = `Il vous manque ${price - coins()} Q-Bucks pour « ${nm} ».`; return; }
    ask(`Acheter « ${nm} » ?`, `${price} Q-Bucks. Vous en avez ${coins()}.`, "Acheter", () => {
      write("coins", coins() - price);
      write("owned", [...owned(), id]);
      equip(id);
    });
  }
  // les onglets Cadres · Bulles · Bannières · Titres · Pseudo · Thèmes
  $("shopTabs").replaceChildren(...CATS.map(([c, label]) => {
    const b = document.createElement("button"); b.dataset.c = c; b.append(label, document.createElement("small"));
    b.onclick = () => { tab = c; sel = null; $("shopMsg").textContent = ""; render(); };
    return b;
  }));
  return { earn, backpay, apply, render, coins, get: () => equipped(), owned: () => (dev() ? 0 : read("owned", []).length) }; // owned : articles achetés (succès Collectionneur)
}
