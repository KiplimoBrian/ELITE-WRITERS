import { auth } from "./firebase-init.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { requireAdminOrRedirect } from "./admin-auth.js";

const form = document.getElementById("adminLoginForm");
const statusEl = document.getElementById("status");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value;

  try {
    statusEl.textContent = "Signing in...";
    await signInWithEmailAndPassword(auth, email, password);

    // block non-admins
    await requireAdminOrRedirect("admin-login.html");

    // go to admin dashboard
    window.location.href = "admin-dashboard.html";
  } catch (err) {
    console.error(err);
    statusEl.textContent = "";
    alert(err?.message || "Login failed");
  }
});
