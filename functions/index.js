const admin = require("firebase-admin");
const {
  onDocumentCreated,
  onDocumentWritten,
} = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onUserCreated } = require("firebase-functions/v2/auth");
const { Resend } = require("resend");
const {
  diffAuditSnapshots,
  safeWriteAuditLog,
  writeAuditLogEntry,
} = require("./audit");

admin.initializeApp();
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const REGION = "me-central2";
const SYSTEM_ACTOR = {
  uid: "system",
  name: "System",
  email: "",
  role: "system",
};
const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  email: true,
  sms: false,
  investments: true,
  messages: true,
});
const ADMIN_MESSAGES_PATH = "/admin/messages";
const EMAIL_PREVIEW_LIMIT = 220;
const EMAIL_TIMEZONE = "Asia/Riyadh";

// ✅ vNext Contract: countedStatuses = [active, stopped, completed]
const COUNTED_STATUSES = new Set(["active", "stopped", "completed"]);

// (Optional) keep pending tracking if you want it in project doc
const PENDING_STATUSES = new Set([
  "pending",
  "pending_contract",
  "signing",
  "signed",
  "approved",
]);

// official statuses list (as per settings)
const OFFICIAL_STATUSES = new Set([
  "pending",
  "pending_contract",
  "signing",
  "approved",
  "signed",
  "active",
  "stopped",
  "completed",
  "rejected",
  "cancelled",
]);

// ✅ roles whitelist
const ALLOWED_ROLES = new Set([
  "client",
  "owner",
  "admin",
  "accountant",
  "staff",
]);

const toNumberSafe = v => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

// ✅ Aggregates Policy: amountCounted = approvedAmount ?? amount
const amountCounted = inv => {
  const approved = inv?.approvedAmount;
  if (approved !== undefined && approved !== null)
    return toNumberSafe(approved);
  return toNumberSafe(inv?.amount);
};

const normalizeStatus = inv => {
  const raw = String(inv?.status ?? "")
    .trim()
    .toLowerCase();

  if (OFFICIAL_STATUSES.has(raw)) return { status: raw, update: false };

  return { status: null, update: false };
};

const ACTIVE_TRUE_VALUES = new Set(["active", "enabled", "true", "1", "yes"]);
const ACTIVE_FALSE_VALUES = new Set([
  "inactive",
  "disabled",
  "false",
  "0",
  "no",
]);

const parseUserActiveValue = value => {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;

  if (ACTIVE_TRUE_VALUES.has(normalized)) return true;
  if (ACTIVE_FALSE_VALUES.has(normalized)) return false;

  return null;
};

const resolveUserActive = data => {
  const direct = parseUserActiveValue(data?.active);
  if (direct !== null) return direct;

  const legacyFlag = parseUserActiveValue(data?.isActive);
  if (legacyFlag !== null) return legacyFlag;

  const legacyStatus = parseUserActiveValue(data?.status);
  if (legacyStatus !== null) return legacyStatus;

  return true;
};

const normalizeStringArray = value =>
  Array.isArray(value)
    ? value
        .filter(entry => typeof entry === "string")
        .map(entry => entry.trim())
        .filter(Boolean)
    : [];

const getUserRole = async uid => {
  if (!uid) return "guest";
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) return "guest";
  return String(snap.data()?.role || "guest").toLowerCase();
};

const isAdminUid = async uid => {
  const role = await getUserRole(uid);
  return role === "admin" || role === "owner";
};

const isOpsRole = role =>
  ["owner", "admin", "accountant", "staff"].includes(
    String(role || "").toLowerCase()
  );

const CLIENT_ALLOWED_AUDIT_ACTIONS = new Set([
  "request_created",
  "message_created",
  "contract_signed",
  "user_login",
  "user_created",
]);

const stringOrEmpty = value => String(value || "").trim();

const escapeHtml = value =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const truncateText = (value, maxLength = EMAIL_PREVIEW_LIMIT) => {
  const normalized = stringOrEmpty(value).replace(/\s+/g, " ");
  if (!normalized) return "لا توجد تفاصيل إضافية.";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
};

const toDateSafe = value => {
  if (!value) return null;

  if (value instanceof Date) return value;

  if (typeof value?.toDate === "function") {
    try {
      return value.toDate();
    } catch (error) {
      console.warn("[notifications] failed to convert timestamp with toDate()", error);
    }
  }

  if (typeof value?._seconds === "number") {
    return new Date(value._seconds * 1000);
  }

  if (typeof value?.seconds === "number") {
    return new Date(value.seconds * 1000);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatNotificationDate = value => {
  const date = toDateSafe(value);
  if (!date) return "غير متوفر";

  try {
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: EMAIL_TIMEZONE,
    }).format(date);
  } catch (error) {
    console.warn("[notifications] failed to format date", error);
    return date.toISOString();
  }
};

const normalizeRequestTypeLabel = value => {
  const normalized = stringOrEmpty(value).toLowerCase();
  if (!normalized) return "غير محدد";
  if (normalized === "investment") return "استثمار";
  if (normalized === "interest") return "إبداء اهتمام";
  return String(value).trim();
};

const buildAdminMessagesUrl = () => {
  const baseUrl = stringOrEmpty(process.env.APP_BASE_URL).replace(/\/+$/, "");
  if (!baseUrl) {
    console.log("[notifications] APP_BASE_URL is missing, using relative admin link");
  }
  return baseUrl ? `${baseUrl}${ADMIN_MESSAGES_PATH}` : ADMIN_MESSAGES_PATH;
};

const buildNotificationEmailHtml = ({
  heading,
  intro,
  rows,
  actionLabel,
  actionUrl,
}) => {
  const renderedRows = rows
    .map(
      row => `
        <tr>
          <td style="padding:0 0 10px;color:#64748b;font-size:14px;vertical-align:top;white-space:nowrap;">${escapeHtml(
            row.label
          )}</td>
          <td style="padding:0 0 10px 16px;color:#0f172a;font-size:14px;line-height:1.8;">${escapeHtml(
            row.value
          )}</td>
        </tr>
      `
    )
    .join("");

  return `
    <div dir="rtl" style="margin:0;background:#f8fafc;padding:24px;font-family:Tahoma,Arial,sans-serif;color:#0f172a;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;">
        <div style="padding:24px 24px 18px;background:linear-gradient(180deg,#0f172a 0%,#111827 100%);color:#ffffff;">
          <div style="display:inline-block;background:rgba(242,183,5,0.12);border:1px solid rgba(242,183,5,0.3);color:#f2b705;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700;">إشعار إداري</div>
          <h2 style="margin:16px 0 0;font-size:24px;line-height:1.5;">${escapeHtml(
            heading
          )}</h2>
          <p style="margin:12px 0 0;color:rgba(255,255,255,0.78);font-size:14px;line-height:1.8;">${escapeHtml(
            intro
          )}</p>
        </div>
        <div style="padding:24px;">
          <table style="width:100%;border-collapse:collapse;">
            <tbody>${renderedRows}</tbody>
          </table>
          <div style="margin-top:24px;">
            <a href="${escapeHtml(
              actionUrl
            )}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:12px;padding:12px 20px;font-size:14px;font-weight:700;">${escapeHtml(
              actionLabel
            )}</a>
          </div>
        </div>
      </div>
    </div>
  `;
};

async function getNotificationSettings() {
  const snap = await db.doc("settings/notifications").get();
  return {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...(snap.exists ? snap.data() || {} : {}),
  };
}

async function getAdminRecipients() {
  const snap = await db
    .collection("users")
    .where("role", "in", ["owner", "admin"])
    .get();

  const emails = new Set();
  snap.forEach(docSnap => {
    const data = docSnap.data() || {};
    const email = stringOrEmpty(data.email).toLowerCase();
    if (!email) return;
    if (resolveUserActive(data) === false) return;
    emails.add(email);
  });

  return Array.from(emails);
}

async function sendEmailNotification(subject, html, recipients) {
  const resendApiKey = stringOrEmpty(process.env.RESEND_API_KEY);
  const fromEmail = stringOrEmpty(process.env.NOTIFICATION_FROM_EMAIL);
  const resendClient = resendApiKey ? new Resend(resendApiKey) : null;
  const normalizedRecipients = Array.from(
    new Set(
      (Array.isArray(recipients) ? recipients : [])
        .map(email => stringOrEmpty(email).toLowerCase())
        .filter(Boolean)
    )
  );

  if (!resendClient) {
    console.log("[notifications] skipped email send: missing RESEND_API_KEY");
    return { sent: false, reason: "missing_resend_api_key" };
  }

  if (!fromEmail) {
    console.log("[notifications] skipped email send: missing NOTIFICATION_FROM_EMAIL");
    return { sent: false, reason: "missing_from_email" };
  }

  if (!normalizedRecipients.length) {
    console.log("[notifications] skipped email send: no admin recipients found");
    return { sent: false, reason: "no_admin_recipients" };
  }

  console.log("[notifications] sending email notification", {
    subject,
    recipientsCount: normalizedRecipients.length,
  });

  const response = await resendClient.emails.send({
    from: fromEmail,
    to: normalizedRecipients,
    subject,
    html,
  });

  if (response?.error) {
    throw new Error(
      typeof response.error === "string"
        ? response.error
        : JSON.stringify(response.error)
    );
  }

  console.log("[notifications] email notification sent", {
    subject,
    emailId: response?.data?.id || null,
    recipientsCount: normalizedRecipients.length,
  });

  return {
    sent: true,
    emailId: response?.data?.id || null,
    recipientsCount: normalizedRecipients.length,
  };
}

const assertClientOwnedDoc = async (path, predicate, message) => {
  const snap = await db.doc(path).get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", message);
  }

  const data = snap.data() || {};
  if (!predicate(data)) {
    throw new HttpsError(
      "permission-denied",
      "Audit log target is not owned by the current user."
    );
  }
};

const validateClientAuditPayload = async (uid, payload) => {
  const action = stringOrEmpty(payload?.action);
  const entityId = stringOrEmpty(payload?.entityId);
  const entityType = stringOrEmpty(payload?.entityType);
  const relatedIds = payload?.relatedIds || {};

  if (!CLIENT_ALLOWED_AUDIT_ACTIONS.has(action)) {
    throw new HttpsError(
      "permission-denied",
      `Client audit action '${action}' is not allowed.`
    );
  }

  if (action === "user_login" || action === "user_created") {
    const relatedUserId = stringOrEmpty(relatedIds?.userId);
    if (
      entityType !== "user" ||
      (entityId && entityId !== uid) ||
      (relatedUserId && relatedUserId !== uid)
    ) {
      throw new HttpsError(
        "permission-denied",
        "User audit events must target the current user."
      );
    }
    return;
  }

  if (action === "request_created") {
    await assertClientOwnedDoc(
      `interest_requests/${entityId}`,
      data =>
        [data.investorUid, data.userId, data.createdByUid]
          .map(value => stringOrEmpty(value))
          .includes(uid),
      "Request audit target does not exist."
    );
    return;
  }

  if (action === "message_created") {
    await assertClientOwnedDoc(
      `messages/${entityId}`,
      data =>
        [data.createdByUid, data.userId]
          .map(value => stringOrEmpty(value))
          .includes(uid),
      "Message audit target does not exist."
    );
    return;
  }

  if (action === "contract_signed") {
    await assertClientOwnedDoc(
      `investments/${entityId}`,
      data => stringOrEmpty(data.investorUid) === uid,
      "Investment audit target does not exist."
    );
  }
};

const recomputeProjectAggregates = async (projectId, auditContext = {}) => {
  const pid = String(projectId || "").trim();
  if (!pid) return null;

  const projectRef = db.doc(`projects/${pid}`);
  const projectSnap = await projectRef.get();
  if (!projectSnap.exists) return null;
  const beforeProject = projectSnap.data() || {};

  const invSnap = await db
    .collection("investments")
    .where("projectId", "==", pid)
    .get();

  let currentAmount = 0;
  let pendingAmount = 0; // optional
  const investors = new Set();

  invSnap.forEach(docSnap => {
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

  const afterProject = {
    ...beforeProject,
    currentAmount,
    investorsCount: investors.size,
    pendingAmount,
  };

  const changes = diffAuditSnapshots(beforeProject, afterProject, {
    ignoreFields: ["updatedAt"],
  }).filter(change =>
    ["currentAmount", "investorsCount", "pendingAmount"].includes(
      String(change.field || "")
    )
  );

  if (auditContext.forceLog || changes.length > 0) {
    await safeWriteAuditLog(
      db,
      {
        action: "aggregates_recomputed",
        category: "finance",
        severity: "info",
        status: "success",
        message: `Recomputed project aggregates for ${pid}`,
        entityType: "project",
        entityId: pid,
        entityPath: projectRef.path,
        relatedIds: { projectId: pid },
        source: {
          area: auditContext.sourceArea || "function",
          page: auditContext.sourcePage || "recomputeProjectAggregates",
          route:
            auditContext.sourceRoute || "functions/recomputeProjectAggregates",
          method: auditContext.sourceMethod || "recompute",
        },
        changes,
        meta: {
          reason: auditContext.reason || "recompute_project_aggregates",
          projectTitle: String(
            beforeProject.titleAr || beforeProject.title || ""
          ),
          investmentCount: invSnap.size,
          changedKeys: changes.map(entry => entry.field),
        },
      },
      auditContext.auth
        ? { auth: auditContext.auth }
        : { actorOverride: auditContext.actorOverride || SYSTEM_ACTOR }
    );
  }

  return {
    projectId: pid,
    currentAmount,
    pendingAmount,
    investorsCount: investors.size,
  };
};

// ✅ Admin-only callable recompute for one project
exports.recomputeProjectAggregates = onCall(
  { region: REGION },
  async request => {
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

    const result = await recomputeProjectAggregates(projectId, {
      auth: request.auth,
      sourceArea: "function",
      sourcePage: "recomputeProjectAggregates",
      sourceRoute: "functions.recomputeProjectAggregates",
      sourceMethod: "manual_recompute",
      reason: "admin_callable_single_project",
      forceLog: true,
    });
    return { ok: true, result };
  }
);

// ✅ Admin-only full backfill
const runRecomputeAllProjects = async (auditContext = {}) => {
  const projectsSnap = await db.collection("projects").get();
  const results = [];
  for (const docSnap of projectsSnap.docs) {
    const r = await recomputeProjectAggregates(docSnap.id, auditContext);
    if (r) results.push(r);
  }
  return results;
};

const adminRecomputeAllProjectsHandler = async request => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const isAdmin = await isAdminUid(request.auth.uid);
  if (!isAdmin) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }

  const results = await runRecomputeAllProjects({
    auth: request.auth,
    sourceArea: "function",
    sourcePage: "adminRecomputeAllProjects",
    sourceRoute: "functions.adminRecomputeAllProjects",
    sourceMethod: "bulk_recompute",
    reason: "admin_callable_all_projects",
    forceLog: true,
  });

  await safeWriteAuditLog(
    db,
    {
      action: "aggregates_recomputed",
      category: "system",
      severity: "info",
      status: "success",
      message: `Bulk recompute executed for ${results.length} projects`,
      entityType: "system",
      entityId: "all_projects",
      entityPath: "projects/*",
      source: {
        area: "function",
        page: "adminRecomputeAllProjects",
        route: "functions.adminRecomputeAllProjects",
        method: "bulk_recompute",
      },
      relatedIds: {},
      changes: [],
      meta: {
        projectCount: results.length,
        reason: "admin_callable_all_projects_summary",
      },
    },
    { auth: request.auth }
  );
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
exports.onAuthCreateUserProfile = onUserCreated(
  { region: "us-central1" },
  async event => {
    const user = event.data;
    if (!user?.uid) return;

    const userRef = db.doc(`users/${user.uid}`);
    const snap = await userRef.get();
    const existingData = snap.exists ? snap.data() || {} : null;

    // defaults
    let role = String(existingData?.role || "client")
      .trim()
      .toLowerCase();
    if (!ALLOWED_ROLES.has(role)) role = "client";
    let isInvestor = typeof existingData?.isInvestor === "boolean" ? existingData.isInvestor : false;
    let active = resolveUserActive(existingData);
    let adminDisplayName = String(existingData?.displayName || existingData?.name || "").trim();
    let title = String(existingData?.title || "").trim();
    let permissionsAllow = normalizeStringArray(existingData?.permissionsAllow);
    let permissionsDeny = normalizeStringArray(existingData?.permissionsDeny);

    const emailLower = String(user.email || "")
      .trim()
      .toLowerCase();
    let hasAdminUserDoc = false;
    let adminUserApplied = false;
    let inviteApplied = false;

    if (emailLower) {
      const adminUserRef = db.doc(`admin_users/${emailLower}`);
      const adminUserSnap = await adminUserRef.get();
      const adminUser = adminUserSnap.exists ? adminUserSnap.data() : null;
      hasAdminUserDoc = !!adminUser;
      const adminRole = String(adminUser?.roleKey || "")
        .trim()
        .toLowerCase();

      if (adminRole && ALLOWED_ROLES.has(adminRole)) {
        role = adminRole;
        adminUserApplied = true;
      }

      active = resolveUserActive(adminUser);
      adminDisplayName = String(adminUser?.displayName || "").trim();
      title = String(adminUser?.title || "").trim();
      permissionsAllow = normalizeStringArray(adminUser?.permissionsAllow);
      permissionsDeny = normalizeStringArray(adminUser?.permissionsDeny);
    }

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

    if (snap.exists && !hasAdminUserDoc && !inviteApplied) {
      return;
    }

    const finalDisplayName = String(
      user.displayName || adminDisplayName || existingData?.displayName || existingData?.name || ""
    ).trim();
    const finalPhone = String(user.phoneNumber || existingData?.phone || "").trim();
    const payload = {
      uid: user.uid,
      role,
      email: user.email || existingData?.email || "",
      displayName: finalDisplayName || "",
      name: finalDisplayName || "",
      title,
      phone: finalPhone,
      active,
      isInvestor,
      permissionsAllow,
      permissionsDeny,
      createdAt: existingData?.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      source: inviteApplied
        ? "auth_trigger_invite_check"
        : adminUserApplied
          ? "auth_trigger_admin_user"
          : existingData?.source || "auth_trigger",
      roleKeySource: inviteApplied
        ? "role_invites"
        : adminUserApplied
          ? "admin_users"
          : existingData?.roleKeySource || "default",
    };

    await userRef.set(payload, { merge: true });

    if (emailLower && hasAdminUserDoc) {
      await db.doc(`admin_users/${emailLower}`).set(
        {
          linkedUserUid: user.uid,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    // ✅ consume invite
    await safeWriteAuditLog(
      db,
      {
        action: "user_created",
        category: "user",
        severity: "info",
        status: "success",
        message: `Created user profile for ${user.uid}`,
        entityType: "user",
        entityId: user.uid,
        entityPath: userRef.path,
        relatedIds: { userId: user.uid },
        source: {
          area: "function",
          page: "onAuthCreateUserProfile",
          route: "functions.onAuthCreateUserProfile",
          method: "create_profile",
        },
        changes: diffAuditSnapshots(existingData, payload),
        meta: {
          hadExistingUserDoc: snap.exists,
          hasAdminUserDoc,
          adminUserApplied,
          inviteApplied,
          emailLower,
        },
      },
      {
        actorOverride: {
          uid: user.uid,
          name: finalDisplayName || user.email || "User",
          email: user.email || "",
          role,
        },
      }
    );

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

      await safeWriteAuditLog(
        db,
        {
          action: "role_invite_updated",
          category: "user",
          severity: "info",
          status: "success",
          message: `Consumed role invite for ${emailLower}`,
          entityType: "role_invite",
          entityId: emailLower,
          entityPath: invRef.path,
          relatedIds: {
            userId: user.uid,
          },
          source: {
            area: "function",
            page: "onAuthCreateUserProfile",
            route: "functions.onAuthCreateUserProfile",
            method: "consume_invite",
          },
          changes: diffAuditSnapshots(
            {
              isActive: true,
              usedAt: null,
              usedByUid: null,
            },
            {
              isActive: false,
              usedByUid: user.uid,
              usedAt: new Date().toISOString(),
            }
          ),
          meta: {
            backfilled: false,
            emailLower,
            inviteApplied: true,
          },
        },
        { actorOverride: SYSTEM_ACTOR }
      );
    }
  }
);

// ✅ Auto recompute on investment writes (create/update/delete)
exports.onInvestmentWrite = onDocumentWritten(
  { region: REGION, document: "investments/{investmentId}" },
  async event => {
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
      toNumberSafe(before.approvedAmount) !==
        toNumberSafe(after.approvedAmount);

    if (!hasChanged) return;

    const projectIds = new Set();
    if (before?.projectId) projectIds.add(String(before.projectId));
    if (after?.projectId) projectIds.add(String(after.projectId));

    if (!projectIds.size) return;

    await Promise.all(
      Array.from(projectIds).map(pid =>
        recomputeProjectAggregates(pid, {
          sourceArea: "function",
          sourcePage: "onInvestmentWrite",
          sourceRoute: "functions.onInvestmentWrite",
          sourceMethod: "trigger_recompute",
          reason: "investment_write_trigger",
          actorOverride: SYSTEM_ACTOR,
        })
      )
    );
  }
);

exports.onMessageCreatedNotification = onDocumentCreated(
  { region: REGION, document: "messages/{messageId}" },
  async event => {
    const messageId = String(event.params?.messageId || "").trim();
    const data = event.data?.data() || null;

    console.log("[notifications] message trigger fired", { messageId });

    if (!data) {
      console.log("[notifications] message trigger skipped: empty snapshot", {
        messageId,
      });
      return null;
    }

    try {
      const notificationSettings = await getNotificationSettings();
      if (!notificationSettings.messages || !notificationSettings.email) {
        console.log(
          "[notifications] message email skipped بسبب settings",
          {
            messageId,
            emailEnabled: notificationSettings.email,
            messagesEnabled: notificationSettings.messages,
          }
        );
        return null;
      }

      const recipients = await getAdminRecipients();
      const adminUrl = buildAdminMessagesUrl();
      const clientName =
        stringOrEmpty(data.name) ||
        stringOrEmpty(data.investorName) ||
        stringOrEmpty(data.userSnapshot?.displayName) ||
        stringOrEmpty(data.email) ||
        stringOrEmpty(data.createdByEmail) ||
        "عميل غير معروف";
      const messagePreview = truncateText(data.message || data.note || "");
      const createdAtLabel = formatNotificationDate(
        data.createdAt || data.updatedAt
      );

      const result = await sendEmailNotification(
        "[معدن] رسالة جديدة من العميل",
        buildNotificationEmailHtml({
          heading: "رسالة جديدة من العميل",
          intro:
            "تم تسجيل رسالة جديدة داخل النظام وتحتاج إلى متابعة من فريق الإدارة.",
          rows: [
            { label: "اسم العميل", value: clientName },
            { label: "نص الرسالة", value: messagePreview },
            { label: "التاريخ", value: createdAtLabel },
            { label: "الرابط", value: adminUrl },
          ],
          actionLabel: "فتح صفحة الرسائل",
          actionUrl: adminUrl,
        }),
        recipients
      );

      if (!result.sent) {
        console.log("[notifications] message email not sent", {
          messageId,
          reason: result.reason,
        });
        return null;
      }

      console.log("[notifications] message email notification completed", {
        messageId,
        emailId: result.emailId,
        recipientsCount: result.recipientsCount,
      });
      return null;
    } catch (error) {
      console.error("[notifications] message email notification failed", {
        messageId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
);

exports.onInterestRequestCreatedNotification = onDocumentCreated(
  { region: REGION, document: "interest_requests/{requestId}" },
  async event => {
    const requestId = String(event.params?.requestId || "").trim();
    const data = event.data?.data() || null;

    console.log("[notifications] interest request trigger fired", { requestId });

    if (!data) {
      console.log(
        "[notifications] interest request trigger skipped: empty snapshot",
        { requestId }
      );
      return null;
    }

    try {
      const notificationSettings = await getNotificationSettings();
      if (!notificationSettings.investments || !notificationSettings.email) {
        console.log(
          "[notifications] request email skipped بسبب settings",
          {
            requestId,
            emailEnabled: notificationSettings.email,
            investmentsEnabled: notificationSettings.investments,
          }
        );
        return null;
      }

      const recipients = await getAdminRecipients();
      const adminUrl = buildAdminMessagesUrl();
      const clientName =
        stringOrEmpty(data.investorName) ||
        stringOrEmpty(data.userSnapshot?.displayName) ||
        stringOrEmpty(data.name) ||
        stringOrEmpty(data.email) ||
        stringOrEmpty(data.investorEmail) ||
        "عميل غير معروف";
      const requestType = normalizeRequestTypeLabel(
        data.type || data.requestType
      );
      const projectTitle =
        stringOrEmpty(data.projectTitle) ||
        stringOrEmpty(data.projectSnapshot?.titleAr) ||
        stringOrEmpty(data.projectSnapshot?.title) ||
        stringOrEmpty(data.projectId) ||
        "غير محدد";
      const createdAtLabel = formatNotificationDate(
        data.createdAt || data.updatedAt
      );

      const result = await sendEmailNotification(
        "[معدن] طلب جديد يحتاج مراجعة",
        buildNotificationEmailHtml({
          heading: "طلب جديد يحتاج مراجعة",
          intro:
            "تم إنشاء طلب جديد في النظام ويحتاج إلى مراجعة من الفريق الإداري.",
          rows: [
            { label: "اسم العميل", value: clientName },
            { label: "نوع الطلب", value: requestType },
            { label: "المشروع", value: projectTitle },
            { label: "التاريخ", value: createdAtLabel },
            { label: "الرابط", value: adminUrl },
          ],
          actionLabel: "فتح الطلبات والرسائل",
          actionUrl: adminUrl,
        }),
        recipients
      );

      if (!result.sent) {
        console.log("[notifications] request email not sent", {
          requestId,
          reason: result.reason,
        });
        return null;
      }

      console.log("[notifications] request email notification completed", {
        requestId,
        emailId: result.emailId,
        recipientsCount: result.recipientsCount,
      });
      return null;
    } catch (error) {
      console.error("[notifications] request email notification failed", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
);

exports.writeAuditLog = onCall(
  { region: REGION, cors: true, invoker: "public" },
  async request => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const payload = request.data || {};
    const action = String(payload?.action || "").trim();
    const category = String(payload?.category || "").trim();
    const entityType = String(payload?.entityType || "").trim();

    if (!action || !category || !entityType) {
      throw new HttpsError(
        "invalid-argument",
        "action, category, and entityType are required."
      );
    }

    const sourceArea = stringOrEmpty(payload?.source?.area).toLowerCase();
    if (sourceArea === "function" || sourceArea === "script") {
      throw new HttpsError("permission-denied", "Reserved audit source area.");
    }

    const role = await getUserRole(request.auth.uid);
    if (isOpsRole(role)) {
      const id = await writeAuditLogEntry(db, payload, { auth: request.auth });
      return { ok: true, id };
    }

    if (role === "client") {
      if (!["client", "public"].includes(sourceArea)) {
        throw new HttpsError(
          "permission-denied",
          "Client audit logs must originate from client/public areas."
        );
      }

      await validateClientAuditPayload(request.auth.uid, payload);
      const id = await writeAuditLogEntry(db, payload, { auth: request.auth });
      return { ok: true, id };
    }

    throw new HttpsError(
      "permission-denied",
      "Audit logging is not enabled for this role."
    );
  }
);
