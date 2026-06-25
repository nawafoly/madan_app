const ATTENDANCE_ALLOWED_ROLES = new Set([
  "owner",
  "admin",
  "accountant",
  "hr",
  "staff",
]);
const ATTENDANCE_TYPES = new Set(["check_in", "check_out"]);
const ATTENDANCE_RESULTS = new Set(["allowed", "rejected"]);
const ATTENDANCE_ADMIN_ROLES = new Set(["owner", "admin", "hr"]);
const ATTENDANCE_MAX_ACCURACY_METERS = 100;
const ATTENDANCE_RECORDS_DEFAULT_LIMIT = 50;
const ATTENDANCE_RECORDS_MAX_LIMIT = 200;
const EARTH_RADIUS_METERS = 6371008.8;

export async function handleAttendanceRequest({
  request,
  url,
  db,
  directoryDb,
  resolveRequesterContext,
  fetchFirestoreDocument,
}) {
  const pathname = url.pathname;
  const zoneMatch = pathname.match(/^\/attendance\/work-zones\/([^/]+)$/);

  if (pathname === "/attendance/record" && request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }
  if (
    pathname === "/attendance/admin-adjustment" &&
    request.method !== "POST"
  ) {
    return methodNotAllowed(["POST"]);
  }
  if (pathname === "/attendance/records" && request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }
  if (
    pathname === "/attendance/work-zones" &&
    !["GET", "POST"].includes(request.method)
  ) {
    return methodNotAllowed(["GET", "POST"]);
  }
  if (zoneMatch && !["PATCH", "DELETE"].includes(request.method)) {
    return methodNotAllowed(["PATCH", "DELETE"]);
  }
  if (
    pathname !== "/attendance/record" &&
    pathname !== "/attendance/admin-adjustment" &&
    pathname !== "/attendance/records" &&
    pathname !== "/attendance/work-zones" &&
    !zoneMatch
  ) {
    return json(404, { ok: false, message: "not_found" });
  }

  const requester = await resolveRequesterContext(request);
  if (!requester.ok) return requester.response;

  if (!requester.runtime?.isActive) {
    return json(403, { ok: false, message: "inactive_account" });
  }

  if (pathname === "/attendance/work-zones" && request.method === "GET") {
    return listWorkZones(db);
  }

  if (pathname === "/attendance/records" && request.method === "GET") {
    const employeeUid = normalizeText(url.searchParams.get("employeeUid"));
    if (!canReadAttendanceRecords(requester.runtime, requester.uid, employeeUid)) {
      return json(403, { ok: false, message: "attendance_records_forbidden" });
    }
    return listAttendanceRecords(url, db, directoryDb);
  }

  if (pathname === "/attendance/work-zones" && request.method === "POST") {
    if (!canManageAttendance(requester.runtime)) return forbidden();
    return createWorkZone(request, db, requester);
  }

  if (pathname === "/attendance/admin-adjustment" && request.method === "POST") {
    if (!canManageAttendance(requester.runtime)) return forbidden();
    return adjustAttendanceRecords(request, db, requester);
  }

  if (zoneMatch && request.method === "PATCH") {
    if (!canManageAttendance(requester.runtime)) return forbidden();
    return updateWorkZone(
      request,
      db,
      requester,
      decodeURIComponent(zoneMatch[1])
    );
  }

  if (zoneMatch && request.method === "DELETE") {
    if (!canManageAttendance(requester.runtime)) return forbidden();
    return deleteWorkZone(db, decodeURIComponent(zoneMatch[1]));
  }

  if (pathname === "/attendance/record" && request.method === "POST") {
    return recordAttendance({
      request,
      db,
      requester,
      fetchFirestoreDocument,
    });
  }

  return json(500, { ok: false, message: "attendance_router_unreachable" });
}

function methodNotAllowed(methods) {
  const response = json(405, { ok: false, message: "method_not_allowed" });
  response.headers.set("Allow", methods.join(", "));
  return response;
}

function canManageAttendance(runtime) {
  const allow = Array.isArray(runtime?.permissionsAllow)
    ? runtime.permissionsAllow
    : [];
  const deny = Array.isArray(runtime?.permissionsDeny)
    ? runtime.permissionsDeny
    : [];
  if (deny.includes("settings.manage")) return false;
  if (allow.includes("settings.manage")) return true;
  return (
    runtime?.role === "owner" ||
    runtime?.role === "admin" ||
    runtime?.role === "hr"
  );
}

function canReadAttendanceRecords(runtime, requesterUid, employeeUid) {
  if (!runtime?.isActive) return false;
  if (ATTENDANCE_ADMIN_ROLES.has(runtime?.role)) return true;
  return Boolean(employeeUid && employeeUid === requesterUid);
}

function forbidden() {
  return json(403, { ok: false, message: "attendance_management_forbidden" });
}

async function listWorkZones(db) {
  try {
    const result = await db
      .prepare(
        `
      SELECT id, name, type, center_lat, center_lng, radius_meters, active,
             created_at, updated_at
      FROM work_zones
      ORDER BY name COLLATE NOCASE ASC, id ASC
    `
      )
      .all();
    return json(200, {
      ok: true,
      zones: (result.results || []).map(mapWorkZoneRow),
    });
  } catch (error) {
    return serverError("work_zones_query_failed", error);
  }
}

async function listAttendanceRecords(url, db, directoryDb) {
  const parsed = parseAttendanceRecordsQuery(url.searchParams);
  if (!parsed.ok) return parsed.response;

  const { filters, bindings, limit, offset, cursor } = parsed.value;
  const cursorFilters = [...filters];
  const cursorBindings = [...bindings];
  if (cursor) {
    cursorFilters.push("(server_time < ? OR (server_time = ? AND id < ?))");
    cursorBindings.push(cursor.serverTime, cursor.serverTime, cursor.id);
  }

  const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const cursorWhereSql = cursorFilters.length
    ? `WHERE ${cursorFilters.join(" AND ")}`
    : "";
  const paginationSql = cursor ? "" : "OFFSET ?";
  const recordsBindings = cursor
    ? [...cursorBindings, limit + 1]
    : [...cursorBindings, limit + 1, offset];
  const today = getRiyadhDayBounds();

  try {
    const results = await db.batch([
      db
        .prepare(
          `
          SELECT
            id, employee_uid, employee_doc_id, type, server_time, client_time,
            location_lat, location_lng, location_accuracy,
            zone_id, zone_name, zone_type, allowed_zone_ids, distance_meters,
            result, rejection_reason, accuracy_accepted, device_info,
            created_by_email, created_by_role
          FROM attendance_records
          ${cursorWhereSql}
          ORDER BY server_time DESC, id DESC
          LIMIT ? ${paginationSql}
        `
        )
        .bind(...recordsBindings),
      db
        .prepare(`SELECT COUNT(*) AS total FROM attendance_records ${whereSql}`)
        .bind(...bindings),
      db
        .prepare(
          `
          SELECT
            SUM(CASE WHEN type = 'check_in' THEN 1 ELSE 0 END) AS check_ins,
            SUM(CASE WHEN type = 'check_out' THEN 1 ELSE 0 END) AS check_outs,
            SUM(CASE WHEN result = 'rejected' THEN 1 ELSE 0 END) AS rejected,
            AVG(CASE WHEN location_accuracy > 0 THEN location_accuracy ELSE NULL END) AS average_accuracy
          FROM attendance_records
          WHERE server_time >= ? AND server_time < ?
        `
        )
        .bind(today.start, today.end),
      db
        .prepare(
          `
          SELECT COUNT(*) AS new_devices
          FROM (
            SELECT
              trim(json_extract(device_info, '$.deviceId')) AS device_id,
              MIN(
                COALESCE(
                  NULLIF(trim(json_extract(device_info, '$.firstSeenAt')), ''),
                  server_time
                )
              ) AS first_seen_at
            FROM attendance_records
            WHERE length(trim(coalesce(json_extract(device_info, '$.deviceId'), ''))) > 0
            GROUP BY trim(json_extract(device_info, '$.deviceId'))
            HAVING first_seen_at >= ? AND first_seen_at < ?
          )
        `
        )
        .bind(today.start, today.end),
    ]);

    const rawRows = results[0]?.results || [];
    const hasMore = rawRows.length > limit;
    const pageRows = hasMore ? rawRows.slice(0, limit) : rawRows;
    const employeeNames = await loadAttendanceEmployeeNames(
      directoryDb,
      pageRows.map(row => row.employee_uid)
    );
    const sharedDeviceUsage = await loadSharedDeviceUsage(
      db,
      directoryDb,
      pageRows.map(row => safeJsonObject(row.device_info)?.deviceId)
    );
    const lastRow = pageRows[pageRows.length - 1] || null;
    const summary = results[2]?.results?.[0] || {};
    const deviceSummary = results[3]?.results?.[0] || {};

    return json(200, {
      ok: true,
      records: pageRows.map(row =>
        mapAttendanceRecordRow(
          row,
          employeeNames.get(row.employee_uid),
          sharedDeviceUsage.get(normalizeText(safeJsonObject(row.device_info)?.deviceId))
        )
      ),
      total: Number(results[1]?.results?.[0]?.total || 0),
      page: parsed.value.page,
      limit,
      nextCursor:
        hasMore && lastRow
          ? encodeAttendanceCursor(lastRow.server_time, lastRow.id)
          : null,
      summary: {
        checkIns: Number(summary.check_ins || 0),
        checkOuts: Number(summary.check_outs || 0),
        rejected: Number(summary.rejected || 0),
        newDevices: Number(deviceSummary.new_devices || 0),
        averageAccuracy:
          summary.average_accuracy == null
            ? null
            : Number(summary.average_accuracy),
        date: today.date,
      },
    });
  } catch (error) {
    return serverError("attendance_records_query_failed", error);
  }
}

async function loadSharedDeviceUsage(db, directoryDb, rawDeviceIds) {
  const deviceIds = Array.from(
    new Set((rawDeviceIds || []).map(normalizeText).filter(Boolean))
  );
  const usage = new Map();
  if (!deviceIds.length) return usage;

  const placeholders = deviceIds.map(() => "?").join(",");

  try {
    const result = await db
      .prepare(
        `
        SELECT
          trim(json_extract(device_info, '$.deviceId')) AS device_id,
          employee_uid,
          MAX(server_time) AS last_seen_at,
          MIN(server_time) AS first_seen_at,
          COUNT(*) AS records_count
        FROM attendance_records
        WHERE trim(json_extract(device_info, '$.deviceId')) IN (${placeholders})
          AND length(trim(coalesce(employee_uid, ''))) > 0
        GROUP BY trim(json_extract(device_info, '$.deviceId')), employee_uid
        ORDER BY device_id ASC, last_seen_at DESC
      `
      )
      .bind(...deviceIds)
      .all();

    const rows = result.results || [];
    const employeeNames = await loadAttendanceEmployeeNames(
      directoryDb,
      rows.map(row => row.employee_uid)
    );

    for (const row of rows) {
      const deviceId = normalizeText(row.device_id);
      const employeeUid = normalizeText(row.employee_uid);
      if (!deviceId || !employeeUid) continue;

      const current =
        usage.get(deviceId) || {
          employeeCount: 0,
          employees: [],
        };
      current.employees.push({
        uid: employeeUid,
        name: employeeNames.get(employeeUid) || null,
        firstSeenAt: row.first_seen_at || null,
        lastSeenAt: row.last_seen_at || null,
        recordsCount: Number(row.records_count || 0),
      });
      current.employeeCount = current.employees.length;
      usage.set(deviceId, current);
    }

    for (const [deviceId, current] of usage.entries()) {
      if (current.employeeCount <= 1) {
        usage.delete(deviceId);
      }
    }
  } catch (error) {
    console.warn("[attendance] shared device usage lookup failed", error);
  }

  return usage;
}

export function parseAttendanceRecordsQuery(searchParams) {
  const filters = [];
  const bindings = [];
  const employeeUid = normalizeText(searchParams.get("employeeUid"));
  const result = normalizeText(searchParams.get("result"));
  const type = normalizeText(searchParams.get("type"));
  const deviceChanged = normalizeText(searchParams.get("deviceChanged"));
  const fromDate = normalizeText(searchParams.get("fromDate"));
  const toDate = normalizeText(searchParams.get("toDate"));

  if (employeeUid) {
    filters.push("employee_uid = ?");
    bindings.push(employeeUid);
  }
  if (result) {
    if (!ATTENDANCE_RESULTS.has(result)) return invalidRecordsQuery("result");
    filters.push("result = ?");
    bindings.push(result);
  }
  if (type) {
    if (!ATTENDANCE_TYPES.has(type)) return invalidRecordsQuery("type");
    filters.push("type = ?");
    bindings.push(type);
  }
  if (deviceChanged) {
    if (!new Set(["true", "false"]).has(deviceChanged)) {
      return invalidRecordsQuery("deviceChanged");
    }
    filters.push("json_extract(device_info, '$.deviceChanged') = ?");
    bindings.push(deviceChanged === "true" ? 1 : 0);
  }

  if (fromDate) {
    const boundary = parseRiyadhDateBoundary(fromDate, false);
    if (!boundary) return invalidRecordsQuery("fromDate");
    filters.push("server_time >= ?");
    bindings.push(boundary);
  }
  if (toDate) {
    const boundary = parseRiyadhDateBoundary(toDate, true);
    if (!boundary) return invalidRecordsQuery("toDate");
    filters.push("server_time < ?");
    bindings.push(boundary);
  }

  const rawLimit = Number(searchParams.get("limit"));
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, ATTENDANCE_RECORDS_MAX_LIMIT)
      : ATTENDANCE_RECORDS_DEFAULT_LIMIT;
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const cursorValue = normalizeText(searchParams.get("cursor"));
  const cursor = cursorValue ? decodeAttendanceCursor(cursorValue) : null;
  if (cursorValue && !cursor) return invalidRecordsQuery("cursor");

  return {
    ok: true,
    value: {
      filters,
      bindings,
      limit,
      page,
      offset: Math.min((page - 1) * limit, 100000),
      cursor,
    },
  };
}

function invalidRecordsQuery(field) {
  return {
    ok: false,
    response: json(400, {
      ok: false,
      message: "invalid_attendance_records_query",
      field,
    }),
  };
}

export function parseRiyadhDateBoundary(value, nextDay) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const localUtc = Date.UTC(year, month - 1, day + (nextDay ? 1 : 0));
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return new Date(localUtc - 3 * 60 * 60 * 1000).toISOString();
}

function getRiyadhDayBounds() {
  const shifted = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const date = [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
  return {
    date,
    start: parseRiyadhDateBoundary(date, false),
    end: parseRiyadhDateBoundary(date, true),
  };
}

function encodeAttendanceCursor(serverTime, id) {
  return btoa(JSON.stringify({ serverTime, id }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeAttendanceCursor(value) {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    const decoded = JSON.parse(atob(normalized + padding));
    const serverTime = normalizeText(decoded?.serverTime);
    const id = normalizeText(decoded?.id);
    if (!serverTime || !id || !Number.isFinite(Date.parse(serverTime))) {
      return null;
    }
    return { serverTime, id };
  } catch {
    return null;
  }
}

async function loadAttendanceEmployeeNames(directoryDb, employeeUids) {
  const names = new Map();
  const uniqueUids = Array.from(
    new Set(employeeUids.map(normalizeText).filter(Boolean))
  );
  if (!directoryDb || !uniqueUids.length) return names;
  const placeholders = uniqueUids.map(() => "?").join(", ");
  try {
    const result = await directoryDb
      .prepare(
        `SELECT uid, name FROM employee_directory WHERE uid IN (${placeholders})`
      )
      .bind(...uniqueUids)
      .all();
    for (const row of result.results || []) {
      names.set(row.uid, normalizeText(row.name));
    }
  } catch (error) {
    console.warn("[attendance] employee name lookup failed", error);
  }
  return names;
}

function mapAttendanceRecordRow(row, employeeName, sharedDeviceUsage = null) {
  const deviceInfo = safeJsonObject(row.device_info);
  return {
    id: row.id,
    employeeUid: row.employee_uid,
    employeeDocId: row.employee_doc_id,
    employeeName: employeeName || null,
    type: row.type,
    result: row.result,
    serverTime: row.server_time,
    clientTime: row.client_time || null,
    location: {
      lat: Number(row.location_lat),
      lng: Number(row.location_lng),
      accuracy: Number(row.location_accuracy),
    },
    zoneId: row.zone_id || null,
    zoneName: row.zone_name || null,
    zoneType: row.zone_type || null,
    distanceMeters:
      row.distance_meters == null ? null : Number(row.distance_meters),
    rejectionReason: row.rejection_reason || null,
    accuracyAccepted: Number(row.accuracy_accepted) === 1,
    deviceInfo: {
      ...deviceInfo,
      sharedDevice: sharedDeviceUsage
        ? {
            employeeCount: sharedDeviceUsage.employeeCount,
            employees: sharedDeviceUsage.employees,
          }
        : null,
    },
    createdByEmail: row.created_by_email || null,
    createdByRole: row.created_by_role || null,
  };
}

function parseRiyadhDateTime(value, time) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizeText(value));
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(normalizeText(time));
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return new Date(
    Date.UTC(year, month - 1, day, hours - 3, minutes, 0, 0)
  ).toISOString();
}

async function adjustAttendanceRecords(request, db, requester) {
  const input = await readJsonBody(request);
  if (!input.ok) return input.response;

  const employeeUid = normalizeText(input.data?.employeeUid);
  const employeeDocId = normalizeText(input.data?.employeeDocId) || employeeUid;
  const date = normalizeText(input.data?.date);
  const checkInTime = normalizeText(input.data?.checkInTime);
  const checkOutTime = normalizeText(input.data?.checkOutTime);
  const note = clampText(input.data?.note, 500);
  if (!employeeUid || !employeeDocId) {
    return json(400, { ok: false, message: "invalid_employee" });
  }
  if (!parseRiyadhDateBoundary(date, false)) {
    return json(400, { ok: false, message: "invalid_attendance_date" });
  }
  if (!checkInTime && !checkOutTime) {
    return json(400, { ok: false, message: "missing_attendance_time" });
  }

  const requested = [];
  if (checkInTime) requested.push(["check_in", checkInTime]);
  if (checkOutTime) requested.push(["check_out", checkOutTime]);

  const source = JSON.stringify({
    area: "hr",
    page: "hr_employees",
    route: "worker.attendance.admin-adjustment",
    method: "manual_correction",
    note: note || null,
    adjustedByUid: requester.uid,
    adjustedByEmail: requester.email || null,
    adjustedAt: new Date().toISOString(),
  });
  const dayStart = parseRiyadhDateBoundary(date, false);
  const dayEnd = parseRiyadhDateBoundary(date, true);
  const now = new Date().toISOString();
  const changed = [];

  try {
    for (const [type, time] of requested) {
      const serverTime = parseRiyadhDateTime(date, time);
      if (!serverTime) {
        return json(400, { ok: false, message: "invalid_attendance_time" });
      }

      const existing = await db
        .prepare(
          `
          SELECT id
          FROM attendance_records
          WHERE employee_uid = ? AND type = ? AND result = 'allowed'
            AND server_time >= ? AND server_time < ?
          ORDER BY server_time ${type === "check_in" ? "ASC" : "DESC"}, id ASC
          LIMIT 1
        `
        )
        .bind(employeeUid, type, dayStart, dayEnd)
        .first();

      if (existing?.id) {
        await db
          .prepare(
            `
            UPDATE attendance_records
            SET server_time = ?, client_time = ?, source = ?,
                updated_at = ?, created_by_uid = ?, created_by_email = ?,
                created_by_role = ?
            WHERE id = ?
          `
          )
          .bind(
            serverTime,
            serverTime,
            source,
            now,
            requester.uid,
            requester.email || null,
            normalizeText(requester.runtime?.role) || "hr",
            existing.id
          )
          .run();
        changed.push({ id: existing.id, type, action: "updated", serverTime });
      } else {
        const id = crypto.randomUUID();
        await db
          .prepare(
            `
            INSERT INTO attendance_records (
              id, employee_uid, employee_doc_id, type, server_time, client_time,
              location_lat, location_lng, location_accuracy, zone_id, zone_name,
              zone_type, allowed_zone_ids, distance_meters, result,
              rejection_reason, accuracy_accepted, device_info, source,
              created_by_uid, created_by_email, created_by_role, created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, NULL, NULL, NULL, '[]',
              NULL, 'allowed', NULL, 1, ?, ?, ?, ?, ?, ?, ?)
          `
          )
          .bind(
            id,
            employeeUid,
            employeeDocId,
            type,
            serverTime,
            serverTime,
            JSON.stringify({ adminAdjusted: true }),
            source,
            requester.uid,
            requester.email || null,
            normalizeText(requester.runtime?.role) || "hr",
            now,
            now
          )
          .run();
        changed.push({ id, type, action: "created", serverTime });
      }
    }

    await rebuildAttendanceState(db, employeeUid);
    return json(200, { ok: true, records: changed });
  } catch (error) {
    return serverError("attendance_admin_adjustment_failed", error);
  }
}

function safeJsonObject(value) {
  try {
    const parsed = JSON.parse(normalizeText(value) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

async function createWorkZone(request, db, requester) {
  const input = await readJsonBody(request);
  if (!input.ok) return input.response;
  const zone = normalizeWorkZoneInput(input.data);
  if (!zone.ok) return zone.response;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        `
      INSERT INTO work_zones (
        id, name, type, center_lat, center_lng, radius_meters, active,
        created_by_uid, created_at, updated_by_uid, updated_at
      ) VALUES (?, ?, 'radius', ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .bind(
        id,
        zone.value.name,
        zone.value.center.lat,
        zone.value.center.lng,
        zone.value.radiusMeters,
        zone.value.active ? 1 : 0,
        requester.uid,
        now,
        requester.uid,
        now
      )
      .run();
    return json(201, {
      ok: true,
      zone: { id, ...zone.value, createdAt: now, updatedAt: now },
    });
  } catch (error) {
    return serverError("work_zone_create_failed", error);
  }
}

async function updateWorkZone(request, db, requester, id) {
  if (!id) return json(400, { ok: false, message: "invalid_work_zone_id" });
  const input = await readJsonBody(request);
  if (!input.ok) return input.response;
  const zone = normalizeWorkZoneInput(input.data);
  if (!zone.ok) return zone.response;

  const now = new Date().toISOString();
  try {
    const result = await db
      .prepare(
        `
      UPDATE work_zones
      SET name = ?, type = 'radius', center_lat = ?, center_lng = ?,
          radius_meters = ?, active = ?, updated_by_uid = ?, updated_at = ?
      WHERE id = ?
    `
      )
      .bind(
        zone.value.name,
        zone.value.center.lat,
        zone.value.center.lng,
        zone.value.radiusMeters,
        zone.value.active ? 1 : 0,
        requester.uid,
        now,
        id
      )
      .run();
    if (!result.meta?.changes)
      return json(404, { ok: false, message: "work_zone_not_found" });
    return json(200, { ok: true, zone: { id, ...zone.value, updatedAt: now } });
  } catch (error) {
    return serverError("work_zone_update_failed", error);
  }
}

async function deleteWorkZone(db, id) {
  if (!id) return json(400, { ok: false, message: "invalid_work_zone_id" });
  try {
    const result = await db
      .prepare("DELETE FROM work_zones WHERE id = ?")
      .bind(id)
      .run();
    if (!result.meta?.changes)
      return json(404, { ok: false, message: "work_zone_not_found" });
    return json(200, { ok: true, id });
  } catch (error) {
    return serverError("work_zone_delete_failed", error);
  }
}

async function recordAttendance({
  request,
  db,
  requester,
  fetchFirestoreDocument,
}) {
  const input = await readJsonBody(request);
  if (!input.ok) return input.response;

  const type = normalizeText(input.data?.type);
  const location = normalizeLocation(
    input.data?.location || input.data?.clientLocation
  );
  if (!ATTENDANCE_TYPES.has(type)) {
    return json(400, { ok: false, message: "invalid_attendance_type" });
  }
  if (!location)
    return json(400, { ok: false, message: "invalid_gps_location" });

  const userData = requester.userData || {};
  const linkedEmployeeId = normalizeText(userData.linkedEmployeeId);
  const requestedEmployeeId = normalizeText(input.data?.employeeId);
  if (
    requestedEmployeeId &&
    requestedEmployeeId !== requester.uid &&
    requestedEmployeeId !== linkedEmployeeId
  ) {
    return json(403, { ok: false, message: "attendance_employee_mismatch" });
  }

  if (
    !ATTENDANCE_ALLOWED_ROLES.has(requester.runtime?.role) &&
    !userData.employeeProfileEnabled &&
    !linkedEmployeeId &&
    !requestedEmployeeId
  ) {
    return json(403, { ok: false, message: "attendance_not_enabled" });
  }

  const employeeDocId = requestedEmployeeId || linkedEmployeeId || requester.uid;
  const employeeResult = await fetchFirestoreDocument({
    projectId: requester.projectId,
    idToken: requester.idToken,
    documentPath: `employees/${employeeDocId}`,
  });
  if (!employeeResult.ok) {
    return json(employeeResult.status || 403, {
      ok: false,
      message: "firebase_employee_lookup_failed",
      detail: employeeResult.error || null,
    });
  }
  const employeeData = employeeResult.found
    ? employeeResult.data?.data || {}
    : {};
  const allowedZoneIds = pickAllowedZoneIds(employeeData, userData);
  const zoneResolution = await resolveZones(db, allowedZoneIds);
  const zoneCheck = evaluateAttendanceZones(location, zoneResolution.zones);

  const locationDecision = evaluateLocationDecision({
    location,
    zoneError: zoneResolution.error,
    zoneCheck,
  });
  const initialResult = locationDecision.result;
  const initialReason = locationDecision.rejectionReason;

  const recordId = crypto.randomUUID();
  const now = new Date().toISOString();
  const clientTime = clampText(input.data?.clientTime, 80) || null;
  const deviceInfo = normalizeDeviceInfo(input.data?.deviceInfo);
  const zone = zoneCheck.zone;
  const role = normalizeText(requester.runtime?.role) || "guest";

  try {
    if (initialResult === "rejected") {
      await insertRejectedRecord(db, {
        recordId,
        requester,
        employeeDocId,
        type,
        now,
        clientTime,
        location,
        zone,
        allowedZoneIds,
        distanceMeters: zoneCheck.distanceMeters,
        rejectionReason: initialReason,
        deviceInfo,
        role,
      });
      const currentState = await readAttendanceState(db, requester.uid);
      return attendanceResponse({
        recordId,
        type,
        result: "rejected",
        rejectionReason: initialReason,
        location,
        zone,
        distanceMeters: zoneCheck.distanceMeters,
        previousStatus: currentState?.status || null,
        currentStatus: currentState?.status || null,
      });
    }

    const previousDeviceId = await readLastSuccessfulDeviceId(
      db,
      requester.uid
    );
    const deviceChange = evaluateDeviceChange(
      deviceInfo.deviceId,
      previousDeviceId
    );

    const stateRequirement = type === "check_in" ? "checked_out" : "checked_in";
    const targetStatus = type === "check_in" ? "checked_in" : "checked_out";
    const stateRejection =
      type === "check_in" ? "duplicate_check_in" : "not_checked_in";
    const currentDay = getRiyadhDayBounds();
    const stateUpdateWhere =
      type === "check_in"
        ? "(status = 'checked_out' OR last_server_time IS NULL OR last_server_time < ? OR last_server_time >= ?)"
        : "(status = 'checked_in' AND last_server_time >= ? AND last_server_time < ?)";
    const source = JSON.stringify({
      area: "employee",
      page: "employee_profile",
      route: "worker.attendance.record",
      method: "gps_button",
    });

    const results = await db.batch([
      buildRecordInsert(db, {
        recordId,
        requester,
        employeeDocId,
        type,
        now,
        clientTime,
        location,
        zone,
        allowedZoneIds,
        distanceMeters: zoneCheck.distanceMeters,
        result: "rejected",
        rejectionReason: stateRejection,
        deviceInfo,
        role,
        source,
      }),
      db
        .prepare(
          `
        INSERT OR IGNORE INTO attendance_state (
          employee_uid, employee_doc_id, status, updated_at
        ) VALUES (?, ?, 'checked_out', ?)
      `
        )
        .bind(requester.uid, employeeDocId, now),
      db
        .prepare(
          `
        UPDATE attendance_state
        SET employee_doc_id = ?, status = ?, last_type = ?, last_record_id = ?,
            last_server_time = ?, last_location_lat = ?, last_location_lng = ?,
            last_location_accuracy = ?, last_zone_id = ?, updated_at = ?
        WHERE employee_uid = ? AND ${stateUpdateWhere}
      `
        )
        .bind(
          employeeDocId,
          targetStatus,
          type,
          recordId,
          now,
          location.lat,
          location.lng,
          location.accuracy,
          zone?.id || null,
          now,
          requester.uid,
          currentDay.start,
          currentDay.end
        ),
      db
        .prepare(
          `
        UPDATE attendance_records
        SET result = CASE
              WHEN (SELECT last_record_id FROM attendance_state WHERE employee_uid = ?) = ?
                THEN 'allowed' ELSE 'rejected' END,
            rejection_reason = CASE
              WHEN (SELECT last_record_id FROM attendance_state WHERE employee_uid = ?) = ?
                THEN NULL ELSE ? END,
            updated_at = ?
        WHERE id = ?
      `
        )
        .bind(
          requester.uid,
          recordId,
          requester.uid,
          recordId,
          stateRejection,
          now,
          recordId
        ),
      db
        .prepare(
          `
        UPDATE attendance_records
        SET device_info = json_set(
          device_info,
          '$.deviceChanged', json(?),
          '$.previousDeviceId', json(?)
        )
        WHERE id = ? AND result = 'allowed'
      `
        )
        .bind(
          deviceChange.deviceChanged ? "true" : "false",
          deviceChange.previousDeviceId
            ? JSON.stringify(deviceChange.previousDeviceId)
            : "null",
          recordId
        ),
      db
        .prepare(
          "SELECT result, rejection_reason FROM attendance_records WHERE id = ?"
        )
        .bind(recordId),
    ]);

    const recordRows = results[5]?.results || [];
    const savedResult =
      recordRows[0]?.result === "allowed" ? "allowed" : "rejected";
    const savedReason = savedResult === "allowed" ? null : stateRejection;
    const previousStatus =
      savedResult === "allowed" ? stateRequirement : targetStatus;
    const currentStatus =
      savedResult === "allowed" ? targetStatus : previousStatus;
    return attendanceResponse({
      recordId,
      type,
      result: savedResult,
      rejectionReason: savedReason,
      location,
      zone,
      distanceMeters: zoneCheck.distanceMeters,
      previousStatus,
      currentStatus,
    });
  } catch (error) {
    return serverError("attendance_record_failed", error);
  }
}

function buildRecordInsert(db, values) {
  return db
    .prepare(
      `
    INSERT INTO attendance_records (
      id, employee_uid, employee_doc_id, type, server_time, client_time,
      location_lat, location_lng, location_accuracy, zone_id, zone_name, zone_type,
      allowed_zone_ids, distance_meters, result, rejection_reason, accuracy_accepted,
      device_info, source, created_by_uid, created_by_email, created_by_role,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .bind(
      values.recordId,
      values.requester.uid,
      values.employeeDocId,
      values.type,
      values.now,
      values.clientTime,
      values.location.lat,
      values.location.lng,
      values.location.accuracy,
      values.zone?.id || null,
      values.zone?.name || null,
      values.zone?.type || null,
      JSON.stringify(values.allowedZoneIds),
      values.distanceMeters,
      values.result,
      values.rejectionReason,
      values.location.accuracy <= ATTENDANCE_MAX_ACCURACY_METERS ? 1 : 0,
      JSON.stringify(values.deviceInfo),
      values.source ||
        JSON.stringify({
          area: "employee",
          page: "employee_profile",
          route: "worker.attendance.record",
          method: "gps_button",
        }),
      values.requester.uid,
      values.requester.email || null,
      values.role,
      values.now,
      values.now
    );
}

async function insertRejectedRecord(db, values) {
  await buildRecordInsert(db, {
    ...values,
    result: "rejected",
    source: JSON.stringify({
      area: "employee",
      page: "employee_profile",
      route: "worker.attendance.record",
      method: "gps_button",
    }),
  }).run();
}

async function readAttendanceState(db, uid) {
  return db
    .prepare("SELECT status FROM attendance_state WHERE employee_uid = ?")
    .bind(uid)
    .first();
}

async function rebuildAttendanceState(db, employeeUid) {
  const latest = await db
    .prepare(
      `
      SELECT employee_uid, employee_doc_id, type, id, server_time,
             location_lat, location_lng, location_accuracy, zone_id
      FROM attendance_records
      WHERE employee_uid = ? AND result = 'allowed'
      ORDER BY server_time DESC, id DESC
      LIMIT 1
    `
    )
    .bind(employeeUid)
    .first();

  if (!latest) return;

  await db
    .prepare(
      `
      INSERT INTO attendance_state (
        employee_uid, employee_doc_id, status, last_type, last_record_id,
        last_server_time, last_location_lat, last_location_lng,
        last_location_accuracy, last_zone_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_uid) DO UPDATE SET
        employee_doc_id = excluded.employee_doc_id,
        status = excluded.status,
        last_type = excluded.last_type,
        last_record_id = excluded.last_record_id,
        last_server_time = excluded.last_server_time,
        last_location_lat = excluded.last_location_lat,
        last_location_lng = excluded.last_location_lng,
        last_location_accuracy = excluded.last_location_accuracy,
        last_zone_id = excluded.last_zone_id,
        updated_at = excluded.updated_at
    `
    )
    .bind(
      latest.employee_uid,
      latest.employee_doc_id,
      latest.type === "check_in" ? "checked_in" : "checked_out",
      latest.type,
      latest.id,
      latest.server_time,
      latest.location_lat,
      latest.location_lng,
      latest.location_accuracy,
      latest.zone_id || null,
      new Date().toISOString()
    )
    .run();
}

async function readLastSuccessfulDeviceId(db, employeeUid) {
  const row = await db
    .prepare(
      `
      SELECT json_extract(device_info, '$.deviceId') AS device_id
      FROM attendance_records
      WHERE employee_uid = ?
        AND result = 'allowed'
        AND length(trim(coalesce(json_extract(device_info, '$.deviceId'), ''))) > 0
      ORDER BY server_time DESC, id DESC
      LIMIT 1
    `
    )
    .bind(employeeUid)
    .first();
  return normalizeText(row?.device_id) || null;
}

async function resolveZones(db, allowedZoneIds) {
  if (!allowedZoneIds.length) return { zones: [], error: "zone_not_found" };
  const placeholders = allowedZoneIds.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `
    SELECT id, name, type, center_lat, center_lng, radius_meters, active,
           created_at, updated_at
    FROM work_zones WHERE id IN (${placeholders})
  `
    )
    .bind(...allowedZoneIds)
    .all();
  const rows = result.results || [];
  if (rows.length !== allowedZoneIds.length)
    return { zones: [], error: "zone_not_found" };
  const zones = rows.map(mapWorkZoneRow);
  if (zones.some(zone => zone.type !== "radius"))
    return { zones: [], error: "unsupported_zone_type" };
  if (zones.some(zone => !zone.active || zone.radiusMeters <= 0))
    return { zones: [], error: "zone_invalid" };
  return { zones, error: "" };
}

export function evaluateAttendanceZones(location, zones) {
  if (!Array.isArray(zones) || !zones.length) {
    return { zone: null, distanceMeters: null, withinZone: false };
  }
  const evaluated = zones
    .map(zone => ({
      zone,
      distanceMeters: calculateDistanceMeters(location, zone.center),
    }))
    .sort((left, right) => left.distanceMeters - right.distanceMeters);
  const matching = evaluated.find(
    item => item.distanceMeters <= item.zone.radiusMeters
  );
  return {
    zone: matching?.zone || evaluated[0]?.zone || null,
    distanceMeters:
      matching?.distanceMeters ?? evaluated[0]?.distanceMeters ?? null,
    withinZone: Boolean(matching),
  };
}

export function evaluateLocationDecision({ location, zoneError, zoneCheck }) {
  if (zoneError) {
    return { result: "rejected", rejectionReason: zoneError };
  }
  if (!zoneCheck.withinZone) {
    return { result: "rejected", rejectionReason: "outside_zone" };
  }
  if (location.accuracy > ATTENDANCE_MAX_ACCURACY_METERS) {
    return { result: "rejected", rejectionReason: "poor_accuracy" };
  }
  return { result: "allowed", rejectionReason: null };
}

function isServerTimeWithinBounds(serverTime, bounds) {
  if (!bounds?.start || !bounds?.end || !serverTime) return true;
  return serverTime >= bounds.start && serverTime < bounds.end;
}

export function evaluateStateTransition(type, currentStatus, options = {}) {
  const isSameAttendanceDay = isServerTimeWithinBounds(
    options.lastServerTime,
    options.dayBounds
  );
  if (
    type === "check_in" &&
    currentStatus === "checked_in" &&
    isSameAttendanceDay
  ) {
    return {
      result: "rejected",
      rejectionReason: "duplicate_check_in",
      currentStatus,
    };
  }
  if (
    type === "check_out" &&
    (currentStatus !== "checked_in" || !isSameAttendanceDay)
  ) {
    return {
      result: "rejected",
      rejectionReason: "not_checked_in",
      currentStatus: currentStatus || null,
    };
  }
  return {
    result: "allowed",
    rejectionReason: null,
    currentStatus: type === "check_in" ? "checked_in" : "checked_out",
  };
}

export function evaluateDeviceChange(currentDeviceId, previousDeviceId) {
  const current = normalizeText(currentDeviceId);
  const previous = normalizeText(previousDeviceId);
  const deviceChanged = Boolean(current && previous && current !== previous);
  return {
    deviceChanged,
    previousDeviceId: deviceChanged ? previous : null,
  };
}

function riyadhDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function pickRecordDeviceId(record) {
  const snakeDeviceInfo =
    typeof record?.device_info === "string"
      ? safeJsonObject(record.device_info)
      : record?.device_info;
  return normalizeText(
    record?.deviceId ||
      record?.deviceInfo?.deviceId ||
      snakeDeviceInfo?.deviceId
  );
}

function pickRecordServerTime(record) {
  return normalizeText(record?.serverTime || record?.server_time);
}

export function isDeviceFirstSeenToday(device, records = [], todayDateKey) {
  const deviceId = normalizeText(device?.deviceId || device?.id || device);
  if (!deviceId) return false;

  const today = normalizeText(todayDateKey) || riyadhDateKey(new Date());
  const explicitFirstSeen = normalizeText(
    device?.firstSeenAt || device?.first_seen_at
  );
  if (explicitFirstSeen) {
    return riyadhDateKey(explicitFirstSeen) === today;
  }

  let firstSeenMs = Infinity;
  let firstSeenValue = "";
  for (const record of records || []) {
    if (pickRecordDeviceId(record) !== deviceId) continue;
    const serverTime = pickRecordServerTime(record);
    const serverTimeMs = Date.parse(serverTime);
    if (Number.isFinite(serverTimeMs) && serverTimeMs < firstSeenMs) {
      firstSeenMs = serverTimeMs;
      firstSeenValue = serverTime;
    }
  }

  return Boolean(firstSeenValue) && riyadhDateKey(firstSeenValue) === today;
}

export function calculateDistanceMeters(left, right) {
  const toRadians = degrees => (degrees * Math.PI) / 180;
  const latDelta = toRadians(right.lat - left.lat);
  const lngDelta = toRadians(right.lng - left.lng);
  const leftLat = toRadians(left.lat);
  const rightLat = toRadians(right.lat);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(lngDelta / 2) ** 2;
  return Math.round(
    EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
}

function pickAllowedZoneIds(employeeData, userData) {
  return uniqueStrings(
    employeeData?.allowedZoneIds,
    employeeData?.employeeProfile?.employment?.allowedZoneIds,
    employeeData?.employment?.allowedZoneIds,
    userData?.allowedZoneIds,
    userData?.employeeProfile?.employment?.allowedZoneIds,
    userData?.employment?.allowedZoneIds,
    [
      employeeData?.workZoneId,
      employeeData?.zoneId,
      employeeData?.attendanceZoneId,
      employeeData?.employeeProfile?.employment?.workZoneId,
      employeeData?.employeeProfile?.employment?.zoneId,
      employeeData?.employeeProfile?.employment?.attendanceZoneId,
      employeeData?.employment?.workZoneId,
      employeeData?.employment?.zoneId,
      employeeData?.employment?.attendanceZoneId,
      userData?.workZoneId,
      userData?.zoneId,
      userData?.attendanceZoneId,
      userData?.employeeProfile?.employment?.workZoneId,
      userData?.employeeProfile?.employment?.zoneId,
      userData?.employeeProfile?.employment?.attendanceZoneId,
      userData?.employment?.workZoneId,
      userData?.employment?.zoneId,
      userData?.employment?.attendanceZoneId,
    ]
  );
}

function uniqueStrings(...values) {
  const output = [];
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const normalized = normalizeText(item);
      if (normalized && !output.includes(normalized)) output.push(normalized);
    }
  }
  return output;
}

function normalizeWorkZoneInput(value) {
  const data = value && typeof value === "object" ? value : {};
  const name = clampText(data.name, 160);
  const type = normalizeText(data.type || "radius").toLowerCase();
  const center =
    data.center && typeof data.center === "object" ? data.center : {};
  const lat = finiteNumber(center.lat ?? center.latitude);
  const lng = finiteNumber(center.lng ?? center.longitude);
  const radiusMeters = finiteNumber(data.radiusMeters);
  if (
    !name ||
    type !== "radius" ||
    lat === null ||
    lat < -90 ||
    lat > 90 ||
    lng === null ||
    lng < -180 ||
    lng > 180 ||
    radiusMeters === null ||
    radiusMeters <= 0
  ) {
    return {
      ok: false,
      response: json(400, { ok: false, message: "invalid_work_zone" }),
    };
  }
  return {
    ok: true,
    value: {
      name,
      type: "radius",
      center: { lat, lng },
      radiusMeters,
      active: data.active !== false,
    },
  };
}

function normalizeLocation(value) {
  if (!value || typeof value !== "object") return null;
  const lat = finiteNumber(value.lat ?? value.latitude);
  const lng = finiteNumber(value.lng ?? value.longitude);
  const accuracy = finiteNumber(value.accuracy);
  if (
    lat === null ||
    lat < -90 ||
    lat > 90 ||
    lng === null ||
    lng < -180 ||
    lng > 180 ||
    accuracy === null ||
    accuracy < 0
  )
    return null;
  return { lat, lng, accuracy };
}

function normalizeDeviceInfo(value) {
  const info = value && typeof value === "object" ? value : {};
  return {
    deviceId: clampText(info.deviceId, 120) || null,
    deviceChanged: false,
    previousDeviceId: null,
    userAgent: clampText(info.userAgent, 400) || null,
    platform: clampText(info.platform, 120) || null,
    language: clampText(info.language, 40) || null,
    timeZone: clampText(info.timeZone, 80) || null,
  };
}

function mapWorkZoneRow(row) {
  return {
    id: String(row.id),
    name: String(row.name),
    type: "radius",
    center: { lat: Number(row.center_lat), lng: Number(row.center_lng) },
    radiusMeters: Number(row.radius_meters),
    active: Number(row.active) === 1,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function attendanceResponse({
  recordId,
  type,
  result,
  rejectionReason,
  location,
  zone,
  distanceMeters,
  previousStatus,
  currentStatus,
}) {
  return json(200, {
    ok: result === "allowed",
    id: recordId,
    result,
    type,
    rejectionReason: rejectionReason || null,
    accuracy: location.accuracy,
    zoneId: zone?.id || null,
    distanceMeters,
    allowedRadiusMeters: zone?.radiusMeters ?? null,
    previousStatus: previousStatus || null,
    currentStatus: currentStatus || null,
  });
}

async function readJsonBody(request) {
  try {
    return { ok: true, data: await request.json() };
  } catch {
    return {
      ok: false,
      response: json(400, { ok: false, message: "invalid_json_body" }),
    };
  }
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

function clampText(value, maxLength) {
  const text = normalizeText(value);
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

function serverError(message, error) {
  console.error(`[attendance] ${message}`, error);
  return json(500, {
    ok: false,
    message,
    detail: error instanceof Error ? error.message : String(error),
  });
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
