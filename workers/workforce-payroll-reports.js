const REPORT_VERSION = "workforce-payroll-report-v1";
const PAYROLL_STATUSES = new Set(["draft", "reviewed", "approved", "paid"]);

export async function handleWorkforcePayrollReportsRequest({ request, url, db, tenant, principal, routePrefix = "" }) {
  const pathname = stripRoutePrefix(url?.pathname || "", routePrefix);
  const individual = pathname.match(/^\/v1\/employees\/([^/]+)\/monthly-payroll-report$/);
  const overall = pathname === "/v1/payroll/reports/monthly";
  if (!individual && !overall) return null;
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  requireManager(principal);
  const monthKey = validMonth(url.searchParams.get("month") || currentMonthRiyadh());

  if (individual) {
    const employeeId = decodeURIComponent(individual[1]);
    return json(200, { ok: true, report: await buildEmployeeMonthlyReport(db, tenant.id, employeeId, monthKey) });
  }
  return json(200, { ok: true, report: await buildOverallMonthlyReport(db, tenant.id, monthKey) });
}

async function buildEmployeeMonthlyReport(db, tenantId, employeeId, monthKey) {
  const row = await db.prepare(`SELECT
      p.id AS employee_id, p.employee_number, p.display_name, p.job_title, p.status AS employee_status,
      e.service_start_date, e.service_end_date, e.employment_status, e.department, e.location_id,
      s.base_salary_halalas AS setting_base_salary_halalas,
      s.housing_allowance_halalas, s.transportation_allowance_halalas, s.other_allowances_halalas,
      s.work_days_per_month, s.daily_hours, s.monthly_hours, s.deduction_method,
      s.attendance_payroll_mode, s.attendance_payroll_exemption_reason,
      al.status AS attendance_link_status, al.source_type AS attendance_source_type,
      pe.id AS entry_id, pe.status AS entry_status, pe.base_salary_halalas, pe.allowances_halalas,
      pe.attendance_deduction_halalas, pe.absence_deduction_halalas, pe.overtime_halalas,
      pe.manual_additions_halalas, pe.manual_deductions_halalas, pe.gross_salary_halalas,
      pe.total_deductions_halalas, pe.net_salary_halalas, pe.attendance_snapshot_json,
      pe.setup_snapshot_json, pe.calculation_snapshot_json, pe.notes,
      pe.reviewed_at AS entry_reviewed_at, pe.approved_at AS entry_approved_at, pe.paid_at AS entry_paid_at,
      pe.created_at AS entry_created_at, pe.updated_at AS entry_updated_at,
      pp.id AS period_id, pp.status AS period_status, pp.period_start, pp.period_end, pp.pay_date,
      pp.reviewed_at AS period_reviewed_at, pp.approved_at AS period_approved_at, pp.paid_at AS period_paid_at
    FROM workforce_employee_profiles p
    LEFT JOIN workforce_employment e ON e.tenant_id=p.tenant_id AND e.employee_id=p.id
    LEFT JOIN workforce_payroll_settings s ON s.tenant_id=p.tenant_id AND s.employee_id=p.id
    LEFT JOIN workforce_attendance_links al ON al.tenant_id=p.tenant_id AND al.employee_id=p.id
    LEFT JOIN workforce_payroll_entries pe ON pe.tenant_id=p.tenant_id AND pe.employee_id=p.id AND pe.month_key=?
    LEFT JOIN workforce_payroll_periods pp ON pp.tenant_id=p.tenant_id AND pp.id=pe.period_id
    WHERE p.tenant_id=? AND p.id=? LIMIT 1`)
    .bind(monthKey, tenantId, employeeId).first();
  if (!row) throw httpError(404, "workforce_employee_not_found");

  let adjustments = [];
  if (row.entry_id) {
    const result = await db.prepare(`SELECT id, direction, kind, amount_halalas, reason, note, source_type, status,
        added_at, added_by_email, cancelled_at, cancelled_by_email
      FROM workforce_payroll_adjustments
      WHERE tenant_id=? AND payroll_entry_id=?
      ORDER BY added_at ASC, id ASC`)
      .bind(tenantId, row.entry_id).all();
    adjustments = (result?.results || []).map(mapAdjustment);
  }
  return mapEmployeeReport(row, monthKey, adjustments);
}

async function buildOverallMonthlyReport(db, tenantId, monthKey) {
  const result = await db.prepare(`SELECT
      p.id AS employee_id, p.employee_number, p.display_name, p.job_title, p.status AS employee_status,
      e.service_start_date, e.employment_status, e.department,
      s.attendance_payroll_mode,
      al.status AS attendance_link_status,
      pe.id AS entry_id, pe.status AS entry_status, pe.base_salary_halalas, pe.allowances_halalas,
      pe.attendance_deduction_halalas, pe.absence_deduction_halalas, pe.overtime_halalas,
      pe.manual_additions_halalas, pe.manual_deductions_halalas, pe.gross_salary_halalas,
      pe.total_deductions_halalas, pe.net_salary_halalas, pe.attendance_snapshot_json,
      pe.calculation_snapshot_json, pe.notes, pe.reviewed_at AS entry_reviewed_at,
      pe.approved_at AS entry_approved_at, pe.paid_at AS entry_paid_at,
      pp.status AS period_status, pp.pay_date
    FROM workforce_employee_profiles p
    LEFT JOIN workforce_employment e ON e.tenant_id=p.tenant_id AND e.employee_id=p.id
    LEFT JOIN workforce_payroll_settings s ON s.tenant_id=p.tenant_id AND s.employee_id=p.id
    LEFT JOIN workforce_attendance_links al ON al.tenant_id=p.tenant_id AND al.employee_id=p.id
    LEFT JOIN workforce_payroll_entries pe ON pe.tenant_id=p.tenant_id AND pe.employee_id=p.id AND pe.month_key=?
    LEFT JOIN workforce_payroll_periods pp ON pp.tenant_id=p.tenant_id AND pp.id=pe.period_id
    WHERE p.tenant_id=? AND (p.status='active' OR pe.id IS NOT NULL)
    ORDER BY p.display_name COLLATE NOCASE, p.id`)
    .bind(monthKey, tenantId).all();

  const employees = (result?.results || []).map(row => mapOverallEmployee(row, monthKey));
  const totals = employees.reduce((acc, item) => {
    acc.baseSalaryHalalas += item.baseSalaryHalalas;
    acc.allowancesHalalas += item.allowancesHalalas;
    acc.attendanceDeductionHalalas += item.attendanceDeductionHalalas;
    acc.absenceDeductionHalalas += item.absenceDeductionHalalas;
    acc.overtimeHalalas += item.overtimeHalalas;
    acc.manualAdditionsHalalas += item.manualAdditionsHalalas;
    acc.manualDeductionsHalalas += item.manualDeductionsHalalas;
    acc.grossSalaryHalalas += item.grossSalaryHalalas;
    acc.totalDeductionsHalalas += item.totalDeductionsHalalas;
    acc.netSalaryHalalas += item.netSalaryHalalas;
    acc.expectedAttendanceMinutes += item.attendance.expectedAttendanceMinutes;
    acc.attendanceMissingMinutes += item.attendance.attendanceMissingMinutes;
    acc.lateMinutes += item.attendance.lateMinutes;
    acc.earlyLeaveMinutes += item.attendance.earlyLeaveMinutes;
    acc.absenceUnits += item.absences.absenceUnits;
    acc.statusCounts[item.status] = (acc.statusCounts[item.status] || 0) + 1;
    return acc;
  }, {
    employeeCount: employees.length,
    baseSalaryHalalas: 0, allowancesHalalas: 0, attendanceDeductionHalalas: 0,
    absenceDeductionHalalas: 0, overtimeHalalas: 0, manualAdditionsHalalas: 0,
    manualDeductionsHalalas: 0, grossSalaryHalalas: 0, totalDeductionsHalalas: 0,
    netSalaryHalalas: 0, expectedAttendanceMinutes: 0, attendanceMissingMinutes: 0,
    lateMinutes: 0, earlyLeaveMinutes: 0, absenceUnits: 0,
    statusCounts: { not_generated: 0, draft: 0, reviewed: 0, approved: 0, paid: 0 },
  });
  totals.absenceUnits = roundUnits(totals.absenceUnits);
  return { reportVersion: REPORT_VERSION, monthKey, generatedAt: nowIso(), employees, totals };
}

function mapEmployeeReport(row, monthKey, adjustments) {
  const attendanceSnapshot = parseJson(row.attendance_snapshot_json);
  const setupSnapshot = parseJson(row.setup_snapshot_json);
  const calculationSnapshot = parseJson(row.calculation_snapshot_json);
  const attendance = snapshotAttendance(attendanceSnapshot, row);
  const absences = snapshotAbsences(attendanceSnapshot);
  const activeAdjustments = adjustments.filter(item => item.status !== "cancelled");
  return {
    reportVersion: REPORT_VERSION,
    monthKey,
    generatedAt: nowIso(),
    generated: Boolean(row.entry_id),
    employee: {
      id: clean(row.employee_id), employeeNumber: nullable(row.employee_number), displayName: clean(row.display_name),
      jobTitle: nullable(row.job_title), employeeStatus: clean(row.employee_status), department: nullable(row.department),
      locationId: nullable(row.location_id), serviceStartDate: nullable(row.service_start_date),
      serviceEndDate: nullable(row.service_end_date), employmentStatus: nullable(row.employment_status),
    },
    setup: {
      baseSalaryHalalas: number(row.setting_base_salary_halalas ?? setupSnapshot.baseSalaryHalalas),
      housingAllowanceHalalas: number(row.housing_allowance_halalas),
      transportationAllowanceHalalas: number(row.transportation_allowance_halalas),
      otherAllowancesHalalas: number(row.other_allowances_halalas),
      workDaysPerMonth: nullableNumber(row.work_days_per_month), dailyHours: nullableNumber(row.daily_hours),
      monthlyHours: nullableNumber(row.monthly_hours), deductionMethod: nullable(row.deduction_method),
      attendancePayrollMode: clean(row.attendance_payroll_mode || "required"),
      attendancePayrollExemptionReason: nullable(row.attendance_payroll_exemption_reason),
    },
    attendanceLink: { status: clean(row.attendance_link_status || "unlinked"), sourceType: nullable(row.attendance_source_type) },
    attendance,
    absences,
    payroll: mapPayrollValues(row),
    lifecycle: {
      status: payrollStatus(row.entry_status), periodStatus: payrollStatus(row.period_status), payDate: nullable(row.pay_date),
      reviewedAt: nullable(row.entry_reviewed_at), approvedAt: nullable(row.entry_approved_at), paidAt: nullable(row.entry_paid_at),
      periodStart: nullable(row.period_start), periodEnd: nullable(row.period_end),
    },
    readiness: attendanceSnapshot?.readiness || null,
    calculation: calculationSnapshot || null,
    adjustments,
    activeAdjustments,
    notes: nullable(row.notes),
  };
}

function mapOverallEmployee(row, monthKey) {
  const attendanceSnapshot = parseJson(row.attendance_snapshot_json);
  return {
    employeeId: clean(row.employee_id), employeeNumber: nullable(row.employee_number), displayName: clean(row.display_name),
    jobTitle: nullable(row.job_title), department: nullable(row.department), serviceStartDate: nullable(row.service_start_date),
    employmentStatus: nullable(row.employment_status), monthKey, generated: Boolean(row.entry_id),
    status: payrollStatus(row.entry_status), periodStatus: payrollStatus(row.period_status), payDate: nullable(row.pay_date),
    readiness: attendanceSnapshot?.readiness || null,
    attendanceLinkStatus: clean(row.attendance_link_status || "unlinked"),
    attendancePayrollMode: clean(row.attendance_payroll_mode || "required"),
    attendance: snapshotAttendance(attendanceSnapshot, row), absences: snapshotAbsences(attendanceSnapshot),
    ...mapPayrollValues(row),
    reviewedAt: nullable(row.entry_reviewed_at), approvedAt: nullable(row.entry_approved_at), paidAt: nullable(row.entry_paid_at),
    notes: nullable(row.notes),
  };
}

function mapPayrollValues(row) {
  return {
    baseSalaryHalalas: number(row.base_salary_halalas), allowancesHalalas: number(row.allowances_halalas),
    attendanceDeductionHalalas: number(row.attendance_deduction_halalas), absenceDeductionHalalas: number(row.absence_deduction_halalas),
    overtimeHalalas: number(row.overtime_halalas), manualAdditionsHalalas: number(row.manual_additions_halalas),
    manualDeductionsHalalas: number(row.manual_deductions_halalas), grossSalaryHalalas: number(row.gross_salary_halalas),
    totalDeductionsHalalas: number(row.total_deductions_halalas), netSalaryHalalas: number(row.net_salary_halalas),
  };
}

function snapshotAttendance(snapshot, row) {
  const value = snapshot?.attendance || {};
  return {
    linkStatus: clean(value.linkStatus || row.attendance_link_status || "unlinked"),
    scheduleReady: value.scheduleReady === true,
    attendanceRecordCount: number(value.attendanceRecordCount), incompletePunchDays: number(value.incompletePunchDays),
    expectedAttendanceMinutes: number(value.expectedAttendanceMinutes), attendanceMissingMinutes: number(value.attendanceMissingMinutes),
    lateMinutes: number(value.lateMinutes), earlyLeaveMinutes: number(value.earlyLeaveMinutes),
    automaticAttendanceDeductionApplied: value.automaticAttendanceDeductionApplied === true,
    completedThrough: nullable(snapshot?.completedThrough),
  };
}

function snapshotAbsences(snapshot) {
  const value = snapshot?.absences || {};
  return {
    absenceUnits: roundUnits(value.absenceUnits), unpaidPartialMinutes: number(value.unpaidPartialMinutes),
    manualReviewAbsenceDays: roundUnits(value.manualReviewAbsenceDays),
  };
}

function mapAdjustment(row) {
  return {
    id: clean(row.id), direction: clean(row.direction), kind: clean(row.kind), amountHalalas: number(row.amount_halalas),
    reason: clean(row.reason), note: nullable(row.note), sourceType: nullable(row.source_type), status: clean(row.status || "active"),
    addedAt: nullable(row.added_at), addedByEmail: nullable(row.added_by_email),
    cancelledAt: nullable(row.cancelled_at), cancelledByEmail: nullable(row.cancelled_by_email),
  };
}

function validMonth(value) {
  const text = clean(value);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) throw httpError(400, "workforce_payroll_month_invalid");
  return text;
}
function currentMonthRiyadh() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit" }).format(new Date());
}
function payrollStatus(value) {
  const status = clean(value);
  return PAYROLL_STATUSES.has(status) ? status : "not_generated";
}
function parseJson(value) { try { return value ? JSON.parse(String(value)) : {}; } catch { return {}; } }
function number(value) { const n = Number(value || 0); return Number.isFinite(n) ? n : 0; }
function nullableNumber(value) { if (value == null || value === "") return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
function roundUnits(value) { return Math.round(number(value) * 1000) / 1000; }
function clean(value) { const text = String(value ?? "").trim(); return !text || text === "undefined" || text === "null" ? "" : text; }
function nullable(value) { const text = clean(value); return text || null; }
function nowIso() { return new Date().toISOString(); }
function stripRoutePrefix(pathname, prefix) { const p = clean(prefix).replace(/\/$/, ""); return p && pathname.startsWith(p) ? pathname.slice(p.length) || "/" : pathname || "/"; }
function requireManager(principal) { if (!principal?.canManage) throw httpError(403, "workforce_management_forbidden"); }
function methodNotAllowed(methods) { return json(405, { ok: false, message: "method_not_allowed", allowed: methods }); }
function json(status, payload) { return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json; charset=utf-8" } }); }
function httpError(status, message) { const error = new Error(message); error.status = status; error.code = message; return error; }
