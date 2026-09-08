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
  const { fromDate, nextMonth } = monthBounds(monthKey);

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

  const [sourceRows, absencesResult] = await Promise.all([
    sourceAdapter.listAttendanceMonth(clean(link.source_employee_id), monthKey),
    db.prepare(`SELECT * FROM workforce_absences
                 WHERE tenant_id = ? AND employee_id = ?
                   AND absence_date >= ? AND absence_date < ?
                 ORDER BY absence_date ASC`)
      .bind(tenant.id, employeeId, fromDate, nextMonth)
      .all(),
  ]);

  const absenceByDate = new Map((absencesResult?.results || []).map(row => [clean(row.absence_date), row]));
  const days = [];
  const seen = new Set();

  for (const raw of Array.isArray(sourceRows) ? sourceRows : []) {
    const date = clean(raw.date || raw.attendanceDate || raw.attendance_date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < fromDate || date >= nextMonth) continue;
    seen.add(date);
    const checkInAt = nullable(raw.checkInAt ?? raw.check_in_at);
    const checkOutAt = nullable(raw.checkOutAt ?? raw.check_out_at);
    const lateMinutes = nonNegativeInt(raw.lateMinutes ?? raw.late_minutes);
    const earlyLeaveMinutes = nonNegativeInt(raw.earlyLeaveMinutes ?? raw.early_leave_minutes);
    const workedMinutes = nullableInt(raw.workedMinutes ?? raw.worked_minutes);
    const missingPunch = Boolean(checkInAt) !== Boolean(checkOutAt);
    const explicitAbsence = absenceByDate.get(date) || null;

    days.push({
      date,
      checkInAt,
      checkOutAt,
      status: clean(raw.status || raw.attendanceStatus || raw.attendance_status) || (checkInAt ? "present" : "unknown"),
      lateMinutes,
      earlyLeaveMinutes,
      workedMinutes,
      missingPunch,
      explicitAbsence: explicitAbsence ? {
        id: explicitAbsence.id,
        dayPortion: explicitAbsence.day_portion,
        status: explicitAbsence.status,
        payrollTreatment: explicitAbsence.payroll_treatment,
        reason: explicitAbsence.reason || null,
      } : null,
    });
  }

  for (const [date, absence] of absenceByDate) {
    if (seen.has(date)) continue;
    days.push({
      date,
      checkInAt: null,
      checkOutAt: null,
      status: "absence",
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      workedMinutes: null,
      missingPunch: false,
      explicitAbsence: {
        id: absence.id,
        dayPortion: absence.day_portion,
        status: absence.status,
        payrollTreatment: absence.payroll_treatment,
        reason: absence.reason || null,
      },
    });
  }

  days.sort((a, b) => a.date.localeCompare(b.date));
  const summary = summarize(days);

  return json(200, {
    ok: true,
    monthKey,
    readiness: {
      ready: true,
      status: "confirmed",
      sourceType: clean(link.source_type),
      sourceEmployeeId: clean(link.source_employee_id),
    },
    summary,
    days,
  });
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
  return {
    fromDate: `${monthKey}-01`,
    nextMonth: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7) + "-01",
  };
}

function currentMonthRiyadh() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
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
