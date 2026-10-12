// Lecteur de QR code dans l'appli (pour rejoindre le salon de la télé).
// Utilise le détecteur intégré au téléphone s'il existe (Android), sinon la petite bibliothèque jsQR (iPhone).
let stream = null, timer = null;

function loadJsQR() {
  return new Promise((done) => {
    if (window.jsQR) return done();
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
    s.onload = done; s.onerror = done;
    document.head.append(s);
  });
}

export async function startScan(video, onCode, onError) {
  stopScan();
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }); }
  catch { return onError("Impossible d'ouvrir la caméra. Autorisez l'accès à la caméra pour Quizly, puis réessayez."); }
  video.srcObject = stream;
  await video.play().catch(() => {});
  let detect = null;
  if ("BarcodeDetector" in window) {
    try {
      const bd = new window.BarcodeDetector({ formats: ["qr_code"] });
      detect = async () => { const r = await bd.detect(video); return r[0] && r[0].rawValue; };
    } catch { detect = null; }
  }
  if (!detect) {
    await loadJsQR();
    if (!window.jsQR) { stopScan(); return onError("Le lecteur de QR code n'a pas pu se charger. Vérifiez votre connexion."); }
    const c = document.createElement("canvas"), ctx = c.getContext("2d", { willReadFrequently: true });
    detect = async () => {
      const w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) return null;
      const k = Math.min(1, 640 / w); // image réduite : plus rapide
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      ctx.drawImage(video, 0, 0, c.width, c.height);
      const r = window.jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
      return r && r.data;
    };
  }
  const loop = async () => {
    if (!stream) return;
    let v = null;
    try { v = await detect(); } catch {}
    if (v) return onCode(v); // c'est à l'appelant d'arrêter ou de relancer
    timer = setTimeout(loop, 250);
  };
  loop();
}
export function resumeScan(video, onCode, onError) { return startScan(video, onCode, onError); }
export function stopScan() {
  clearTimeout(timer); timer = null;
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
}
// « https://…/?tv=ABCDEFGH » → « ABCDEFGH »
export function tvCodeFrom(text) {
  const m = String(text || "").match(/[?&]tv=([A-Z0-9]{4,12})/i);
  return m ? m[1].toUpperCase() : null;
}
