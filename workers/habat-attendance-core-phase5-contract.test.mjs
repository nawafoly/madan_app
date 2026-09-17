import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildCanonicalPayrollImpactLedger } from "./workforce-payroll-impact-ledger.js";

const migration = fs.readFileSync(new URL("./workforce-migrations/0007_workforce_canonical_payroll_impacts.sql", import.meta.url), "utf8");
const adjustments = fs.readFileSync(new URL("./workforce-payroll-adjustments.js", import.meta.url), "utf8");
const readiness = fs.readFileSync(new URL("./workforce-payroll-readiness.js", import.meta.url), "utf8");

test("canonical payroll impact storage contains automatic and manual financial effects", () => {
  for (const required of [
    "CREATE TABLE IF NOT EXISTS workforce_payroll_impacts",
    "source_type",
    "source_id",
    "automatic",
    "policy_version",
    "idx_workforce_payroll_impacts_source",
    "FROM workforce_payroll_adjustments",
    "attendance_deduction",
    "absence_deduction",
    "overtime",
  ]) assert.ok(migration.includes(required), required);
  assert.equal(/DROP\s+TABLE\s+workforce_payroll_adjustments/i.test(migration), false);
});

test("stored impact rows are the preferred financial ledger source", () => {
  const ledger = buildCanonicalPayrollImpactLedger({
    entry: { id: "entry-1", employee_id: "emp-1", month_key: "2026-09", overtime_halalas: 999999 },
    impactRows: [
      { id: "i1", payroll_entry_id: "entry-1", employee_id: "emp-1", month_key: "2026-09", direction: "addition", kind: "overtime", amount_halalas: 12000, source_type: "payroll_readiness", source_id: "2026-09:overtime", automatic: 1, status: "active" },
      { id: "i2", payroll_entry_id: "entry-1", employee_id: "emp-1", month_key: "2026-09", direction: "deduction", kind: "attendance_deduction", amount_halalas: 3500, source_type: "payroll_readiness", source_id: "2026-09:attendance_deduction", automatic: 1, status: "active" },
      { id: "i3", payroll_entry_id: "entry-1", employee_id: "emp-1", month_key: "2026-09", direction: "addition", kind: "bonus", amount_halalas: 5000, source_type: "manual", source_id: "manual-1", automatic: 0, status: "active" },
      { id: "i4", payroll_entry_id: "entry-1", employee_id: "emp-1", month_key: "2026-09", direction: "deduction", kind: "absence_deduction", amount_halalas: 0, source_type: "payroll_readiness", source_id: "2026-09:absence_deduction", automatic: 1, status: "cancelled" },
    ],
  });
  assert.equal(ledger.totals.overtimeHalalas, 12000);
  assert.equal(ledger.totals.attendanceDeductionHalalas, 3500);
  assert.equal(ledger.totals.absenceDeductionHalalas, 0);
  assert.equal(ledger.totals.manualAdditionsHalalas, 5000);
  assert.equal(ledger.totals.additionsHalalas, 17000);
  assert.equal(ledger.rows.length, 4);
});

test("manual payroll commands dual-write to canonical impact storage during cutover", () => {
  assert.match(adjustments, /SELECT \* FROM workforce_payroll_impacts/);
  assert.match(adjustments, /INSERT INTO workforce_payroll_impacts/);
  assert.match(adjustments, /UPDATE workforce_payroll_impacts/);
  assert.match(adjustments, /impactRows: impactRows\.length \? impactRows : null/);
  assert.match(adjustments, /\[insert, impactInsert, recompute, audit\]/);
  assert.match(adjustments, /\[cancel, impactCancel, recompute, audit\]/);
});

test("Payroll Readiness persists automatic Day State impacts idempotently", () => {
  assert.match(readiness, /buildAutomaticImpactStatement/);
  assert.match(readiness, /INSERT INTO workforce_payroll_impacts/);
  assert.match(readiness, /ON CONFLICT\(tenant_id, payroll_entry_id, source_type, source_id\) DO UPDATE/);
  for (const kind of ["overtime", "attendance_deduction", "absence_deduction"]) {
    assert.ok(readiness.includes(`kind: '${kind}'`), kind);
  }
  assert.match(readiness, /source: 'workforce_day_state'/);
});
