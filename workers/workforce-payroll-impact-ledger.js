const AUTOMATIC_IMPACT_KINDS = new Set([
  "overtime",
  "attendance_deduction",
  "absence_deduction",
]);

export function buildCanonicalPayrollImpactLedger({ entry = null, manualAdjustments = [] } = {}) {
  const employeeId = clean(entry?.employee_id);
  const monthKey = clean(entry?.month_key);
  const payrollEntryId = clean(entry?.id);
  const policyVersion = readPolicyVersion(entry?.calculation_snapshot_json);
  const rows = [];

  pushAutomatic(rows, {
    payrollEntryId,
    employeeId,
    monthKey,
    kind: "overtime",
    direction: "addition",
    amountHalalas: entry?.overtime_halalas,
    reason: "Overtime",
    policyVersion,
  });
  pushAutomatic(rows, {
    payrollEntryId,
    employeeId,
    monthKey,
    kind: "attendance_deduction",
    direction: "deduction",
    amountHalalas: entry?.attendance_deduction_halalas,
    reason: "Attendance deduction",
    policyVersion,
  });
  pushAutomatic(rows, {
    payrollEntryId,
    employeeId,
    monthKey,
    kind: "absence_deduction",
    direction: "deduction",
    amountHalalas: entry?.absence_deduction_halalas,
    reason: "Absence deduction",
    policyVersion,
  });

  for (const adjustment of manualAdjustments || []) {
    const kind = clean(adjustment?.kind);
    const direction = clean(adjustment?.direction) === "addition" ? "addition" : "deduction";
    const amountHalalas = nonNegativeInt(adjustment?.amount_halalas ?? adjustment?.amountHalalas);
    if (!kind || amountHalalas <= 0) continue;
    rows.push({
      id: clean(adjustment?.id) || `manual:${kind}:${rows.length}`,
      payrollEntryId: clean(adjustment?.payroll_entry_id) || payrollEntryId || null,
      employeeId: clean(adjustment?.employee_id) || employeeId || null,
      monthKey: monthKey || null,
      direction,
      kind,
      amountHalalas,
      reason: clean(adjustment?.reason) || kind,
      note: clean(adjustment?.note) || null,
      sourceType: clean(adjustment?.source_type) || "manual",
      sourceId: clean(adjustment?.source_id) || clean(adjustment?.id) || null,
      policyVersion: null,
      status: clean(adjustment?.status || "active") === "cancelled" ? "cancelled" : "active",
      automatic: false,
      canCancel: clean(adjustment?.status || "active") !== "cancelled",
      addedAt: clean(adjustment?.added_at) || null,
      addedByEmail: clean(adjustment?.added_by_email) || null,
    });
  }

  const activeRows = rows.filter(row => row.status === "active");
  const sum = (predicate) => activeRows
    .filter(predicate)
    .reduce((total, row) => total + nonNegativeInt(row.amountHalalas), 0);

  const totals = {
    additionsHalalas: sum(row => row.direction === "addition"),
    deductionsHalalas: sum(row => row.direction === "deduction"),
    overtimeHalalas: sum(row => row.kind === "overtime"),
    attendanceDeductionHalalas: sum(row => row.kind === "attendance_deduction"),
    absenceDeductionHalalas: sum(row => row.kind === "absence_deduction"),
    manualAdditionsHalalas: sum(row => !row.automatic && row.direction === "addition"),
    manualDeductionsHalalas: sum(row => !row.automatic && row.direction === "deduction"),
  };

  return {
    payrollEntryId: payrollEntryId || null,
    employeeId: employeeId || null,
    monthKey: monthKey || null,
    policyVersion,
    rows,
    totals,
  };
}

export function isAutomaticPayrollImpactKind(kind) {
  return AUTOMATIC_IMPACT_KINDS.has(clean(kind));
}

function pushAutomatic(rows, input) {
  const amountHalalas = nonNegativeInt(input.amountHalalas);
  if (amountHalalas <= 0) return;
  rows.push({
    id: `automatic:${input.payrollEntryId || input.employeeId || "entry"}:${input.kind}`,
    payrollEntryId: input.payrollEntryId || null,
    employeeId: input.employeeId || null,
    monthKey: input.monthKey || null,
    direction: input.direction,
    kind: input.kind,
    amountHalalas,
    reason: input.reason,
    note: null,
    sourceType: "payroll_readiness",
    sourceId: input.monthKey ? `${input.monthKey}:${input.kind}` : input.kind,
    policyVersion: input.policyVersion,
    status: "active",
    automatic: true,
    canCancel: false,
    addedAt: null,
    addedByEmail: null,
  });
}

function readPolicyVersion(value) {
  const text = clean(value);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return clean(parsed?.policyVersion) || null;
  } catch {
    return null;
  }
}

function nonNegativeInt(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function clean(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "undefined" || text === "null") return "";
  return text;
}
