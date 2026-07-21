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
