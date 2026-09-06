const HABAT_DEFAULT_SHIFT_ID = "habat_shift_default";
const MAX_AUDIT_LIMIT = 300;

export async function handleHabatPortalRequest({
  request,
  url,
  db,
  resolveRequesterContext,
}) {
  if (!db) return json(500, { ok: false, message: "habat_attendance_database_unavailable" });
  if (typeof resolveRequesterContext !== "function") {
    return json(500, { ok: false, message: "habat_attendance_auth_unavailable" });
  }

  const pathname = normalizeText(url?.pathname);
  if (!pathname.startsWith("/attendance/habat/portal/")) {
    return json(404, { ok: false, message: "not_found" });
  }

  const requester = await resolveRequesterContext(request);
  if (!requester?.ok) {
    return requester?.response || json(401, { ok: false, message: "unauthorized" });
  }

  const principal = await resolvePortalPrincipal(db, requester);
  if (!principal.ok) return principal.response;

  const subpath = pathname.slice("/attendance/habat/portal".length) || "/";

  if (subpath === "/me") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return getMyPortal(db, requester, principal);
  }

  if (subpath === "/audit") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    if (!principal.canManage) return forbidden("habat_management_forbidden");
    return listAudit(db, url);
  }

  return json(404, { ok: false, message: "not_found" });
}

async function resolvePortalPrincipal(db, requester) {
  const uid = normalizeText(requester?.uid);
  const email = normalizeText(requester?.email).toLowerCase();
  const runtimeRole = normalizeText(requester?.runtime?.role).toLowerCase();
  const fallbackName = resolveRequesterDisplayName(requester);

  if (uid || email) {
    try {
      const row = await db
        .prepare(
          `SELECT id, uid, email, display_name, access_level, clock_enabled,
                  is_active, created_at, updated_at
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
            console.warn("[habat-portal] access uid backfill skipped", error);
          }
        }

        const accessLevel = normalizeText(row.access_level) === "manager" ? "manager" : "employee";
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
          createdAt: normalizeText(row.created_at) || null,
          updatedAt: normalizeText(row.updated_at) || null,
        };
      }
    } catch (error) {
      console.error("[habat-portal] principal lookup failed", error);
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
      createdAt: null,
      updatedAt: null,
    };
  }

  return { ok: false, response: forbidden("habat_access_forbidden") };
}

async function getMyPortal(db, requester, principal) {
  const today = getRiyadhDateKey();
  const monthStart = `${today.slice(0, 7)}-01`;

  try {
    const [settings, defaultShift, recordsResult, shiftsResult, assignmentsResult] = await Promise.all([
      getSettings(db),
      getDefaultShift(db),
      db
        .prepare(
          `SELECT *
           FROM habat_attendance_records
           WHERE attendance_date BETWEEN ? AND ?
             AND (account_uid = ? OR access_id = ?)
           ORDER BY attendance_date DESC, check_in_at DESC`
        )
        .bind(monthStart, today, normalizeText(requester.uid), principal.accessId || "")
        .all(),
      db
        .prepare(
          `SELECT id, name, start_time, end_time, grace_minutes,
                  early_leave_tolerance_minutes, working_days, is_active
           FROM habat_attendance_shifts
           ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, name COLLATE NOCASE ASC`
        )
        .bind(HABAT_DEFAULT_SHIFT_ID)
        .all(),
      principal.accessId
        ? db
            .prepare(
              `SELECT id, access_id, shift_id, effective_from, effective_to, created_at
               FROM habat_attendance_shift_assignments
               WHERE access_id = ?
                 AND effective_from <= ?
                 AND (effective_to IS NULL OR effective_to >= ?)
               ORDER BY effective_from DESC, created_at DESC`
            )
            .bind(principal.accessId, today, monthStart)
            .all()
        : Promise.resolve({ results: [] }),
    ]);

    const shifts = (shiftsResult?.results || []).map(mapShiftRow);
    const shiftsById = new Map(shifts.map(shift => [shift.id, shift]));
    if (defaultShift && !shiftsById.has(defaultShift.id)) {
      shiftsById.set(defaultShift.id, defaultShift);
    }

    const assignments = (assignmentsResult?.results || []).map(row => ({
      id: normalizeText(row.id),
      shiftId: normalizeText(row.shift_id),
      effectiveFrom: normalizeText(row.effective_from),
      effectiveTo: normalizeText(row.effective_to) || null,
      createdAt: normalizeText(row.created_at) || null,
    }));

    const records = (recordsResult?.results || []).map(mapRecordRow);
    const recordsByDate = new Map(records.map(record => [record.attendanceDate, record]));
    const dates = enumerateDateKeys(monthStart, today);
    const now = new Date();
    const enrollmentDate = principal.createdAt ? formatRiyadhDateKey(new Date(principal.createdAt)) : "";

    const totals = {
      scheduledDays: 0,
      attendedDays: 0,
      absentDays: 0,
      lateDays: 0,
      earlyLeaveDays: 0,
      incompleteDays: 0,
      workedMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
    };

    const calendar = [];
    for (const date of dates) {
      const record = recordsByDate.get(date) || null;
      const beforeEnrollment = Boolean(enrollmentDate && date < enrollmentDate && !record);
      const eligible = principal.canClock && !beforeEnrollment;
      const shift = resolveShiftForDate(date, assignments, shiftsById, defaultShift);
      const workDay = eligible && shift ? isWorkingDay(date, shift) : false;
      const schedule = workDay && shift ? buildScheduleWindow(date, shift) : null;
      const attendanceWindowStarted = date < today || (date === today && schedule && now.getTime() >= schedule.start.getTime());

      let dayStatus = !eligible ? "not_applicable" : workDay ? "not_started" : "off_day";
      if (workDay && attendanceWindowStarted) {
        totals.scheduledDays += 1;
      }

      if (record?.checkInAt) {
        totals.attendedDays += 1;
        totals.workedMinutes += numberOrZero(record.workedMinutes);
        totals.lateMinutes += numberOrZero(record.lateMinutes);
        totals.earlyLeaveMinutes += numberOrZero(record.earlyLeaveMinutes);

        const rawStatus = normalizeText(record.attendanceStatus);
        if (rawStatus.includes("late") || numberOrZero(record.lateMinutes) > numberOrZero(shift?.graceMinutes)) {
          totals.lateDays += 1;
        }
        if (rawStatus.includes("early_leave") || numberOrZero(record.earlyLeaveMinutes) > numberOrZero(shift?.earlyLeaveToleranceMinutes)) {
          totals.earlyLeaveDays += 1;
        }

        const incomplete = !record.checkOutAt && schedule && now.getTime() > schedule.end.getTime();
        if (incomplete) {
          totals.incompleteDays += 1;
          dayStatus = "incomplete";
        } else {
          dayStatus = rawStatus || (record.checkOutAt ? "present" : "present_now");
        }
      } else if (workDay && schedule) {
        const absenceBoundary = schedule.start.getTime() + numberOrZero(shift?.graceMinutes) * 60_000;
        if (date < today || (date === today && now.getTime() > absenceBoundary)) {
          totals.absentDays += 1;
          dayStatus = "absent";
        }
      }

      calendar.push({
        date,
        status: dayStatus,
        shift: eligible ? shift : null,
        record,
      });
    }

    const currentShift = principal.canClock ? resolveShiftForDate(today, assignments, shiftsById, defaultShift) : null;
    const currentAssignment = findAssignmentForDate(today, assignments);
    const attendanceRate = totals.scheduledDays
      ? Math.round((totals.attendedDays / totals.scheduledDays) * 1000) / 10
      : 0;

    return json(200, {
      ok: true,
      date: today,
      month: today.slice(0, 7),
      profile: {
        uid: principal.uid || null,
        accessId: principal.accessId || null,
        displayName: principal.displayName,
        email: principal.email || null,
        accessLevel: principal.accessLevel,
        canManage: principal.canManage,
        canClock: principal.canClock,
        createdAt: principal.createdAt,
      },
      settings: {
        timezone: settings.timezone,
        locationRequired: Boolean(settings.location_required),
        radiusM: Number(settings.radius_m || 0),
      },
      schedule: {
        shift: currentShift,
        assignment: currentAssignment,
      },
      totals: {
        ...totals,
        attendanceRate,
      },
      today: calendar.find(item => item.date === today) || null,
      calendar: calendar.reverse(),
      recentRecords: records.slice(0, 12),
    });
  } catch (error) {
    console.error("[habat-portal] my portal failed", error);
    return json(500, { ok: false, message: "habat_portal_query_failed" });
  }
}

async function listAudit(db, url) {
  const to = normalizeDateKey(url.searchParams.get("to")) || getRiyadhDateKey();
  const from = normalizeDateKey(url.searchParams.get("from")) || shiftDateKey(to, -30);
  const action = normalizeText(url.searchParams.get("action"));
  const actorEmail = normalizeText(url.searchParams.get("email")).toLowerCase();
  const requestedLimit = Number(url.searchParams.get("limit") || 150);
  const limit = Math.max(1, Math.min(MAX_AUDIT_LIMIT, Number.isFinite(requestedLimit) ? requestedLimit : 150));

  const filters = ["date(datetime(created_at, '+3 hours')) BETWEEN date(?) AND date(?)"];
  const bindings = [from, to];
  if (action) {
    filters.push("action = ?");
    bindings.push(action);
  }
  if (actorEmail) {
    filters.push("lower(coalesce(actor_email, '')) LIKE ?");
    bindings.push(`%${actorEmail}%`);
  }

  try {
    const result = await db
      .prepare(
        `SELECT id, actor_uid, actor_email, action, entity_type, entity_id,
                before_json, after_json, created_at
         FROM habat_attendance_audit
         WHERE ${filters.join(" AND ")}
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .bind(...bindings, limit)
      .all();

    const rows = (result?.results || []).map(row => ({
      id: normalizeText(row.id),
      actorUid: normalizeText(row.actor_uid) || null,
      actorEmail: normalizeText(row.actor_email) || null,
      action: normalizeText(row.action),
      entityType: normalizeText(row.entity_type),
      entityId: normalizeText(row.entity_id) || null,
      before: parseJson(row.before_json),
      after: parseJson(row.after_json),
      createdAt: normalizeText(row.created_at),
    }));

    return json(200, { ok: true, from, to, limit, events: rows });
  } catch (error) {
    console.error("[habat-portal] audit query failed", error);
    return json(500, { ok: false, message: "habat_audit_query_failed" });
  }
}

async function getSettings(db) {
  const row = await db
    .prepare(
      `SELECT timezone, location_required, latitude, longitude, radius_m,
              max_accuracy_m, updated_at
       FROM habat_attendance_settings
       WHERE id = 'default'
       LIMIT 1`
    )
    .first();
  return row || {
    timezone: "Asia/Riyadh",
    location_required: 0,
    latitude: null,
    longitude: null,
    radius_m: 100,
    max_accuracy_m: 150,
    updated_at: null,
  };
}

async function getDefaultShift(db) {
  const row = await db
    .prepare(
      `SELECT id, name, start_time, end_time, grace_minutes,
              early_leave_tolerance_minutes, working_days, is_active
       FROM habat_attendance_shifts
       WHERE id = ? AND is_active = 1
       LIMIT 1`
    )
    .bind(HABAT_DEFAULT_SHIFT_ID)
    .first();
  return row ? mapShiftRow(row) : null;
}

function resolveShiftForDate(date, assignments, shiftsById, defaultShift) {
  const assignment = findAssignmentForDate(date, assignments);
  if (assignment) {
    const assignedShift = shiftsById.get(assignment.shiftId);
    if (assignedShift) return assignedShift;
  }
  return defaultShift || null;
}

function findAssignmentForDate(date, assignments) {
  return (
    assignments.find(
      item => item.effectiveFrom <= date && (!item.effectiveTo || item.effectiveTo >= date)
    ) || null
  );
}

function mapShiftRow(row) {
  return {
    id: normalizeText(row.id),
    name: normalizeText(row.name),
    startTime: normalizeText(row.start_time),
    endTime: normalizeText(row.end_time),
    graceMinutes: numberOrZero(row.grace_minutes),
    earlyLeaveToleranceMinutes: numberOrZero(row.early_leave_tolerance_minutes),
    workingDays: normalizeWorkingDays(row.working_days),
    isActive: Number(row.is_active) === 1,
  };
}

function mapRecordRow(row) {
  if (!row) return null;
  return {
    id: normalizeText(row.id),
    attendanceDate: normalizeText(row.attendance_date),
    checkInAt: normalizeText(row.check_in_at) || null,
    checkOutAt: normalizeText(row.check_out_at) || null,
    attendanceStatus: normalizeText(row.attendance_status) || null,
    lateMinutes: numberOrZero(row.late_minutes),
    earlyLeaveMinutes: numberOrZero(row.early_leave_minutes),
    workedMinutes: row.worked_minutes === null || row.worked_minutes === undefined
      ? null
      : numberOrZero(row.worked_minutes),
    scheduledStartAt: normalizeText(row.scheduled_start_at) || null,
    scheduledEndAt: normalizeText(row.scheduled_end_at) || null,
    shiftId: normalizeText(row.shift_id) || null,
    notes: normalizeText(row.notes) || null,
  };
}

function isWorkingDay(dateKey, shift) {
  const day = new Date(`${dateKey}T12:00:00+03:00`).getUTCDay();
  return Array.isArray(shift?.workingDays) && shift.workingDays.includes(day);
}

function buildScheduleWindow(dateKey, shift) {
  const start = new Date(`${dateKey}T${normalizeClock(shift.startTime)}:00+03:00`);
  let end = new Date(`${dateKey}T${normalizeClock(shift.endTime)}:00+03:00`);
  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }
  return { start, end };
}

function normalizeClock(value) {
  const text = normalizeText(value);
  return /^\d{2}:\d{2}$/.test(text) ? text : "00:00";
}

function normalizeWorkingDays(value) {
  return Array.from(
    new Set(
      String(value ?? "")
        .split(",")
        .map(item => Number(item.trim()))
        .filter(item => Number.isInteger(item) && item >= 0 && item <= 6)
    )
  ).sort((a, b) => a - b);
}

function enumerateDateKeys(from, to) {
  const dates = [];
  const start = new Date(`${from}T12:00:00+03:00`);
  const end = new Date(`${to}T12:00:00+03:00`);
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = new Date(cursor.getTime() + 86_400_000)) {
    dates.push(formatRiyadhDateKey(cursor));
  }
  return dates;
}

function getRiyadhDateKey() {
  return formatRiyadhDateKey(new Date());
}

function formatRiyadhDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00+03:00`);
  return formatRiyadhDateKey(new Date(date.getTime() + Number(days || 0) * 86_400_000));
}

function normalizeDateKey(value) {
  const text = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
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

function parseJson(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "undefined" || text === "null") return "";
  return text;
}

function methodNotAllowed(allowed) {
  return new Response(JSON.stringify({ ok: false, message: "method_not_allowed" }), {
    status: 405,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Allow: allowed.join(", "),
    },
  });
}

function forbidden(message) {
  return json(403, { ok: false, message });
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
