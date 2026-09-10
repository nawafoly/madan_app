import { resolveWorkforceScheduleDay, resolveWorkforceScheduleRange } from "./workforce-schedule-control.js";
import { resolveWorkforceDayRange, resolveWorkforceEmployeeBySource, assertWorkforceDayMutationAllowed, assertPayrollSourceMutationAllowed, buildPayrollStaleStatements } from "./workforce-day-state.js";

const DEFAULT_SHIFT_ID = "habat_shift_default";
const WORKFORCE_TENANT_ID = "restaurant_tenant_habat_alwaraq";
const OVERRIDE_TYPES = new Set(["emergency_leave", "absence"]);
const DAY_PORTIONS = new Set(["full_day", "half_day"]);

export async function handleHabatAttendanceV3Request({ request, url, db, resolveRequesterContext }) {
  if (!db) return json(500, { ok: false, message: "habat_attendance_database_unavailable" });
  if (typeof resolveRequesterContext !== "function") {
    return json(500, { ok: false, message: "habat_attendance_auth_unavailable" });
  }

  const pathname = normalizeText(url?.pathname);
  if (!pathname.startsWith("/attendance/habat/v3/")) {
    return json(404, { ok: false, message: "not_found" });
  }

  const requester = await resolveRequesterContext(request);
  if (!requester?.ok) return requester?.response || json(401, { ok: false, message: "unauthorized" });
  if (!requester.runtime?.isActive) return forbidden("inactive_account");

  const principal = await resolvePrincipal(db, requester);
  if (!principal.ok) return principal.response;

  const subpath = pathname.slice("/attendance/habat/v3".length) || "/";
  const deleteRecordMatch = subpath.match(/^\/records\/([^/]+)$/);
  const deleteOverrideMatch = subpath.match(/^\/day-overrides\/([^/]+)$/);

  if (subpath === "/month") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return getMonthWorkspace(db, url, principal);
  }

  if (subpath === "/monthly-summary") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return getSavedMonthlySummary(db, url, principal);
  }

  if (!principal.canManage) return forbidden("habat_management_forbidden");

  if (subpath === "/records/manual") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    return createManualRecord(db, request, requester);
  }

  if (deleteRecordMatch) {
    if (request.method !== "DELETE") return methodNotAllowed(["DELETE"]);
    return deleteAttendanceRecord(db, requester, decodeURIComponent(deleteRecordMatch[1]));
  }

  if (subpath === "/day-overrides") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    return upsertDayOverride(db, request, requester);
  }

  if (deleteOverrideMatch) {
    if (request.method !== "DELETE") return methodNotAllowed(["DELETE"]);
    return deleteDayOverride(db, requester, decodeURIComponent(deleteOverrideMatch[1]));
  }

  if (subpath === "/monthly-summary/generate") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    return generateMonthlySummary(db, request, requester);
  }

  return json(404, { ok: false, message: "not_found" });
}

async function resolvePrincipal(db, requester) {
  const accessId = normalizeText(requester?.accessId);
  const uid = normalizeText(requester?.uid);
  const email = normalizeText(requester?.email).toLowerCase();
  const runtimeRole = normalizeText(requester?.runtime?.role).toLowerCase();

  try {
    let row = null;

    if (accessId) {
      row = await db.prepare(
        `SELECT id, uid, email, display_name, access_level, clock_enabled, is_active,
                created_at, updated_at
         FROM habat_attendance_access
         WHERE id = ? AND is_active = 1
         LIMIT 1`
      ).bind(accessId).first();
    } else if (uid || email) {
      row = await db.prepare(
        `SELECT id, uid, email, display_name, access_level, clock_enabled, is_active,
                created_at, updated_at
         FROM habat_attendance_access
         WHERE is_active = 1
           AND ((uid IS NOT NULL AND uid = ?) OR lower(email) = ?)
         ORDER BY CASE WHEN uid = ? THEN 0 ELSE 1 END, created_at ASC
         LIMIT 1`
      ).bind(uid, email, uid).first();
    }

    if (row) {
      const accessLevel = normalizeText(row.access_level) === "manager" ? "manager" : "employee";
      return {
        ok: true,
        accessId: normalizeText(row.id),
        uid: normalizeText(row.uid) || uid || null,
        email: normalizeText(row.email).toLowerCase() || email,
        displayName: normalizeText(row.display_name) || email || "المستخدم",
        accessLevel,
        canManage: accessLevel === "manager",
        canClock: Number(row.clock_enabled) === 1,
        createdAt: normalizeText(row.created_at) || null,
      };
    }
  } catch (error) {
    console.error("[habat-v3] principal lookup failed", error);
    return { ok: false, response: json(500, { ok: false, message: "habat_access_lookup_failed" }) };
  }

  if (!accessId && runtimeRole === "owner") {
    return {
      ok: true,
      accessId: null,
      uid,
      email,
      displayName: email || "المالك",
      accessLevel: "manager",
      canManage: true,
      canClock: false,
      createdAt: null,
    };
  }

  return { ok: false, response: forbidden("habat_access_forbidden") };
}

async function resolveScopedAccess(db, principal, requestedAccessId) {
  const requested = normalizeText(requestedAccessId);
  if (!requested) {
    if (!principal.accessId) return { ok: false, response: json(400, { ok: false, message: "habat_access_required" }) };
    return getAccessById(db, principal.accessId);
  }
  if (!principal.canManage && requested !== principal.accessId) {
    return { ok: false, response: forbidden("habat_management_forbidden") };
  }
  return getAccessById(db, requested);
}

async function getAccessById(db, id) {
  const row = await db.prepare(
    `SELECT id, uid, email, display_name, access_level, clock_enabled, is_active,
            created_at, updated_at
     FROM habat_attendance_access WHERE id = ? LIMIT 1`
  ).bind(id).first();
  if (!row) return { ok: false, response: json(404, { ok: false, message: "habat_access_not_found" }) };
  return { ok: true, row };
}

async function getMonthWorkspace(db, url, principal) {
  const month = normalizeMonth(url.searchParams.get("month")) || getRiyadhDateKey().slice(0, 7);
  const accessResult = await resolveScopedAccess(db, principal, url.searchParams.get("accessId"));
  if (!accessResult.ok) return accessResult.response;
  const access = accessResult.row;

  try {
    const workspace = await buildMonthWorkspace(db, access, month);
    return json(200, { ok: true, ...workspace });
  } catch (error) {
    console.error("[habat-v3] month workspace failed", error);
    return json(500, { ok: false, message: "habat_month_workspace_failed" });
  }
}

async function buildMonthWorkspace(db, access, month) {
  const range = monthRange(month);
  const employee = await resolveWorkforceEmployeeBySource(
    db,
    WORKFORCE_TENANT_ID,
    access.id
  );

  const [recordsResult, savedSummary] = await Promise.all([
    db.prepare(
      `SELECT * FROM habat_attendance_records
       WHERE attendance_date >= ? AND attendance_date <= ?
         AND (access_id = ? OR lower(account_email) = lower(?))
       ORDER BY attendance_date ASC`
    ).bind(range.from, range.to, access.id, access.email).all(),
    db.prepare(
      `SELECT id, summary_json, generated_at
       FROM habat_attendance_monthly_summaries
       WHERE access_id = ? AND month_key = ? LIMIT 1`
    ).bind(access.id, month).first(),
  ]);

  const records = recordsResult?.results || [];
  if (!employee?.id) {
    return {
      access: mapAccess(access),
      month,
      from: range.from,
      to: range.to,
      days: [],
      records: records.map(mapRecord),
      overrides: [],
      savedSummary: savedSummary
        ? { id: savedSummary.id, generatedAt: savedSummary.generated_at, summary: safeJson(savedSummary.summary_json) }
        : null,
      workforceReady: false,
    };
  }

  const canonicalDays = await resolveWorkforceDayRange({
    db,
    tenantId: WORKFORCE_TENANT_ID,
    employeeId: employee.id,
    from: range.from,
    to: range.to,
    sourceRows: records,
  });

  const today = getRiyadhDateKey();
  const now = new Date();

  const days = canonicalDays.map(day => {
    const schedule = day.schedule;
    const workingDay = Boolean(schedule?.ready && schedule?.isWorkingDay);
    const scheduleWindow = workingDay ? buildScheduleWindow(day.date, {
      start_time: schedule.startTime,
      end_time: schedule.endTime,
    }) : null;
    const attendanceWindowStarted =
      day.date < today ||
      (day.date === today && Boolean(scheduleWindow) && now.getTime() >= scheduleWindow.start.getTime());

    const mappedState =
      day.state === "before_employment" || day.state === "after_employment" ? "future" :
      day.state === "rest" ? "off" :
      day.state === "leave" ? "leave" :
      day.state === "absence" ? "absence" :
      day.state === "conflict" ? "attention" :
      day.state === "incomplete" ? "incomplete" :
      ["late","early_leave","late_early_leave"].includes(day.state) ? "attention" :
      day.state === "present" ? "complete" :
      day.state === "future" ? "future" :
      day.state === "work" ? "today_pending" :
      day.state === "missing" && day.date < today ? "absence" : "pending";

    const leave = day.leaveRefs?.[0] || null;
    const override = leave ? {
      id: leave.id,
      accessId: access.id,
      attendanceDate: day.date,
      type: "leave",
      leaveType: leave.type,
      dayPortion: leave.duration === "full_day" ? "full_day" : "half_day",
      reason: null,
      source: "workforce_leaves",
    } : day.absence ? {
      id: day.absence.id,
      accessId: access.id,
      attendanceDate: day.date,
      type: "absence",
      dayPortion: day.absence.day_portion,
      reason: day.absence.reason || null,
      source: "workforce_absences",
    } : null;

    return {
      date: day.date,
      weekday: weekdayIndex(day.date),
      workingDay,
      state: mappedState,
      canonicalState: day.state,
      shift: schedule?.ready ? mapShift({
        id: schedule.templateId || schedule.assignmentId || "workforce_schedule",
        name: schedule.templateName || "Workforce schedule",
        start_time: schedule.startTime,
        end_time: schedule.endTime,
        grace_minutes: schedule.graceMinutes,
        early_leave_tolerance_minutes: schedule.earlyLeaveToleranceMinutes,
        working_days: workingDay ? String(weekdayIndex(day.date)) : "",
        is_active: 1,
      }) : null,
      record: mapRecord(day.attendance),
      override,
      eligible: day.employmentEligible,
      eligibilityReason: day.employmentEligible ? null : day.state,
      attendanceWindowStarted,
      expectedAttendanceMinutes: day.expectedAttendanceMinutes,
      paidExcusedMinutes: day.paidExcusedMinutes,
      conflicts: day.conflicts,
    };
  });

  return {
    access: mapAccess(access),
    month,
    from: range.from,
    to: range.to,
    days,
    records: records.map(mapRecord),
    overrides: days.map(day => day.override).filter(Boolean),
    savedSummary: savedSummary
      ? { id: savedSummary.id, generatedAt: savedSummary.generated_at, summary: safeJson(savedSummary.summary_json) }
      : null,
    workforceReady: true,
  };
}

async function createManualRecord(db, request, requester) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const accessId = normalizeText(body.value?.accessId);
  const date = normalizeDate(body.value?.date);
  const checkInAt = normalizeIso(body.value?.checkInAt);
  const checkOutAt = normalizeOptionalIso(body.value?.checkOutAt);
  const reason = normalizeText(body.value?.reason);
  if (!accessId || !date || !checkInAt) return json(400, { ok: false, message: "habat_manual_record_fields_required" });
  if (reason.length < 3) return json(400, { ok: false, message: "habat_correction_reason_required" });
  if (checkOutAt && Date.parse(checkOutAt) < Date.parse(checkInAt)) {
    return json(400, { ok: false, message: "habat_invalid_attendance_order" });
  }
  if (date > getRiyadhDateKey() || Date.parse(checkInAt) > Date.now()) {
    return json(400, { ok: false, message: "habat_future_attendance_not_allowed" });
  }
  if (getRiyadhDateKeyFromIso(checkInAt) !== date) {
    return json(400, { ok: false, message: "habat_attendance_date_mismatch" });
  }

  const accessResult = await getAccessById(db, accessId);
  if (!accessResult.ok) return accessResult.response;
  const access = accessResult.row;
  if (Number(access.is_active) !== 1) return json(409, { ok: false, message: "habat_inactive_access" });
  if (Number(access.clock_enabled) !== 1) return json(409, { ok: false, message: "habat_clock_disabled_for_date" });
  const enrollmentDate = getRiyadhDateKeyFromIso(access.created_at);
  if (enrollmentDate && date < enrollmentDate) {
    return json(409, { ok: false, message: "habat_date_before_enrollment" });
  }
  const uid = normalizeText(access.uid);
  if (!uid) return json(409, { ok: false, message: "habat_employee_login_required_before_manual_record" });

  const existing = await db.prepare(
    `SELECT * FROM habat_attendance_records
     WHERE attendance_date = ?
       AND (
         access_id = ?
         OR (
           (access_id IS NULL OR trim(access_id) = '')
           AND account_uid = ?
         )
       )
     ORDER BY CASE WHEN access_id = ? THEN 0 ELSE 1 END, created_at ASC
     LIMIT 1`
  ).bind(date, accessId, uid, accessId).first();
  if (existing) return json(409, { ok: false, message: "habat_attendance_record_already_exists" });

  const employee = await resolveWorkforceEmployeeBySource(db, WORKFORCE_TENANT_ID, accessId);
  if (!employee?.id) return json(409, { ok: false, message: "workforce_employee_not_linked" });
  await assertPayrollSourceMutationAllowed(db, WORKFORCE_TENANT_ID, employee.id, date);
  const [canonicalDay] = await resolveWorkforceDayRange({
    db,
    tenantId: WORKFORCE_TENANT_ID,
    employeeId: employee.id,
    from: date,
    to: date,
    sourceRows: [],
  });
  assertWorkforceDayMutationAllowed(canonicalDay, "attendance");

  const shift = await resolveShiftForAccessDate(db, accessId, date);
  if (!shift) return json(409, { ok: false, message: "habat_shift_not_configured" });
  const schedule = buildScheduleWindow(date, shift);
  const metrics = calculateMetrics(checkInAt, checkOutAt, shift, schedule);
  const id = `habat_${crypto.randomUUID()}`;
  const now = nowIso();

  try {
    await db.prepare(
      `INSERT INTO habat_attendance_records (
        id, access_id, account_uid, account_email, display_name, attendance_date,
        check_in_at, check_out_at, shift_id, scheduled_start_at, scheduled_end_at,
        attendance_status, late_minutes, early_leave_minutes, worked_minutes,
        notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, accessId, uid, normalizeText(access.email).toLowerCase(),
      normalizeText(access.display_name) || normalizeText(access.email), date,
      checkInAt, checkOutAt, normalizeText(shift.id), schedule.start.toISOString(), schedule.end.toISOString(),
      metrics.status, metrics.lateMinutes, metrics.earlyLeaveMinutes, metrics.workedMinutes,
      `إضافة يدوية: ${reason}`, now, now
    ).run();
    // payroll_stale_after_manual_record
    const staleStatements = buildPayrollStaleStatements(db, {
      tenantId: WORKFORCE_TENANT_ID,
      employeeId: employee.id,
      fromDate: date,
      toDate: date,
      reason: "attendance_manual_record_changed",
      now,
    });
    if (staleStatements.length) await db.batch(staleStatements);

    const created = await db.prepare(`SELECT * FROM habat_attendance_records WHERE id = ? LIMIT 1`).bind(id).first();
    await writeAudit(db, requester, "manager_create_manual_record", "habat_attendance_record", id, null, { ...created, reason });
    return json(200, { ok: true, record: mapRecord(created) });
  } catch (error) {
    console.error("[habat-v3] manual record failed", error);
    return json(500, { ok: false, message: "habat_manual_record_create_failed" });
  }
}

async function deleteAttendanceRecord(db, requester, id) {
  const current = await db
    .prepare(`SELECT * FROM habat_attendance_records WHERE id = ? LIMIT 1`)
    .bind(id)
    .first();
  if (!current) return json(404, { ok: false, message: "habat_record_not_found" });

  const accessId = normalizeText(current.access_id);
  if (!accessId) {
    return json(409, { ok: false, message: "workforce_employee_link_not_ready" });
  }

  const employee = await resolveWorkforceEmployeeBySource(
    db,
    WORKFORCE_TENANT_ID,
    accessId
  );
  if (!employee?.id) {
    return json(409, { ok: false, message: "workforce_employee_not_linked" });
  }

  const date = normalizeText(current.attendance_date);
  await assertPayrollSourceMutationAllowed(
    db,
    WORKFORCE_TENANT_ID,
    employee.id,
    date,
    date
  );

  const now = nowIso();
  const actorUid = normalizeText(requester.uid) || null;
  const actorEmail = normalizeText(requester.email).toLowerCase() || null;
  const staleStatements = buildPayrollStaleStatements(db, {
    tenantId: WORKFORCE_TENANT_ID,
    employeeId: employee.id,
    fromDate: date,
    toDate: date,
    reason: "attendance_record_deleted",
    now,
  });

  const deleteStatement = db
    .prepare(`DELETE FROM habat_attendance_records WHERE id = ?`)
    .bind(id);

  const auditStatement = db.prepare(
    `INSERT INTO workforce_audit_events (
      id, tenant_id, actor_uid, actor_email, action, entity_type, entity_id,
      before_json, after_json, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, 'workforce.attendance.delete', 'attendance_record', ?, ?, NULL, ?, ?)`
  ).bind(
    `wf_audit_${crypto.randomUUID()}`,
    WORKFORCE_TENANT_ID,
    actorUid,
    actorEmail,
    id,
    JSON.stringify(current),
    JSON.stringify({
      source: "habat_v3_record_delete",
      accessId,
      attendanceDate: date,
    }),
    now
  );

  try {
    await db.batch([
      deleteStatement,
      ...staleStatements,
      auditStatement,
    ]);
    return json(200, { ok: true });
  } catch (error) {
    console.error("[habat-v3] record delete failed", error);
    return json(500, { ok: false, message: "habat_record_delete_failed" });
  }
}
async function upsertDayOverride(db, request, requester) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const accessId = normalizeText(body.value?.accessId);
  const date = normalizeDate(body.value?.date);
  const type = normalizeText(body.value?.type);
  const dayPortion = DAY_PORTIONS.has(normalizeText(body.value?.dayPortion))
    ? normalizeText(body.value?.dayPortion)
    : "full_day";
  const reason = normalizeText(body.value?.reason);

  if (!accessId || !date || !OVERRIDE_TYPES.has(type)) {
    return json(400, { ok: false, message: "habat_day_override_fields_required" });
  }
  if (date > getRiyadhDateKey()) {
    return json(400, { ok: false, message: "habat_future_override_not_allowed" });
  }

  const accessResult = await getAccessById(db, accessId);
  if (!accessResult.ok) return accessResult.response;
  const access = accessResult.row;

  const employee = await resolveWorkforceEmployeeBySource(db, WORKFORCE_TENANT_ID, accessId);
  if (!employee?.id) return json(409, { ok: false, message: "workforce_employee_not_linked" });
  await assertPayrollSourceMutationAllowed(db, WORKFORCE_TENANT_ID, employee.id, date);

  const attendance = await db.prepare(
    `SELECT id FROM habat_attendance_records
     WHERE attendance_date = ? AND (access_id = ? OR lower(account_email) = lower(?)) LIMIT 1`
  ).bind(date, accessId, access.email).first();
  if (attendance) return json(409, { ok: false, message: "habat_day_has_attendance_record" });

  const existingLeave = await db.prepare(
    `SELECT id FROM workforce_leaves
      WHERE tenant_id = ? AND employee_id = ? AND status = 'approved'
        AND start_date <= ? AND end_date >= ?
      LIMIT 1`
  ).bind(WORKFORCE_TENANT_ID, employee.id, date, date).first();
  const existingAbsence = await db.prepare(
    `SELECT id FROM workforce_absences
      WHERE tenant_id = ? AND employee_id = ? AND status = 'approved'
        AND absence_date = ? LIMIT 1`
  ).bind(WORKFORCE_TENANT_ID, employee.id, date).first();

  if (existingLeave || existingAbsence) {
    return json(409, { ok: false, message: "workforce_day_leave_absence_conflict" });
  }

  const now = nowIso();
  const actorUid = normalizeText(requester.uid) || null;
  const actorEmail = normalizeText(requester.email).toLowerCase() || null;
  const staleStatements = buildPayrollStaleStatements(db, {
    tenantId: WORKFORCE_TENANT_ID,
    employeeId: employee.id,
    fromDate: date,
    reason: type === "absence" ? "absence_changed" : "leave_changed",
    now,
  });

  if (type === "emergency_leave") {
    const id = `wf_leave_${crypto.randomUUID()}`;
    const statements = [
      db.prepare(
        `INSERT INTO workforce_leaves (
          id, tenant_id, employee_id, leave_type, duration_kind,
          start_date, end_date, status, reason,
          requested_by_uid, approved_by_uid, approved_by_email, approved_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, 'emergency', ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, WORKFORCE_TENANT_ID, employee.id, dayPortion,
        date, date, reason || null, actorUid, actorUid, actorEmail, now, now, now
      ),
      ...staleStatements,
      db.prepare(
        `INSERT INTO workforce_audit_events (
          id, tenant_id, actor_uid, actor_email, action, entity_type, entity_id,
          before_json, after_json, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, 'workforce.leave.create', 'leave', ?, NULL, ?, ?, ?)`
      ).bind(
        `wf_audit_${crypto.randomUUID()}`,
        WORKFORCE_TENANT_ID,
        actorUid,
        actorEmail,
        id,
        JSON.stringify({ id, employee_id: employee.id, leave_type: "emergency", duration_kind: dayPortion, start_date: date, end_date: date, status: "approved" }),
        JSON.stringify({ source: "habat_v3_day_override_facade", accessId }),
        now
      ),
    ];
    await db.batch(statements);
    return json(200, {
      ok: true,
      override: { id, accessId, attendanceDate: date, type: "leave", leaveType: "emergency", dayPortion, reason: reason || null, source: "workforce_leaves" },
    });
  }

  const id = `wf_absence_${crypto.randomUUID()}`;
  const statements = [
    db.prepare(
      `INSERT INTO workforce_absences (
        id, tenant_id, employee_id, absence_date, day_portion, status,
        reason, payroll_treatment, created_by_uid, created_by_email,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'approved', ?, 'attendance_policy', ?, ?, ?, ?)`
    ).bind(id, WORKFORCE_TENANT_ID, employee.id, date, dayPortion, reason || null, actorUid, actorEmail, now, now),
    ...staleStatements,
    db.prepare(
      `INSERT INTO workforce_audit_events (
        id, tenant_id, actor_uid, actor_email, action, entity_type, entity_id,
        before_json, after_json, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, 'workforce.absence.create', 'absence', ?, NULL, ?, ?, ?)`
    ).bind(
      `wf_audit_${crypto.randomUUID()}`,
      WORKFORCE_TENANT_ID,
      actorUid,
      actorEmail,
      id,
      JSON.stringify({ id, employee_id: employee.id, absence_date: date, day_portion: dayPortion, status: "approved", payroll_treatment: "attendance_policy" }),
      JSON.stringify({ source: "habat_v3_day_override_facade", accessId }),
      now
    ),
  ];
  await db.batch(statements);
  return json(200, {
    ok: true,
    override: { id, accessId, attendanceDate: date, type: "absence", dayPortion, reason: reason || null, source: "workforce_absences" },
  });
}

async function deleteDayOverride(db, requester, id) {
  const [leave, absence] = await Promise.all([
    db.prepare(`SELECT * FROM workforce_leaves WHERE tenant_id = ? AND id = ? LIMIT 1`)
      .bind(WORKFORCE_TENANT_ID, id).first(),
    db.prepare(`SELECT * FROM workforce_absences WHERE tenant_id = ? AND id = ? LIMIT 1`)
      .bind(WORKFORCE_TENANT_ID, id).first(),
  ]);
  const row = leave || absence;
  if (!row) return json(404, { ok: false, message: "habat_day_override_not_found" });

  const employeeId = normalizeText(row.employee_id);
  const date = normalizeText(leave ? row.start_date : row.absence_date);
  await assertPayrollSourceMutationAllowed(db, WORKFORCE_TENANT_ID, employeeId, date);

  const now = nowIso();
  const actorUid = normalizeText(requester.uid) || null;
  const actorEmail = normalizeText(requester.email).toLowerCase() || null;
  const staleStatements = buildPayrollStaleStatements(db, {
    tenantId: WORKFORCE_TENANT_ID,
    employeeId,
    fromDate: date,
    toDate: leave ? normalizeText(row.end_date) || date : date,
    reason: leave ? "leave_cancelled" : "absence_cancelled",
    now,
  });

  const update = leave
    ? db.prepare(`UPDATE workforce_leaves SET status='cancelled', updated_at=? WHERE tenant_id=? AND id=? AND status='approved'`)
        .bind(now, WORKFORCE_TENANT_ID, id)
    : db.prepare(`UPDATE workforce_absences SET status='cancelled', updated_at=? WHERE tenant_id=? AND id=? AND status='approved'`)
        .bind(now, WORKFORCE_TENANT_ID, id);

  const audit = db.prepare(
    `INSERT INTO workforce_audit_events (
      id, tenant_id, actor_uid, actor_email, action, entity_type, entity_id,
      before_json, after_json, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    `wf_audit_${crypto.randomUUID()}`,
    WORKFORCE_TENANT_ID,
    actorUid,
    actorEmail,
    leave ? "workforce.leave.cancel" : "workforce.absence.cancel",
    leave ? "leave" : "absence",
    id,
    JSON.stringify(row),
    JSON.stringify({ ...row, status: "cancelled", updated_at: now }),
    JSON.stringify({ source: "habat_v3_day_override_facade" }),
    now
  );

  await db.batch([update, ...staleStatements, audit]);
  return json(200, { ok: true });
}

async function getSavedMonthlySummary(db, url, principal) {
  const month = normalizeMonth(url.searchParams.get("month")) || getRiyadhDateKey().slice(0, 7);
  const accessResult = await resolveScopedAccess(db, principal, url.searchParams.get("accessId"));
  if (!accessResult.ok) return accessResult.response;
  const row = await db.prepare(
    `SELECT id, summary_json, generated_at FROM habat_attendance_monthly_summaries
     WHERE access_id = ? AND month_key = ? LIMIT 1`
  ).bind(accessResult.row.id, month).first();
  return json(200, {
    ok: true,
    month,
    summary: row ? safeJson(row.summary_json) : null,
    generatedAt: row?.generated_at || null,
  });
}

async function generateMonthlySummary(db, request, requester) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const accessId = normalizeText(body.value?.accessId);
  const month = normalizeMonth(body.value?.month) || getRiyadhDateKey().slice(0, 7);
  if (!accessId) return json(400, { ok: false, message: "habat_access_required" });
  const accessResult = await getAccessById(db, accessId);
  if (!accessResult.ok) return accessResult.response;

  try {
    const workspace = await buildMonthWorkspace(db, accessResult.row, month);
    const today = getRiyadhDateKey();
    const elapsed = workspace.days.filter(day =>
      day.eligible !== false &&
      day.workingDay &&
      (day.date < today || (day.date === today && day.attendanceWindowStarted))
    );
    const summary = {
      month,
      scheduledDays: elapsed.filter(day => day.state !== "leave").length,
      attendedDays: elapsed.filter(day => Boolean(day.record?.checkInAt)).length,
      absentDays: elapsed.filter(day => day.state === "absence").length,
      emergencyLeaveDays: elapsed.filter(day => day.state === "leave").length,
      lateDays: elapsed.filter(day => String(day.record?.attendanceStatus || "").includes("late")).length,
      earlyLeaveDays: elapsed.filter(day => String(day.record?.attendanceStatus || "").includes("early_leave")).length,
      incompleteDays: elapsed.filter(day => day.state === "incomplete").length,
      workedMinutes: elapsed.reduce((sum, day) => sum + Number(day.record?.workedMinutes || 0), 0),
      daysWithAttendance: elapsed.filter(day => Boolean(day.record?.checkInAt)).length,
      generatedAt: nowIso(),
    };
    const id = `habat_summary_${accessId}_${month}`;
    await db.prepare(
      `INSERT INTO habat_attendance_monthly_summaries (
        id, access_id, month_key, summary_json, generated_by_uid, generated_by_email, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(access_id, month_key) DO UPDATE SET
        summary_json = excluded.summary_json,
        generated_by_uid = excluded.generated_by_uid,
        generated_by_email = excluded.generated_by_email,
        generated_at = excluded.generated_at`
    ).bind(
      id, accessId, month, JSON.stringify(summary),
      normalizeText(requester.uid) || null, normalizeText(requester.email).toLowerCase() || null,
      summary.generatedAt
    ).run();
    await writeAudit(db, requester, "manager_generate_monthly_summary", "habat_attendance_monthly_summary", id, workspace.savedSummary?.summary || null, summary);
    return json(200, { ok: true, summary });
  } catch (error) {
    console.error("[habat-v3] summary generation failed", error);
    return json(500, { ok: false, message: "habat_monthly_summary_failed" });
  }
}

async function resolveShiftForAccessDate(db, accessId, date) {
  const link = await db.prepare(
    `SELECT employee_id
       FROM workforce_attendance_links
      WHERE tenant_id = ? AND source_employee_id = ?
        AND COALESCE(status, 'confirmed') = 'confirmed'
      LIMIT 1`
  ).bind(WORKFORCE_TENANT_ID, accessId).first();

  if (link?.employee_id) {
    const schedule = await resolveWorkforceScheduleDay(
      db,
      WORKFORCE_TENANT_ID,
      link.employee_id,
      date
    );
    if (schedule && schedule.kind !== "unassigned" && schedule.ready) {
      return mapWorkforceScheduleToV3Shift(schedule, date);
    }
  }

  const assignment = await db.prepare(
    `SELECT s.* FROM habat_attendance_shift_assignments a
     JOIN habat_attendance_shifts s ON s.id = a.shift_id
     WHERE a.access_id = ? AND a.effective_from <= ?
       AND (a.effective_to IS NULL OR a.effective_to >= ?)
     ORDER BY a.effective_from DESC LIMIT 1`
  ).bind(accessId, date, date).first();
  if (assignment) return assignment;
  return db.prepare(`SELECT * FROM habat_attendance_shifts WHERE id = ? LIMIT 1`).bind(DEFAULT_SHIFT_ID).first();
}

function resolveV3ShiftForDate(date, workforceScheduleByDate, assignments, shifts) {
  const schedule = workforceScheduleByDate.get(date);
  if (schedule && schedule.kind !== "unassigned" && schedule.ready) {
    return mapWorkforceScheduleToV3Shift(schedule, date);
  }
  return resolveShiftForDate(date, assignments, shifts);
}

function mapWorkforceScheduleToV3Shift(schedule, date) {
  const weekday = weekdayIndex(date);
  return {
    id: normalizeText(schedule.templateId) || `workforce:${normalizeText(schedule.assignmentId)}`,
    name: normalizeText(schedule.templateName) || (schedule.isWorkingDay ? "Workforce schedule" : "راحة"),
    start_time: normalizeTime(schedule.startTime),
    end_time: normalizeTime(schedule.endTime),
    grace_minutes: Number(schedule.graceMinutes || 0),
    early_leave_tolerance_minutes: Number(schedule.earlyLeaveToleranceMinutes || 0),
    working_days: schedule.isWorkingDay ? String(weekday) : "",
    is_active: 1,
  };
}

function resolveShiftForDate(date, assignments, shifts) {
  const assignment = assignments
    .filter(row => normalizeText(row.effective_from) <= date && (!normalizeText(row.effective_to) || normalizeText(row.effective_to) >= date))
    .sort((a, b) => normalizeText(b.effective_from).localeCompare(normalizeText(a.effective_from)))[0];
  const shiftId = normalizeText(assignment?.shift_id) || DEFAULT_SHIFT_ID;
  return shifts.find(row => normalizeText(row.id) === shiftId) || shifts.find(row => normalizeText(row.id) === DEFAULT_SHIFT_ID) || null;
}

function buildScheduleWindow(date, shift) {
  const start = new Date(`${date}T${normalizeTime(shift.start_time)}:00+03:00`);
  let end = new Date(`${date}T${normalizeTime(shift.end_time)}:00+03:00`);
  if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function calculateMetrics(checkInAt, checkOutAt, shift, schedule) {
  const checkIn = new Date(checkInAt);
  const checkOut = checkOutAt ? new Date(checkOutAt) : null;
  const rawLate = Math.max(0, Math.floor((checkIn.getTime() - schedule.start.getTime()) / 60000));
  const grace = Number(shift.grace_minutes || 0);
  const lateMinutes = rawLate > grace ? rawLate : 0;
  const rawEarly = checkOut ? Math.max(0, Math.floor((schedule.end.getTime() - checkOut.getTime()) / 60000)) : 0;
  const tolerance = Number(shift.early_leave_tolerance_minutes || 0);
  const earlyLeaveMinutes = rawEarly > tolerance ? rawEarly : 0;
  const workedMinutes = checkOut ? Math.max(0, Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000)) : null;
  let status = lateMinutes ? "late" : "present";
  if (earlyLeaveMinutes) status = lateMinutes ? "late_early_leave" : "early_leave";
  return { status, lateMinutes, earlyLeaveMinutes, workedMinutes };
}

function mapAccess(row) {
  return {
    id: normalizeText(row.id), uid: normalizeText(row.uid) || null,
    email: normalizeText(row.email).toLowerCase(), displayName: normalizeText(row.display_name) || null,
    accessLevel: normalizeText(row.access_level) === "manager" ? "manager" : "employee",
    clockEnabled: Number(row.clock_enabled) === 1, isActive: Number(row.is_active) === 1,
    createdAt: normalizeText(row.created_at) || null,
  };
}

function mapShift(row) {
  if (!row) return null;
  return {
    id: normalizeText(row.id), name: normalizeText(row.name),
    startTime: normalizeTime(row.start_time), endTime: normalizeTime(row.end_time),
    graceMinutes: Number(row.grace_minutes || 0),
    earlyLeaveToleranceMinutes: Number(row.early_leave_tolerance_minutes || 0),
    workingDays: parseWorkingDays(row.working_days), isActive: Number(row.is_active) === 1,
  };
}

function mapRecord(row) {
  if (!row) return null;
  return {
    id: normalizeText(row.id), accessId: normalizeText(row.access_id) || null,
    accountUid: normalizeText(row.account_uid), accountEmail: normalizeText(row.account_email) || null,
    displayName: normalizeText(row.display_name) || null, attendanceDate: normalizeText(row.attendance_date),
    checkInAt: normalizeText(row.check_in_at) || null, checkOutAt: normalizeText(row.check_out_at) || null,
    shiftId: normalizeText(row.shift_id) || null,
    scheduledStartAt: normalizeText(row.scheduled_start_at) || null, scheduledEndAt: normalizeText(row.scheduled_end_at) || null,
    attendanceStatus: normalizeText(row.attendance_status) || null,
    lateMinutes: Number(row.late_minutes || 0), earlyLeaveMinutes: Number(row.early_leave_minutes || 0),
    workedMinutes: row.worked_minutes == null ? null : Number(row.worked_minutes), notes: normalizeText(row.notes) || null,
  };
}

function mapOverride(row) {
  if (!row) return null;
  return {
    id: normalizeText(row.id), accessId: normalizeText(row.access_id), date: normalizeText(row.attendance_date),
    type: normalizeText(row.override_type), dayPortion: normalizeText(row.day_portion) || "full_day",
    reason: normalizeText(row.reason) || null, createdAt: normalizeText(row.created_at) || null,
    updatedAt: normalizeText(row.updated_at) || null,
  };
}

async function writeAudit(db, requester, action, entityType, entityId, before, after) {
  try {
    await db.prepare(
      `INSERT INTO habat_attendance_audit (
        id, actor_uid, actor_email, action, entity_type, entity_id, before_json, after_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      `habat_audit_${crypto.randomUUID()}`,
      normalizeText(requester?.uid) || null,
      normalizeText(requester?.email).toLowerCase() || null,
      action, entityType, entityId || null,
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after),
      nowIso()
    ).run();
  } catch (error) {
    console.warn("[habat-v3] audit write failed", error);
  }
}

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text && text !== "undefined" && text !== "null" ? text : "";
}
function normalizeDate(value) {
  const text = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}
function normalizeMonth(value) {
  const text = normalizeText(value);
  return /^\d{4}-\d{2}$/.test(text) ? text : "";
}
function normalizeTime(value) {
  const text = normalizeText(value);
  return /^\d{2}:\d{2}$/.test(text) ? text : "09:00";
}
function normalizeIso(value) {
  const text = normalizeText(value);
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}
function normalizeOptionalIso(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
function parseWorkingDays(value) {
  return String(value ?? "").split(",").map(item => Number(item)).filter(item => Number.isInteger(item) && item >= 0 && item <= 6);
}
function weekdayIndex(date) {
  return new Date(`${date}T12:00:00+03:00`).getDay();
}
function monthRange(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}
function enumerateDateKeys(from, to) {
  const result = [];
  let cursor = new Date(`${from}T12:00:00+03:00`);
  const end = new Date(`${to}T12:00:00+03:00`);
  while (cursor.getTime() <= end.getTime()) {
    result.push(formatRiyadhDateKey(cursor));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return result;
}
function getRiyadhDateKey() {
  return formatRiyadhDateKey(new Date());
}
function getRiyadhDateKeyFromIso(value) {
  const text = normalizeText(value);
  if (!text) return "";
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return "";
  return formatRiyadhDateKey(new Date(timestamp));
}
function formatRiyadhDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function safeJson(value) {
  try { return JSON.parse(String(value || "null")); } catch { return null; }
}
function nowIso() { return new Date().toISOString(); }
async function readJsonBody(request) {
  try { return { ok: true, value: await request.json() }; }
  catch { return { ok: false, response: json(400, { ok: false, message: "invalid_json" }) }; }
}
function methodNotAllowed(allowed) {
  return new Response(JSON.stringify({ ok: false, message: "method_not_allowed" }), {
    status: 405, headers: { "Content-Type": "application/json; charset=utf-8", Allow: allowed.join(", ") },
  });
}
function forbidden(message) { return json(403, { ok: false, message }); }
function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
