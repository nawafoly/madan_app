import type {
  EmployeeServiceRequestDoc,
  EmployeeServiceRequestStatus,
  EmployeeServiceRequestType,
} from "@shared/employee";

export const EMPLOYEE_SERVICE_REQUESTS_COLLECTION =
  "employee_service_requests" as const;

export type EmployeeServiceRequestRecord = EmployeeServiceRequestDoc & {
  id: string;
  createdAtDate: Date | null;
};

export type EmployeeServiceRequestPayloadInput = {
  authUid: string;
  employeeDocId?: string | null;
  employeeName?: string | null;
  employeeEmail?: string | null;
  requestType: EmployeeServiceRequestType;
  title?: string | null;
  requestDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  amount?: number | null;
  letterType?: string | null;
  employeeNote?: string | null;
};

export const EMPLOYEE_SERVICE_REQUEST_OPTIONS: Array<{
  value: EmployeeServiceRequestType;
  label: string;
}> = [
  { value: "attendance_correction", label: "طلب تصحيح" },
  { value: "permission", label: "طلب استئذان" },
  { value: "overtime", label: "طلب أوفرتايم" },
  { value: "salary_advance", label: "صرف معجل للراتب" },
  { value: "resignation", label: "طلب استقالة" },
  { value: "exit_reentry", label: "طلب خروج وعودة" },
  { value: "letter", label: "الخطابات" },
];

function pickText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function toDateSafe(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof (value as { toDate?: unknown })?.toDate === "function") {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      return Number.isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeStatus(value: unknown): EmployeeServiceRequestStatus {
  const normalized = String(value || "pending").trim().toLowerCase();
  if (normalized === "approved" || normalized === "rejected") return normalized;
  return "pending";
}

export function getEmployeeServiceRequestTypeLabel(value: unknown) {
  const normalized = String(value || "").trim();
  return (
    EMPLOYEE_SERVICE_REQUEST_OPTIONS.find(option => option.value === normalized)
      ?.label || "طلب موظف"
  );
}

export function getEmployeeServiceRequestStatusLabel(value: unknown) {
  const status = normalizeStatus(value);
  if (status === "approved") return "معتمد";
  if (status === "rejected") return "مرفوض";
  return "قيد المراجعة";
}

export function buildEmployeeServiceRequestPayload(
  input: EmployeeServiceRequestPayloadInput
): EmployeeServiceRequestDoc {
  return {
    employeeUid: input.authUid,
    userId: input.authUid,
    employeeDocId: pickText(input.employeeDocId) || null,
    employeeId: pickText(input.employeeDocId) || null,
    employeeName: pickText(input.employeeName) || null,
    employeeEmail: pickText(input.employeeEmail) || null,
    status: "pending",
    requestType: input.requestType,
    title: pickText(input.title) || getEmployeeServiceRequestTypeLabel(input.requestType),
    requestDate: pickText(input.requestDate) || null,
    startDate: pickText(input.startDate) || null,
    endDate: pickText(input.endDate) || null,
    startTime: pickText(input.startTime) || null,
    endTime: pickText(input.endTime) || null,
    amount:
      typeof input.amount === "number" && Number.isFinite(input.amount)
        ? input.amount
        : null,
    letterType: pickText(input.letterType) || null,
    employeeNote: pickText(input.employeeNote) || null,
    hrNote: null,
  };
}

export function normalizeEmployeeServiceRequest(
  id: string,
  raw: Record<string, any>
): EmployeeServiceRequestRecord {
  const createdAtDate = toDateSafe(raw.createdAt);
  return {
    id,
    employeeUid: pickText(raw.employeeUid, raw.userId),
    userId: pickText(raw.userId, raw.employeeUid) || null,
    employeeDocId: pickText(raw.employeeDocId, raw.employeeId) || null,
    employeeId: pickText(raw.employeeId, raw.employeeDocId) || null,
    employeeName: pickText(raw.employeeName) || null,
    employeeEmail: pickText(raw.employeeEmail) || null,
    status: normalizeStatus(raw.status),
    requestType: pickText(raw.requestType) || "attendance_correction",
    title: pickText(raw.title) || null,
    requestDate: pickText(raw.requestDate) || null,
    startDate: pickText(raw.startDate) || null,
    endDate: pickText(raw.endDate) || null,
    startTime: pickText(raw.startTime) || null,
    endTime: pickText(raw.endTime) || null,
    amount:
      typeof raw.amount === "number" && Number.isFinite(raw.amount)
        ? raw.amount
        : null,
    letterType: pickText(raw.letterType) || null,
    employeeNote: pickText(raw.employeeNote) || null,
    hrNote: pickText(raw.hrNote) || null,
    createdAt: raw.createdAt ?? null,
    createdAtDate,
    decidedAt: raw.decidedAt ?? null,
    decidedBy: pickText(raw.decidedBy) || null,
    decidedByEmail: pickText(raw.decidedByEmail) || null,
    decidedByName: pickText(raw.decidedByName) || null,
    reviewedAt: raw.reviewedAt ?? null,
    reviewedBy: pickText(raw.reviewedBy) || null,
    reviewedByEmail: pickText(raw.reviewedByEmail) || null,
    reviewedByName: pickText(raw.reviewedByName) || null,
    updatedAt: raw.updatedAt ?? null,
  };
}

export function sortEmployeeServiceRequests<T extends EmployeeServiceRequestRecord>(
  requests: T[]
) {
  return [...requests].sort(
    (left, right) =>
      (right.createdAtDate?.getTime() || 0) -
      (left.createdAtDate?.getTime() || 0)
  );
}
