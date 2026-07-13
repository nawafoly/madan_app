import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const workersDir = path.join(repoRoot, "workers");
const wranglerConfigPath = path.join(workersDir, "wrangler.toml");
const defaultReportsDir = path.join(repoRoot, "reports", "account-audit");

const ISSUE_TYPES = [
  "auth_user_missing_in_firestore",
  "users_document_missing",
  "uid_missing_or_mismatch",
  "email_mismatch",
  "admin_user_missing",
  "admin_user_document_id_mismatch",
  "username_mapping_missing",
  "username_email_mismatch",
  "employee_link_missing",
  "duplicate_email",
  "duplicate_username",
  "orphan_employee",
  "orphan_admin_user",
];

const ADMIN_ACCOUNT_ROLES = new Set([
  "owner",
  "admin",
  "hr",
  "accountant",
  "staff",
]);

const EMPLOYEE_RECORD_ROLES = new Set(["hr", "accountant", "staff"]);

function parseArgs(argv) {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = "true";
      continue;
    }

    result[key] = next;
    index += 1;
  }

  return result;
}

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/audit-legacy-accounts.mjs [options]

Options:
  --project-id <id>      Firebase project id. Defaults to .firebaserc.
  --out-dir <path>       Output directory. Defaults to reports/account-audit.
  --include-d1           Read employee_directory from Cloudflare D1.
  --d1-remote            Use remote D1 when --include-d1 is set. Local D1 is used by default.
  --d1-database <name>   D1 database name. Defaults to DOCUMENTS_DB in workers/wrangler.toml.
  --help                 Show this help.

Credentials:
  Uses Firebase Admin SDK application default credentials only.
  Set GOOGLE_APPLICATION_CREDENTIALS to a local service account or ADC file before running.

Safety:
  This script is read-only for Firebase Authentication, Firestore, and D1.
  It does not write migrations, fixes, tokens, passwords, or private keys.
`);
}

function readProjectId(explicitProjectId = "") {
  const direct = stringOrEmpty(explicitProjectId);
  if (direct) return direct;

  const envProjectId = stringOrEmpty(process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT);
  if (envProjectId) return envProjectId;

  const firebasercPath = path.join(repoRoot, ".firebaserc");
  const firebaserc = JSON.parse(fs.readFileSync(firebasercPath, "utf8"));
  return stringOrEmpty(firebaserc?.projects?.default);
}

function initializeFirebaseAdmin(projectId) {
  if (admin.apps.length) return;

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });
}

async function listAllAuthUsers(auth) {
  const users = [];
  let pageToken;

  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);

  return users;
}

async function listCollection(db, collectionName) {
  const snap = await db.collection(collectionName).get();
  return snap.docs.map((docSnap) => ({
    id: docSnap.id,
    path: docSnap.ref.path,
    data: docSnap.data() || {},
  }));
}

function readD1DatabaseName(explicitName = "") {
  const direct = stringOrEmpty(explicitName);
  if (direct) return direct;

  const wranglerToml = fs.readFileSync(wranglerConfigPath, "utf8");
  const sections = wranglerToml.split(/\[\[d1_databases\]\]/g).slice(1);

  for (const section of sections) {
    const binding = section.match(/binding\s*=\s*"([^"]+)"/)?.[1] || "";
    const databaseName = section.match(/database_name\s*=\s*"([^"]+)"/)?.[1] || "";
    if (binding === "DOCUMENTS_DB" && databaseName) return databaseName;
  }

  const fallback = wranglerToml.match(/database_name\s*=\s*"([^"]+)"/)?.[1] || "";
  return stringOrEmpty(fallback);
}

function readD1EmployeeDirectory({ includeD1, databaseName, remote }) {
  if (!includeD1) {
    return {
      status: "skipped",
      mode: "not_requested",
      databaseName: databaseName || "",
      rows: [],
      error: "",
    };
  }

  if (!databaseName) {
    return {
      status: "error",
      mode: remote ? "remote" : "local",
      databaseName: "",
      rows: [],
      error: "Unable to resolve D1 database name.",
    };
  }

  const query = [
    "SELECT uid, email, linked_employee_id",
    "FROM employee_directory",
    "ORDER BY uid",
  ].join(" ");

  const args = [
    "wrangler",
    "d1",
    "execute",
    databaseName,
    remote ? "--remote" : "--local",
    "--config",
    wranglerConfigPath,
    "--command",
    query,
    "--json",
  ];

  try {
    const output = execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    return {
      status: "success",
      mode: remote ? "remote" : "local",
      databaseName,
      rows: extractD1Rows(parseJsonFromCommandOutput(output)),
      error: "",
    };
  } catch (error) {
    return {
      status: "error",
      mode: remote ? "remote" : "local",
      databaseName,
      rows: [],
      error: stringOrEmpty(error?.stderr) || stringOrEmpty(error?.message) || String(error),
    };
  }
}

function parseJsonFromCommandOutput(output) {
  const text = stringOrEmpty(output);
  const objectIndex = text.indexOf("{");
  const arrayIndex = text.indexOf("[");
  const indexes = [objectIndex, arrayIndex].filter((index) => index >= 0);
  if (!indexes.length) throw new Error("Wrangler did not return JSON output.");

  return JSON.parse(text.slice(Math.min(...indexes)));
}

function extractD1Rows(payload) {
  if (Array.isArray(payload)) {
    return payload.flatMap((entry) => Array.isArray(entry?.results) ? entry.results : []);
  }

  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.result?.[0]?.results)) return payload.result[0].results;
  return [];
}

function buildIndexes({ authUsers, usersDocs, adminUsersDocs, adminUsernamesDocs, employeesDocs, d1Rows }) {
  const authByUid = new Map();
  const authByEmail = new Map();
  const usersById = new Map();
  const usersByUid = new Map();
  const usersByEmail = new Map();
  const usersByLinkedEmployeeId = new Map();
  const adminUsersById = new Map();
  const adminUsersByUid = new Map();
  const adminUsersByEmail = new Map();
  const adminUsernamesById = new Map();
  const adminUsernamesByUid = new Map();
  const employeesById = new Map();
  const employeesByUid = new Map();
  const employeesByEmail = new Map();
  const d1ByUid = new Map();
  const emailOwners = new Map();
  const usernameOwners = new Map();

  for (const user of authUsers) {
    authByUid.set(user.uid, user);
    addUnique(authByEmail, normalizeEmail(user.email), user);
    addOwner(emailOwners, user.email, user.uid);
  }

  for (const doc of usersDocs) {
    usersById.set(doc.id, doc);
    const uid = pickText(doc.data?.uid, doc.id);
    addUnique(usersByUid, uid, doc);
    addUnique(usersByEmail, pickUserEmail(doc.data), doc);
    addUnique(usersByLinkedEmployeeId, doc.data?.linkedEmployeeId, doc);
    addOwner(emailOwners, pickUserEmail(doc.data), uid || `users:${doc.id}`);
    addOwner(usernameOwners, pickUsername(doc.data), uid || `users:${doc.id}`);
  }

  for (const doc of adminUsersDocs) {
    adminUsersById.set(doc.id, doc);
    const uid = pickText(doc.data?.linkedUserUid, doc.data?.uid, doc.data?.userId);
    const email = pickText(doc.data?.email, looksLikeEmail(doc.id) ? doc.id : "");
    addUnique(adminUsersByUid, uid, doc);
    addUnique(adminUsersByEmail, email, doc);
    addOwner(emailOwners, email, uid || `admin_users:${doc.id}`);
    addOwner(usernameOwners, pickUsername(doc.data), uid || `admin_users:${doc.id}`);
  }

  for (const doc of adminUsernamesDocs) {
    const username = normalizeUsername(doc.id);
    adminUsernamesById.set(username, doc);
    addUnique(adminUsernamesByUid, doc.data?.uid, doc);
    addOwner(emailOwners, doc.data?.email, pickText(doc.data?.uid) || `admin_usernames:${doc.id}`);
    addOwner(usernameOwners, username, pickText(doc.data?.uid) || `admin_usernames:${doc.id}`);
  }

  for (const doc of employeesDocs) {
    employeesById.set(doc.id, doc);
    const uid = pickText(doc.data?.linkedUserUid, doc.data?.uid, doc.data?.userId);
    addUnique(employeesByUid, uid, doc);
    addUnique(employeesByEmail, pickEmployeeEmail(doc.data), doc);
    addOwner(emailOwners, pickEmployeeEmail(doc.data), uid || `employees:${doc.id}`);
  }

  for (const row of d1Rows) {
    const uid = pickText(row?.uid);
    if (!uid) continue;
    d1ByUid.set(uid, row);
    addOwner(emailOwners, row?.email, uid);
  }

  return {
    authByUid,
    authByEmail,
    usersById,
    usersByUid,
    usersByEmail,
    usersByLinkedEmployeeId,
    adminUsersById,
    adminUsersByUid,
    adminUsersByEmail,
    adminUsernamesById,
    adminUsernamesByUid,
    employeesById,
    employeesByUid,
    employeesByEmail,
    d1ByUid,
    emailOwners,
    usernameOwners,
  };
}

function buildAuthRecord(authUser, indexes, used) {
  const uid = authUser.uid;
  const authEmail = normalizeEmail(authUser.email);
  const userDoc = resolveUserDocForAuth(authUser, indexes);
  const userData = userDoc?.data || {};
  const adminDoc = resolveAdminUserDocForAuth(authUser, userDoc, indexes);
  const adminData = adminDoc?.data || {};
  const username = normalizeUsername(pickUsername(adminData, userData));
  const usernameDoc = username ? indexes.adminUsernamesById.get(username) : null;
  const employeeDoc = resolveEmployeeDocForAuth(authUser, userDoc, adminDoc, indexes);
  const employeeData = employeeDoc?.data || {};
  const linkedEmployeeId = pickText(userData?.linkedEmployeeId, adminData?.linkedEmployeeId, employeeDoc?.id);
  const d1Row = indexes.d1ByUid.get(uid) || null;
  const role = normalizeRole(pickText(userData?.role, adminData?.role, authUser.customClaims?.role));
  const roleKey = normalizeRole(pickText(userData?.roleKey, adminData?.roleKey));
  const issues = new Set();

  if (userDoc) used.userDocIds.add(userDoc.id);
  if (adminDoc) used.adminDocIds.add(adminDoc.id);
  if (employeeDoc) used.employeeDocIds.add(employeeDoc.id);

  if (!userDoc) {
    issues.add("auth_user_missing_in_firestore");
  }

  if (!indexes.usersById.has(uid)) {
    issues.add("users_document_missing");
  }

  validateUidConsistency({
    issues,
    uid,
    userDoc,
    adminDoc,
    usernameDoc,
    employeeDoc,
  });

  validateEmailConsistency({
    issues,
    authEmail,
    usersEmail: pickUserEmail(userData),
    adminEmail: pickText(adminData?.email, looksLikeEmail(adminDoc?.id) ? adminDoc?.id : ""),
    usernameEmail: pickText(usernameDoc?.data?.email),
    employeeEmail: pickEmployeeEmail(employeeData),
    d1Email: pickText(d1Row?.email),
  });

  if (requiresAdminUser(userData, adminData, role, roleKey, username) && !adminDoc) {
    issues.add("admin_user_missing");
  }

  if (adminDoc && authEmail && normalizeEmail(adminDoc.id) !== authEmail) {
    issues.add("admin_user_document_id_mismatch");
  }

  if (username && !usernameDoc) {
    issues.add("username_mapping_missing");
  }

  if (usernameDoc && authEmail && normalizeEmail(usernameDoc.data?.email) !== authEmail) {
    issues.add("username_email_mismatch");
  }

  if (requiresEmployeeRecord(userData, adminData, role, roleKey, linkedEmployeeId) && !employeeDoc) {
    issues.add("employee_link_missing");
  }

  if (linkedEmployeeId && !indexes.employeesById.has(linkedEmployeeId)) {
    issues.add("employee_link_missing");
  }

  if (authEmail && ownerCount(indexes.emailOwners, authEmail) > 1) {
    issues.add("duplicate_email");
  }

  if (username && ownerCount(indexes.usernameOwners, username) > 1) {
    issues.add("duplicate_username");
  }

  return buildRecord({
    recordType: "auth_user",
    issues,
    uid,
    authEmail,
    userDoc,
    adminDoc,
    username,
    usernameDoc,
    employeeDoc,
    role,
    roleKey,
    linkedUserUid: pickText(adminData?.linkedUserUid, adminData?.uid, adminData?.userId),
    linkedEmployeeId,
    d1Row,
  });
}

function buildFirestoreUserWithoutAuthRecord(userDoc, indexes, used) {
  const userData = userDoc.data || {};
  const uid = pickText(userData?.uid, userDoc.id);
  const email = normalizeEmail(pickUserEmail(userData));
  const adminDoc = resolveAdminUserDocForFirestoreUser(userDoc, indexes);
  const username = normalizeUsername(pickUsername(adminDoc?.data, userData));
  const usernameDoc = username ? indexes.adminUsernamesById.get(username) : null;
  const employeeDoc = resolveEmployeeDocForFirestoreUser(userDoc, indexes);
  const role = normalizeRole(pickText(userData?.role, adminDoc?.data?.role));
  const roleKey = normalizeRole(pickText(userData?.roleKey, adminDoc?.data?.roleKey));
  const linkedEmployeeId = pickText(userData?.linkedEmployeeId, adminDoc?.data?.linkedEmployeeId, employeeDoc?.id);
  const d1Row = indexes.d1ByUid.get(uid) || null;
  const issues = new Set(["auth_user_missing_in_firestore"]);

  used.userDocIds.add(userDoc.id);
  if (adminDoc) used.adminDocIds.add(adminDoc.id);
  if (employeeDoc) used.employeeDocIds.add(employeeDoc.id);

  if (!userData?.uid || pickText(userData?.uid) !== userDoc.id) {
    issues.add("uid_missing_or_mismatch");
  }

  if (adminDoc && email && normalizeEmail(adminDoc.id) !== email) {
    issues.add("admin_user_document_id_mismatch");
  }

  if (username && !usernameDoc) {
    issues.add("username_mapping_missing");
  }

  if (usernameDoc && email && normalizeEmail(usernameDoc.data?.email) !== email) {
    issues.add("username_email_mismatch");
  }

  if (email && ownerCount(indexes.emailOwners, email) > 1) {
    issues.add("duplicate_email");
  }

  if (username && ownerCount(indexes.usernameOwners, username) > 1) {
    issues.add("duplicate_username");
  }

  return buildRecord({
    recordType: "firestore_user_without_auth",
    issues,
    uid,
    authEmail: "",
    userDoc,
    adminDoc,
    username,
    usernameDoc,
    employeeDoc,
    role,
    roleKey,
    linkedUserUid: pickText(adminDoc?.data?.linkedUserUid, adminDoc?.data?.uid, adminDoc?.data?.userId),
    linkedEmployeeId,
    d1Row,
  });
}

function buildOrphanAdminUserRecord(adminDoc, indexes, used) {
  const data = adminDoc.data || {};
  const uid = pickText(data?.linkedUserUid, data?.uid, data?.userId);
  const email = normalizeEmail(pickText(data?.email, looksLikeEmail(adminDoc.id) ? adminDoc.id : ""));
  const username = normalizeUsername(pickUsername(data));
  const usernameDoc = username ? indexes.adminUsernamesById.get(username) : null;
  const employeeDoc = uid ? first(indexes.employeesByUid.get(uid)) : null;
  const role = normalizeRole(pickText(data?.role));
  const roleKey = normalizeRole(pickText(data?.roleKey));
  const issues = new Set(["orphan_admin_user"]);

  used.adminDocIds.add(adminDoc.id);
  if (employeeDoc) used.employeeDocIds.add(employeeDoc.id);

  if (!uid) issues.add("uid_missing_or_mismatch");
  if (email && normalizeEmail(adminDoc.id) !== email) issues.add("admin_user_document_id_mismatch");
  if (username && !usernameDoc) issues.add("username_mapping_missing");
  if (usernameDoc && email && normalizeEmail(usernameDoc.data?.email) !== email) {
    issues.add("username_email_mismatch");
  }
  if (email && ownerCount(indexes.emailOwners, email) > 1) issues.add("duplicate_email");
  if (username && ownerCount(indexes.usernameOwners, username) > 1) issues.add("duplicate_username");

  return buildRecord({
    recordType: "orphan_admin_user",
    issues,
    uid,
    authEmail: "",
    userDoc: null,
    adminDoc,
    username,
    usernameDoc,
    employeeDoc,
    role,
    roleKey,
    linkedUserUid: uid,
    linkedEmployeeId: pickText(data?.linkedEmployeeId, employeeDoc?.id),
    d1Row: uid ? indexes.d1ByUid.get(uid) : null,
  });
}

function buildOrphanEmployeeRecord(employeeDoc, indexes, used) {
  const data = employeeDoc.data || {};
  const uid = pickText(data?.linkedUserUid, data?.uid, data?.userId);
  const email = normalizeEmail(pickEmployeeEmail(data));
  const username = "";
  const issues = new Set(["orphan_employee"]);

  used.employeeDocIds.add(employeeDoc.id);

  if (!uid) issues.add("uid_missing_or_mismatch");
  if (email && ownerCount(indexes.emailOwners, email) > 1) issues.add("duplicate_email");

  return buildRecord({
    recordType: "orphan_employee",
    issues,
    uid,
    authEmail: "",
    userDoc: null,
    adminDoc: null,
    username,
    usernameDoc: null,
    employeeDoc,
    role: normalizeRole(pickText(data?.role)),
    roleKey: normalizeRole(pickText(data?.roleKey)),
    linkedUserUid: uid,
    linkedEmployeeId: employeeDoc.id,
    d1Row: uid ? indexes.d1ByUid.get(uid) : null,
  });
}

function buildRecord({
  recordType,
  issues,
  uid,
  authEmail,
  userDoc,
  adminDoc,
  username,
  usernameDoc,
  employeeDoc,
  role,
  roleKey,
  linkedUserUid,
  linkedEmployeeId,
  d1Row,
}) {
  const issueList = Array.from(issues).filter((issue) => ISSUE_TYPES.includes(issue)).sort();

  return {
    recordType,
    overallStatus: issueList.length ? "needs_repair" : "healthy",
    issues: issueList,
    uid: stringOrEmpty(uid),
    authEmail: normalizeEmail(authEmail),
    usersDocumentId: stringOrEmpty(userDoc?.id),
    usersEmail: normalizeEmail(pickText(userDoc?.data?.email)),
    username: normalizeUsername(username),
    adminUsersDocumentId: stringOrEmpty(adminDoc?.id),
    linkedUserUid: stringOrEmpty(linkedUserUid),
    linkedEmployeeId: stringOrEmpty(linkedEmployeeId),
    employeeDocumentId: stringOrEmpty(employeeDoc?.id),
    role: normalizeRole(role),
    roleKey: normalizeRole(roleKey),
    hasUsernameMapping: Boolean(usernameDoc),
    usernameMappingEmail: normalizeEmail(usernameDoc?.data?.email),
    d1EmployeeDirectoryEmail: normalizeEmail(d1Row?.email),
    d1LinkedEmployeeId: stringOrEmpty(d1Row?.linked_employee_id),
  };
}

function resolveUserDocForAuth(authUser, indexes) {
  const authEmail = normalizeEmail(authUser.email);
  return (
    indexes.usersById.get(authUser.uid) ||
    first(indexes.usersByUid.get(authUser.uid)) ||
    first(indexes.usersByEmail.get(authEmail)) ||
    null
  );
}

function resolveAdminUserDocForAuth(authUser, userDoc, indexes) {
  const authEmail = normalizeEmail(authUser.email);
  const userData = userDoc?.data || {};
  const username = normalizeUsername(pickUsername(userData));

  return (
    indexes.adminUsersById.get(authEmail) ||
    first(indexes.adminUsersByUid.get(authUser.uid)) ||
    first(indexes.adminUsersByEmail.get(authEmail)) ||
    findAdminDocByUsername(username, indexes) ||
    null
  );
}

function resolveAdminUserDocForFirestoreUser(userDoc, indexes) {
  const data = userDoc?.data || {};
  const uid = pickText(data?.uid, userDoc?.id);
  const email = normalizeEmail(pickUserEmail(data));
  const username = normalizeUsername(pickUsername(data));

  return (
    indexes.adminUsersById.get(email) ||
    first(indexes.adminUsersByUid.get(uid)) ||
    first(indexes.adminUsersByEmail.get(email)) ||
    findAdminDocByUsername(username, indexes) ||
    null
  );
}

function findAdminDocByUsername(username, indexes) {
  if (!username) return null;

  for (const doc of indexes.adminUsersById.values()) {
    if (normalizeUsername(pickUsername(doc.data)) === username) return doc;
  }

  return null;
}

function resolveEmployeeDocForAuth(authUser, userDoc, adminDoc, indexes) {
  const authEmail = normalizeEmail(authUser.email);
  const userData = userDoc?.data || {};
  const adminData = adminDoc?.data || {};
  const linkedEmployeeId = pickText(userData?.linkedEmployeeId, adminData?.linkedEmployeeId);

  return (
    indexes.employeesById.get(linkedEmployeeId) ||
    indexes.employeesById.get(authUser.uid) ||
    first(indexes.employeesByUid.get(authUser.uid)) ||
    first(indexes.employeesByEmail.get(authEmail)) ||
    null
  );
}

function resolveEmployeeDocForFirestoreUser(userDoc, indexes) {
  const data = userDoc?.data || {};
  const uid = pickText(data?.uid, userDoc?.id);
  const email = normalizeEmail(pickUserEmail(data));
  const linkedEmployeeId = pickText(data?.linkedEmployeeId);

  return (
    indexes.employeesById.get(linkedEmployeeId) ||
    indexes.employeesById.get(uid) ||
    first(indexes.employeesByUid.get(uid)) ||
    first(indexes.employeesByEmail.get(email)) ||
    null
  );
}

function validateUidConsistency({ issues, uid, userDoc, adminDoc, usernameDoc, employeeDoc }) {
  if (userDoc) {
    const userUid = pickText(userDoc.data?.uid);
    if (!userUid || userUid !== uid || userDoc.id !== uid) {
      issues.add("uid_missing_or_mismatch");
    }
  }

  if (adminDoc) {
    const adminUid = pickText(adminDoc.data?.linkedUserUid, adminDoc.data?.uid, adminDoc.data?.userId);
    if (!adminUid || adminUid !== uid) {
      issues.add("uid_missing_or_mismatch");
    }
  }

  if (usernameDoc) {
    const usernameUid = pickText(usernameDoc.data?.uid);
    if (!usernameUid || usernameUid !== uid) {
      issues.add("uid_missing_or_mismatch");
    }
  }

  if (employeeDoc) {
    const employeeUid = pickText(employeeDoc.data?.linkedUserUid, employeeDoc.data?.uid, employeeDoc.data?.userId);
    if (!employeeUid || employeeUid !== uid) {
      issues.add("uid_missing_or_mismatch");
    }
  }
}

function validateEmailConsistency({ issues, authEmail, usersEmail, adminEmail, usernameEmail, employeeEmail, d1Email }) {
  if (!authEmail) return;

  for (const value of [usersEmail, adminEmail, usernameEmail, employeeEmail, d1Email]) {
    const email = normalizeEmail(value);
    if (email && email !== authEmail) {
      issues.add("email_mismatch");
      return;
    }
  }
}

function requiresAdminUser(userData, adminData, role, roleKey, username) {
  const normalizedRole = normalizeRole(role || roleKey);

  return (
    Boolean(username) ||
    ADMIN_ACCOUNT_ROLES.has(normalizedRole) ||
    Boolean(adminData && Object.keys(adminData).length) ||
    Boolean(userData?.employeeProfileEnabled) ||
    Boolean(userData?.includeInEmployeeManagement)
  );
}

function requiresEmployeeRecord(userData, adminData, role, roleKey, linkedEmployeeId) {
  const normalizedRole = normalizeRole(role || roleKey);

  return (
    Boolean(linkedEmployeeId) ||
    EMPLOYEE_RECORD_ROLES.has(normalizedRole) ||
    Boolean(userData?.employeeProfileEnabled) ||
    Boolean(userData?.includeInEmployeeManagement) ||
    Boolean(adminData?.employeeProfileEnabled)
  );
}

function isOrphanAdminUser(doc, indexes) {
  const data = doc.data || {};
  const uid = pickText(data?.linkedUserUid, data?.uid, data?.userId);
  const email = normalizeEmail(pickText(data?.email, looksLikeEmail(doc.id) ? doc.id : ""));

  return !(
    (uid && (indexes.authByUid.has(uid) || indexes.usersById.has(uid) || first(indexes.usersByUid.get(uid)))) ||
    (email && (first(indexes.authByEmail.get(email)) || first(indexes.usersByEmail.get(email))))
  );
}

function isOrphanEmployee(doc, indexes) {
  const data = doc.data || {};
  const uid = pickText(data?.linkedUserUid, data?.uid, data?.userId);
  const email = normalizeEmail(pickEmployeeEmail(data));

  return !(
    (uid && (indexes.authByUid.has(uid) || indexes.usersById.has(uid) || first(indexes.usersByUid.get(uid)))) ||
    indexes.usersByLinkedEmployeeId.has(doc.id) ||
    (email && (first(indexes.authByEmail.get(email)) || first(indexes.usersByEmail.get(email))))
  );
}

function buildSummary({ authUsers, usersDocs, adminUsersDocs, adminUsernamesDocs, employeesDocs, d1Rows, records, d1Status }) {
  const issueCounts = Object.fromEntries(ISSUE_TYPES.map((issue) => [issue, 0]));
  let healthyAccounts = 0;
  let accountsNeedingRepair = 0;

  for (const record of records) {
    if (record.overallStatus === "healthy") {
      healthyAccounts += 1;
    } else {
      accountsNeedingRepair += 1;
    }

    for (const issue of record.issues) {
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    }
  }

  return {
    totalAuthenticationUsers: authUsers.length,
    totalUsers: usersDocs.length,
    totalAdminUsers: adminUsersDocs.length,
    totalAdminUsernames: adminUsernamesDocs.length,
    totalEmployees: employeesDocs.length,
    totalEmployeeDirectoryRows: d1Rows.length,
    healthyAccounts,
    accountsNeedingRepair,
    issueCounts,
    d1Status,
  };
}

function writeReports({ projectId, records, summary, outputDir }) {
  fs.mkdirSync(outputDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(outputDir, `legacy-account-audit-${projectId}-${stamp}.json`);
  const csvPath = path.join(outputDir, `legacy-account-audit-${projectId}-${stamp}.csv`);
  const payload = {
    generatedAt: new Date().toISOString(),
    projectId,
    safety: {
      mode: "read_only",
      writesFirebaseAuthentication: false,
      writesFirestore: false,
      writesCloudflareD1: false,
      includesPasswordsOrTokens: false,
    },
    summary,
    records,
  };

  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(csvPath, toCsv(records), "utf8");

  return { jsonPath, csvPath };
}

function toCsv(records) {
  const columns = [
    "recordType",
    "overallStatus",
    "issues",
    "uid",
    "authEmail",
    "usersDocumentId",
    "usersEmail",
    "username",
    "adminUsersDocumentId",
    "linkedUserUid",
    "linkedEmployeeId",
    "employeeDocumentId",
    "role",
    "roleKey",
    "hasUsernameMapping",
    "usernameMappingEmail",
    "d1EmployeeDirectoryEmail",
    "d1LinkedEmployeeId",
  ];

  const rows = [columns.join(",")];

  for (const record of records) {
    rows.push(
      columns
        .map((column) => {
          const value = column === "issues" ? record.issues.join("|") : record[column];
          return csvEscape(value);
        })
        .join(",")
    );
  }

  return `${rows.join("\n")}\n`;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function addUnique(map, rawKey, value) {
  const key = normalizeLookupKey(rawKey);
  if (!key) return;

  const values = map.get(key) || [];
  values.push(value);
  map.set(key, values);
}

function addOwner(map, rawKey, rawOwner) {
  const key = normalizeLookupKey(rawKey);
  const owner = stringOrEmpty(rawOwner);
  if (!key || !owner) return;

  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(owner);
}

function ownerCount(map, key) {
  return map.get(normalizeLookupKey(key))?.size || 0;
}

function first(value) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function pickText(...values) {
  for (const value of values) {
    const normalized = stringOrEmpty(value);
    if (normalized) return normalized;
  }
  return "";
}

function pickUserEmail(data = {}) {
  return pickText(
    data?.email,
    data?.emailLower,
    data?.profile?.email,
    data?.employeeProfile?.personal?.email,
    data?.personal?.email
  );
}

function pickEmployeeEmail(data = {}) {
  return pickText(
    data?.email,
    data?.profile?.email,
    data?.employeeProfile?.personal?.email,
    data?.personal?.email
  );
}

function pickUsername(...objects) {
  for (const object of objects) {
    const value = pickText(
      object?.usernameLower,
      object?.username,
      object?.profile?.username,
      object?.employeeProfile?.username
    );
    if (value) return value;
  }
  return "";
}

function normalizeLookupKey(value) {
  const text = stringOrEmpty(value);
  if (!text) return "";
  return looksLikeEmail(text) ? normalizeEmail(text) : text.toLowerCase();
}

function normalizeEmail(value) {
  return stringOrEmpty(value).toLowerCase();
}

function normalizeUsername(value) {
  return stringOrEmpty(value).toLowerCase();
}

function normalizeRole(value) {
  return stringOrEmpty(value).toLowerCase();
}

function stringOrEmpty(value) {
  return String(value ?? "").trim();
}

function looksLikeEmail(value) {
  return stringOrEmpty(value).includes("@");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === "true") {
    printHelp();
    return;
  }

  const projectId = readProjectId(args["project-id"]);
  if (!projectId) {
    throw new Error("Unable to resolve Firebase project id.");
  }

  initializeFirebaseAdmin(projectId);

  const db = admin.firestore();
  const auth = admin.auth();
  const includeD1 = args["include-d1"] === "true";
  const d1Remote = args["d1-remote"] === "true";
  const d1DatabaseName = readD1DatabaseName(args["d1-database"]);

  const [authUsers, usersDocs, adminUsersDocs, adminUsernamesDocs, employeesDocs] = await Promise.all([
    listAllAuthUsers(auth),
    listCollection(db, "users"),
    listCollection(db, "admin_users"),
    listCollection(db, "admin_usernames"),
    listCollection(db, "employees"),
  ]);

  const d1Result = readD1EmployeeDirectory({
    includeD1,
    databaseName: d1DatabaseName,
    remote: d1Remote,
  });

  const indexes = buildIndexes({
    authUsers,
    usersDocs,
    adminUsersDocs,
    adminUsernamesDocs,
    employeesDocs,
    d1Rows: d1Result.rows,
  });
  const used = {
    userDocIds: new Set(),
    adminDocIds: new Set(),
    employeeDocIds: new Set(),
  };
  const records = [];

  for (const authUser of authUsers) {
    records.push(buildAuthRecord(authUser, indexes, used));
  }

  for (const userDoc of usersDocs) {
    const uid = pickText(userDoc.data?.uid, userDoc.id);
    const email = normalizeEmail(pickUserEmail(userDoc.data));
    const hasAuth = Boolean(
      (uid && indexes.authByUid.has(uid)) ||
      (email && first(indexes.authByEmail.get(email)))
    );

    if (!used.userDocIds.has(userDoc.id) && !hasAuth) {
      records.push(buildFirestoreUserWithoutAuthRecord(userDoc, indexes, used));
    }
  }

  for (const adminDoc of adminUsersDocs) {
    if (!used.adminDocIds.has(adminDoc.id) && isOrphanAdminUser(adminDoc, indexes)) {
      records.push(buildOrphanAdminUserRecord(adminDoc, indexes, used));
    }
  }

  for (const employeeDoc of employeesDocs) {
    if (!used.employeeDocIds.has(employeeDoc.id) && isOrphanEmployee(employeeDoc, indexes)) {
      records.push(buildOrphanEmployeeRecord(employeeDoc, indexes, used));
    }
  }

  records.sort((left, right) => {
    const statusCompare = left.overallStatus.localeCompare(right.overallStatus);
    if (statusCompare) return statusCompare;
    const typeCompare = left.recordType.localeCompare(right.recordType);
    if (typeCompare) return typeCompare;
    return left.uid.localeCompare(right.uid);
  });

  const summary = buildSummary({
    authUsers,
    usersDocs,
    adminUsersDocs,
    adminUsernamesDocs,
    employeesDocs,
    d1Rows: d1Result.rows,
    records,
    d1Status: {
      status: d1Result.status,
      mode: d1Result.mode,
      databaseName: d1Result.databaseName,
      error: d1Result.error,
    },
  });
  const outputDir = path.resolve(repoRoot, stringOrEmpty(args["out-dir"]) || defaultReportsDir);
  const paths = writeReports({ projectId, records, summary, outputDir });

  process.stdout.write(`${JSON.stringify({ projectId, ...paths, summary }, null, 2)}\n`);
}

main().catch((error) => {
  const message = error?.stack || error?.message || String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
