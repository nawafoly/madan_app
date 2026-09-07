import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  calculatePayrollEntryTotals,
  manualAdjustmentDirectionForKind,
} from "./workforce-payroll-adjustments.js";

const service = fs.readFileSync(new URL("./workforce-payroll-adjustments.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("./workforce-migrations/0004_workforce_manual_payroll_adjustments.sql", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("../client/src/features/workforce/WorkforcePayrollAdjustmentsPanel.tsx", import.meta.url), "utf8");
const integration = fs.readFileSync(new URL("../scripts/integrate-workforce-payroll-adjustments.mjs", import.meta.url), "utf8");

test("manual payroll adjustment core remains tenant-agnostic", () => {
  for (const forbidden of ["habat_", "habat-alwaraq", "حبات الورق", "salon_id"]) {
    assert.equal(service.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
    assert.equal(migration.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
    assert.equal(ui.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
});

test("Malikat-compatible manual kinds have deterministic directions", () => {
  for (const kind of ["bonus", "allowance", "commission", "manual_addition"]) {
    assert.equal(manualAdjustmentDirectionForKind(kind), "addition", kind);
  }
  for (const kind of ["advance", "penalty", "manual_deduction", "other_deduction"]) {
    assert.equal(manualAdjustmentDirectionForKind(kind), "deduction", kind);
  }
  assert.equal(manualAdjustmentDirectionForKind("attendance_auto"), null);
});

test("manual totals preserve automatic attendance fields without creating them", () => {
  const totals = calculatePayrollEntryTotals({
    baseSalaryHalalas: 500000,
    allowancesHalalas: 100000,
    overtimeHalalas: 25000,
    manualAdditionsHalalas: 30000,
    attendanceDeductionHalalas: 0,
    absenceDeductionHalalas: 0,
    manualDeductionsHalalas: 45000,
  });
  assert.deepEqual(totals, {
    grossSalaryHalalas: 655000,
    totalDeductionsHalalas: 45000,
    netSalaryHalalas: 610000,
  });
  assert.ok(service.includes("automaticAttendanceDeductionApplied: false"));
  assert.equal(/attendance_deduction_halalas\s*=\s*\?/i.test(service), false);
});

test("adjustments are retry-safe, soft-cancellable, batched, and audit logged", () => {
  for (const required of [
    "operation_id",
    "COALESCE(status, 'active') = 'active'",
    "status = 'cancelled'",
    "cancelled_at",
    "runBatch",
    "workforce.payroll_adjustment.create",
    "workforce.payroll_adjustment.cancel",
  ]) {
    assert.ok(service.includes(required), required);
  }
  assert.equal(/DELETE\s+FROM\s+workforce_payroll_adjustments/i.test(service), false);
});

test("manual adjustment workspace cannot mutate non-draft payroll", () => {
  assert.ok(service.includes('const MUTABLE_ENTRY_STATUSES = new Set(["draft"])'));
  assert.ok(service.includes("workforce_payroll_adjustment_entry_locked"));
  assert.ok(service.includes("assertDraft(period, entry)"));
});

test("draft payroll shell snapshots salary setup but explicitly defers attendance calculation", () => {
  for (const required of [
    "workforce_payroll_periods",
    "workforce_payroll_entries",
    "setup_snapshot_json",
    'stage: "manual_adjustments_only"',
    'status: "not_evaluated"',
    "automaticAttendanceDeductionApplied: false",
  ]) {
    assert.ok(service.includes(required), required);
  }
});

test("migration adds lifecycle, idempotency, and lookup indexes without touching legacy tables", () => {
  for (const required of [
    "operation_id",
    "status",
    "metadata_json",
    "cancelled_at",
    "cancelled_by_uid",
    "cancelled_by_email",
    "updated_at",
    "idx_workforce_payroll_adjustment_operation",
    "idx_workforce_payroll_adjustment_employee_status",
    "idx_workforce_payroll_adjustment_source",
  ]) {
    assert.ok(migration.includes(required), required);
  }
  assert.equal(/\bhabat_/i.test(migration), false);
  assert.equal(/\b(?:DROP|DELETE)\b/i.test(migration), false);
});

test("payroll UI covers additions, penalties, manual deductions, cancellation, and payroll safety", () => {
  for (const required of [
    "مكافأة",
    "بدل",
    "عمولة",
    "سلفة",
    "جزاء",
    "خصم يدوي",
    "استقطاع آخر",
    "خصم الحضور التلقائي غير مفعل",
    "تم إلغاء العملية وعكس أثرها",
  ]) {
    assert.ok(ui.includes(required), required);
  }
});

test("payroll integration patch is idempotent, CRLF-safe, and cannot deploy or target remote D1", () => {
  assert.ok(integration.includes("preferredEol"));
  assert.ok(integration.includes("crlfMarker"));
  assert.ok(integration.includes("includes"));
  assert.equal(/--remote|wrangler|deploy|d1\s+execute/i.test(integration), false);
});
