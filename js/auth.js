// js/auth.js
import { auth, db } from "./firebase-init.js";
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/**
 * Configuration
 * ✅ Paid users -> dashboard
 * ✅ Unpaid users -> payment-confirmation (registration fee confirmation page)
 */
const REDIRECT_URL_PAID = "dashboard.html";
const REDIRECT_URL_UNPAID = "payment-confirmation.html"; // ✅ CHANGED from payment.html
const DEFAULT_PERSISTENCE = "local"; // "local" or "session"

/**
 * Change this if you use a different value like "verified"
 */
const PAID_VALUE = "paid";

function friendlyAuthError(err) {
  const code = err?.code || "";
  switch (code) {
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/missing-password":
      return "Please enter your password.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact support.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your internet connection and try again.";
    default:
      return err?.message || "Login failed. Please try again.";
  }
}

function ensureInlineMessageEl() {
  let el = document.getElementById("authMessage");
  if (!el) {
    el = document.createElement("div");
    el.id = "authMessage";
    el.style.marginTop = "16px";
    el.style.fontSize = "0.98rem";
    el.style.textAlign = "center";
    el.style.padding = "10px 12px";
    el.style.borderRadius = "10px";
    el.style.display = "none";

    const form = document.getElementById("loginForm");
    if (form) form.appendChild(el);
  }
  return el;
}

function showMessage(text, type = "info") {
  const el = ensureInlineMessageEl();
  if (!el) return;

  el.textContent = text;
  el.style.display = "block";

  if (type === "error") {
    el.style.color = "crimson";
    el.style.background = "rgba(220, 20, 60, 0.08)";
    el.style.border = "1px solid rgba(220, 20, 60, 0.25)";
  } else if (type === "success") {
    el.style.color = "seagreen";
    el.style.background = "rgba(46, 139, 87, 0.10)";
    el.style.border = "1px solid rgba(46, 139, 87, 0.25)";
  } else {
    el.style.color = "var(--text, #111)";
    el.style.background = "rgba(0,0,0,0.05)";
    el.style.border = "1px solid rgba(0,0,0,0.08)";
  }
}

async function applyPersistence(mode = DEFAULT_PERSISTENCE) {
  const persistence =
    mode === "session" ? browserSessionPersistence : browserLocalPersistence;
  await setPersistence(auth, persistence);
}

function setButtonLoading(isLoading) {
  const btn = document.querySelector('#loginForm button[type="submit"]');
  if (!btn) return;
  btn.disabled = isLoading;
  btn.style.opacity = isLoading ? "0.8" : "1";
  btn.textContent = isLoading ? "Logging in..." : "Log In";
}

/**
 * Reads user's paymentStatus from Firestore:
 * users/{uid}.paymentStatus
 */
async function getPaymentStatus(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return "pending";
    return snap.data()?.paymentStatus || "pending";
  } catch (e) {
    // If we fail to read (rules/network), treat as unpaid
    return "pending";
  }
}

function redirectByPaymentStatus(paymentStatus) {
  const target = paymentStatus === PAID_VALUE ? REDIRECT_URL_PAID : REDIRECT_URL_UNPAID;
  window.location.href = target;
}

async function handleLoginSubmit(e) {
  e.preventDefault();

  const emailEl = document.getElementById("email");
  const passEl = document.getElementById("password");
  const email = (emailEl?.value || "").trim();
  const password = passEl?.value || "";

  if (!email || !password) {
    showMessage("Please enter your email and password.", "error");
    return;
  }

  try {
    setButtonLoading(true);
    showMessage("Signing you in...", "info");

    // keep user logged in
    await applyPersistence(DEFAULT_PERSISTENCE);

    const cred = await signInWithEmailAndPassword(auth, email, password);

    // Gate by payment status
    showMessage("Checking payment status...", "info");
    const paymentStatus = await getPaymentStatus(cred.user.uid);

    if (paymentStatus === PAID_VALUE) {
      showMessage(`Welcome back, ${cred.user.email}! Redirecting...`, "success");
    } else {
      showMessage("Registration payment required. Redirecting...", "info");
    }

    setTimeout(() => {
      redirectByPaymentStatus(paymentStatus);
    }, 600);
  } catch (err) {
    showMessage(friendlyAuthError(err), "error");
  } finally {
    setButtonLoading(false);
  }
}

async function handleForgotPasswordClick(e) {
  e.preventDefault();

  const email = (document.getElementById("email")?.value || "").trim();
  if (!email) {
    showMessage("Enter your email above first, then click “Forgot password?”.", "error");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    showMessage("Password reset email sent. Check your inbox/spam.", "success");
  } catch (err) {
    showMessage(friendlyAuthError(err), "error");
  }
}

function bind() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", handleLoginSubmit);

  const forgotLink = document.querySelector(".forgot-password a");
  if (forgotLink) forgotLink.addEventListener("click", handleForgotPasswordClick);

  // If already logged in and on login.html, redirect based on payment status
  onAuthStateChanged(auth, async (user) => {
    const isLoginPage = window.location.pathname.toLowerCase().endsWith("login.html");
    if (!isLoginPage) return;

    if (user) {
      showMessage("Checking payment status...", "info");
      const paymentStatus = await getPaymentStatus(user.uid);
      redirectByPaymentStatus(paymentStatus);
    }
  });
}

document.addEventListener("DOMContentLoaded", bind);

/**
 * ✅ Used by other pages to protect access
 * - Redirects to login if not signed in
 * - If signed in but NOT paid, redirects to payment-confirmation page
 */
export async function requireUserOrRedirect(
  loginPage = "login.html",
  paymentPage = "payment-confirmation.html" // ✅ CHANGED from payment.html
) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = loginPage;
        return;
      }

      const paymentStatus = await getPaymentStatus(user.uid);
      if (paymentStatus !== PAID_VALUE) {
        window.location.href = paymentPage;
        return;
      }

      resolve(user);
    });
  });
}