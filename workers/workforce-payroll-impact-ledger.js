const AUTOMATIC_IMPACT_KINDS = new Set([
  "overtime",
  "attendance_deduction",
  "absence_deduction",
]);

export function buildCanonicalPayrollImpactLedger({ entry = null, impactRows = null, manualAdjustments = [] } = {}) {
  const employeeId = clean(entry?.employee_id);
  const monthKey = clean(entry?.month_key);
  const payrollEntryId = clean(entry?.id);
  const policyVersion = readPolicyVersion(entry?.calculation_snapshot_json);

  const rows = Array.isArray(impactRows)
    ? impactRows.map((row, index) => mapStoredImpact(row, { employeeId, monthKey, payrollEntryId, index })).filter(Boolean)
    : buildCompatibilityRows({ entry, manualAdjustments, employeeId, monthKey, payrollEntryId, policyVersion });

  const activeRows = rows.filter(row => row.status === "active" && row.amountHalalas > 0);
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
    payrollEntryId: payrollEntryId || clean(rows[0]?.payrollEntryId) || null,
    employeeId: employeeId || clean(rows[0]?.employeeId) || null,
    monthKey: monthKey || clean(rows[0]?.monthKey) || null,
    policyVersion: policyVersion || clean(rows.find(row => row.policyVersion)?.policyVersion) || null,
    rows,
    totals,
  };
}

export function isAutomaticPayrollImpactKind(kind) {
  return AUTOMATIC_IMPACT_KINDS.has(clean(kind));
}

function buildCompatibilityRows({ entry, manualAdjustments, employeeId, monthKey, payrollEntryId, policyVersion }) {
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
    const mapped = mapStoredImpact(adjustment, {
      employeeId,
      monthKey,
      payrollEntryId,
      index: rows.length,
      automatic: false,
    });
    if (mapped) rows.push(mapped);
  }
  return rows;
}

function mapStoredImpact(row, fallback = {}) {
  const kind = clean(row?.kind);
  const amountHalalas = nonNegativeInt(row?.amount_halalas ?? row?.amountHalalas);
  if (!kind) return null;
  const automatic = row?.automatic == null ? Boolean(fallback.automatic) : Number(row.automatic) === 1 || row.automatic === true;
  const status = clean(row?.status || "active") === "cancelled" || amountHalalas <= 0 ? "cancelled" : "active";
  return {
    id: clean(row?.id) || `${automatic ? "automatic" : "manual"}:${kind}:${fallback.index || 0}`,
    payrollEntryId: clean(row?.payroll_entry_id ?? row?.payrollEntryId) || fallback.payrollEntryId || null,
    employeeId: clean(row?.employee_id ?? row?.employeeId) || fallback.employeeId || null,
    monthKey: clean(row?.month_key ?? row?.monthKey) || fallback.monthKey || null,
    direction: clean(row?.direction) === "addition" ? "addition" : "deduction",
    kind,
    amountHalalas,
    reason: clean(row?.reason) || kind,
    note: clean(row?.note) || null,
    sourceType: clean(row?.source_type ?? row?.sourceType) || (automatic ? "payroll_readiness" : "manual"),
    sourceId: clean(row?.source_id ?? row?.sourceId) || clean(row?.id) || null,
    policyVersion: clean(row?.policy_version ?? row?.policyVersion) || null,
    status,
    automatic,
    canCancel: !automatic && status === "active",
    addedAt: clean(row?.added_at ?? row?.addedAt) || null,
    addedByEmail: clean(row?.added_by_email ?? row?.addedByEmail) || null,
  };
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
