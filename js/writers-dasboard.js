// js/writer-dashboard.js
// Writers Dashboard for Elite Writers
// - Lists available jobs
// - Lets a signed-in writer apply to a job
// - Shows "My Applications"
// - Shows jobs assigned to the writer
// This file is designed to match your admin-dashboard.js schema exactly:
// jobs fields: title, words, pay, deadline(Timestamp), status("open"/"assigned"), isAvailable(boolean),
//              assignedWriterId(null or uid), assignedAt, createdAt, jobDocId
// applications fields: jobDocId, userId, status, appliedAt, decidedAt

import { app } from "./firebase-init.js";
import { requireWriterOrRedirect, writerLogout } from "./writer-auth.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  doc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const db = getFirestore(app);
const auth = getAuth(app);

console.log("writer-dashboard.js loaded");

// Protect page (redirect to writer login if not signed in / not writer)
await requireWriterOrRedirect("writer-login.html");

// Logout
document.getElementById("logoutBtn")?.addEventListener("click", () => writerLogout());

// Elements (create these IDs in writer-dashboard.html)
const jobsList = document.getElementById("jobsList"); // available jobs table
const myAppsList = document.getElementById("myAppsList"); // my applications table
const myAssignedJobsList = document.getElementById("myAssignedJobsList"); // my assigned jobs table
const writerStatus = document.getElementById("writerStatus"); // small status text

if (!jobsList) console.warn("Missing element id='jobsList' in writer-dashboard.html");
if (!myAppsList) console.warn("Missing element id='myAppsList' in writer-dashboard.html");
if (!myAssignedJobsList) console.warn("Missing element id='myAssignedJobsList' in writer-dashboard.html");
if (!writerStatus) console.warn("Missing element id='writerStatus' (no status text will show)");

function setStatus(msg = "") {
  if (writerStatus) writerStatus.textContent = msg;
}

function safeText(v) {
  return (v ?? "").toString();
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Convert Firestore Timestamp/date-ish to readable
function formatDate(ts) {
  try {
    if (!ts) return "-";
    // Timestamp has toDate()
    if (typeof ts.toDate === "function") {
      return ts.toDate().toLocaleString();
    }
    // fallback: Date
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString();
  } catch {
    return "-";
  }
}
function renderAttachmentsCell(job) {
  const atts = Array.isArray(job?.attachments) ? job.attachments : [];
  if (atts.length === 0) return `<span style="color:var(--gray);font-size:12px;">No files</span>`;

  // show links (use stored url)
  return atts
    .map((a, i) => {
      const name = safeText(a?.name || `File ${i + 1}`);
      const url = safeText(a?.url || "");
      if (!url) return `<span style="color:#b00;font-size:12px;">${name} (missing url)</span>`;
      return `<a href="${url}" target="_blank" rel="noopener" style="font-size:12px;">${name}</a>`;
    })
    .join("<br/>");
}
// ---------- AUTH / CURRENT USER ----------
let currentUser = null;

await new Promise((resolve) => {
  onAuthStateChanged(auth, (u) => {
    currentUser = u || null;
    resolve();
  });
});

if (!currentUser) {
  // requireWriterOrRedirect should have redirected, but just in case:
  window.location.href = "writer-login.html";
}

// ---------- LOADERS ----------
async function loadAvailableJobs() {
  if (!jobsList) return;
  jobsList.textContent = "Loading jobs...";

  // IMPORTANT:
  // We match your admin schema exactly:
  // status = "open"
  // isAvailable = true
  // assignedWriterId = null
  // You can relax these filters if you want, but this is the strict "available" definition.
  const q = query(
    collection(db, "jobs"),
    where("status", "==", "open"),
    where("isAvailable", "==", true),
    where("assignedWriterId", "==", null),
    orderBy("createdAt", "desc"),
    limit(50)
  );

  let snap;
  try {
    snap = await getDocs(q);
  } catch (err) {
    console.error("Failed to load available jobs:", err);

    // If you get: "The query requires an index"
    // Firestore will show a link to create the composite index in the console.
    jobsList.innerHTML = `<p style="color:#b00;">Failed to load jobs: ${safeText(err?.message || err)}</p>`;
    return;
  }

  if (snap.empty) {
    jobsList.innerHTML = "<p>No available jobs right now.</p>";
    return;
  }

  let html = `<table class="table">
    <thead>
      <tr>
        <th>Title</th>
        <th>Words</th>
        <th>Pay (KES)</th>
        <th>Deadline</th>
        <th>Status</th>
        <th>Files</th>
        <th>Action</th>
      </tr>
    </thead>
    <tbody>`;

  snap.forEach((d) => {
    const job = d.data();

    html += `<tr>
      <td>${safeText(job.title)}</td>
      <td>${safeNumber(job.words).toLocaleString()}</td>
      <td>${safeNumber(job.pay).toLocaleString()}</td>
      <td>${formatDate(job.deadline)}</td>
      <td>${safeText(job.status)}</td>
      <td>${renderAttachmentsCell(job)}</td>
      <td>
        <button class="btn-small apply-btn" data-jobdoc="${d.id}">
          Apply
        </button>
      </td>
    </tr>`;
  });

  html += `</tbody></table>`;
  jobsList.innerHTML = html;

  // Wire apply buttons
  document.querySelectorAll(".apply-btn").forEach((btn) => {
    btn.addEventListener("click", () => applyToJob(btn.dataset.jobdoc));
  });
}

async function loadMyApplications() {
  if (!myAppsList) return;
  myAppsList.textContent = "Loading applications...";

  const q = query(
    collection(db, "applications"),
    where("userId", "==", currentUser.uid),
    orderBy("appliedAt", "desc"),
    limit(100)
  );

  let snap;
  try {
    snap = await getDocs(q);
  } catch (err) {
    console.error("Failed to load my applications:", err);
    myAppsList.innerHTML = `<p style="color:#b00;">Failed to load applications: ${safeText(err?.message || err)}</p>`;
    return;
  }

  if (snap.empty) {
    myAppsList.innerHTML = "<p>No applications yet.</p>";
    return;
  }

  let html = `<table class="table">
    <thead>
      <tr>
        <th>Job Doc ID</th>
        <th>Status</th>
        <th>Applied At</th>
        <th>Decided At</th>
      </tr>
    </thead>
    <tbody>`;

  snap.forEach((d) => {
    const a = d.data();
    html += `<tr>
      <td style="font-size:12px;">${safeText(a.jobDocId)}</td>
      <td>${safeText(a.status)}</td>
      <td>${formatDate(a.appliedAt)}</td>
      <td>${formatDate(a.decidedAt)}</td>
    </tr>`;
  });

  html += `</tbody></table>`;
  myAppsList.innerHTML = html;
}

async function loadMyAssignedJobs() {
  if (!myAssignedJobsList) return;
  myAssignedJobsList.textContent = "Loading assigned jobs...";

  const q = query(
    collection(db, "jobs"),
    where("assignedWriterId", "==", currentUser.uid),
    orderBy("assignedAt", "desc"),
    limit(50)
  );

  let snap;
  try {
    snap = await getDocs(q);
  } catch (err) {
    console.error("Failed to load assigned jobs:", err);
    myAssignedJobsList.innerHTML = `<p style="color:#b00;">Failed to load assigned jobs: ${safeText(err?.message || err)}</p>`;
    return;
  }

  if (snap.empty) {
    myAssignedJobsList.innerHTML = "<p>No jobs assigned to you yet.</p>";
    return;
  }

  let html = `<table class="table">
    <thead>
      <tr>
        <th>Title</th>
        <th>Pay</th>
        <th>Status</th>
        <th>Assigned At</th>
        <th>Deadline</th>
      </tr>
    </thead>
    <tbody>`;

  snap.forEach((d) => {
    const job = d.data();
    html += `<tr>
      <td>${safeText(job.title)}</td>
      <td>${safeNumber(job.pay).toLocaleString()}</td>
      <td>${safeText(job.status)}</td>
      <td>${formatDate(job.assignedAt)}</td>
      <td>${formatDate(job.deadline)}</td>
    </tr>`;
  });

  html += `</tbody></table>`;
  myAssignedJobsList.innerHTML = html;
}

// ---------- APPLY ----------
async function applyToJob(jobDocId) {
  if (!jobDocId) return;

  setStatus("Applying...");

  try {
    // Optional: prevent duplicate applications by same user for same job.
    // This is client-side only; for real prevention you should enforce it in rules or with a Cloud Function.
    const dupQ = query(
      collection(db, "applications"),
      where("jobDocId", "==", jobDocId),
      where("userId", "==", currentUser.uid),
      limit(1)
    );

    const dupSnap = await getDocs(dupQ);
    if (!dupSnap.empty) {
      setStatus("");
      alert("You already applied for this job.");
      return;
    }

    // Ensure the job still exists and is open
    const jobRef = doc(db, "jobs", jobDocId);
    const jobSnap = await getDoc(jobRef);
    if (!jobSnap.exists()) {
      setStatus("");
      alert("This job no longer exists.");
      await loadAvailableJobs();
      return;
    }

    const job = jobSnap.data();

    // Match your admin posting logic
    const isOpen = job?.status === "open" && job?.isAvailable === true && job?.assignedWriterId == null;
    if (!isOpen) {
      setStatus("");
      alert("This job is no longer available.");
      await loadAvailableJobs();
      return;
    }

    // Create application
    await addDoc(collection(db, "applications"), {
      jobDocId,
      userId: currentUser.uid,
      status: "pending",
      appliedAt: serverTimestamp()
    });

    setStatus("");
    alert("✅ Application submitted.");
    await loadMyApplications();
    await loadAvailableJobs();
  } catch (err) {
    console.error("applyToJob error:", err);
    setStatus("");
    alert(err?.message || "Failed to apply.");
  }
}

// ---------- INIT ----------
setStatus("Loading...");
await loadAvailableJobs();
await loadMyApplications();
await loadMyAssignedJobs();
setStatus("");
