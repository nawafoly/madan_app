const ADDITION_KINDS = new Set(["bonus", "allowance", "commission", "manual_addition"]);
const DEDUCTION_KINDS = new Set(["advance", "penalty", "manual_deduction", "other_deduction"]);
const MUTABLE_ENTRY_STATUSES = new Set(["draft"]);

export async function handleWorkforcePayrollAdjustmentsRequest({
  request,
  url,
  db,
  tenant,
  principal,
  routePrefix = "",
}) {
  const pathname = stripRoutePrefix(url?.pathname || "", routePrefix);
  const collectionMatch = pathname.match(/^\/v1\/employees\/([^/]+)\/payroll-adjustments$/);
  const detailMatch = pathname.match(/^\/v1\/employees\/([^/]+)\/payroll-adjustments\/([^/]+)$/);
  if (!collectionMatch && !detailMatch) return null;

  const employeeId = decodeURIComponent(collectionMatch?.[1] || detailMatch?.[1] || "");
  await requireEmployeeAccess(db, tenant.id, employeeId, principal);
  requireManager(principal);

  if (collectionMatch) {
    const monthKey = validMonth(url.searchParams.get("month") || currentMonthRiyadh());
    if (request.method === "GET") {
      return json(200, {
        ok: true,
        workspace: await getPayrollAdjustmentWorkspace(db, tenant.id, employeeId, monthKey),
      });
    }
    if (request.method === "POST") {
      const body = await readJson(request);
      const result = await createManualAdjustment(db, tenant.id, employeeId, monthKey, body, principal);
      return json(result.idempotent ? 200 : 201, { ok: true, ...result });
    }
    return methodNotAllowed(["GET", "POST"]);
  }

  const adjustmentId = decodeURIComponent(detailMatch[2]);
  if (request.method === "DELETE") {
    const result = await cancelManualAdjustment(db, tenant.id, employeeId, adjustmentId, principal);
    return json(200, { ok: true, ...result });
  }
  return methodNotAllowed(["DELETE"]);
}

export function manualAdjustmentDirectionForKind(kindValue) {
  const kind = clean(kindValue);
  if (ADDITION_KINDS.has(kind)) return "addition";
  if (DEDUCTION_KINDS.has(kind)) return "deduction";
  return null;
}

export function calculatePayrollEntryTotals(input = {}) {
  const base = nonNegativeInt(input.baseSalaryHalalas);
  const allowances = nonNegativeInt(input.allowancesHalalas);
  const overtime = nonNegativeInt(input.overtimeHalalas);
  const additions = nonNegativeInt(input.manualAdditionsHalalas);
  const attendanceDeduction = nonNegativeInt(input.attendanceDeductionHalalas);
  const absenceDeduction = nonNegativeInt(input.absenceDeductionHalalas);
  const manualDeductions = nonNegativeInt(input.manualDeductionsHalalas);
  const gross = base + allowances + overtime + additions;
  const deductions = attendanceDeduction + absenceDeduction + manualDeductions;
  return {
    grossSalaryHalalas: gross,
    totalDeductionsHalalas: deductions,
    netSalaryHalalas: Math.max(0, gross - deductions),
  };
}

async function getPayrollAdjustmentWorkspace(db, tenantId, employeeId, monthKey) {
  const [settings, period, entry] = await Promise.all([
    db.prepare(`SELECT * FROM workforce_payroll_settings WHERE tenant_id = ? AND employee_id = ? LIMIT 1`)
      .bind(tenantId, employeeId).first(),
    db.prepare(`SELECT * FROM workforce_payroll_periods WHERE tenant_id = ? AND month_key = ? LIMIT 1`)
      .bind(tenantId, monthKey).first(),
    db.prepare(`SELECT * FROM workforce_payroll_entries WHERE tenant_id = ? AND employee_id = ? AND month_key = ? LIMIT 1`)
      .bind(tenantId, employeeId, monthKey).first(),
  ]);

  let adjustments = [];
  if (entry?.id) {
    const result = await db
      .prepare(`SELECT * FROM workforce_payroll_adjustments
                 WHERE tenant_id = ? AND employee_id = ? AND payroll_entry_id = ?
                 ORDER BY added_at DESC, id DESC`)
      .bind(tenantId, employeeId, entry.id)
      .all();
    adjustments = result?.results || [];
  }

  const settingsPreview = payrollSettingsPreview(settings);
  const totals = entry
    ? calculatePayrollEntryTotals({
        baseSalaryHalalas: entry.base_salary_halalas,
        allowancesHalalas: entry.allowances_halalas,
        overtimeHalalas: entry.overtime_halalas,
        manualAdditionsHalalas: entry.manual_additions_halalas,
        attendanceDeductionHalalas: entry.attendance_deduction_halalas,
        absenceDeductionHalalas: entry.absence_deduction_halalas,
        manualDeductionsHalalas: entry.manual_deductions_halalas,
      })
    : calculatePayrollEntryTotals(settingsPreview);

  const locked = Boolean(
    (period && !MUTABLE_ENTRY_STATUSES.has(clean(period.status))) ||
    (entry && !MUTABLE_ENTRY_STATUSES.has(clean(entry.status)))
  );

  return {
    employeeId,
    monthKey,
    settingsReady: Boolean(settings),
    period: mapPeriod(period),
    entry: mapEntry(entry),
    adjustments: adjustments.map(mapAdjustment),
    preview: {
      baseSalaryHalalas: entry ? Number(entry.base_salary_halalas || 0) : settingsPreview.baseSalaryHalalas,
      allowancesHalalas: entry ? Number(entry.allowances_halalas || 0) : settingsPreview.allowancesHalalas,
      overtimeHalalas: entry ? Number(entry.overtime_halalas || 0) : 0,
      manualAdditionsHalalas: entry ? Number(entry.manual_additions_halalas || 0) : 0,
      attendanceDeductionHalalas: entry ? Number(entry.attendance_deduction_halalas || 0) : 0,
      absenceDeductionHalalas: entry ? Number(entry.absence_deduction_halalas || 0) : 0,
      manualDeductionsHalalas: entry ? Number(entry.manual_deductions_halalas || 0) : 0,
      ...totals,
    },
    locked,
    lockedReason: locked ? "payroll_entry_not_draft" : null,
    automaticAttendanceDeductionApplied: false,
  };
}

async function createManualAdjustment(db, tenantId, employeeId, monthKey, body, principal) {
  const kind = clean(body.kind);
  const direction = manualAdjustmentDirectionForKind(kind);
  if (!direction) throw httpError(400, "workforce_payroll_adjustment_kind_invalid");
  if (body.direction && clean(body.direction) !== direction) {
    throw httpError(400, "workforce_payroll_adjustment_direction_kind_mismatch");
  }
  const amountHalalas = positiveInt(body.amountHalalas ?? body.amount_halalas, "workforce_payroll_adjustment_amount_invalid");
  const reason = requiredText(body.reason, "workforce_payroll_adjustment_reason_required", 1500);
  const note = nullableText(body.note, 3000);
  const operationId = clean(body.operationId || body.operation_id) || id("wf_payroll_adjustment_op");

  const prior = await db
    .prepare(`SELECT * FROM workforce_payroll_adjustments WHERE tenant_id = ? AND operation_id = ? LIMIT 1`)
    .bind(tenantId, operationId)
    .first();
  if (prior) {
    if (clean(prior.employee_id) !== employeeId) {
      throw httpError(409, "workforce_payroll_adjustment_operation_employee_mismatch");
    }
    const entry = await requireEntry(db, tenantId, employeeId, prior.payroll_entry_id);
    return {
      idempotent: true,
      adjustment: mapAdjustment(prior),
      workspace: await getPayrollAdjustmentWorkspace(db, tenantId, employeeId, entry.month_key),
    };
  }

  const { period, entry } = await ensureDraftPayrollEntry(db, tenantId, employeeId, monthKey, principal);
  assertDraft(period, entry);

  const adjustmentId = id("wf_payroll_adjustment");
  const now = nowIso();
  const insert = db.prepare(`INSERT INTO workforce_payroll_adjustments (
    id, tenant_id, payroll_entry_id, employee_id, direction, kind,
    amount_halalas, reason, note, source_type, source_id,
    added_by_uid, added_by_email, added_at,
    operation_id, status, metadata_json, cancelled_at,
    cancelled_by_uid, cancelled_by_email, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, 'active', ?, NULL, NULL, NULL, ?)`)
    .bind(
      adjustmentId,
      tenantId,
      entry.id,
      employeeId,
      direction,
      kind,
      amountHalalas,
      reason,
      note,
      adjustmentId,
      principal?.uid || null,
      principal?.email || null,
      now,
      operationId,
      JSON.stringify({ stage: "manual_adjustments_only", automaticAttendanceDeductionApplied: false }),
      now
    );

  const recompute = buildRecomputeEntryStatement(db, tenantId, entry.id, now);
  const audit = buildAuditStatement(db, {
    tenantId,
    principal,
    action: "workforce.payroll_adjustment.create",
    entityType: "payroll_adjustment",
    entityId: adjustmentId,
    after: { adjustmentId, employeeId, monthKey, direction, kind, amountHalalas, reason },
    metadata: { automaticAttendanceDeductionApplied: false },
  });

  await runBatch(db, [insert, recompute, audit]);
  const adjustment = await requireAdjustment(db, tenantId, employeeId, adjustmentId);
  return {
    idempotent: false,
    adjustment: mapAdjustment(adjustment),
    workspace: await getPayrollAdjustmentWorkspace(db, tenantId, employeeId, monthKey),
  };
}

async function cancelManualAdjustment(db, tenantId, employeeId, adjustmentId, principal) {
  const adjustment = await requireAdjustment(db, tenantId, employeeId, adjustmentId);
  const entry = await requireEntry(db, tenantId, employeeId, adjustment.payroll_entry_id);
  const period = await db.prepare(`SELECT * FROM workforce_payroll_periods WHERE tenant_id = ? AND id = ? LIMIT 1`)
    .bind(tenantId, entry.period_id).first();
  assertDraft(period, entry);

  if (clean(adjustment.status || "active") === "cancelled") {
    return {
      idempotent: true,
      adjustment: mapAdjustment(adjustment),
      workspace: await getPayrollAdjustmentWorkspace(db, tenantId, employeeId, entry.month_key),
    };
  }

  const now = nowIso();
  const cancel = db.prepare(`UPDATE workforce_payroll_adjustments
                                SET status = 'cancelled', cancelled_at = ?,
                                    cancelled_by_uid = ?, cancelled_by_email = ?, updated_at = ?
                              WHERE tenant_id = ? AND employee_id = ? AND id = ?`)
    .bind(now, principal?.uid || null, principal?.email || null, now, tenantId, employeeId, adjustmentId);
  const recompute = buildRecomputeEntryStatement(db, tenantId, entry.id, now);
  const audit = buildAuditStatement(db, {
    tenantId,
    principal,
    action: "workforce.payroll_adjustment.cancel",
    entityType: "payroll_adjustment",
    entityId: adjustmentId,
    before: mapAdjustment(adjustment),
    after: { ...mapAdjustment(adjustment), status: "cancelled", cancelledAt: now },
  });

  await runBatch(db, [cancel, recompute, audit]);
  const next = await requireAdjustment(db, tenantId, employeeId, adjustmentId);
  return {
    idempotent: false,
    adjustment: mapAdjustment(next),
    workspace: await getPayrollAdjustmentWorkspace(db, tenantId, employeeId, entry.month_key),
  };
}

async function ensureDraftPayrollEntry(db, tenantId, employeeId, monthKey, principal) {
  const settings = await db
    .prepare(`SELECT * FROM workforce_payroll_settings WHERE tenant_id = ? AND employee_id = ? LIMIT 1`)
    .bind(tenantId, employeeId)
    .first();
  if (!settings) throw httpError(409, "workforce_payroll_settings_required");

  const { start, end } = monthBounds(monthKey);
  const periodId = `wf_payroll_period_${tenantId}_${monthKey}`;
  const entryId = `wf_payroll_entry_${employeeId}_${monthKey}`;
  const now = nowIso();
  const allowances = Number(settings.housing_allowance_halalas || 0)
    + Number(settings.transportation_allowance_halalas || 0)
    + Number(settings.other_allowances_halalas || 0);
  const base = Number(settings.base_salary_halalas || 0);
  const initialTotals = calculatePayrollEntryTotals({ baseSalaryHalalas: base, allowancesHalalas: allowances });
  const setupSnapshot = JSON.stringify({
    baseSalaryHalalas: base,
    housingAllowanceHalalas: Number(settings.housing_allowance_halalas || 0),
    transportationAllowanceHalalas: Number(settings.transportation_allowance_halalas || 0),
    otherAllowancesHalalas: Number(settings.other_allowances_halalas || 0),
    workDaysPerMonth: settings.work_days_per_month == null ? null : Number(settings.work_days_per_month),
    dailyHours: settings.daily_hours == null ? null : Number(settings.daily_hours),
    monthlyHours: settings.monthly_hours == null ? null : Number(settings.monthly_hours),
    deductionMethod: clean(settings.deduction_method),
    attendancePayrollMode: clean(settings.attendance_payroll_mode),
  });

  await runBatch(db, [
    db.prepare(`INSERT INTO workforce_payroll_periods (
      id, tenant_id, month_key, period_start, period_end, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)
    ON CONFLICT(tenant_id, month_key) DO NOTHING`)
      .bind(periodId, tenantId, monthKey, start, end, now, now),
    db.prepare(`INSERT INTO workforce_payroll_entries (
      id, tenant_id, period_id, employee_id, month_key, status,
      base_salary_halalas, allowances_halalas,
      attendance_deduction_halalas, absence_deduction_halalas, overtime_halalas,
      manual_additions_halalas, manual_deductions_halalas,
      gross_salary_halalas, total_deductions_halalas, net_salary_halalas,
      attendance_snapshot_json, setup_snapshot_json, calculation_snapshot_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, 0, 0, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, employee_id, month_key) DO NOTHING`)
      .bind(
        entryId,
        tenantId,
        periodId,
        employeeId,
        monthKey,
        base,
        allowances,
        initialTotals.grossSalaryHalalas,
        initialTotals.totalDeductionsHalalas,
        initialTotals.netSalaryHalalas,
        JSON.stringify({ status: "not_evaluated", automaticAttendanceDeductionApplied: false }),
        setupSnapshot,
        JSON.stringify({ stage: "manual_adjustments_only", automaticAttendanceDeductionApplied: false }),
        now,
        now
      ),
    buildAuditStatement(db, {
      tenantId,
      principal,
      action: "workforce.payroll_adjustment.workspace.ensure",
      entityType: "payroll_entry",
      entityId: entryId,
      after: { employeeId, monthKey, stage: "manual_adjustments_only" },
    }),
  ]);

  const [period, entry] = await Promise.all([
    db.prepare(`SELECT * FROM workforce_payroll_periods WHERE tenant_id = ? AND month_key = ? LIMIT 1`)
      .bind(tenantId, monthKey).first(),
    db.prepare(`SELECT * FROM workforce_payroll_entries WHERE tenant_id = ? AND employee_id = ? AND month_key = ? LIMIT 1`)
      .bind(tenantId, employeeId, monthKey).first(),
  ]);
  if (!period || !entry) throw httpError(500, "workforce_payroll_adjustment_workspace_create_failed");
  return { period, entry };
}

function buildRecomputeEntryStatement(db, tenantId, entryId, now) {
  return db.prepare(`UPDATE workforce_payroll_entries
                        SET manual_additions_halalas = (
                              SELECT COALESCE(SUM(amount_halalas), 0)
                                FROM workforce_payroll_adjustments
                               WHERE tenant_id = ? AND payroll_entry_id = ?
                                 AND direction = 'addition' AND COALESCE(status, 'active') = 'active'
                            ),
                            manual_deductions_halalas = (
                              SELECT COALESCE(SUM(amount_halalas), 0)
                                FROM workforce_payroll_adjustments
                               WHERE tenant_id = ? AND payroll_entry_id = ?
                                 AND direction = 'deduction' AND COALESCE(status, 'active') = 'active'
                            ),
                            gross_salary_halalas = base_salary_halalas + allowances_halalas + overtime_halalas + (
                              SELECT COALESCE(SUM(amount_halalas), 0)
                                FROM workforce_payroll_adjustments
                               WHERE tenant_id = ? AND payroll_entry_id = ?
                                 AND direction = 'addition' AND COALESCE(status, 'active') = 'active'
                            ),
                            total_deductions_halalas = attendance_deduction_halalas + absence_deduction_halalas + (
                              SELECT COALESCE(SUM(amount_halalas), 0)
                                FROM workforce_payroll_adjustments
                               WHERE tenant_id = ? AND payroll_entry_id = ?
                                 AND direction = 'deduction' AND COALESCE(status, 'active') = 'active'
                            ),
                            net_salary_halalas = MAX(0,
                              base_salary_halalas + allowances_halalas + overtime_halalas + (
                                SELECT COALESCE(SUM(amount_halalas), 0)
                                  FROM workforce_payroll_adjustments
                                 WHERE tenant_id = ? AND payroll_entry_id = ?
                                   AND direction = 'addition' AND COALESCE(status, 'active') = 'active'
                              ) - attendance_deduction_halalas - absence_deduction_halalas - (
                                SELECT COALESCE(SUM(amount_halalas), 0)
                                  FROM workforce_payroll_adjustments
                                 WHERE tenant_id = ? AND payroll_entry_id = ?
                                   AND direction = 'deduction' AND COALESCE(status, 'active') = 'active'
                              )
                            ),
                            updated_at = ?
                      WHERE tenant_id = ? AND id = ?`)
    .bind(
      tenantId, entryId,
      tenantId, entryId,
      tenantId, entryId,
      tenantId, entryId,
      tenantId, entryId,
      tenantId, entryId,
      now,
      tenantId, entryId
    );
}

function assertDraft(period, entry) {
  if (!period || !entry) throw httpError(404, "workforce_payroll_entry_not_found");
  if (!MUTABLE_ENTRY_STATUSES.has(clean(period.status)) || !MUTABLE_ENTRY_STATUSES.has(clean(entry.status))) {
    throw httpError(409, "workforce_payroll_adjustment_entry_locked");
  }
}

async function requireAdjustment(db, tenantId, employeeId, adjustmentId) {
  const row = await db
    .prepare(`SELECT * FROM workforce_payroll_adjustments WHERE tenant_id = ? AND employee_id = ? AND id = ? LIMIT 1`)
    .bind(tenantId, employeeId, adjustmentId)
    .first();
  if (!row) throw httpError(404, "workforce_payroll_adjustment_not_found");
  return row;
}

async function requireEntry(db, tenantId, employeeId, entryId) {
  const row = await db
    .prepare(`SELECT * FROM workforce_payroll_entries WHERE tenant_id = ? AND employee_id = ? AND id = ? LIMIT 1`)
    .bind(tenantId, employeeId, entryId)
    .first();
  if (!row) throw httpError(404, "workforce_payroll_entry_not_found");
  return row;
}

async function requireEmployeeAccess(db, tenantId, employeeId, principal) {
  const employee = await db
    .prepare(`SELECT id, account_uid, account_email FROM workforce_employee_profiles WHERE tenant_id = ? AND id = ? LIMIT 1`)
    .bind(tenantId, employeeId)
    .first();
  if (!employee) throw httpError(404, "workforce_employee_not_found");
  if (principal?.canManage) return employee;
  const sameUid = clean(principal?.uid) && clean(employee.account_uid) === clean(principal?.uid);
  const sameEmail = clean(principal?.email).toLowerCase()
    && clean(employee.account_email).toLowerCase() === clean(principal?.email).toLowerCase();
  if (!sameUid && !sameEmail) throw httpError(403, "workforce_employee_access_forbidden");
  return employee;
}

function requireManager(principal) {
  if (!principal?.canManage) throw httpError(403, "workforce_management_forbidden");
}

function payrollSettingsPreview(settings) {
  if (!settings) return { baseSalaryHalalas: 0, allowancesHalalas: 0 };
  return {
    baseSalaryHalalas: Number(settings.base_salary_halalas || 0),
    allowancesHalalas: Number(settings.housing_allowance_halalas || 0)
      + Number(settings.transportation_allowance_halalas || 0)
      + Number(settings.other_allowances_halalas || 0),
  };
}

function mapPeriod(row) {
  if (!row) return null;
  return {
    id: clean(row.id),
    monthKey: clean(row.month_key),
    periodStart: clean(row.period_start),
    periodEnd: clean(row.period_end),
    status: clean(row.status),
  };
}

function mapEntry(row) {
  if (!row) return null;
  return {
    id: clean(row.id),
    monthKey: clean(row.month_key),
    status: clean(row.status),
    baseSalaryHalalas: Number(row.base_salary_halalas || 0),
    allowancesHalalas: Number(row.allowances_halalas || 0),
    attendanceDeductionHalalas: Number(row.attendance_deduction_halalas || 0),
    absenceDeductionHalalas: Number(row.absence_deduction_halalas || 0),
    overtimeHalalas: Number(row.overtime_halalas || 0),
    manualAdditionsHalalas: Number(row.manual_additions_halalas || 0),
    manualDeductionsHalalas: Number(row.manual_deductions_halalas || 0),
    grossSalaryHalalas: Number(row.gross_salary_halalas || 0),
    totalDeductionsHalalas: Number(row.total_deductions_halalas || 0),
    netSalaryHalalas: Number(row.net_salary_halalas || 0),
    updatedAt: clean(row.updated_at) || null,
  };
}

function mapAdjustment(row) {
  return {
    id: clean(row.id),
    payrollEntryId: clean(row.payroll_entry_id),
    employeeId: clean(row.employee_id),
    direction: clean(row.direction),
    kind: clean(row.kind),
    amountHalalas: Number(row.amount_halalas || 0),
    reason: clean(row.reason),
    note: clean(row.note) || null,
    status: clean(row.status || "active"),
    operationId: clean(row.operation_id) || null,
    addedAt: clean(row.added_at) || null,
    addedByEmail: clean(row.added_by_email) || null,
    cancelledAt: clean(row.cancelled_at) || null,
  };
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
      entityId || null,
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

function monthBounds(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${monthKey}-01`,
    end: `${monthKey}-${String(endDay).padStart(2, "0")}`,
  };
}

function currentMonthRiyadh() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find(part => part.type === "year")?.value;
  const month = parts.find(part => part.type === "month")?.value;
  return `${year}-${month}`;
}

function validMonth(value) {
  const text = clean(value);
  const match = /^(\d{4})-(\d{2})$/.exec(text);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw httpError(400, "workforce_payroll_month_invalid");
  }
  return text;
}

async function readJson(request) {
  try {
    return (await request.json()) || {};
  } catch {
    throw httpError(400, "workforce_invalid_json");
  }
}

function positiveInt(value, errorCode) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || !Number.isInteger(number)) throw httpError(400, errorCode);
  return number;
}

function nonNegativeInt(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
}

function requiredText(value, errorCode, maxLength) {
  const text = clean(value);
  if (!text || text.length > maxLength) throw httpError(400, errorCode);
  return text;
}

function nullableText(value, maxLength) {
  const text = clean(value);
  if (!text) return null;
  if (text.length > maxLength) throw httpError(400, "workforce_payroll_adjustment_note_too_long");
  return text;
}

function stripRoutePrefix(pathname, prefix) {
  const normalizedPrefix = clean(prefix).replace(/\/$/, "");
  if (!normalizedPrefix) return pathname || "/";
  return pathname.startsWith(normalizedPrefix)
    ? pathname.slice(normalizedPrefix.length) || "/"
    : pathname || "/";
}

function clean(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "undefined" || text === "null") return "";
  return text;
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function methodNotAllowed(allowed) {
  return new Response(JSON.stringify({ ok: false, message: "method_not_allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json; charset=utf-8", Allow: allowed.join(", ") },
  });
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
  return error;
}
