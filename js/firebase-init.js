// /js/firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js";


export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// ✅ Safe analytics
export let analytics = null;
isSupported().then((ok) => {
  if (ok) analytics = getAnalytics(app);
});
