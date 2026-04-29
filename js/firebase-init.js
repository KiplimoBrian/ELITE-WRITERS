// /js/firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyBnLUtXtdGZAnlljfX3XDuwPTicAhy9gQY",
  authDomain: "elite-writers.firebaseapp.com",
  projectId: "elite-writers",
  storageBucket: "elite-writers.firebasestorage.app",
  messagingSenderId: "863732973548",
  appId: "1:863732973548:web:0180a26983b92c16920ac9",
  measurementId: "G-3F8E52YG9V"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// ✅ Safe analytics
export let analytics = null;
isSupported().then((ok) => {
  if (ok) analytics = getAnalytics(app);
});