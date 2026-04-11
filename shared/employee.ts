export const EMPLOYEE_AVATAR_CATEGORY = "employee_avatar" as const;
export const EMPLOYEE_FILES_COLLECTION = "employee_files" as const;
export const EMPLOYEE_FILE_CATEGORY = "employee_file" as const;
export const EMPLOYEE_MESSAGES_COLLECTION = "employee_messages" as const;
export const EMPLOYEE_NOTIFICATIONS_COLLECTION = "notifications" as const;
export const EMPLOYEE_DEFAULT_FILE_TYPE = "general" as const;
export const EMPLOYEE_FILE_STATUS_ACTIVE = "active" as const;
export const EMPLOYEE_FILE_STATUS_REPLACED = "replaced" as const;
export const EMPLOYEE_CONVERSATION_TYPES = [
  "hr_to_employee",
  "employee_to_employee",
] as const;
export const EMPLOYEE_MESSAGE_TYPES = ["message", "notice", "system"] as const;
export const EMPLOYEE_NOTIFICATION_TYPES = [
  "leave",
  "file",
  "message",
  "system",
] as const;
export const EMPLOYEE_FILE_TYPES = [
  EMPLOYEE_DEFAULT_FILE_TYPE,
  "contract",
  "warning",
  "letter",
] as const;
export const EMPLOYEE_FILE_STATUSES = [
  EMPLOYEE_FILE_STATUS_ACTIVE,
  EMPLOYEE_FILE_STATUS_REPLACED,
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
  
    baseSalary?: number | null;
    expectedWorkHours?: number | null;
    actualWorkedHours?: number | null;
    insuranceDeduction?: number | null;
    
    salaryDeductions?: Array<{
      id?: string | null;
      title?: string | null;
      amount?: number | null;
    }> | null;
  
    totalSalaryDeductions?: number | null;
    calculatedGrossSalary?: number | null;
    calculatedNetSalary?: number | null;
  
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
export type EmployeeFileStatus = (typeof EMPLOYEE_FILE_STATUSES)[number] | string;
export type EmployeeConversationType =
  | (typeof EMPLOYEE_CONVERSATION_TYPES)[number]
  | string;
export type EmployeeMessageType = (typeof EMPLOYEE_MESSAGE_TYPES)[number] | string;
export type EmployeeMessageRole = "employee" | "hr" | "system" | string;
export type EmployeeMessageStatus = "sent" | "read" | string;
export type EmployeeNotificationType =
  | (typeof EMPLOYEE_NOTIFICATION_TYPES)[number]
  | string;

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
  status?: EmployeeFileStatus | null;
  active?: boolean | null;
  replacedAt?: unknown | null;
  replacedBy?: string | null;
  replacedByName?: string | null;
  replacedByFileId?: string | null;
  replacesFileId?: string | null;
  isRead: boolean;
  readAt?: unknown | null;
  updatedAt?: unknown;
};

export type EmployeeMessageDoc = {
  employeeId?: string | null;
  employeeUid?: string | null;
  conversationId?: string | null;
  threadId?: string | null;
  conversationType?: EmployeeConversationType | null;
  participantUids?: string[] | null;
  senderUid?: string | null;
  senderRole?: EmployeeMessageRole | null;
  recipientUid?: string | null;
  messageType?: EmployeeMessageType | null;
  body?: string | null;
  status?: EmployeeMessageStatus | null;
  fromUserId: string;
  fromUserName?: string | null;
  fromUserEmail?: string | null;
  fromUserPhoto?: string | null;
  toUserId: string;
  toUserName?: string | null;
  toUserEmail?: string | null;
  toUserPhoto?: string | null;
  message: string;
  type?: EmployeeMessageType | null;
  relatedTo?: string | null;
  relatedId?: string | null;
  createdAt?: unknown;
  isRead: boolean;
  readAt?: unknown | null;
  updatedAt?: unknown;
};

export type EmployeeNotificationDoc = {
  userId: string;
  uid?: string | null;
  targetUid?: string | null;
  title: string;
  body?: string | null;
  message?: string | null;
  type?: EmployeeNotificationType | null;
  relatedTo?: string | null;
  relatedId?: string | null;
  relatedPath?: string | null;
  createdAt?: unknown;
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
