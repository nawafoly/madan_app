import { buildR2DownloadUrl } from "@/lib/documentUploadService";
import { toDateSafe } from "@/lib/formatters";
import {
  EMPLOYEE_DEFAULT_FILE_TYPE,
  EMPLOYEE_FILE_CATEGORY,
  EMPLOYEE_FILES_COLLECTION,
  EMPLOYEE_FILE_STATUS_ACTIVE,
  EMPLOYEE_FILE_STATUS_REPLACED,
  type EmployeeFileDoc,
  type EmployeeFileStatus,
  type EmployeeFileType,
} from "@shared/employee";

export {
  EMPLOYEE_DEFAULT_FILE_TYPE,
  EMPLOYEE_FILE_CATEGORY,
  EMPLOYEE_FILES_COLLECTION,
  EMPLOYEE_FILE_STATUS_ACTIVE,
  EMPLOYEE_FILE_STATUS_REPLACED,
};

export const EMPLOYEE_FILE_TYPE_OPTIONS: Array<{
  value: EmployeeFileType;
  label: string;
}> = [
  { value: "general", label: "عام" },
  { value: "contract", label: "عقد" },
  { value: "warning", label: "إنذار" },
  { value: "letter", label: "خطاب" },
];

export type EmployeeFileRecord = EmployeeFileDoc & {
  id: string;
  viewUrl: string;
  downloadUrl: string;
  uploadedAtDate: Date | null;
  readAtDate: Date | null;
  replacedAtDate: Date | null;
  fileTypeLabel: string;
  status: EmployeeFileStatus;
  active: boolean;
  statusLabel: string;
  statusTone: "default" | "warning" | "success";
  readStatusLabel: string;
  readStatusTone: "success" | "warning";
};

function pickText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && text !== "undefined" && text !== "null") return text;
  }
  return "";
}

function toNullableNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

export function isEmployeeFileActive(
  raw: Pick<EmployeeFileDoc, "status" | "active"> | null | undefined
) {
  const normalizedStatus = String(raw?.status || "").trim().toLowerCase();
  const normalizedActive = toNullableBoolean(raw?.active);

  if (normalizedStatus === EMPLOYEE_FILE_STATUS_REPLACED) return false;
  if (normalizedActive !== null) return normalizedActive;
  return true;
}

function normalizeEmployeeFileStatus(value: unknown, active: boolean) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return active ? EMPLOYEE_FILE_STATUS_ACTIVE : EMPLOYEE_FILE_STATUS_REPLACED;
  }
  return normalized as EmployeeFileStatus;
}

export function getEmployeeFileStatusLabel(value: unknown, active: boolean) {
  const normalized = normalizeEmployeeFileStatus(value, active);
  if (normalized === EMPLOYEE_FILE_STATUS_REPLACED) {
    return "مستبدل";
  }
  return "النسخة الحالية";
}

export function getEmployeeFileTypeLabel(value: unknown) {
  const normalized = String(value || EMPLOYEE_DEFAULT_FILE_TYPE)
    .trim()
    .toLowerCase();

  return (
    EMPLOYEE_FILE_TYPE_OPTIONS.find(option => option.value === normalized)?.label ||
    normalized ||
    "عام"
  );
}

export function normalizeEmployeeFileRecord(
  id: string,
  raw: Record<string, any> | null | undefined
): EmployeeFileRecord {
  const filePath = pickText(raw?.filePath);
  const fileUrl = pickText(raw?.fileUrl, filePath ? buildR2DownloadUrl(filePath, false) : "");
  const viewUrl = fileUrl || (filePath ? buildR2DownloadUrl(filePath, false) : "");
  const downloadUrl = pickText(
    filePath ? buildR2DownloadUrl(filePath, true) : "",
    fileUrl,
    viewUrl
  );
  const uploadedAtDate = toDateSafe(raw?.uploadedAt);
  const isRead = Boolean(raw?.isRead);
  const readAtDate = toDateSafe(raw?.readAt);
  const active = isEmployeeFileActive(raw);
  const status = normalizeEmployeeFileStatus(raw?.status, active);
  const replacedAtDate = toDateSafe(raw?.replacedAt);

  return {
    id,
    employeeId: pickText(raw?.employeeId),
    employeeUid: pickText(raw?.employeeUid, raw?.userId),
    userId: pickText(raw?.userId) || null,
    employeeName: pickText(raw?.employeeName) || null,
    title: pickText(raw?.title) || "ملف داخلي",
    description: pickText(raw?.description) || null,
    fileType: pickText(raw?.fileType) || EMPLOYEE_DEFAULT_FILE_TYPE,
    fileId: pickText(raw?.fileId) || null,
    fileName: pickText(raw?.fileName) || "attachment",
    filePath: filePath || null,
    fileUrl: fileUrl || viewUrl,
    contentType: pickText(raw?.contentType) || null,
    fileSize: toNullableNumber(raw?.fileSize),
    category: pickText(raw?.category, EMPLOYEE_FILE_CATEGORY) || EMPLOYEE_FILE_CATEGORY,
    uploadedBy: pickText(raw?.uploadedBy) || null,
    uploadedByName: pickText(raw?.uploadedByName) || null,
    uploadedAt: raw?.uploadedAt ?? null,
    status,
    active,
    replacedAt: raw?.replacedAt ?? null,
    replacedBy: pickText(raw?.replacedBy) || null,
    replacedByName: pickText(raw?.replacedByName) || null,
    replacedByFileId: pickText(raw?.replacedByFileId) || null,
    replacesFileId: pickText(raw?.replacesFileId) || null,
    isRead,
    readAt: raw?.readAt ?? null,
    updatedAt: raw?.updatedAt ?? null,
    viewUrl,
    downloadUrl,
    uploadedAtDate,
    readAtDate,
    replacedAtDate,
    fileTypeLabel: getEmployeeFileTypeLabel(raw?.fileType),
    statusLabel: getEmployeeFileStatusLabel(raw?.status, active),
    statusTone: active ? "success" : "default",
    readStatusLabel: isRead ? "مقروء" : "جديد",
    readStatusTone: isRead ? "success" : "warning",
  };
}

export function sortEmployeeFiles(records: EmployeeFileRecord[]) {
  return [...records].sort((left, right) => {
    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }
    const leftTime = left.uploadedAtDate?.getTime() ?? 0;
    const rightTime = right.uploadedAtDate?.getTime() ?? 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return left.title.localeCompare(right.title, "ar");
  });
}

export function filterActiveEmployeeFiles(records: EmployeeFileRecord[]) {
  return records.filter(record => record.active);
}
