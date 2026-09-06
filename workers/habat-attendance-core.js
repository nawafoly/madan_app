const HABAT_ACCESS_LEVELS = new Set(["employee", "manager"]);
const HABAT_DEFAULT_RECORD_LIMIT = 100;
const HABAT_MAX_RECORD_LIMIT = 300;

export async function handleHabatAttendanceRequest({
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
  const accessMatch = pathname.match(/^\/attendance\/habat\/access\/([^/]+)$/);
  const recordMatch = pathname.match(/^\/attendance\/habat\/records\/([^/]+)$/);

  if (!isKnownPath(pathname, accessMatch, recordMatch)) {
    return json(404, { ok: false, message: "not_found" });
  }

  const requester = await resolveRequesterContext(request);
  if (!requester?.ok) return requester?.response || json(401, { ok: false, message: "unauthorized" });
  if (!requester.runtime?.isActive) {
    return json(403, { ok: false, message: "inactive_account" });
  }

  const principal = await resolveHabatPrincipal(db, requester);
  if (!principal.ok) return principal.response;

  if (pathname === "/attendance/habat/me") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    const today = await getTodayRecord(db, requester.uid);
    return json(200, {
      ok: true,
      principal: mapPrincipal(principal),
      today: mapRecord(today),
      date: getRiyadhDateKey(),
    });
  }

  if (pathname === "/attendance/habat/check-in") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    if (!principal.canClock) return forbidden("habat_clock_forbidden");
    return checkIn(db, request, requester, principal);
  }

  if (pathname === "/attendance/habat/check-out") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    if (!principal.canClock) return forbidden("habat_clock_forbidden");
    return checkOut(db, request, requester, principal);
  }

  if (pathname === "/attendance/habat/records") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    if (!principal.canManage) return forbidden("habat_management_forbidden");
    return listRecords(db, url);
  }

  if (recordMatch) {
    if (request.method !== "PATCH") return methodNotAllowed(["PATCH"]);
    if (!principal.canManage) return forbidden("habat_management_forbidden");
    return updateRecord(
      db,
      request,
      requester,
      decodeURIComponent(recordMatch[1])
    );
  }

  if (pathname === "/attendance/habat/access") {
    if (!principal.canManage) return forbidden("habat_management_forbidden");
    if (request.method === "GET") return listAccess(db);
    if (request.method === "POST") {
      return createAccess(db, request, requester);
    }
    return methodNotAllowed(["GET", "POST"]);
  }

  if (accessMatch) {
    if (!principal.canManage) return forbidden("habat_management_forbidden");
    const accessId = decodeURIComponent(accessMatch[1]);
    if (request.method === "PATCH") {
      return updateAccess(db, request, requester, accessId);
    }
    if (request.method === "DELETE") {
      return deleteAccess(db, requester, accessId);
    }
    return methodNotAllowed(["PATCH", "DELETE"]);
  }

  return json(404, { ok: false, message: "not_found" });
}

function isKnownPath(pathname, accessMatch, recordMatch) {
  return (
    pathname === "/attendance/habat/me" ||
    pathname === "/attendance/habat/check-in" ||
    pathname === "/attendance/habat/check-out" ||
    pathname === "/attendance/habat/records" ||
    pathname === "/attendance/habat/access" ||
    Boolean(accessMatch) ||
    Boolean(recordMatch)
  );
}

async function resolveHabatPrincipal(db, requester) {
  const uid = normalizeText(requester?.uid);
  const email = normalizeText(requester?.email).toLowerCase();
  const runtimeRole = normalizeText(requester?.runtime?.role).toLowerCase();
  const fallbackName = resolveRequesterDisplayName(requester);

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

  if (!uid && !email) return { ok: false, response: forbidden("habat_access_forbidden") };

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

    if (!row) {
      return { ok: false, response: forbidden("habat_access_forbidden") };
    }

    const rowUid = normalizeText(row.uid);
    if (!rowUid && uid && email && normalizeText(row.email).toLowerCase() === email) {
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
        console.warn("[habat-attendance] access uid backfill skipped", error);
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
  } catch (error) {
    console.error("[habat-attendance] principal lookup failed", error);
    return {
      ok: false,
      response: json(500, { ok: false, message: "habat_access_lookup_failed" }),
    };
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

async function getTodayRecord(db, uid) {
  const normalizedUid = normalizeText(uid);
  if (!normalizedUid) return null;
  try {
    return await db
      .prepare(
        `SELECT * FROM habat_attendance_records
         WHERE account_uid = ? AND attendance_date = ?
         LIMIT 1`
      )
      .bind(normalizedUid, getRiyadhDateKey())
      .first();
  } catch (error) {
    console.error("[habat-attendance] today lookup failed", error);
    return null;
  }
}

async function checkIn(db, request, requester, principal) {
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

  const now = nowIso();
  const id = `habat_${crypto.randomUUID()}`;
  const meta = readRequestMetadata(request);

  try {
    if (existing) {
      await db
        .prepare(
          `UPDATE habat_attendance_records
           SET check_in_at = ?, check_in_ip = ?, check_in_user_agent = ?,
               account_email = ?, display_name = ?, access_id = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(
          now,
          meta.ip,
          meta.userAgent,
          principal.email || null,
          principal.displayName || null,
          principal.accessId || null,
          now,
          existing.id
        )
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO habat_attendance_records (
             id, access_id, account_uid, account_email, display_name,
             attendance_date, check_in_at, check_in_ip, check_in_user_agent,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          principal.accessId || null,
          uid,
          principal.email || null,
          principal.displayName || null,
          date,
          now,
          meta.ip,
          meta.userAgent,
          now,
          now
        )
        .run();
    }

    const record = await getTodayRecord(db, uid);
    await writeAudit(db, requester, "check_in", "habat_attendance_record", record?.id || id, null, record);
    return json(200, { ok: true, record: mapRecord(record) });
  } catch (error) {
    console.error("[habat-attendance] check-in failed", error);
    return json(500, { ok: false, message: "habat_check_in_failed" });
  }
}

async function checkOut(db, request, requester, principal) {
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

  const now = nowIso();
  const meta = readRequestMetadata(request);

  try {
    await db
      .prepare(
        `UPDATE habat_attendance_records
         SET check_out_at = ?, check_out_ip = ?, check_out_user_agent = ?,
             account_email = ?, display_name = ?, access_id = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(
        now,
        meta.ip,
        meta.userAgent,
        principal.email || null,
        principal.displayName || null,
        principal.accessId || null,
        now,
        existing.id
      )
      .run();

    const record = await getTodayRecord(db, uid);
    await writeAudit(db, requester, "check_out", "habat_attendance_record", existing.id, existing, record);
    return json(200, { ok: true, record: mapRecord(record) });
  } catch (error) {
    console.error("[habat-attendance] check-out failed", error);
    return json(500, { ok: false, message: "habat_check_out_failed" });
  }
}

async function listRecords(db, url) {
  const to = normalizeDateKey(url.searchParams.get("to")) || getRiyadhDateKey();
  const from = normalizeDateKey(url.searchParams.get("from")) || shiftDateKey(to, -30);
  const email = normalizeText(url.searchParams.get("email")).toLowerCase();
  const rawLimit = Number(url.searchParams.get("limit") || HABAT_DEFAULT_RECORD_LIMIT);
  const limit = Math.min(
    HABAT_MAX_RECORD_LIMIT,
    Math.max(1, Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : HABAT_DEFAULT_RECORD_LIMIT)
  );

  const filters = ["attendance_date >= ?", "attendance_date <= ?"];
  const bindings = [from, to];
  if (email) {
    filters.push("lower(account_email) = ?");
    bindings.push(email);
  }

  try {
    const result = await db
      .prepare(
        `SELECT id, access_id, account_uid, account_email, display_name,
                attendance_date, check_in_at, check_out_at, notes, created_at, updated_at
         FROM habat_attendance_records
         WHERE ${filters.join(" AND ")}
         ORDER BY attendance_date DESC, check_in_at DESC, id DESC
         LIMIT ?`
      )
      .bind(...bindings, limit)
      .all();

    return json(200, {
      ok: true,
      records: (result.results || []).map(mapRecord),
      from,
      to,
      limit,
    });
  } catch (error) {
    console.error("[habat-attendance] records query failed", error);
    return json(500, { ok: false, message: "habat_records_query_failed" });
  }
}

async function updateRecord(db, request, requester, id) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const current = await db
    .prepare(`SELECT * FROM habat_attendance_records WHERE id = ? LIMIT 1`)
    .bind(id)
    .first();
  if (!current) return json(404, { ok: false, message: "habat_record_not_found" });

  const checkInAt = normalizeOptionalIso(body.value?.checkInAt, current.check_in_at);
  const checkOutAt = normalizeOptionalIso(body.value?.checkOutAt, current.check_out_at);
  const notes = body.value?.notes === null ? null : normalizeText(body.value?.notes ?? current.notes) || null;

  if (checkInAt && checkOutAt && Date.parse(checkOutAt) < Date.parse(checkInAt)) {
    return json(400, { ok: false, message: "habat_invalid_attendance_order" });
  }

  try {
    await db
      .prepare(
        `UPDATE habat_attendance_records
         SET check_in_at = ?, check_out_at = ?, notes = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(checkInAt, checkOutAt, notes, nowIso(), id)
      .run();
    const next = await db
      .prepare(`SELECT * FROM habat_attendance_records WHERE id = ? LIMIT 1`)
      .bind(id)
      .first();
    await writeAudit(db, requester, "manager_update_record", "habat_attendance_record", id, current, next);
    return json(200, { ok: true, record: mapRecord(next) });
  } catch (error) {
    console.error("[habat-attendance] record update failed", error);
    return json(500, { ok: false, message: "habat_record_update_failed" });
  }
}

async function listAccess(db) {
  try {
    const result = await db
      .prepare(
        `SELECT id, uid, email, display_name, access_level, clock_enabled, is_active,
                created_at, updated_at
         FROM habat_attendance_access
         ORDER BY is_active DESC, access_level DESC, display_name COLLATE NOCASE ASC, email ASC`
      )
      .all();
    return json(200, { ok: true, accounts: (result.results || []).map(mapAccessRow) });
  } catch (error) {
    console.error("[habat-attendance] access list failed", error);
    return json(500, { ok: false, message: "habat_access_list_failed" });
  }
}

async function createAccess(db, request, requester) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const email = normalizeText(body.value?.email).toLowerCase();
  const displayName = normalizeText(body.value?.displayName) || null;
  const accessLevel = normalizeText(body.value?.accessLevel || "employee").toLowerCase();
  const clockEnabled = body.value?.clockEnabled !== false;

  if (!isValidEmail(email)) return json(400, { ok: false, message: "habat_invalid_email" });
  if (!HABAT_ACCESS_LEVELS.has(accessLevel)) {
    return json(400, { ok: false, message: "habat_invalid_access_level" });
  }

  const id = `habat_access_${crypto.randomUUID()}`;
  const now = nowIso();
  try {
    await db
      .prepare(
        `INSERT INTO habat_attendance_access (
           id, uid, email, display_name, access_level, clock_enabled, is_active,
           created_by_uid, created_by_email, created_at, updated_at
         ) VALUES (?, NULL, ?, ?, ?, ?, 1, ?, ?, ?, ?)
         ON CONFLICT(lower(email)) DO UPDATE SET
           display_name = excluded.display_name,
           access_level = excluded.access_level,
           clock_enabled = excluded.clock_enabled,
           is_active = 1,
           updated_at = excluded.updated_at`
      )
      .bind(
        id,
        email,
        displayName,
        accessLevel,
        clockEnabled ? 1 : 0,
        normalizeText(requester.uid) || null,
        normalizeText(requester.email).toLowerCase() || null,
        now,
        now
      )
      .run();

    const row = await db
      .prepare(`SELECT * FROM habat_attendance_access WHERE lower(email) = ? LIMIT 1`)
      .bind(email)
      .first();
    await writeAudit(db, requester, "create_or_enable_access", "habat_attendance_access", row?.id || id, null, row);
    return json(200, { ok: true, account: mapAccessRow(row) });
  } catch (error) {
    console.error("[habat-attendance] access create failed", error);
    return json(500, { ok: false, message: "habat_access_create_failed" });
  }
}

async function updateAccess(db, request, requester, id) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const current = await db
    .prepare(`SELECT * FROM habat_attendance_access WHERE id = ? LIMIT 1`)
    .bind(id)
    .first();
  if (!current) return json(404, { ok: false, message: "habat_access_not_found" });

  const displayName =
    body.value?.displayName === undefined
      ? current.display_name
      : normalizeText(body.value.displayName) || null;
  const accessLevel = normalizeText(body.value?.accessLevel ?? current.access_level).toLowerCase();
  if (!HABAT_ACCESS_LEVELS.has(accessLevel)) {
    return json(400, { ok: false, message: "habat_invalid_access_level" });
  }
  const clockEnabled =
    body.value?.clockEnabled === undefined
      ? Number(current.clock_enabled) === 1
      : Boolean(body.value.clockEnabled);
  const isActive =
    body.value?.isActive === undefined
      ? Number(current.is_active) === 1
      : Boolean(body.value.isActive);

  try {
    await db
      .prepare(
        `UPDATE habat_attendance_access
         SET display_name = ?, access_level = ?, clock_enabled = ?, is_active = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(displayName, accessLevel, clockEnabled ? 1 : 0, isActive ? 1 : 0, nowIso(), id)
      .run();
    const next = await db
      .prepare(`SELECT * FROM habat_attendance_access WHERE id = ? LIMIT 1`)
      .bind(id)
      .first();
    await writeAudit(db, requester, "update_access", "habat_attendance_access", id, current, next);
    return json(200, { ok: true, account: mapAccessRow(next) });
  } catch (error) {
    console.error("[habat-attendance] access update failed", error);
    return json(500, { ok: false, message: "habat_access_update_failed" });
  }
}

async function deleteAccess(db, requester, id) {
  const current = await db
    .prepare(`SELECT * FROM habat_attendance_access WHERE id = ? LIMIT 1`)
    .bind(id)
    .first();
  if (!current) return json(404, { ok: false, message: "habat_access_not_found" });

  try {
    await db.prepare(`DELETE FROM habat_attendance_access WHERE id = ?`).bind(id).run();
    await writeAudit(db, requester, "delete_access", "habat_attendance_access", id, current, null);
    return json(200, { ok: true, deleted: true, id });
  } catch (error) {
    console.error("[habat-attendance] access delete failed", error);
    return json(500, { ok: false, message: "habat_access_delete_failed" });
  }
}

async function writeAudit(db, requester, action, entityType, entityId, before, after) {
  try {
    await db
      .prepare(
        `INSERT INTO habat_attendance_audit (
           id, actor_uid, actor_email, action, entity_type, entity_id,
           before_json, after_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        `habat_audit_${crypto.randomUUID()}`,
        normalizeText(requester?.uid) || null,
        normalizeText(requester?.email).toLowerCase() || null,
        action,
        entityType,
        entityId || null,
        before == null ? null : JSON.stringify(before),
        after == null ? null : JSON.stringify(after),
        nowIso()
      )
      .run();
  } catch (error) {
    console.warn("[habat-attendance] audit write skipped", error);
  }
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
  };
}

function mapAccessRow(row) {
  if (!row) return null;
  return {
    id: normalizeText(row.id),
    uid: normalizeText(row.uid) || null,
    email: normalizeText(row.email).toLowerCase(),
    displayName: normalizeText(row.display_name) || null,
    accessLevel: normalizeText(row.access_level) || "employee",
    clockEnabled: Number(row.clock_enabled) === 1,
    isActive: Number(row.is_active) === 1,
    createdAt: normalizeText(row.created_at) || null,
    updatedAt: normalizeText(row.updated_at) || null,
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
    notes: normalizeText(row.notes) || null,
    createdAt: normalizeText(row.created_at) || null,
    updatedAt: normalizeText(row.updated_at) || null,
  };
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

async function readJsonBody(request, maxBytes = 16384) {
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
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : normalizeText(fallback) || null;
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

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeText(value).toLowerCase());
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
  const response = json(405, { ok: false, message: "method_not_allowed" });
  response.headers.set("Allow", methods.join(", "));
  return response;
}

function json(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
