const admin = require("firebase-admin");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

admin.initializeApp();
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const REGION = "me-central2";

const COUNTED_STATUSES = new Set(["signed", "active", "completed"]);
const PENDING_STATUSES = new Set(["pending", "pending_contract", "signing"]);
const OFFICIAL_STATUSES = new Set([
  "pending",
  "pending_contract",
  "signing",
  "signed",
  "active",
  "completed",
  "rejected",
  "cancelled",
]);

const toNumberSafe = (v) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const normalizeStatus = (inv) => {
  const raw = String(inv?.status ?? "").trim().toLowerCase();

  if (OFFICIAL_STATUSES.has(raw)) return { status: raw, update: false };

  if (raw === "approved") {
    const next = inv?.finalizedAt ? "active" : "signed";
    return { status: next, update: true };
  }

  if (raw === "pending_review") {
    return { status: "pending", update: true };
  }

  return { status: null, update: false };
};

const isAdminUid = async (uid) => {
  if (!uid) return false;
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) return false;
  const role = String(snap.data()?.role || "").toLowerCase();
  return role === "admin" || role === "owner";
};

const recomputeProjectAggregates = async (projectId) => {
  const pid = String(projectId || "").trim();
  if (!pid) return null;

  const projectRef = db.doc(`projects/${pid}`);
  const projectSnap = await projectRef.get();
  if (!projectSnap.exists) return null;

  const invSnap = await db
    .collection("investments")
    .where("projectId", "==", pid)
    .get();

  let currentAmount = 0;
  let pendingAmount = 0;
  const investors = new Set();
  const legacyUpdates = [];

  invSnap.forEach((docSnap) => {
    const inv = docSnap.data() || {};
    const { status, update } = normalizeStatus(inv);
    if (update && status) legacyUpdates.push({ ref: docSnap.ref, status });

    if (!status) return;

    const amount = toNumberSafe(inv.amount);
    if (COUNTED_STATUSES.has(status)) {
      currentAmount += amount;
      if (inv.investorUid) investors.add(String(inv.investorUid));
    } else if (PENDING_STATUSES.has(status)) {
      pendingAmount += amount;
    }
  });

  if (legacyUpdates.length) {
    const batch = db.batch();
    legacyUpdates.forEach((u) => {
      batch.update(u.ref, {
        status: u.status,
        __skipAggregates: true,
        updatedAt: FieldValue.serverTimestamp(),
      });      
    });
    await batch.commit();
  }

  await projectRef.set(
    {
      currentAmount,
      investorsCount: investors.size,
      pendingAmount,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { projectId: pid, currentAmount, pendingAmount, investorsCount: investors.size };
};

exports.recomputeProjectAggregates = onCall({ region: REGION }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const isAdmin = await isAdminUid(request.auth.uid);
  if (!isAdmin) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }

  const projectId = String(request.data?.projectId || "").trim();
  if (!projectId) {
    throw new HttpsError("invalid-argument", "projectId is required.");
  }

  const result = await recomputeProjectAggregates(projectId);
  return { ok: true, result };
});

// Optional: admin-only full backfill
exports.recomputeAllProjectAggregates = onCall({ region: REGION }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const isAdmin = await isAdminUid(request.auth.uid);
  if (!isAdmin) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }

  const projectsSnap = await db.collection("projects").get();
  const results = [];
  for (const docSnap of projectsSnap.docs) {
    const r = await recomputeProjectAggregates(docSnap.id);
    if (r) results.push(r);
  }

  return { ok: true, count: results.length };
});

exports.onInvestmentWrite = onDocumentWritten(
  { region: REGION, document: "investments/{investmentId}" },
  async (event) => {
    const before = event.data?.before?.data() || null;
    const after = event.data?.after?.data() || null;

    // ✅ ignore internal normalization writes
    if (after?.__skipAggregates === true) return;

    if (!before && !after) return;

    const hasChanged =
      !before ||
      !after ||
      String(before.projectId || "") !== String(after.projectId || "") ||
      String(before.status || "") !== String(after.status || "") ||
      String(before.investorUid || "") !== String(after.investorUid || "") ||
      toNumberSafe(before.amount) !== toNumberSafe(after.amount) ||
      String(before.finalizedAt || "") !== String(after.finalizedAt || "");

    if (!hasChanged) return;

    const projectIds = new Set();
    if (before?.projectId) projectIds.add(String(before.projectId));
    if (after?.projectId) projectIds.add(String(after.projectId));

    if (!projectIds.size) return;

    await Promise.all(
      Array.from(projectIds).map((pid) => recomputeProjectAggregates(pid))
    );
  }
);
