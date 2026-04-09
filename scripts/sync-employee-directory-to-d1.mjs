import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const workersDir = path.join(repoRoot, "workers");
const wranglerConfigPath = path.join(workersDir, "wrangler.toml");
const tempDir = path.join(repoRoot, ".tmp");

const ACTIVE_TRUE_VALUES = new Set(["active", "enabled", "true", "1", "yes"]);
const ACTIVE_FALSE_VALUES = new Set(["inactive", "disabled", "false", "0", "no"]);
const EXCLUDED_ROLES = new Set(["client", "guest"]);

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

function readProjectId(explicitProjectId = "") {
  const direct = String(explicitProjectId || "").trim();
  if (direct) return direct;

  const envProjectId = String(process.env.VITE_FB_PROJECT_ID || "").trim();
  if (envProjectId) return envProjectId;

  const firebasercPath = path.join(repoRoot, ".firebaserc");
  const firebaserc = JSON.parse(fs.readFileSync(firebasercPath, "utf8"));
  return String(firebaserc?.projects?.default || "").trim();
}

function readD1DatabaseName(explicitName = "") {
  const direct = String(explicitName || "").trim();
  if (direct) return direct;

  const wranglerToml = fs.readFileSync(wranglerConfigPath, "utf8");
  const match = wranglerToml.match(/database_name\s*=\s*"([^"]+)"/);
  return String(match?.[1] || "").trim();
}

function getFirebaseToolsLibRoot() {
  const candidates = [
    path.join(repoRoot, "node_modules", "firebase-tools", "lib"),
    path.join(process.env.APPDATA || "", "npm", "node_modules", "firebase-tools", "lib"),
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }

  return "";
}

function getFirebaseToolsAccount(libRoot) {
  const firebaseAuth = require(path.join(libRoot, "auth.js"));
  const projectAccount = firebaseAuth.getProjectDefaultAccount(repoRoot);
  if (projectAccount?.tokens?.refresh_token) return projectAccount;

  const globalAccount = firebaseAuth.getGlobalDefaultAccount();
  if (globalAccount?.tokens?.refresh_token) return globalAccount;

  throw new Error(
    "No Firebase CLI account with refresh token was found. Run `firebase login` first or set GOOGLE_APPLICATION_CREDENTIALS."
  );
}

function writeAuthorizedUserCredentials(account, libRoot) {
  const firebaseApi = require(path.join(libRoot, "api.js"));
  fs.mkdirSync(tempDir, { recursive: true });

  const credentialsPath = path.join(tempDir, "firebase-authorized-user.json");
  const payload = {
    type: "authorized_user",
    client_id: firebaseApi.clientId(),
    client_secret: firebaseApi.clientSecret(),
    refresh_token: account.tokens.refresh_token,
  };

  fs.writeFileSync(credentialsPath, JSON.stringify(payload, null, 2), "utf8");
  return credentialsPath;
}

function ensureFirebaseCredentials() {
  const existingPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  if (existingPath) return existingPath;

  const libRoot = getFirebaseToolsLibRoot();
  if (!libRoot) {
    throw new Error(
      "Unable to find firebase-tools credentials helper. Set GOOGLE_APPLICATION_CREDENTIALS or install Firebase CLI."
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

function stringOrEmpty(value) {
  return String(value || "").trim();
}

function pickFirstText(...values) {
  for (const value of values) {
    const normalized = stringOrEmpty(value);
    if (normalized) return normalized;
  }
  return "";
}

function hasValuesObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function parseActiveValue(value) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;

  if (ACTIVE_TRUE_VALUES.has(normalized)) return true;
  if (ACTIVE_FALSE_VALUES.has(normalized)) return false;
  return null;
}

function resolveEmployeeDirectoryActive(data) {
  const employment = data?.employeeProfile?.employment || data?.employment || {};
  const candidates = [
    data?.active,
    data?.isActive,
    data?.status,
    employment?.employmentStatus,
    employment?.status,
  ];

  for (const value of candidates) {
    const resolved = parseActiveValue(value);
    if (resolved !== null) return resolved;
  }

  return true;
}

function isEmployeeDirectoryCandidate(data) {
  const role = normalizeRole(data?.role);
  if (EXCLUDED_ROLES.has(role)) return false;

  const employment = data?.employeeProfile?.employment || data?.employment || {};
  const personal = data?.employeeProfile?.personal || data?.personal || {};

  return (
    role === "staff" ||
    role === "hr" ||
    stringOrEmpty(data?.linkedEmployeeId).length > 0 ||
    hasValuesObject(employment) ||
    hasValuesObject(personal)
  );
}

function normalizeDateToIso(value) {
  if (!value) return null;

  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof value?.seconds === "number") {
    const date = new Date(value.seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildEmployeeDirectoryRow(uid, data, syncedAt) {
  if (!uid || !isEmployeeDirectoryCandidate(data)) {
    return null;
  }

  const employment = data?.employeeProfile?.employment || data?.employment || {};
  const personal = data?.employeeProfile?.personal || data?.personal || {};
  const role = normalizeRole(data?.role) || null;
  const isActive = resolveEmployeeDirectoryActive(data);
  const statusKey = isActive ? "active" : "inactive";
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
    avatarUrl:
      pickFirstText(
        personal?.avatar?.fileUrl,
        data?.photoURL,
        data?.profile?.photoURL
      ) || null,
    title: pickFirstText(employment?.title, employment?.jobTitle, data?.title) || null,
    department: pickFirstText(employment?.department, data?.department) || null,
    statusKey,
    role,
    linkedEmployeeId: stringOrEmpty(data?.linkedEmployeeId) || null,
    isActive,
    updatedAt:
      normalizeDateToIso(data?.updatedAt) ||
      normalizeDateToIso(data?.employeeProfile?.updatedAt) ||
      syncedAt,
    syncedAt,
  };
}

function sqlText(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlInteger(value) {
  if (value === null || value === undefined) return "NULL";
  return String(Number(value) ? 1 : 0);
}

function buildUpsertStatement(row) {
  return `
INSERT INTO employee_directory (
  uid,
  name,
  email,
  avatar_url,
  title,
  department,
  status_key,
  role,
  linked_employee_id,
  is_active,
  updated_at,
  synced_at
) VALUES (
  ${sqlText(row.uid)},
  ${sqlText(row.name)},
  ${sqlText(row.email)},
  ${sqlText(row.avatarUrl)},
  ${sqlText(row.title)},
  ${sqlText(row.department)},
  ${sqlText(row.statusKey)},
  ${sqlText(row.role)},
  ${sqlText(row.linkedEmployeeId)},
  ${sqlInteger(row.isActive)},
  ${sqlText(row.updatedAt)},
  ${sqlText(row.syncedAt)}
)
ON CONFLICT(uid) DO UPDATE SET
  name = excluded.name,
  email = excluded.email,
  avatar_url = excluded.avatar_url,
  title = excluded.title,
  department = excluded.department,
  status_key = excluded.status_key,
  role = excluded.role,
  linked_employee_id = excluded.linked_employee_id,
  is_active = excluded.is_active,
  updated_at = excluded.updated_at,
  synced_at = excluded.synced_at;
`.trim();
}

function buildSeenStatement(uid) {
  return `
INSERT INTO _employee_directory_seen (uid)
VALUES (${sqlText(uid)})
ON CONFLICT(uid) DO NOTHING;
`.trim();
}


function buildSyncSql(rows) {
  const statements = [];

  if (rows.length) {
    statements.push("DELETE FROM employee_directory;");
  }

  rows.forEach((row) => {
    statements.push(buildUpsertStatement(row));
  });

  return `${statements.join("\n\n")}\n`;
}

function writeSqlFile(sql) {
  fs.mkdirSync(tempDir, { recursive: true });
  const sqlFilePath = path.join(tempDir, "employee-directory-sync.sql");
  fs.writeFileSync(sqlFilePath, sql, "utf8");
  return sqlFilePath;
}

function runD1SqlFile(sqlFilePath, databaseName, remote) {
  const wranglerArgs = [
    "wrangler",
    "d1",
    "execute",
    databaseName,
    remote ? "--remote" : "--local",
    "--config",
    wranglerConfigPath,
    "--file",
    sqlFilePath,
  ];

  const isWindows = process.platform === "win32";

  if (isWindows) {
    execFileSync("cmd", ["/c", "npx", ...wranglerArgs], {
      cwd: repoRoot,
      stdio: "inherit",
    });
    return;
  }

  execFileSync("npx", wranglerArgs, {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = readProjectId(args["project-id"]);
  const databaseName = readD1DatabaseName(args.database);
  const remote = args.local === "true" ? false : true;
  const dryRun = args["dry-run"] === "true";

  if (!projectId) {
    throw new Error("Unable to resolve Firebase project id.");
  }

  if (!databaseName) {
    throw new Error("Unable to resolve D1 database name from workers/wrangler.toml.");
  }

  ensureFirebaseAdmin(projectId);

  const syncedAt = new Date().toISOString();
  const db = admin.firestore();
  const usersSnap = await db.collection("users").get();
  const rows = usersSnap.docs
    .map((docSnap) =>
      buildEmployeeDirectoryRow(docSnap.id, docSnap.data() || {}, syncedAt)
    )
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name, "ar", { sensitivity: "base" }));

  const activeCount = rows.filter((row) => row.isActive).length;
  const inactiveCount = rows.length - activeCount;
  const sql = buildSyncSql(rows);
  const sqlFilePath = writeSqlFile(sql);

  const summary = {
    projectId,
    databaseName,
    mode: remote ? "remote" : "local",
    rows: rows.length,
    active: activeCount,
    inactive: inactiveCount,
    sqlFilePath,
    dryRun,
  };

  if (dryRun) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  runD1SqlFile(sqlFilePath, databaseName, remote);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  const message = error?.stack || error?.message || String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
