import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const tempDir = path.join(repoRoot, ".tmp");
const reportDir = path.join(repoRoot, "reports", "hr-core-migration");
const DEFAULT_BATCH_SIZE = 100;

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

function readProjectId(explicit = "") {
  const direct = normalizeText(explicit);
  if (direct) return direct;
  const envValue = normalizeText(
    process.env.FIREBASE_PROJECT_ID || process.env.VITE_FB_PROJECT_ID
  );
  if (envValue) return envValue;
  const firebaserc = JSON.parse(
    fs.readFileSync(path.join(repoRoot, ".firebaserc"), "utf8")
  );
  return normalizeText(firebaserc?.projects?.default);
}

function getFirebaseToolsLibRoot() {
  const candidates = [
    path.join(repoRoot, "node_modules", "firebase-tools", "lib"),
    path.join(
      process.env.APPDATA || "",
      "npm",
      "node_modules",
      "firebase-tools",
      "lib"
    ),
  ];
  return candidates.find(candidate => candidate && fs.existsSync(candidate)) || "";
}

function getFirebaseToolsAccount(libRoot) {
  const firebaseAuth = require(path.join(libRoot, "auth.js"));
  const projectAccount = firebaseAuth.getProjectDefaultAccount(repoRoot);
  if (projectAccount?.tokens?.refresh_token) return projectAccount;
  const globalAccount = firebaseAuth.getGlobalDefaultAccount();
  if (globalAccount?.tokens?.refresh_token) return globalAccount;
  throw new Error(
    "No Firebase CLI refresh token was found. Run `firebase login` or set GOOGLE_APPLICATION_CREDENTIALS."
  );
}

function writeAuthorizedUserCredentials(account, libRoot) {
  const firebaseApi = require(path.join(libRoot, "api.js"));
  fs.mkdirSync(tempDir, { recursive: true });
  const credentialsPath = path.join(tempDir, "firebase-authorized-user.json");
  fs.writeFileSync(
    credentialsPath,
    JSON.stringify(
      {
        type: "authorized_user",
        client_id: firebaseApi.clientId(),
        client_secret: firebaseApi.clientSecret(),
        refresh_token: account.tokens.refresh_token,
      },
      null,
      2
    ),
    "utf8"
  );
  return credentialsPath;
}

function ensureFirebaseCredentials() {
  const existing = normalizeText(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  if (existing) return existing;
  const libRoot = getFirebaseToolsLibRoot();
  if (!libRoot) {
    throw new Error(
      "firebase-tools credentials helper was not found. Install/login with Firebase CLI or set GOOGLE_APPLICATION_CREDENTIALS."
    );
  }
  const account = getFirebaseToolsAccount(libRoot);
  const credentialsPath = writeAuthorizedUserCredentials(account, libRoot);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
  return credentialsPath;
}

function ensureFirebaseAdmin(projectId) {
  if (admin.apps.length) return;
  ensureFirebaseCredentials();
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });
}

function normalizeText(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "undefined" || text === "null") return "";
  return text;
}

function normalizeRole(value) {
  const normalized = normalizeText(value).toLowerCase();
  const aliases = {
    employee: "staff",
    human_resources: "hr",
    "human-resources": "hr",
    "human resources": "hr",
    administrator: "admin",
    super_admin: "admin",
    "super-admin": "admin",
  };
  const role = aliases[normalized] || normalized;
  return ["owner", "admin", "accountant", "hr", "staff", "client", "guest"].includes(
    role
  )
    ? role
    : "staff";
}

function parseBoolean(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = normalizeText(value).toLowerCase();
  if (["active", "enabled", "true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (
    ["inactive", "disabled", "false", "0", "no", "off", "deleted"].includes(
      normalized
    )
  ) {
    return false;
  }
  return fallback;
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null);
}

function serializeFirestoreValue(value) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeFirestoreValue);
  if (typeof value === "object") {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = serializeFirestoreValue(item);
    }
    return output;
  }
  return value;
}

function sourceUpdatedAt(data) {
  return (
    serializeFirestoreValue(
      data?.updatedAt || data?.employeeProfile?.updatedAt || data?.createdAt
    ) || null
  );
}

function resolveActive(data) {
  const employment = data?.employeeProfile?.employment || data?.employment || {};
  const status = firstText(
    data?.employmentStatus,
    data?.status,
    employment?.employmentStatus,
    employment?.status
  ).toLowerCase();
  const explicit = firstDefined(data?.isActive, data?.active, employment?.isActive);
  if (explicit !== undefined) return parseBoolean(explicit, true);
  return !["inactive", "suspended", "terminated", "deleted"].includes(status);
}

function resolveAccountUid(data, fallbackId, emailToUid) {
  const direct = firstText(
    data?.uid,
    data?.authUid,
    data?.userId,
    data?.linkedUserUid,
    data?.employeeUid
  );
  if (direct) return direct;
  const email = normalizeText(data?.email).toLowerCase();
  if (email && emailToUid.has(email)) return emailToUid.get(email);
  return normalizeText(fallbackId);
}

function mapUserAccount(id, raw) {
  const data = serializeFirestoreValue(raw || {});
  const profile = data?.employeeProfile || {};
  const personal = profile?.personal || data?.personal || {};
  const employment = profile?.employment || data?.employment || {};
  const uid = firstText(data?.uid, data?.authUid, id);
  if (!uid) return null;
  return {
    uid,
    email: firstText(data?.email, personal?.email).toLowerCase() || null,
    username: firstText(data?.username, data?.userName).toLowerCase() || null,
    displayName:
      firstText(data?.displayName, data?.name, data?.fullName, personal?.name) ||
      null,
    title: firstText(data?.title, employment?.title, employment?.jobTitle) || null,
    role: normalizeRole(data?.role || data?.roleKey || "staff"),
    isActive: resolveActive(data),
    employeeProfileEnabled: parseBoolean(
      data?.employeeProfileEnabled,
      Boolean(data?.linkedEmployeeId || Object.keys(profile).length)
    ),
    linkedEmployeeId: firstText(
      data?.linkedEmployeeId,
      data?.employeeId,
      employment?.employeeId
    ) || null,
    authProvider: firstText(data?.authProvider, "firebase"),
    sourceUpdatedAt: sourceUpdatedAt(data),
    permissionsAllow: Array.isArray(data?.permissionsAllow)
      ? data.permissionsAllow.filter(item => typeof item === "string")
      : [],
    permissionsDeny: Array.isArray(data?.permissionsDeny)
      ? data.permissionsDeny.filter(item => typeof item === "string")
      : [],
  };
}

function mergeAccount(base, overlay) {
  if (!base) return overlay;
  if (!overlay) return base;
  const basePriority = rolePriority(base.role);
  const overlayPriority = rolePriority(overlay.role);
  const preferred = overlayPriority > basePriority ? overlay : base;
  return {
    ...base,
    ...overlay,
    uid: base.uid,
    email: overlay.email || base.email,
    username: overlay.username || base.username,
    displayName: overlay.displayName || base.displayName,
    title: overlay.title || base.title,
    role: preferred.role,
    isActive: base.isActive && overlay.isActive,
    employeeProfileEnabled:
      base.employeeProfileEnabled || overlay.employeeProfileEnabled,
    linkedEmployeeId: overlay.linkedEmployeeId || base.linkedEmployeeId,
    permissionsAllow: [
      ...new Set([...(base.permissionsAllow || []), ...(overlay.permissionsAllow || [])]),
    ],
    permissionsDeny: [
      ...new Set([...(base.permissionsDeny || []), ...(overlay.permissionsDeny || [])]),
    ],
    sourceUpdatedAt: overlay.sourceUpdatedAt || base.sourceUpdatedAt,
  };
}

function rolePriority(role) {
  return {
    guest: 0,
    client: 1,
    staff: 2,
    hr: 3,
    accountant: 4,
    admin: 5,
    owner: 6,
  }[role] ?? 0;
}

function mapEmployee(id, raw, emailToUid) {
  const data = serializeFirestoreValue(raw || {});
  const profile = data?.employeeProfile || {};
  const personal = profile?.personal || data?.personal || {};
  const employment = profile?.employment || data?.employment || {};
  const workSchedule = employment?.workSchedule || {};
  const authUid = resolveAccountUid(data, "", emailToUid) || null;
  const name = firstText(
    data?.displayName,
    data?.name,
    data?.fullName,
    personal?.name,
    id
  );
  if (!id || !name) return null;
  const status = firstText(
    data?.employmentStatus,
    data?.status,
    employment?.employmentStatus,
    employment?.status,
    "active"
  ).toLowerCase();
  return {
    id,
    authUid,
    name,
    email: firstText(data?.email, personal?.email).toLowerCase() || null,
    phone: firstText(
      data?.phone,
      data?.mobile,
      data?.phoneNumber,
      personal?.phone
    ) || null,
    avatarUrl: firstText(
      data?.avatarUrl,
      data?.photoURL,
      personal?.avatar?.fileUrl,
      personal?.avatarUrl
    ) || null,
    title: firstText(
      data?.title,
      data?.jobTitle,
      employment?.title,
      employment?.jobTitle
    ) || null,
    department: firstText(data?.department, employment?.department) || null,
    employeeCode: firstText(data?.employeeCode, employment?.employeeCode) || null,
    fingerprintNumber:
      firstText(data?.fingerprintNumber, employment?.fingerprintNumber) || null,
    employmentStatus: status || "active",
    isActive: resolveActive(data),
    startDate:
      firstText(
        data?.startDate,
        data?.hireDate,
        data?.joinedAt,
        employment?.startDate
      ) || null,
    leaveBalance: numberOrNull(firstDefined(data?.leaveBalance, employment?.leaveBalance)),
    baseSalary: numberOrNull(firstDefined(data?.baseSalary, employment?.baseSalary)),
    housingAllowance: numberOrNull(
      firstDefined(data?.housingAllowance, employment?.housingAllowance)
    ),
    transportationAllowance: numberOrNull(
      firstDefined(data?.transportationAllowance, employment?.transportationAllowance)
    ),
    otherAllowances: numberOrNull(
      firstDefined(data?.otherAllowances, employment?.otherAllowances)
    ),
    insuranceDeduction: numberOrNull(
      firstDefined(data?.insuranceDeduction, employment?.insuranceDeduction)
    ),
    shiftStartTime:
      firstText(data?.shiftStartTime, employment?.shiftStartTime, workSchedule?.startTime) ||
      null,
    shiftEndTime:
      firstText(data?.shiftEndTime, employment?.shiftEndTime, workSchedule?.endTime) ||
      null,
    weeklyOffDays: arrayOrEmpty(
      data?.weeklyOffDays || employment?.weeklyOffDays || workSchedule?.weeklyOffDays
    ),
    allowedZoneIds: arrayOrEmpty(data?.allowedZoneIds || employment?.allowedZoneIds),
    salaryDeductions: arrayOrEmpty(
      data?.salaryDeductions || employment?.salaryDeductions
    ),
    adminNotes: firstText(data?.adminNotes, employment?.adminNotes) || null,
    personal,
    employment,
    source: "firestore",
    sourceUpdatedAt: sourceUpdatedAt(data),
  };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function stableHash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function dedupeAccountIdentifiers(accounts, warnings) {
  const seenEmails = new Map();
  const seenUsernames = new Map();
  for (const account of accounts) {
    if (account.email) {
      const previous = seenEmails.get(account.email);
      if (previous && previous !== account.uid) {
        warnings.push({
          type: "duplicate_email",
          value: account.email,
          keptUid: previous,
          clearedUid: account.uid,
        });
        account.email = null;
      } else {
        seenEmails.set(account.email, account.uid);
      }
    }
    if (account.username) {
      const previous = seenUsernames.get(account.username);
      if (previous && previous !== account.uid) {
        warnings.push({
          type: "duplicate_username",
          value: account.username,
          keptUid: previous,
          clearedUid: account.uid,
        });
        account.username = null;
      } else {
        seenUsernames.set(account.username, account.uid);
      }
    }
  }
}

async function readCollection(db, name) {
  const snapshot = await db.collection(name).get();
  return snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
}

async function postBatch({ apiUrl, secret, runId, accounts, employees, complete }) {
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/internal/hr/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-HR-Sync-Secret": secret,
    },
    body: JSON.stringify({ runId, accounts, employees, complete }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(
      `Cloudflare import failed (${response.status}): ${JSON.stringify(payload)}`
    );
  }
  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = readProjectId(args.project);
  const apiUrl = normalizeText(args["api-url"] || process.env.HR_CORE_API_URL);
  const syncSecret = normalizeText(
    args["sync-secret"] || process.env.HR_SYNC_SECRET
  );
  const dryRun = Boolean(args["dry-run"]);
  const accountsOnly = Boolean(args["accounts-only"]);
  const batchSize = Math.min(
    200,
    Math.max(10, Number.parseInt(args["batch-size"] || DEFAULT_BATCH_SIZE, 10))
  );

  if (!projectId) throw new Error("Firebase project id could not be resolved.");
  if (!dryRun && !apiUrl) throw new Error("--api-url or HR_CORE_API_URL is required.");
  if (!dryRun && !syncSecret) {
    throw new Error("--sync-secret or HR_SYNC_SECRET is required.");
  }

  ensureFirebaseAdmin(projectId);
  const firestore = admin.firestore();
  console.log(`[hr-migration] Reading Firestore project ${projectId}...`);

  const [userDocs, employeeDocs, adminUserDocs] = await Promise.all([
    readCollection(firestore, "users"),
    accountsOnly ? Promise.resolve([]) : readCollection(firestore, "employees"),
    readCollection(firestore, "admin_users"),
  ]);

  const accountMap = new Map();
  const emailToUid = new Map();

  for (const doc of userDocs) {
    const account = mapUserAccount(doc.id, doc.data);
    if (!account) continue;
    accountMap.set(account.uid, mergeAccount(accountMap.get(account.uid), account));
    if (account.email) emailToUid.set(account.email, account.uid);
  }

  const unresolvedAdminUsers = [];
  for (const doc of adminUserDocs) {
    const data = serializeFirestoreValue(doc.data || {});
    const email = normalizeText(data?.email || doc.id).toLowerCase();
    const uid = resolveAccountUid(data, "", emailToUid);
    if (!uid) {
      unresolvedAdminUsers.push({ id: doc.id, email: email || null });
      continue;
    }
    const account = mapUserAccount(uid, { ...data, uid, email });
    accountMap.set(uid, mergeAccount(accountMap.get(uid), account));
    if (email) emailToUid.set(email, uid);
  }

  const employees = [];
  for (const doc of employeeDocs) {
    const employee = mapEmployee(doc.id, doc.data, emailToUid);
    if (!employee) continue;
    employees.push(employee);

    if (employee.authUid) {
      const existing = accountMap.get(employee.authUid);
      const placeholder = {
        uid: employee.authUid,
        email: employee.email,
        username: null,
        displayName: employee.name,
        title: employee.title,
        role: existing?.role || "staff",
        isActive: employee.isActive,
        employeeProfileEnabled: true,
        linkedEmployeeId: employee.id,
        authProvider: "firebase",
        sourceUpdatedAt: employee.sourceUpdatedAt,
        permissionsAllow: existing?.permissionsAllow || [],
        permissionsDeny: existing?.permissionsDeny || [],
      };
      accountMap.set(employee.authUid, mergeAccount(existing, placeholder));
    }
  }

  const accounts = Array.from(accountMap.values()).sort((a, b) =>
    a.uid.localeCompare(b.uid)
  );
  employees.sort((a, b) => a.id.localeCompare(b.id));

  const warnings = [];
  dedupeAccountIdentifiers(accounts, warnings);

  const runId = `hr-${new Date().toISOString().replace(/[:.]/g, "-")}-${stableHash(
    `${accounts.length}:${employees.length}`
  )}`;
  const report = {
    runId,
    projectId,
    generatedAt: new Date().toISOString(),
    dryRun,
    accountsOnly,
    counts: {
      usersCollection: userDocs.length,
      adminUsersCollection: adminUserDocs.length,
      employeesCollection: employeeDocs.length,
      accountsPrepared: accounts.length,
      employeesPrepared: employees.length,
      unresolvedAdminUsers: unresolvedAdminUsers.length,
      warnings: warnings.length,
    },
    unresolvedAdminUsers,
    warnings,
  };

  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `${runId}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify(report.counts, null, 2));
  console.log(`[hr-migration] Mode: ${accountsOnly ? "accounts-only" : "full"}`);
  console.log(`[hr-migration] Report: ${reportPath}`);

  if (dryRun) {
    console.log("[hr-migration] Dry run completed. No Cloudflare data was changed.");
    return;
  }

  const accountBatches = Math.ceil(accounts.length / batchSize);
  const employeeBatches = Math.ceil(employees.length / batchSize);
  let sentAccounts = 0;
  let sentEmployees = 0;

  for (let index = 0; index < accountBatches; index += 1) {
    const batch = accounts.slice(index * batchSize, (index + 1) * batchSize);
    await postBatch({
      apiUrl,
      secret: syncSecret,
      runId,
      accounts: batch,
      employees: [],
      complete: false,
    });
    sentAccounts += batch.length;
    console.log(`[hr-migration] Accounts ${sentAccounts}/${accounts.length}`);
  }

  for (let index = 0; index < employeeBatches; index += 1) {
    const batch = employees.slice(index * batchSize, (index + 1) * batchSize);
    const isLast = index === employeeBatches - 1;
    await postBatch({
      apiUrl,
      secret: syncSecret,
      runId,
      accounts: [],
      employees: batch,
      complete: isLast,
    });
    sentEmployees += batch.length;
    console.log(`[hr-migration] Employees ${sentEmployees}/${employees.length}`);
  }

  if (!employeeBatches) {
    await postBatch({
      apiUrl,
      secret: syncSecret,
      runId,
      accounts: [],
      employees: [],
      complete: true,
    });
  }

  console.log(`[hr-migration] Completed run ${runId}.`);
}

main().catch(error => {
  console.error("[hr-migration] Failed:", error);
  process.exitCode = 1;
});
