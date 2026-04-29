import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const ALLOW_UNPAID_PAGES = new Set([
  "index.html",
  "login.html",
  "register.html",
  "payment-confirmation.html"
]);

function pageName() {
  const p = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  return p;
}

async function hasPaidAccess(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return false;

  const u = snap.data();
  // Change "paid" to "verified" if you decide to use that instead
  return u.paymentStatus === "paid";
}

onAuthStateChanged(auth, async (user) => {
  const page = pageName();

  // Not logged in: protect non-public pages
  if (!user) {
    if (!ALLOW_UNPAID_PAGES.has(page)) {
      window.location.replace("login.html");
    }
    return;
  }

  // Logged in: allow access to payment/login/register pages
  if (ALLOW_UNPAID_PAGES.has(page)) return;

  // Logged in but not paid: force payment page
  const ok = await hasPaidAccess(user.uid);
  if (!ok) {
    window.location.replace("payment-confirmation.html");
  }
});