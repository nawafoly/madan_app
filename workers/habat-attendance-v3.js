const DEFAULT_SHIFT_ID = "habat_shift_default";
const OVERRIDE_TYPES = new Set(["emergency_leave", "absence"]);
const DAY_PORTIONS = new Set(["full_day", "half_day"]);

export async function handleHabatAttendanceV3Request({ request, url, db, resolveRequesterContext }) {
  if (!db) return json(500, { ok: false, message: "habat_attendance_database_unavailable" });
  if (typeof resolveRequesterContext !== "function") {
    return json(500, { ok: false, message: "habat_attendance_auth_unavailable" });
  }

  const pathname = normalizeText(url?.pathname);
  if (!pathname.startsWith("/attendance/habat/v3/")) {
    return json(404, { ok: false, message: "not_found" });
  }

  const requester = await resolveRequesterContext(request);
  if (!requester?.ok) return requester?.response || json(401, { ok: false, message: "unauthorized" });
  if (!requester.runtime?.isActive) return forbidden("inactive_account");

  const principal = await resolvePrincipal(db, requester);
  if (!principal.ok) return principal.response;

  const subpath = pathname.slice("/attendance/habat/v3".length) || "/";
  const deleteRecordMatch = subpath.match(/^\/records\/([^/]+)$/);
  const deleteOverrideMatch = subpath.match(/^\/day-overrides\/([^/]+)$/);

  if (subpath === "/month") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return getMonthWorkspace(db, url, principal);
  }

  if (subpath === "/monthly-summary") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return getSavedMonthlySummary(db, url, principal);
  }

  if (!principal.canManage) return forbidden("habat_management_forbidden");

  if (subpath === "/records/manual") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    return createManualRecord(db, request, requester);
  }

  if (deleteRecordMatch) {
    if (request.method !== "DELETE") return methodNotAllowed(["DELETE"]);
    return deleteAttendanceRecord(db, requester, decodeURIComponent(deleteRecordMatch[1]));
  }

  if (subpath === "/day-overrides") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    return upsertDayOverride(db, request, requester);
  }

  if (deleteOverrideMatch) {
    if (request.method !== "DELETE") return methodNotAllowed(["DELETE"]);
    return deleteDayOverride(db, requester, decodeURIComponent(deleteOverrideMatch[1]));
  }

  if (subpath === "/monthly-summary/generate") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    return generateMonthlySummary(db, request, requester);
  }

  return json(404, { ok: false, message: "not_found" });
}

async function resolvePrincipal(db, requester) {
  const uid = normalizeText(requester?.uid);
  const email = normalizeText(requester?.email).toLowerCase();
  const runtimeRole = normalizeText(requester?.runtime?.role).toLowerCase();

  if (uid || email) {
    try {
      const row = await db.prepare(
        `SELECT id, uid, email, display_name, access_level, clock_enabled, is_active
         FROM habat_attendance_access
         WHERE is_active = 1
           AND ((uid IS NOT NULL AND uid = ?) OR lower(email) = ?)
         ORDER BY CASE WHEN uid = ? THEN 0 ELSE 1 END, created_at ASC
         LIMIT 1`
      ).bind(uid, email, uid).first();

      if (row) {
        const accessLevel = normalizeText(row.access_level) === "manager" ? "manager" : "employee";
        return {
          ok: true,
          accessId: normalizeText(row.id),
          uid,
          email: normalizeText(row.email).toLowerCase() || email,
          displayName: normalizeText(row.display_name) || email || "المستخدم",
          accessLevel,
          canManage: accessLevel === "manager",
          canClock: Number(row.clock_enabled) === 1,
        };
      }
    } catch (error) {
      console.error("[habat-v3] principal lookup failed", error);
      return { ok: false, response: json(500, { ok: false, message: "habat_access_lookup_failed" }) };
    }
  }

  if (runtimeRole === "owner") {
    return {
      ok: true,
      accessId: null,
      uid,
      email,
      displayName: email || "المالك",
      accessLevel: "manager",
      canManage: true,
      canClock: false,
    };
  }

  return { ok: false, response: forbidden("habat_access_forbidden") };
}

async function resolveScopedAccess(db, principal, requestedAccessId) {
  const requested = normalizeText(requestedAccessId);
  if (!requested) {
    if (!principal.accessId) return { ok: false, response: json(400, { ok: false, message: "habat_access_required" }) };
    return getAccessById(db, principal.accessId);
  }
  if (!principal.canManage && requested !== principal.accessId) {
    return { ok: false, response: forbidden("habat_management_forbidden") };
  }
  return getAccessById(db, requested);
}

async function getAccessById(db, id) {
  const row = await db.prepare(
    `SELECT id, uid, email, display_name, access_level, clock_enabled, is_active
     FROM habat_attendance_access WHERE id = ? LIMIT 1`
  ).bind(id).first();
  if (!row) return { ok: false, response: json(404, { ok: false, message: "habat_access_not_found" }) };
  return { ok: true, row };
}

async function getMonthWorkspace(db, url, principal) {
  const month = normalizeMonth(url.searchParams.get("month")) || getRiyadhDateKey().slice(0, 7);
  const accessResult = await resolveScopedAccess(db, principal, url.searchParams.get("accessId"));
  if (!accessResult.ok) return accessResult.response;
  const access = accessResult.row;

  try {
    const workspace = await buildMonthWorkspace(db, access, month);
    return json(200, { ok: true, ...workspace });
  } catch (error) {
    console.error("[habat-v3] month workspace failed", error);
    return json(500, { ok: false, message: "habat_month_workspace_failed" });
  }
}

async function buildMonthWorkspace(db, access, month) {
  const range = monthRange(month);
  const [recordsResult, overridesResult, shiftsResult, assignmentsResult, savedSummary] = await Promise.all([
    db.prepare(
      `SELECT * FROM habat_attendance_records
       WHERE attendance_date >= ? AND attendance_date <= ?
         AND (access_id = ? OR lower(account_email) = lower(?))
       ORDER BY attendance_date ASC`
    ).bind(range.from, range.to, access.id, access.email).all(),
    db.prepare(
      `SELECT * FROM habat_attendance_day_overrides
       WHERE access_id = ? AND attendance_date >= ? AND attendance_date <= ?
       ORDER BY attendance_date ASC`
    ).bind(access.id, range.from, range.to).all(),
    db.prepare(`SELECT * FROM habat_attendance_shifts WHERE is_active = 1 OR id = ?`).bind(DEFAULT_SHIFT_ID).all(),
    db.prepare(
      `SELECT * FROM habat_attendance_shift_assignments
       WHERE access_id = ? AND effective_from <= ?
         AND (effective_to IS NULL OR effective_to >= ?)
       ORDER BY effective_from ASC`
    ).bind(access.id, range.to, range.from).all(),
    db.prepare(
      `SELECT id, summary_json, generated_at
       FROM habat_attendance_monthly_summaries
       WHERE access_id = ? AND month_key = ? LIMIT 1`
    ).bind(access.id, month).first(),
  ]);

  const records = recordsResult?.results || [];
  const overrides = overridesResult?.results || [];
  const shifts = shiftsResult?.results || [];
  const assignments = assignmentsResult?.results || [];
  const recordByDate = new Map(records.map(row => [normalizeText(row.attendance_date), row]));
  const overrideByDate = new Map(overrides.map(row => [normalizeText(row.attendance_date), row]));
  const today = getRiyadhDateKey();

  const days = enumerateDateKeys(range.from, range.to).map(date => {
    const shift = resolveShiftForDate(date, assignments, shifts);
    const record = recordByDate.get(date) || null;
    const override = overrideByDate.get(date) || null;
    const workingDay = shift ? parseWorkingDays(shift.working_days).includes(weekdayIndex(date)) : true;
    const future = date > today;
    let state = "pending";
    if (future) state = "future";
    else if (!workingDay) state = "off";
    else if (override?.override_type === "emergency_leave") state = "leave";
    else if (override?.override_type === "absence") state = "absence";
    else if (record?.check_in_at && record?.check_out_at) {
      state = String(record.attendance_status || "").includes("late") || String(record.attendance_status || "").includes("early_leave")
        ? "attention"
        : "complete";
    } else if (record?.check_in_at) state = "incomplete";
    else if (date < today) state = "absence";
    else state = "today_pending";

    return {
      date,
      weekday: weekdayIndex(date),
      workingDay,
      state,
      shift: mapShift(shift),
      record: mapRecord(record),
      override: mapOverride(override),
    };
  });

  return {
    access: mapAccess(access),
    month,
    from: range.from,
    to: range.to,
    days,
    records: records.map(mapRecord),
    overrides: overrides.map(mapOverride),
    savedSummary: savedSummary
      ? { id: savedSummary.id, generatedAt: savedSummary.generated_at, summary: safeJson(savedSummary.summary_json) }
      : null,
  };
}

async function createManualRecord(db, request, requester) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const accessId = normalizeText(body.value?.accessId);
  const date = normalizeDate(body.value?.date);
  const checkInAt = normalizeIso(body.value?.checkInAt);
  const checkOutAt = normalizeOptionalIso(body.value?.checkOutAt);
  const reason = normalizeText(body.value?.reason);
  if (!accessId || !date || !checkInAt) return json(400, { ok: false, message: "habat_manual_record_fields_required" });
  if (reason.length < 3) return json(400, { ok: false, message: "habat_correction_reason_required" });
  if (checkOutAt && Date.parse(checkOutAt) < Date.parse(checkInAt)) {
    return json(400, { ok: false, message: "habat_invalid_attendance_order" });
  }

  const accessResult = await getAccessById(db, accessId);
  if (!accessResult.ok) return accessResult.response;
  const access = accessResult.row;
  const uid = normalizeText(access.uid);
  if (!uid) return json(409, { ok: false, message: "habat_employee_login_required_before_manual_record" });

  const existing = await db.prepare(
    `SELECT * FROM habat_attendance_records
     WHERE attendance_date = ? AND (access_id = ? OR account_uid = ?) LIMIT 1`
  ).bind(date, accessId, uid).first();
  if (existing) return json(409, { ok: false, message: "habat_attendance_record_already_exists" });

  const override = await db.prepare(
    `SELECT * FROM habat_attendance_day_overrides WHERE access_id = ? AND attendance_date = ? LIMIT 1`
  ).bind(accessId, date).first();
  if (override) return json(409, { ok: false, message: "habat_day_override_exists" });

  const shift = await resolveShiftForAccessDate(db, accessId, date);
  if (!shift) return json(409, { ok: false, message: "habat_shift_not_configured" });
  const schedule = buildScheduleWindow(date, shift);
  const metrics = calculateMetrics(checkInAt, checkOutAt, shift, schedule);
  const id = `habat_${crypto.randomUUID()}`;
  const now = nowIso();

  try {
    await db.prepare(
      `INSERT INTO habat_attendance_records (
        id, access_id, account_uid, account_email, display_name, attendance_date,
        check_in_at, check_out_at, shift_id, scheduled_start_at, scheduled_end_at,
        attendance_status, late_minutes, early_leave_minutes, worked_minutes,
        notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, accessId, uid, normalizeText(access.email).toLowerCase(),
      normalizeText(access.display_name) || normalizeText(access.email), date,
      checkInAt, checkOutAt, normalizeText(shift.id), schedule.start.toISOString(), schedule.end.toISOString(),
      metrics.status, metrics.lateMinutes, metrics.earlyLeaveMinutes, metrics.workedMinutes,
      `إضافة يدوية: ${reason}`, now, now
    ).run();
    const created = await db.prepare(`SELECT * FROM habat_attendance_records WHERE id = ? LIMIT 1`).bind(id).first();
    await writeAudit(db, requester, "manager_create_manual_record", "habat_attendance_record", id, null, { ...created, reason });
    return json(200, { ok: true, record: mapRecord(created) });
  } catch (error) {
    console.error("[habat-v3] manual record failed", error);
    return json(500, { ok: false, message: "habat_manual_record_create_failed" });
  }
}

async function deleteAttendanceRecord(db, requester, id) {
  const current = await db.prepare(`SELECT * FROM habat_attendance_records WHERE id = ? LIMIT 1`).bind(id).first();
  if (!current) return json(404, { ok: false, message: "habat_record_not_found" });
  try {
    await writeAudit(db, requester, "manager_delete_record", "habat_attendance_record", id, current, null);
    await db.prepare(`DELETE FROM habat_attendance_records WHERE id = ?`).bind(id).run();
    return json(200, { ok: true });
  } catch (error) {
    console.error("[habat-v3] record delete failed", error);
    return json(500, { ok: false, message: "habat_record_delete_failed" });
  }
}

async function upsertDayOverride(db, request, requester) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const accessId = normalizeText(body.value?.accessId);
  const date = normalizeDate(body.value?.date);
  const type = normalizeText(body.value?.type);
  const dayPortion = DAY_PORTIONS.has(normalizeText(body.value?.dayPortion)) ? normalizeText(body.value?.dayPortion) : "full_day";
  const reason = normalizeText(body.value?.reason);
  if (!accessId || !date || !OVERRIDE_TYPES.has(type)) {
    return json(400, { ok: false, message: "habat_day_override_fields_required" });
  }

  const accessResult = await getAccessById(db, accessId);
  if (!accessResult.ok) return accessResult.response;
  const attendance = await db.prepare(
    `SELECT id FROM habat_attendance_records
     WHERE attendance_date = ? AND (access_id = ? OR lower(account_email) = lower(?)) LIMIT 1`
  ).bind(date, accessId, accessResult.row.email).first();
  if (attendance) return json(409, { ok: false, message: "habat_day_has_attendance_record" });

  const current = await db.prepare(
    `SELECT * FROM habat_attendance_day_overrides WHERE access_id = ? AND attendance_date = ? LIMIT 1`
  ).bind(accessId, date).first();
  const id = current?.id || `habat_override_${crypto.randomUUID()}`;
  const now = nowIso();

  try {
    await db.prepare(
      `INSERT INTO habat_attendance_day_overrides (
        id, access_id, attendance_date, override_type, day_portion, reason,
        created_by_uid, created_by_email, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(access_id, attendance_date) DO UPDATE SET
        override_type = excluded.override_type,
        day_portion = excluded.day_portion,
        reason = excluded.reason,
        updated_at = excluded.updated_at`
    ).bind(
      id, accessId, date, type, dayPortion, reason || null,
      normalizeText(requester.uid) || null, normalizeText(requester.email).toLowerCase() || null,
      current?.created_at || now, now
    ).run();
    const next = await db.prepare(`SELECT * FROM habat_attendance_day_overrides WHERE access_id = ? AND attendance_date = ? LIMIT 1`).bind(accessId, date).first();
    await writeAudit(db, requester, current ? "manager_update_day_override" : "manager_create_day_override", "habat_attendance_day_override", id, current, next);
    return json(200, { ok: true, override: mapOverride(next) });
  } catch (error) {
    console.error("[habat-v3] override save failed", error);
    return json(500, { ok: false, message: "habat_day_override_save_failed" });
  }
}

async function deleteDayOverride(db, requester, id) {
  const current = await db.prepare(`SELECT * FROM habat_attendance_day_overrides WHERE id = ? LIMIT 1`).bind(id).first();
  if (!current) return json(404, { ok: false, message: "habat_day_override_not_found" });
  try {
    await writeAudit(db, requester, "manager_delete_day_override", "habat_attendance_day_override", id, current, null);
    await db.prepare(`DELETE FROM habat_attendance_day_overrides WHERE id = ?`).bind(id).run();
    return json(200, { ok: true });
  } catch (error) {
    console.error("[habat-v3] override delete failed", error);
    return json(500, { ok: false, message: "habat_day_override_delete_failed" });
  }
}

async function getSavedMonthlySummary(db, url, principal) {
  const month = normalizeMonth(url.searchParams.get("month")) || getRiyadhDateKey().slice(0, 7);
  const accessResult = await resolveScopedAccess(db, principal, url.searchParams.get("accessId"));
  if (!accessResult.ok) return accessResult.response;
  const row = await db.prepare(
    `SELECT id, summary_json, generated_at FROM habat_attendance_monthly_summaries
     WHERE access_id = ? AND month_key = ? LIMIT 1`
  ).bind(accessResult.row.id, month).first();
  return json(200, {
    ok: true,
    month,
    summary: row ? safeJson(row.summary_json) : null,
    generatedAt: row?.generated_at || null,
  });
}

async function generateMonthlySummary(db, request, requester) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const accessId = normalizeText(body.value?.accessId);
  const month = normalizeMonth(body.value?.month) || getRiyadhDateKey().slice(0, 7);
  if (!accessId) return json(400, { ok: false, message: "habat_access_required" });
  const accessResult = await getAccessById(db, accessId);
  if (!accessResult.ok) return accessResult.response;

  try {
    const workspace = await buildMonthWorkspace(db, accessResult.row, month);
    const today = getRiyadhDateKey();
    const elapsed = workspace.days.filter(day => day.date <= today && day.workingDay);
    const summary = {
      month,
      scheduledDays: elapsed.filter(day => day.state !== "leave").length,
      attendedDays: elapsed.filter(day => Boolean(day.record?.checkInAt)).length,
      absentDays: elapsed.filter(day => day.state === "absence").length,
      emergencyLeaveDays: elapsed.filter(day => day.state === "leave").length,
      lateDays: elapsed.filter(day => String(day.record?.attendanceStatus || "").includes("late")).length,
      earlyLeaveDays: elapsed.filter(day => String(day.record?.attendanceStatus || "").includes("early_leave")).length,
      incompleteDays: elapsed.filter(day => day.state === "incomplete").length,
      workedMinutes: elapsed.reduce((sum, day) => sum + Number(day.record?.workedMinutes || 0), 0),
      daysWithAttendance: elapsed.filter(day => Boolean(day.record?.checkInAt)).length,
      generatedAt: nowIso(),
    };
    const id = `habat_summary_${accessId}_${month}`;
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
      normalizeText(requester.uid) || null, normalizeText(requester.email).toLowerCase() || null,
      summary.generatedAt
    ).run();
    await writeAudit(db, requester, "manager_generate_monthly_summary", "habat_attendance_monthly_summary", id, workspace.savedSummary?.summary || null, summary);
    return json(200, { ok: true, summary });
  } catch (error) {
    console.error("[habat-v3] summary generation failed", error);
    return json(500, { ok: false, message: "habat_monthly_summary_failed" });
  }
}

async function resolveShiftForAccessDate(db, accessId, date) {
  const assignment = await db.prepare(
    `SELECT s.* FROM habat_attendance_shift_assignments a
     JOIN habat_attendance_shifts s ON s.id = a.shift_id
     WHERE a.access_id = ? AND a.effective_from <= ?
       AND (a.effective_to IS NULL OR a.effective_to >= ?)
       AND s.is_active = 1
     ORDER BY a.effective_from DESC LIMIT 1`
  ).bind(accessId, date, date).first();
  if (assignment) return assignment;
  return db.prepare(`SELECT * FROM habat_attendance_shifts WHERE id = ? LIMIT 1`).bind(DEFAULT_SHIFT_ID).first();
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

function calculateMetrics(checkInAt, checkOutAt, shift, schedule) {
  const checkIn = new Date(checkInAt);
  const checkOut = checkOutAt ? new Date(checkOutAt) : null;
  const rawLate = Math.max(0, Math.floor((checkIn.getTime() - schedule.start.getTime()) / 60000));
  const grace = Number(shift.grace_minutes || 0);
  const lateMinutes = rawLate > grace ? rawLate : 0;
  const rawEarly = checkOut ? Math.max(0, Math.floor((schedule.end.getTime() - checkOut.getTime()) / 60000)) : 0;
  const tolerance = Number(shift.early_leave_tolerance_minutes || 0);
  const earlyLeaveMinutes = rawEarly > tolerance ? rawEarly : 0;
  const workedMinutes = checkOut ? Math.max(0, Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000)) : null;
  let status = lateMinutes ? "late" : "present";
  if (earlyLeaveMinutes) status = lateMinutes ? "late_early_leave" : "early_leave";
  return { status, lateMinutes, earlyLeaveMinutes, workedMinutes };
}

function mapAccess(row) {
  return {
    id: normalizeText(row.id), uid: normalizeText(row.uid) || null,
    email: normalizeText(row.email).toLowerCase(), displayName: normalizeText(row.display_name) || null,
    accessLevel: normalizeText(row.access_level) === "manager" ? "manager" : "employee",
    clockEnabled: Number(row.clock_enabled) === 1, isActive: Number(row.is_active) === 1,
  };
}

function mapShift(row) {
  if (!row) return null;
  return {
    id: normalizeText(row.id), name: normalizeText(row.name),
    startTime: normalizeTime(row.start_time), endTime: normalizeTime(row.end_time),
    graceMinutes: Number(row.grace_minutes || 0),
    earlyLeaveToleranceMinutes: Number(row.early_leave_tolerance_minutes || 0),
    workingDays: parseWorkingDays(row.working_days), isActive: Number(row.is_active) === 1,
  };
}

function mapRecord(row) {
  if (!row) return null;
  return {
    id: normalizeText(row.id), accessId: normalizeText(row.access_id) || null,
    accountUid: normalizeText(row.account_uid), accountEmail: normalizeText(row.account_email) || null,
    displayName: normalizeText(row.display_name) || null, attendanceDate: normalizeText(row.attendance_date),
    checkInAt: normalizeText(row.check_in_at) || null, checkOutAt: normalizeText(row.check_out_at) || null,
    shiftId: normalizeText(row.shift_id) || null,
    scheduledStartAt: normalizeText(row.scheduled_start_at) || null, scheduledEndAt: normalizeText(row.scheduled_end_at) || null,
    attendanceStatus: normalizeText(row.attendance_status) || null,
    lateMinutes: Number(row.late_minutes || 0), earlyLeaveMinutes: Number(row.early_leave_minutes || 0),
    workedMinutes: row.worked_minutes == null ? null : Number(row.worked_minutes), notes: normalizeText(row.notes) || null,
  };
}

function mapOverride(row) {
  if (!row) return null;
  return {
    id: normalizeText(row.id), accessId: normalizeText(row.access_id), date: normalizeText(row.attendance_date),
    type: normalizeText(row.override_type), dayPortion: normalizeText(row.day_portion) || "full_day",
    reason: normalizeText(row.reason) || null, createdAt: normalizeText(row.created_at) || null,
    updatedAt: normalizeText(row.updated_at) || null,
  };
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
      action, entityType, entityId || null,
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after),
      nowIso()
    ).run();
  } catch (error) {
    console.warn("[habat-v3] audit write failed", error);
  }
}

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text && text !== "undefined" && text !== "null" ? text : "";
}
function normalizeDate(value) {
  const text = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}
function normalizeMonth(value) {
  const text = normalizeText(value);
  return /^\d{4}-\d{2}$/.test(text) ? text : "";
}
function normalizeTime(value) {
  const text = normalizeText(value);
  return /^\d{2}:\d{2}$/.test(text) ? text : "09:00";
}
function normalizeIso(value) {
  const text = normalizeText(value);
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}
function normalizeOptionalIso(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
function parseWorkingDays(value) {
  return String(value ?? "").split(",").map(item => Number(item)).filter(item => Number.isInteger(item) && item >= 0 && item <= 6);
}
function weekdayIndex(date) {
  return new Date(`${date}T12:00:00+03:00`).getDay();
}
function monthRange(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}
function enumerateDateKeys(from, to) {
  const result = [];
  let cursor = new Date(`${from}T12:00:00+03:00`);
  const end = new Date(`${to}T12:00:00+03:00`);
  while (cursor.getTime() <= end.getTime()) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(cursor);
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    result.push(`${map.year}-${map.month}-${map.day}`);
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return result;
}
function getRiyadhDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function safeJson(value) {
  try { return JSON.parse(String(value || "null")); } catch { return null; }
}
function nowIso() { return new Date().toISOString(); }
async function readJsonBody(request) {
  try { return { ok: true, value: await request.json() }; }
  catch { return { ok: false, response: json(400, { ok: false, message: "invalid_json" }) }; }
}
function methodNotAllowed(allowed) {
  return new Response(JSON.stringify({ ok: false, message: "method_not_allowed" }), {
    status: 405, headers: { "Content-Type": "application/json; charset=utf-8", Allow: allowed.join(", ") },
  });
}
function forbidden(message) { return json(403, { ok: false, message }); }
function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
