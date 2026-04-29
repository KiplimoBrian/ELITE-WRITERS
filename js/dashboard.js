// /js/dashboard.js
import { auth, db, storage } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  doc,
  getDoc,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  ref as storageRef,
  getDownloadURL,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

/* ===============================
   AUTH GUARD
   =============================== */
function requireUserOrRedirect(loginPage = "login.html") {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (!user) window.location.href = loginPage;
      else resolve(user);
    });
  });
}

/* ===============================
   SUMMARY CARD CLICK -> TAB
   =============================== */
document.querySelectorAll(".summary-card").forEach((card) => {
  card.addEventListener("click", () => {
    const tab = card.dataset.tab;
    if (!tab) return;

    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));

    document.querySelector(`.tab[data-tab="${tab}"]`)?.classList.add("active");
    document.getElementById(tab)?.classList.add("active");

    updateAll();
  });
});

/* ===============================
   THEME TOGGLE
   =============================== */
const themeToggle = document.getElementById("themeToggle");
const body = document.body;

if (localStorage.getItem("theme") === "dark") {
  body.classList.add("dark");
  if (themeToggle) themeToggle.textContent = "☀️";
} else {
  if (themeToggle) themeToggle.textContent = "🌙";
}

themeToggle?.addEventListener("click", () => {
  body.classList.toggle("dark");
  const isDark = body.classList.contains("dark");
  if (themeToggle) themeToggle.textContent = isDark ? "☀️" : "🌙";
  localStorage.setItem("theme", isDark ? "dark" : "light");
});

/* ===============================
   TAB SWITCHING
   =============================== */
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", function () {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));

    this.classList.add("active");
    const target = this.getAttribute("data-tab");
    document.getElementById(target)?.classList.add("active");

    updateAll();
  });
});

document.querySelectorAll(".tab-link").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const targetTab = link.getAttribute("data-tab");
    document.querySelector(`.tab[data-tab="${targetTab}"]`)?.click();
  });
});

/* ===============================
   ELEMENTS
   =============================== */
const jobsBody = document.getElementById("jobsBody");
const searchInput = document.getElementById("searchInput");
const wordsMin = document.getElementById("wordsMin");
const wordsValue = document.getElementById("wordsValue");
const payMin = document.getElementById("payMin");
const payValue = document.getElementById("payValue");
const deadlineSort = document.getElementById("deadlineSort");
const resetFilters = document.getElementById("resetFilters");

const limitNotice = document.getElementById("limitNotice");
const activeCount = document.getElementById("activeCount");

const taskStatus = document.getElementById("taskStatus");
const noTask = document.getElementById("noTask");

const submitStatus = document.getElementById("submitStatus");
const submitForm = document.getElementById("submitForm");
const noSubmitTask = document.getElementById("noSubmitTask");
const submitTaskTitle = document.getElementById("submitTaskTitle");
const taskDetails = document.getElementById("taskDetails");

const uploadArea = document.getElementById("uploadArea");
const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const submitBtn = document.getElementById("submitBtn");

/* ===============================
   STATE
   =============================== */
let jobs = [];
let myAssignedJobs = [];
let myApplications = [];
let uploadedFiles = [];
let mySubmissionForCurrentTask = null;
let submitInProgress = false;

const attachmentUrlCache = new Map();

/* ===============================
   HELPERS
   =============================== */
function fmtDateFromTimestamp(ts) {
  try {
    if (!ts) return "";
    if (typeof ts.toDate === "function") {
      return ts.toDate().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    }
    if (ts?.seconds) {
      return new Date(ts.seconds * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    }
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function hasActiveTask() {
  return myAssignedJobs.length > 0;
}

function hasApplied(jobId) {
  return myApplications.some((a) => a.jobDocId === jobId);
}

function getAppStatus(jobId) {
  const app = myApplications.find((a) => a.jobDocId === jobId);
  return (app?.status || "").toLowerCase() || null;
}

function getCurrentTask() {
  return myAssignedJobs[0] || null;
}

function sanitizeFileName(name = "") {
  return name.replace(/[^\w.\-]+/g, "_");
}

function showAlert(message) {
  alert(message);
}

async function resolveAttachmentUrl(att, fallbackKey) {
  const directUrl = (att?.url || "").toString().trim();
  if (directUrl) return directUrl;

  const path = (att?.path || "").toString().trim();
  if (!path) return "";

  const cacheKey = path || fallbackKey;
  if (attachmentUrlCache.has(cacheKey)) return attachmentUrlCache.get(cacheKey);

  try {
    const url = await getDownloadURL(storageRef(storage, path));
    attachmentUrlCache.set(cacheKey, url);
    return url;
  } catch (e) {
    console.warn("Attachment URL resolve failed:", path, e);
    return "";
  }
}

async function buildAttachmentsHtml(job) {
  const atts = Array.isArray(job?.attachments) ? job.attachments : [];
  if (atts.length === 0) {
    return `<span style="color:var(--gray);font-size:12px;">No files</span>`;
  }

  const first = atts.slice(0, 2);
  const moreCount = atts.length - first.length;
  const linkLines = [];

  for (let i = 0; i < first.length; i++) {
    const a = first[i];
    const name = (a?.name || `File ${i + 1}`).toString();
    const url = await resolveAttachmentUrl(a, `${job.id}:${i}`);
    if (!url) {
      linkLines.push(`<span style="color:#b00;font-size:12px;">${name}</span>`);
    } else {
      linkLines.push(`<a href="${url}" target="_blank" rel="noopener" style="font-size:12px;">${name}</a>`);
    }
  }

  const more = moreCount > 0
    ? `<div style="font-size:12px;color:var(--gray);margin-top:4px;">+${moreCount} more</div>`
    : "";

  return `<div>${linkLines.join("<br/>")}${more}</div>`;
}

async function buildAttachmentsListHtml(job) {
  const atts = Array.isArray(job?.attachments) ? job.attachments : [];
  if (atts.length === 0) return `<p style="margin-top:10px;color:var(--gray)">No attachments.</p>`;

  const items = [];
  for (let i = 0; i < atts.length; i++) {
    const a = atts[i];
    const name = (a?.name || `Attachment ${i + 1}`).toString();
    const url = await resolveAttachmentUrl(a, `${job.id}:full:${i}`);
    const sizeKb = Math.round(((a?.size || 0) / 1024) || 0);

    if (!url) {
      items.push(`<li><span style="color:#b00;">${name}</span> <span style="font-size:12px;color:var(--gray)">(unavailable)</span></li>`);
    } else {
      items.push(`
        <li>
          <a href="${url}" target="_blank" rel="noopener">${name}</a>
          ${sizeKb ? `<span style="font-size:12px;color:var(--gray)"> (${sizeKb} KB)</span>` : ""}
        </li>
      `);
    }
  }

  return `
    <div style="margin-top:12px;">
      <h4 style="margin-bottom:8px;">Attachments</h4>
      <ul style="display:grid; gap:8px; padding-left:18px;">
        ${items.join("")}
      </ul>
    </div>
  `;
}

/* ===============================
   SUBMISSION HELPERS
   =============================== */
async function loadMySubmissionForCurrentTask(user) {
  mySubmissionForCurrentTask = null;
  const current = getCurrentTask();
  if (!current) return;

  const q = query(
    collection(db, "submissions"),
    where("writerId", "==", user.uid),
    where("jobId", "==", current.id)
  );

  const snap = await getDocs(q);
  if (snap.empty) return;

  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  docs.sort((a, b) => {
    const aTime = a.submittedAt?.seconds || 0;
    const bTime = b.submittedAt?.seconds || 0;
    return bTime - aTime;
  });

  mySubmissionForCurrentTask = docs[0];
}

function getSubmissionBadgeHtml(status) {
  const s = (status || "").toLowerCase();

  if (s === "approved") {
    return `<span class="status-badge" style="background:#dcfce7;color:#166534;">Approved</span>`;
  }
  if (s === "rejected") {
    return `<span class="status-badge" style="background:#fee2e2;color:#991b1b;">Rejected</span>`;
  }
  if (s === "correction_requested") {
    return `<span class="status-badge" style="background:#fef3c7;color:#92400e;">Correction Requested</span>`;
  }
  return `<span class="status-badge">Submitted</span>`;
}

function buildSubmissionFilesHtml(files = []) {
  if (!Array.isArray(files) || files.length === 0) {
    return `<p style="margin-top:10px;color:var(--gray)">No submitted files found.</p>`;
  }

  return `
    <div style="margin-top:12px;">
      <h4 style="margin-bottom:8px;">Submitted Files</h4>
      <ul style="display:grid; gap:8px; padding-left:18px;">
        ${files.map((f, i) => `
          <li>
            <a href="${f.url || "#"}" target="_blank" rel="noopener">
              ${f.name || `File ${i + 1}`}
            </a>
            ${f.size ? `<span style="font-size:12px;color:var(--gray)"> (${Math.round(f.size / 1024)} KB)</span>` : ""}
          </li>
        `).join("")}
      </ul>
    </div>
  `;
}

/* ===============================
   UI UPDATE
   =============================== */
function updateSummary() {
  if (activeCount) activeCount.textContent = hasActiveTask() ? "1" : "0";
}

function updateJobButtons() {
  if (limitNotice) limitNotice.style.display = hasActiveTask() ? "inline" : "none";
}

async function updateTaskStatusUI() {
  const current = getCurrentTask();

  if (current) {
    const deadlineText = fmtDateFromTimestamp(current.deadline);

    if (taskStatus) {
      taskStatus.style.display = "block";
      taskStatus.className = "task-status claimed";

      const attachmentsHtml = await buildAttachmentsListHtml(current);

      taskStatus.innerHTML = `
        <span class="status-badge">Assigned</span>
        <h3>${current.title || ""}</h3>
        <p>
          Words: ${(current.words || 0).toLocaleString()} •
          Pay: KES ${(current.pay || 0).toLocaleString()} •
          Deadline: ${deadlineText}
        </p>
        ${attachmentsHtml}
      `;
    }

    if (noTask) noTask.style.display = "none";

    if (submitStatus) submitStatus.style.display = "block";
    if (submitForm) submitForm.style.display = "block";
    if (noSubmitTask) noSubmitTask.style.display = "none";

    if (submitTaskTitle) submitTaskTitle.textContent = current.title || "";
    if (taskDetails) {
      let extra = `
        Words: ${(current.words || 0).toLocaleString()} •
        Pay: KES ${(current.pay || 0).toLocaleString()} •
        Deadline: ${deadlineText}
      `;

      if (mySubmissionForCurrentTask) {
        const status = mySubmissionForCurrentTask.status || "submitted";
        extra += `
          <div style="margin-top:12px;">
            ${getSubmissionBadgeHtml(status)}
          </div>
        `;

        if (mySubmissionForCurrentTask.adminMessage) {
          extra += `
            <div style="margin-top:10px;padding:10px;border-radius:10px;background:#fff8e1;border:1px solid #facc15;">
              <strong>Admin Message:</strong><br>
              ${mySubmissionForCurrentTask.adminMessage}
            </div>
          `;
        }

        extra += buildSubmissionFilesHtml(mySubmissionForCurrentTask.files || []);
      }

      taskDetails.innerHTML = extra;
    }

    if (mySubmissionForCurrentTask && mySubmissionForCurrentTask.status !== "correction_requested") {
      if (submitBtn) submitBtn.style.display = "none";
      if (uploadArea) uploadArea.style.display = "none";
      if (fileList) fileList.style.display = "none";
      return;
    }

    if (uploadArea) uploadArea.style.display = "block";
    if (fileList) fileList.style.display = "block";
    if (submitBtn) submitBtn.style.display = uploadedFiles.length > 0 ? "inline-block" : "none";
  } else {
    if (taskStatus) taskStatus.style.display = "none";
    if (noTask) noTask.style.display = "block";

    if (submitStatus) submitStatus.style.display = "none";
    if (submitForm) submitForm.style.display = "none";
    if (noSubmitTask) noSubmitTask.style.display = "block";

    if (submitBtn) submitBtn.style.display = "none";
  }
}

/* ===============================
   RENDER JOBS
   =============================== */
async function renderJobs(jobList) {
  if (!jobsBody) return;
  jobsBody.innerHTML = "";

  if (jobList.length === 0) {
    jobsBody.innerHTML = `<tr><td colspan="6" class="no-jobs">No jobs match your current filters.</td></tr>`;
    return;
  }

  for (const job of jobList) {
    const deadlineText = fmtDateFromTimestamp(job.deadline);
    const status = getAppStatus(job.id);

    let btnText = "Claim Job";
    let btnClass = "";
    let disabled = false;

    if (status === "approved" || status === "accepted") {
      btnText = "Approved";
      btnClass = "btn-approved";
      disabled = true;
    } else if (status === "rejected") {
      btnText = "Rejected";
      btnClass = "btn-rejected";
      disabled = true;
    } else if (hasApplied(job.id)) {
      btnText = "Submitted";
      btnClass = "btn-submitted";
      disabled = true;
    } else if (hasActiveTask()) {
      btnText = "Task Active";
      disabled = true;
    }

    const filesHtml = await buildAttachmentsHtml(job);

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${job.title || ""}</td>
      <td>${(job.words || 0).toLocaleString()}</td>
      <td>${(job.pay || 0).toLocaleString()}</td>
      <td>${deadlineText}</td>
      <td>${filesHtml}</td>
      <td>
        <button
          class="btn-small claim-btn ${btnClass}"
          ${disabled ? "disabled" : ""}
          data-job-id="${job.id}"
        >
          ${btnText}
        </button>
      </td>
    `;
    jobsBody.appendChild(row);
  }

  document.querySelectorAll(".claim-btn").forEach((btn) => {
    btn.onclick = async () => {
      if (btn.hasAttribute("disabled")) return;
      const jobId = btn.getAttribute("data-job-id");
      if (!jobId) return;
      await claimJob(jobId);
    };
  });
}

async function filterJobs() {
  if (!searchInput || !wordsMin || !payMin || !deadlineSort) {
    await renderJobs(jobs);
    return;
  }

  let filtered = jobs.filter((job) => {
    const title = (job.title || "").toLowerCase();
    const q = (searchInput.value || "").toLowerCase();

    const matchesSearch = title.includes(q);
    const matchesWords = (job.words || 0) >= parseInt(wordsMin.value || "0", 10);
    const matchesPay = (job.pay || 0) >= parseInt(payMin.value || "0", 10);
    return matchesSearch && matchesWords && matchesPay;
  });

  if (deadlineSort.value === "soon") {
    filtered.sort((a, b) => (a.deadline?.seconds || 0) - (b.deadline?.seconds || 0));
  } else {
    filtered.sort((a, b) => (b.deadline?.seconds || 0) - (a.deadline?.seconds || 0));
  }

  await renderJobs(filtered);
}

async function updateAll() {
  updateSummary();
  updateJobButtons();
  await updateTaskStatusUI();
  await filterJobs();
}

/* ===============================
   FIRESTORE LOADERS
   =============================== */
async function loadAvailableJobs() {
  jobs = [];

  const q = query(
    collection(db, "jobs"),
    where("status", "==", "open"),
    where("isAvailable", "==", true),
    where("assignedWriterId", "==", null),
    orderBy("createdAt", "desc"),
    limit(50)
  );

  const snap = await getDocs(q);
  snap.forEach((d) => jobs.push({ id: d.id, ...d.data() }));
}

async function loadMyAssignedJobs(user) {
  myAssignedJobs = [];

  const q = query(
    collection(db, "jobs"),
    where("assignedWriterId", "==", user.uid),
    orderBy("assignedAt", "desc"),
    limit(10)
  );

  const snap = await getDocs(q);
  snap.forEach((d) => myAssignedJobs.push({ id: d.id, ...d.data() }));
}

async function loadMyApplications(user) {
  myApplications = [];

  const q = query(
    collection(db, "applications"),
    where("userId", "==", user.uid),
    orderBy("appliedAt", "desc"),
    limit(200)
  );

  const snap = await getDocs(q);
  snap.forEach((d) => myApplications.push({ id: d.id, ...d.data() }));
}

/* ===============================
   CLAIM JOB
   =============================== */
async function claimJob(jobId) {
  const user = await requireUserOrRedirect("login.html");

  if (hasApplied(jobId)) {
    showAlert("Already submitted.");
    return;
  }

  if (hasActiveTask()) {
    showAlert("You can only claim one task at a time.");
    return;
  }

  const jobRef = doc(db, "jobs", jobId);
  const jobSnap = await getDoc(jobRef);

  if (!jobSnap.exists()) {
    showAlert("This job no longer exists.");
    await refreshAll();
    return;
  }

  const job = jobSnap.data();
  const isOpen = job?.status === "open" && job?.isAvailable === true && job?.assignedWriterId == null;

  if (!isOpen) {
    showAlert("This job is no longer available.");
    await refreshAll();
    return;
  }

  await addDoc(collection(db, "applications"), {
    jobDocId: jobId,
    userId: user.uid,
    status: "pending",
    appliedAt: serverTimestamp()
  });

  myApplications.unshift({ jobDocId: jobId, userId: user.uid, status: "pending" });

  showAlert("Application submitted successfully.");
  await updateAll();
  await refreshAll();
}

/* ===============================
   FILTERS LISTENERS
   =============================== */
wordsMin?.addEventListener("input", async () => {
  if (wordsValue) wordsValue.textContent = wordsMin.value == 3000 ? "3000+" : wordsMin.value;
  await filterJobs();
});

payMin?.addEventListener("input", async () => {
  if (payValue) payValue.textContent = payMin.value == 10000 ? "10,000+" : parseInt(payMin.value, 10).toLocaleString();
  await filterJobs();
});

searchInput?.addEventListener("input", async () => {
  await filterJobs();
});

deadlineSort?.addEventListener("change", async () => {
  await filterJobs();
});

resetFilters?.addEventListener("click", async () => {
  if (searchInput) searchInput.value = "";
  if (wordsMin) wordsMin.value = 0;
  if (wordsValue) wordsValue.textContent = "3000+";
  if (payMin) payMin.value = 0;
  if (payValue) payValue.textContent = "10,000+";
  if (deadlineSort) deadlineSort.value = "soon";
  await filterJobs();
});

/* ===============================
   FILE UPLOAD UI
   =============================== */
["dragenter", "dragover", "dragleave", "drop"].forEach((evt) => {
  uploadArea?.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});

["dragenter", "dragover"].forEach((evt) =>
  uploadArea?.addEventListener(evt, () => uploadArea.classList.add("dragover"))
);

["dragleave", "drop"].forEach((evt) =>
  uploadArea?.addEventListener(evt, () => uploadArea.classList.remove("dragover"))
);

uploadArea?.addEventListener("click", () => fileInput?.click());
uploadArea?.addEventListener("drop", (e) => handleFiles(e.dataTransfer.files));
fileInput?.addEventListener("change", (e) => e.target.files && handleFiles(e.target.files));

function handleFiles(files) {
  Array.from(files).forEach((file) => {
    if (file.size > 10 * 1024 * 1024) {
      showAlert(`"${file.name}" exceeds 10MB limit.`);
      return;
    }
    if (!/\.(pdf|docx?|txt)$/i.test(file.name)) {
      showAlert(`"${file.name}" is not a supported format.`);
      return;
    }
    uploadedFiles.push(file);
  });

  renderFileList();
}

function renderFileList() {
  if (!fileList) return;

  fileList.innerHTML = "";

  uploadedFiles.forEach((file, i) => {
    const item = document.createElement("div");
    item.className = "file-item";
    item.innerHTML = `
      <span>${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)</span>
      <button class="file-remove">×</button>
    `;
    item.querySelector(".file-remove").onclick = () => {
      uploadedFiles.splice(i, 1);
      renderFileList();
      if (submitBtn) submitBtn.style.display = uploadedFiles.length > 0 && hasActiveTask() ? "inline-block" : "none";
    };
    fileList.appendChild(item);
  });

  if (submitBtn) submitBtn.style.display = uploadedFiles.length > 0 && hasActiveTask() ? "inline-block" : "none";
}

/* ===============================
   REAL TASK SUBMISSION
   =============================== */
async function uploadSubmissionFiles(user, currentTask) {
  const uploaded = [];

  for (const file of uploadedFiles) {
    const safeName = sanitizeFileName(file.name);
    const storagePath = `submissions/${user.uid}/${currentTask.id}/${Date.now()}_${safeName}`;
    const fileRef = storageRef(storage, storagePath);

    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);

    uploaded.push({
      name: file.name,
      path: storagePath,
      url,
      size: file.size,
      type: file.type || ""
    });
  }

  return uploaded;
}

submitBtn?.addEventListener("click", async () => {
  if (submitInProgress) return;

  const user = await requireUserOrRedirect("login.html");
  const currentTask = getCurrentTask();

  if (!currentTask) {
    showAlert("You do not have an active task to submit.");
    return;
  }

  if (uploadedFiles.length === 0) {
    showAlert("Please upload at least one file before submitting.");
    return;
  }

  if (mySubmissionForCurrentTask && mySubmissionForCurrentTask.status !== "correction_requested") {
    showAlert("This task has already been submitted and is awaiting admin review.");
    return;
  }

  try {
    submitInProgress = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";
    }

    const userSnap = await getDoc(doc(db, "users", user.uid));
    const userData = userSnap.exists() ? userSnap.data() : {};

    const uploaded = await uploadSubmissionFiles(user, currentTask);

    const payload = {
      jobId: currentTask.id,
      jobTitle: currentTask.title || "",
      writerId: user.uid,
      writerEmail: user.email || userData.email || "",
      writerName: userData.fullName || userData.name || user.displayName || "",
      files: uploaded,
      status: mySubmissionForCurrentTask?.status === "correction_requested"
        ? "submitted"
        : "submitted",
      submissionNote: "",
      adminMessage: "",
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await addDoc(collection(db, "submissions"), payload);

    uploadedFiles = [];
    renderFileList();

    showAlert("Submitted successfully. Awaiting admin review.");

    await refreshAll();
  } catch (error) {
    console.error("Submission failed:", error);
    showAlert(`Submission failed: ${error.message || "Unknown error"}`);
  } finally {
    submitInProgress = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Work";
    }
  }
});

/* ===============================
   REFRESH ALL
   =============================== */
async function refreshAll() {
  const user = await requireUserOrRedirect("login.html");

  await loadMyAssignedJobs(user);
  await loadMyApplications(user);
  await loadAvailableJobs();
  await loadMySubmissionForCurrentTask(user);

  await updateAll();
}

/* ===============================
   INITIAL LOAD
   =============================== */
await refreshAll();

/* ===============================
   PROFILE MODAL + LOAD DATA
   =============================== */
let navProfileBtn = null;
const profileModal = document.getElementById("profileModal");
const closeProfileBtn = document.getElementById("closeProfileBtn");
const profileBackdrop = document.getElementById("profileModalBackdrop");
const logoutBtnBottom = document.getElementById("logoutBtnBottom");

const profileFullName = document.getElementById("profileFullName");
const profileEmail = document.getElementById("profileEmail");
const profileEmailVerified = document.getElementById("profileEmailVerified");
const profilePhone = document.getElementById("profilePhone");
const profilePhoneVerified = document.getElementById("profilePhoneVerified");
const profileAccountStatus = document.getElementById("profileAccountStatus");
const profilePaymentStatus = document.getElementById("profilePaymentStatus");

async function loadProfileData(user) {
  try {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    let profile = {};
    if (snap.exists()) {
      profile = snap.data();
    }

    if (profileFullName) {
      profileFullName.textContent =
        profile.fullName ||
        profile.name ||
        user.displayName ||
        "Not provided";
    }

    if (profileEmail) {
      profileEmail.textContent =
        user.email ||
        profile.email ||
        "Not provided";
    }

    if (profileEmailVerified) {
      profileEmailVerified.textContent = user.emailVerified
        ? "Verified"
        : "Not Verified";
    }

    if (profilePhone) {
      profilePhone.textContent =
        profile.phoneNumber ||
        profile.phone ||
        user.phoneNumber ||
        "Not provided";
    }

    if (profilePhoneVerified) {
      profilePhoneVerified.textContent = profile.phoneVerified === true
        ? "Verified"
        : "Not Verified";
    }

    if (profileAccountStatus) {
      profileAccountStatus.textContent =
        profile.accountStatus ||
        (profile.isActive === true ? "Active" : "Pending");
    }

    if (profilePaymentStatus) {
      profilePaymentStatus.textContent =
        profile.paymentStatus ||
        "Unpaid";
    }
  } catch (error) {
    console.error("Error loading profile:", error);

    if (profileFullName) profileFullName.textContent = "Error";
    if (profileEmail) profileEmail.textContent = "Error";
    if (profileEmailVerified) profileEmailVerified.textContent = "Error";
    if (profilePhone) profilePhone.textContent = "Error";
    if (profilePhoneVerified) profilePhoneVerified.textContent = "Error";
    if (profileAccountStatus) profileAccountStatus.textContent = "Error";
    if (profilePaymentStatus) profilePaymentStatus.textContent = "Error";
  }
}

function bindProfileButton() {
  navProfileBtn = document.getElementById("navProfileBtn");
  if (!navProfileBtn || navProfileBtn.dataset.bound === "true") return;

  navProfileBtn.dataset.bound = "true";
  navProfileBtn.addEventListener("click", async () => {
    profileModal?.classList.remove("hidden");
    profileModal?.setAttribute("aria-hidden", "false");

    const user = auth.currentUser;
    if (user) {
      await loadProfileData(user);
    }
  });
}

bindProfileButton();
window.addEventListener("load", bindProfileButton);
setTimeout(bindProfileButton, 300);
setTimeout(bindProfileButton, 800);
setTimeout(bindProfileButton, 1500);

closeProfileBtn?.addEventListener("click", () => {
  profileModal?.classList.add("hidden");
  profileModal?.setAttribute("aria-hidden", "true");
});

profileBackdrop?.addEventListener("click", () => {
  profileModal?.classList.add("hidden");
  profileModal?.setAttribute("aria-hidden", "true");
});

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  await loadProfileData(user);
});

logoutBtnBottom?.addEventListener("click", async () => {
  try {
    await auth.signOut();
    window.location.href = "/index.html";
  } catch (error) {
    console.error("Logout failed:", error);
    showAlert("Failed to log out. Please try again.");
  }
});