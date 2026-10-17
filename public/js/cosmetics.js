// Cosmétiques : on gagne des jetons en jouant, on les dépense dans la Boutique.
// Cadre de photo, bulle de chat et bannière de profil sont visibles par les autres joueurs.
import { setFrame } from "./million.js";

// id : [catégorie, nom, prix, condition spéciale (succès requis) ]
export const ITEMS = {
  // cadres de photo
  "fr-ink": ["frame", "Encre", 0], "fr-sun": ["frame", "Citron", 40], "fr-mint": ["frame", "Menthe", 40], "fr-coral": ["frame", "Pamplemousse", 40],
  "fr-sky": ["frame", "Ciel", 40], "fr-peach": ["frame", "Abricot", 40], "fr-neon": ["frame", "Néon", 180], "fr-gold": ["frame", "Or", 260],
  "fr-rainbow": ["frame", "Arc-en-ciel", 400], "fr-crown": ["frame", "Millionnaire", 0, "million"],
  // bulles du chat
  "sk-classic": ["bubble", "Classique", 0], "sk-ink": ["bubble", "Nuit", 80], "sk-pastel": ["bubble", "Pastel", 80],
  "sk-neon": ["bubble", "Néon", 160], "sk-gold": ["bubble", "Or", 240],
  // bannières du profil
  "bn-plain": ["banner", "Myrtille", 0], "bn-sunset": ["banner", "Coucher de soleil", 120], "bn-lagoon": ["banner", "Lagon", 120],
  "bn-check": ["banner", "Damier", 100], "bn-galaxy": ["banner", "Galaxie", 220], "bn-streak": ["banner", "Série de feu", 0, "streak7"]
};
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
  function buy(id) {
    const [, nm, price] = ITEMS[id];
    if (!unlocked(id)) return;
    if (coins() < price) { $("shopMsg").textContent = `Il vous manque ${price - coins()} jetons pour « ${nm} ».`; return; }
    ask(`Acheter « ${nm} » ?`, `${price} jetons. Vous en avez ${coins()}.`, "Acheter", () => {
      write("coins", coins() - price);
      write("owned", [...owned(), id]);
      equip(id);
    });
  }
  function equip(id) {
    const cat = ITEMS[id][0], e = equipped();
    e[cat] = id; write("cos", e);
    apply(); render();
  }
  // aperçu d'un article
  function preview(id) {
    const [cat] = ITEMS[id];
    const p = document.createElement("div"); p.className = `pv pv-${cat}`;
    if (cat === "frame") { // aperçu : seulement ce cadre-là (pas celui déjà équipé)
      const a = avatarEl(name() || "?", photo(), true);
      [...a.classList].filter((x) => x.startsWith("fr-")).forEach((x) => a.classList.remove(x));
      a.classList.add(id); p.append(a);
    }
    else if (cat === "bubble") { const b = document.createElement("span"); b.className = `bubble-pv r0 ${id}`; b.textContent = "Trop facile"; p.append(b); }
    else { p.classList.add(id); }
    return p;
  }
  function render() {
    $("coinCount").textContent = coins();
    $("shopCoins").textContent = coins();
    document.querySelectorAll("#shopTabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.c === tab)));
    const e = equipped(), own = owned();
    $("shopGrid").replaceChildren(...Object.entries(ITEMS).filter(([, v]) => v[0] === tab).map(([id, [cat, nm, price, need]]) => {
      const card = document.createElement("div"); card.className = "item" + (e[cat] === id ? " on" : "");
      const t = document.createElement("b"); t.textContent = nm;
      const btn = document.createElement("button"); btn.className = "btn sm";
      if (e[cat] === id) { btn.textContent = "Équipé"; btn.disabled = true; btn.classList.add("white"); }
      else if (own.has(id)) { btn.textContent = "Équiper"; btn.classList.add("mint"); btn.onclick = () => equip(id); }
      else if (!unlocked(id)) { btn.textContent = need === "million" ? "Succès Millionnaire" : "Succès Régulier"; btn.disabled = true; btn.classList.add("white"); }
      else { btn.textContent = `${price} jetons`; btn.classList.add(coins() >= price ? "sun" : "white"); btn.onclick = () => buy(id); }
      card.append(preview(id), t, btn);
      return card;
    }));
  }
  $("shopTabs").replaceChildren(...CATS.map(([c, label]) => { const b = document.createElement("button"); b.dataset.c = c; b.textContent = label; b.onclick = () => { tab = c; $("shopMsg").textContent = ""; render(); }; return b; }));

  return { earn, apply, render, coins, equipped, get: () => equipped() };
}
