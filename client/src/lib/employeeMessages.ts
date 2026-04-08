import { toDateSafe } from "@/lib/formatters";
import {
  EMPLOYEE_MESSAGE_TYPES,
  type EmployeeMessageDoc,
  type EmployeeMessageType,
} from "@shared/employee";

export const EMPLOYEE_MESSAGE_TYPE_OPTIONS: Array<{
  value: EmployeeMessageType;
  label: string;
}> = [
  { value: "message", label: "رسالة" },
  { value: "notice", label: "تنبيه" },
  { value: "system", label: "إشعار نظام" },
];

export type EmployeeMessageRecord = EmployeeMessageDoc & {
  id: string;
  createdAtDate: Date | null;
  readAtDate: Date | null;
  typeLabel: string;
  preview: string;
};

function pickText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && text !== "undefined" && text !== "null") return text;
  }
  return "";
}

function normalizeMessageType(value: unknown) {
  const normalized = String(value || "message").trim().toLowerCase();
  return (EMPLOYEE_MESSAGE_TYPES.includes(normalized as EmployeeMessageType)
    ? normalized
    : "message") as EmployeeMessageType;
}

export function getEmployeeMessageTypeLabel(value: unknown) {
  const normalized = normalizeMessageType(value);
  return (
    EMPLOYEE_MESSAGE_TYPE_OPTIONS.find(option => option.value === normalized)?.label ||
    "رسالة"
  );
}

export function normalizeEmployeeMessageRecord(
  id: string,
  raw: Record<string, any> | null | undefined
): EmployeeMessageRecord {
  const message = pickText(raw?.message);
  const normalizedType = normalizeMessageType(raw?.type);

  return {
    id,
    employeeId: pickText(raw?.employeeId) || null,
    employeeUid: pickText(raw?.employeeUid),
    fromUserId: pickText(raw?.fromUserId),
    fromUserName: pickText(raw?.fromUserName) || null,
    toUserId: pickText(raw?.toUserId),
    toUserName: pickText(raw?.toUserName) || null,
    message,
    type: normalizedType,
    relatedTo: pickText(raw?.relatedTo) || null,
    relatedId: pickText(raw?.relatedId) || null,
    createdAt: raw?.createdAt ?? null,
    isRead: Boolean(raw?.isRead),
    readAt: raw?.readAt ?? null,
    updatedAt: raw?.updatedAt ?? null,
    createdAtDate: toDateSafe(raw?.createdAt),
    readAtDate: toDateSafe(raw?.readAt),
    typeLabel: getEmployeeMessageTypeLabel(normalizedType),
    preview: message.length > 120 ? `${message.slice(0, 117).trim()}...` : message,
  };
}

export function sortEmployeeMessages<T extends EmployeeMessageDoc>(messages: T[]) {
  return [...messages].sort((left, right) => {
    const leftTime = toDateSafe(left.createdAt)?.getTime() ?? 0;
    const rightTime = toDateSafe(right.createdAt)?.getTime() ?? 0;
    return rightTime - leftTime;
  });
}
