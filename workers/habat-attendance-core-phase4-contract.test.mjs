import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildCanonicalPayrollImpactLedger } from "./workforce-payroll-impact-ledger.js";

const adjustments = fs.readFileSync(new URL("./workforce-payroll-adjustments.js", import.meta.url), "utf8");
const readiness = fs.readFileSync(new URL("./workforce-payroll-readiness.js", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("../client/src/features/workforce/WorkforcePayrollAdjustmentsPanel.tsx", import.meta.url), "utf8");

test("canonical payroll impact ledger combines automatic and manual effects", () => {
  const ledger = buildCanonicalPayrollImpactLedger({
    entry: {
      id: "entry-1",
      employee_id: "emp-1",
      month_key: "2026-09",
      overtime_halalas: 12000,
      attendance_deduction_halalas: 3500,
      absence_deduction_halalas: 8000,
      calculation_snapshot_json: JSON.stringify({ policyVersion: "policy-v1" }),
    },
    manualAdjustments: [
      { id: "a1", payroll_entry_id: "entry-1", employee_id: "emp-1", direction: "addition", kind: "bonus", amount_halalas: 5000, reason: "bonus", status: "active" },
      { id: "a2", payroll_entry_id: "entry-1", employee_id: "emp-1", direction: "deduction", kind: "penalty", amount_halalas: 2000, reason: "penalty", status: "active" },
      { id: "a3", payroll_entry_id: "entry-1", employee_id: "emp-1", direction: "deduction", kind: "manual_deduction", amount_halalas: 900, reason: "cancelled", status: "cancelled" },
    ],
  });

  assert.equal(ledger.rows.length, 6);
  assert.equal(ledger.totals.overtimeHalalas, 12000);
  assert.equal(ledger.totals.attendanceDeductionHalalas, 3500);
  assert.equal(ledger.totals.absenceDeductionHalalas, 8000);
  assert.equal(ledger.totals.manualAdditionsHalalas, 5000);
  assert.equal(ledger.totals.manualDeductionsHalalas, 2000);
  assert.equal(ledger.totals.additionsHalalas, 17000);
  assert.equal(ledger.totals.deductionsHalalas, 13500);
});

test("payroll adjustment workspace exposes the canonical impact ledger", () => {
  assert.match(adjustments, /buildCanonicalPayrollImpactLedger/);
  assert.match(adjustments, /impactLedger:/);
});

test("financial impact center is sourced from Workforce Day State payroll readiness", () => {
  assert.match(readiness, /classifyWorkforceDayRange/);
  assert.match(readiness, /attendanceDeductionHalalas/);
  assert.match(readiness, /absenceDeductionHalalas/);
  assert.match(ui, /مركز الأثر المالي للراتب/);
  assert.match(ui, /workspace\.impactLedger\.rows/);
  assert.match(ui, /workspace\.impactLedger\.totals\.overtimeHalalas/);
  assert.match(ui, /تلقائي · Workforce Day State/);
});
