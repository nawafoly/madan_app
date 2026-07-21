import { auth } from "@/_core/firebase";

export type HrCoreRole =
  | "owner"
  | "admin"
  | "accountant"
  | "hr"
  | "staff"
  | "client"
  | "guest";

export type HrCoreAccount = {
  uid: string;
  email: string | null;
  username: string | null;
  displayName: string | null;
  title: string | null;
  role: HrCoreRole;
  isActive: boolean;
  employeeProfileEnabled: boolean;
  linkedEmployeeId: string | null;
  authProvider: string;
  employeeName?: string | null;
  employmentStatus?: string | null;
  sourceUpdatedAt: string | null;
  migratedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HrCoreEmployee = {
  id: string;
  authUid: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  title: string | null;
  department: string | null;
  employeeCode: string | null;
  fingerprintNumber: string | null;
  employmentStatus: string;
  isActive: boolean;
  startDate: string | null;
  leaveBalance: number | null;
  salary: {
    baseSalary: number | null;
    housingAllowance: number | null;
    transportationAllowance: number | null;
    otherAllowances: number | null;
    insuranceDeduction: number | null;
    deductions: unknown[];
  };
  workSchedule: {
    startTime: string | null;
    endTime: string | null;
    weeklyOffDays: string[];
  };
  allowedZoneIds: string[];
  adminNotes: string | null;
  personal: Record<string, unknown>;
  employment: Record<string, unknown>;
  account: {
    role: HrCoreRole;
    isActive: boolean | null;
    employeeProfileEnabled: boolean;
  } | null;
  source: string;
  sourceUpdatedAt: string | null;
  migratedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HrCoreEmployeeInput = Partial<{
  id: string;
  authUid: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  title: string | null;
  department: string | null;
  employeeCode: string | null;
  fingerprintNumber: string | null;
  employmentStatus: string;
  isActive: boolean;
  startDate: string | null;
  leaveBalance: number | null;
  baseSalary: number | null;
  housingAllowance: number | null;
  transportationAllowance: number | null;
  otherAllowances: number | null;
  insuranceDeduction: number | null;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
  weeklyOffDays: string[];
  allowedZoneIds: string[];
  salaryDeductions: unknown[];
  adminNotes: string | null;
  personal: Record<string, unknown>;
  employment: Record<string, unknown>;
}>;

export type HrCorePermissionDefinition = {
  key: string;
  labelAr: string;
  labelEn: string;
  category: string;
};

export type HrCorePagination = {
  limit: number;
  offset: number;
  total: number;
  hasMore?: boolean;
};

type HrCoreApiErrorPayload = {
  ok?: boolean;
  message?: string;
  detail?: string;
  unknown?: string[];
};

const HR_CORE_API_URL = String(
  import.meta.env.VITE_HR_CORE_API_URL ?? ""
).trim();

export const HR_CORE_D1_ENABLED = ["1", "true", "yes", "on"].includes(
  String(import.meta.env.VITE_USE_HR_D1 ?? "")
    .trim()
    .toLowerCase()
);

export function isHrCoreConfigured() {
  return Boolean(HR_CORE_API_URL);
}

function buildHrCoreUrl(pathname: string, params?: URLSearchParams) {
  if (!HR_CORE_API_URL) {
    throw new Error("VITE_HR_CORE_API_URL is not configured.");
  }

  const base = HR_CORE_API_URL.endsWith("/")
    ? HR_CORE_API_URL.slice(0, -1)
    : HR_CORE_API_URL;
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const query = params?.toString();
  return `${base}${path}${query ? `?${query}` : ""}`;
}

async function getAuthHeaders(includeJson = false) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Authentication required.");

  const idToken = await currentUser.getIdToken();
  return {
    Accept: "application/json",
    Authorization: `Bearer ${idToken}`,
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
  };
}

async function requestHrCore<T>(
  pathname: string,
  init: RequestInit = {},
  params?: URLSearchParams
): Promise<T> {
  const hasBody = init.body !== undefined && init.body !== null;
  const response = await fetch(buildHrCoreUrl(pathname, params), {
    ...init,
    headers: {
      ...(await getAuthHeaders(hasBody)),
      ...(init.headers || {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | (T & HrCoreApiErrorPayload)
    | null;

  if (!response.ok || !payload) {
    const error = new Error(
      payload?.message ||
        payload?.detail ||
        `HR Core request failed (${response.status}).`
    ) as Error & {
      status?: number;
      code?: string;
      payload?: HrCoreApiErrorPayload | null;
    };
    error.status = response.status;
    error.code = payload?.message;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function getHrCoreMe() {
  return requestHrCore<{
    ok: true;
    account: HrCoreAccount;
    permissions: string[];
  }>("/api/hr/me");
}

export async function listHrCoreEmployees(
  input: {
    search?: string;
    status?: string;
    department?: string;
    active?: boolean | null;
    limit?: number;
    offset?: number;
  } = {}
) {
  const params = new URLSearchParams();
  if (input.search) params.set("search", input.search);
  if (input.status) params.set("status", input.status);
  if (input.department) params.set("department", input.department);
  if (input.active !== undefined && input.active !== null) {
    params.set("active", String(input.active));
  }
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.offset !== undefined) params.set("offset", String(input.offset));

  return requestHrCore<{
    ok: true;
    employees: HrCoreEmployee[];
    pagination: HrCorePagination;
  }>("/api/hr/employees", {}, params);
}

export async function getHrCoreEmployee(employeeId: string) {
  const id = String(employeeId || "").trim();
  if (!id) throw new Error("Employee id is required.");

  return requestHrCore<{
    ok: true;
    employee: HrCoreEmployee;
    account: (HrCoreAccount & { permissions: string[] }) | null;
  }>(`/api/hr/employees/${encodeURIComponent(id)}`);
}

export async function createHrCoreEmployee(input: HrCoreEmployeeInput) {
  return requestHrCore<{
    ok: true;
    employee: HrCoreEmployee;
    account: (HrCoreAccount & { permissions: string[] }) | null;
  }>("/api/hr/employees", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateHrCoreEmployee(
  employeeId: string,
  input: HrCoreEmployeeInput
) {
  const id = String(employeeId || "").trim();
  if (!id) throw new Error("Employee id is required.");

  return requestHrCore<{
    ok: true;
    employee: HrCoreEmployee;
    account: (HrCoreAccount & { permissions: string[] }) | null;
  }>(`/api/hr/employees/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function listHrCoreAccounts(
  input: {
    search?: string;
    role?: HrCoreRole;
    limit?: number;
    offset?: number;
  } = {}
) {
  const params = new URLSearchParams();
  if (input.search) params.set("search", input.search);
  if (input.role) params.set("role", input.role);
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.offset !== undefined) params.set("offset", String(input.offset));

  return requestHrCore<{
    ok: true;
    accounts: HrCoreAccount[];
    pagination: HrCorePagination;
  }>("/api/hr/accounts", {}, params);
}

export async function updateHrCoreAccount(
  uid: string,
  input: Partial<{
    email: string | null;
    username: string | null;
    displayName: string | null;
    title: string | null;
    role: HrCoreRole;
    isActive: boolean;
    employeeProfileEnabled: boolean;
    linkedEmployeeId: string | null;
  }>
) {
  return requestHrCore<{ ok: true; account: HrCoreAccount }>(
    `/api/hr/accounts/${encodeURIComponent(uid)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    }
  );
}

export async function replaceHrCoreAccountPermissions(
  uid: string,
  input: { allow: string[]; deny: string[] }
) {
  return requestHrCore<{
    ok: true;
    uid: string;
    allow: string[];
    deny: string[];
    effective: string[];
  }>(`/api/hr/accounts/${encodeURIComponent(uid)}/permissions`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function listHrCorePermissionDefinitions() {
  return requestHrCore<{
    ok: true;
    permissions: HrCorePermissionDefinition[];
  }>("/api/hr/permissions");
}

export type HrCoreLeaveRequest = {
  id: string;
  employeeId: string | null;
  employeeDocId: string | null;
  employeeUid: string;
  userId: string;
  employeeName: string | null;
  employeeEmail: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled" | string;
  leaveType: string;
  startDate: string;
  endDate: string;
  daysCount: number | null;
  balanceDeductedDays: number;
  balanceRestoredDays: number;
  cancelledDateKeys: string[];
  cancellationDate: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelledByEmail: string | null;
  cancelledByName: string | null;
  employeeNote: string | null;
  hrNote: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  decidedByEmail: string | null;
  decidedByName: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewedByEmail: string | null;
  reviewedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HrCoreAbsence = {
  id: string;
  employeeId: string | null;
  employeeUid: string;
  date: string;
  type: "full_day" | "half_day" | string;
  note: string | null;
  createdByUid: string;
  createdAt: string;
  updatedAt: string;
};

export type HrCoreServiceRequest = {
  id: string;
  employeeId: string | null;
  employeeDocId: string | null;
  employeeUid: string;
  userId: string;
  employeeName: string | null;
  employeeEmail: string | null;
  status: "pending" | "approved" | "rejected" | string;
  requestType: string;
  title: string | null;
  requestDate: string | null;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  amount: number | null;
  letterType: string | null;
  employeeNote: string | null;
  hrNote: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  decidedByEmail: string | null;
  decidedByName: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewedByEmail: string | null;
  reviewedByName: string | null;
  payrollRecordId?: string | null;
  payrollMonth?: string | null;
  settledAt?: string | null;
  settledBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listHrCoreLeaveRequests(
  input: {
    employeeId?: string;
    employeeUid?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const params = new URLSearchParams();
  if (input.employeeId) params.set("employeeId", input.employeeId);
  if (input.employeeUid) params.set("employeeUid", input.employeeUid);
  if (input.status) params.set("status", input.status);
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.offset !== undefined) params.set("offset", String(input.offset));
  return requestHrCore<{
    ok: true;
    leaveRequests: HrCoreLeaveRequest[];
    pagination: HrCorePagination;
  }>("/api/hr/leave-requests", {}, params);
}

export async function createHrCoreLeaveRequest(input: {
  employeeId?: string | null;
  employeeUid?: string;
  employeeName?: string | null;
  employeeEmail?: string | null;
  leaveType: string;
  startDate: string;
  endDate?: string;
  employeeNote?: string | null;
}) {
  return requestHrCore<{ ok: true; leaveRequest: HrCoreLeaveRequest }>(
    "/api/hr/leave-requests",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function reviewHrCoreLeaveRequest(
  id: string,
  input: { status: "approved" | "rejected"; hrNote?: string | null }
) {
  return requestHrCore<{ ok: true; leaveRequest: HrCoreLeaveRequest }>(
    `/api/hr/leave-requests/${encodeURIComponent(id)}/review`,
    { method: "PATCH", body: JSON.stringify(input) }
  );
}

export async function cancelHrCoreLeaveDate(id: string, date: string) {
  return requestHrCore<{ ok: true; leaveRequest: HrCoreLeaveRequest }>(
    `/api/hr/leave-requests/${encodeURIComponent(id)}/cancel-date`,
    { method: "PATCH", body: JSON.stringify({ date }) }
  );
}

export async function listHrCoreAbsences(
  input: {
    employeeId?: string;
    employeeUid?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const params = new URLSearchParams();
  if (input.employeeId) params.set("employeeId", input.employeeId);
  if (input.employeeUid) params.set("employeeUid", input.employeeUid);
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.offset !== undefined) params.set("offset", String(input.offset));
  return requestHrCore<{
    ok: true;
    absences: HrCoreAbsence[];
    pagination: HrCorePagination;
  }>("/api/hr/absences", {}, params);
}

export async function createHrCoreAbsence(input: {
  employeeId?: string | null;
  employeeUid: string;
  date: string;
  type: "full_day" | "half_day";
  note?: string | null;
}) {
  return requestHrCore<{ ok: true; absence: HrCoreAbsence }>(
    "/api/hr/absences",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function deleteHrCoreAbsence(id: string) {
  return requestHrCore<{ ok: true; id: string }>(
    `/api/hr/absences/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
}

export async function listHrCoreServiceRequests(
  input: {
    employeeId?: string;
    employeeUid?: string;
    status?: string;
    requestType?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const params = new URLSearchParams();
  if (input.employeeId) params.set("employeeId", input.employeeId);
  if (input.employeeUid) params.set("employeeUid", input.employeeUid);
  if (input.status) params.set("status", input.status);
  if (input.requestType) params.set("requestType", input.requestType);
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.offset !== undefined) params.set("offset", String(input.offset));
  return requestHrCore<{
    ok: true;
    serviceRequests: HrCoreServiceRequest[];
    pagination: HrCorePagination;
  }>("/api/hr/service-requests", {}, params);
}

export async function createHrCoreServiceRequest(input: {
  employeeId?: string | null;
  employeeUid?: string;
  employeeName?: string | null;
  employeeEmail?: string | null;
  requestType: string;
  title?: string | null;
  requestDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  amount?: number | null;
  letterType?: string | null;
  employeeNote?: string | null;
}) {
  return requestHrCore<{ ok: true; serviceRequest: HrCoreServiceRequest }>(
    "/api/hr/service-requests",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function reviewHrCoreServiceRequest(
  id: string,
  input: { status: "approved" | "rejected"; hrNote?: string | null }
) {
  return requestHrCore<{ ok: true; serviceRequest: HrCoreServiceRequest }>(
    `/api/hr/service-requests/${encodeURIComponent(id)}/review`,
    { method: "PATCH", body: JSON.stringify(input) }
  );
}


export type HrCorePayrollRecord = {
  id: string;
  employeeId: string | null;
  employeeUid: string;
  payrollMonth: string;
  monthStart: string;
  monthEnd: string;
  calculationStartDate: string | null;
  calculationEndDate: string | null;
  baseSalary: number;
  housingAllowance: number | null;
  transportationAllowance: number | null;
  otherAllowances: number | null;
  allowances: number;
  absenceDays: number;
  absenceDeduction: number;
  expectedWorkHours: number | null;
  actualWorkedHours: number | null;
  attendanceLateHours: number | null;
  attendanceMissingHours: number | null;
  attendanceOvertimeHours: number | null;
  attendanceCompleteDays: number | null;
  attendanceIncompleteDays: number | null;
  attendanceAbsentDays: number | null;
  attendanceAbsenceDeduction: number | null;
  attendanceSource: string;
  attendanceSummary: Record<string, unknown>;
  scheduleSnapshot: Record<string, unknown> | null;
  delayDeduction: number;
  overtimeBonus: number;
  insuranceDeduction: number;
  salaryDeductions: Array<{ id?: string; title?: string; amount?: number }>;
  salaryAdvanceDeduction: number;
  salaryAdvanceRequestIds: string[];
  totalSalaryDeductions: number;
  absenceEntries: Array<{ date: string; type: string; note?: string | null }>;
  grossSalary: number | null;
  finalSalary: number;
  mudadDocument: Record<string, unknown> | null;
  status: string;
  source: string;
  sourceUpdatedAt: string | null;
  migratedAt: string | null;
  createdAt: string;
  createdByUid: string | null;
  createdByEmail: string | null;
  updatedAt: string;
};

export async function listHrCorePayrollRecords(
  input: {
    employeeId?: string;
    employeeUid?: string;
    payrollMonth?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const params = new URLSearchParams();
  if (input.employeeId) params.set("employeeId", input.employeeId);
  if (input.employeeUid) params.set("employeeUid", input.employeeUid);
  if (input.payrollMonth) params.set("payrollMonth", input.payrollMonth);
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.offset !== undefined) params.set("offset", String(input.offset));
  return requestHrCore<{
    ok: true;
    payrollRecords: HrCorePayrollRecord[];
    pagination: HrCorePagination;
  }>("/api/hr/payroll-records", {}, params);
}

export async function listHrCorePayrollAdvances(
  input: { employeeId?: string; employeeUid?: string } = {}
) {
  const params = new URLSearchParams();
  if (input.employeeId) params.set("employeeId", input.employeeId);
  if (input.employeeUid) params.set("employeeUid", input.employeeUid);
  return requestHrCore<{ ok: true; advances: HrCoreServiceRequest[] }>(
    "/api/hr/payroll-advances",
    {},
    params
  );
}

export async function createHrCorePayrollRecord(input: Record<string, unknown>) {
  return requestHrCore<{ ok: true; payrollRecord: HrCorePayrollRecord }>(
    "/api/hr/payroll-records",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export type HrCoreNotification = {
  id: string;
  userId: string;
  uid: string | null;
  targetUid: string;
  title: string;
  body: string | null;
  message: string | null;
  type: string;
  relatedTo: string | null;
  relatedId: string | null;
  relatedPath: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listHrCoreNotifications(
  input: {
    targetUid?: string;
    unread?: boolean;
    limit?: number;
    offset?: number;
  } = {}
) {
  const params = new URLSearchParams();
  if (input.targetUid) params.set("targetUid", input.targetUid);
  if (input.unread) params.set("unread", "true");
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.offset !== undefined) params.set("offset", String(input.offset));
  return requestHrCore<{
    ok: true;
    notifications: HrCoreNotification[];
    pagination: HrCorePagination;
  }>("/api/hr/notifications", {}, params);
}

export async function createHrCoreNotification(input: {
  userId?: string;
  targetUid?: string;
  targetRoles?: string[];
  excludeUid?: string | null;
  title: string;
  body: string;
  type?: string | null;
  relatedId?: string | null;
  relatedTo?: string | null;
  relatedPath?: string | null;
}) {
  return requestHrCore<{
    ok: true;
    created: number;
    targetUids: string[];
  }>("/api/hr/notifications", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function markHrCoreNotificationRead(id: string) {
  return requestHrCore<{ ok: true; id: string }>(
    `/api/hr/notifications/${encodeURIComponent(id)}/read`,
    { method: "PATCH", body: JSON.stringify({}) }
  );
}

export async function markHrCoreNotificationsRead(ids: string[] = []) {
  return requestHrCore<{ ok: true }>("/api/hr/notifications/read-all", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export type HrCoreAuditLog = {
  id: string;
  action: string;
  category: string;
  severity: string;
  status: string;
  message: string;
  entityType: string;
  entityId: string;
  entityPath: string;
  actor: { uid: string; name: string; email: string; role: string };
  source: Record<string, unknown>;
  relatedIds: Record<string, string>;
  changes: Array<{ field: string; before: unknown; after: unknown }>;
  meta: Record<string, unknown>;
  requestId: string;
  sessionId: string;
  occurredAt: string;
  createdAt: string;
};

export async function listHrCoreAuditLogs(
  input: {
    category?: string;
    status?: string;
    severity?: string;
    entityType?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const params = new URLSearchParams();
  if (input.category) params.set("category", input.category);
  if (input.status) params.set("status", input.status);
  if (input.severity) params.set("severity", input.severity);
  if (input.entityType) params.set("entityType", input.entityType);
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.offset !== undefined) params.set("offset", String(input.offset));
  return requestHrCore<{
    ok: true;
    auditLogs: HrCoreAuditLog[];
    pagination: HrCorePagination;
  }>("/api/hr/audit-logs", {}, params);
}

export async function createHrCoreAuditLog(input: Record<string, unknown>) {
  return requestHrCore<{ ok: true; id: string }>("/api/hr/audit-logs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type HrCoreDailyTask = Record<string, unknown> & {
  id: string;
  createdByUid: string;
  receiverUid?: string | null;
  status: string;
  taskDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export async function listHrCoreDailyTasks(
  input: {
    createdByUid?: string;
    receiverUid?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const params = new URLSearchParams();
  if (input.createdByUid) params.set("createdByUid", input.createdByUid);
  if (input.receiverUid) params.set("receiverUid", input.receiverUid);
  if (input.status) params.set("status", input.status);
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.offset !== undefined) params.set("offset", String(input.offset));
  return requestHrCore<{
    ok: true;
    dailyTasks: HrCoreDailyTask[];
    pagination: HrCorePagination;
  }>("/api/hr/daily-tasks", {}, params);
}

export async function createHrCoreDailyTask(input: Record<string, unknown>) {
  return requestHrCore<{ ok: true; dailyTask: HrCoreDailyTask }>(
    "/api/hr/daily-tasks",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function updateHrCoreDailyTask(
  id: string,
  input: Record<string, unknown>
) {
  return requestHrCore<{ ok: true; dailyTask: HrCoreDailyTask }>(
    `/api/hr/daily-tasks/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(input) }
  );
}

export type HrCoreWeeklyReport = Record<string, unknown> & {
  id: string;
  createdByUid: string;
  receiverUid?: string | null;
  status: string;
  reportDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export async function listHrCoreWeeklyReports(
  input: {
    createdByUid?: string;
    receiverUid?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const params = new URLSearchParams();
  if (input.createdByUid) params.set("createdByUid", input.createdByUid);
  if (input.receiverUid) params.set("receiverUid", input.receiverUid);
  if (input.status) params.set("status", input.status);
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.offset !== undefined) params.set("offset", String(input.offset));
  return requestHrCore<{
    ok: true;
    weeklyReports: HrCoreWeeklyReport[];
    pagination: HrCorePagination;
  }>("/api/hr/weekly-reports", {}, params);
}

export async function createHrCoreWeeklyReport(input: Record<string, unknown>) {
  return requestHrCore<{ ok: true; weeklyReport: HrCoreWeeklyReport }>(
    "/api/hr/weekly-reports",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function updateHrCoreWeeklyReport(
  id: string,
  input: Record<string, unknown>
) {
  return requestHrCore<{ ok: true; weeklyReport: HrCoreWeeklyReport }>(
    `/api/hr/weekly-reports/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(input) }
  );
}

export type HrCoreEmployeeFile = Record<string, unknown> & {
  id: string;
  employeeId: string | null;
  employeeUid: string | null;
  senderUid: string | null;
  receiverUid: string | null;
  participantUids: string[];
  title: string;
  fileName: string;
  fileUrl: string | null;
  filePath: string | null;
  status: string;
  active: boolean;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listHrCoreEmployeeFiles(
  input: {
    employeeUid?: string;
    participantUid?: string;
    active?: boolean;
    limit?: number;
    offset?: number;
  } = {}
) {
  const params = new URLSearchParams();
  if (input.employeeUid) params.set("employeeUid", input.employeeUid);
  if (input.participantUid) params.set("participantUid", input.participantUid);
  if (input.active !== undefined) params.set("active", String(input.active));
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.offset !== undefined) params.set("offset", String(input.offset));
  return requestHrCore<{
    ok: true;
    employeeFiles: HrCoreEmployeeFile[];
    pagination: HrCorePagination;
  }>("/api/hr/employee-files", {}, params);
}

export async function createHrCoreEmployeeFile(input: Record<string, unknown>) {
  return requestHrCore<{ ok: true; employeeFile: HrCoreEmployeeFile }>(
    "/api/hr/employee-files",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function markHrCoreEmployeeFileRead(id: string) {
  return requestHrCore<{ ok: true; employeeFile: HrCoreEmployeeFile }>(
    `/api/hr/employee-files/${encodeURIComponent(id)}/read`,
    { method: "PATCH", body: JSON.stringify({}) }
  );
}

export async function deleteHrCoreEmployeeFile(id: string) {
  return requestHrCore<{ ok: true; id: string }>(
    `/api/hr/employee-files/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
}

export type HrCoreEmployeeMessage = Record<string, unknown> & {
  id: string;
  employeeId: string | null;
  employeeUid: string | null;
  conversationId: string;
  threadId: string;
  conversationType: string;
  participantUids: string[];
  senderUid: string;
  senderRole: string;
  recipientUid: string;
  messageType: string;
  body: string;
  status: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listHrCoreEmployeeMessages(
  input: {
    employeeUid?: string;
    participantUid?: string;
    conversationId?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const params = new URLSearchParams();
  if (input.employeeUid) params.set("employeeUid", input.employeeUid);
  if (input.participantUid) params.set("participantUid", input.participantUid);
  if (input.conversationId) params.set("conversationId", input.conversationId);
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.offset !== undefined) params.set("offset", String(input.offset));
  return requestHrCore<{
    ok: true;
    employeeMessages: HrCoreEmployeeMessage[];
    pagination: HrCorePagination;
  }>("/api/hr/employee-messages", {}, params);
}

export async function createHrCoreEmployeeMessage(input: Record<string, unknown>) {
  return requestHrCore<{ ok: true; employeeMessage: HrCoreEmployeeMessage }>(
    "/api/hr/employee-messages",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function markHrCoreEmployeeMessageRead(id: string) {
  return requestHrCore<{ ok: true; employeeMessage: HrCoreEmployeeMessage }>(
    `/api/hr/employee-messages/${encodeURIComponent(id)}/read`,
    { method: "PATCH", body: JSON.stringify({}) }
  );
}

export async function markHrCoreEmployeeMessagesRead(ids: string[]) {
  return requestHrCore<{ ok: true }>("/api/hr/employee-messages/read-all", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}
