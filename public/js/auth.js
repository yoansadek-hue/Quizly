import { firebaseConfig } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, OAuthProvider,
  signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const configured = Boolean(firebaseConfig.apiKey);
const auth = configured ? getAuth(initializeApp(firebaseConfig)) : null;

export const authReady = configured;

export function watch(cb) {
  if (!configured) return cb(null);
  onAuthStateChanged(auth, cb);
}

export function signIn(kind) {
  if (!configured) {
    return Promise.reject(new Error("Connexion indisponible : renseignez js/config.js (voir README)."));
  }
  let provider;
  if (kind === "apple") {
    provider = new OAuthProvider("apple.com");
    provider.addScope("name");
    provider.addScope("email");
  } else {
    provider = new GoogleAuthProvider();
  }
  return signInWithPopup(auth, provider);
}

export const logout = () => (configured ? signOut(auth) : Promise.resolve());
