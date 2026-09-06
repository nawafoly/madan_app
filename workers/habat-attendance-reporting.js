const DEFAULT_SHIFT_ID = "habat_shift_default";

export async function handleHabatAttendanceReportingRequest({ request, url, db, resolveRequesterContext }) {
  if (!db) return json(500, { ok: false, message: "habat_attendance_database_unavailable" });
  if (typeof resolveRequesterContext !== "function") {
    return json(500, { ok: false, message: "habat_attendance_auth_unavailable" });
  }

  const pathname = normalizeText(url?.pathname);
  const isReport = pathname === "/attendance/habat/v2/reports/summary" || pathname === "/attendance/habat/v3/reports/summary";
  const isGenerate = pathname === "/attendance/habat/v3/monthly-summary/generate";
  if (!isReport && !isGenerate) return json(404, { ok: false, message: "not_found" });

  const requester = await resolveRequesterContext(request);
  if (!requester?.ok) return requester?.response || json(401, { ok: false, message: "unauthorized" });
  if (!requester.runtime?.isActive) return forbidden("inactive_account");

  const principal = await resolvePrincipal(db, requester);
  if (!principal.ok) return principal.response;
  if (!principal.canManage) return forbidden("habat_management_forbidden");

  if (isReport) {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return getReport(db, url);
  }

  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  return generateMonthlySummary(db, request, requester);
}

async function resolvePrincipal(db, requester) {
  const uid = normalizeText(requester?.uid);
  const email = normalizeText(requester?.email).toLowerCase();
  const runtimeRole = normalizeText(requester?.runtime?.role).toLowerCase();

  if (uid || email) {
    try {
      const row = await db.prepare(
        `SELECT id, access_level
         FROM habat_attendance_access
         WHERE is_active = 1
           AND ((uid IS NOT NULL AND uid = ?) OR lower(email) = ?)
         ORDER BY CASE WHEN uid = ? THEN 0 ELSE 1 END, created_at ASC
         LIMIT 1`
      ).bind(uid, email, uid).first();
      if (row) {
        return {
          ok: true,
          canManage: normalizeText(row.access_level) === "manager",
        };
      }
    } catch (error) {
      console.error("[habat-reporting] principal lookup failed", error);
      return { ok: false, response: json(500, { ok: false, message: "habat_access_lookup_failed" }) };
    }
  }

  if (runtimeRole === "owner") return { ok: true, canManage: true };
  return { ok: false, response: forbidden("habat_access_forbidden") };
}

async function getReport(db, url) {
  const today = getRiyadhDateKey();
  const requestedMonth = normalizeMonth(url.searchParams.get("month"));
  let from = normalizeDate(url.searchParams.get("from"));
  let to = normalizeDate(url.searchParams.get("to"));

  if (requestedMonth) {
    const range = monthRange(requestedMonth);
    from = range.from;
    to = range.to;
  }
  if (!from) from = `${today.slice(0, 7)}-01`;
  if (!to) to = today;
  if (to > today) to = today;
  if (from > to) return json(400, { ok: false, message: "habat_invalid_report_range" });

  try {
    const accessResult = await db.prepare(
      `SELECT id, uid, email, display_name, access_level, clock_enabled, is_active,
              created_at, updated_at
       FROM habat_attendance_access
       WHERE clock_enabled = 1
         AND is_active = 1
         AND date(datetime(created_at, '+3 hours')) <= date(?)
       ORDER BY coalesce(display_name, email) COLLATE NOCASE ASC`
    ).bind(to).all();

    const employees = [];
    for (const access of accessResult?.results || []) {
      const metrics = await calculateAccessRange(db, access, from, to);
      employees.push({
        accessId: normalizeText(access.id),
        email: normalizeText(access.email).toLowerCase(),
        displayName: normalizeText(access.display_name) || normalizeText(access.email),
        ...metrics,
      });
    }

    const totals = employees.reduce((sum, employee) => ({
      scheduledDays: add(sum.scheduledDays, employee.scheduledDays),
      attendedDays: add(sum.attendedDays, employee.attendedDays),
      absentDays: add(sum.absentDays, employee.absentDays),
      lateDays: add(sum.lateDays, employee.lateDays),
      earlyLeaveDays: add(sum.earlyLeaveDays, employee.earlyLeaveDays),
      incompleteDays: add(sum.incompleteDays, employee.incompleteDays),
      workedMinutes: add(sum.workedMinutes, employee.workedMinutes),
    }), emptyMetrics());

    return json(200, { ok: true, from, to, totals: normalizeMetricNumbers(totals), employees: employees.map(normalizeMetricNumbers) });
  } catch (error) {
    console.error("[habat-reporting] report failed", error);
    return json(500, { ok: false, message: "habat_report_query_failed" });
  }
}

async function generateMonthlySummary(db, request, requester) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const accessId = normalizeText(body.value?.accessId);
  const month = normalizeMonth(body.value?.month) || getRiyadhDateKey().slice(0, 7);
  if (!accessId) return json(400, { ok: false, message: "habat_access_required" });

  try {
    const access = await db.prepare(
      `SELECT id, uid, email, display_name, access_level, clock_enabled, is_active,
              created_at, updated_at
       FROM habat_attendance_access
       WHERE id = ? LIMIT 1`
    ).bind(accessId).first();
    if (!access) return json(404, { ok: false, message: "habat_access_not_found" });

    const range = monthRange(month);
    const today = getRiyadhDateKey();
    const effectiveTo = range.to > today ? today : range.to;
    const metrics = effectiveTo >= range.from
      ? await calculateAccessRange(db, access, range.from, effectiveTo)
      : emptyMetrics();

    const summary = {
      month,
      scheduledDays: metrics.scheduledDays,
      attendedDays: metrics.attendedDays,
      absentDays: metrics.absentDays,
      emergencyLeaveDays: metrics.emergencyLeaveDays,
      lateDays: metrics.lateDays,
      earlyLeaveDays: metrics.earlyLeaveDays,
      incompleteDays: metrics.incompleteDays,
      workedMinutes: metrics.workedMinutes,
      daysWithAttendance: metrics.attendedDays,
      generatedAt: nowIso(),
    };
    const id = `habat_summary_${accessId}_${month}`;
    const previous = await db.prepare(
      `SELECT summary_json FROM habat_attendance_monthly_summaries
       WHERE access_id = ? AND month_key = ? LIMIT 1`
    ).bind(accessId, month).first();

    await db.prepare(
      `INSERT INTO habat_attendance_monthly_summaries (
        id, access_id, month_key, summary_json, generated_by_uid, generated_by_email, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(access_id, month_key) DO UPDATE SET
        summary_json = excluded.summary_json,
        generated_by_uid = excluded.generated_by_uid,
        generated_by_email = excluded.generated_by_email,
        generated_at = excluded.generated_at`
    ).bind(
      id, accessId, month, JSON.stringify(summary),
      normalizeText(requester.uid) || null,
      normalizeText(requester.email).toLowerCase() || null,
      summary.generatedAt
    ).run();

    await writeAudit(
      db,
      requester,
      "manager_generate_monthly_summary",
      "habat_attendance_monthly_summary",
      id,
      previous?.summary_json ? safeJson(previous.summary_json) : null,
      summary
    );

    return json(200, { ok: true, summary });
  } catch (error) {
    console.error("[habat-reporting] summary generation failed", error);
    return json(500, { ok: false, message: "habat_monthly_summary_failed" });
  }
}

async function calculateAccessRange(db, access, from, to) {
  const [recordsResult, overridesResult, shiftsResult, assignmentsResult] = await Promise.all([
    db.prepare(
      `SELECT * FROM habat_attendance_records
       WHERE attendance_date BETWEEN ? AND ?
         AND (access_id = ? OR lower(account_email) = lower(?))
       ORDER BY attendance_date ASC`
    ).bind(from, to, access.id, access.email).all(),
    db.prepare(
      `SELECT * FROM habat_attendance_day_overrides
       WHERE access_id = ? AND attendance_date BETWEEN ? AND ?
       ORDER BY attendance_date ASC`
    ).bind(access.id, from, to).all(),
    db.prepare(`SELECT * FROM habat_attendance_shifts ORDER BY created_at ASC`).all(),
    db.prepare(
      `SELECT * FROM habat_attendance_shift_assignments
       WHERE access_id = ? AND effective_from <= ?
         AND (effective_to IS NULL OR effective_to >= ?)
       ORDER BY effective_from ASC`
    ).bind(access.id, to, from).all(),
  ]);

  const records = recordsResult?.results || [];
  const overrides = overridesResult?.results || [];
  const shifts = shiftsResult?.results || [];
  const assignments = assignmentsResult?.results || [];
  const recordByDate = new Map(records.map(row => [normalizeText(row.attendance_date), row]));
  const overrideByDate = new Map(overrides.map(row => [normalizeText(row.attendance_date), row]));
  const enrollmentDate = getRiyadhDateKeyFromIso(access.created_at);
  const today = getRiyadhDateKey();
  const now = new Date();
  const metrics = { ...emptyMetrics(), emergencyLeaveDays: 0 };

  for (const date of enumerateDateKeys(from, to)) {
    const record = recordByDate.get(date) || null;
    const override = overrideByDate.get(date) || null;
    const hasActualData = Boolean(record || override);
    if (enrollmentDate && date < enrollmentDate && !hasActualData) continue;
    if (Number(access.clock_enabled) !== 1 && !hasActualData) continue;

    const shift = resolveShiftForDate(date, assignments, shifts);
    if (!shift) continue;
    const workingDay = parseWorkingDays(shift.working_days).includes(weekdayIndex(date));
    if (!workingDay || date > today) continue;

    const schedule = buildScheduleWindow(date, shift);
    const attendanceWindowStarted = date < today || (date === today && now.getTime() >= schedule.start.getTime());
    if (!attendanceWindowStarted && !record && !override) continue;

    const portionWeight = override?.day_portion === "half_day" ? 0.5 : 1;
    if (override?.override_type === "emergency_leave") {
      metrics.emergencyLeaveDays += portionWeight;
      metrics.scheduledDays += portionWeight === 0.5 ? 0.5 : 0;
      continue;
    }

    metrics.scheduledDays += 1;

    if (override?.override_type === "absence") {
      metrics.absentDays += portionWeight;
      continue;
    }

    if (record?.check_in_at) {
      metrics.attendedDays += 1;
      metrics.workedMinutes += numberOrZero(record.worked_minutes);
      const rawStatus = normalizeText(record.attendance_status);
      if (rawStatus.includes("late") || numberOrZero(record.late_minutes) > 0) metrics.lateDays += 1;
      if (rawStatus.includes("early_leave") || numberOrZero(record.early_leave_minutes) > 0) metrics.earlyLeaveDays += 1;
      if (!record.check_out_at && now.getTime() > schedule.end.getTime()) metrics.incompleteDays += 1;
    } else {
      const absenceBoundary = schedule.start.getTime() + numberOrZero(shift.grace_minutes) * 60_000;
      if (date < today || now.getTime() > absenceBoundary) metrics.absentDays += 1;
    }
  }

  return normalizeMetricNumbers(metrics);
}

function emptyMetrics() {
  return {
    scheduledDays: 0,
    attendedDays: 0,
    absentDays: 0,
    lateDays: 0,
    earlyLeaveDays: 0,
    incompleteDays: 0,
    workedMinutes: 0,
  };
}

function normalizeMetricNumbers(value) {
  const output = { ...value };
  for (const key of Object.keys(output)) {
    if (typeof output[key] === "number") output[key] = Math.round(output[key] * 100) / 100;
  }
  return output;
}

function resolveShiftForDate(date, assignments, shifts) {
  const assignment = assignments
    .filter(row => normalizeText(row.effective_from) <= date && (!normalizeText(row.effective_to) || normalizeText(row.effective_to) >= date))
    .sort((a, b) => normalizeText(b.effective_from).localeCompare(normalizeText(a.effective_from)))[0];
  const shiftId = normalizeText(assignment?.shift_id) || DEFAULT_SHIFT_ID;
  return shifts.find(row => normalizeText(row.id) === shiftId) || shifts.find(row => normalizeText(row.id) === DEFAULT_SHIFT_ID) || null;
}

function buildScheduleWindow(date, shift) {
  const start = new Date(`${date}T${normalizeTime(shift.start_time)}:00+03:00`);
  let end = new Date(`${date}T${normalizeTime(shift.end_time)}:00+03:00`);
  if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function normalizeTime(value) {
  const text = normalizeText(value);
  return /^\d{2}:\d{2}$/.test(text) ? text : "09:00";
}

function parseWorkingDays(value) {
  return String(value ?? "")
    .split(",")
    .map(item => Number(item))
    .filter(item => Number.isInteger(item) && item >= 0 && item <= 6);
}

function weekdayIndex(date) {
  return new Date(`${date}T12:00:00+03:00`).getDay();
}

function enumerateDateKeys(from, to) {
  const result = [];
  let cursor = new Date(`${from}T12:00:00+03:00`);
  const end = new Date(`${to}T12:00:00+03:00`);
  while (cursor.getTime() <= end.getTime()) {
    result.push(formatRiyadhDateKey(cursor));
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return result;
}

function monthRange(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function getRiyadhDateKey() {
  return formatRiyadhDateKey(new Date());
}

function getRiyadhDateKeyFromIso(value) {
  const text = normalizeText(value);
  if (!text) return "";
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return "";
  return formatRiyadhDateKey(new Date(timestamp));
}

function formatRiyadhDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function normalizeDate(value) {
  const text = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function normalizeMonth(value) {
  const text = normalizeText(value);
  return /^\d{4}-\d{2}$/.test(text) ? text : "";
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function add(left, right) {
  return Number(left || 0) + Number(right || 0);
}

async function writeAudit(db, requester, action, entityType, entityId, before, after) {
  try {
    await db.prepare(
      `INSERT INTO habat_attendance_audit (
        id, actor_uid, actor_email, action, entity_type, entity_id, before_json, after_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      `habat_audit_${crypto.randomUUID()}`,
      normalizeText(requester?.uid) || null,
      normalizeText(requester?.email).toLowerCase() || null,
      action,
      entityType,
      entityId || null,
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after),
      nowIso()
    ).run();
  } catch (error) {
    console.warn("[habat-reporting] audit write failed", error);
  }
}

function safeJson(value) {
  try { return JSON.parse(String(value || "null")); } catch { return null; }
}

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text && text !== "undefined" && text !== "null" ? text : "";
}

function nowIso() {
  return new Date().toISOString();
}

async function readJsonBody(request) {
  try { return { ok: true, value: await request.json() }; }
  catch { return { ok: false, response: json(400, { ok: false, message: "invalid_json" }) }; }
}

function methodNotAllowed(allowed) {
  return new Response(JSON.stringify({ ok: false, message: "method_not_allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json; charset=utf-8", Allow: allowed.join(", ") },
  });
}

function forbidden(message) {
  return json(403, { ok: false, message });
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
