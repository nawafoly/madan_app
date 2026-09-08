import { getAnnualLeaveState } from "./workforce-annual-leave.js";
import { resolveWorkforceScheduleRange } from "./workforce-schedule-control.js";

const LEAVE_TYPES = new Set([
  "annual",
  "sick",
  "emergency",
  "unpaid",
  "rest",
  "weekly_rest_substitute",
  "other",
]);
const LEAVE_DURATION_KINDS = new Set(["full_day", "half_day", "partial"]);
const EPSILON = 0.0001;

export async function handleWorkforceLeaveControlRequest({
  request,
  url,
  db,
  tenant,
  principal,
  routePrefix = "",
}) {
  const pathname = stripRoutePrefix(url?.pathname || "", routePrefix);
  const collectionMatch = pathname.match(/^\/v1\/employees\/([^/]+)\/leaves$/);
  const detailMatch = pathname.match(/^\/v1\/employees\/([^/]+)\/leaves\/([^/]+)$/);
  if (!collectionMatch && !detailMatch) return null;

  const employeeId = decodeURIComponent(collectionMatch?.[1] || detailMatch?.[1] || "");
  await requireEmployeeAccess(db, tenant.id, employeeId, principal);

  if (collectionMatch) {
    if (request.method === "GET") {
      return json(200, { ok: true, leaves: await listEmployeeLeaves(db, tenant.id, employeeId) });
    }
    if (request.method === "POST") {
      requireManager(principal);
      const body = await readJson(request);
      const result = await createEmployeeLeave(db, tenant.id, employeeId, body, principal);
      return json(201, { ok: true, ...result });
    }
    return methodNotAllowed(["GET", "POST"]);
  }

  requireManager(principal);
  const leaveId = decodeURIComponent(detailMatch[2]);
  if (request.method === "DELETE") {
    const result = await cancelEmployeeLeave(db, tenant.id, employeeId, leaveId, principal);
    return json(200, { ok: true, ...result });
  }
  return methodNotAllowed(["DELETE"]);
}

async function listEmployeeLeaves(db, tenantId, employeeId) {
  const result = await db
    .prepare(`SELECT l.*,
                     u.delta_days AS annual_used_days,
                     r.delta_days AS annual_reversal_days
                FROM workforce_leaves l
                LEFT JOIN workforce_leave_ledger u
                  ON u.tenant_id = l.tenant_id
                 AND u.employee_id = l.employee_id
                 AND u.source_type = 'workforce_leave'
                 AND u.source_id = l.id
                 AND u.entry_code = 'LEAVE_USED'
                 AND u.deleted_at IS NULL
                LEFT JOIN workforce_leave_ledger r
                  ON r.tenant_id = l.tenant_id
                 AND r.employee_id = l.employee_id
                 AND r.source_type = 'workforce_leave'
                 AND r.source_id = l.id
                 AND r.entry_code = 'LEAVE_REVERSAL'
                 AND r.deleted_at IS NULL
               WHERE l.tenant_id = ? AND l.employee_id = ?
               ORDER BY l.start_date DESC, l.created_at DESC`)
    .bind(tenantId, employeeId)
    .all();
  return result?.results || [];
}

async function createEmployeeLeave(db, tenantId, employeeId, body, principal) {
  const normalized = normalizeLeaveInput(body);
  const leaveId = id("wf_leave");
  const now = nowIso();
  let annualUsage = null;

  if (normalized.leaveType === "annual") {
    annualUsage = await prepareAnnualUsage({
      db,
      tenantId,
      employeeId,
      leaveId,
      leave: normalized,
      principal,
    });
  }

  const leaveStatement = db
    .prepare(`INSERT INTO workforce_leaves (
      id, tenant_id, employee_id, leave_type, duration_kind, start_date, end_date,
      partial_start_time, partial_end_time, requested_minutes, status, reason, note,
      requested_by_uid, approved_by_uid, approved_by_email, approved_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      leaveId,
      tenantId,
      employeeId,
      normalized.leaveType,
      normalized.durationKind,
      normalized.startDate,
      normalized.endDate,
      normalized.partialStartTime,
      normalized.partialEndTime,
      normalized.requestedMinutes,
      normalized.reason,
      normalized.note,
      principal?.uid || null,
      principal?.uid || null,
      principal?.email || null,
      now,
      now,
      now
    );

  const statements = [leaveStatement];
  if (annualUsage) statements.push(buildAnnualUsageStatement(db, annualUsage));
  statements.push(buildAuditStatement(db, {
    tenantId,
    principal,
    action: "workforce.leave.create",
    entityType: "leave",
    entityId: leaveId,
    after: {
      id: leaveId,
      employee_id: employeeId,
      leave_type: normalized.leaveType,
      duration_kind: normalized.durationKind,
      start_date: normalized.startDate,
      end_date: normalized.endDate,
      status: "approved",
      annual_charge_days: annualUsage?.chargeDays ?? null,
    },
  }));

  await runBatch(db, statements);
  const leave = await requireLeave(db, tenantId, employeeId, leaveId);
  const annualLeave = annualUsage
    ? await getAnnualLeaveState(db, tenantId, employeeId, todayRiyadh())
    : null;

  return {
    leave,
    annualLeave,
    annualUsage: annualUsage ? {
      chargeDays: annualUsage.chargeDays,
      chargeableDates: annualUsage.chargeableDates,
      excludedDates: annualUsage.excludedDates,
      scheduleKinds: annualUsage.scheduleKinds,
    } : null,
  };
}

async function cancelEmployeeLeave(db, tenantId, employeeId, leaveId, principal) {
  const leave = await requireLeave(db, tenantId, employeeId, leaveId);
  if (clean(leave.status) === "cancelled") {
    return {
      idempotent: true,
      leave,
      annualLeave: clean(leave.leave_type) === "annual"
        ? await getAnnualLeaveState(db, tenantId, employeeId, todayRiyadh())
        : null,
    };
  }
  if (clean(leave.status) !== "approved") throw httpError(409, "workforce_leave_not_cancellable");

  const now = nowIso();
  const statements = [
    db.prepare(`UPDATE workforce_leaves
                   SET status = 'cancelled', updated_at = ?
                 WHERE tenant_id = ? AND employee_id = ? AND id = ?`)
      .bind(now, tenantId, employeeId, leaveId),
  ];

  let reversal = null;
  if (clean(leave.leave_type) === "annual") {
    reversal = await prepareAnnualReversal({ db, tenantId, employeeId, leave, principal });
    if (reversal) statements.push(buildAnnualReversalStatement(db, reversal));
  }

  statements.push(buildAuditStatement(db, {
    tenantId,
    principal,
    action: "workforce.leave.cancel",
    entityType: "leave",
    entityId: leaveId,
    before: leave,
    after: { ...leave, status: "cancelled", updated_at: now },
    metadata: reversal ? { reversalDays: reversal.deltaDays } : null,
  }));

  await runBatch(db, statements);
  const next = await requireLeave(db, tenantId, employeeId, leaveId);
  const annualLeave = clean(leave.leave_type) === "annual"
    ? await getAnnualLeaveState(db, tenantId, employeeId, todayRiyadh())
    : null;

  return {
    idempotent: false,
    leave: next,
    annualLeave,
    reversal: reversal ? { days: reversal.deltaDays } : null,
  };
}

async function prepareAnnualUsage({ db, tenantId, employeeId, leaveId, leave, principal }) {
  const schedules = await resolveWorkforceScheduleRange(
    db,
    tenantId,
    employeeId,
    leave.startDate,
    leave.endDate
  );

  const notReady = schedules.filter(item => !item?.ready);
  if (notReady.length) throw httpError(409, "workforce_annual_leave_schedule_not_ready");

  const working = schedules.filter(item => item?.isWorkingDay === true);
  const excluded = schedules.filter(item => item?.isWorkingDay !== true);
  let chargeDays = 0;

  if (leave.durationKind === "full_day") {
    chargeDays = working.length;
  } else if (leave.durationKind === "half_day") {
    if (leave.startDate !== leave.endDate) throw httpError(400, "workforce_annual_leave_half_day_must_be_single_date");
    if (working.length !== 1) throw httpError(400, "workforce_annual_leave_no_chargeable_workday");
    chargeDays = 0.5;
  } else {
    if (leave.startDate !== leave.endDate) throw httpError(400, "workforce_annual_leave_partial_must_be_single_date");
    if (working.length !== 1) throw httpError(400, "workforce_annual_leave_no_chargeable_workday");
    const scheduledMinutes = shiftMinutes(working[0].startTime, working[0].endTime);
    const requestedMinutes = Number(leave.requestedMinutes || 0);
    if (!scheduledMinutes || !requestedMinutes || requestedMinutes > scheduledMinutes) {
      throw httpError(400, "workforce_annual_leave_partial_minutes_invalid");
    }
    chargeDays = roundDays(requestedMinutes / scheduledMinutes);
  }

  if (!(chargeDays > EPSILON)) throw httpError(400, "workforce_annual_leave_no_chargeable_workday");

  const state = await getAnnualLeaveState(db, tenantId, employeeId, todayRiyadh());
  if (state.reviewRequired) throw httpError(409, `workforce_annual_leave_${state.reviewReason}`);
  const before = Number(state.availableDays || 0);
  if (before + EPSILON < chargeDays) throw httpError(409, "workforce_annual_leave_insufficient_balance");
  const after = roundDays(before - chargeDays);

  return {
    id: id("wf_annual_leave_used"),
    tenantId,
    employeeId,
    leaveId,
    effectiveDate: todayRiyadh(),
    deltaDays: -chargeDays,
    balanceBeforeDays: before,
    balanceAfterDays: after,
    operationId: `annual_leave_use:${leaveId}`,
    reason: clean(leave.reason) || "approved annual leave",
    principal,
    chargeDays,
    chargeableDates: working.map(item => item.date),
    excludedDates: excluded.map(item => item.date),
    scheduleKinds: schedules.map(item => ({ date: item.date, kind: item.kind, source: item.source })),
    createdAt: nowIso(),
  };
}

async function prepareAnnualReversal({ db, tenantId, employeeId, leave, principal }) {
  const priorReversal = await db
    .prepare(`SELECT * FROM workforce_leave_ledger
               WHERE tenant_id = ? AND employee_id = ?
                 AND source_type = 'workforce_leave' AND source_id = ?
                 AND entry_code = 'LEAVE_REVERSAL' AND deleted_at IS NULL
               LIMIT 1`)
    .bind(tenantId, employeeId, leave.id)
    .first();
  if (priorReversal) return null;

  const usage = await db
    .prepare(`SELECT * FROM workforce_leave_ledger
               WHERE tenant_id = ? AND employee_id = ?
                 AND source_type = 'workforce_leave' AND source_id = ?
                 AND entry_code = 'LEAVE_USED' AND deleted_at IS NULL
               LIMIT 1`)
    .bind(tenantId, employeeId, leave.id)
    .first();
  if (!usage) return null;

  const deltaDays = Math.abs(Number(usage.delta_days || 0));
  if (!(deltaDays > EPSILON)) return null;
  const state = await getAnnualLeaveState(db, tenantId, employeeId, todayRiyadh());
  if (state.reviewRequired) throw httpError(409, `workforce_annual_leave_${state.reviewReason}`);
  const before = Number(state.availableDays || 0);
  const after = roundDays(before + deltaDays);

  return {
    id: id("wf_annual_leave_reversal"),
    tenantId,
    employeeId,
    leaveId: leave.id,
    effectiveDate: todayRiyadh(),
    deltaDays,
    balanceBeforeDays: before,
    balanceAfterDays: after,
    operationId: `annual_leave_reversal:${leave.id}`,
    reason: `cancelled annual leave ${leave.id}`,
    principal,
    createdAt: nowIso(),
    sourceUsageId: usage.id,
  };
}

function buildAnnualUsageStatement(db, usage) {
  return db.prepare(`INSERT INTO workforce_leave_ledger (
    id, tenant_id, employee_id, leave_type, action_type,
    delta_minutes, balance_before_minutes, balance_after_minutes,
    effective_date, reason, source_type, source_id, operation_id,
    created_by_uid, created_by_email, created_at,
    delta_days, balance_before_days, balance_after_days,
    entry_code, metadata_json, deleted_at
  ) VALUES (?, ?, ?, 'annual', 'debit', ?, ?, ?, ?, ?, 'workforce_leave', ?, ?, ?, ?, ?, ?, ?, ?, 'LEAVE_USED', ?, NULL)`)
    .bind(
      usage.id,
      usage.tenantId,
      usage.employeeId,
      dayUnits(usage.deltaDays),
      dayUnits(usage.balanceBeforeDays),
      dayUnits(usage.balanceAfterDays),
      usage.effectiveDate,
      usage.reason,
      usage.leaveId,
      usage.operationId,
      usage.principal?.uid || null,
      usage.principal?.email || null,
      usage.createdAt,
      usage.deltaDays,
      usage.balanceBeforeDays,
      usage.balanceAfterDays,
      JSON.stringify({
        chargeDays: usage.chargeDays,
        chargeableDates: usage.chargeableDates,
        excludedDates: usage.excludedDates,
        scheduleKinds: usage.scheduleKinds,
      })
    );
}

function buildAnnualReversalStatement(db, reversal) {
  return db.prepare(`INSERT INTO workforce_leave_ledger (
    id, tenant_id, employee_id, leave_type, action_type,
    delta_minutes, balance_before_minutes, balance_after_minutes,
    effective_date, reason, source_type, source_id, operation_id,
    created_by_uid, created_by_email, created_at,
    delta_days, balance_before_days, balance_after_days,
    entry_code, metadata_json, deleted_at
  ) VALUES (?, ?, ?, 'annual', 'reversal', ?, ?, ?, ?, ?, 'workforce_leave', ?, ?, ?, ?, ?, ?, ?, ?, 'LEAVE_REVERSAL', ?, NULL)`)
    .bind(
      reversal.id,
      reversal.tenantId,
      reversal.employeeId,
      dayUnits(reversal.deltaDays),
      dayUnits(reversal.balanceBeforeDays),
      dayUnits(reversal.balanceAfterDays),
      reversal.effectiveDate,
      reversal.reason,
      reversal.leaveId,
      reversal.operationId,
      reversal.principal?.uid || null,
      reversal.principal?.email || null,
      reversal.createdAt,
      reversal.deltaDays,
      reversal.balanceBeforeDays,
      reversal.balanceAfterDays,
      JSON.stringify({ sourceUsageId: reversal.sourceUsageId })
    );
}

function buildAuditStatement(db, { tenantId, principal, action, entityType, entityId, before = null, after = null, metadata = null }) {
  return db.prepare(`INSERT INTO workforce_audit_events (
    id, tenant_id, actor_uid, actor_email, action, entity_type, entity_id,
    before_json, after_json, metadata_json, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      id("wf_audit"),
      tenantId,
      principal?.uid || null,
      principal?.email || null,
      action,
      entityType,
      entityId,
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after),
      metadata == null ? null : JSON.stringify(metadata),
      nowIso()
    );
}

async function runBatch(db, statements) {
  if (typeof db.batch !== "function") throw httpError(500, "workforce_batch_unavailable");
  await db.batch(statements);
}

function normalizeLeaveInput(body) {
  const leaveType = clean(body.leaveType || body.leave_type);
  const durationKind = clean(body.durationKind || body.duration_kind || "full_day");
  const startDate = validDate(body.startDate || body.start_date, "start_date");
  const endDate = validDate(body.endDate || body.end_date || startDate, "end_date");
  if (!LEAVE_TYPES.has(leaveType)) throw httpError(400, "workforce_leave_type_invalid");
  if (!LEAVE_DURATION_KINDS.has(durationKind)) throw httpError(400, "workforce_leave_duration_invalid");
  if (endDate < startDate) throw httpError(400, "workforce_leave_date_range_invalid");

  let partialStartTime = nullable(body.partialStartTime || body.partial_start_time);
  let partialEndTime = nullable(body.partialEndTime || body.partial_end_time);
  let requestedMinutes = nullableInteger(body.requestedMinutes ?? body.requested_minutes);

  if (durationKind === "partial") {
    if (!isTime(partialStartTime) || !isTime(partialEndTime)) throw httpError(400, "workforce_leave_partial_time_required");
    if (startDate !== endDate) throw httpError(400, "workforce_leave_partial_must_be_single_date");
    const derived = shiftMinutes(partialStartTime, partialEndTime);
    if (!(derived > 0)) throw httpError(400, "workforce_leave_partial_time_invalid");
    requestedMinutes = requestedMinutes || derived;
  } else {
    partialStartTime = null;
    partialEndTime = null;
    requestedMinutes = null;
  }

  if (durationKind === "half_day" && startDate !== endDate) {
    throw httpError(400, "workforce_leave_half_day_must_be_single_date");
  }

  return {
    leaveType,
    durationKind,
    startDate,
    endDate,
    partialStartTime,
    partialEndTime,
    requestedMinutes,
    reason: nullable(body.reason),
    note: nullable(body.note),
  };
}

async function requireLeave(db, tenantId, employeeId, leaveId) {
  const row = await db
    .prepare(`SELECT * FROM workforce_leaves
               WHERE tenant_id = ? AND employee_id = ? AND id = ? LIMIT 1`)
    .bind(tenantId, employeeId, leaveId)
    .first();
  if (!row) throw httpError(404, "workforce_leave_not_found");
  return row;
}

async function requireEmployeeAccess(db, tenantId, employeeId, principal) {
  const employee = await db
    .prepare(`SELECT id, account_uid, account_email
                FROM workforce_employee_profiles
               WHERE tenant_id = ? AND id = ? LIMIT 1`)
    .bind(tenantId, employeeId)
    .first();
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

function shiftMinutes(startValue, endValue) {
  if (!isTime(startValue) || !isTime(endValue)) return 0;
  const [sh, sm] = startValue.split(":").map(Number);
  const [eh, em] = endValue.split(":").map(Number);
  const start = sh * 60 + sm;
  let end = eh * 60 + em;
  if (end <= start) end += 1440;
  return end - start;
}

function dayUnits(days) {
  return Math.round((Number(days) || 0) * 1440);
}

function roundDays(value) {
  return Math.round((Number(value) || 0) * 10000) / 10000;
}

function validDate(value, field) {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw httpError(400, `workforce_${field}_invalid`);
  const date = new Date(`${text}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw httpError(400, `workforce_${field}_invalid`);
  return text;
}

function isTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(clean(value));
}

async function readJson(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid");
    return body;
  } catch {
    throw httpError(400, "workforce_invalid_json");
  }
}

function stripRoutePrefix(pathname, routePrefix) {
  const prefix = clean(routePrefix).replace(/\/$/, "");
  if (!prefix) return pathname || "/";
  if (!pathname.startsWith(prefix)) return pathname;
  return pathname.slice(prefix.length) || "/";
}

function methodNotAllowed(methods) {
  return json(405, { ok: false, message: "method_not_allowed", allowed: methods });
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.code = message;
  return error;
}

function clean(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "undefined" || text === "null") return "";
  return text;
}

function nullable(value) {
  const text = clean(value);
  return text || null;
}

function nullableInteger(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function nowIso() {
  return new Date().toISOString();
}

function todayRiyadh() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function id(prefix) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${random}`;
}
