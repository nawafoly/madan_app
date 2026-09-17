import { resolveWorkforceScheduleDay } from "./workforce-schedule-control.js";
import { prepareAttendanceMutationGuard } from "./workforce-mutation-guard.js";

const WORKFORCE_TENANT_ID = "restaurant_tenant_habat_alwaraq";
const HABAT_DEFAULT_SHIFT_ID = "habat_shift_default";
const PHOTO_MAX_BYTES = Math.floor(2.5 * 1024 * 1024);
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_LOCATION_TOLERANCE_M = 20;
const CHECKOUT_COOLDOWN_MS = 60 * 1000;

export async function handleHabatAttendanceExtensionsRequest({
  request,
  url,
  db,
  bucket,
  resolveRequesterContext,
}) {
  if (!db) return json(500, { ok: false, message: "habat_attendance_database_unavailable" });
  if (typeof resolveRequesterContext !== "function") {
    return json(500, { ok: false, message: "habat_attendance_auth_unavailable" });
  }

  const pathname = normalizePathname(url?.pathname);
  const requester = await resolveRequesterContext(request);
  if (!requester?.ok) {
    return requester?.response || json(401, { ok: false, message: "unauthorized" });
  }
  if (!requester.runtime?.isActive) {
    return forbidden("inactive_account");
  }

  const principal = await resolvePrincipal(db, requester);
  if (!principal.ok) return principal.response;

  if (pathname === "/attendance/habat/v2/check-in") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    if (!principal.canClock) return forbidden("habat_clock_forbidden");
    return clockMutation({
      db,
      bucket,
      request,
      requester,
      principal,
      clockType: "check_in",
    });
  }

  if (pathname === "/attendance/habat/v2/check-out") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    if (!principal.canClock) return forbidden("habat_clock_forbidden");
    return clockMutation({
      db,
      bucket,
      request,
      requester,
      principal,
      clockType: "check_out",
    });
  }

  const locationMatch = pathname.match(/^\/attendance\/habat\/v2\/locations\/([^/]+)$/);
  const assignmentMatch = pathname.match(
    /^\/attendance\/habat\/v2\/location-assignments\/([^/]+)$/
  );
  const photoMatch = pathname.match(
    /^\/attendance\/habat\/v2\/attendance-photos\/([^/]+)$/
  );

  if (pathname === "/attendance/habat/v2/attendance-photos") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    if (!principal.canManage) return forbidden("habat_management_forbidden");
    return listAttendancePhotos(db, url);
  }

  if (photoMatch) {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return getAttendancePhoto({
      db,
      bucket,
      principal,
      photoId: decodeURIComponent(photoMatch[1]),
    });
  }

  if (!principal.canManage) {
    return forbidden("habat_management_forbidden");
  }

  if (pathname === "/attendance/habat/v2/locations") {
    if (request.method === "GET") return listLocations(db);
    if (request.method === "POST") return createLocation(db, request, requester);
    return methodNotAllowed(["GET", "POST"]);
  }

  if (locationMatch) {
    const locationId = decodeURIComponent(locationMatch[1]);
    if (request.method === "PATCH") {
      return updateLocation(db, request, requester, locationId);
    }
    if (request.method === "DELETE") {
      return deactivateLocation(db, requester, locationId);
    }
    return methodNotAllowed(["PATCH", "DELETE"]);
  }

  if (assignmentMatch) {
    if (request.method !== "PUT") return methodNotAllowed(["PUT"]);
    return replaceLocationAssignments(
      db,
      request,
      requester,
      decodeURIComponent(assignmentMatch[1])
    );
  }

  return json(404, { ok: false, message: "not_found" });
}

async function clockMutation({ db, bucket, request, requester, principal, clockType }) {
  if (!bucket) {
    return json(500, { ok: false, message: "habat_photo_storage_unavailable" });
  }

  const uid = normalizeText(requester?.uid);
  const accessId = normalizeText(principal?.accessId);
  if (!uid || !accessId) return forbidden("habat_clock_forbidden");

  const parsed = await readClockRequest(request);
  if (!parsed.ok) return parsed.response;

  const photoValidation = validatePhoto(parsed.photo);
  if (!photoValidation.ok) return photoValidation.response;

  const settings = await getSettings(db);
  const location = await validateAssignedLocation(
    db,
    accessId,
    parsed.payload,
    Number(settings.max_accuracy_m || 150)
  );
  if (!location.ok) return location.response;

  const date = getRiyadhDateKey();
  const existing = await getTodayRecord(db, uid, accessId, date);

  if (clockType === "check_in" && existing?.check_in_at) {
    return json(409, {
      ok: false,
      message: "habat_already_checked_in",
      record: mapRecord(existing),
    });
  }

  if (clockType === "check_out" && !existing?.check_in_at) {
    return json(409, { ok: false, message: "habat_check_in_required" });
  }

  if (clockType === "check_out" && existing?.check_out_at) {
    return json(409, {
      ok: false,
      message: "habat_already_checked_out",
      record: mapRecord(existing),
    });
  }

  if (clockType === "check_out" && existing?.check_in_at) {
    const checkedInAtMs = Date.parse(existing.check_in_at);
    const elapsedMs = Number.isFinite(checkedInAtMs) ? Date.now() - checkedInAtMs : CHECKOUT_COOLDOWN_MS;
    if (elapsedMs < CHECKOUT_COOLDOWN_MS) {
      return json(429, {
        ok: false,
        message: "habat_checkout_cooldown",
        retryAfterSeconds: Math.max(1, Math.ceil((CHECKOUT_COOLDOWN_MS - elapsedMs) / 1000)),
        record: mapRecord(existing),
      });
    }
  }

  const shift = clockType === "check_out" && existing?.shift_id
    ? (await getShiftById(db, existing.shift_id)) ||
      (await resolveShiftForAccess(db, accessId, existing.attendance_date || date))
    : await resolveShiftForAccess(db, accessId, date);

  if (!shift) {
    return json(409, { ok: false, message: "habat_shift_not_configured" });
  }

  const attendanceDate = existing?.attendance_date || date;
  if (clockType === "check_in" && !isWorkingDay(attendanceDate, shift)) {
    return json(409, { ok: false, message: "habat_non_working_day" });
  }

  const workforceGuard = await prepareAttendanceMutationGuard({
    db,
    tenantId: WORKFORCE_TENANT_ID,
    sourceEmployeeId: accessId,
    attendanceDate,
    currentRecord: existing,
    mutation: clockType === "check_in" ? "check_in" : "check_out",
  });

  const now = new Date();
  const timestamp = now.toISOString();
  const meta = readRequestMetadata(request);
  const recordId = normalizeText(existing?.id) || `habat_${crypto.randomUUID()}`;
  const storedPhoto = await storePhoto({
    bucket,
    photo: parsed.photo,
    accessId,
    attendanceDate,
    clockType,
  });

  if (!storedPhoto.ok) return storedPhoto.response;

  const statements = [];

  if (clockType === "check_in") {
    const schedule = buildScheduleWindow(attendanceDate, shift);
    const lateMinutes = Math.max(
      0,
      Math.floor((now.getTime() - schedule.start.getTime()) / 60000)
    );
    const status =
      lateMinutes > Number(shift.grace_minutes || 0) ? "late" : "present";

    if (existing) {
      statements.push(
        db.prepare(
          `UPDATE habat_attendance_records
           SET access_id = ?, account_email = ?, display_name = ?,
               check_in_at = ?, check_in_ip = ?, check_in_user_agent = ?,
               shift_id = ?, scheduled_start_at = ?, scheduled_end_at = ?,
               attendance_status = ?, late_minutes = ?,
               check_in_latitude = ?, check_in_longitude = ?,
               check_in_accuracy_m = ?, check_in_distance_m = ?,
               check_in_location_id = ?, check_in_location_name = ?, updated_at = ?
           WHERE id = ?`
        ).bind(
          accessId,
          principal.email || null,
          principal.displayName || null,
          timestamp,
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
          location.locationId,
          location.locationName,
          timestamp,
          recordId
        )
      );
    } else {
      statements.push(
        db.prepare(
          `INSERT INTO habat_attendance_records (
            id, access_id, account_uid, account_email, display_name,
            attendance_date, check_in_at, check_in_ip, check_in_user_agent,
            shift_id, scheduled_start_at, scheduled_end_at, attendance_status,
            late_minutes, early_leave_minutes,
            check_in_latitude, check_in_longitude, check_in_accuracy_m,
            check_in_distance_m, check_in_location_id, check_in_location_name,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          recordId,
          accessId,
          uid,
          principal.email || null,
          principal.displayName || null,
          attendanceDate,
          timestamp,
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
          location.locationId,
          location.locationName,
          timestamp,
          timestamp
        )
      );
    }
  } else {
    const checkIn = new Date(existing.check_in_at);
    const scheduledEnd = existing.scheduled_end_at
      ? new Date(existing.scheduled_end_at)
      : null;
    const lateMinutes = Number(existing.late_minutes || 0);
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

    statements.push(
      db.prepare(
        `UPDATE habat_attendance_records
         SET check_out_at = ?, check_out_ip = ?, check_out_user_agent = ?,
             attendance_status = ?, early_leave_minutes = ?, worked_minutes = ?,
             check_out_latitude = ?, check_out_longitude = ?,
             check_out_accuracy_m = ?, check_out_distance_m = ?,
             check_out_location_id = ?, check_out_location_name = ?,
             account_email = ?, display_name = ?, access_id = ?, updated_at = ?
         WHERE id = ?`
      ).bind(
        timestamp,
        meta.ip,
        meta.userAgent,
        status,
        earlyLeaveMinutes,
        workedMinutes,
        location.latitude,
        location.longitude,
        location.accuracyM,
        location.distanceM,
        location.locationId,
        location.locationName,
        principal.email || null,
        principal.displayName || null,
        accessId,
        timestamp,
        recordId
      )
    );
  }

  statements.push(
    db.prepare(
      `INSERT INTO habat_attendance_photos (
        id, record_id, access_id, attendance_date, clock_type,
        r2_key, content_type, size_bytes, captured_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(record_id, clock_type) DO UPDATE SET
        id = excluded.id,
        access_id = excluded.access_id,
        attendance_date = excluded.attendance_date,
        r2_key = excluded.r2_key,
        content_type = excluded.content_type,
        size_bytes = excluded.size_bytes,
        captured_at = excluded.captured_at,
        created_at = excluded.created_at`
    ).bind(
      storedPhoto.id,
      recordId,
      accessId,
      attendanceDate,
      clockType,
      storedPhoto.r2Key,
      storedPhoto.contentType,
      storedPhoto.sizeBytes,
      timestamp,
      timestamp
    )
  );

  if (workforceGuard?.staleStatements?.length) {
    statements.push(...workforceGuard.staleStatements);
  }

  try {
    await db.batch(statements);
  } catch (error) {
    console.error(`[habat-ext] ${clockType} database mutation failed`, error);
    try {
      await bucket.delete(storedPhoto.r2Key);
    } catch {
      // Best effort cleanup only.
    }
    return json(500, {
      ok: false,
      message:
        clockType === "check_in"
          ? "habat_check_in_failed"
          : "habat_check_out_failed",
    });
  }

  const record = await getRecordById(db, recordId);
  await writeAudit(
    db,
    requester,
    clockType === "check_in" ? "check_in_multisite_photo" : "check_out_multisite_photo",
    "habat_attendance_record",
    recordId,
    existing || null,
    record
  );

  return json(200, {
    ok: true,
    record: mapRecord(record),
    photoAttached: true,
    clockLocation: {
      id: location.locationId,
      name: location.locationName,
      distanceM: location.distanceM,
    },
  });
}

async function listLocations(db) {
  try {
    const [locationsResult, accountsResult, assignmentsResult] = await Promise.all([
      db.prepare(
        `SELECT * FROM habat_attendance_locations
         ORDER BY is_active DESC, name COLLATE NOCASE ASC, created_at ASC`
      ).all(),
      db.prepare(
        `SELECT id, email, display_name, access_level, clock_enabled, is_active
         FROM habat_attendance_access
         WHERE is_active = 1 AND clock_enabled = 1
         ORDER BY display_name COLLATE NOCASE ASC, email ASC`
      ).all(),
      db.prepare(
        `SELECT access_id, location_id
         FROM habat_attendance_location_assignments
         ORDER BY access_id, location_id`
      ).all(),
    ]);

    const locationIdsByAccess = new Map();
    for (const row of assignmentsResult?.results || []) {
      const accessId = normalizeText(row.access_id);
      if (!locationIdsByAccess.has(accessId)) locationIdsByAccess.set(accessId, []);
      locationIdsByAccess.get(accessId).push(normalizeText(row.location_id));
    }

    return json(200, {
      ok: true,
      locations: (locationsResult?.results || []).map(mapLocation),
      accounts: (accountsResult?.results || []).map(row => ({
        id: normalizeText(row.id),
        email: normalizeText(row.email).toLowerCase(),
        displayName: normalizeText(row.display_name) || normalizeText(row.email),
        accessLevel: normalizeText(row.access_level) || "employee",
        locationIds: locationIdsByAccess.get(normalizeText(row.id)) || [],
      })),
    });
  } catch (error) {
    console.error("[habat-ext] locations list failed", error);
    return json(500, { ok: false, message: "habat_locations_query_failed" });
  }
}

async function createLocation(db, request, requester) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = parseLocationInput(body.value, null);
  if (!parsed.ok) return parsed.response;

  const id = `habat_location_${crypto.randomUUID()}`;
  const now = nowIso();
  try {
    await db.prepare(
      `INSERT INTO habat_attendance_locations (
        id, name, latitude, longitude, radius_m, is_active,
        created_by_uid, created_by_email, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
    ).bind(
      id,
      parsed.value.name,
      parsed.value.latitude,
      parsed.value.longitude,
      parsed.value.radiusM,
      normalizeText(requester?.uid) || null,
      normalizeText(requester?.email).toLowerCase() || null,
      now,
      now
    ).run();

    const row = await getLocationById(db, id);
    await writeAudit(db, requester, "create_location", "habat_attendance_location", id, null, row);
    return json(201, { ok: true, location: mapLocation(row) });
  } catch (error) {
    console.error("[habat-ext] location create failed", error);
    return json(500, { ok: false, message: "habat_location_create_failed" });
  }
}

async function updateLocation(db, request, requester, locationId) {
  const current = await getLocationById(db, locationId);
  if (!current) return json(404, { ok: false, message: "habat_location_not_found" });

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = parseLocationInput(body.value, current);
  if (!parsed.ok) return parsed.response;
  const isActive = body.value?.isActive === undefined
    ? Number(current.is_active) === 1
    : Boolean(body.value.isActive);

  try {
    await db.prepare(
      `UPDATE habat_attendance_locations
       SET name = ?, latitude = ?, longitude = ?, radius_m = ?, is_active = ?, updated_at = ?
       WHERE id = ?`
    ).bind(
      parsed.value.name,
      parsed.value.latitude,
      parsed.value.longitude,
      parsed.value.radiusM,
      isActive ? 1 : 0,
      nowIso(),
      locationId
    ).run();

    const next = await getLocationById(db, locationId);
    await writeAudit(db, requester, "update_location", "habat_attendance_location", locationId, current, next);
    return json(200, { ok: true, location: mapLocation(next) });
  } catch (error) {
    console.error("[habat-ext] location update failed", error);
    return json(500, { ok: false, message: "habat_location_update_failed" });
  }
}

async function deactivateLocation(db, requester, locationId) {
  const current = await getLocationById(db, locationId);
  if (!current) return json(404, { ok: false, message: "habat_location_not_found" });

  try {
    await db.batch([
      db.prepare(
        `UPDATE habat_attendance_locations
         SET is_active = 0, updated_at = ? WHERE id = ?`
      ).bind(nowIso(), locationId),
      db.prepare(
        `DELETE FROM habat_attendance_location_assignments WHERE location_id = ?`
      ).bind(locationId),
    ]);
    const next = await getLocationById(db, locationId);
    await writeAudit(db, requester, "deactivate_location", "habat_attendance_location", locationId, current, next);
    return json(200, { ok: true, location: mapLocation(next) });
  } catch (error) {
    console.error("[habat-ext] location deactivate failed", error);
    return json(500, { ok: false, message: "habat_location_update_failed" });
  }
}

async function replaceLocationAssignments(db, request, requester, accessId) {
  const account = await db.prepare(
    `SELECT id, email, display_name, clock_enabled, is_active
     FROM habat_attendance_access WHERE id = ? LIMIT 1`
  ).bind(accessId).first();
  if (!account || Number(account.is_active) !== 1) {
    return json(404, { ok: false, message: "habat_access_not_found" });
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const locationIds = Array.from(
    new Set(
      (Array.isArray(body.value?.locationIds) ? body.value.locationIds : [])
        .map(normalizeText)
        .filter(Boolean)
    )
  );

  if (locationIds.length) {
    const placeholders = locationIds.map(() => "?").join(",");
    const active = await db.prepare(
      `SELECT id FROM habat_attendance_locations
       WHERE is_active = 1 AND id IN (${placeholders})`
    ).bind(...locationIds).all();
    if ((active?.results || []).length !== locationIds.length) {
      return json(400, { ok: false, message: "habat_invalid_location_assignment" });
    }
  }

  const now = nowIso();
  const statements = [
    db.prepare(
      `DELETE FROM habat_attendance_location_assignments WHERE access_id = ?`
    ).bind(accessId),
  ];
  for (const locationId of locationIds) {
    statements.push(
      db.prepare(
        `INSERT INTO habat_attendance_location_assignments (
          id, access_id, location_id, created_by_uid, created_by_email, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        `habat_location_assignment_${crypto.randomUUID()}`,
        accessId,
        locationId,
        normalizeText(requester?.uid) || null,
        normalizeText(requester?.email).toLowerCase() || null,
        now
      )
    );
  }

  try {
    await db.batch(statements);
    await writeAudit(
      db,
      requester,
      "replace_location_assignments",
      "habat_attendance_access",
      accessId,
      null,
      { locationIds }
    );
    return json(200, { ok: true, accessId, locationIds });
  } catch (error) {
    console.error("[habat-ext] assignment replace failed", error);
    return json(500, { ok: false, message: "habat_location_assignment_failed" });
  }
}

async function listAttendancePhotos(db, url) {
  const rawLimit = Number(url?.searchParams?.get("limit") || 50);
  const limit = Math.max(1, Math.min(200, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 50));
  const accessId = normalizeText(url?.searchParams?.get("accessId"));

  try {
    const query = accessId
      ? `SELECT p.*, r.display_name, r.account_email,
                CASE WHEN p.clock_type = 'check_in' THEN r.check_in_location_name ELSE r.check_out_location_name END AS location_name
         FROM habat_attendance_photos p
         JOIN habat_attendance_records r ON r.id = p.record_id
         WHERE p.access_id = ?
         ORDER BY p.captured_at DESC
         LIMIT ?`
      : `SELECT p.*, r.display_name, r.account_email,
                CASE WHEN p.clock_type = 'check_in' THEN r.check_in_location_name ELSE r.check_out_location_name END AS location_name
         FROM habat_attendance_photos p
         JOIN habat_attendance_records r ON r.id = p.record_id
         ORDER BY p.captured_at DESC
         LIMIT ?`;
    const statement = db.prepare(query);
    const result = accessId
      ? await statement.bind(accessId, limit).all()
      : await statement.bind(limit).all();

    return json(200, {
      ok: true,
      photos: (result?.results || []).map(mapPhoto),
    });
  } catch (error) {
    console.error("[habat-ext] photo list failed", error);
    return json(500, { ok: false, message: "habat_photo_list_failed" });
  }
}

async function getAttendancePhoto({ db, bucket, principal, photoId }) {
  if (!bucket) return json(500, { ok: false, message: "habat_photo_storage_unavailable" });

  const row = await db.prepare(
    `SELECT p.*, r.access_id AS record_access_id
     FROM habat_attendance_photos p
     JOIN habat_attendance_records r ON r.id = p.record_id
     WHERE p.id = ? LIMIT 1`
  ).bind(photoId).first();
  if (!row) return json(404, { ok: false, message: "habat_photo_not_found" });

  const rowAccessId = normalizeText(row.access_id || row.record_access_id);
  if (!principal.canManage && rowAccessId !== normalizeText(principal.accessId)) {
    return forbidden("habat_photo_forbidden");
  }

  const object = await bucket.get(normalizeText(row.r2_key));
  if (!object) return json(404, { ok: false, message: "habat_photo_not_found" });

  const headers = new Headers();
  headers.set("Content-Type", normalizeText(row.content_type) || "image/jpeg");
  headers.set("Content-Disposition", "inline");
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { status: 200, headers });
}

async function validateAssignedLocation(db, accessId, payload, maxAccuracyM) {
  const latitude = normalizeNullableNumber(payload?.latitude);
  const longitude = normalizeNullableNumber(payload?.longitude);
  const accuracyM = normalizeNullableNumber(payload?.accuracyM);

  if (latitude === null || longitude === null) {
    return {
      ok: false,
      response: json(400, { ok: false, message: "habat_location_required" }),
    };
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return {
      ok: false,
      response: json(400, { ok: false, message: "habat_invalid_location" }),
    };
  }

  const normalizedAccuracy = Math.max(0, Number(accuracyM || 0));
  const maximumAccuracy = Math.max(10, Number(maxAccuracyM || 150));
  if (normalizedAccuracy > maximumAccuracy) {
    return {
      ok: false,
      response: json(422, {
        ok: false,
        message: "habat_location_accuracy_too_low",
        accuracyM: normalizedAccuracy,
        maxAccuracyM: maximumAccuracy,
      }),
    };
  }

  const result = await db.prepare(
    `SELECT l.*
     FROM habat_attendance_location_assignments a
     JOIN habat_attendance_locations l ON l.id = a.location_id
     WHERE a.access_id = ? AND l.is_active = 1
     ORDER BY l.name COLLATE NOCASE ASC`
  ).bind(accessId).all();
  const locations = result?.results || [];
  if (!locations.length) {
    return {
      ok: false,
      response: json(409, { ok: false, message: "habat_clock_location_not_assigned" }),
    };
  }

  let nearest = null;
  for (const row of locations) {
    const distanceM = haversineMeters(
      latitude,
      longitude,
      Number(row.latitude),
      Number(row.longitude)
    );
    const radiusM = Math.max(10, Number(row.radius_m || 100));
    const toleranceM = Math.min(
      MAX_LOCATION_TOLERANCE_M,
      radiusM * 0.2,
      normalizedAccuracy
    );
    const candidate = { row, distanceM, radiusM, toleranceM };
    if (!nearest || distanceM < nearest.distanceM) nearest = candidate;
    if (distanceM <= radiusM + toleranceM) {
      return {
        ok: true,
        latitude,
        longitude,
        accuracyM: normalizedAccuracy,
        distanceM,
        locationId: normalizeText(row.id),
        locationName: normalizeText(row.name),
        radiusM,
      };
    }
  }

  return {
    ok: false,
    response: json(422, {
      ok: false,
      message: "habat_outside_assigned_location_range",
      distanceM: nearest ? Math.round(nearest.distanceM) : null,
      radiusM: nearest ? Math.round(nearest.radiusM) : null,
      locationId: nearest ? normalizeText(nearest.row.id) : null,
      locationName: nearest ? normalizeText(nearest.row.name) : null,
    }),
  };
}

async function resolvePrincipal(db, requester) {
  const requestedAccessId = normalizeText(requester?.accessId);
  const uid = normalizeText(requester?.uid);
  const email = normalizeText(requester?.email).toLowerCase();
  const runtimeRole = normalizeText(requester?.runtime?.role).toLowerCase();

  let row = null;
  if (requestedAccessId) {
    row = await db.prepare(
      `SELECT id, uid, email, display_name, access_level, clock_enabled, is_active
       FROM habat_attendance_access
       WHERE id = ? AND is_active = 1 LIMIT 1`
    ).bind(requestedAccessId).first();
  } else if (uid || email) {
    row = await db.prepare(
      `SELECT id, uid, email, display_name, access_level, clock_enabled, is_active
       FROM habat_attendance_access
       WHERE is_active = 1
         AND ((uid IS NOT NULL AND uid = ?) OR lower(email) = ?)
       ORDER BY CASE WHEN uid = ? THEN 0 ELSE 1 END, created_at ASC
       LIMIT 1`
    ).bind(uid, email, uid).first();
  }

  if (!row && runtimeRole === "owner") {
    return {
      ok: true,
      accessId: null,
      uid: uid || null,
      email: email || null,
      displayName: "المالك",
      accessLevel: "manager",
      canManage: true,
      canClock: false,
      bootstrapOwner: true,
    };
  }

  if (!row) {
    return { ok: false, response: forbidden("habat_access_forbidden") };
  }

  const accessLevel = normalizeText(row.access_level) === "manager" ? "manager" : "employee";
  return {
    ok: true,
    accessId: normalizeText(row.id),
    uid: normalizeText(row.uid) || uid || null,
    email: normalizeText(row.email).toLowerCase() || email || null,
    displayName: normalizeText(row.display_name) || normalizeText(row.email),
    accessLevel,
    canManage: accessLevel === "manager",
    canClock: Number(row.clock_enabled) === 1,
    bootstrapOwner: false,
  };
}

async function readClockRequest(request) {
  const contentType = normalizeText(request.headers.get("Content-Type")).toLowerCase();
  if (contentType.includes("multipart/form-data")) {
    try {
      const form = await request.formData();
      const rawPayload = form.get("payload");
      let payload = {};
      if (typeof rawPayload === "string" && rawPayload.trim()) {
        payload = JSON.parse(rawPayload);
      }
      const photo = form.get("photo");
      return { ok: true, payload: payload && typeof payload === "object" ? payload : {}, photo };
    } catch {
      return { ok: false, response: json(400, { ok: false, message: "invalid_multipart" }) };
    }
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body;
  return { ok: true, payload: body.value, photo: null };
}

function validatePhoto(photo) {
  if (!photo || typeof photo !== "object" || typeof photo.arrayBuffer !== "function") {
    return {
      ok: false,
      response: json(400, { ok: false, message: "habat_photo_required" }),
    };
  }
  const type = normalizeText(photo.type).toLowerCase();
  const size = Number(photo.size || 0);
  if (!PHOTO_TYPES.has(type) || !Number.isFinite(size) || size <= 0) {
    return {
      ok: false,
      response: json(400, { ok: false, message: "habat_invalid_attendance_photo" }),
    };
  }
  if (size > PHOTO_MAX_BYTES) {
    return {
      ok: false,
      response: json(413, { ok: false, message: "habat_attendance_photo_too_large" }),
    };
  }
  return { ok: true };
}

async function storePhoto({ bucket, photo, accessId, attendanceDate, clockType }) {
  try {
    const contentType = normalizeText(photo.type).toLowerCase();
    const extension =
      contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const id = `habat_photo_${crypto.randomUUID()}`;
    const safeAccessId = accessId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const r2Key = `habat-attendance/${attendanceDate}/${safeAccessId}/${clockType}-${id}.${extension}`;
    const bytes = await photo.arrayBuffer();
    await bucket.put(r2Key, bytes, {
      httpMetadata: { contentType },
      customMetadata: {
        accessId,
        attendanceDate,
        clockType,
      },
    });
    return {
      ok: true,
      id,
      r2Key,
      contentType,
      sizeBytes: bytes.byteLength,
    };
  } catch (error) {
    console.error("[habat-ext] photo store failed", error);
    return {
      ok: false,
      response: json(500, { ok: false, message: "habat_photo_storage_failed" }),
    };
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

async function resolveWorkforceShiftForAccess(db, accessId, dateKey) {
  if (!accessId) return null;
  try {
    const link = await db.prepare(
      `SELECT employee_id
       FROM workforce_attendance_links
       WHERE tenant_id = ? AND source_employee_id = ?
         AND COALESCE(status, 'confirmed') = 'confirmed'
       LIMIT 1`
    ).bind(WORKFORCE_TENANT_ID, accessId).first();
    if (!link?.employee_id) return null;

    const schedule = await resolveWorkforceScheduleDay(
      db,
      WORKFORCE_TENANT_ID,
      link.employee_id,
      dateKey
    );
    if (!schedule || schedule.kind === "unassigned" || !schedule.ready) return null;

    const weekday = weekdayFromDateKey(dateKey);
    return {
      id: normalizeText(schedule.templateId) || `workforce:${normalizeText(schedule.assignmentId)}`,
      name: normalizeText(schedule.templateName) || "Workforce schedule",
      start_time: normalizeTime(schedule.startTime) || "09:00",
      end_time: normalizeTime(schedule.endTime) || "17:00",
      grace_minutes: Number(schedule.graceMinutes || 0),
      early_leave_tolerance_minutes: Number(schedule.earlyLeaveToleranceMinutes || 0),
      working_days: JSON.stringify(schedule.isWorkingDay ? [weekday] : []),
      is_active: 1,
    };
  } catch (error) {
    console.warn("[habat-ext] workforce schedule fallback", error);
    return null;
  }
}

async function getDefaultShift(db) {
  const row = await getShiftById(db, HABAT_DEFAULT_SHIFT_ID);
  if (row && Number(row.is_active) === 1) return row;
  return db.prepare(
    `SELECT * FROM habat_attendance_shifts
     WHERE is_active = 1 ORDER BY created_at ASC LIMIT 1`
  ).first();
}

async function getShiftById(db, id) {
  if (!id) return null;
  return db.prepare(
    `SELECT * FROM habat_attendance_shifts WHERE id = ? LIMIT 1`
  ).bind(id).first();
}

async function getSettings(db) {
  const row = await db.prepare(
    `SELECT * FROM habat_attendance_settings WHERE id = 'default' LIMIT 1`
  ).first();
  return row || { max_accuracy_m: 150 };
}

async function getTodayRecord(db, uid, accessId, dateKey) {
  return db.prepare(
    `SELECT * FROM habat_attendance_records
     WHERE attendance_date = ?
       AND (
         access_id = ?
         OR ((access_id IS NULL OR trim(access_id) = '') AND ? <> '' AND account_uid = ?)
       )
     ORDER BY CASE WHEN access_id = ? THEN 0 ELSE 1 END, created_at ASC
     LIMIT 1`
  ).bind(dateKey, accessId, uid, uid, accessId).first();
}

async function getRecordById(db, id) {
  return db.prepare(
    `SELECT * FROM habat_attendance_records WHERE id = ? LIMIT 1`
  ).bind(id).first();
}

async function getLocationById(db, id) {
  return db.prepare(
    `SELECT * FROM habat_attendance_locations WHERE id = ? LIMIT 1`
  ).bind(id).first();
}

function parseLocationInput(value, current) {
  const name = normalizeText(value?.name === undefined ? current?.name : value?.name);
  const latitude = normalizeNullableNumber(
    value?.latitude === undefined ? current?.latitude : value?.latitude
  );
  const longitude = normalizeNullableNumber(
    value?.longitude === undefined ? current?.longitude : value?.longitude
  );
  const radiusM = clampNumber(
    value?.radiusM === undefined ? current?.radius_m : value?.radiusM,
    10,
    5000,
    100
  );

  if (name.length < 2) {
    return { ok: false, response: json(400, { ok: false, message: "habat_location_name_required" }) };
  }
  if (latitude === null || latitude < -90 || latitude > 90) {
    return { ok: false, response: json(400, { ok: false, message: "habat_invalid_latitude" }) };
  }
  if (longitude === null || longitude < -180 || longitude > 180) {
    return { ok: false, response: json(400, { ok: false, message: "habat_invalid_longitude" }) };
  }

  return { ok: true, value: { name, latitude, longitude, radiusM } };
}

function mapLocation(row) {
  if (!row) return null;
  return {
    id: normalizeText(row.id),
    name: normalizeText(row.name),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    radiusM: Number(row.radius_m || 100),
    isActive: Number(row.is_active) === 1,
    createdAt: normalizeText(row.created_at) || null,
    updatedAt: normalizeText(row.updated_at) || null,
  };
}

function mapPhoto(row) {
  return {
    id: normalizeText(row.id),
    recordId: normalizeText(row.record_id),
    accessId: normalizeText(row.access_id) || null,
    attendanceDate: normalizeText(row.attendance_date),
    clockType: normalizeText(row.clock_type),
    contentType: normalizeText(row.content_type),
    sizeBytes: Number(row.size_bytes || 0),
    capturedAt: normalizeText(row.captured_at),
    displayName: normalizeText(row.display_name) || normalizeText(row.account_email),
    accountEmail: normalizeText(row.account_email).toLowerCase() || null,
    locationName: normalizeText(row.location_name) || null,
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
    workedMinutes: row.worked_minutes == null ? null : Number(row.worked_minutes),
    checkInLocation: mapClockLocation(row, "check_in"),
    checkOutLocation: mapClockLocation(row, "check_out"),
    notes: normalizeText(row.notes) || null,
    createdAt: normalizeText(row.created_at) || null,
    updatedAt: normalizeText(row.updated_at) || null,
  };
}

function mapClockLocation(row, prefix) {
  const latitude = row?.[`${prefix}_latitude`];
  const longitude = row?.[`${prefix}_longitude`];
  const accuracyM = row?.[`${prefix}_accuracy_m`];
  const distanceM = row?.[`${prefix}_distance_m`];
  const locationId = normalizeText(row?.[`${prefix}_location_id`]);
  const locationName = normalizeText(row?.[`${prefix}_location_name`]);
  if (
    latitude == null &&
    longitude == null &&
    accuracyM == null &&
    distanceM == null &&
    !locationId
  ) {
    return null;
  }
  return {
    latitude: latitude == null ? null : Number(latitude),
    longitude: longitude == null ? null : Number(longitude),
    accuracyM: accuracyM == null ? null : Number(accuracyM),
    distanceM: distanceM == null ? null : Number(distanceM),
    locationId: locationId || null,
    locationName: locationName || null,
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
  return days.includes(weekdayFromDateKey(dateKey));
}

function parseWorkingDays(value) {
  if (Array.isArray(value)) return value.map(Number).filter(validWeekday);
  const text = String(value ?? "").trim();
  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed.map(Number).filter(validWeekday) : [];
    } catch {
      return [];
    }
  }
  return text.split(",").map(item => Number(item.trim())).filter(validWeekday);
}

function validWeekday(value) {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

function weekdayFromDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = value => (value * Math.PI) / 180;
  const earthRadiusM = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getRiyadhDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
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
    console.warn("[habat-ext] audit write skipped", error);
  }
}

async function readJsonBody(request, maxBytes = 65536) {
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

function readRequestMetadata(request) {
  return {
    ip:
      normalizeText(request.headers.get("CF-Connecting-IP")) ||
      normalizeText(request.headers.get("X-Forwarded-For")).split(",")[0] ||
      null,
    userAgent: normalizeText(request.headers.get("User-Agent")) || null,
  };
}

function normalizePathname(value) {
  const path = normalizeText(value) || "/";
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function normalizeText(value) {
  return String(value ?? "").trim();
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

function normalizeTime(value) {
  const text = normalizeText(value);
  if (!/^\d{2}:\d{2}$/.test(text)) return "";
  const [hours, minutes] = text.split(":").map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return "";
  return text;
}

function nowIso() {
  return new Date().toISOString();
}

function methodNotAllowed(methods) {
  return new Response(JSON.stringify({ ok: false, message: "method_not_allowed" }), {
    status: 405,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Allow: methods.join(", "),
      "Cache-Control": "no-store",
    },
  });
}

function forbidden(message) {
  return json(403, { ok: false, message });
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
