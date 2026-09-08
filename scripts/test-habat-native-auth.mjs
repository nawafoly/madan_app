import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { hashHabatPassword } from "../workers/habat-native-auth.js";

// Uses the project's normal Wrangler installation; no credentials or remote bindings.
const localRequire = createRequire(import.meta.url);
let runtimeRequire = localRequire;
try { runtimeRequire.resolve("miniflare"); } catch {
  const npmRoot = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["root", "-g"], {
    encoding: "utf8", shell: process.platform === "win32",
  });
  assert.equal(npmRoot.status, 0, "Wrangler v4 or local Miniflare must be installed");
  runtimeRequire = createRequire(path.join(npmRoot.stdout.trim(), "wrangler", "package.json"));
}
const { Miniflare } = runtimeRequire("miniflare");
const { build } = runtimeRequire("esbuild");
const repo = path.resolve(import.meta.dirname, "..");
const forbidden = /firebase|identitytoolkit|getIdToken|signInWithEmailAndPassword|onAuthStateChanged|createUserWithEmailAndPassword|sendPasswordResetEmail|securetoken@system/ig;

async function bundle(entry, extra = {}) {
  return build({ absWorkingDir: repo, entryPoints: [entry], bundle: true, write: false,
    format: "esm", platform: "browser", target: "es2022", metafile: true,
    external: ["node:*"], logLevel: "silent", ...extra });
}

async function scan() {
  for (const entry of ["client/src/habat-main.tsx", "workers/habat-runtime.js"]) {
    const result = await bundle(entry, {
      packages: "external", alias: { "@": path.join(repo, "client/src") },
      loader: { ".css": "empty" }, jsx: "automatic",
    });
    const runtime = result.outputFiles.map(file => file.text).join("\n");
    assert.deepEqual(runtime.match(forbidden) || [], [], `${entry} must have zero forbidden dependencies`);
    const imports = Object.values(result.metafile.inputs).flatMap(item => item.imports.map(item => item.path));
    assert.ok(!imports.some(item => forbidden.test(item)), "No forbidden module imports");
    console.log(`[scan] PASS ${entry}: ${Object.keys(result.metafile.inputs).length} active modules`);
  }
  const assetDir = path.join(repo, "client/dist/assets");
  if (fs.existsSync(assetDir)) {
    const files = fs.readdirSync(assetDir).filter(name => name.endsWith(".js"));
    for (const file of files) {
      assert.deepEqual(fs.readFileSync(path.join(assetDir, file), "utf8").match(forbidden) || [], [], `Built Habat asset ${file}`);
    }
    console.log(`[scan] PASS ${files.length} built JavaScript assets`);
  }
}

if (process.argv.includes("--scan-only")) {
  await scan();
  process.exit(0);
}

const workerBuild = await bundle("workers/r2-upload-bootstrap.js");
const pagesBuild = await build({ absWorkingDir: repo, bundle: true, write: false, format: "esm", platform: "browser",
  stdin: { contents: `import { onRequest } from './functions/habat-api/[[path]].js';
    export default { fetch(request) { return onRequest({ request, params: { path: new URL(request.url).pathname.slice('/habat-api/'.length).split('/') } }); } };`,
    resolveDir: repo }, logLevel: "silent" });
const outbound = [];
const worker = new Miniflare({ modules: true, script: workerBuild.outputFiles[0].text,
  compatibilityDate: "2026-03-12", compatibilityFlags: ["nodejs_compat"],
  d1Databases: { ATTENDANCE_DB: "habat-local-test" },
  bindings: { CORS_ALLOWED_ORIGINS: "https://habat-alwaraq.pages.dev" },
  outboundService(request) { outbound.push(request.url); throw new Error("External network forbidden in Habat test"); },
});
const pages = new Miniflare({ modules: true, script: pagesBuild.outputFiles[0].text, compatibilityDate: "2026-03-12",
  outboundService(request) {
    assert.equal(new URL(request.url).origin, "https://upload.maedin2026.workers.dev");
    return worker.dispatchFetch(request.url, request);
  },
});
const origin = "https://habat-alwaraq.pages.dev";
const managerPassword = `Test-manager-${crypto.randomUUID()}`;
const temporaryPassword = `مؤقت-١٢٣-${crypto.randomUUID()}`;
const newPassword = `Personal-${crypto.randomUUID()}`;
const resetPassword = `Reset-${crypto.randomUUID()}`;
let requests = 0;

async function api(route, { jar, body, method = body ? "POST" : "GET", status = 200, headers = {} } = {}) {
  const response = await pages.dispatchFetch(`${origin}/habat-api/${route}`, {
    method, headers: { Origin: origin, ...(body ? { "Content-Type": "application/json" } : {}),
      ...(jar?.cookie ? { Cookie: jar.cookie } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  requests++;
  const payload = await response.json();
  assert.equal(response.status, status, `${method} ${route}: ${payload.message || "unexpected status"}`);
  const cookie = response.headers.get("Set-Cookie");
  if (cookie && jar) jar.cookie = cookie.split(";")[0];
  return { payload, response, cookie };
}

try {
  const db = await worker.getD1Database("ATTENDANCE_DB");
  for (const file of [
    "workers/attendance-migrations/0005_create_habat_attendance.sql",
    "workers/attendance-migrations/0006_habat_attendance_management.sql",
    "workers/attendance-migrations/0007_habat_attendance_day_management.sql",
    "workers/attendance-migrations/0008_habat_cloudflare_auth.sql",
    "workers/workforce-migrations/0001_workforce_core_foundation.sql",
    "workers/workforce-migrations/0002_workforce_annual_leave_ledger.sql",
    "workers/workforce-migrations/0003_workforce_schedule_control.sql",
    "workers/workforce-migrations/0004_workforce_manual_payroll_adjustments.sql",
    "workers/workforce-migrations/0005_workforce_employee_weekly_schedule.sql",
    "workers/workforce-migrations/tenant-cutover/0001_habat_workforce_seed.sql",
  ]) {
    const sql = fs.readFileSync(path.join(repo, file), "utf8").replace(/--[^\n]*/g, "");
    for (const statement of sql.split(";").map(value => value.trim()).filter(Boolean)) {
      await db.prepare(statement).run();
    }
  }
  await db.prepare(`INSERT INTO habat_attendance_access (id, uid, email, display_name, access_level, clock_enabled)
    VALUES ('manager', 'legacy-manager-uid', 'manager@example.test', 'Local Manager', 'manager', 0)`).run();
  const hash = await hashHabatPassword(managerPassword);
  await db.prepare(`INSERT INTO habat_auth_credentials (access_id,password_hash,password_salt,password_algorithm,password_iterations)
    VALUES (?,?,?,?,?)`).bind("manager", hash.passwordHash, hash.passwordSalt, hash.passwordAlgorithm, hash.passwordIterations).run();

  const manager = {};
  await api("auth/session", { status: 401 });
  await api("v2/context", { status: 401, headers: { Authorization: "Bearer rejected-legacy-token" } });
  await api("auth/login", { body: { email: "manager@example.test", password: "wrong" }, status: 401 });
  const login = await api("auth/login", { jar: manager, body: { email: " MANAGER@example.test ", password: managerPassword } });
  for (const attr of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/habat-api"]) assert.ok(login.cookie.includes(attr));
  assert.equal(login.payload.principal.uid, "legacy-manager-uid");
  assert.equal((await api("auth/session", { jar: manager })).payload.mustChangePassword, false);
  await api("v2/context", { jar: manager });
  const storedSession = await db.prepare("SELECT token_hash FROM habat_auth_sessions WHERE access_id = 'manager'").first();
  assert.notEqual(storedSession.token_hash, manager.cookie.split("=")[1]);
  console.log("[integration] manager login, secure cookie, session restore and attendance auth PASS");

  const created = await api("access", { jar: manager, body: { email: "employee@example.test", displayName: "Local Employee", accessLevel: "employee", clockEnabled: true } });
  const accessId = created.payload.account.id;
  assert.equal(created.payload.workforceReady, true);
  const account = () => api("access", { jar: manager }).then(({ payload }) => payload.accounts.find(item => item.id === accessId));
  assert.equal((await account()).credentialsProvisioned, false);
  await api("auth/login", { body: { email: "employee@example.test", password: temporaryPassword }, status: 401 });
  await api("auth/admin/credentials", { jar: manager, body: { accessId, password: "short" }, status: 400 });
  await api("auth/admin/credentials", { jar: manager, body: { accessId, password: temporaryPassword } });
  await api("auth/admin/credentials", { jar: manager, body: { accessId, password: temporaryPassword }, status: 409 });
  assert.equal((await account()).mustChangePassword, true);
  const credential = await db.prepare("SELECT * FROM habat_auth_credentials WHERE access_id = ?").bind(accessId).first();
  assert.equal(credential.password_iterations, 100000);
  assert.notEqual(credential.password_hash, temporaryPassword);
  const employee = {};
  const firstLogin = await api("auth/login", { jar: employee, body: { email: "employee@example.test", password: temporaryPassword } });
  assert.equal(firstLogin.payload.mustChangePassword, true);
  assert.equal(firstLogin.payload.principal.uid, accessId);
  assert.equal((await api("auth/session", { jar: employee })).payload.mustChangePassword, true);
  await api("v2/context", { jar: employee, status: 403 });
  await api("auth/admin/reset-password", { jar: employee, body: { accessId: "manager", password: newPassword }, status: 403 });
  await api("auth/change-password", { jar: employee, body: { currentPassword: "incorrect", newPassword }, status: 401 });
  const oldCookie = { ...employee };
  await api("auth/change-password", { jar: employee, body: { currentPassword: temporaryPassword, newPassword } });
  await api("auth/session", { jar: oldCookie, status: 401 });
  assert.equal((await api("auth/session", { jar: employee })).payload.mustChangePassword, false);
  await api("v2/context", { jar: employee });
  await api("access", { jar: employee, status: 403 });
  console.log("[integration] access → credentials → employee login → mandatory password change PASS");

  const profile = await db.prepare("SELECT id FROM workforce_employee_profiles WHERE source_id = ?").bind(accessId).first();
  assert.ok(profile?.id);
  for (const table of ["workforce_employment", "workforce_attendance_links", "workforce_schedule_assignments"]) {
    assert.ok(await db.prepare(`SELECT * FROM ${table} WHERE employee_id = ?`).bind(profile.id).first(), table);
  }
  const upsert = await api("access", { jar: manager, body: { email: "employee@example.test", displayName: "Updated Employee", accessLevel: "employee" } });
  assert.equal(upsert.payload.account.id, accessId);
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM workforce_employee_profiles WHERE source_id = ?").bind(accessId).first()).count, 1);
  await api(`workforce/v1/employees/${profile.id}`, { jar: manager });
  await db.prepare(`INSERT INTO habat_attendance_records (id, access_id, account_uid, account_email, attendance_date, check_in_at)
    VALUES ('legacy-record', 'manager', 'legacy-manager-uid', 'manager@example.test', '2026-01-05', '2026-01-05T06:00:00.000Z')`).run();
  const history = await api("v2/my-history?from=2026-01-01&to=2026-01-31", { jar: manager });
  assert.ok(history.payload.records.some(item => item.id === "legacy-record"));
  assert.equal((await db.prepare("SELECT uid FROM habat_attendance_access WHERE id = 'manager'").first()).uid, "legacy-manager-uid");
  console.log("[integration] Workforce profile/employment/link/schedule, idempotent access and legacy history PASS");

  // A mobile GPS point can land slightly outside a branch boundary even when the
  // user is inside it. The worker accepts only a bounded fraction of its reported
  // accuracy, while preserving the configured radius as the authoritative limit.
  await db.prepare("UPDATE habat_attendance_access SET clock_enabled = 1 WHERE id = 'manager'").run();
  const branchLatitude = 24.7136;
  const branchLongitude = 46.6753;
  const metersPerLatitudeDegree = 111194.9266;
  const latitudeAtDistance = meters => branchLatitude + meters / metersPerLatitudeDegree;
  await api("v2/settings", {
    jar: manager,
    method: "PATCH",
    body: {
      locationRequired: true,
      latitude: branchLatitude,
      longitude: branchLongitude,
      radiusM: 100,
      maxAccuracyM: 150,
    },
  });

  const mobileClockIn = await api("v2/check-in", {
    jar: manager,
    body: {
      latitude: latitudeAtDistance(108),
      longitude: branchLongitude,
      accuracyM: 20,
    },
  });
  assert.equal(mobileClockIn.payload.record.checkInLocation.latitude, latitudeAtDistance(108));
  assert.equal(mobileClockIn.payload.record.checkInLocation.longitude, branchLongitude);
  assert.equal(mobileClockIn.payload.record.checkInLocation.accuracyM, 20);
  assert.ok(mobileClockIn.payload.record.checkInLocation.distanceM > 100);
  assert.ok(mobileClockIn.payload.record.checkInLocation.distanceM <= 110);

  const rejectedForAccuracy = await api("v2/check-out", {
    jar: manager,
    status: 422,
    body: { latitude: branchLatitude, longitude: branchLongitude, accuracyM: 151 },
  });
  assert.equal(rejectedForAccuracy.payload.message, "habat_location_accuracy_too_low");

  const rejectedOutsideRange = await api("v2/check-out", {
    jar: manager,
    status: 403,
    body: { latitude: latitudeAtDistance(130), longitude: branchLongitude, accuracyM: 20 },
  });
  assert.equal(rejectedOutsideRange.payload.message, "habat_outside_location_range");
  assert.ok(rejectedOutsideRange.payload.distanceM > rejectedOutsideRange.payload.radiusM);
  assert.equal(rejectedOutsideRange.payload.radiusM, 100);
  console.log("[integration] fresh mobile GPS payload, bounded accuracy tolerance, and outside-range rejection PASS");

  await api("auth/admin/reset-password", { jar: manager, body: { accessId, password: resetPassword } });
  await api("auth/session", { jar: employee, status: 401 });
  await api("auth/login", { body: { email: "employee@example.test", password: newPassword }, status: 401 });
  await api("auth/login", { jar: employee, body: { email: "employee@example.test", password: resetPassword } });
  assert.equal((await api("auth/session", { jar: employee })).payload.mustChangePassword, true);
  await api("auth/change-password", { jar: employee, body: { currentPassword: resetPassword, newPassword } });
  const revokedByLogout = { ...employee };
  const logout = await api("auth/logout", { jar: employee, method: "POST" });
  assert.ok(logout.cookie.includes("Max-Age=0"));
  await api("auth/session", { jar: revokedByLogout, status: 401 });
  await api("auth/login", { jar: employee, body: { email: "employee@example.test", password: newPassword } });
  await api(`access/${accessId}`, { jar: manager, method: "PATCH", body: { isActive: false } });
  await api("auth/session", { jar: employee, status: 401 });
  await api("auth/login", { body: { email: "employee@example.test", password: newPassword }, status: 401 });
  await api(`access/${accessId}`, { jar: manager, method: "PATCH", body: { isActive: true } });
  for (let attempt = 1; attempt <= 5; attempt++) {
    await api("auth/login", { body: { email: "employee@example.test", password: "wrong" }, status: attempt < 5 ? 401 : 429 });
  }
  await api("auth/login", { body: { email: "employee@example.test", password: newPassword }, status: 429 });
  await api("auth/admin/reset-password", { jar: manager, body: { accessId, password: resetPassword } });
  await api("auth/login", { jar: employee, body: { email: "employee@example.test", password: resetPassword } });
  await api("access", { jar: manager, body: { email: "csrf@example.test" }, status: 403, headers: { Origin: "https://evil.example" } });
  await api("auth/admin/credentials", { jar: manager, body: { accessId: "missing", password: newPassword }, status: 404 });
  const audits = await db.prepare("SELECT action, after_json FROM habat_attendance_audit WHERE entity_type = 'habat_auth_credentials'").all();
  assert.ok(audits.results.some(item => item.action === "create_auth_credentials"));
  assert.ok(audits.results.some(item => item.action === "reset_auth_password"));
  assert.ok(!JSON.stringify(audits.results).includes(resetPassword));
  const managerOld = { ...manager };
  await api("auth/logout", { jar: manager, method: "POST" });
  await api("auth/session", { jar: managerOld, status: 401 });
  assert.deepEqual(outbound, [], "Habat must never contact external auth or legacy services");
  console.log(`[integration] reset, revocation, logout, disabled access, lockout, origin checks, audit PASS (${requests} HTTP requests through Pages → Worker → D1)`);
} finally {
  await pages.dispose();
  await worker.dispose();
}
