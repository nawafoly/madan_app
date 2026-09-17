import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const adjustments = fs.readFileSync(new URL("./workforce-payroll-adjustments.js", import.meta.url), "utf8");
const readiness = fs.readFileSync(new URL("./workforce-payroll-readiness.js", import.meta.url), "utf8");

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, endMarker);
  return source.slice(start, end);
}

test("payroll workspace reads financial rows only from canonical impacts", () => {
  const workspace = section(adjustments, "async function getPayrollAdjustmentWorkspace", "async function createManualAdjustment");
  assert.match(workspace, /SELECT \* FROM workforce_payroll_impacts/);
  assert.doesNotMatch(workspace, /SELECT \* FROM workforce_payroll_adjustments/);
  assert.match(workspace, /const adjustments = impactRows\.filter/);
  assert.match(workspace, /buildCanonicalPayrollImpactLedger\(\{ entry, impactRows \}\)/);
});

test("payroll entry recompute uses canonical impacts only", () => {
  const recompute = section(adjustments, "function buildRecomputeEntryStatement", "function assertDraft");
  assert.match(recompute, /FROM workforce_payroll_impacts/);
  assert.match(recompute, /automatic = 0/);
  assert.doesNotMatch(recompute, /FROM workforce_payroll_adjustments/);
});

test("Payroll Readiness manual totals use canonical impacts only", () => {
  const totals = section(readiness, "async function activeManualTotals", "function deriveDailyHours");
  assert.match(totals, /FROM workforce_payroll_impacts/);
  assert.match(totals, /automatic = 0/);
  assert.doesNotMatch(totals, /FROM workforce_payroll_adjustments/);
});

test("legacy adjustment table remains compatibility command storage during cutover", () => {
  assert.match(adjustments, /INSERT INTO workforce_payroll_adjustments/);
  assert.match(adjustments, /UPDATE workforce_payroll_adjustments/);
  assert.match(adjustments, /INSERT INTO workforce_payroll_impacts/);
  assert.match(adjustments, /UPDATE workforce_payroll_impacts/);
});
