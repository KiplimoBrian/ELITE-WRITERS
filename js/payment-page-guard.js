// public/js/payment-page-guard.js
(function () {
  function hideDashboard() {
    const root = document.getElementById("navbar") || document;

    // Look for any anchor/button that is the Dashboard button
    const candidates = root.querySelectorAll("a, button");

    candidates.forEach((el) => {
      const text = (el.textContent || "").trim().toLowerCase();
      const href = (el.getAttribute && el.getAttribute("href")) ? el.getAttribute("href") : "";

      const isDashboardByText = text === "dashboard";
      const isDashboardByHref =
        href === "dashboard.html" ||
        href === "/dashboard.html" ||
        href.includes("dashboard.html");

      if (isDashboardByText || isDashboardByHref) {
        // Hide it completely (strongest UX)
        el.style.display = "none";
      }
    });
  }

  // Run a few times because navbar + nav-auth-toggle can re-render or update UI
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    hideDashboard();
    if (tries >= 20) clearInterval(timer); // ~3 seconds max
  }, 150);

  // Also run once after load
  window.addEventListener("load", hideDashboard);
})();
