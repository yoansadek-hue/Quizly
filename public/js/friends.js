// Amis : code ami, demandes, liste avec records, classement entre amis, invitations à un salon.
// Tout passe par Firestore (voir les règles dans le message de la 2.10). Il faut être connecté au cloud.
import { cloudFs } from "./cloud.js";
import { sendPush } from "./push.js";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans I, O, 0, 1 : pas de confusion à la lecture
const INVITE_TTL = 10 * 60 * 1000; // une invitation de plus de 10 minutes est ignorée

export function initFriends({ $, ask, avatarEl, euros, me, records, joinRoom, roomInfo, openFriends, openNotifs, showScreen }) {
  const F = { uid: null, fs: null, code: "", friends: [], unsub: [], tab: "best2", inv: null, panel: null };
  // onglets de l'écran Amis
  function setPanel(p) {
    F.panel = p;
    [["mine", "fpMine"], ["add", "fpAdd"], ["rank", "fpRank"]].forEach(([k, id]) => ($(id).hidden = k !== p));
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
      return true;
    } catch (e) { console.warn("Amis indisponibles :", e.message); stop(); return false; }
  }
  function stop() {
    F.unsub.forEach((u) => { try { u(); } catch {} }); F.unsub = []; F.uid = null; F.fs = null; F.friends = []; F.first = false;
    $("friendsBadge").hidden = true; $("notifBadge").hidden = true; $("reqToast").hidden = true; $("inviteToast").hidden = true;
  }
  const ready = () => !!F.uid;

  // profil public : nom, photo, code ami, records (rien d'autre n'est visible par les amis)
  async function publish() {
    const pref = ref("profiles", F.uid);
    const snap = await F.fs.getDoc(pref);
    let code = snap.exists() ? snap.data().code : "";
    if (!code) code = await newCode();
    F.code = code;
    const m = me();
    await F.fs.setDoc(pref, { name: m.name, photo: m.photo || "", code, records: records(), at: Date.now() }, { merge: true });
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
    try { await F.fs.setDoc(ref("profiles", F.uid), { records: records(), name: me().name, photo: me().photo || "", at: Date.now() }, { merge: true }); } catch {}
  }

  /* ---------- en direct : demandes reçues et invitations ---------- */
  function listen() {
    const { onSnapshot, collection } = F.fs;
    F.unsub.push(onSnapshot(collection(F.fs.db, "requests", F.uid, "from"), (snap) => {
      F.requests = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      // pastille sur le bouton Amis : le nombre de demandes en attente
      $("friendsBadge").hidden = $("fTabBadge").hidden = !F.requests.length;
      $("friendsBadge").textContent = $("fTabBadge").textContent = F.requests.length > 9 ? "9+" : F.requests.length;
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
      notify(r.uid, "accepte", `${me().name} a accepté votre demande d'ami.`, "/?amis=1");
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
    $("frAv").replaceChildren(avatarEl(f.name, f.photo, true));
    const x = f.records || {};
    const short = (v) => (v >= 1000000 ? "1 M€" : v >= 1000 ? `${Math.round(v / 1000)} k€` : `${v} €`);
    $("frRecords").replaceChildren(...[["Solo", x.best2 || 0], ["Chrono", x.bestChrono || 0], ["Millionnaire", short(x.bestMillion || 0)]].map(([k, v]) => {
      const d = document.createElement("div"); d.className = "stat";
      const b = document.createElement("strong"); b.textContent = v;
      const s = document.createElement("span"); s.textContent = k;
      d.append(b, s); return d;
    }));
    showScreen("s-friend");
  }
  $("btnFrRemove").onclick = () => F.cur && remove(F.cur, () => showScreen("s-friends"));

  /* ---------- liste d'amis ---------- */
  async function loadFriends() {
    if (!ready()) return;
    const list = await F.fs.getDocs(F.fs.collection(F.fs.db, "friends", F.uid, "list"));
    const out = [];
    for (const d of list.docs) {
      try { const p = await F.fs.getDoc(ref("profiles", d.id)); if (p.exists()) out.push({ uid: d.id, ...p.data() }); } catch {}
    }
    F.friends = out.sort((a, b) => a.name.localeCompare(b.name));
    render();
  }

  /* ---------- affichage dans le Profil ---------- */
  function row(person, buttons) {
    const r = document.createElement("div"); r.className = "frow";
    const nm = document.createElement("span"); nm.className = "fname"; nm.textContent = person.name;
    r.append(avatarEl(person.name, person.photo), nm, ...buttons);
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
    $("friendList").replaceChildren(...(F.friends.length ? F.friends.map((f) => {
      const go = document.createElement("span"); go.className = "chev"; go.textContent = "›";
      const r = row(f, [go]);
      r.classList.add("tap"); r.tabIndex = 0; r.setAttribute("role", "button");
      r.onclick = () => openFriend(f);
      const rec = document.createElement("span"); rec.className = "frec";
      const x = f.records || {};
      rec.textContent = `Solo ${x.best2 || 0} · Chrono ${x.bestChrono || 0} · ${euros(x.bestMillion || 0)}`;
      r.querySelector(".fname").append(rec);
      return r;
    }) : [Object.assign(document.createElement("p"), { className: "lead small", textContent: "Pas encore d'amis." }), btn("Ajouter un ami", "sun", () => setPanel("add"))]));
    if (!F.panel) setPanel(F.friends.length || (F.requests || []).length ? "mine" : "add"); // premier affichage : le bon onglet
    renderRanking();
    renderRequests();
  }
  // classement entre amis : vous + vos amis, mode par mode
  const TABS = [["best2", "Solo"], ["bestChrono", "Chrono"], ["bestMillion", "Millionnaire"]];
  function renderRanking() {
    $("rankTabs").replaceChildren(...TABS.map(([k, label]) => {
      const c = document.createElement("button"); c.className = "chip"; c.textContent = label;
      c.setAttribute("aria-pressed", F.tab === k);
      c.onclick = () => { F.tab = k; renderRanking(); };
      return c;
    }));
    const people = [{ ...me(), uid: F.uid, records: records(), you: true }, ...F.friends];
    const k = F.tab, fmt = (v) => (k === "bestMillion" ? euros(v || 0) : `${v || 0} pts`);
    const sorted = people.sort((a, b) => ((b.records || {})[k] || 0) - ((a.records || {})[k] || 0));
    $("rankList").replaceChildren(...sorted.map((p, i) => {
      const li = document.createElement("li"); li.className = "rk" + (i === 0 ? " first" : "");
      const pos = document.createElement("span"); pos.className = "pos"; pos.textContent = i + 1;
      const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = p.you ? `${p.name} (vous)` : p.name;
      const st = document.createElement("span"); st.className = "st"; st.textContent = fmt((p.records || {})[k]);
      li.append(pos, avatarEl(p.name, p.photo), nm, st);
      return li;
    }));
    $("rankList").hidden = !F.friends.length; $("rankTabs").hidden = !F.friends.length;
    $("rankEmpty").hidden = !!F.friends.length;
  }

  /* ---------- la cloche : vos notifications (amis, invitations, annonces) ---------- */
  // envoie une notification : sur tous les appareils de l'ami (push) et dans sa cloche
  async function notify(to, type, text, url) {
    sendPush(to, text, url);
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
      const hid = hiddenAnn();
      F.ann = snap.docs.map((d) => ({ id: d.id, type: "annonce", name: "Quizly", ...d.data() })).filter((a) => !hid.includes(a.id)); // annonces masquées sur cet appareil
      merge();
    }, () => {}));
  }
  const hidKey = () => `quizly:${F.uid}:annHidden`;
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
      t.textContent = n.text;
      const w = document.createElement("span"); w.className = "frec"; w.textContent = ago(n.at); t.append(w);
      const act = n.type === "invite" ? btn("Rejoindre", "sun", () => { const c = (String(n.url).match(/tv=([A-Z0-9]+)/) || [])[1]; if (c) joinRoom(c); })
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
        try {
          const m = me();
          await F.fs.setDoc(ref("invites", f.uid, "list", F.uid), { code: room.code, kind: room.kind, name: m.name, photo: m.photo || "", at: Date.now() });
          notify(f.uid, "invite", `${m.name} vous invite à jouer${KIND[room.kind] ? ` (${KIND[room.kind]})` : ""}.`, `/?tv=${room.code}`); // un appui rejoint le salon
          b.textContent = "Invité";
        } catch { b.disabled = false; b.textContent = "Réessayer"; }
      });
      return row(f, [b]);
    }) : [Object.assign(document.createElement("p"), { className: "lead small", textContent: "Ajoutez des amis depuis votre Profil pour les inviter." })]));
  }
  const KIND = { survie: "Survie", chrono: "Chrono 60 s", million: "Qui veut gagner des millions", equipes: "Équipes" };
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

  return {
    start, stop, ready, render, syncRecords, addByCode, openInvites, renderNotifs,
    // annonce du développeur : gardée dans la cloche de tout le monde (Firestore) puis envoyée en notification
    async announce(text, key) {
      // 1) gardée dans la cloche de tout le monde (Firestore) ; 2) envoyée en notification (même si 1 échoue)
      let saved = false;
      if (ready()) try { await F.fs.addDoc(F.fs.collection(F.fs.db, "announces"), { text, at: Date.now() }); saved = true; } catch (e) { console.warn("Annonce non gardée :", e.message); }
      let sent = 0, ok = false;
      try {
        const r = await fetch("/api/push/broadcast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, body: text }) });
        ok = r.ok; sent = (await r.json()).sent || 0;
      } catch {}
      return { saved, sent, ok };
    },
    hideInvitePanel: () => ($("invitePanel").hidden = true),
    refresh: () => (ready() ? loadFriends() : render())
  };
}

// « https://…/?ami=ABC123 » → « ABC123 »
export function friendCodeFrom(text) {
  const m = String(text || "").match(/[?&]ami=([A-Z0-9]{6})/i);
  return m ? m[1].toUpperCase() : null;
}
