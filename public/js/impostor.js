// L'Imposteur : tout le monde voit la bonne réponse sauf un joueur, l'imposteur, qui doit faire semblant
// de la connaître en discutant. Ensuite, on vote pour le démasquer. S'il est démasqué, il a une dernière chance :
// trouver la réponse parmi 4 choix.
// Ce fichier n'affiche que l'écran (#s-imp) : la partie est menée par game.js (un téléphone) ou par le serveur (en ligne).
export const IMP_PTS = { hidden: 3, guessed: 2, crew: 1, voter: 1 }; // les points d'une manche (voir rules())

// la réponse écrite par l'imposteur démasqué : les fautes d'orthographe sont permises
// (accents, majuscules, tirets, articles ignorés ; quelques lettres de travers acceptées selon la longueur)
const plain = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/^(le|la|les|l|un|une|des|du|de|the)\s+|^l'/, "").replace(/[^a-z0-9]/g, "");
function distance(a, b) { // nombre de lettres à changer, ajouter ou enlever
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length];
}
export function answerMatches(guess, answer) {
  const g = plain(guess), a = plain(answer);
  if (!g || !a) return false;
  if (/^\d+$/.test(a)) return g === a; // un nombre : exact
  if (g === a) return true;
  const allowed = a.length <= 3 ? 0 : a.length <= 5 ? 1 : a.length <= 9 ? 2 : 3;
  return distance(g, a) <= allowed;
}

export function impUI($, avatarEl) {
  let tid = null;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (text, look, fn) => { const b = el("button", `btn ${look}`, text); b.onclick = fn; return b; };
  const stop = () => { clearInterval(tid); clearTimeout(tid); tid = null; };
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
  // les indices de chacun, dévoilés tous en même temps
  function cluesEl(clues) {
    if (!clues || !clues.length) return null;
    const ul = el("ul", "impclues");
    clues.forEach((c, i) => { const li = el("li"); li.style.animationDelay = `${i * 120}ms`; li.append(el("b", null, c.name), el("span", null, c.clue || "…")); ul.append(li); });
    return ul;
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
      t.append(el("h2", null, "Discutez !"), el("p", "lead small", m.clues ? "Voici les indices de chacun. Lequel sonne faux ? Défendez-vous, accusez, bluffez !" : `À tour de rôle, chacun donne un indice sur la réponse… sans la dire.${m.starter ? ` ${m.starter} commence.` : ""}`));
      const c = clock(m.ms, onEnd); if (c) t.append(c);
      put(t, cluesEl(m.clues), cardEl(m, true), onVote ? btn("Passer au vote", "sun", onVote) : el("p", "lead small", "L'hôte lance le vote quand vous êtes prêts."));
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
      put(v, g, m.wait ? el("p", "lead small", m.wait) : null, cluesEl(m.clues));
    },
    wait(m, text) { head(m); put(el("div", "imptalk", null), el("p", "lead", text)); },
    // démasqué : l'imposteur a une dernière chance de trouver la réponse
    // démasqué : l'imposteur doit ÉCRIRE la bonne réponse (aucun choix proposé, fautes d'orthographe permises)
    guess(m, onSend) {
      head(m);
      const g = el("div", "imptalk");
      g.append(el("h2", null, onSend ? "Démasqué !" : `${m.name} est démasqué !`),
        el("p", "lead small", onSend ? "Dernière chance : écris la bonne réponse pour gagner quand même. Les fautes d'orthographe sont permises." : `Dernière chance pour ${m.name} : écrire la bonne réponse…`));
      const c = clock(m.ms); if (c) g.append(c);
      const q = el("p", "impq", m.q);
      if (!onSend) return put(g, q);
      const row = el("div", "chatrow impcluerow");
      const inp = el("input"); inp.type = "text"; inp.maxLength = 60; inp.placeholder = "La réponse…"; inp.setAttribute("enterkeyhint", "send"); inp.autocomplete = "off";
      const go = el("button", "btn sun sm", "Valider");
      const sendIt = () => { const v = inp.value.trim(); if (!v) return; inp.disabled = go.disabled = true; onSend(v); };
      go.onclick = sendIt; inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sendIt(); } });
      row.append(inp, go);
      put(g, q, row);
    },
    // la fin de la manche : qui était l'imposteur, la réponse, les points
    // en ligne : chacun écrit un indice (un mot ou une courte phrase), sans donner la réponse
    clue(m, onSend) {
      head(m);
      const t = el("div", "imptalk");
      t.append(el("h2", null, "Ton indice"), el("p", "lead small", m.imposter ? "Écris un indice crédible pour ne pas te faire repérer…" : "Un mot ou deux qui prouvent que tu connais la réponse, sans la donner à l'imposteur."));
      const c = clock(m.ms); if (c) t.append(c);
      const row = el("div", "chatrow impcluerow");
      const inp = el("input"); inp.type = "text"; inp.maxLength = 30; inp.placeholder = "Ton indice…"; inp.setAttribute("enterkeyhint", "send"); inp.autocomplete = "off";
      const go = el("button", "btn sun sm", "Envoyer");
      const msg = el("p", "msg impcluemsg"); msg.id = "impClueMsg";
      const sendIt = () => { const v = inp.value.trim(); if (!v) return; onSend(v); };
      go.onclick = sendIt; inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sendIt(); } });
      row.append(inp, go);
      const done = m.mine != null;
      put(t, cardEl(m, true), done ? el("p", "lead impsent", `Indice envoyé : « ${m.mine} »`) : row, msg, el("p", "lead small", `${m.count || 0} / ${m.total || "?"} indices`));
    },
    clueError(text) { const e = document.getElementById("impClueMsg"); if (e) e.textContent = text; },
    result(m, onNext, nextLabel) {
      head(m);
      if (!m.shown) { // le suspense : un roulement de tambour avant de dévoiler l'imposteur
        m.shown = true;
        const s = el("div", "impdrum"); s.append(el("p", "lead", "L'imposteur était…"), el("span", "impdrumdots", "?"));
        put(s);
        tid = setTimeout(() => this.result(m, onNext, nextLabel), 1700);
        return;
      }
      const win = m.caught && !m.guessed;
      const r = el("div", `impres ${win ? "good" : "bad"}`);
      r.append(avatarEl(m.impName, m.impPhoto, true),
        el("h2", null, win ? "Imposteur démasqué !" : m.caught ? "Démasqué… mais il a trouvé !" : "L'imposteur s'en sort !"),
        el("p", "lead small", m.caught ? `${m.impName} était bien l'imposteur.` : `${m.accusedName ? `${m.accusedName} n'était pas l'imposteur. ` : "Pas de majorité. "}L'imposteur était ${m.impName}.`));
      const a = el("p", "impa"); a.append(el("small", null, "La réponse"), el("b", null, m.answer));
      const parts = [r, a];
      if (m.guessText != null) parts.push(el("p", "lead small impwrote", `${m.impName} a écrit : « ${m.guessText || "rien"} »`));
      if (m.tally && m.tally.length) { // les votes contre chacun, en barres
        const max = Math.max(1, ...m.tally.map((x) => x.n));
        const tb = el("div", "imptally");
        m.tally.forEach((x) => {
          const row = el("div", "trow" + (x.imp ? " imp" : ""));
          const bar = el("span", "tbar"); const fill = el("i"); fill.style.width = `${(100 * x.n) / max}%`; bar.append(fill);
          row.append(el("b", null, x.name), bar, el("span", null, `${x.n} vote${x.n > 1 ? "s" : ""}`)); tb.append(row);
        });
        parts.push(tb);
      }
      if (m.clues) parts.push(cluesEl(m.clues));
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
