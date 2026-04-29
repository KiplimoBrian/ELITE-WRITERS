// public/js/register.js
import { auth, db } from "./firebase-init.js";

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const form = document.getElementById("registerForm");
const submitBtn = document.getElementById("submitBtn");
const formStatus = document.getElementById("formStatus");
const googleBtn = document.getElementById("googleRegisterBtn");

const PAY_PAGE = "payment-confirmation.html";

function showStatus(html) {
  if (!formStatus) return;
  formStatus.style.display = "block";
  formStatus.innerHTML = html;
}

function safeVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

function isValidKenyanPhone(phone) {
  return /^0[71][0-9]{8}$/.test(phone);
}

async function ensureUserProfile(user) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    await setDoc(userRef, {
      fullName: user.displayName || "",
      email: (user.email || "").toLowerCase(),
      phone: "",
      expertise: "",
      samples: "",
      paymentStatus: "unpaid",
      accountState: "active",
      createdAt: serverTimestamp()
    });
  }
}

/* ---------------------------
   UI Loading Helpers
---------------------------- */
function setBtnLoading(isLoading) {
  if (!submitBtn) return;
  if (isLoading) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner"></span>Creating account...`;
  } else {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Account";
  }
}

function setGoogleLoading(isLoading) {
  if (!googleBtn) return;
  googleBtn.disabled = isLoading;
  googleBtn.textContent = isLoading ? "Signing in..." : "Continue with Google";
}

// Ensure correct initial label on load
if (googleBtn) {
  googleBtn.disabled = false;
  googleBtn.textContent = "Continue with Google";
}

/* ---------------------------
   Redirect-result handler
   (only runs after signInWithRedirect)
---------------------------- */
(async function handleGoogleRedirectResult() {
  try {
    const res = await getRedirectResult(auth);
    if (res?.user) {
      showStatus(`
        <p style="color: var(--primary); font-size: 1.1rem; font-weight: 700;">
          Signed in ✅ Redirecting...
        </p>
      `);
      await ensureUserProfile(res.user);
      window.location.href = PAY_PAGE;
    }
  } catch (err) {
    console.error("getRedirectResult error:", err);
  }
})();

/* ---------------------------
   If already logged in
---------------------------- */
onAuthStateChanged(auth, (user) => {
  if (user) window.location.href = PAY_PAGE;
});

/* ===========================
   GOOGLE REGISTER
=========================== */
if (googleBtn) {
  googleBtn.addEventListener("click", async () => {
    console.log("Google button clicked ✅");

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    try {
      setGoogleLoading(true);

      // Popup first
      const result = await signInWithPopup(auth, provider);
      await ensureUserProfile(result.user);

      showStatus(`
        <p style="color: var(--primary); font-size: 1.2rem; font-weight: 700;">
          Signed in with Google ✅
        </p>
        <p>Redirecting to payment...</p>
      `);

      window.location.href = PAY_PAGE;

    } catch (err) {
      console.error("Google popup failed:", err);

      const code = err?.code || "";
      const popupIssues = [
        "auth/popup-blocked",
        "auth/popup-closed-by-user",
        "auth/cancelled-popup-request"
      ];

      // Popup blocked/closed -> redirect fallback
      if (popupIssues.includes(code)) {
        try {
          await signInWithRedirect(auth, provider);
          return; // page will redirect
        } catch (e2) {
          console.error("Google redirect failed:", e2);
        }
      }

      if (code === "auth/unauthorized-domain") {
        alert("Google sign-in blocked: add your domain in Firebase Auth > Settings > Authorized domains.");
      } else {
        alert(err?.message || "Google sign-in failed. Try again.");
      }

      setGoogleLoading(false);
    }
  });
}

/* ===========================
   EMAIL/PASSWORD REGISTER
=========================== */
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fullName = safeVal("fullName");
    const email = safeVal("email").toLowerCase();
    const phone = safeVal("phone");
    const password = document.getElementById("password")?.value || "";

    // These may not exist in HTML anymore; safe reads:
    const expertise = safeVal("expertise");
    const samples = safeVal("samples");

    if (!isValidKenyanPhone(phone)) {
      alert("Please enter a valid Kenyan phone number (07XXXXXXXX or 01XXXXXXXX).");
      return;
    }

    setBtnLoading(true);

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      await setDoc(doc(db, "users", cred.user.uid), {
        fullName,
        email,
        phone,
        expertise: expertise || "",
        samples: samples || "",
        paymentStatus: "unpaid",
        accountState: "active",
        createdAt: serverTimestamp()
      });

      showStatus(`
        <p style="color: var(--primary); font-size: 1.2rem; font-weight: 700;">
          Account created ✅
        </p>
        <p>Redirecting to payment...</p>
      `);

      window.location.href = PAY_PAGE;

    } catch (err) {
      console.error(err);
      alert(err?.message || "Registration failed.");
      setBtnLoading(false);
      if (formStatus) formStatus.style.display = "none";
    }
  });
}
