import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}
function write(path, content) {
  fs.writeFileSync(path, content, "utf8");
}
function replaceOnce(source, anchor, replacement, label) {
  if (!source.includes(anchor)) throw new Error(`Missing patch anchor: ${label}`);
  return source.replace(anchor, replacement);
}
function replaceRegexOnce(source, pattern, replacement, label) {
  const match = source.match(pattern);
  if (!match) throw new Error(`Missing patch pattern: ${label}`);
  return source.replace(pattern, replacement);
}

// ---------------------------------------------------------------------------
// 1) Payroll adjustment workspace reads the persisted canonical impact ledger,
//    while manual commands dual-write during the compatibility window.
// ---------------------------------------------------------------------------
const adjustmentsPath = "workers/workforce-payroll-adjustments.js";
let adjustments = read(adjustmentsPath);

adjustments = replaceRegexOnce(
  adjustments,
  /  let adjustments = \[\];\n  if \(entry\?\.id\) \{[\s\S]*?    adjustments = result\?\.results \|\| \[\];\n  \}\n/,
  [
    "  let adjustments = [];",
    "  let impactRows = [];",
    "  if (entry?.id) {",
    "    const [legacyResult, impactResult] = await Promise.all([",
    "      db.prepare(`SELECT * FROM workforce_payroll_adjustments",
    "                   WHERE tenant_id = ? AND employee_id = ? AND payroll_entry_id = ?",
    "                   ORDER BY added_at DESC, id DESC`)",
    "        .bind(tenantId, employeeId, entry.id).all(),",
    "      db.prepare(`SELECT * FROM workforce_payroll_impacts",
    "                   WHERE tenant_id = ? AND employee_id = ? AND payroll_entry_id = ?",
    "                   ORDER BY added_at DESC, id DESC`)",
    "        .bind(tenantId, employeeId, entry.id).all(),",
    "    ]);",
    "    adjustments = legacyResult?.results || [];",
    "    impactRows = impactResult?.results || [];",
    "  }",
    "",
  ].join("\n"),
  "workspace canonical impact read"
);

adjustments = replaceOnce(
  adjustments,
  "    impactLedger: buildCanonicalPayrollImpactLedger({ entry, manualAdjustments: adjustments }),",
  "    impactLedger: buildCanonicalPayrollImpactLedger({ entry, impactRows: impactRows.length ? impactRows : null, manualAdjustments: adjustments }),",
  "workspace persisted impact ledger"
);

const createImpact = [
  "  const impactInsert = db.prepare(`INSERT INTO workforce_payroll_impacts (",
  "    id, tenant_id, payroll_entry_id, employee_id, month_key, direction, kind,",
  "    amount_halalas, reason, note, source_type, source_id, automatic, policy_version,",
  "    operation_id, status, metadata_json, added_by_uid, added_by_email, added_at, updated_at",
  "  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, 0, NULL, ?, 'active', ?, ?, ?, ?, ?)",
  "  ON CONFLICT(tenant_id, payroll_entry_id, source_type, source_id) DO UPDATE SET",
  "    amount_halalas = excluded.amount_halalas, reason = excluded.reason, note = excluded.note,",
  "    operation_id = excluded.operation_id, status = 'active', metadata_json = excluded.metadata_json,",
  "    added_by_uid = excluded.added_by_uid, added_by_email = excluded.added_by_email, updated_at = excluded.updated_at`)",
  "    .bind(",
  "      adjustmentId, tenantId, entry.id, employeeId, monthKey, direction, kind,",
  "      amountHalalas, reason, note, adjustmentId, operationId,",
  "      JSON.stringify({ source: 'manual_adjustment', canonicalImpactLedger: true }),",
  "      principal?.uid || null, principal?.email || null, now, now",
  "    );",
  "",
].join("\n");

adjustments = replaceOnce(
  adjustments,
  "  const recompute = buildRecomputeEntryStatement(db, tenantId, entry.id, now);",
  createImpact + "  const recompute = buildRecomputeEntryStatement(db, tenantId, entry.id, now);",
  "manual impact dual-write"
);
adjustments = replaceOnce(
  adjustments,
  "  await runBatch(db, [insert, recompute, audit]);",
  "  await runBatch(db, [insert, impactInsert, recompute, audit]);",
  "manual impact create batch"
);

const cancelStart = adjustments.indexOf("async function cancelManualAdjustment");
if (cancelStart < 0) throw new Error("Missing cancelManualAdjustment");
let cancelSection = adjustments.slice(cancelStart);
const cancelImpact = [
  "  const impactCancel = db.prepare(`UPDATE workforce_payroll_impacts",
  "                                SET status = 'cancelled', cancelled_at = ?,",
  "                                    cancelled_by_uid = ?, cancelled_by_email = ?, updated_at = ?",
  "                              WHERE tenant_id = ? AND employee_id = ? AND id = ? AND automatic = 0`)",
  "    .bind(now, principal?.uid || null, principal?.email || null, now, tenantId, employeeId, adjustmentId);",
  "",
].join("\n");
cancelSection = replaceOnce(
  cancelSection,
  "  const recompute = buildRecomputeEntryStatement(db, tenantId, entry.id, now);",
  cancelImpact + "  const recompute = buildRecomputeEntryStatement(db, tenantId, entry.id, now);",
  "manual impact cancel mirror"
);
cancelSection = replaceOnce(
  cancelSection,
  "  await runBatch(db, [cancel, recompute, audit]);",
  "  await runBatch(db, [cancel, impactCancel, recompute, audit]);",
  "manual impact cancel batch"
);
adjustments = adjustments.slice(0, cancelStart) + cancelSection;
write(adjustmentsPath, adjustments);

// ---------------------------------------------------------------------------
// 2) Payroll Readiness persists automatic impacts to the same canonical ledger.
// ---------------------------------------------------------------------------
const readinessPath = "workers/workforce-payroll-readiness.js";
let readiness = read(readinessPath);

const automaticStatements = [
  "    buildAutomaticImpactStatement(db, {",
  "      tenantId, entryId, employeeId, monthKey, kind: 'overtime', direction: 'addition',",
  "      amountHalalas: overtimeHalalas, reason: 'Overtime', now,",
  "    }),",
  "    buildAutomaticImpactStatement(db, {",
  "      tenantId, entryId, employeeId, monthKey, kind: 'attendance_deduction', direction: 'deduction',",
  "      amountHalalas: preview.deductions.attendanceDeductionHalalas, reason: 'Attendance deduction', now,",
  "    }),",
  "    buildAutomaticImpactStatement(db, {",
  "      tenantId, entryId, employeeId, monthKey, kind: 'absence_deduction', direction: 'deduction',",
  "      amountHalalas: preview.deductions.absenceDeductionHalalas, reason: 'Absence deduction', now,",
  "    }),",
].join("\n");

readiness = replaceOnce(
  readiness,
  '    buildAuditStatement(db, {\n      tenantId,\n      principal,\n      action: "workforce.payroll_readiness.apply",',
  automaticStatements + '\n    buildAuditStatement(db, {\n      tenantId,\n      principal,\n      action: "workforce.payroll_readiness.apply",',
  "automatic impact persistence"
);

const helper = [
  "function buildAutomaticImpactStatement(db, { tenantId, entryId, employeeId, monthKey, kind, direction, amountHalalas, reason, now }) {",
  "  const amount = Math.max(0, Math.round(Number(amountHalalas || 0)));",
  "  const status = amount > 0 ? 'active' : 'cancelled';",
  "  const sourceId = `${monthKey}:${kind}`;",
  "  const impactId = `wf_payroll_impact_${entryId}_${kind}`;",
  "  return db.prepare(`INSERT INTO workforce_payroll_impacts (",
  "    id, tenant_id, payroll_entry_id, employee_id, month_key, direction, kind,",
  "    amount_halalas, reason, note, source_type, source_id, automatic, policy_version,",
  "    operation_id, status, metadata_json, added_by_uid, added_by_email, added_at, updated_at",
  "  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'payroll_readiness', ?, 1, ?, NULL, ?, ?, NULL, NULL, ?, ?)",
  "  ON CONFLICT(tenant_id, payroll_entry_id, source_type, source_id) DO UPDATE SET",
  "    direction = excluded.direction, kind = excluded.kind, amount_halalas = excluded.amount_halalas,",
  "    reason = excluded.reason, automatic = 1, policy_version = excluded.policy_version,",
  "    status = excluded.status, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at`)",
  "    .bind(",
  "      impactId, tenantId, entryId, employeeId, monthKey, direction, kind, amount, reason,",
  "      sourceId, POLICY_VERSION, status,",
  "      JSON.stringify({ source: 'workforce_day_state', policyVersion: POLICY_VERSION }),",
  "      now, now",
  "    );",
  "}",
  "",
].join("\n");

readiness = replaceOnce(
  readiness,
  "async function activeManualTotals(db, tenantId, entryId) {",
  helper + "async function activeManualTotals(db, tenantId, entryId) {",
  "automatic impact statement helper"
);
write(readinessPath, readiness);

console.log("Applied Habat Attendance Core Phase 5: payroll impacts are now persisted to the canonical ledger with compatibility dual-write.");
