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
  if (!pattern.test(source)) throw new Error(`Missing patch pattern: ${label}`);
  return source.replace(pattern, replacement);
}

// ---------------------------------------------------------------------------
// Phase 6: make workforce_payroll_impacts the canonical financial read source.
// Legacy workforce_payroll_adjustments remains dual-written only as rollback
// compatibility and is no longer used to calculate payroll totals or UI reads.
// ---------------------------------------------------------------------------
const adjustmentsPath = "workers/workforce-payroll-adjustments.js";
let adjustments = read(adjustmentsPath);

adjustments = replaceRegexOnce(
  adjustments,
  /  let adjustments = \[\];\n  let impactRows = \[\];\n  if \(entry\?\.id\) \{[\s\S]*?    impactRows = impactResult\?\.results \|\| \[\];\n  \}\n/,
  [
    "  let impactRows = [];",
    "  if (entry?.id) {",
    "    const impactResult = await db.prepare(`SELECT * FROM workforce_payroll_impacts",
    "                   WHERE tenant_id = ? AND employee_id = ? AND payroll_entry_id = ?",
    "                   ORDER BY added_at DESC, id DESC`)",
    "      .bind(tenantId, employeeId, entry.id).all();",
    "    impactRows = impactResult?.results || [];",
    "  }",
    "  const adjustments = impactRows.filter(row => !(Number(row?.automatic || 0) === 1 || row?.automatic === true));",
    "",
  ].join("\n"),
  "canonical workspace read"
);

adjustments = replaceOnce(
  adjustments,
  "    automaticAttendanceDeductionApplied: false,\n    impactLedger: buildCanonicalPayrollImpactLedger({ entry, impactRows: impactRows.length ? impactRows : null, manualAdjustments: adjustments }),",
  [
    "    automaticAttendanceDeductionApplied: impactRows.some(row =>",
    "      clean(row?.source_type) === \"payroll_readiness\" && clean(row?.kind) === \"attendance_deduction\"",
    "    ),",
    "    impactLedger: buildCanonicalPayrollImpactLedger({ entry, impactRows }),",
  ].join("\n"),
  "canonical workspace ledger source"
);

const recompute = [
  "function buildRecomputeEntryStatement(db, tenantId, entryId, now) {",
  "  return db.prepare(`UPDATE workforce_payroll_entries",
  "                        SET manual_additions_halalas = (",
  "                              SELECT COALESCE(SUM(amount_halalas), 0)",
  "                                FROM workforce_payroll_impacts",
  "                               WHERE tenant_id = ? AND payroll_entry_id = ? AND automatic = 0",
  "                                 AND direction = 'addition' AND COALESCE(status, 'active') = 'active'",
  "                            ),",
  "                            manual_deductions_halalas = (",
  "                              SELECT COALESCE(SUM(amount_halalas), 0)",
  "                                FROM workforce_payroll_impacts",
  "                               WHERE tenant_id = ? AND payroll_entry_id = ? AND automatic = 0",
  "                                 AND direction = 'deduction' AND COALESCE(status, 'active') = 'active'",
  "                            ),",
  "                            gross_salary_halalas = base_salary_halalas + allowances_halalas + overtime_halalas + (",
  "                              SELECT COALESCE(SUM(amount_halalas), 0)",
  "                                FROM workforce_payroll_impacts",
  "                               WHERE tenant_id = ? AND payroll_entry_id = ? AND automatic = 0",
  "                                 AND direction = 'addition' AND COALESCE(status, 'active') = 'active'",
  "                            ),",
  "                            total_deductions_halalas = attendance_deduction_halalas + absence_deduction_halalas + (",
  "                              SELECT COALESCE(SUM(amount_halalas), 0)",
  "                                FROM workforce_payroll_impacts",
  "                               WHERE tenant_id = ? AND payroll_entry_id = ? AND automatic = 0",
  "                                 AND direction = 'deduction' AND COALESCE(status, 'active') = 'active'",
  "                            ),",
  "                            net_salary_halalas = MAX(0,",
  "                              base_salary_halalas + allowances_halalas + overtime_halalas + (",
  "                                SELECT COALESCE(SUM(amount_halalas), 0)",
  "                                  FROM workforce_payroll_impacts",
  "                                 WHERE tenant_id = ? AND payroll_entry_id = ? AND automatic = 0",
  "                                   AND direction = 'addition' AND COALESCE(status, 'active') = 'active'",
  "                              ) - attendance_deduction_halalas - absence_deduction_halalas - (",
  "                                SELECT COALESCE(SUM(amount_halalas), 0)",
  "                                  FROM workforce_payroll_impacts",
  "                                 WHERE tenant_id = ? AND payroll_entry_id = ? AND automatic = 0",
  "                                   AND direction = 'deduction' AND COALESCE(status, 'active') = 'active'",
  "                              )",
  "                            ),",
  "                            updated_at = ?",
  "                      WHERE tenant_id = ? AND id = ?`)",
  "    .bind(",
  "      tenantId, entryId,",
  "      tenantId, entryId,",
  "      tenantId, entryId,",
  "      tenantId, entryId,",
  "      tenantId, entryId,",
  "      tenantId, entryId,",
  "      now,",
  "      tenantId, entryId",
  "    );",
  "}",
  "",
].join("\n");

adjustments = replaceRegexOnce(
  adjustments,
  /function buildRecomputeEntryStatement\(db, tenantId, entryId, now\) \{[\s\S]*?\n\}\n\n(?=function assertDraft)/,
  recompute,
  "canonical recompute source"
);
write(adjustmentsPath, adjustments);

const readinessPath = "workers/workforce-payroll-readiness.js";
let readiness = read(readinessPath);
const activeTotals = [
  "async function activeManualTotals(db, tenantId, entryId) {",
  "  const row = await db.prepare(`SELECT",
  "      COALESCE(SUM(CASE WHEN direction = 'addition' AND COALESCE(status, 'active') = 'active' THEN amount_halalas ELSE 0 END), 0) AS additions,",
  "      COALESCE(SUM(CASE WHEN direction = 'deduction' AND COALESCE(status, 'active') = 'active' THEN amount_halalas ELSE 0 END), 0) AS deductions",
  "    FROM workforce_payroll_impacts",
  "    WHERE tenant_id = ? AND payroll_entry_id = ? AND automatic = 0`)",
  "    .bind(tenantId, entryId)",
  "    .first();",
  "  return {",
  "    additionsHalalas: Number(row?.additions || 0),",
  "    deductionsHalalas: Number(row?.deductions || 0),",
  "  };",
  "}",
  "",
].join("\n");
readiness = replaceRegexOnce(
  readiness,
  /async function activeManualTotals\(db, tenantId, entryId\) \{[\s\S]*?\n\}\n\n(?=function deriveDailyHours)/,
  activeTotals,
  "canonical readiness manual totals"
);
write(readinessPath, readiness);

console.log("Applied Habat Attendance Core Phase 6: canonical payroll impacts are now the sole financial read and recompute source; legacy adjustments remain compatibility writes only.");
