#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const STAFF_ACCOUNT_ROLES = new Set(["staff", "hr", "accountant", "admin", "owner"]);
const REPORT_DIR = path.resolve("reports", "hr-integrity");
const WRANGLER_CONFIG = "workers/wrangler.hr.toml";
const DATABASE_NAME = "maedin-hr";

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function toBool(value) {
  return value === true || value === 1 || value === "1";
}

function parseWranglerJson(stdout) {
  const text = String(stdout || "").trim();
  if (!text) throw new Error("Wrangler returned no JSON output.");

  const starts = [text.indexOf("["), text.indexOf("{")].filter(index => index >= 0);
  if (!starts.length) throw new Error("Could not locate Wrangler JSON output.");

  const start = Math.min(...starts);
  return JSON.parse(text.slice(start));
}

function runD1Query(sql) {
  const args = [
    "wrangler",
    "d1",
    "execute",
    DATABASE_NAME,
    "--remote",
    "--config",
    WRANGLER_CONFIG,
    "--json",
    "--command",
    sql,
  ];

  const command = process.platform === "win32"
    ? (process.env.ComSpec || "cmd.exe")
    : "npx";
  const commandArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", "npx", ...args]
    : args;

  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
    windowsHide: true,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Wrangler D1 query failed (${result.status}).\n${String(result.stderr || result.stdout || "").trim()}`
    );
  }

  const parsed = parseWranglerJson(result.stdout);
  const blocks = Array.isArray(parsed) ? parsed : [parsed];
  const rows = [];
  for (const block of blocks) {
    const results = block?.results;
    if (Array.isArray(results)) rows.push(...results);
  }
  return rows;
}

async function readFirestoreSnapshot() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return {
      available: false,
      reason: "GOOGLE_APPLICATION_CREDENTIALS is not set",
      employees: [],
      users: [],
    };
  }

  const adminModule = await import("firebase-admin");
  const admin = adminModule.default || adminModule;
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID || "index-599e8",
    });
  }

  const db = admin.firestore();
  const [employeeSnapshot, userSnapshot] = await Promise.all([
    db.collection("employees").get(),
    db.collection("users").get(),
  ]);

  return {
    available: true,
    reason: null,
    employees: employeeSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
    users: userSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
  };
}

function buildAnomaly(code, severity, entity, details) {
  return { code, severity, entity, details };
}

function evaluateIntegrity({ accounts, employees, firestore }) {
  const anomalies = [];
  const accountByUid = new Map(accounts.map(account => [normalizeText(account.uid), account]));
  const employeeById = new Map(employees.map(employee => [normalizeText(employee.id), employee]));
  const employeeByAuthUid = new Map(
    employees
      .filter(employee => normalizeText(employee.auth_uid))
      .map(employee => [normalizeText(employee.auth_uid), employee])
  );
  const d1EmployeeByEmail = new Map(
    employees
      .filter(employee => normalizeEmail(employee.email))
      .map(employee => [normalizeEmail(employee.email), employee])
  );

  for (const account of accounts) {
    const uid = normalizeText(account.uid);
    const role = normalizeText(account.role_key).toLowerCase();
    const link = normalizeText(account.linked_employee_id);
    const profileEnabled = toBool(account.employee_profile_enabled);

    if (profileEnabled && STAFF_ACCOUNT_ROLES.has(role)) {
      const byAuth = employeeByAuthUid.get(uid) || null;
      if (!byAuth) {
        anomalies.push(
          buildAnomaly("IDN-001", "critical", { type: "account", id: uid }, {
            message: "Employee-profile-enabled staff account has no employee linked by auth_uid.",
            email: normalizeEmail(account.email) || null,
            role,
            linkedEmployeeId: link || null,
          })
        );
      }
    }

    if (link) {
      const linkedEmployee = employeeById.get(link) || null;
      if (!linkedEmployee) {
        anomalies.push(
          buildAnomaly("IDN-LINK-MISSING", "critical", { type: "account", id: uid }, {
            message: "Account linked_employee_id points to a missing employee.",
            linkedEmployeeId: link,
          })
        );
      } else if (normalizeText(linkedEmployee.auth_uid) !== uid) {
        anomalies.push(
          buildAnomaly("IDN-LINK-MISMATCH", "critical", { type: "account", id: uid }, {
            message: "Account link and employee auth_uid disagree.",
            linkedEmployeeId: link,
            employeeAuthUid: normalizeText(linkedEmployee.auth_uid) || null,
          })
        );
      }
    }
  }

  for (const employee of employees) {
    const employeeId = normalizeText(employee.id);
    const authUid = normalizeText(employee.auth_uid);
    if (!authUid) {
      anomalies.push(
        buildAnomaly("IDN-EMPLOYEE-NO-AUTH", "warning", { type: "employee", id: employeeId }, {
          message: "Employee has no auth_uid.",
          email: normalizeEmail(employee.email) || null,
        })
      );
      continue;
    }

    const account = accountByUid.get(authUid) || null;
    if (!account) {
      anomalies.push(
        buildAnomaly("IDN-EMPLOYEE-ORPHAN", "critical", { type: "employee", id: employeeId }, {
          message: "Employee auth_uid points to a missing account.",
          authUid,
          email: normalizeEmail(employee.email) || null,
        })
      );
      continue;
    }

    const accountLink = normalizeText(account.linked_employee_id);
    if (accountLink && accountLink !== employeeId) {
      anomalies.push(
        buildAnomaly("IDN-REVERSE-LINK-MISMATCH", "critical", { type: "employee", id: employeeId }, {
          message: "Employee account points to a different linked_employee_id.",
          authUid,
          accountLinkedEmployeeId: accountLink,
        })
      );
    }
  }

  if (firestore.available) {
    for (const legacyEmployee of firestore.employees) {
      const uid = normalizeText(legacyEmployee.uid || legacyEmployee.linkedUserUid || legacyEmployee.id);
      const email = normalizeEmail(legacyEmployee.email);
      const byUid = uid ? employeeByAuthUid.get(uid) || employeeById.get(uid) : null;
      const byEmail = email ? d1EmployeeByEmail.get(email) : null;
      if (!byUid && !byEmail) {
        anomalies.push(
          buildAnomaly("LEGACY-EMPLOYEE-MISSING-D1", "critical", { type: "firestore_employee", id: legacyEmployee.id }, {
            message: "Legacy Firestore employee is absent from canonical HR D1.",
            uid: uid || null,
            email: email || null,
            name: normalizeText(legacyEmployee.name || legacyEmployee.displayName) || null,
          })
        );
      }
    }
  }

  const criticalCount = anomalies.filter(item => item.severity === "critical").length;
  const warningCount = anomalies.filter(item => item.severity === "warning").length;

  return {
    status: criticalCount > 0 ? "critical" : warningCount > 0 ? "warning" : "healthy",
    counts: {
      accounts: accounts.length,
      employees: employees.length,
      firestoreEmployees: firestore.available ? firestore.employees.length : null,
      firestoreUsers: firestore.available ? firestore.users.length : null,
      critical: criticalCount,
      warnings: warningCount,
    },
    anomalies,
  };
}

async function main() {
  if (process.argv.includes("--apply")) {
    throw new Error("This command is read-only. --apply is intentionally unsupported.");
  }

  const accounts = runD1Query(`
    SELECT uid, email, username, display_name, role_key, is_active,
           employee_profile_enabled, linked_employee_id
    FROM accounts
    ORDER BY uid;
  `);

  const employees = runD1Query(`
    SELECT id, auth_uid, name, email, employment_status, is_active
    FROM employees
    ORDER BY id;
  `);

  const firestore = await readFirestoreSnapshot();
  const evaluated = evaluateIntegrity({ accounts, employees, firestore });
  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    mode: "read-only",
    database: DATABASE_NAME,
    wranglerConfig: WRANGLER_CONFIG,
    firestore: {
      available: firestore.available,
      reason: firestore.reason,
    },
    ...evaluated,
  };

  await mkdir(REPORT_DIR, { recursive: true });
  const safeTimestamp = generatedAt.replace(/[:.]/g, "-");
  const reportPath = path.join(REPORT_DIR, `hr-integrity-${safeTimestamp}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`HR Core integrity: ${report.status.toUpperCase()}`);
  console.log(`accounts=${report.counts.accounts}`);
  console.log(`employees=${report.counts.employees}`);
  if (report.counts.firestoreEmployees !== null) {
    console.log(`firestoreEmployees=${report.counts.firestoreEmployees}`);
  }
  console.log(`critical=${report.counts.critical}`);
  console.log(`warnings=${report.counts.warnings}`);
  console.log(`report=${path.relative(process.cwd(), reportPath)}`);

  for (const anomaly of report.anomalies) {
    console.log(
      `[${anomaly.severity.toUpperCase()}] ${anomaly.code} ${anomaly.entity.type}:${anomaly.entity.id}`
    );
  }

  if (report.counts.critical > 0) process.exitCode = 2;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
