import { resolveWorkforceScheduleDay } from "./workforce-schedule-control.js";
import { resolveWorkforceEmployeeBySource } from "./workforce-day-state.js";

import { prepareAttendanceMutationGuard } from "./workforce-mutation-guard.js";
const HABAT_ACCESS_LEVELS = new Set(["employee", "manager"]);
const WORKFORCE_TENANT_ID = "restaurant_tenant_habat_alwaraq";
const HABAT_DEFAULT_SHIFT_ID = "habat_shift_default";
const HABAT_MAX_REPORT_DAYS = 93;
const HABAT_DEFAULT_RECORD_LIMIT = 200;
const HABAT_MAX_RECORD_LIMIT = 500;
const HABAT_MAX_GEOFENCE_ACCURACY_TOLERANCE_M = 20;
const HABAT_GEOFENCE_ACCURACY_TOLERANCE_RATIO = 0.5;
const HABAT_MAX_GEOFENCE_TOLERANCE_RADIUS_RATIO = 0.2;

export async function handleHabatAttendanceV2Request({
  request,
  url,
  db,
  resolveRequesterContext,
}) {
  if (!db) return json(500, { ok: false, message: "habat_attendance_database_unavailable" });
  if (typeof resolveRequesterContext !== "function") {
    return json(500, { ok: false, message: "habat_attendance_auth_unavailable" });
  }

  const pathname = normalizePathname(url?.pathname);
  if (!pathname.startsWith("/attendance/habat/v2/")) {
    return json(404, { ok: false, message: "not_found" });
  }

  const requester = await resolveRequesterContext(request);
  if (!requester?.ok) return requester?.response || json(401, { ok: false, message: "unauthorized" });
  if (!requester.runtime?.isActive) {
    return json(403, { ok: false, message: "inactive_account" });
  }

  const principal = await resolvePrincipal(db, requester);
  if (!principal.ok) return principal.response;

  const subpath = pathname.slice("/attendance/habat/v2".length) || "/";
  const shiftMatch = subpath.match(/^\/shifts\/([^/]+)$/);
  const recordCorrectionMatch = subpath.match(/^\/records\/([^/]+)\/correct$/);

  if (subpath === "/context") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return getContext(db, requester, principal);
  }

  if (subpath === "/check-in") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    if (!principal.canClock) return forbidden("habat_clock_forbidden");
    return clockIn(db, request, requester, principal);
  }

  if (subpath === "/check-out") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    if (!principal.canClock) return forbidden("habat_clock_forbidden");
    return clockOut(db, request, requester, principal);
  }

  if (subpath === "/my-history") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return listMyHistory(db, requester, url);
  }

  if (!principal.canManage) {
    return forbidden("habat_management_forbidden");
  }

  if (subpath === "/dashboard") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return getDashboard(db);
  }

  if (subpath === "/settings") {
    if (request.method === "GET") return getSettingsResponse(db);
    if (request.method === "PATCH") return updateSettings(db, request, requester);
    return methodNotAllowed(["GET", "PATCH"]);
  }

  if (subpath === "/shifts") {
    if (request.method === "GET") return listShifts(db);
    if (request.method === "POST") return createShift(db, request, requester);
    return methodNotAllowed(["GET", "POST"]);
  }

  if (shiftMatch) {
    const shiftId = decodeURIComponent(shiftMatch[1]);
    if (request.method === "PATCH") return updateShift(db, request, requester, shiftId);
    if (request.method === "DELETE") return deactivateShift(db, requester, shiftId);
    return methodNotAllowed(["PATCH", "DELETE"]);
  }

  if (subpath === "/assignments") {
    if (request.method === "GET") return listAssignments(db, url);
    if (request.method === "POST") return assignShift(db, request, requester);
    return methodNotAllowed(["GET", "POST"]);
  }

  if (subpath === "/records") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return listRecords(db, url);
  }

  if (recordCorrectionMatch) {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    return correctRecord(
      db,
      request,
      requester,
      decodeURIComponent(recordCorrectionMatch[1])
    );
  }

  if (subpath === "/reports/summary") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return getSummaryReport(db, url);
  }

  return json(404, { ok: false, message: "not_found" });
}

async function resolvePrincipal(db, requester) {
  const accessId = normalizeText(requester?.accessId);
  const uid = normalizeText(requester?.uid);
  const email = normalizeText(requester?.email).toLowerCase();
  const runtimeRole = normalizeText(requester?.runtime?.role).toLowerCase();
  const fallbackName = resolveRequesterDisplayName(requester);

  if (runtimeRole === "owner" && !accessId) {
    return {
      ok: true,
      bootstrapOwner: true,
      accessId: null,
      uid,
      email,
      displayName: fallbackName || email || "المالك",
      accessLevel: "manager",
      canManage: true,
      canClock: false,
    };
  }

  if (!accessId && !uid && !email) {
    return {
      ok: false,
      response: forbidden("habat_access_forbidden"),
    };
  }

  try {
    let row = null;

    // Native Habat sessions are bound to the canonical access row.
    // Never re-resolve a known authenticated identity from legacy uid/email.
    if (accessId) {
      row = await db
        .prepare(
          `SELECT id, uid, email, display_name, access_level, clock_enabled, is_active
           FROM habat_attendance_access
           WHERE id = ? AND is_active = 1
           LIMIT 1`
        )
        .bind(accessId)
        .first();

      if (!row) {
        return {
          ok: false,
          response: forbidden("habat_access_forbidden"),
        };
      }
    } else {
      row = await db
        .prepare(
          `SELECT id, uid, email, display_name, access_level, clock_enabled, is_active
           FROM habat_attendance_access
           WHERE is_active = 1
             AND ((uid IS NOT NULL AND uid = ?) OR lower(email) = ?)
           ORDER BY CASE WHEN uid = ? THEN 0 ELSE 1 END, created_at ASC
           LIMIT 1`
        )
        .bind(uid, email, uid)
        .first();

      if (!row) {
        if (runtimeRole === "owner") {
          return {
            ok: true,
            bootstrapOwner: true,
            accessId: null,
            uid,
            email,
            displayName: fallbackName || email || "المالك",
            accessLevel: "manager",
            canManage: true,
            canClock: false,
          };
        }

        return {
          ok: false,
          response: forbidden("habat_access_forbidden"),
        };
      }

      const rowUid = normalizeText(row.uid);

      if (
        !rowUid &&
        uid &&
        email &&
        normalizeText(row.email).toLowerCase() === email
      ) {
        try {
          await db
            .prepare(
              `UPDATE habat_attendance_access
               SET uid = ?, updated_at = ?
               WHERE id = ? AND (uid IS NULL OR trim(uid) = '')`
            )
            .bind(uid, nowIso(), row.id)
            .run();
        } catch (error) {
          console.warn("[habat-v2] access uid backfill skipped", error);
        }
      }
    }

    const accessLevel = HABAT_ACCESS_LEVELS.has(
      normalizeText(row.access_level)
    )
      ? normalizeText(row.access_level)
      : "employee";

    return {
      ok: true,
      bootstrapOwner: false,
      accessId: normalizeText(row.id),
      uid: normalizeText(row.uid) || uid || null,
      email: normalizeText(row.email).toLowerCase() || email,
      displayName:
        normalizeText(row.display_name) ||
        fallbackName ||
        email ||
        "المستخدم",
      accessLevel,
      canManage: accessLevel === "manager",
      canClock: Number(row.clock_enabled) === 1,
    };
  } catch (error) {
    console.error("[habat-v2] principal lookup failed", error);

    return {
      ok: false,
      response: json(500, {
        ok: false,
        message: "habat_access_lookup_failed",
      }),
    };
  }
}

async function getContext(db, requester, principal) {
  const date = getRiyadhDateKey();
  const settings = await getSettings(db);
  const record = await getTodayRecord(db, requester.uid, principal.accessId);
  const shift = principal.accessId
    ? await resolveShiftForAccess(db, principal.accessId, date)
    : await getDefaultShift(db);

  return json(200, {
    ok: true,
    principal: mapPrincipal(principal),
    date,
    today: mapRecord(record),
    shift: mapShift(shift),
    settings: mapPublicSettings(settings),
  });
}

async function getDashboard(db) {
  const date = getRiyadhDateKey();
  const [settings, defaultShift, accountsResult, recordsResult] = await Promise.all([
    getSettings(db),
    getDefaultShift(db),
    db.prepare(
      `SELECT id, uid, email, display_name, access_level, clock_enabled, is_active
       FROM habat_attendance_access
       WHERE is_active = 1 AND clock_enabled = 1
       ORDER BY display_name COLLATE NOCASE ASC, email ASC`
    ).all(),
    db.prepare(
      `SELECT * FROM habat_attendance_records
       WHERE attendance_date = ?
       ORDER BY check_in_at ASC`
    ).bind(date).all(),
  ]);

  const recordsByAccess = new Map();
  const recordsByUid = new Map();
  for (const row of recordsResult?.results || []) {
    if (normalizeText(row.access_id)) recordsByAccess.set(normalizeText(row.access_id), row);
    if (normalizeText(row.account_uid)) recordsByUid.set(normalizeText(row.account_uid), row);
  }

  const now = new Date();
  const employees = [];
  const counts = {
    employees: 0,
    presentNow: 0,
    checkedOut: 0,
    late: 0,
    absent: 0,
    notStarted: 0,
    offDay: 0,
    incomplete: 0,
  };

  for (const account of accountsResult?.results || []) {
    counts.employees += 1;
    const accessId = normalizeText(account.id);
    const shift = (await resolveShiftForAccess(db, accessId, date)) || defaultShift;
    const record = recordsByAccess.get(accessId) || recordsByUid.get(normalizeText(account.uid)) || null;
    const schedule = shift ? buildScheduleWindow(date, shift) : null;
    const workDay = shift ? isWorkingDay(date, shift) : true;
    let liveStatus = "not_started";

    if (!workDay) {
      liveStatus = "off_day";
      counts.offDay += 1;
    } else if (record?.check_out_at) {
      liveStatus = "checked_out";
      counts.checkedOut += 1;
    } else if (record?.check_in_at) {
      liveStatus = "present_now";
      counts.presentNow += 1;
      if (String(record.attendance_status || "").includes("late")) counts.late += 1;
    } else if (schedule && now.getTime() > schedule.start.getTime() + Number(shift.grace_minutes || 0) * 60000) {
      liveStatus = "absent";
      counts.absent += 1;
    } else {
      counts.notStarted += 1;
    }

    if (record?.check_in_at && !record?.check_out_at && date < getRiyadhDateKey()) {
      counts.incomplete += 1;
    }

    employees.push({
      id: accessId,
      email: normalizeText(account.email).toLowerCase(),
      displayName: normalizeText(account.display_name) || normalizeText(account.email),
      liveStatus,
      shift: mapShift(shift),
      record: mapRecord(record),
    });
  }

  return json(200, {
    ok: true,
    date,
    timezone: settings.timezone,
    counts,
    employees,
  });
}

async function clockIn(db, request, requester, principal) {
  const uid = normalizeText(requester.uid);
  if (!uid) return forbidden("habat_clock_forbidden");

  const date = getRiyadhDateKey();
  const existing = await getTodayRecord(db, uid, principal.accessId);
  // attendance_clockIn_guard_applied
  const workforceGuard = principal.accessId
    ? await prepareAttendanceMutationGuard({
        db,
        tenantId: "restaurant_tenant_habat_alwaraq",
        sourceEmployeeId: principal.accessId,
        attendanceDate: date,
        currentRecord: existing,
        mutation: "check_in",
      })
    : null;
if (existing?.check_in_at) {
    return json(409, {
      ok: false,
      message: "habat_already_checked_in",
      record: mapRecord(existing),
    });
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const settings = await getSettings(db);
  const location = validateClockLocation(settings, body.value);
  if (!location.ok) return location.response;

  const shift = principal.accessId
    ? await resolveShiftForAccess(db, principal.accessId, date)
    : await getDefaultShift(db);
  if (!shift) {
    return json(409, { ok: false, message: "habat_shift_not_configured" });
  }
  if (!isWorkingDay(date, shift)) {
    return json(409, { ok: false, message: "habat_non_working_day" });
  }

  const schedule = buildScheduleWindow(date, shift);
  const now = new Date();
  const lateMinutes = Math.max(
    0,
    Math.floor((now.getTime() - schedule.start.getTime()) / 60000)
  );
  const status = lateMinutes > Number(shift.grace_minutes || 0) ? "late" : "present";
  const id = `habat_${crypto.randomUUID()}`;
  const meta = readRequestMetadata(request);
  const created = nowIso();

  try {
    if (existing) {
      await db.prepare(
        `UPDATE habat_attendance_records
         SET access_id = ?, account_email = ?, display_name = ?,
             check_in_at = ?, check_in_ip = ?, check_in_user_agent = ?,
             shift_id = ?, scheduled_start_at = ?, scheduled_end_at = ?,
             attendance_status = ?, late_minutes = ?,
             check_in_latitude = ?, check_in_longitude = ?,
             check_in_accuracy_m = ?, check_in_distance_m = ?, updated_at = ?
         WHERE id = ?`
      ).bind(
        principal.accessId || null,
        principal.email || null,
        principal.displayName || null,
        created,
        meta.ip,
        meta.userAgent,
        normalizeText(shift.id) || null,
        schedule.start.toISOString(),
        schedule.end.toISOString(),
        status,
        lateMinutes,
        location.latitude,
        location.longitude,
        location.accuracyM,
        location.distanceM,
        created,
        existing.id
      ).run();
    } else {
      await db.prepare(
        `INSERT INTO habat_attendance_records (
          id, access_id, account_uid, account_email, display_name,
          attendance_date, check_in_at, check_in_ip, check_in_user_agent,
          shift_id, scheduled_start_at, scheduled_end_at, attendance_status,
          late_minutes, early_leave_minutes,
          check_in_latitude, check_in_longitude, check_in_accuracy_m, check_in_distance_m,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        principal.accessId || null,
        uid,
        principal.email || null,
        principal.displayName || null,
        date,
        created,
        meta.ip,
        meta.userAgent,
        normalizeText(shift.id) || null,
        schedule.start.toISOString(),
        schedule.end.toISOString(),
        status,
        lateMinutes,
        location.latitude,
        location.longitude,
        location.accuracyM,
        location.distanceM,
        created,
        created
      ).run();
    }

  // payroll_stale_after_clockIn
  if (workforceGuard?.staleStatements?.length) {
    await db.batch(workforceGuard.staleStatements);
  }

    const record = await getTodayRecord(db, uid, principal.accessId);
    await writeAudit(db, requester, "check_in_v2", "habat_attendance_record", record?.id || id, existing || null, record);
    return json(200, { ok: true, record: mapRecord(record) });
  } catch (error) {
    console.error("[habat-v2] check-in failed", error);
    return json(500, { ok: false, message: "habat_check_in_failed" });
  }
}

async function clockOut(db, request, requester, principal) {
  const uid = normalizeText(requester.uid);
  if (!uid) return forbidden("habat_clock_forbidden");

  const existing = await getTodayRecord(db, uid, principal.accessId);
  // attendance_clockOut_guard_applied
  const workforceGuard = principal.accessId && existing
    ? await prepareAttendanceMutationGuard({
        db,
        tenantId: "restaurant_tenant_habat_alwaraq",
        sourceEmployeeId: principal.accessId,
        attendanceDate: existing.attendance_date || getRiyadhDateKey(),
        currentRecord: existing,
        mutation: "check_out",
      })
    : null;
if (!existing?.check_in_at) {
    return json(409, { ok: false, message: "habat_check_in_required" });
  }
  if (existing.check_out_at) {
    return json(409, {
      ok: false,
      message: "habat_already_checked_out",
      record: mapRecord(existing),
    });
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const settings = await getSettings(db);
  const location = validateClockLocation(settings, body.value);
  if (!location.ok) return location.response;

  const now = new Date();
  const checkIn = new Date(existing.check_in_at);
  const scheduledEnd = existing.scheduled_end_at ? new Date(existing.scheduled_end_at) : null;
  const lateMinutes = Number(existing.late_minutes || 0);
  const shift = existing.shift_id
    ? await getShiftById(db, existing.shift_id)
    : principal.accessId
      ? await resolveShiftForAccess(db, principal.accessId, existing.attendance_date)
      : await getDefaultShift(db);
  const earlyTolerance = Number(shift?.early_leave_tolerance_minutes || 0);
  const earlyLeaveMinutes = scheduledEnd
    ? Math.max(0, Math.floor((scheduledEnd.getTime() - now.getTime()) / 60000))
    : 0;
  const isEarly = earlyLeaveMinutes > earlyTolerance;
  const isLate = lateMinutes > Number(shift?.grace_minutes || 0);
  const status = isLate && isEarly
    ? "late_early_leave"
    : isLate
      ? "late"
      : isEarly
        ? "early_leave"
        : "present";
  const workedMinutes = Number.isFinite(checkIn.getTime())
    ? Math.max(0, Math.floor((now.getTime() - checkIn.getTime()) / 60000))
    : null;
  const meta = readRequestMetadata(request);
  const updated = nowIso();

  try {
    await db.prepare(
      `UPDATE habat_attendance_records
       SET check_out_at = ?, check_out_ip = ?, check_out_user_agent = ?,
           attendance_status = ?, early_leave_minutes = ?, worked_minutes = ?,
           check_out_latitude = ?, check_out_longitude = ?,
           check_out_accuracy_m = ?, check_out_distance_m = ?,
           account_email = ?, display_name = ?, access_id = ?, updated_at = ?
       WHERE id = ?`
    ).bind(
      updated,
      meta.ip,
      meta.userAgent,
      status,
      earlyLeaveMinutes,
      workedMinutes,
      location.latitude,
      location.longitude,
      location.accuracyM,
      location.distanceM,
      principal.email || null,
      principal.displayName || null,
      principal.accessId || existing.access_id || null,
      updated,
      existing.id
    ).run();

  // payroll_stale_after_clockOut
  if (workforceGuard?.staleStatements?.length) {
    await db.batch(workforceGuard.staleStatements);
  }

    const record = await getTodayRecord(db, uid, principal.accessId);
    await writeAudit(db, requester, "check_out_v2", "habat_attendance_record", existing.id, existing, record);
    return json(200, { ok: true, record: mapRecord(record) });
  } catch (error) {
    console.error("[habat-v2] check-out failed", error);
    return json(500, { ok: false, message: "habat_check_out_failed" });
  }
}

async function listMyHistory(db, requester, url) {
  const uid = normalizeText(requester.uid);
  if (!uid) return forbidden("habat_access_forbidden");

  const to = normalizeDateKey(url.searchParams.get("to")) || getRiyadhDateKey();
  const from = normalizeDateKey(url.searchParams.get("from")) || shiftDateKey(to, -30);
  try {
    const result = await db.prepare(
      `SELECT * FROM habat_attendance_records
       WHERE account_uid = ? AND attendance_date >= ? AND attendance_date <= ?
       ORDER BY attendance_date DESC
       LIMIT 120`
    ).bind(uid, from, to).all();

    return json(200, {
      ok: true,
      from,
      to,
      records: (result?.results || []).map(mapRecord),
    });
  } catch (error) {
    console.error("[habat-v2] my history failed", error);
    return json(500, { ok: false, message: "habat_records_query_failed" });
  }
}

async function getSettingsResponse(db) {
  return json(200, { ok: true, settings: mapSettings(await getSettings(db)) });
}

async function getSettings(db) {
  let row = await db.prepare(
    `SELECT * FROM habat_attendance_settings WHERE id = 'default' LIMIT 1`
  ).first();

  if (!row) {
    await db.prepare(
      `INSERT INTO habat_attendance_settings (
        id, timezone, location_required, latitude, longitude, radius_m, max_accuracy_m, updated_at
       ) VALUES ('default', 'Asia/Riyadh', 0, NULL, NULL, 100, 150, ?)`
    ).bind(nowIso()).run();
    row = await db.prepare(
      `SELECT * FROM habat_attendance_settings WHERE id = 'default' LIMIT 1`
    ).first();
  }
  return row || {
    id: "default",
    timezone: "Asia/Riyadh",
    location_required: 0,
    latitude: null,
    longitude: null,
    radius_m: 100,
    max_accuracy_m: 150,
  };
}

async function updateSettings(db, request, requester) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const current = await getSettings(db);
  const locationRequired = body.value?.locationRequired === undefined
    ? Number(current.location_required) === 1
    : Boolean(body.value.locationRequired);
  const latitude = normalizeNullableNumber(
    body.value?.latitude === undefined ? current.latitude : body.value.latitude
  );
  const longitude = normalizeNullableNumber(
    body.value?.longitude === undefined ? current.longitude : body.value.longitude
  );
  const radiusM = clampNumber(
    body.value?.radiusM === undefined ? current.radius_m : body.value.radiusM,
    10,
    5000,
    100
  );
  const maxAccuracyM = clampNumber(
    body.value?.maxAccuracyM === undefined ? current.max_accuracy_m : body.value.maxAccuracyM,
    10,
    1000,
    150
  );

  if (latitude !== null && (latitude < -90 || latitude > 90)) {
    return json(400, { ok: false, message: "habat_invalid_latitude" });
  }
  if (longitude !== null && (longitude < -180 || longitude > 180)) {
    return json(400, { ok: false, message: "habat_invalid_longitude" });
  }
  if (locationRequired && (latitude === null || longitude === null)) {
    return json(400, { ok: false, message: "habat_location_coordinates_required" });
  }

  try {
    await db.prepare(
      `UPDATE habat_attendance_settings
       SET timezone = 'Asia/Riyadh', location_required = ?, latitude = ?, longitude = ?,
           radius_m = ?, max_accuracy_m = ?, updated_by_uid = ?, updated_by_email = ?,
           updated_at = ?
       WHERE id = 'default'`
    ).bind(
      locationRequired ? 1 : 0,
      latitude,
      longitude,
      radiusM,
      maxAccuracyM,
      normalizeText(requester.uid) || null,
      normalizeText(requester.email).toLowerCase() || null,
      nowIso()
    ).run();

    const next = await getSettings(db);
    await writeAudit(db, requester, "update_settings", "habat_attendance_settings", "default", current, next);
    return json(200, { ok: true, settings: mapSettings(next) });
  } catch (error) {
    console.error("[habat-v2] settings update failed", error);
    return json(500, { ok: false, message: "habat_settings_update_failed" });
  }
}

async function listShifts(db) {
  try {
    const result = await db.prepare(
      `SELECT * FROM habat_attendance_shifts
       ORDER BY is_active DESC, name COLLATE NOCASE ASC, created_at ASC`
    ).all();
    return json(200, { ok: true, shifts: (result?.results || []).map(mapShift) });
  } catch (error) {
    console.error("[habat-v2] shift list failed", error);
    return json(500, { ok: false, message: "habat_shift_list_failed" });
  }
}

async function createShift(db, request, requester) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = parseShiftInput(body.value);
  if (!parsed.ok) return parsed.response;

  const id = `habat_shift_${crypto.randomUUID()}`;
  const now = nowIso();
  const draft = {
    id,
    name: parsed.value.name,
    start_time: parsed.value.startTime,
    end_time: parsed.value.endTime,
    grace_minutes: parsed.value.graceMinutes,
    early_leave_tolerance_minutes: parsed.value.earlyLeaveToleranceMinutes,
    working_days: parsed.value.workingDays.join(","),
    is_active: 1,
    created_at: now,
    updated_at: now,
  };

  try {
    await db.batch([
      db.prepare(
        `INSERT INTO habat_attendance_shifts (
          id, name, start_time, end_time, grace_minutes,
          early_leave_tolerance_minutes, working_days, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).bind(
        id, draft.name, draft.start_time, draft.end_time,
        draft.grace_minutes, draft.early_leave_tolerance_minutes,
        draft.working_days, now, now
      ),
      buildWorkforceTemplateSyncStatement(db, draft),
    ]);

    const row = await getShiftById(db, id);
    await writeAudit(db, requester, "create_shift", "habat_attendance_shift", id, null, row);
    return json(200, { ok: true, shift: mapShift(row) });
  } catch (error) {
    console.error("[habat-v2] shift create failed", error);
    return json(500, { ok: false, message: "habat_shift_create_failed" });
  }
}
async function updateShift(db, request, requester, id) {
  const current = await getShiftById(db, id);
  if (!current) return json(404, { ok: false, message: "habat_shift_not_found" });

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = parseShiftInput({
    name: body.value?.name ?? current.name,
    startTime: body.value?.startTime ?? current.start_time,
    endTime: body.value?.endTime ?? current.end_time,
    graceMinutes: body.value?.graceMinutes ?? current.grace_minutes,
    earlyLeaveToleranceMinutes:
      body.value?.earlyLeaveToleranceMinutes ?? current.early_leave_tolerance_minutes,
    workingDays: body.value?.workingDays ?? parseWorkingDays(current.working_days),
  });
  if (!parsed.ok) return parsed.response;

  const isActive = body.value?.isActive === undefined
    ? Number(current.is_active) === 1
    : Boolean(body.value.isActive);

  const workforceTemplateId = `wf_sched_${id}`;
  if (await findLockedPayrollForTemplate(db, workforceTemplateId)) {
    return json(409, { ok: false, message: "workforce_payroll_period_locked" });
  }

  const now = nowIso();
  const draft = {
    ...current,
    name: parsed.value.name,
    start_time: parsed.value.startTime,
    end_time: parsed.value.endTime,
    grace_minutes: parsed.value.graceMinutes,
    early_leave_tolerance_minutes: parsed.value.earlyLeaveToleranceMinutes,
    working_days: parsed.value.workingDays.join(","),
    is_active: isActive ? 1 : 0,
    updated_at: now,
  };

  try {
    await db.batch([
      db.prepare(
        `UPDATE habat_attendance_shifts
          SET name = ?, start_time = ?, end_time = ?, grace_minutes = ?,
              early_leave_tolerance_minutes = ?, working_days = ?, is_active = ?, updated_at = ?
          WHERE id = ?`
      ).bind(
        draft.name, draft.start_time, draft.end_time, draft.grace_minutes,
        draft.early_leave_tolerance_minutes, draft.working_days,
        draft.is_active, now, id
      ),
      buildWorkforceTemplateSyncStatement(db, draft),
      buildTemplatePayrollStaleStatement(db, workforceTemplateId, now, "schedule_template_changed"),
    ]);

    const next = await getShiftById(db, id);
    await writeAudit(db, requester, "update_shift", "habat_attendance_shift", id, current, next);
    return json(200, { ok: true, shift: mapShift(next) });
  } catch (error) {
    console.error("[habat-v2] shift update failed", error);
    return json(500, { ok: false, message: "habat_shift_update_failed" });
  }
}
async function deactivateShift(db, requester, id) {
  const current = await getShiftById(db, id);
  if (!current) return json(404, { ok: false, message: "habat_shift_not_found" });
  if (id === HABAT_DEFAULT_SHIFT_ID) {
    return json(409, { ok: false, message: "habat_default_shift_cannot_be_deleted" });
  }

  const workforceTemplateId = `wf_sched_${id}`;
  const activeAssignment = await db.prepare(
    `SELECT id FROM workforce_schedule_assignments
      WHERE tenant_id = ? AND template_id = ?
        AND (effective_to IS NULL OR effective_to >= ?)
      LIMIT 1`
  ).bind(WORKFORCE_TENANT_ID, workforceTemplateId, getRiyadhDateKey()).first();

  if (activeAssignment) {
    return json(409, { ok: false, message: "workforce_schedule_template_in_use" });
  }
  if (await findLockedPayrollForTemplate(db, workforceTemplateId)) {
    return json(409, { ok: false, message: "workforce_payroll_period_locked" });
  }

  const now = nowIso();
  const draft = { ...current, is_active: 0, updated_at: now };

  try {
    await db.batch([
      db.prepare(
        `UPDATE habat_attendance_shifts
          SET is_active = 0, updated_at = ?
          WHERE id = ?`
      ).bind(now, id),
      buildWorkforceTemplateSyncStatement(db, draft),
      buildTemplatePayrollStaleStatement(db, workforceTemplateId, now, "schedule_template_deactivated"),
    ]);

    const next = await getShiftById(db, id);
    await writeAudit(db, requester, "deactivate_shift", "habat_attendance_shift", id, current, next);
    return json(200, { ok: true, shift: mapShift(next) });
  } catch (error) {
    console.error("[habat-v2] shift deactivate failed", error);
    return json(500, { ok: false, message: "habat_shift_update_failed" });
  }
}
async function listAssignments(db, url) {
  const accessId = normalizeText(url.searchParams.get("accessId"));
  const clauses = [];
  const bindings = [];
  if (accessId) {
    clauses.push("a.access_id = ?");
    bindings.push(accessId);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  try {
    const statement = db.prepare(
      `SELECT a.*, s.name AS shift_name, s.start_time, s.end_time,
              x.email, x.display_name
       FROM habat_attendance_shift_assignments a
       JOIN habat_attendance_shifts s ON s.id = a.shift_id
       JOIN habat_attendance_access x ON x.id = a.access_id
       ${where}
       ORDER BY a.effective_from DESC, a.created_at DESC`
    );
    const result = bindings.length ? await statement.bind(...bindings).all() : await statement.all();

    return json(200, {
      ok: true,
      assignments: (result?.results || []).map(mapAssignment),
    });
  } catch (error) {
    console.error("[habat-v2] assignment list failed", error);
    return json(500, { ok: false, message: "habat_assignment_list_failed" });
  }
}

async function assignShift(db, request, requester) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const accessId = normalizeText(body.value?.accessId);
  const shiftId = normalizeText(body.value?.shiftId);
  const effectiveFrom = normalizeDateKey(body.value?.effectiveFrom) || getRiyadhDateKey();

  if (!accessId || !shiftId) {
    return json(400, { ok: false, message: "habat_assignment_fields_required" });
  }

  const [access, shift, employee] = await Promise.all([
    db.prepare(`SELECT * FROM habat_attendance_access WHERE id = ? LIMIT 1`).bind(accessId).first(),
    getShiftById(db, shiftId),
    resolveWorkforceEmployeeBySource(db, WORKFORCE_TENANT_ID, accessId),
  ]);

  if (!access) return json(404, { ok: false, message: "habat_access_not_found" });
  if (!shift || Number(shift.is_active) !== 1) {
    return json(404, { ok: false, message: "habat_shift_not_found" });
  }
  if (!employee?.id) {
    return json(409, { ok: false, message: "workforce_employee_not_linked" });
  }

  const startMonth = effectiveFrom.slice(0, 7);
  const locked = await db.prepare(
    `SELECT id FROM workforce_payroll_entries
      WHERE tenant_id = ? AND employee_id = ?
        AND month_key >= ?
        AND status IN ('reviewed','approved','paid')
      LIMIT 1`
  ).bind(WORKFORCE_TENANT_ID, employee.id, startMonth).first();

  if (locked) {
    return json(409, { ok: false, message: "workforce_payroll_period_locked" });
  }

  const previousEnd = shiftDateKey(effectiveFrom, -1);
  const id = `habat_assignment_${crypto.randomUUID()}`;
  const workforceAssignmentId = `wf_asg_${id}`;
  const now = nowIso();

  const workingDays = parseWorkingDays(shift.working_days);
  const days = {};
  for (let day = 0; day <= 6; day += 1) {
    days[String(day)] = workingDays.includes(day)
      ? { kind: "work", templateId: `wf_sched_${shiftId}` }
      : { kind: "rest" };
  }
  const restDays = [0,1,2,3,4,5,6].filter(day => !workingDays.includes(day));
  const weekPattern = { version: 2, days, workingDays, restDays };

  try {
    await db.batch([
      db.prepare(
        `UPDATE habat_attendance_shift_assignments
          SET effective_to = ?
          WHERE access_id = ?
            AND effective_from < ?
            AND (effective_to IS NULL OR effective_to >= ?)`
      ).bind(previousEnd, accessId, effectiveFrom, effectiveFrom),

      db.prepare(
        `DELETE FROM habat_attendance_shift_assignments
          WHERE access_id = ? AND effective_from >= ?`
      ).bind(accessId, effectiveFrom),

      db.prepare(
        `INSERT INTO habat_attendance_shift_assignments (
          id, access_id, shift_id, effective_from, effective_to,
          created_by_uid, created_by_email, created_at
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`
      ).bind(
        id, accessId, shiftId, effectiveFrom,
        normalizeText(requester.uid) || null,
        normalizeText(requester.email).toLowerCase() || null,
        now
      ),

      db.prepare(
        `UPDATE workforce_schedule_assignments
          SET effective_to = ?, updated_at = ?
          WHERE tenant_id = ? AND employee_id = ?
            AND effective_from < ?
            AND (effective_to IS NULL OR effective_to >= ?)`
      ).bind(previousEnd, now, WORKFORCE_TENANT_ID, employee.id, effectiveFrom, effectiveFrom),

      db.prepare(
        `DELETE FROM workforce_schedule_assignments
          WHERE tenant_id = ? AND employee_id = ? AND effective_from >= ?`
      ).bind(WORKFORCE_TENANT_ID, employee.id, effectiveFrom),

      db.prepare(
        `INSERT INTO workforce_schedule_assignments (
          id, tenant_id, employee_id, template_id, effective_from, effective_to,
          weekly_rest_weekday, week_pattern_json, reason, operation_id,
          created_by_uid, created_by_email, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 'legacy_habat_assignment', ?, ?, ?, ?, ?)`
      ).bind(
        workforceAssignmentId,
        WORKFORCE_TENANT_ID,
        employee.id,
        `wf_sched_${shiftId}`,
        effectiveFrom,
        restDays.length === 1 ? restDays[0] : null,
        JSON.stringify(weekPattern),
        `legacy_habat_assignment:${id}`,
        normalizeText(requester.uid) || null,
        normalizeText(requester.email).toLowerCase() || null,
        now,
        now
      ),

      db.prepare(
        `UPDATE workforce_payroll_entries
          SET calculation_snapshot_json =
            CASE
              WHEN calculation_snapshot_json IS NULL OR json_valid(calculation_snapshot_json)=0
                THEN json_object('stage','stale','staleAt',?,'staleReason','schedule_assignment_changed')
              ELSE json_set(
                calculation_snapshot_json,
                '$.stage','stale',
                '$.staleAt',?,
                '$.staleReason','schedule_assignment_changed'
              )
            END,
            updated_at = ?
          WHERE tenant_id = ? AND employee_id = ?
            AND month_key >= ? AND status = 'draft'`
      ).bind(now, now, now, WORKFORCE_TENANT_ID, employee.id, startMonth),
    ]);

    const row = await db.prepare(
      `SELECT a.*, s.name AS shift_name, s.start_time, s.end_time,
              x.email, x.display_name
        FROM habat_attendance_shift_assignments a
        JOIN habat_attendance_shifts s ON s.id = a.shift_id
        JOIN habat_attendance_access x ON x.id = a.access_id
        WHERE a.id = ? LIMIT 1`
    ).bind(id).first();

    await writeAudit(db, requester, "assign_shift", "habat_attendance_shift_assignment", id, null, row);
    return json(200, { ok: true, assignment: mapAssignment(row) });
  } catch (error) {
    console.error("[habat-v2] shift assignment failed", error);
    return json(500, { ok: false, message: "habat_assignment_create_failed" });
  }
}
async function listRecords(db, url) {
  const to = normalizeDateKey(url.searchParams.get("to")) || getRiyadhDateKey();
  const from = normalizeDateKey(url.searchParams.get("from")) || shiftDateKey(to, -30);
  const email = normalizeText(url.searchParams.get("email")).toLowerCase();
  const status = normalizeText(url.searchParams.get("status")).toLowerCase();
  const limit = clampInteger(
    url.searchParams.get("limit"),
    1,
    HABAT_MAX_RECORD_LIMIT,
    HABAT_DEFAULT_RECORD_LIMIT
  );

  const filters = ["attendance_date >= ?", "attendance_date <= ?"];
  const bindings = [from, to];
  if (email) {
    filters.push("lower(account_email) = ?");
    bindings.push(email);
  }
  if (status) {
    filters.push("attendance_status = ?");
    bindings.push(status);
  }

  try {
    const result = await db.prepare(
      `SELECT * FROM habat_attendance_records
       WHERE ${filters.join(" AND ")}
       ORDER BY attendance_date DESC, check_in_at DESC, id DESC
       LIMIT ?`
    ).bind(...bindings, limit).all();

    return json(200, {
      ok: true,
      from,
      to,
      limit,
      records: (result?.results || []).map(mapRecord),
    });
  } catch (error) {
    console.error("[habat-v2] records list failed", error);
    return json(500, { ok: false, message: "habat_records_query_failed" });
  }
}

async function correctRecord(db, request, requester, id) {
  const current = await db.prepare(
    `SELECT * FROM habat_attendance_records WHERE id = ? LIMIT 1`
  ).bind(id).first();
  if (!current) return json(404, { ok: false, message: "habat_record_not_found" });

  // attendance_correctRecord_guard_applied
  const correctionSourceId = normalizeText(current.access_id);
  const correctionGuard = correctionSourceId
    ? await prepareAttendanceMutationGuard({
        db,
        tenantId: "restaurant_tenant_habat_alwaraq",
        sourceEmployeeId: correctionSourceId,
        attendanceDate: normalizeText(current.attendance_date),
        currentRecord: current,
        mutation: "correction",
      })
    : null;
const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const reason = normalizeText(body.value?.reason);
  if (reason.length < 3) {
    return json(400, { ok: false, message: "habat_correction_reason_required" });
  }

  const checkInAt = normalizeOptionalIso(body.value?.checkInAt, current.check_in_at);
  const checkOutAt = normalizeOptionalIso(body.value?.checkOutAt, current.check_out_at);
  if (!checkInAt) {
    return json(400, { ok: false, message: "habat_check_in_required" });
  }
  if (checkOutAt && Date.parse(checkOutAt) < Date.parse(checkInAt)) {
    return json(400, { ok: false, message: "habat_invalid_attendance_order" });
  }

  const shift = current.shift_id
    ? await getShiftById(db, current.shift_id)
    : current.access_id
      ? await resolveShiftForAccess(db, current.access_id, current.attendance_date)
      : await getDefaultShift(db);
  const schedule = current.scheduled_start_at && current.scheduled_end_at
    ? {
        start: new Date(current.scheduled_start_at),
        end: new Date(current.scheduled_end_at),
      }
    : shift
      ? buildScheduleWindow(current.attendance_date, shift)
      : null;

  const metrics = calculateAttendanceMetrics({
    checkInAt,
    checkOutAt,
    shift,
    schedule,
  });

  const notePrefix = normalizeText(current.notes);
  const correctionNote = `تصحيح إداري: ${reason}`;
  const notes = notePrefix ? `${notePrefix}\n${correctionNote}` : correctionNote;

  try {
    await db.prepare(
      `UPDATE habat_attendance_records
       SET check_in_at = ?, check_out_at = ?, attendance_status = ?,
           late_minutes = ?, early_leave_minutes = ?, worked_minutes = ?,
           notes = ?, updated_at = ?
       WHERE id = ?`
    ).bind(
      checkInAt,
      checkOutAt,
      metrics.status,
      metrics.lateMinutes,
      metrics.earlyLeaveMinutes,
      metrics.workedMinutes,
      notes,
      nowIso(),
      id
    ).run();

  // payroll_stale_after_correctRecord
  if (correctionGuard?.staleStatements?.length) {
    await db.batch(correctionGuard.staleStatements);
  }

    const next = await db.prepare(
      `SELECT * FROM habat_attendance_records WHERE id = ? LIMIT 1`
    ).bind(id).first();
    await writeAudit(
      db,
      requester,
      "manager_correct_record",
      "habat_attendance_record",
      id,
      current,
      { ...next, correctionReason: reason }
    );
    return json(200, { ok: true, record: mapRecord(next) });
  } catch (error) {
    console.error("[habat-v2] record correction failed", error);
    return json(500, { ok: false, message: "habat_record_update_failed" });
  }
}

async function getSummaryReport(db, url) {
  const today = getRiyadhDateKey();
  const to = normalizeDateKey(url.searchParams.get("to")) || today;
  const requestedFrom = normalizeDateKey(url.searchParams.get("from")) || shiftDateKey(to, -30);
  const from = clampDateRangeStart(requestedFrom, to, HABAT_MAX_REPORT_DAYS);

  try {
    const [accountsResult, recordsResult, assignmentsResult, shiftsResult] = await Promise.all([
      db.prepare(
        `SELECT id, uid, email, display_name, clock_enabled, is_active
         FROM habat_attendance_access
         WHERE is_active = 1 AND clock_enabled = 1
         ORDER BY display_name COLLATE NOCASE ASC, email ASC`
      ).all(),
      db.prepare(
        `SELECT * FROM habat_attendance_records
         WHERE attendance_date >= ? AND attendance_date <= ?
         ORDER BY attendance_date ASC`
      ).bind(from, to).all(),
      db.prepare(
        `SELECT * FROM habat_attendance_shift_assignments
         WHERE effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
         ORDER BY access_id ASC, effective_from ASC`
      ).bind(to, from).all(),
      db.prepare(
        `SELECT * FROM habat_attendance_shifts`
      ).all(),
    ]);

    const shifts = new Map(
      (shiftsResult?.results || []).map(row => [normalizeText(row.id), row])
    );
    const defaultShift = shifts.get(HABAT_DEFAULT_SHIFT_ID) || null;
    const assignmentsByAccess = new Map();
    for (const assignment of assignmentsResult?.results || []) {
      const key = normalizeText(assignment.access_id);
      if (!assignmentsByAccess.has(key)) assignmentsByAccess.set(key, []);
      assignmentsByAccess.get(key).push(assignment);
    }

    const recordsByAccessDate = new Map();
    const recordsByUidDate = new Map();
    for (const row of recordsResult?.results || []) {
      const date = normalizeText(row.attendance_date);
      if (normalizeText(row.access_id)) {
        recordsByAccessDate.set(`${normalizeText(row.access_id)}|${date}`, row);
      }
      if (normalizeText(row.account_uid)) {
        recordsByUidDate.set(`${normalizeText(row.account_uid)}|${date}`, row);
      }
    }

    const dates = enumerateDateKeys(from, to).filter(date => date <= today);
    const now = new Date();
    const totals = {
      scheduledDays: 0,
      attendedDays: 0,
      absentDays: 0,
      lateDays: 0,
      earlyLeaveDays: 0,
      incompleteDays: 0,
      workedMinutes: 0,
    };
    const employees = [];

    for (const account of accountsResult?.results || []) {
      const employee = {
        accessId: normalizeText(account.id),
        email: normalizeText(account.email).toLowerCase(),
        displayName: normalizeText(account.display_name) || normalizeText(account.email),
        scheduledDays: 0,
        attendedDays: 0,
        absentDays: 0,
        lateDays: 0,
        earlyLeaveDays: 0,
        incompleteDays: 0,
        workedMinutes: 0,
      };

      for (const date of dates) {
        const assignment = resolveAssignmentFromList(
          assignmentsByAccess.get(employee.accessId) || [],
          date
        );
        const shift = assignment
          ? shifts.get(normalizeText(assignment.shift_id)) || defaultShift
          : defaultShift;
        if (!shift || Number(shift.is_active) !== 1 || !isWorkingDay(date, shift)) {
          continue;
        }

        const schedule = buildScheduleWindow(date, shift);
        if (date === today && now.getTime() <= schedule.start.getTime() + Number(shift.grace_minutes || 0) * 60000) {
          continue;
        }

        employee.scheduledDays += 1;
        totals.scheduledDays += 1;

        const record =
          recordsByAccessDate.get(`${employee.accessId}|${date}`) ||
          recordsByUidDate.get(`${normalizeText(account.uid)}|${date}`) ||
          null;

        if (!record?.check_in_at) {
          employee.absentDays += 1;
          totals.absentDays += 1;
          continue;
        }

        employee.attendedDays += 1;
        totals.attendedDays += 1;

        const recordStatus = normalizeText(record.attendance_status);
        if (recordStatus.includes("late")) {
          employee.lateDays += 1;
          totals.lateDays += 1;
        }
        if (recordStatus.includes("early_leave")) {
          employee.earlyLeaveDays += 1;
          totals.earlyLeaveDays += 1;
        }
        if (!record.check_out_at) {
          employee.incompleteDays += 1;
          totals.incompleteDays += 1;
        }
        const worked = Number(record.worked_minutes || 0);
        if (Number.isFinite(worked) && worked > 0) {
          employee.workedMinutes += worked;
          totals.workedMinutes += worked;
        }
      }

      employees.push(employee);
    }

    return json(200, { ok: true, from, to, totals, employees });
  } catch (error) {
    console.error("[habat-v2] report failed", error);
    return json(500, { ok: false, message: "habat_report_failed" });
  }
}

async function resolveShiftForAccess(db, accessId, dateKey) {
  const workforceShift = await resolveWorkforceShiftForAccess(db, accessId, dateKey);
  if (workforceShift) return workforceShift;
  if (!accessId) return getDefaultShift(db);
  const assignment = await db.prepare(
    `SELECT a.shift_id
     FROM habat_attendance_shift_assignments a
     JOIN habat_attendance_shifts s ON s.id = a.shift_id
     WHERE a.access_id = ?
       AND a.effective_from <= ?
       AND (a.effective_to IS NULL OR a.effective_to >= ?)
       AND s.is_active = 1
     ORDER BY a.effective_from DESC, a.created_at DESC
     LIMIT 1`
  ).bind(accessId, dateKey, dateKey).first();

  if (assignment?.shift_id) {
    const shift = await getShiftById(db, assignment.shift_id);
    if (shift && Number(shift.is_active) === 1) return shift;
  }
  return getDefaultShift(db);
}

function resolveAssignmentFromList(assignments, dateKey) {
  let selected = null;
  for (const assignment of assignments || []) {
    const from = normalizeDateKey(assignment.effective_from);
    const to = normalizeDateKey(assignment.effective_to);
    if (from && from <= dateKey && (!to || to >= dateKey)) {
      if (!selected || normalizeText(selected.effective_from) < from) {
        selected = assignment;
      }
    }
  }
  return selected;
}

async function resolveWorkforceShiftForAccess(db, accessId, dateKey) {
  if (!accessId) return null;

  const link = await db.prepare(
    `SELECT a.employee_id
       FROM workforce_attendance_links a
      WHERE a.tenant_id = ? AND a.source_employee_id = ?
        AND COALESCE(a.status, 'confirmed') = 'confirmed'
      LIMIT 1`
  ).bind(WORKFORCE_TENANT_ID, accessId).first();

  if (!link?.employee_id) return null;

  const schedule = await resolveWorkforceScheduleDay(
    db,
    WORKFORCE_TENANT_ID,
    link.employee_id,
    dateKey
  );

  if (!schedule || schedule.kind === "unassigned" || !schedule.ready) {
    return null;
  }

  return makeWorkforceShiftFromResolved(schedule, dateKey);
}

function makeWorkforceShiftFromResolved(schedule, dateKey) {
  const weekday = weekdayFromDateKey(dateKey);

  return {
    id: normalizeText(schedule?.templateId) || "workforce:" + normalizeText(schedule?.assignmentId),
    name: normalizeText(schedule?.templateName) || "Workforce schedule",
    start_time: normalizeTime(schedule?.startTime) || "09:00",
    end_time: normalizeTime(schedule?.endTime) || "17:00",
    grace_minutes: Number(schedule?.graceMinutes || 0),
    early_leave_tolerance_minutes: Number(schedule?.earlyLeaveToleranceMinutes || 0),
    working_days: JSON.stringify(schedule?.isWorkingDay ? [weekday] : []),
    is_active: 1,
    schedule_source: normalizeText(schedule?.source) || "workforce_schedule",
  };
}

function buildWorkforceTemplateSyncStatement(db, shift) {
  const legacyShiftId = normalizeText(shift?.id);
  if (!legacyShiftId) throw new Error("habat_shift_id_required");

  const workforceTemplateId = `wf_sched_${legacyShiftId}`;
  const now = nowIso();
  return db.prepare(
    `INSERT INTO workforce_schedule_templates (
      id, tenant_id, name, start_time, end_time, grace_minutes,
      early_leave_tolerance_minutes, working_days_json, is_active,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      grace_minutes = excluded.grace_minutes,
      early_leave_tolerance_minutes = excluded.early_leave_tolerance_minutes,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at`
  ).bind(
    workforceTemplateId,
    WORKFORCE_TENANT_ID,
    normalizeText(shift.name),
    normalizeTime(shift.start_time),
    normalizeTime(shift.end_time),
    Number(shift.grace_minutes || 0),
    Number(shift.early_leave_tolerance_minutes || 0),
    JSON.stringify([0, 1, 2, 3, 4, 5, 6]),
    Number(shift.is_active) === 1 ? 1 : 0,
    normalizeText(shift.created_at) || now,
    now
  );
}

async function findLockedPayrollForTemplate(db, workforceTemplateId) {
  return db.prepare(
    `SELECT pe.id
      FROM workforce_payroll_entries pe
      JOIN workforce_schedule_assignments a
        ON a.tenant_id = pe.tenant_id
        AND a.employee_id = pe.employee_id
      WHERE pe.tenant_id = ?
        AND a.template_id = ?
        AND a.effective_from <= pe.month_key || '-31'
        AND (a.effective_to IS NULL OR a.effective_to >= pe.month_key || '-01')
        AND pe.status IN ('reviewed','approved','paid')
      LIMIT 1`
  ).bind(WORKFORCE_TENANT_ID, workforceTemplateId).first();
}

function buildTemplatePayrollStaleStatement(db, workforceTemplateId, now, reason) {
  return db.prepare(
    `UPDATE workforce_payroll_entries
      SET calculation_snapshot_json =
        CASE
          WHEN calculation_snapshot_json IS NULL OR json_valid(calculation_snapshot_json)=0
            THEN json_object('stage','stale','staleAt',?,'staleReason',?)
          ELSE json_set(
            calculation_snapshot_json,
            '$.stage','stale',
            '$.staleAt',?,
            '$.staleReason',?
          )
        END,
        updated_at = ?
      WHERE tenant_id = ?
        AND status = 'draft'
        AND EXISTS (
          SELECT 1
          FROM workforce_schedule_assignments a
          WHERE a.tenant_id = workforce_payroll_entries.tenant_id
            AND a.employee_id = workforce_payroll_entries.employee_id
            AND a.template_id = ?
            AND a.effective_from <= workforce_payroll_entries.month_key || '-31'
            AND (a.effective_to IS NULL OR a.effective_to >= workforce_payroll_entries.month_key || '-01')
        )`
  ).bind(now, reason, now, reason, now, WORKFORCE_TENANT_ID, workforceTemplateId);
}
function weekdayFromDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

async function getDefaultShift(db) {
  const row = await getShiftById(db, HABAT_DEFAULT_SHIFT_ID);
  if (row && Number(row.is_active) === 1) return row;
  return db.prepare(
    `SELECT * FROM habat_attendance_shifts
     WHERE is_active = 1
     ORDER BY created_at ASC
     LIMIT 1`
  ).first();
}

async function getShiftById(db, id) {
  if (!id) return null;
  return db.prepare(
    `SELECT * FROM habat_attendance_shifts WHERE id = ? LIMIT 1`
  ).bind(id).first();
}

async function getTodayRecord(db, uid, accessId = "") {
  const normalizedUid = normalizeText(uid);
  const normalizedAccessId = normalizeText(accessId);
  if (!normalizedUid && !normalizedAccessId) return null;
  try {
    return await db
      .prepare(
        `SELECT * FROM habat_attendance_records
         WHERE attendance_date = ?
           AND (
             access_id = ?
             OR (
               (access_id IS NULL OR trim(access_id) = '')
               AND ? <> ''
               AND account_uid = ?
             )
           )
         ORDER BY CASE WHEN access_id = ? THEN 0 ELSE 1 END, created_at ASC
         LIMIT 1`
      )
      .bind(
        getRiyadhDateKey(),
        normalizedAccessId,
        normalizedUid,
        normalizedUid,
        normalizedAccessId
      )
      .first();
  } catch (error) {
    console.error("[habat-v2] today lookup failed", error);
    return null;
  }
}

async function writeAudit(db, requester, action, entityType, entityId, before, after) {
  try {
    await db.prepare(
      `INSERT INTO habat_attendance_audit (
         id, actor_uid, actor_email, action, entity_type, entity_id,
         before_json, after_json, created_at
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
    console.warn("[habat-v2] audit write skipped", error);
  }
}

function resolveRequesterDisplayName(requester) {
  const userData = requester?.userData || {};
  const adminData = requester?.adminUserData || {};
  return (
    normalizeText(userData.displayName || userData.name) ||
    normalizeText(adminData.displayName || adminData.name) ||
    ""
  );
}

function readRequestMetadata(request) {
  return {
    ip:
      normalizeText(request.headers.get("CF-Connecting-IP")) ||
      normalizeText(request.headers.get("X-Forwarded-For")).split(",")[0] ||
      null,
    userAgent: normalizeText(request.headers.get("User-Agent")) || null,
  };
}

async function readJsonBody(request, maxBytes = 32768) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, response: json(413, { ok: false, message: "payload_too_large" }) };
  }
  try {
    const value = await request.json();
    return { ok: true, value: value && typeof value === "object" ? value : {} };
  } catch {
    return { ok: false, response: json(400, { ok: false, message: "invalid_json" }) };
  }
}

function normalizeOptionalIso(value, fallback) {
  if (value === undefined) return normalizeText(fallback) || null;
  if (value === null || value === "") return null;
  const text = normalizeText(value);
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : normalizeText(fallback) || null;
}

function normalizeWorkingDays(value) {
  let source;

  if (Array.isArray(value)) {
    source = value;
  } else {
    const text = String(value ?? "").trim();

    if (text.startsWith("[") && text.endsWith("]")) {
      try {
        const parsed = JSON.parse(text);
        source = Array.isArray(parsed) ? parsed : [];
      } catch {
        source = [];
      }
    } else {
      source = text
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);
    }
  }

  return Array.from(
    new Set(
      source
        .map(item => Number(item))
        .filter(item => Number.isInteger(item) && item >= 0 && item <= 6)
    )
  ).sort((a, b) => a - b);
}

function parseWorkingDays(value) {
  return normalizeWorkingDays(value);
}

function normalizeTime(value) {
  const text = normalizeText(value);
  if (!/^\d{2}:\d{2}$/.test(text)) return "";
  const [hour, minute] = text.split(":").map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function getRiyadhDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function shiftDateKey(dateKey, days) {
  const normalized = normalizeDateKey(dateKey);
  if (!normalized) return getRiyadhDateKey();
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + Number(days || 0), 12, 0, 0));
  return getRiyadhDateKey(date);
}

function enumerateDateKeys(from, to) {
  const result = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < HABAT_MAX_REPORT_DAYS + 2) {
    result.push(cursor);
    cursor = shiftDateKey(cursor, 1);
    guard += 1;
  }
  return result;
}

function clampDateRangeStart(from, to, maxDays) {
  const minimum = shiftDateKey(to, -(maxDays - 1));
  return from < minimum ? minimum : from;
}

function normalizeDateKey(value) {
  const text = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function normalizePathname(value) {
  const text = normalizeText(value);
  if (!text) return "/";
  if (text.length > 1 && text.endsWith("/")) return text.slice(0, -1);
  return text;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "undefined" || text === "null") return "";
  return text;
}

function forbidden(message) {
  return json(403, { ok: false, message });
}

function methodNotAllowed(methods) {
  return new Response(JSON.stringify({ ok: false, message: "method_not_allowed" }), {
    status: 405,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Allow: methods.join(", "),
    },
  });
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
