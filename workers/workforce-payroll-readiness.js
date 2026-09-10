import { resolveWorkforceScheduleRange } from "./workforce-schedule-control.js";
import { classifyWorkforceDayRange } from "./workforce-day-state.js";

const POLICY_VERSION = "workforce-payroll-readiness-v1";
const MUTABLE_STATUSES = new Set(["draft"]);
const PAID_LEAVE_TYPES = new Set(["annual", "sick", "emergency", "rest", "weekly_rest_substitute", "other"]);
const EPSILON = 0.0001;

export async function handleWorkforcePayrollReadinessRequest({
  request,
  url,
  db,
  tenant,
  principal,
  sourceAdapter,
  routePrefix = "",
}) {
  const pathname = stripRoutePrefix(url?.pathname || "", routePrefix);
  const match = pathname.match(/^\/v1\/employees\/([^/]+)\/payroll-readiness$/);
  if (!match) return null;

  const employeeId = decodeURIComponent(match[1]);
  await requireEmployeeAccess(db, tenant.id, employeeId, principal);
  requireManager(principal);
  const monthKey = validMonth(url.searchParams.get("month") || currentMonthRiyadh());

  if (request.method === "GET") {
    const preview = await buildPayrollReadinessPreview({
      db,
      tenantId: tenant.id,
      employeeId,
      monthKey,
      sourceAdapter,
    });
    return json(200, { ok: true, preview });
  }

  if (request.method === "POST") {
    const preview = await buildPayrollReadinessPreview({
      db,
      tenantId: tenant.id,
      employeeId,
      monthKey,
      sourceAdapter,
    });
    if (preview.locked) throw httpError(409, "workforce_payroll_entry_locked");
    if (!preview.readiness.ready) {
      throw httpError(409, preview.readiness.code || "workforce_payroll_not_ready");
    }
    const result = await applyPayrollReadiness({
      db,
      tenantId: tenant.id,
      employeeId,
      monthKey,
      preview,
      principal,
    });
    return json(200, { ok: true, ...result });
  }

  return methodNotAllowed(["GET", "POST"]);
}

export function calculateWorkforcePayrollRates(input = {}) {
  const baseSalaryHalalas = nonNegativeInt(input.baseSalaryHalalas);
  const allowancesHalalas = nonNegativeInt(input.allowancesHalalas);
  const actualWageHalalas = baseSalaryHalalas + allowancesHalalas;
  const dailyNormalHours = positiveNumber(input.dailyNormalHours);
  const dailyRateHalalas = actualWageHalalas > 0 ? Math.round(actualWageHalalas / 30) : 0;
  const hourlyRateHalalas = dailyNormalHours > 0
    ? Math.round(dailyRateHalalas / dailyNormalHours)
    : 0;
  return {
    baseSalaryHalalas,
    allowancesHalalas,
    actualWageHalalas,
    dailyNormalHours,
    dailyRateHalalas,
    hourlyRateHalalas,
  };
}

export function evaluatePayrollAttendanceReadiness(input = {}) {
  const blockers = [];
  const add = (code, message, stage = "attendance") => {
    if (!blockers.some(item => item.code === code)) blockers.push({ stage, code, message });
  };

  if (input.employeeActive === false) {
    add("workforce_payroll_employee_not_active", "الموظف غير نشط أو انتهت خدمته.", "employment");
  }
  if (!input.settingsReady) {
    add("workforce_payroll_settings_required", "أكمل إعدادات الراتب قبل احتساب المسير.", "setup");
  }
  if (!(Number(input.baseSalaryHalalas || 0) > 0)) {
    add("workforce_payroll_base_salary_required", "الراتب الأساسي مطلوب قبل احتساب المسير.", "setup");
  }
  if (!(Number(input.workDaysPerMonth || 0) > 0)) {
    add("workforce_payroll_work_days_required", "عدد أيام العمل بالشهر مطلوب قبل احتساب المسير.", "setup");
  }
  if (input.periodStarted === false) {
    add("workforce_payroll_period_not_started", "فترة المسير لم تبدأ بعد.", "period");
  }

  const mode = clean(input.attendancePayrollMode) === "exempt" ? "exempt" : "required";
  if (mode === "exempt") {
    if (!clean(input.attendancePayrollExemptionReason)) {
      add(
        "workforce_payroll_attendance_exemption_reason_required",
        "لا يمكن اعتماد موظف مستثنى من الحضور بدون سبب استثناء موثق."
      );
    }
  } else {
    if (clean(input.attendanceLinkStatus) !== "confirmed") {
      add(
        "workforce_payroll_attendance_unconfirmed",
        "لم يتم تطبيق خصم الحضور لأن ربط البصمات غير مكتمل أو غير مؤكد."
      );
    }
    if (!input.sourceAvailable) {
      add("workforce_payroll_attendance_source_unavailable", "مصدر الحضور غير متاح للمسير.");
    }
    if (!input.scheduleReady) {
      add("workforce_payroll_schedule_not_ready", "يوجد يوم في فترة المسير بدون دوام محلول بشكل مؤكد.");
    }
    if (!(Number(input.dailyNormalHours || 0) > 0)) {
      add("workforce_payroll_daily_hours_required", "ساعات العمل اليومية مطلوبة لحساب الخصم بالساعة.", "setup");
    }
    if (Number(input.expectedAttendanceMinutes || 0) > 0 && Number(input.attendanceRecordCount || 0) <= 0) {
      add(
        "workforce_payroll_attendance_unconfirmed",
        "الحضور غير مربوط/غير مؤكد، لم يتم تطبيق خصم حضور تلقائي."
      );
    }
    if (Number(input.incompletePunchDays || 0) > 0) {
      add(
        "workforce_payroll_attendance_incomplete",
        `توجد ${Number(input.incompletePunchDays || 0)} يوم/أيام ببصمة ناقصة وتحتاج مراجعة.`
      );
    }
  }

  if (Number(input.conflictDays || 0) > 0) {
    add(
      "workforce_payroll_day_state_conflict",
      "يوجد تعارض بين الحضور والإجازة أو الغياب ويجب حله قبل احتساب الراتب.",
      "attendance"
    );
  }

  if (Number(input.manualReviewAbsenceDays || 0) > 0) {
    add(
      "workforce_payroll_absence_manual_review_required",
      "يوجد غياب مضبوط على مراجعة يدوية ويجب حسم معالجته قبل تطبيق الخصم.",
      "absence"
    );
  }

  return {
    ready: blockers.length === 0,
    code: blockers[0]?.code || "",
    message: blockers[0]?.message || "",
    attendancePayrollMode: mode,
    blockers,
  };
}

export function calculateWorkforcePayrollDeductions(input = {}) {
  const attendanceMissingMinutes = nonNegativeInt(input.attendanceMissingMinutes);
  const hourlyRateHalalas = nonNegativeInt(input.hourlyRateHalalas);
  const absenceUnits = nonNegativeNumber(input.absenceUnits);
  const dailyRateHalalas = nonNegativeInt(input.dailyRateHalalas);
  const unpaidPartialMinutes = nonNegativeInt(input.unpaidPartialMinutes);

  const attendanceDeductionHalalas = Math.round(attendanceMissingMinutes * hourlyRateHalalas / 60);
  const absenceDayDeductionHalalas = Math.round(absenceUnits * dailyRateHalalas);
  const absencePartialDeductionHalalas = Math.round(unpaidPartialMinutes * hourlyRateHalalas / 60);
  return {
    attendanceDeductionHalalas,
    absenceDeductionHalalas: absenceDayDeductionHalalas + absencePartialDeductionHalalas,
    absenceDayDeductionHalalas,
    absencePartialDeductionHalalas,
  };
}

async function buildPayrollReadinessPreview({ db, tenantId, employeeId, monthKey, sourceAdapter }) {
  const bounds = monthBounds(monthKey);
  const completedThrough = completedThroughDate(bounds);
  const periodStarted = Boolean(completedThrough && completedThrough >= bounds.start);

  const [employee, employment, settings, link, period, entry] = await Promise.all([
    db.prepare(`SELECT * FROM workforce_employee_profiles WHERE tenant_id = ? AND id = ? LIMIT 1`)
      .bind(tenantId, employeeId).first(),
    db.prepare(`SELECT * FROM workforce_employment WHERE tenant_id = ? AND employee_id = ? LIMIT 1`)
      .bind(tenantId, employeeId).first(),
    db.prepare(`SELECT * FROM workforce_payroll_settings WHERE tenant_id = ? AND employee_id = ? LIMIT 1`)
      .bind(tenantId, employeeId).first(),
    db.prepare(`SELECT * FROM workforce_attendance_links WHERE tenant_id = ? AND employee_id = ? LIMIT 1`)
      .bind(tenantId, employeeId).first(),
    db.prepare(`SELECT * FROM workforce_payroll_periods WHERE tenant_id = ? AND month_key = ? LIMIT 1`)
      .bind(tenantId, monthKey).first(),
    db.prepare(`SELECT * FROM workforce_payroll_entries WHERE tenant_id = ? AND employee_id = ? AND month_key = ? LIMIT 1`)
      .bind(tenantId, employeeId, monthKey).first(),
  ]);

  const employeeActive = clean(employee?.status) === "active" && clean(employment?.employment_status || "active") === "active";
  const attendanceMode = clean(settings?.attendance_payroll_mode) === "exempt" ? "exempt" : "required";
  const exemptionReason = clean(settings?.attendance_payroll_exemption_reason);
  const linkStatus = clean(link?.status) || "unlinked";
  const sourceAvailable = typeof sourceAdapter?.listAttendanceMonth === "function";

  let schedules = [];
  let leaves = [];
  let absences = [];
  let sourceRows = [];

  if (periodStarted) {
    const data = await Promise.all([
      resolveWorkforceScheduleRange(db, tenantId, employeeId, bounds.start, completedThrough),
      db.prepare(`SELECT * FROM workforce_leaves
                   WHERE tenant_id = ? AND employee_id = ? AND status = 'approved'
                     AND start_date <= ? AND end_date >= ?
                   ORDER BY start_date ASC, created_at ASC`)
        .bind(tenantId, employeeId, completedThrough, bounds.start).all(),
      db.prepare(`SELECT * FROM workforce_absences
                   WHERE tenant_id = ? AND employee_id = ? AND status = 'approved'
                     AND absence_date BETWEEN ? AND ?
                   ORDER BY absence_date ASC`)
        .bind(tenantId, employeeId, bounds.start, completedThrough).all(),
    ]);
    schedules = data[0] || [];
    leaves = data[1]?.results || [];
    absences = data[2]?.results || [];

    if (attendanceMode === "required" && linkStatus === "confirmed" && sourceAvailable) {
      sourceRows = await sourceAdapter.listAttendanceMonth(clean(link?.source_employee_id), monthKey);
    }
  }

  const scheduleReady = !periodStarted || attendanceMode === "exempt" || schedules.every(item => item?.ready === true);
  const derivedDailyHours = deriveDailyHours(settings, schedules);
  const allowancesHalalas = Number(settings?.housing_allowance_halalas || 0)
    + Number(settings?.transportation_allowance_halalas || 0)
    + Number(settings?.other_allowances_halalas || 0);
  const rates = calculateWorkforcePayrollRates({
    baseSalaryHalalas: settings?.base_salary_halalas,
    allowancesHalalas,
    dailyNormalHours: derivedDailyHours,
  });

  const dayResult = buildPayrollDays({
    bounds,
    completedThrough,
    employment,
    schedules,
    leaves,
    absences,
    sourceRows,
    attendanceMode,
  });
  const deductions = calculateWorkforcePayrollDeductions({
    attendanceMissingMinutes: dayResult.attendanceMissingMinutes,
    hourlyRateHalalas: rates.hourlyRateHalalas,
    absenceUnits: dayResult.absenceUnits,
    dailyRateHalalas: rates.dailyRateHalalas,
    unpaidPartialMinutes: dayResult.unpaidPartialMinutes,
  });

  const readiness = evaluatePayrollAttendanceReadiness({
    employeeActive,
    settingsReady: Boolean(settings),
    baseSalaryHalalas: settings?.base_salary_halalas,
    workDaysPerMonth: settings?.work_days_per_month,
    periodStarted,
    attendancePayrollMode: attendanceMode,
    attendancePayrollExemptionReason: exemptionReason,
    attendanceLinkStatus: linkStatus,
    sourceAvailable,
    scheduleReady,
    dailyNormalHours: derivedDailyHours,
    expectedAttendanceMinutes: dayResult.expectedAttendanceMinutes,
    attendanceRecordCount: dayResult.attendanceRecordCount,
    incompletePunchDays: dayResult.incompletePunchDays,
    manualReviewAbsenceDays: dayResult.manualReviewAbsenceDays,
    conflictDays: dayResult.conflictDays,
  });

  const locked = Boolean(
    (period && !MUTABLE_STATUSES.has(clean(period.status))) ||
    (entry && !MUTABLE_STATUSES.has(clean(entry.status)))
  );

  const manualTotals = entry?.id
    ? await activeManualTotals(db, tenantId, entry.id)
    : { additionsHalalas: 0, deductionsHalalas: 0 };
  const overtimeHalalas = Number(entry?.overtime_halalas || 0);
  const grossSalaryHalalas = rates.actualWageHalalas + overtimeHalalas + manualTotals.additionsHalalas;
  const totalDeductionsHalalas = deductions.attendanceDeductionHalalas
    + deductions.absenceDeductionHalalas
    + manualTotals.deductionsHalalas;
  const netSalaryHalalas = Math.max(0, grossSalaryHalalas - totalDeductionsHalalas);

  return {
    policyVersion: POLICY_VERSION,
    employeeId,
    monthKey,
    periodStart: bounds.start,
    periodEnd: bounds.end,
    completedThrough,
    locked,
    lockedReason: locked ? "payroll_entry_not_draft" : null,
    readiness,
    settings: {
      baseSalaryHalalas: rates.baseSalaryHalalas,
      allowancesHalalas: rates.allowancesHalalas,
      workDaysPerMonth: settings?.work_days_per_month == null ? null : Number(settings.work_days_per_month),
      dailyHours: settings?.daily_hours == null ? null : Number(settings.daily_hours),
      monthlyHours: settings?.monthly_hours == null ? null : Number(settings.monthly_hours),
      derivedDailyHours,
      deductionMethod: clean(settings?.deduction_method) || "hourly",
      attendancePayrollMode: attendanceMode,
      attendancePayrollExemptionReason: exemptionReason || null,
    },
    attendance: {
      linkStatus,
      sourceType: clean(link?.source_type) || null,
      scheduleReady,
      attendanceRecordCount: dayResult.attendanceRecordCount,
      incompletePunchDays: dayResult.incompletePunchDays,
      expectedAttendanceMinutes: dayResult.expectedAttendanceMinutes,
      attendanceMissingMinutes: dayResult.attendanceMissingMinutes,
      lateMinutes: dayResult.lateMinutes,
      earlyLeaveMinutes: dayResult.earlyLeaveMinutes,
      automaticAttendanceDeductionEligible: readiness.ready && attendanceMode === "required",
      automaticAttendanceDeductionApplied: false,
    },
    absences: {
      absenceUnits: roundUnits(dayResult.absenceUnits),
      unpaidPartialMinutes: dayResult.unpaidPartialMinutes,
      manualReviewAbsenceDays: dayResult.manualReviewAbsenceDays,
    },
    rates,
    deductions,
    manual: manualTotals,
    totals: {
      overtimeHalalas,
      grossSalaryHalalas,
      totalDeductionsHalalas,
      netSalaryHalalas,
    },
    days: dayResult.days,
  };
}

function buildPayrollDays({ bounds, completedThrough, employment, schedules, leaves, absences, sourceRows, attendanceMode }) {
  if (!completedThrough) return emptyDayResult();

  const canonicalDays = classifyWorkforceDayRange({
    from: bounds.start,
    to: completedThrough,
    today: completedThrough,
    employment,
    schedules,
    leaves,
    absences,
    sourceRows,
  });

  const days = [];
  let expectedAttendanceMinutes = 0;
  let attendanceMissingMinutes = 0;
  let attendanceRecordCount = 0;
  let incompletePunchDays = 0;
  let absenceUnits = 0;
  let unpaidPartialMinutes = 0;
  let manualReviewAbsenceDays = 0;
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let conflictDays = 0;

  for (const day of canonicalDays) {
    const hasRecord = Boolean(day.checkInAt || day.checkOutAt);

    if (!day.employmentEligible) {
      days.push({
        date: day.date,
        canonicalState: day.state,
        scheduleKind: clean(day.schedule?.kind) || "unassigned",
        scheduleReady: Boolean(day.schedule?.ready),
        isWorkingDay: Boolean(day.schedule?.isWorkingDay),
        scheduledMinutes: day.scheduledMinutes,
        expectedAttendanceMinutes: 0,
        paidExcusedMinutes: 0,
        attendanceMissingMinutes: 0,
        checkInAt: day.checkInAt,
        checkOutAt: day.checkOutAt,
        missingPunch: day.missingPunch,
        workedMinutes: day.workedMinutes,
        lateMinutes: day.lateMinutes,
        earlyLeaveMinutes: day.earlyLeaveMinutes,
        absenceUnits: 0,
        unpaidPartialMinutes: 0,
        absenceTreatment: day.absenceTreatment,
        leaveRefs: day.leaveRefs,
        conflicts: day.conflicts,
      });
      continue;
    }

    if (day.state === "conflict") conflictDays += 1;
    if (hasRecord) attendanceRecordCount += 1;
    if (day.missingPunch) incompletePunchDays += 1;
    lateMinutes += Number(day.lateMinutes || 0);
    earlyLeaveMinutes += Number(day.earlyLeaveMinutes || 0);

    let dayAbsenceUnits = 0;
    let dayUnpaidPartialMinutes = 0;

    if (day.absence) {
      const treatment = clean(day.absenceTreatment || "attendance_policy");
      if (treatment === "manual_review") {
        manualReviewAbsenceDays += Number(day.absencePortion || 0);
      } else if (treatment === "attendance_policy") {
        dayAbsenceUnits = Math.max(dayAbsenceUnits, Number(day.absencePortion || 0));
      }
    }

    for (const leave of day.leaveRefs || []) {
      if (leave.type !== "unpaid") continue;
      if (leave.duration === "full_day") {
        dayAbsenceUnits = Math.max(dayAbsenceUnits, 1);
      } else if (leave.duration === "half_day") {
        dayAbsenceUnits = Math.max(dayAbsenceUnits, 0.5);
      } else {
        dayUnpaidPartialMinutes += Number(leave.requestedMinutes || 0);
      }
    }

    let missingMinutes = 0;
    if (
      attendanceMode === "required" &&
      day.expectedAttendanceMinutes > 0 &&
      !day.missingPunch &&
      day.state !== "conflict"
    ) {
      if (!hasRecord) {
        missingMinutes = day.expectedAttendanceMinutes;
      } else if (day.workedMinutes != null) {
        missingMinutes = Math.max(0, day.expectedAttendanceMinutes - day.workedMinutes);
      } else {
        missingMinutes = Math.min(
          day.expectedAttendanceMinutes,
          Number(day.lateMinutes || 0) + Number(day.earlyLeaveMinutes || 0)
        );
      }
    }

    expectedAttendanceMinutes += Number(day.expectedAttendanceMinutes || 0);
    attendanceMissingMinutes += missingMinutes;
    absenceUnits += dayAbsenceUnits;
    unpaidPartialMinutes += dayUnpaidPartialMinutes;

    days.push({
      date: day.date,
      canonicalState: day.state,
      scheduleKind: clean(day.schedule?.kind) || "unassigned",
      scheduleReady: Boolean(day.schedule?.ready),
      isWorkingDay: Boolean(day.schedule?.isWorkingDay),
      scheduledMinutes: day.scheduledMinutes,
      expectedAttendanceMinutes: day.expectedAttendanceMinutes,
      paidExcusedMinutes: day.paidExcusedMinutes,
      attendanceMissingMinutes: Math.round(missingMinutes),
      checkInAt: day.checkInAt,
      checkOutAt: day.checkOutAt,
      missingPunch: day.missingPunch,
      workedMinutes: day.workedMinutes,
      lateMinutes: day.lateMinutes,
      earlyLeaveMinutes: day.earlyLeaveMinutes,
      absenceUnits: roundUnits(dayAbsenceUnits),
      unpaidPartialMinutes: dayUnpaidPartialMinutes,
      absenceTreatment: day.absenceTreatment,
      leaveRefs: day.leaveRefs,
      conflicts: day.conflicts,
    });
  }

  return {
    days,
    expectedAttendanceMinutes: Math.round(expectedAttendanceMinutes),
    attendanceMissingMinutes: Math.round(attendanceMissingMinutes),
    attendanceRecordCount,
    incompletePunchDays,
    absenceUnits: roundUnits(absenceUnits),
    unpaidPartialMinutes,
    manualReviewAbsenceDays: roundUnits(manualReviewAbsenceDays),
    lateMinutes,
    earlyLeaveMinutes,
    conflictDays,
  };
}
async function applyPayrollReadiness({ db, tenantId, employeeId, monthKey, preview, principal }) {
  const settings = await db
    .prepare(`SELECT * FROM workforce_payroll_settings WHERE tenant_id = ? AND employee_id = ? LIMIT 1`)
    .bind(tenantId, employeeId)
    .first();
  if (!settings) throw httpError(409, "workforce_payroll_settings_required");

  const [existingPeriod, existingEntry] = await Promise.all([
    db.prepare(`SELECT * FROM workforce_payroll_periods WHERE tenant_id = ? AND month_key = ? LIMIT 1`)
      .bind(tenantId, monthKey).first(),
    db.prepare(`SELECT * FROM workforce_payroll_entries WHERE tenant_id = ? AND employee_id = ? AND month_key = ? LIMIT 1`)
      .bind(tenantId, employeeId, monthKey).first(),
  ]);
  if ((existingPeriod && !MUTABLE_STATUSES.has(clean(existingPeriod.status))) ||
      (existingEntry && !MUTABLE_STATUSES.has(clean(existingEntry.status)))) {
    throw httpError(409, "workforce_payroll_entry_locked");
  }

  const bounds = monthBounds(monthKey);
  const periodId = existingPeriod?.id || `wf_payroll_period_${tenantId}_${monthKey}`;
  const entryId = existingEntry?.id || `wf_payroll_entry_${employeeId}_${monthKey}`;
  const now = nowIso();
  const manual = existingEntry?.id
    ? await activeManualTotals(db, tenantId, existingEntry.id)
    : { additionsHalalas: 0, deductionsHalalas: 0 };
  const overtimeHalalas = Number(existingEntry?.overtime_halalas || 0);
  const gross = preview.rates.actualWageHalalas + overtimeHalalas + manual.additionsHalalas;
  const totalDeductions = preview.deductions.attendanceDeductionHalalas
    + preview.deductions.absenceDeductionHalalas
    + manual.deductionsHalalas;
  const net = Math.max(0, gross - totalDeductions);

  const setupSnapshot = JSON.stringify({
    policyVersion: POLICY_VERSION,
    baseSalaryHalalas: preview.rates.baseSalaryHalalas,
    allowancesHalalas: preview.rates.allowancesHalalas,
    workDaysPerMonth: settings.work_days_per_month == null ? null : Number(settings.work_days_per_month),
    dailyHours: settings.daily_hours == null ? null : Number(settings.daily_hours),
    monthlyHours: settings.monthly_hours == null ? null : Number(settings.monthly_hours),
    derivedDailyHours: preview.settings.derivedDailyHours,
    deductionMethod: clean(settings.deduction_method) || "hourly",
    attendancePayrollMode: preview.readiness.attendancePayrollMode,
    attendancePayrollExemptionReason: clean(settings.attendance_payroll_exemption_reason) || null,
  });
  const attendanceSnapshot = JSON.stringify({
    policyVersion: POLICY_VERSION,
    completedThrough: preview.completedThrough,
    readiness: preview.readiness,
    attendance: { ...preview.attendance, automaticAttendanceDeductionApplied: true },
    absences: preview.absences,
    days: preview.days,
  });
  const calculationSnapshot = JSON.stringify({
    policyVersion: POLICY_VERSION,
    stage: "attendance_applied",
    appliedAt: now,
    dailyRateHalalas: preview.rates.dailyRateHalalas,
    hourlyRateHalalas: preview.rates.hourlyRateHalalas,
    attendanceDeductionHalalas: preview.deductions.attendanceDeductionHalalas,
    absenceDeductionHalalas: preview.deductions.absenceDeductionHalalas,
    manualAdditionsHalalas: manual.additionsHalalas,
    manualDeductionsHalalas: manual.deductionsHalalas,
    automaticAttendanceDeductionApplied: true,
  });

  const statements = [
    db.prepare(`INSERT INTO workforce_payroll_periods (
      id, tenant_id, month_key, period_start, period_end, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)
    ON CONFLICT(tenant_id, month_key) DO NOTHING`)
      .bind(periodId, tenantId, monthKey, bounds.start, bounds.end, now, now),
    db.prepare(`INSERT INTO workforce_payroll_entries (
      id, tenant_id, period_id, employee_id, month_key, status,
      base_salary_halalas, allowances_halalas,
      attendance_deduction_halalas, absence_deduction_halalas, overtime_halalas,
      manual_additions_halalas, manual_deductions_halalas,
      gross_salary_halalas, total_deductions_halalas, net_salary_halalas,
      attendance_snapshot_json, setup_snapshot_json, calculation_snapshot_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, employee_id, month_key) DO NOTHING`)
      .bind(
        entryId, tenantId, periodId, employeeId, monthKey,
        preview.rates.baseSalaryHalalas, preview.rates.allowancesHalalas,
        overtimeHalalas, manual.additionsHalalas, manual.deductionsHalalas,
        gross, manual.deductionsHalalas, Math.max(0, gross - manual.deductionsHalalas),
        attendanceSnapshot, setupSnapshot, calculationSnapshot, now, now
      ),
    db.prepare(`UPDATE workforce_payroll_entries
                   SET period_id = ?,
                       base_salary_halalas = ?, allowances_halalas = ?,
                       attendance_deduction_halalas = ?, absence_deduction_halalas = ?,
                       manual_additions_halalas = ?, manual_deductions_halalas = ?,
                       gross_salary_halalas = ?, total_deductions_halalas = ?, net_salary_halalas = ?,
                       attendance_snapshot_json = ?, setup_snapshot_json = ?, calculation_snapshot_json = ?,
                       updated_at = ?
                 WHERE tenant_id = ? AND employee_id = ? AND month_key = ? AND status = 'draft'`)
      .bind(
        periodId,
        preview.rates.baseSalaryHalalas,
        preview.rates.allowancesHalalas,
        preview.deductions.attendanceDeductionHalalas,
        preview.deductions.absenceDeductionHalalas,
        manual.additionsHalalas,
        manual.deductionsHalalas,
        gross,
        totalDeductions,
        net,
        attendanceSnapshot,
        setupSnapshot,
        calculationSnapshot,
        now,
        tenantId,
        employeeId,
        monthKey
      ),
    buildAuditStatement(db, {
      tenantId,
      principal,
      action: "workforce.payroll_readiness.apply",
      entityType: "payroll_entry",
      entityId: entryId,
      after: {
        employeeId,
        monthKey,
        attendanceDeductionHalalas: preview.deductions.attendanceDeductionHalalas,
        absenceDeductionHalalas: preview.deductions.absenceDeductionHalalas,
        automaticAttendanceDeductionApplied: true,
      },
      metadata: { policyVersion: POLICY_VERSION },
    }),
  ];

  await runBatch(db, statements);
  const entry = await db
    .prepare(`SELECT * FROM workforce_payroll_entries WHERE tenant_id = ? AND employee_id = ? AND month_key = ? LIMIT 1`)
    .bind(tenantId, employeeId, monthKey)
    .first();
  if (!entry) throw httpError(500, "workforce_payroll_entry_apply_failed");

  return {
    applied: true,
    entry: mapEntry(entry),
    preview: {
      ...preview,
      attendance: { ...preview.attendance, automaticAttendanceDeductionApplied: true },
      totals: {
        ...preview.totals,
        grossSalaryHalalas: gross,
        totalDeductionsHalalas: totalDeductions,
        netSalaryHalalas: net,
      },
    },
  };
}

async function activeManualTotals(db, tenantId, entryId) {
  const row = await db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN direction = 'addition' AND COALESCE(status, 'active') = 'active' THEN amount_halalas ELSE 0 END), 0) AS additions,
      COALESCE(SUM(CASE WHEN direction = 'deduction' AND COALESCE(status, 'active') = 'active' THEN amount_halalas ELSE 0 END), 0) AS deductions
    FROM workforce_payroll_adjustments
    WHERE tenant_id = ? AND payroll_entry_id = ?`)
    .bind(tenantId, entryId)
    .first();
  return {
    additionsHalalas: Number(row?.additions || 0),
    deductionsHalalas: Number(row?.deductions || 0),
  };
}

function deriveDailyHours(settings, schedules) {
  const configuredDaily = positiveNumber(settings?.daily_hours);
  if (configuredDaily > 0) return roundHours(configuredDaily);
  const workingMinutes = (schedules || [])
    .filter(item => item?.ready && item?.isWorkingDay)
    .map(item => shiftMinutes(item.startTime, item.endTime))
    .filter(value => value > 0);
  if (workingMinutes.length) {
    return roundHours(workingMinutes.reduce((sum, value) => sum + value, 0) / workingMinutes.length / 60);
  }
  const monthlyHours = positiveNumber(settings?.monthly_hours);
  const workDays = positiveNumber(settings?.work_days_per_month);
  if (monthlyHours > 0 && workDays > 0) return roundHours(monthlyHours / workDays);
  return 0;
}

function shiftMinutes(startValue, endValue) {
  const start = timeMinutes(startValue);
  let end = timeMinutes(endValue);
  if (start == null || end == null) return 0;
  if (end <= start) end += 24 * 60;
  return Math.max(0, end - start);
}

function timeMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clean(value));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function completedThroughDate(bounds) {
  const today = todayRiyadh();
  if (bounds.start > today) return null;
  if (bounds.end < today) return bounds.end;
  const previous = addDays(today, -1);
  return previous >= bounds.start ? previous : null;
}

function monthBounds(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${monthKey}-01`,
    end: `${monthKey}-${String(endDay).padStart(2, "0")}`,
  };
}

function dateKeys(from, to) {
  if (!from || !to || from > to) return [];
  const rows = [];
  let cursor = from;
  while (cursor <= to) {
    rows.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return rows;
}

function addDays(dateKey, delta) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + delta, 12));
  return date.toISOString().slice(0, 10);
}

function todayRiyadh() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function currentMonthRiyadh() {
  return todayRiyadh().slice(0, 7);
}

function validMonth(value) {
  const text = clean(value);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) throw httpError(400, "workforce_payroll_month_invalid");
  return text;
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
}

async function requireEmployeeAccess(db, tenantId, employeeId, principal) {
  const employee = await db
    .prepare(`SELECT id, account_uid, account_email FROM workforce_employee_profiles WHERE tenant_id = ? AND id = ? LIMIT 1`)
    .bind(tenantId, employeeId)
    .first();
  if (!employee) throw httpError(404, "workforce_employee_not_found");
  if (principal?.canManage) return employee;
  const sameUid = clean(principal?.uid) && clean(employee.account_uid) === clean(principal?.uid);
  const sameEmail = clean(principal?.email).toLowerCase()
    && clean(employee.account_email).toLowerCase() === clean(principal?.email).toLowerCase();
  if (!sameUid && !sameEmail) throw httpError(403, "workforce_employee_access_forbidden");
  return employee;
}

function requireManager(principal) {
  if (!principal?.canManage) throw httpError(403, "workforce_management_forbidden");
}

function mapEntry(row) {
  return {
    id: clean(row.id),
    monthKey: clean(row.month_key),
    status: clean(row.status),
    baseSalaryHalalas: Number(row.base_salary_halalas || 0),
    allowancesHalalas: Number(row.allowances_halalas || 0),
    attendanceDeductionHalalas: Number(row.attendance_deduction_halalas || 0),
    absenceDeductionHalalas: Number(row.absence_deduction_halalas || 0),
    overtimeHalalas: Number(row.overtime_halalas || 0),
    manualAdditionsHalalas: Number(row.manual_additions_halalas || 0),
    manualDeductionsHalalas: Number(row.manual_deductions_halalas || 0),
    grossSalaryHalalas: Number(row.gross_salary_halalas || 0),
    totalDeductionsHalalas: Number(row.total_deductions_halalas || 0),
    netSalaryHalalas: Number(row.net_salary_halalas || 0),
    updatedAt: clean(row.updated_at) || null,
  };
}

function buildAuditStatement(db, { tenantId, principal, action, entityType, entityId, after = null, metadata = null }) {
  return db.prepare(`INSERT INTO workforce_audit_events (
    id, tenant_id, actor_uid, actor_email, action, entity_type, entity_id,
    before_json, after_json, metadata_json, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`)
    .bind(
      id("wf_audit"), tenantId, principal?.uid || null, principal?.email || null,
      action, entityType, entityId || null,
      after == null ? null : JSON.stringify(after),
      metadata == null ? null : JSON.stringify(metadata),
      nowIso()
    );
}

async function runBatch(db, statements) {
  if (typeof db.batch !== "function") throw httpError(500, "workforce_batch_unavailable");
  await db.batch(statements);
}

function emptyDayResult() {
  return {
    days: [], expectedAttendanceMinutes: 0, attendanceMissingMinutes: 0,
    attendanceRecordCount: 0, incompletePunchDays: 0, absenceUnits: 0,
    unpaidPartialMinutes: 0, manualReviewAbsenceDays: 0, lateMinutes: 0, earlyLeaveMinutes: 0,
  };
}

function roundUnits(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}
function roundHours(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
function nonNegativeInt(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}
function nonNegativeNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}
function positiveNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}
function nullableInt(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
}
function nullable(value) {
  const text = clean(value);
  return text || null;
}
function clean(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "undefined" || text === "null") return "";
  return text;
}
function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}
function nowIso() {
  return new Date().toISOString();
}
function stripRoutePrefix(pathname, prefix) {
  const normalizedPrefix = clean(prefix).replace(/\/$/, "");
  if (!normalizedPrefix) return pathname || "/";
  return pathname.startsWith(normalizedPrefix)
    ? pathname.slice(normalizedPrefix.length) || "/"
    : pathname || "/";
}
function methodNotAllowed(allowed) {
  return new Response(JSON.stringify({ ok: false, message: "method_not_allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json; charset=utf-8", Allow: allowed.join(", ") },
  });
}
function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
