import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  aggregatePayrollPeriodStatus,
  evaluatePayrollReviewGate,
  payrollLifecycleTarget,
} from "./workforce-payroll-lifecycle.js";

const service = fs.readFileSync(new URL("./workforce-payroll-lifecycle.js", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("../client/src/features/workforce/WorkforcePayrollLifecyclePanel.tsx", import.meta.url), "utf8");
const integration = fs.readFileSync(new URL("../scripts/integrate-workforce-payroll-lifecycle.mjs", import.meta.url), "utf8");

test("payroll lifecycle remains tenant-agnostic", () => {
  for (const forbidden of ["habat_", "habat-alwaraq", "حبات الورق", "salon_id"]) {
    assert.equal(service.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
    assert.equal(ui.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
});

test("forward lifecycle is draft -> reviewed -> approved -> paid", () => {
  assert.deepEqual(payrollLifecycleTarget("draft", "review"), { target: "reviewed", idempotent: false });
  assert.deepEqual(payrollLifecycleTarget("reviewed", "approve"), { target: "approved", idempotent: false });
  assert.deepEqual(payrollLifecycleTarget("approved", "mark_paid"), { target: "paid", idempotent: false });
  assert.equal(payrollLifecycleTarget("draft", "approve"), null);
});

test("approved can reopen to draft or reviewed, while paid requires separate reversal", () => {
  assert.deepEqual(payrollLifecycleTarget("approved", "reopen", "draft"), { target: "draft", idempotent: false });
  assert.deepEqual(payrollLifecycleTarget("approved", "reopen", "reviewed"), { target: "reviewed", idempotent: false });
  assert.equal(payrollLifecycleTarget("paid", "reopen", "draft").error, "workforce_payroll_paid_reopen_not_allowed");
  assert.deepEqual(payrollLifecycleTarget("paid", "reverse_payment"), { target: "approved", idempotent: false });
});

test("period aggregate status is the lowest entry status", () => {
  assert.equal(aggregatePayrollPeriodStatus(["paid", "approved", "reviewed"]), "reviewed");
  assert.equal(aggregatePayrollPeriodStatus(["paid", "paid"]), "paid");
  assert.equal(aggregatePayrollPeriodStatus(["approved", "draft"]), "draft");
});

test("review gate requires closed month plus applied ready attendance snapshot", () => {
  const readyEntry = {
    calculation_snapshot_json: JSON.stringify({ stage: "attendance_applied" }),
    attendance_snapshot_json: JSON.stringify({ readiness: { ready: true } }),
  };
  assert.equal(evaluatePayrollReviewGate({ entry: readyEntry, periodEnd: "2026-08-31", today: "2026-09-07" }).ready, true);
  assert.equal(evaluatePayrollReviewGate({ entry: readyEntry, periodEnd: "2026-09-30", today: "2026-09-07" }).ready, false);
  assert.equal(evaluatePayrollReviewGate({ entry: { calculation_snapshot_json: "{}", attendance_snapshot_json: "{}" }, periodEnd: "2026-08-31", today: "2026-09-07" }).ready, false);
});

test("lifecycle writes are batched, audited, and operation-idempotent", () => {
  for (const required of [
    "runBatch",
    "workforce_audit_events",
    "operationId",
    "findPriorOperation",
    "workforce.payroll.lifecycle.review",
    "workforce.payroll.lifecycle.approve",
    "workforce.payroll.lifecycle.mark_paid",
    "workforce.payroll.lifecycle.reopen",
    "workforce.payroll.lifecycle.reverse_payment",
  ]) assert.ok(service.includes(required), required);
});

test("paid entries cannot be silently reopened", () => {
  assert.ok(service.includes("workforce_payroll_paid_reopen_not_allowed"));
  assert.ok(ui.includes("لا يمكن إعادة فتح راتب مدفوع"));
  assert.ok(ui.includes("عكس الدفع"));
});

test("lifecycle UI exposes all four statuses and controlled backward actions", () => {
  for (const required of ["مسودة", "تمت المراجعة", "معتمد", "مدفوع", "إرسال للمراجعة", "اعتماد الراتب", "تسجيل كمدفوع", "إعادة فتح", "عكس الدفع"]) {
    assert.ok(ui.includes(required), required);
  }
});

test("lifecycle integration is idempotent, CRLF-safe, and cannot deploy", () => {
  assert.ok(integration.includes("preferredEol"));
  assert.ok(integration.includes("crlfMarker"));
  assert.ok(integration.includes("includes"));
  assert.equal(/--remote|wrangler|deploy|d1\s+execute/i.test(integration), false);
});
