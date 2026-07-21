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
const reportDir = path.join(repoRoot, "reports", "hr-files-messages-migration");
const DEFAULT_BATCH_SIZE = 100;
const EXPECTED_WORKER_RELEASE = "phase8b-files-messages-v1";

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) result[key] = true;
    else { result[key] = next; index += 1; }
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
  const envValue = normalizeText(process.env.FIREBASE_PROJECT_ID || process.env.VITE_FB_PROJECT_ID);
  if (envValue) return envValue;
  const firebaserc = JSON.parse(fs.readFileSync(path.join(repoRoot, ".firebaserc"), "utf8"));
  return normalizeText(firebaserc?.projects?.default);
}

function getFirebaseToolsLibRoot() {
  const candidates = [
    path.join(repoRoot, "node_modules", "firebase-tools", "lib"),
    path.join(process.env.APPDATA || "", "npm", "node_modules", "firebase-tools", "lib"),
  ];
  return candidates.find(candidate => candidate && fs.existsSync(candidate)) || "";
}

function ensureFirebaseCredentials() {
  const existing = normalizeText(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  if (existing) return existing;
  const libRoot = getFirebaseToolsLibRoot();
  if (!libRoot) throw new Error("firebase-tools credentials helper was not found.");
  const firebaseAuth = require(path.join(libRoot, "auth.js"));
  const account = firebaseAuth.getProjectDefaultAccount(repoRoot) || firebaseAuth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error("No Firebase CLI refresh token was found. Run firebase login.");
  const firebaseApi = require(path.join(libRoot, "api.js"));
  fs.mkdirSync(tempDir, { recursive: true });
  const credentialsPath = path.join(tempDir, "firebase-authorized-user.json");
  fs.writeFileSync(credentialsPath, JSON.stringify({
    type: "authorized_user",
    client_id: firebaseApi.clientId(),
    client_secret: firebaseApi.clientSecret(),
    refresh_token: account.tokens.refresh_token,
  }, null, 2), "utf8");
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
  return credentialsPath;
}

function ensureFirebaseAdmin(projectId) {
  if (admin.apps.length) return;
  ensureFirebaseCredentials();
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
}

function serialize(value) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === "object") {
    const output = {};
    for (const [key, item] of Object.entries(value)) output[key] = serialize(item);
    return output;
  }
  return value;
}

function stableHash(input) {
  return createHash("sha256").update(String(input)).digest("hex").slice(0, 12);
}

function chunks(rows, size) {
  const output = [];
  for (let index = 0; index < rows.length; index += size) output.push(rows.slice(index, index + size));
  return output;
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitForWorkerRelease(apiUrl, attempts = 15) {
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, "")}/health`, { headers: { "Cache-Control": "no-cache" } });
      last = await response.json().catch(() => null);
      if (response.ok && last?.release === EXPECTED_WORKER_RELEASE) return last;
    } catch (error) {
      last = { error: String(error?.message || error) };
    }
    if (attempt < attempts) await sleep(2500);
  }
  throw new Error(`HR Worker release not active: ${JSON.stringify(last)}`);
}

async function postBatch(apiUrl, syncSecret, body) {
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/internal/hr/files-messages/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-HR-Sync-Secret": syncSecret,
      "Cache-Control": "no-cache",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(`Cloudflare files/messages import failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = readProjectId(args.project);
  const apiUrl = normalizeText(args["api-url"] || process.env.HR_CORE_API_URL);
  const syncSecret = normalizeText(args["sync-secret"] || process.env.HR_SYNC_SECRET);
  const dryRun = Boolean(args["dry-run"]);
  const batchSize = Math.min(200, Math.max(10, Number.parseInt(args["batch-size"] || DEFAULT_BATCH_SIZE, 10)));
  if (!projectId) throw new Error("Firebase project id could not be resolved.");
  if (!dryRun && !apiUrl) throw new Error("--api-url or HR_CORE_API_URL is required.");
  if (!dryRun && !syncSecret) throw new Error("--sync-secret or HR_SYNC_SECRET is required.");

  ensureFirebaseAdmin(projectId);
  const db = admin.firestore();
  const [filesSnapshot, messagesSnapshot] = await Promise.all([
    db.collection("employee_files").get(),
    db.collection("employee_messages").get(),
  ]);
  const employeeFiles = filesSnapshot.docs.map(doc => ({ id: doc.id, ...serialize(doc.data() || {}) }));
  const employeeMessages = messagesSnapshot.docs.map(doc => ({ id: doc.id, ...serialize(doc.data() || {}) }));
  const runId = `hr-files-messages-${new Date().toISOString().replace(/[:.]/g, "-")}-${stableHash(`${employeeFiles.length}:${employeeMessages.length}`)}`;
  const report = { runId, projectId, generatedAt: new Date().toISOString(), dryRun, employeeFiles: employeeFiles.length, employeeMessages: employeeMessages.length };
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `${runId}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ employeeFiles: employeeFiles.length, employeeMessages: employeeMessages.length }, null, 2));
  console.log(`[hr-files-messages] Report: ${reportPath}`);
  if (dryRun) {
    console.log("[hr-files-messages] Dry run completed. No Cloudflare data was changed.");
    return;
  }

  const health = await waitForWorkerRelease(apiUrl);
  console.log(`[hr-files-messages] Worker release active: ${health.release}`);

  const fileChunks = chunks(employeeFiles, batchSize);
  const messageChunks = chunks(employeeMessages, batchSize);
  const max = Math.max(fileChunks.length, messageChunks.length, 1);
  for (let index = 0; index < max; index += 1) {
    const fileBatch = fileChunks[index] || [];
    const messageBatch = messageChunks[index] || [];
    const payload = await postBatch(apiUrl, syncSecret, {
      runId,
      employeeFiles: fileBatch,
      employeeMessages: messageBatch,
      complete: index === max - 1,
    });
    console.log(`[hr-files-messages] Batch ${index + 1}/${max}: employeeFiles=${payload.employeeFiles}, employeeMessages=${payload.employeeMessages}`);
  }
  console.log(`[hr-files-messages] Completed run ${runId}.`);
}

main().catch(error => {
  console.error("[hr-files-messages] Failed:", error);
  process.exitCode = 1;
});
