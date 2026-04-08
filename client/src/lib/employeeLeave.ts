import {
  formatDateEN,
  formatNumberEN,
  toDateSafe,
} from "@/lib/formatters";
import type {
  EmployeeLeaveRequestDoc,
  EmployeeLeaveRequestStatus,
  EmployeeLeaveType,
} from "@shared/employee";

export const EMPLOYEE_LEAVE_REQUESTS_COLLECTION =
  "employee_leave_requests" as const;

export const EMPLOYEE_LEAVE_TYPE_OPTIONS: Array<{
  value: EmployeeLeaveType;
  label: string;
}> = [
  { value: "annual", label: "إجازة سنوية" },
  { value: "sick", label: "إجازة مرضية" },
  { value: "emergency", label: "إجازة اضطرارية" },
  { value: "unpaid", label: "إجازة بدون راتب" },
  { value: "other", label: "أخرى" },
];

export type EmployeeLeaveRequestRecord = EmployeeLeaveRequestDoc & {
  id: string;
};

export type EmployeeLeaveStatusMeta = {
  label: string;
  tone: "warning" | "success" | "danger" | "muted";
};

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function toLeaveDate(value: unknown) {
  if (!value) return null;

  if (typeof value === "string") {
    const text = String(value).trim();
    if (!text) return null;

    const simpleDateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (simpleDateMatch) {
      const [, year, month, day] = simpleDateMatch;
      return new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        12,
        0,
        0,
        0
      );
    }
  }

  const date = toDateSafe(value);
  if (!date) return null;

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
    0,
    0,
    0
  );
}

export function buildLeaveDateFromInput(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    12,
    0,
    0,
    0
  );
}

export function formatLeaveDateInput(value: unknown) {
  const date = toLeaveDate(value);
  if (!date) return "";

  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(
    date.getDate()
  )}`;
}

export function calculateLeaveDaysCount(startDate: unknown, endDate: unknown) {
  const start = toLeaveDate(startDate);
  const end = toLeaveDate(endDate);
  if (!start || !end) return null;
  if (end.getTime() < start.getTime()) return null;

  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor((end.getTime() - start.getTime()) / oneDay) + 1;
}

export function getLeaveTypeLabel(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  return (
    EMPLOYEE_LEAVE_TYPE_OPTIONS.find(option => option.value === normalized)?.label ||
    String(value || "").trim() ||
    "غير محدد"
  );
}

export function getLeaveStatusMeta(value: unknown): EmployeeLeaveStatusMeta {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "approved") {
    return { label: "معتمد", tone: "success" };
  }

  if (normalized === "rejected") {
    return { label: "مرفوض", tone: "danger" };
  }

  if (normalized === "pending") {
    return { label: "بانتظار المراجعة", tone: "warning" };
  }

  return {
    label: String(value || "غير محدد").trim() || "غير محدد",
    tone: "muted",
  };
}

export function formatLeaveDaysLabel(daysCount: unknown) {
  const value = Number(daysCount);
  if (!Number.isFinite(value) || value <= 0) return "—";
  return `${formatNumberEN(value)} يوم`;
}

export function formatLeaveDateRange(
  startDate: unknown,
  endDate: unknown
) {
  const start = toLeaveDate(startDate);
  const end = toLeaveDate(endDate);

  if (!start && !end) return "—";
  if (start && end) {
    return `${formatDateEN(start)} - ${formatDateEN(end)}`;
  }

  return formatDateEN(start || end);
}

function getLeaveRequestSortTime(request: EmployeeLeaveRequestDoc) {
  return (
    toLeaveDate(request.startDate)?.getTime() ||
    toDateSafe(request.createdAt)?.getTime() ||
    0
  );
}

export function sortEmployeeLeaveRequests<T extends EmployeeLeaveRequestDoc>(
  requests: T[]
) {
  return [...requests].sort(
    (left, right) => getLeaveRequestSortTime(right) - getLeaveRequestSortTime(left)
  );
}

export function getLatestEmployeeLeaveRequest<T extends EmployeeLeaveRequestDoc>(
  requests: T[]
) {
  return sortEmployeeLeaveRequests(requests)[0] || null;
}

export function getLatestApprovedEmployeeLeaveRequest<
  T extends EmployeeLeaveRequestDoc,
>(requests: T[]) {
  return (
    sortEmployeeLeaveRequests(
      requests.filter(request => String(request.status || "").trim().toLowerCase() === "approved")
    )[0] || null
  );
}

function normalizeLeaveRequestUserId(raw: Record<string, any>) {
  return String(raw.userId || raw.employeeUid || "").trim() || null;
}

export function normalizeEmployeeLeaveRequest(
  id: string,
  raw: Record<string, any>
): EmployeeLeaveRequestRecord {
  const normalizedUserId = normalizeLeaveRequestUserId(raw);
  const normalizedEmployeeUid = String(
    raw.employeeUid || raw.userId || raw.employeeId || ""
  ).trim();
  const normalizedEmployeeId = String(
    raw.employeeId || raw.employeeUid || raw.userId || ""
  ).trim();

  return {
    id,
    employeeId: normalizedEmployeeId,
    employeeUid: normalizedEmployeeUid,
    userId: normalizedUserId,
    employeeName: String(raw.employeeName || "").trim() || null,
    employeeEmail: String(raw.employeeEmail || "").trim() || null,
    status:
      (String(raw.status || "pending").trim().toLowerCase() as EmployeeLeaveRequestStatus) ||
      "pending",
    leaveType: (String(raw.leaveType || "annual").trim().toLowerCase() as EmployeeLeaveType) ||
      "annual",
    startDate: raw.startDate ?? null,
    endDate: raw.endDate ?? null,
    daysCount:
      Number.isFinite(Number(raw.daysCount)) && Number(raw.daysCount) > 0
        ? Number(raw.daysCount)
        : calculateLeaveDaysCount(raw.startDate, raw.endDate),
    employeeNote: String(raw.employeeNote || "").trim() || null,
    hrNote: String(raw.hrNote || "").trim() || null,
    createdAt: raw.createdAt ?? null,
    decidedAt: raw.decidedAt ?? raw.reviewedAt ?? null,
    decidedBy: String(raw.decidedBy || raw.reviewedBy || "").trim() || null,
    decidedByEmail:
      String(raw.decidedByEmail || raw.reviewedByEmail || "").trim() || null,
    decidedByName: String(raw.decidedByName || raw.reviewedByName || "").trim() || null,
    reviewedAt: raw.reviewedAt ?? raw.decidedAt ?? null,
    reviewedBy: String(raw.reviewedBy || raw.decidedBy || "").trim() || null,
    reviewedByEmail:
      String(raw.reviewedByEmail || raw.decidedByEmail || "").trim() || null,
    reviewedByName:
      String(raw.reviewedByName || raw.decidedByName || "").trim() || null,
    updatedAt: raw.updatedAt ?? null,
  };
}
