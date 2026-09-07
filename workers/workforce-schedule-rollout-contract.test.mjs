import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const rollout = fs.readFileSync(new URL("../scripts/deploy-workforce-schedule-production.ps1", import.meta.url), "utf8");
const reporter = fs.readFileSync(new URL("../scripts/report-workforce-schedule-production-schema.mjs", import.meta.url), "utf8");

test("schedule rollout is gated before Production writes", () => {
  const gate = rollout.indexOf("gate-workforce-schedule-phase2.mjs");
  const preflight = rollout.indexOf("--expect=0");
  const migration = rollout.indexOf("0003_workforce_schedule_control.sql");
  const postflight = rollout.indexOf("--expect=1");
  const deploy = rollout.indexOf("wrangler deploy");
  assert.ok(gate >= 0 && preflight > gate && migration > preflight && postflight > migration && deploy > postflight);
});

test("schedule rollout blocks mixed schema and supports safe resume after applied migration", () => {
  assert.ok(rollout.includes("Neither all-0 nor all-1"));
  assert.ok(rollout.includes("already fully applied; skipping D1 write"));
  assert.ok(reporter.includes("EXPECTATION FAILED"));
  assert.ok(reporter.includes("EXPECTATION PASS"));
});

test("schedule rollout never resets or force-cleans user work", () => {
  assert.equal(/git\s+(?:reset|clean|checkout\s+--|restore\s+--source)/i.test(rollout), false);
  assert.ok(rollout.includes("Unexpected working-tree changes"));
  assert.ok(rollout.includes("WorkforceEmployeeFile.tsx"));
  assert.ok(rollout.includes("workforce-core.js"));
});

test("schedule rollout requires expected unauthenticated smoke semantics", () => {
  assert.ok(rollout.includes("401"));
  assert.ok(rollout.includes("missing_firebase_id_token"));
  assert.ok(rollout.includes("schedule/resolve?date=2026-09-07"));
});
