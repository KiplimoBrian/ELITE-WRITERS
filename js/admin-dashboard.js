// js/admin-dashboard.js
import { app } from "./firebase-init.js";
import { requireAdminOrRedirect, adminLogout } from "./admin-auth.js";

import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const db = getFirestore(app);
const storage = getStorage(app);

// Elements (existing)
const jobFileInput = document.getElementById("jobFileInput");
const jobsList = document.getElementById("jobsList");
const appsList = document.getElementById("appsList");
const jobForm = document.getElementById("jobForm");
const jobStatus = document.getElementById("jobStatus");
const addFilesBtn = document.getElementById("addFilesBtn");
const createJobFiles = document.getElementById("createJobFiles");
const createFilesList = document.getElementById("createFilesList");

// NEW admin review sections
const submissionsList = document.getElementById("submissionsList");
const paymentsList = document.getElementById("paymentsList");

// Edit modal elements
const editJobModal = document.getElementById("editJobModal");
const closeEditJobBtn = document.getElementById("closeEditJobBtn");
const cancelEditJobBtn = document.getElementById("cancelEditJobBtn");
const saveEditJobBtn = document.getElementById("saveEditJobBtn");

const editJobId = document.getElementById("editJobId");
const editJobDocId = document.getElementById("editJobDocId");

const editTitle = document.getElementById("editTitle");
const editWords = document.getElementById("editWords");
const editPay = document.getElementById("editPay");
const editDeadline = document.getElementById("editDeadline");
const editStatus = document.getElementById("editStatus");
const editAssignedWriter = document.getElementById("editAssignedWriter");

const editNotes = document.getElementById("editNotes");
const editJobStatusText = document.getElementById("editJobStatus");

const editAddFilesBtn = document.getElementById("editAddFilesBtn");
const editJobFiles = document.getElementById("editJobFiles");
const editFilesPicked = document.getElementById("editFilesPicked");
const editExistingFiles = document.getElementById("editExistingFiles");

let currentUploadJobId = null;
let pendingCreateFiles = [];
let currentEditJobId = null;
let pendingEditFiles = [];

// ✅ Protect page
await requireAdminOrRedirect("admin-login.html");

// Logout
document.getElementById("logoutBtn")?.addEventListener("click", () => adminLogout());

// Helpful warnings
if (!jobsList) console.warn("Missing element id='jobsList' in admin-dashboard.html");
if (!appsList) console.warn("Missing element id='appsList' in admin-dashboard.html");
if (!submissionsList) console.warn("Missing element id='submissionsList' in admin-dashboard.html");
if (!paymentsList) console.warn("Missing element id='paymentsList' in admin-dashboard.html");
if (!jobForm) console.warn("Missing form id='jobForm' in admin-dashboard.html");
if (!jobFileInput) console.warn("Missing file input id='jobFileInput' in admin-dashboard.html");
if (!jobStatus) console.warn("Missing element id='jobStatus'");
if (!createJobFiles) console.warn("Missing file input id='createJobFiles'");
if (!addFilesBtn) console.warn("Missing button id='addFilesBtn'");
if (!createFilesList) console.warn("Missing element id='createFilesList'");

function setStatus(text = "") {
  if (jobStatus) jobStatus.textContent = text;
}

function setEditStatus(text = "") {
  if (editJobStatusText) editJobStatusText.textContent = text;
}

function parseDatetimeLocal(value) {
  if (!value || typeof value !== "string") return null;
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return null;

  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);

  if (![y, m, d, hh, mm].every((n) => Number.isFinite(n))) return null;

  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function openEditModal() {
  if (!editJobModal) return;
  editJobModal.classList.add("open");
  editJobModal.setAttribute("aria-hidden", "false");
}

function closeEditModal() {
  if (!editJobModal) return;
  editJobModal.classList.remove("open");
  editJobModal.setAttribute("aria-hidden", "true");
  pendingEditFiles = [];
  if (editJobFiles) editJobFiles.value = "";
  if (editFilesPicked) editFilesPicked.textContent = "No new files selected";
  setEditStatus("");
}

closeEditJobBtn?.addEventListener("click", closeEditModal);
cancelEditJobBtn?.addEventListener("click", closeEditModal);

editJobModal?.addEventListener("click", (e) => {
  if (e.target === editJobModal) closeEditModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && editJobModal?.classList.contains("open")) {
    closeEditModal();
  }
});

// =====================
// Post job
// =====================
jobForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("Publishing...");

  const title = document.getElementById("jobTitle")?.value?.trim();
  const words = Number(document.getElementById("jobWords")?.value || 0);
  const pay = Number(document.getElementById("jobPay")?.value || 0);
  const deadlineRaw = document.getElementById("jobDeadline")?.value;

  if (!title || !deadlineRaw) {
    setStatus("");
    alert("Fill Title and Deadline");
    return;
  }

  const deadlineDate = parseDatetimeLocal(deadlineRaw);
  if (!deadlineDate) {
    setStatus("");
    alert("Invalid deadline value");
    return;
  }

  const deadline = Timestamp.fromDate(deadlineDate);

  try {
    const ref = await addDoc(collection(db, "jobs"), {
      title,
      words,
      pay,
      deadline,
      status: "open",
      isAvailable: true,
      assignedWriterId: null,
      assignedAt: null,
      attachments: [],
      adminNotes: "",
      createdAt: serverTimestamp()
    });

    await updateDoc(doc(db, "jobs", ref.id), { jobDocId: ref.id });

    if (pendingCreateFiles.length > 0) {
      setStatus("Uploading files...");
      await uploadAttachmentsForJob(ref.id, pendingCreateFiles);
    }

    setStatus("✅ Job published");
    jobForm.reset();

    pendingCreateFiles = [];
    renderCreateFilesList();

    await loadJobs();
  } catch (err) {
    console.error(err);
    setStatus("");
    alert(err?.message || "Failed to publish job.");
  }
});

// =====================
// Load jobs
// =====================
async function loadJobs() {
  if (!jobsList) return;

  jobsList.textContent = "Loading jobs...";

  try {
    const q = query(collection(db, "jobs"), orderBy("createdAt", "desc"), limit(50));
    const snap = await getDocs(q);

    if (snap.empty) {
      jobsList.innerHTML = "<p>No jobs yet.</p>";
      return;
    }

    let html = `<table class="table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Pay</th>
          <th>Status</th>
          <th>Assigned Writer</th>
          <th>Doc ID</th>
          <th>Actions</th>
        </tr>
      </thead><tbody>`;

    snap.forEach((d) => {
      const job = d.data() || {};
      html += `<tr>
        <td>${escapeHtml(job.title || "")}</td>
        <td>${Number(job.pay || 0).toLocaleString()}</td>
        <td>${escapeHtml(job.status || "")}</td>
        <td>${escapeHtml(job.assignedWriterId || "-")}</td>
        <td style="font-size:12px;">${escapeHtml(d.id)}</td>
        <td style="white-space:nowrap;">
          <button class="btn-small edit-btn" data-jobid="${d.id}">Edit</button>
          <button class="btn-danger-small delete-btn" data-jobid="${d.id}">Delete</button>
        </td>
      </tr>`;
    });

    html += "</tbody></table>";
    jobsList.innerHTML = html;

    document.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const jid = btn.dataset.jobid;
        if (!jid) return;
        await openEditForJob(jid);
      });
    });

    document.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const jid = btn.dataset.jobid;
        if (!jid) return;

        const ok = confirm(
          "Delete this job?\n\nThis will remove the job document from Firestore.\n(Optional) It can also delete its attachments from Storage."
        );
        if (!ok) return;

        const row = btn.closest("tr");
        row?.querySelectorAll("button").forEach((b) => (b.disabled = true));

        await deleteJobFlow(jid);
        await loadJobs();
        await loadApplications();
        await loadSubmissions();
        await loadPayments();
      });
    });
  } catch (err) {
    console.error(err);
    jobsList.innerHTML = `<p style="color:red;">Failed to load jobs: ${err?.message || err}</p>`;
  }
}

// =====================
// Edit job
// =====================
async function openEditForJob(jobId) {
  if (!jobId) return;

  if (!editJobModal) {
    alert("Edit modal missing in admin-dashboard.html. Paste the updated admin-dashboard.html first.");
    return;
  }

  setEditStatus("Loading...");
  currentEditJobId = jobId;

  try {
    const jsnap = await getDoc(doc(db, "jobs", jobId));
    if (!jsnap.exists()) {
      alert("Job not found (maybe deleted).");
      closeEditModal();
      return;
    }

    const job = jsnap.data() || {};

    if (editJobId) editJobId.value = jobId;
    if (editJobDocId) editJobDocId.textContent = jobId;

    if (editTitle) editTitle.value = job.title || "";
    if (editWords) editWords.value = Number(job.words || 0) || "";
    if (editPay) editPay.value = Number(job.pay || 0) || "";
    if (editStatus) editStatus.value = (job.status || "open");
    if (editAssignedWriter) editAssignedWriter.value = job.assignedWriterId || "";

    if (editDeadline) {
      const dt = job.deadline?.toDate ? job.deadline.toDate() : null;
      editDeadline.value = dt ? toDatetimeLocal(dt) : "";
    }

    if (editNotes) editNotes.value = job.adminNotes || job.notes || "";

    renderExistingAttachments(job.attachments || []);

    pendingEditFiles = [];
    if (editFilesPicked) editFilesPicked.textContent = "No new files selected";
    if (editJobFiles) editJobFiles.value = "";

    setEditStatus("");
    openEditModal();
  } catch (err) {
    console.error(err);
    alert(err?.message || "Failed to load job for edit.");
    closeEditModal();
  }
}

function renderExistingAttachments(attachments) {
  if (!editExistingFiles) return;

  if (!Array.isArray(attachments) || attachments.length === 0) {
    editExistingFiles.innerHTML = `<div class="hint">No attachments yet.</div>`;
    return;
  }

  editExistingFiles.innerHTML = attachments
    .map((a, idx) => {
      const name = a?.name || `Attachment ${idx + 1}`;
      const url = a?.url || "";
      const size = a?.size ? `${Math.round(a.size / 1024)} KB` : "";
      const when = a?.uploadedAt ? a.uploadedAt : "";
      return `
        <div class="file-item">
          <div style="min-width:0;">
            <div class="file-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
            <div class="file-meta">${escapeHtml([size, when].filter(Boolean).join(" • "))}</div>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            ${url ? `<a class="btn-ghost-small" href="${url}" target="_blank" rel="noopener">Open</a>` : ""}
          </div>
        </div>
      `;
    })
    .join("");
}

editAddFilesBtn?.addEventListener("click", () => editJobFiles?.click());

editJobFiles?.addEventListener("change", (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  pendingEditFiles.push(...files);
  if (editFilesPicked) editFilesPicked.textContent = `${pendingEditFiles.length} file(s) selected`;
  editJobFiles.value = "";
});

saveEditJobBtn?.addEventListener("click", async () => {
  const jid = editJobId?.value || currentEditJobId;
  if (!jid) return;

  const title = editTitle?.value?.trim() || "";
  const deadlineRaw = editDeadline?.value || "";

  if (!title) {
    alert("Title is required.");
    return;
  }
  if (!deadlineRaw) {
    alert("Deadline is required.");
    return;
  }

  const deadlineDate = parseDatetimeLocal(deadlineRaw);
  if (!deadlineDate) {
    alert("Invalid deadline value.");
    return;
  }

  const payload = {
    title,
    words: Number(editWords?.value || 0),
    pay: Number(editPay?.value || 0),
    status: (editStatus?.value || "open"),
    deadline: Timestamp.fromDate(deadlineDate),
    adminNotes: (editNotes?.value || "").trim(),
    updatedAt: serverTimestamp()
  };

  try {
    setEditStatus("Saving...");
    saveEditJobBtn.disabled = true;
    if (cancelEditJobBtn) cancelEditJobBtn.disabled = true;
    if (closeEditJobBtn) closeEditJobBtn.disabled = true;

    await updateDoc(doc(db, "jobs", jid), payload);

    if (pendingEditFiles.length > 0) {
      setEditStatus("Uploading files...");
      await uploadAttachmentsForJob(jid, pendingEditFiles);
    }

    await loadJobs();
    await loadApplications();

    closeEditModal();
  } catch (err) {
    console.error(err);
    alert(err?.message || "Failed to save changes.");
    setEditStatus("");
  } finally {
    saveEditJobBtn.disabled = false;
    if (cancelEditJobBtn) cancelEditJobBtn.disabled = false;
    if (closeEditJobBtn) closeEditJobBtn.disabled = false;
  }
});

// =====================
// Delete job flow
// =====================
async function deleteJobFlow(jobId) {
  try {
    const jsnap = await getDoc(doc(db, "jobs", jobId));
    const job = jsnap.exists() ? (jsnap.data() || {}) : null;

    await deleteDoc(doc(db, "jobs", jobId));

    const atts = Array.isArray(job?.attachments) ? job.attachments : [];
    for (const a of atts) {
      const path = a?.path;
      if (!path) continue;
      try {
        await deleteObject(storageRef(storage, path));
      } catch (e) {
        console.warn("Attachment delete failed:", path, e?.message || e);
      }
    }

    alert("✅ Job deleted.");
  } catch (err) {
    console.error(err);
    alert(err?.message || "Failed to delete job.");
  }
}

// =====================
// Load applications
// =====================
async function loadApplications() {
  if (!appsList) return;

  appsList.textContent = "Loading applications...";

  try {
    const q = query(collection(db, "applications"), orderBy("appliedAt", "desc"), limit(200));
    const snap = await getDocs(q);

    if (snap.empty) {
      appsList.innerHTML = "<p>No applications yet.</p>";
      return;
    }

    const apps = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      apps.push({
        id: d.id,
        ...data,
        _jobId: data.jobDocId || data.jobId || ""
      });
    });

    apps.sort((a, b) => {
      const ap = (a.status || "").toLowerCase() === "pending" ? 0 : 1;
      const bp = (b.status || "").toLowerCase() === "pending" ? 0 : 1;
      return ap - bp;
    });

    const jobTitleById = {};
    const jobIds = [...new Set(apps.map((a) => a._jobId).filter(Boolean))].slice(0, 80);

    await Promise.all(
      jobIds.map(async (jid) => {
        try {
          const jsnap = await getDoc(doc(db, "jobs", jid));
          jobTitleById[jid] = jsnap.exists()
            ? (jsnap.data().title || "(no title)")
            : "(job deleted)";
        } catch (e) {
          console.error("Job title fetch failed for:", jid, e);
          jobTitleById[jid] = "(job load failed)";
        }
      })
    );

    let html = `
      <table class="table">
        <thead>
          <tr>
            <th>Job</th>
            <th>Job Doc ID</th>
            <th>User ID</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
    `;

    apps.forEach((app) => {
      const status = (app.status || "").toLowerCase();
      const decidedApproved = status === "approved" || status === "accepted";
      const decidedRejected = status === "rejected";
      const isPending = status === "pending" || status === "applied";

      const jobId = app._jobId;
      const jobTitle = jobId ? (jobTitleById[jobId] || "(loading...)") : "(missing job id)";
      const canDecide = isPending && !!jobId;
      const approveText = decidedApproved ? "Approved" : "Approve";
      const rejectText = decidedRejected ? "Rejected" : "Reject";
      const disableBoth = !canDecide || decidedApproved || decidedRejected;

      html += `
        <tr>
          <td>${escapeHtml(jobTitle)}</td>
          <td style="font-size:12px;">${escapeHtml(jobId || "(missing jobDocId/jobId)")}</td>
          <td style="font-size:12px;">${escapeHtml(app.userId || "")}</td>
          <td>${escapeHtml(app.status || "")}</td>
          <td>
            <button
              class="btn-small approve-btn"
              ${disableBoth ? "disabled" : ""}
              data-appdoc="${app.id}"
              data-jobdoc="${jobId}"
              data-user="${app.userId || ""}">
              ${escapeHtml(approveText)}
            </button>

            <button
              class="btn-small reject-btn"
              ${disableBoth ? "disabled" : ""}
              data-appdoc="${app.id}">
              ${escapeHtml(rejectText)}
            </button>
          </td>
        </tr>
      `;
    });

    html += "</tbody></table>";
    appsList.innerHTML = html;

    document.querySelectorAll(".approve-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (btn.disabled) return;

        const row = btn.closest("tr");
        row?.querySelectorAll("button").forEach((b) => (b.disabled = true));

        await approveApplication(btn.dataset.appdoc, btn.dataset.jobdoc, btn.dataset.user);
        await loadApplications();
        await loadJobs();
      });
    });

    document.querySelectorAll(".reject-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (btn.disabled) return;

        const row = btn.closest("tr");
        row?.querySelectorAll("button").forEach((b) => (b.disabled = true));

        await rejectApplication(btn.dataset.appdoc);
        await loadApplications();
      });
    });
  } catch (err) {
    console.error(err);
    appsList.innerHTML = `<p style="color:red;">Failed to load applications: ${err?.message || err}</p>`;
  }
}

// =====================
// Approve / Reject Applications
// =====================
async function approveApplication(applicationDocId, jobDocId, userId) {
  if (!applicationDocId) return;
  if (!jobDocId) {
    alert("This application is missing jobDocId. Fix writer apply code to save jobDocId.");
    return;
  }

  try {
    await updateDoc(doc(db, "applications", applicationDocId), {
      status: "approved",
      decidedAt: serverTimestamp()
    });

    await updateDoc(doc(db, "jobs", jobDocId), {
      status: "assigned",
      isAvailable: false,
      assignedWriterId: userId || null,
      assignedAt: serverTimestamp()
    });

    alert("✅ Approved + assigned.");
  } catch (err) {
    console.error(err);
    alert(err?.message || "Failed to approve.");
  }
}

async function rejectApplication(applicationDocId) {
  if (!applicationDocId) return;

  try {
    await updateDoc(doc(db, "applications", applicationDocId), {
      status: "rejected",
      decidedAt: serverTimestamp()
    });

    alert("✅ Rejected.");
  } catch (err) {
    console.error(err);
    alert(err?.message || "Failed to reject.");
  }
}

// =====================
// Load submissions
// =====================
async function loadSubmissions() {
  if (!submissionsList) return;

  submissionsList.innerHTML = "<p>Loading submissions...</p>";

  try {
    const q = query(collection(db, "submissions"), orderBy("submittedAt", "desc"), limit(100));
    const snap = await getDocs(q);

    if (snap.empty) {
      submissionsList.innerHTML = "<p>No submissions yet.</p>";
      return;
    }

    const submissions = [];
    for (const d of snap.docs) {
      const data = d.data() || {};

      let jobData = {};
      let writerData = {};

      if (data.jobId) {
        try {
          const jobSnap = await getDoc(doc(db, "jobs", data.jobId));
          if (jobSnap.exists()) jobData = jobSnap.data() || {};
        } catch (e) {
          console.warn("Failed to fetch job for submission:", e);
        }
      }

      if (data.writerId) {
        try {
          const writerSnap = await getDoc(doc(db, "users", data.writerId));
          if (writerSnap.exists()) writerData = writerSnap.data() || {};
        } catch (e) {
          console.warn("Failed to fetch writer for submission:", e);
        }
      }

      submissions.push({
        id: d.id,
        ...data,
        writerDisplayName:
          data.writerName ||
          writerData.fullName ||
          writerData.name ||
          "Unknown Writer",
        writerPhone:
          writerData.phoneNumber ||
          writerData.phone ||
          "",
        jobPay: Number(jobData.pay || 0),
        jobWords: Number(jobData.words || 0),
        deadline: jobData.deadline || null
      });
    }

    submissionsList.innerHTML = submissions.map((submission) => {
      const filesHtml = Array.isArray(submission.files) && submission.files.length > 0
        ? `
          <ul style="margin:10px 0 0 18px; display:grid; gap:6px;">
            ${submission.files.map((f, i) => `
              <li>
                <a href="${f.url || "#"}" target="_blank" rel="noopener">
                  ${escapeHtml(f.name || `File ${i + 1}`)}
                </a>
                ${f.size ? `<span style="color:#6b7280;"> (${Math.round(f.size / 1024)} KB)</span>` : ""}
              </li>
            `).join("")}
          </ul>
        `
        : `<p style="margin-top:8px;">No files attached.</p>`;

      return `
        <div class="card" style="margin-bottom:16px; padding:16px;">
          <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
            <div>
              <h3 style="margin:0 0 8px;">${escapeHtml(submission.jobTitle || "Untitled Task")}</h3>
              <p><strong>Writer:</strong> ${escapeHtml(submission.writerDisplayName)}</p>
              <p><strong>Email:</strong> ${escapeHtml(submission.writerEmail || "-")}</p>
              <p><strong>Phone:</strong> ${escapeHtml(submission.writerPhone || "-")}</p>
              <p><strong>Words:</strong> ${Number(submission.jobWords || 0).toLocaleString()}</p>
              <p><strong>Pay:</strong> KES ${Number(submission.jobPay || 0).toLocaleString()}</p>
              <p><strong>Submitted:</strong> ${formatTimestamp(submission.submittedAt)}</p>
              <p><strong>Status:</strong> ${renderStatusBadge(submission.status || "submitted")}</p>
            </div>
          </div>

          <div style="margin-top:12px;">
            <strong>Files</strong>
            ${filesHtml}
          </div>

          ${
            submission.adminMessage
              ? `
                <div style="margin-top:12px; padding:10px; border-radius:10px; background:#fff8e1; border:1px solid #facc15;">
                  <strong>Admin Message:</strong><br>
                  ${escapeHtml(submission.adminMessage)}
                </div>
              `
              : ""
          }

          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:16px;">
            <button class="btn-small submission-approve-btn" data-submission-id="${submission.id}">
              Approve
            </button>
            <button class="btn-small submission-correct-btn" data-submission-id="${submission.id}">
              Request Correction
            </button>
            <button class="btn-danger-small submission-reject-btn" data-submission-id="${submission.id}">
              Reject
            </button>
          </div>
        </div>
      `;
    }).join("");

    document.querySelectorAll(".submission-approve-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const submissionId = btn.dataset.submissionId;
        if (!submissionId) return;
        await approveSubmission(submissionId);
      });
    });

    document.querySelectorAll(".submission-correct-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const submissionId = btn.dataset.submissionId;
        if (!submissionId) return;
        await requestCorrection(submissionId);
      });
    });

    document.querySelectorAll(".submission-reject-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const submissionId = btn.dataset.submissionId;
        if (!submissionId) return;
        await rejectSubmission(submissionId);
      });
    });
  } catch (err) {
    console.error(err);
    submissionsList.innerHTML = `<p style="color:red;">Failed to load submissions: ${err?.message || err}</p>`;
  }
}

// =====================
// Load payments
// =====================
async function loadPayments() {
  if (!paymentsList) return;

  paymentsList.innerHTML = "<p>Loading payments...</p>";

  try {
    const q = query(collection(db, "payments"), orderBy("updatedAt", "desc"), limit(100));
    const snap = await getDocs(q);

    if (snap.empty) {
      paymentsList.innerHTML = "<p>No payments yet.</p>";
      return;
    }

    const payments = [];
    snap.forEach((d) => payments.push({ id: d.id, ...d.data() }));

    paymentsList.innerHTML = payments.map((payment) => `
      <div class="card" style="margin-bottom:16px; padding:16px;">
        <h3 style="margin:0 0 8px;">${escapeHtml(payment.jobTitle || "Payment Record")}</h3>
        <p><strong>Writer:</strong> ${escapeHtml(payment.writerName || "-")}</p>
        <p><strong>Email:</strong> ${escapeHtml(payment.writerEmail || "-")}</p>
        <p><strong>Amount:</strong> KES ${Number(payment.amount || 0).toLocaleString()}</p>
        <p><strong>Status:</strong> ${renderStatusBadge(payment.status || "pending_review")}</p>
        <p><strong>Updated:</strong> ${formatTimestamp(payment.updatedAt)}</p>

        ${
          payment.adminPaymentNote
            ? `
              <div style="margin-top:12px; padding:10px; border-radius:10px; background:#f9fafb; border:1px solid #e5e7eb;">
                <strong>Payment Note:</strong><br>
                ${escapeHtml(payment.adminPaymentNote)}
              </div>
            `
            : ""
        }

        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:16px;">
          <button class="btn-small mark-paid-btn" data-payment-id="${payment.id}">
            Mark as Paid
          </button>
        </div>
      </div>
    `).join("");

    document.querySelectorAll(".mark-paid-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const paymentId = btn.dataset.paymentId;
        if (!paymentId) return;
        await markPaymentPaid(paymentId);
      });
    });
  } catch (err) {
    console.error(err);
    paymentsList.innerHTML = `<p style="color:red;">Failed to load payments: ${err?.message || err}</p>`;
  }
}

// =====================
// Submission actions
// =====================
async function approveSubmission(submissionId) {
  try {
    const submissionRef = doc(db, "submissions", submissionId);
    const submissionSnap = await getDoc(submissionRef);

    if (!submissionSnap.exists()) {
      alert("Submission not found.");
      return;
    }

    const submission = { id: submissionSnap.id, ...submissionSnap.data() };
    const message = prompt("Optional approval message:", "Approved. Good work.") || "";

    await updateDoc(submissionRef, {
      status: "approved",
      adminMessage: message.trim(),
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await createOrUpdatePaymentForSubmission(submission, "approved_for_payment", "Submission approved and ready for payment.");

    alert("✅ Submission approved.");
    await loadSubmissions();
    await loadPayments();
  } catch (err) {
    console.error(err);
    alert(err?.message || "Failed to approve submission.");
  }
}

async function requestCorrection(submissionId) {
  try {
    const message = prompt("Enter correction message for the writer:");
    if (!message || !message.trim()) {
      alert("Correction message is required.");
      return;
    }

    await updateDoc(doc(db, "submissions", submissionId), {
      status: "correction_requested",
      adminMessage: message.trim(),
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    alert("✅ Correction requested.");
    await loadSubmissions();
  } catch (err) {
    console.error(err);
    alert(err?.message || "Failed to request correction.");
  }
}

async function rejectSubmission(submissionId) {
  try {
    const message = prompt("Enter rejection reason:");
    if (!message || !message.trim()) {
      alert("Rejection reason is required.");
      return;
    }

    await updateDoc(doc(db, "submissions", submissionId), {
      status: "rejected",
      adminMessage: message.trim(),
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    alert("✅ Submission rejected.");
    await loadSubmissions();
  } catch (err) {
    console.error(err);
    alert(err?.message || "Failed to reject submission.");
  }
}

async function createOrUpdatePaymentForSubmission(submission, status, note) {
  const existingQ = query(
    collection(db, "payments"),
    where("submissionId", "==", submission.id),
    limit(1)
  );

  const existingSnap = await getDocs(existingQ);
  const amount = Number(submission.jobPay || 0);

  const payload = {
    uid: submission.writerId,
    writerId: submission.writerId,
    writerEmail: submission.writerEmail || "",
    writerName: submission.writerName || "",
    jobId: submission.jobId || "",
    jobTitle: submission.jobTitle || "",
    submissionId: submission.id,
    amount,
    status,
    adminPaymentNote: note,
    updatedAt: serverTimestamp()
  };

  if (!existingSnap.empty) {
    const existingDoc = existingSnap.docs[0];
    await updateDoc(doc(db, "payments", existingDoc.id), payload);
    return existingDoc.id;
  }

  const ref = await addDoc(collection(db, "payments"), {
    ...payload,
    createdAt: serverTimestamp()
  });

  return ref.id;
}

async function markPaymentPaid(paymentId) {
  try {
    await updateDoc(doc(db, "payments", paymentId), {
      status: "paid",
      paidAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      adminPaymentNote: "Payment marked as paid by admin."
    });

    alert("✅ Payment marked as paid.");
    await loadPayments();
  } catch (err) {
    console.error(err);
    alert(err?.message || "Failed to mark payment as paid.");
  }
}

// =====================
// Legacy upload
// =====================
jobFileInput?.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!currentUploadJobId || files.length === 0) return;

  try {
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) {
        alert(`"${file.name}" is too large (max 50MB).`);
        continue;
      }

      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `jobs/${currentUploadJobId}/attachments/${Date.now()}_${safeName}`;

      const fileRef = storageRef(storage, path);
      const task = uploadBytesResumable(fileRef, file);

      await new Promise((resolve, reject) => {
        task.on("state_changed", null, reject, resolve);
      });

      const url = await getDownloadURL(fileRef);

      const attachment = {
        name: file.name,
        url,
        path,
        contentType: file.type || "",
        size: file.size,
        uploadedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, "jobs", currentUploadJobId), {
        attachments: arrayUnion(attachment)
      });
    }

    alert("✅ Files uploaded and linked to the job.");
    await loadJobs();
  } catch (err) {
    console.error(err);
    alert(err?.message || "Upload failed.");
  } finally {
    jobFileInput.value = "";
    currentUploadJobId = null;
  }
});

// =====================
// Create job attachments UI
// =====================
addFilesBtn?.addEventListener("click", () => createJobFiles?.click());

createJobFiles?.addEventListener("change", (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  pendingCreateFiles.push(...files);
  createJobFiles.value = "";
  renderCreateFilesList();
});

function renderCreateFilesList() {
  if (!createFilesList) return;

  if (pendingCreateFiles.length === 0) {
    createFilesList.innerHTML =
      `<span style="color:var(--gray);font-size:12px;">No files selected</span>`;
    return;
  }

  createFilesList.innerHTML = pendingCreateFiles
    .map(
      (f, i) => `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <span style="font-size:12px;">${escapeHtml(f.name)} (${Math.round(f.size / 1024)} KB)</span>
        <button type="button" class="btn-small" data-remove-index="${i}">Remove</button>
      </div>
    `
    )
    .join("");

  createFilesList.querySelectorAll("button[data-remove-index]").forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.removeIndex);
      pendingCreateFiles.splice(idx, 1);
      renderCreateFilesList();
    };
  });
}

// =====================
// Upload helper
// =====================
async function uploadAttachmentsForJob(jobId, files) {
  const uploaded = [];

  for (const file of files) {
    if (file.size > 50 * 1024 * 1024) {
      alert(`"${file.name}" is too large (max 50MB).`);
      continue;
    }

    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `jobs/${jobId}/attachments/${Date.now()}_${safeName}`;
    const fileRef = storageRef(storage, path);

    const task = uploadBytesResumable(fileRef, file);

    await new Promise((resolve, reject) => {
      task.on("state_changed", null, reject, resolve);
    });

    const url = await getDownloadURL(fileRef);

    uploaded.push({
      name: file.name,
      url,
      path,
      contentType: file.type || "",
      size: file.size,
      uploadedAt: new Date().toISOString()
    });
  }

  for (const att of uploaded) {
    await updateDoc(doc(db, "jobs", jobId), {
      attachments: arrayUnion(att)
    });
  }

  return uploaded.length;
}

// =====================
// Utilities
// =====================
function toDatetimeLocal(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function formatTimestamp(ts) {
  try {
    if (!ts) return "-";
    if (typeof ts.toDate === "function") {
      return ts.toDate().toLocaleString("en-KE");
    }
    if (ts?.seconds) {
      return new Date(ts.seconds * 1000).toLocaleString("en-KE");
    }
    return new Date(ts).toLocaleString("en-KE");
  } catch {
    return "-";
  }
}

function renderStatusBadge(status) {
  const s = String(status || "").toLowerCase();

  if (s === "approved") {
    return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#dcfce7;color:#166534;font-weight:700;">Approved</span>`;
  }
  if (s === "rejected") {
    return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#fee2e2;color:#991b1b;font-weight:700;">Rejected</span>`;
  }
  if (s === "correction_requested") {
    return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#fef3c7;color:#92400e;font-weight:700;">Correction Requested</span>`;
  }
  if (s === "approved_for_payment") {
    return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-weight:700;">Approved For Payment</span>`;
  }
  if (s === "paid") {
    return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#e0e7ff;color:#3730a3;font-weight:700;">Paid</span>`;
  }

  return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#e5e7eb;color:#111827;font-weight:700;">${escapeHtml(status || "Submitted")}</span>`;
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// =====================
// Initial loads
// =====================
await loadJobs();
await loadApplications();
await loadSubmissions();
await loadPayments();