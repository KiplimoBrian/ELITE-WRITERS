// js/admin-auth.js
import { auth } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const ADMIN_EMAILS = [
  "kiplagatcollins18@gmail.com",
  "kuruikiplimo254@gmail.com"
];

export function requireAdminOrRedirect(loginPage = "admin-login.html") {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();

      if (!user) {
        window.location.href = "admin-login.html";
        return;
      }

      const email = (user.email || "").toLowerCase();
      const allowed = ADMIN_EMAILS.includes(email);

      if (!allowed) {
        alert("Access denied: Admin only.");
        signOut(auth).finally(() => {
         window.location.href = "admin-login.html";
        });
        return;
      }

      resolve(user);
    });
  });
}

export async function adminLogout(redirectTo = "admin-login.html") {
  await signOut(auth);
  window.location.href = redirectTo;
}
