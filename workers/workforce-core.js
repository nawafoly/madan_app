const PAYROLL_DEDUCTION_METHODS = new Set(["hourly", "daily"]);
const ATTENDANCE_PAYROLL_MODES = new Set(["required", "exempt"]);
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
const ABSENCE_PORTIONS = new Set(["full_day", "half_day"]);

/**
 * Generic MIHVARA Workforce Core handler.
 *
 * Important: this module must stay tenant-agnostic. Tenant-specific auth,
 * source-table names and branding belong in an edge adapter.
 */
export async function handleWorkforceCoreRequest({
  request,
  url,
  db,
  tenant,
  principal,
  sourceAdapter,
  routePrefix = "",
}) {
  if (!db) return json(500, { ok: false, message: "workforce_database_unavailable" });
  if (!tenant?.id || !tenant?.productKey || !tenant?.tenantKey) {
    return json(500, { ok: false, message: "workforce_tenant_context_missing" });
  }
  if (!principal?.authenticated) {
    return json(401, { ok: false, message: "workforce_authentication_required" });
  }

  await ensureTenant(db, tenant);

  const pathname = stripRoutePrefix(url?.pathname || "", routePrefix);
  const employeeMatch = pathname.match(/^\/v1\/employees\/([^/]+)$/);
  const employeeEmploymentMatch = pathname.match(/^\/v1\/employees\/([^/]+)\/employment$/);
  const employeePayrollSettingsMatch = pathname.match(/^\/v1\/employees\/([^/]+)\/payroll-settings$/);
  const employeeLeavesMatch = pathname.match(/^\/v1\/employees\/([^/]+)\/leaves$/);
  const employeeAbsencesMatch = pathname.match(/^\/v1\/employees\/([^/]+)\/absences$/);
  const employeeAssignmentsMatch = pathname.match(/^\/v1\/employees\/([^/]+)\/schedule-assignments$/);

  if (pathname === "/v1/bootstrap/sync-source") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    requireManager(principal);
    if (typeof sourceAdapter?.listEmployees !== "function") {
      return json(501, { ok: false, message: "workforce_source_sync_unavailable" });
    }
    return syncSourceEmployees({ db, tenant, principal, sourceAdapter });
  }

  if (pathname === "/v1/employees") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    requireManager(principal);
    return listEmployees(db, tenant.id, url);
  }

  if (employeeMatch) {
    const employeeId = decodeURIComponent(employeeMatch[1]);
    const employee = await requireEmployeeAccess(db, tenant.id, employeeId, principal);
    if (request.method === "GET") {
      return getEmployeeFile(db, tenant.id, employee.id);
    }
    if (request.method === "PATCH") {
      requireManager(principal);
      return updateEmployeeProfile(db, tenant.id, employee.id, request, principal);
    }
    return methodNotAllowed(["GET", "PATCH"]);
  }

  if (employeeEmploymentMatch) {
    const employeeId = decodeURIComponent(employeeEmploymentMatch[1]);
    const employee = await requireEmployeeAccess(db, tenant.id, employeeId, principal);
    if (request.method === "GET") {
      return getEmployment(db, tenant.id, employee.id);
    }
    if (request.method === "PUT") {
      requireManager(principal);
      return saveEmployment(db, tenant.id, employee.id, request, principal);
    }
    return methodNotAllowed(["GET", "PUT"]);
  }

  if (employeePayrollSettingsMatch) {
    const employeeId = decodeURIComponent(employeePayrollSettingsMatch[1]);
    const employee = await requireEmployeeAccess(db, tenant.id, employeeId, principal);
    requireManager(principal);
    if (request.method === "GET") {
      return getPayrollSettings(db, tenant.id, employee.id);
    }
    if (request.method === "PUT") {
      return savePayrollSettings(db, tenant.id, employee.id, request, principal);
    }
    return methodNotAllowed(["GET", "PUT"]);
  }

  if (employeeLeavesMatch) {
    const employeeId = decodeURIComponent(employeeLeavesMatch[1]);
    const employee = await requireEmployeeAccess(db, tenant.id, employeeId, principal);
    if (request.method === "GET") {
      return listEmployeeLeaves(db, tenant.id, employee.id);
    }
    if (request.method === "POST") {
      requireManager(principal);
      return createEmployeeLeave(db, tenant.id, employee.id, request, principal);
    }
    return methodNotAllowed(["GET", "POST"]);
  }

  if (employeeAbsencesMatch) {
    const employeeId = decodeURIComponent(employeeAbsencesMatch[1]);
    const employee = await requireEmployeeAccess(db, tenant.id, employeeId, principal);
    if (request.method === "GET") {
      return listEmployeeAbsences(db, tenant.id, employee.id);
    }
    if (request.method === "POST") {
      requireManager(principal);
      return createEmployeeAbsence(db, tenant.id, employee.id, request, principal);
    }
    return methodNotAllowed(["GET", "POST"]);
  }

  if (pathname === "/v1/schedule/templates") {
    requireManager(principal);
    if (request.method === "GET") return listScheduleTemplates(db, tenant.id);
    if (request.method === "POST") {
      return createScheduleTemplate(db, tenant.id, request, principal);
    }
    return methodNotAllowed(["GET", "POST"]);
  }

  if (employeeAssignmentsMatch) {
    const employeeId = decodeURIComponent(employeeAssignmentsMatch[1]);
    const employee = await requireEmployeeAccess(db, tenant.id, employeeId, principal);
    if (request.method === "GET") {
      return listScheduleAssignments(db, tenant.id, employee.id);
    }
    if (request.method === "POST") {
      requireManager(principal);
      return createScheduleAssignment(db, tenant.id, employee.id, request, principal);
    }
    return methodNotAllowed(["GET", "POST"]);
  }

  return json(404, { ok: false, message: "workforce_not_found" });
}

async function ensureTenant(db, tenant) {
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO workforce_tenants (
         id, product_key, tenant_key, display_name, timezone, is_active, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         product_key = excluded.product_key,
         tenant_key = excluded.tenant_key,
         display_name = excluded.display_name,
         timezone = excluded.timezone,
         is_active = 1,
         updated_at = excluded.updated_at`
    )
    .bind(
      tenant.id,
      tenant.productKey,
      tenant.tenantKey,
      tenant.displayName || tenant.tenantKey,
      tenant.timezone || "Asia/Riyadh",
      now,
      now
    )
    .run();
}

async function syncSourceEmployees({ db, tenant, principal, sourceAdapter }) {
  const sourceRows = await sourceAdapter.listEmployees();
  const rows = Array.isArray(sourceRows) ? sourceRows : [];
  const now = nowIso();
  let created = 0;
  let updated = 0;
  let linked = 0;

  for (const source of rows) {
    const sourceId = clean(source.id);
    if (!sourceId) continue;

    const sourceType = clean(sourceAdapter.sourceType) || "legacy_employee_source";
    let employee = await db
      .prepare(
        `SELECT id
           FROM workforce_employee_profiles
          WHERE tenant_id = ? AND source_type = ? AND source_id = ?
          LIMIT 1`
      )
      .bind(tenant.id, sourceType, sourceId)
      .first();

    const accountUid = clean(source.accountUid || source.uid) || null;
    const accountEmail = clean(source.accountEmail || source.email).toLowerCase() || null;
    const displayName = clean(source.displayName || source.name) || accountEmail || sourceId;
    const status = source.isActive === false ? "inactive" : "active";

    if (!employee) {
      const employeeId = id("wf_emp");
      await db
        .prepare(
          `INSERT INTO workforce_employee_profiles (
             id, tenant_id, account_uid, account_email, display_name, status,
             source_type, source_id, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          employeeId,
          tenant.id,
          accountUid,
          accountEmail,
          displayName,
          status,
          sourceType,
          sourceId,
          now,
          now
        )
        .run();
      employee = { id: employeeId };
      created += 1;
    } else {
      await db
        .prepare(
          `UPDATE workforce_employee_profiles
              SET account_uid = COALESCE(?, account_uid),
                  account_email = COALESCE(?, account_email),
                  display_name = ?,
                  status = ?,
                  updated_at = ?
            WHERE id = ? AND tenant_id = ?`
        )
        .bind(accountUid, accountEmail, displayName, status, now, employee.id, tenant.id)
        .run();
      updated += 1;
    }

    await db
      .prepare(
        `INSERT INTO workforce_employment (
           employee_id, tenant_id, employment_status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(employee_id) DO UPDATE SET
           employment_status = excluded.employment_status,
           updated_at = excluded.updated_at`
      )
      .bind(employee.id, tenant.id, status === "active" ? "active" : "inactive", now, now)
      .run();

    await db
      .prepare(
        `INSERT INTO workforce_attendance_links (
           id, tenant_id, employee_id, source_type, source_employee_id, status,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 'confirmed', ?, ?)
         ON CONFLICT(tenant_id, employee_id) DO UPDATE SET
           source_type = excluded.source_type,
           source_employee_id = excluded.source_employee_id,
           status = excluded.status,
           updated_at = excluded.updated_at`
      )
      .bind(id("wf_att_link"), tenant.id, employee.id, sourceType, sourceId, now, now)
      .run();
    linked += 1;
  }

  await audit(db, tenant.id, principal, "workforce.source_sync", "tenant", tenant.id, null, {
    sourceType: clean(sourceAdapter.sourceType) || "legacy_employee_source",
    sourceCount: rows.length,
    created,
    updated,
    linked,
  });

  return json(200, { ok: true, sourceCount: rows.length, created, updated, linked });
}

async function listEmployees(db, tenantId, url) {
  const status = clean(url?.searchParams?.get("status"));
  const query = clean(url?.searchParams?.get("q")).toLowerCase();
  const params = [tenantId];
  const where = ["p.tenant_id = ?"];

  if (status) {
    where.push("p.status = ?");
    params.push(status);
  }
  if (query) {
    where.push("(lower(p.display_name) LIKE ? OR lower(COALESCE(p.account_email, '')) LIKE ? OR lower(COALESCE(p.employee_number, '')) LIKE ?)");
    const like = `%${query}%`;
    params.push(like, like, like);
  }

  const result = await db
    .prepare(
      `SELECT p.*, e.service_start_date, e.service_end_date, e.employment_status,
              a.status AS attendance_link_status
         FROM workforce_employee_profiles p
         LEFT JOIN workforce_employment e
           ON e.employee_id = p.id AND e.tenant_id = p.tenant_id
         LEFT JOIN workforce_attendance_links a
           ON a.employee_id = p.id AND a.tenant_id = p.tenant_id
        WHERE ${where.join(" AND ")}
        ORDER BY CASE p.status WHEN 'active' THEN 0 ELSE 1 END, p.display_name ASC`
    )
    .bind(...params)
    .all();

  return json(200, {
    ok: true,
    employees: (result?.results || []).map(mapEmployeeListRow),
  });
}

async function getEmployeeFile(db, tenantId, employeeId) {
  const profile = await db
    .prepare(`SELECT * FROM workforce_employee_profiles WHERE tenant_id = ? AND id = ? LIMIT 1`)
    .bind(tenantId, employeeId)
    .first();
  if (!profile) return json(404, { ok: false, message: "workforce_employee_not_found" });

  const [employment, payrollSettings, attendanceLink] = await Promise.all([
    db.prepare(`SELECT * FROM workforce_employment WHERE tenant_id = ? AND employee_id = ? LIMIT 1`).bind(tenantId, employeeId).first(),
    db.prepare(`SELECT * FROM workforce_payroll_settings WHERE tenant_id = ? AND employee_id = ? LIMIT 1`).bind(tenantId, employeeId).first(),
    db.prepare(`SELECT * FROM workforce_attendance_links WHERE tenant_id = ? AND employee_id = ? LIMIT 1`).bind(tenantId, employeeId).first(),
  ]);

  return json(200, {
    ok: true,
    employee: mapEmployeeProfile(profile),
    employment: mapEmployment(employment),
    payrollSettings: mapPayrollSettings(payrollSettings),
    attendanceLink: mapAttendanceLink(attendanceLink),
  });
}

async function updateEmployeeProfile(db, tenantId, employeeId, request, principal) {
  const body = await readJson(request);
  const current = await db
    .prepare(`SELECT * FROM workforce_employee_profiles WHERE tenant_id = ? AND id = ? LIMIT 1`)
    .bind(tenantId, employeeId)
    .first();
  if (!current) return json(404, { ok: false, message: "workforce_employee_not_found" });

  const displayName = clean(body.displayName ?? current.display_name);
  if (!displayName) return json(400, { ok: false, message: "workforce_employee_name_required" });
  const status = clean(body.status ?? current.status);
  if (!new Set(["active", "inactive", "terminated"]).has(status)) {
    return json(400, { ok: false, message: "workforce_employee_status_invalid" });
  }

  await db
    .prepare(
      `UPDATE workforce_employee_profiles
          SET display_name = ?, employee_number = ?, job_title = ?, phone = ?, status = ?, updated_at = ?
        WHERE tenant_id = ? AND id = ?`
    )
    .bind(
      displayName,
      nullable(body.employeeNumber ?? current.employee_number),
      nullable(body.jobTitle ?? current.job_title),
      nullable(body.phone ?? current.phone),
      status,
      nowIso(),
      tenantId,
      employeeId
    )
    .run();

  const next = await db.prepare(`SELECT * FROM workforce_employee_profiles WHERE tenant_id = ? AND id = ?`).bind(tenantId, employeeId).first();
  await audit(db, tenantId, principal, "workforce.employee.update", "employee", employeeId, current, next);
  return json(200, { ok: true, employee: mapEmployeeProfile(next) });
}

async function getEmployment(db, tenantId, employeeId) {
  const row = await db
    .prepare(`SELECT * FROM workforce_employment WHERE tenant_id = ? AND employee_id = ? LIMIT 1`)
    .bind(tenantId, employeeId)
    .first();
  return json(200, { ok: true, employment: mapEmployment(row) });
}

async function saveEmployment(db, tenantId, employeeId, request, principal) {
  const body = await readJson(request);
  const existing = await db
    .prepare(`SELECT * FROM workforce_employment WHERE tenant_id = ? AND employee_id = ? LIMIT 1`)
    .bind(tenantId, employeeId)
    .first();
  const status = clean(body.employmentStatus || existing?.employment_status || "active");
  if (!new Set(["active", "inactive", "terminated"]).has(status)) {
    return json(400, { ok: false, message: "workforce_employment_status_invalid" });
  }
  const start = nullable(body.serviceStartDate ?? existing?.service_start_date);
  const end = nullable(body.serviceEndDate ?? existing?.service_end_date);
  if (start && end && end < start) {
    return json(400, { ok: false, message: "workforce_employment_date_range_invalid" });
  }

  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO workforce_employment (
         employee_id, tenant_id, service_start_date, service_end_date,
         employment_status, department, location_id, notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(employee_id) DO UPDATE SET
         service_start_date = excluded.service_start_date,
         service_end_date = excluded.service_end_date,
         employment_status = excluded.employment_status,
         department = excluded.department,
         location_id = excluded.location_id,
         notes = excluded.notes,
         updated_at = excluded.updated_at`
    )
    .bind(
      employeeId,
      tenantId,
      start,
      end,
      status,
      nullable(body.department ?? existing?.department),
      nullable(body.locationId ?? existing?.location_id),
      nullable(body.notes ?? existing?.notes),
      now,
      now
    )
    .run();

  const next = await db.prepare(`SELECT * FROM workforce_employment WHERE tenant_id = ? AND employee_id = ?`).bind(tenantId, employeeId).first();
  await audit(db, tenantId, principal, "workforce.employment.update", "employee", employeeId, existing, next);
  return json(200, { ok: true, employment: mapEmployment(next) });
}

async function getPayrollSettings(db, tenantId, employeeId) {
  const row = await db
    .prepare(`SELECT * FROM workforce_payroll_settings WHERE tenant_id = ? AND employee_id = ? LIMIT 1`)
    .bind(tenantId, employeeId)
    .first();
  return json(200, { ok: true, payrollSettings: mapPayrollSettings(row) });
}

async function savePayrollSettings(db, tenantId, employeeId, request, principal) {
  const body = await readJson(request);
  const existing = await db
    .prepare(`SELECT * FROM workforce_payroll_settings WHERE tenant_id = ? AND employee_id = ? LIMIT 1`)
    .bind(tenantId, employeeId)
    .first();

  const baseSalaryHalalas = nonNegativeInt(body.baseSalaryHalalas ?? existing?.base_salary_halalas ?? 0);
  const housingAllowanceHalalas = nonNegativeInt(body.housingAllowanceHalalas ?? existing?.housing_allowance_halalas ?? 0);
  const transportationAllowanceHalalas = nonNegativeInt(body.transportationAllowanceHalalas ?? existing?.transportation_allowance_halalas ?? 0);
  const otherAllowancesHalalas = nonNegativeInt(body.otherAllowancesHalalas ?? existing?.other_allowances_halalas ?? 0);
  const deductionMethod = clean(body.deductionMethod || existing?.deduction_method || "hourly");
  const attendancePayrollMode = clean(body.attendancePayrollMode || existing?.attendance_payroll_mode || "required");

  if (!PAYROLL_DEDUCTION_METHODS.has(deductionMethod)) {
    return json(400, { ok: false, message: "workforce_payroll_deduction_method_invalid" });
  }
  if (!ATTENDANCE_PAYROLL_MODES.has(attendancePayrollMode)) {
    return json(400, { ok: false, message: "workforce_attendance_payroll_mode_invalid" });
  }
  const exemptionReason = nullable(body.attendancePayrollExemptionReason ?? existing?.attendance_payroll_exemption_reason);
  if (attendancePayrollMode === "exempt" && !exemptionReason) {
    return json(400, { ok: false, message: "workforce_attendance_exemption_reason_required" });
  }

  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO workforce_payroll_settings (
         employee_id, tenant_id, base_salary_halalas, housing_allowance_halalas,
         transportation_allowance_halalas, other_allowances_halalas,
         work_days_per_month, daily_hours, monthly_hours, deduction_method,
         overtime_enabled, overtime_multiplier, attendance_payroll_mode,
         attendance_payroll_exemption_reason, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(employee_id) DO UPDATE SET
         base_salary_halalas = excluded.base_salary_halalas,
         housing_allowance_halalas = excluded.housing_allowance_halalas,
         transportation_allowance_halalas = excluded.transportation_allowance_halalas,
         other_allowances_halalas = excluded.other_allowances_halalas,
         work_days_per_month = excluded.work_days_per_month,
         daily_hours = excluded.daily_hours,
         monthly_hours = excluded.monthly_hours,
         deduction_method = excluded.deduction_method,
         overtime_enabled = excluded.overtime_enabled,
         overtime_multiplier = excluded.overtime_multiplier,
         attendance_payroll_mode = excluded.attendance_payroll_mode,
         attendance_payroll_exemption_reason = excluded.attendance_payroll_exemption_reason,
         updated_at = excluded.updated_at`
    )
    .bind(
      employeeId,
      tenantId,
      baseSalaryHalalas,
      housingAllowanceHalalas,
      transportationAllowanceHalalas,
      otherAllowancesHalalas,
      nullableNumber(body.workDaysPerMonth ?? existing?.work_days_per_month),
      nullableNumber(body.dailyHours ?? existing?.daily_hours),
      nullableNumber(body.monthlyHours ?? existing?.monthly_hours),
      deductionMethod,
      booleanInt(body.overtimeEnabled ?? existing?.overtime_enabled ?? 0),
      positiveNumber(body.overtimeMultiplier ?? existing?.overtime_multiplier ?? 1.5, 1.5),
      attendancePayrollMode,
      attendancePayrollMode === "exempt" ? exemptionReason : null,
      now,
      now
    )
    .run();

  const next = await db.prepare(`SELECT * FROM workforce_payroll_settings WHERE tenant_id = ? AND employee_id = ?`).bind(tenantId, employeeId).first();
  await audit(db, tenantId, principal, "workforce.payroll_settings.update", "employee", employeeId, existing, next);
  return json(200, { ok: true, payrollSettings: mapPayrollSettings(next) });
}

async function listEmployeeLeaves(db, tenantId, employeeId) {
  const result = await db
    .prepare(
      `SELECT * FROM workforce_leaves
        WHERE tenant_id = ? AND employee_id = ?
        ORDER BY start_date DESC, created_at DESC`
    )
    .bind(tenantId, employeeId)
    .all();
  return json(200, { ok: true, leaves: result?.results || [] });
}

async function createEmployeeLeave(db, tenantId, employeeId, request, principal) {
  const body = await readJson(request);
  const leaveType = clean(body.leaveType);
  const durationKind = clean(body.durationKind || "full_day");
  const startDate = clean(body.startDate);
  const endDate = clean(body.endDate || body.startDate);
  if (!LEAVE_TYPES.has(leaveType)) return json(400, { ok: false, message: "workforce_leave_type_invalid" });
  if (!LEAVE_DURATION_KINDS.has(durationKind)) return json(400, { ok: false, message: "workforce_leave_duration_invalid" });
  if (!isDateKey(startDate) || !isDateKey(endDate) || endDate < startDate) {
    return json(400, { ok: false, message: "workforce_leave_date_range_invalid" });
  }
  if (durationKind === "partial" && (!clean(body.partialStartTime) || !clean(body.partialEndTime))) {
    return json(400, { ok: false, message: "workforce_leave_partial_time_required" });
  }

  const leaveId = id("wf_leave");
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO workforce_leaves (
         id, tenant_id, employee_id, leave_type, duration_kind, start_date, end_date,
         partial_start_time, partial_end_time, requested_minutes, status, reason, note,
         requested_by_uid, approved_by_uid, approved_by_email, approved_at,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      leaveId,
      tenantId,
      employeeId,
      leaveType,
      durationKind,
      startDate,
      endDate,
      nullable(body.partialStartTime),
      nullable(body.partialEndTime),
      nullableInteger(body.requestedMinutes),
      nullable(body.reason),
      nullable(body.note),
      principal.uid || null,
      principal.uid || null,
      principal.email || null,
      now,
      now,
      now
    )
    .run();
  const row = await db.prepare(`SELECT * FROM workforce_leaves WHERE tenant_id = ? AND id = ?`).bind(tenantId, leaveId).first();
  await audit(db, tenantId, principal, "workforce.leave.create", "leave", leaveId, null, row);
  return json(201, { ok: true, leave: row });
}

async function listEmployeeAbsences(db, tenantId, employeeId) {
  const result = await db
    .prepare(
      `SELECT * FROM workforce_absences
        WHERE tenant_id = ? AND employee_id = ?
        ORDER BY absence_date DESC, created_at DESC`
    )
    .bind(tenantId, employeeId)
    .all();
  return json(200, { ok: true, absences: result?.results || [] });
}

async function createEmployeeAbsence(db, tenantId, employeeId, request, principal) {
  const body = await readJson(request);
  const absenceDate = clean(body.absenceDate);
  const dayPortion = clean(body.dayPortion || "full_day");
  const payrollTreatment = clean(body.payrollTreatment || "attendance_policy");
  if (!isDateKey(absenceDate)) return json(400, { ok: false, message: "workforce_absence_date_invalid" });
  if (!ABSENCE_PORTIONS.has(dayPortion)) return json(400, { ok: false, message: "workforce_absence_portion_invalid" });
  if (!new Set(["attendance_policy", "no_deduction", "manual_review"]).has(payrollTreatment)) {
    return json(400, { ok: false, message: "workforce_absence_payroll_treatment_invalid" });
  }

  const absenceId = id("wf_absence");
  const now = nowIso();
  try {
    await db
      .prepare(
        `INSERT INTO workforce_absences (
           id, tenant_id, employee_id, absence_date, day_portion, status,
           reason, payroll_treatment, created_by_uid, created_by_email,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        absenceId,
        tenantId,
        employeeId,
        absenceDate,
        dayPortion,
        nullable(body.reason),
        payrollTreatment,
        principal.uid || null,
        principal.email || null,
        now,
        now
      )
      .run();
  } catch (error) {
    if (String(error?.message || error).toLowerCase().includes("unique")) {
      return json(409, { ok: false, message: "workforce_absence_already_exists" });
    }
    throw error;
  }
  const row = await db.prepare(`SELECT * FROM workforce_absences WHERE tenant_id = ? AND id = ?`).bind(tenantId, absenceId).first();
  await audit(db, tenantId, principal, "workforce.absence.create", "absence", absenceId, null, row);
  return json(201, { ok: true, absence: row });
}

async function listScheduleTemplates(db, tenantId) {
  const result = await db
    .prepare(`SELECT * FROM workforce_schedule_templates WHERE tenant_id = ? ORDER BY is_active DESC, name ASC`)
    .bind(tenantId)
    .all();
  return json(200, { ok: true, templates: (result?.results || []).map(mapScheduleTemplate) });
}

async function createScheduleTemplate(db, tenantId, request, principal) {
  const body = await readJson(request);
  const name = clean(body.name);
  const startTime = clean(body.startTime);
  const endTime = clean(body.endTime);
  const workingDays = normalizeWorkingDays(body.workingDays);
  if (!name) return json(400, { ok: false, message: "workforce_schedule_name_required" });
  if (!isTime(startTime) || !isTime(endTime)) return json(400, { ok: false, message: "workforce_schedule_time_invalid" });
  if (!workingDays.length) return json(400, { ok: false, message: "workforce_schedule_working_days_required" });

  const templateId = id("wf_shift");
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO workforce_schedule_templates (
         id, tenant_id, name, start_time, end_time, grace_minutes,
         early_leave_tolerance_minutes, working_days_json, is_active,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .bind(
      templateId,
      tenantId,
      name,
      startTime,
      endTime,
      nonNegativeInt(body.graceMinutes ?? 0),
      nonNegativeInt(body.earlyLeaveToleranceMinutes ?? 0),
      JSON.stringify(workingDays),
      now,
      now
    )
    .run();
  const row = await db.prepare(`SELECT * FROM workforce_schedule_templates WHERE tenant_id = ? AND id = ?`).bind(tenantId, templateId).first();
  await audit(db, tenantId, principal, "workforce.schedule_template.create", "schedule_template", templateId, null, row);
  return json(201, { ok: true, template: mapScheduleTemplate(row) });
}

async function listScheduleAssignments(db, tenantId, employeeId) {
  const result = await db
    .prepare(
      `SELECT a.*, t.name AS template_name, t.start_time, t.end_time, t.working_days_json
         FROM workforce_schedule_assignments a
         JOIN workforce_schedule_templates t
           ON t.id = a.template_id AND t.tenant_id = a.tenant_id
        WHERE a.tenant_id = ? AND a.employee_id = ?
        ORDER BY a.effective_from DESC, a.created_at DESC`
    )
    .bind(tenantId, employeeId)
    .all();
  return json(200, { ok: true, assignments: result?.results || [] });
}

async function createScheduleAssignment(db, tenantId, employeeId, request, principal) {
  const body = await readJson(request);
  const templateId = clean(body.templateId);
  const effectiveFrom = clean(body.effectiveFrom);
  const effectiveTo = nullable(body.effectiveTo);
  if (!templateId) return json(400, { ok: false, message: "workforce_schedule_template_required" });
  if (!isDateKey(effectiveFrom) || (effectiveTo && (!isDateKey(effectiveTo) || effectiveTo < effectiveFrom))) {
    return json(400, { ok: false, message: "workforce_schedule_assignment_dates_invalid" });
  }
  const template = await db
    .prepare(`SELECT id FROM workforce_schedule_templates WHERE tenant_id = ? AND id = ? AND is_active = 1 LIMIT 1`)
    .bind(tenantId, templateId)
    .first();
  if (!template) return json(404, { ok: false, message: "workforce_schedule_template_not_found" });

  const assignmentId = id("wf_shift_assignment");
  await db
    .prepare(
      `INSERT INTO workforce_schedule_assignments (
         id, tenant_id, employee_id, template_id, effective_from, effective_to,
         created_by_uid, created_by_email, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      assignmentId,
      tenantId,
      employeeId,
      templateId,
      effectiveFrom,
      effectiveTo,
      principal.uid || null,
      principal.email || null,
      nowIso()
    )
    .run();
  const row = await db.prepare(`SELECT * FROM workforce_schedule_assignments WHERE tenant_id = ? AND id = ?`).bind(tenantId, assignmentId).first();
  await audit(db, tenantId, principal, "workforce.schedule_assignment.create", "schedule_assignment", assignmentId, null, row);
  return json(201, { ok: true, assignment: row });
}

async function requireEmployeeAccess(db, tenantId, employeeId, principal) {
  const employee = await db
    .prepare(`SELECT id, account_uid, account_email FROM workforce_employee_profiles WHERE tenant_id = ? AND id = ? LIMIT 1`)
    .bind(tenantId, employeeId)
    .first();
  if (!employee) throw httpError(404, "workforce_employee_not_found");
  if (principal.canManage) return employee;

  const sameUid = clean(principal.uid) && clean(employee.account_uid) === clean(principal.uid);
  const sameEmail = clean(principal.email).toLowerCase() && clean(employee.account_email).toLowerCase() === clean(principal.email).toLowerCase();
  if (!sameUid && !sameEmail) throw httpError(403, "workforce_employee_access_forbidden");
  return employee;
}

function requireManager(principal) {
  if (!principal?.canManage) throw httpError(403, "workforce_management_forbidden");
}

async function audit(db, tenantId, principal, action, entityType, entityId, before, after, metadata) {
  await db
    .prepare(
      `INSERT INTO workforce_audit_events (
         id, tenant_id, actor_uid, actor_email, action, entity_type, entity_id,
         before_json, after_json, metadata_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
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
    )
    .run();
}

function mapEmployeeListRow(row) {
  return {
    id: clean(row.id),
    accountUid: nullable(row.account_uid),
    accountEmail: nullable(row.account_email),
    employeeNumber: nullable(row.employee_number),
    displayName: clean(row.display_name),
    jobTitle: nullable(row.job_title),
    phone: nullable(row.phone),
    status: clean(row.status),
    serviceStartDate: nullable(row.service_start_date),
    serviceEndDate: nullable(row.service_end_date),
    employmentStatus: nullable(row.employment_status),
    attendanceLinkStatus: nullable(row.attendance_link_status),
  };
}

function mapEmployeeProfile(row) {
  if (!row) return null;
  return {
    id: clean(row.id),
    accountUid: nullable(row.account_uid),
    accountEmail: nullable(row.account_email),
    employeeNumber: nullable(row.employee_number),
    displayName: clean(row.display_name),
    jobTitle: nullable(row.job_title),
    phone: nullable(row.phone),
    status: clean(row.status),
    createdAt: nullable(row.created_at),
    updatedAt: nullable(row.updated_at),
  };
}

function mapEmployment(row) {
  if (!row) return null;
  return {
    employeeId: clean(row.employee_id),
    serviceStartDate: nullable(row.service_start_date),
    serviceEndDate: nullable(row.service_end_date),
    employmentStatus: clean(row.employment_status),
    department: nullable(row.department),
    locationId: nullable(row.location_id),
    notes: nullable(row.notes),
    updatedAt: nullable(row.updated_at),
  };
}

function mapPayrollSettings(row) {
  if (!row) return null;
  return {
    employeeId: clean(row.employee_id),
    baseSalaryHalalas: Number(row.base_salary_halalas || 0),
    housingAllowanceHalalas: Number(row.housing_allowance_halalas || 0),
    transportationAllowanceHalalas: Number(row.transportation_allowance_halalas || 0),
    otherAllowancesHalalas: Number(row.other_allowances_halalas || 0),
    workDaysPerMonth: row.work_days_per_month == null ? null : Number(row.work_days_per_month),
    dailyHours: row.daily_hours == null ? null : Number(row.daily_hours),
    monthlyHours: row.monthly_hours == null ? null : Number(row.monthly_hours),
    deductionMethod: clean(row.deduction_method),
    overtimeEnabled: Number(row.overtime_enabled) === 1,
    overtimeMultiplier: Number(row.overtime_multiplier || 1.5),
    attendancePayrollMode: clean(row.attendance_payroll_mode),
    attendancePayrollExemptionReason: nullable(row.attendance_payroll_exemption_reason),
    updatedAt: nullable(row.updated_at),
  };
}

function mapAttendanceLink(row) {
  if (!row) return null;
  return {
    status: clean(row.status),
    sourceType: clean(row.source_type),
    sourceEmployeeId: clean(row.source_employee_id),
    exemptionReason: nullable(row.exemption_reason),
  };
}

function mapScheduleTemplate(row) {
  if (!row) return null;
  let workingDays = [];
  try {
    const parsed = JSON.parse(row.working_days_json || "[]");
    if (Array.isArray(parsed)) workingDays = parsed;
  } catch {}
  return {
    id: clean(row.id),
    name: clean(row.name),
    startTime: clean(row.start_time),
    endTime: clean(row.end_time),
    graceMinutes: Number(row.grace_minutes || 0),
    earlyLeaveToleranceMinutes: Number(row.early_leave_tolerance_minutes || 0),
    workingDays,
    isActive: Number(row.is_active) === 1,
  };
}

function stripRoutePrefix(pathname, prefix) {
  const normalizedPrefix = clean(prefix).replace(/\/$/, "");
  if (!normalizedPrefix) return pathname || "/";
  return pathname.startsWith(normalizedPrefix)
    ? pathname.slice(normalizedPrefix.length) || "/"
    : pathname || "/";
}

async function readJson(request) {
  try {
    return (await request.json()) || {};
  } catch {
    throw httpError(400, "workforce_invalid_json");
  }
}

function normalizeWorkingDays(value) {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
}

function nonNegativeInt(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
}

function nullableInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function booleanInt(value) {
  return value === true || value === 1 || value === "1" ? 1 : 0;
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
}

function isTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(clean(value));
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function nullable(value) {
  const text = clean(value);
  return text || null;
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
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Allow: allowed.join(", "),
    },
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

export async function workforceSafeHandler(callback) {
  try {
    return await callback();
  } catch (error) {
    const status = Number(error?.status || 500);
    const message = clean(error?.message) || "workforce_internal_error";
    if (status >= 500) console.error("[workforce-core] request failed", error);
    return json(status, { ok: false, message });
  }
}
