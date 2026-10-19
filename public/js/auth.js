import { firebaseConfig } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider,
  signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

let auth = null, app = null;
try { if (firebaseConfig && firebaseConfig.apiKey) { app = initializeApp(firebaseConfig); auth = getAuth(app); } }
catch (e) { console.error("Firebase :", e); }
export const firebaseApp = () => app;
// compte Google connecté en ce moment (null pour un compte local)
export const googleUid = () => (auth && auth.currentUser ? auth.currentUser.uid : null);
const configured = Boolean(auth);


export function watch(cb) {
  if (!configured) return cb(null);
  onAuthStateChanged(auth, cb);
}

export function signIn() {
  if (!configured) {
    return Promise.reject(new Error("Connexion indisponible : renseignez js/config.js (voir README)."));
  }
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export const logout = () => (configured ? signOut(auth) : Promise.resolve());
