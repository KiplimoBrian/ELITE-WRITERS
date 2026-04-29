// scripts.js

// Theme Toggle
const toggleBtn = document.getElementById("themeToggle");
const body = document.body;

if (toggleBtn) {
  // Load saved theme
  if (localStorage.getItem("theme") === "dark") {
    body.classList.add("dark");
    toggleBtn.textContent = "☀️";
  } else {
    toggleBtn.textContent = "🌙";
  }

  // Toggle theme on click
  toggleBtn.addEventListener("click", () => {
    body.classList.toggle("dark");
    const isDark = body.classList.contains("dark");
    toggleBtn.textContent = isDark ? "☀️" : "🌙";
    localStorage.setItem("theme", isDark ? "dark" : "light");
  });
}

// Mobile Menu Toggle
const hamburgerBtn = document.getElementById("hamburgerBtn");
const closeBtn = document.getElementById("closeBtn");
const mobileMenu = document.getElementById("mobileMenu");

if (hamburgerBtn && closeBtn && mobileMenu) {
  hamburgerBtn.addEventListener("click", () => {
    mobileMenu.classList.add("active");
  });

  closeBtn.addEventListener("click", () => {
    mobileMenu.classList.remove("active");
  });

  // Close menu when clicking a link inside it
  mobileMenu.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      mobileMenu.classList.remove("active");
    });
  });
}

// Device Detection: Show appropriate content (Desktop vs Mobile)
function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function setupDeviceContent() {
  const desktopContent = document.getElementById("desktop-content");
  const mobileContent = document.getElementById("mobile-content");

  if (!desktopContent || !mobileContent) {
    console.warn("Missing desktop-content or mobile-content elements.");
    return;
  }

  if (isMobile()) {
    desktopContent.style.display = "none";
    mobileContent.style.display = "block";
  } else {
    desktopContent.style.display = "block";
    mobileContent.style.display = "none";
  }
}

// Run on page load
document.addEventListener("DOMContentLoaded", setupDeviceContent);