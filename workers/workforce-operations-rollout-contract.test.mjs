import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const rollout = fs.readFileSync(new URL("../scripts/deploy-workforce-operations-production.ps1", import.meta.url), "utf8");

test("operations rollout gates before commit and deploy", () => {
  const gate = rollout.indexOf("gate-workforce-operations-phase2.mjs");
  const commit = rollout.indexOf("commit operations integration");
  const deploy = rollout.indexOf("wrangler deploy");
  const leaveSmoke = rollout.indexOf("Smoke-Route 'leave lifecycle'");
  const attendanceSmoke = rollout.indexOf("Smoke-Route 'attendance operations'");
  const scheduleSmoke = rollout.indexOf("Smoke-Route 'schedule regression'");
  assert.ok(gate >= 0 && commit > gate && deploy > commit && leaveSmoke > deploy && attendanceSmoke > leaveSmoke && scheduleSmoke > attendanceSmoke);
});

test("operations rollout has no Production D1 migration", () => {
  assert.equal(/d1\s+execute|--remote|workforce-migrations/i.test(rollout), false);
});

test("operations rollout never resets or force-cleans user work", () => {
  assert.equal(/git\s+(?:reset|clean|checkout\s+--|restore\s+--source)/i.test(rollout), false);
  assert.ok(rollout.includes("Unexpected working-tree changes"));
  assert.ok(rollout.includes("WorkforceEmployeeFile.tsx"));
  assert.ok(rollout.includes("workforce-core.js"));
  assert.ok(rollout.includes("habat-workforce-adapter.js"));
});

test("operations rollout requires auth-bound smoke semantics on all new and regressed routes", () => {
  assert.ok(rollout.includes("missing_firebase_id_token"));
  assert.ok(rollout.includes("/leaves"));
  assert.ok(rollout.includes("/attendance-operations?month=2026-09"));
  assert.ok(rollout.includes("/schedule/resolve?date=2026-09-07"));
});

test("operations rollout stays ASCII-safe for Windows PowerShell 5.1", () => {
  assert.equal(/[^\x00-\x7F]/.test(rollout), false);
});
