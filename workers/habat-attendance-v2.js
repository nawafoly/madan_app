const HABAT_ACCESS_LEVELS = new Set(["employee", "manager"]);
const HABAT_DEFAULT_SHIFT_ID = "habat_shift_default";
const HABAT_MAX_REPORT_DAYS = 93;
const HABAT_DEFAULT_RECORD_LIMIT = 200;
const HABAT_MAX_RECORD_LIMIT = 500;

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
  const uid = normalizeText(requester?.uid);
  const email = normalizeText(requester?.email).toLowerCase();
  const runtimeRole = normalizeText(requester?.runtime?.role).toLowerCase();
  const fallbackName = resolveRequesterDisplayName(requester);

  if (uid || email) {
    try {
      const row = await db
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

      if (row) {
        if (!normalizeText(row.uid) && uid && normalizeText(row.email).toLowerCase() === email) {
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

        const accessLevel = HABAT_ACCESS_LEVELS.has(normalizeText(row.access_level))
          ? normalizeText(row.access_level)
          : "employee";

        return {
          ok: true,
          bootstrapOwner: false,
          accessId: normalizeText(row.id),
          uid,
          email: normalizeText(row.email).toLowerCase() || email,
          displayName: normalizeText(row.display_name) || fallbackName || email || "المستخدم",
          accessLevel,
          canManage: accessLevel === "manager",
          canClock: Number(row.clock_enabled) === 1,
        };
      }
    } catch (error) {
      console.error("[habat-v2] principal lookup failed", error);
      return {
        ok: false,
        response: json(500, { ok: false, message: "habat_access_lookup_failed" }),
      };
    }
  }

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

  return { ok: false, response: forbidden("habat_access_forbidden") };
}

async function getContext(db, requester, principal) {
  const date = getRiyadhDateKey();
  const settings = await getSettings(db);
  const record = await getTodayRecord(db, requester.uid);
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
  const existing = await getTodayRecord(db, uid);
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

    const record = await getTodayRecord(db, uid);
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

  const existing = await getTodayRecord(db, uid);
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

    const record = await getTodayRecord(db, uid);
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
  try {
    await db.prepare(
      `INSERT INTO habat_attendance_shifts (
        id, name, start_time, end_time, grace_minutes,
        early_leave_tolerance_minutes, working_days, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).bind(
      id,
      parsed.value.name,
      parsed.value.startTime,
      parsed.value.endTime,
      parsed.value.graceMinutes,
      parsed.value.earlyLeaveToleranceMinutes,
      parsed.value.workingDays.join(","),
      now,
      now
    ).run();

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
    workingDays:
      body.value?.workingDays ?? parseWorkingDays(current.working_days),
  });
  if (!parsed.ok) return parsed.response;

  const isActive = body.value?.isActive === undefined
    ? Number(current.is_active) === 1
    : Boolean(body.value.isActive);

  try {
    await db.prepare(
      `UPDATE habat_attendance_shifts
       SET name = ?, start_time = ?, end_time = ?, grace_minutes = ?,
           early_leave_tolerance_minutes = ?, working_days = ?, is_active = ?, updated_at = ?
       WHERE id = ?`
    ).bind(
      parsed.value.name,
      parsed.value.startTime,
      parsed.value.endTime,
      parsed.value.graceMinutes,
      parsed.value.earlyLeaveToleranceMinutes,
      parsed.value.workingDays.join(","),
      isActive ? 1 : 0,
      nowIso(),
      id
    ).run();

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

  try {
    await db.prepare(
      `UPDATE habat_attendance_shifts SET is_active = 0, updated_at = ? WHERE id = ?`
    ).bind(nowIso(), id).run();
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

  const [access, shift] = await Promise.all([
    db.prepare(`SELECT * FROM habat_attendance_access WHERE id = ? LIMIT 1`).bind(accessId).first(),
    getShiftById(db, shiftId),
  ]);
  if (!access) return json(404, { ok: false, message: "habat_access_not_found" });
  if (!shift || Number(shift.is_active) !== 1) {
    return json(404, { ok: false, message: "habat_shift_not_found" });
  }

  const previousEnd = shiftDateKey(effectiveFrom, -1);
  const id = `habat_assignment_${crypto.randomUUID()}`;

  try {
    await db.prepare(
      `UPDATE habat_attendance_shift_assignments
       SET effective_to = ?
       WHERE access_id = ?
         AND effective_from < ?
         AND (effective_to IS NULL OR effective_to >= ?)`
    ).bind(previousEnd, accessId, effectiveFrom, effectiveFrom).run();

    await db.prepare(
      `DELETE FROM habat_attendance_shift_assignments
       WHERE access_id = ? AND effective_from >= ?`
    ).bind(accessId, effectiveFrom).run();

    await db.prepare(
      `INSERT INTO habat_attendance_shift_assignments (
        id, access_id, shift_id, effective_from, effective_to,
        created_by_uid, created_by_email, created_at
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`
    ).bind(
      id,
      accessId,
      shiftId,
      effectiveFrom,
      normalizeText(requester.uid) || null,
      normalizeText(requester.email).toLowerCase() || null,
      nowIso()
    ).run();

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

async function getTodayRecord(db, uid) {
  const normalizedUid = normalizeText(uid);
  if (!normalizedUid) return null;
  return db.prepare(
    `SELECT * FROM habat_attendance_records
     WHERE account_uid = ? AND attendance_date = ?
     LIMIT 1`
  ).bind(normalizedUid, getRiyadhDateKey()).first();
}

function parseShiftInput(value) {
  const name = normalizeText(value?.name);
  const startTime = normalizeTime(value?.startTime);
  const endTime = normalizeTime(value?.endTime);
  const graceMinutes = clampInteger(value?.graceMinutes, 0, 240, 10);
  const earlyLeaveToleranceMinutes = clampInteger(
    value?.earlyLeaveToleranceMinutes,
    0,
    240,
    0
  );
  const workingDays = normalizeWorkingDays(value?.workingDays);

  if (!name) return { ok: false, response: json(400, { ok: false, message: "habat_shift_name_required" }) };
  if (!startTime || !endTime) {
    return { ok: false, response: json(400, { ok: false, message: "habat_invalid_shift_time" }) };
  }
  if (!workingDays.length) {
    return { ok: false, response: json(400, { ok: false, message: "habat_working_days_required" }) };
  }

  return {
    ok: true,
    value: {
      name,
      startTime,
      endTime,
      graceMinutes,
      earlyLeaveToleranceMinutes,
      workingDays,
    },
  };
}

function buildScheduleWindow(dateKey, shift) {
  const startTime = normalizeTime(shift?.start_time) || "09:00";
  const endTime = normalizeTime(shift?.end_time) || "17:00";
  const start = new Date(`${dateKey}T${startTime}:00+03:00`);
  let end = new Date(`${dateKey}T${endTime}:00+03:00`);
  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }
  return { start, end };
}

function isWorkingDay(dateKey, shift) {
  const days = parseWorkingDays(shift?.working_days);
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
  return days.includes(weekday);
}

function calculateAttendanceMetrics({ checkInAt, checkOutAt, shift, schedule }) {
  const checkIn = checkInAt ? new Date(checkInAt) : null;
  const checkOut = checkOutAt ? new Date(checkOutAt) : null;
  const grace = Number(shift?.grace_minutes || 0);
  const earlyTolerance = Number(shift?.early_leave_tolerance_minutes || 0);

  const lateMinutes = checkIn && schedule
    ? Math.max(0, Math.floor((checkIn.getTime() - schedule.start.getTime()) / 60000))
    : 0;
  const earlyLeaveMinutes = checkOut && schedule
    ? Math.max(0, Math.floor((schedule.end.getTime() - checkOut.getTime()) / 60000))
    : 0;
  const workedMinutes = checkIn && checkOut
    ? Math.max(0, Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000))
    : null;
  const late = lateMinutes > grace;
  const early = earlyLeaveMinutes > earlyTolerance;

  return {
    lateMinutes,
    earlyLeaveMinutes,
    workedMinutes,
    status: late && early
      ? "late_early_leave"
      : late
        ? "late"
        : early
          ? "early_leave"
          : "present",
  };
}

function validateClockLocation(settings, value) {
  const required = Number(settings?.location_required) === 1;
  const latitude = normalizeNullableNumber(value?.latitude);
  const longitude = normalizeNullableNumber(value?.longitude);
  const accuracyM = normalizeNullableNumber(value?.accuracyM);

  if (required && (latitude === null || longitude === null)) {
    return {
      ok: false,
      response: json(400, { ok: false, message: "habat_location_required" }),
    };
  }

  if (latitude !== null && (latitude < -90 || latitude > 90)) {
    return { ok: false, response: json(400, { ok: false, message: "habat_invalid_latitude" }) };
  }
  if (longitude !== null && (longitude < -180 || longitude > 180)) {
    return { ok: false, response: json(400, { ok: false, message: "habat_invalid_longitude" }) };
  }

  const centerLat = normalizeNullableNumber(settings?.latitude);
  const centerLng = normalizeNullableNumber(settings?.longitude);
  const maxAccuracy = Number(settings?.max_accuracy_m || 150);
  const radius = Number(settings?.radius_m || 100);

  if (required && (centerLat === null || centerLng === null)) {
    return {
      ok: false,
      response: json(503, { ok: false, message: "habat_location_not_configured" }),
    };
  }
  if (required && (accuracyM === null || accuracyM > maxAccuracy)) {
    return {
      ok: false,
      response: json(422, {
        ok: false,
        message: "habat_location_accuracy_too_low",
        maxAccuracyM: maxAccuracy,
        accuracyM,
      }),
    };
  }

  let distanceM = null;
  if (
    latitude !== null &&
    longitude !== null &&
    centerLat !== null &&
    centerLng !== null
  ) {
    distanceM = haversineMeters(latitude, longitude, centerLat, centerLng);
    if (required && distanceM > radius) {
      return {
        ok: false,
        response: json(403, {
          ok: false,
          message: "habat_outside_location_range",
          distanceM: Math.round(distanceM),
          radiusM: radius,
        }),
      };
    }
  }

  return {
    ok: true,
    latitude,
    longitude,
    accuracyM,
    distanceM: distanceM === null ? null : Math.round(distanceM * 10) / 10,
  };
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const radius = 6371000;
  const toRadians = degree => (degree * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mapPrincipal(principal) {
  return {
    uid: principal.uid || null,
    email: principal.email || null,
    displayName: principal.displayName || null,
    accessLevel: principal.accessLevel,
    canManage: Boolean(principal.canManage),
    canClock: Boolean(principal.canClock),
    bootstrapOwner: Boolean(principal.bootstrapOwner),
    accessId: principal.accessId || null,
  };
}

function mapShift(row) {
  if (!row) return null;
  return {
    id: normalizeText(row.id),
    name: normalizeText(row.name),
    startTime: normalizeTime(row.start_time),
    endTime: normalizeTime(row.end_time),
    graceMinutes: Number(row.grace_minutes || 0),
    earlyLeaveToleranceMinutes: Number(row.early_leave_tolerance_minutes || 0),
    workingDays: parseWorkingDays(row.working_days),
    isActive: Number(row.is_active) === 1,
  };
}

function mapAssignment(row) {
  if (!row) return null;
  return {
    id: normalizeText(row.id),
    accessId: normalizeText(row.access_id),
    shiftId: normalizeText(row.shift_id),
    effectiveFrom: normalizeText(row.effective_from),
    effectiveTo: normalizeText(row.effective_to) || null,
    shiftName: normalizeText(row.shift_name) || null,
    startTime: normalizeTime(row.start_time) || null,
    endTime: normalizeTime(row.end_time) || null,
    email: normalizeText(row.email).toLowerCase() || null,
    displayName: normalizeText(row.display_name) || null,
  };
}

function mapSettings(row) {
  return {
    timezone: normalizeText(row?.timezone) || "Asia/Riyadh",
    locationRequired: Number(row?.location_required) === 1,
    latitude: normalizeNullableNumber(row?.latitude),
    longitude: normalizeNullableNumber(row?.longitude),
    radiusM: Number(row?.radius_m || 100),
    maxAccuracyM: Number(row?.max_accuracy_m || 150),
    updatedAt: normalizeText(row?.updated_at) || null,
  };
}

function mapPublicSettings(row) {
  return {
    timezone: normalizeText(row?.timezone) || "Asia/Riyadh",
    locationRequired: Number(row?.location_required) === 1,
    radiusM: Number(row?.radius_m || 100),
    maxAccuracyM: Number(row?.max_accuracy_m || 150),
    locationConfigured:
      normalizeNullableNumber(row?.latitude) !== null &&
      normalizeNullableNumber(row?.longitude) !== null,
  };
}

function mapRecord(row) {
  if (!row) return null;
  return {
    id: normalizeText(row.id),
    accessId: normalizeText(row.access_id) || null,
    accountUid: normalizeText(row.account_uid),
    accountEmail: normalizeText(row.account_email).toLowerCase() || null,
    displayName: normalizeText(row.display_name) || null,
    attendanceDate: normalizeText(row.attendance_date),
    checkInAt: normalizeText(row.check_in_at) || null,
    checkOutAt: normalizeText(row.check_out_at) || null,
    shiftId: normalizeText(row.shift_id) || null,
    scheduledStartAt: normalizeText(row.scheduled_start_at) || null,
    scheduledEndAt: normalizeText(row.scheduled_end_at) || null,
    attendanceStatus: normalizeText(row.attendance_status) || null,
    lateMinutes: Number(row.late_minutes || 0),
    earlyLeaveMinutes: Number(row.early_leave_minutes || 0),
    workedMinutes:
      row.worked_minutes === null || row.worked_minutes === undefined
        ? null
        : Number(row.worked_minutes),
    checkInLocation: mapClockLocation(row, "check_in"),
    checkOutLocation: mapClockLocation(row, "check_out"),
    notes: normalizeText(row.notes) || null,
    createdAt: normalizeText(row.created_at) || null,
    updatedAt: normalizeText(row.updated_at) || null,
  };
}

function mapClockLocation(row, prefix) {
  const latitude = normalizeNullableNumber(row?.[`${prefix}_latitude`]);
  const longitude = normalizeNullableNumber(row?.[`${prefix}_longitude`]);
  const accuracyM = normalizeNullableNumber(row?.[`${prefix}_accuracy_m`]);
  const distanceM = normalizeNullableNumber(row?.[`${prefix}_distance_m`]);
  if (latitude === null && longitude === null && accuracyM === null && distanceM === null) {
    return null;
  }
  return { latitude, longitude, accuracyM, distanceM };
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
  const source = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);
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
