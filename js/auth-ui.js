import { auth } from "./firebase-init.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

function show(id, visible) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = visible ? "" : "none";
}

function bindLogoutOnce() {
  const btn = document.getElementById("navLogoutBtn");
  if (!btn) return;

  // prevent double-binding if script loads twice
  if (btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      await signOut(auth);
      window.location.href = "/index.html";
    } catch (err) {
      console.error("Logout failed:", err);
    }
  });
}

onAuthStateChanged(auth, (user) => {
  const loggedIn = !!user;

  show("navLoginBtn", !loggedIn);
  show("navRegisterBtn", !loggedIn);

  show("navDashboardBtn", loggedIn);
  show("navLogoutBtn", loggedIn);

  // Navbar is injected, so bind logout after it exists
  bindLogoutOnce();
});

// Also try binding immediately (in case navbar already exists)
bindLogoutOnce();