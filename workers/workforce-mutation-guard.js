import {
  assertPayrollSourceMutationAllowed,
  buildPayrollStaleStatements,
  monthKeysBetween,
  resolveWorkforceDayRange,
  resolveWorkforceEmployeeBySource,
} from "./workforce-day-state.js";

export async function prepareLeaveMutationGuard({
  db,
  tenantId,
  employeeId,
  sourceAdapter,
  fromDate,
  toDate,
  durationKind,
}) {
  await assertPayrollSourceMutationAllowed(db, tenantId, employeeId, fromDate, toDate);

  const days = await resolveMutationDays({
    db,
    tenantId,
    employeeId,
    sourceAdapter,
    fromDate,
    toDate,
  });

  for (const day of days) {
    if (!day.employmentEligible) {
      throw httpError(409, "workforce_employee_outside_service_period");
    }
    if (day.absence) {
      throw httpError(409, "workforce_leave_conflicts_with_absence");
    }
    if (Array.isArray(day.leaveRefs) && day.leaveRefs.length) {
      throw httpError(409, "workforce_leave_overlaps_existing_leave");
    }
    if (durationKind === "full_day" && (day.checkInAt || day.checkOutAt)) {
      throw httpError(409, "workforce_full_day_leave_conflicts_with_attendance");
    }
    if (
      (durationKind === "half_day" || durationKind === "partial") &&
      (!day.schedule?.ready || !day.schedule?.isWorkingDay)
    ) {
      throw httpError(409, "workforce_leave_requires_working_schedule");
    }
  }

  return {
    days,
    staleStatements: buildPayrollStaleStatements(db, {
      tenantId,
      employeeId,
      fromDate,
      toDate,
      reason: "leave_changed",
    }),
  };
}

export async function prepareAbsenceMutationGuard({
  db,
  tenantId,
  employeeId,
  sourceAdapter,
  absenceDate,
  dayPortion,
}) {
  await assertPayrollSourceMutationAllowed(db, tenantId, employeeId, absenceDate, absenceDate);

  const days = await resolveMutationDays({
    db,
    tenantId,
    employeeId,
    sourceAdapter,
    fromDate: absenceDate,
    toDate: absenceDate,
  });
  const day = days[0];

  if (!day?.employmentEligible) {
    throw httpError(409, "workforce_employee_outside_service_period");
  }
  if (!day.schedule?.ready || !day.schedule?.isWorkingDay) {
    throw httpError(409, "workforce_absence_requires_working_schedule");
  }
  if (Array.isArray(day.leaveRefs) && day.leaveRefs.length) {
    throw httpError(409, "workforce_absence_conflicts_with_leave");
  }
  if (day.absence) {
    throw httpError(409, "workforce_absence_already_exists");
  }
  if (dayPortion === "full_day" && (day.checkInAt || day.checkOutAt)) {
    throw httpError(409, "workforce_full_day_absence_conflicts_with_attendance");
  }

  return {
    day,
    staleStatements: buildPayrollStaleStatements(db, {
      tenantId,
      employeeId,
      fromDate: absenceDate,
      toDate: absenceDate,
      reason: "absence_changed",
    }),
  };
}

export async function prepareAttendanceMutationGuard({
  db,
  tenantId,
  sourceEmployeeId,
  attendanceDate,
  currentRecord = null,
  mutation = "clock",
}) {
  const employee = await resolveWorkforceEmployeeBySource(
    db,
    tenantId,
    sourceEmployeeId
  );
  if (!employee?.id) {
    throw httpError(409, "workforce_employee_link_not_ready");
  }

  await assertPayrollSourceMutationAllowed(
    db,
    tenantId,
    employee.id,
    attendanceDate,
    attendanceDate
  );

  const sourceRows = currentRecord
    ? [{
        date: currentRecord.attendance_date || attendanceDate,
        attendanceDate: currentRecord.attendance_date || attendanceDate,
        checkInAt: currentRecord.check_in_at || null,
        checkOutAt: currentRecord.check_out_at || null,
        status: currentRecord.attendance_status || null,
        lateMinutes: Number(currentRecord.late_minutes || 0),
        earlyLeaveMinutes: Number(currentRecord.early_leave_minutes || 0),
        workedMinutes: currentRecord.worked_minutes == null
          ? null
          : Number(currentRecord.worked_minutes),
      }]
    : [];

  const days = await resolveWorkforceDayRange({
    db,
    tenantId,
    employeeId: employee.id,
    from: attendanceDate,
    to: attendanceDate,
    sourceRows,
  });
  const day = days[0];

  if (!day?.employmentEligible) {
    throw httpError(409, "workforce_employee_outside_service_period");
  }

  if (mutation === "check_in") {
    if (day.absence && String(day.absence.day_portion || "full_day") === "full_day") {
      throw httpError(409, "workforce_clock_in_blocked_by_absence");
    }
    const fullLeave = Array.isArray(day.leaveRefs)
      && day.leaveRefs.some(item => String(item.duration_kind || "full_day") === "full_day");
    if (fullLeave) {
      throw httpError(409, "workforce_clock_in_blocked_by_leave");
    }
  }

  return {
    employeeId: employee.id,
    day,
    staleStatements: buildPayrollStaleStatements(db, {
      tenantId,
      employeeId: employee.id,
      fromDate: attendanceDate,
      toDate: attendanceDate,
      reason: `attendance_${mutation}_changed`,
    }),
  };
}

export async function preparePayrollUnlockGuard({
  db,
  tenantId,
  employeeId,
  fromDate,
  toDate,
  reason,
}) {
  await assertPayrollSourceMutationAllowed(db, tenantId, employeeId, fromDate, toDate);
  return buildPayrollStaleStatements(db, {
    tenantId,
    employeeId,
    fromDate,
    toDate,
    reason,
  });
}

async function resolveMutationDays({
  db,
  tenantId,
  employeeId,
  sourceAdapter,
  fromDate,
  toDate,
}) {
  const sourceRows = await loadSourceRowsForRange({
    db,
    tenantId,
    employeeId,
    sourceAdapter,
    fromDate,
    toDate,
  });

  return resolveWorkforceDayRange({
    db,
    tenantId,
    employeeId,
    from: fromDate,
    to: toDate,
    sourceRows,
  });
}

async function loadSourceRowsForRange({
  db,
  tenantId,
  employeeId,
  sourceAdapter,
  fromDate,
  toDate,
}) {
  if (typeof sourceAdapter?.listAttendanceMonth !== "function") return [];

  const link = await db
    .prepare(`SELECT source_employee_id, status
                FROM workforce_attendance_links
               WHERE tenant_id = ? AND employee_id = ?
               LIMIT 1`)
    .bind(tenantId, employeeId)
    .first();

  if (!link || clean(link.status) !== "confirmed" || !clean(link.source_employee_id)) {
    return [];
  }

  const rows = [];
  for (const monthKey of monthKeysBetween(fromDate, toDate)) {
    const monthRows = await sourceAdapter.listAttendanceMonth(
      clean(link.source_employee_id),
      monthKey
    );
    for (const row of monthRows || []) {
      const date = clean(row?.date || row?.attendanceDate || row?.attendance_date);
      if (date >= fromDate && date <= toDate) rows.push(row);
    }
  }
  return rows;
}

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
