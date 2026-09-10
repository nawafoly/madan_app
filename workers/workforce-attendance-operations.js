import { resolveWorkforceDayRange, summarizeWorkforceDays } from "./workforce-day-state.js";

export async function handleWorkforceAttendanceOperationsRequest({
  request,
  url,
  db,
  tenant,
  principal,
  sourceAdapter,
  routePrefix = "",
}) {
  const pathname = stripRoutePrefix(url?.pathname || "", routePrefix);
  const match = pathname.match(/^\/v1\/employees\/([^/]+)\/attendance-operations$/);
  if (!match) return null;
  if (request.method !== "GET") return methodNotAllowed(["GET"]);

  const employeeId = decodeURIComponent(match[1]);
  await requireEmployeeAccess(db, tenant.id, employeeId, principal);
  const monthKey = validMonth(url.searchParams.get("month") || currentMonthRiyadh());

  const link = await db
    .prepare(`SELECT * FROM workforce_attendance_links
               WHERE tenant_id = ? AND employee_id = ? LIMIT 1`)
    .bind(tenant.id, employeeId)
    .first();

  if (!link) {
    return json(200, {
      ok: true,
      monthKey,
      readiness: { ready: false, status: "unlinked", reason: "attendance_link_missing" },
      summary: emptySummary(),
      days: [],
    });
  }

  const linkStatus = clean(link.status) || "unlinked";
  if (linkStatus === "exempt") {
    return json(200, {
      ok: true,
      monthKey,
      readiness: { ready: true, status: "exempt", reason: clean(link.exemption_reason) || null },
      summary: emptySummary(),
      days: [],
    });
  }

  if (linkStatus !== "confirmed") {
    return json(200, {
      ok: true,
      monthKey,
      readiness: { ready: false, status: linkStatus, reason: "attendance_link_not_confirmed" },
      summary: emptySummary(),
      days: [],
    });
  }

  if (typeof sourceAdapter?.listAttendanceMonth !== "function") {
    return json(501, { ok: false, message: "workforce_attendance_source_unavailable" });
  }

  const { fromDate, lastDate } = monthBounds(monthKey);
  const sourceRows = await sourceAdapter.listAttendanceMonth(clean(link.source_employee_id), monthKey);
  const canonicalDays = await resolveWorkforceDayRange({
    db,
    tenantId: tenant.id,
    employeeId,
    from: fromDate,
    to: lastDate,
    sourceRows,
  });

  const days = canonicalDays.map(day => ({
    date: day.date,
    state: day.state,
    checkInAt: day.checkInAt,
    checkOutAt: day.checkOutAt,
    status: day.state,
    lateMinutes: day.lateMinutes,
    earlyLeaveMinutes: day.earlyLeaveMinutes,
    workedMinutes: day.workedMinutes,
    missingPunch: day.missingPunch,
    schedule: day.schedule,
    scheduledMinutes: day.scheduledMinutes,
    expectedAttendanceMinutes: day.expectedAttendanceMinutes,
    paidExcusedMinutes: day.paidExcusedMinutes,
    leaveRefs: day.leaveRefs,
    explicitAbsence: day.absence ? {
      id: day.absence.id,
      dayPortion: day.absence.day_portion,
      status: day.absence.status,
      payrollTreatment: day.absence.payroll_treatment,
      reason: day.absence.reason || null,
    } : null,
    conflicts: day.conflicts,
    employmentEligible: day.employmentEligible,
  }));

  return json(200, {
    ok: true,
    monthKey,
    readiness: {
      ready: !days.some(day => day.state === "conflict"),
      status: days.some(day => day.state === "conflict") ? "conflict" : "confirmed",
      sourceType: clean(link.source_type),
      sourceEmployeeId: clean(link.source_employee_id),
    },
    summary: summarizeWorkforceDays(canonicalDays),
    days,
  });
}

export function resolveAttendanceOperationDay(raw, schedule, today = currentDateRiyadh()) {
  const date = clean(raw?.date || raw?.attendanceDate || raw?.attendance_date);
  const checkInAt = nullable(raw?.checkInAt ?? raw?.check_in_at);
  const checkOutAt = nullable(raw?.checkOutAt ?? raw?.check_out_at);
  const stored = {
    checkInAt,
    checkOutAt,
    status: clean(raw?.status || raw?.attendanceStatus || raw?.attendance_status) || (checkInAt ? "present" : "unknown"),
    lateMinutes: nonNegativeInt(raw?.lateMinutes ?? raw?.late_minutes),
    earlyLeaveMinutes: nonNegativeInt(raw?.earlyLeaveMinutes ?? raw?.early_leave_minutes),
    workedMinutes: nullableInt(raw?.workedMinutes ?? raw?.worked_minutes),
    missingPunch: Boolean(checkInAt) !== Boolean(checkOutAt),
  };

  if (!checkInAt) return stored;

  const historicalComplete = date && date < today && Boolean(checkInAt && checkOutAt);
  if (historicalComplete || !schedule?.ready || !schedule?.isWorkingDay) {
    return stored;
  }

  const metrics = calculateAttendanceMetrics({
    date,
    checkInAt,
    checkOutAt,
    schedule,
  });

  return {
    ...stored,
    status: metrics.status,
    lateMinutes: metrics.lateMinutes,
    earlyLeaveMinutes: metrics.earlyLeaveMinutes,
    workedMinutes: metrics.workedMinutes,
  };
}

function calculateAttendanceMetrics({ date, checkInAt, checkOutAt, schedule }) {
  const checkIn = checkInAt ? new Date(checkInAt) : null;
  const checkOut = checkOutAt ? new Date(checkOutAt) : null;
  const window = buildScheduleWindow(date, schedule);
  const grace = Number(schedule?.graceMinutes || 0);
  const earlyTolerance = Number(schedule?.earlyLeaveToleranceMinutes || 0);

  const rawLateMinutes = checkIn && window
    ? Math.max(0, Math.floor((checkIn.getTime() - window.start.getTime()) / 60000))
    : 0;
  const rawEarlyLeaveMinutes = checkOut && window
    ? Math.max(0, Math.floor((window.end.getTime() - checkOut.getTime()) / 60000))
    : 0;
  const lateMinutes = rawLateMinutes > grace ? rawLateMinutes : 0;
  const earlyLeaveMinutes = rawEarlyLeaveMinutes > earlyTolerance ? rawEarlyLeaveMinutes : 0;
  const workedMinutes = checkIn && checkOut
    ? Math.max(0, Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000))
    : null;

  return {
    lateMinutes,
    earlyLeaveMinutes,
    workedMinutes,
    status: lateMinutes && earlyLeaveMinutes
      ? "late_early_leave"
      : lateMinutes
        ? "late"
        : earlyLeaveMinutes
          ? "early_leave"
          : "present",
  };
}

function buildScheduleWindow(date, schedule) {
  const startTime = clean(schedule?.startTime);
  const endTime = clean(schedule?.endTime);
  if (!date || !isTime(startTime) || !isTime(endTime)) return null;
  const start = new Date(`${date}T${startTime}:00+03:00`);
  let end = new Date(`${date}T${endTime}:00+03:00`);
  if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 86400000);
  return { start, end };
}

function summarize(days) {
  return days.reduce((summary, day) => {
    summary.daysWithRecords += day.checkInAt || day.checkOutAt ? 1 : 0;
    summary.lateDays += day.lateMinutes > 0 ? 1 : 0;
    summary.lateMinutes += day.lateMinutes;
    summary.earlyLeaveDays += day.earlyLeaveMinutes > 0 ? 1 : 0;
    summary.earlyLeaveMinutes += day.earlyLeaveMinutes;
    summary.missingPunchDays += day.missingPunch ? 1 : 0;
    summary.explicitAbsenceDays += day.explicitAbsence?.status === "approved" ? 1 : 0;
    return summary;
  }, emptySummary());
}

function emptySummary() {
  return {
    daysWithRecords: 0,
    lateDays: 0,
    lateMinutes: 0,
    earlyLeaveDays: 0,
    earlyLeaveMinutes: 0,
    missingPunchDays: 0,
    explicitAbsenceDays: 0,
  };
}

async function requireEmployeeAccess(db, tenantId, employeeId, principal) {
  const employee = await db
    .prepare(`SELECT id, account_uid, account_email
                FROM workforce_employee_profiles
               WHERE tenant_id = ? AND id = ? LIMIT 1`)
    .bind(tenantId, employeeId)
    .first();
  if (!employee) throw httpError(404, "workforce_employee_not_found");
  if (principal?.canManage) return employee;
  const sameUid = clean(principal?.uid) && clean(employee.account_uid) === clean(principal.uid);
  const sameEmail = clean(principal?.email).toLowerCase() && clean(employee.account_email).toLowerCase() === clean(principal.email).toLowerCase();
  if (!sameUid && !sameEmail) throw httpError(403, "workforce_employee_access_forbidden");
  return employee;
}

function validMonth(value) {
  const text = clean(value);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) throw httpError(400, "workforce_attendance_month_invalid");
  return text;
}

function monthBounds(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7) + "-01";
  return {
    fromDate: `${monthKey}-01`,
    lastDate: new Date(Date.UTC(year, month, 0, 12)).toISOString().slice(0, 10),
    nextMonth,
  };
}

function currentMonthRiyadh() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function currentDateRiyadh() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function stripRoutePrefix(pathname, routePrefix) {
  const prefix = clean(routePrefix).replace(/\/$/, "");
  if (!prefix) return pathname || "/";
  if (!pathname.startsWith(prefix)) return pathname;
  return pathname.slice(prefix.length) || "/";
}

function methodNotAllowed(methods) {
  return json(405, { ok: false, message: "method_not_allowed", allowed: methods });
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
  error.code = message;
  return error;
}

function clean(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "undefined" || text === "null") return "";
  return text;
}

function nullable(value) {
  const text = clean(value);
  return text || null;
}

function nonNegativeInt(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function nullableInt(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function isTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(clean(value));
}
