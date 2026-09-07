const POLICY_VERSION = "sa-labor-2025-amended-v1";
const MAX_BALANCE_DAYS = 3650;
const EPSILON = 0.0001;

export async function handleWorkforceAnnualLeaveRequest({
  request,
  url,
  db,
  tenant,
  principal,
  routePrefix = "",
}) {
  const pathname = stripRoutePrefix(url?.pathname || "", routePrefix);
  const stateMatch = pathname.match(/^\/v1\/employees\/([^/]+)\/annual-leave$/);
  const openingMatch = pathname.match(/^\/v1\/employees\/([^/]+)\/annual-leave\/opening-balance$/);
  const adjustmentMatch = pathname.match(/^\/v1\/employees\/([^/]+)\/annual-leave\/adjustments$/);
  if (!stateMatch && !openingMatch && !adjustmentMatch) return null;

  const rawEmployeeId = stateMatch?.[1] || openingMatch?.[1] || adjustmentMatch?.[1] || "";
  const employeeId = decodeURIComponent(rawEmployeeId);
  await requireEmployeeAccess(db, tenant.id, employeeId, principal);

  if (stateMatch) {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    const asOfDate = clean(url?.searchParams?.get("asOfDate")) || todayRiyadh();
    return json(200, { ok: true, annualLeave: await getAnnualLeaveState(db, tenant.id, employeeId, asOfDate) });
  }

  requireManager(principal);

  if (openingMatch) {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const body = await readJson(request);
    const result = await setOpeningBalance(db, tenant.id, employeeId, body, principal);
    return json(result.idempotent ? 200 : 201, { ok: true, ...result });
  }

  if (adjustmentMatch) {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const body = await readJson(request);
    const result = await addAdjustment(db, tenant.id, employeeId, body, principal);
    return json(result.idempotent ? 200 : 201, { ok: true, ...result });
  }

  return null;
}

export async function getAnnualLeaveState(db, tenantId, employeeId, asOfDateValue = todayRiyadh()) {
  const asOfDate = validDate(asOfDateValue, "as_of_date");
  const employment = await db
    .prepare(`SELECT service_start_date, annual_leave_contract_days, annual_leave_accrual_mode
                FROM workforce_employment
               WHERE tenant_id = ? AND employee_id = ?
               LIMIT 1`)
    .bind(tenantId, employeeId)
    .first();

  const startDateRaw = clean(employment?.service_start_date);
  if (!startDateRaw) {
    return {
      employeeId,
      asOfDate,
      reviewRequired: true,
      reviewReason: "service_start_date_required",
      startDate: null,
      availableDays: null,
      entries: [],
      policyVersion: POLICY_VERSION,
    };
  }

  let startDate;
  try {
    startDate = validDate(startDateRaw, "service_start_date");
  } catch {
    return {
      employeeId,
      asOfDate,
      reviewRequired: true,
      reviewReason: "service_start_date_invalid",
      startDate: startDateRaw,
      availableDays: null,
      entries: [],
      policyVersion: POLICY_VERSION,
    };
  }

  if (asOfDate < startDate) {
    return {
      employeeId,
      asOfDate,
      reviewRequired: true,
      reviewReason: "as_of_before_service_start",
      startDate,
      availableDays: null,
      entries: [],
      policyVersion: POLICY_VERSION,
    };
  }

  const rowsResult = await db
    .prepare(`SELECT *
                FROM workforce_leave_ledger
               WHERE tenant_id = ?
                 AND employee_id = ?
                 AND leave_type = 'annual'
                 AND deleted_at IS NULL
                 AND entry_code IS NOT NULL
                 AND effective_date <= ?
               ORDER BY effective_date ASC, created_at ASC, id ASC`)
    .bind(tenantId, employeeId, asOfDate)
    .all();
  const rows = rowsResult?.results || [];
  const opening = rows
    .filter(row => row.entry_code === "OPENING_BALANCE")
    .sort((a, b) => clean(b.effective_date).localeCompare(clean(a.effective_date)) || clean(b.created_at).localeCompare(clean(a.created_at)))[0] || null;
  const postOpeningRows = rows.filter(row => {
    if (row.entry_code === "OPENING_BALANCE") return false;
    if (!opening) return true;
    return clean(row.created_at) >= clean(opening.created_at);
  });

  const contractAnnualDays = nonNegativeNumber(employment?.annual_leave_contract_days);
  const currentAccrual = calculateAnnualLeaveAccrual({ startDate, asOfDate, contractAnnualDays });
  const openingDays = opening ? ledgerDeltaDays(opening) : 0;
  const postOpeningNetDays = roundDays(postOpeningRows.reduce((sum, row) => sum + ledgerDeltaDays(row), 0));
  const liveAccrual = calculateAnnualLeaveAccrualRange({
    startDate,
    asOfDate,
    contractAnnualDays,
    fromExclusiveDate: opening?.effective_date || null,
  });
  const availableDays = roundDays((opening ? openingDays : 0) + liveAccrual.accruedDays + postOpeningNetDays);
  const usedDays = roundDays(postOpeningRows
    .filter(row => row.entry_code === "LEAVE_USED" || row.entry_code === "MANUAL_DEBIT")
    .reduce((sum, row) => sum + Math.abs(Math.min(0, ledgerDeltaDays(row))), 0));
  const creditedDays = roundDays(postOpeningRows
    .filter(row => row.entry_code === "MANUAL_CREDIT" || row.entry_code === "LEAVE_REVERSAL" || row.entry_code === "RECALL")
    .reduce((sum, row) => sum + Math.max(0, ledgerDeltaDays(row)), 0));

  await upsertProjection(db, tenantId, employeeId, asOfDate, availableDays, "ready", null, {
    policyVersion: POLICY_VERSION,
    serviceYearStart: currentAccrual.serviceYearStart,
    serviceYearEnd: currentAccrual.serviceYearEnd,
    annualEntitlementDays: currentAccrual.annualEntitlementDays,
  });

  return {
    employeeId,
    asOfDate,
    startDate,
    accrualMode: clean(employment?.annual_leave_accrual_mode) || "service_anniversary",
    policyVersion: POLICY_VERSION,
    reviewRequired: false,
    reviewReason: null,
    openingBalance: opening ? mapLedgerEntry(opening) : null,
    openingBalanceDays: roundDays(openingDays),
    annualEntitlementDays: currentAccrual.annualEntitlementDays,
    statutoryEntitlementDays: currentAccrual.statutoryEntitlementDays,
    contractualEntitlementDays: currentAccrual.contractualEntitlementDays,
    earnedCurrentServiceYearDays: currentAccrual.accruedDays,
    accruedSinceAnchorDays: liveAccrual.accruedDays,
    serviceYearStart: currentAccrual.serviceYearStart,
    serviceYearEnd: currentAccrual.serviceYearEnd,
    usedDays,
    creditedDays,
    postOpeningNetDays,
    availableDays,
    entries: rows.map(mapLedgerEntry),
  };
}

async function setOpeningBalance(db, tenantId, employeeId, body, principal) {
  const days = halfDayValue(body.days ?? body.openingBalanceDays, "opening_balance_days", true);
  const effectiveDate = validDate(body.effectiveDate || body.effective_date || todayRiyadh(), "effective_date");
  const reason = requiredReason(body.reason || body.note);
  const employment = await requireEmployment(db, tenantId, employeeId);
  const startDate = validDate(employment.service_start_date, "service_start_date");
  if (effectiveDate < startDate) throw httpError(400, "workforce_annual_leave_opening_before_service_start");
  if (effectiveDate > todayRiyadh()) throw httpError(400, "workforce_annual_leave_opening_in_future");

  const operationId = clean(body.operationId || body.operation_id) || id("wf_annual_opening_op");
  const priorOperation = await db
    .prepare(`SELECT * FROM workforce_leave_ledger WHERE tenant_id = ? AND operation_id = ? LIMIT 1`)
    .bind(tenantId, operationId)
    .first();
  if (priorOperation) {
    if (clean(priorOperation.employee_id) !== employeeId) throw httpError(409, "workforce_annual_leave_operation_employee_mismatch");
    return {
      idempotent: true,
      entry: mapLedgerEntry(priorOperation),
      annualLeave: await getAnnualLeaveState(db, tenantId, employeeId, todayRiyadh()),
    };
  }

  const existingOpening = await db
    .prepare(`SELECT id FROM workforce_leave_ledger
               WHERE tenant_id = ? AND employee_id = ? AND leave_type = 'annual'
                 AND entry_code = 'OPENING_BALANCE' AND deleted_at IS NULL
               LIMIT 1`)
    .bind(tenantId, employeeId)
    .first();
  if (existingOpening) throw httpError(409, "workforce_annual_leave_opening_already_exists");

  const entryId = id("wf_annual_opening");
  const now = nowIso();
  await db
    .prepare(`INSERT INTO workforce_leave_ledger (
      id, tenant_id, employee_id, leave_type, action_type,
      delta_minutes, balance_before_minutes, balance_after_minutes,
      effective_date, reason, source_type, source_id, operation_id,
      created_by_uid, created_by_email, created_at,
      delta_days, balance_before_days, balance_after_days,
      entry_code, metadata_json, deleted_at
    ) VALUES (?, ?, ?, 'annual', 'opening', ?, ?, ?, ?, ?, 'opening_balance', ?, ?, ?, ?, ?, ?, ?, ?, 'OPENING_BALANCE', ?, NULL)`)
    .bind(
      entryId, tenantId, employeeId,
      dayUnits(days), 0, dayUnits(days), effectiveDate, reason,
      entryId, operationId, principal?.uid || null, principal?.email || null, now,
      days, 0, days,
      JSON.stringify({ policyVersion: POLICY_VERSION, serviceStartDate: startDate })
    )
    .run();

  const annualLeave = await getAnnualLeaveState(db, tenantId, employeeId, todayRiyadh());
  return { idempotent: false, entry: annualLeave.openingBalance, annualLeave };
}

async function addAdjustment(db, tenantId, employeeId, body, principal) {
  const direction = clean(body.direction).toLowerCase();
  if (!new Set(["credit", "debit"]).has(direction)) throw httpError(400, "workforce_annual_leave_adjustment_direction_invalid");
  const absoluteDays = halfDayValue(body.days, "adjustment_days", false);
  const deltaDays = direction === "debit" ? -absoluteDays : absoluteDays;
  const effectiveDate = validDate(body.effectiveDate || body.effective_date || todayRiyadh(), "effective_date");
  const reason = requiredReason(body.reason || body.note);
  const employment = await requireEmployment(db, tenantId, employeeId);
  const startDate = validDate(employment.service_start_date, "service_start_date");
  if (effectiveDate < startDate) throw httpError(400, "workforce_annual_leave_adjustment_before_service_start");
  if (effectiveDate > todayRiyadh()) throw httpError(400, "workforce_annual_leave_adjustment_in_future");

  const operationId = clean(body.operationId || body.operation_id) || id("wf_annual_adjustment_op");
  const priorOperation = await db
    .prepare(`SELECT * FROM workforce_leave_ledger WHERE tenant_id = ? AND operation_id = ? LIMIT 1`)
    .bind(tenantId, operationId)
    .first();
  if (priorOperation) {
    if (clean(priorOperation.employee_id) !== employeeId) throw httpError(409, "workforce_annual_leave_operation_employee_mismatch");
    return {
      idempotent: true,
      entry: mapLedgerEntry(priorOperation),
      annualLeave: await getAnnualLeaveState(db, tenantId, employeeId, todayRiyadh()),
    };
  }

  const beforeState = await getAnnualLeaveState(db, tenantId, employeeId, effectiveDate);
  if (beforeState.reviewRequired) throw httpError(409, `workforce_annual_leave_${beforeState.reviewReason}`);
  const before = Number(beforeState.availableDays || 0);
  const after = roundDays(before + deltaDays);
  const entryCode = direction === "credit" ? "MANUAL_CREDIT" : "MANUAL_DEBIT";
  const actionType = direction === "credit" ? "credit" : "debit";
  const entryId = id("wf_annual_adjustment");
  const now = nowIso();

  await db
    .prepare(`INSERT INTO workforce_leave_ledger (
      id, tenant_id, employee_id, leave_type, action_type,
      delta_minutes, balance_before_minutes, balance_after_minutes,
      effective_date, reason, source_type, source_id, operation_id,
      created_by_uid, created_by_email, created_at,
      delta_days, balance_before_days, balance_after_days,
      entry_code, metadata_json, deleted_at
    ) VALUES (?, ?, ?, 'annual', ?, ?, ?, ?, ?, ?, 'manual_adjustment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`)
    .bind(
      entryId, tenantId, employeeId, actionType,
      dayUnits(deltaDays), dayUnits(before), dayUnits(after), effectiveDate, reason,
      entryId, operationId, principal?.uid || null, principal?.email || null, now,
      deltaDays, before, after, entryCode,
      JSON.stringify({ policyVersion: POLICY_VERSION, direction })
    )
    .run();

  const annualLeave = await getAnnualLeaveState(db, tenantId, employeeId, todayRiyadh());
  const entry = annualLeave.entries.find(item => item.id === entryId) || null;
  return { idempotent: false, entry, annualLeave };
}

async function upsertProjection(db, tenantId, employeeId, asOfDate, balanceDays, reviewStatus, reviewReason, policySnapshot) {
  const rowId = `wf_leave_balance_annual_${employeeId}`;
  await db
    .prepare(`INSERT INTO workforce_leave_balances (
      id, tenant_id, employee_id, leave_type, balance_minutes, as_of_date,
      policy_snapshot_json, version, updated_at, balance_days, review_status, review_reason
    ) VALUES (?, ?, ?, 'annual', ?, ?, ?, 1, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, employee_id, leave_type) DO UPDATE SET
      balance_minutes = excluded.balance_minutes,
      as_of_date = excluded.as_of_date,
      policy_snapshot_json = excluded.policy_snapshot_json,
      version = workforce_leave_balances.version + 1,
      updated_at = excluded.updated_at,
      balance_days = excluded.balance_days,
      review_status = excluded.review_status,
      review_reason = excluded.review_reason`)
    .bind(
      rowId, tenantId, employeeId, dayUnits(balanceDays), asOfDate,
      JSON.stringify(policySnapshot || {}), nowIso(), balanceDays, reviewStatus, reviewReason
    )
    .run();
}

async function requireEmployment(db, tenantId, employeeId) {
  const row = await db
    .prepare(`SELECT * FROM workforce_employment WHERE tenant_id = ? AND employee_id = ? LIMIT 1`)
    .bind(tenantId, employeeId)
    .first();
  if (!row) throw httpError(404, "workforce_employment_not_found");
  if (!clean(row.service_start_date)) throw httpError(409, "workforce_annual_leave_service_start_date_required");
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
  const sameEmail = clean(principal?.email).toLowerCase() && clean(employee.account_email).toLowerCase() === clean(principal?.email).toLowerCase();
  if (!sameUid && !sameEmail) throw httpError(403, "workforce_employee_access_forbidden");
  return employee;
}

function requireManager(principal) {
  if (!principal?.canManage) throw httpError(403, "workforce_management_forbidden");
}

function mapLedgerEntry(row) {
  return {
    id: clean(row.id),
    employeeId: clean(row.employee_id),
    actionType: clean(row.action_type),
    entryCode: clean(row.entry_code) || null,
    deltaDays: roundDays(ledgerDeltaDays(row)),
    balanceBeforeDays: nullableNumber(row.balance_before_days),
    balanceAfterDays: nullableNumber(row.balance_after_days),
    effectiveDate: clean(row.effective_date),
    reason: clean(row.reason),
    sourceType: clean(row.source_type) || null,
    sourceId: clean(row.source_id) || null,
    operationId: clean(row.operation_id) || null,
    createdByEmail: clean(row.created_by_email) || null,
    createdAt: clean(row.created_at),
    metadata: parseJson(row.metadata_json),
  };
}

function ledgerDeltaDays(row) {
  if (row?.delta_days !== null && row?.delta_days !== undefined) return Number(row.delta_days) || 0;
  return (Number(row?.delta_minutes) || 0) / 1440;
}

export function calculateAnnualLeaveAccrual(input = {}) {
  const startDate = validDate(input.startDate, "start_date");
  const asOfDate = validDate(input.asOfDate, "as_of_date");
  const serviceYear = annualLeaveServiceYear(startDate, asOfDate);
  const contractDays = nonNegativeNumber(input.contractAnnualDays);
  const statutoryEntitlementDays = serviceYear.completedServiceYearsAtStart >= 5 ? 30 : 21;
  const annualEntitlementDays = Math.max(statutoryEntitlementDays, contractDays);
  const periodDays = daysBetween(serviceYear.serviceYearStart, serviceYear.serviceYearEnd);
  const asOfExclusive = addDays(asOfDate, 1);
  const accrualEndExclusive = asOfExclusive < serviceYear.serviceYearEnd ? asOfExclusive : serviceYear.serviceYearEnd;
  const elapsedDays = Math.max(0, Math.min(periodDays, daysBetween(serviceYear.serviceYearStart, accrualEndExclusive)));
  const accruedDays = periodDays > 0 ? roundDays(annualEntitlementDays * elapsedDays / periodDays) : 0;
  return {
    policyVersion: POLICY_VERSION,
    startDate,
    asOfDate,
    serviceYearStart: serviceYear.serviceYearStart,
    serviceYearEnd: serviceYear.serviceYearEnd,
    completedServiceYearsAtStart: serviceYear.completedServiceYearsAtStart,
    statutoryEntitlementDays,
    contractualEntitlementDays: contractDays || null,
    annualEntitlementDays,
    periodDays,
    elapsedDays,
    accruedDays,
  };
}

export function calculateAnnualLeaveAccrualRange(input = {}) {
  const startDate = validDate(input.startDate, "start_date");
  const asOfDate = validDate(input.asOfDate, "as_of_date");
  const contractAnnualDays = nonNegativeNumber(input.contractAnnualDays);
  let cursor = startDate;
  const fromExclusiveDate = clean(input.fromExclusiveDate) ? validDate(input.fromExclusiveDate, "from_exclusive_date") : null;
  if (fromExclusiveDate && fromExclusiveDate >= startDate) cursor = addDays(fromExclusiveDate, 1);
  if (cursor > asOfDate) return { policyVersion: POLICY_VERSION, accruedDays: 0, segments: [] };

  const asOfExclusive = addDays(asOfDate, 1);
  const segments = [];
  let total = 0;
  let guard = 0;
  while (cursor < asOfExclusive) {
    if (++guard > 200) throw httpError(400, "workforce_annual_leave_accrual_range_too_large");
    const serviceYear = annualLeaveServiceYear(startDate, cursor);
    const statutoryEntitlementDays = serviceYear.completedServiceYearsAtStart >= 5 ? 30 : 21;
    const annualEntitlementDays = Math.max(statutoryEntitlementDays, contractAnnualDays);
    const periodDays = daysBetween(serviceYear.serviceYearStart, serviceYear.serviceYearEnd);
    const segmentEndExclusive = serviceYear.serviceYearEnd < asOfExclusive ? serviceYear.serviceYearEnd : asOfExclusive;
    const elapsedDays = Math.max(0, daysBetween(cursor, segmentEndExclusive));
    const accruedDays = periodDays > 0 ? annualEntitlementDays * elapsedDays / periodDays : 0;
    total += accruedDays;
    segments.push({
      serviceYearStart: serviceYear.serviceYearStart,
      serviceYearEnd: serviceYear.serviceYearEnd,
      fromDate: cursor,
      toDateExclusive: segmentEndExclusive,
      completedServiceYearsAtStart: serviceYear.completedServiceYearsAtStart,
      statutoryEntitlementDays,
      contractualEntitlementDays: contractAnnualDays || null,
      annualEntitlementDays,
      elapsedDays,
      accruedDays: roundDays(accruedDays),
    });
    cursor = segmentEndExclusive;
  }
  return { policyVersion: POLICY_VERSION, accruedDays: roundDays(total), segments };
}

export function annualLeaveServiceYear(startDateValue, asOfDateValue) {
  const start = dateParts(startDateValue, "start_date");
  const asOf = dateParts(asOfDateValue, "as_of_date");
  if (asOf.normalized < start.normalized) throw httpError(400, "workforce_annual_leave_as_of_before_service_start");
  let startYear = asOf.year;
  let serviceYearStart = anniversaryForYear(start.normalized, startYear);
  if (serviceYearStart > asOf.normalized) {
    startYear -= 1;
    serviceYearStart = anniversaryForYear(start.normalized, startYear);
  }
  if (serviceYearStart < start.normalized) serviceYearStart = start.normalized;
  return {
    serviceYearStart,
    serviceYearEnd: anniversaryForYear(start.normalized, startYear + 1),
    completedServiceYearsAtStart: completedServiceYears(start.normalized, serviceYearStart),
  };
}

function completedServiceYears(startDateValue, asOfDateValue) {
  const start = dateParts(startDateValue, "start_date");
  const asOf = dateParts(asOfDateValue, "as_of_date");
  if (asOf.normalized < start.normalized) return 0;
  let years = asOf.year - start.year;
  if (asOf.normalized < anniversaryForYear(start.normalized, asOf.year)) years -= 1;
  return Math.max(0, years);
}

function anniversaryForYear(startDate, year) {
  const start = dateParts(startDate, "start_date");
  if (start.month === 2 && start.day === 29 && !isLeapYear(year)) return formatDate(year, 2, 28);
  return formatDate(year, start.month, start.day);
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysBetween(fromValue, toValue) {
  const from = dateParts(fromValue, "from_date");
  const to = dateParts(toValue, "to_date");
  return Math.round((Date.UTC(to.year, to.month - 1, to.day, 12) - Date.UTC(from.year, from.month - 1, from.day, 12)) / 86400000);
}

function addDays(value, amount) {
  const parts = dateParts(value, "date");
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount, 12));
  return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function formatDate(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateParts(value, field) {
  const normalized = validDate(value, field);
  const [year, month, day] = normalized.split("-").map(Number);
  return { normalized, year, month, day };
}

function validDate(value, field) {
  const text = clean(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw httpError(400, `workforce_annual_leave_${field}_invalid`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw httpError(400, `workforce_annual_leave_${field}_invalid`);
  }
  return text;
}

function halfDayValue(value, field, allowZero) {
  const days = Number(value);
  const min = allowZero ? 0 : 0.5;
  if (!Number.isFinite(days) || days < min || days > MAX_BALANCE_DAYS || Math.round(days * 2) !== days * 2) {
    throw httpError(400, `workforce_annual_leave_${field}_invalid`);
  }
  return Math.round(days * 2) / 2;
}

function requiredReason(value) {
  const reason = clean(value);
  if (!reason || reason.length > 1500) throw httpError(400, "workforce_annual_leave_reason_required");
  return reason;
}

function dayUnits(days) {
  return Math.round((Number(days) || 0) * 1440);
}

function nonNegativeNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundDays(value) {
  return Math.round((Number(value) || 0) * 10000) / 10000;
}

function todayRiyadh() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function nowIso() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function clean(value) {
  return String(value ?? "").trim();
}

function parseJson(value) {
  try { return JSON.parse(clean(value) || "{}"); }
  catch { return {}; }
}

async function readJson(request) {
  try { return await request.json(); }
  catch { throw httpError(400, "workforce_json_invalid"); }
}

function stripRoutePrefix(pathname, routePrefix) {
  const prefix = clean(routePrefix).replace(/\/$/, "");
  if (!prefix) return pathname;
  return pathname.startsWith(prefix) ? pathname.slice(prefix.length) || "/" : pathname;
}

function methodNotAllowed(allowed) {
  return new Response(JSON.stringify({ ok: false, message: "method_not_allowed" }), {
    status: 405,
    headers: { "content-type": "application/json; charset=utf-8", allow: allowed.join(", ") },
  });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
