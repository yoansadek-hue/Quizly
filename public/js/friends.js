// Amis : code ami, demandes, liste avec records, classement entre amis, invitations à un salon.
// Tout passe par Firestore (voir les règles dans le message de la 2.10). Il faut être connecté au cloud.
import { cloudFs } from "./cloud.js";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans I, O, 0, 1 : pas de confusion à la lecture
const INVITE_TTL = 10 * 60 * 1000; // une invitation de plus de 10 minutes est ignorée

export function initFriends({ $, ask, avatarEl, euros, me, records, joinRoom, roomInfo }) {
  const F = { uid: null, fs: null, code: "", friends: [], unsub: [], tab: "best2", inv: null };
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
      await loadFriends();
      return true;
    } catch (e) { console.warn("Amis indisponibles :", e.message); stop(); return false; }
  }
  function stop() { F.unsub.forEach((u) => { try { u(); } catch {} }); F.unsub = []; F.uid = null; F.fs = null; F.friends = []; }
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
      $("btnUser").classList.toggle("badge", F.requests.length > 0); // pastille sur le bouton Profil
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
      say("Demande envoyée. Elle apparaîtra dans son Profil.");
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
  function remove(f) {
    ask(`Retirer ${f.name} de vos amis ?`, "Vous ne verrez plus ses records et ne pourrez plus l'inviter.", "Retirer", async () => {
      try {
        await F.fs.deleteDoc(ref("friends", F.uid, "list", f.uid));
        await F.fs.deleteDoc(ref("friends", f.uid, "list", F.uid));
      } catch {}
      await loadFriends();
    });
  }

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
      const r = row(f, [btn("Retirer", "ghost", () => remove(f))]);
      const rec = document.createElement("span"); rec.className = "frec";
      const x = f.records || {};
      rec.textContent = `Solo ${x.best2 || 0} · Chrono ${x.bestChrono || 0} · ${euros(x.bestMillion || 0)}`;
      r.querySelector(".fname").append(rec);
      return r;
    }) : [Object.assign(document.createElement("p"), { className: "lead small", textContent: "Pas encore d'amis : partagez votre code ou faites scanner votre QR code." })]));
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
    $("rankBox").hidden = !F.friends.length;
  }

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
    start, stop, ready, render, syncRecords, addByCode, openInvites,
    hideInvitePanel: () => ($("invitePanel").hidden = true),
    refresh: () => (ready() ? loadFriends() : render())
  };
}

// « https://…/?ami=ABC123 » → « ABC123 »
export function friendCodeFrom(text) {
  const m = String(text || "").match(/[?&]ami=([A-Z0-9]{6})/i);
  return m ? m[1].toUpperCase() : null;
}
