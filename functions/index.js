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
const PUBLIC_WEB_APP_ORIGINS = Object.freeze(
  Array.from(
    new Set([
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://madan-app.vercel.app",
      ...String(process.env.PUBLIC_WEB_APP_ORIGINS || "")
        .split(",")
        .map(origin => origin.trim())
        .filter(Boolean),
    ])
  )
);
const PUBLIC_WEB_CALLABLE_OPTIONS = Object.freeze({
  region: REGION,
  cors: PUBLIC_WEB_APP_ORIGINS,
  invoker: "public",
});
const HR_ONLY_CALLABLE_OPTIONS = PUBLIC_WEB_CALLABLE_OPTIONS;
const ATTENDANCE_APP_CHECK_ENFORCED = [
  "1",
  "true",
  "yes",
  "on",
].includes(
  String(
    process.env.ENFORCE_ATTENDANCE_APP_CHECK ||
      process.env.ENFORCE_APP_CHECK ||
      ""
  )
    .trim()
    .toLowerCase()
);
const ATTENDANCE_CALLABLE_OPTIONS = Object.freeze({
  ...PUBLIC_WEB_CALLABLE_OPTIONS,
  enforceAppCheck: ATTENDANCE_APP_CHECK_ENFORCED,
  consumeAppCheckToken: ATTENDANCE_APP_CHECK_ENFORCED,
});
const ATTENDANCE_MAX_ACCURACY_METERS = 100;
const ATTENDANCE_ALLOWED_ROLES = new Set([
  "owner",
  "admin",
  "accountant",
  "hr",
  "staff",
]);
const ATTENDANCE_TYPES = new Set(["check_in", "check_out"]);
const EARTH_RADIUS_METERS = 6371008.8;

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
  "hr",
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

const normalizeCreateStaffInput = value => {
  const input = value && typeof value === "object" ? value : {};
  return {
    email: normalizeLoginEmailValue(input.email),
    password: String(input.password || ""),
    fullName: stringOrEmpty(input.fullName || input.name || input.displayName),
    phone: stringOrEmpty(input.phone),
  };
};

const normalizeKnownRole = value => {
  const role = String(value || "")
    .trim()
    .toLowerCase();
  return ALLOWED_ROLES.has(role) ? role : "guest";
};

const getUserRole = async (uid, email = "") => {
  let fallbackRole = "guest";
  let resolvedEmail = String(email || "")
    .trim()
    .toLowerCase();

  if (uid) {
    const snap = await db.doc(`users/${uid}`).get();
    if (snap.exists) {
      const data = snap.data() || {};
      const userRole = normalizeKnownRole(data.role);
      const userEmail = String(data.email || "")
        .trim()
        .toLowerCase();

      fallbackRole = userRole;
      if (!resolvedEmail && userEmail) resolvedEmail = userEmail;

      if (userRole !== "guest" && userRole !== "client") {
        return userRole;
      }
    }
  }

  if (resolvedEmail) {
    const adminUserSnap = await db.doc(`admin_users/${resolvedEmail}`).get();
    if (adminUserSnap.exists) {
      const adminRole = normalizeKnownRole(
        adminUserSnap.data()?.roleKey || adminUserSnap.data()?.role
      );
      if (adminRole !== "guest" && adminRole !== "client") {
        return adminRole;
      }
      if (fallbackRole === "guest") {
        fallbackRole = adminRole;
      }
    }
  }

  return fallbackRole;
};

const isAdminUid = async (uid, email = "") => {
  const role = await getUserRole(uid, email);
  return role === "admin" || role === "owner";
};

const isOpsRole = role =>
  ["owner", "admin", "accountant", "hr"].includes(
    String(role || "").toLowerCase()
  );

const CLIENT_ALLOWED_AUDIT_ACTIONS = new Set([
  "request_created",
  "message_created",
  "contract_signed",
  "user_login",
  "user_created",
]);
const EMPLOYEE_DIRECTORY_CALLER_ROLES = new Set([
  "staff",
  "hr",
  "admin",
  "owner",
  "accountant",
]);

const stringOrEmpty = value => String(value || "").trim();

const hasValuesObject = value =>
  !!value &&
  typeof value === "object" &&
  Object.keys(value).length > 0;

const pickFirstText = (...values) => {
  for (const value of values) {
    const normalized = stringOrEmpty(value);
    if (normalized) return normalized;
  }
  return "";
};

const normalizeAdminUsernameForLogin = value =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/[._-]{2,}/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "");

const normalizeLoginEmailValue = value =>
  String(value || "")
    .trim()
    .toLowerCase();

const isUsableLoginEmail = email => normalizeLoginEmailValue(email).includes("@");

const pickLoginEmailFromData = data =>
  normalizeLoginEmailValue(
    pickFirstText(
      data?.email,
      data?.emailLower,
      data?.profile?.email,
      data?.employeeProfile?.personal?.email,
      data?.personal?.email
    )
  );

const buildLoginEmailResolution = (id, source, data) => {
  const email = pickLoginEmailFromData(data || {});
  return {
    found: true,
    id,
    source,
    email,
    emailMissing: !isUsableLoginEmail(email),
  };
};

const preferUsableLoginResolution = (current, candidate) => {
  if (!candidate) return current;
  if (!current) return candidate;
  if (isUsableLoginEmail(candidate.email) && !isUsableLoginEmail(current.email)) {
    return candidate;
  }
  return current;
};

const findLoginEmailInSnapshot = (snapshot, source, username) => {
  let best = null;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() || {};
    const docUsername = normalizeAdminUsernameForLogin(
      data.usernameLower || data.username
    );

    if (docUsername !== username) continue;

    const candidate = buildLoginEmailResolution(docSnap.id, source, data);
    best = preferUsableLoginResolution(best, candidate);
    if (isUsableLoginEmail(best.email)) return best;
  }

  return best;
};

const queryLoginEmailByUsernameField = async (
  collectionName,
  fieldName,
  username
) => {
  const snapshot = await db
    .collection(collectionName)
    .where(fieldName, "==", username)
    .limit(10)
    .get();

  return findLoginEmailInSnapshot(snapshot, collectionName, username);
};

const scanLoginEmailByNormalizedUsername = async (collectionName, username) => {
  const snapshot = await db
    .collection(collectionName)
    .select(
      "username",
      "usernameLower",
      "email",
      "emailLower",
      "profile",
      "employeeProfile",
      "personal"
    )
    .limit(1000)
    .get();

  return findLoginEmailInSnapshot(snapshot, collectionName, username);
};

const resolveLoginEmailByUsername = async username => {
  const normalizedUsername = normalizeAdminUsernameForLogin(username);
  let best = null;

  if (!normalizedUsername) return null;

  const usernameIndexSnap = await db
    .doc(`admin_usernames/${normalizedUsername}`)
    .get();

  if (usernameIndexSnap.exists) {
    best = preferUsableLoginResolution(
      best,
      buildLoginEmailResolution(
        usernameIndexSnap.id,
        "admin_usernames",
        usernameIndexSnap.data() || {}
      )
    );
    if (isUsableLoginEmail(best.email)) return best;
  }

  for (const collectionName of ["admin_users", "users"]) {
    for (const fieldName of ["usernameLower", "username"]) {
      best = preferUsableLoginResolution(
        best,
        await queryLoginEmailByUsernameField(
          collectionName,
          fieldName,
          normalizedUsername
        )
      );
      if (best && isUsableLoginEmail(best.email)) return best;
    }
  }

  for (const collectionName of ["admin_users", "users"]) {
    best = preferUsableLoginResolution(
      best,
      await scanLoginEmailByNormalizedUsername(collectionName, normalizedUsername)
    );
    if (best && isUsableLoginEmail(best.email)) return best;
  }

  return best;
};

exports.resolveLoginEmail = onCall(
  PUBLIC_WEB_CALLABLE_OPTIONS,
  async request => {
    const username = normalizeAdminUsernameForLogin(request.data?.username);

    if (!username) {
      return { found: false, email: null, emailMissing: false };
    }

    const resolution = await resolveLoginEmailByUsername(username);

    if (!resolution) {
      return { found: false, email: null, emailMissing: false };
    }

    return {
      found: true,
      email: isUsableLoginEmail(resolution.email) ? resolution.email : null,
      emailMissing: !isUsableLoginEmail(resolution.email),
    };
  }
);

const normalizeEmployeeDirectoryStatus = data => {
  const employment =
    data?.employeeProfile?.employment || data?.employment || {};
  const rawStatus = pickFirstText(
    employment?.employmentStatus,
    employment?.status,
    data?.status
  ).toLowerCase();

  if (rawStatus) return rawStatus;
  return resolveUserActive(data) ? "active" : "inactive";
};

const isEmployeeDirectoryCandidate = data => {
  const role = normalizeKnownRole(data?.role);
  if (role === "client" || role === "guest") return false;

  const employment =
    data?.employeeProfile?.employment || data?.employment || {};
  const personal = data?.employeeProfile?.personal || data?.personal || {};

  return (
    role === "staff" ||
    role === "hr" ||
    stringOrEmpty(data?.linkedEmployeeId).length > 0 ||
    hasValuesObject(employment) ||
    hasValuesObject(personal)
  );
};

const sanitizeEmployeeDirectoryEntry = (uid, data) => {
  if (!uid || !isEmployeeDirectoryCandidate(data) || !resolveUserActive(data)) {
    return null;
  }

  const statusKey = normalizeEmployeeDirectoryStatus(data);
  if (statusKey !== "active") {
    return null;
  }

  const employment =
    data?.employeeProfile?.employment || data?.employment || {};
  const personal = data?.employeeProfile?.personal || data?.personal || {};
  const name = pickFirstText(
    data?.displayName,
    data?.name,
    data?.fullName,
    personal?.name,
    uid
  );

  if (!name) {
    return null;
  }

  return {
    uid,
    name,
    email: pickFirstText(data?.email, personal?.email) || null,
    avatarUrl: pickFirstText(
      personal?.avatar?.fileUrl,
      data?.photoURL,
      data?.profile?.photoURL
    ) || null,
    title: pickFirstText(
      employment?.title,
      employment?.jobTitle,
      data?.title
    ) || null,
    department: pickFirstText(employment?.department, data?.department) || null,
    statusKey,
  };
};

const normalizeAttendanceType = value => {
  const type = String(value || "")
    .trim()
    .toLowerCase();
  return ATTENDANCE_TYPES.has(type) ? type : "";
};

const finiteNumberOrNull = value => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const normalizeLatitude = value => {
  const numberValue = finiteNumberOrNull(value);
  return numberValue !== null && numberValue >= -90 && numberValue <= 90
    ? numberValue
    : null;
};

const normalizeLongitude = value => {
  const numberValue = finiteNumberOrNull(value);
  return numberValue !== null && numberValue >= -180 && numberValue <= 180
    ? numberValue
    : null;
};

const normalizeAttendanceLocation = value => {
  const location = value && typeof value === "object" ? value : {};
  const lat = normalizeLatitude(location.lat ?? location.latitude);
  const lng = normalizeLongitude(
    location.lng ?? location.lon ?? location.longitude
  );
  const accuracy = finiteNumberOrNull(location.accuracy);

  if (lat === null || lng === null || accuracy === null || accuracy < 0) {
    return null;
  }

  return {
    lat,
    lng,
    accuracy,
  };
};

const clampText = (value, maxLength = 180) => {
  const text = stringOrEmpty(value).replace(/\s+/g, " ");
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
};

const normalizeAttendanceDeviceInfo = value => {
  const info = value && typeof value === "object" ? value : {};
  return {
    userAgent: clampText(info.userAgent, 400) || null,
    platform: clampText(info.platform, 120) || null,
    language: clampText(info.language, 40) || null,
    timeZone: clampText(info.timeZone, 80) || null,
  };
};

const toRadians = degrees => (degrees * Math.PI) / 180;

const calculateDistanceMeters = (left, right) => {
  const latDelta = toRadians(right.lat - left.lat);
  const lngDelta = toRadians(right.lng - left.lng);
  const leftLat = toRadians(left.lat);
  const rightLat = toRadians(right.lat);
  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(leftLat) *
      Math.cos(rightLat) *
      Math.sin(lngDelta / 2) *
      Math.sin(lngDelta / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
};

const normalizeAttendanceZoneIds = (...values) => {
  const ids = [];
  for (const value of values) {
    ids.push(...normalizeStringArray(value));
  }
  return Array.from(new Set(ids));
};

const pickAttendanceZoneIds = (employeeData, userData) =>
  normalizeAttendanceZoneIds(
    employeeData?.allowedZoneIds,
    employeeData?.employeeProfile?.employment?.allowedZoneIds,
    employeeData?.employment?.allowedZoneIds,
    userData?.allowedZoneIds,
    userData?.employeeProfile?.employment?.allowedZoneIds,
    userData?.employment?.allowedZoneIds
  );

const pickAttendanceZoneId = (employeeData, userData) =>
  pickFirstText(
    employeeData?.workZoneId,
    employeeData?.zoneId,
    employeeData?.attendanceZoneId,
    employeeData?.employeeProfile?.employment?.workZoneId,
    employeeData?.employeeProfile?.employment?.zoneId,
    userData?.workZoneId,
    userData?.zoneId,
    userData?.attendanceZoneId
  );

const pickAttendanceBranchId = (employeeData, userData) =>
  pickFirstText(
    employeeData?.branchId,
    employeeData?.employeeProfile?.employment?.branchId,
    userData?.branchId,
    userData?.employeeProfile?.employment?.branchId
  );

const normalizeRadiusZoneSnapshot = docSnap => {
  if (!docSnap?.exists) return null;

  const data = docSnap.data() || {};
  const type = String(data.type || "radius")
    .trim()
    .toLowerCase();
  if (type !== "radius") {
    return {
      id: docSnap.id,
      type,
      unsupported: true,
      active: data.active !== false,
    };
  }

  const center = data.center || {};
  const lat = normalizeLatitude(center.lat ?? center.latitude);
  const lng = normalizeLongitude(center.lng ?? center.longitude);
  const radiusMeters = finiteNumberOrNull(data.radiusMeters);
  const active = data.active !== false;

  if (!active || lat === null || lng === null || !radiusMeters || radiusMeters <= 0) {
    return {
      id: docSnap.id,
      type,
      invalid: true,
      active,
    };
  }

  return {
    id: docSnap.id,
    name: stringOrEmpty(data.name) || null,
    type,
    branchId: stringOrEmpty(data.branchId) || null,
    center: { lat, lng },
    radiusMeters,
    active,
  };
};

const resolveAttendanceZone = async (employeeData, userData) => {
  const zoneIds = pickAttendanceZoneIds(employeeData, userData);
  if (zoneIds.length > 0) {
    const zoneRefs = zoneIds.map(zoneId => db.doc(`work_zones/${zoneId}`));
    const zoneSnaps = await db.getAll(...zoneRefs);
    const zones = [];

    for (const zoneSnap of zoneSnaps) {
      const zone = normalizeRadiusZoneSnapshot(zoneSnap);
      if (!zone) return { zones: [], error: "zone_not_found" };
      if (zone.unsupported) return { zones: [], error: "unsupported_zone_type" };
      if (zone.invalid) return { zones: [], error: "zone_invalid" };
      zones.push(zone);
    }

    return { zones, error: "" };
  }

  const zoneId = pickAttendanceZoneId(employeeData, userData);
  if (zoneId) {
    const zoneSnap = await db.doc(`work_zones/${zoneId}`).get();
    const zone = normalizeRadiusZoneSnapshot(zoneSnap);

    if (!zone) return { zones: [], error: "zone_not_found" };
    if (zone.unsupported) return { zones: [], error: "unsupported_zone_type" };
    if (zone.invalid) return { zones: [], error: "zone_invalid" };
    return { zones: [zone], error: "" };
  }

  const branchId = pickAttendanceBranchId(employeeData, userData);
  if (!branchId) {
    return { zones: [], error: "" };
  }

  const zonesSnap = await db
    .collection("work_zones")
    .where("active", "==", true)
    .get();
  const matchingZone = zonesSnap.docs
    .map(docSnap => normalizeRadiusZoneSnapshot(docSnap))
    .find(
      zone =>
        zone &&
        !zone.unsupported &&
        !zone.invalid &&
        zone.branchId === branchId
    );

  return { zones: matchingZone ? [matchingZone] : [], error: "" };
};

const evaluateAttendanceZones = (clientLocation, zones) => {
  if (!Array.isArray(zones) || zones.length === 0) {
    return {
      zone: null,
      distanceMeters: null,
      withinZone: true,
    };
  }

  const evaluatedZones = zones
    .map(zone => ({
      zone,
      distanceMeters: calculateDistanceMeters(clientLocation, zone.center),
    }))
    .sort((left, right) => left.distanceMeters - right.distanceMeters);

  const matchingZone = evaluatedZones.find(
    item => item.distanceMeters <= item.zone.radiusMeters
  );

  return {
    zone: matchingZone?.zone || evaluatedZones[0]?.zone || null,
    distanceMeters:
      matchingZone?.distanceMeters ?? evaluatedZones[0]?.distanceMeters ?? null,
    withinZone: Boolean(matchingZone),
  };
};

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

  const targetAmount = toNumberSafe(beforeProject.targetAmount);
  const coverageRate = toNumberSafe(beforeProject.coverageRate);
  const minInvestment = toNumberSafe(
    beforeProject.minInvestment ?? beforeProject.minInvestmentAmount
  );
  const baseCoveredAmount = (targetAmount * coverageRate) / 100;
  let investmentsAmount = 0;
  let pendingAmount = 0; // optional
  const investors = new Set();

  invSnap.forEach(docSnap => {
    const inv = docSnap.data() || {};
    const { status } = normalizeStatus(inv);

    if (!status) return;

    const amt = amountCounted(inv);

    // ✅ vNext: only active/completed are counted
    if (COUNTED_STATUSES.has(status)) {
      investmentsAmount += amt;
      if (inv.investorUid) investors.add(String(inv.investorUid));
    } else if (PENDING_STATUSES.has(status)) {
      pendingAmount += amt;
    }
  });

  const currentAmount = baseCoveredAmount + investmentsAmount;
  const remainingAmount = Math.max(targetAmount - currentAmount, 0);
  const remainingInvestorsCount =
    minInvestment > 0 && remainingAmount > 0
      ? Math.ceil(remainingAmount / minInvestment)
      : 0;

  await projectRef.set(
    {
      baseCoveredAmount,
      investmentsAmount,
      currentAmount,
      investorsCount: investors.size,
      remainingInvestorsCount,
      // optional field (safe to keep)
      pendingAmount,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const afterProject = {
    ...beforeProject,
    baseCoveredAmount,
    investmentsAmount,
    currentAmount,
    investorsCount: investors.size,
    remainingInvestorsCount,
    pendingAmount,
  };

  const changes = diffAuditSnapshots(beforeProject, afterProject, {
    ignoreFields: ["updatedAt"],
  }).filter(change =>
    [
      "baseCoveredAmount",
      "investmentsAmount",
      "currentAmount",
      "investorsCount",
      "remainingInvestorsCount",
      "pendingAmount",
    ].includes(
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
    baseCoveredAmount,
    investmentsAmount,
    currentAmount,
    pendingAmount,
    investorsCount: investors.size,
    remainingInvestorsCount,
  };
};

exports.createStaffAccount = onCall(
  HR_ONLY_CALLABLE_OPTIONS,
  async request => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولًا.");
    }

    const actorUid = String(request.auth.uid || "").trim();
    const actorEmail = String(request.auth.token?.email || "")
      .trim()
      .toLowerCase();
    const actorRole = await getUserRole(actorUid, actorEmail);

    if (actorRole !== "hr") {
      throw new HttpsError(
        "permission-denied",
        "هذه العملية متاحة للموارد البشرية فقط."
      );
    }

    const { email, password, fullName, phone } = normalizeCreateStaffInput(
      request.data
    );

    if (!fullName) {
      throw new HttpsError("invalid-argument", "الاسم الكامل مطلوب.");
    }

    if (!phone) {
      throw new HttpsError("invalid-argument", "رقم الجوال مطلوب.");
    }

    if (!email) {
      throw new HttpsError("invalid-argument", "البريد الإلكتروني مطلوب.");
    }

    if (!password) {
      throw new HttpsError("invalid-argument", "كلمة المرور مطلوبة.");
    }

    if (password.length < 6) {
      throw new HttpsError(
        "invalid-argument",
        "كلمة المرور يجب أن تكون 6 أحرف على الأقل."
      );
    }

    let userRecord;
    try {
      userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: fullName,
        disabled: false,
      });
    } catch (error) {
      const code = String(error?.code || "").toLowerCase();

      if (
        code.includes("email-already-exists") ||
        code.includes("already-exists")
      ) {
        throw new HttpsError("already-exists", "هذا البريد مستخدم بالفعل.");
      }

      if (code.includes("invalid-password")) {
        throw new HttpsError(
          "invalid-argument",
          "كلمة المرور غير صالحة."
        );
      }

      if (code.includes("invalid-email")) {
        throw new HttpsError(
          "invalid-argument",
          "البريد الإلكتروني غير صحيح."
        );
      }

      console.error("[createStaffAccount] auth.createUser failed", error);
      throw new HttpsError("internal", "فشل إنشاء المستخدم في Authentication.");
    }

    const userRef = db.doc(`users/${userRecord.uid}`);
    const adminUserRef = db.doc(`admin_users/${email}`);

    const payload = {
      uid: userRecord.uid,
      email,
      displayName: fullName,
      name: fullName,
      fullName,
      phone,
      role: "staff",
      roleKey: "staff",
      title: "",
      active: true,
      isActive: true,
      employeeProfileEnabled: true,
      linkedEmployeeId: userRecord.uid,
      permissionsAllow: [],
      permissionsDeny: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      source: "hr_create_staff_callable",
      roleKeySource: "hr_callable",
      createdByUid: actorUid,
      createdByRole: "hr",
      createdByEmail: actorEmail || "",
    };

    try {
      await userRef.set(payload, { merge: true });

      await adminUserRef.set(
        {
          email,
          displayName: fullName,
          role: "staff",
          roleKey: "staff",
          title: "",
          active: true,
          employeeProfileEnabled: true,
          linkedUserUid: userRecord.uid,
          linkedEmployeeId: userRecord.uid,
          permissionsAllow: [],
          permissionsDeny: [],
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          source: "hr_create_staff_callable",
          createdByUid: actorUid,
          createdByRole: "hr",
          createdByEmail: actorEmail || "",
        },
        { merge: true }
      );

      await db.doc(`employees/${userRecord.uid}`).set(
        {
          uid: userRecord.uid,
          linkedUserUid: userRecord.uid,
          email,
          displayName: fullName,
          name: fullName,
          title: null,
          active: true,
          isActive: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          employeeProfile: {
            personal: {},
            employment: {
              employmentStatus: "active",
              status: "active",
              title: null,
              jobTitle: null,
              updatedAt: FieldValue.serverTimestamp(),
            },
          },
        },
        { merge: true }
      );
    } catch (error) {
      console.error("[createStaffAccount] firestore writes failed", error);

      try {
        await admin.auth().deleteUser(userRecord.uid);
      } catch (rollbackError) {
        console.error(
          "[createStaffAccount] rollback deleteUser failed",
          rollbackError
        );
      }

      throw new HttpsError("internal", "فشل حفظ بيانات المستخدم في Firestore.");
    }

    await safeWriteAuditLog(
      db,
      {
        action: "user_created",
        category: "user",
        severity: "info",
        status: "success",
        message: `HR created staff account ${userRecord.uid}`,
        entityType: "user",
        entityId: userRecord.uid,
        entityPath: userRef.path,
        relatedIds: {
          userId: userRecord.uid,
          createdByUid: actorUid,
        },
        source: {
          area: "function",
          page: "createStaffAccount",
          route: "functions.createStaffAccount",
          method: "callable_create_staff",
        },
        changes: diffAuditSnapshots(null, payload, {
          ignoreFields: ["createdAt", "updatedAt"],
        }),
        meta: {
          createdRole: "staff",
          createdByRole: "hr",
          createdByEmail: actorEmail || "",
        },
      },
      { auth: request.auth }
    );

    return {
      ok: true,
      uid: userRecord.uid,
      role: "staff",
    };
  }
);

// ✅ Admin-only callable recompute for one project
exports.recomputeProjectAggregates = onCall(
  { region: REGION },
  async request => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const isAdmin = await isAdminUid(request.auth.uid, request.auth.token.email);
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

  const isAdmin = await isAdminUid(request.auth.uid, request.auth.token.email);
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
exports.recordAttendance = onCall(
  ATTENDANCE_CALLABLE_OPTIONS,
  async request => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const actorUid = stringOrEmpty(request.auth.uid);
    const actorEmail = stringOrEmpty(request.auth.token?.email).toLowerCase();
    const role = await getUserRole(actorUid, actorEmail);
    const type = normalizeAttendanceType(request.data?.type);
    const clientLocation = normalizeAttendanceLocation(
      request.data?.location || request.data?.clientLocation
    );
    const requestedEmployeeId = stringOrEmpty(request.data?.employeeId);
    const clientTime = clampText(request.data?.clientTime, 80) || null;
    const deviceInfo = normalizeAttendanceDeviceInfo(request.data?.deviceInfo);

    if (!type) {
      throw new HttpsError(
        "invalid-argument",
        "Attendance type must be check_in or check_out."
      );
    }

    if (!clientLocation) {
      throw new HttpsError(
        "invalid-argument",
        "Valid GPS location is required."
      );
    }

    const userSnap = await db.doc(`users/${actorUid}`).get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};
    const linkedEmployeeId = pickFirstText(
      userData?.linkedEmployeeId,
      actorUid
    );

    if (
      requestedEmployeeId &&
      requestedEmployeeId !== actorUid &&
      requestedEmployeeId !== linkedEmployeeId
    ) {
      throw new HttpsError(
        "permission-denied",
        "Attendance can only be recorded for the current employee."
      );
    }

    if (
      !ATTENDANCE_ALLOWED_ROLES.has(role) &&
      !userData?.employeeProfileEnabled &&
      !linkedEmployeeId
    ) {
      throw new HttpsError(
        "permission-denied",
        "Attendance is not enabled for this account."
      );
    }

    const employeeDocId = linkedEmployeeId || actorUid;
    const employeeSnap = await db.doc(`employees/${employeeDocId}`).get();
    const employeeData = employeeSnap.exists ? employeeSnap.data() || {} : {};
    const zoneResolution = await resolveAttendanceZone(employeeData, userData);
    const zoneCheck = evaluateAttendanceZones(
      clientLocation,
      zoneResolution.zones
    );
    const zone = zoneCheck.zone;
    let result = "allowed";
    let rejectionReason = null;
    let distanceMeters = zoneCheck.distanceMeters;

    if (clientLocation.accuracy > ATTENDANCE_MAX_ACCURACY_METERS) {
      result = "rejected";
      rejectionReason = "poor_accuracy";
    } else if (zoneResolution.error) {
      result = "rejected";
      rejectionReason = zoneResolution.error;
    } else if (!zoneCheck.withinZone) {
      result = "rejected";
      rejectionReason = "outside_zone";
    }

    const recordRef = db.collection("attendance_records").doc();
    const stateRef = db.doc(`attendance_state/${actorUid}`);
    let savedResult = result;
    let savedRejectionReason = rejectionReason;
    let savedStatus = null;

    await db.runTransaction(async transaction => {
      let finalResult = result;
      let finalRejectionReason = rejectionReason;
      const stateSnap = await transaction.get(stateRef);
      const currentStatus = stateSnap.exists
        ? stringOrEmpty(stateSnap.data()?.status)
        : "";

      if (finalResult === "allowed") {
        if (type === "check_in" && currentStatus === "checked_in") {
          finalResult = "rejected";
          finalRejectionReason = "duplicate_check_in";
        } else if (type === "check_out" && currentStatus !== "checked_in") {
          finalResult = "rejected";
          finalRejectionReason = "not_checked_in";
        }
      }

      savedResult = finalResult;
      savedRejectionReason = finalRejectionReason;
      savedStatus = currentStatus || null;

      const serverTimestamp = FieldValue.serverTimestamp();
      const recordPayload = {
        employeeUid: actorUid,
        employeeDocId,
        type,
        serverTime: serverTimestamp,
        clientTime,
        clientLocation,
        zoneId: zone?.id || null,
        zoneName: zone?.name || null,
        zoneType: zone?.type || null,
        allowedZoneIds: (zoneResolution.zones || []).map(item => item.id),
        distanceMeters,
        result: finalResult,
        rejectionReason: finalRejectionReason || null,
        accuracyAccepted:
          clientLocation.accuracy <= ATTENDANCE_MAX_ACCURACY_METERS,
        deviceInfo,
        appCheck: {
          enforced: ATTENDANCE_APP_CHECK_ENFORCED,
          appId: request.app?.appId || null,
        },
        source: {
          area: "employee",
          page: "employee_profile",
          route: "functions.recordAttendance",
          method: "gps_button",
        },
        createdByUid: actorUid,
        createdByEmail: actorEmail || "",
        createdByRole: role,
        createdAt: serverTimestamp,
        updatedAt: serverTimestamp,
      };

      transaction.set(recordRef, recordPayload);

      if (finalResult === "allowed") {
        transaction.set(
          stateRef,
          {
            employeeUid: actorUid,
            employeeDocId,
            status: type === "check_in" ? "checked_in" : "checked_out",
            lastType: type,
            lastRecordId: recordRef.id,
            lastServerTime: serverTimestamp,
            lastClientLocation: clientLocation,
            lastZoneId: zone?.id || null,
            updatedAt: serverTimestamp,
          },
          { merge: true }
        );
      }
    });

    return {
      ok: savedResult === "allowed",
      id: recordRef.id,
      result: savedResult,
      type,
      rejectionReason: savedRejectionReason || null,
      accuracy: clientLocation.accuracy,
      zoneId: zone?.id || null,
      distanceMeters,
      previousStatus: savedStatus,
      currentStatus:
        savedResult === "allowed"
          ? type === "check_in"
            ? "checked_in"
            : "checked_out"
          : savedStatus,
    };
  }
);

exports.listActiveEmployeeDirectory = onCall(
  PUBLIC_WEB_CALLABLE_OPTIONS,
  async request => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const role = await getUserRole(request.auth.uid, request.auth.token.email);
    if (!EMPLOYEE_DIRECTORY_CALLER_ROLES.has(role)) {
      throw new HttpsError(
        "permission-denied",
        "Employee directory access is not allowed for this account."
      );
    }

    const usersSnap = await db.collection("users").get();
    const employees = usersSnap.docs
      .map(docSnap => sanitizeEmployeeDirectoryEntry(docSnap.id, docSnap.data() || {}))
      .filter(Boolean)
      .filter(employee => employee.uid !== request.auth.uid)
      .sort((left, right) =>
        left.name.localeCompare(right.name, "ar", { sensitivity: "base" })
      );

    return { employees };
  }
);

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
    let employeeProfileEnabled = !!existingData?.employeeProfileEnabled;
    let linkedEmployeeId = stringOrEmpty(existingData?.linkedEmployeeId);

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
      employeeProfileEnabled = !!adminUser?.employeeProfileEnabled;
      linkedEmployeeId = stringOrEmpty(adminUser?.linkedEmployeeId);
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
    let resolvedLinkedEmployeeId = linkedEmployeeId;
    if (employeeProfileEnabled && !resolvedLinkedEmployeeId) {
      resolvedLinkedEmployeeId = user.uid;
    }

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
      employeeProfileEnabled,
      linkedEmployeeId: resolvedLinkedEmployeeId || null,
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

    if (employeeProfileEnabled && resolvedLinkedEmployeeId) {
      const employeeRef = db.doc(`employees/${resolvedLinkedEmployeeId}`);
      const employeeSnap = await employeeRef.get();
      const employeeData = employeeSnap.exists ? employeeSnap.data() || {} : {};
      const employeeProfile = employeeData.employeeProfile || {};
      const employeeEmployment =
        employeeProfile.employment || employeeData.employment || {};
      const employeePersonal = employeeProfile.personal || {};
      const employeeTitle =
        stringOrEmpty(employeeData.title) ||
        stringOrEmpty(employeeEmployment.title) ||
        stringOrEmpty(employeeEmployment.jobTitle) ||
        title;

      await employeeRef.set(
        {
          uid: user.uid,
          linkedUserUid: user.uid,
          email: payload.email || "",
          displayName: finalDisplayName || "",
          name: finalDisplayName || "",
          title: employeeTitle || null,
          active,
          isActive: active,
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: employeeData.createdAt || FieldValue.serverTimestamp(),
          employeeProfile: {
            personal: employeePersonal,
            employment: {
              ...employeeEmployment,
              title:
                stringOrEmpty(employeeEmployment.title) ||
                stringOrEmpty(employeeEmployment.jobTitle) ||
                title ||
                null,
              jobTitle:
                stringOrEmpty(employeeEmployment.jobTitle) ||
                stringOrEmpty(employeeEmployment.title) ||
                title ||
                null,
              updatedAt: FieldValue.serverTimestamp(),
            },
          },
        },
        { merge: true }
      );
    }

    if (emailLower && hasAdminUserDoc) {
      await db.doc(`admin_users/${emailLower}`).set(
        {
          linkedUserUid: user.uid,
          linkedEmployeeId: resolvedLinkedEmployeeId || null,
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
  PUBLIC_WEB_CALLABLE_OPTIONS,
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

    const role = await getUserRole(request.auth.uid, request.auth.token.email);
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
