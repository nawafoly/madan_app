const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 93;

function text(value) {
  return String(value ?? "").trim();
}

function dateKey(value) {
  const normalized = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error("invalid_date");
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error("invalid_date");
  return normalized;
}

function todayRiyadh() {
  const now = new Date(Date.now() + RIYADH_OFFSET_MS);
  return now.toISOString().slice(0, 10);
}

function monthBounds(month) {
  const normalized = text(month);
  if (!/^\d{4}-\d{2}$/.test(normalized)) throw new Error("invalid_month");
  const [year, monthNumber] = normalized.split("-").map(Number);
  if (monthNumber < 1 || monthNumber > 12) throw new Error("invalid_month");
  const start = `${normalized}-01`;
  const endDate = new Date(Date.UTC(year, monthNumber, 0));
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

function rangeBounds(fromValue, toValue) {
  const from = dateKey(fromValue);
  const to = dateKey(toValue);
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  if (toMs < fromMs) throw new Error("invalid_date_range");
  const days = Math.floor((toMs - fromMs) / 86400000) + 1;
  if (days > MAX_RANGE_DAYS) throw new Error("date_range_too_large");
  return { from, to };
}

function riyadhUtcRange(date) {
  const key = dateKey(date);
  const [year, month, day] = key.split("-").map(Number);
  const startMs = Date.UTC(year, month - 1, day, -3, 0, 0, 0);
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + 86400000).toISOString(),
  };
}

function riyadhDateKey(iso) {
  const ms = Date.parse(iso || "");
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

function riyadhTime(iso) {
  const ms = Date.parse(iso || "");
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + RIYADH_OFFSET_MS).toISOString().slice(11, 16);
}

function parseTimeMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text(value));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function weekdayKey(date) {
  const keys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return keys[day];
}

function isWeeklyOff(employee, date) {
  const offDays = parseJsonArray(employee.weekly_off_days_json).map(item => text(item).toLowerCase());
  const day = weekdayKey(date);
  const aliases = {
    sunday: ["sunday", "sun", "0", "الأحد", "الاحد", "احد"],
    monday: ["monday", "mon", "1", "الاثنين", "الإثنين"],
    tuesday: ["tuesday", "tue", "2", "الثلاثاء"],
    wednesday: ["wednesday", "wed", "3", "الأربعاء", "الاربعاء"],
    thursday: ["thursday", "thu", "4", "الخميس"],
    friday: ["friday", "fri", "5", "الجمعة"],
    saturday: ["saturday", "sat", "6", "السبت"],
  };
  return aliases[day].some(alias => offDays.includes(alias));
}

function cancelledLeaveDate(row, date) {
  return parseJsonArray(row.cancelled_date_keys_json).includes(date);
}

async function employeeById(db, employeeId) {
  const id = text(employeeId);
  if (!id || id.length > 128) throw new Error("invalid_employee_id");
  const row = await db.prepare(
    `SELECT id, auth_uid, name, title, department, employee_code, employment_status, is_active,
            shift_start_time, shift_end_time, weekly_off_days_json, allowed_zone_ids_json
       FROM employees WHERE id = ? LIMIT 1`
  ).bind(id).first();
  if (!row) throw new Error("employee_not_found");
  return row;
}

async function attendanceRowsForDate(db, date) {
  const range = riyadhUtcRange(date);
  const result = await db.prepare(
    `SELECT id, employee_uid, employee_doc_id, type, server_time, zone_id, zone_name, result
       FROM attendance_records
      WHERE server_time >= ? AND server_time < ? AND result = 'allowed'
      ORDER BY server_time ASC`
  ).bind(range.start, range.end).all();
  return result.results || [];
}

function summarizeDayRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = text(row.employee_uid) || text(row.employee_doc_id);
    if (!key) continue;
    const group = grouped.get(key) || [];
    group.push(row);
    grouped.set(key, group);
  }
  return grouped;
}

function dayPunchSummary(rows) {
  const sorted = [...rows].sort((a, b) => Date.parse(a.server_time) - Date.parse(b.server_time));
  const checkIn = sorted.find(row => row.type === "check_in") || null;
  const checkOut = [...sorted].reverse().find(row => row.type === "check_out") || null;
  return {
    checkIn,
    checkOut,
    checkInTime: checkIn ? riyadhTime(checkIn.server_time) : null,
    checkOutTime: checkOut ? riyadhTime(checkOut.server_time) : null,
    recordCount: sorted.length,
  };
}

function analyzePunchSequence(rows) {
  const sorted = [...rows].sort((a, b) => {
    const timeDiff = Date.parse(a.server_time) - Date.parse(b.server_time);
    if (timeDiff !== 0) return timeDiff;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
  const issues = [];
  let openCheckIn = null;
  for (const row of sorted) {
    if (row.type === "check_in") {
      if (openCheckIn) {
        issues.push({
          type: "consecutive_checkins_without_checkout",
          firstCheckIn: riyadhTime(openCheckIn.server_time),
          nextCheckIn: riyadhTime(row.server_time),
        });
      }
      openCheckIn = row;
      continue;
    }
    if (row.type === "check_out") {
      if (!openCheckIn) {
        issues.push({ type: "checkout_without_checkin", checkOut: riyadhTime(row.server_time) });
        continue;
      }
      if (Date.parse(row.server_time) <= Date.parse(openCheckIn.server_time)) {
        issues.push({
          type: "checkout_not_after_checkin",
          checkIn: riyadhTime(openCheckIn.server_time),
          checkOut: riyadhTime(row.server_time),
        });
      }
      openCheckIn = null;
    }
  }
  return { issues, openCheckIn };
}

async function activeEmployees(db) {
  const result = await db.prepare(
    `SELECT id, auth_uid, name, title, department, employee_code, employment_status, is_active,
            shift_start_time, shift_end_time, weekly_off_days_json, allowed_zone_ids_json
       FROM employees
      WHERE is_active = 1 AND lower(trim(employment_status)) NOT IN ('deleted','terminated','inactive')
      ORDER BY name COLLATE NOCASE ASC`
  ).all();
  return result.results || [];
}

async function approvedLeaveRows(db, date) {
  const key = dateKey(date);
  const result = await db.prepare(
    `SELECT id, employee_id, employee_uid, employee_name, leave_type, start_date, end_date,
            cancelled_date_keys_json
       FROM employee_leave_requests
      WHERE lower(trim(status)) = 'approved' AND start_date <= ? AND end_date >= ?
      ORDER BY employee_name COLLATE NOCASE ASC`
  ).bind(key, key).all();
  return (result.results || []).filter(row => !cancelledLeaveDate(row, key));
}

function employeeMap(employees) {
  const byId = new Map();
  const byUid = new Map();
  for (const employee of employees) {
    byId.set(text(employee.id), employee);
    if (text(employee.auth_uid)) byUid.set(text(employee.auth_uid), employee);
  }
  return { byId, byUid };
}

function resolveAttendanceEmployee(row, maps) {
  return maps.byUid.get(text(row.employee_uid)) || maps.byId.get(text(row.employee_doc_id)) || null;
}

export const HR_AI_TOOL_DEFINITIONS = [
  { name: "searchEmployees", description: "Search active HR employees by name, employee code, title, department, or ID.", parameters: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 20 } }, required: ["query"] } },
  { name: "getEmployeeSummary", description: "Get a compact employee identity and work-schedule summary by employee ID.", parameters: { type: "object", properties: { employeeId: { type: "string" } }, required: ["employeeId"] } },
  { name: "getAttendanceForDate", description: "Get allowed attendance punches for one Riyadh date.", parameters: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD" } }, required: ["date"] } },
  { name: "getEmployeeAttendance", description: "Get one employee attendance in a bounded date range, maximum 93 days.", parameters: { type: "object", properties: { employeeId: { type: "string" }, dateFrom: { type: "string" }, dateTo: { type: "string" } }, required: ["employeeId", "dateFrom", "dateTo"] } },
  { name: "getAttendanceSummary", description: "Summarize attendance for all active employees or one employee across a bounded date range. Includes attendance days, complete/incomplete days, late occurrences and minutes, and past-day absence count under current rules.", parameters: { type: "object", properties: { dateFrom: { type: "string" }, dateTo: { type: "string" }, employeeId: { type: "string" } }, required: ["dateFrom", "dateTo"] } },
  { name: "getWorkSchedule", description: "Get one employee configured shift start/end and weekly off days.", parameters: { type: "object", properties: { employeeId: { type: "string" } }, required: ["employeeId"] } },
  { name: "getEmployeeLeave", description: "Get approved leave records for one employee in a bounded date range.", parameters: { type: "object", properties: { employeeId: { type: "string" }, dateFrom: { type: "string" }, dateTo: { type: "string" } }, required: ["employeeId", "dateFrom", "dateTo"] } },
  { name: "getMissingCheckouts", description: "Find employees who checked in on a date without a later checkout.", parameters: { type: "object", properties: { date: { type: "string" } }, required: ["date"] } },
  { name: "getLateEmployees", description: "Find employees whose first check-in is after their configured shift start on a date. No unconfigured grace period is assumed.", parameters: { type: "object", properties: { date: { type: "string" } }, required: ["date"] } },
  { name: "getAbsentEmployees", description: "Find employees considered absent under current rules for a past date: active, scheduled, no attendance, no approved leave. Today without attendance is pending, not absent.", parameters: { type: "object", properties: { date: { type: "string" } }, required: ["date"] } },
  { name: "getApprovedLeaves", description: "Get approved, non-cancelled leave covering a date.", parameters: { type: "object", properties: { date: { type: "string" } }, required: ["date"] } },
  { name: "getEmployeePayrollSummary", description: "Get a compact payroll record for an employee and payroll month. Requires payroll.view permission.", parameters: { type: "object", properties: { employeeId: { type: "string" }, payrollMonth: { type: "string", description: "YYYY-MM" } }, required: ["employeeId", "payrollMonth"] } },
  { name: "getAttendanceConflicts", description: "Find real attendance/approved-leave and explicit-absence/approved-leave conflicts on a date.", parameters: { type: "object", properties: { date: { type: "string" } }, required: ["date"] } },
  { name: "getOrphanAttendanceRecords", description: "Find attendance records in a date range that do not map to any current HR employee by auth UID or employee ID.", parameters: { type: "object", properties: { dateFrom: { type: "string" }, dateTo: { type: "string" } }, required: ["dateFrom", "dateTo"] } },
  { name: "getEmployeeIdentityMappings", description: "Find attendance identity mismatches where UID and document ID resolve inconsistently, or an active employee lacks auth UID.", parameters: { type: "object", properties: { dateFrom: { type: "string" }, dateTo: { type: "string" } }, required: ["dateFrom", "dateTo"] } },
  { name: "getHrSystemDiagnostics", description: "Return compact HR/attendance diagnostics for one date: missing punches, exact duplicate punches, mapping issues, leave conflicts, absence conflicts, and missing schedules.", parameters: { type: "object", properties: { date: { type: "string" } }, required: ["date"] } },
];

export function getDefaultAiDate() {
  return todayRiyadh();
}

export async function executeHrAiTool(name, rawArgs, ctx) {
  const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};
  const { hrDb, attendanceDb, permissions } = ctx;
  if (!hrDb || !attendanceDb) throw new Error("missing_ai_database_binding");

  switch (name) {
    case "searchEmployees": {
      if (!permissions.includes("employees.view")) throw new Error("employees_view_forbidden");
      const query = text(args.query).slice(0, 120);
      if (!query) throw new Error("invalid_employee_search");
      const limit = Math.max(1, Math.min(20, Number(args.limit) || 8));
      const needle = `%${query.toLowerCase()}%`;
      const result = await hrDb.prepare(
        `SELECT id, name, title, department, employee_code, employment_status, is_active
           FROM employees
          WHERE lower(name) LIKE ? OR lower(id) LIKE ? OR lower(coalesce(employee_code,'')) LIKE ?
             OR lower(coalesce(title,'')) LIKE ? OR lower(coalesce(department,'')) LIKE ?
          ORDER BY is_active DESC, name COLLATE NOCASE ASC LIMIT ?`
      ).bind(needle, needle, needle, needle, needle, limit).all();
      return {
        employees: (result.results || []).map(employee => ({
          id: employee.id,
          name: employee.name,
          title: employee.title || null,
          department: employee.department || null,
          employeeCode: employee.employee_code || null,
          employmentStatus: employee.employment_status || null,
          isActive: Boolean(employee.is_active),
        })),
      };
    }
    case "getEmployeeSummary": {
      if (!permissions.includes("employees.view")) throw new Error("employees_view_forbidden");
      const employee = await employeeById(hrDb, args.employeeId);
      return { employee: {
        id: employee.id, name: employee.name,
        title: employee.title || null, department: employee.department || null,
        employeeCode: employee.employee_code || null, employmentStatus: employee.employment_status,
        isActive: Boolean(employee.is_active), workSchedule: { startTime: employee.shift_start_time || null, endTime: employee.shift_end_time || null, weeklyOffDays: parseJsonArray(employee.weekly_off_days_json) },
      } };
    }
    case "getAttendanceForDate": {
      if (!permissions.includes("attendance.view") || !permissions.includes("employees.view")) throw new Error("attendance_employees_view_forbidden");
      const date = dateKey(args.date);
      const [rows, employees] = await Promise.all([attendanceRowsForDate(attendanceDb, date), activeEmployees(hrDb)]);
      const maps = employeeMap(employees);
      return {
        date,
        records: rows.map(row => {
          const employee = resolveAttendanceEmployee(row, maps);
          return {
            employeeId: employee?.id || row.employee_doc_id || null,
            name: employee?.name || null,
            type: row.type,
            time: riyadhTime(row.server_time),
            zoneName: row.zone_name || null,
          };
        }),
      };
    }
    case "getEmployeeAttendance": {
      if (!permissions.includes("attendance.view")) throw new Error("attendance_view_forbidden");
      const employee = await employeeById(hrDb, args.employeeId);
      const range = rangeBounds(args.dateFrom, args.dateTo);
      const start = riyadhUtcRange(range.from).start;
      const end = riyadhUtcRange(range.to).end;
      const result = await attendanceDb.prepare(
        `SELECT employee_uid, employee_doc_id, type, server_time, zone_name
           FROM attendance_records
          WHERE result = 'allowed' AND server_time >= ? AND server_time < ?
            AND (employee_doc_id = ? OR employee_uid = ?)
          ORDER BY server_time ASC`
      ).bind(start, end, employee.id, employee.auth_uid || "__none__").all();
      const records = (result.results || []).map(row => ({ date: riyadhDateKey(row.server_time), type: row.type, time: riyadhTime(row.server_time), serverTime: row.server_time, zoneName: row.zone_name || null }));
      return { employee: { id: employee.id, name: employee.name }, dateFrom: range.from, dateTo: range.to, records };
    }
    case "getAttendanceSummary": {
      if (!permissions.includes("attendance.view")) throw new Error("attendance_view_forbidden");
      if (!permissions.includes("leave_requests.view")) throw new Error("leave_requests_view_forbidden");
      const range = rangeBounds(args.dateFrom, args.dateTo);
      const requestedEmployeeId = text(args.employeeId);
      let employees = await activeEmployees(hrDb);
      if (requestedEmployeeId) {
        const employee = await employeeById(hrDb, requestedEmployeeId);
        employees = [employee];
      }
      const start = riyadhUtcRange(range.from).start;
      const end = riyadhUtcRange(range.to).end;
      const attendanceResult = await attendanceDb.prepare(
        `SELECT employee_uid, employee_doc_id, type, server_time
           FROM attendance_records
          WHERE result = 'allowed' AND server_time >= ? AND server_time < ?
          ORDER BY server_time ASC`
      ).bind(start, end).all();
      const rows = attendanceResult.results || [];
      const maps = employeeMap(employees);
      const rowsByEmployeeDate = new Map();
      for (const row of rows) {
        const employee = resolveAttendanceEmployee(row, maps);
        if (!employee) continue;
        const key = `${employee.id}|${riyadhDateKey(row.server_time)}`;
        const group = rowsByEmployeeDate.get(key) || [];
        group.push(row);
        rowsByEmployeeDate.set(key, group);
      }
      const leaveResult = await hrDb.prepare(
        `SELECT employee_id, employee_uid, start_date, end_date, cancelled_date_keys_json
           FROM employee_leave_requests
          WHERE lower(trim(status)) = 'approved' AND start_date <= ? AND end_date >= ?`
      ).bind(range.to, range.from).all();
      const leaves = leaveResult.results || [];
      const today = todayRiyadh();
      const summaries = [];
      for (const employee of employees) {
        let attendanceDays = 0;
        let completeDays = 0;
        let incompleteDays = 0;
        let lateOccurrences = 0;
        let lateMinutes = 0;
        let absentDays = 0;
        for (let cursorMs = Date.parse(`${range.from}T00:00:00Z`); cursorMs <= Date.parse(`${range.to}T00:00:00Z`); cursorMs += 86400000) {
          const date = new Date(cursorMs).toISOString().slice(0, 10);
          const dayRows = rowsByEmployeeDate.get(`${employee.id}|${date}`) || [];
          const summary = dayPunchSummary(dayRows);
          if (summary.checkIn || summary.checkOut) {
            attendanceDays += 1;
            const inMs = summary.checkIn ? Date.parse(summary.checkIn.server_time) : NaN;
            const outMs = summary.checkOut ? Date.parse(summary.checkOut.server_time) : NaN;
            if (Number.isFinite(inMs) && Number.isFinite(outMs) && outMs > inMs) completeDays += 1;
            else incompleteDays += 1;
            const scheduled = parseTimeMinutes(employee.shift_start_time);
            const actual = summary.checkIn ? parseTimeMinutes(summary.checkInTime) : null;
            if (scheduled !== null && actual !== null && actual > scheduled) {
              lateOccurrences += 1;
              lateMinutes += actual - scheduled;
            }
            continue;
          }
          if (date >= today || isWeeklyOff(employee, date)) continue;
          const hasApprovedLeave = leaves.some(leave => {
            const identityMatches = text(leave.employee_id) === text(employee.id) || (text(employee.auth_uid) && text(leave.employee_uid) === text(employee.auth_uid));
            return identityMatches && leave.start_date <= date && leave.end_date >= date && !cancelledLeaveDate(leave, date);
          });
          if (!hasApprovedLeave) absentDays += 1;
        }
        summaries.push({ employeeId: employee.id, name: employee.name, attendanceDays, completeDays, incompleteDays, lateOccurrences, lateMinutes, absentDays });
      }
      summaries.sort((a, b) => b.lateMinutes - a.lateMinutes || b.attendanceDays - a.attendanceDays);
      return { dateFrom: range.from, dateTo: range.to, employeeCount: summaries.length, summaries };
    }
    case "getWorkSchedule": {
      if (!permissions.includes("employees.view")) throw new Error("employees_view_forbidden");
      const employee = await employeeById(hrDb, args.employeeId);
      return { employee: { id: employee.id, name: employee.name }, schedule: { startTime: employee.shift_start_time || null, endTime: employee.shift_end_time || null, weeklyOffDays: parseJsonArray(employee.weekly_off_days_json) } };
    }
    case "getEmployeeLeave": {
      if (!permissions.includes("leave_requests.view")) throw new Error("leave_requests_view_forbidden");
      const employee = await employeeById(hrDb, args.employeeId);
      const range = rangeBounds(args.dateFrom, args.dateTo);
      const result = await hrDb.prepare(
        `SELECT id, leave_type, start_date, end_date, days_count, cancelled_date_keys_json
           FROM employee_leave_requests
          WHERE lower(trim(status)) = 'approved' AND start_date <= ? AND end_date >= ?
            AND (employee_id = ? OR employee_uid = ?)
          ORDER BY start_date ASC`
      ).bind(range.to, range.from, employee.id, employee.auth_uid || "__none__").all();
      return { employee: { id: employee.id, name: employee.name }, dateFrom: range.from, dateTo: range.to, leaves: (result.results || []).map(row => ({ id: row.id, leaveType: row.leave_type, startDate: row.start_date, endDate: row.end_date, daysCount: row.days_count ?? null, cancelledDateKeys: parseJsonArray(row.cancelled_date_keys_json) })) };
    }
    case "getMissingCheckouts": {
      if (!permissions.includes("attendance.view")) throw new Error("attendance_view_forbidden");
      const date = dateKey(args.date);
      const [rows, employees] = await Promise.all([attendanceRowsForDate(attendanceDb, date), activeEmployees(hrDb)]);
      const maps = employeeMap(employees);
      const missing = [];
      for (const groupRows of summarizeDayRows(rows).values()) {
        const sequence = analyzePunchSequence(groupRows);
        if (!sequence.openCheckIn) continue;
        const employee = resolveAttendanceEmployee(sequence.openCheckIn, maps);
        missing.push({
          employeeId: employee?.id || sequence.openCheckIn.employee_doc_id,
          name: employee?.name || null,
          checkIn: riyadhTime(sequence.openCheckIn.server_time),
        });
      }
      return { date, count: missing.length, employees: missing };
    }
    case "getLateEmployees": {
      if (!permissions.includes("attendance.view")) throw new Error("attendance_view_forbidden");
      const date = dateKey(args.date);
      const [rows, employees] = await Promise.all([attendanceRowsForDate(attendanceDb, date), activeEmployees(hrDb)]);
      const maps = employeeMap(employees);
      const late = [];
      for (const groupRows of summarizeDayRows(rows).values()) {
        const checkIn = [...groupRows].sort((a, b) => Date.parse(a.server_time) - Date.parse(b.server_time)).find(row => row.type === "check_in");
        if (!checkIn) continue;
        const employee = resolveAttendanceEmployee(checkIn, maps);
        if (!employee) continue;
        const scheduleMinutes = parseTimeMinutes(employee.shift_start_time);
        const punchMinutes = parseTimeMinutes(riyadhTime(checkIn.server_time));
        if (scheduleMinutes === null || punchMinutes === null || punchMinutes <= scheduleMinutes) continue;
        late.push({ employeeId: employee.id, name: employee.name, scheduledStart: employee.shift_start_time, checkIn: riyadhTime(checkIn.server_time), lateMinutes: punchMinutes - scheduleMinutes });
      }
      late.sort((a, b) => b.lateMinutes - a.lateMinutes);
      return { date, count: late.length, employees: late };
    }
    case "getAbsentEmployees": {
      if (!permissions.includes("attendance.view")) throw new Error("attendance_view_forbidden");
      if (!permissions.includes("leave_requests.view")) throw new Error("leave_requests_view_forbidden");
      const date = dateKey(args.date);
      const today = todayRiyadh();
      if (date >= today) return { date, count: 0, employees: [], note: date === today ? "current_business_rule_marks_no_attendance_today_as_today_pending_not_absent" : "future_date_not_absent" };
      const [rows, employees, leaves] = await Promise.all([attendanceRowsForDate(attendanceDb, date), activeEmployees(hrDb), approvedLeaveRows(hrDb, date)]);
      const seen = new Set();
      for (const row of rows) { seen.add(text(row.employee_uid)); seen.add(text(row.employee_doc_id)); }
      const leaveKeys = new Set();
      for (const leave of leaves) { leaveKeys.add(text(leave.employee_uid)); leaveKeys.add(text(leave.employee_id)); }
      const absent = employees.filter(employee => !isWeeklyOff(employee, date) && !seen.has(text(employee.id)) && !seen.has(text(employee.auth_uid)) && !leaveKeys.has(text(employee.id)) && !leaveKeys.has(text(employee.auth_uid))).map(employee => ({ employeeId: employee.id, name: employee.name }));
      return { date, count: absent.length, employees: absent };
    }
    case "getApprovedLeaves": {
      if (!permissions.includes("leave_requests.view")) throw new Error("leave_requests_view_forbidden");
      const date = dateKey(args.date);
      const leaves = await approvedLeaveRows(hrDb, date);
      return { date, count: leaves.length, leaves: leaves.map(row => ({ id: row.id, employeeId: row.employee_id || null, employeeName: row.employee_name || null, leaveType: row.leave_type, startDate: row.start_date, endDate: row.end_date })) };
    }
    case "getEmployeePayrollSummary": {
      if (!permissions.includes("payroll.view")) throw new Error("payroll_view_forbidden");
      const employee = await employeeById(hrDb, args.employeeId);
      const month = text(args.payrollMonth);
      monthBounds(month);
      const row = await hrDb.prepare(
        `SELECT payroll_month, month_start, month_end, base_salary, allowances, absence_days,
                expected_work_hours, actual_worked_hours, attendance_late_hours, attendance_missing_hours,
                attendance_overtime_hours, attendance_complete_days, attendance_incomplete_days,
                attendance_absent_days, final_salary, status
           FROM employee_payroll_records
          WHERE payroll_month = ? AND (employee_id = ? OR employee_uid = ?) LIMIT 1`
      ).bind(month, employee.id, employee.auth_uid || "__none__").first();
      return { employee: { id: employee.id, name: employee.name }, payrollMonth: month, payroll: row || null };
    }
    case "getAttendanceConflicts": {
      if (!permissions.includes("attendance.view") || !permissions.includes("leave_requests.view") || !permissions.includes("absences.view")) throw new Error("attendance_leave_absence_view_forbidden");
      const date = dateKey(args.date);
      const [rows, employees, leaves, absenceResult] = await Promise.all([
        attendanceRowsForDate(attendanceDb, date), activeEmployees(hrDb), approvedLeaveRows(hrDb, date),
        hrDb.prepare(`SELECT id, employee_id, employee_uid, absence_type FROM employee_absences WHERE absence_date = ?`).bind(date).all(),
      ]);
      const maps = employeeMap(employees);
      const attendanceKeys = new Set();
      for (const row of rows) { attendanceKeys.add(text(row.employee_uid)); attendanceKeys.add(text(row.employee_doc_id)); }
      const attendanceLeave = leaves.filter(leave => attendanceKeys.has(text(leave.employee_uid)) || attendanceKeys.has(text(leave.employee_id))).map(leave => ({ type: "approved_leave_with_attendance", employeeId: leave.employee_id || maps.byUid.get(text(leave.employee_uid))?.id || null, name: leave.employee_name || maps.byUid.get(text(leave.employee_uid))?.name || null, leaveType: leave.leave_type }));
      const leaveKeys = new Set();
      for (const leave of leaves) { leaveKeys.add(text(leave.employee_uid)); leaveKeys.add(text(leave.employee_id)); }
      const absenceLeave = (absenceResult.results || []).filter(row => leaveKeys.has(text(row.employee_uid)) || leaveKeys.has(text(row.employee_id))).map(row => ({ type: "explicit_absence_with_approved_leave", employeeId: row.employee_id || maps.byUid.get(text(row.employee_uid))?.id || null, name: maps.byUid.get(text(row.employee_uid))?.name || maps.byId.get(text(row.employee_id))?.name || null, absenceType: row.absence_type }));
      const conflicts = [...attendanceLeave, ...absenceLeave];
      return { date, count: conflicts.length, conflicts };
    }
    case "getOrphanAttendanceRecords": {
      if (!permissions.includes("attendance.view") || !permissions.includes("employees.view")) throw new Error("attendance_employees_view_forbidden");
      const range = rangeBounds(args.dateFrom, args.dateTo);
      const start = riyadhUtcRange(range.from).start; const end = riyadhUtcRange(range.to).end;
      const [recordsResult, employees] = await Promise.all([
        attendanceDb.prepare(`SELECT id, employee_uid, employee_doc_id, type, server_time FROM attendance_records WHERE result='allowed' AND server_time >= ? AND server_time < ? ORDER BY server_time DESC LIMIT 500`).bind(start, end).all(),
        activeEmployees(hrDb),
      ]);
      const maps = employeeMap(employees);
      const records = (recordsResult.results || []).filter(row => !maps.byUid.has(text(row.employee_uid)) && !maps.byId.has(text(row.employee_doc_id))).map(row => ({ recordId: row.id, employeeUid: row.employee_uid, employeeId: row.employee_doc_id, type: row.type, serverTime: row.server_time }));
      return { dateFrom: range.from, dateTo: range.to, count: records.length, records };
    }
    case "getEmployeeIdentityMappings": {
      if (!permissions.includes("attendance.view") || !permissions.includes("employees.view")) throw new Error("attendance_employees_view_forbidden");
      const range = rangeBounds(args.dateFrom, args.dateTo);
      const start = riyadhUtcRange(range.from).start; const end = riyadhUtcRange(range.to).end;
      const [recordsResult, employees] = await Promise.all([
        attendanceDb.prepare(`SELECT id, employee_uid, employee_doc_id, server_time FROM attendance_records WHERE result='allowed' AND server_time >= ? AND server_time < ? ORDER BY server_time DESC LIMIT 500`).bind(start, end).all(), activeEmployees(hrDb),
      ]);
      const maps = employeeMap(employees);
      const issues = [];
      for (const employee of employees) if (!text(employee.auth_uid)) issues.push({ type: "active_employee_missing_auth_uid", employeeId: employee.id, name: employee.name });
      const seen = new Set();
      for (const row of recordsResult.results || []) {
        const byUid = maps.byUid.get(text(row.employee_uid)); const byId = maps.byId.get(text(row.employee_doc_id));
        let issue = null;
        if (byUid && byId && byUid.id !== byId.id) issue = { type: "uid_doc_id_resolve_to_different_employees", employeeUid: row.employee_uid, employeeDocId: row.employee_doc_id, uidEmployeeId: byUid.id, docEmployeeId: byId.id };
        else if (byUid && text(row.employee_doc_id) !== text(byUid.id)) issue = { type: "attendance_uses_old_or_mismatched_employee_id", employeeUid: row.employee_uid, attendanceEmployeeId: row.employee_doc_id, currentEmployeeId: byUid.id, name: byUid.name };
        if (issue) { const key = JSON.stringify(issue); if (!seen.has(key)) { seen.add(key); issues.push(issue); } }
      }
      return { dateFrom: range.from, dateTo: range.to, count: issues.length, issues };
    }
    case "getHrSystemDiagnostics": {
      if (!permissions.includes("attendance.view") || !permissions.includes("employees.view")) throw new Error("attendance_employees_view_forbidden");
      const date = dateKey(args.date);
      const [rows, employees, leaves, absenceResult] = await Promise.all([
        attendanceRowsForDate(attendanceDb, date), activeEmployees(hrDb),
        permissions.includes("leave_requests.view") ? approvedLeaveRows(hrDb, date) : Promise.resolve([]),
        permissions.includes("absences.view") ? hrDb.prepare(`SELECT employee_id, employee_uid, absence_type FROM employee_absences WHERE absence_date = ?`).bind(date).all() : Promise.resolve({ results: [] }),
      ]);
      const maps = employeeMap(employees); const grouped = summarizeDayRows(rows); const issues = [];
      for (const groupRows of grouped.values()) {
        const employee = resolveAttendanceEmployee(groupRows[0], maps);
        const sequence = analyzePunchSequence(groupRows);
        if (sequence.openCheckIn) issues.push({ type: "missing_checkout", employeeId: employee?.id || sequence.openCheckIn.employee_doc_id, name: employee?.name || null, checkIn: riyadhTime(sequence.openCheckIn.server_time) });
        for (const sequenceIssue of sequence.issues) issues.push({ ...sequenceIssue, employeeId: employee?.id || groupRows[0].employee_doc_id, name: employee?.name || null });
        const duplicateKeys = new Map();
        for (const row of groupRows) { const key = `${row.type}|${row.server_time}`; duplicateKeys.set(key, (duplicateKeys.get(key) || 0) + 1); }
        for (const [key, count] of duplicateKeys) if (count > 1) issues.push({ type: "exact_duplicate_attendance", employeeId: employee?.id || groupRows[0].employee_doc_id, name: employee?.name || null, fingerprint: key, count });
      }
      for (const row of rows) if (!maps.byUid.has(text(row.employee_uid)) && !maps.byId.has(text(row.employee_doc_id))) issues.push({ type: "orphan_attendance", employeeUid: row.employee_uid, employeeId: row.employee_doc_id, serverTime: row.server_time });
      for (const row of rows) { const byUid = maps.byUid.get(text(row.employee_uid)); const byId = maps.byId.get(text(row.employee_doc_id)); if (byUid && byId && byUid.id !== byId.id) issues.push({ type: "uid_doc_id_mismatch", employeeUid: row.employee_uid, employeeDocId: row.employee_doc_id, uidEmployeeId: byUid.id, docEmployeeId: byId.id }); else if (byUid && text(row.employee_doc_id) !== text(byUid.id)) issues.push({ type: "old_or_mismatched_employee_id", employeeUid: row.employee_uid, attendanceEmployeeId: row.employee_doc_id, currentEmployeeId: byUid.id, name: byUid.name }); }
      const attendanceKeys = new Set(); for (const row of rows) { attendanceKeys.add(text(row.employee_uid)); attendanceKeys.add(text(row.employee_doc_id)); }
      const leaveKeys = new Set(); for (const leave of leaves) { leaveKeys.add(text(leave.employee_uid)); leaveKeys.add(text(leave.employee_id)); if (attendanceKeys.has(text(leave.employee_uid)) || attendanceKeys.has(text(leave.employee_id))) issues.push({ type: "approved_leave_with_attendance", employeeId: leave.employee_id || maps.byUid.get(text(leave.employee_uid))?.id || null, name: leave.employee_name || maps.byUid.get(text(leave.employee_uid))?.name || null, leaveType: leave.leave_type }); }
      for (const absence of absenceResult.results || []) if (leaveKeys.has(text(absence.employee_uid)) || leaveKeys.has(text(absence.employee_id))) issues.push({ type: "explicit_absence_with_approved_leave", employeeId: absence.employee_id || maps.byUid.get(text(absence.employee_uid))?.id || null, name: maps.byUid.get(text(absence.employee_uid))?.name || maps.byId.get(text(absence.employee_id))?.name || null, absenceType: absence.absence_type });
      for (const employee of employees) {
        if (!text(employee.auth_uid)) issues.push({ type: "active_employee_missing_auth_uid", employeeId: employee.id, name: employee.name });
        const scheduleStart = parseTimeMinutes(employee.shift_start_time);
        const scheduleEnd = parseTimeMinutes(employee.shift_end_time);
        if (scheduleStart === null || scheduleEnd === null) issues.push({ type: "employee_missing_or_incomplete_work_schedule", employeeId: employee.id, name: employee.name, startTime: employee.shift_start_time || null, endTime: employee.shift_end_time || null });
      }
      const unique = []; const seen = new Set(); for (const issue of issues) { const key = JSON.stringify(issue); if (!seen.has(key)) { seen.add(key); unique.push(issue); } }
      const skipped = [];
      if (!permissions.includes("leave_requests.view")) skipped.push("leave_conflicts");
      if (!permissions.includes("absences.view")) skipped.push("absence_conflicts");
      return { date, count: unique.length, issues: unique.slice(0, 100), skipped };
    }
    default:
      throw new Error("unknown_hr_ai_tool");
  }
}
