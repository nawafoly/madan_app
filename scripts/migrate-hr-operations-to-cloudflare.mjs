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
const reportDir = path.join(repoRoot, "reports", "hr-operations-migration");
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

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return !text || text === "undefined" || text === "null" ? "" : text;
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
    path.join(process.env.APPDATA || "", "npm", "node_modules", "firebase-tools", "lib"),
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
  const credentialsPath = writeAuthorizedUserCredentials(
    getFirebaseToolsAccount(libRoot),
    libRoot
  );
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

async function readCollection(db, name) {
  const snapshot = await db.collection(name).get();
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...serializeFirestoreValue(doc.data() || {}),
  }));
}

function stableHash(input) {
  return createHash("sha256").update(String(input)).digest("hex").slice(0, 12);
}

async function postBatch({
  apiUrl,
  secret,
  runId,
  leaveRequests,
  absences,
  serviceRequests,
  complete,
}) {
  const response = await fetch(
    `${apiUrl.replace(/\/$/, "")}/internal/hr/operations/import`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-HR-Sync-Secret": secret,
      },
      body: JSON.stringify({
        runId,
        leaveRequests,
        absences,
        serviceRequests,
        complete,
      }),
    }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(
      `Cloudflare operations import failed (${response.status}): ${JSON.stringify(payload)}`
    );
  }
  return payload;
}

function chunkRows(rows, batchSize) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += batchSize) {
    chunks.push(rows.slice(index, index + batchSize));
  }
  return chunks;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = readProjectId(args.project);
  const apiUrl = normalizeText(args["api-url"] || process.env.HR_CORE_API_URL);
  const syncSecret = normalizeText(args["sync-secret"] || process.env.HR_SYNC_SECRET);
  const dryRun = Boolean(args["dry-run"]);
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
  console.log(`[hr-operations] Reading Firestore project ${projectId}...`);

  const [leaveRequests, absences, serviceRequests] = await Promise.all([
    readCollection(firestore, "employee_leave_requests"),
    readCollection(firestore, "employee_absences"),
    readCollection(firestore, "employee_service_requests"),
  ]);

  const runId = `hr-ops-${new Date().toISOString().replace(/[:.]/g, "-")}-${stableHash(
    `${leaveRequests.length}:${absences.length}:${serviceRequests.length}`
  )}`;
  const report = {
    runId,
    projectId,
    generatedAt: new Date().toISOString(),
    dryRun,
    counts: {
      leaveRequests: leaveRequests.length,
      absences: absences.length,
      serviceRequests: serviceRequests.length,
    },
  };

  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `${runId}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report.counts, null, 2));
  console.log(`[hr-operations] Report: ${reportPath}`);

  if (dryRun) {
    console.log("[hr-operations] Dry run completed. No Cloudflare data was changed.");
    return;
  }

  const jobs = [
    ...chunkRows(leaveRequests, batchSize).map(rows => ({
      leaveRequests: rows,
      absences: [],
      serviceRequests: [],
      label: "Leave requests",
      count: rows.length,
    })),
    ...chunkRows(absences, batchSize).map(rows => ({
      leaveRequests: [],
      absences: rows,
      serviceRequests: [],
      label: "Absences",
      count: rows.length,
    })),
    ...chunkRows(serviceRequests, batchSize).map(rows => ({
      leaveRequests: [],
      absences: [],
      serviceRequests: rows,
      label: "Service requests",
      count: rows.length,
    })),
  ];

  if (!jobs.length) {
    jobs.push({
      leaveRequests: [],
      absences: [],
      serviceRequests: [],
      label: "Empty import",
      count: 0,
    });
  }

  const sent = { leaveRequests: 0, absences: 0, serviceRequests: 0 };
  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    await postBatch({
      apiUrl,
      secret: syncSecret,
      runId,
      leaveRequests: job.leaveRequests,
      absences: job.absences,
      serviceRequests: job.serviceRequests,
      complete: index === jobs.length - 1,
    });
    sent.leaveRequests += job.leaveRequests.length;
    sent.absences += job.absences.length;
    sent.serviceRequests += job.serviceRequests.length;
    console.log(
      `[hr-operations] ${job.label}: sent ${job.count}. Totals ${JSON.stringify(sent)}`
    );
  }

  console.log(`[hr-operations] Completed run ${runId}.`);
}

main().catch(error => {
  console.error("[hr-operations] Failed:", error);
  process.exitCode = 1;
});
