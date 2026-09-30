// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDJzyZdd-X9RG2DDnsLpZR8ifCf85N6lRE",
  authDomain: "quizly-ca5c1.firebaseapp.com",
  projectId: "quizly-ca5c1",
  storageBucket: "quizly-ca5c1.firebasestorage.app",
  messagingSenderId: "553958488595",
  appId: "1:553958488595:web:438e99694e0af8c2525de6",
  measurementId: "G-63ZBBBP6BT"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
