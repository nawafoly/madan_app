import { buildR2DownloadUrl } from "@/lib/documentUploadService";
import { toDateSafe } from "@/lib/formatters";
import {
  EMPLOYEE_DEFAULT_FILE_TYPE,
  EMPLOYEE_FILE_CATEGORY,
  EMPLOYEE_FILES_COLLECTION,
  type EmployeeFileDoc,
  type EmployeeFileType,
} from "@shared/employee";

export {
  EMPLOYEE_DEFAULT_FILE_TYPE,
  EMPLOYEE_FILE_CATEGORY,
  EMPLOYEE_FILES_COLLECTION,
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
  fileTypeLabel: string;
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
    isRead,
    readAt: raw?.readAt ?? null,
    updatedAt: raw?.updatedAt ?? null,
    viewUrl,
    downloadUrl,
    uploadedAtDate,
    readAtDate,
    fileTypeLabel: getEmployeeFileTypeLabel(raw?.fileType),
    readStatusLabel: isRead ? "مقروء" : "جديد",
    readStatusTone: isRead ? "success" : "warning",
  };
}

export function sortEmployeeFiles(records: EmployeeFileRecord[]) {
  return [...records].sort((left, right) => {
    const leftTime = left.uploadedAtDate?.getTime() ?? 0;
    const rightTime = right.uploadedAtDate?.getTime() ?? 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return left.title.localeCompare(right.title, "ar");
  });
}
