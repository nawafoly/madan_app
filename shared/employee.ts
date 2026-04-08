export const EMPLOYEE_AVATAR_CATEGORY = "employee_avatar" as const;
export const EMPLOYEE_FILES_COLLECTION = "employee_files" as const;
export const EMPLOYEE_FILE_CATEGORY = "employee_file" as const;
export const EMPLOYEE_DEFAULT_FILE_TYPE = "general" as const;
export const EMPLOYEE_FILE_TYPES = [
  EMPLOYEE_DEFAULT_FILE_TYPE,
  "contract",
  "warning",
  "letter",
] as const;

export type EmployeeAvatarDoc = {
  id?: string | null;
  fileName?: string | null;
  filePath?: string | null;
  fileUrl?: string | null;
  contentType?: string | null;
  fileSize?: number | null;
  uploadedAt?: unknown;
};

export type EmployeePersonalDoc = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar?: EmployeeAvatarDoc | null;
};

export type EmployeeEmploymentStatus =
  | "active"
  | "probation"
  | "on_leave"
  | "inactive"
  | "suspended"
  | "terminated"
  | string;

export type EmployeeEmploymentDoc = {
  title?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  startDate?: unknown;
  leaveBalance?: number | null;
  status?: EmployeeEmploymentStatus | null;
  employmentStatus?: EmployeeEmploymentStatus | null;
  employeeCode?: string | null;
  fingerprintNumber?: string | null;
  adminNotes?: string | null;
  updatedAt?: unknown;
  updatedByUid?: string | null;
  updatedByEmail?: string | null;
};

export type EmployeeProfileDoc = {
  personal?: EmployeePersonalDoc | null;
  employment?: EmployeeEmploymentDoc | null;
};

export type EmployeeFileType = (typeof EMPLOYEE_FILE_TYPES)[number] | string;

export type EmployeeFileDoc = {
  employeeId: string;
  employeeUid: string;
  userId?: string | null;
  employeeName?: string | null;
  title: string;
  description?: string | null;
  fileType?: EmployeeFileType | null;
  fileId?: string | null;
  fileName: string;
  filePath?: string | null;
  fileUrl: string;
  contentType?: string | null;
  fileSize?: number | null;
  category?: string | null;
  uploadedBy?: string | null;
  uploadedByName?: string | null;
  uploadedAt?: unknown;
  isRead: boolean;
  readAt?: unknown | null;
  updatedAt?: unknown;
};

export type EmployeeLeaveRequestStatus =
  | "pending"
  | "approved"
  | "rejected";

export type EmployeeLeaveType =
  | "annual"
  | "sick"
  | "emergency"
  | "unpaid"
  | "other"
  | string;

export type EmployeeLeaveRequestDoc = {
  employeeId?: string | null;
  employeeDocId?: string | null;
  employeeUid: string;
  userId?: string | null;
  employeeName?: string | null;
  employeeEmail?: string | null;
  status: EmployeeLeaveRequestStatus;
  leaveType: EmployeeLeaveType;
  startDate: unknown;
  endDate: unknown;
  daysCount: number | null;
  employeeNote?: string | null;
  hrNote?: string | null;
  createdAt?: unknown;
  decidedAt?: unknown;
  decidedBy?: string | null;
  decidedByEmail?: string | null;
  decidedByName?: string | null;
  reviewedAt?: unknown;
  reviewedBy?: string | null;
  reviewedByEmail?: string | null;
  reviewedByName?: string | null;
  updatedAt?: unknown;
};
