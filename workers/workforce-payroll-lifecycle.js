const STATUS_RANK = { draft: 0, reviewed: 1, approved: 2, paid: 3 };
const FORWARD_TARGET = { review: "reviewed", approve: "approved", mark_paid: "paid" };
const REOPEN_TARGETS = new Set(["draft", "reviewed"]);

export async function handleWorkforcePayrollLifecycleRequest({
  request,
  url,
  db,
  tenant,
  principal,
  routePrefix = "",
}) {
  const pathname = stripRoutePrefix(url?.pathname || "", routePrefix);
  const match = pathname.match(/^\/v1\/employees\/([^/]+)\/payroll-lifecycle$/);
  if (!match) return null;

  const employeeId = decodeURIComponent(match[1]);
  await requireEmployeeAccess(db, tenant.id, employeeId, principal);
  requireManager(principal);
  const monthKey = validMonth(url.searchParams.get("month") || currentMonthRiyadh());

  if (request.method === "GET") {
    return json(200, {
      ok: true,
      workspace: await getLifecycleWorkspace(db, tenant.id, employeeId, monthKey),
    });
  }

  if (request.method === "POST") {
    const body = await readJson(request);
    const result = await transitionPayrollEntry({
      db,
      tenantId: tenant.id,
      employeeId,
      monthKey,
      body,
      principal,
    });
    return json(200, { ok: true, ...result });
  }

  return methodNotAllowed(["GET", "POST"]);
}

export function payrollLifecycleTarget(currentStatusValue, actionValue, requestedTargetValue = "") {
  const currentStatus = cleanStatus(currentStatusValue);
  const action = clean(actionValue);
  if (FORWARD_TARGET[action]) {
    const target = FORWARD_TARGET[action];
    const expectedCurrent = target === "reviewed" ? "draft" : target === "approved" ? "reviewed" : "approved";
    if (currentStatus === target) return { target, idempotent: true };
    if (currentStatus !== expectedCurrent) return null;
    return { target, idempotent: false };
  }
  if (action === "reopen") {
    if (currentStatus === "paid") return { error: "workforce_payroll_paid_reopen_not_allowed" };
    if (currentStatus !== "approved") return { error: "workforce_payroll_reopen_requires_approved" };
    const target = clean(requestedTargetValue) || "draft";
    if (!REOPEN_TARGETS.has(target)) return { error: "workforce_payroll_reopen_target_invalid" };
    return { target, idempotent: false };
  }
  if (action === "reverse_payment") {
    if (currentStatus !== "paid") return { error: "workforce_payroll_payment_reversal_requires_paid" };
    return { target: "approved", idempotent: false };
  }
  return { error: "workforce_payroll_lifecycle_action_invalid" };
}

export function aggregatePayrollPeriodStatus(statuses = []) {
  const normalized = statuses.map(cleanStatus).filter(Boolean);
  if (!normalized.length) return "draft";
  return normalized.reduce((lowest, status) => STATUS_RANK[status] < STATUS_RANK[lowest] ? status : lowest, normalized[0]);
}

export function evaluatePayrollReviewGate({ entry, periodEnd, today = todayRiyadh() } = {}) {
  const blockers = [];
  if (!entry) blockers.push({ code: "workforce_payroll_entry_required", message: "أنشئ واحتسب مسودة الراتب أولًا." });
  if (periodEnd && periodEnd >= today) {
    blockers.push({ code: "workforce_payroll_period_not_closed", message: "لا يمكن إقفال المراجعة قبل انتهاء شهر المسير." });
  }
  if (entry) {
    const calculation = parseJson(entry.calculation_snapshot_json);
    const attendance = parseJson(entry.attendance_snapshot_json);
    if (clean(calculation?.stage) !== "attendance_applied") {
      blockers.push({ code: "workforce_payroll_readiness_not_applied", message: "طبّق جاهزية الحضور والخصومات قبل مراجعة الراتب." });
    }
    if (attendance?.readiness?.ready !== true) {
      blockers.push({ code: "workforce_payroll_readiness_not_ready", message: "جاهزية الحضور غير مكتملة لهذا الموظف." });
    }
  }
  return { ready: blockers.length === 0, blockers };
}

async function getLifecycleWorkspace(db, tenantId, employeeId, monthKey) {
  const [period, entry, employee] = await Promise.all([
    db.prepare(`SELECT * FROM workforce_payroll_periods WHERE tenant_id = ? AND month_key = ? LIMIT 1`)
      .bind(tenantId, monthKey).first(),
    db.prepare(`SELECT * FROM workforce_payroll_entries WHERE tenant_id = ? AND employee_id = ? AND month_key = ? LIMIT 1`)
      .bind(tenantId, employeeId, monthKey).first(),
    db.prepare(`SELECT id, display_name, employee_number FROM workforce_employee_profiles WHERE tenant_id = ? AND id = ? LIMIT 1`)
      .bind(tenantId, employeeId).first(),
  ]);

  const bounds = monthBounds(monthKey);
  const reviewGate = evaluatePayrollReviewGate({ entry, periodEnd: period?.period_end || bounds.end });
  const currentStatus = cleanStatus(entry?.status || period?.status || "draft");
  return {
    monthKey,
    employee: employee ? {
      id: clean(employee.id),
      displayName: clean(employee.display_name),
      employeeNumber: nullable(employee.employee_number),
    } : null,
    period: mapPeriod(period),
    entry: mapEntry(entry),
    currentStatus,
    reviewGate,
    actions: allowedActions(currentStatus, reviewGate.ready),
    policy: {
      paidReopenAllowed: false,
      paymentReversalRequiredForPaid: true,
      reopenTargets: ["draft", "reviewed"],
    },
  };
}

async function transitionPayrollEntry({ db, tenantId, employeeId, monthKey, body, principal }) {
  const action = clean(body.action);
  const operationId = requiredText(body.operationId || body.operation_id, "workforce_payroll_lifecycle_operation_required", 160);
  const [period, entry] = await Promise.all([
    db.prepare(`SELECT * FROM workforce_payroll_periods WHERE tenant_id = ? AND month_key = ? LIMIT 1`)
      .bind(tenantId, monthKey).first(),
    db.prepare(`SELECT * FROM workforce_payroll_entries WHERE tenant_id = ? AND employee_id = ? AND month_key = ? LIMIT 1`)
      .bind(tenantId, employeeId, monthKey).first(),
  ]);
  if (!period || !entry) throw httpError(409, "workforce_payroll_entry_required");

  const prior = await findPriorOperation(db, tenantId, entry.id, operationId);
  if (prior) {
    return {
      idempotent: true,
      workspace: await getLifecycleWorkspace(db, tenantId, employeeId, monthKey),
    };
  }

  const transition = payrollLifecycleTarget(entry.status, action, body.targetStatus || body.target_status);
  if (!transition) throw httpError(409, "workforce_payroll_lifecycle_transition_invalid");
  if (transition.error) throw httpError(409, transition.error);
  if (transition.idempotent) {
    return {
      idempotent: true,
      workspace: await getLifecycleWorkspace(db, tenantId, employeeId, monthKey),
    };
  }

  if (action === "review") {
    const gate = evaluatePayrollReviewGate({ entry, periodEnd: period.period_end });
    if (!gate.ready) throw httpError(409, gate.blockers[0]?.code || "workforce_payroll_review_not_ready");
  }

  const backward = action === "reopen" || action === "reverse_payment";
  const reason = backward
    ? requiredText(body.reason, "workforce_payroll_lifecycle_reason_required", 1500)
    : nullableText(body.reason, 1500);
  const payDate = action === "mark_paid" ? normalizePayDate(body.payDate || body.pay_date) : null;
  const now = nowIso();

  const allEntries = await db.prepare(`SELECT id, status FROM workforce_payroll_entries WHERE tenant_id = ? AND period_id = ? ORDER BY id`)
    .bind(tenantId, period.id).all();
  const projectedStatuses = (allEntries?.results || []).map(row => clean(row.id) === clean(entry.id) ? transition.target : cleanStatus(row.status));
  const aggregateStatus = aggregatePayrollPeriodStatus(projectedStatuses);

  const before = mapEntry(entry);
  const entryStatement = buildEntryTransitionStatement(db, {
    tenantId,
    entryId: entry.id,
    target: transition.target,
    action,
    principal,
    now,
  });
  const periodStatement = buildPeriodAggregateStatement(db, {
    tenantId,
    period,
    aggregateStatus,
    action,
    payDate,
    principal,
    now,
  });
  const auditStatement = buildAuditStatement(db, {
    tenantId,
    principal,
    action: auditAction(action),
    entryId: entry.id,
    before,
    after: { ...before, status: transition.target },
    metadata: {
      operationId,
      monthKey,
      reason,
      requestedAction: action,
      targetStatus: transition.target,
      aggregatePeriodStatus: aggregateStatus,
      payDate,
    },
  });

  await runBatch(db, [entryStatement, periodStatement, auditStatement]);
  return {
    idempotent: false,
    workspace: await getLifecycleWorkspace(db, tenantId, employeeId, monthKey),
  };
}

function buildEntryTransitionStatement(db, { tenantId, entryId, target, action, principal, now }) {
  if (target === "reviewed") {
    if (action === "reopen") {
      return db.prepare(`UPDATE workforce_payroll_entries
        SET status='reviewed', approved_at=NULL, approved_by_uid=NULL, paid_at=NULL, paid_by_uid=NULL, updated_at=?
        WHERE tenant_id=? AND id=?`).bind(now, tenantId, entryId);
    }
    return db.prepare(`UPDATE workforce_payroll_entries
      SET status='reviewed', reviewed_at=?, reviewed_by_uid=?, approved_at=NULL, approved_by_uid=NULL, paid_at=NULL, paid_by_uid=NULL, updated_at=?
      WHERE tenant_id=? AND id=?`).bind(now, principal?.uid || null, now, tenantId, entryId);
  }
  if (target === "approved") {
    if (action === "reverse_payment") {
      return db.prepare(`UPDATE workforce_payroll_entries
        SET status='approved', paid_at=NULL, paid_by_uid=NULL, updated_at=?
        WHERE tenant_id=? AND id=?`).bind(now, tenantId, entryId);
    }
    return db.prepare(`UPDATE workforce_payroll_entries
      SET status='approved', approved_at=?, approved_by_uid=?, paid_at=NULL, paid_by_uid=NULL, updated_at=?
      WHERE tenant_id=? AND id=?`).bind(now, principal?.uid || null, now, tenantId, entryId);
  }
  if (target === "paid") {
    return db.prepare(`UPDATE workforce_payroll_entries
      SET status='paid', paid_at=?, paid_by_uid=?, updated_at=?
      WHERE tenant_id=? AND id=?`).bind(now, principal?.uid || null, now, tenantId, entryId);
  }
  return db.prepare(`UPDATE workforce_payroll_entries
    SET status='draft', reviewed_at=NULL, reviewed_by_uid=NULL, approved_at=NULL, approved_by_uid=NULL, paid_at=NULL, paid_by_uid=NULL, updated_at=?
    WHERE tenant_id=? AND id=?`).bind(now, tenantId, entryId);
}

function buildPeriodAggregateStatement(db, { tenantId, period, aggregateStatus, payDate, principal, now }) {
  const reviewedAt = STATUS_RANK[aggregateStatus] >= STATUS_RANK.reviewed ? (period.reviewed_at || now) : null;
  const reviewedBy = STATUS_RANK[aggregateStatus] >= STATUS_RANK.reviewed ? (period.reviewed_by_uid || principal?.uid || null) : null;
  const approvedAt = STATUS_RANK[aggregateStatus] >= STATUS_RANK.approved ? (period.approved_at || now) : null;
  const approvedBy = STATUS_RANK[aggregateStatus] >= STATUS_RANK.approved ? (period.approved_by_uid || principal?.uid || null) : null;
  const paidAt = aggregateStatus === "paid" ? (period.paid_at || now) : null;
  const paidBy = aggregateStatus === "paid" ? (period.paid_by_uid || principal?.uid || null) : null;
  const nextPayDate = aggregateStatus === "paid" ? (payDate || period.pay_date || todayRiyadh()) : null;
  return db.prepare(`UPDATE workforce_payroll_periods
    SET status=?, pay_date=?, reviewed_at=?, reviewed_by_uid=?, approved_at=?, approved_by_uid=?, paid_at=?, paid_by_uid=?, updated_at=?
    WHERE tenant_id=? AND id=?`)
    .bind(aggregateStatus, nextPayDate, reviewedAt, reviewedBy, approvedAt, approvedBy, paidAt, paidBy, now, tenantId, period.id);
}

async function findPriorOperation(db, tenantId, entryId, operationId) {
  const pattern = `%\"operationId\":\"${escapeLike(operationId)}\"%`;
  return db.prepare(`SELECT id FROM workforce_audit_events
    WHERE tenant_id=? AND entity_type='payroll_entry' AND entity_id=?
      AND action LIKE 'workforce.payroll.lifecycle.%' AND metadata_json LIKE ? ESCAPE '\\'
    LIMIT 1`).bind(tenantId, entryId, pattern).first();
}

function buildAuditStatement(db, { tenantId, principal, action, entryId, before, after, metadata }) {
  return db.prepare(`INSERT INTO workforce_audit_events (
    id, tenant_id, actor_uid, actor_email, action, entity_type, entity_id,
    before_json, after_json, metadata_json, created_at
  ) VALUES (?, ?, ?, ?, ?, 'payroll_entry', ?, ?, ?, ?, ?)`)
    .bind(
      id("wf_audit"), tenantId, principal?.uid || null, principal?.email || null,
      action, entryId, JSON.stringify(before), JSON.stringify(after), JSON.stringify(metadata), nowIso()
    );
}

function auditAction(action) {
  const map = {
    review: "workforce.payroll.lifecycle.review",
    approve: "workforce.payroll.lifecycle.approve",
    mark_paid: "workforce.payroll.lifecycle.mark_paid",
    reopen: "workforce.payroll.lifecycle.reopen",
    reverse_payment: "workforce.payroll.lifecycle.reverse_payment",
  };
  return map[action] || "workforce.payroll.lifecycle.unknown";
}

function allowedActions(status, reviewReady) {
  if (status === "draft") return { review: reviewReady, approve: false, markPaid: false, reopen: false, reversePayment: false };
  if (status === "reviewed") return { review: false, approve: true, markPaid: false, reopen: false, reversePayment: false };
  if (status === "approved") return { review: false, approve: false, markPaid: true, reopen: true, reversePayment: false };
  return { review: false, approve: false, markPaid: false, reopen: false, reversePayment: true };
}

function mapPeriod(row) {
  if (!row) return null;
  return {
    id: clean(row.id), monthKey: clean(row.month_key), status: cleanStatus(row.status),
    periodStart: clean(row.period_start), periodEnd: clean(row.period_end), payDate: nullable(row.pay_date),
    reviewedAt: nullable(row.reviewed_at), approvedAt: nullable(row.approved_at), paidAt: nullable(row.paid_at),
    updatedAt: nullable(row.updated_at),
  };
}

function mapEntry(row) {
  if (!row) return null;
  return {
    id: clean(row.id), employeeId: clean(row.employee_id), monthKey: clean(row.month_key), status: cleanStatus(row.status),
    grossSalaryHalalas: Number(row.gross_salary_halalas || 0), totalDeductionsHalalas: Number(row.total_deductions_halalas || 0),
    netSalaryHalalas: Number(row.net_salary_halalas || 0), reviewedAt: nullable(row.reviewed_at),
    approvedAt: nullable(row.approved_at), paidAt: nullable(row.paid_at), updatedAt: nullable(row.updated_at),
  };
}

async function requireEmployeeAccess(db, tenantId, employeeId, principal) {
  const employee = await db.prepare(`SELECT id, account_uid, account_email FROM workforce_employee_profiles WHERE tenant_id=? AND id=? LIMIT 1`)
    .bind(tenantId, employeeId).first();
  if (!employee) throw httpError(404, "workforce_employee_not_found");
  if (principal?.canManage) return employee;
  const sameUid = clean(principal?.uid) && clean(employee.account_uid) === clean(principal?.uid);
  const sameEmail = clean(principal?.email).toLowerCase() && clean(employee.account_email).toLowerCase() === clean(principal?.email).toLowerCase();
  if (!sameUid && !sameEmail) throw httpError(403, "workforce_employee_access_forbidden");
  return employee;
}

function requireManager(principal) {
  if (!principal?.canManage) throw httpError(403, "workforce_management_forbidden");
}

function normalizePayDate(value) {
  const text = clean(value) || todayRiyadh();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw httpError(400, "workforce_payroll_pay_date_invalid");
  if (text > todayRiyadh()) throw httpError(400, "workforce_payroll_pay_date_future");
  return text;
}

function monthBounds(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${monthKey}-01`, end: `${monthKey}-${String(endDay).padStart(2, "0")}` };
}
function validMonth(value) {
  const text = clean(value);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) throw httpError(400, "workforce_payroll_month_invalid");
  return text;
}
function currentMonthRiyadh() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit" }).format(new Date());
}
function todayRiyadh() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function parseJson(value) {
  try { return JSON.parse(String(value || "{}")); } catch { return {}; }
}
function cleanStatus(value) {
  const status = clean(value || "draft");
  return Object.hasOwn(STATUS_RANK, status) ? status : "draft";
}
function escapeLike(value) {
  return clean(value).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
async function readJson(request) {
  try { return (await request.json()) || {}; } catch { throw httpError(400, "workforce_invalid_json"); }
}
function requiredText(value, message, max) {
  const text = clean(value);
  if (!text) throw httpError(400, message);
  return text.slice(0, max);
}
function nullableText(value, max) {
  const text = clean(value);
  return text ? text.slice(0, max) : null;
}
function nullable(value) { const text = clean(value); return text || null; }
function clean(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "undefined" || text === "null") return "";
  return text;
}
function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function nowIso() { return new Date().toISOString(); }
function stripRoutePrefix(pathname, prefix) {
  const normalized = clean(prefix).replace(/\/$/, "");
  if (!normalized) return pathname || "/";
  return pathname.startsWith(normalized) ? pathname.slice(normalized.length) || "/" : pathname || "/";
}
function methodNotAllowed(allowed) {
  return new Response(JSON.stringify({ ok: false, message: "method_not_allowed" }), { status: 405, headers: { "Content-Type": "application/json; charset=utf-8", Allow: allowed.join(", ") } });
}
function json(status, payload) { return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json; charset=utf-8" } }); }
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
async function runBatch(db, statements) {
  if (typeof db.batch !== "function") throw httpError(500, "workforce_batch_unavailable");
  await db.batch(statements);
}
