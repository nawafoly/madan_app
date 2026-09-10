import { resolveWorkforceScheduleRange } from "./workforce-schedule-control.js";

const PAID_LEAVE_TYPES = new Set([
  "annual", "sick", "emergency", "rest", "weekly_rest_substitute", "other",
]);

export async function resolveWorkforceDayRange({
  db,
  tenantId,
  employeeId,
  from,
  to,
  sourceRows = [],
  today = currentDateRiyadh(),
}) {
  const [employment, schedules, leavesResult, absencesResult] = await Promise.all([
    db.prepare(`SELECT * FROM workforce_employment
                 WHERE tenant_id = ? AND employee_id = ? LIMIT 1`)
      .bind(tenantId, employeeId).first(),
    resolveWorkforceScheduleRange(db, tenantId, employeeId, from, to),
    db.prepare(`SELECT * FROM workforce_leaves
                 WHERE tenant_id = ? AND employee_id = ? AND status = 'approved'
                   AND start_date <= ? AND end_date >= ?
                 ORDER BY start_date ASC, created_at ASC`)
      .bind(tenantId, employeeId, to, from).all(),
    db.prepare(`SELECT * FROM workforce_absences
                 WHERE tenant_id = ? AND employee_id = ? AND status = 'approved'
                   AND absence_date BETWEEN ? AND ?
                 ORDER BY absence_date ASC, created_at ASC`)
      .bind(tenantId, employeeId, from, to).all(),
  ]);

  return classifyWorkforceDayRange({
    from,
    to,
    today,
    employment,
    schedules: schedules || [],
    leaves: leavesResult?.results || [],
    absences: absencesResult?.results || [],
    sourceRows,
  });
}

export function classifyWorkforceDayRange({
  from,
  to,
  today = currentDateRiyadh(),
  employment = null,
  schedules = [],
  leaves = [],
  absences = [],
  sourceRows = [],
}) {
  const scheduleByDate = new Map((schedules || []).map(row => [clean(row.date), row]));
  const absenceByDate = new Map();
  for (const row of absences || []) {
    const key = clean(row.absence_date);
    if (key && !absenceByDate.has(key)) absenceByDate.set(key, row);
  }

  const attendanceByDate = new Map();
  for (const row of sourceRows || []) {
    const key = clean(row.date || row.attendanceDate || row.attendance_date);
    if (key && !attendanceByDate.has(key)) attendanceByDate.set(key, row);
  }

  const leaveByDate = new Map();
  for (const leave of leaves || []) {
    if (clean(leave.status) !== "approved") continue;
    for (const date of dateKeys(
      maxDate(from, clean(leave.start_date)),
      minDate(to, clean(leave.end_date))
    )) {
      if (!leaveByDate.has(date)) leaveByDate.set(date, []);
      leaveByDate.get(date).push(leave);
    }
  }

  const serviceStart = clean(employment?.service_start_date);
  const serviceEnd = clean(employment?.service_end_date);
  const employmentStatus = clean(employment?.employment_status || "active");

  return dateKeys(from, to).map(date => {
    const schedule = scheduleByDate.get(date) || null;
    const attendance = attendanceByDate.get(date) || null;
    const abs = absenceByDate.get(date) || null;
    const dayLeaves = leaveByDate.get(date) || [];

    const beforeEmployment = Boolean(serviceStart && date < serviceStart);
    const afterEmployment = Boolean(serviceEnd && date > serviceEnd);
    const employmentInactive = employmentStatus === "terminated" && !serviceEnd;

    const scheduledMinutes = schedule?.ready && schedule?.isWorkingDay
      ? shiftMinutes(schedule.startTime, schedule.endTime)
      : 0;

    const checkInAt = nullable(attendance?.checkInAt ?? attendance?.check_in_at);
    const checkOutAt = nullable(attendance?.checkOutAt ?? attendance?.check_out_at);
    const workedMinutes = nullableInt(attendance?.workedMinutes ?? attendance?.worked_minutes);
    const lateMinutes = nonNegativeInt(attendance?.lateMinutes ?? attendance?.late_minutes);
    const earlyLeaveMinutes = nonNegativeInt(attendance?.earlyLeaveMinutes ?? attendance?.early_leave_minutes);
    const hasAttendance = Boolean(checkInAt || checkOutAt);
    const missingPunch = Boolean(checkInAt) !== Boolean(checkOutAt);

    let expectedMinutes = scheduledMinutes;
    let paidExcusedMinutes = 0;
    let unpaidLeaveMinutes = 0;
    let leavePortion = 0;
    let fullDayLeave = null;
    const leaveRefs = [];

    for (const leave of dayLeaves) {
      const duration = clean(leave.duration_kind || "full_day");
      const type = clean(leave.leave_type);
      let covered = 0;

      if (duration === "full_day") covered = scheduledMinutes;
      else if (duration === "half_day") covered = Math.round(scheduledMinutes / 2);
      else covered = Math.min(scheduledMinutes, nonNegativeInt(leave.requested_minutes));

      if (duration === "full_day") fullDayLeave = leave;
      leavePortion = Math.max(
        leavePortion,
        duration === "full_day" ? 1 : duration === "half_day" ? 0.5 :
          (scheduledMinutes > 0 ? covered / scheduledMinutes : 0)
      );

      expectedMinutes = Math.max(0, expectedMinutes - covered);
      if (type === "unpaid") unpaidLeaveMinutes += covered;
      else if (PAID_LEAVE_TYPES.has(type)) paidExcusedMinutes += covered;

      leaveRefs.push({
        id: clean(leave.id),
        type,
        duration,
        requestedMinutes: nonNegativeInt(leave.requested_minutes),
      });
    }

    let absencePortion = 0;
    let absenceTreatment = null;
    let absenceCoveredMinutes = 0;
    if (abs) {
      absencePortion = clean(abs.day_portion) === "half_day" ? 0.5 : 1;
      absenceTreatment = clean(abs.payroll_treatment || "attendance_policy");
      absenceCoveredMinutes = Math.round(scheduledMinutes * absencePortion);
      expectedMinutes = Math.max(0, expectedMinutes - absenceCoveredMinutes);
    }

    const fullDayAbsence = absencePortion === 1;
    const conflicts = [];
    if (fullDayLeave && abs) conflicts.push("leave_absence_conflict");
    if (fullDayLeave && hasAttendance) conflicts.push("leave_attendance_conflict");
    if (fullDayAbsence && hasAttendance) conflicts.push("absence_attendance_conflict");

    let state;
    if (beforeEmployment) state = "before_employment";
    else if (afterEmployment || employmentInactive) state = "after_employment";
    else if (conflicts.length) state = "conflict";
    else if (date > today) state = "future";
    else if (!schedule?.ready) state = "missing";
    else if (!schedule.isWorkingDay) state = "rest";
    else if (fullDayLeave) state = "leave";
    else if (fullDayAbsence) state = "absence";
    else if (missingPunch) state = "incomplete";
    else if (hasAttendance) {
      state = lateMinutes > 0 && earlyLeaveMinutes > 0
        ? "late_early_leave"
        : lateMinutes > 0
          ? "late"
          : earlyLeaveMinutes > 0
            ? "early_leave"
            : "present";
    } else if (date < today) {
      state = expectedMinutes > 0 ? "absence" : (dayLeaves.length ? "leave" : abs ? "absence" : "rest");
    } else {
      state = "work";
    }

    return {
      date,
      state,
      employmentEligible: !beforeEmployment && !afterEmployment && !employmentInactive,
      serviceStartDate: serviceStart || null,
      serviceEndDate: serviceEnd || null,
      schedule,
      scheduledMinutes,
      expectedAttendanceMinutes: Math.round(expectedMinutes),
      paidExcusedMinutes: Math.round(paidExcusedMinutes),
      unpaidLeaveMinutes: Math.round(unpaidLeaveMinutes),
      leavePortion: round4(leavePortion),
      leaveRefs,
      absence: abs || null,
      absencePortion,
      absenceTreatment,
      absenceCoveredMinutes,
      attendance: attendance || null,
      checkInAt,
      checkOutAt,
      workedMinutes,
      lateMinutes,
      earlyLeaveMinutes,
      missingPunch,
      conflicts,
    };
  });
}


export async function resolveWorkforceEmployeeBySource(db, tenantId, sourceEmployeeId) {
  const sourceId = clean(sourceEmployeeId);
  if (!sourceId) return null;
  return db.prepare(`SELECT p.*, e.service_start_date, e.service_end_date, e.employment_status,
                            l.status AS attendance_link_status
                       FROM workforce_attendance_links l
                       JOIN workforce_employee_profiles p
                         ON p.tenant_id = l.tenant_id AND p.id = l.employee_id
                       LEFT JOIN workforce_employment e
                         ON e.tenant_id = p.tenant_id AND e.employee_id = p.id
                      WHERE l.tenant_id = ? AND l.source_employee_id = ?
                      LIMIT 1`)
    .bind(tenantId, sourceId)
    .first();
}

export async function assertPayrollSourceMutationAllowed(db, tenantId, employeeId, fromDate, toDate = fromDate) {
  const months = monthKeysBetween(fromDate, toDate);
  if (!months.length) return { locked: false, months: [] };
  const placeholders = months.map(() => "?").join(",");
  const result = await db.prepare(
    `SELECT month_key, status
       FROM workforce_payroll_entries
      WHERE tenant_id = ? AND employee_id = ?
        AND month_key IN (${placeholders})
        AND status IN ('reviewed', 'approved', 'paid')
      ORDER BY month_key ASC
      LIMIT 1`
  ).bind(tenantId, employeeId, ...months).first();

  if (result) {
    throw httpError(409, "workforce_payroll_period_locked");
  }
  return { locked: false, months };
}

export function buildPayrollStaleStatements(db, {
  tenantId,
  employeeId,
  fromDate,
  toDate = fromDate,
  reason = "source_changed",
  now = new Date().toISOString(),
}) {
  const months = monthKeysBetween(fromDate, toDate);
  if (!months.length) return [];
  const placeholders = months.map(() => "?").join(",");
  return [
    db.prepare(
      `UPDATE workforce_payroll_entries
          SET calculation_snapshot_json =
                CASE
                  WHEN calculation_snapshot_json IS NULL OR json_valid(calculation_snapshot_json) = 0
                    THEN json_object('stage', 'stale', 'staleAt', ?, 'staleReason', ?)
                  ELSE json_set(calculation_snapshot_json,
                                '$.stage', 'stale',
                                '$.staleAt', ?,
                                '$.staleReason', ?)
                END,
              updated_at = ?
        WHERE tenant_id = ? AND employee_id = ?
          AND month_key IN (${placeholders})
          AND status = 'draft'`
    ).bind(now, reason, now, reason, now, tenantId, employeeId, ...months),
  ];
}

export function monthKeysBetween(fromDate, toDate = fromDate) {
  const from = clean(fromDate);
  const to = clean(toDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return [];
  const out = [];
  let [year, month] = from.slice(0, 7).split("-").map(Number);
  const end = to.slice(0, 7);
  while (true) {
    const key = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
    out.push(key);
    if (key === end) break;
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

export function assertWorkforceDayMutationAllowed(day, mutation = "attendance") {
  if (!day?.employmentEligible) {
    throw httpError(409, "workforce_employee_outside_service_period");
  }
  if (day?.conflicts?.length) {
    throw httpError(409, "workforce_day_state_conflict");
  }
  if (mutation === "attendance") {
    const fullLeave = day.leaveRefs?.some(item => item.duration === "full_day");
    if (fullLeave) throw httpError(409, "workforce_full_day_leave_blocks_attendance");
    if (Number(day.absencePortion || 0) >= 1) {
      throw httpError(409, "workforce_full_day_absence_blocks_attendance");
    }
    if (!day.schedule?.ready) throw httpError(409, "workforce_schedule_not_ready");
    if (!day.schedule?.isWorkingDay) throw httpError(409, "workforce_non_working_day");
  }
  return true;
}

export function summarizeWorkforceDays(days = []) {
  return days.reduce((out, day) => {
    if (day.checkInAt || day.checkOutAt) out.daysWithRecords += 1;
    if (day.lateMinutes > 0) out.lateDays += 1;
    out.lateMinutes += Number(day.lateMinutes || 0);
    if (day.earlyLeaveMinutes > 0) out.earlyLeaveDays += 1;
    out.earlyLeaveMinutes += Number(day.earlyLeaveMinutes || 0);
    if (day.missingPunch) out.missingPunchDays += 1;
    if (day.state === "absence") out.absenceDays += 1;
    if (day.state === "absence" && day.absence) out.explicitAbsenceDays += 1;
    if (day.state === "leave") out.leaveDays += 1;
    if (day.state === "rest") out.restDays += 1;
    if (day.state === "missing") out.missingDays += 1;
    if (day.state === "conflict") out.conflictDays += 1;
    out.expectedAttendanceMinutes += Number(day.expectedAttendanceMinutes || 0);
    out.workedMinutes += Number(day.workedMinutes || 0);
    return out;
  }, {
    daysWithRecords: 0,
    lateDays: 0,
    lateMinutes: 0,
    earlyLeaveDays: 0,
    earlyLeaveMinutes: 0,
    missingPunchDays: 0,
    absenceDays: 0,
    explicitAbsenceDays: 0,
    leaveDays: 0,
    restDays: 0,
    missingDays: 0,
    conflictDays: 0,
    expectedAttendanceMinutes: 0,
    workedMinutes: 0,
  });
}

function shiftMinutes(startValue, endValue) {
  const start = timeMinutes(startValue);
  let end = timeMinutes(endValue);
  if (start == null || end == null) return 0;
  if (end <= start) end += 1440;
  return end - start;
}

function timeMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clean(value));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function dateKeys(from, to) {
  if (!from || !to || from > to) return [];
  const out = [];
  let cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return out;
}

function currentDateRiyadh() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function maxDate(a, b) { return !a ? b : !b ? a : (a > b ? a : b); }
function minDate(a, b) { return !a ? b : !b ? a : (a < b ? a : b); }
function nullable(value) { const v = clean(value); return v || null; }
function nullableInt(value) { return value == null || value === "" ? null : Math.max(0, Math.trunc(Number(value) || 0)); }
function nonNegativeInt(value) { return Math.max(0, Math.trunc(Number(value) || 0)); }
function round4(value) { return Math.round((Number(value) || 0) * 10000) / 10000; }
function clean(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "undefined" || text === "null") return "";
  return text;
}
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.code = message;
  return error;
}
