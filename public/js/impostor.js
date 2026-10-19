// L'Imposteur : tout le monde voit la bonne réponse sauf un joueur, l'imposteur, qui doit faire semblant
// de la connaître en discutant. Ensuite, on vote pour le démasquer. S'il est démasqué, il a une dernière chance :
// trouver la réponse parmi 4 choix.
// Ce fichier n'affiche que l'écran (#s-imp) : la partie est menée par game.js (un téléphone) ou par le serveur (en ligne).
export const IMP_PTS = { hidden: 3, guessed: 2, crew: 1, voter: 1 }; // les points d'une manche (voir rules())

export function impUI($, avatarEl) {
  let tid = null;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (text, look, fn) => { const b = el("button", `btn ${look}`, text); b.onclick = fn; return b; };
  const stop = () => { clearInterval(tid); tid = null; };
  function head(m) { // « Manche 2 / 4 »
    $("impRound").textContent = m.round ? `Manche ${m.round} / ${m.rounds}` : "L'Imposteur";
  }
  function put(...nodes) { stop(); $("impBody").replaceChildren(...nodes.filter(Boolean)); }
  function clock(ms, onEnd) { // compte à rebours en secondes
    const c = el("span", "impclock");
    if (!ms) return null;
    const end = Date.now() + ms;
    const tick = () => {
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      c.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      c.classList.toggle("urgent", s <= 10);
      if (s <= 0) { stop(); onEnd && onEnd(); }
    };
    setTimeout(() => { tick(); tid = setInterval(tick, 250); }, 0);
    return c;
  }
  // la carte : la question et, pour l'équipe, la réponse ; pour l'imposteur, rien
  function cardEl(m, small) {
    const c = el("div", `impcard ${m.imposter ? "bad" : "good"}${small ? " small" : ""}`);
    c.append(el("span", "chip small", m.tag || "Question"));
    if (m.img) { const i = el("img", "qimg"); i.alt = ""; i.src = m.img; i.onerror = () => i.remove(); c.append(i); }
    c.append(el("p", "impq", m.q));
    if (m.imposter) {
      c.append(el("b", "improle", "Tu es l'imposteur !"), el("small", null, "Tu ne connais pas la réponse : écoute les autres et fais semblant de la connaître."));
    } else if (m.answer != null) {
      const a = el("p", "impa"); a.append(el("small", null, "La réponse"), el("b", null, m.answer));
      c.append(a, el("small", null, "Donne des indices sans jamais la dire, et trouve l'imposteur."));
    }
    return c;
  }
  const rules = () => el("p", "lead small imprules", `Imposteur pas démasqué : +${IMP_PTS.hidden} pts. Démasqué mais il trouve la réponse : +${IMP_PTS.guessed} pts. Sinon, toute l'équipe gagne +${IMP_PTS.crew} pt, et +${IMP_PTS.voter} de plus pour ceux qui l'ont désigné.`);

  return {
    stop,
    // un téléphone : on se passe le téléphone pour découvrir sa carte en secret
    pass(m, onReveal) {
      head(m);
      const who = el("div", "imppass");
      who.append(avatarEl(m.name, m.photo, true), el("p", "lead", "Passe le téléphone à"), el("h2", "hero", m.name), el("small", null, "Les autres ne regardent pas !"));
      put(who, btn(`Je suis ${m.name} : voir ma carte`, "sun", onReveal));
    },
    card(m, onHide) {
      head(m);
      put(cardEl(m), onHide ? btn("J'ai vu, cacher ma carte", "white", onHide) : null);
    },
    // la discussion : chacun donne un indice sur la réponse, sans la dire
    talk(m, onVote, onEnd) {
      head(m);
      const t = el("div", "imptalk");
      t.append(el("h2", null, "Discutez !"), el("p", "lead small", `À tour de rôle, chacun donne un indice sur la réponse… sans la dire.${m.starter ? ` ${m.starter} commence.` : ""}`));
      const c = clock(m.ms, onEnd); if (c) t.append(c);
      put(t, cardEl(m, true), onVote ? btn("Passer au vote", "sun", onVote) : el("p", "lead small", "L'hôte lance le vote quand vous êtes prêts."));
    },
    // le vote : on touche celui qu'on soupçonne
    vote(m, onPick) {
      head(m);
      const v = el("div", "imptalk");
      v.append(el("h2", null, "Qui est l'imposteur ?"), el("p", "lead small", m.info || "Touchez celui que vous soupçonnez."));
      const c = clock(m.ms); if (c) v.append(c);
      const g = el("div", "impvote");
      m.players.forEach((p) => {
        const b = el("button", "impwho" + (p.id === m.picked ? " on" : ""));
        b.append(avatarEl(p.name, p.photo, true), el("span", null, p.name));
        b.disabled = !onPick || p.self || m.picked != null;
        if (onPick && !p.self) b.onclick = () => onPick(p);
        g.append(b);
      });
      put(v, g, m.wait ? el("p", "lead small", m.wait) : null);
    },
    wait(m, text) { head(m); put(el("div", "imptalk", null), el("p", "lead", text)); },
    // démasqué : l'imposteur a une dernière chance de trouver la réponse
    guess(m, onPick) {
      head(m);
      const g = el("div", "imptalk");
      g.append(el("h2", null, onPick ? "Démasqué !" : `${m.name} est démasqué !`),
        el("p", "lead small", onPick ? "Dernière chance : trouve la bonne réponse pour gagner quand même." : `Dernière chance pour ${m.name} : trouver la bonne réponse.`));
      const c = clock(m.ms); if (c) g.append(c);
      const q = el("p", "impq", m.q);
      const box = el("div", "grid impopts");
      m.options.forEach((o, i) => {
        const b = el("button", "btn white", o);
        b.disabled = !onPick;
        if (onPick) b.onclick = () => { box.querySelectorAll(".btn").forEach((x) => (x.disabled = true)); b.classList.add("picked"); onPick(i, o); };
        box.append(b);
      });
      put(g, q, box);
    },
    // la fin de la manche : qui était l'imposteur, la réponse, les points
    result(m, onNext, nextLabel) {
      head(m);
      const win = m.caught && !m.guessed;
      const r = el("div", `impres ${win ? "good" : "bad"}`);
      r.append(avatarEl(m.impName, m.impPhoto, true),
        el("h2", null, win ? "Imposteur démasqué !" : m.caught ? "Démasqué… mais il a trouvé !" : "L'imposteur s'en sort !"),
        el("p", "lead small", m.caught ? `${m.impName} était bien l'imposteur.` : `${m.accusedName ? `${m.accusedName} était innocent. ` : "Pas de majorité. "}L'imposteur était ${m.impName}.`));
      const a = el("p", "impa"); a.append(el("small", null, "La réponse"), el("b", null, m.answer));
      const parts = [r, a];
      if (m.votes && m.votes.length) {
        const ul = el("ul", "impvotes");
        m.votes.forEach((v) => ul.append(el("li", v.right ? "right" : "", `${v.name} → ${v.target}`)));
        parts.push(ul);
      }
      if (m.board) {
        const ol = el("ol", "rank impboard");
        [...m.board].sort((x, y) => y.points - x.points).forEach((p, i) => {
          const li = el("li", "rk" + (i === 0 ? " first" : ""));
          li.append(el("span", "pos", i + 1), avatarEl(p.name, p.photo), el("span", "nm", p.name), el("span", "st", `${p.points} pts${p.gain ? ` · +${p.gain}` : ""}`));
          ol.append(li);
        });
        parts.push(ol);
      }
      parts.push(onNext ? btn(nextLabel || "Manche suivante", "sun", onNext) : el("p", "lead small", "L'hôte lance la manche suivante."));
      put(...parts);
    },
    rules
  };
}
