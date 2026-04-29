// /js/nav-paid-lock.js
import { auth, db } from "/js/firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const PAID_VALUE = "paid";
const REDIRECT_UNPAID_TO = "/payment-confirmation.html"; // registration payment confirmation

function lockLink(el, message) {
  if (!el) return;

  // visually show it's disabled (minimal + safe)
  el.style.pointerEvents = "none";
  el.style.opacity = "0.55";
  el.style.cursor = "not-allowed";

  // prevent keyboard navigation too
  el.setAttribute("aria-disabled", "true");
  el.setAttribute("tabindex", "-1");

  // If user somehow clicks fast before pointerEvents applies (rare), still block
  if (el.dataset.lockBound === "1") return;
  el.dataset.lockBound = "1";
  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    alert(message);
    window.location.href = REDIRECT_UNPAID_TO;
  });
}

function unlockLink(el) {
  if (!el) return;
  el.style.pointerEvents = "";
  el.style.opacity = "";
  el.style.cursor = "";
  el.removeAttribute("aria-disabled");
  el.removeAttribute("tabindex");
}

async function getPaymentStatus(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return "pending";
    return snap.data()?.paymentStatus || "pending";
  } catch {
    return "pending";
  }
}

const jobsLink = document.getElementById("navJobsLink");
const paymentsLink = document.getElementById("navPaymentsLink");

onAuthStateChanged(auth, async (user) => {
  // If not logged in, keep links normal (public marketing)
  if (!user) {
    unlockLink(jobsLink);
    unlockLink(paymentsLink);
    return;
  }

  // Logged in: lock if not paid
  const status = await getPaymentStatus(user.uid);
  const isPaid = status === PAID_VALUE;

  if (isPaid) {
    unlockLink(jobsLink);
    unlockLink(paymentsLink);
  } else {
    lockLink(jobsLink, "Please complete the registration payment to access Jobs.");
    lockLink(paymentsLink, "Please complete the registration payment to access Payments.");
  }
});