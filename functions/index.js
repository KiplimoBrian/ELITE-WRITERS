/**
 * Firebase Cloud Functions (v2)
 * Elite Writers Project - Production M-Pesa STK Push
 */

const { setGlobalOptions } = require("firebase-functions/v2");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { defineSecret, defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

setGlobalOptions({
  maxInstances: 10,
  region: "us-central1",
});

// =========================
// CONFIG
// =========================

const MPESA_CONSUMER_KEY = defineSecret("MPESA_CONSUMER_KEY");
const MPESA_CONSUMER_SECRET = defineSecret("MPESA_CONSUMER_SECRET");
const MPESA_PASS_KEY = defineSecret("MPESA_PASS_KEY");
const MPESA_SHORTCODE = defineSecret("MPESA_SHORTCODE");

const MPESA_CALLBACK_BASE = defineString("MPESA_CALLBACK_BASE", {
  default: "https://us-central1-elite-writers.cloudfunctions.net",
});

const MPESA_TRANSACTION_TYPE = defineString("MPESA_TRANSACTION_TYPE", {
  default: "CustomerBuyGoodsOnline",
});

const MPESA_ACCOUNT_REFERENCE = defineString("MPESA_ACCOUNT_REFERENCE", {
  default: "EliteWriters",
});

const MPESA_TRANSACTION_DESC = defineString("MPESA_TRANSACTION_DESC", {
  default: "Registration Fee",
});

// =========================
// HELPERS
// =========================

function setCors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function getTimestamp() {
  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, "0");
  const DD = String(now.getDate()).padStart(2, "0");
  const HH = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${YYYY}${MM}${DD}${HH}${mm}${ss}`;
}

function normalizePhoneKE(phone) {
  const digits = String(phone || "").replace(/[^\d]/g, "").trim();

  if (!digits) return "";
  if (/^254(7|1)\d{8}$/.test(digits)) return digits;
  if (/^0(7|1)\d{8}$/.test(digits)) return `254${digits.slice(1)}`;

  return "";
}

async function getAccessToken() {
  const consumerKey = MPESA_CONSUMER_KEY.value().trim();
  const consumerSecret = MPESA_CONSUMER_SECRET.value().trim();

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  const response = await axios.get(
    "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${auth}`,
      },
      timeout: 30000,
    }
  );

  if (!response.data?.access_token) {
    throw new Error("No M-Pesa access token returned");
  }

  return response.data.access_token;
}

function getStkPassword(shortcode, passkey, timestamp) {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
}

// =========================
// HEALTH CHECK
// =========================

exports.healthCheck = onRequest((req, res) => {
  logger.info("Health check endpoint hit");
  res.status(200).json({
    status: "ok",
    service: "Elite Writers Functions",
    timestamp: new Date().toISOString(),
  });
});

// =========================
// TOKEN TEST
// =========================

exports.testMpesaToken = onRequest(
  {
    secrets: [MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET],
  },
  async (req, res) => {
    try {
      const accessToken = await getAccessToken();
      return res.status(200).json({
        ok: true,
        hasAccessToken: !!accessToken,
      });
    } catch (err) {
      logger.error("TOKEN TEST ERROR", {
        message: err.message || null,
        status: err.response?.status || null,
        response: err.response?.data || null,
        stack: err.stack || null,
      });

      return res.status(err.response?.status || 500).json({
        ok: false,
        error: "Token test failed",
        details:
          typeof err.response?.data === "string"
            ? err.response.data
            : err.response?.data || err.message || "Unknown error",
      });
    }
  }
);

// =========================
// START STK PUSH
// =========================

exports.startStkPush = onRequest(
  {
    secrets: [
      MPESA_CONSUMER_KEY,
      MPESA_CONSUMER_SECRET,
      MPESA_PASS_KEY,
      MPESA_SHORTCODE,
    ],
  },
  async (req, res) => {
    setCors(res);

    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    try {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Use POST" });
      }

      const { phone, uid, amount = 500 } = req.body || {};

      if (!uid || typeof uid !== "string" || !uid.trim()) {
        return res.status(400).json({ error: "uid is required" });
      }

      if (!phone) {
        return res.status(400).json({ error: "Phone required (e.g. 254712345678)" });
      }

      const normalizedPhone = normalizePhoneKE(phone);
      if (!normalizedPhone) {
        return res.status(400).json({
          error: "Invalid phone format - use 2547XXXXXXXX or 2541XXXXXXXX",
        });
      }

      if (!Number.isInteger(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ error: "Amount must be positive integer" });
      }

      const cleanUid = uid.trim();

      // Confirm the user exists before starting STK push
      const userRef = db.collection("users").doc(cleanUid);
      const userSnap = await userRef.get();

      if (!userSnap.exists) {
        return res.status(404).json({ error: "User not found for supplied uid" });
      }

      // Main shortcode credentials
      const shortcode = "4564397";
      const partyB = "3244131";
      const passkey = MPESA_PASS_KEY.value().trim();

      const callbackBase = MPESA_CALLBACK_BASE.value().trim().replace(/\/$/, "");
      const callbackUrl = `${callbackBase}/stkCallback`;

      const timestamp = getTimestamp();

      // IMPORTANT: password uses BusinessShortCode, not PartyB
      const password = getStkPassword(shortcode, passkey, timestamp);

      // 1) Get production access token
      const accessToken = await getAccessToken();

      // 2) Send production STK push
      const stkPayload = {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: MPESA_TRANSACTION_TYPE.value().trim(),
        Amount: Number(amount),
        PartyA: normalizedPhone,
        PartyB: partyB,
        PhoneNumber: normalizedPhone,
        CallBackURL: callbackUrl,
        AccountReference: MPESA_ACCOUNT_REFERENCE.value().trim(),
        TransactionDesc: MPESA_TRANSACTION_DESC.value().trim(),
      };

      logger.info("Sending mapped STK push", {
        uid: cleanUid,
        phone: normalizedPhone,
        amount: Number(amount),
        BusinessShortCode: stkPayload.BusinessShortCode,
        PartyB: stkPayload.PartyB,
        TransactionType: stkPayload.TransactionType,
        callbackUrl,
      });

      const stkRes = await axios.post(
        "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
        stkPayload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );

      logger.info("STK API ACK", stkRes.data);

      const checkoutRequestId = stkRes.data?.CheckoutRequestID || null;
      const merchantRequestId = stkRes.data?.MerchantRequestID || null;

      // Create payment record immediately so callback can match it later
      if (checkoutRequestId) {
        await db.collection("registration_payments").doc(checkoutRequestId).set({
          uid: cleanUid,
          method: "stk",
          phone: normalizedPhone,
          amount: Number(amount),
          status: "pending",
          checkoutRequestId,
          merchantRequestId,
          callbackReceived: false,
          callbackResultCode: null,
          callbackResultDesc: null,
          mpesaReceiptNumber: null,
          paidAmount: null,
          paidPhone: null,
          transactionDate: null,
          environment: "production",
          source: "startStkPush",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Optional: update user to pending immediately
      await userRef.set(
        {
          paymentStatus: "pending",
          paymentMethod: "stk",
          paymentPhone: normalizedPhone,
          checkoutRequestId,
          merchantRequestId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return res.json({
        ...stkRes.data,
        uid: cleanUid,
        checkoutRequestId,
        merchantRequestId,
      });
    } catch (err) {
      logger.error("STK ERROR", {
        message: err.message,
        status: err.response?.status || null,
        response: err.response?.data || null,
        stack: err.stack?.slice(0, 500),
      });

      return res.status(err.response?.status || 500).json({
        error: "STK push failed",
        details: err.response?.data || err.message || "unknown error",
      });
    }
  }
);

// =========================
// STK CALLBACK
// =========================

exports.stkCallback = onRequest(async (req, res) => {
  try {
    const body = req.body || {};
    logger.info("STK CALLBACK HIT", body);

    const callback =
      body?.Body?.stkCallback ||
      body?.body?.stkCallback ||
      null;

    if (!callback) {
      logger.warn("Invalid callback payload", body);
      return res.status(200).json({ ok: true });
    }

    const merchantRequestId = callback.MerchantRequestID || null;
    const checkoutRequestId = callback.CheckoutRequestID || null;
    const resultCode = callback.ResultCode;
    const resultDesc = callback.ResultDesc || null;
    const metadataItems = callback.CallbackMetadata?.Item || [];

    const metadata = {};
    for (const item of metadataItems) {
      if (item?.Name) {
        metadata[item.Name] = item.Value ?? null;
      }
    }

    const receiptNumber = metadata.MpesaReceiptNumber || null;
    const transactionDate = metadata.TransactionDate || null;
    const amount = metadata.Amount || null;
    const phoneNumber = metadata.PhoneNumber ? String(metadata.PhoneNumber) : null;

    logger.info("STK CALLBACK RESULT", {
      merchantRequestId,
      checkoutRequestId,
      resultCode,
      resultDesc,
      metadata,
    });

    const paymentRef = checkoutRequestId
      ? db.collection("registration_payments").doc(checkoutRequestId)
      : null;

    const paymentSnap = paymentRef ? await paymentRef.get() : null;
    const paymentExists = !!paymentSnap?.exists;
    const paymentData = paymentExists ? paymentSnap.data() : null;

    const newStatus = Number(resultCode) === 0 ? "paid" : "failed";

    if (paymentRef && paymentExists) {
      await paymentRef.set(
        {
          status: newStatus,
          callbackReceived: true,
          merchantRequestId,
          checkoutRequestId,
          mpesaReceiptNumber: receiptNumber,
          callbackResultCode: resultCode,
          callbackResultDesc: resultDesc,
          callbackMetadata: metadata,
          paidAmount: amount,
          paidPhone: phoneNumber,
          transactionDate: transactionDate,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else if (paymentRef && !paymentExists) {
      await paymentRef.set({
        uid: null,
        method: "stk",
        phone: phoneNumber,
        amount: amount,
        status: newStatus,
        checkoutRequestId,
        merchantRequestId,
        mpesaReceiptNumber: receiptNumber,
        callbackResultCode: resultCode,
        callbackResultDesc: resultDesc,
        callbackMetadata: metadata,
        callbackReceived: true,
        paidAmount: amount,
        paidPhone: phoneNumber,
        transactionDate: transactionDate,
        source: "stkCallback_unmatched",
        environment: "production",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Update exact user if uid exists on matched payment
    if (paymentData?.uid) {
      const userRef = db.collection("users").doc(paymentData.uid);

      if (Number(resultCode) === 0) {
        await userRef.set(
          {
            paymentStatus: "paid",
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
            paymentMethod: "stk",
            paymentPhone: phoneNumber || paymentData.phone || null,
            mpesaReceiptNumber: receiptNumber,
            checkoutRequestId,
            merchantRequestId,
          },
          { merge: true }
        );
      } else {
        await userRef.set(
          {
            paymentStatus: "unpaid",
            paymentLastError: resultDesc || "Payment failed or cancelled",
            paymentLastErrorCode: resultCode,
            checkoutRequestId,
            merchantRequestId,
          },
          { merge: true }
        );
      }
    } else if (Number(resultCode) === 0) {
      logger.error("Successful payment callback but no uid found on payment record", {
        checkoutRequestId,
        merchantRequestId,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    logger.error("CALLBACK ERROR", {
      message: err.message || null,
      response: err.response?.data || null,
      stack: err.stack || null,
    });

    return res.status(200).json({ ok: true });
  }
});