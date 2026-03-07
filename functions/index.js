const admin = require("firebase-admin");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onUserCreated } = require("firebase-functions/v2/auth");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

admin.initializeApp();
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const REGION = "me-central2";

// ✅ vNext Contract: countedStatuses = [active, completed]
const COUNTED_STATUSES = new Set(["active", "completed"]);

// (Optional) keep pending tracking if you want it in project doc
const PENDING_STATUSES = new Set(["pending", "pending_contract", "signing"]);

// official statuses list (as per settings)
const OFFICIAL_STATUSES = new Set([
  "pending",
  "pending_contract",
  "signing",
  "approved",
  "signed",
  "active",
  "completed",
  "rejected",
  "cancelled",
]);

// ✅ roles whitelist
const ALLOWED_ROLES = new Set(["client", "owner", "admin", "accountant", "staff"]);

const toNumberSafe = (v) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

// ✅ Aggregates Policy: amountCounted = approvedAmount ?? amount
const amountCounted = (inv) => {
  const approved = inv?.approvedAmount;
  if (approved !== undefined && approved !== null) return toNumberSafe(approved);
  return toNumberSafe(inv?.amount);
};

const normalizeStatus = (inv) => {
  const raw = String(inv?.status ?? "").trim().toLowerCase();

  if (OFFICIAL_STATUSES.has(raw)) return { status: raw, update: false };

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
  let pendingAmount = 0; // optional
  const investors = new Set();

  invSnap.forEach((docSnap) => {
    const inv = docSnap.data() || {};
    const { status } = normalizeStatus(inv);

    if (!status) return;

    const amt = amountCounted(inv);

    // ✅ vNext: only active/completed are counted
    if (COUNTED_STATUSES.has(status)) {
      currentAmount += amt;
      if (inv.investorUid) investors.add(String(inv.investorUid));
    } else if (PENDING_STATUSES.has(status)) {
      pendingAmount += amt;
    }
  });

  await projectRef.set(
    {
      currentAmount,
      investorsCount: investors.size,
      // optional field (safe to keep)
      pendingAmount,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    projectId: pid,
    currentAmount,
    pendingAmount,
    investorsCount: investors.size,
  };
};

// ✅ Admin-only callable recompute for one project
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

// ✅ Admin-only full backfill
const runRecomputeAllProjects = async () => {
  const projectsSnap = await db.collection("projects").get();
  const results = [];
  for (const docSnap of projectsSnap.docs) {
    const r = await recomputeProjectAggregates(docSnap.id);
    if (r) results.push(r);
  }
  return results;
};

const adminRecomputeAllProjectsHandler = async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const isAdmin = await isAdminUid(request.auth.uid);
  if (!isAdmin) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }

  const results = await runRecomputeAllProjects();
  return { ok: true, count: results.length };
};

exports.recomputeAllProjectAggregates = onCall(
  { region: REGION },
  adminRecomputeAllProjectsHandler
);

// ✅ Temporary admin callable for one-time legacy backfill after flow change.
exports.adminRecomputeAllProjects = onCall(
  { region: REGION },
  adminRecomputeAllProjectsHandler
);

/**
 * ✅ Auth trigger:
 * Create users/{uid} automatically
 * + Apply role_invites/{emailLower} if exists and active
 * + Consume invite after use (isActive=false)
 */
exports.onAuthCreateUserProfile = onUserCreated({ region: "us-central1" }, async (event) => {
  const user = event.data;
  if (!user?.uid) return;

  const userRef = db.doc(`users/${user.uid}`);
  const snap = await userRef.get();
  if (snap.exists) return;

  // defaults
  let role = "client";
  let isInvestor = false;

  const emailLower = String(user.email || "").trim().toLowerCase();
  let inviteApplied = false;

  // ✅ apply invite by email
  if (emailLower) {
    const invRef = db.doc(`role_invites/${emailLower}`);
    const invSnap = await invRef.get();
    const inv = invSnap.exists ? invSnap.data() : null;

    if (inv?.isActive && inv?.roleKey) {
      role = String(inv.roleKey).trim().toLowerCase();
      if (!ALLOWED_ROLES.has(role)) role = "client";

      if (typeof inv?.isInvestor === "boolean") isInvestor = inv.isInvestor;

      inviteApplied = true;
    }
  }

  await userRef.set(
    {
      role,
      email: user.email || "",
      displayName: user.displayName || "",
      phone: user.phoneNumber || "",
      isInvestor,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      source: inviteApplied ? "auth_trigger_invite_check" : "auth_trigger",
      roleKeySource: inviteApplied ? "role_invites" : "default",
    },
    { merge: true }
  );

  // ✅ consume invite
  if (inviteApplied && emailLower) {
    const invRef = db.doc(`role_invites/${emailLower}`);
    await invRef.set(
      {
        isActive: false,
        usedAt: FieldValue.serverTimestamp(),
        usedByUid: user.uid,
      },
      { merge: true }
    );
  }
});

// ✅ Auto recompute on investment writes (create/update/delete)
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
      toNumberSafe(before.approvedAmount) !== toNumberSafe(after.approvedAmount);

    if (!hasChanged) return;

    const projectIds = new Set();
    if (before?.projectId) projectIds.add(String(before.projectId));
    if (after?.projectId) projectIds.add(String(after.projectId));

    if (!projectIds.size) return;

    await Promise.all(Array.from(projectIds).map((pid) => recomputeProjectAggregates(pid)));
  }
);

function getR2Env() {
  const accountId = String(process.env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || "").trim();
  const bucketName = String(process.env.R2_BUCKET_NAME || "").trim();

  if (!accountId) throw new Error("Missing R2_ACCOUNT_ID");
  if (!accessKeyId) throw new Error("Missing R2_ACCESS_KEY_ID");
  if (!secretAccessKey) throw new Error("Missing R2_SECRET_ACCESS_KEY");
  if (!bucketName) throw new Error("Missing R2_BUCKET_NAME");

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

function getR2Client() {
  const { endpoint, accessKeyId, secretAccessKey } = getR2Env();

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

function normalizeInvestmentId(value) {
  const id = String(value || "").trim();
  if (!id) return "";
  return /^[A-Za-z0-9_-]+$/.test(id) ? id : "";
}

function normalizeUploadKind(value) {
  const kind = String(value || "").trim().toLowerCase();
  return ["original", "signed", "attachment"].includes(kind) ? kind : "";
}

function expectedContractPath(investmentId, kind) {
  if (kind === "original") return `contracts/${investmentId}/original.pdf`;
  if (kind === "signed") return `contracts/${investmentId}/signed.pdf`;
  return "";
}

function normalizeAttachmentPath(path, investmentId) {
  const raw = String(path || "").trim().replace(/^\/+/, "");
  const prefix = `contracts/${investmentId}/attachments/`;
  if (!raw.startsWith(prefix)) return "";
  if (raw.includes("..") || raw.includes("\\")) return "";
  return raw;
}

async function applyInvestmentContractMetadata({
  investmentId,
  kind,
  path,
  fileName,
  contentType,
  uploadedBy,
  bucketName,
}) {
  const invRef = db.doc(`investments/${investmentId}`);
  const invSnap = await invRef.get();

  if (!invSnap.exists) {
    throw new HttpsError("not-found", "Investment not found.");
  }

  const inv = invSnap.data() || {};
  const investorUid = String(inv.investorUid || "");
  const isAdmin = await isAdminUid(uploadedBy);
  const isOwnerInvestor = investorUid && investorUid === uploadedBy;

  if (!isAdmin && !isOwnerInvestor) {
    throw new HttpsError("permission-denied", "You cannot upload files for this investment.");
  }

  if (kind === "original" && !isAdmin) {
    throw new HttpsError("permission-denied", "Only admin can upload original contract.");
  }

  let finalPath = String(path || "").trim();
  if (kind === "original" || kind === "signed") {
    const expectedPath = expectedContractPath(investmentId, kind);
    if (finalPath !== expectedPath) {
      throw new HttpsError("invalid-argument", "Invalid contract path.");
    }
  } else {
    finalPath = normalizeAttachmentPath(finalPath, investmentId);
    if (!finalPath) {
      throw new HttpsError("invalid-argument", "Invalid attachment path.");
    }
  }

  const now = FieldValue.serverTimestamp();
  const safeFileName = String(fileName || "").trim() || "contract.pdf";
  const safeContentType = String(contentType || "application/pdf").trim() || "application/pdf";

  const commonFields = {
    updatedAt: now,
    lastDocumentUploadAt: now,
    lastDocumentUploadBy: uploadedBy,
  };

  const withBucket = bucketName ? { bucket: bucketName } : {};
  const updatePayload = {
    ...commonFields,
  };

  if (kind === "original") {
    updatePayload.originalContract = {
      path: finalPath,
      uploadedAt: now,
      uploadedBy,
    };
    updatePayload.contractFile = {
      ...withBucket,
      path: finalPath,
      fileName: safeFileName,
      contentType: safeContentType,
      uploadedAt: now,
      uploadedBy,
    };
    updatePayload.contractStatus = "sent";
    updatePayload.status = "pending_contract";
  } else if (kind === "signed") {
    updatePayload.signedContract = {
      path: finalPath,
      uploadedAt: now,
      uploadedBy,
    };
    updatePayload.signedContractFile = {
      ...withBucket,
      path: finalPath,
      fileName: safeFileName,
      contentType: safeContentType,
      uploadedAt: now,
      uploadedBy,
    };
    updatePayload.contractStatus = "signed";
    updatePayload.status = "signed";
  } else {
    updatePayload.lastAttachmentFile = {
      ...withBucket,
      path: finalPath,
      fileName: safeFileName,
      contentType: safeContentType,
      uploadedAt: now,
      uploadedBy,
    };
  }

  await invRef.set(updatePayload, { merge: true });

  return {
    ok: true,
    path: finalPath,
    kind,
  };
}

exports.uploadContractToR2 = onCall({ region: REGION }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const data = request.data || {};
  const investmentId = normalizeInvestmentId(data.investmentId);
  const kind = normalizeUploadKind(data.kind || "original");
  const fileName = String(data.fileName || "").trim() || "contract.pdf";
  const base64 = String(data.base64 || "").trim();
  const contentType = String(data.contentType || "application/pdf").trim().toLowerCase();

  if (!investmentId) {
    throw new HttpsError("invalid-argument", "investmentId is required.");
  }

  if (!base64) {
    throw new HttpsError("invalid-argument", "base64 is required.");
  }

  if (!kind) {
    throw new HttpsError("invalid-argument", "Invalid kind.");
  }

  if ((kind === "original" || kind === "signed") && contentType !== "application/pdf") {
    throw new HttpsError("invalid-argument", "Contract files must be PDF.");
  }

  let objectKey = "";
  if (kind === "original") {
    objectKey = expectedContractPath(investmentId, "original");
  } else if (kind === "signed") {
    objectKey = expectedContractPath(investmentId, "signed");
  } else {
    const safeName = fileName.replace(/[^\w.\-]+/g, "_");
    objectKey = `contracts/${investmentId}/attachments/${Date.now()}_${safeName}`;
  }

  try {
    const { bucketName } = getR2Env();
    const client = getR2Client();
    const buffer = Buffer.from(base64, "base64");

    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: buffer,
        ContentType: contentType,
      })
    );

    await applyInvestmentContractMetadata({
      investmentId,
      kind,
      path: objectKey,
      fileName,
      contentType,
      uploadedBy: String(request.auth.uid || ""),
      bucketName,
    });

    return {
      ok: true,
      bucket: bucketName,
      path: objectKey,
      fileName,
      kind,
    };
  } catch (error) {
    console.error("uploadContractToR2 failed:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Failed to upload file to R2.");
  }
});

exports.syncInvestmentContractMetadata = onCall({ region: REGION }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const data = request.data || {};
  const investmentId = normalizeInvestmentId(data.investmentId);
  const kind = normalizeUploadKind(data.kind);
  const path = String(data.path || "").trim();
  const fileName = String(data.fileName || "").trim() || "contract.pdf";
  const contentType = String(data.contentType || "application/pdf").trim().toLowerCase();

  if (!investmentId) {
    throw new HttpsError("invalid-argument", "investmentId is required.");
  }

  if (!kind) {
    throw new HttpsError("invalid-argument", "Invalid kind.");
  }

  if (!path) {
    throw new HttpsError("invalid-argument", "path is required.");
  }

  if ((kind === "original" || kind === "signed") && contentType !== "application/pdf") {
    throw new HttpsError("invalid-argument", "Contract files must be PDF.");
  }

  const result = await applyInvestmentContractMetadata({
    investmentId,
    kind,
    path,
    fileName,
    contentType,
    uploadedBy: String(request.auth.uid || ""),
    bucketName: "",
  });

  return {
    ok: true,
    kind: result.kind,
    path: result.path,
  };
});
