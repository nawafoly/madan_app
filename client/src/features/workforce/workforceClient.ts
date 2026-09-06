import { auth } from "@/_core/firebase";

const WORKFORCE_API_BASE = String(
  import.meta.env.VITE_WORKFORCE_API_BASE || "/habat-api/workforce/v1"
).replace(/\/$/, "");

export type WorkforceEmployeeStatus = "active" | "inactive" | "terminated";
export type WorkforceEmploymentStatus = WorkforceEmployeeStatus;
export type WorkforceAttendanceLinkStatus = "confirmed" | "unlinked" | "not_ready" | "exempt";

export type WorkforceEmployee = {
  id: string;
  accountUid: string | null;
  accountEmail: string | null;
  employeeNumber: string | null;
  displayName: string;
  jobTitle: string | null;
  phone: string | null;
  status: WorkforceEmployeeStatus;
  serviceStartDate?: string | null;
  serviceEndDate?: string | null;
  employmentStatus?: WorkforceEmploymentStatus | null;
  attendanceLinkStatus?: WorkforceAttendanceLinkStatus | null;
};

export type WorkforceEmployment = {
  employeeId: string;
  serviceStartDate: string | null;
  serviceEndDate: string | null;
  employmentStatus: WorkforceEmploymentStatus;
  department: string | null;
  locationId: string | null;
  notes: string | null;
  updatedAt: string | null;
};

export type WorkforcePayrollSettings = {
  employeeId: string;
  baseSalaryHalalas: number;
  housingAllowanceHalalas: number;
  transportationAllowanceHalalas: number;
  otherAllowancesHalalas: number;
  workDaysPerMonth: number | null;
  dailyHours: number | null;
  monthlyHours: number | null;
  deductionMethod: "hourly" | "daily";
  overtimeEnabled: boolean;
  overtimeMultiplier: number;
  attendancePayrollMode: "required" | "exempt";
  attendancePayrollExemptionReason: string | null;
  updatedAt: string | null;
};

export type WorkforceAttendanceLink = {
  status: WorkforceAttendanceLinkStatus;
  sourceType: string;
  sourceEmployeeId: string;
  exemptionReason: string | null;
};

export type WorkforceScheduleTemplate = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  earlyLeaveToleranceMinutes: number;
  workingDays: number[];
  isActive: boolean;
};

export type WorkforceLeave = {
  id: string;
  employee_id: string;
  leave_type: "annual" | "sick" | "emergency" | "unpaid" | "rest" | "weekly_rest_substitute" | "other";
  duration_kind: "full_day" | "half_day" | "partial";
  start_date: string;
  end_date: string;
  partial_start_time?: string | null;
  partial_end_time?: string | null;
  requested_minutes?: number | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reason?: string | null;
  note?: string | null;
};

export type WorkforceAbsence = {
  id: string;
  employee_id: string;
  absence_date: string;
  day_portion: "full_day" | "half_day";
  status: "pending" | "approved" | "cancelled";
  reason?: string | null;
  payroll_treatment: "attendance_policy" | "no_deduction" | "manual_review";
};

export type WorkforceEmployeeFile = {
  employee: WorkforceEmployee;
  employment: WorkforceEmployment | null;
  payrollSettings: WorkforcePayrollSettings | null;
  attendanceLink: WorkforceAttendanceLink | null;
};

export class WorkforceApiError extends Error {
  status: number;
  code: string;
  payload: Record<string, unknown> | null;

  constructor(status: number, code: string, payload?: Record<string, unknown> | null) {
    super(code);
    this.status = status;
    this.code = code;
    this.payload = payload || null;
  }
}

export async function workforceApi<T>(path: string, init?: RequestInit): Promise<T> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new WorkforceApiError(401, "workforce_authentication_required");

  const token = await currentUser.getIdToken();
  const headers = new Headers(init?.headers || {});
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${WORKFORCE_API_BASE}/${path.replace(/^\/+/, "")}`, {
    ...init,
    headers,
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok || !payload) {
    throw new WorkforceApiError(
      response.status,
      String(payload?.message || `workforce_http_${response.status}`),
      payload
    );
  }

  return payload as T;
}

export const WorkforceService = {
  syncCurrentSource() {
    return workforceApi<{ ok: true; sourceCount: number; created: number; updated: number; linked: number }>(
      "bootstrap/sync-source",
      { method: "POST" }
    );
  },

  listEmployees(params?: { status?: WorkforceEmployeeStatus; q?: string }) {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    if (params?.q) search.set("q", params.q);
    const suffix = search.size ? `?${search.toString()}` : "";
    return workforceApi<{ ok: true; employees: WorkforceEmployee[] }>(`employees${suffix}`);
  },

  getEmployee(employeeId: string) {
    return workforceApi<{ ok: true } & WorkforceEmployeeFile>(`employees/${encodeURIComponent(employeeId)}`);
  },

  updateEmployee(
    employeeId: string,
    input: Partial<Pick<WorkforceEmployee, "displayName" | "employeeNumber" | "jobTitle" | "phone" | "status">>
  ) {
    return workforceApi<{ ok: true; employee: WorkforceEmployee }>(`employees/${encodeURIComponent(employeeId)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  getEmployment(employeeId: string) {
    return workforceApi<{ ok: true; employment: WorkforceEmployment | null }>(
      `employees/${encodeURIComponent(employeeId)}/employment`
    );
  },

  saveEmployment(employeeId: string, input: Partial<WorkforceEmployment>) {
    return workforceApi<{ ok: true; employment: WorkforceEmployment }>(
      `employees/${encodeURIComponent(employeeId)}/employment`,
      { method: "PUT", body: JSON.stringify(input) }
    );
  },

  getPayrollSettings(employeeId: string) {
    return workforceApi<{ ok: true; payrollSettings: WorkforcePayrollSettings | null }>(
      `employees/${encodeURIComponent(employeeId)}/payroll-settings`
    );
  },

  savePayrollSettings(employeeId: string, input: Partial<WorkforcePayrollSettings>) {
    return workforceApi<{ ok: true; payrollSettings: WorkforcePayrollSettings }>(
      `employees/${encodeURIComponent(employeeId)}/payroll-settings`,
      { method: "PUT", body: JSON.stringify(input) }
    );
  },

  listLeaves(employeeId: string) {
    return workforceApi<{ ok: true; leaves: WorkforceLeave[] }>(
      `employees/${encodeURIComponent(employeeId)}/leaves`
    );
  },

  createLeave(
    employeeId: string,
    input: {
      leaveType: WorkforceLeave["leave_type"];
      durationKind?: WorkforceLeave["duration_kind"];
      startDate: string;
      endDate?: string;
      partialStartTime?: string;
      partialEndTime?: string;
      requestedMinutes?: number;
      reason?: string;
      note?: string;
    }
  ) {
    return workforceApi<{ ok: true; leave: WorkforceLeave }>(
      `employees/${encodeURIComponent(employeeId)}/leaves`,
      { method: "POST", body: JSON.stringify(input) }
    );
  },

  listAbsences(employeeId: string) {
    return workforceApi<{ ok: true; absences: WorkforceAbsence[] }>(
      `employees/${encodeURIComponent(employeeId)}/absences`
    );
  },

  createAbsence(
    employeeId: string,
    input: {
      absenceDate: string;
      dayPortion?: WorkforceAbsence["day_portion"];
      reason?: string;
      payrollTreatment?: WorkforceAbsence["payroll_treatment"];
    }
  ) {
    return workforceApi<{ ok: true; absence: WorkforceAbsence }>(
      `employees/${encodeURIComponent(employeeId)}/absences`,
      { method: "POST", body: JSON.stringify(input) }
    );
  },

  listScheduleTemplates() {
    return workforceApi<{ ok: true; templates: WorkforceScheduleTemplate[] }>("schedule/templates");
  },

  createScheduleTemplate(input: {
    name: string;
    startTime: string;
    endTime: string;
    graceMinutes?: number;
    earlyLeaveToleranceMinutes?: number;
    workingDays: number[];
  }) {
    return workforceApi<{ ok: true; template: WorkforceScheduleTemplate }>("schedule/templates", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  listScheduleAssignments(employeeId: string) {
    return workforceApi<{ ok: true; assignments: Array<Record<string, unknown>> }>(
      `employees/${encodeURIComponent(employeeId)}/schedule-assignments`
    );
  },

  createScheduleAssignment(
    employeeId: string,
    input: { templateId: string; effectiveFrom: string; effectiveTo?: string | null }
  ) {
    return workforceApi<{ ok: true; assignment: Record<string, unknown> }>(
      `employees/${encodeURIComponent(employeeId)}/schedule-assignments`,
      { method: "POST", body: JSON.stringify(input) }
    );
  },
};

export function riyalsToHalalas(value: number | string) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100)) : 0;
}

export function halalasToRiyals(value: number | null | undefined) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number / 100 : 0;
}
