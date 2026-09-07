const EXCEPTION_TYPES = new Set(["off", "custom_shift", "alternate_shift", "weekly_rest_work"]);
const MAX_RESOLVE_RANGE_DAYS = 62;

export async function handleWorkforceScheduleControlRequest({
  request,
  url,
  db,
  tenant,
  principal,
  routePrefix = "",
}) {
  const pathname = stripRoutePrefix(url?.pathname || "", routePrefix);
  const collectionMatch = pathname.match(/^\/v1\/employees\/([^/]+)\/schedule-exceptions$/);
  const detailMatch = pathname.match(/^\/v1\/employees\/([^/]+)\/schedule-exceptions\/([^/]+)$/);
  const resolveMatch = pathname.match(/^\/v1\/employees\/([^/]+)\/schedule\/resolve$/);
  const rangeMatch = pathname.match(/^\/v1\/employees\/([^/]+)\/schedule\/resolve-range$/);
  const moveMatch = pathname.match(/^\/v1\/employees\/([^/]+)\/weekly-rest-moves$/);
  if (!collectionMatch && !detailMatch && !resolveMatch && !rangeMatch && !moveMatch) return null;

  const employeeId = decodeURIComponent(
    collectionMatch?.[1] || detailMatch?.[1] || resolveMatch?.[1] || rangeMatch?.[1] || moveMatch?.[1] || ""
  );
  await requireEmployeeAccess(db, tenant.id, employeeId, principal);

  if (resolveMatch) {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    const date = validDate(url.searchParams.get("date") || todayRiyadh(), "date");
    return json(200, { ok: true, schedule: await resolveWorkforceScheduleDay(db, tenant.id, employeeId, date) });
  }

  if (rangeMatch) {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    const from = validDate(url.searchParams.get("from") || todayRiyadh(), "from");
    const to = validDate(url.searchParams.get("to") || from, "to");
    const schedules = await resolveWorkforceScheduleRange(db, tenant.id, employeeId, from, to);
    return json(200, { ok: true, from, to, schedules });
  }

  if (collectionMatch) {
    if (request.method === "GET") {
      return json(200, { ok: true, exceptions: await listScheduleExceptions(db, tenant.id, employeeId, url) });
    }
    if (request.method === "POST") {
      requireManager(principal);
      const body = await readJson(request);
      const result = await saveScheduleException(db, tenant.id, employeeId, body, principal);
      return json(result.idempotent ? 200 : 201, { ok: true, ...result });
    }
    return methodNotAllowed(["GET", "POST"]);
  }

  if (detailMatch) {
    requireManager(principal);
    const exceptionId = decodeURIComponent(detailMatch[2]);
    if (request.method === "PATCH") {
      const body = await readJson(request);
      const exception = await updateScheduleException(db, tenant.id, employeeId, exceptionId, body, principal);
      return json(200, { ok: true, exception });
    }
    if (request.method === "DELETE") {
      const exception = await cancelScheduleException(db, tenant.id, employeeId, exceptionId, principal);
      return json(200, { ok: true, exception });
    }
    return methodNotAllowed(["PATCH", "DELETE"]);
  }

  if (moveMatch) {
    requireManager(principal);
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const body = await readJson(request);
    const result = await moveWeeklyRest(db, tenant.id, employeeId, body, principal);
    return json(result.idempotent ? 200 : 201, { ok: true, ...result });
  }

  return null;
}

export async function resolveWorkforceScheduleDay(db, tenantId, employeeId, dateValue) {
  const date = validDate(dateValue, "date");
  const exception = await db
    .prepare(`SELECT * FROM workforce_schedule_exceptions
               WHERE tenant_id = ? AND employee_id = ? AND work_date = ?
                 AND COALESCE(status, 'active') = 'active'
               LIMIT 1`)
    .bind(tenantId, employeeId, date)
    .first();

  const assignment = await db
    .prepare(`SELECT a.*, t.name AS template_name, t.start_time, t.end_time,
                    t.grace_minutes, t.early_leave_tolerance_minutes,
                    t.working_days_json, t.is_active
               FROM workforce_schedule_assignments a
               JOIN workforce_schedule_templates t
                 ON t.id = a.template_id AND t.tenant_id = a.tenant_id
              WHERE a.tenant_id = ? AND a.employee_id = ?
                AND a.effective_from <= ?
                AND (a.effective_to IS NULL OR a.effective_to >= ?)
              ORDER BY a.effective_from DESC, a.created_at DESC, a.id DESC
              LIMIT 1`)
    .bind(tenantId, employeeId, date, date)
    .first();

  let exceptionTemplate = null;
  if (clean(exception?.template_id)) {
    exceptionTemplate = await db
      .prepare(`SELECT * FROM workforce_schedule_templates
                 WHERE tenant_id = ? AND id = ? LIMIT 1`)
      .bind(tenantId, exception.template_id)
      .first();
  }

  return classifyWorkforceScheduleDay({ date, assignment, exception, exceptionTemplate });
}

export async function resolveWorkforceScheduleRange(db, tenantId, employeeId, fromValue, toValue) {
  const from = validDate(fromValue, "from");
  const to = validDate(toValue, "to");
  if (to < from) throw httpError(400, "workforce_schedule_range_invalid");
  const count = daysBetweenInclusive(from, to);
  if (count > MAX_RESOLVE_RANGE_DAYS) throw httpError(400, "workforce_schedule_range_too_large");
  const rows = [];
  let cursor = from;
  while (cursor <= to) {
    rows.push(await resolveWorkforceScheduleDay(db, tenantId, employeeId, cursor));
    cursor = addDays(cursor, 1);
  }
  return rows;
}

export function classifyWorkforceScheduleDay({ date, assignment, exception, exceptionTemplate }) {
  const weekday = weekdayNumber(date);
  const base = mapAssignmentTemplate(assignment);
  const exceptionType = clean(exception?.exception_type);

  if (exceptionType === "off") {
    return {
      date,
      kind: "exception_off",
      source: "schedule_exception",
      ready: true,
      isWorkingDay: false,
      isWeeklyRest: false,
      assignmentId: nullable(assignment?.id),
      exceptionId: nullable(exception?.id),
      templateId: null,
      templateName: null,
      startTime: null,
      endTime: null,
      graceMinutes: 0,
      earlyLeaveToleranceMinutes: 0,
    };
  }

  if (exceptionType === "custom_shift") {
    const startTime = clean(exception?.custom_start_time);
    const endTime = clean(exception?.custom_end_time);
    return {
      date,
      kind: "custom_shift",
      source: "schedule_exception",
      ready: isTime(startTime) && isTime(endTime),
      isWorkingDay: true,
      isWeeklyRest: false,
      assignmentId: nullable(assignment?.id),
      exceptionId: nullable(exception?.id),
      templateId: null,
      templateName: "دوام مخصص",
      startTime: startTime || null,
      endTime: endTime || null,
      graceMinutes: Number(base?.graceMinutes || 0),
      earlyLeaveToleranceMinutes: Number(base?.earlyLeaveToleranceMinutes || 0),
    };
  }

  if (exceptionType === "alternate_shift") {
    const alt = mapTemplate(exceptionTemplate);
    return {
      date,
      kind: "alternate_shift",
      source: "schedule_exception",
      ready: Boolean(alt?.templateId && alt.startTime && alt.endTime),
      isWorkingDay: true,
      isWeeklyRest: false,
      assignmentId: nullable(assignment?.id),
      exceptionId: nullable(exception?.id),
      ...(alt || emptyShift()),
    };
  }

  if (exceptionType === "weekly_rest_work") {
    const override = mapTemplate(exceptionTemplate) || base;
    return {
      date,
      kind: "weekly_rest_work",
      source: "schedule_exception",
      ready: Boolean(override?.startTime && override?.endTime),
      isWorkingDay: true,
      isWeeklyRest: false,
      assignmentId: nullable(assignment?.id),
      exceptionId: nullable(exception?.id),
      ...(override || emptyShift()),
    };
  }

  if (!assignment) {
    return {
      date,
      kind: "unassigned",
      source: "none",
      ready: false,
      isWorkingDay: false,
      isWeeklyRest: false,
      assignmentId: null,
      exceptionId: null,
      ...emptyShift(),
    };
  }

  const workingDays = parseWorkingDays(assignment.working_days_json);
  const isWorkingDay = workingDays.includes(weekday);
  return {
    date,
    kind: isWorkingDay ? "assignment" : "weekly_rest",
    source: "schedule_assignment",
    ready: true,
    isWorkingDay,
    isWeeklyRest: !isWorkingDay,
    assignmentId: nullable(assignment.id),
    exceptionId: null,
    ...(base || emptyShift()),
  };
}

async function listScheduleExceptions(db, tenantId, employeeId, url) {
  const from = clean(url.searchParams.get("from"));
  const to = clean(url.searchParams.get("to"));
  if (from && !isDateKey(from)) throw httpError(400, "workforce_schedule_exception_from_invalid");
  if (to && !isDateKey(to)) throw httpError(400, "workforce_schedule_exception_to_invalid");
  if (from && to && to < from) throw httpError(400, "workforce_schedule_exception_range_invalid");
  const result = await db
    .prepare(`SELECT e.*, t.name AS template_name, t.start_time AS template_start_time, t.end_time AS template_end_time
                FROM workforce_schedule_exceptions e
                LEFT JOIN workforce_schedule_templates t
                  ON t.tenant_id = e.tenant_id AND t.id = e.template_id
               WHERE e.tenant_id = ? AND e.employee_id = ?
                 AND COALESCE(e.status, 'active') = 'active'
                 AND (? = '' OR e.work_date >= ?)
                 AND (? = '' OR e.work_date <= ?)
               ORDER BY e.work_date DESC, e.created_at DESC`)
    .bind(tenantId, employeeId, from, from, to, to)
    .all();
  return result?.results || [];
}

async function saveScheduleException(db, tenantId, employeeId, body, principal) {
  const normalized = await validateExceptionInput(db, tenantId, body);
  const operationId = clean(body.operationId || body.operation_id) || id("wf_schedule_exception_op");
  const priorOperation = await db
    .prepare(`SELECT * FROM workforce_schedule_exceptions WHERE tenant_id = ? AND operation_id = ? LIMIT 1`)
    .bind(tenantId, operationId)
    .first();
  if (priorOperation) {
    if (clean(priorOperation.employee_id) !== employeeId) throw httpError(409, "workforce_schedule_operation_employee_mismatch");
    return { idempotent: true, exception: priorOperation };
  }

  const before = await db
    .prepare(`SELECT * FROM workforce_schedule_exceptions WHERE tenant_id = ? AND employee_id = ? AND work_date = ? LIMIT 1`)
    .bind(tenantId, employeeId, normalized.workDate)
    .first();
  if (before && clean(before.status || "active") === "active") {
    throw httpError(409, "workforce_schedule_exception_conflict");
  }

  const exceptionId = before?.id || id("wf_schedule_exception");
  const now = nowIso();
  await db
    .prepare(`INSERT INTO workforce_schedule_exceptions (
      id, tenant_id, employee_id, work_date, exception_type, template_id,
      custom_start_time, custom_end_time, reason, created_by_uid, created_by_email,
      created_at, updated_at, status, source_type, source_id, operation_id, metadata_json,
      cancelled_at, cancelled_by_uid, cancelled_by_email
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, NULL, NULL, NULL)
    ON CONFLICT(tenant_id, employee_id, work_date) DO UPDATE SET
      exception_type = excluded.exception_type,
      template_id = excluded.template_id,
      custom_start_time = excluded.custom_start_time,
      custom_end_time = excluded.custom_end_time,
      reason = excluded.reason,
      updated_at = excluded.updated_at,
      status = 'active',
      source_type = excluded.source_type,
      source_id = excluded.source_id,
      operation_id = excluded.operation_id,
      metadata_json = excluded.metadata_json,
      cancelled_at = NULL,
      cancelled_by_uid = NULL,
      cancelled_by_email = NULL`)
    .bind(
      exceptionId, tenantId, employeeId, normalized.workDate, normalized.exceptionType,
      normalized.templateId, normalized.customStartTime, normalized.customEndTime,
      normalized.reason, principal?.uid || null, principal?.email || null, before?.created_at || now, now,
      nullable(body.sourceType), nullable(body.sourceId), operationId,
      body.metadata == null ? null : JSON.stringify(body.metadata)
    )
    .run();
  const row = await db.prepare(`SELECT * FROM workforce_schedule_exceptions WHERE tenant_id = ? AND id = ?`).bind(tenantId, exceptionId).first();
  await audit(db, tenantId, principal, "workforce.schedule_exception.save", "schedule_exception", exceptionId, before, row);
  return { idempotent: false, exception: row };
}

async function updateScheduleException(db, tenantId, employeeId, exceptionId, body, principal) {
  const before = await requireException(db, tenantId, employeeId, exceptionId);
  if (clean(before.status || "active") !== "active") throw httpError(409, "workforce_schedule_exception_cancelled");
  const merged = {
    workDate: before.work_date,
    exceptionType: body.exceptionType ?? before.exception_type,
    templateId: body.templateId ?? before.template_id,
    customStartTime: body.customStartTime ?? before.custom_start_time,
    customEndTime: body.customEndTime ?? before.custom_end_time,
    reason: body.reason ?? before.reason,
  };
  const normalized = await validateExceptionInput(db, tenantId, merged);
  await db.prepare(`UPDATE workforce_schedule_exceptions
                       SET exception_type = ?, template_id = ?, custom_start_time = ?, custom_end_time = ?, reason = ?, updated_at = ?
                     WHERE tenant_id = ? AND employee_id = ? AND id = ?`)
    .bind(normalized.exceptionType, normalized.templateId, normalized.customStartTime, normalized.customEndTime,
      normalized.reason, nowIso(), tenantId, employeeId, exceptionId)
    .run();
  const row = await requireException(db, tenantId, employeeId, exceptionId);
  await audit(db, tenantId, principal, "workforce.schedule_exception.update", "schedule_exception", exceptionId, before, row);
  return row;
}

async function cancelScheduleException(db, tenantId, employeeId, exceptionId, principal) {
  const before = await requireException(db, tenantId, employeeId, exceptionId);
  if (clean(before.status || "active") === "cancelled") return before;
  const now = nowIso();
  await db.prepare(`UPDATE workforce_schedule_exceptions
                       SET status = 'cancelled', cancelled_at = ?, cancelled_by_uid = ?, cancelled_by_email = ?, updated_at = ?
                     WHERE tenant_id = ? AND employee_id = ? AND id = ?`)
    .bind(now, principal?.uid || null, principal?.email || null, now, tenantId, employeeId, exceptionId)
    .run();
  const row = await requireException(db, tenantId, employeeId, exceptionId);
  await audit(db, tenantId, principal, "workforce.schedule_exception.cancel", "schedule_exception", exceptionId, before, row);
  return row;
}

async function moveWeeklyRest(db, tenantId, employeeId, body, principal) {
  const restDate = validDate(body.restDate || body.rest_date, "rest_date");
  const substituteDate = validDate(body.substituteDate || body.substitute_date, "substitute_date");
  if (restDate === substituteDate) throw httpError(400, "workforce_weekly_rest_move_same_date");
  const operationId = clean(body.operationId || body.operation_id) || id("wf_weekly_rest_move_op");
  const moveId = clean(body.moveId || body.move_id) || id("wf_weekly_rest_move");
  const reason = clean(body.reason) || "weekly_rest_move";

  const prior = await db.prepare(`SELECT * FROM workforce_schedule_exceptions
                                   WHERE tenant_id = ? AND operation_id = ? LIMIT 1`)
    .bind(tenantId, operationId).first();
  if (prior) {
    if (clean(prior.employee_id) !== employeeId) throw httpError(409, "workforce_schedule_operation_employee_mismatch");
    const rows = await rowsBySource(db, tenantId, employeeId, "weekly_rest_move", clean(prior.source_id));
    return { idempotent: true, moveId: clean(prior.source_id), exceptions: rows };
  }

  const [restResolution, substituteResolution] = await Promise.all([
    resolveWorkforceScheduleDay(db, tenantId, employeeId, restDate),
    resolveWorkforceScheduleDay(db, tenantId, employeeId, substituteDate),
  ]);
  if (restResolution.kind !== "weekly_rest") throw httpError(409, "workforce_weekly_rest_source_not_rest_day");
  if (!substituteResolution.isWorkingDay || !substituteResolution.ready) {
    throw httpError(409, "workforce_weekly_rest_substitute_not_working_day");
  }

  const occupied = await db.prepare(`SELECT work_date, status FROM workforce_schedule_exceptions
                                      WHERE tenant_id = ? AND employee_id = ? AND work_date IN (?, ?)
                                        AND COALESCE(status, 'active') = 'active'`)
    .bind(tenantId, employeeId, restDate, substituteDate).all();
  if ((occupied?.results || []).length) throw httpError(409, "workforce_weekly_rest_move_conflict");

  const now = nowIso();
  const workId = id("wf_weekly_rest_work");
  const offId = id("wf_weekly_rest_substitute");
  const metadata = JSON.stringify({ moveId, restDate, substituteDate });
  const workStmt = db.prepare(`INSERT INTO workforce_schedule_exceptions (
    id, tenant_id, employee_id, work_date, exception_type, template_id,
    custom_start_time, custom_end_time, reason, created_by_uid, created_by_email,
    created_at, updated_at, status, source_type, source_id, operation_id, metadata_json,
    cancelled_at, cancelled_by_uid, cancelled_by_email
  ) VALUES (?, ?, ?, ?, 'weekly_rest_work', ?, NULL, NULL, ?, ?, ?, ?, ?, 'active', 'weekly_rest_move', ?, ?, ?, NULL, NULL, NULL)`)
    .bind(workId, tenantId, employeeId, restDate, restResolution.templateId,
      reason, principal?.uid || null, principal?.email || null, now, now, moveId, operationId, metadata);
  const offStmt = db.prepare(`INSERT INTO workforce_schedule_exceptions (
    id, tenant_id, employee_id, work_date, exception_type, template_id,
    custom_start_time, custom_end_time, reason, created_by_uid, created_by_email,
    created_at, updated_at, status, source_type, source_id, operation_id, metadata_json,
    cancelled_at, cancelled_by_uid, cancelled_by_email
  ) VALUES (?, ?, ?, ?, 'off', NULL, NULL, NULL, ?, ?, ?, ?, ?, 'active', 'weekly_rest_move', ?, NULL, ?, NULL, NULL, NULL)`)
    .bind(offId, tenantId, employeeId, substituteDate, reason,
      principal?.uid || null, principal?.email || null, now, now, moveId, metadata);
  await db.batch([workStmt, offStmt]);
  const rows = await rowsBySource(db, tenantId, employeeId, "weekly_rest_move", moveId);
  await audit(db, tenantId, principal, "workforce.weekly_rest.move", "weekly_rest_move", moveId, null, rows, { restDate, substituteDate });
  return { idempotent: false, moveId, exceptions: rows };
}

async function validateExceptionInput(db, tenantId, body) {
  const workDate = validDate(body.workDate || body.work_date, "work_date");
  const exceptionType = clean(body.exceptionType || body.exception_type);
  if (!EXCEPTION_TYPES.has(exceptionType)) throw httpError(400, "workforce_schedule_exception_type_invalid");
  let templateId = nullable(body.templateId || body.template_id);
  let customStartTime = nullable(body.customStartTime || body.custom_start_time);
  let customEndTime = nullable(body.customEndTime || body.custom_end_time);
  if (exceptionType === "custom_shift") {
    if (!isTime(customStartTime) || !isTime(customEndTime)) throw httpError(400, "workforce_schedule_custom_shift_time_required");
    templateId = null;
  } else if (exceptionType === "alternate_shift") {
    if (!templateId) throw httpError(400, "workforce_schedule_alternate_template_required");
    const template = await db.prepare(`SELECT id FROM workforce_schedule_templates WHERE tenant_id = ? AND id = ? AND is_active = 1 LIMIT 1`)
      .bind(tenantId, templateId).first();
    if (!template) throw httpError(404, "workforce_schedule_template_not_found");
    customStartTime = null;
    customEndTime = null;
  } else {
    if (templateId) {
      const template = await db.prepare(`SELECT id FROM workforce_schedule_templates WHERE tenant_id = ? AND id = ? AND is_active = 1 LIMIT 1`)
        .bind(tenantId, templateId).first();
      if (!template) throw httpError(404, "workforce_schedule_template_not_found");
    }
    customStartTime = null;
    customEndTime = null;
  }
  return { workDate, exceptionType, templateId, customStartTime, customEndTime, reason: nullable(body.reason) };
}

async function requireException(db, tenantId, employeeId, exceptionId) {
  const row = await db.prepare(`SELECT * FROM workforce_schedule_exceptions
                                 WHERE tenant_id = ? AND employee_id = ? AND id = ? LIMIT 1`)
    .bind(tenantId, employeeId, exceptionId).first();
  if (!row) throw httpError(404, "workforce_schedule_exception_not_found");
  return row;
}

async function rowsBySource(db, tenantId, employeeId, sourceType, sourceId) {
  const result = await db.prepare(`SELECT * FROM workforce_schedule_exceptions
                                    WHERE tenant_id = ? AND employee_id = ? AND source_type = ? AND source_id = ?
                                    ORDER BY work_date ASC`)
    .bind(tenantId, employeeId, sourceType, sourceId).all();
  return result?.results || [];
}

async function requireEmployeeAccess(db, tenantId, employeeId, principal) {
  const employee = await db.prepare(`SELECT id, account_uid, account_email FROM workforce_employee_profiles
                                      WHERE tenant_id = ? AND id = ? LIMIT 1`)
    .bind(tenantId, employeeId).first();
  if (!employee) throw httpError(404, "workforce_employee_not_found");
  if (principal?.canManage) return employee;
  const sameUid = clean(principal?.uid) && clean(employee.account_uid) === clean(principal.uid);
  const sameEmail = clean(principal?.email).toLowerCase() && clean(employee.account_email).toLowerCase() === clean(principal.email).toLowerCase();
  if (!sameUid && !sameEmail) throw httpError(403, "workforce_employee_access_forbidden");
  return employee;
}

function requireManager(principal) {
  if (!principal?.canManage) throw httpError(403, "workforce_management_forbidden");
}

async function audit(db, tenantId, principal, action, entityType, entityId, before, after, metadata) {
  await db.prepare(`INSERT INTO workforce_audit_events (
    id, tenant_id, actor_uid, actor_email, action, entity_type, entity_id,
    before_json, after_json, metadata_json, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id("wf_audit"), tenantId, principal?.uid || null, principal?.email || null,
      action, entityType, entityId || null,
      before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after),
      metadata == null ? null : JSON.stringify(metadata), nowIso())
    .run();
}

function mapAssignmentTemplate(row) {
  if (!row) return null;
  return {
    templateId: nullable(row.template_id),
    templateName: nullable(row.template_name),
    startTime: nullable(row.start_time),
    endTime: nullable(row.end_time),
    graceMinutes: Number(row.grace_minutes || 0),
    earlyLeaveToleranceMinutes: Number(row.early_leave_tolerance_minutes || 0),
  };
}

function mapTemplate(row) {
  if (!row) return null;
  return {
    templateId: nullable(row.id),
    templateName: nullable(row.name),
    startTime: nullable(row.start_time),
    endTime: nullable(row.end_time),
    graceMinutes: Number(row.grace_minutes || 0),
    earlyLeaveToleranceMinutes: Number(row.early_leave_tolerance_minutes || 0),
  };
}

function emptyShift() {
  return { templateId: null, templateName: null, startTime: null, endTime: null, graceMinutes: 0, earlyLeaveToleranceMinutes: 0 };
}

function parseWorkingDays(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))).sort();
  } catch {
    return [];
  }
}

function weekdayNumber(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

function daysBetweenInclusive(from, to) {
  const start = Date.parse(`${from}T12:00:00.000Z`);
  const end = Date.parse(`${to}T12:00:00.000Z`);
  return Math.floor((end - start) / 86400000) + 1;
}

function addDays(value, amount) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount, 12)).toISOString().slice(0, 10);
}

function validDate(value, field) {
  const text = clean(value);
  if (!isDateKey(text)) throw httpError(400, `workforce_schedule_${field}_invalid`);
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw httpError(400, `workforce_schedule_${field}_invalid`);
  }
  return text;
}

function todayRiyadh() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
}

function isTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(clean(value));
}

function stripRoutePrefix(pathname, prefix) {
  const cleanPrefix = clean(prefix).replace(/\/$/, "");
  if (!cleanPrefix) return pathname;
  return pathname.startsWith(cleanPrefix) ? pathname.slice(cleanPrefix.length) || "/" : pathname;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw httpError(400, "workforce_invalid_json");
  }
}

function methodNotAllowed(methods) {
  return json(405, { ok: false, message: "workforce_method_not_allowed", allowedMethods: methods });
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.code = message;
  return error;
}

function clean(value) {
  return String(value ?? "").trim();
}

function nullable(value) {
  const text = clean(value);
  return text || null;
}

function nowIso() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}
