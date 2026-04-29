// js/payment-confirmation.js
import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const pageStatus = document.getElementById("pageStatus");

const stkForm = document.getElementById("stkForm");
const stkPhone = document.getElementById("stkPhone");
const stkBtn = document.getElementById("stkBtn");
const stkStatus = document.getElementById("stkStatus");
const stkPhoneHelp = document.getElementById("stkPhoneHelp");

const AMOUNT = 500;
const STK_PUSH_URL = "https://us-central1-elite-writers.cloudfunctions.net/startStkPush";

// Kenya accepted formats for this UI: 2547XXXXXXXX or 2541XXXXXXXX
const KE_254_REGEX = /^254(7|1)\d{8}$/;

function cleanDigits(s) {
  return (s || "").replace(/[^\d]/g, "").trim();
}

function normalizePhoneKE(input) {
  const raw = (input || "").trim();
  const digits = cleanDigits(raw);

  if (!digits) return { normalized: "", reason: "empty" };

  if (raw.startsWith("+254")) {
    const n = digits;
    return KE_254_REGEX.test(n)
      ? { normalized: n, reason: "ok" }
      : { normalized: n, reason: "invalid" };
  }

  if (digits.startsWith("254")) {
    return KE_254_REGEX.test(digits)
      ? { normalized: digits, reason: "ok" }
      : { normalized: digits, reason: "invalid" };
  }

  if (digits.length === 10 && digits.startsWith("07")) {
    return { normalized: "254" + digits.slice(1), reason: "starts07" };
  }

  if (digits.length === 10 && digits.startsWith("01")) {
    return { normalized: "254" + digits.slice(1), reason: "starts01" };
  }

  return { normalized: digits, reason: "invalid" };
}

function setFieldMessage(el, msg, type = "hint") {
  if (!el) return;
  el.textContent = msg || "";
  el.dataset.type = type;
}

function setInputInvalid(inputEl, isInvalid) {
  if (!inputEl) return;
  if (isInvalid) inputEl.classList.add("is-invalid");
  else inputEl.classList.remove("is-invalid");
}

function setBtn(btn, loading, normalText, loadingText) {
  if (!btn) return;
  btn.disabled = !!loading;
  btn.textContent = loading ? loadingText : normalText;
}

function autoConvertOnBlur(inputEl, helpEl, btnEl) {
  if (!inputEl) return;

  inputEl.addEventListener("blur", () => {
    const { normalized, reason } = normalizePhoneKE(inputEl.value);

    if (reason === "starts07" || reason === "starts01") {
      inputEl.value = normalized;

      if (KE_254_REGEX.test(normalized)) {
        setInputInvalid(inputEl, false);
        setFieldMessage(helpEl, "Converted to international format (254…).", "success");
        if (btnEl) btnEl.disabled = false;
      } else {
        setInputInvalid(inputEl, true);
        setFieldMessage(helpEl, "Please confirm the number is correct (2547XXXXXXXX).", "error");
        if (btnEl) btnEl.disabled = true;
      }
    }
  });
}

function wirePhoneField(inputEl, helpEl, btnEl) {
  if (!inputEl) return;

  inputEl.setAttribute("inputmode", "numeric");

  inputEl.addEventListener("input", () => {
    const before = inputEl.value;
    const digits = cleanDigits(before);

    if (before !== digits) inputEl.value = digits;

    const { normalized, reason } = normalizePhoneKE(inputEl.value);

    if (reason === "starts07" || reason === "starts01") {
      setInputInvalid(inputEl, true);
      setFieldMessage(
        helpEl,
        "Start with 254… (example: 254712345678). We’ll convert after you leave the field.",
        "error"
      );
      if (btnEl) btnEl.disabled = true;
      return;
    }

    if (reason === "empty") {
      setInputInvalid(inputEl, false);
      setFieldMessage(helpEl, "", "hint");
      if (btnEl) btnEl.disabled = false;
      return;
    }

    if (KE_254_REGEX.test(normalized)) {
      setInputInvalid(inputEl, false);
      setFieldMessage(helpEl, "", "hint");
      if (btnEl) btnEl.disabled = false;
      return;
    }

    setInputInvalid(inputEl, true);
    setFieldMessage(helpEl, "Format: 2547XXXXXXXX or 2541XXXXXXXX.", "error");
    if (btnEl) btnEl.disabled = true;
  });

  autoConvertOnBlur(inputEl, helpEl, btnEl);
}

async function ensureUserDoc(uid, baseData = {}) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      ...baseData,
      paymentStatus: "unpaid",
      createdAt: serverTimestamp()
    });

    const newSnap = await getDoc(ref);
    return newSnap.data();
  }

  return snap.data();
}

wirePhoneField(stkPhone, stkPhoneHelp, stkBtn);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {
    if (pageStatus) {
      pageStatus.textContent = "Loading your payment status...";
    }

    const userData = await ensureUserDoc(user.uid, {
      email: user.email || ""
    });

    if (userData?.phone && stkPhone) {
      stkPhone.value = cleanDigits(userData.phone);
    }

    if (userData?.paymentStatus === "paid") {
      if (pageStatus) {
        pageStatus.innerHTML = "✅ Payment already confirmed. Redirecting to dashboard...";
      }
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 1200);
      return;
    }

    if (userData?.paymentStatus === "pending") {
      if (pageStatus) {
        pageStatus.textContent =
          "⏳ Payment pending. If you already paid, wait for confirmation or try STK again.";
      }
      return;
    }

    if (pageStatus) {
      pageStatus.textContent = "Payment not completed yet. Please use STK Push below.";
    }
  } catch (err) {
    console.error("Failed to load payment page:", err);
    if (pageStatus) {
      pageStatus.textContent = "❌ Failed to load payment details. Please refresh the page.";
    }
  }
});

/**
 * STK PUSH (Registration payment)
 */
if (stkForm) {
  stkForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (stkStatus) stkStatus.textContent = "";

    const user = auth.currentUser;

    if (!user || !user.uid) {
      if (stkStatus) stkStatus.textContent = "❌ User is not authenticated. Please log in again.";
      return;
    }

    const { normalized, reason } = normalizePhoneKE(stkPhone?.value);

    if (!normalized || !KE_254_REGEX.test(normalized)) {
      setInputInvalid(stkPhone, true);

      if (reason === "starts07" || reason === "starts01") {
        setFieldMessage(
          stkPhoneHelp,
          "Start with 254… (example: 254712345678).",
          "error"
        );
      } else {
        setFieldMessage(
          stkPhoneHelp,
          "Enter a valid number in format 2547XXXXXXXX or 2541XXXXXXXX.",
          "error"
        );
      }

      if (stkStatus) stkStatus.textContent = "❌ Please correct the phone number.";
      return;
    }

    setInputInvalid(stkPhone, false);
    setFieldMessage(stkPhoneHelp, "", "hint");
    setBtn(stkBtn, true, "Pay KES 500 Now (STK)", "Sending STK...");

    if (stkStatus) {
      stkStatus.textContent = "Requesting STK Push...";
    }

    try {
      // Save phone locally and mark as pending before STK request
      await updateDoc(doc(db, "users", user.uid), {
        phone: normalized,
        paymentStatus: "pending",
        updatedAt: serverTimestamp()
      });

      const response = await fetch(STK_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          phone: normalized,
          uid: user.uid,
          amount: AMOUNT
        })
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        const errorMsg =
          data?.error ||
          data?.details ||
          `Server error: ${response.status}`;
        throw new Error(errorMsg);
      }

      // Backend now owns registration_payments creation.
      // Frontend should not create a duplicate record.
      await updateDoc(doc(db, "users", user.uid), {
        paymentStatus: "pending",
        paymentMethod: "stk",
        paymentPhone: normalized,
        checkoutRequestId: data?.checkoutRequestId || data?.CheckoutRequestID || null,
        merchantRequestId: data?.merchantRequestId || data?.MerchantRequestID || null,
        updatedAt: serverTimestamp()
      });

      if (stkStatus) {
        stkStatus.textContent =
          "✅ STK sent. Check your phone and enter your M-Pesa PIN to complete.";
      }

      setBtn(stkBtn, false, "STK Sent ✅", "Sending STK...");
    } catch (err) {
      console.error("STK Push error:", err);

      // Revert pending state only if STK request itself failed
      try {
        await updateDoc(doc(db, "users", user.uid), {
          paymentStatus: "unpaid",
          paymentLastError: err?.message || "Failed to send STK",
          updatedAt: serverTimestamp()
        });
      } catch (updateErr) {
        console.error("Failed to reset user payment status:", updateErr);
      }

      if (stkStatus) {
        stkStatus.textContent =
          "❌ Failed to send STK: " + (err?.message || "Unknown error");
      }

      setBtn(stkBtn, false, "Pay KES 500 Now (STK)", "Sending STK...");
    }
  });
}