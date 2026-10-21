// Amis : code ami, demandes, liste avec records, classement entre amis, invitations à un salon.
// Tout passe par Firestore (voir les règles dans le message de la 2.10). Il faut être connecté au cloud.
import { cloudFs } from "./cloud.js";
import { sendPush } from "./push.js";
import { setFrame } from "./million.js";
import { styleName, titleEl, titleOf } from "./cosmetics.js";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans I, O, 0, 1 : pas de confusion à la lecture
const INVITE_TTL = 10 * 60 * 1000; // une invitation de plus de 10 minutes est ignorée

export function initFriends({ $, ask, avatarEl, euros, me, records, summary, daily, achs, cos, joinRoom, roomInfo, openFriends, openNotifs, showScreen, week = () => null, earn = () => {}, dev = () => false }) {
  const F = { uid: null, fs: null, code: "", friends: [], unsub: [], tab: "best2", inv: null, panel: null };
  // onglets de l'écran Amis
  function setPanel(p) {
    F.panel = p;
    [["mine", "fpMine"], ["add", "fpAdd"], ["rank", "fpRank"], ["club", "fpClub"]].forEach(([k, id]) => ($(id).hidden = k !== p));
    if (p === "club") loadClub();
    document.querySelectorAll("#fTabs .ftab").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === p));
  }
  document.querySelectorAll("#fTabs .ftab").forEach((b) => (b.onclick = () => setPanel(b.dataset.tab)));
  const say = (t) => ($("friendMsg").textContent = t);
  const ref = (...p) => F.fs.doc(F.fs.db, ...p);

  /* ---------- démarrage (après la connexion au cloud) ---------- */
  async function start() {
    const c = cloudFs();
    if (!c) { stop(); return false; }
    if (F.uid === c.uid) return true;
    stop();
    F.fs = c.fs; F.uid = c.uid;
    try {
      await publish(); // profil public + code ami
      listen();
      listenNotifs();
      await loadFriends();
      loadClub().catch(() => {}); // le club est prêt avant même d'ouvrir l'onglet
      loadChampion().catch(() => {}); // qui est le champion du Défi du jour ?
      return true;
    } catch (e) { console.warn("Amis indisponibles :", e.message); stop(); return false; }
  }
  function stop() {
    F.unsub.forEach((u) => { try { u(); } catch {} }); F.unsub = []; F.uid = null; F.fs = null; F.friends = []; F.first = false;
    $("tabFriendsBadge").hidden = true; $("notifBadge").hidden = true; $("reqToast").hidden = true; $("inviteToast").hidden = true;
  }
  const ready = () => !!F.uid;
  const subId = async (endpoint) => { const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40); };

  // profil public : nom, photo, code ami, records (rien d'autre n'est visible par les amis)
  async function publish() {
    const pref = ref("profiles", F.uid);
    const snap = await F.fs.getDoc(pref);
    let code = snap.exists() ? snap.data().code : "";
    if (!code) code = await newCode();
    F.code = code;
    const m = me();
    await F.fs.setDoc(pref, { name: m.name, photo: m.photo || "", code, records: records(), summary: summary(), daily: daily() || null, achs: achs(), cos: cos(), at: Date.now() }, { merge: true });
  }
  async function newCode() {
    for (let t = 0; t < 8; t++) {
      const c = Array.from({ length: 6 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");
      const r = ref("codes", c);
      if ((await F.fs.getDoc(r)).exists()) continue;
      await F.fs.setDoc(r, { uid: F.uid });
      return c;
    }
    throw new Error("Impossible de créer un code ami.");
  }
  // les records changent : on met à jour le profil public (appelé à l'ouverture du profil et en fin de partie)
  async function syncRecords() {
    if (!ready()) return;
    try { await F.fs.setDoc(ref("profiles", F.uid), { records: records(), summary: summary(), daily: daily() || null, achs: achs(), cos: cos(), name: me().name, photo: me().photo || "", at: Date.now() }, { merge: true }); } catch {}
  }

  /* ---------- en direct : demandes reçues et invitations ---------- */
  function listen() {
    const { onSnapshot, collection } = F.fs;
    F.unsub.push(onSnapshot(collection(F.fs.db, "requests", F.uid, "from"), (snap) => {
      F.requests = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      // pastille sur le bouton Amis : le nombre de demandes en attente
      $("tabFriendsBadge").hidden = $("fTabBadge").hidden = !F.requests.length;
      $("tabFriendsBadge").textContent = $("fTabBadge").textContent = F.requests.length > 9 ? "9+" : F.requests.length;
      // notification pour une nouvelle demande (une seule fois par personne)
      F.notified ||= new Set();
      const fresh = F.requests.find((r) => !F.notified.has(r.uid));
      F.requests.forEach((r) => F.notified.add(r.uid));
      if (fresh && F.first) showRequest(fresh);
      F.first = true; // au démarrage, les demandes déjà là ne déclenchent pas de notification (la pastille suffit)
      if (F.shownReq && !F.requests.some((r) => r.uid === F.shownReq.uid)) $("reqToast").hidden = true;
      renderRequests();
    }, () => {}));
    F.unsub.push(onSnapshot(collection(F.fs.db, "invites", F.uid, "list"), (snap) => {
      const fresh = snap.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((x) => Date.now() - (x.at || 0) < INVITE_TTL)
        .sort((a, b) => b.at - a.at);
      showInvite(fresh[0] || null);
    }, () => {}));
  }

  /* ---------- ajouter un ami ---------- */
  async function addByCode(raw) {
    setPanel("add"); // le résultat (ami ajouté ou erreur) s'affiche dans l'onglet Ajouter
    const code = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!ready()) return say("Connectez-vous au cloud pour ajouter des amis.");
    if (code.length !== 6) return say("Un code ami fait 6 caractères.");
    if (code === F.code) return say("C'est votre propre code.");
    try {
      const c = await F.fs.getDoc(ref("codes", code));
      if (!c.exists()) return say("Aucun joueur avec ce code.");
      const to = c.data().uid;
      if (F.friends.some((f) => f.uid === to)) return say("Vous êtes déjà amis.");
      const m = me();
      await F.fs.setDoc(ref("requests", to, "from", F.uid), { name: m.name, photo: m.photo || "", at: Date.now() });
      notify(to, "demande", `${m.name} veut devenir votre ami.`, "/?amis=1"); // sur tous ses appareils et dans sa cloche
      say("Demande envoyée.");
      $("friendCode").value = "";
    } catch (e) { say("Impossible d'envoyer la demande pour le moment."); }
  }
  async function accept(r) {
    try {
      await F.fs.setDoc(ref("friends", F.uid, "list", r.uid), { since: Date.now() });
      await F.fs.setDoc(ref("friends", r.uid, "list", F.uid), { since: Date.now() });
      await F.fs.deleteDoc(ref("requests", F.uid, "from", r.uid));
      await loadFriends();
    } catch { say("Impossible d'accepter pour le moment."); }
  }
  async function refuse(r) { try { await F.fs.deleteDoc(ref("requests", F.uid, "from", r.uid)); } catch {} }
  function remove(f, then) {
    ask(`Retirer ${f.name} de vos amis ?`, "Vous ne verrez plus ses records et ne pourrez plus l'inviter.", "Retirer", async () => {
      try {
        await F.fs.deleteDoc(ref("friends", F.uid, "list", f.uid));
        await F.fs.deleteDoc(ref("friends", f.uid, "list", F.uid));
      } catch {}
      await loadFriends();
      if (then) then();
    });
  }

  /* ---------- profil d'un ami ---------- */
  function openFriend(f) {
    F.cur = f;
    $("frName").textContent = f.name;
    styleName($("frName"), f.cos); champName($("frName"), f.uid); $("frTitle").textContent = titleOf(f.cos); $("frTitle").hidden = !titleOf(f.cos);
    $("frAv").replaceChildren(avatarEl(f.name, f.photo, true));
    const x = f.records || {};
    const short = (v) => (v >= 1000000 ? "1 M€" : v >= 1000 ? `${Math.round(v / 1000)} k€` : `${v} €`);
    $("frRecords").replaceChildren(...[["Solo", x.best2 || 0], ["Chrono", x.bestChrono || 0], ["Millionnaire", short(x.bestMillion || 0)]].map(([k, v]) => {
      const d = document.createElement("div"); d.className = "stat";
      const b = document.createElement("strong"); b.textContent = v;
      const s = document.createElement("span"); s.textContent = k;
      d.append(b, s); return d;
    }));
    const sm = f.summary || {};
    $("frStats").replaceChildren(...[[sm.games || 0, "parties"], [sm.questions || 0, "questions"], [sm.questions ? `${sm.pct || 0}%` : "—", "réussite"]].map(([v, k]) => {
      const d = document.createElement("div"); d.className = "bub";
      const b = document.createElement("strong"); b.textContent = v;
      const s = document.createElement("span"); s.textContent = k;
      d.append(b, s); return d;
    }));
    if (window.__renderAch) window.__renderAch($("frAch"), $("frAchCount"), f.achs || []);
    $("s-friend").querySelector(".profhead").className = `profhead banner ${(f.cos || {}).banner || "bn-plain"}`; // sa bannière
    showScreen("s-friend");
  }
  $("btnFrRemove").onclick = () => F.cur && remove(F.cur, () => showScreen("s-friends"));

  /* ---------- liste d'amis ---------- */
  async function loadFriends() {
    if (!ready()) return;
    const out = [];
    if (dev()) { // le compte du développeur a tous les joueurs de Quizly en amis
      const all = await F.fs.getDocs(F.fs.collection(F.fs.db, "profiles"));
      all.docs.forEach((d) => { if (d.id !== F.uid && d.data().name) out.push({ uid: d.id, ...d.data() }); });
    }
    const list = dev() ? { docs: [] } : await F.fs.getDocs(F.fs.collection(F.fs.db, "friends", F.uid, "list"));
    // tous les profils en même temps (avant : l'un après l'autre)
    const got = await Promise.all(list.docs.map((d) => F.fs.getDoc(ref("profiles", d.id)).then((p) => (p.exists() ? { uid: d.id, ...p.data() } : null)).catch(() => null)));
    out.push(...got.filter(Boolean));
    F.friends = out.sort((a, b) => a.name.localeCompare(b.name));
    F.loadedAt = Date.now();
    F.friends.forEach((f) => setFrame(f.name, (f.cos || {}).frame)); // leur cadre s'affiche partout
    render();
  }

  /* ---------- affichage dans le Profil ---------- */
  function row(person, buttons) {
    const r = document.createElement("div"); r.className = "frow";
    const nm = document.createElement("span"); nm.className = "fname"; nm.textContent = person.name;
    styleName(nm, person.cos); const ti = titleEl(person.cos); // sa couleur de pseudo et son titre
    if (ti) { const w = document.createElement("span"); w.className = "fwho"; w.append(nm, ti); r.append(avatarEl(person.name, person.photo), w, ...buttons); }
    else r.append(avatarEl(person.name, person.photo), nm, ...buttons);
    return r;
  }
  function btn(label, look, fn) { const b = document.createElement("button"); b.className = `btn ${look} sm`; b.textContent = label; b.onclick = fn; return b; }
  function renderRequests() {
    const reqs = F.requests || [];
    $("reqBox").hidden = !reqs.length;
    $("reqList").replaceChildren(...reqs.map((r) => row(r, [btn("Accepter", "sun", () => accept(r)), btn("Refuser", "ghost", () => refuse(r))])));
  }
  function render() {
    $("friendsBox").hidden = !ready();
    $("friendsOff").hidden = ready();
    if (!ready()) return;
    $("myCode").textContent = F.code;
    const link = `${location.origin}/?ami=${F.code}`;
    if ($("myQr").dataset.code !== F.code) { $("myQr").dataset.code = F.code; $("myQr").src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=8&data=${encodeURIComponent(link)}`; }
    renderFriendList();
    if (!F.panel) setPanel("mine"); // premier affichage : Mes amis (même vide, avec un bouton pour en ajouter)
    renderRanking();
    renderRequests();
  }
  /* ---------- la liste « Mes amis » : une carte claire par ami ---------- */
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const parisDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(Date.now());
  function seen(t) { // « actif à l'instant », « actif il y a 3 h »…
    if (!t) return "pas encore joué";
    const m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 10) return "actif à l'instant";
    if (m < 60) return `actif il y a ${m} min`;
    if (m < 60 * 24) return `actif il y a ${Math.round(m / 60)} h`;
    const d = Math.round(m / 1440);
    return d < 30 ? `actif il y a ${d} j` : "pas vu depuis longtemps";
  }
  function friendCard(f) {
    const c = el("div", "fcard tap"); c.tabIndex = 0; c.setAttribute("role", "button");
    c.dataset.name = (f.name || "").toLowerCase();
    c.onclick = () => openFriend(f);
    c.onkeydown = (e) => (e.key === "Enter" || e.key === " ") && openFriend(f);
    const body = el("div", "fbody");
    const top = el("div", "ftop"), nm = el("span", "fname", f.name);
    styleName(nm, f.cos); champName(nm, f.uid); top.append(nm);
    const ti = titleEl(f.cos); if (ti) top.append(ti);
    const fresh = f.at && Date.now() - f.at < 15 * 60000;
    const pl = f.playing && Date.now() - (f.playing.at || 0) < 20 * 60000 ? f.playing.name : ""; // en partie en ce moment
    const meta = el("div", "fmeta" + (pl ? " playing" : "")); meta.append(el("i", "fdot" + (fresh || pl ? " on" : "")), document.createTextNode(pl ? `joue à ${pl}` : seen(f.at)));
    body.append(top, meta);
    if (f.daily && f.daily.day === parisDay()) { // seulement : est-il actif, et a-t-il fait le Défi du jour ?
      const chips = el("div", "fchips"), d = el("span", "dd");
      d.append(el("small", null, "Défi du jour fait"), el("b", null, `${f.daily.score} / 10`));
      chips.append(d); body.append(chips);
    }
    c.append(avatarEl(f.name, f.photo, true), body, el("span", "chev", "›"));
    return c;
  }
  function renderFriendList() {
    const box = $("friendList");
    if (!F.friends.length) return box.replaceChildren(el("div", "fempty", null), el("p", "lead small", "Pas encore d'amis. Ajoutez-en avec leur code ou leur QR code !"), btn("Ajouter un ami", "sun", () => setPanel("add")));
    const list = [...F.friends].sort((a, b) => (b.at || 0) - (a.at || 0)); // les plus actifs en haut
    const head = el("div", "fhead");
    head.append(el("span", "fcount", `${list.length} ami${list.length > 1 ? "s" : ""}`));
    const cards = list.map(friendCard);
    if (list.length >= 6) { // une recherche quand la liste devient longue
      const q = el("input", "fsearch"); q.type = "search"; q.placeholder = "Rechercher un ami"; q.autocomplete = "off";
      q.oninput = () => { const v = q.value.trim().toLowerCase(); cards.forEach((c) => (c.hidden = !!v && !c.dataset.name.includes(v))); };
      head.append(q);
    }
    box.replaceChildren(head, ...cards);
  }
  // classement entre amis : vous + vos amis, mode par mode
  const TABS = [["best2", "Solo"], ["bestChrono", "Chrono"], ["bestMillion", "Millionnaire"]];
  F.scope = "friends";
  document.querySelectorAll("#rankScope button").forEach((b) => (b.onclick = () => {
    F.scope = b.dataset.s;
    document.querySelectorAll("#rankScope button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderRanking();
  }));
  async function renderRanking() {
    $("rankTabs").replaceChildren(...TABS.map(([k, label]) => {
      const c = document.createElement("button"); c.className = "chip"; c.textContent = label;
      c.setAttribute("aria-pressed", F.tab === k);
      c.onclick = () => { F.tab = k; renderRanking(); };
      return c;
    }));
    let people = [{ ...me(), uid: F.uid, records: records(), you: true }, ...F.friends];
    $("rankMine").hidden = F.scope !== "world";
    if (F.scope === "world") { // tous les joueurs de Quizly
      const k0 = F.tab;
      $("rankList").replaceChildren(Object.assign(document.createElement("p"), { className: "lead small", textContent: "Chargement du classement mondial…" }));
      try { people = await api.worldRecords(k0); } catch { people = []; }
      if (F.scope !== "world" || F.tab !== k0) return; // l'utilisateur a changé d'onglet entre-temps
      const i = people.findIndex((p) => p.you);
      $("rankMine").textContent = i >= 0 ? `Votre place : ${i + 1}e sur les ${people.length} meilleurs` : "Vous n'êtes pas encore dans les 50 meilleurs.";
      $("rankEmpty").hidden = true; $("rankList").hidden = false; $("rankTabs").hidden = false;
    }
    const k = F.tab, fmt = (v) => (k === "bestMillion" ? euros(v || 0) : `${v || 0} pts`);
    // seulement ceux qui ont au moins 1 point (un record à 0 n'a rien à faire dans un classement)
    const sorted = people.filter((p) => ((p.records || {})[k] || 0) >= 1).sort((a, b) => ((b.records || {})[k] || 0) - ((a.records || {})[k] || 0));
    $("rankList").replaceChildren(...(sorted.length ? sorted.map((p, i) => {
      const li = document.createElement("li"); li.className = "rk" + (i === 0 ? " first" : "");
      const pos = document.createElement("span"); pos.className = "pos"; pos.textContent = i + 1;
      const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = p.you ? `${p.name} (vous)` : p.name;
      const st = document.createElement("span"); st.className = "st"; st.textContent = fmt((p.records || {})[k]);
      li.append(pos, avatarEl(p.name, p.photo), nm, st);
      return li;
    }) : [Object.assign(document.createElement("p"), { className: "lead small", textContent: "Personne n'a encore de points dans ce mode." })]));
    if (F.scope !== "world") {
      $("rankList").hidden = !F.friends.length; $("rankTabs").hidden = !F.friends.length;
      $("rankEmpty").hidden = !!F.friends.length;
    }
  }

  /* ---------- la cloche : vos notifications (amis, invitations, annonces) ---------- */
  // envoie une notification : sur tous les appareils de l'ami (push) et dans sa cloche
  // seules notifications envoyées : demandes d'ami et invitations (+ le Défi du jour de 10 h et les annonces, envoyés par le serveur)
  const TITLES = { demande: "Demande d'ami", invite: "Invitation à jouer", club: "Invitation au club" };
  async function notify(to, type, text, url) {
    sendPush(to, TITLES[type] || "", text, url);
    try { const m = me(); await F.fs.addDoc(F.fs.collection(F.fs.db, "notifs", to, "list"), { from: F.uid, name: m.name, photo: m.photo || "", type, text, url, at: Date.now() }); } catch {}
  }
  const seenKey = () => `quizly:${F.uid}:notifSeen`;
  function listenNotifs() {
    const { onSnapshot, collection, query, orderBy, limit } = F.fs;
    const merge = () => {
      const items = [...(F.mine || []), ...(F.ann || [])].sort((a, b) => b.at - a.at).slice(0, 40);
      F.notifs = items;
      const seen = +localStorage.getItem(seenKey()) || 0, unread = items.filter((n) => n.at > seen).length;
      $("notifBadge").hidden = !unread; $("notifBadge").textContent = unread > 9 ? "9+" : unread;
      if (!$("s-notifs").hidden) renderNotifs();
    };
    F.unsub.push(onSnapshot(query(collection(F.fs.db, "notifs", F.uid, "list"), orderBy("at", "desc"), limit(30)), (snap) => {
      F.mine = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // ménage : au-delà de 7 jours, on efface
      snap.docs.filter((d) => Date.now() - (d.data().at || 0) > 7 * 86400000).forEach((d) => F.fs.deleteDoc(d.ref).catch(() => {}));
      merge();
    }, () => {}));
    F.unsub.push(onSnapshot(query(collection(F.fs.db, "announces"), orderBy("at", "desc"), limit(10)), (snap) => {
      const hid = hiddenAnn(), since = notifStart();
      F.ann = snap.docs.map((d) => ({ id: d.id, type: "annonce", name: "Quizly", ...d.data() })).filter((a) => !hid.includes(a.id) && a.at >= since); // ni les annonces masquées, ni celles d'avant votre arrivée
      merge();
    }, () => {}));
  }
  const hidKey = () => `quizly:${F.uid}:annHidden`;
  function notifStart() { // date à partir de laquelle ce compte reçoit les annonces (gardée dans le cloud)
    const k = `quizly:${F.uid}:notifStart`;
    let t = +localStorage.getItem(k) || 0;
    if (!t) { t = Date.now(); try { localStorage.setItem(k, String(t)); } catch {} }
    return t;
  }
  const hiddenAnn = () => { try { return JSON.parse(localStorage.getItem(hidKey()) || "[]"); } catch { return []; } };
  async function dismiss(n) {
    if (n.type === "annonce") { // une annonce est commune à tous : on la masque seulement chez vous
      try { localStorage.setItem(hidKey(), JSON.stringify([...hiddenAnn(), n.id].slice(-100))); } catch {}
      F.ann = (F.ann || []).filter((a) => a.id !== n.id);
    } else {
      F.mine = (F.mine || []).filter((a) => a.id !== n.id);
      try { await F.fs.deleteDoc(ref("notifs", F.uid, "list", n.id)); } catch {}
    }
    F.notifs = (F.notifs || []).filter((a) => a !== n);
    renderNotifs();
  }
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
  function renderNotifs() {
    const items = F.notifs || [];
    $("notifEmpty").hidden = items.length > 0;
    $("notifList").replaceChildren(...items.map((n) => {
      const r = document.createElement("div"); r.className = "frow notif" + (n.type === "annonce" ? " ann" : "");
      const t = document.createElement("span"); t.className = "fname";
      if (n.title) { const h = document.createElement("b"); h.className = "ntitle"; h.textContent = n.title; t.append(h); }
      t.append(document.createTextNode(n.text || ""));
      const w = document.createElement("span"); w.className = "frec"; w.textContent = ago(n.at); t.append(w);
      const act = n.type === "invite" ? btn("Rejoindre", "sun", () => { const c = (String(n.url).match(/tv=([A-Z0-9]+)/) || [])[1]; if (c) joinRoom(c); })
        : n.type === "club" ? btn("Rejoindre", "sun", () => clubInvite((String(n.url).match(/club=([A-Z0-9]+)/) || [])[1]))
        : n.type === "demande" || n.type === "accepte" ? btn("Voir", "ghost", () => openFriends()) : null;
      const x = document.createElement("button"); x.className = "fx"; x.textContent = "×"; x.setAttribute("aria-label", "Supprimer cette notification"); x.onclick = () => dismiss(n);
      r.append(avatarEl(n.name || "Quizly", n.photo), t, ...(act ? [act] : []), x);
      return r;
    }));
    try { localStorage.setItem(seenKey(), String(Date.now())); } catch {}
    $("notifBadge").hidden = true;
  }

  /* ---------- notification : quelqu'un veut devenir votre ami ---------- */
  function showRequest(r) {
    F.shownReq = r;
    $("reqText").textContent = `${r.name} veut devenir votre ami.`;
    $("reqAv").replaceChildren(avatarEl(r.name, r.photo));
    $("reqToast").hidden = false;
    clearTimeout(F.reqT); F.reqT = setTimeout(() => ($("reqToast").hidden = true), 12000);
  }
  $("btnReqYes").onclick = () => { const r = F.shownReq; $("reqToast").hidden = true; if (r) accept(r); };
  $("btnReqSee").onclick = () => { $("reqToast").hidden = true; openFriends(); };

  /* ---------- inviter des amis dans un salon ---------- */
  function openInvites() {
    const room = roomInfo();
    if (!room || !ready()) return;
    const panel = $("invitePanel");
    if (!panel.hidden) { panel.hidden = true; return; }
    panel.hidden = false;
    $("inviteList").replaceChildren(...(F.friends.length ? F.friends.map((f) => {
      const b = btn("Inviter", "sun", async () => {
        b.disabled = true; b.textContent = "Envoi…";
        const m = me(), inv = { code: room.code, kind: room.kind, name: m.name, photo: m.photo || "", at: Date.now() };
        let saved = false;
        try { await F.fs.setDoc(ref("invites", f.uid, "list", F.uid), inv); saved = true; }
        catch {
          // compte développeur : « tout le monde en amis » n'est qu'un affichage ; la base refuse l'invitation à
          // quelqu'un qui n'est pas vraiment ami. On crée la vraie amitié, puis on réessaie.
          if (dev()) try {
            await F.fs.setDoc(ref("friends", F.uid, "list", f.uid), { since: Date.now() });
            await F.fs.setDoc(ref("friends", f.uid, "list", F.uid), { since: Date.now() });
            await F.fs.setDoc(ref("invites", f.uid, "list", F.uid), inv); saved = true;
          } catch {}
        }
        // la notification part dans tous les cas (elle passe par le serveur) : un appui rejoint le salon
        notify(f.uid, "invite", `${m.name} vous invite à jouer${KIND[room.kind] ? ` (${KIND[room.kind]})` : ""}.`, `/?tv=${room.code}`);
        b.textContent = saved ? "Invité" : "Notification envoyée";
      });
      return row(f, [b]);
    }) : [Object.assign(document.createElement("p"), { className: "lead small", textContent: "Ajoutez des amis depuis votre Profil pour les inviter." })]));
  }
  const KIND = { survie: "Survie", chrono: "Chrono 60 s", million: "Qui veut gagner des millions", equipes: "Équipes", parieurs: "Les Parieurs", imposteur: "L'Imposteur", royale: "Le Dernier Debout", duel: "Le Duel" };
  function showInvite(inv) {
    F.inv = inv;
    const t = $("inviteToast");
    if (!inv) { t.hidden = true; return; }
    $("inviteText").textContent = `${inv.name} vous invite à jouer${KIND[inv.kind] ? ` (${KIND[inv.kind]})` : ""}.`;
    $("inviteAv").replaceChildren(avatarEl(inv.name, inv.photo));
    t.hidden = false;
  }
  async function dropInvite() {
    const inv = F.inv; $("inviteToast").hidden = true; F.inv = null;
    if (inv && ready()) try { await F.fs.deleteDoc(ref("invites", F.uid, "list", inv.uid)); } catch {}
    return inv;
  }
  $("btnInvJoin").onclick = async () => { const inv = await dropInvite(); if (inv) joinRoom(inv.code); };
  $("btnInvNo").onclick = () => dropInvite();
  $("btnAddFriend").onclick = () => addByCode($("friendCode").value);
  $("friendCode").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addByCode($("friendCode").value); } });
  $("myCode").onclick = () => { try { navigator.clipboard.writeText(F.code); say("Code copié."); } catch {} };
  $("btnInvite").onclick = openInvites;

  /* ---------- clubs : un groupe privé, son code, son classement ---------- */
  const CLUB_MAX = 30;
  const clubKey = () => `quizly:${F.uid}:club`;
  const myClub = () => { try { return localStorage.getItem(clubKey()) || ""; } catch { return ""; } };
  const setMyClub = (c) => { try { c ? localStorage.setItem(clubKey(), c) : localStorage.removeItem(clubKey()); } catch {} };
  const cmsg = (t) => ($("clubMsg").textContent = t);
  async function newClubCode() {
    for (let t = 0; t < 8; t++) {
      const c = Array.from({ length: 6 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");
      if (!(await F.fs.getDoc(ref("clubs", c))).exists()) return c;
    }
    throw new Error("code");
  }
  async function createClub(raw) {
    const nm = String(raw || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
    if (!ready()) return cmsg("Connectez-vous au cloud pour créer un club.");
    if (nm.length < 3) return cmsg("Donnez un nom d'au moins 3 caractères.");
    try {
      const code = await newClubCode(), m = me();
      await F.fs.setDoc(ref("clubs", code), { name: nm, owner: F.uid, at: Date.now() });
      await F.fs.setDoc(ref("clubs", code, "members", F.uid), { name: m.name, photo: m.photo || "", at: Date.now() });
      setMyClub(code); $("clubName").value = ""; cmsg("");
      await loadClub();
    } catch { cmsg("Impossible de créer le club pour le moment."); }
  }
  async function joinClub(raw) {
    const code = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!ready()) return cmsg("Connectez-vous au cloud pour rejoindre un club.");
    if (code.length !== 6) return cmsg("Un code de club fait 6 caractères.");
    try {
      const c = await F.fs.getDoc(ref("clubs", code));
      if (!c.exists()) return cmsg("Aucun club avec ce code.");
      const mem = await F.fs.getDocs(F.fs.collection(F.fs.db, "clubs", code, "members"));
      if (mem.docs.length >= CLUB_MAX) return cmsg(`Ce club est complet (${CLUB_MAX} membres).`);
      if (myClub() && myClub() !== code) await leaveClub(true); // un seul club à la fois
      const m = me();
      await F.fs.setDoc(ref("clubs", code, "members", F.uid), { name: m.name, photo: m.photo || "", at: Date.now() });
      setMyClub(code); $("clubCode").value = ""; cmsg("");
      await loadClub();
    } catch { cmsg("Impossible de rejoindre ce club pour le moment."); }
  }
  async function leaveClub(silent) {
    const code = myClub(); if (!code || !ready()) return;
    try {
      const c = await F.fs.getDoc(ref("clubs", code));
      const others = (await F.fs.getDocs(F.fs.collection(F.fs.db, "clubs", code, "members"))).docs.filter((d) => d.id !== F.uid);
      await F.fs.deleteDoc(ref("clubs", code, "members", F.uid));
      if (c.exists() && c.data().owner === F.uid) { // le créateur part : le club passe au plus ancien membre, ou disparaît
        if (others.length) await F.fs.setDoc(ref("clubs", code), { owner: others.sort((a, b) => (a.data().at || 0) - (b.data().at || 0))[0].id }, { merge: true });
        else await F.fs.deleteDoc(ref("clubs", code));
      }
    } catch {}
    forgetClub(); // on oublie aussi la version gardée sur l'appareil
    if (!silent) renderClub();
  }
  // le club : affiché tout de suite avec la dernière version connue (gardée sur l'appareil), puis mis à jour
  // en arrière-plan ; toutes les lectures partent en même temps (avant : une quinzaine d'allers-retours à la suite)
  const clubCacheKey = () => `quizly:${F.uid}:clubCache`;
  function clubFromCache(code) {
    if (F.club && F.club.code === code) return;
    try { const c = JSON.parse(localStorage.getItem(clubCacheKey()) || "null"); if (c && c.code === code) F.club = c; } catch {}
  }
  function forgetClub() { setMyClub(""); F.club = null; try { localStorage.removeItem(clubCacheKey()); } catch {} }
  async function loadClub() {
    const code = myClub();
    if (!code || !ready()) { F.club = null; return renderClub(); }
    clubFromCache(code);
    if (F.club) renderClub(); // tout de suite
    if (F.clubLoading && F.clubLoadingCode === code) return F.clubLoading; // déjà en cours (préchargement)
    F.clubLoadingCode = code;
    const run = (async () => {
      try {
        const [c, mem] = await Promise.all([F.fs.getDoc(ref("clubs", code)), F.fs.getDocs(F.fs.collection(F.fs.db, "clubs", code, "members"))]);
        if (!c.exists() || !mem.docs.some((d) => d.id === F.uid)) { forgetClub(); return; } // club supprimé, ou plus membre
        clubSync(code, true).catch(() => {}); // vos chiffres de la semaine, pour les défis du club (en arrière-plan)
        const members = await Promise.all(mem.docs.map(async (d) => {
          let p = {};
          try { const x = await F.fs.getDoc(ref("profiles", d.id)); if (x.exists()) p = x.data(); } catch {}
          setFrame(p.name || d.data().name, (p.cos || {}).frame);
          return { uid: d.id, ...p, ...d.data(), name: p.name || d.data().name, you: d.id === F.uid };
        }));
        if (myClub() !== code) return; // on a changé de club entre-temps
        F.club = { code, ...c.data(), members };
        try { localStorage.setItem(clubCacheKey(), JSON.stringify(F.club)); } catch {}
      } catch {} // hors ligne : on garde la dernière version connue
      finally { if (F.clubLoading === run) F.clubLoading = null; if (!myClub() || myClub() === code) renderClub(); }
    })();
    F.clubLoading = run;
    return run;
  }

  F.ctab = "daily"; F.cpanel = "rank";
  const CTABS = [["daily", "Défi du jour"], ["best2", "Solo"], ["bestChrono", "Chrono"], ["bestMillion", "Millionnaire"], ["achs", "Succès"]];
  // emblèmes des clubs : des icônes dessinées (les anciens clubs à emoji reçoivent l'étoile)
  const EMBLEMS = {
    star: "M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z",
    bolt: "M13 2L4 14h6l-1 8 9-12h-6z",
    flame: "M12 2c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z",
    crown: "M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z",
    trophy: "M7 3h10v2h3v3a5 5 0 0 1-4.3 4.95A5 5 0 0 1 13 15.9V18h3v3H8v-3h3v-2.1a5 5 0 0 1-2.7-2.95A5 5 0 0 1 4 8V5h3V3z",
    shield: "M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z",
    heart: "M12 21s-8-5.3-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.7-8 11-8 11z",
    diamond: "M6 3h12l4 6-10 12L2 9z",
    moon: "M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z",
    rocket: "M12 2c3.5 2 5.5 5.6 5.5 9.5 0 1.3-.2 2.5-.6 3.6L19 18l-3 1-1.5-2h-5L8 19l-3-1 2.1-2.9c-.4-1.1-.6-2.3-.6-3.6C6.5 7.6 8.5 4 12 2zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-2 11h4l-2 3z",
    target: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
    brain: "M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 1 5 3 3 0 0 0 4 3h2V3zm4 0v16h2a3 3 0 0 0 4-3 3 3 0 0 0 1-5 3 3 0 0 0-2-5 3 3 0 0 0-3-3z"
  };
  const embOf = (c) => (EMBLEMS[c && c.emb] ? c.emb : "star");
  const icon = (k) => { const ns = "http://www.w3.org/2000/svg", v = document.createElementNS(ns, "svg"); v.setAttribute("viewBox", "0 0 24 24"); v.setAttribute("aria-hidden", "true"); const pth = document.createElementNS(ns, "path"); pth.setAttribute("d", EMBLEMS[k]); pth.setAttribute("fill", "currentColor"); pth.setAttribute("fill-rule", "evenodd"); v.append(pth); return v; };
  const CCOLORS = ["mint", "sun", "coral", "sky", "peach", "lilac"];
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(Date.now());
  // défis du club : tous ensemble cette semaine ; l'objectif grandit avec le nombre de membres
  const CQUESTS = [
    { id: "cq-good", txt: (n) => `Ensemble : ${n} bonnes réponses`, k: "cgood", per: 60, r: 60 },
    { id: "cq-game", txt: (n) => `Ensemble : ${n} parties`, k: "cgame", per: 8, r: 50 },
    { id: "cq-daily", txt: (n) => `Ensemble : ${n} Défis du jour`, k: "cdaily", per: 3, r: 70 }
  ];
  let lastSync = 0;
  async function clubSync(code = myClub(), force) { // vos chiffres de la semaine dans votre fiche de membre
    const w = week(); if (!code || !ready() || !w || (!force && Date.now() - lastSync < 30000)) return;
    lastSync = Date.now();
    try { await F.fs.setDoc(ref("clubs", code, "members", F.uid), { cwk: w.week, cgood: w.good, cgame: w.game, cdaily: w.daily }, { merge: true }); } catch {}
  }
  const gotKey = () => `quizly:${F.uid}:clubGot`;
  const clubGot = () => { try { return JSON.parse(localStorage.getItem(gotKey()) || "[]"); } catch { return []; } };
  function renderClubQuests(c) {
    const w = week(), wk = w ? w.week : "", n = Math.max(2, c.members.length), got = clubGot();
    $("clubQuests").replaceChildren(...CQUESTS.map((q) => {
      const goal = q.per * n, v = Math.min(goal, c.members.filter((p) => p.cwk === wk).reduce((a, p) => a + (+p[q.k] || 0), 0));
      const tag = `${c.code}:${wk}:${q.id}`, taken = got.includes(tag), done = v >= goal;
      const card = document.createElement("div"); card.className = "quest" + (taken ? " taken" : done ? " ready" : "");
      const t = document.createElement("div"); t.className = "qtxt";
      const b = document.createElement("b"); b.textContent = q.txt(goal);
      const bar = document.createElement("div"); bar.className = "qbar"; const i = document.createElement("i"); i.style.width = `${Math.round((100 * v) / goal)}%`; bar.append(i);
      const sm = document.createElement("small"); sm.textContent = `${v} / ${goal}`;
      t.append(b, bar, sm);
      const btn = document.createElement("button"); btn.className = "btn sm qbtn " + (taken ? "white" : done ? "sun" : "white wait");
      if (taken) { btn.textContent = "Récupéré"; btn.disabled = true; }
      else { const coin = document.createElement("span"); coin.className = "coin"; btn.append(coin, document.createTextNode(` ${q.r}`)); btn.disabled = !done; btn.onclick = () => { const g = clubGot(); if (g.includes(tag)) return; g.push(tag); try { localStorage.setItem(gotKey(), JSON.stringify(g.slice(-60))); } catch {} earn(q.r, "club"); renderClub(); }; }
      card.append(t, btn); return card;
    }));
  }
  function renderClub() {
    const c = F.club;
    $("clubNone").hidden = !!c; $("clubIn").hidden = !c;
    if (!c) return;
    const owner = c.owner === F.uid, day = today();
    $("clubCard").className = `clubcard cc-${CCOLORS.includes(c.color) ? c.color : "mint"}`;
    $("clubEmb").replaceChildren(icon(embOf(c)));
    $("clubTitle").textContent = c.name;
    $("clubDesc").textContent = c.desc || ""; $("clubDesc").hidden = !c.desc;
    $("clubShowCode").textContent = c.code;
    $("clubInfo").textContent = `${c.members.length} membre${c.members.length > 1 ? "s" : ""} sur ${CLUB_MAX}${owner ? " · vous l'avez créé" : ""}`;
    // les onglets du club
    document.querySelectorAll("#clubNav button").forEach((b) => { b.setAttribute("aria-pressed", String(b.dataset.c === F.cpanel)); b.onclick = () => { F.cpanel = b.dataset.c; cmsg(""); renderClub(); }; });
    [["rank", "cpRank"], ["quest", "cpQuest"], ["chat", "cpChat"], ["invite", "cpInvite"], ["set", "cpSet"]].forEach(([k, id]) => ($(id).hidden = k !== F.cpanel));
    // classement et chiffres du club
    const doneToday = c.members.filter((p) => p.daily && p.daily.day === day).length;
    const achTotal = c.members.reduce((a, p) => a + (p.achs || []).length, 0);
    $("clubStats").replaceChildren(...[[`${doneToday}/${c.members.length}`, "défi du jour fait"], [achTotal, "succès au total"], [c.members.reduce((a, p) => a + ((p.summary || {}).games || 0), 0), "parties jouées"]].map(([v, k]) => {
      const d = document.createElement("div"); const b = document.createElement("strong"); b.textContent = v; const t = document.createElement("span"); t.textContent = k; d.append(b, t); return d;
    }));
    $("clubTabs").replaceChildren(...CTABS.map(([k, label]) => {
      const b = document.createElement("button"); b.className = "chip"; b.textContent = label; b.setAttribute("aria-pressed", String(F.ctab === k));
      b.onclick = () => { F.ctab = k; renderClub(); }; return b;
    }));
    const k = F.ctab;
    const val = (p) => k === "daily" ? (p.daily && p.daily.day === day ? p.daily.score * 1e6 - (p.daily.ms || 0) : -1) : k === "achs" ? (p.achs || []).length : ((p.records || {})[k] || 0);
    const txt = (p) => k === "daily" ? (p.daily && p.daily.day === day ? `${p.daily.score} / 10` : "pas encore") : k === "achs" ? `${(p.achs || []).length} succès` : k === "bestMillion" ? euros((p.records || {})[k] || 0) : `${(p.records || {})[k] || 0} pts`;
    const list = [...c.members].sort((a, b) => val(b) - val(a));
    $("clubRank").replaceChildren(...list.map((p, i) => {
      const li = document.createElement("li"); li.className = "rk" + (i === 0 && val(p) > 0 ? " first" : "") + (p.you ? " mine" : "");
      const pos = document.createElement("span"); pos.className = "pos"; pos.textContent = i + 1;
      const who = document.createElement("span"); who.className = "nm clubwho";
      const nm = document.createElement("span"); nm.textContent = p.you ? `${p.name} (vous)` : p.name; styleName(nm, p.cos);
      who.append(nm); const ti = titleEl(p.cos); if (ti) who.append(ti);
      if (p.uid === c.owner) { const o = document.createElement("small"); o.className = "ownr"; o.textContent = "créateur"; who.append(o); }
      const st = document.createElement("span"); st.className = "st"; st.textContent = txt(p);
      li.append(pos, avatarEl(p.name, p.photo), who, st);
      if (owner && !p.you) { // le créateur peut retirer un membre
        const x = document.createElement("button"); x.className = "fx"; x.textContent = "×"; x.setAttribute("aria-label", `Retirer ${p.name} du club`);
        x.onclick = () => ask(`Retirer ${p.name} ?`, "Il pourra revenir seulement avec le code du club.", "Retirer", () => kickMember(p));
        li.append(x);
      }
      return li;
    }));
    renderClubQuests(c);
    // le chat : les derniers messages de chaque membre, du plus récent au plus ancien
    const wall = c.members.flatMap((p) => (Array.isArray(p.wall) ? p.wall : []).map((w) => ({ ...w, p }))).filter((w) => w && w.text).sort((a, b) => b.at - a.at).slice(0, 30);
    $("clubWall").replaceChildren(...(wall.length ? wall.map((w) => {
      const r = document.createElement("div"); r.className = "wmsg" + (w.p.you ? " mine" : "");
      const t = document.createElement("div"); t.className = "wtxt";
      const n = document.createElement("b"); n.textContent = w.p.you ? "Vous" : w.p.name; styleName(n, w.p.cos);
      const tx = document.createElement("span"); tx.textContent = w.text;
      const ag = document.createElement("small"); ag.textContent = ago(w.at);
      t.append(n, tx, ag); r.append(avatarEl(w.p.name, w.p.photo), t); return r;
    }) : [Object.assign(document.createElement("p"), { className: "fhint", textContent: "Aucun message pour l'instant. Lancez la discussion !" })]));
    // inviter ses amis qui ne sont pas encore dans le club
    const inClub = new Set(c.members.map((p) => p.uid));
    const friends = F.friends.filter((f) => !inClub.has(f.uid));
    F.invited ||= new Set();
    $("clubInvite").replaceChildren(...(friends.length ? friends.map((f) => {
      const sent = F.invited.has(`${c.code}:${f.uid}`);
      const b = btn(sent ? "Invité" : "Inviter", sent ? "white" : "sun", () => inviteToClub(f, b));
      b.disabled = sent || c.members.length >= CLUB_MAX;
      return row(f, [b]);
    }) : [Object.assign(document.createElement("p"), { className: "fhint", textContent: F.friends.length ? "Tous vos amis sont déjà dans le club." : "Ajoutez des amis pour pouvoir les inviter ici." })]));
    // réglages : le créateur personnalise le club ; chacun peut le quitter
    $("clubEditBox").hidden = !owner;
    $("clubSetHint").textContent = owner ? "" : "Seul le créateur du club peut changer son emblème, sa couleur et sa description.";
    if (owner && !F.cEditOpen) { F.cEdit = { emb: embOf(c), color: c.color || "mint" }; $("clubDescIn").value = c.desc || ""; F.cEditOpen = true; }
    $("clubEmbPick").replaceChildren(...Object.keys(EMBLEMS).map((e) => { const b = document.createElement("button"); b.append(icon(e)); b.setAttribute("aria-label", e); b.setAttribute("aria-pressed", String((F.cEdit.emb || embOf(c)) === e)); b.onclick = () => { F.cEdit.emb = e; [...$("clubEmbPick").children].forEach((x) => x.setAttribute("aria-pressed", String(x === b))); }; return b; }));
    $("clubColPick").replaceChildren(...CCOLORS.map((col) => { const b = document.createElement("button"); b.className = `cc-${col}`; b.setAttribute("aria-label", col); b.setAttribute("aria-pressed", String((F.cEdit.color || c.color || "mint") === col)); b.onclick = () => { F.cEdit.color = col; [...$("clubColPick").children].forEach((x) => x.setAttribute("aria-pressed", String(x === b))); }; return b; }));
  }
  async function inviteToClub(f, b) {
    const c = F.club; if (!c) return;
    b.disabled = true;
    notify(f.uid, "club", `${me().name} vous invite dans le club « ${c.name} ».`, `/?club=${c.code}`);
    F.invited.add(`${c.code}:${f.uid}`); b.textContent = "Invité"; b.className = "btn white sm";
    cmsg(`Invitation envoyée à ${f.name}.`);
  }
  async function kickMember(p) {
    const c = F.club; if (!c) return;
    try { await F.fs.deleteDoc(ref("clubs", c.code, "members", p.uid)); cmsg(`${p.name} a été retiré du club.`); }
    catch { cmsg("Impossible de retirer ce membre : la règle Firestore « clubs » ne le permet pas encore au créateur."); }
    loadClub();
  }
  async function postWall() {
    const c = F.club, text = $("clubWallIn").value.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!c || !text) return;
    const mine = c.members.find((p) => p.you), wall = [...(Array.isArray(mine && mine.wall) ? mine.wall : []), { text, at: Date.now() }].slice(-5); // vos 5 derniers messages
    try { await F.fs.setDoc(ref("clubs", c.code, "members", F.uid), { wall }, { merge: true }); $("clubWallIn").value = ""; if (mine) mine.wall = wall; renderClub(); }
    catch { cmsg("Message non envoyé, réessayez."); }
  }
  F.cEdit = {};
  $("btnClubSave").onclick = async () => {
    const c = F.club; if (!c || c.owner !== F.uid) return;
    const patch = { emb: F.cEdit.emb || embOf(c), color: F.cEdit.color || c.color || "mint", desc: $("clubDescIn").value.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 80) };
    try { await F.fs.setDoc(ref("clubs", c.code), patch, { merge: true }); Object.assign(c, patch); renderClub(); cmsg("Club mis à jour."); }
    catch { cmsg("Impossible d'enregistrer pour le moment."); }
  };
  $("btnClubPost").onclick = postWall;
  $("clubWallIn").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); postWall(); } });
  $("clubShowCodeBtn").onclick = () => { const c = F.club; if (!c) return; try { navigator.clipboard.writeText(c.code); cmsg("Code copié."); } catch {} };
  $("btnClubCreate").onclick = () => createClub($("clubName").value);
  $("btnClubJoin").onclick = () => joinClub($("clubCode").value);
  $("btnClubLeave").onclick = () => ask("Quitter le club ?", "Vous pourrez le rejoindre à nouveau avec son code.", "Quitter", () => leaveClub());
  $("btnClubShare").onclick = async () => {
    const c = F.club; if (!c) return;
    const text = `Rejoins mon club Quizly « ${c.name} » avec le code ${c.code} (Amis › Club).`;
    try { if (navigator.share) await navigator.share({ title: "Quizly", text }); else { await navigator.clipboard.writeText(c.code); cmsg("Code copié."); } } catch {}
  };
  // invitation reçue (notification ou lien /?club=CODE) : on ouvre l'onglet Club et on propose de rejoindre
  function clubInvite(code) {
    code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (code.length !== 6) return;
    openFriends(); setPanel("club");
    if (myClub() === code) return;
    ask("Rejoindre ce club ?", myClub() ? "Vous quitterez votre club actuel (un seul club à la fois)." : "Vous verrez son classement et son mur.", "Rejoindre", () => joinClub(code));
  }

  /* ---------- le champion du Défi du jour : son pseudo devient spécial ----------
     le 1er du classement mondial d'aujourd'hui ; tant que personne n'a fait le défi du jour, le 1er d'hier.
     Il redevient normal dès qu'un autre le dépasse, ou le lendemain s'il n'est plus 1er. */
  const champDay = (o) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(Date.now() - o * 86400000);
  async function loadChampion() {
    if (!ready()) return;
    let champ = null;
    for (const o of [0, 1]) {
      try { const l = await api.worldDaily(champDay(o)); if (l.length) { champ = l[0].uid; break; } } catch {}
    }
    if (champ === F.champ) return;
    F.champ = champ;
    render(); document.dispatchEvent(new CustomEvent("quizly:champ")); // les écrans ouverts se mettent à jour
  }
  const isChamp = (uid) => !!F.champ && (uid === "me" ? F.uid : uid) === F.champ;
  const champName = (el, uid) => { el.classList.toggle("champ", isChamp(uid)); return el; };
  const api = {
    start, stop, ready, render, isChamp, loadChampion,
    // la liste se rafraîchit à l'ouverture de l'onglet Amis (pour voir qui joue, et à quoi)
    freshen() { if (ready() && Date.now() - (F.loadedAt || 0) > 20000) loadFriends().catch(() => {}); },
    // à quoi je joue en ce moment (vu par mes amis) ; null : plus en partie
    setPlaying(name) {
      if (!ready() || (name || null) === (F.playing || null)) return;
      F.playing = name || null;
      F.fs.setDoc(ref("profiles", F.uid), { playing: name ? { name, at: Date.now() } : null, at: Date.now() }, { merge: true }).catch(() => {});
    }, syncRecords, addByCode, renderNotifs, clubInvite, clubSync: () => clubSync(),
    isFriend: (uid) => F.friends.some((f) => f.uid === uid),
    count: () => F.friends.length,
    // défi du jour terminé : noté pour le classement mondial du défi
    async dailyDone(day, d) {
      if (!ready()) return;
      const m = me();
      try { await F.fs.setDoc(ref("dailydone", day, "users", F.uid), { uid: F.uid, name: m.name, photo: m.photo || "", score: d ? d.score : 0, ms: d ? d.ms : 0, at: Date.now() }); } catch {}
      loadChampion().catch(() => {}); // vous êtes peut-être le nouveau champion
    },
    // classement mondial du défi du jour (les 100 meilleurs scores)
    async worldDaily(day) {
      if (!ready()) return [];
      const { getDocs, collection, query, orderBy, limit } = F.fs;
      const snap = await getDocs(query(collection(F.fs.db, "dailydone", day, "users"), orderBy("score", "desc"), limit(100)));
      return snap.docs.map((d) => ({ uid: d.id, ...d.data(), you: d.id === F.uid, daily: { score: d.data().score || 0, ms: d.data().ms || 0 } }))
        .filter((p) => p.name).sort((a, b) => b.daily.score - a.daily.score || a.daily.ms - b.daily.ms);
    },
    // classement mondial des records (les 50 meilleurs)
    async worldRecords(k) {
      if (!ready()) return [];
      const { getDocs, collection, query, orderBy, limit } = F.fs;
      const snap = await getDocs(query(collection(F.fs.db, "profiles"), orderBy(`records.${k}`, "desc"), limit(50)));
      return snap.docs.map((d) => ({ uid: d.id, ...d.data(), you: d.id === F.uid })).filter((p) => p.name && (p.records || {})[k] > 0);
    },
    // ajouter quelqu'un rencontré dans un salon (sans son code)
    async addByUid(to, name) {
      if (!ready()) return "Connectez-vous au cloud pour ajouter des amis.";
      if (!to || to === F.uid) return "";
      if (F.friends.some((f) => f.uid === to)) return `${name} est déjà votre ami.`;
      try {
        const m = me();
        await F.fs.setDoc(ref("requests", to, "from", F.uid), { name: m.name, photo: m.photo || "", at: Date.now() });
        notify(to, "demande", `${m.name} veut devenir votre ami.`, "/?amis=1");
        return `Demande envoyée à ${name}.`;
      } catch { return "Impossible d'envoyer la demande pour le moment."; }
    },
    // cet appareil, enregistré dans Firestore : le serveur le retrouve même après s'être endormi
    async saveSub(sub) {
      if (!ready() || !sub || !sub.endpoint || !sub.keys) return;
      const id = await subId(sub.endpoint);
      try { await F.fs.setDoc(ref("pushsubs", id), { uid: F.uid, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, at: Date.now() }); } catch {}
    },
    // notifications coupées sur cet appareil : on le retire de Firestore
    async removeSub(endpoint) {
      if (!ready() || !endpoint) return;
      try { await F.fs.deleteDoc(ref("pushsubs", await subId(endpoint))); } catch {}
    },
    // classement du défi du jour : vous et vos amis qui l'ont fait aujourd'hui
    dailyBoard(day) {
      const all = [{ ...me(), you: true, daily: daily() }, ...F.friends];
      return all.filter((p) => p.daily && p.daily.day === day).sort((a, b) => b.daily.score - a.daily.score || a.daily.ms - b.daily.ms);
    },
    // annonce du développeur : gardée dans la cloche de tout le monde (Firestore) puis envoyée en notification
    async announce(title, text, key) {
      // 1) gardée dans la cloche de tout le monde (Firestore) ; 2) envoyée en notification à tous, sauf à vous (même si 1 échoue)
      let saved = false;
      if (ready()) try { await F.fs.addDoc(F.fs.collection(F.fs.db, "announces"), { title, text, by: F.uid, at: Date.now() }); saved = true; } catch (e) { console.warn("Annonce non gardée :", e.message); }
      // tous les appareils inscrits, lus avec votre compte : le serveur, qui redémarre à chaque mise à jour, n'en garde aucun en mémoire
      let subs = [];
      if (ready()) try {
        const snap = await F.fs.getDocs(F.fs.collection(F.fs.db, "pushsubs"));
        subs = snap.docs.map((d) => d.data()).filter((x) => x.endpoint).map((x) => ({ uid: x.uid, sub: { endpoint: x.endpoint, keys: { p256dh: x.p256dh, auth: x.auth } } }));
      } catch (e) { console.warn("Appareils non lus :", e.message); }
      let sent = 0, ok = false, devices = 0, fsErr = "", why = "";
      try {
        const r = await fetch("/api/push/broadcast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, title, body: text, from: F.uid, subs }) });
        ok = r.ok; const j = await r.json(); sent = j.sent || 0; devices = j.devices || 0; fsErr = j.fsErr || ""; why = j.why || "";
      } catch {}
      return { saved, sent, ok, devices, fsErr, why, read: subs.length };
    },
    hideInvitePanel: () => ($("invitePanel").hidden = true),
    refresh: () => (ready() ? loadFriends() : render())
  };
  return api;
}

// « https://…/?ami=ABC123 » → « ABC123 »
export function friendCodeFrom(text) {
  const m = String(text || "").match(/[?&]ami=([A-Z0-9]{6})/i);
  return m ? m[1].toUpperCase() : null;
}
