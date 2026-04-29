// /js/nav-auth-toggle.js
import { auth, db } from "/js/firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function show(id, yes) {
  const el = document.getElementById(id);
  if (el) el.style.display = yes ? "" : "none";
}

function bindLogoutOnce() {
  const btn = document.getElementById("navLogoutBtn");
  if (!btn) return;
  if (btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      await signOut(auth);
      window.location.href = "/index.html";
    } catch (error) {
      console.error("Logout failed:", error);
      alert("Failed to log out. Please try again.");
    }
  });
}

function bindProfileOnce() {
  const btn = document.getElementById("navProfileBtn");
  if (!btn) return;
  if (btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const modal = document.getElementById("profileModal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
    } else {
      window.location.href = "/dashboard.html";
    }
  });
}

async function isPaymentConfirmed(user) {
  if (!user) return false;

  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) return false;

    const userData = userSnap.data() || {};

    return (
      userData.paymentStatus === "paid" ||
      userData.paymentStatus === "confirmed" ||
      userData.accountStatus === "active" ||
      userData.isPaid === true
    );
  } catch (error) {
    console.error("Error checking payment status:", error);
    return false;
  }
}

onAuthStateChanged(auth, async (user) => {
  const loggedIn = !!user;

  // default hide everything first
  show("navLoginBtn", false);
  show("navRegisterBtn", false);
  show("navDashboardBtn", false);
  show("navLogoutBtn", false);
  show("navProfileBtn", false);

  // hero CTA
  show("heroGetStartedBtn", !loggedIn);

  if (!loggedIn) {
    show("navLoginBtn", true);
    show("navRegisterBtn", true);

    bindLogoutOnce();
    bindProfileOnce();
    return;
  }

  const paymentConfirmed = await isPaymentConfirmed(user);

  if (paymentConfirmed) {
    show("navDashboardBtn", true);
    show("navProfileBtn", true);
  } else {
    show("navLogoutBtn", true);
  }

  bindLogoutOnce();
  bindProfileOnce();
});