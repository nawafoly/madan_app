const KNOWN_ROLES = new Set([
  "owner",
  "admin",
  "accountant",
  "hr",
  "staff",
  "client",
  "guest",
]);

const EMPLOYEE_READ_ROLES = new Set(["owner", "admin", "hr", "accountant"]);
const EMPLOYEE_MANAGE_ROLES = new Set(["owner", "admin", "hr"]);
const ACCOUNT_MANAGE_ROLES = new Set(["owner", "admin"]);
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const MAX_IMPORT_ROWS = 250;
const HR_WORKER_RELEASE = "phase8a-tasks-reports-v1";
const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let firebaseJwksCache = {
  expiresAt: 0,
  keys: [],
};

export default {
  async fetch(request, env) {
    const response = await routeRequest(request, env);
    return withCors(response, request, env);
  },
};

async function routeRequest(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (!env?.HR_DB) {
    return json(500, {
      ok: false,
      message: "missing_hr_d1_binding",
    });
  }

  const url = new URL(request.url);
  const pathname = normalizePathname(url.pathname);

  if (pathname === "/health" && request.method === "GET") {
    return healthCheck(env.HR_DB);
  }

  if (pathname === "/internal/hr/import" && request.method === "POST") {
    return importHrSnapshot(request, env);
  }

  if (pathname === "/internal/hr/operations/import" && request.method === "POST") {
    return importHrOperationsSnapshot(request, env);
  }

  if (pathname === "/internal/hr/notifications-audit/import" && request.method === "POST") {
    return importNotificationsAuditSnapshot(request, env);
  }

  if (pathname === "/internal/hr/tasks-reports/import" && request.method === "POST") {
    return importTasksReportsSnapshot(request, env);
  }

  if (isPayrollImportPath(pathname)) {
    if (request.method !== "POST") {
      return json(405, { ok: false, message: "payroll_import_method_not_allowed" });
    }
    return importPayrollSnapshot(request, env);
  }

  if (pathname.startsWith("/internal/")) {
    return json(404, { ok: false, message: "not_found" });
  }

  const requester = await resolveRequester(request, env);
  if (!requester.ok) return requester.response;

  if (pathname === "/api/hr/me" && request.method === "GET") {
    return json(200, {
      ok: true,
      account: mapAccountRow(requester.account),
      permissions: requester.permissions,
    });
  }

  if (pathname === "/api/hr/permissions" && request.method === "GET") {
    if (!canReadEmployees(requester)) return forbidden("employees_view_forbidden");
    return listPermissionDefinitions(env.HR_DB);
  }

  if (pathname === "/api/hr/accounts" && request.method === "GET") {
    if (!canManageAccounts(requester)) return forbidden("accounts_view_forbidden");
    return listAccounts(url, env.HR_DB);
  }

  const accountMatch = pathname.match(/^\/api\/hr\/accounts\/([^/]+)$/);
  if (accountMatch && request.method === "PATCH") {
    if (!canManageAccounts(requester)) return forbidden("accounts_manage_forbidden");
    return updateAccount(
      request,
      env.HR_DB,
      requester,
      decodeURIComponent(accountMatch[1])
    );
  }

  const accountPermissionsMatch = pathname.match(
    /^\/api\/hr\/accounts\/([^/]+)\/permissions$/
  );
  if (accountPermissionsMatch && request.method === "PUT") {
    if (!canManageAccounts(requester)) return forbidden("accounts_manage_forbidden");
    return replaceAccountPermissions(
      request,
      env.HR_DB,
      requester,
      decodeURIComponent(accountPermissionsMatch[1])
    );
  }

  if (pathname === "/api/hr/employees" && request.method === "GET") {
    if (!canReadEmployees(requester)) return forbidden("employees_view_forbidden");
    return listEmployees(url, env.HR_DB);
  }

  if (pathname === "/api/hr/employees" && request.method === "POST") {
    if (!canManageEmployees(requester)) return forbidden("employees_manage_forbidden");
    return createEmployee(request, env.HR_DB, requester);
  }

  const employeeMatch = pathname.match(/^\/api\/hr\/employees\/([^/]+)$/);
  if (employeeMatch && request.method === "GET") {
    const employeeId = decodeURIComponent(employeeMatch[1]);
    if (!canReadEmployee(requester, employeeId)) {
      return forbidden("employee_view_forbidden");
    }
    return getEmployee(env.HR_DB, employeeId);
  }

  if (employeeMatch && request.method === "PATCH") {
    if (!canManageEmployees(requester)) return forbidden("employees_manage_forbidden");
    return updateEmployee(
      request,
      env.HR_DB,
      requester,
      decodeURIComponent(employeeMatch[1])
    );
  }

  if (pathname === "/api/hr/leave-requests" && request.method === "GET") {
    return listLeaveRequests(url, env.HR_DB, requester);
  }

  if (pathname === "/api/hr/leave-requests" && request.method === "POST") {
    return createLeaveRequest(request, env.HR_DB, requester);
  }

  const leaveReviewMatch = pathname.match(
    /^\/api\/hr\/leave-requests\/([^/]+)\/review$/
  );
  if (leaveReviewMatch && request.method === "PATCH") {
    if (!canManageLeaveRequests(requester)) {
      return forbidden("leave_requests_manage_forbidden");
    }
    return reviewLeaveRequest(
      request,
      env.HR_DB,
      requester,
      decodeURIComponent(leaveReviewMatch[1])
    );
  }

  const leaveCancelDateMatch = pathname.match(
    /^\/api\/hr\/leave-requests\/([^/]+)\/cancel-date$/
  );
  if (leaveCancelDateMatch && request.method === "PATCH") {
    if (!canManageLeaveRequests(requester)) {
      return forbidden("leave_requests_manage_forbidden");
    }
    return cancelLeaveDate(
      request,
      env.HR_DB,
      requester,
      decodeURIComponent(leaveCancelDateMatch[1])
    );
  }

  if (pathname === "/api/hr/absences" && request.method === "GET") {
    return listAbsences(url, env.HR_DB, requester);
  }

  if (pathname === "/api/hr/absences" && request.method === "POST") {
    if (!canManageAbsences(requester)) return forbidden("absences_manage_forbidden");
    return createAbsence(request, env.HR_DB, requester);
  }

  const absenceMatch = pathname.match(/^\/api\/hr\/absences\/([^/]+)$/);
  if (absenceMatch && request.method === "DELETE") {
    if (!canManageAbsences(requester)) return forbidden("absences_manage_forbidden");
    return deleteAbsence(
      request,
      env.HR_DB,
      requester,
      decodeURIComponent(absenceMatch[1])
    );
  }

  if (pathname === "/api/hr/service-requests" && request.method === "GET") {
    return listServiceRequests(url, env.HR_DB, requester);
  }

  if (pathname === "/api/hr/service-requests" && request.method === "POST") {
    return createServiceRequest(request, env.HR_DB, requester);
  }

  const serviceReviewMatch = pathname.match(
    /^\/api\/hr\/service-requests\/([^/]+)\/review$/
  );
  if (serviceReviewMatch && request.method === "PATCH") {
    if (!canManageServiceRequests(requester)) {
      return forbidden("service_requests_manage_forbidden");
    }
    return reviewServiceRequest(
      request,
      env.HR_DB,
      requester,
      decodeURIComponent(serviceReviewMatch[1])
    );
  }


  if (pathname === "/api/hr/daily-tasks" && request.method === "GET") {
    return listDailyTasks(url, env.HR_DB, requester);
  }

  if (pathname === "/api/hr/daily-tasks" && request.method === "POST") {
    return createDailyTask(request, env.HR_DB, requester);
  }

  const dailyTaskMatch = pathname.match(/^\/api\/hr\/daily-tasks\/([^/]+)$/);
  if (dailyTaskMatch && request.method === "PATCH") {
    return updateDailyTask(request, env.HR_DB, requester, decodeURIComponent(dailyTaskMatch[1]));
  }

  if (pathname === "/api/hr/weekly-reports" && request.method === "GET") {
    return listWeeklyReports(url, env.HR_DB, requester);
  }

  if (pathname === "/api/hr/weekly-reports" && request.method === "POST") {
    return createWeeklyReport(request, env.HR_DB, requester);
  }

  const weeklyReportMatch = pathname.match(/^\/api\/hr\/weekly-reports\/([^/]+)$/);
  if (weeklyReportMatch && request.method === "PATCH") {
    return updateWeeklyReport(request, env.HR_DB, requester, decodeURIComponent(weeklyReportMatch[1]));
  }

  if (pathname === "/api/hr/notifications" && request.method === "GET") {
    return listNotifications(url, env.HR_DB, requester);
  }

  if (pathname === "/api/hr/notifications" && request.method === "POST") {
    return createNotification(request, env.HR_DB, requester);
  }

  const notificationReadMatch = pathname.match(
    /^\/api\/hr\/notifications\/([^/]+)\/read$/
  );
  if (notificationReadMatch && request.method === "PATCH") {
    return markNotificationRead(
      request,
      env.HR_DB,
      requester,
      decodeURIComponent(notificationReadMatch[1])
    );
  }

  if (pathname === "/api/hr/notifications/read-all" && request.method === "POST") {
    return markNotificationsRead(request, env.HR_DB, requester);
  }

  if (pathname === "/api/hr/audit-logs" && request.method === "GET") {
    if (!canViewAudit(requester)) return forbidden("audit_view_forbidden");
    return listAuditLogs(url, env.HR_DB);
  }

  if (pathname === "/api/hr/audit-logs" && request.method === "POST") {
    return createAuditLog(request, env.HR_DB, requester);
  }

  if (pathname === "/api/hr/payroll-records" && request.method === "GET") {
    return listPayrollRecords(url, env.HR_DB, requester);
  }

  if (pathname === "/api/hr/payroll-records" && request.method === "POST") {
    if (!canManagePayroll(requester)) return forbidden("payroll_manage_forbidden");
    return createPayrollRecord(request, env.HR_DB, requester);
  }

  if (pathname === "/api/hr/payroll-advances" && request.method === "GET") {
    return listPayrollAdvances(url, env.HR_DB, requester);
  }

  return methodOrNotFound(pathname, request.method);
}

async function healthCheck(db) {
  try {
    const row = await db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM accounts) AS account_count,
           (SELECT COUNT(*) FROM employees) AS employee_count,
           (SELECT COUNT(*) FROM employee_leave_requests) AS leave_request_count,
           (SELECT COUNT(*) FROM employee_absences) AS absence_count,
           (SELECT COUNT(*) FROM employee_service_requests) AS service_request_count,
           (SELECT COUNT(*) FROM employee_payroll_records) AS payroll_record_count,
           (SELECT COUNT(*) FROM hr_notifications) AS notification_count,
           (SELECT COUNT(*) FROM hr_audit_logs) AS audit_log_count,
           (SELECT COUNT(*) FROM hr_daily_tasks) AS daily_task_count,
           (SELECT COUNT(*) FROM hr_weekly_reports) AS weekly_report_count`
      )
      .first();

    return json(200, {
      ok: true,
      service: "maedin-hr-api",
      release: HR_WORKER_RELEASE,
      database: "ready",
      accountCount: Number(row?.account_count || 0),
      employeeCount: Number(row?.employee_count || 0),
      leaveRequestCount: Number(row?.leave_request_count || 0),
      absenceCount: Number(row?.absence_count || 0),
      serviceRequestCount: Number(row?.service_request_count || 0),
      payrollRecordCount: Number(row?.payroll_record_count || 0),
      notificationCount: Number(row?.notification_count || 0),
      auditLogCount: Number(row?.audit_log_count || 0),
      dailyTaskCount: Number(row?.daily_task_count || 0),
      weeklyReportCount: Number(row?.weekly_report_count || 0),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return serverError("hr_database_not_ready", error);
  }
}

async function resolveRequester(request, env) {
  const token = readBearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: json(401, { ok: false, message: "missing_firebase_id_token" }),
    };
  }

  let tokenPayload;
  try {
    tokenPayload = await verifyFirebaseIdToken(token, env.FIREBASE_PROJECT_ID);
  } catch (error) {
    console.error("hr_auth_token_verification_failed", error);
    return {
      ok: false,
      response: json(401, { ok: false, message: "invalid_firebase_id_token" }),
    };
  }

  const uid = normalizeText(tokenPayload.sub);
  const account = await env.HR_DB.prepare(
    `SELECT
       uid, email, username, display_name, title, role_key, is_active,
       employee_profile_enabled, linked_employee_id, auth_provider,
       source, source_updated_at, migrated_at, created_at, updated_at
     FROM accounts
     WHERE uid = ?
     LIMIT 1`
  )
    .bind(uid)
    .first();

  if (!account) {
    return {
      ok: false,
      response: json(403, {
        ok: false,
        message: "account_not_migrated_to_hr_core",
      }),
    };
  }

  if (!Boolean(account.is_active)) {
    return {
      ok: false,
      response: json(403, { ok: false, message: "inactive_account" }),
    };
  }

  const permissions = await resolveEffectivePermissions(env.HR_DB, account.uid);

  return {
    ok: true,
    uid,
    email: normalizeText(tokenPayload.email || account.email).toLowerCase(),
    tokenPayload,
    account,
    permissions,
  };
}

export async function resolveEffectivePermissions(db, uid) {
  const results = await db.batch([
    db
      .prepare(
        `SELECT rp.permission_key
         FROM role_permissions rp
         INNER JOIN accounts a ON a.role_key = rp.role_key
         WHERE a.uid = ?`
      )
      .bind(uid),
    db
      .prepare(
        `SELECT permission_key, effect
         FROM account_permissions
         WHERE uid = ?`
      )
      .bind(uid),
  ]);

  const defaults = (results[0]?.results || []).map(row => row.permission_key);
  const overrides = results[1]?.results || [];
  return computeEffectivePermissions(defaults, overrides);
}

export function computeEffectivePermissions(defaults, overrides) {
  const allowed = new Set(
    Array.isArray(defaults)
      ? defaults.map(normalizeText).filter(Boolean)
      : []
  );
  const denied = new Set();

  for (const override of Array.isArray(overrides) ? overrides : []) {
    const key = normalizeText(override?.permission_key || override?.permissionKey);
    const effect = normalizeText(override?.effect).toLowerCase();
    if (!key) continue;

    if (effect === "deny") {
      denied.add(key);
      allowed.delete(key);
    } else if (effect === "allow" && !denied.has(key)) {
      allowed.add(key);
    }
  }

  return Array.from(allowed).sort();
}

function canReadEmployees(requester) {
  return (
    requester.permissions.includes("employees.view") ||
    EMPLOYEE_READ_ROLES.has(normalizeRole(requester.account?.role_key))
  );
}

function canManageEmployees(requester) {
  return (
    requester.permissions.includes("employees.manage") ||
    EMPLOYEE_MANAGE_ROLES.has(normalizeRole(requester.account?.role_key))
  );
}

function canManageAccounts(requester) {
  return (
    requester.permissions.includes("admin_accounts.manage") ||
    ACCOUNT_MANAGE_ROLES.has(normalizeRole(requester.account?.role_key))
  );
}

function canReadEmployee(requester, employeeId) {
  if (canReadEmployees(requester)) return true;
  return normalizeText(requester.account?.linked_employee_id) === employeeId;
}

function canViewLeaveRequests(requester) {
  return (
    requester.permissions.includes("leave_requests.view") ||
    canReadEmployees(requester)
  );
}

function canManageLeaveRequests(requester) {
  return (
    requester.permissions.includes("leave_requests.manage") ||
    canManageEmployees(requester)
  );
}

function canViewAbsences(requester) {
  return requester.permissions.includes("absences.view") || canReadEmployees(requester);
}

function canManageAbsences(requester) {
  return (
    requester.permissions.includes("absences.manage") ||
    canManageEmployees(requester)
  );
}

function canViewServiceRequests(requester) {
  return (
    requester.permissions.includes("service_requests.view") ||
    canReadEmployees(requester)
  );
}

function canManageServiceRequests(requester) {
  return (
    requester.permissions.includes("service_requests.manage") ||
    canManageEmployees(requester)
  );
}

function canViewPayroll(requester) {
  return (
    requester.permissions.includes("payroll.view") ||
    ["owner", "admin", "hr", "accountant"].includes(
      normalizeRole(requester.account?.role_key)
    )
  );
}

function canManagePayroll(requester) {
  return (
    requester.permissions.includes("payroll.manage") ||
    ["owner", "admin", "hr", "accountant"].includes(
      normalizeRole(requester.account?.role_key)
    )
  );
}

function canManageNotifications(requester) {
  return (
    requester.permissions.includes("notifications.manage") ||
    ["owner", "admin", "hr"].includes(normalizeRole(requester.account?.role_key))
  );
}

function canViewAudit(requester) {
  return (
    requester.permissions.includes("audit.view") ||
    ["owner", "admin", "hr", "accountant"].includes(
      normalizeRole(requester.account?.role_key)
    )
  );
}

function requesterEmployeeId(requester) {
  return normalizeText(requester.account?.linked_employee_id);
}

async function listEmployees(url, db) {
  const query = parseListQuery(url.searchParams);
  const filters = [];
  const bindings = [];

  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      `(e.name LIKE ? ESCAPE '\\' COLLATE NOCASE
        OR e.email LIKE ? ESCAPE '\\' COLLATE NOCASE
        OR e.phone LIKE ? ESCAPE '\\' COLLATE NOCASE
        OR e.employee_code LIKE ? ESCAPE '\\' COLLATE NOCASE
        OR e.fingerprint_number LIKE ? ESCAPE '\\' COLLATE NOCASE)`
    );
    bindings.push(like, like, like, like, like);
  }

  if (query.status) {
    filters.push("e.employment_status = ?");
    bindings.push(query.status);
  }

  if (query.department) {
    filters.push("e.department = ?");
    bindings.push(query.department);
  }

  if (query.active !== null) {
    filters.push("e.is_active = ?");
    bindings.push(query.active ? 1 : 0);
  }

  const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  try {
    const result = await db.batch([
      db
        .prepare(
          `SELECT
             e.id, e.auth_uid, e.name, e.email, e.phone, e.avatar_url,
             e.title, e.department, e.employee_code, e.fingerprint_number,
             e.employment_status, e.is_active, e.start_date, e.leave_balance,
             e.base_salary, e.housing_allowance, e.transportation_allowance,
             e.other_allowances, e.insurance_deduction, e.shift_start_time,
             e.shift_end_time, e.weekly_off_days_json, e.allowed_zone_ids_json,
             e.salary_deductions_json, e.admin_notes, e.personal_json,
             e.employment_json, e.source, e.source_updated_at, e.migrated_at,
             e.created_at, e.updated_at,
             a.role_key AS account_role, a.is_active AS account_is_active,
             a.employee_profile_enabled
           FROM employees e
           LEFT JOIN accounts a ON a.uid = e.auth_uid
           ${whereSql}
           ORDER BY e.name COLLATE NOCASE ASC, e.id ASC
           LIMIT ? OFFSET ?`
        )
        .bind(...bindings, query.limit, query.offset),
      db
        .prepare(`SELECT COUNT(*) AS total FROM employees e ${whereSql}`)
        .bind(...bindings),
    ]);

    const rows = result[0]?.results || [];
    const total = Number(result[1]?.results?.[0]?.total || 0);

    return json(200, {
      ok: true,
      employees: rows.map(mapEmployeeRow),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total,
        hasMore: query.offset + rows.length < total,
      },
    });
  } catch (error) {
    return serverError("employees_query_failed", error);
  }
}

async function getEmployee(db, id) {
  try {
    const row = await db
      .prepare(
        `SELECT
           e.*,
           a.role_key AS account_role,
           a.is_active AS account_is_active,
           a.employee_profile_enabled,
           a.username AS account_username,
           a.display_name AS account_display_name
         FROM employees e
         LEFT JOIN accounts a ON a.uid = e.auth_uid
         WHERE e.id = ? OR e.auth_uid = ?
         LIMIT 1`
      )
      .bind(id, id)
      .first();

    if (!row) return json(404, { ok: false, message: "employee_not_found" });

    const permissions = row.auth_uid
      ? await resolveEffectivePermissions(db, row.auth_uid)
      : [];

    return json(200, {
      ok: true,
      employee: mapEmployeeRow(row),
      account: row.auth_uid
        ? {
            uid: row.auth_uid,
            role: row.account_role || "staff",
            isActive: Boolean(row.account_is_active),
            username: row.account_username || null,
            displayName: row.account_display_name || row.name,
            employeeProfileEnabled: Boolean(row.employee_profile_enabled),
            permissions,
          }
        : null,
    });
  } catch (error) {
    return serverError("employee_query_failed", error);
  }
}

async function createEmployee(request, db, requester) {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;

  const payload = normalizeEmployeePayload(bodyResult.value, { partial: false });
  if (!payload.ok) return payload.response;

  const employee = payload.value;
  const id = employee.id || crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    const existing = await db
      .prepare("SELECT id FROM employees WHERE id = ? LIMIT 1")
      .bind(id)
      .first();
    if (existing) {
      return json(409, { ok: false, message: "employee_id_already_exists" });
    }

    const statements = [];
    if (employee.authUid) {
      statements.push(
        db
          .prepare(
            `INSERT INTO accounts (
               uid, email, display_name, role_key, is_active,
               employee_profile_enabled, linked_employee_id, source,
               migrated_at, created_at, updated_at
             ) VALUES (?, ?, ?, 'staff', 1, 1, ?, 'hr_api', ?, ?, ?)
             ON CONFLICT(uid) DO UPDATE SET
               email = COALESCE(excluded.email, accounts.email),
               display_name = COALESCE(excluded.display_name, accounts.display_name),
               employee_profile_enabled = 1,
               linked_employee_id = excluded.linked_employee_id,
               updated_at = excluded.updated_at`
          )
          .bind(
            employee.authUid,
            employee.email,
            employee.name,
            id,
            now,
            now,
            now
          )
      );
    }

    statements.push(buildEmployeeInsertStatement(db, { ...employee, id }, now));
    statements.push(
      buildAuditStatement(db, request, requester, {
        action: "employee.create",
        entityType: "employee",
        entityId: id,
        before: null,
        after: { ...employee, id },
      })
    );

    await db.batch(statements);
    return getEmployee(db, id);
  } catch (error) {
    return databaseMutationError("employee_create_failed", error);
  }
}

async function updateEmployee(request, db, requester, id) {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;

  const payload = normalizeEmployeePayload(bodyResult.value, { partial: true });
  if (!payload.ok) return payload.response;
  if (!Object.keys(payload.value).length) {
    return json(400, { ok: false, message: "no_employee_fields_to_update" });
  }

  const before = await db
    .prepare("SELECT * FROM employees WHERE id = ? OR auth_uid = ? LIMIT 1")
    .bind(id, id)
    .first();
  if (!before) return json(404, { ok: false, message: "employee_not_found" });

  const patch = payload.value;
  const now = new Date().toISOString();
  const columns = [];
  const bindings = [];
  const mapping = {
    authUid: "auth_uid",
    name: "name",
    email: "email",
    phone: "phone",
    avatarUrl: "avatar_url",
    title: "title",
    department: "department",
    employeeCode: "employee_code",
    fingerprintNumber: "fingerprint_number",
    employmentStatus: "employment_status",
    isActive: "is_active",
    startDate: "start_date",
    leaveBalance: "leave_balance",
    baseSalary: "base_salary",
    housingAllowance: "housing_allowance",
    transportationAllowance: "transportation_allowance",
    otherAllowances: "other_allowances",
    insuranceDeduction: "insurance_deduction",
    shiftStartTime: "shift_start_time",
    shiftEndTime: "shift_end_time",
    weeklyOffDays: "weekly_off_days_json",
    allowedZoneIds: "allowed_zone_ids_json",
    salaryDeductions: "salary_deductions_json",
    adminNotes: "admin_notes",
    personal: "personal_json",
    employment: "employment_json",
  };

  for (const [key, column] of Object.entries(mapping)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    columns.push(`${column} = ?`);
    bindings.push(serializeEmployeeColumn(key, patch[key]));
  }

  columns.push("updated_at = ?");
  bindings.push(now, before.id);

  try {
    const statements = [
      db
        .prepare(`UPDATE employees SET ${columns.join(", ")} WHERE id = ?`)
        .bind(...bindings),
    ];

    const nextAuthUid = Object.prototype.hasOwnProperty.call(patch, "authUid")
      ? patch.authUid
      : before.auth_uid;
    if (nextAuthUid) {
      statements.unshift(
        db
          .prepare(
            `INSERT INTO accounts (
               uid, email, display_name, role_key, is_active,
               employee_profile_enabled, linked_employee_id, source,
               migrated_at, created_at, updated_at
             ) VALUES (?, ?, ?, 'staff', 1, 1, ?, 'hr_api', ?, ?, ?)
             ON CONFLICT(uid) DO UPDATE SET
               email = COALESCE(excluded.email, accounts.email),
               display_name = COALESCE(excluded.display_name, accounts.display_name),
               employee_profile_enabled = 1,
               linked_employee_id = excluded.linked_employee_id,
               updated_at = excluded.updated_at`
          )
          .bind(
            nextAuthUid,
            patch.email ?? before.email,
            patch.name ?? before.name,
            before.id,
            now,
            now,
            now
          )
      );
    }

    statements.push(
      buildAuditStatement(db, request, requester, {
        action: "employee.update",
        entityType: "employee",
        entityId: before.id,
        before,
        after: patch,
      })
    );

    await db.batch(statements);
    return getEmployee(db, before.id);
  } catch (error) {
    return databaseMutationError("employee_update_failed", error);
  }
}


function normalizeIsoDateKey(value) {
  const text = normalizeText(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function buildDateKeysInclusive(startDate, endDate) {
  const start = normalizeIsoDateKey(startDate);
  const end = normalizeIsoDateKey(endDate);
  if (!start || !end || end < start) return [];
  const cursor = new Date(`${start}T12:00:00.000Z`);
  const finalDate = new Date(`${end}T12:00:00.000Z`);
  const keys = [];
  while (cursor <= finalDate && keys.length <= 370) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

export function computeLeaveCancellationState(row, dateKey) {
  const normalizedDate = normalizeIsoDateKey(dateKey);
  const allDates = buildDateKeysInclusive(row?.start_date, row?.end_date);
  if (!normalizedDate || !allDates.includes(normalizedDate)) {
    throw new Error("leave_request_date_mismatch");
  }
  const existing = new Set(parseJsonArray(row?.cancelled_date_keys_json));
  if (existing.has(normalizedDate)) {
    throw new Error("leave_date_already_cancelled");
  }
  existing.add(normalizedDate);
  const cancelledDateKeys = Array.from(existing)
    .filter(key => allDates.includes(key))
    .sort();
  const activeDateKeys = allDates.filter(key => !existing.has(key));
  const deducted = Math.max(0, Number(row?.balance_deducted_days || 0));
  const restored = Math.max(0, Number(row?.balance_restored_days || 0));
  const restoreDays = Math.min(1, Math.max(0, deducted - restored));
  return {
    cancelledDateKeys,
    activeDateKeys,
    status: activeDateKeys.length ? "approved" : "cancelled",
    restoreDays,
    balanceRestoredDays: restored + restoreDays,
  };
}

function mapLeaveRequestRow(row) {
  return {
    id: row.id,
    employeeId: row.employee_id || null,
    employeeDocId: row.employee_id || null,
    employeeUid: row.employee_uid,
    userId: row.employee_uid,
    employeeName: row.employee_name || null,
    employeeEmail: row.employee_email || null,
    status: row.status,
    leaveType: row.leave_type,
    startDate: row.start_date,
    endDate: row.end_date,
    daysCount: nullableNumber(row.days_count),
    balanceDeductedDays: Number(row.balance_deducted_days || 0),
    balanceRestoredDays: Number(row.balance_restored_days || 0),
    cancelledDateKeys: parseJsonArray(row.cancelled_date_keys_json),
    cancellationDate: row.cancellation_date || null,
    cancelledAt: row.cancelled_at || null,
    cancelledBy: row.cancelled_by || null,
    cancelledByEmail: row.cancelled_by_email || null,
    cancelledByName: row.cancelled_by_name || null,
    employeeNote: row.employee_note || null,
    hrNote: row.hr_note || null,
    decidedAt: row.decided_at || null,
    decidedBy: row.decided_by || null,
    decidedByEmail: row.decided_by_email || null,
    decidedByName: row.decided_by_name || null,
    reviewedAt: row.reviewed_at || null,
    reviewedBy: row.reviewed_by || null,
    reviewedByEmail: row.reviewed_by_email || null,
    reviewedByName: row.reviewed_by_name || null,
    payrollRecordId: row.payroll_record_id || null,
    payrollMonth: row.payroll_month || null,
    settledAt: row.settled_at || null,
    settledBy: row.settled_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAbsenceRow(row) {
  return {
    id: row.id,
    employeeId: row.employee_id || null,
    employeeUid: row.employee_uid,
    date: row.absence_date,
    type: row.absence_type,
    note: row.note || null,
    createdByUid: row.created_by_uid || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapServiceRequestRow(row) {
  return {
    id: row.id,
    employeeId: row.employee_id || null,
    employeeDocId: row.employee_id || null,
    employeeUid: row.employee_uid,
    userId: row.employee_uid,
    employeeName: row.employee_name || null,
    employeeEmail: row.employee_email || null,
    status: row.status,
    requestType: row.request_type,
    title: row.title || null,
    requestDate: row.request_date || null,
    startDate: row.start_date || null,
    endDate: row.end_date || null,
    startTime: row.start_time || null,
    endTime: row.end_time || null,
    amount: nullableNumber(row.amount),
    letterType: row.letter_type || null,
    employeeNote: row.employee_note || null,
    hrNote: row.hr_note || null,
    decidedAt: row.decided_at || null,
    decidedBy: row.decided_by || null,
    decidedByEmail: row.decided_by_email || null,
    decidedByName: row.decided_by_name || null,
    reviewedAt: row.reviewed_at || null,
    reviewedBy: row.reviewed_by || null,
    reviewedByEmail: row.reviewed_by_email || null,
    reviewedByName: row.reviewed_by_name || null,
    payrollRecordId: row.payroll_record_id || null,
    payrollMonth: row.payroll_month || null,
    settledAt: row.settled_at || null,
    settledBy: row.settled_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listLeaveRequests(url, db, requester) {
  const manager = canViewLeaveRequests(requester);
  const requestedEmployeeUid = normalizeText(url.searchParams.get("employeeUid"));
  const requestedEmployeeId = normalizeText(url.searchParams.get("employeeId"));
  if (!manager && requestedEmployeeUid && requestedEmployeeUid !== requester.uid) {
    return forbidden("leave_requests_view_forbidden");
  }
  if (!manager && requestedEmployeeId && requestedEmployeeId !== requesterEmployeeId(requester)) {
    return forbidden("leave_requests_view_forbidden");
  }

  const query = parseListQuery(url.searchParams);
  const filters = [];
  const bindings = [];
  if (manager) {
    if (requestedEmployeeUid) {
      filters.push("employee_uid = ?");
      bindings.push(requestedEmployeeUid);
    }
    if (requestedEmployeeId) {
      filters.push("employee_id = ?");
      bindings.push(requestedEmployeeId);
    }
  } else {
    filters.push("employee_uid = ?");
    bindings.push(requester.uid);
  }
  const status = normalizeText(url.searchParams.get("status")).toLowerCase();
  if (status) {
    filters.push("status = ?");
    bindings.push(status);
  }
  const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  try {
    const result = await db.batch([
      db.prepare(`SELECT * FROM employee_leave_requests ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...bindings, query.limit, query.offset),
      db.prepare(`SELECT COUNT(*) AS total FROM employee_leave_requests ${whereSql}`).bind(...bindings),
    ]);
    return json(200, {
      ok: true,
      leaveRequests: (result[0]?.results || []).map(mapLeaveRequestRow),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total: Number(result[1]?.results?.[0]?.total || 0),
      },
    });
  } catch (error) {
    return serverError("leave_requests_query_failed", error);
  }
}

async function createLeaveRequest(request, db, requester) {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.value || {};
  const manager = canManageLeaveRequests(requester);
  const employeeUid = manager
    ? normalizeText(body.employeeUid || body.userId || requester.uid)
    : requester.uid;
  const employeeId = manager
    ? nullableText(body.employeeId || body.employeeDocId || requesterEmployeeId(requester))
    : nullableText(requesterEmployeeId(requester));
  if (!employeeUid) return json(400, { ok: false, message: "employee_uid_required" });
  if (!manager && employeeUid !== requester.uid) {
    return forbidden("leave_request_create_forbidden");
  }

  const startDate = normalizeIsoDateKey(body.startDate);
  const endDate = normalizeIsoDateKey(body.endDate || body.startDate);
  const dateKeys = buildDateKeysInclusive(startDate, endDate);
  if (!dateKeys.length) return json(400, { ok: false, message: "invalid_leave_date_range" });
  const leaveType = normalizeText(body.leaveType || "annual").toLowerCase();
  const id = normalizeText(body.id) || crypto.randomUUID();
  const now = new Date().toISOString();
  const employee = employeeId
    ? await db.prepare("SELECT id, auth_uid, name, email FROM employees WHERE id = ? LIMIT 1").bind(employeeId).first()
    : await db.prepare("SELECT id, auth_uid, name, email FROM employees WHERE auth_uid = ? LIMIT 1").bind(employeeUid).first();

  try {
    await db.batch([
      db.prepare(
        `INSERT INTO employee_leave_requests (
           id, employee_id, employee_uid, employee_name, employee_email,
           status, leave_type, start_date, end_date, days_count,
           employee_note, hr_note, source, source_updated_at, migrated_at,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, NULL, 'hr_api', ?, ?, ?, ?)`
      ).bind(
        id,
        employee?.id || employeeId,
        employeeUid,
        normalizeText(body.employeeName || employee?.name) || null,
        nullableEmail(body.employeeEmail || employee?.email),
        leaveType || "annual",
        startDate,
        endDate,
        dateKeys.length,
        nullableText(body.employeeNote),
        now,
        now,
        now,
        now
      ),
      buildAuditStatement(db, request, requester, {
        action: "leave_request.create",
        entityType: "employee_leave_request",
        entityId: id,
        before: null,
        after: { employeeUid, employeeId, startDate, endDate, leaveType },
      }),
    ]);
    const row = await db.prepare("SELECT * FROM employee_leave_requests WHERE id = ?").bind(id).first();
    return json(201, { ok: true, leaveRequest: mapLeaveRequestRow(row) });
  } catch (error) {
    return databaseMutationError("leave_request_create_failed", error);
  }
}

async function reviewLeaveRequest(request, db, requester, id) {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const nextStatus = normalizeText(bodyResult.value?.status).toLowerCase();
  if (!['approved', 'rejected'].includes(nextStatus)) {
    return json(400, { ok: false, message: "invalid_leave_review_status" });
  }
  const row = await db.prepare("SELECT * FROM employee_leave_requests WHERE id = ? LIMIT 1").bind(id).first();
  if (!row) return json(404, { ok: false, message: "leave_request_not_found" });
  if (normalizeText(row.status).toLowerCase() !== "pending") {
    return json(409, { ok: false, message: "leave_request_already_reviewed" });
  }
  const daysCount = Math.max(0, Number(row.days_count || 0));
  const employee = row.employee_id
    ? await db.prepare("SELECT id, leave_balance FROM employees WHERE id = ? LIMIT 1").bind(row.employee_id).first()
    : await db.prepare("SELECT id, leave_balance FROM employees WHERE auth_uid = ? LIMIT 1").bind(row.employee_uid).first();
  const currentBalance = Math.max(0, Number(employee?.leave_balance || 0));
  const deductDays = nextStatus === "approved" && row.leave_type !== "unpaid" ? daysCount : 0;
  if (deductDays > currentBalance) {
    return json(409, { ok: false, message: "leave_balance_insufficient", currentBalance, requiredDays: deductDays });
  }
  const now = new Date().toISOString();
  const statements = [];
  if (employee && deductDays > 0) {
    statements.push(
      db.prepare("UPDATE employees SET leave_balance = ?, updated_at = ? WHERE id = ?")
        .bind(currentBalance - deductDays, now, employee.id)
    );
  }
  statements.push(
    db.prepare(
      `UPDATE employee_leave_requests SET
         status = ?, hr_note = ?, balance_deducted_days = ?,
         decided_at = ?, decided_by = ?, decided_by_email = ?, decided_by_name = ?,
         reviewed_at = ?, reviewed_by = ?, reviewed_by_email = ?, reviewed_by_name = ?,
         updated_at = ?
       WHERE id = ?`
    ).bind(
      nextStatus,
      nullableText(bodyResult.value?.hrNote),
      deductDays,
      now,
      requester.uid,
      requester.email || null,
      requester.account?.display_name || requester.email || null,
      now,
      requester.uid,
      requester.email || null,
      requester.account?.display_name || requester.email || null,
      now,
      id
    )
  );
  statements.push(buildAuditStatement(db, request, requester, {
    action: `leave_request.${nextStatus}`,
    entityType: "employee_leave_request",
    entityId: id,
    before: row,
    after: { status: nextStatus, deductedDays: deductDays },
  }));
  try {
    await db.batch(statements);
    const updated = await db.prepare("SELECT * FROM employee_leave_requests WHERE id = ?").bind(id).first();
    return json(200, { ok: true, leaveRequest: mapLeaveRequestRow(updated) });
  } catch (error) {
    return databaseMutationError("leave_request_review_failed", error);
  }
}

async function cancelLeaveDate(request, db, requester, id) {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const dateKey = normalizeIsoDateKey(bodyResult.value?.date);
  if (!dateKey) return json(400, { ok: false, message: "invalid_leave_cancel_date" });
  const row = await db.prepare("SELECT * FROM employee_leave_requests WHERE id = ? LIMIT 1").bind(id).first();
  if (!row) return json(404, { ok: false, message: "leave_request_not_found" });
  if (normalizeText(row.status).toLowerCase() !== "approved") {
    return json(409, { ok: false, message: "leave_request_not_approved" });
  }
  let state;
  try {
    state = computeLeaveCancellationState(row, dateKey);
  } catch (error) {
    return json(409, { ok: false, message: error instanceof Error ? error.message : "leave_cancel_failed" });
  }
  const employee = row.employee_id
    ? await db.prepare("SELECT id, leave_balance FROM employees WHERE id = ? LIMIT 1").bind(row.employee_id).first()
    : await db.prepare("SELECT id, leave_balance FROM employees WHERE auth_uid = ? LIMIT 1").bind(row.employee_uid).first();
  const now = new Date().toISOString();
  const statements = [];
  if (employee && state.restoreDays > 0) {
    statements.push(
      db.prepare("UPDATE employees SET leave_balance = ?, updated_at = ? WHERE id = ?")
        .bind(Math.max(0, Number(employee.leave_balance || 0)) + state.restoreDays, now, employee.id)
    );
  }
  statements.push(
    db.prepare(
      `UPDATE employee_leave_requests SET
         status = ?, cancelled_date_keys_json = ?, cancellation_date = ?,
         balance_restored_days = ?, cancelled_at = ?, cancelled_by = ?,
         cancelled_by_email = ?, cancelled_by_name = ?, updated_at = ?
       WHERE id = ?`
    ).bind(
      state.status,
      JSON.stringify(state.cancelledDateKeys),
      state.status === "cancelled" ? dateKey : row.cancellation_date,
      state.balanceRestoredDays,
      now,
      requester.uid,
      requester.email || null,
      requester.account?.display_name || requester.email || null,
      now,
      id
    )
  );
  statements.push(buildAuditStatement(db, request, requester, {
    action: "leave_request.cancel_date",
    entityType: "employee_leave_request",
    entityId: id,
    before: row,
    after: { date: dateKey, ...state },
  }));
  try {
    await db.batch(statements);
    const updated = await db.prepare("SELECT * FROM employee_leave_requests WHERE id = ?").bind(id).first();
    return json(200, { ok: true, leaveRequest: mapLeaveRequestRow(updated) });
  } catch (error) {
    return databaseMutationError("leave_date_cancel_failed", error);
  }
}

async function listAbsences(url, db, requester) {
  const manager = canViewAbsences(requester);
  const requestedEmployeeUid = normalizeText(url.searchParams.get("employeeUid"));
  const requestedEmployeeId = normalizeText(url.searchParams.get("employeeId"));
  if (!manager && requestedEmployeeUid && requestedEmployeeUid !== requester.uid) {
    return forbidden("absences_view_forbidden");
  }
  const query = parseListQuery(url.searchParams);
  const filters = [];
  const bindings = [];
  if (manager) {
    if (requestedEmployeeUid) { filters.push("employee_uid = ?"); bindings.push(requestedEmployeeUid); }
    if (requestedEmployeeId) { filters.push("employee_id = ?"); bindings.push(requestedEmployeeId); }
  } else {
    filters.push("employee_uid = ?"); bindings.push(requester.uid);
  }
  const from = normalizeIsoDateKey(url.searchParams.get("from"));
  const to = normalizeIsoDateKey(url.searchParams.get("to"));
  if (from) { filters.push("absence_date >= ?"); bindings.push(from); }
  if (to) { filters.push("absence_date <= ?"); bindings.push(to); }
  const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  try {
    const result = await db.batch([
      db.prepare(`SELECT * FROM employee_absences ${whereSql} ORDER BY absence_date DESC, created_at DESC LIMIT ? OFFSET ?`).bind(...bindings, query.limit, query.offset),
      db.prepare(`SELECT COUNT(*) AS total FROM employee_absences ${whereSql}`).bind(...bindings),
    ]);
    return json(200, { ok: true, absences: (result[0]?.results || []).map(mapAbsenceRow), pagination: { limit: query.limit, offset: query.offset, total: Number(result[1]?.results?.[0]?.total || 0) } });
  } catch (error) {
    return serverError("absences_query_failed", error);
  }
}

async function createAbsence(request, db, requester) {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.value || {};
  const employeeUid = normalizeText(body.employeeUid);
  const employeeId = nullableText(body.employeeId);
  const date = normalizeIsoDateKey(body.date);
  const type = normalizeText(body.type || "full_day").toLowerCase();
  if (!employeeUid || !date || !['full_day', 'half_day'].includes(type)) {
    return json(400, { ok: false, message: "invalid_absence_payload" });
  }
  const id = normalizeText(body.id) || crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO employee_absences (
           id, employee_id, employee_uid, absence_date, absence_type, note,
           created_by_uid, source, source_updated_at, migrated_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'hr_api', ?, ?, ?, ?)`
      ).bind(id, employeeId, employeeUid, date, type, nullableText(body.note), requester.uid, now, now, now, now),
      buildAuditStatement(db, request, requester, { action: "absence.create", entityType: "employee_absence", entityId: id, before: null, after: { employeeId, employeeUid, date, type } }),
    ]);
    const row = await db.prepare("SELECT * FROM employee_absences WHERE id = ?").bind(id).first();
    return json(201, { ok: true, absence: mapAbsenceRow(row) });
  } catch (error) {
    return databaseMutationError("absence_create_failed", error);
  }
}

async function deleteAbsence(request, db, requester, id) {
  const row = await db.prepare("SELECT * FROM employee_absences WHERE id = ? LIMIT 1").bind(id).first();
  if (!row) return json(404, { ok: false, message: "absence_not_found" });
  try {
    await db.batch([
      db.prepare("DELETE FROM employee_absences WHERE id = ?").bind(id),
      buildAuditStatement(db, request, requester, { action: "absence.delete", entityType: "employee_absence", entityId: id, before: row, after: null }),
    ]);
    return json(200, { ok: true, id });
  } catch (error) {
    return databaseMutationError("absence_delete_failed", error);
  }
}

async function listServiceRequests(url, db, requester) {
  const manager = canViewServiceRequests(requester);
  const requestedEmployeeUid = normalizeText(url.searchParams.get("employeeUid"));
  const requestedEmployeeId = normalizeText(url.searchParams.get("employeeId"));
  if (!manager && requestedEmployeeUid && requestedEmployeeUid !== requester.uid) {
    return forbidden("service_requests_view_forbidden");
  }
  const query = parseListQuery(url.searchParams);
  const filters = [];
  const bindings = [];
  if (manager) {
    if (requestedEmployeeUid) { filters.push("employee_uid = ?"); bindings.push(requestedEmployeeUid); }
    if (requestedEmployeeId) { filters.push("employee_id = ?"); bindings.push(requestedEmployeeId); }
  } else {
    filters.push("employee_uid = ?"); bindings.push(requester.uid);
  }
  const status = normalizeText(url.searchParams.get("status")).toLowerCase();
  const requestType = normalizeText(url.searchParams.get("requestType"));
  if (status) { filters.push("status = ?"); bindings.push(status); }
  if (requestType) { filters.push("request_type = ?"); bindings.push(requestType); }
  const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  try {
    const result = await db.batch([
      db.prepare(`SELECT * FROM employee_service_requests ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...bindings, query.limit, query.offset),
      db.prepare(`SELECT COUNT(*) AS total FROM employee_service_requests ${whereSql}`).bind(...bindings),
    ]);
    return json(200, { ok: true, serviceRequests: (result[0]?.results || []).map(mapServiceRequestRow), pagination: { limit: query.limit, offset: query.offset, total: Number(result[1]?.results?.[0]?.total || 0) } });
  } catch (error) {
    return serverError("service_requests_query_failed", error);
  }
}

async function createServiceRequest(request, db, requester) {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.value || {};
  const manager = canManageServiceRequests(requester);
  const employeeUid = manager ? normalizeText(body.employeeUid || requester.uid) : requester.uid;
  const employeeId = manager ? nullableText(body.employeeId || body.employeeDocId || requesterEmployeeId(requester)) : nullableText(requesterEmployeeId(requester));
  const requestType = normalizeText(body.requestType);
  if (!employeeUid || !requestType) return json(400, { ok: false, message: "invalid_service_request_payload" });
  const id = normalizeText(body.id) || crypto.randomUUID();
  const now = new Date().toISOString();
  const employee = employeeId
    ? await db.prepare("SELECT id, name, email FROM employees WHERE id = ? LIMIT 1").bind(employeeId).first()
    : await db.prepare("SELECT id, name, email FROM employees WHERE auth_uid = ? LIMIT 1").bind(employeeUid).first();
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO employee_service_requests (
           id, employee_id, employee_uid, employee_name, employee_email, status,
           request_type, title, request_date, start_date, end_date, start_time,
           end_time, amount, letter_type, employee_note, hr_note, source,
           source_updated_at, migrated_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'hr_api', ?, ?, ?, ?)`
      ).bind(
        id, employee?.id || employeeId, employeeUid,
        normalizeText(body.employeeName || employee?.name) || null,
        nullableEmail(body.employeeEmail || employee?.email),
        requestType, nullableText(body.title), normalizeIsoDateKey(body.requestDate) || null,
        normalizeIsoDateKey(body.startDate) || null, normalizeIsoDateKey(body.endDate) || null,
        nullableText(body.startTime), nullableText(body.endTime), nullableNumber(body.amount),
        nullableText(body.letterType), nullableText(body.employeeNote), now, now, now, now
      ),
      buildAuditStatement(db, request, requester, { action: "service_request.create", entityType: "employee_service_request", entityId: id, before: null, after: { employeeUid, employeeId, requestType } }),
    ]);
    const row = await db.prepare("SELECT * FROM employee_service_requests WHERE id = ?").bind(id).first();
    return json(201, { ok: true, serviceRequest: mapServiceRequestRow(row) });
  } catch (error) {
    return databaseMutationError("service_request_create_failed", error);
  }
}

async function reviewServiceRequest(request, db, requester, id) {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const status = normalizeText(bodyResult.value?.status).toLowerCase();
  if (!['approved', 'rejected'].includes(status)) {
    return json(400, { ok: false, message: "invalid_service_review_status" });
  }
  const row = await db.prepare("SELECT * FROM employee_service_requests WHERE id = ? LIMIT 1").bind(id).first();
  if (!row) return json(404, { ok: false, message: "service_request_not_found" });
  if (normalizeText(row.status).toLowerCase() !== "pending") {
    return json(409, { ok: false, message: "service_request_already_reviewed" });
  }
  const now = new Date().toISOString();
  try {
    await db.batch([
      db.prepare(
        `UPDATE employee_service_requests SET status = ?, hr_note = ?,
           decided_at = ?, decided_by = ?, decided_by_email = ?, decided_by_name = ?,
           reviewed_at = ?, reviewed_by = ?, reviewed_by_email = ?, reviewed_by_name = ?,
           updated_at = ? WHERE id = ?`
      ).bind(
        status, nullableText(bodyResult.value?.hrNote), now, requester.uid,
        requester.email || null, requester.account?.display_name || requester.email || null,
        now, requester.uid, requester.email || null,
        requester.account?.display_name || requester.email || null, now, id
      ),
      buildAuditStatement(db, request, requester, { action: `service_request.${status}`, entityType: "employee_service_request", entityId: id, before: row, after: { status } }),
    ]);
    const updated = await db.prepare("SELECT * FROM employee_service_requests WHERE id = ?").bind(id).first();
    return json(200, { ok: true, serviceRequest: mapServiceRequestRow(updated) });
  } catch (error) {
    return databaseMutationError("service_request_review_failed", error);
  }
}



export function normalizeNotificationType(value) {
  const type = normalizeText(value).toLowerCase();
  return ["leave", "file", "message", "system"].includes(type) ? type : "system";
}

function mapNotificationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.target_uid,
    uid: row.target_uid,
    targetUid: row.target_uid,
    title: row.title,
    body: row.body || null,
    message: row.body || null,
    type: row.notification_type || "system",
    relatedTo: row.related_to || null,
    relatedId: row.related_id || null,
    relatedPath: row.related_path || null,
    isRead: Boolean(row.is_read),
    readAt: row.read_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}


function canReviewDailyTasks(requester) {
  return requester.role === "owner" || requester.role === "admin" || requester.role === "hr" ||
    requester.permissions.includes("daily_tasks.manage");
}

function canReviewWeeklyReports(requester) {
  return requester.role === "owner" || requester.role === "admin" || requester.role === "hr" ||
    requester.permissions.includes("weekly_reports.manage");
}

export function normalizeOperationalPayload(raw, kind, requester, existing = null) {
  const now = new Date().toISOString();
  const current = existing && typeof existing === "object" ? existing : {};
  const input = raw && typeof raw === "object" ? raw : {};
  const isDaily = kind === "daily_task";
  const createdByUid = normalizeText(input.createdByUid || current.createdByUid || requester.uid);
  const receiverUid = normalizeText(input.receiverUid || current.receiverUid) || null;
  const dateKey = normalizeIsoDateKey(
    isDaily ? (input.taskDate || current.taskDate) : (input.reportDate || current.reportDate)
  );
  const status = normalizeText(input.status || current.status || "draft").toLowerCase() === "sent" ? "sent" : "draft";
  const payload = {
    ...current,
    ...input,
    createdByUid,
    receiverUid,
    status,
    ...(isDaily ? { taskDate: dateKey || normalizeText(input.taskDate || current.taskDate) } : { reportDate: dateKey || normalizeText(input.reportDate || current.reportDate) }),
    createdAt: normalizeDateToIso(current.createdAt || input.createdAt) || now,
    updatedAt: now,
    sentAt: status === "sent" ? (normalizeDateToIso(input.sentAt || current.sentAt) || now) : null,
  };
  return { payload, createdByUid, receiverUid, dateKey: dateKey || null, status, now };
}

function mapOperationalRow(row) {
  const payload = parseJson(row?.payload_json, {});
  return {
    ...payload,
    id: row.id,
    createdByUid: row.created_by_uid,
    receiverUid: row.receiver_uid || null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listDailyTasks(url, db, requester) {
  const manager = canReviewDailyTasks(requester);
  const filters = [];
  const bindings = [];
  const requestedCreator = normalizeText(url.searchParams.get("createdByUid"));
  const requestedReceiver = normalizeText(url.searchParams.get("receiverUid"));
  const status = normalizeText(url.searchParams.get("status"));
  if (!manager) {
    filters.push("created_by_uid = ?"); bindings.push(requester.uid);
  } else if (requestedCreator) {
    filters.push("created_by_uid = ?"); bindings.push(requestedCreator);
  }
  if (requestedReceiver) { filters.push("receiver_uid = ?"); bindings.push(requestedReceiver); }
  if (status) { filters.push("status = ?"); bindings.push(status); }
  const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const query = parseListQuery(url);
  try {
    const [rows, count] = await db.batch([
      db.prepare(`SELECT * FROM hr_daily_tasks ${whereSql} ORDER BY task_date DESC, created_at DESC LIMIT ? OFFSET ?`).bind(...bindings, query.limit, query.offset),
      db.prepare(`SELECT COUNT(*) AS total FROM hr_daily_tasks ${whereSql}`).bind(...bindings),
    ]);
    return json(200, { ok: true, dailyTasks: (rows?.results || []).map(mapOperationalRow), pagination: { ...query, total: Number(count?.results?.[0]?.total || 0) } });
  } catch (error) { return serverError("daily_tasks_query_failed", error); }
}

async function createDailyTask(request, db, requester) {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const normalized = normalizeOperationalPayload(bodyResult.value, "daily_task", requester);
  if (!normalized.createdByUid || normalized.createdByUid !== requester.uid) {
    if (!canReviewDailyTasks(requester)) return forbidden("daily_tasks_manage_forbidden");
  }
  const id = normalizeText(bodyResult.value?.id) || crypto.randomUUID();
  try {
    await db.batch([
      db.prepare(`INSERT INTO hr_daily_tasks (id, created_by_uid, receiver_uid, task_date, status, payload_json, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'hr_api', ?, ?)`)
        .bind(id, normalized.createdByUid, normalized.receiverUid, normalized.dateKey, normalized.status, JSON.stringify(normalized.payload), normalized.payload.createdAt, normalized.now),
      buildAuditStatement(db, request, requester, { action: "daily_task.create", entityType: "hr_daily_task", entityId: id, before: null, after: normalized.payload }),
    ]);
    const row = await db.prepare("SELECT * FROM hr_daily_tasks WHERE id = ?").bind(id).first();
    return json(201, { ok: true, dailyTask: mapOperationalRow(row) });
  } catch (error) { return databaseMutationError("daily_task_create_failed", error); }
}

async function updateDailyTask(request, db, requester, id) {
  const row = await db.prepare("SELECT * FROM hr_daily_tasks WHERE id = ? LIMIT 1").bind(id).first();
  if (!row) return json(404, { ok: false, message: "daily_task_not_found" });
  const existing = mapOperationalRow(row);
  const manager = canReviewDailyTasks(requester);
  if (existing.createdByUid !== requester.uid && !manager) return forbidden("daily_tasks_manage_forbidden");
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const normalized = normalizeOperationalPayload(bodyResult.value, "daily_task", requester, existing);
  if (!manager) normalized.createdByUid = requester.uid;
  try {
    await db.batch([
      db.prepare(`UPDATE hr_daily_tasks SET created_by_uid = ?, receiver_uid = ?, task_date = ?, status = ?, payload_json = ?, updated_at = ? WHERE id = ?`)
        .bind(normalized.createdByUid, normalized.receiverUid, normalized.dateKey, normalized.status, JSON.stringify(normalized.payload), normalized.now, id),
      buildAuditStatement(db, request, requester, { action: "daily_task.update", entityType: "hr_daily_task", entityId: id, before: existing, after: normalized.payload }),
    ]);
    const updated = await db.prepare("SELECT * FROM hr_daily_tasks WHERE id = ?").bind(id).first();
    return json(200, { ok: true, dailyTask: mapOperationalRow(updated) });
  } catch (error) { return databaseMutationError("daily_task_update_failed", error); }
}

async function listWeeklyReports(url, db, requester) {
  const manager = canReviewWeeklyReports(requester);
  const filters = [];
  const bindings = [];
  const requestedCreator = normalizeText(url.searchParams.get("createdByUid"));
  const requestedReceiver = normalizeText(url.searchParams.get("receiverUid"));
  const status = normalizeText(url.searchParams.get("status"));
  if (!manager) {
    filters.push("created_by_uid = ?"); bindings.push(requester.uid);
  } else if (requestedCreator) {
    filters.push("created_by_uid = ?"); bindings.push(requestedCreator);
  }
  if (requestedReceiver) { filters.push("receiver_uid = ?"); bindings.push(requestedReceiver); }
  if (status) { filters.push("status = ?"); bindings.push(status); }
  const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const query = parseListQuery(url);
  try {
    const [rows, count] = await db.batch([
      db.prepare(`SELECT * FROM hr_weekly_reports ${whereSql} ORDER BY report_date DESC, created_at DESC LIMIT ? OFFSET ?`).bind(...bindings, query.limit, query.offset),
      db.prepare(`SELECT COUNT(*) AS total FROM hr_weekly_reports ${whereSql}`).bind(...bindings),
    ]);
    return json(200, { ok: true, weeklyReports: (rows?.results || []).map(mapOperationalRow), pagination: { ...query, total: Number(count?.results?.[0]?.total || 0) } });
  } catch (error) { return serverError("weekly_reports_query_failed", error); }
}

async function createWeeklyReport(request, db, requester) {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const normalized = normalizeOperationalPayload(bodyResult.value, "weekly_report", requester);
  if (!normalized.createdByUid || normalized.createdByUid !== requester.uid) {
    if (!canReviewWeeklyReports(requester)) return forbidden("weekly_reports_manage_forbidden");
  }
  const id = normalizeText(bodyResult.value?.id) || crypto.randomUUID();
  try {
    await db.batch([
      db.prepare(`INSERT INTO hr_weekly_reports (id, created_by_uid, receiver_uid, report_date, status, payload_json, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'hr_api', ?, ?)`)
        .bind(id, normalized.createdByUid, normalized.receiverUid, normalized.dateKey, normalized.status, JSON.stringify(normalized.payload), normalized.payload.createdAt, normalized.now),
      buildAuditStatement(db, request, requester, { action: "weekly_report.create", entityType: "hr_weekly_report", entityId: id, before: null, after: normalized.payload }),
    ]);
    const row = await db.prepare("SELECT * FROM hr_weekly_reports WHERE id = ?").bind(id).first();
    return json(201, { ok: true, weeklyReport: mapOperationalRow(row) });
  } catch (error) { return databaseMutationError("weekly_report_create_failed", error); }
}

async function updateWeeklyReport(request, db, requester, id) {
  const row = await db.prepare("SELECT * FROM hr_weekly_reports WHERE id = ? LIMIT 1").bind(id).first();
  if (!row) return json(404, { ok: false, message: "weekly_report_not_found" });
  const existing = mapOperationalRow(row);
  const manager = canReviewWeeklyReports(requester);
  if (existing.createdByUid !== requester.uid && !manager) return forbidden("weekly_reports_manage_forbidden");
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const normalized = normalizeOperationalPayload(bodyResult.value, "weekly_report", requester, existing);
  if (!manager) normalized.createdByUid = requester.uid;
  try {
    await db.batch([
      db.prepare(`UPDATE hr_weekly_reports SET created_by_uid = ?, receiver_uid = ?, report_date = ?, status = ?, payload_json = ?, updated_at = ? WHERE id = ?`)
        .bind(normalized.createdByUid, normalized.receiverUid, normalized.dateKey, normalized.status, JSON.stringify(normalized.payload), normalized.now, id),
      buildAuditStatement(db, request, requester, { action: "weekly_report.update", entityType: "hr_weekly_report", entityId: id, before: existing, after: normalized.payload }),
    ]);
    const updated = await db.prepare("SELECT * FROM hr_weekly_reports WHERE id = ?").bind(id).first();
    return json(200, { ok: true, weeklyReport: mapOperationalRow(updated) });
  } catch (error) { return databaseMutationError("weekly_report_update_failed", error); }
}

async function importTasksReportsSnapshot(request, env) {
  const authorized = await verifySyncSecret(request, env.HR_SYNC_SECRET);
  if (!authorized) return json(401, { ok: false, message: "invalid_hr_sync_secret" });
  const bodyResult = await readJsonBody(request, 5_000_000);
  if (!bodyResult.ok) return bodyResult.response;
  const dailyTasks = Array.isArray(bodyResult.value?.dailyTasks) ? bodyResult.value.dailyTasks : [];
  const weeklyReports = Array.isArray(bodyResult.value?.weeklyReports) ? bodyResult.value.weeklyReports : [];
  if (dailyTasks.length > MAX_IMPORT_ROWS || weeklyReports.length > MAX_IMPORT_ROWS) {
    return json(413, { ok: false, message: "tasks_reports_import_batch_too_large", maxRowsPerType: MAX_IMPORT_ROWS });
  }
  const runId = normalizeText(bodyResult.value?.runId) || crypto.randomUUID();
  const complete = Boolean(bodyResult.value?.complete);
  const now = new Date().toISOString();
  const statements = [env.HR_DB.prepare(`INSERT INTO hr_migration_runs (id, source, status, daily_tasks_received, weekly_reports_received, details_json, started_at) VALUES (?, 'firestore_tasks_reports', 'running', ?, ?, '{}', ?) ON CONFLICT(id) DO UPDATE SET status = 'running', daily_tasks_received = daily_tasks_received + excluded.daily_tasks_received, weekly_reports_received = weekly_reports_received + excluded.weekly_reports_received`).bind(runId, dailyTasks.length, weeklyReports.length, now)];
  for (const raw of dailyTasks) {
    const id = normalizeText(raw?.id); const createdByUid = normalizeText(raw?.createdByUid); if (!id || !createdByUid) continue;
    const normalized = normalizeOperationalPayload(raw, "daily_task", { uid: createdByUid });
    statements.push(env.HR_DB.prepare(`INSERT INTO hr_daily_tasks (id, created_by_uid, receiver_uid, task_date, status, payload_json, source, source_updated_at, migrated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'firestore', ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET created_by_uid = excluded.created_by_uid, receiver_uid = excluded.receiver_uid, task_date = excluded.task_date, status = excluded.status, payload_json = excluded.payload_json, source = excluded.source, source_updated_at = excluded.source_updated_at, migrated_at = excluded.migrated_at, updated_at = excluded.updated_at`).bind(id, createdByUid, normalized.receiverUid, normalized.dateKey, normalized.status, JSON.stringify(normalized.payload), normalizeDateToIso(raw?.updatedAt), now, normalizeDateToIso(raw?.createdAt) || now, now));
  }
  for (const raw of weeklyReports) {
    const id = normalizeText(raw?.id); const createdByUid = normalizeText(raw?.createdByUid); if (!id || !createdByUid) continue;
    const normalized = normalizeOperationalPayload(raw, "weekly_report", { uid: createdByUid });
    statements.push(env.HR_DB.prepare(`INSERT INTO hr_weekly_reports (id, created_by_uid, receiver_uid, report_date, status, payload_json, source, source_updated_at, migrated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'firestore', ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET created_by_uid = excluded.created_by_uid, receiver_uid = excluded.receiver_uid, report_date = excluded.report_date, status = excluded.status, payload_json = excluded.payload_json, source = excluded.source, source_updated_at = excluded.source_updated_at, migrated_at = excluded.migrated_at, updated_at = excluded.updated_at`).bind(id, createdByUid, normalized.receiverUid, normalized.dateKey, normalized.status, JSON.stringify(normalized.payload), normalizeDateToIso(raw?.updatedAt), now, normalizeDateToIso(raw?.createdAt) || now, now));
  }
  if (complete) statements.push(env.HR_DB.prepare("UPDATE hr_migration_runs SET status = 'completed', finished_at = ? WHERE id = ?").bind(now, runId));
  try {
    await env.HR_DB.batch(statements);
    return json(200, { ok: true, runId, complete, dailyTasks: dailyTasks.length, weeklyReports: weeklyReports.length });
  } catch (error) { return databaseMutationError("tasks_reports_import_failed", error); }
}

async function listNotifications(url, db, requester) {
  const requestedTarget = normalizeText(url.searchParams.get("targetUid"));
  const targetUid = requestedTarget || requester.uid;
  if (targetUid !== requester.uid && !canManageNotifications(requester)) {
    return forbidden("notifications_view_forbidden");
  }
  const query = parseListQuery(url.searchParams);
  const filters = ["target_uid = ?"];
  const bindings = [targetUid];
  const unread = normalizeText(url.searchParams.get("unread")).toLowerCase();
  if (["1", "true", "yes"].includes(unread)) filters.push("is_read = 0");
  const whereSql = `WHERE ${filters.join(" AND ")}`;
  try {
    const result = await db.batch([
      db.prepare(`SELECT * FROM hr_notifications ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .bind(...bindings, query.limit, query.offset),
      db.prepare(`SELECT COUNT(*) AS total FROM hr_notifications ${whereSql}`)
        .bind(...bindings),
    ]);
    return json(200, {
      ok: true,
      notifications: (result[0]?.results || []).map(mapNotificationRow),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total: Number(result[1]?.results?.[0]?.total || 0),
      },
    });
  } catch (error) {
    return serverError("notifications_query_failed", error);
  }
}

async function createNotification(request, db, requester) {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.value || {};
  const directTarget = normalizeText(body.targetUid || body.userId || body.uid);
  const requestedRoles = normalizeStringArray(body.targetRoles)
    .map(normalizeRole)
    .filter(role => KNOWN_ROLES.has(role));
  let targetUids = [];
  if (requestedRoles.length) {
    const allowedEmployeeBroadcastRoles = new Set(["owner", "admin", "hr"]);
    if (
      !canManageNotifications(requester) &&
      requestedRoles.some(role => !allowedEmployeeBroadcastRoles.has(role))
    ) {
      return forbidden("notifications_broadcast_forbidden");
    }
    const placeholders = requestedRoles.map(() => "?").join(",");
    const rows = await db.prepare(
      `SELECT uid FROM accounts WHERE is_active = 1 AND role_key IN (${placeholders})`
    ).bind(...requestedRoles).all();
    targetUids = (rows.results || []).map(row => normalizeText(row.uid)).filter(Boolean);
  } else if (directTarget) {
    targetUids = [directTarget];
  }
  targetUids = Array.from(new Set(targetUids.filter(uid => uid && uid !== normalizeText(body.excludeUid))));
  if (!targetUids.length) return json(400, { ok: false, message: "notification_target_required" });
  const title = normalizeText(body.title) || "إشعار داخلي";
  const messageBody = normalizeText(body.body || body.message);
  const type = normalizeNotificationType(body.type);
  const now = new Date().toISOString();
  const statements = targetUids.map(targetUid => db.prepare(
    `INSERT INTO hr_notifications (
       id, target_uid, title, body, notification_type, related_to,
       related_id, related_path, is_read, read_at, source,
       created_by_uid, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 'hr_api', ?, ?, ?)`
  ).bind(
    crypto.randomUUID(), targetUid, title, messageBody || null, type,
    nullableText(body.relatedTo), nullableText(body.relatedId),
    nullableText(body.relatedPath), requester.uid, now, now
  ));
  try {
    await db.batch(statements);
    return json(201, { ok: true, created: targetUids.length, targetUids });
  } catch (error) {
    return databaseMutationError("notification_create_failed", error);
  }
}

async function markNotificationRead(_request, db, requester, id) {
  const row = await db.prepare("SELECT id, target_uid FROM hr_notifications WHERE id = ? LIMIT 1").bind(id).first();
  if (!row) return json(404, { ok: false, message: "notification_not_found" });
  if (row.target_uid !== requester.uid && !canManageNotifications(requester)) {
    return forbidden("notification_update_forbidden");
  }
  const now = new Date().toISOString();
  await db.prepare("UPDATE hr_notifications SET is_read = 1, read_at = ?, updated_at = ? WHERE id = ?")
    .bind(now, now, id).run();
  return json(200, { ok: true, id });
}

async function markNotificationsRead(request, db, requester) {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const ids = normalizeStringArray(bodyResult.value?.ids).slice(0, 200);
  const now = new Date().toISOString();
  try {
    if (ids.length) {
      const placeholders = ids.map(() => "?").join(",");
      await db.prepare(
        `UPDATE hr_notifications SET is_read = 1, read_at = ?, updated_at = ?
         WHERE target_uid = ? AND id IN (${placeholders})`
      ).bind(now, now, requester.uid, ...ids).run();
    } else {
      await db.prepare(
        "UPDATE hr_notifications SET is_read = 1, read_at = ?, updated_at = ? WHERE target_uid = ? AND is_read = 0"
      ).bind(now, now, requester.uid).run();
    }
    return json(200, { ok: true });
  } catch (error) {
    return databaseMutationError("notifications_mark_read_failed", error);
  }
}

function mapAuditRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    action: row.action,
    category: row.category || "system",
    severity: row.severity || "info",
    status: row.status || "success",
    message: row.message || row.action,
    entityType: row.entity_type,
    entityId: row.entity_id || "",
    entityPath: row.entity_path || "",
    actor: {
      uid: row.actor_uid || "",
      name: row.actor_name || "",
      email: row.actor_email || "",
      role: row.actor_role || "",
    },
    source: parseJson(row.source_json, {}),
    relatedIds: parseJson(row.related_ids_json, {}),
    changes: parseJsonArray(row.changes_json),
    meta: parseJson(row.meta_json, {}),
    before: parseJson(row.before_json, null),
    after: parseJson(row.after_json, null),
    requestId: row.request_id || "",
    sessionId: row.session_id || "",
    occurredAt: row.occurred_at || row.created_at,
    createdAt: row.created_at,
  };
}

async function listAuditLogs(url, db) {
  const query = parseListQuery(url.searchParams);
  const filters = [];
  const bindings = [];
  for (const [param, column] of [["category", "category"], ["status", "status"], ["severity", "severity"], ["entityType", "entity_type"]]) {
    const value = normalizeText(url.searchParams.get(param));
    if (value) { filters.push(`${column} = ?`); bindings.push(value); }
  }
  const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  try {
    const result = await db.batch([
      db.prepare(`SELECT * FROM hr_audit_logs ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .bind(...bindings, query.limit, query.offset),
      db.prepare(`SELECT COUNT(*) AS total FROM hr_audit_logs ${whereSql}`).bind(...bindings),
    ]);
    return json(200, {
      ok: true,
      auditLogs: (result[0]?.results || []).map(mapAuditRow),
      pagination: { limit: query.limit, offset: query.offset, total: Number(result[1]?.results?.[0]?.total || 0) },
    });
  } catch (error) {
    return serverError("audit_logs_query_failed", error);
  }
}

async function createAuditLog(request, db, requester) {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.value || {};
  const action = normalizeText(body.action);
  const entityType = normalizeText(body.entityType);
  if (!action || !entityType) return json(400, { ok: false, message: "invalid_audit_payload" });
  const id = normalizeText(body.id) || crypto.randomUUID();
  const now = new Date().toISOString();
  const occurredAt = normalizeDateToIso(body.occurredAt || body.clientTimestamp) || now;
  try {
    await db.prepare(
      `INSERT INTO hr_audit_logs (
         id, actor_uid, actor_email, actor_role, actor_name, action, category,
         severity, status, message, entity_type, entity_id, entity_path,
         before_json, after_json, source_json, related_ids_json, changes_json,
         meta_json, request_id, session_id, occurred_at, ip_address, user_agent,
         source_system, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'hr_api', ?)`
    ).bind(
      id, requester.uid, requester.email || null, requester.account?.role_key || null,
      requester.account?.display_name || requester.email || null,
      action, normalizeText(body.category) || "system",
      normalizeText(body.severity) || "info", normalizeText(body.status) || "success",
      normalizeText(body.message) || action, entityType, nullableText(body.entityId),
      nullableText(body.entityPath), body.before ? safeJsonStringify(body.before) : null,
      body.after ? safeJsonStringify(body.after) : null,
      safeJsonStringify(body.source || {}), safeJsonStringify(body.relatedIds || {}),
      safeJsonStringify(body.changes || []), safeJsonStringify(body.meta || {}),
      nullableText(body.requestId), nullableText(body.sessionId), occurredAt,
      request.headers.get("CF-Connecting-IP") || null,
      request.headers.get("User-Agent") || null, now
    ).run();
    return json(201, { ok: true, id });
  } catch (error) {
    return databaseMutationError("audit_log_create_failed", error);
  }
}

async function importNotificationsAuditSnapshot(request, env) {
  if (!env.HR_SYNC_SECRET) return json(503, { ok: false, message: "hr_sync_secret_missing" });
  const supplied = normalizeText(request.headers.get("X-HR-Sync-Secret"));
  if (!supplied || supplied !== env.HR_SYNC_SECRET) return json(401, { ok: false, message: "invalid_hr_sync_secret" });
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.value || {};
  const notifications = Array.isArray(body.notifications) ? body.notifications.slice(0, MAX_IMPORT_ROWS) : [];
  const auditLogs = Array.isArray(body.auditLogs) ? body.auditLogs.slice(0, MAX_IMPORT_ROWS) : [];
  const now = new Date().toISOString();
  const statements = [];
  for (const raw of notifications) {
    const id = normalizeText(raw.id) || crypto.randomUUID();
    const targetUid = normalizeText(raw.targetUid || raw.userId || raw.uid);
    if (!targetUid) continue;
    statements.push(env.HR_DB.prepare(
      `INSERT INTO hr_notifications (
         id, target_uid, title, body, notification_type, related_to, related_id,
         related_path, is_read, read_at, source, source_updated_at, migrated_at,
         created_by_uid, created_at, updated_at
       ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'firestore', ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM accounts WHERE uid = ?)
       ON CONFLICT(id) DO UPDATE SET
         target_uid=excluded.target_uid, title=excluded.title, body=excluded.body,
         notification_type=excluded.notification_type, related_to=excluded.related_to,
         related_id=excluded.related_id, related_path=excluded.related_path,
         is_read=excluded.is_read, read_at=excluded.read_at,
         source_updated_at=excluded.source_updated_at, migrated_at=excluded.migrated_at,
         updated_at=excluded.updated_at`
    ).bind(
      id, targetUid, normalizeText(raw.title) || "إشعار داخلي",
      nullableText(raw.body || raw.message), normalizeNotificationType(raw.type),
      nullableText(raw.relatedTo), nullableText(raw.relatedId), nullableText(raw.relatedPath),
      parseBoolean(raw.isRead, false) ? 1 : 0, normalizeDateToIso(raw.readAt),
      normalizeDateToIso(raw.updatedAt || raw.createdAt), now,
      nullableText(raw.createdByUid), normalizeDateToIso(raw.createdAt) || now,
      normalizeDateToIso(raw.updatedAt || raw.createdAt) || now, targetUid
    ));
  }
  for (const raw of auditLogs) {
    const actor = isPlainObject(raw.actor) ? raw.actor : {};
    const id = normalizeText(raw.id) || crypto.randomUUID();
    const createdAt = normalizeDateToIso(raw.createdAt || raw.occurredAt) || now;
    statements.push(env.HR_DB.prepare(
      `INSERT INTO hr_audit_logs (
         id, actor_uid, actor_email, actor_role, actor_name, action, category,
         severity, status, message, entity_type, entity_id, entity_path,
         before_json, after_json, source_json, related_ids_json, changes_json,
         meta_json, request_id, session_id, occurred_at, source_system,
         source_updated_at, migrated_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'firestore', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET action=excluded.action, category=excluded.category,
         severity=excluded.severity, status=excluded.status, message=excluded.message,
         entity_type=excluded.entity_type, entity_id=excluded.entity_id,
         entity_path=excluded.entity_path, source_json=excluded.source_json,
         changes_json=excluded.changes_json, meta_json=excluded.meta_json,
         source_updated_at=excluded.source_updated_at, migrated_at=excluded.migrated_at`
    ).bind(
      id, nullableText(actor.uid || raw.actorUid), nullableEmail(actor.email || raw.actorEmail),
      nullableText(actor.role || raw.actorRole), nullableText(actor.name || raw.actorName),
      normalizeText(raw.action) || "legacy_event", normalizeText(raw.category) || "system",
      normalizeText(raw.severity) || "info", normalizeText(raw.status) || "success",
      normalizeText(raw.message) || normalizeText(raw.action) || "Legacy audit event",
      normalizeText(raw.entityType) || "system", nullableText(raw.entityId), nullableText(raw.entityPath),
      raw.before ? safeJsonStringify(raw.before) : null, raw.after ? safeJsonStringify(raw.after) : null,
      safeJsonStringify(raw.source || {}), safeJsonStringify(raw.relatedIds || {}),
      safeJsonStringify(raw.changes || []), safeJsonStringify(raw.meta || {}),
      nullableText(raw.requestId), nullableText(raw.sessionId), normalizeDateToIso(raw.occurredAt) || createdAt,
      normalizeDateToIso(raw.updatedAt || raw.createdAt), now, createdAt
    ));
  }
  try {
    if (statements.length) await env.HR_DB.batch(statements);
    return json(200, { ok: true, notifications: notifications.length, auditLogs: auditLogs.length });
  } catch (error) {
    return databaseMutationError("notifications_audit_import_failed", error);
  }
}

function normalizePayrollMonth(value) {
  const text = normalizeText(value);
  const match = text.match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? text : "";
}

function normalizePayrollDeductions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => ({
      id: normalizeText(item?.id) || `deduction-${index + 1}`,
      title: normalizeText(item?.title),
      amount: Math.max(0, Number(item?.amount || 0)),
    }))
    .filter(item => item.title && Number.isFinite(item.amount) && item.amount > 0);
}

function mapPayrollRecordRow(row) {
  const mudadDocument = parseJson(row.mudad_document_json, null);
  return {
    id: row.id,
    employeeId: row.employee_id || null,
    employeeUid: row.employee_uid,
    payrollMonth: row.payroll_month,
    monthStart: row.month_start,
    monthEnd: row.month_end,
    calculationStartDate: row.calculation_start_date || null,
    calculationEndDate: row.calculation_end_date || null,
    baseSalary: Number(row.base_salary || 0),
    housingAllowance: nullableNumber(row.housing_allowance),
    transportationAllowance: nullableNumber(row.transportation_allowance),
    otherAllowances: nullableNumber(row.other_allowances),
    allowances: Number(row.allowances || 0),
    absenceDays: Number(row.absence_days || 0),
    absenceDeduction: Number(row.absence_deduction || 0),
    expectedWorkHours: nullableNumber(row.expected_work_hours),
    actualWorkedHours: nullableNumber(row.actual_worked_hours),
    attendanceLateHours: nullableNumber(row.attendance_late_hours),
    attendanceMissingHours: nullableNumber(row.attendance_missing_hours),
    attendanceOvertimeHours: nullableNumber(row.attendance_overtime_hours),
    attendanceCompleteDays: nullableNumber(row.attendance_complete_days),
    attendanceIncompleteDays: nullableNumber(row.attendance_incomplete_days),
    attendanceAbsentDays: nullableNumber(row.attendance_absent_days),
    attendanceAbsenceDeduction: nullableNumber(row.attendance_absence_deduction),
    attendanceSource: row.attendance_source || "cloudflare_attendance",
    attendanceSummary: parseJson(row.attendance_summary_json, {}),
    scheduleSnapshot: parseJson(row.schedule_snapshot_json, null),
    delayDeduction: Number(row.delay_deduction || 0),
    overtimeBonus: Number(row.overtime_bonus || 0),
    insuranceDeduction: Number(row.insurance_deduction || 0),
    salaryDeductions: parseJsonArray(row.salary_deductions_json),
    salaryAdvanceDeduction: Number(row.salary_advance_deduction || 0),
    salaryAdvanceRequestIds: parseJsonArray(row.salary_advance_request_ids_json),
    totalSalaryDeductions: Number(row.total_salary_deductions || 0),
    absenceEntries: parseJsonArray(row.absence_entries_json),
    grossSalary: nullableNumber(row.gross_salary),
    finalSalary: Number(row.final_salary || 0),
    mudadDocument,
    status: row.status || "finalized",
    source: row.source || "hr_api",
    sourceUpdatedAt: row.source_updated_at || null,
    migratedAt: row.migrated_at || null,
    createdAt: row.created_at,
    createdByUid: row.created_by_uid || null,
    createdByEmail: row.created_by_email || null,
    updatedAt: row.updated_at,
  };
}

export function normalizeImportedPayrollRecord(raw) {
  const id = normalizeText(raw?.id);
  const employeeUid = normalizeText(raw?.employeeUid);
  const employeeId = nullableText(raw?.employeeId || raw?.employeeDocId);
  const payrollMonth = normalizePayrollMonth(raw?.payrollMonth);
  const monthStart = normalizeIsoDateKey(raw?.monthStart || `${payrollMonth}-01`);
  const monthEnd = normalizeIsoDateKey(raw?.monthEnd);
  if (!id || !employeeUid || !payrollMonth || !monthStart || !monthEnd) return null;
  const baseSalary = Math.max(0, Number(raw?.baseSalary || 0));
  const allowances = Math.max(0, Number(raw?.allowances || 0));
  const attendanceAbsenceDeduction = Math.max(0, Number(raw?.attendanceAbsenceDeduction || 0));
  const absenceDeduction = Math.max(0, Number(raw?.absenceDeduction || 0));
  const delayDeduction = Math.max(0, Number(raw?.delayDeduction || 0));
  const overtimeBonus = Math.max(0, Number(raw?.overtimeBonus || 0));
  const insuranceDeduction = Math.max(0, Number(raw?.insuranceDeduction || 0));
  const salaryDeductions = normalizePayrollDeductions(raw?.salaryDeductions);
  const salaryAdvanceDeduction = Math.max(0, Number(raw?.salaryAdvanceDeduction || 0));
  const manualDeductions = salaryDeductions.reduce((sum, item) => sum + item.amount, 0);
  const totalSalaryDeductions = Math.max(
    0,
    Number(raw?.totalSalaryDeductions ?? manualDeductions + salaryAdvanceDeduction)
  );
  const grossSalary = Math.max(
    0,
    Number(
      raw?.grossSalary ??
        baseSalary + allowances + overtimeBonus - delayDeduction - attendanceAbsenceDeduction
    )
  );
  return {
    id,
    employeeId,
    employeeUid,
    payrollMonth,
    monthStart,
    monthEnd,
    calculationStartDate: normalizeIsoDateKey(raw?.calculationStartDate || monthStart) || monthStart,
    calculationEndDate: normalizeIsoDateKey(raw?.calculationEndDate || monthEnd) || monthEnd,
    baseSalary,
    housingAllowance: nullableNumber(raw?.housingAllowance),
    transportationAllowance: nullableNumber(raw?.transportationAllowance),
    otherAllowances: nullableNumber(raw?.otherAllowances),
    allowances,
    absenceDays: Math.max(0, Number(raw?.absenceDays || 0)),
    absenceDeduction,
    expectedWorkHours: nullableNumber(raw?.expectedWorkHours),
    actualWorkedHours: nullableNumber(raw?.actualWorkedHours),
    attendanceLateHours: nullableNumber(raw?.attendanceLateHours),
    attendanceMissingHours: nullableNumber(raw?.attendanceMissingHours),
    attendanceOvertimeHours: nullableNumber(raw?.attendanceOvertimeHours),
    attendanceCompleteDays: nullableNumber(raw?.attendanceCompleteDays),
    attendanceIncompleteDays: nullableNumber(raw?.attendanceIncompleteDays),
    attendanceAbsentDays: nullableNumber(raw?.attendanceAbsentDays),
    attendanceAbsenceDeduction,
    attendanceSource: normalizeText(raw?.attendanceSource) || "cloudflare_attendance",
    attendanceSummary: isPlainObject(raw?.attendanceSummary) ? raw.attendanceSummary : {},
    scheduleSnapshot: isPlainObject(raw?.scheduleSnapshot) ? raw.scheduleSnapshot : {},
    delayDeduction,
    overtimeBonus,
    insuranceDeduction,
    salaryDeductions,
    salaryAdvanceDeduction,
    salaryAdvanceRequestIds: normalizeStringArray(raw?.salaryAdvanceRequestIds),
    totalSalaryDeductions,
    absenceEntries: Array.isArray(raw?.absenceEntries)
      ? raw.absenceEntries
      : Array.isArray(raw?.absenceEntriesSummary)
        ? raw.absenceEntriesSummary
        : [],
    grossSalary,
    finalSalary: Math.max(0, Number(raw?.finalSalary || 0)),
    mudadDocument: isPlainObject(raw?.mudadDocument) ? raw.mudadDocument : null,
    status: normalizeText(raw?.status || "finalized").toLowerCase(),
    sourceUpdatedAt: normalizeDateToIso(raw?.updatedAt || raw?.createdAt),
    createdAt: normalizeDateToIso(raw?.createdAt) || new Date().toISOString(),
    createdByUid: nullableText(raw?.createdByUid),
    createdByEmail: nullableEmail(raw?.createdByEmail),
    updatedAt: normalizeDateToIso(raw?.updatedAt || raw?.createdAt) || new Date().toISOString(),
  };
}

async function listPayrollRecords(url, db, requester) {
  const manager = canViewPayroll(requester);
  const requestedEmployeeUid = normalizeText(url.searchParams.get("employeeUid"));
  const requestedEmployeeId = normalizeText(url.searchParams.get("employeeId"));
  if (!manager && requestedEmployeeUid && requestedEmployeeUid !== requester.uid) {
    return forbidden("payroll_view_forbidden");
  }
  if (!manager && requestedEmployeeId && requestedEmployeeId !== requesterEmployeeId(requester)) {
    return forbidden("payroll_view_forbidden");
  }
  const query = parseListQuery(url.searchParams);
  const filters = [];
  const bindings = [];
  if (manager) {
    if (requestedEmployeeUid) { filters.push("employee_uid = ?"); bindings.push(requestedEmployeeUid); }
    if (requestedEmployeeId) { filters.push("employee_id = ?"); bindings.push(requestedEmployeeId); }
  } else {
    filters.push("employee_uid = ?");
    bindings.push(requester.uid);
  }
  const payrollMonth = normalizePayrollMonth(url.searchParams.get("payrollMonth"));
  if (payrollMonth) { filters.push("payroll_month = ?"); bindings.push(payrollMonth); }
  const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  try {
    const result = await db.batch([
      db.prepare(`SELECT * FROM employee_payroll_records ${whereSql} ORDER BY payroll_month DESC, created_at DESC LIMIT ? OFFSET ?`).bind(...bindings, query.limit, query.offset),
      db.prepare(`SELECT COUNT(*) AS total FROM employee_payroll_records ${whereSql}`).bind(...bindings),
    ]);
    return json(200, {
      ok: true,
      payrollRecords: (result[0]?.results || []).map(mapPayrollRecordRow),
      pagination: { limit: query.limit, offset: query.offset, total: Number(result[1]?.results?.[0]?.total || 0) },
    });
  } catch (error) {
    return serverError("payroll_records_query_failed", error);
  }
}

async function listPayrollAdvances(url, db, requester) {
  const manager = canViewPayroll(requester);
  const requestedEmployeeUid = normalizeText(url.searchParams.get("employeeUid"));
  const requestedEmployeeId = normalizeText(url.searchParams.get("employeeId"));
  if (!manager && requestedEmployeeUid && requestedEmployeeUid !== requester.uid) return forbidden("payroll_view_forbidden");
  const filters = ["request_type = 'salary_advance'", "status = 'approved'", "payroll_record_id IS NULL"];
  const bindings = [];
  if (manager) {
    if (requestedEmployeeUid) { filters.push("employee_uid = ?"); bindings.push(requestedEmployeeUid); }
    if (requestedEmployeeId) { filters.push("employee_id = ?"); bindings.push(requestedEmployeeId); }
  } else {
    filters.push("employee_uid = ?"); bindings.push(requester.uid);
  }
  try {
    const result = await db.prepare(`SELECT * FROM employee_service_requests WHERE ${filters.join(" AND ")} ORDER BY decided_at ASC, created_at ASC`).bind(...bindings).all();
    return json(200, { ok: true, advances: (result.results || []).map(mapServiceRequestRow) });
  } catch (error) {
    return serverError("payroll_advances_query_failed", error);
  }
}

export function computePayrollFinancialTotals(input) {
  const baseSalary = Math.max(0, Number(input?.baseSalary || 0));
  const allowances = Math.max(0, Number(input?.allowances || 0));
  const overtimeBonus = Math.max(0, Number(input?.overtimeBonus || 0));
  const delayDeduction = Math.max(0, Number(input?.delayDeduction || 0));
  const attendanceAbsenceDeduction = Math.max(
    0,
    Number(input?.attendanceAbsenceDeduction || 0)
  );
  const combinedAbsenceDeduction = Math.max(
    0,
    Number(input?.absenceDeduction || 0)
  );
  const insuranceDeduction = Math.max(
    0,
    Number(input?.insuranceDeduction || 0)
  );
  const manualSalaryDeductions = Math.max(
    0,
    Number(input?.manualSalaryDeductions || 0)
  );
  const salaryAdvanceDeduction = Math.max(
    0,
    Number(input?.salaryAdvanceDeduction || 0)
  );
  const manualAbsenceDeduction = Math.max(
    0,
    combinedAbsenceDeduction - attendanceAbsenceDeduction
  );
  const totalSalaryDeductions =
    manualSalaryDeductions + salaryAdvanceDeduction;
  const grossSalary = Math.max(
    0,
    baseSalary +
      allowances +
      overtimeBonus -
      delayDeduction -
      attendanceAbsenceDeduction
  );
  const finalSalary = Math.max(
    0,
    grossSalary -
      totalSalaryDeductions -
      insuranceDeduction -
      manualAbsenceDeduction
  );
  return {
    manualAbsenceDeduction,
    totalSalaryDeductions,
    grossSalary,
    finalSalary,
  };
}

async function createPayrollRecord(request, db, requester) {
  const bodyResult = await readJsonBody(request, 2_000_000);
  if (!bodyResult.ok) return bodyResult.response;
  const raw = bodyResult.value || {};
  const id = normalizeText(raw.id) || crypto.randomUUID();
  const employeeId = normalizeText(raw.employeeId);
  const employeeUid = normalizeText(raw.employeeUid);
  const payrollMonth = normalizePayrollMonth(raw.payrollMonth);
  const monthStart = normalizeIsoDateKey(raw.monthStart);
  const monthEnd = normalizeIsoDateKey(raw.monthEnd);
  if (!employeeId || !employeeUid || !payrollMonth || !monthStart || !monthEnd) {
    return json(400, { ok: false, message: "invalid_payroll_identity_or_month" });
  }
  const employee = await db.prepare("SELECT id, auth_uid FROM employees WHERE id = ? OR auth_uid = ? LIMIT 1").bind(employeeId, employeeUid).first();
  if (!employee) return json(404, { ok: false, message: "employee_not_found" });
  const existing = await db.prepare("SELECT id FROM employee_payroll_records WHERE employee_id = ? AND payroll_month = ? LIMIT 1").bind(employee.id, payrollMonth).first();
  if (existing) return json(409, { ok: false, message: "payroll_record_exists" });

  const requestedAdvanceIds = normalizeStringArray(raw.salaryAdvanceRequestIds);
  let advanceRows = [];
  if (requestedAdvanceIds.length) {
    const placeholders = requestedAdvanceIds.map(() => "?").join(",");
    const result = await db.prepare(
      `SELECT * FROM employee_service_requests
       WHERE id IN (${placeholders}) AND request_type = 'salary_advance'
         AND status = 'approved' AND payroll_record_id IS NULL
         AND (employee_id = ? OR employee_uid = ?)`
    ).bind(...requestedAdvanceIds, employee.id, employeeUid).all();
    advanceRows = result.results || [];
    if (advanceRows.length !== requestedAdvanceIds.length) {
      return json(409, { ok: false, message: "invalid_or_settled_salary_advance" });
    }
  }

  const salaryDeductions = normalizePayrollDeductions(raw.salaryDeductions);
  const manualDeductionTotal = salaryDeductions.reduce(
    (sum, item) => sum + item.amount,
    0
  );
  const salaryAdvanceDeduction = advanceRows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.amount || 0)),
    0
  );
  const baseSalary = Math.max(0, Number(raw.baseSalary || 0));
  const allowances = Math.max(0, Number(raw.allowances || 0));
  const attendanceAbsenceDeduction = Math.max(
    0,
    Number(raw.attendanceAbsenceDeduction || 0)
  );
  const combinedAbsenceDeduction = Math.max(
    0,
    Number(raw.absenceDeduction || 0)
  );
  const delayDeduction = Math.max(0, Number(raw.delayDeduction || 0));
  const overtimeBonus = Math.max(0, Number(raw.overtimeBonus || 0));
  const insuranceDeduction = Math.max(
    0,
    Number(raw.insuranceDeduction || 0)
  );
  const financialTotals = computePayrollFinancialTotals({
    baseSalary,
    allowances,
    overtimeBonus,
    delayDeduction,
    attendanceAbsenceDeduction,
    absenceDeduction: combinedAbsenceDeduction,
    insuranceDeduction,
    manualSalaryDeductions: manualDeductionTotal,
    salaryAdvanceDeduction,
  });
  const { totalSalaryDeductions, grossSalary, finalSalary } = financialTotals;
  const now = new Date().toISOString();
  const normalized = {
    id, employeeId: employee.id, employeeUid, payrollMonth, monthStart, monthEnd,
    calculationStartDate: normalizeIsoDateKey(raw.calculationStartDate || monthStart) || monthStart,
    calculationEndDate: normalizeIsoDateKey(raw.calculationEndDate || monthEnd) || monthEnd,
    baseSalary,
    housingAllowance: nullableNumber(raw.housingAllowance),
    transportationAllowance: nullableNumber(raw.transportationAllowance),
    otherAllowances: nullableNumber(raw.otherAllowances),
    allowances,
    absenceDays: Math.max(0, Number(raw.absenceDays || 0)),
    absenceDeduction: combinedAbsenceDeduction,
    expectedWorkHours: nullableNumber(raw.expectedWorkHours),
    actualWorkedHours: nullableNumber(raw.actualWorkedHours),
    attendanceLateHours: nullableNumber(raw.attendanceLateHours),
    attendanceMissingHours: nullableNumber(raw.attendanceMissingHours),
    attendanceOvertimeHours: nullableNumber(raw.attendanceOvertimeHours),
    attendanceCompleteDays: nullableNumber(raw.attendanceCompleteDays),
    attendanceIncompleteDays: nullableNumber(raw.attendanceIncompleteDays),
    attendanceAbsentDays: nullableNumber(raw.attendanceAbsentDays),
    attendanceAbsenceDeduction,
    attendanceSource: normalizeText(raw.attendanceSource) || "cloudflare_attendance",
    attendanceSummary: isPlainObject(raw.attendanceSummary) ? raw.attendanceSummary : {},
    scheduleSnapshot: isPlainObject(raw.scheduleSnapshot) ? raw.scheduleSnapshot : {},
    delayDeduction, overtimeBonus, insuranceDeduction, salaryDeductions,
    salaryAdvanceDeduction,
    salaryAdvanceRequestIds: advanceRows.map(row => row.id),
    totalSalaryDeductions,
    absenceEntries: Array.isArray(raw.absenceEntries) ? raw.absenceEntries : [],
    grossSalary,
    finalSalary,
    mudadDocument: isPlainObject(raw.mudadDocument) ? raw.mudadDocument : null,
    status: "finalized",
  };
  try {
    const statements = [buildPayrollInsertStatement(db, normalized, now, requester.uid, requester.email || null)];
    for (const row of advanceRows) {
      statements.push(db.prepare(
        `UPDATE employee_service_requests SET payroll_record_id = ?, payroll_month = ?, settled_at = ?, settled_by = ?, updated_at = ? WHERE id = ? AND payroll_record_id IS NULL`
      ).bind(id, payrollMonth, now, requester.uid, now, row.id));
    }
    statements.push(buildAuditStatement(db, request, requester, { action: "payroll.create", entityType: "employee_payroll_record", entityId: id, before: null, after: normalized }));
    await db.batch(statements);
    const row = await db.prepare("SELECT * FROM employee_payroll_records WHERE id = ?").bind(id).first();
    return json(201, { ok: true, payrollRecord: mapPayrollRecordRow(row) });
  } catch (error) {
    return databaseMutationError("payroll_record_create_failed", error);
  }
}

export function buildPayrollInsertStatement(db, row, now, actorUid, actorEmail, source = "hr_api") {
  return db.prepare(
    `INSERT INTO employee_payroll_records (
      id, employee_id, employee_uid, payroll_month, month_start, month_end,
      calculation_start_date, calculation_end_date, base_salary, housing_allowance,
      transportation_allowance, other_allowances, allowances, absence_days,
      absence_deduction, expected_work_hours, actual_worked_hours,
      attendance_late_hours, attendance_missing_hours, attendance_overtime_hours,
      attendance_complete_days, attendance_incomplete_days, attendance_absent_days,
      attendance_absence_deduction, attendance_source, attendance_summary_json,
      schedule_snapshot_json, delay_deduction, overtime_bonus, insurance_deduction,
      salary_deductions_json, salary_advance_deduction,
      salary_advance_request_ids_json, total_salary_deductions, absence_entries_json,
      gross_salary, final_salary, mudad_document_json, status, source,
      source_updated_at, migrated_at, created_at, created_by_uid, created_by_email, updated_at
    ) VALUES (?, (SELECT id FROM employees WHERE id = ? LIMIT 1), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    row.id, row.employeeId, row.employeeUid, row.payrollMonth, row.monthStart, row.monthEnd,
    row.calculationStartDate, row.calculationEndDate, row.baseSalary, row.housingAllowance,
    row.transportationAllowance, row.otherAllowances, row.allowances, row.absenceDays,
    row.absenceDeduction, row.expectedWorkHours, row.actualWorkedHours,
    row.attendanceLateHours, row.attendanceMissingHours, row.attendanceOvertimeHours,
    row.attendanceCompleteDays, row.attendanceIncompleteDays, row.attendanceAbsentDays,
    row.attendanceAbsenceDeduction, row.attendanceSource, JSON.stringify(row.attendanceSummary || {}),
    JSON.stringify(row.scheduleSnapshot || {}), row.delayDeduction, row.overtimeBonus,
    row.insuranceDeduction, JSON.stringify(row.salaryDeductions || []),
    row.salaryAdvanceDeduction, JSON.stringify(row.salaryAdvanceRequestIds || []),
    row.totalSalaryDeductions, JSON.stringify(row.absenceEntries || []), row.grossSalary,
    row.finalSalary, row.mudadDocument ? JSON.stringify(row.mudadDocument) : null,
    row.status || "finalized", source, row.sourceUpdatedAt || null,
    source === "firestore" ? now : null, row.createdAt || now,
    row.createdByUid || actorUid || null, row.createdByEmail || actorEmail || null,
    row.updatedAt || now
  );
}

async function importPayrollSnapshot(request, env) {
  const authorized = await verifySyncSecret(request, env.HR_SYNC_SECRET);
  if (!authorized) return json(401, { ok: false, message: "invalid_hr_sync_secret" });
  const bodyResult = await readJsonBody(request, 5_000_000);
  if (!bodyResult.ok) return bodyResult.response;
  const rows = Array.isArray(bodyResult.value?.payrollRecords) ? bodyResult.value.payrollRecords : [];
  if (rows.length > MAX_IMPORT_ROWS) return json(413, { ok: false, message: "payroll_import_batch_too_large", maxRows: MAX_IMPORT_ROWS });
  const normalizedRows = rows.map(normalizeImportedPayrollRecord).filter(Boolean);
  if (normalizedRows.length !== rows.length) {
    return json(422, { ok: false, message: "payroll_import_validation_failed", received: rows.length, valid: normalizedRows.length });
  }
  const runId = normalizeText(bodyResult.value?.runId) || crypto.randomUUID();
  const complete = Boolean(bodyResult.value?.complete);
  const now = new Date().toISOString();
  const statements = [
    env.HR_DB.prepare(
      `INSERT INTO hr_migration_runs (id, source, status, payroll_records_received, details_json, started_at)
       VALUES (?, 'firestore_payroll', 'running', ?, '{}', ?)
       ON CONFLICT(id) DO UPDATE SET status = 'running', payroll_records_received = payroll_records_received + excluded.payroll_records_received`
    ).bind(runId, normalizedRows.length, now),
  ];
  for (const row of normalizedRows) {
    statements.push(
      env.HR_DB.prepare("DELETE FROM employee_payroll_records WHERE id = ?").bind(row.id),
      buildPayrollInsertStatement(env.HR_DB, row, now, row.createdByUid, row.createdByEmail, "firestore")
    );
  }
  if (complete) statements.push(env.HR_DB.prepare("UPDATE hr_migration_runs SET status = 'completed', finished_at = ? WHERE id = ?").bind(now, runId));
  try {
    await env.HR_DB.batch(statements);
    return json(200, { ok: true, runId, complete, payrollRecordsReceived: normalizedRows.length });
  } catch (error) {
    return databaseMutationError("payroll_import_failed", error);
  }
}

async function listAccounts(url, db) {
  const query = parseListQuery(url.searchParams);
  const filters = [];
  const bindings = [];

  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      `(a.display_name LIKE ? ESCAPE '\\' COLLATE NOCASE
        OR a.email LIKE ? ESCAPE '\\' COLLATE NOCASE
        OR a.username LIKE ? ESCAPE '\\' COLLATE NOCASE)`
    );
    bindings.push(like, like, like);
  }

  const role = normalizeRole(url.searchParams.get("role"));
  if (role && KNOWN_ROLES.has(role)) {
    filters.push("a.role_key = ?");
    bindings.push(role);
  }

  const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  try {
    const result = await db.batch([
      db
        .prepare(
          `SELECT a.*, e.name AS employee_name, e.employment_status
           FROM accounts a
           LEFT JOIN employees e ON e.id = a.linked_employee_id
           ${whereSql}
           ORDER BY a.display_name COLLATE NOCASE ASC, a.uid ASC
           LIMIT ? OFFSET ?`
        )
        .bind(...bindings, query.limit, query.offset),
      db
        .prepare(`SELECT COUNT(*) AS total FROM accounts a ${whereSql}`)
        .bind(...bindings),
    ]);

    return json(200, {
      ok: true,
      accounts: (result[0]?.results || []).map(mapAccountRow),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total: Number(result[1]?.results?.[0]?.total || 0),
      },
    });
  } catch (error) {
    return serverError("accounts_query_failed", error);
  }
}

async function updateAccount(request, db, requester, uid) {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;

  const body = bodyResult.value || {};
  const before = await db
    .prepare("SELECT * FROM accounts WHERE uid = ? LIMIT 1")
    .bind(uid)
    .first();
  if (!before) return json(404, { ok: false, message: "account_not_found" });

  const columns = [];
  const bindings = [];
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(body, "email")) {
    patch.email = nullableEmail(body.email);
    columns.push("email = ?");
    bindings.push(patch.email);
  }
  if (Object.prototype.hasOwnProperty.call(body, "username")) {
    patch.username = nullableText(body.username);
    columns.push("username = ?");
    bindings.push(patch.username);
  }
  if (Object.prototype.hasOwnProperty.call(body, "displayName")) {
    patch.displayName = nullableText(body.displayName);
    columns.push("display_name = ?");
    bindings.push(patch.displayName);
  }
  if (Object.prototype.hasOwnProperty.call(body, "title")) {
    patch.title = nullableText(body.title);
    columns.push("title = ?");
    bindings.push(patch.title);
  }
  if (Object.prototype.hasOwnProperty.call(body, "role")) {
    const role = normalizeRole(body.role);
    if (!KNOWN_ROLES.has(role)) {
      return json(400, { ok: false, message: "invalid_account_role" });
    }
    patch.role = role;
    columns.push("role_key = ?");
    bindings.push(role);
  }
  if (Object.prototype.hasOwnProperty.call(body, "isActive")) {
    patch.isActive = Boolean(body.isActive);
    columns.push("is_active = ?");
    bindings.push(patch.isActive ? 1 : 0);
  }
  if (Object.prototype.hasOwnProperty.call(body, "employeeProfileEnabled")) {
    patch.employeeProfileEnabled = Boolean(body.employeeProfileEnabled);
    columns.push("employee_profile_enabled = ?");
    bindings.push(patch.employeeProfileEnabled ? 1 : 0);
  }
  if (Object.prototype.hasOwnProperty.call(body, "linkedEmployeeId")) {
    patch.linkedEmployeeId = nullableText(body.linkedEmployeeId);
    columns.push("linked_employee_id = ?");
    bindings.push(patch.linkedEmployeeId);
  }

  if (!columns.length) {
    return json(400, { ok: false, message: "no_account_fields_to_update" });
  }

  const now = new Date().toISOString();
  columns.push("updated_at = ?");
  bindings.push(now, uid);

  try {
    await db.batch([
      db
        .prepare(`UPDATE accounts SET ${columns.join(", ")} WHERE uid = ?`)
        .bind(...bindings),
      buildAuditStatement(db, request, requester, {
        action: "account.update",
        entityType: "account",
        entityId: uid,
        before,
        after: patch,
      }),
    ]);

    const account = await db
      .prepare("SELECT * FROM accounts WHERE uid = ? LIMIT 1")
      .bind(uid)
      .first();
    return json(200, { ok: true, account: mapAccountRow(account) });
  } catch (error) {
    return databaseMutationError("account_update_failed", error);
  }
}

async function replaceAccountPermissions(request, db, requester, uid) {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;

  const account = await db
    .prepare("SELECT * FROM accounts WHERE uid = ? LIMIT 1")
    .bind(uid)
    .first();
  if (!account) return json(404, { ok: false, message: "account_not_found" });

  const allow = normalizeStringArray(bodyResult.value?.allow);
  const deny = normalizeStringArray(bodyResult.value?.deny).filter(
    key => !allow.includes(key)
  );
  const allKeys = [...new Set([...allow, ...deny])];

  if (allKeys.length) {
    const placeholders = allKeys.map(() => "?").join(",");
    const knownRows = await db
      .prepare(
        `SELECT permission_key FROM permissions WHERE permission_key IN (${placeholders})`
      )
      .bind(...allKeys)
      .all();
    const known = new Set((knownRows.results || []).map(row => row.permission_key));
    const unknown = allKeys.filter(key => !known.has(key));
    if (unknown.length) {
      return json(400, {
        ok: false,
        message: "unknown_permission_keys",
        unknown,
      });
    }
  }

  const now = new Date().toISOString();
  const statements = [
    db.prepare("DELETE FROM account_permissions WHERE uid = ?").bind(uid),
  ];

  for (const key of allow) {
    statements.push(
      db
        .prepare(
          `INSERT INTO account_permissions
             (uid, permission_key, effect, created_at, updated_at)
           VALUES (?, ?, 'allow', ?, ?)`
        )
        .bind(uid, key, now, now)
    );
  }
  for (const key of deny) {
    statements.push(
      db
        .prepare(
          `INSERT INTO account_permissions
             (uid, permission_key, effect, created_at, updated_at)
           VALUES (?, ?, 'deny', ?, ?)`
        )
        .bind(uid, key, now, now)
    );
  }

  statements.push(
    buildAuditStatement(db, request, requester, {
      action: "account.permissions.replace",
      entityType: "account",
      entityId: uid,
      before: null,
      after: { allow, deny },
    })
  );

  try {
    await db.batch(statements);
    return json(200, {
      ok: true,
      uid,
      allow,
      deny,
      effective: await resolveEffectivePermissions(db, uid),
    });
  } catch (error) {
    return databaseMutationError("account_permissions_update_failed", error);
  }
}

async function listPermissionDefinitions(db) {
  try {
    const result = await db
      .prepare(
        `SELECT permission_key, label_ar, label_en, category
         FROM permissions
         ORDER BY category ASC, permission_key ASC`
      )
      .all();
    return json(200, {
      ok: true,
      permissions: (result.results || []).map(row => ({
        key: row.permission_key,
        labelAr: row.label_ar,
        labelEn: row.label_en,
        category: row.category,
      })),
    });
  } catch (error) {
    return serverError("permissions_query_failed", error);
  }
}

async function importHrSnapshot(request, env) {
  const authorized = await verifySyncSecret(request, env.HR_SYNC_SECRET);
  if (!authorized) {
    return json(401, { ok: false, message: "invalid_hr_sync_secret" });
  }

  const bodyResult = await readJsonBody(request, 5_000_000);
  if (!bodyResult.ok) return bodyResult.response;

  const accounts = Array.isArray(bodyResult.value?.accounts)
    ? bodyResult.value.accounts
    : [];
  const employees = Array.isArray(bodyResult.value?.employees)
    ? bodyResult.value.employees
    : [];

  if (accounts.length > MAX_IMPORT_ROWS || employees.length > MAX_IMPORT_ROWS) {
    return json(413, {
      ok: false,
      message: "hr_import_batch_too_large",
      maxRowsPerType: MAX_IMPORT_ROWS,
    });
  }

  const runId = normalizeText(bodyResult.value?.runId) || crypto.randomUUID();
  const complete = Boolean(bodyResult.value?.complete);
  const now = new Date().toISOString();
  const statements = [
    env.HR_DB.prepare(
      `INSERT INTO hr_migration_runs
         (id, source, status, accounts_received, employees_received,
          details_json, started_at)
       VALUES (?, 'firestore', 'running', ?, ?, '{}', ?)
       ON CONFLICT(id) DO UPDATE SET
         status = 'running',
         accounts_received = accounts_received + excluded.accounts_received,
         employees_received = employees_received + excluded.employees_received`
    ).bind(runId, accounts.length, employees.length, now),
  ];

  const importedAccountUids = new Set();
  for (const raw of accounts) {
    const account = normalizeImportedAccount(raw);
    if (!account) continue;
    importedAccountUids.add(account.uid);
    statements.push(buildImportedAccountUpsert(env.HR_DB, account, now));
    statements.push(
      env.HR_DB.prepare("DELETE FROM account_permissions WHERE uid = ?").bind(
        account.uid
      )
    );
    for (const key of account.permissionsAllow) {
      statements.push(
        env.HR_DB.prepare(
          `INSERT OR REPLACE INTO account_permissions
             (uid, permission_key, effect, created_at, updated_at)
           SELECT ?, permission_key, 'allow', ?, ?
           FROM permissions WHERE permission_key = ?`
        ).bind(account.uid, now, now, key)
      );
    }
    for (const key of account.permissionsDeny) {
      statements.push(
        env.HR_DB.prepare(
          `INSERT OR REPLACE INTO account_permissions
             (uid, permission_key, effect, created_at, updated_at)
           SELECT ?, permission_key, 'deny', ?, ?
           FROM permissions WHERE permission_key = ?`
        ).bind(account.uid, now, now, key)
      );
    }
  }

  for (const raw of employees) {
    const normalized = normalizeEmployeePayload(raw, {
      partial: false,
      imported: true,
    });
    if (!normalized.ok) continue;
    const employee = normalized.value;
    if (!employee.id) continue;

    if (employee.authUid && !importedAccountUids.has(employee.authUid)) {
      statements.push(buildEmployeeAccountLinkUpsert(env.HR_DB, employee, now));
    }

    statements.push(buildEmployeeUpsertStatement(env.HR_DB, employee, now));
  }

  if (complete) {
    statements.push(
      env.HR_DB.prepare(
        `UPDATE hr_migration_runs
         SET status = 'completed', finished_at = ?
         WHERE id = ?`
      ).bind(now, runId)
    );
  }

  try {
    await env.HR_DB.batch(statements);
    return json(200, {
      ok: true,
      runId,
      complete,
      accountsReceived: accounts.length,
      employeesReceived: employees.length,
    });
  } catch (error) {
    return databaseMutationError("hr_import_failed", error);
  }
}


async function importHrOperationsSnapshot(request, env) {
  const authorized = await verifySyncSecret(request, env.HR_SYNC_SECRET);
  if (!authorized) return json(401, { ok: false, message: "invalid_hr_sync_secret" });
  const bodyResult = await readJsonBody(request, 5_000_000);
  if (!bodyResult.ok) return bodyResult.response;
  const leaves = Array.isArray(bodyResult.value?.leaveRequests) ? bodyResult.value.leaveRequests : [];
  const absences = Array.isArray(bodyResult.value?.absences) ? bodyResult.value.absences : [];
  const serviceRequests = Array.isArray(bodyResult.value?.serviceRequests) ? bodyResult.value.serviceRequests : [];
  if (leaves.length > MAX_IMPORT_ROWS || absences.length > MAX_IMPORT_ROWS || serviceRequests.length > MAX_IMPORT_ROWS) {
    return json(413, { ok: false, message: "hr_operations_import_batch_too_large", maxRowsPerType: MAX_IMPORT_ROWS });
  }
  const runId = normalizeText(bodyResult.value?.runId) || crypto.randomUUID();
  const complete = Boolean(bodyResult.value?.complete);
  const now = new Date().toISOString();
  const normalizedLeaves = leaves.map(normalizeImportedLeaveRequest).filter(Boolean);
  const normalizedAbsences = absences.map(normalizeImportedAbsence).filter(Boolean);
  const normalizedServiceRequests = serviceRequests
    .map(normalizeImportedServiceRequest)
    .filter(Boolean);
  const skipped = {
    leaveRequests: leaves.length - normalizedLeaves.length,
    absences: absences.length - normalizedAbsences.length,
    serviceRequests: serviceRequests.length - normalizedServiceRequests.length,
  };

  if (skipped.leaveRequests || skipped.absences || skipped.serviceRequests) {
    return json(422, {
      ok: false,
      message: "hr_operations_import_validation_failed",
      received: {
        leaveRequests: leaves.length,
        absences: absences.length,
        serviceRequests: serviceRequests.length,
      },
      skipped,
    });
  }

  const statements = [
    env.HR_DB.prepare(
      `INSERT INTO hr_migration_runs (
         id, source, status, leave_requests_received, absences_received,
         service_requests_received, details_json, started_at
       ) VALUES (?, 'firestore_operations', 'running', ?, ?, ?, '{}', ?)
       ON CONFLICT(id) DO UPDATE SET
         status = 'running',
         leave_requests_received = leave_requests_received + excluded.leave_requests_received,
         absences_received = absences_received + excluded.absences_received,
         service_requests_received = service_requests_received + excluded.service_requests_received`
    ).bind(
      runId,
      normalizedLeaves.length,
      normalizedAbsences.length,
      normalizedServiceRequests.length,
      now
    ),
  ];

  for (const row of normalizedLeaves) {
    statements.push(buildImportedLeaveUpsert(env.HR_DB, row, now));
  }
  for (const row of normalizedAbsences) {
    statements.push(buildImportedAbsenceUpsert(env.HR_DB, row, now));
  }
  for (const row of normalizedServiceRequests) {
    statements.push(buildImportedServiceRequestUpsert(env.HR_DB, row, now));
  }
  if (complete) {
    statements.push(env.HR_DB.prepare("UPDATE hr_migration_runs SET status = 'completed', finished_at = ? WHERE id = ?").bind(now, runId));
  }
  try {
    await env.HR_DB.batch(statements);
    return json(200, {
      ok: true,
      runId,
      complete,
      leaveRequestsReceived: normalizedLeaves.length,
      absencesReceived: normalizedAbsences.length,
      serviceRequestsReceived: normalizedServiceRequests.length,
      skipped,
    });
  } catch (error) {
    return databaseMutationError("hr_operations_import_failed", error);
  }
}

export function normalizeImportedLeaveRequest(raw) {
  const id = normalizeText(raw?.id);
  const employeeUid = normalizeText(raw?.employeeUid || raw?.userId);
  const startDate = normalizeIsoDateKey(raw?.startDate);
  const endDate = normalizeIsoDateKey(raw?.endDate || raw?.startDate);
  if (!id || !employeeUid || !startDate || !endDate) return null;
  const dateKeys = buildDateKeysInclusive(startDate, endDate);
  return {
    id,
    employeeId: nullableText(raw?.employeeId || raw?.employeeDocId),
    employeeUid,
    employeeName: nullableText(raw?.employeeName),
    employeeEmail: nullableEmail(raw?.employeeEmail),
    status: normalizeText(raw?.status || "pending").toLowerCase(),
    leaveType: normalizeText(raw?.leaveType || "annual").toLowerCase(),
    startDate,
    endDate,
    daysCount: nullableNumber(raw?.daysCount) ?? dateKeys.length,
    balanceDeductedDays: Math.max(0, Number(raw?.balanceDeductedDays || 0)),
    balanceRestoredDays: Math.max(0, Number(raw?.balanceRestoredDays || 0)),
    cancelledDateKeys: normalizeStringArray(raw?.cancelledDateKeys).map(normalizeIsoDateKey).filter(Boolean),
    cancellationDate: normalizeIsoDateKey(raw?.cancellationDate) || null,
    cancelledAt: normalizeDateToIso(raw?.cancelledAt),
    cancelledBy: nullableText(raw?.cancelledBy),
    cancelledByEmail: nullableEmail(raw?.cancelledByEmail),
    cancelledByName: nullableText(raw?.cancelledByName),
    employeeNote: nullableText(raw?.employeeNote),
    hrNote: nullableText(raw?.hrNote),
    decidedAt: normalizeDateToIso(raw?.decidedAt),
    decidedBy: nullableText(raw?.decidedBy),
    decidedByEmail: nullableEmail(raw?.decidedByEmail),
    decidedByName: nullableText(raw?.decidedByName),
    reviewedAt: normalizeDateToIso(raw?.reviewedAt),
    reviewedBy: nullableText(raw?.reviewedBy),
    reviewedByEmail: nullableEmail(raw?.reviewedByEmail),
    reviewedByName: nullableText(raw?.reviewedByName),
    sourceUpdatedAt: normalizeDateToIso(raw?.updatedAt || raw?.createdAt),
    createdAt: normalizeDateToIso(raw?.createdAt) || new Date().toISOString(),
    updatedAt: normalizeDateToIso(raw?.updatedAt || raw?.createdAt) || new Date().toISOString(),
  };
}

export function normalizeImportedAbsence(raw) {
  const id = normalizeText(raw?.id);
  const employeeUid = normalizeText(raw?.employeeUid);
  const date = normalizeIsoDateKey(raw?.date);
  const type = normalizeText(raw?.type || "full_day").toLowerCase();
  if (!id || !employeeUid || !date || !['full_day', 'half_day'].includes(type)) return null;
  return {
    id,
    employeeId: nullableText(raw?.employeeId),
    employeeUid,
    date,
    type,
    note: nullableText(raw?.note),
    createdByUid: nullableText(raw?.createdByUid),
    sourceUpdatedAt: normalizeDateToIso(raw?.updatedAt || raw?.createdAt),
    createdAt: normalizeDateToIso(raw?.createdAt) || new Date().toISOString(),
    updatedAt: normalizeDateToIso(raw?.updatedAt || raw?.createdAt) || new Date().toISOString(),
  };
}

export function normalizeImportedServiceRequest(raw) {
  const id = normalizeText(raw?.id);
  const employeeUid = normalizeText(raw?.employeeUid || raw?.userId);
  const requestType = normalizeText(raw?.requestType);
  if (!id || !employeeUid || !requestType) return null;
  return {
    id,
    employeeId: nullableText(raw?.employeeId || raw?.employeeDocId),
    employeeUid,
    employeeName: nullableText(raw?.employeeName),
    employeeEmail: nullableEmail(raw?.employeeEmail),
    status: normalizeText(raw?.status || "pending").toLowerCase(),
    requestType,
    title: nullableText(raw?.title),
    requestDate: normalizeIsoDateKey(raw?.requestDate) || null,
    startDate: normalizeIsoDateKey(raw?.startDate) || null,
    endDate: normalizeIsoDateKey(raw?.endDate) || null,
    startTime: nullableText(raw?.startTime),
    endTime: nullableText(raw?.endTime),
    amount: nullableNumber(raw?.amount),
    letterType: nullableText(raw?.letterType),
    employeeNote: nullableText(raw?.employeeNote),
    hrNote: nullableText(raw?.hrNote),
    decidedAt: normalizeDateToIso(raw?.decidedAt),
    decidedBy: nullableText(raw?.decidedBy),
    decidedByEmail: nullableEmail(raw?.decidedByEmail),
    decidedByName: nullableText(raw?.decidedByName),
    reviewedAt: normalizeDateToIso(raw?.reviewedAt),
    reviewedBy: nullableText(raw?.reviewedBy),
    reviewedByEmail: nullableEmail(raw?.reviewedByEmail),
    reviewedByName: nullableText(raw?.reviewedByName),
    sourceUpdatedAt: normalizeDateToIso(raw?.updatedAt || raw?.createdAt),
    createdAt: normalizeDateToIso(raw?.createdAt) || new Date().toISOString(),
    updatedAt: normalizeDateToIso(raw?.updatedAt || raw?.createdAt) || new Date().toISOString(),
  };
}

function buildImportedLeaveUpsert(db, row, now) {
  return db.prepare(
    `INSERT INTO employee_leave_requests (
       id, employee_id, employee_uid, employee_name, employee_email, status,
       leave_type, start_date, end_date, days_count, balance_deducted_days,
       balance_restored_days, cancelled_date_keys_json, cancellation_date,
       cancelled_at, cancelled_by, cancelled_by_email, cancelled_by_name,
       employee_note, hr_note, decided_at, decided_by, decided_by_email,
       decided_by_name, reviewed_at, reviewed_by, reviewed_by_email,
       reviewed_by_name, source, source_updated_at, migrated_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'firestore', ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       employee_id = excluded.employee_id, employee_uid = excluded.employee_uid,
       employee_name = excluded.employee_name, employee_email = excluded.employee_email,
       status = excluded.status, leave_type = excluded.leave_type,
       start_date = excluded.start_date, end_date = excluded.end_date,
       days_count = excluded.days_count, balance_deducted_days = excluded.balance_deducted_days,
       balance_restored_days = excluded.balance_restored_days,
       cancelled_date_keys_json = excluded.cancelled_date_keys_json,
       cancellation_date = excluded.cancellation_date, cancelled_at = excluded.cancelled_at,
       cancelled_by = excluded.cancelled_by, cancelled_by_email = excluded.cancelled_by_email,
       cancelled_by_name = excluded.cancelled_by_name, employee_note = excluded.employee_note,
       hr_note = excluded.hr_note, decided_at = excluded.decided_at,
       decided_by = excluded.decided_by, decided_by_email = excluded.decided_by_email,
       decided_by_name = excluded.decided_by_name, reviewed_at = excluded.reviewed_at,
       reviewed_by = excluded.reviewed_by, reviewed_by_email = excluded.reviewed_by_email,
       reviewed_by_name = excluded.reviewed_by_name, source_updated_at = excluded.source_updated_at,
       migrated_at = excluded.migrated_at, updated_at = excluded.updated_at`
  ).bind(
    row.id, row.employeeId, row.employeeUid, row.employeeName, row.employeeEmail,
    row.status, row.leaveType, row.startDate, row.endDate, row.daysCount,
    row.balanceDeductedDays, row.balanceRestoredDays, JSON.stringify(row.cancelledDateKeys),
    row.cancellationDate, row.cancelledAt, row.cancelledBy, row.cancelledByEmail,
    row.cancelledByName, row.employeeNote, row.hrNote, row.decidedAt, row.decidedBy,
    row.decidedByEmail, row.decidedByName, row.reviewedAt, row.reviewedBy,
    row.reviewedByEmail, row.reviewedByName, row.sourceUpdatedAt, now, row.createdAt, row.updatedAt
  );
}

function buildImportedAbsenceUpsert(db, row, now) {
  return db.prepare(
    `INSERT INTO employee_absences (
       id, employee_id, employee_uid, absence_date, absence_type, note,
       created_by_uid, source, source_updated_at, migrated_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'firestore', ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       employee_id = excluded.employee_id, employee_uid = excluded.employee_uid,
       absence_date = excluded.absence_date, absence_type = excluded.absence_type,
       note = excluded.note, created_by_uid = excluded.created_by_uid,
       source_updated_at = excluded.source_updated_at, migrated_at = excluded.migrated_at,
       updated_at = excluded.updated_at`
  ).bind(row.id, row.employeeId, row.employeeUid, row.date, row.type, row.note, row.createdByUid, row.sourceUpdatedAt, now, row.createdAt, row.updatedAt);
}

function buildImportedServiceRequestUpsert(db, row, now) {
  return db.prepare(
    `INSERT INTO employee_service_requests (
       id, employee_id, employee_uid, employee_name, employee_email, status,
       request_type, title, request_date, start_date, end_date, start_time,
       end_time, amount, letter_type, employee_note, hr_note, decided_at,
       decided_by, decided_by_email, decided_by_name, reviewed_at, reviewed_by,
       reviewed_by_email, reviewed_by_name, source, source_updated_at,
       migrated_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'firestore', ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       employee_id = excluded.employee_id, employee_uid = excluded.employee_uid,
       employee_name = excluded.employee_name, employee_email = excluded.employee_email,
       status = excluded.status, request_type = excluded.request_type, title = excluded.title,
       request_date = excluded.request_date, start_date = excluded.start_date,
       end_date = excluded.end_date, start_time = excluded.start_time,
       end_time = excluded.end_time, amount = excluded.amount, letter_type = excluded.letter_type,
       employee_note = excluded.employee_note, hr_note = excluded.hr_note,
       decided_at = excluded.decided_at, decided_by = excluded.decided_by,
       decided_by_email = excluded.decided_by_email, decided_by_name = excluded.decided_by_name,
       reviewed_at = excluded.reviewed_at, reviewed_by = excluded.reviewed_by,
       reviewed_by_email = excluded.reviewed_by_email, reviewed_by_name = excluded.reviewed_by_name,
       source_updated_at = excluded.source_updated_at, migrated_at = excluded.migrated_at,
       updated_at = excluded.updated_at`
  ).bind(
    row.id, row.employeeId, row.employeeUid, row.employeeName, row.employeeEmail,
    row.status, row.requestType, row.title, row.requestDate, row.startDate, row.endDate,
    row.startTime, row.endTime, row.amount, row.letterType, row.employeeNote, row.hrNote,
    row.decidedAt, row.decidedBy, row.decidedByEmail, row.decidedByName, row.reviewedAt,
    row.reviewedBy, row.reviewedByEmail, row.reviewedByName, row.sourceUpdatedAt, now,
    row.createdAt, row.updatedAt
  );
}

function buildEmployeeAccountLinkUpsert(db, employee, now) {
  return db
    .prepare(
      `INSERT INTO accounts (
         uid, email, display_name, title, role_key, is_active,
         employee_profile_enabled, linked_employee_id, auth_provider,
         source, source_updated_at, migrated_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'staff', ?, 1, ?, 'firebase',
                 'firestore', ?, ?, ?, ?)
       ON CONFLICT(uid) DO UPDATE SET
         email = COALESCE(accounts.email, excluded.email),
         display_name = COALESCE(accounts.display_name, excluded.display_name),
         title = COALESCE(accounts.title, excluded.title),
         employee_profile_enabled = 1,
         linked_employee_id = excluded.linked_employee_id,
         source_updated_at = COALESCE(excluded.source_updated_at, accounts.source_updated_at),
         migrated_at = excluded.migrated_at,
         updated_at = excluded.updated_at`
    )
    .bind(
      employee.authUid,
      employee.email,
      employee.name,
      employee.title,
      employee.isActive ? 1 : 0,
      employee.id,
      employee.sourceUpdatedAt,
      now,
      now,
      now
    );
}

function buildImportedAccountUpsert(db, account, now) {
  return db
    .prepare(
      `INSERT INTO accounts (
         uid, email, username, display_name, title, role_key, is_active,
         employee_profile_enabled, linked_employee_id, auth_provider,
         source, source_updated_at, migrated_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'firestore', ?, ?, ?, ?)
       ON CONFLICT(uid) DO UPDATE SET
         email = excluded.email,
         username = excluded.username,
         display_name = excluded.display_name,
         title = excluded.title,
         role_key = excluded.role_key,
         is_active = excluded.is_active,
         employee_profile_enabled = excluded.employee_profile_enabled,
         linked_employee_id = excluded.linked_employee_id,
         auth_provider = excluded.auth_provider,
         source_updated_at = excluded.source_updated_at,
         migrated_at = excluded.migrated_at,
         updated_at = excluded.updated_at`
    )
    .bind(
      account.uid,
      account.email,
      account.username,
      account.displayName,
      account.title,
      account.role,
      account.isActive ? 1 : 0,
      account.employeeProfileEnabled ? 1 : 0,
      account.linkedEmployeeId,
      account.authProvider,
      account.sourceUpdatedAt,
      now,
      now,
      now
    );
}

function buildEmployeeInsertStatement(db, employee, now) {
  return db
    .prepare(
      `INSERT INTO employees (
         id, auth_uid, name, email, phone, avatar_url, title, department,
         employee_code, fingerprint_number, employment_status, is_active,
         start_date, leave_balance, base_salary, housing_allowance,
         transportation_allowance, other_allowances, insurance_deduction,
         shift_start_time, shift_end_time, weekly_off_days_json,
         allowed_zone_ids_json, salary_deductions_json, admin_notes,
         personal_json, employment_json, source, source_updated_at,
         migrated_at, created_at, updated_at
       ) VALUES (
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       )`
    )
    .bind(...employeeSqlBindings(employee, now));
}

function buildEmployeeUpsertStatement(db, employee, now) {
  return db
    .prepare(
      `INSERT INTO employees (
         id, auth_uid, name, email, phone, avatar_url, title, department,
         employee_code, fingerprint_number, employment_status, is_active,
         start_date, leave_balance, base_salary, housing_allowance,
         transportation_allowance, other_allowances, insurance_deduction,
         shift_start_time, shift_end_time, weekly_off_days_json,
         allowed_zone_ids_json, salary_deductions_json, admin_notes,
         personal_json, employment_json, source, source_updated_at,
         migrated_at, created_at, updated_at
       ) VALUES (
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       )
       ON CONFLICT(id) DO UPDATE SET
         auth_uid = excluded.auth_uid,
         name = excluded.name,
         email = excluded.email,
         phone = excluded.phone,
         avatar_url = excluded.avatar_url,
         title = excluded.title,
         department = excluded.department,
         employee_code = excluded.employee_code,
         fingerprint_number = excluded.fingerprint_number,
         employment_status = excluded.employment_status,
         is_active = excluded.is_active,
         start_date = excluded.start_date,
         leave_balance = excluded.leave_balance,
         base_salary = excluded.base_salary,
         housing_allowance = excluded.housing_allowance,
         transportation_allowance = excluded.transportation_allowance,
         other_allowances = excluded.other_allowances,
         insurance_deduction = excluded.insurance_deduction,
         shift_start_time = excluded.shift_start_time,
         shift_end_time = excluded.shift_end_time,
         weekly_off_days_json = excluded.weekly_off_days_json,
         allowed_zone_ids_json = excluded.allowed_zone_ids_json,
         salary_deductions_json = excluded.salary_deductions_json,
         admin_notes = excluded.admin_notes,
         personal_json = excluded.personal_json,
         employment_json = excluded.employment_json,
         source_updated_at = excluded.source_updated_at,
         migrated_at = excluded.migrated_at,
         updated_at = excluded.updated_at`
    )
    .bind(...employeeSqlBindings(employee, now));
}

function employeeSqlBindings(employee, now) {
  return [
    employee.id,
    employee.authUid,
    employee.name,
    employee.email,
    employee.phone,
    employee.avatarUrl,
    employee.title,
    employee.department,
    employee.employeeCode,
    employee.fingerprintNumber,
    employee.employmentStatus,
    employee.isActive ? 1 : 0,
    employee.startDate,
    employee.leaveBalance,
    employee.baseSalary,
    employee.housingAllowance,
    employee.transportationAllowance,
    employee.otherAllowances,
    employee.insuranceDeduction,
    employee.shiftStartTime,
    employee.shiftEndTime,
    JSON.stringify(employee.weeklyOffDays || []),
    JSON.stringify(employee.allowedZoneIds || []),
    JSON.stringify(employee.salaryDeductions || []),
    employee.adminNotes,
    JSON.stringify(employee.personal || {}),
    JSON.stringify(employee.employment || {}),
    employee.source || "firestore",
    employee.sourceUpdatedAt,
    now,
    now,
    now,
  ];
}

export function normalizeEmployeePayload(raw, options = {}) {
  const partial = Boolean(options.partial);
  const source = raw && typeof raw === "object" ? raw : {};
  const personal = isPlainObject(source.personal) ? source.personal : {};
  const employment = isPlainObject(source.employment) ? source.employment : {};
  const profile = isPlainObject(source.employeeProfile)
    ? source.employeeProfile
    : {};
  const profilePersonal = isPlainObject(profile.personal) ? profile.personal : {};
  const profileEmployment = isPlainObject(profile.employment)
    ? profile.employment
    : {};
  const resolvedPersonal = { ...personal, ...profilePersonal };
  const resolvedEmployment = { ...employment, ...profileEmployment };

  const value = {};
  const setIfPresent = (key, normalized, candidates) => {
    const present = candidates.some(candidate => candidate.present);
    if (!partial || present) value[key] = normalized;
  };

  const idCandidate = candidate(source, "id");
  setIfPresent("id", nullableText(source.id), [idCandidate]);
  setIfPresent(
    "authUid",
    nullableText(
      source.authUid ||
        source.uid ||
        source.linkedUserUid ||
        source.userId ||
        source.employeeUid
    ),
    [
      candidate(source, "authUid"),
      candidate(source, "uid"),
      candidate(source, "linkedUserUid"),
      candidate(source, "userId"),
      candidate(source, "employeeUid"),
    ]
  );
  setIfPresent(
    "name",
    normalizeText(
      source.name ||
        source.displayName ||
        source.fullName ||
        resolvedPersonal.name
    ),
    [
      candidate(source, "name"),
      candidate(source, "displayName"),
      candidate(source, "fullName"),
      candidate(resolvedPersonal, "name"),
    ]
  );
  setIfPresent(
    "email",
    nullableEmail(source.email || resolvedPersonal.email),
    [candidate(source, "email"), candidate(resolvedPersonal, "email")]
  );
  setIfPresent(
    "phone",
    nullableText(
      source.phone ||
        source.mobile ||
        source.phoneNumber ||
        resolvedPersonal.phone
    ),
    [
      candidate(source, "phone"),
      candidate(source, "mobile"),
      candidate(source, "phoneNumber"),
      candidate(resolvedPersonal, "phone"),
    ]
  );
  setIfPresent(
    "avatarUrl",
    nullableText(
      source.avatarUrl ||
        source.photoURL ||
        resolvedPersonal.avatar?.fileUrl ||
        resolvedPersonal.avatarUrl
    ),
    [
      candidate(source, "avatarUrl"),
      candidate(source, "photoURL"),
      candidate(resolvedPersonal, "avatar"),
      candidate(resolvedPersonal, "avatarUrl"),
    ]
  );
  setIfPresent(
    "title",
    nullableText(
      source.title ||
        source.jobTitle ||
        resolvedEmployment.title ||
        resolvedEmployment.jobTitle
    ),
    [
      candidate(source, "title"),
      candidate(source, "jobTitle"),
      candidate(resolvedEmployment, "title"),
      candidate(resolvedEmployment, "jobTitle"),
    ]
  );
  setIfPresent(
    "department",
    nullableText(source.department || resolvedEmployment.department),
    [candidate(source, "department"), candidate(resolvedEmployment, "department")]
  );
  setIfPresent(
    "employeeCode",
    nullableText(source.employeeCode || resolvedEmployment.employeeCode),
    [candidate(source, "employeeCode"), candidate(resolvedEmployment, "employeeCode")]
  );
  setIfPresent(
    "fingerprintNumber",
    nullableText(
      source.fingerprintNumber || resolvedEmployment.fingerprintNumber
    ),
    [
      candidate(source, "fingerprintNumber"),
      candidate(resolvedEmployment, "fingerprintNumber"),
    ]
  );

  const status = normalizeText(
    source.employmentStatus ||
      source.status ||
      resolvedEmployment.employmentStatus ||
      resolvedEmployment.status ||
      "active"
  ).toLowerCase();
  setIfPresent(
    "employmentStatus",
    status || "active",
    [
      candidate(source, "employmentStatus"),
      candidate(source, "status"),
      candidate(resolvedEmployment, "employmentStatus"),
      candidate(resolvedEmployment, "status"),
    ]
  );

  const activeCandidate = firstDefined(
    source.isActive,
    source.active,
    resolvedEmployment.isActive
  );
  const isActive =
    activeCandidate === undefined
      ? !["inactive", "suspended", "terminated", "deleted"].includes(status)
      : parseBoolean(activeCandidate, true);
  setIfPresent(
    "isActive",
    isActive,
    [
      candidate(source, "isActive"),
      candidate(source, "active"),
      candidate(resolvedEmployment, "isActive"),
      candidate(source, "employmentStatus"),
      candidate(source, "status"),
    ]
  );

  setIfPresent(
    "startDate",
    normalizeDateToIso(
      source.startDate ||
        source.hireDate ||
        source.joinedAt ||
        resolvedEmployment.startDate
    ),
    [
      candidate(source, "startDate"),
      candidate(source, "hireDate"),
      candidate(source, "joinedAt"),
      candidate(resolvedEmployment, "startDate"),
    ]
  );

  for (const [key, values] of Object.entries({
    leaveBalance: [source.leaveBalance, resolvedEmployment.leaveBalance],
    baseSalary: [source.baseSalary, resolvedEmployment.baseSalary],
    housingAllowance: [
      source.housingAllowance,
      resolvedEmployment.housingAllowance,
    ],
    transportationAllowance: [
      source.transportationAllowance,
      resolvedEmployment.transportationAllowance,
    ],
    otherAllowances: [source.otherAllowances, resolvedEmployment.otherAllowances],
    insuranceDeduction: [
      source.insuranceDeduction,
      resolvedEmployment.insuranceDeduction,
    ],
  })) {
    const rawValue = firstDefined(...values);
    setIfPresent(
      key,
      nullableNumber(rawValue),
      values.map((_, index) => ({ present: values[index] !== undefined }))
    );
  }

  const workSchedule = isPlainObject(resolvedEmployment.workSchedule)
    ? resolvedEmployment.workSchedule
    : {};
  setIfPresent(
    "shiftStartTime",
    nullableText(
      source.shiftStartTime ||
        resolvedEmployment.shiftStartTime ||
        workSchedule.startTime
    ),
    [
      candidate(source, "shiftStartTime"),
      candidate(resolvedEmployment, "shiftStartTime"),
      candidate(workSchedule, "startTime"),
    ]
  );
  setIfPresent(
    "shiftEndTime",
    nullableText(
      source.shiftEndTime || resolvedEmployment.shiftEndTime || workSchedule.endTime
    ),
    [
      candidate(source, "shiftEndTime"),
      candidate(resolvedEmployment, "shiftEndTime"),
      candidate(workSchedule, "endTime"),
    ]
  );
  setIfPresent(
    "weeklyOffDays",
    normalizeStringArray(
      source.weeklyOffDays ||
        resolvedEmployment.weeklyOffDays ||
        workSchedule.weeklyOffDays
    ),
    [
      candidate(source, "weeklyOffDays"),
      candidate(resolvedEmployment, "weeklyOffDays"),
      candidate(workSchedule, "weeklyOffDays"),
    ]
  );
  setIfPresent(
    "allowedZoneIds",
    normalizeStringArray(
      source.allowedZoneIds || resolvedEmployment.allowedZoneIds
    ),
    [
      candidate(source, "allowedZoneIds"),
      candidate(resolvedEmployment, "allowedZoneIds"),
    ]
  );
  setIfPresent(
    "salaryDeductions",
    Array.isArray(
      source.salaryDeductions || resolvedEmployment.salaryDeductions
    )
      ? source.salaryDeductions || resolvedEmployment.salaryDeductions
      : [],
    [
      candidate(source, "salaryDeductions"),
      candidate(resolvedEmployment, "salaryDeductions"),
    ]
  );
  setIfPresent(
    "adminNotes",
    nullableText(source.adminNotes || resolvedEmployment.adminNotes),
    [candidate(source, "adminNotes"), candidate(resolvedEmployment, "adminNotes")]
  );
  setIfPresent("personal", resolvedPersonal, [
    candidate(source, "personal"),
    candidate(profile, "personal"),
  ]);
  setIfPresent("employment", resolvedEmployment, [
    candidate(source, "employment"),
    candidate(profile, "employment"),
  ]);
  setIfPresent(
    "sourceUpdatedAt",
    normalizeDateToIso(
      source.sourceUpdatedAt || source.updatedAt || profile.updatedAt
    ),
    [
      candidate(source, "sourceUpdatedAt"),
      candidate(source, "updatedAt"),
      candidate(profile, "updatedAt"),
    ]
  );
  if (!partial || Object.prototype.hasOwnProperty.call(source, "source")) {
    value.source = normalizeText(source.source) || "firestore";
  }

  if (!partial && !value.name) {
    return {
      ok: false,
      response: json(400, { ok: false, message: "employee_name_required" }),
    };
  }

  return { ok: true, value };
}

function normalizeImportedAccount(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const uid = normalizeText(
    source.uid || source.authUid || source.userId || source.linkedUserUid
  );
  if (!uid) return null;

  const role = normalizeRole(source.role || source.roleKey || "staff");
  const accountRole = KNOWN_ROLES.has(role) ? role : "staff";
  return {
    uid,
    email: nullableEmail(source.email),
    username: nullableText(source.username),
    displayName: nullableText(
      source.displayName || source.name || source.fullName
    ),
    title: nullableText(source.title || source.jobTitle),
    role: accountRole,
    isActive: parseBoolean(
      firstDefined(source.isActive, source.active, source.status),
      true
    ),
    employeeProfileEnabled: parseBoolean(
      source.employeeProfileEnabled,
      Boolean(source.linkedEmployeeId)
    ),
    linkedEmployeeId: nullableText(source.linkedEmployeeId),
    authProvider: normalizeText(source.authProvider) || "firebase",
    sourceUpdatedAt: normalizeDateToIso(source.sourceUpdatedAt || source.updatedAt),
    permissionsAllow: normalizeStringArray(source.permissionsAllow),
    permissionsDeny: normalizeStringArray(source.permissionsDeny),
  };
}

function mapEmployeeRow(row) {
  return {
    id: row.id,
    authUid: row.auth_uid || null,
    name: row.name,
    email: row.email || null,
    phone: row.phone || null,
    avatarUrl: row.avatar_url || null,
    title: row.title || null,
    department: row.department || null,
    employeeCode: row.employee_code || null,
    fingerprintNumber: row.fingerprint_number || null,
    employmentStatus: row.employment_status,
    isActive: Boolean(row.is_active),
    startDate: row.start_date || null,
    leaveBalance: nullableNumber(row.leave_balance),
    salary: {
      baseSalary: nullableNumber(row.base_salary),
      housingAllowance: nullableNumber(row.housing_allowance),
      transportationAllowance: nullableNumber(row.transportation_allowance),
      otherAllowances: nullableNumber(row.other_allowances),
      insuranceDeduction: nullableNumber(row.insurance_deduction),
      deductions: parseJson(row.salary_deductions_json, []),
    },
    workSchedule: {
      startTime: row.shift_start_time || null,
      endTime: row.shift_end_time || null,
      weeklyOffDays: parseJson(row.weekly_off_days_json, []),
    },
    allowedZoneIds: parseJson(row.allowed_zone_ids_json, []),
    adminNotes: row.admin_notes || null,
    personal: parseJson(row.personal_json, {}),
    employment: parseJson(row.employment_json, {}),
    account: row.auth_uid
      ? {
          role: row.account_role || "staff",
          isActive:
            row.account_is_active === undefined || row.account_is_active === null
              ? null
              : Boolean(row.account_is_active),
          employeeProfileEnabled: Boolean(row.employee_profile_enabled),
        }
      : null,
    source: row.source,
    sourceUpdatedAt: row.source_updated_at || null,
    migratedAt: row.migrated_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAccountRow(row) {
  if (!row) return null;
  return {
    uid: row.uid,
    email: row.email || null,
    username: row.username || null,
    displayName: row.display_name || null,
    title: row.title || null,
    role: row.role_key,
    isActive: Boolean(row.is_active),
    employeeProfileEnabled: Boolean(row.employee_profile_enabled),
    linkedEmployeeId: row.linked_employee_id || null,
    authProvider: row.auth_provider,
    employeeName: row.employee_name || null,
    employmentStatus: row.employment_status || null,
    sourceUpdatedAt: row.source_updated_at || null,
    migratedAt: row.migrated_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildAuditStatement(db, request, requester, input) {
  const now = new Date().toISOString();
  return db
    .prepare(
      `INSERT INTO hr_audit_logs (
         id, actor_uid, actor_email, actor_role, actor_name, action, category,
         severity, status, message, entity_type, entity_id, before_json,
         after_json, source_json, changes_json, meta_json, occurred_at,
         ip_address, user_agent, source_system, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'hr', 'info', 'success', ?, ?, ?, ?, ?, ?, '[]', '{}', ?, ?, ?, 'hr_api', ?)`
    )
    .bind(
      crypto.randomUUID(),
      requester.uid,
      requester.email || null,
      requester.account?.role_key || null,
      requester.account?.display_name || requester.email || null,
      input.action,
      input.message || input.action,
      input.entityType,
      input.entityId || null,
      input.before ? safeJsonStringify(input.before) : null,
      input.after ? safeJsonStringify(input.after) : null,
      safeJsonStringify({ area: 'hr', page: 'hr-core-worker', route: new URL(request.url).pathname, method: request.method }),
      now,
      request.headers.get("CF-Connecting-IP") || null,
      request.headers.get("User-Agent") || null,
      now
    );
}

export async function verifyFirebaseIdToken(token, projectId) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("invalid_jwt_shape");

  const header = decodeBase64UrlJson(parts[0]);
  const payload = decodeBase64UrlJson(parts[1]);
  validateFirebaseTokenClaims(header, payload, projectId);

  const jwks = await getFirebaseJwks();
  const jwk = jwks.find(key => key.kid === header.kid);
  if (!jwk) {
    firebaseJwksCache.expiresAt = 0;
    const refreshed = await getFirebaseJwks();
    const refreshedKey = refreshed.find(key => key.kid === header.kid);
    if (!refreshedKey) throw new Error("firebase_jwk_not_found");
    return verifyJwtSignature(parts, refreshedKey, payload);
  }

  return verifyJwtSignature(parts, jwk, payload);
}

async function verifyJwtSignature(parts, jwk, payload) {
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeBase64UrlBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!verified) throw new Error("firebase_signature_invalid");
  return payload;
}

export function validateFirebaseTokenClaims(header, payload, projectId, now) {
  const normalizedProjectId = normalizeText(projectId);
  const nowSeconds = Number.isFinite(now) ? now : Math.floor(Date.now() / 1000);

  if (!normalizedProjectId) throw new Error("firebase_project_id_missing");
  if (header?.alg !== "RS256" || !normalizeText(header?.kid)) {
    throw new Error("firebase_header_invalid");
  }
  if (payload?.aud !== normalizedProjectId) {
    throw new Error("firebase_audience_invalid");
  }
  if (payload?.iss !== `https://securetoken.google.com/${normalizedProjectId}`) {
    throw new Error("firebase_issuer_invalid");
  }
  if (!normalizeText(payload?.sub) || normalizeText(payload?.sub).length > 128) {
    throw new Error("firebase_subject_invalid");
  }
  if (!Number.isFinite(payload?.exp) || payload.exp <= nowSeconds) {
    throw new Error("firebase_token_expired");
  }
  if (!Number.isFinite(payload?.iat) || payload.iat > nowSeconds + 60) {
    throw new Error("firebase_issued_at_invalid");
  }
  if (
    payload?.auth_time !== undefined &&
    (!Number.isFinite(payload.auth_time) || payload.auth_time > nowSeconds + 60)
  ) {
    throw new Error("firebase_auth_time_invalid");
  }
  return true;
}

async function getFirebaseJwks() {
  const now = Date.now();
  if (firebaseJwksCache.keys.length && firebaseJwksCache.expiresAt > now) {
    return firebaseJwksCache.keys;
  }

  const response = await fetch(FIREBASE_JWKS_URL, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("firebase_jwks_fetch_failed");

  const payload = await response.json();
  const keys = Array.isArray(payload?.keys) ? payload.keys : [];
  if (!keys.length) throw new Error("firebase_jwks_empty");

  const cacheControl = response.headers.get("Cache-Control") || "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] || 3600);
  firebaseJwksCache = {
    keys,
    expiresAt: now + Math.max(60, maxAge) * 1000,
  };
  return keys;
}

function parseListQuery(searchParams) {
  const limit = clampInteger(searchParams.get("limit"), 1, MAX_LIST_LIMIT, DEFAULT_LIST_LIMIT);
  const offset = clampInteger(searchParams.get("offset"), 0, 1_000_000, 0);
  const activeValue = searchParams.get("active");
  return {
    search: normalizeText(searchParams.get("search")).slice(0, 120),
    status: normalizeText(searchParams.get("status")).slice(0, 50),
    department: normalizeText(searchParams.get("department")).slice(0, 120),
    active:
      activeValue === null || activeValue === ""
        ? null
        : parseBoolean(activeValue, true),
    limit,
    offset,
  };
}

function serializeEmployeeColumn(key, value) {
  if (["weeklyOffDays", "allowedZoneIds", "salaryDeductions", "personal", "employment"].includes(key)) {
    return JSON.stringify(value ?? (key === "personal" || key === "employment" ? {} : []));
  }
  if (key === "isActive") return value ? 1 : 0;
  return value ?? null;
}

async function verifySyncSecret(request, expectedSecret) {
  const expected = normalizeText(expectedSecret);
  const supplied = normalizeText(request.headers.get("X-HR-Sync-Secret"));
  if (!expected || !supplied) return false;
  const [a, b] = await Promise.all([sha256(expected), sha256(supplied)]);
  return a === b;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function readBearerToken(request) {
  const header = normalizeText(request.headers.get("Authorization"));
  const match = header.match(/^Bearer\s+(.+)$/i);
  return normalizeText(match?.[1]);
}

async function readJsonBody(request, maxBytes = 1_000_000) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > maxBytes) {
    return {
      ok: false,
      response: json(413, { ok: false, message: "request_body_too_large" }),
    };
  }

  try {
    return { ok: true, value: await request.json() };
  } catch {
    return {
      ok: false,
      response: json(400, { ok: false, message: "invalid_json_body" }),
    };
  }
}

function methodOrNotFound(pathname, method) {
  const known =
    pathname === "/api/hr/employees" ||
    pathname === "/api/hr/accounts" ||
    pathname === "/api/hr/permissions" ||
    pathname === "/api/hr/notifications" ||
    pathname === "/api/hr/notifications/read-all" ||
    pathname === "/api/hr/audit-logs" ||
    /^\/api\/hr\/(employees|accounts)\/[^/]+(?:\/permissions)?$/.test(pathname) ||
    /^\/api\/hr\/notifications\/[^/]+\/read$/.test(pathname);
  if (known) {
    return json(405, { ok: false, message: "method_not_allowed", method });
  }
  return json(404, { ok: false, message: "not_found" });
}

function forbidden(message) {
  return json(403, { ok: false, message });
}

function databaseMutationError(message, error) {
  console.error(message, error);
  const detail = normalizeText(error?.message);
  if (detail.includes("UNIQUE constraint failed")) {
    return json(409, { ok: false, message: "unique_constraint_conflict" });
  }
  if (detail.includes("FOREIGN KEY constraint failed")) {
    return json(409, { ok: false, message: "foreign_key_conflict" });
  }
  return json(500, { ok: false, message });
}

function serverError(message, error) {
  console.error(message, error);
  return json(500, { ok: false, message });
}

function withCors(response, request, env) {
  const origin = normalizeText(request.headers.get("Origin"));
  const allowed = new Set(
    normalizeText(env?.ALLOWED_ORIGINS)
      .split(",")
      .map(item => item.trim())
      .filter(Boolean)
  );

  if (origin && allowed.has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
  }
  response.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Authorization,Content-Type,X-HR-Sync-Secret"
  );
  response.headers.set("Access-Control-Max-Age", "86400");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function isPayrollImportPath(pathname) {
  const normalized = normalizePathname(pathname);
  return (
    normalized === "/internal/hr/payroll/import" ||
    normalized === "/internal/hr/payroll-import" ||
    normalized === "/internal/hr/import/payroll"
  );
}

function normalizePathname(value) {
  const pathname = String(value || "/").replace(/\/{2,}/g, "/");
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

function normalizeText(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "undefined" || text === "null") return "";
  return text;
}

function nullableText(value) {
  const text = normalizeText(value);
  return text || null;
}

function nullableEmail(value) {
  const email = normalizeText(value).toLowerCase();
  return email || null;
}

function normalizeRole(value) {
  const role = normalizeText(value).toLowerCase();
  const aliases = {
    employee: "staff",
    human_resources: "hr",
    "human-resources": "hr",
    "human resources": "hr",
    administrator: "admin",
    super_admin: "admin",
  };
  return aliases[role] || role;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeText).filter(Boolean))];
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = normalizeText(value).toLowerCase();
  if (["true", "1", "yes", "active", "enabled", "on"].includes(normalized)) {
    return true;
  }
  if ([
    "false",
    "0",
    "no",
    "inactive",
    "disabled",
    "off",
    "deleted",
    "suspended",
    "terminated",
  ].includes(normalized)) {
    return false;
  }
  return fallback;
}

function normalizeDateToIso(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (Number.isFinite(value?.seconds)) {
    const date = new Date(value.seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "object" && Number.isFinite(value?._seconds)) {
    const date = new Date(value._seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseJsonArray(value) {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function safeJsonStringify(value) {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "bigint") return item.toString();
    return item;
  });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function candidate(source, key) {
  return {
    present:
      Boolean(source) && Object.prototype.hasOwnProperty.call(source, key),
  };
}

function firstDefined(...values) {
  return values.find(value => value !== undefined);
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, match => `\\${match}`);
}

function decodeBase64UrlJson(value) {
  const text = new TextDecoder().decode(decodeBase64UrlBytes(value));
  return JSON.parse(text);
}

function decodeBase64UrlBytes(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}
