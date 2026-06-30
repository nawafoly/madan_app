import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useSearch } from "wouter";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  or,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
  where,
} from "firebase/firestore";
import {
  BriefcaseBusiness,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ChevronLeft,
  Download,
  Eye,
  FileText,
  ArrowRight,
  Camera,
  Inbox,
  Loader2,
  Mail,
  MapPin,
  Minus,
  Phone,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import DashboardLayout from "@/components/DashboardLayout";
import EmployeeTodayAttendancePanel from "@/components/EmployeeTodayAttendancePanel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { auth, db } from "@/_core/firebase";
import { hasPermission, useAuth } from "@/_core/hooks/useAuth";
import {
  AUDIT_ACTIONS,
  auditedDeleteDoc,
  auditedUpdateDoc,
  buildAuditSource,
  logAuditEvent,
} from "@/lib/auditLog";
import {
  fetchAttendanceRecords,
  type AttendanceRecord,
} from "@/lib/attendanceRecords";
import {
  getShiftExpectedHours,
  summarizeAttendanceForPayroll,
} from "@/lib/attendanceCalculations";
import type { AttendancePayrollSummary } from "@/lib/attendanceCalculations";
import {
  WORK_SCHEDULE_WEEKDAYS,
  buildDateKeysInRange,
  buildWorkDateKeysInRange,
  formatWeeklyOffDaysLabel,
  normalizeWeeklyOffDays,
  type WorkScheduleWeekday,
} from "@/lib/workSchedule";
import {
  EMPLOYEE_ABSENCES_COLLECTION,
  EMPLOYEE_ABSENCE_TYPE_OPTIONS,
  buildEmployeeAbsenceDateInput,
  buildEmployeeAbsencePayload,
  formatEmployeeAbsenceDate,
  formatEmployeeAbsenceDays,
  getEmployeeAbsenceTypeLabel,
  isValidEmployeeAbsenceDate,
  normalizeEmployeeAbsence,
  sortEmployeeAbsences,
  type EmployeeAbsenceRecord,
} from "@/lib/employeeAbsence";
import {
  EMPLOYEE_DEFAULT_FILE_TYPE,
  EMPLOYEE_FILE_CATEGORY,
  EMPLOYEE_FILES_COLLECTION,
  EMPLOYEE_FILE_TYPE_OPTIONS,
  filterActiveEmployeeFiles,
  isOfficialEmployeeFile,
  normalizeEmployeeFileRecord,
  sortEmployeeFiles,
  type EmployeeFileRecord,
} from "@/lib/employeeFiles";
import {
  EMPLOYEE_MESSAGE_TYPE_OPTIONS,
  groupEmployeeMessageConversations,
  normalizeEmployeeMessageRecord,
  type EmployeeMessageConversationRecord,
  type EmployeeMessageRecord,
} from "@/lib/employeeMessages";
import {
  buildR2DownloadUrl,
  uploadDocumentToCloudflare,
} from "@/lib/documentUploadService";
import { updateProfile } from "firebase/auth";
import {
  createInAppNotification,
  markInAppNotificationsRead,
  normalizeInAppNotificationRecord,
  type InAppNotificationRecord,
} from "@/lib/inAppNotifications";
import {
  EMPLOYEE_AVATAR_CATEGORY,
  EMPLOYEE_EMPTY_VALUE,
  buildEmployeeAvatarPatch,
  normalizeEmployeeProfile,
  type EmployeeAvatarDoc,
  type EmployeeProfileUserDoc,
} from "@/lib/employeeProfile";
import {
  EMPLOYEE_LEAVE_REQUESTS_COLLECTION,
  getLatestApprovedEmployeeLeaveRequest,
  formatLeaveDateInput,
  formatLeaveDateRange,
  formatLeaveDaysLabel,
  getLeaveStatusMeta,
  getLeaveTypeLabel,
  normalizeEmployeeLeaveRequest,
  sortEmployeeLeaveRequests,
  type EmployeeLeaveRequestRecord,
} from "@/lib/employeeLeave";
import {
  EMPLOYEE_SERVICE_REQUESTS_COLLECTION,
  getEmployeeServiceRequestStatusLabel,
  getEmployeeServiceRequestTypeLabel,
  normalizeEmployeeServiceRequest,
  sortEmployeeServiceRequests,
  type EmployeeServiceRequestRecord,
} from "@/lib/employeeServiceRequests";
import type { EmployeeServiceRequestStatus } from "@shared/employee";
import {
  EMPLOYEE_PAYROLL_RECORDS_COLLECTION,
  buildEmployeePayrollMonthInput,
  buildEmployeePayrollRecordId,
  computeEmployeePayroll,
  formatEmployeePayrollMonthLabel,
  normalizeEmployeePayrollRecord,
  parseEmployeePayrollMonth,
  sortEmployeePayrollRecords,
  type EmployeePayrollRecord,
} from "@/lib/employeePayroll";
import { generateEmployeeExcelReport } from "@/lib/employeeExcelReport";
import {
  formatDateEN,
  formatDateTimeEN,
  formatFileSizeEN,
  formatNumberEN,
  toDateSafe,
} from "@/lib/formatters";
import { useLanguage } from "@/contexts/LanguageContext";
import { languageDir, safeEnglishText, tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  createWorkZone,
  fetchWorkZones,
  formatZoneRadiusLabel,
  normalizeAllowedZoneIds,
  updateWorkZone,
  type WorkZone,
} from "@/lib/workZones";
import type {
  EmployeeAbsenceType,
  EmployeeEmploymentDoc,
  EmployeeEmploymentStatus,
  EmployeeFileDoc,
  EmployeeLeaveRequestDoc,
  EmployeeLeaveRequestStatus,
  EmployeeMessageDoc,
  EmployeeMessageType,
} from "@shared/employee";
import {
  EMPLOYEE_MESSAGES_COLLECTION,
  EMPLOYEE_NOTIFICATIONS_COLLECTION,
} from "@shared/employee";

type EmployeeRecord = EmployeeProfileUserDoc & {
  id: string;
  linkedEmployeeId?: string | null;
  allowedZoneIds?: string[] | null;
  firebaseUser?: {
    photoURL?: string | null;
  } | null;
};

type SelectedEmployeeEmployment = {
  title: string;
  department: string;
  statusLabel: string;
  statusTone: "success" | "warning" | "neutral";
  employeeCode: string;
  startDate: Date | null;
  fingerprintNumber: string;
};

type EmployeeFormValues = {
  fullName: string;
  email: string;
  phone: string;
  jobTitle: string;
  department: string;
  fingerprintNumber: string;
  employmentStatus: string;
  startDate: string;
  leaveBalance: string;
  baseSalary: string;
  housingAllowance: string;
  transportationAllowance: string;
  otherAllowances: string;
  expectedWorkDays: string;
  expectedWorkHours: string;
  actualWorkedHours: string;
  shiftStartTime: string;
  shiftEndTime: string;
  weeklyOffDays: WorkScheduleWeekday[];
  overtimeHourlyRate: string;
  insuranceDeduction: string;
  allowedZoneIds: string[];
  adminNotes: string;
};

type EmployeeWorkZoneFormValues = {
  name: string;
  lat: string;
  lng: string;
  radiusMeters: string;
};

const DEFAULT_WORK_ZONE_CENTER = { lat: 24.7136, lng: 46.6753 };

function buildEmployeeWorkZoneFormValues(): EmployeeWorkZoneFormValues {
  return {
    name: "",
    lat: String(DEFAULT_WORK_ZONE_CENTER.lat),
    lng: String(DEFAULT_WORK_ZONE_CENTER.lng),
    radiusMeters: "200",
  };
}

type EmployeeFileFormValues = {
  title: string;
  description: string;
  fileType: string;
  file: File | null;
};

type EmployeeMessageFormValues = {
  type: EmployeeMessageType;
  message: string;
};

type EmployeeSalaryDeductionFormValue = {
  id: string;
  title: string;
  amount: string;
};

type EmployeeAbsenceFormValues = {
  date: string;
  type: EmployeeAbsenceType;
  note: string;
};

type EmployeeWorkspaceSectionKey =
  | "profile"
  | "schedule"
  | "attendance"
  | "salary"
  | "requests"
  | "leave"
  | "messages"
  | "files";

const EMPLOYEE_WORKSPACE_SECTIONS: Array<{
  key: EmployeeWorkspaceSectionKey;
  label: string;
  icon: typeof ShieldCheck;
}> = [
  { key: "profile", label: "بيانات الموظف", icon: ShieldCheck },
  { key: "schedule", label: "جدول الدوام", icon: Clock3 },
  { key: "attendance", label: "الحضور", icon: Clock3 },
  { key: "salary", label: "سجل الرواتب", icon: BadgeCheck },
  { key: "requests", label: "الطلبات", icon: Inbox },
  { key: "leave", label: "الإجازات", icon: CalendarDays },
  { key: "messages", label: "الرسائل", icon: Mail },
  { key: "files", label: "الملفات", icon: FileText },
];

function resolveEmployeeWorkspaceSection(
  panel: string
): EmployeeWorkspaceSectionKey | null {
  switch (
    String(panel || "")
      .trim()
      .toLowerCase()
  ) {
    case "profile":
    case "overview":
    case "employee":
    case "employee-info":
      return "profile";
    case "attendance":
    case "attendances":
    case "check-in":
    case "checkins":
      return "attendance";
    case "schedule":
    case "work-schedule":
    case "shift":
    case "shifts":
      return "schedule";
    case "salary-settings":
    case "salary-data":
    case "salary-info":
      return "profile";
    case "salary":
    case "payroll":
      return "salary";
    case "leave":
    case "leaves":
    case "vacation":
    case "vacations":
      return "leave";
    case "requests":
    case "request":
    case "service-requests":
    case "employee-requests":
      return "requests";
    case "messages":
      return "messages";
    case "files":
      return "files";
    default:
      return null;
  }
}

type EmployeeWorkspaceNotificationBucket = Record<
  EmployeeWorkspaceSectionKey,
  string[]
> & {
  all: string[];
};

function readWorkspaceNotificationQueryValue(
  path: string | null | undefined,
  key: string
) {
  const normalizedPath = String(path || "").trim();
  if (!normalizedPath) return "";

  const queryIndex = normalizedPath.indexOf("?");
  if (queryIndex < 0) return "";

  try {
    return String(
      new URLSearchParams(normalizedPath.slice(queryIndex + 1)).get(key) || ""
    ).trim();
  } catch {
    return "";
  }
}

function resolveEmployeeWorkspaceNotificationEmployeeId(
  notification: Pick<InAppNotificationRecord, "relatedPath">
) {
  return readWorkspaceNotificationQueryValue(
    notification.relatedPath,
    "employeeId"
  );
}

function resolveEmployeeWorkspaceNotificationSection(
  notification: Pick<InAppNotificationRecord, "relatedPath" | "relatedTo">
) {
  const panel = readWorkspaceNotificationQueryValue(
    notification.relatedPath,
    "panel"
  );
  const resolvedPanel = resolveEmployeeWorkspaceSection(panel);
  if (resolvedPanel) return resolvedPanel;

  const relatedTo = String(notification.relatedTo || "")
    .trim()
    .toLowerCase();
  if (relatedTo === "leave_request") return "leave";
  if (relatedTo === "employee_service_request") return "requests";
  if (relatedTo === "employee_message") return "messages";
  if (relatedTo === "employee_file") return "files";

  return null;
}

function createEmptyEmployeeWorkspaceNotificationBucket(): EmployeeWorkspaceNotificationBucket {
  return {
    profile: [],
    schedule: [],
    attendance: [],
    salary: [],
    requests: [],
    leave: [],
    messages: [],
    files: [],
    all: [],
  };
}

const EMPLOYEE_LEAVE_BALANCE_ADJUSTMENTS_COLLECTION =
  "employee_leave_balance_adjustments";

const OFFICIAL_DOCUMENT_TYPE_OPTIONS = [
  { value: "contract", label: "عقد" },
  { value: "education_certificate", label: "الشهادات" },
  { value: "cv", label: "السيرة الذاتية" },
  { value: "approval", label: "اعتماد" },
];

const EMPLOYMENT_STATUS_OPTIONS: Array<{
  value: EmployeeEmploymentStatus;
  label: string;
}> = [
  { value: "active", label: "على رأس العمل" },
  { value: "probation", label: "فترة تجربة" },
  { value: "on_leave", label: "في إجازة" },
  { value: "inactive", label: "غير نشط" },
  { value: "suspended", label: "موقوف" },
  { value: "terminated", label: "منتهي الارتباط الوظيفي" },
];

function pickText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && text !== "undefined" && text !== "null") return text;
  }
  return "";
}

function toDateInputValue(value: unknown) {
  const date = toDateSafe(value);
  if (!date) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toNullableNumber(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFiniteNumber(value: string) {
  const parsed = Number(String(value || "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCoordinate(value: number) {
  return Number(value.toFixed(7)).toString();
}

function formatHoursDuration(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) {
    return "0 ساعة";
  }

  const totalMinutes = Math.round(Math.abs(value) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (hours) parts.push(`${formatNumberEN(hours)} ساعة`);
  if (minutes) parts.push(`${formatNumberEN(minutes)} دقيقة`);
  return parts.join(" و ") || "0 ساعة";
}

function formatHoursDifferenceLabel(value: number) {
  if (!Number.isFinite(value) || value === 0) return "0 ساعة";
  const duration = formatHoursDuration(value);
  return value > 0 ? `+${duration} إضافية` : `-${duration} نقص`;
}

function isValidTimeInput(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return true;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(normalized);
}

function readWorkScheduleFromEmployment(
  employment: Record<string, any> | null | undefined
) {
  const workSchedule = (employment?.workSchedule || {}) as Record<string, any>;
  return {
    startTime: pickText(workSchedule.startTime, employment?.shiftStartTime),
    endTime: pickText(workSchedule.endTime, employment?.shiftEndTime),
    weeklyOffDays: normalizeWeeklyOffDays(
      workSchedule.weeklyOffDays ?? employment?.weeklyOffDays
    ),
  };
}

function formatWorkScheduleTime(value?: string | null) {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(String(value || "").trim());
  if (!match) return "";

  const hours = Number(match[1]);
  const minutes = match[2];
  const displayHours = hours % 12 || 12;
  const suffix = hours < 12 ? "ص" : "م";
  return `${formatNumberEN(displayHours, { maximumFractionDigits: 0 })}:${minutes} ${suffix}`;
}

function formatWorkScheduleRange(schedule: {
  startTime?: string | null;
  endTime?: string | null;
}) {
  const start = formatWorkScheduleTime(schedule.startTime);
  const end = formatWorkScheduleTime(schedule.endTime);
  return start && end ? `${start} - ${end}` : "غير محدد";
}

function buildApprovedLeaveDateKeys(
  requests: Array<
    Pick<EmployeeLeaveRequestRecord, "status" | "startDate" | "endDate">
  >
) {
  const dates = new Set<string>();

  for (const request of requests) {
    if (
      String(request.status || "")
        .trim()
        .toLowerCase() !== "approved"
    ) {
      continue;
    }

    const startDate = formatLeaveDateInput(request.startDate);
    const endDate = formatLeaveDateInput(request.endDate || request.startDate);
    for (const dateKey of buildDateKeysInRange(startDate, endDate)) {
      dates.add(dateKey);
    }
  }

  return dates;
}

function getRiyadhTodayDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatPayrollCalculationDate(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || "").trim());
  if (!match) return String(dateKey || "").trim();

  const [, year, month, day] = match;
  return `${day}-${month}-${year}`;
}

function buildPayrollCalculationRange(
  month: ReturnType<typeof parseEmployeePayrollMonth> | null,
  calculationDate = getRiyadhTodayDateKey()
) {
  if (!month) return null;

  const today = calculationDate;
  const currentPayrollMonth = today.slice(0, 7);
  const isCurrentMonth = month.payrollMonth === currentPayrollMonth;
  const isFutureMonth = month.monthStart > today;
  const calculationStartDate = month.monthStart;
  const calculationEndDate = isCurrentMonth ? today : month.monthEnd;

  return {
    ...month,
    calculationStartDate,
    calculationEndDate,
    isCurrentMonth,
    isFutureMonth,
    excludesFutureDays: isCurrentMonth && calculationEndDate < month.monthEnd,
  };
}

function getCurrentGpsPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("الموقع غير مدعوم في هذا الجهاز."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    });
  });
}

function isSupportedMudadPayrollDocument(file: File | null) {
  if (!file) return false;

  const mime = String(file.type || "")
    .trim()
    .toLowerCase();
  const name = String(file.name || "")
    .trim()
    .toLowerCase();

  return (
    mime === "application/pdf" ||
    mime === "image/png" ||
    mime === "image/jpeg" ||
    name.endsWith(".pdf") ||
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg")
  );
}

function normalizeFingerprintNumber(value: unknown) {
  return String(value ?? "").trim();
}

function hasValuesObject(value: unknown) {
  return (
    !!value &&
    typeof value === "object" &&
    Object.keys(value as Record<string, any>).length > 0
  );
}

function hasEmployeeProfileSignal(
  userData: Record<string, any>,
  employeeDoc?: Record<string, any> | null
) {
  const normalizedRole = String(userData.role || "")
    .trim()
    .toLowerCase();

  if (normalizedRole === "client" || normalizedRole === "guest") {
    return false;
  }

  return (
    employeeDoc?.includeInEmployeeManagement === true ||
    userData.includeInEmployeeManagement === true ||
    userData.employeeProfile?.includeInEmployeeManagement === true ||
    employeeDoc?.employeeProfile?.includeInEmployeeManagement === true
  );
}

function buildMergedEmployeeRecord(input: {
  userId: string;
  userData: Record<string, any>;
  employeeDocId?: string | null;
  employeeData?: Record<string, any> | null;
}): EmployeeRecord {
  const { userId, userData, employeeDocId, employeeData } = input;

  const userEmployeeProfile = (userData.employeeProfile || {}) as Record<
    string,
    any
  >;
  const employeeEmployeeProfile = (employeeData?.employeeProfile ||
    {}) as Record<string, any>;

  const mergedPersonal =
    (employeeEmployeeProfile.personal as Record<string, any> | undefined) ||
    (employeeData?.personal as Record<string, any> | undefined) ||
    (userEmployeeProfile.personal as Record<string, any> | undefined) ||
    (userData.personal as Record<string, any> | undefined) ||
    undefined;

  const mergedEmployment =
    (employeeEmployeeProfile.employment as Record<string, any> | undefined) ||
    (employeeData?.employment as Record<string, any> | undefined) ||
    (userEmployeeProfile.employment as Record<string, any> | undefined) ||
    (userData.employment as Record<string, any> | undefined) ||
    undefined;

  const mergedEmployeeProfile =
    mergedPersonal ||
    mergedEmployment ||
    hasValuesObject(employeeEmployeeProfile) ||
    hasValuesObject(userEmployeeProfile)
      ? {
          ...userEmployeeProfile,
          ...employeeEmployeeProfile,
          ...(mergedPersonal ? { personal: mergedPersonal } : {}),
          ...(mergedEmployment ? { employment: mergedEmployment } : {}),
        }
      : undefined;

  return {
    ...(employeeData || {}),
    ...userData,
    id: userId,
    uid:
      pickText(
        userData.uid,
        employeeData?.linkedUserUid,
        employeeData?.uid,
        userId
      ) || userId,
    email:
      pickText(
        userData.email,
        employeeData?.email,
        mergedPersonal?.email,
        userEmployeeProfile.personal?.email,
        userData.personal?.email
      ) || null,
    displayName:
      pickText(
        userData.displayName,
        userData.name,
        userData.fullName,
        employeeData?.displayName,
        employeeData?.name,
        employeeData?.fullName,
        mergedPersonal?.name
      ) || null,
    name:
      pickText(
        userData.name,
        userData.displayName,
        userData.fullName,
        employeeData?.name,
        employeeData?.displayName,
        employeeData?.fullName,
        mergedPersonal?.name
      ) || null,
    title:
      pickText(
        userData.title,
        employeeData?.title,
        mergedEmployment?.title,
        mergedEmployment?.jobTitle
      ) || null,
    department:
      pickText(
        userData.department,
        employeeData?.department,
        mergedEmployment?.department
      ) || null,
    linkedEmployeeId:
      pickText(userData.linkedEmployeeId, employeeDocId) || null,
    allowedZoneIds: normalizeAllowedZoneIds(
      employeeData?.allowedZoneIds ||
        mergedEmployment?.allowedZoneIds ||
        userData.allowedZoneIds ||
        userData.employeeProfile?.employment?.allowedZoneIds ||
        userData.employment?.allowedZoneIds
    ),
    employeeProfile: mergedEmployeeProfile,
    personal: mergedPersonal,
    employment: mergedEmployment,
    photoURL: pickText(userData.photoURL, employeeData?.photoURL) || null,
  } as EmployeeRecord;
}

function buildEmployeeFormValues(
  employee: EmployeeRecord | null | undefined
): EmployeeFormValues {
  const personal = (employee?.employeeProfile?.personal ||
    employee?.personal ||
    {}) as Record<string, any>;
  const employment = (employee?.employeeProfile?.employment ||
    employee?.employment ||
    {}) as Record<string, any>;
  const workSchedule = readWorkScheduleFromEmployment(employment);

  return {
    fullName: pickText(
      employee?.displayName,
      employee?.name,
      employee?.fullName,
      personal.name
    ),
    email: pickText(employee?.email, personal.email),
    phone: pickText(
      personal.phone,
      employee?.phone,
      employee?.mobile,
      employee?.phoneNumber
    ),
    jobTitle: pickText(employment.jobTitle, employment.title, employee?.title),
    department: pickText(employment.department, employee?.department),
    fingerprintNumber: pickText(
      employment.fingerprintNumber,
      employee?.fingerprintNumber
    ),
    employmentStatus:
      pickText(employment.employmentStatus, employment.status) || "active",
    startDate: toDateInputValue(employment.startDate ?? employee?.startDate),
    leaveBalance:
      employment.leaveBalance === 0 || employee?.leaveBalance === 0
        ? String(employment.leaveBalance ?? employee?.leaveBalance ?? 0)
        : pickText(employment.leaveBalance, employee?.leaveBalance),
    baseSalary:
      employment.baseSalary === 0 ? "0" : pickText(employment.baseSalary),
    housingAllowance:
      employment.housingAllowance === 0
        ? "0"
        : pickText(employment.housingAllowance),
    transportationAllowance:
      employment.transportationAllowance === 0
        ? "0"
        : pickText(employment.transportationAllowance),
    otherAllowances:
      employment.otherAllowances === 0
        ? "0"
        : pickText(employment.otherAllowances),
    expectedWorkDays:
      employment.expectedWorkDays === 0
        ? "0"
        : pickText(employment.expectedWorkDays),
    expectedWorkHours:
      employment.expectedWorkHours === 0
        ? "0"
        : pickText(employment.expectedWorkHours),
    actualWorkedHours:
      employment.actualWorkedHours === 0
        ? "0"
        : pickText(employment.actualWorkedHours),
    shiftStartTime: workSchedule.startTime,
    shiftEndTime: workSchedule.endTime,
    weeklyOffDays: workSchedule.weeklyOffDays,
    overtimeHourlyRate:
      employment.overtimeHourlyRate === 0
        ? "0"
        : pickText(employment.overtimeHourlyRate),
    insuranceDeduction:
      employment.insuranceDeduction === 0
        ? "0"
        : pickText(employment.insuranceDeduction),
    allowedZoneIds: normalizeAllowedZoneIds(
      employment.allowedZoneIds || employee?.allowedZoneIds
    ),
    adminNotes: pickText(employment.adminNotes),
  };
}

function buildEmployeeFileFormValues(): EmployeeFileFormValues {
  return {
    title: "",
    description: "",
    fileType: EMPLOYEE_DEFAULT_FILE_TYPE,
    file: null,
  };
}

function buildOfficialDocumentFormValues(): EmployeeFileFormValues {
  return {
    title: "",
    description: "",
    fileType: "contract",
    file: null,
  };
}

function buildEmployeeMessageFormValues(): EmployeeMessageFormValues {
  return {
    type: "message",
    message: "",
  };
}

function buildEmployeeAbsenceFormValues(): EmployeeAbsenceFormValues {
  return {
    date: buildEmployeeAbsenceDateInput(),
    type: "full_day",
    note: "",
  };
}

function getEmployeeInitials(name: string, email?: string | null) {
  const source = String(name || email || "").trim();
  if (!source) return "م";

  const parts = source
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return source.slice(0, 2).toUpperCase();
  }

  return parts
    .map(part => part.charAt(0))
    .join("")
    .toUpperCase();
}

const EMPLOYEE_ENGLISH_TEXT_FALLBACKS: Record<string, string> = {
  "غير محدد": "Unassigned",
  "الموارد البشرية": "Human Resources",
  "تقنية المعلومات": "Information Technology",
  "مدير إداري": "Administrative Manager",
  "مدير العمليات": "Operations Manager",
  "مدير المبيعات": "Sales Manager",
  محلل: "Analyst",
  أخصائي: "Specialist",
  "أخصائي موارد بشرية": "HR Specialist",
  المبيعات: "Sales",
  التسويق: "Marketing",
  الإدارة: "Administration",
  المالية: "Finance",
  "على رأس العمل": "Active",
  "فترة تجربة": "Probation",
  "في إجازة": "On Leave",
  "غير نشط": "Inactive",
  موقوف: "Suspended",
  "منتهي الارتباط الوظيفي": "Terminated",
};

function titleCaseEnglishText(value: string) {
  return value
    .split(" ")
    .map(part => {
      if (!part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

function employeeNameFallbackFromEmail(email?: string | null) {
  const localPart = String(email || "")
    .split("@")[0]
    .replace(/\+/g, " ")
    .replace(/[._-]+/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return localPart ? titleCaseEnglishText(localPart) : "Employee";
}

function displayEmployeeText(
  language: "ar" | "en",
  value: unknown,
  fallbackEn: string
) {
  const text = String(value ?? "").trim();
  if (language === "ar") return text || EMPLOYEE_EMPTY_VALUE;
  if (EMPLOYEE_ENGLISH_TEXT_FALLBACKS[text]) {
    return EMPLOYEE_ENGLISH_TEXT_FALLBACKS[text];
  }
  return safeEnglishText(text, fallbackEn);
}

type EmployeeAvatarVariant = "male" | "female";

const COMMON_FEMALE_FIRST_NAMES = new Set([
  "سارة",
  "ساره",
  "نورة",
  "نوره",
  "نورا",
  "مها",
  "شهد",
  "ريم",
  "رغد",
  "رهف",
  "لينا",
  "ليان",
  "ندى",
  "جود",
  "دانا",
  "دانه",
  "دلال",
  "غادة",
  "غاده",
  "عبير",
  "امل",
  "أمل",
  "آمال",
  "امال",
  "يارا",
  "هند",
  "روان",
  "ريما",
  "جواهر",
  "رنا",
  "رزان",
  "بسمة",
  "بسمه",
  "شوق",
  "وفاء",
  "وفا",
  "هيا",
  "هالة",
  "هاله",
  "لمياء",
]);

function normalizeAvatarGender(value: unknown): EmployeeAvatarVariant | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!normalized) return null;

  if (
    normalized === "female" ||
    normalized === "f" ||
    normalized === "woman" ||
    normalized === "girl" ||
    normalized === "أنثى" ||
    normalized === "انثى" ||
    normalized === "بنت" ||
    normalized === "امرأة" ||
    normalized === "امراة"
  ) {
    return "female";
  }

  if (
    normalized === "male" ||
    normalized === "m" ||
    normalized === "man" ||
    normalized === "boy" ||
    normalized === "ذكر" ||
    normalized === "رجل" ||
    normalized === "ولد"
  ) {
    return "male";
  }

  return null;
}

function normalizeNameKey(value: string) {
  return String(value || "")
    .trim()
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase();
}

function getEmployeeAvatarVariant(
  employee: EmployeeRecord
): EmployeeAvatarVariant {
  const raw = employee as Record<string, any>;
  const personal = (raw.employeeProfile?.personal ||
    raw.personal ||
    raw.profile ||
    {}) as Record<string, any>;

  const explicitGender =
    normalizeAvatarGender(personal.gender) ||
    normalizeAvatarGender(personal.sex) ||
    normalizeAvatarGender(raw.gender) ||
    normalizeAvatarGender(raw.sex) ||
    normalizeAvatarGender(raw.profile?.gender) ||
    normalizeAvatarGender(raw.profile?.sex) ||
    normalizeAvatarGender(raw.employeeProfile?.gender);

  if (explicitGender) return explicitGender;

  const nameSource = String(
    employee.displayName ||
      employee.name ||
      personal.name ||
      employee.email ||
      ""
  ).trim();
  const firstName = normalizeNameKey(nameSource.split(/\s+/)[0] || "");

  if (COMMON_FEMALE_FIRST_NAMES.has(firstName)) {
    return "female";
  }

  return "male";
}

function buildEmployeeAvatarDataUrl(variant: EmployeeAvatarVariant) {
  const isFemale = variant === "female";
  const suit = "#efefef";
  const suitShadow = "#dddddd";
  const shirt = "#f7f7f7";
  const tie = "#b5b5b5";
  const maleHair = "#666666";
  const femaleHair = "#7a7a7a";
  const femaleBlazer = "#ececec";
  const femaleBlazerShadow = "#dcdcdc";
  const femaleDress = "#f7f7f7";
  const femaleFace = "#f3f3f3";

  const svg = isFemale
    ? `
      <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
        <rect width="256" height="256" fill="#ffffff" />

        <path d="M58 248c4.8-35.8 20.5-68 38-80 11.6-8 51.4-8 63 0 17.5 12 33.2 44.2 38 80H58Z" fill="${femaleBlazer}" />
        <path d="M78 248c4.5-27.8 14.2-52.6 25-61 7.8-6.1 41.2-6.1 49 0 10.8 8.4 20.5 33.2 25 61H78Z" fill="${femaleBlazerShadow}" opacity=".45" />
        <path d="M94 140c8.7-8.3 18.9-12.4 34-12.4s25.3 4.1 34 12.4l13 25H81l13-25Z" fill="${femaleDress}" />
        <path d="M112 147h32l7 18-23 30-23-30 7-18Z" fill="#c7c7c7" />
        <path d="M121 164h14l5 21-12 17-12-17 5-21Z" fill="#a9a9a9" opacity=".78" />

        <path d="M82 102c0-29.7 20.4-52 46-52s46 22.3 46 52v11c0 10.5-8.5 19-19 19H101c-10.5 0-19-8.5-19-19v-11Z" fill="${femaleHair}" />
        <path d="M88 103c0-22.8 16.8-41 40-41s40 18.2 40 41v8c0 8.6-6.9 15.5-15.5 15.5h-49c-8.6 0-15.5-6.9-15.5-15.5v-8Z" fill="${femaleHair}" />
        <path d="M95 96c0-18.8 15.2-34 33-34s33 15.2 33 34v8c0 8.3-6.7 15-15 15h-36c-8.3 0-15-6.7-15-15v-8Z" fill="${femaleFace}" />
        <path d="M76 108c7.9-22 21.9-36 32-42 8.6-5.1 33.4-5.1 42 0 10.1 6 24.1 20 32 42l-8 7c-8.2-17.4-19.1-28.7-33-34.5-4.1 5.8-10.2 8.7-18 8.7s-13.9-2.9-18-8.7c-13.9 5.8-24.8 17.1-33 34.5l-8-7Z" fill="${femaleHair}" />

        <circle cx="128" cy="109" r="4" fill="#d9d9d9" />
        <circle cx="108" cy="78" r="3.5" fill="#efefef" opacity=".5" />
      </svg>
    `
    : `
      <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
        <rect width="256" height="256" fill="#ffffff" />

        <path d="M73 246c3.8-45.2 22.8-83 55-83s51.2 37.8 55 83H73Z" fill="${suit}" />
        <path d="M95 164c7.5-9.2 19.6-15 33-15s25.5 5.8 33 15l14 36H81l14-36Z" fill="${suitShadow}" opacity=".65" />
        <path d="M97 205c9.5-23.9 18.9-40 31-40s21.5 16.1 31 40H97Z" fill="${shirt}" />
        <path d="M118 168h20l6 19-16 23-16-23 6-19Z" fill="${tie}" />
        <path d="M126 183h4l5 28h-14l5-28Z" fill="#a3a3a3" opacity=".72" />

        <path d="M86 78c0-28.2 18.8-48 42-48s42 19.8 42 48v12c0 10.5-8.5 19-19 19h-46c-10.5 0-19-8.5-19-19V78Z" fill="${maleHair}" />
        <path d="M92 79c0-20.2 14.2-36 36-36s36 15.8 36 36v9c0 8.3-6.7 15-15 15h-42c-8.3 0-15-6.7-15-15v-9Z" fill="${maleHair}" />
        <path d="M94 88c0-20.3 15.3-34 34-34s34 13.7 34 34v5c0 9.4-7.6 17-17 17h-34c-9.4 0-17-7.6-17-17v-5Z" fill="#f5f5f5" />
        <path d="M102 99c0-12.3 11.7-23 26-23s26 10.7 26 23v9c0 5.5-4.5 10-10 10h-32c-5.5 0-10-4.5-10-10v-9Z" fill="#f1f1f1" />
        <path d="M92 77c4.8-18.3 17.1-28 36-28s31.2 9.7 36 28l-6 5c-8.2-12.4-17.3-18-30-18s-21.8 5.6-30 18l-6-5Z" fill="${maleHair}" />

        <path d="M68 124c9.6-17.3 25.3-26 44-26h32c18.7 0 34.4 8.7 44 26l16 54H52l16-54Z" fill="${suit}" />
        <path d="M67 126c9.4-15.1 24.8-23 42-23h38c17.2 0 32.6 7.9 42 23l14 50H53l14-50Z" fill="${suitShadow}" opacity=".35" />
        <path d="M101 118l27 22 27-22v18l-27 26-27-26v-18Z" fill="#ffffff" opacity=".85" />

        <circle cx="128" cy="105" r="4" fill="#d9d9d9" />
      </svg>
    `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getEmployeeDisplayAvatarUrl(
  employee: EmployeeRecord,
  avatarUrl: string | null | undefined
) {
  const resolvedAvatarUrl = String(avatarUrl || "").trim();
  if (resolvedAvatarUrl) return resolvedAvatarUrl;

  return buildEmployeeAvatarDataUrl(getEmployeeAvatarVariant(employee));
}

function getLatestTimestamp(...dates: Array<Date | null | undefined>) {
  return dates.reduce((latest, date) => {
    const time = date?.getTime() || 0;
    return time > latest ? time : latest;
  }, 0);
}

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-slate-800">{label}</Label>
      {children}
      {description ? (
        <p className="text-xs leading-5 text-slate-500">{description}</p>
      ) : null}
    </div>
  );
}

function showNativeInputPicker(input: HTMLInputElement | null) {
  if (!input) return;
  if (input.disabled || input.readOnly) return;

  try {
    const showPicker = (
      input as HTMLInputElement & { showPicker?: () => void }
    ).showPicker;
    if (showPicker) {
      showPicker.call(input);
      return;
    }
  } catch {
    // Some browsers only allow showPicker during trusted click events.
  }

  input.focus();
}

function NativeDatePickerInput({
  className,
  disabled,
  onValueChange,
  type = "date",
  value,
}: {
  className?: string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
  type?: "date" | "month";
  value: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const placeholder = type === "month" ? "YYYY-MM" : "YYYY-MM-DD";

  return (
    <div className="relative">
      <button
        type="button"
        className={cn(
          "flex h-9 w-full cursor-pointer items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm text-left tabular-nums shadow-xs transition-[color,box-shadow] outline-none [direction:ltr] [unicode-bidi:plaintext] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          className
        )}
        disabled={disabled}
        onClick={() => showNativeInputPicker(inputRef.current)}
      >
        <span className={value ? "text-slate-950" : "text-slate-400"}>
          {value || placeholder}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-slate-500" />
      </button>
      <input
        ref={inputRef}
        type={type}
        lang="en-GB"
        dir="ltr"
        value={value || ""}
        onChange={event => onValueChange(event.target.value)}
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
      />
    </div>
  );
}

function ReadonlyMeta({
  icon: Icon,
  label,
  value,
  dir,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
  dir?: "rtl" | "ltr";
}) {
  return (
    <div className="min-w-0 rounded-[22px] border border-slate-200/80 bg-white px-4 py-3 shadow-[0_12px_30px_-26px_rgba(15,23,42,0.42)]">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div
        dir={dir}
        className="mt-2 min-w-0 break-words text-sm font-semibold text-slate-950 [overflow-wrap:anywhere]"
      >
        {value || EMPLOYEE_EMPTY_VALUE}
      </div>
    </div>
  );
}

function EmployeeWorkspaceSectionBreak({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: typeof ShieldCheck;
  title: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-dashed border-slate-300/80 bg-white/78 px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]">
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-l from-transparent via-[#F2B705]/70 to-transparent" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-[#F2B705] shadow-[0_18px_34px_-24px_rgba(15,23,42,0.9)]">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="text-sm font-semibold text-slate-950">{title}</div>
            <p className="max-w-3xl text-sm leading-6 text-slate-500">
              {description}
            </p>
          </div>
        </div>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent via-slate-300 to-transparent sm:max-w-[220px]" />
      </div>
    </div>
  );
}

function EmployeeWorkspaceTabButton({
  active,
  icon: Icon,
  label,
  showIndicator = false,
  onClick,
}: {
  active: boolean;
  icon: typeof ShieldCheck;
  label: string;
  showIndicator?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative inline-flex h-10 min-w-[104px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-slate-200/90 bg-white px-4 text-sm font-semibold leading-none text-slate-600 shadow-[0_1px_0_rgba(255,255,255,0.95)] transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705]/35 sm:min-w-[112px] sm:px-5",
        active
          ? "border-[#F2B705]/45 bg-[#F2B705]/12 text-[#030640] shadow-[0_12px_28px_-20px_rgba(242,183,5,0.8)]"
          : ""
      )}
    >
      <Icon
        className={cn("h-4 w-4", active ? "text-[#030640]" : "text-slate-500")}
      />
      <span>{label}</span>
      {showIndicator ? (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 z-20 h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_0_2px_rgba(255,255,255,0.98)]"
        />
      ) : null}
    </button>
  );
}

function EmployeeFileStatusBadge({ file }: { file: EmployeeFileRecord }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full shadow-none",
        file.readStatusTone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700"
      )}
    >
      {file.readStatusLabel}
    </Badge>
  );
}

function EmployeeFileVersionBadge({ file }: { file: EmployeeFileRecord }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full shadow-none",
        file.statusTone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-100 text-slate-700"
      )}
    >
      {file.statusLabel}
    </Badge>
  );
}

function EmployeeFileMetaBadge({
  label,
  dir,
}: {
  label: string;
  dir?: "rtl" | "ltr";
}) {
  return (
    <span
      dir={dir}
      className="rounded-full bg-slate-100/80 px-2.5 py-1 text-xs text-slate-500"
    >
      {label}
    </span>
  );
}

function LeaveStatusBadge({ status }: { status: unknown }) {
  const meta = getLeaveStatusMeta(status);

  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full shadow-none",
        meta.tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : meta.tone === "warning"
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : meta.tone === "danger"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-slate-200 bg-slate-100 text-slate-600"
      )}
    >
      {meta.label}
    </Badge>
  );
}

function LeaveImpactBadge({ status }: { status: unknown }) {
  const normalizedStatus = String(status || "")
    .trim()
    .toLowerCase();

  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full shadow-none",
        normalizedStatus === "approved"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : normalizedStatus === "pending"
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-rose-200 bg-rose-50 text-rose-700"
      )}
    >
      {normalizedStatus === "approved"
        ? "تم الخصم من الرصيد"
        : normalizedStatus === "pending"
          ? "بانتظار القرار"
          : "لم يتم الخصم"}
    </Badge>
  );
}

function LeaveOverviewStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof UserRound;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 px-4 py-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 text-base font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function resolveEmploymentLeaveBalance(
  ...sources: Array<Record<string, any> | null | undefined>
) {
  for (const source of sources) {
    const employment = (source?.employeeProfile?.employment ||
      source?.employment ||
      {}) as Record<string, any>;

    const candidates = [employment.leaveBalance, source?.leaveBalance];
    for (const candidate of candidates) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

function normalizeEnglishDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776));
}

const EMPLOYEE_AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const EMPLOYEE_AVATAR_CROP_OUTPUT_SIZE = 512;
const EMPLOYEE_AVATAR_CROP_MIN_ZOOM = 1;
const EMPLOYEE_AVATAR_CROP_MAX_ZOOM = 3;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function validateEmployeeAvatarFile(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("يرجى اختيار صورة فقط.");
  }

  if (file.size > EMPLOYEE_AVATAR_MAX_SIZE_BYTES) {
    throw new Error("حجم الصورة كبير. الحد الأعلى 5MB.");
  }
}

type EmployeeAvatarCropDraft = {
  objectUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  naturalWidth: number;
  naturalHeight: number;
};

type EmployeeAvatarCropPosition = {
  x: number;
  y: number;
};

type EmployeeAvatarCropMetrics = {
  width: number;
  height: number;
  maxOffsetX: number;
  maxOffsetY: number;
};

function getEmployeeAvatarCropMetrics(input: {
  naturalWidth: number;
  naturalHeight: number;
  viewportSize: number;
  zoom: number;
}): EmployeeAvatarCropMetrics {
  const viewportSize = Math.max(1, input.viewportSize);
  const naturalWidth = Math.max(1, input.naturalWidth);
  const naturalHeight = Math.max(1, input.naturalHeight);
  const zoom = clampNumber(
    input.zoom,
    EMPLOYEE_AVATAR_CROP_MIN_ZOOM,
    EMPLOYEE_AVATAR_CROP_MAX_ZOOM
  );
  const coverScale = Math.max(
    viewportSize / naturalWidth,
    viewportSize / naturalHeight
  );
  const width = naturalWidth * coverScale * zoom;
  const height = naturalHeight * coverScale * zoom;

  return {
    width,
    height,
    maxOffsetX: Math.max(0, (width - viewportSize) / 2),
    maxOffsetY: Math.max(0, (height - viewportSize) / 2),
  };
}

function clampEmployeeAvatarCropPosition(
  position: EmployeeAvatarCropPosition,
  metrics: EmployeeAvatarCropMetrics
): EmployeeAvatarCropPosition {
  return {
    x: clampNumber(position.x, -metrics.maxOffsetX, metrics.maxOffsetX),
    y: clampNumber(position.y, -metrics.maxOffsetY, metrics.maxOffsetY),
  };
}

function loadEmployeeAvatarImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("تعذر تحميل الصورة المختارة للمعاينة."));
    image.src = src;
  });
}

async function createEmployeeAvatarCropDraft(
  file: File
): Promise<EmployeeAvatarCropDraft> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadEmployeeAvatarImageElement(objectUrl);
    return {
      objectUrl,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      naturalWidth: image.naturalWidth || image.width || 1,
      naturalHeight: image.naturalHeight || image.height || 1,
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function resolveEmployeeAvatarOutputType(fileType: string) {
  switch (
    String(fileType || "")
      .trim()
      .toLowerCase()
  ) {
    case "image/png":
      return "image/png";
    case "image/webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
}

async function buildEmployeeCroppedAvatarFile(input: {
  draft: EmployeeAvatarCropDraft;
  viewportSize: number;
  zoom: number;
  position: EmployeeAvatarCropPosition;
}) {
  const viewportSize = Math.max(1, input.viewportSize);
  const image = await loadEmployeeAvatarImageElement(input.draft.objectUrl);
  const metrics = getEmployeeAvatarCropMetrics({
    naturalWidth: input.draft.naturalWidth,
    naturalHeight: input.draft.naturalHeight,
    viewportSize,
    zoom: input.zoom,
  });
  const position = clampEmployeeAvatarCropPosition(input.position, metrics);
  const outputType = resolveEmployeeAvatarOutputType(input.draft.fileType);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("تعذر تجهيز الصورة المقصوصة.");
  }

  canvas.width = EMPLOYEE_AVATAR_CROP_OUTPUT_SIZE;
  canvas.height = EMPLOYEE_AVATAR_CROP_OUTPUT_SIZE;

  const scale = EMPLOYEE_AVATAR_CROP_OUTPUT_SIZE / viewportSize;
  const drawX = ((viewportSize - metrics.width) / 2 + position.x) * scale;
  const drawY = ((viewportSize - metrics.height) / 2 + position.y) * scale;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    drawX,
    drawY,
    metrics.width * scale,
    metrics.height * scale
  );

  const blob = await new Promise<Blob | null>(resolve => {
    canvas.toBlob(
      resolve,
      outputType,
      outputType === "image/jpeg" ? 0.92 : undefined
    );
  });

  if (!blob) {
    throw new Error("تعذر إنشاء الصورة المقصوصة.");
  }

  const extension =
    outputType === "image/png"
      ? "png"
      : outputType === "image/webp"
        ? "webp"
        : "jpg";
  const fileNameBase =
    input.draft.fileName.replace(/\.[^.]+$/, "").trim() || "employee-avatar";

  return new File([blob], `${fileNameBase}.${extension}`, {
    type: outputType,
    lastModified: Date.now(),
  });
}

function resolveEmployeeAuthUid(employee: EmployeeRecord | null | undefined) {
  return String(employee?.uid || employee?.id || "").trim();
}

function resolveEmployeeDocumentId(
  employee: EmployeeRecord | null | undefined
) {
  return String(employee?.linkedEmployeeId || employee?.id || "").trim();
}

function normalizeEmployeeFileMatchValue(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function createEmptySalaryDeduction(): EmployeeSalaryDeductionFormValue {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "",
    amount: "",
  };
}

function normalizeSalaryDeductions(
  value: unknown
): EmployeeSalaryDeductionFormValue[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => ({
    id:
      String((item as any)?.id || "").trim() ||
      `loaded-${index}-${Math.random().toString(36).slice(2, 8)}`,
    title: String((item as any)?.title || "").trim(),
    amount:
      (item as any)?.amount === 0
        ? "0"
        : String((item as any)?.amount ?? "").trim(),
  }));
}

function normalizeSalaryDeductionsForPersistence(
  value: EmployeeSalaryDeductionFormValue[]
) {
  return value
    .map(item => ({
      id: item.id,
      title: String(item.title || "").trim(),
      amount: Number(item.amount || 0),
    }))
    .filter(
      item => item.title && Number.isFinite(item.amount) && item.amount > 0
    );
}

function matchesEmployeeFileVersion(
  file: EmployeeFileRecord,
  title: string,
  fileType: string
) {
  return (
    file.active &&
    normalizeEmployeeFileMatchValue(file.title) ===
      normalizeEmployeeFileMatchValue(title) &&
    normalizeEmployeeFileMatchValue(
      file.fileType || EMPLOYEE_DEFAULT_FILE_TYPE
    ) ===
      normalizeEmployeeFileMatchValue(fileType || EMPLOYEE_DEFAULT_FILE_TYPE)
  );
}

export default function EmployeesManagementPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const search = useSearch();
  const canManageEmployees = hasPermission(user, "employees.manage");
  const pageDir = languageDir(language);
  const pageTextAlignClass = language === "ar" ? "text-right" : "text-left";
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [workZones, setWorkZones] = useState<WorkZone[]>([]);
  const [workZonesLoading, setWorkZonesLoading] = useState(true);
  const [newWorkZoneOpen, setNewWorkZoneOpen] = useState(false);
  const [editingWorkZoneId, setEditingWorkZoneId] = useState<string | null>(
    null
  );
  const [newWorkZoneForm, setNewWorkZoneForm] =
    useState<EmployeeWorkZoneFormValues>(buildEmployeeWorkZoneFormValues);
  const [creatingWorkZone, setCreatingWorkZone] = useState(false);
  const [locatingWorkZone, setLocatingWorkZone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [form, setForm] = useState<EmployeeFormValues>(() =>
    buildEmployeeFormValues(null)
  );
  const [salaryDeductions, setSalaryDeductions] = useState<
    EmployeeSalaryDeductionFormValue[]
  >([]);
  const [employeeAbsences, setEmployeeAbsences] = useState<
    EmployeeAbsenceRecord[]
  >([]);
  const [employeeAbsencesLoading, setEmployeeAbsencesLoading] = useState(false);
  const [absenceForm, setAbsenceForm] = useState<EmployeeAbsenceFormValues>(
    buildEmployeeAbsenceFormValues
  );
  const [savingAbsence, setSavingAbsence] = useState(false);
  const [deletingAbsenceId, setDeletingAbsenceId] = useState<string | null>(
    null
  );
  const [employeePayrollRecords, setEmployeePayrollRecords] = useState<
    EmployeePayrollRecord[]
  >([]);
  const [employeePayrollRecordsLoading, setEmployeePayrollRecordsLoading] =
    useState(false);
  const [payrollMonthInput, setPayrollMonthInput] = useState(
    buildEmployeePayrollMonthInput
  );
  const [payrollCalculationDateKey, setPayrollCalculationDateKey] = useState(
    getRiyadhTodayDateKey
  );
  const [payrollMudadDocument, setPayrollMudadDocument] = useState<File | null>(
    null
  );
  const [creatingPayrollRecord, setCreatingPayrollRecord] = useState(false);
  const [attendancePayrollSummary, setAttendancePayrollSummary] =
    useState<AttendancePayrollSummary | null>(null);
  const [attendancePayrollLoading, setAttendancePayrollLoading] =
    useState(false);
  const [saving, setSaving] = useState(false);
  const [leaveRequests, setLeaveRequests] = useState<
    EmployeeLeaveRequestRecord[]
  >([]);
  const [leaveRequestsLoading, setLeaveRequestsLoading] = useState(false);
  const [serviceRequests, setServiceRequests] = useState<
    EmployeeServiceRequestRecord[]
  >([]);
  const [serviceRequestsLoading, setServiceRequestsLoading] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [manualLeaveBalance, setManualLeaveBalance] = useState("");
  const [manualLeaveBalanceOperation, setManualLeaveBalanceOperation] =
    useState<"add" | "deduct">("add");
  const [manualLeaveAdjustmentReason, setManualLeaveAdjustmentReason] =
    useState("");
  const [savingManualLeaveBalance, setSavingManualLeaveBalance] =
    useState(false);
  const [leaveBalanceAdjustments, setLeaveBalanceAdjustments] = useState<
    Array<Record<string, any>>
  >([]);
  const [leaveBalanceAdjustmentsLoading, setLeaveBalanceAdjustmentsLoading] =
    useState(false);
  const [employeeReportExporting, setEmployeeReportExporting] = useState(false);
  const [reviewingLeaveRequestId, setReviewingLeaveRequestId] = useState<
    string | null
  >(null);
  const [reviewingServiceRequestId, setReviewingServiceRequestId] = useState<
    string | null
  >(null);
  const [employeeFiles, setEmployeeFiles] = useState<EmployeeFileRecord[]>([]);
  const [employeeFilesLoading, setEmployeeFilesLoading] = useState(false);
  const [employeeFileForm, setEmployeeFileForm] =
    useState<EmployeeFileFormValues>(buildEmployeeFileFormValues);
  const [uploadingEmployeeFile, setUploadingEmployeeFile] = useState(false);
  const [replacingEmployeeFileId, setReplacingEmployeeFileId] = useState<
    string | null
  >(null);
  const [deletingEmployeeFileId, setDeletingEmployeeFileId] = useState<
    string | null
  >(null);
  const [officialDocumentForm, setOfficialDocumentForm] =
    useState<EmployeeFileFormValues>(buildOfficialDocumentFormValues);
  const [uploadingOfficialDocument, setUploadingOfficialDocument] =
    useState(false);
  const [employeeAvatarCropOpen, setEmployeeAvatarCropOpen] = useState(false);
  const [employeeAvatarCropDraft, setEmployeeAvatarCropDraft] =
    useState<EmployeeAvatarCropDraft | null>(null);
  const [employeeAvatarCropZoom, setEmployeeAvatarCropZoom] = useState(1);
  const [employeeAvatarCropPosition, setEmployeeAvatarCropPosition] =
    useState<EmployeeAvatarCropPosition>({
      x: 0,
      y: 0,
    });
  const [employeeAvatarCropViewportSize, setEmployeeAvatarCropViewportSize] =
    useState(320);
  const [employeeAvatarCropDragging, setEmployeeAvatarCropDragging] =
    useState(false);
  const [uploadingEmployeeAvatar, setUploadingEmployeeAvatar] = useState(false);
  const [employeeMessages, setEmployeeMessages] = useState<
    EmployeeMessageRecord[]
  >([]);
  const [employeeMessagesLoading, setEmployeeMessagesLoading] = useState(false);
  const [adminNotifications, setAdminNotifications] = useState<
    InAppNotificationRecord[]
  >([]);
  const [employeeMessageForm, setEmployeeMessageForm] =
    useState<EmployeeMessageFormValues>(buildEmployeeMessageFormValues);
  const [activeEmployeeWorkspaceSection, setActiveEmployeeWorkspaceSection] =
    useState<EmployeeWorkspaceSectionKey>("profile");
  const [employeeWorkspaceViewedAt, setEmployeeWorkspaceViewedAt] = useState<
    Partial<Record<EmployeeWorkspaceSectionKey, number>>
  >({});
  const [activeEmployeeConversationId, setActiveEmployeeConversationId] =
    useState<string | null>(null);
  const [openingEmployeeConversationId, setOpeningEmployeeConversationId] =
    useState<string | null>(null);
  const [composeEmployeeMessageAsNew, setComposeEmployeeMessageAsNew] =
    useState(false);
  const [sendingEmployeeMessage, setSendingEmployeeMessage] = useState(false);
  const employeeFileInputRef = useRef<HTMLInputElement | null>(null);
  const officialDocumentInputRef = useRef<HTMLInputElement | null>(null);
  const employeeAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const employeeAvatarCropViewportRef = useRef<HTMLDivElement | null>(null);
  const employeeAvatarCropDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const payrollMudadDocumentInputRef = useRef<HTMLInputElement | null>(null);
  const employeeScheduleSectionRef = useRef<HTMLDivElement | null>(null);
  const employeeSalarySectionRef = useRef<HTMLDivElement | null>(null);
  const employeeAttendanceSectionRef = useRef<HTMLDivElement | null>(null);
  const employeeOverviewSectionRef = useRef<HTMLDivElement | null>(null);
  const employeeRequestsSectionRef = useRef<HTMLDivElement | null>(null);
  const employeeLeaveSectionRef = useRef<HTMLDivElement | null>(null);
  const employeeMessagesSectionRef = useRef<HTMLDivElement | null>(null);
  const employeeFilesSectionRef = useRef<HTMLDivElement | null>(null);
  const employeeDetailsTopRef = useRef<HTMLDivElement | null>(null);
  const employeeWorkspaceScrollTargetRef =
    useRef<EmployeeWorkspaceSectionKey | null>(null);
  const shouldScrollEmployeeDetailsTopRef = useRef(false);
  const handledEmployeeSearchRef = useRef("");
  const handledMessageSearchRef = useRef("");
  const handledSectionNavigationRef = useRef("");

  const employeeWorkspaceSectionRefs = {
    profile: employeeOverviewSectionRef,
    schedule: employeeScheduleSectionRef,
    attendance: employeeAttendanceSectionRef,
    salary: employeeSalarySectionRef,
    requests: employeeRequestsSectionRef,
    leave: employeeLeaveSectionRef,
    messages: employeeMessagesSectionRef,
    files: employeeFilesSectionRef,
  } as const;

  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const requestedEmployeeId = useMemo(
    () => String(searchParams.get("employeeId") || "").trim(),
    [searchParams]
  );
  const requestedPanel = useMemo(
    () =>
      String(searchParams.get("panel") || "")
        .trim()
        .toLowerCase(),
    [searchParams]
  );
  const requestedMessageId = useMemo(
    () => String(searchParams.get("messageId") || "").trim(),
    [searchParams]
  );
  const requestedEmployeeSection = useMemo(
    () => resolveEmployeeWorkspaceSection(requestedPanel),
    [requestedPanel]
  );

  const resetEmployeeFileForm = () => {
    setEmployeeFileForm(buildEmployeeFileFormValues());
    setReplacingEmployeeFileId(null);
    if (employeeFileInputRef.current) {
      employeeFileInputRef.current.value = "";
    }
  };

  const resetOfficialDocumentForm = () => {
    setOfficialDocumentForm(buildOfficialDocumentFormValues());
    if (officialDocumentInputRef.current) {
      officialDocumentInputRef.current.value = "";
    }
  };

  const resetEmployeeAvatarCropState = () => {
    setEmployeeAvatarCropOpen(false);
    setEmployeeAvatarCropDraft(null);
    setEmployeeAvatarCropZoom(1);
    setEmployeeAvatarCropPosition({ x: 0, y: 0 });
    setEmployeeAvatarCropDragging(false);
    employeeAvatarCropDragRef.current = null;
  };

  const resetEmployeeAvatarForm = () => {
    resetEmployeeAvatarCropState();
    if (employeeAvatarInputRef.current) {
      employeeAvatarInputRef.current.value = "";
    }
  };

  const resetPayrollMudadDocument = () => {
    setPayrollMudadDocument(null);
    if (payrollMudadDocumentInputRef.current) {
      payrollMudadDocumentInputRef.current.value = "";
    }
  };

  const resetEmployeeMessageForm = () => {
    setEmployeeMessageForm(buildEmployeeMessageFormValues());
  };

  useEffect(() => {
    let active = true;
    fetchWorkZones()
      .then(zones => {
        if (active) setWorkZones(zones);
      })
      .catch(snapshotError => {
        console.error("employee_work_zones_snapshot_error", snapshotError);
        if (active) setWorkZones([]);
      })
      .finally(() => {
        if (active) setWorkZonesLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");

    let usersReady = false;
    let employeesReady = false;
    let usersMap = new Map<string, Record<string, any>>();
    let employeesMap = new Map<string, Record<string, any>>();

    const rebuildEmployees = () => {
      if (!usersReady || !employeesReady) return;
      const employeesByLinkedUserId = new Map<
        string,
        { docId: string; data: Record<string, any> }
      >();

      employeesMap.forEach((employeeData, employeeDocId) => {
        const linkedUserId = pickText(
          employeeData.linkedUserUid,
          employeeData.uid,
          employeeData.userId
        );

        if (linkedUserId && !employeesByLinkedUserId.has(linkedUserId)) {
          employeesByLinkedUserId.set(linkedUserId, {
            docId: employeeDocId,
            data: employeeData,
          });
        }
      });

      const rows = Array.from(usersMap.entries())
        .map(([userId, userData]) => {
          const linkedEmployeeId = pickText(userData.linkedEmployeeId);
          const linkedEmployee =
            (linkedEmployeeId && employeesMap.has(linkedEmployeeId)
              ? {
                  docId: linkedEmployeeId,
                  data: employeesMap.get(linkedEmployeeId) as Record<
                    string,
                    any
                  >,
                }
              : employeesByLinkedUserId.get(userId)) ||
            (employeesMap.has(userId)
              ? {
                  docId: userId,
                  data: employeesMap.get(userId) as Record<string, any>,
                }
              : null);

          if (!hasEmployeeProfileSignal(userData, linkedEmployee?.data)) {
            return null;
          }

          return buildMergedEmployeeRecord({
            userId,
            userData,
            employeeDocId: linkedEmployee?.docId ?? null,
            employeeData: linkedEmployee?.data ?? null,
          });
        })
        .filter((employee): employee is EmployeeRecord => !!employee)
        .sort((a, b) => {
          const aName = pickText(a.displayName, a.name, a.email).toLowerCase();
          const bName = pickText(b.displayName, b.name, b.email).toLowerCase();
          return aName.localeCompare(bName);
        });

      setEmployees(rows);
      setLoading(false);
    };

    const unsubscribeUsers = onSnapshot(
      collection(db, "users"),
      snapshot => {
        usersMap = new Map(
          snapshot.docs.map(docSnapshot => [
            docSnapshot.id,
            docSnapshot.data() as Record<string, any>,
          ])
        );
        usersReady = true;
        rebuildEmployees();
      },
      snapshotError => {
        console.error("employees_snapshot_error", snapshotError);
        setEmployees([]);
        setError("تعذر تحميل قائمة الموظفين.");
        setLoading(false);
      }
    );

    const unsubscribeEmployeeDirectory = onSnapshot(
      collection(db, "employees"),
      snapshot => {
        employeesMap = new Map(
          snapshot.docs.map(docSnapshot => [
            docSnapshot.id,
            docSnapshot.data() as Record<string, any>,
          ])
        );
        employeesReady = true;
        rebuildEmployees();
      },
      snapshotError => {
        console.error("employee_directory_snapshot_error", snapshotError);
        employeesMap = new Map();
        employeesReady = true;
        rebuildEmployees();
      }
    );

    return () => {
      unsubscribeUsers();
      unsubscribeEmployeeDirectory();
    };
  }, []);

  useEffect(() => {
    if (!employees.length) {
      setSelectedEmployeeId("");
      return;
    }

    if (!requestedEmployeeId) {
      handledEmployeeSearchRef.current = "";
    }

    if (
      requestedEmployeeId &&
      search &&
      handledEmployeeSearchRef.current !== search &&
      employees.some(employee => employee.id === requestedEmployeeId)
    ) {
      handledEmployeeSearchRef.current = search;
      employeeWorkspaceScrollTargetRef.current = "profile";
      if (selectedEmployeeId !== requestedEmployeeId) {
        setSelectedEmployeeId(requestedEmployeeId);
      }
      return;
    }

    const selectedExists = employees.some(
      employee => employee.id === selectedEmployeeId
    );
    if (selectedEmployeeId && !selectedExists) {
      setSelectedEmployeeId("");
    }
  }, [employees, requestedEmployeeId, search, selectedEmployeeId]);

  const employeeCards = useMemo(
    () =>
      employees.map(employee => {
        const profile = normalizeEmployeeProfile(employee, {
          displayName: employee.displayName,
          email: employee.email,
          photoURL:
            employee.photoURL || employee.firebaseUser?.photoURL || null,
        });
        const displayAvatarUrl = getEmployeeDisplayAvatarUrl(
          employee,
          profile.personal.avatarUrl
        );
        const displayName =
          language === "ar"
            ? profile.personal.name
            : displayEmployeeText(
                language,
                profile.personal.name,
                employeeNameFallbackFromEmail(profile.personal.email)
              );
        const displayTitle = displayEmployeeText(
          language,
          profile.employment.title,
          "Unassigned"
        );

        return {
          employee,
          profile,
          displayAvatarUrl,
          displayName,
          displayTitle,
          searchText: [
            profile.personal.name,
            displayName,
            profile.personal.email,
            profile.personal.phone,
            profile.employment.title,
            displayTitle,
            profile.employment.department,
            profile.employment.employeeCode,
            profile.employment.fingerprintNumber,
          ]
            .join(" ")
            .toLowerCase(),
        };
      }),
    [employees, language]
  );

  const filteredEmployeeCards = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return employeeCards;
    return employeeCards.filter(card =>
      card.searchText.includes(normalizedQuery)
    );
  }, [employeeCards, searchQuery]);

  const selectedEmployee =
    employees.find(employee => employee.id === selectedEmployeeId) ?? null;
  const selectedEmployeeAuthUid = resolveEmployeeAuthUid(selectedEmployee);
  const selectedEmployeeDocumentId =
    resolveEmployeeDocumentId(selectedEmployee);

  const selectedEmployeeProfile = useMemo(
    () =>
      selectedEmployee
        ? normalizeEmployeeProfile(selectedEmployee, {
            displayName: selectedEmployee.displayName,
            email: selectedEmployee.email,
            photoURL:
              selectedEmployee.photoURL ||
              selectedEmployee.firebaseUser?.photoURL ||
              null,
          })
        : null,
    [selectedEmployee]
  );
  const selectedEmployeeLabel = useMemo(() => {
    const rawName =
      selectedEmployeeProfile?.personal?.name &&
      selectedEmployeeProfile?.personal?.name !== EMPLOYEE_EMPTY_VALUE
        ? selectedEmployeeProfile?.personal?.name
        : pickText(
            selectedEmployee?.displayName,
            selectedEmployee?.name,
            selectedEmployee?.email
          ) || "الموظف";

    if (language === "ar") return rawName;
    return displayEmployeeText(
      language,
      rawName,
      employeeNameFallbackFromEmail(
        selectedEmployeeProfile?.personal?.email || selectedEmployee?.email
      )
    );
  }, [language, selectedEmployee, selectedEmployeeProfile]);
  const selectedEmployeeDisplayAvatarUrl = useMemo(
    () =>
      selectedEmployee
        ? getEmployeeDisplayAvatarUrl(
            selectedEmployee,
            selectedEmployeeProfile?.personal?.avatarUrl
          )
        : null,
    [selectedEmployee, selectedEmployeeProfile]
  );
  const selectedEmployeeEmployment = useMemo<SelectedEmployeeEmployment>(() => {
    const employment = selectedEmployeeProfile?.employment;
    const statusTone =
      employment?.statusTone === "success"
        ? "success"
        : employment?.statusTone === "warning"
          ? "warning"
          : "neutral";

    return {
      title: displayEmployeeText(
        language,
        employment?.title || selectedEmployee?.title || EMPLOYEE_EMPTY_VALUE,
        "Unassigned"
      ),
      department: displayEmployeeText(
        language,
        employment?.department ||
          selectedEmployee?.department ||
          EMPLOYEE_EMPTY_VALUE,
        "Unassigned"
      ),
      statusLabel: displayEmployeeText(
        language,
        employment?.statusLabel || EMPLOYEE_EMPTY_VALUE,
        "Unassigned"
      ),
      statusTone,
      employeeCode: employment?.employeeCode || EMPLOYEE_EMPTY_VALUE,
      startDate: employment?.startDate || null,
      fingerprintNumber:
        employment?.fingerprintNumber || EMPLOYEE_EMPTY_VALUE,
    };
  }, [language, selectedEmployee, selectedEmployeeProfile]);
  const selectedEmployeeShiftSchedule = useMemo(() => {
    const employment = (selectedEmployee?.employeeProfile?.employment ||
      selectedEmployee?.employment ||
      {}) as Record<string, any>;
    const schedule = readWorkScheduleFromEmployment(employment);
    return {
      startTime: schedule.startTime || null,
      endTime: schedule.endTime || null,
      weeklyOffDays: schedule.weeklyOffDays,
    };
  }, [selectedEmployee]);
  const selectedEmployeeScheduleLabel = useMemo(
    () => formatWorkScheduleRange(selectedEmployeeShiftSchedule),
    [selectedEmployeeShiftSchedule]
  );

  const employeeAvatarCropMetrics = useMemo(
    () =>
      employeeAvatarCropDraft
        ? getEmployeeAvatarCropMetrics({
            naturalWidth: employeeAvatarCropDraft.naturalWidth,
            naturalHeight: employeeAvatarCropDraft.naturalHeight,
            viewportSize: employeeAvatarCropViewportSize,
            zoom: employeeAvatarCropZoom,
          })
        : null,
    [
      employeeAvatarCropDraft,
      employeeAvatarCropViewportSize,
      employeeAvatarCropZoom,
    ]
  );
  const employeeAvatarCropImageStyle = useMemo(() => {
    if (!employeeAvatarCropMetrics) return undefined;

    const position = clampEmployeeAvatarCropPosition(
      employeeAvatarCropPosition,
      employeeAvatarCropMetrics
    );

    return {
      width: `${employeeAvatarCropMetrics.width}px`,
      height: `${employeeAvatarCropMetrics.height}px`,
      left: `${
        (employeeAvatarCropViewportSize - employeeAvatarCropMetrics.width) / 2 +
        position.x
      }px`,
      top: `${
        (employeeAvatarCropViewportSize - employeeAvatarCropMetrics.height) /
          2 +
        position.y
      }px`,
    };
  }, [
    employeeAvatarCropMetrics,
    employeeAvatarCropPosition,
    employeeAvatarCropViewportSize,
  ]);
  const employeeAvatarCropMiniPreviewStyle = useMemo(() => {
    if (!employeeAvatarCropMetrics) return undefined;

    const previewSize = 112;
    const scale = previewSize / Math.max(1, employeeAvatarCropViewportSize);
    const position = clampEmployeeAvatarCropPosition(
      employeeAvatarCropPosition,
      employeeAvatarCropMetrics
    );

    return {
      width: `${employeeAvatarCropMetrics.width * scale}px`,
      height: `${employeeAvatarCropMetrics.height * scale}px`,
      left: `${
        (previewSize - employeeAvatarCropMetrics.width * scale) / 2 +
        position.x * scale
      }px`,
      top: `${
        (previewSize - employeeAvatarCropMetrics.height * scale) / 2 +
        position.y * scale
      }px`,
    };
  }, [
    employeeAvatarCropMetrics,
    employeeAvatarCropPosition,
    employeeAvatarCropViewportSize,
  ]);
  const employeeAvatarCropZoomLabel = `${Math.round(employeeAvatarCropZoom * 100)}%`;

  useEffect(() => {
    return () => {
      if (employeeAvatarCropDraft?.objectUrl) {
        URL.revokeObjectURL(employeeAvatarCropDraft.objectUrl);
      }
    };
  }, [employeeAvatarCropDraft?.objectUrl]);

  useEffect(() => {
    if (!employeeAvatarCropOpen) return;

    const element = employeeAvatarCropViewportRef.current;
    if (!element) return;

    const updateViewportSize = () => {
      const nextSize = Math.max(
        240,
        Math.round(element.getBoundingClientRect().width)
      );
      setEmployeeAvatarCropViewportSize(nextSize);
    };

    updateViewportSize();

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      updateViewportSize();
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [employeeAvatarCropOpen, employeeAvatarCropDraft]);

  useEffect(() => {
    if (!employeeAvatarCropMetrics) return;
    setEmployeeAvatarCropPosition(current =>
      clampEmployeeAvatarCropPosition(current, employeeAvatarCropMetrics)
    );
  }, [employeeAvatarCropMetrics]);

  useEffect(() => {
    if (!user?.uid) {
      setAdminNotifications([]);
      return;
    }

    const notificationsQuery = query(
      collection(db, EMPLOYEE_NOTIFICATIONS_COLLECTION),
      where("targetUid", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      snapshot => {
        setAdminNotifications(
          snapshot.docs.map(docSnapshot =>
            normalizeInAppNotificationRecord(
              docSnapshot.id,
              (docSnapshot.data() as Record<string, any>) || {}
            )
          )
        );
      },
      error => {
        console.error("employee_admin_notifications_snapshot_error", error);
        setAdminNotifications([]);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!selectedEmployeeDocumentId) {
      setEmployeeAbsences([]);
      setEmployeeAbsencesLoading(false);
      return;
    }

    setEmployeeAbsencesLoading(true);

    const unsubscribe = onSnapshot(
      query(
        collection(db, EMPLOYEE_ABSENCES_COLLECTION),
        where("employeeId", "==", selectedEmployeeDocumentId)
      ),
      snapshot => {
        const rows = sortEmployeeAbsences(
          snapshot.docs.map(docSnapshot =>
            normalizeEmployeeAbsence(
              docSnapshot.id,
              (docSnapshot.data() as Record<string, any>) || {}
            )
          )
        );
        setEmployeeAbsences(rows);
        setEmployeeAbsencesLoading(false);
      },
      error => {
        console.error("employee_absences_admin_snapshot_error", error);
        setEmployeeAbsences([]);
        setEmployeeAbsencesLoading(false);
      }
    );

    return () => unsubscribe();
  }, [selectedEmployeeDocumentId]);

  useEffect(() => {
    if (!selectedEmployeeDocumentId) {
      setEmployeePayrollRecords([]);
      setEmployeePayrollRecordsLoading(false);
      resetPayrollMudadDocument();
      return;
    }

    setEmployeePayrollRecordsLoading(true);

    const unsubscribe = onSnapshot(
      query(
        collection(db, EMPLOYEE_PAYROLL_RECORDS_COLLECTION),
        where("employeeId", "==", selectedEmployeeDocumentId)
      ),
      snapshot => {
        const rows = sortEmployeePayrollRecords(
          snapshot.docs.map(docSnapshot =>
            normalizeEmployeePayrollRecord(
              docSnapshot.id,
              (docSnapshot.data() as Record<string, any>) || {}
            )
          )
        );
        setEmployeePayrollRecords(rows);
        setEmployeePayrollRecordsLoading(false);
      },
      error => {
        console.error("employee_payroll_records_admin_snapshot_error", error);
        setEmployeePayrollRecords([]);
        setEmployeePayrollRecordsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [selectedEmployeeDocumentId]);

  useEffect(() => {
    resetPayrollMudadDocument();
  }, [payrollMonthInput, selectedEmployeeDocumentId]);

  useEffect(() => {
    if (!selectedEmployeeAuthUid) {
      setLeaveRequests([]);
      setLeaveRequestsLoading(false);
      setReviewNotes({});
      return;
    }

    setReviewNotes({});
    setLeaveRequestsLoading(true);

    const unsubscribe = onSnapshot(
      query(
        collection(db, EMPLOYEE_LEAVE_REQUESTS_COLLECTION),
        or(
          where("userId", "==", selectedEmployeeAuthUid),
          where("employeeUid", "==", selectedEmployeeAuthUid)
        )
      ),
      snapshot => {
        const rows = sortEmployeeLeaveRequests(
          snapshot.docs.map(docSnapshot =>
            normalizeEmployeeLeaveRequest(
              docSnapshot.id,
              (docSnapshot.data() as Record<string, any>) || {}
            )
          )
        );
        setLeaveRequests(rows);
        setLeaveRequestsLoading(false);
      },
      snapshotError => {
        console.error(
          "employee_leave_requests_admin_snapshot_error",
          snapshotError
        );
        setLeaveRequests([]);
        setLeaveRequestsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [selectedEmployeeAuthUid]);

  useEffect(() => {
    if (!selectedEmployeeAuthUid) {
      setServiceRequests([]);
      setServiceRequestsLoading(false);
      return;
    }

    setServiceRequestsLoading(true);

    const unsubscribe = onSnapshot(
      query(
        collection(db, EMPLOYEE_SERVICE_REQUESTS_COLLECTION),
        where("employeeUid", "==", selectedEmployeeAuthUid)
      ),
      snapshot => {
        const rows = sortEmployeeServiceRequests(
          snapshot.docs.map(docSnapshot =>
            normalizeEmployeeServiceRequest(
              docSnapshot.id,
              (docSnapshot.data() as Record<string, any>) || {}
            )
          )
        );
        setServiceRequests(rows);
        setServiceRequestsLoading(false);
      },
      snapshotError => {
        console.error(
          "employee_service_requests_admin_snapshot_error",
          snapshotError
        );
        setServiceRequests([]);
        setServiceRequestsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [selectedEmployeeAuthUid]);

  useEffect(() => {
    if (!selectedEmployeeAuthUid) {
      setLeaveBalanceAdjustments([]);
      setLeaveBalanceAdjustmentsLoading(false);
      return;
    }

    setLeaveBalanceAdjustmentsLoading(true);

    const unsubscribe = onSnapshot(
      query(
        collection(db, EMPLOYEE_LEAVE_BALANCE_ADJUSTMENTS_COLLECTION),
        where("employeeUid", "==", selectedEmployeeAuthUid)
      ),
      snapshot => {
        const rows = snapshot.docs
          .map(docSnapshot => {
            const data = (docSnapshot.data() as Record<string, any>) || {};
            return {
              id: docSnapshot.id,
              ...data,
              createdAtDate: toDateSafe(data.createdAt),
            };
          })
          .sort((a, b) => {
            const aTime = a.createdAtDate?.getTime() || 0;
            const bTime = b.createdAtDate?.getTime() || 0;
            return bTime - aTime;
          });

        setLeaveBalanceAdjustments(rows);
        setLeaveBalanceAdjustmentsLoading(false);
      },
      error => {
        console.error("leave_balance_adjustments_snapshot_error", error);
        setLeaveBalanceAdjustments([]);
        setLeaveBalanceAdjustmentsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [selectedEmployeeAuthUid]);

  useEffect(() => {
    resetEmployeeFileForm();
    resetEmployeeAvatarForm();
    resetEmployeeMessageForm();
    setAbsenceForm(buildEmployeeAbsenceFormValues());
    setPayrollMonthInput(buildEmployeePayrollMonthInput());
    setActiveEmployeeWorkspaceSection("profile");
    setEmployeeWorkspaceViewedAt({});
    setActiveEmployeeConversationId(null);
    setComposeEmployeeMessageAsNew(false);
    handledSectionNavigationRef.current = "";
  }, [selectedEmployeeId]);

  useEffect(() => {
    const refreshPayrollCalculationDate = () => {
      setPayrollCalculationDateKey(getRiyadhTodayDateKey());
    };

    refreshPayrollCalculationDate();
    const intervalId = window.setInterval(refreshPayrollCalculationDate, 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!selectedEmployeeAuthUid) {
      setEmployeeFiles([]);
      setEmployeeFilesLoading(false);
      return;
    }

    setEmployeeFilesLoading(true);
    const unsubscribe = onSnapshot(
      query(
        collection(db, EMPLOYEE_FILES_COLLECTION),
        where("employeeUid", "==", selectedEmployeeAuthUid)
      ),
      snapshot => {
        const rows = sortEmployeeFiles(
          snapshot.docs.map(docSnapshot =>
            normalizeEmployeeFileRecord(
              docSnapshot.id,
              (docSnapshot.data() as Record<string, any>) || {}
            )
          )
        );
        setEmployeeFiles(rows);
        setEmployeeFilesLoading(false);
      },
      snapshotError => {
        console.error("employee_files_admin_snapshot_error", snapshotError);
        setEmployeeFiles([]);
        setEmployeeFilesLoading(false);
      }
    );

    return () => unsubscribe();
  }, [selectedEmployeeAuthUid]);

  useEffect(() => {
    if (!selectedEmployeeAuthUid) {
      setEmployeeMessages([]);
      setEmployeeMessagesLoading(false);
      return;
    }

    setEmployeeMessagesLoading(true);
    const unsubscribe = onSnapshot(
      query(
        collection(db, EMPLOYEE_MESSAGES_COLLECTION),
        where("employeeUid", "==", selectedEmployeeAuthUid)
      ),
      snapshot => {
        const rows = snapshot.docs.map(docSnapshot =>
          normalizeEmployeeMessageRecord(
            docSnapshot.id,
            (docSnapshot.data() as Record<string, any>) || {}
          )
        );
        setEmployeeMessages(rows);
        setEmployeeMessagesLoading(false);
      },
      snapshotError => {
        console.error("employee_messages_admin_snapshot_error", snapshotError);
        setEmployeeMessages([]);
        setEmployeeMessagesLoading(false);
      }
    );

    return () => unsubscribe();
  }, [selectedEmployeeAuthUid]);

  const initialForm = useMemo(
    () => buildEmployeeFormValues(selectedEmployee),
    [selectedEmployee]
  );

  useEffect(() => {
    setForm(initialForm);
  }, [initialForm, selectedEmployeeId]);

  useEffect(() => {
    const employment = (selectedEmployee?.employeeProfile?.employment ||
      selectedEmployee?.employment ||
      {}) as Record<string, any>;

    setSalaryDeductions(normalizeSalaryDeductions(employment.salaryDeductions));
  }, [selectedEmployeeId, selectedEmployee]);

  const initialSalaryDeductions = useMemo(() => {
    const employment = (selectedEmployee?.employeeProfile?.employment ||
      selectedEmployee?.employment ||
      {}) as Record<string, any>;

    return normalizeSalaryDeductions(employment.salaryDeductions);
  }, [selectedEmployee]);

  const isDirty = useMemo(
    () =>
      JSON.stringify(form) !== JSON.stringify(initialForm) ||
      JSON.stringify(salaryDeductions) !==
        JSON.stringify(initialSalaryDeductions),
    [form, initialForm, salaryDeductions, initialSalaryDeductions]
  );
  const selectedPayrollMonthMeta = useMemo(
    () => parseEmployeePayrollMonth(payrollMonthInput),
    [payrollMonthInput]
  );
  const selectedPayrollCalculationRange = useMemo(
    () =>
      buildPayrollCalculationRange(
        selectedPayrollMonthMeta,
        payrollCalculationDateKey
      ),
    [payrollCalculationDateKey, selectedPayrollMonthMeta]
  );
  const selectedPayrollRecord = useMemo(
    () =>
      selectedPayrollMonthMeta
        ? employeePayrollRecords.find(
            record =>
              record.payrollMonth === selectedPayrollMonthMeta.payrollMonth
          ) || null
        : null,
    [employeePayrollRecords, selectedPayrollMonthMeta]
  );

  useEffect(() => {
    setAttendancePayrollSummary(null);
  }, [
    selectedEmployeeAuthUid,
    selectedPayrollMonthMeta?.payrollMonth,
    selectedEmployeeShiftSchedule.startTime,
    selectedEmployeeShiftSchedule.endTime,
    selectedEmployeeShiftSchedule.weeklyOffDays,
  ]);

  const latestApprovedLeaveRequest = useMemo(
    () => getLatestApprovedEmployeeLeaveRequest(leaveRequests),
    [leaveRequests]
  );

  const approvedLeaveRequests = useMemo(
    () => leaveRequests.filter(request => request.status === "approved"),
    [leaveRequests]
  );
  const approvedLeaveDateKeys = useMemo(
    () => buildApprovedLeaveDateKeys(approvedLeaveRequests),
    [approvedLeaveRequests]
  );
  const payrollWorkingDateKeys = useMemo(() => {
    if (!selectedPayrollMonthMeta) return [];

    return buildWorkDateKeysInRange({
      fromDate: selectedPayrollMonthMeta.monthStart,
      toDate: selectedPayrollMonthMeta.monthEnd,
      weeklyOffDays: selectedEmployeeShiftSchedule.weeklyOffDays,
      excludedDateKeys: approvedLeaveDateKeys,
    });
  }, [
    approvedLeaveDateKeys,
    selectedEmployeeShiftSchedule.weeklyOffDays,
    selectedPayrollMonthMeta,
  ]);
  const payrollAttendanceWorkDateKeys = useMemo(() => {
    if (
      !selectedPayrollMonthMeta ||
      !selectedPayrollCalculationRange ||
      selectedPayrollCalculationRange.isFutureMonth
    ) {
      return [];
    }

    return buildWorkDateKeysInRange({
      fromDate: selectedPayrollCalculationRange.calculationStartDate,
      toDate: selectedPayrollCalculationRange.calculationEndDate,
      weeklyOffDays: selectedEmployeeShiftSchedule.weeklyOffDays,
      excludedDateKeys: approvedLeaveDateKeys,
    });
  }, [
    approvedLeaveDateKeys,
    selectedEmployeeShiftSchedule.weeklyOffDays,
    selectedPayrollCalculationRange,
    selectedPayrollMonthMeta,
  ]);

  const pendingLeaveRequestsCount = useMemo(
    () => leaveRequests.filter(request => request.status === "pending").length,
    [leaveRequests]
  );
  const pendingServiceRequestsCount = useMemo(
    () =>
      serviceRequests.filter(request => request.status === "pending").length,
    [serviceRequests]
  );

  const approvedLeaveDaysTotal = useMemo(
    () =>
      approvedLeaveRequests.reduce(
        (sum, request) => sum + (Number(request.daysCount) || 0),
        0
      ),
    [approvedLeaveRequests]
  );

  const latestDeductedLeaveRequest = useMemo(
    () => approvedLeaveRequests[0] || null,
    [approvedLeaveRequests]
  );

  const currentLeaveBalanceNumber = useMemo(() => {
    const parsed = Number(form.leaveBalance || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [form.leaveBalance]);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleExportEmployeeExcelReport = async () => {
    if (!selectedEmployee || !selectedEmployeeProfile) return;

    setEmployeeReportExporting(true);

    try {
      const result = await generateEmployeeExcelReport({
        employee: selectedEmployee,
        profile: selectedEmployeeProfile,
        payrollRecords: employeePayrollRecords,
        absences: employeeAbsences,
        leaveRequests,
        files: employeeFiles,
        reportMonth: payrollMonthInput,
      });

      downloadBlob(result.blob, result.fileName);
      toast.success("تم إنشاء تقرير Excel للموظف.");
    } catch (error) {
      console.error("employee_excel_report_failed", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر إنشاء تقرير Excel للموظف."
      );
    } finally {
      setEmployeeReportExporting(false);
    }
  };

  useEffect(() => {
    setManualLeaveBalance(
      Number.isFinite(currentLeaveBalanceNumber)
        ? String(currentLeaveBalanceNumber)
        : ""
    );
    setManualLeaveBalanceOperation("add");
    setManualLeaveAdjustmentReason("");
  }, [selectedEmployeeId, currentLeaveBalanceNumber]);

  const manualLeaveBalanceAmount = useMemo(() => {
    const parsed = Number(manualLeaveBalance);
    return Number.isFinite(parsed) ? parsed : null;
  }, [manualLeaveBalance]);

  const manualLeaveDeductionPreview = useMemo(() => {
    if (
      manualLeaveBalanceOperation !== "deduct" ||
      manualLeaveBalanceAmount === null
    ) {
      return null;
    }

    return Math.max(currentLeaveBalanceNumber - manualLeaveBalanceAmount, 0);
  }, [
    currentLeaveBalanceNumber,
    manualLeaveBalanceAmount,
    manualLeaveBalanceOperation,
  ]);

  const previousLeaveBalanceBeforeLastApproval = useMemo(() => {
    if (!latestDeductedLeaveRequest) return currentLeaveBalanceNumber;
    return (
      currentLeaveBalanceNumber +
      (Number(latestDeductedLeaveRequest.daysCount) || 0)
    );
  }, [currentLeaveBalanceNumber, latestDeductedLeaveRequest]);

  const latestManualLeaveAdjustmentMeta = useMemo(() => {
    const employment = (selectedEmployee?.employeeProfile?.employment ||
      selectedEmployee?.employment ||
      {}) as Record<string, any>;

    return (employment.leaveBalanceAdjustmentMeta || null) as Record<
      string,
      any
    > | null;
  }, [selectedEmployee]);

  const approvedLeaveRequestIds = useMemo(
    () =>
      new Set(
        approvedLeaveRequests.map(request => String(request.id || "").trim())
      ),
    [approvedLeaveRequests]
  );

  const approvedLeaveDaysAfterRequest = useMemo(() => {
    let runningApprovedDays = 0;
    const map = new Map<string, number>();

    const chronologicalApproved = [...approvedLeaveRequests]
      .filter(request => request.status === "approved")
      .sort((a, b) => {
        const aTime =
          toDateSafe(a.reviewedAt || a.updatedAt || a.createdAt)?.getTime() ||
          0;
        const bTime =
          toDateSafe(b.reviewedAt || b.updatedAt || b.createdAt)?.getTime() ||
          0;
        return aTime - bTime;
      });

    chronologicalApproved.forEach(request => {
      runningApprovedDays += Number(request.daysCount) || 0;
      map.set(String(request.id || "").trim(), runningApprovedDays);
    });

    return map;
  }, [approvedLeaveRequests]);

  const getLeaveBalanceBeforeRequest = (
    request: EmployeeLeaveRequestRecord
  ) => {
    if (request.status !== "approved") return null;

    const requestId = String(request.id || "").trim();
    const approvedUsedAfterThisRequest =
      approvedLeaveDaysAfterRequest.get(requestId) || 0;

    const approvedUsedBeforeThisRequest =
      approvedUsedAfterThisRequest - (Number(request.daysCount) || 0);

    return (
      currentLeaveBalanceNumber +
      approvedLeaveDaysTotal -
      approvedUsedBeforeThisRequest
    );
  };

  const getLeaveBalanceAfterRequest = (request: EmployeeLeaveRequestRecord) => {
    if (request.status !== "approved") return null;

    const before = getLeaveBalanceBeforeRequest(request);
    if (before === null) return null;

    return before - (Number(request.daysCount) || 0);
  };
  const visibleEmployeeFiles = useMemo(
    () =>
      filterActiveEmployeeFiles(employeeFiles).filter(
        file => !isOfficialEmployeeFile(file)
      ),
    [employeeFiles]
  );

  const unreadEmployeeFilesCount = useMemo(
    () => visibleEmployeeFiles.filter(file => !file.isRead).length,
    [visibleEmployeeFiles]
  );
  const latestEmployeeFileUpdateAt = useMemo(
    () =>
      getLatestTimestamp(
        ...employeeFiles
          .filter(file => !file.isRead)
          .map(file => file.createdAtDate || file.uploadedAtDate)
      ),
    [employeeFiles]
  );
  const archivedEmployeeFilesCount =
    employeeFiles.length - visibleEmployeeFiles.length;
  const replacingEmployeeFile = useMemo(
    () =>
      visibleEmployeeFiles.find(file => file.id === replacingEmployeeFileId) ||
      null,
    [replacingEmployeeFileId, visibleEmployeeFiles]
  );

  const employeeOfficialFiles = useMemo(
    () =>
      filterActiveEmployeeFiles(employeeFiles).filter(isOfficialEmployeeFile),
    [employeeFiles]
  );

  const employeeConversations = useMemo(
    () => groupEmployeeMessageConversations(employeeMessages, user?.uid),
    [employeeMessages, user?.uid]
  );
  const requestedConversationId = useMemo(
    () =>
      employeeMessages.find(message => message.id === requestedMessageId)
        ?.conversationId || null,
    [employeeMessages, requestedMessageId]
  );
  const activeEmployeeConversation = useMemo(
    () =>
      employeeConversations.find(
        conversation => conversation.id === activeEmployeeConversationId
      ) || null,
    [activeEmployeeConversationId, employeeConversations]
  );
  const unreadEmployeeMessagesCount = useMemo(
    () => employeeMessages.filter(message => !message.isRead).length,
    [employeeMessages]
  );
  const latestEmployeeMessageUpdateAt = useMemo(
    () =>
      getLatestTimestamp(
        ...employeeMessages
          .filter(message => !message.isRead)
          .map(message => message.createdAtDate)
      ),
    [employeeMessages]
  );
  const readEmployeeMessagesCount =
    employeeMessages.length - unreadEmployeeMessagesCount;
  const latestEmployeeLeaveUpdateAt = useMemo(
    () =>
      getLatestTimestamp(
        ...leaveRequests.map(request =>
          toDateSafe(
            request.updatedAt ||
              request.reviewedAt ||
              request.decidedAt ||
              request.createdAt
          )
        )
      ),
    [leaveRequests]
  );
  const latestEmployeeServiceRequestUpdateAt = useMemo(
    () =>
      getLatestTimestamp(
        ...serviceRequests.map(request =>
          toDateSafe(
            request.updatedAt ||
              request.reviewedAt ||
              request.decidedAt ||
              request.createdAt
          )
        )
      ),
    [serviceRequests]
  );
  const latestEmployeePayrollUpdateAt = useMemo(
    () => employeePayrollRecords[0]?.createdAtDate?.getTime() || 0,
    [employeePayrollRecords]
  );

  const unreadAdminNotifications = useMemo(
    () => adminNotifications.filter(notification => !notification.isRead),
    [adminNotifications]
  );

  const employeeWorkspaceUnreadNotificationIndex = useMemo(() => {
    const index = new Map<string, EmployeeWorkspaceNotificationBucket>();

    unreadAdminNotifications.forEach(notification => {
      const employeeId =
        resolveEmployeeWorkspaceNotificationEmployeeId(notification);
      if (!employeeId) return;

      const section = resolveEmployeeWorkspaceNotificationSection(notification);
      if (!section) return;

      let bucket = index.get(employeeId);
      if (!bucket) {
        bucket = createEmptyEmployeeWorkspaceNotificationBucket();
        index.set(employeeId, bucket);
      }

      bucket[section].push(notification.id);
      bucket.all.push(notification.id);
    });

    return index;
  }, [unreadAdminNotifications]);

  const selectedEmployeeWorkspaceUnreadNotificationBucket = selectedEmployeeId
    ? (employeeWorkspaceUnreadNotificationIndex.get(selectedEmployeeId) ?? null)
    : null;

  const employeeWorkspaceAlertState = useMemo(
    () => ({
      salary: {
        latestUpdateAt: latestEmployeePayrollUpdateAt,
        viewedAt: employeeWorkspaceViewedAt.salary || 0,
      },
      leave: {
        latestUpdateAt: latestEmployeeLeaveUpdateAt,
        viewedAt: employeeWorkspaceViewedAt.leave || 0,
      },
      requests: {
        latestUpdateAt: latestEmployeeServiceRequestUpdateAt,
        viewedAt: employeeWorkspaceViewedAt.requests || 0,
      },
      messages: {
        latestUpdateAt: latestEmployeeMessageUpdateAt,
        viewedAt: employeeWorkspaceViewedAt.messages || 0,
      },
      files: {
        latestUpdateAt: latestEmployeeFileUpdateAt,
        viewedAt: employeeWorkspaceViewedAt.files || 0,
      },
    }),
    [
      employeeWorkspaceViewedAt.files,
      employeeWorkspaceViewedAt.leave,
      employeeWorkspaceViewedAt.messages,
      employeeWorkspaceViewedAt.requests,
      employeeWorkspaceViewedAt.salary,
      latestEmployeeFileUpdateAt,
      latestEmployeeLeaveUpdateAt,
      latestEmployeeServiceRequestUpdateAt,
      latestEmployeeMessageUpdateAt,
      latestEmployeePayrollUpdateAt,
    ]
  );
  const employeeWorkspaceSectionHasAlert = {
    profile: Boolean(
      selectedEmployeeWorkspaceUnreadNotificationBucket?.profile.length
    ),
    schedule: Boolean(
      selectedEmployeeWorkspaceUnreadNotificationBucket?.schedule.length
    ),
    attendance: Boolean(
      selectedEmployeeWorkspaceUnreadNotificationBucket?.attendance.length
    ),
    salary:
      Boolean(
        selectedEmployeeWorkspaceUnreadNotificationBucket?.salary.length
      ) ||
      employeeWorkspaceAlertState.salary.latestUpdateAt >
        employeeWorkspaceAlertState.salary.viewedAt,
    leave: Boolean(
      selectedEmployeeWorkspaceUnreadNotificationBucket?.leave.length
    ),
    requests:
      Boolean(
        selectedEmployeeWorkspaceUnreadNotificationBucket?.requests.length
      ) ||
      employeeWorkspaceAlertState.requests.latestUpdateAt >
        employeeWorkspaceAlertState.requests.viewedAt,
    messages: Boolean(
      selectedEmployeeWorkspaceUnreadNotificationBucket?.messages.length
    ),
    files:
      Boolean(
        selectedEmployeeWorkspaceUnreadNotificationBucket?.files.length
      ) ||
      employeeWorkspaceAlertState.files.latestUpdateAt >
        employeeWorkspaceAlertState.files.viewedAt,
  } as const;
  const hasEmployeeWorkspaceAlerts =
    employeeWorkspaceSectionHasAlert.salary ||
    employeeWorkspaceSectionHasAlert.requests ||
    employeeWorkspaceSectionHasAlert.leave ||
    employeeWorkspaceSectionHasAlert.messages ||
    employeeWorkspaceSectionHasAlert.files ||
    employeeWorkspaceSectionHasAlert.profile ||
    employeeWorkspaceSectionHasAlert.schedule ||
    employeeWorkspaceSectionHasAlert.attendance;

  useEffect(() => {
    if (
      requestedConversationId &&
      search &&
      handledMessageSearchRef.current !== search
    ) {
      handledMessageSearchRef.current = search;
      setActiveEmployeeConversationId(requestedConversationId);
      setComposeEmployeeMessageAsNew(false);
      return;
    }

    if (!requestedMessageId) {
      handledMessageSearchRef.current = "";
    }

    if (
      activeEmployeeConversationId &&
      !employeeConversations.some(
        conversation => conversation.id === activeEmployeeConversationId
      )
    ) {
      setActiveEmployeeConversationId(null);
    }
  }, [
    activeEmployeeConversationId,
    employeeConversations,
    requestedConversationId,
    requestedMessageId,
    search,
  ]);

  const markEmployeeWorkspaceNotificationsRead = (
    section: EmployeeWorkspaceSectionKey
  ) => {
    if (!selectedEmployeeId) return;

    const unreadIds =
      selectedEmployeeWorkspaceUnreadNotificationBucket?.[section] || [];
    if (!unreadIds.length) return;

    const unreadIdSet = new Set(unreadIds);
    setAdminNotifications(current =>
      current.map(notification =>
        unreadIdSet.has(notification.id)
          ? { ...notification, isRead: true }
          : notification
      )
    );
    void markInAppNotificationsRead(unreadIds).catch(error => {
      console.error("employee_workspace_notification_mark_read_failed", error);
    });
  };

  const activateEmployeeWorkspaceSection = (
    section: EmployeeWorkspaceSectionKey
  ) => {
    markEmployeeWorkspaceNotificationsRead(section);
    setEmployeeWorkspaceViewedAt(current => ({
      ...current,
      [section]: Date.now(),
    }));
    employeeWorkspaceScrollTargetRef.current = null;
    setActiveEmployeeWorkspaceSection(section);
  };

  const scrollToEmployeeWorkspaceSection = (
    section: EmployeeWorkspaceSectionKey,
    behavior: ScrollBehavior = "smooth"
  ) => {
    markEmployeeWorkspaceNotificationsRead(section);
    setEmployeeWorkspaceViewedAt(current => ({
      ...current,
      [section]: Date.now(),
    }));

    const targetRef = employeeWorkspaceSectionRefs[section];
    if (activeEmployeeWorkspaceSection === section) {
      targetRef.current?.scrollIntoView({
        behavior,
        block: "start",
      });
      return;
    }

    employeeWorkspaceScrollTargetRef.current = section;
    setActiveEmployeeWorkspaceSection(section);
  };

  useEffect(() => {
    const targetSection = employeeWorkspaceScrollTargetRef.current;
    if (!targetSection) return;
    if (targetSection !== activeEmployeeWorkspaceSection) return;

    const target = employeeWorkspaceSectionRefs[targetSection].current;
    if (!target) return;

    employeeWorkspaceScrollTargetRef.current = null;
    target.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [activeEmployeeWorkspaceSection, selectedEmployeeId]);

  useEffect(() => {
    if (!selectedEmployeeId || !shouldScrollEmployeeDetailsTopRef.current) {
      return;
    }

    const target = employeeDetailsTopRef.current;
    if (!target) return;

    shouldScrollEmployeeDetailsTopRef.current = false;
    window.requestAnimationFrame(() => {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [selectedEmployeeId]);

  useEffect(() => {
    if (!requestedPanel) {
      handledSectionNavigationRef.current = "";
      return;
    }

    if (
      !requestedEmployeeSection ||
      !requestedEmployeeId ||
      requestedEmployeeId !== selectedEmployeeId ||
      !selectedEmployee ||
      !selectedEmployeeProfile ||
      handledSectionNavigationRef.current === search
    ) {
      return;
    }

    handledSectionNavigationRef.current = search;
    scrollToEmployeeWorkspaceSection(requestedEmployeeSection);
  }, [
    requestedEmployeeId,
    requestedEmployeeSection,
    requestedPanel,
    search,
    selectedEmployee,
    selectedEmployeeId,
    selectedEmployeeProfile,
  ]);

  const handleSelectEmployee = (employeeId: string) => {
    shouldScrollEmployeeDetailsTopRef.current = true;
    employeeWorkspaceScrollTargetRef.current = null;
    setActiveEmployeeWorkspaceSection("profile");
    setSelectedEmployeeId(employeeId);
    window.requestAnimationFrame(() => {
      employeeDetailsTopRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const handleCloseEmployeeDetails = () => {
    employeeWorkspaceScrollTargetRef.current = null;
    setSelectedEmployeeId("");
  };

  const activeEmployeesCount = employeeCards.filter(
    card => card.profile.employment.statusKey === "active"
  ).length;
  const onLeaveEmployeesCount = employeeCards.filter(
    card => card.profile.employment.statusKey === "on_leave"
  ).length;
  const probationEmployeesCount = employeeCards.filter(
    card => card.profile.employment.statusKey === "probation"
  ).length;

  const baseSalaryNumber = Number(form.baseSalary || 0);
  const housingAllowanceNumber = Number(form.housingAllowance || 0);
  const transportationAllowanceNumber = Number(
    form.transportationAllowance || 0
  );
  const otherAllowancesNumber = Number(form.otherAllowances || 0);
  const totalAllowances = useMemo(() => {
    return [
      housingAllowanceNumber,
      transportationAllowanceNumber,
      otherAllowancesNumber,
    ].reduce(
      (sum, value) => sum + (Number.isFinite(value) ? Math.max(0, value) : 0),
      0
    );
  }, [
    housingAllowanceNumber,
    otherAllowancesNumber,
    transportationAllowanceNumber,
  ]);
  const expectedWorkDaysNumber = Number(form.expectedWorkDays || 0);
  const expectedWorkHoursNumber = Number(form.expectedWorkHours || 0);
  const payrollWorkingDaysNumber = payrollWorkingDateKeys.length;
  const payrollExpectedWorkDaysNumber =
    payrollWorkingDaysNumber > 0
      ? payrollWorkingDaysNumber
      : expectedWorkDaysNumber;
  const overtimeHourlyRateInputNumber = Number(form.overtimeHourlyRate || 0);
  const shiftSchedule = useMemo(
    () => ({
      startTime: form.shiftStartTime,
      endTime: form.shiftEndTime,
    }),
    [form.shiftEndTime, form.shiftStartTime]
  );
  const shiftExpectedHoursNumber = useMemo(
    () => getShiftExpectedHours(shiftSchedule),
    [shiftSchedule]
  );
  const scheduledMonthlyWorkHours = useMemo(() => {
    if (
      Number.isFinite(expectedWorkDaysNumber) &&
      payrollExpectedWorkDaysNumber > 0 &&
      shiftExpectedHoursNumber > 0
    ) {
      return payrollExpectedWorkDaysNumber * shiftExpectedHoursNumber;
    }

    return 0;
  }, [
    expectedWorkDaysNumber,
    payrollExpectedWorkDaysNumber,
    shiftExpectedHoursNumber,
  ]);
  const payrollRateWorkHours =
    scheduledMonthlyWorkHours > 0
      ? scheduledMonthlyWorkHours
      : expectedWorkHoursNumber;
  const attendanceMissingHoursNumber =
    attendancePayrollSummary?.missingHours ?? 0;
  const attendanceOvertimeHoursNumber =
    attendancePayrollSummary?.overtimeHours ?? 0;
  const attendanceAbsentDaysNumber = attendancePayrollSummary
    ? attendancePayrollSummary.absentDays
    : 0;
  const insuranceDeductionNumber = Number(form.insuranceDeduction || 0);
  const effectiveInsuranceDeduction = Number.isFinite(insuranceDeductionNumber)
    ? Math.max(0, insuranceDeductionNumber)
    : 0;
  const totalSalaryDeductions = useMemo(
    () =>
      salaryDeductions.reduce((sum, item) => {
        const amount = Number(item.amount || 0);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0),
    [salaryDeductions]
  );

  const calculatedDailyRate = useMemo(() => {
    if (!Number.isFinite(baseSalaryNumber) || baseSalaryNumber <= 0) return 0;
    if (
      !Number.isFinite(payrollExpectedWorkDaysNumber) ||
      payrollExpectedWorkDaysNumber <= 0
    )
      return 0;

    return baseSalaryNumber / payrollExpectedWorkDaysNumber;
  }, [baseSalaryNumber, payrollExpectedWorkDaysNumber]);

  const calculatedHourlyRate = useMemo(() => {
    if (!Number.isFinite(baseSalaryNumber) || baseSalaryNumber <= 0) return 0;
    if (!Number.isFinite(payrollRateWorkHours) || payrollRateWorkHours <= 0)
      return 0;

    return baseSalaryNumber / payrollRateWorkHours;
  }, [baseSalaryNumber, payrollRateWorkHours]);

  const calculatedHoursDifference = useMemo(() => {
    return attendanceOvertimeHoursNumber - attendanceMissingHoursNumber;
  }, [attendanceMissingHoursNumber, attendanceOvertimeHoursNumber]);

  const calculatedOvertimeHours = useMemo(() => {
    return Math.max(0, attendanceOvertimeHoursNumber);
  }, [attendanceOvertimeHoursNumber]);

  const calculatedMissingHours = useMemo(() => {
    return Math.max(0, attendanceMissingHoursNumber);
  }, [attendanceMissingHoursNumber]);

  const effectiveOvertimeHourlyRate = useMemo(() => {
    if (
      Number.isFinite(overtimeHourlyRateInputNumber) &&
      overtimeHourlyRateInputNumber > 0
    ) {
      return overtimeHourlyRateInputNumber;
    }

    return calculatedHourlyRate;
  }, [overtimeHourlyRateInputNumber, calculatedHourlyRate]);

  const calculatedOvertimeAmount = useMemo(() => {
    if (
      !Number.isFinite(effectiveOvertimeHourlyRate) ||
      effectiveOvertimeHourlyRate <= 0
    )
      return 0;

    return calculatedOvertimeHours * effectiveOvertimeHourlyRate;
  }, [calculatedOvertimeHours, effectiveOvertimeHourlyRate]);

  const calculatedMissingDeduction = useMemo(() => {
    if (!Number.isFinite(calculatedHourlyRate) || calculatedHourlyRate <= 0)
      return 0;

    return calculatedMissingHours * calculatedHourlyRate;
  }, [calculatedMissingHours, calculatedHourlyRate]);

  const calculatedAttendanceAbsenceDeduction = useMemo(() => {
    if (!Number.isFinite(calculatedDailyRate) || calculatedDailyRate <= 0)
      return 0;

    return attendanceAbsentDaysNumber * calculatedDailyRate;
  }, [attendanceAbsentDaysNumber, calculatedDailyRate]);

  const calculatedGrossSalary = useMemo(() => {
    if (!Number.isFinite(baseSalaryNumber) || baseSalaryNumber <= 0) return 0;

    return Math.max(
      0,
      baseSalaryNumber +
        totalAllowances +
        calculatedOvertimeAmount -
        calculatedMissingDeduction -
        calculatedAttendanceAbsenceDeduction
    );
  }, [
    baseSalaryNumber,
    calculatedAttendanceAbsenceDeduction,
    calculatedOvertimeAmount,
    calculatedMissingDeduction,
    totalAllowances,
  ]);

  const baseSalaryAfterInsurance = useMemo(() => {
    if (!Number.isFinite(baseSalaryNumber) || baseSalaryNumber <= 0) return 0;

    return Math.max(
      0,
      baseSalaryNumber + totalAllowances - effectiveInsuranceDeduction
    );
  }, [baseSalaryNumber, effectiveInsuranceDeduction, totalAllowances]);

  const calculatedNetSalary = useMemo(
    () =>
      Math.max(
        0,
        calculatedGrossSalary -
          totalSalaryDeductions -
          effectiveInsuranceDeduction
      ),
    [calculatedGrossSalary, effectiveInsuranceDeduction, totalSalaryDeductions]
  );

  const handleFormChange = <K extends keyof EmployeeFormValues>(
    key: K,
    value: EmployeeFormValues[K]
  ) => {
    setForm(current => ({
      ...current,
      [key]: value,
    }));
  };

  const handleToggleAllowedZone = (zoneId: string, checked: boolean) => {
    setForm(current => {
      const currentIds = normalizeAllowedZoneIds(current.allowedZoneIds);
      const nextIds = checked
        ? Array.from(new Set([...currentIds, zoneId]))
        : currentIds.filter(id => id !== zoneId);

      return {
        ...current,
        allowedZoneIds: nextIds,
      };
    });
  };

  const handleToggleWeeklyOffDay = (
    day: WorkScheduleWeekday,
    checked: boolean
  ) => {
    setForm(current => {
      const selected = new Set(normalizeWeeklyOffDays(current.weeklyOffDays));
      if (checked) {
        selected.add(day);
      } else {
        selected.delete(day);
      }

      return {
        ...current,
        weeklyOffDays: WORK_SCHEDULE_WEEKDAYS.map(
          option => option.value
        ).filter(option => selected.has(option)),
      };
    });
  };

  const buildAttendancePayrollSummary = async (
    calculationRange = buildPayrollCalculationRange(selectedPayrollMonthMeta),
    todayDateKey = getRiyadhTodayDateKey(),
    absenceDateKeys = employeeAbsences.map(absence => absence.date)
  ) => {
    if (
      !selectedEmployeeAuthUid ||
      !selectedPayrollMonthMeta ||
      !calculationRange ||
      calculationRange.isFutureMonth
    ) {
      return null;
    }
    const response = await fetchAttendanceRecords({
      employeeUid: selectedEmployeeAuthUid,
      fromDate: calculationRange.calculationStartDate,
      toDate: calculationRange.calculationEndDate,
      result: "allowed",
      limit: 200,
    });
    const workDateKeys = buildWorkDateKeysInRange({
      fromDate: calculationRange.calculationStartDate,
      toDate: calculationRange.calculationEndDate,
      weeklyOffDays: selectedEmployeeShiftSchedule.weeklyOffDays,
      excludedDateKeys: approvedLeaveDateKeys,
    });
    return summarizeAttendanceForPayroll(
      response.records,
      selectedEmployeeShiftSchedule,
      {
        workDateKeys,
        todayDateKey,
        approvedLeaveDateKeys,
        absenceDateKeys,
      }
    );
  };

  const handleCalculatePayrollFromAttendance = async () => {
    if (!selectedPayrollMonthMeta) {
      toast.error("اختر شهر الراتب أولًا.");
      return;
    }
    const payrollCalculationDate = getRiyadhTodayDateKey();
    setPayrollCalculationDateKey(payrollCalculationDate);
    const payrollCalculationRange = buildPayrollCalculationRange(
      selectedPayrollMonthMeta,
      payrollCalculationDate
    );
    if (payrollCalculationRange?.isFutureMonth) {
      toast.error("لا يمكن احتساب الحضور لشهر مستقبلي.");
      return;
    }
    if (!selectedEmployeeAuthUid) {
      toast.error("لا يوجد معرف حضور مرتبط بالموظف.");
      return;
    }
    if (
      !selectedEmployeeShiftSchedule.startTime ||
      !selectedEmployeeShiftSchedule.endTime
    ) {
      toast.error(
        "يجب تحديد وقت الدوام من بيانات الموظف قبل الاحتساب من الحضور"
      );
      return;
    }

    setAttendancePayrollLoading(true);
    try {
      const summary = await buildAttendancePayrollSummary(
        payrollCalculationRange,
        payrollCalculationDate
      );
      if (!summary) return;
      setAttendancePayrollSummary(summary);
      setForm(current => ({
        ...current,
        actualWorkedHours: String(summary.actualHours),
      }));
      toast.success("تم احتساب ساعات الراتب من سجلات الحضور.");
    } catch (error) {
      console.error("employee_attendance_payroll_summary_failed", error);
      toast.error("تعذر احتساب ساعات الراتب من الحضور.");
    } finally {
      setAttendancePayrollLoading(false);
    }
  };

  const handleNewWorkZoneFormChange = <
    K extends keyof EmployeeWorkZoneFormValues,
  >(
    key: K,
    value: EmployeeWorkZoneFormValues[K]
  ) => {
    setNewWorkZoneForm(current => ({
      ...current,
      [key]: value,
    }));
  };

  const resetWorkZoneForm = () => {
    setEditingWorkZoneId(null);
    setNewWorkZoneForm(buildEmployeeWorkZoneFormValues());
    setNewWorkZoneOpen(false);
  };

  const handleEditWorkZoneFromEmployee = (zone: WorkZone) => {
    setEditingWorkZoneId(zone.id);
    setNewWorkZoneForm({
      name: zone.name,
      lat: formatCoordinate(zone.center.lat),
      lng: formatCoordinate(zone.center.lng),
      radiusMeters: String(Math.round(zone.radiusMeters)),
    });
    setNewWorkZoneOpen(true);
  };

  const handleUseCurrentLocationForWorkZone = async () => {
    setLocatingWorkZone(true);
    try {
      const position = await getCurrentGpsPosition();
      setNewWorkZoneForm(current => ({
        ...current,
        lat: formatCoordinate(position.coords.latitude),
        lng: formatCoordinate(position.coords.longitude),
      }));
      toast.success("تم تحديد الموقع الحالي للنطاق.");
    } catch (error) {
      console.error("employee_work_zone_geolocation_failed", error);
      toast.error(
        error instanceof Error ? error.message : "تعذر جلب موقع الجهاز."
      );
    } finally {
      setLocatingWorkZone(false);
    }
  };

  const persistAllowedZoneForSelectedEmployee = async (zoneId: string) => {
    const normalizedZoneId = String(zoneId || "").trim();
    const nextAllowedZoneIds = normalizeAllowedZoneIds(
      normalizedZoneId
        ? [...form.allowedZoneIds, normalizedZoneId]
        : form.allowedZoneIds
    );

    setForm(current => ({
      ...current,
      allowedZoneIds: normalizeAllowedZoneIds(
        normalizedZoneId
          ? [...current.allowedZoneIds, normalizedZoneId]
          : current.allowedZoneIds
      ),
    }));

    if (!selectedEmployee || !normalizedZoneId) {
      return nextAllowedZoneIds;
    }

    const linkedEmployeeId =
      String(selectedEmployee.linkedEmployeeId || "").trim() ||
      selectedEmployee.id;
    const zonePatch = {
      allowedZoneIds: nextAllowedZoneIds,
      employment: {
        allowedZoneIds: nextAllowedZoneIds,
        updatedAt: serverTimestamp(),
      },
      employeeProfile: {
        employment: {
          allowedZoneIds: nextAllowedZoneIds,
          updatedAt: serverTimestamp(),
        },
      },
      updatedAt: serverTimestamp(),
    };

    if (linkedEmployeeId) {
      await setDoc(doc(db, "employees", linkedEmployeeId), zonePatch, {
        merge: true,
      });
    }

    try {
      await setDoc(doc(db, "users", selectedEmployee.id), zonePatch, {
        merge: true,
      });
    } catch (error) {
      console.warn("employee_work_zone_user_link_best_effort_failed", {
        userId: selectedEmployee.id,
        error,
      });
    }

    return nextAllowedZoneIds;
  };

  const handleSaveWorkZoneFromEmployee = async () => {
    const name = newWorkZoneForm.name.trim();
    const lat = parseFiniteNumber(newWorkZoneForm.lat);
    const lng = parseFiniteNumber(newWorkZoneForm.lng);
    const radiusMeters = parseFiniteNumber(newWorkZoneForm.radiusMeters);

    if (!name) {
      toast.error("اسم النطاق مطلوب.");
      return;
    }

    if (lat === null || lat < -90 || lat > 90) {
      toast.error("خط العرض غير صحيح.");
      return;
    }

    if (lng === null || lng < -180 || lng > 180) {
      toast.error("خط الطول غير صحيح.");
      return;
    }

    if (radiusMeters === null || radiusMeters <= 0) {
      toast.error("Radius يجب أن يكون رقمًا أكبر من صفر.");
      return;
    }

    setCreatingWorkZone(true);
    try {
      const payload = {
        name,
        type: "radius",
        center: { lat, lng },
        radiusMeters,
        active: true,
      } as const;

      const savedZone = editingWorkZoneId
        ? await updateWorkZone(editingWorkZoneId, payload)
        : await createWorkZone(payload);
      const nextZones = await fetchWorkZones();
      setWorkZones(nextZones);

      if (savedZone?.id) {
        await persistAllowedZoneForSelectedEmployee(savedZone.id);
      }

      resetWorkZoneForm();
      toast.success(
        editingWorkZoneId
          ? "تم تحديث نطاق الدوام."
          : "تم إنشاء نطاق الدوام وتحديده للموظف."
      );
    } catch (error) {
      console.error("employee_work_zone_save_failed", error);
      toast.error("تعذر حفظ نطاق الدوام.");
    } finally {
      setCreatingWorkZone(false);
    }
  };

  const handleReset = () => {
    setForm(initialForm);
    setSalaryDeductions(initialSalaryDeductions);
  };

  const handleSalaryDeductionChange = (
    deductionId: string,
    key: "title" | "amount",
    value: string
  ) => {
    setSalaryDeductions(current =>
      current.map(item =>
        item.id === deductionId
          ? {
              ...item,
              [key]: value,
            }
          : item
      )
    );
  };

  const handleAddSalaryDeduction = () => {
    setSalaryDeductions(current => [...current, createEmptySalaryDeduction()]);
  };

  const handleRemoveSalaryDeduction = (deductionId: string) => {
    setSalaryDeductions(current =>
      current.filter(item => item.id !== deductionId)
    );
  };

  const handleAbsenceFormChange = <K extends keyof EmployeeAbsenceFormValues>(
    key: K,
    value: EmployeeAbsenceFormValues[K]
  ) => {
    setAbsenceForm(current => ({
      ...current,
      [key]: value,
    }));
  };

  const handleCreateEmployeeAbsence = async () => {
    if (!selectedEmployee || !selectedEmployeeDocumentId) return;
    if (!canManageEmployees) {
      toast.error("لا تملك صلاحية تسجيل غياب الموظفين.");
      return;
    }

    const normalizedDate = String(absenceForm.date || "").trim();
    const normalizedType = String(absenceForm.type || "")
      .trim()
      .toLowerCase();

    if (!isValidEmployeeAbsenceDate(normalizedDate)) {
      toast.error("اختر تاريخ غياب صالحًا.");
      return;
    }

    if (!["full_day", "half_day"].includes(normalizedType)) {
      toast.error("اختر نوع الغياب.");
      return;
    }

    setSavingAbsence(true);
    try {
      const absenceRef = doc(collection(db, EMPLOYEE_ABSENCES_COLLECTION));
      await setDoc(absenceRef, {
        ...buildEmployeeAbsencePayload({
          employeeId: selectedEmployeeDocumentId,
          employeeUid: selectedEmployeeAuthUid || selectedEmployee.id,
          date: normalizedDate,
          type: normalizedType as EmployeeAbsenceType,
          note: absenceForm.note,
          createdByUid: user?.uid || "",
        }),
        createdAt: serverTimestamp(),
      });

      try {
        await logAuditEvent({
          action: "employee_absence_created",
          category: "user",
          entityType: "employee_absence",
          entityId: absenceRef.id,
          entityPath: absenceRef.path,
          relatedIds: { userId: selectedEmployee.id },
          source: buildAuditSource({
            area: "hr",
            page: "Employees",
            method: "create_employee_absence",
          }),
          message: `Recorded absence for ${selectedEmployeeLabel}`,
          meta: {
            employeeId: selectedEmployeeDocumentId,
            employeeUid: selectedEmployeeAuthUid || selectedEmployee.id,
            date: normalizedDate,
            type: normalizedType,
            note: String(absenceForm.note || "").trim() || null,
          },
        });
      } catch (auditError) {
        console.error("employee_absence_audit_failed", auditError);
      }

      setAbsenceForm(buildEmployeeAbsenceFormValues());
      toast.success("تم تسجيل الغياب بنجاح.");
    } catch (error) {
      console.error("employee_absence_create_failed", error);
      toast.error("تعذر تسجيل الغياب.");
    } finally {
      setSavingAbsence(false);
    }
  };

  const handleDeleteEmployeeAbsence = async (
    absence: EmployeeAbsenceRecord
  ) => {
    if (!selectedEmployee || !selectedEmployeeDocumentId) return;
    if (!canManageEmployees) {
      toast.error("لا تملك صلاحية حذف غياب الموظفين.");
      return;
    }

    const confirmed = window.confirm(
      `سيتم حذف غياب ${formatEmployeeAbsenceDate(absence.date)} من سجل الموظف. هل تريد المتابعة؟`
    );
    if (!confirmed) return;

    setDeletingAbsenceId(absence.id);
    try {
      await auditedDeleteDoc({
        ref: doc(db, EMPLOYEE_ABSENCES_COLLECTION, absence.id),
        action: "employee_absence_deleted",
        category: "user",
        entityType: "employee_absence",
        source: buildAuditSource({
          area: "hr",
          page: "Employees",
          method: "delete_employee_absence",
        }),
        relatedIds: {
          userId: selectedEmployee.id,
        },
        message: `Deleted employee absence for ${selectedEmployeeLabel}`,
        meta: {
          employeeId: absence.employeeId,
          employeeUid: absence.employeeUid,
          date: absence.date,
          type: absence.type,
          note: absence.note || null,
          reason: "excuse_provided",
        },
      });

      toast.success("تم حذف الغياب من سجل الموظف.");
    } catch (error) {
      console.error("employee_absence_delete_failed", error);
      toast.error("تعذر حذف الغياب.");
    } finally {
      setDeletingAbsenceId(current =>
        current === absence.id ? null : current
      );
    }
  };

  const handleCreatePayrollRecord = async () => {
    if (!selectedEmployee || !selectedEmployeeDocumentId) return;
    if (!canManageEmployees) {
      toast.error("لا تملك صلاحية إنشاء سجل راتب نهاية الشهر.");
      return;
    }

    if (isDirty) {
      toast.error("احفظ بيانات الراتب أولًا قبل إنشاء سجل نهاية الشهر.");
      return;
    }

    if (!selectedPayrollMonthMeta) {
      toast.error("اختر شهرًا صالحًا لإنشاء سجل الراتب.");
      return;
    }

    const payrollCalculationDate = getRiyadhTodayDateKey();
    setPayrollCalculationDateKey(payrollCalculationDate);
    const activePayrollCalculationRange = buildPayrollCalculationRange(
      selectedPayrollMonthMeta,
      payrollCalculationDate
    );

    if (activePayrollCalculationRange?.isFutureMonth) {
      toast.error("لا يمكن احتساب الحضور لشهر مستقبلي.");
      return;
    }

    if (selectedPayrollRecord) {
      toast.error("يوجد سجل راتب محفوظ لهذا الشهر بالفعل.");
      return;
    }

    const baseSalary = toNullableNumber(form.baseSalary);
    const expectedWorkDays = toNullableNumber(form.expectedWorkDays);
    const expectedWorkHours = toNullableNumber(form.expectedWorkHours);
    const actualWorkedHours = toNullableNumber(form.actualWorkedHours);
    const overtimeHourlyRate = toNullableNumber(form.overtimeHourlyRate);
    const insuranceDeduction = toNullableNumber(form.insuranceDeduction);
    const housingAllowance = toNullableNumber(form.housingAllowance);
    const transportationAllowance = toNullableNumber(
      form.transportationAllowance
    );
    const otherAllowances = toNullableNumber(form.otherAllowances);
    const allowances = [
      housingAllowance,
      transportationAllowance,
      otherAllowances,
    ]
      .filter((value): value is number => typeof value === "number")
      .reduce((sum, value) => sum + value, 0);
    const scheduleSnapshot = {
      startTime: selectedEmployeeShiftSchedule.startTime,
      endTime: selectedEmployeeShiftSchedule.endTime,
      weeklyOffDays: selectedEmployeeShiftSchedule.weeklyOffDays,
    };
    const payrollCalculationStartDate =
      activePayrollCalculationRange?.calculationStartDate ||
      selectedPayrollMonthMeta.monthStart;
    const payrollCalculationEndDate =
      activePayrollCalculationRange?.calculationEndDate ||
      selectedPayrollMonthMeta.monthEnd;
    if (baseSalary === null || baseSalary <= 0) {
      toast.error("يجب إدخال الراتب الأساسي أولًا.");
      return;
    }

    if (!scheduleSnapshot.startTime || !scheduleSnapshot.endTime) {
      toast.error(
        "يجب تحديد وقت الدوام من بيانات الموظف قبل الاحتساب من الحضور"
      );
      return;
    }

    if (!selectedEmployeeAuthUid) {
      toast.error("لا يوجد معرف حضور مرتبط بالموظف.");
      return;
    }

    if (
      payrollMudadDocument &&
      !isSupportedMudadPayrollDocument(payrollMudadDocument)
    ) {
      toast.error("الصيغ المدعومة لمستند مدد هي PDF أو PNG أو JPG فقط.");
      return;
    }

    setCreatingPayrollRecord(true);
    try {
      const absencesSnapshot = await getDocs(
        query(
          collection(db, EMPLOYEE_ABSENCES_COLLECTION),
          where("employeeId", "==", selectedEmployeeDocumentId)
        )
      );

      const monthlyAbsences = sortEmployeeAbsences(
        absencesSnapshot.docs.map(docSnapshot =>
          normalizeEmployeeAbsence(
            docSnapshot.id,
            (docSnapshot.data() as Record<string, any>) || {}
          )
        )
      ).filter(
        absence =>
          absence.date >= payrollCalculationStartDate &&
          absence.date <= payrollCalculationEndDate
      );

      const normalizedSalaryDeductions =
        normalizeSalaryDeductionsForPersistence(salaryDeductions);
      const attendanceSummary = await buildAttendancePayrollSummary(
        activePayrollCalculationRange,
        payrollCalculationDate,
        monthlyAbsences.map(absence => absence.date)
      );
      if (attendanceSummary) {
        setAttendancePayrollSummary(attendanceSummary);
      }
      const effectiveExpectedWorkHours =
        payrollRateWorkHours || expectedWorkHours;
      const effectiveAttendanceExpectedHours =
        attendanceSummary?.expectedHours ?? 0;
      const effectiveActualWorkedHours =
        attendanceSummary?.actualHours ?? actualWorkedHours;
      const effectiveAttendanceAbsentDays = attendanceSummary?.absentDays ?? 0;
      const attendanceAbsentDateKeys = new Set(
        attendanceSummary?.absentDateKeys || []
      );
      const payrollAbsences = monthlyAbsences.filter(
        absence => !attendanceAbsentDateKeys.has(absence.date)
      );
      const effectiveExpectedWorkDays =
        payrollExpectedWorkDaysNumber || expectedWorkDays;
      const payrollComputation = computeEmployeePayroll({
        baseSalary,
        allowances,
        expectedWorkDays: effectiveExpectedWorkDays,
        expectedWorkHours: effectiveExpectedWorkHours,
        attendanceExpectedHours: effectiveAttendanceExpectedHours,
        attendanceAbsentDays: effectiveAttendanceAbsentDays,
        attendanceMissingHours: attendanceSummary?.missingHours ?? 0,
        attendanceOvertimeHours: attendanceSummary?.overtimeHours ?? 0,
        actualWorkedHours: effectiveActualWorkedHours,
        overtimeHourlyRate,
        insuranceDeduction,
        salaryDeductions: normalizedSalaryDeductions,
        absences: payrollAbsences,
      });
      const combinedAbsenceDays =
        payrollComputation.absenceDays +
        payrollComputation.attendanceAbsentDays;
      const combinedAbsenceDeduction =
        payrollComputation.absenceDeduction +
        payrollComputation.attendanceAbsenceDeduction;

      const payrollRef = doc(
        db,
        EMPLOYEE_PAYROLL_RECORDS_COLLECTION,
        buildEmployeePayrollRecordId(
          selectedEmployeeDocumentId,
          selectedPayrollMonthMeta.payrollMonth
        )
      );
      const uploadedMudadDocument = payrollMudadDocument
        ? await uploadDocumentToCloudflare({
            entityType: "employee_payroll_record",
            entityId: payrollRef.id,
            category: "employee_payroll_mudad_document",
            file: payrollMudadDocument,
            kind: "attachment",
            uploadedBy: user?.uid || undefined,
            storageFolder: "mudad_documents",
          })
        : null;
      const mudadDocumentPayload = uploadedMudadDocument
        ? {
            id: uploadedMudadDocument.id,
            fileName: uploadedMudadDocument.fileName,
            filePath: uploadedMudadDocument.filePath,
            fileUrl:
              uploadedMudadDocument.fileUrl ||
              buildR2DownloadUrl(uploadedMudadDocument.filePath, false),
            contentType: uploadedMudadDocument.contentType || null,
            fileSize: uploadedMudadDocument.fileSize,
            uploadedAt: uploadedMudadDocument.uploadedAt,
            uploadedBy: user?.uid || null,
          }
        : null;

      await runTransaction(db, async tx => {
        const existingRecord = await tx.get(payrollRef);
        if (existingRecord.exists()) {
          throw new Error("payroll_record_exists");
        }

        tx.set(payrollRef, {
          employeeId: selectedEmployeeDocumentId,
          employeeUid: selectedEmployeeAuthUid || selectedEmployee.id,
          payrollMonth: selectedPayrollMonthMeta.payrollMonth,
          monthStart: selectedPayrollMonthMeta.monthStart,
          monthEnd: selectedPayrollMonthMeta.monthEnd,
          calculationStartDate: payrollCalculationStartDate,
          calculationEndDate: payrollCalculationEndDate,
          baseSalary: payrollComputation.baseSalary,
          allowances: payrollComputation.allowances,
          housingAllowance,
          transportationAllowance,
          otherAllowances,
          absenceDays: combinedAbsenceDays,
          absenceDeduction: combinedAbsenceDeduction,
          delayDeduction: payrollComputation.delayDeduction,
          overtimeBonus: payrollComputation.overtimeBonus,
          insuranceDeduction: payrollComputation.insuranceDeduction,
          salaryDeductions: normalizedSalaryDeductions,
          totalSalaryDeductions: payrollComputation.totalSalaryDeductions,
          expectedWorkHours: effectiveExpectedWorkHours,
          actualWorkedHours: effectiveActualWorkedHours,
          attendanceLateHours: attendanceSummary?.lateHours ?? null,
          attendanceMissingHours: attendanceSummary?.missingHours ?? null,
          attendanceOvertimeHours: attendanceSummary?.overtimeHours ?? null,
          attendanceCompleteDays: attendanceSummary?.completeDays ?? null,
          attendanceIncompleteDays: attendanceSummary?.incompleteDays ?? null,
          attendanceAbsentDays: payrollComputation.attendanceAbsentDays,
          attendanceAbsenceDeduction:
            payrollComputation.attendanceAbsenceDeduction,
          scheduleSnapshot,
          absenceCount: payrollAbsences.length,
          absenceEntriesSummary: payrollAbsences.map(absence => ({
            date: absence.date,
            type: absence.type,
          })),
          finalSalary: payrollComputation.finalSalary,
          mudadDocument: mudadDocumentPayload,
          createdAt: serverTimestamp(),
          createdByUid: user?.uid || null,
          createdByEmail: user?.email || null,
        });
      });

      try {
        await logAuditEvent({
          action: "employee_payroll_record_created",
          category: "finance",
          entityType: "employee_payroll_record",
          entityId: payrollRef.id,
          entityPath: payrollRef.path,
          relatedIds: { userId: selectedEmployee.id },
          source: buildAuditSource({
            area: "hr",
            page: "Employees",
            method: "create_employee_payroll_record",
          }),
          message: `Created payroll record for ${selectedEmployeeLabel}`,
          meta: {
            employeeId: selectedEmployeeDocumentId,
            employeeUid: selectedEmployeeAuthUid || selectedEmployee.id,
            payrollMonth: selectedPayrollMonthMeta.payrollMonth,
            baseSalary: payrollComputation.baseSalary,
            allowances: payrollComputation.allowances,
            housingAllowance,
            transportationAllowance,
            otherAllowances,
            absenceDays: combinedAbsenceDays,
            absenceDeduction: combinedAbsenceDeduction,
            delayDeduction: payrollComputation.delayDeduction,
            overtimeBonus: payrollComputation.overtimeBonus,
            totalSalaryDeductions: payrollComputation.totalSalaryDeductions,
            finalSalary: payrollComputation.finalSalary,
            scheduleSnapshot,
            mudadDocument: mudadDocumentPayload
              ? {
                  id: mudadDocumentPayload.id,
                  fileName: mudadDocumentPayload.fileName,
                  filePath: mudadDocumentPayload.filePath,
                  contentType: mudadDocumentPayload.contentType,
                  fileSize: mudadDocumentPayload.fileSize,
                }
              : null,
          },
        });
      } catch (auditError) {
        console.error("employee_payroll_record_audit_failed", auditError);
      }

      toast.success(
        `تم إنشاء سجل راتب ${selectedPayrollMonthMeta.label} بنجاح.`
      );
      resetPayrollMudadDocument();
    } catch (error) {
      console.error("employee_payroll_record_create_failed", error);

      if (error instanceof Error && error.message === "payroll_record_exists") {
        toast.error("يوجد سجل راتب محفوظ لهذا الشهر بالفعل.");
      } else {
        toast.error("تعذر إنشاء سجل راتب نهاية الشهر.");
      }
    } finally {
      setCreatingPayrollRecord(false);
    }
  };

  const handleEmployeeFileFormChange = <
    K extends keyof Omit<EmployeeFileFormValues, "file">,
  >(
    key: K,
    value: EmployeeFileFormValues[K]
  ) => {
    setEmployeeFileForm(current => ({
      ...current,
      [key]: value,
    }));
  };

  const handleEmployeeFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setEmployeeFileForm(current => ({
      ...current,
      file,
    }));
  };

  const handlePayrollMudadDocumentSelected = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0] || null;
    if (file && !isSupportedMudadPayrollDocument(file)) {
      toast.error("الصيغ المدعومة لمستند مدد هي PDF أو PNG أو JPG فقط.");
      resetPayrollMudadDocument();
      return;
    }

    setPayrollMudadDocument(file);
  };

  const handlePayrollMudadDocumentDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!canManageEmployees || creatingPayrollRecord) return;

    const file = event.dataTransfer.files?.[0] || null;
    if (!file) return;

    if (!isSupportedMudadPayrollDocument(file)) {
      toast.error("الصيغ المدعومة لمستند مدد هي PDF أو PNG أو JPG فقط.");
      return;
    }

    setPayrollMudadDocument(file);
    if (payrollMudadDocumentInputRef.current) {
      payrollMudadDocumentInputRef.current.value = "";
    }
  };

  const handleEmployeeFileDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!canManageEmployees || uploadingEmployeeFile) return;

    const file = event.dataTransfer.files?.[0] || null;
    if (!file) return;

    setEmployeeFileForm(current => ({
      ...current,
      file,
    }));

    if (employeeFileInputRef.current) {
      employeeFileInputRef.current.value = "";
    }
  };

  const handleOfficialDocumentFormChange = <
    K extends keyof Omit<EmployeeFileFormValues, "file">,
  >(
    key: K,
    value: EmployeeFileFormValues[K]
  ) => {
    setOfficialDocumentForm(current => ({
      ...current,
      [key]: value,
    }));
  };

  const handleOfficialDocumentSelected = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0] || null;
    setOfficialDocumentForm(current => ({
      ...current,
      file,
    }));
  };

  const handleOfficialDocumentDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!canManageEmployees || uploadingOfficialDocument) return;

    const file = event.dataTransfer.files?.[0] || null;
    if (!file) return;

    setOfficialDocumentForm(current => ({
      ...current,
      file,
    }));

    if (officialDocumentInputRef.current) {
      officialDocumentInputRef.current.value = "";
    }
  };

  const handleEmployeeAvatarSelected = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";

    if (!file) return;

    try {
      validateEmployeeAvatarFile(file);
      const draft = await createEmployeeAvatarCropDraft(file);
      setEmployeeAvatarCropDraft(draft);
      setEmployeeAvatarCropZoom(1);
      setEmployeeAvatarCropPosition({ x: 0, y: 0 });
      setEmployeeAvatarCropOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ملف الصورة غير صالح."
      );
    }
  };

  const handleEmployeeAvatarDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!canManageEmployees || uploadingEmployeeAvatar) return;

    const file = event.dataTransfer.files?.[0] || null;
    if (!file) return;

    try {
      validateEmployeeAvatarFile(file);
      const draft = await createEmployeeAvatarCropDraft(file);
      setEmployeeAvatarCropDraft(draft);
      setEmployeeAvatarCropZoom(1);
      setEmployeeAvatarCropPosition({ x: 0, y: 0 });
      setEmployeeAvatarCropOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ملف الصورة غير صالح."
      );
    }
  };

  const handleEmployeeAvatarCropPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (!employeeAvatarCropMetrics) return;

    event.preventDefault();
    employeeAvatarCropDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: employeeAvatarCropPosition.x,
      originY: employeeAvatarCropPosition.y,
    };
    setEmployeeAvatarCropDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleEmployeeAvatarCropPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    const activeDrag = employeeAvatarCropDragRef.current;
    if (
      !activeDrag ||
      activeDrag.pointerId !== event.pointerId ||
      !employeeAvatarCropMetrics
    ) {
      return;
    }

    setEmployeeAvatarCropPosition(
      clampEmployeeAvatarCropPosition(
        {
          x: activeDrag.originX + (event.clientX - activeDrag.startX),
          y: activeDrag.originY + (event.clientY - activeDrag.startY),
        },
        employeeAvatarCropMetrics
      )
    );
  };

  const handleEmployeeAvatarCropPointerEnd = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (employeeAvatarCropDragRef.current?.pointerId !== event.pointerId)
      return;

    employeeAvatarCropDragRef.current = null;
    setEmployeeAvatarCropDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleEmployeeAvatarCropZoomStep = (direction: "in" | "out") => {
    setEmployeeAvatarCropZoom(current =>
      clampNumber(
        current + (direction === "in" ? 0.15 : -0.15),
        EMPLOYEE_AVATAR_CROP_MIN_ZOOM,
        EMPLOYEE_AVATAR_CROP_MAX_ZOOM
      )
    );
  };

  const handleConfirmEmployeeAvatarCrop = async () => {
    if (
      !employeeAvatarCropDraft ||
      !selectedEmployee ||
      !selectedEmployeeProfile ||
      !user?.uid
    ) {
      return;
    }

    if (!canManageEmployees) {
      toast.error("لا تملك صلاحية رفع صورة الموظف.");
      return;
    }

    const employeeUid = selectedEmployeeAuthUid || selectedEmployee.id;
    const employeeId =
      String(selectedEmployee.linkedEmployeeId || "").trim() ||
      selectedEmployee.id;

    if (!employeeUid) {
      toast.error("تعذر تحديد الموظف المستهدف.");
      return;
    }

    setUploadingEmployeeAvatar(true);
    try {
      const croppedFile = await buildEmployeeCroppedAvatarFile({
        draft: employeeAvatarCropDraft,
        viewportSize: employeeAvatarCropViewportSize,
        zoom: employeeAvatarCropZoom,
        position: employeeAvatarCropPosition,
      });

      const uploaded = await uploadDocumentToCloudflare({
        entityType: "employee",
        entityId: employeeId,
        category: EMPLOYEE_AVATAR_CATEGORY,
        file: croppedFile,
        kind: "attachment",
        uploadedBy: user.uid,
        storageFolder: "profile_avatar",
      });

      const avatarPayload: EmployeeAvatarDoc = {
        id: uploaded.id,
        fileName: uploaded.fileName,
        filePath: uploaded.filePath,
        fileUrl:
          uploaded.fileUrl || buildR2DownloadUrl(uploaded.filePath, false),
        contentType: uploaded.contentType || null,
        fileSize: uploaded.fileSize,
        uploadedAt: uploaded.uploadedAt,
      };

      const userRef = doc(db, "users", selectedEmployee.id);
      const employeeRef = selectedEmployee.linkedEmployeeId
        ? doc(db, "employees", selectedEmployee.linkedEmployeeId)
        : null;

      await setDoc(
        userRef,
        {
          ...buildEmployeeAvatarPatch(avatarPayload),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (employeeRef) {
        await setDoc(
          employeeRef,
          {
            ...buildEmployeeAvatarPatch(avatarPayload),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      const currentAuthUser = auth.currentUser;
      if (
        currentAuthUser &&
        (currentAuthUser.uid === selectedEmployee.id ||
          currentAuthUser.uid === selectedEmployeeAuthUid)
      ) {
        try {
          await updateProfile(currentAuthUser, {
            photoURL: avatarPayload.fileUrl || null,
          });
        } catch (profileUpdateError) {
          console.error(
            "employee_avatar_auth_profile_update_failed",
            profileUpdateError
          );
        }
      }

      toast.success("تم تحديث صورة الموظف.");
      resetEmployeeAvatarForm();
    } catch (error) {
      console.error("employee_avatar_admin_upload_failed", error);
      toast.error("تعذر رفع صورة الموظف.");
    } finally {
      setUploadingEmployeeAvatar(false);
    }
  };

  const handleEmployeeMessageFormChange = <
    K extends keyof EmployeeMessageFormValues,
  >(
    key: K,
    value: EmployeeMessageFormValues[K]
  ) => {
    setEmployeeMessageForm(current => ({
      ...current,
      [key]: value,
    }));
  };

  const markEmployeeConversationAsRead = async (
    conversation: EmployeeMessageConversationRecord
  ) => {
    if (!user?.uid || !canManageEmployees) return;

    const unreadIncomingMessages = conversation.messages.filter(
      message => message.toUserId === user.uid && !message.isRead
    );
    if (!unreadIncomingMessages.length) return;

    setOpeningEmployeeConversationId(conversation.id);
    try {
      const batch = writeBatch(db);
      unreadIncomingMessages.forEach(message => {
        batch.update(doc(db, EMPLOYEE_MESSAGES_COLLECTION, message.id), {
          isRead: true,
          readAt: serverTimestamp(),
          status: "read",
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    } catch (error) {
      console.error("employee_conversation_mark_read_failed", error);
    } finally {
      setOpeningEmployeeConversationId(current =>
        current === conversation.id ? null : current
      );
    }
  };

  useEffect(() => {
    if (!activeEmployeeConversation) return;
    void markEmployeeConversationAsRead(activeEmployeeConversation);
  }, [activeEmployeeConversation, canManageEmployees, user?.uid]);

  const handleSelectEmployeeConversation = (
    conversation: EmployeeMessageConversationRecord
  ) => {
    if (activeEmployeeConversationId === conversation.id) {
      setActiveEmployeeConversationId(null);
      return;
    }

    setActiveEmployeeConversationId(conversation.id);
    setComposeEmployeeMessageAsNew(false);
    void markEmployeeConversationAsRead(conversation);
  };

  const handleCloseEmployeeConversation = () => {
    setActiveEmployeeConversationId(null);
  };

  const handleSendEmployeeMessage = async () => {
    if (
      !selectedEmployee ||
      !selectedEmployeeProfile ||
      !selectedEmployeeAuthUid
    )
      return;
    if (!user?.uid) return;
    if (!canManageEmployees) {
      toast.error("لا تملك صلاحية إرسال رسائل داخلية للموظفين.");
      return;
    }

    const normalizedMessage = employeeMessageForm.message.trim();
    const normalizedType = (String(employeeMessageForm.type || "message")
      .trim()
      .toLowerCase() || "message") as EmployeeMessageType;

    if (!normalizedMessage) {
      toast.error("اكتب نص الرسالة أولًا.");
      return;
    }

    setSendingEmployeeMessage(true);
    try {
      const messageRef = doc(collection(db, EMPLOYEE_MESSAGES_COLLECTION));
      const isReply = Boolean(
        activeEmployeeConversation && !composeEmployeeMessageAsNew
      );
      const parentMessage = isReply
        ? activeEmployeeConversation?.messages[
            activeEmployeeConversation.messages.length - 1
          ] || null
        : null;
      const conversationId = isReply
        ? activeEmployeeConversation?.conversationId || messageRef.id
        : messageRef.id;
      const employeeDisplayName =
        selectedEmployeeLabel !== EMPLOYEE_EMPTY_VALUE
          ? selectedEmployeeLabel
          : selectedEmployee.displayName ||
            selectedEmployee.name ||
            selectedEmployee.email ||
            "الموظف";
      const senderDisplayName = user?.displayName || user?.email || "HR";

      await setDoc(messageRef, {
        employeeId: selectedEmployee.id,
        employeeUid: selectedEmployeeAuthUid,
        conversationId,
        threadId: conversationId,
        senderUid: user.uid,
        senderRole: "hr",
        recipientUid: selectedEmployeeAuthUid,
        messageType: normalizedType,
        body: normalizedMessage,
        status: "sent",
        fromUserId: user.uid,
        fromUserName: senderDisplayName,
        toUserId: selectedEmployeeAuthUid,
        toUserName: employeeDisplayName,
        message: normalizedMessage,
        type: normalizedType,
        relatedTo: parentMessage ? "employee_message" : null,
        relatedId: parentMessage?.id || null,
        createdAt: serverTimestamp(),
        isRead: false,
        readAt: null,
        updatedAt: serverTimestamp(),
      } satisfies EmployeeMessageDoc);

      let notificationFailed = false;
      try {
        await createInAppNotification({
          userId: selectedEmployeeAuthUid,
          title:
            normalizedType === "notice"
              ? "تنبيه جديد من HR"
              : normalizedType === "system"
                ? "إشعار داخلي جديد"
                : "رسالة جديدة من HR",
          body: normalizedMessage,
          type: "message",
          relatedId: messageRef.id,
          relatedTo: "employee_message",
          relatedPath: `/hr/messages?messageId=${messageRef.id}`,
        });
      } catch (notificationError) {
        notificationFailed = true;
        console.error(
          "employee_message_notification_failed",
          notificationError
        );
      }

      setActiveEmployeeConversationId(conversationId);
      setComposeEmployeeMessageAsNew(false);
      resetEmployeeMessageForm();
      toast.success(
        notificationFailed
          ? "تم إرسال الرسالة لكن تعذر إنشاء التنبيه الداخلي."
          : "تم إرسال الرسالة الداخلية."
      );
    } catch (error) {
      console.error("employee_message_send_failed", error);
      toast.error("تعذر إرسال الرسالة الداخلية.");
    } finally {
      setSendingEmployeeMessage(false);
    }
  };

  const handleStartEmployeeFileReplacement = (file: EmployeeFileRecord) => {
    setReplacingEmployeeFileId(file.id);
    setEmployeeFileForm({
      title: file.title,
      description: file.description || "",
      fileType: file.fileType || EMPLOYEE_DEFAULT_FILE_TYPE,
      file: null,
    });

    if (employeeFileInputRef.current) {
      employeeFileInputRef.current.value = "";
      employeeFileInputRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  };

  const handleUploadOfficialDocument = async () => {
    if (!selectedEmployee || !selectedEmployeeProfile) return;
    if (!canManageEmployees) {
      toast.error("لا تملك صلاحية رفع المستندات الرسمية.");
      return;
    }

    const selectedFile = officialDocumentForm.file;
    const normalizedTitle = officialDocumentForm.title.trim();
    const normalizedDescription = officialDocumentForm.description.trim();
    const normalizedFileType =
      String(officialDocumentForm.fileType || "contract").trim() || "contract";

    if (!selectedFile) {
      toast.error("اختر ملفًا قبل الرفع.");
      return;
    }

    if (!normalizedTitle) {
      toast.error("أدخل عنوان المستند أولًا.");
      return;
    }

    const employeeUid = selectedEmployeeAuthUid || selectedEmployee.id;
    const employeeId =
      String(selectedEmployee.linkedEmployeeId || "").trim() ||
      selectedEmployee.id;

    if (!employeeUid) {
      toast.error("تعذر تحديد الموظف المستهدف.");
      return;
    }

    setUploadingOfficialDocument(true);

    try {
      const uploaded = await uploadDocumentToCloudflare({
        entityType: "employee",
        entityId: employeeId,
        category: EMPLOYEE_FILE_CATEGORY,
        file: selectedFile,
        kind: "attachment",
        uploadedBy: user?.uid || undefined,
        storageFolder: "official_documents",
      });

      const fileRef = doc(collection(db, EMPLOYEE_FILES_COLLECTION));
      const uploadedByName = user?.displayName || user?.email || "HR";
      const replacedCandidates = employeeOfficialFiles.filter(file => {
        if (!file.active) return false;
        return matchesEmployeeFileVersion(
          file,
          normalizedTitle,
          normalizedFileType
        );
      });

      const fileDoc: EmployeeFileDoc = {
        employeeId,
        employeeUid,
        userId: selectedEmployee.id,
        employeeName:
          selectedEmployeeLabel !== EMPLOYEE_EMPTY_VALUE
            ? selectedEmployeeLabel
            : selectedEmployee.displayName ||
              selectedEmployee.name ||
              selectedEmployee.email ||
              null,
        title: normalizedTitle,
        description: normalizedDescription || null,
        fileType: normalizedFileType,
        fileId: uploaded.id,
        fileName: uploaded.fileName,
        filePath: uploaded.filePath,
        fileUrl: uploaded.fileUrl,
        storageKey: uploaded.filePath,
        contentType: uploaded.contentType || null,
        mimeType: uploaded.contentType || null,
        fileSize: uploaded.fileSize,
        category: uploaded.category || EMPLOYEE_FILE_CATEGORY,
        officialDocument: true,
        uploadedBy: user?.uid || null,
        uploadedByName,
        createdAt: uploaded.uploadedAt,
        uploadedAt: uploaded.uploadedAt,
        status: "active",
        active: true,
        replacedAt: null,
        replacedBy: null,
        replacedByName: null,
        replacedByFileId: null,
        replacesFileId: replacedCandidates[0]?.id || null,
        isRead: false,
        readAt: null,
        updatedAt: serverTimestamp(),
      };

      await runTransaction(db, async tx => {
        replacedCandidates.forEach(file => {
          tx.update(doc(db, EMPLOYEE_FILES_COLLECTION, file.id), {
            status: "replaced",
            active: false,
            replacedAt: serverTimestamp(),
            replacedBy: user?.uid || null,
            replacedByName: uploadedByName,
            replacedByFileId: fileRef.id,
            updatedAt: serverTimestamp(),
          });
        });

        tx.set(fileRef, fileDoc);
      });

      await logAuditEvent({
        action: replacedCandidates.length
          ? "employee_file_replaced"
          : "employee_file_uploaded",
        category: "user",
        entityType: "employee_file",
        entityId: fileRef.id,
        entityPath: fileRef.path,
        source: buildAuditSource({
          area: "hr",
          page: "Employees",
          method: "upload_official_employee_document",
        }),
        relatedIds: {
          userId: selectedEmployee.id,
        },
        message: replacedCandidates.length
          ? `Replaced official employee document for ${selectedEmployeeLabel}`
          : `Uploaded official employee document for ${selectedEmployeeLabel}`,
        meta: {
          employeeId,
          employeeUid,
          employeeName: fileDoc.employeeName || null,
          title: normalizedTitle,
          description: normalizedDescription || null,
          fileName: uploaded.fileName,
          fileType: normalizedFileType,
          contentType: uploaded.contentType || null,
          fileSize: uploaded.fileSize,
          officialDocument: true,
          replacedFileIds: replacedCandidates.map(file => file.id),
        },
      });

      try {
        await createInAppNotification({
          userId: employeeUid,
          title: replacedCandidates.length
            ? "تم تحديث مستند رسمي في ملفك الوظيفي"
            : "تمت إضافة مستند رسمي إلى ملفك الوظيفي",
          body: replacedCandidates.length
            ? `تم تحديث "${normalizedTitle}" داخل ملفك الوظيفي.`
            : `تمت إضافة "${normalizedTitle}" إلى ملفك الوظيفي.`,
          type: "file",
          relatedId: fileRef.id,
          relatedTo: "employee_file",
          relatedPath: "/hr/profile",
        });
      } catch (notificationError) {
        console.error(
          "official_employee_document_notification_failed",
          notificationError
        );
      }

      resetOfficialDocumentForm();

      toast.success(
        replacedCandidates.length
          ? "تم استبدال المستند الرسمي بنجاح."
          : "تم رفع المستند الرسمي بنجاح."
      );
    } catch (error) {
      console.error("official_employee_document_upload_failed", error);
      toast.error("تعذر رفع المستند الرسمي.");
    } finally {
      setUploadingOfficialDocument(false);
    }
  };

  const handleDeleteEmployeeFile = async (file: EmployeeFileRecord) => {
    if (!selectedEmployee || !selectedEmployeeProfile) return;
    if (!canManageEmployees) {
      toast.error("لا تملك صلاحية حذف ملفات الموظفين.");
      return;
    }

    const confirmed = window.confirm(
      `سيتم حذف "${file.title}" من سجل الموظف. هل تريد المتابعة؟`
    );
    if (!confirmed) return;

    setDeletingEmployeeFileId(file.id);
    try {
      // The current Cloudflare Worker does not expose a delete endpoint for R2 objects.
      // This action removes only the Firestore employee_files record.
      await auditedDeleteDoc({
        ref: doc(db, EMPLOYEE_FILES_COLLECTION, file.id),
        action: "employee_file_deleted",
        category: "user",
        entityType: "employee_file",
        source: buildAuditSource({
          area: "hr",
          page: "Employees",
          method: "delete_employee_file",
        }),
        relatedIds: {
          userId: selectedEmployee.id,
        },
        message: `Deleted employee file for ${selectedEmployeeLabel}`,
        meta: {
          employeeId: file.employeeId,
          employeeUid: file.employeeUid,
          employeeName: file.employeeName || null,
          title: file.title,
          fileName: file.fileName,
          fileType: file.fileType || EMPLOYEE_DEFAULT_FILE_TYPE,
          storageCleanupSupported: false,
        },
      });

      if (replacingEmployeeFileId === file.id) {
        resetEmployeeFileForm();
      }

      toast.success("تم حذف الملف من سجل الموظف.");
    } catch (error) {
      console.error("employee_file_delete_failed", error);
      toast.error("تعذر حذف ملف الموظف.");
    } finally {
      setDeletingEmployeeFileId(current =>
        current === file.id ? null : current
      );
    }
  };

  const handleUploadEmployeeFile = async () => {
    if (!selectedEmployee || !selectedEmployeeProfile) return;
    if (!canManageEmployees) {
      toast.error("لا تملك صلاحية رفع ملفات الموظفين.");
      return;
    }

    const selectedFile = employeeFileForm.file;
    const normalizedTitle = employeeFileForm.title.trim();
    const normalizedDescription = employeeFileForm.description.trim();
    const normalizedFileType =
      String(employeeFileForm.fileType || EMPLOYEE_DEFAULT_FILE_TYPE).trim() ||
      EMPLOYEE_DEFAULT_FILE_TYPE;
    const employeeUid = selectedEmployeeAuthUid || selectedEmployee.id;
    const employeeId =
      String(selectedEmployee.linkedEmployeeId || "").trim() ||
      selectedEmployee.id;

    if (!employeeUid) {
      toast.error("تعذر تحديد الموظف المستهدف لرفع الملف.");
      return;
    }

    if (!normalizedTitle) {
      toast.error("أدخل عنوان الملف أولاً.");
      return;
    }

    if (!selectedFile) {
      toast.error("اختر ملفًا قبل الرفع.");
      return;
    }

    setUploadingEmployeeFile(true);
    try {
      const uploaded = await uploadDocumentToCloudflare({
        entityType: "employee",
        entityId: employeeId,
        category: EMPLOYEE_FILE_CATEGORY,
        file: selectedFile,
        kind: "attachment",
        uploadedBy: user?.uid || undefined,
        storageFolder: "internal_files",
      });

      const fileRef = doc(collection(db, EMPLOYEE_FILES_COLLECTION));
      const uploadedByName = user?.displayName || user?.email || "HR";
      const replacedCandidates = employeeFiles.filter(file => {
        if (!file.active) return false;
        if (replacingEmployeeFileId && file.id === replacingEmployeeFileId)
          return true;
        return matchesEmployeeFileVersion(
          file,
          normalizedTitle,
          normalizedFileType
        );
      });

      const fileDoc: EmployeeFileDoc = {
        employeeId,
        employeeUid,
        userId: selectedEmployee.id,
        employeeName:
          selectedEmployeeLabel !== EMPLOYEE_EMPTY_VALUE
            ? selectedEmployeeLabel
            : selectedEmployee.displayName ||
              selectedEmployee.name ||
              selectedEmployee.email ||
              null,
        title: normalizedTitle,
        description: normalizedDescription || null,
        fileType: normalizedFileType,
        fileId: uploaded.id,
        fileName: uploaded.fileName,
        filePath: uploaded.filePath,
        fileUrl: uploaded.fileUrl,
        contentType: uploaded.contentType || null,
        fileSize: uploaded.fileSize,
        category: uploaded.category || EMPLOYEE_FILE_CATEGORY,
        uploadedBy: user?.uid || null,
        uploadedByName,
        uploadedAt: uploaded.uploadedAt,
        status: "active",
        active: true,
        replacedAt: null,
        replacedBy: null,
        replacedByName: null,
        replacedByFileId: null,
        replacesFileId:
          replacingEmployeeFileId || replacedCandidates[0]?.id || null,
        isRead: false,
        readAt: null,
        updatedAt: serverTimestamp(),
      };

      await runTransaction(db, async tx => {
        replacedCandidates.forEach(file => {
          tx.update(doc(db, EMPLOYEE_FILES_COLLECTION, file.id), {
            status: "replaced",
            active: false,
            replacedAt: serverTimestamp(),
            replacedBy: user?.uid || null,
            replacedByName: uploadedByName,
            replacedByFileId: fileRef.id,
            updatedAt: serverTimestamp(),
          });
        });

        tx.set(fileRef, fileDoc as any);
      });

      await logAuditEvent({
        action: replacedCandidates.length
          ? "employee_file_replaced"
          : "employee_file_uploaded",
        category: "user",
        entityType: "employee_file",
        entityId: fileRef.id,
        entityPath: fileRef.path,
        source: buildAuditSource({
          area: "hr",
          page: "Employees",
          method: "upload_employee_file",
        }),
        relatedIds: {
          userId: selectedEmployee.id,
        },
        message: replacedCandidates.length
          ? `Replaced employee file for ${selectedEmployeeLabel}`
          : `Uploaded employee file for ${selectedEmployeeLabel}`,
        meta: {
          employeeId,
          employeeUid,
          employeeName: fileDoc.employeeName || null,
          title: normalizedTitle,
          description: normalizedDescription || null,
          fileName: uploaded.fileName,
          fileType: fileDoc.fileType || EMPLOYEE_DEFAULT_FILE_TYPE,
          contentType: uploaded.contentType || null,
          fileSize: uploaded.fileSize,
          replacedFileIds: replacedCandidates.map(file => file.id),
        },
      });

      try {
        await createInAppNotification({
          userId: employeeUid,
          title: replacedCandidates.length
            ? "تم رفع نسخة محدثة من ملفك"
            : "تم رفع ملف جديد لك",
          body: replacedCandidates.length
            ? `تم استبدال "${normalizedTitle}" بنسخة محدثة داخل ملفك الوظيفي.`
            : `تمت إضافة "${normalizedTitle}" إلى ملفك الوظيفي.`,
          type: "file",
          relatedId: fileRef.id,
          relatedTo: "employee_file",
          relatedPath: "/hr/files",
        });
      } catch (notificationError) {
        console.error("employee_file_notification_failed", notificationError);
      }

      resetEmployeeFileForm();
      toast.success(
        replacedCandidates.length
          ? "تم رفع النسخة المعدلة وتفعيلها."
          : "تم رفع الملف وإرساله إلى ملف الموظف."
      );
    } catch (error) {
      console.error("employee_file_upload_failed", error);
      toast.error("تعذر رفع ملف الموظف.");
    } finally {
      setUploadingEmployeeFile(false);
    }
  };

  const handleSave = async () => {
    if (!selectedEmployee || !selectedEmployeeProfile) return;
    if (!canManageEmployees) {
      toast.error("لا تملك صلاحية تعديل بيانات الموظفين.");
      return;
    }

    const normalizedFullName = form.fullName.trim();
    const normalizedEmail = form.email.trim();
    const normalizedPhone = form.phone.trim();
    const normalizedFingerprintNumber = normalizeFingerprintNumber(
      form.fingerprintNumber
    );
    const leaveBalance = toNullableNumber(form.leaveBalance);
    const baseSalary = toNullableNumber(form.baseSalary);
    const expectedWorkDays = toNullableNumber(form.expectedWorkDays);
    const expectedWorkHours = toNullableNumber(form.expectedWorkHours);
    const actualWorkedHours = toNullableNumber(form.actualWorkedHours);
    const overtimeHourlyRate = toNullableNumber(form.overtimeHourlyRate);
    const insuranceDeduction = toNullableNumber(form.insuranceDeduction);
    const housingAllowance = toNullableNumber(form.housingAllowance);
    const transportationAllowance = toNullableNumber(
      form.transportationAllowance
    );
    const otherAllowances = toNullableNumber(form.otherAllowances);
    const allowances = [
      housingAllowance,
      transportationAllowance,
      otherAllowances,
    ]
      .filter((value): value is number => typeof value === "number")
      .reduce((sum, value) => sum + value, 0);
    const shiftStartTime = form.shiftStartTime.trim() || null;
    const shiftEndTime = form.shiftEndTime.trim() || null;
    const weeklyOffDays = normalizeWeeklyOffDays(form.weeklyOffDays);
    const workSchedule = {
      startTime: shiftStartTime,
      endTime: shiftEndTime,
      weeklyOffDays,
    };
    if (!normalizedFullName) {
      toast.error("يجب إدخال اسم الموظف.");
      return;
    }

    if (
      !normalizedEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      toast.error("يرجى إدخال بريد إلكتروني صحيح.");
      return;
    }
    if (form.leaveBalance.trim() && leaveBalance === null) {
      toast.error("رصيد الإجازات يجب أن يكون رقمًا صالحًا.");
      return;
    }

    if (form.baseSalary.trim() && baseSalary === null) {
      toast.error("الراتب الأساسي يجب أن يكون رقمًا صالحًا.");
      return;
    }

    if (form.housingAllowance.trim() && housingAllowance === null) {
      toast.error("بدل السكن يجب أن يكون رقمًا صالحًا.");
      return;
    }

    if (
      form.transportationAllowance.trim() &&
      transportationAllowance === null
    ) {
      toast.error("بدل المواصلات يجب أن يكون رقمًا صالحًا.");
      return;
    }

    if (form.otherAllowances.trim() && otherAllowances === null) {
      toast.error("البدلات الثابتة الأخرى يجب أن تكون رقمًا صالحًا.");
      return;
    }

    if (form.expectedWorkDays.trim() && expectedWorkDays === null) {
      toast.error("عدد أيام العمل يجب أن يكون رقمًا صالحًا.");
      return;
    }

    if (form.expectedWorkHours.trim() && expectedWorkHours === null) {
      toast.error("عدد ساعات العمل يجب أن يكون رقمًا صالحًا.");
      return;
    }

    if (form.overtimeHourlyRate.trim() && overtimeHourlyRate === null) {
      toast.error("سعر ساعة الأوفر تايم يجب أن يكون رقمًا صالحًا.");
      return;
    }

    if (
      !isValidTimeInput(form.shiftStartTime) ||
      !isValidTimeInput(form.shiftEndTime)
    ) {
      toast.error("وقت الدوام يجب أن يكون بصيغة صحيحة مثل 08:30.");
      return;
    }

    if (normalizedFingerprintNumber) {
      const duplicateEmployee = employees.find(employee => {
        if (employee.id === selectedEmployee.id) return false;

        const employeeEmployment = (employee.employeeProfile?.employment ||
          employee.employment ||
          {}) as Record<string, any>;
        const existingFingerprintNumber = normalizeFingerprintNumber(
          employeeEmployment.fingerprintNumber ?? employee.fingerprintNumber
        );

        return (
          !!existingFingerprintNumber &&
          existingFingerprintNumber.toLowerCase() ===
            normalizedFingerprintNumber.toLowerCase()
        );
      });

      if (duplicateEmployee) {
        const duplicateEmployeeLabel =
          pickText(
            duplicateEmployee.displayName,
            duplicateEmployee.name,
            duplicateEmployee.email
          ) || "موظف آخر";
        toast.error(`رقم البصمة مستخدم بالفعل لدى ${duplicateEmployeeLabel}.`);
        return;
      }
    }

    setSaving(true);
    try {
      const currentPersonal = (selectedEmployee.employeeProfile?.personal ||
        selectedEmployee.personal ||
        {}) as Record<string, any>;
      const currentEmployment = (selectedEmployee.employeeProfile?.employment ||
        selectedEmployee.employment ||
        {}) as EmployeeEmploymentDoc;
      const linkedUserUid =
        String(selectedEmployee.uid || selectedEmployee.id || "").trim() ||
        selectedEmployee.id;
      const linkedEmployeeId =
        String(selectedEmployee.linkedEmployeeId || "").trim() ||
        selectedEmployee.id;
      const nextPersonal = {
        ...currentPersonal,
        name: normalizedFullName,
        email: normalizedEmail,
        phone: normalizedPhone || null,
      };

      const normalizedSalaryDeductions =
        normalizeSalaryDeductionsForPersistence(salaryDeductions);
      const allowedZoneIds = normalizeAllowedZoneIds(form.allowedZoneIds);

      const nextEmployment: EmployeeEmploymentDoc = {
        ...currentEmployment,
        title: form.jobTitle.trim() || null,
        jobTitle: form.jobTitle.trim() || null,
        department: form.department.trim() || null,
        startDate: form.startDate || null,
        leaveBalance,
        baseSalary,
        housingAllowance,
        transportationAllowance,
        otherAllowances,
        allowances,
        expectedWorkDays,
        expectedWorkHours,
        actualWorkedHours,
        workSchedule,
        shiftStartTime,
        shiftEndTime,
        overtimeHours: calculatedOvertimeHours,
        missingHours: calculatedMissingHours,
        hoursDifference: calculatedHoursDifference,
        overtimeHourlyRate: effectiveOvertimeHourlyRate,
        calculatedDailyRate,
        calculatedHourlyRate,
        calculatedOvertimeAmount,
        calculatedMissingDeduction,
        insuranceDeduction,
        salaryDeductions: normalizedSalaryDeductions,
        totalSalaryDeductions,
        calculatedGrossSalary,
        calculatedNetSalary,
        status: form.employmentStatus || "active",
        employmentStatus: form.employmentStatus || "active",
        fingerprintNumber: normalizedFingerprintNumber || null,
        allowedZoneIds,
        adminNotes: form.adminNotes.trim() || null,
        updatedAt: serverTimestamp(),
        updatedByUid: user?.uid || null,
        updatedByEmail: user?.email || null,
      };

      try {
        await auditedUpdateDoc({
          ref: doc(db, "users", selectedEmployee.id),
          data: {
            displayName: normalizedFullName,
            name: normalizedFullName,
            fullName: normalizedFullName,
            email: normalizedEmail,
            phone: normalizedPhone || null,
            "profile.name": normalizedFullName,
            "profile.displayName": normalizedFullName,
            "profile.email": normalizedEmail,
            "profile.phone": normalizedPhone || null,
            title: form.jobTitle.trim() || null,
            department: form.department.trim() || null,
            employeeProfileEnabled: true,
            includeInEmployeeManagement: true,
            linkedEmployeeId,
            allowedZoneIds,
            startDate: form.startDate || null,
            leaveBalance,
            updatedAt: serverTimestamp(),
            employment: nextEmployment,
            "employeeProfile.personal": nextPersonal,
            "employeeProfile.employment": nextEmployment,
          } as any,
          action: AUDIT_ACTIONS.USER_UPDATED,
          category: "user",
          entityType: "user",
          source: buildAuditSource({
            area: "hr",
            page: "Employees",
            method: "update_employment_profile",
          }),
          relatedIds: { userId: selectedEmployee.id },
          message: `Updated employee employment profile for ${selectedEmployeeLabel}`,
          meta: {
            targetUserEmail: normalizedEmail,
            targetUserName: normalizedFullName,
            phone: normalizedPhone || null,
            jobTitle: nextEmployment.jobTitle || null,
            department: nextEmployment.department || null,
            employmentStatus: nextEmployment.employmentStatus || null,
            fingerprintNumber: nextEmployment.fingerprintNumber || null,
            allowedZoneIds,
            leaveBalance,
            baseSalary,
            housingAllowance,
            transportationAllowance,
            otherAllowances,
            allowances,
            expectedWorkDays,
            expectedWorkHours,
            actualWorkedHours,
            shiftStartTime,
            shiftEndTime,
            workSchedule,
            overtimeHours: calculatedOvertimeHours,
            missingHours: calculatedMissingHours,
            hoursDifference: calculatedHoursDifference,
            overtimeHourlyRate: effectiveOvertimeHourlyRate,
            calculatedDailyRate,
            calculatedHourlyRate,
            calculatedOvertimeAmount,
            calculatedMissingDeduction,
            insuranceDeduction,
            totalSalaryDeductions,
            calculatedGrossSalary,
            calculatedNetSalary,
          },
        });
      } catch (error) {
        console.error("save_employee_profile_user_update_error", {
          userId: selectedEmployee.id,
          error,
        });
        throw error;
      }

      if (linkedEmployeeId) {
        try {
          await setDoc(
            doc(db, "employees", linkedEmployeeId),
            {
              uid: linkedUserUid,
              linkedUserUid: linkedUserUid,
              name: normalizedFullName,
              displayName: normalizedFullName,
              fullName: normalizedFullName,
              email: normalizedEmail,
              phone: normalizedPhone || null,
              profile: {
                name: normalizedFullName,
                displayName: normalizedFullName,
                email: normalizedEmail,
                phone: normalizedPhone || null,
              },
              title: form.jobTitle.trim() || null,
              department: form.department.trim() || null,
              allowedZoneIds,
              startDate: form.startDate || null,
              leaveBalance,
              updatedAt: serverTimestamp(),
              employment: nextEmployment,
              employeeProfile: {
                personal: nextPersonal,
                employment: nextEmployment,
              },
            },
            { merge: true }
          );
        } catch (error) {
          console.error("save_employee_profile_employee_update_error", {
            employeeDocId: linkedEmployeeId,
            error,
          });
          throw error;
        }
      }

      toast.success("تم حفظ بيانات الموظف الوظيفية.");
    } catch {
      toast.error("تعذر حفظ بيانات الموظف الوظيفية.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveManualLeaveBalance = async () => {
    if (!selectedEmployee || !selectedEmployeeProfile) return;
    if (!canManageEmployees) {
      toast.error("لا تملك صلاحية تعديل رصيد الإجازات.");
      return;
    }

    const manualBalanceValue = Number(manualLeaveBalance);
    const reason = String(manualLeaveAdjustmentReason || "").trim();
    const operationType =
      manualLeaveBalanceOperation === "deduct" ? "deduct" : "add";

    if (
      !manualLeaveBalance.trim() ||
      !Number.isFinite(manualBalanceValue) ||
      manualBalanceValue < 0
    ) {
      toast.error("أدخل رصيد إجازات صالحًا.");
      return;
    }

    if (operationType === "deduct") {
      if (manualBalanceValue <= 0) {
        toast.error("أدخل عدد أيام صالحًا للخصم.");
        return;
      }

      if (manualBalanceValue > currentLeaveBalanceNumber) {
        toast.error("لا يمكن خصم عدد أيام أكبر من الرصيد الحالي.");
        return;
      }
    }

    if (!reason) {
      toast.error("اكتب سبب تعديل الرصيد.");
      return;
    }

    setSavingManualLeaveBalance(true);
    try {
      const linkedUserUid =
        String(selectedEmployee.uid || selectedEmployee.id || "").trim() ||
        selectedEmployee.id;

      const userRef = doc(db, "users", selectedEmployee.id);
      const employeeDocId = String(
        selectedEmployee.linkedEmployeeId || ""
      ).trim();
      const employeeRef = employeeDocId
        ? doc(db, "employees", employeeDocId)
        : null;

      const adjustmentRef = doc(
        collection(db, EMPLOYEE_LEAVE_BALANCE_ADJUSTMENTS_COLLECTION)
      );
      let persistedNextBalance = manualBalanceValue;

      await runTransaction(db, async tx => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists()) {
          throw new Error("employee_user_not_found");
        }

        const userData = (userSnap.data() as Record<string, any>) || {};
        const userEmployment = (userData.employeeProfile?.employment ||
          userData.employment ||
          {}) as Record<string, any>;

        const employeeSnap = employeeRef ? await tx.get(employeeRef) : null;
        const employeeData =
          employeeSnap?.exists() && employeeSnap.data()
            ? (employeeSnap.data() as Record<string, any>) || {}
            : null;

        const employeeEmployment = (employeeData?.employeeProfile?.employment ||
          employeeData?.employment ||
          {}) as Record<string, any>;

        const previousBalance = resolveEmploymentLeaveBalance(
          userData,
          employeeData
        );
        const nextBalance =
          operationType === "deduct"
            ? previousBalance - manualBalanceValue
            : manualBalanceValue;
        const operationLabel = operationType === "deduct" ? "خصم" : "إضافة";

        if (!Number.isFinite(nextBalance) || nextBalance < 0) {
          throw new Error("leave_balance_invalid_operation");
        }
        persistedNextBalance = nextBalance;

        const leaveBalanceAdjustmentMeta = {
          previousBalance,
          nextBalance,
          operationType,
          operationLabel,
          reason,
          adjustedAt: serverTimestamp(),
          adjustedByUid: user?.uid || null,
          adjustedByEmail: user?.email || null,
          adjustedByName: user?.displayName || user?.email || null,
        };

        const nextUserEmployment = {
          ...userEmployment,
          leaveBalance: nextBalance,
          leaveBalanceAdjustmentMeta,
          updatedAt: serverTimestamp(),
          updatedByUid: user?.uid || null,
          updatedByEmail: user?.email || null,
        };

        tx.set(
          userRef,
          {
            leaveBalance: nextBalance,
            updatedAt: serverTimestamp(),
            employment: nextUserEmployment,
            employeeProfile: {
              personal: (userData.employeeProfile?.personal ||
                userData.personal ||
                null) as Record<string, any> | null,
              employment: nextUserEmployment,
            },
          },
          { merge: true }
        );

        if (employeeRef) {
          const nextEmployeeEmployment = {
            ...employeeEmployment,
            leaveBalance: nextBalance,
            leaveBalanceAdjustmentMeta,
            updatedAt: serverTimestamp(),
            updatedByUid: user?.uid || null,
            updatedByEmail: user?.email || null,
          };

          tx.set(
            employeeRef,
            {
              uid: linkedUserUid,
              linkedUserUid,
              leaveBalance: nextBalance,
              updatedAt: serverTimestamp(),
              employment: nextEmployeeEmployment,
              employeeProfile: {
                personal: (employeeData?.employeeProfile?.personal ||
                  employeeData?.personal ||
                  null) as Record<string, any> | null,
                employment: nextEmployeeEmployment,
              },
            },
            { merge: true }
          );
        }

        tx.set(adjustmentRef, {
          employeeId:
            String(selectedEmployee.linkedEmployeeId || "").trim() ||
            selectedEmployee.id,
          employeeUid: selectedEmployeeAuthUid || selectedEmployee.id,
          userId: selectedEmployee.id,
          employeeName:
            selectedEmployeeLabel !== EMPLOYEE_EMPTY_VALUE
              ? selectedEmployeeLabel
              : selectedEmployee.displayName ||
                selectedEmployee.name ||
                selectedEmployee.email ||
                "الموظف",
          previousBalance,
          nextBalance,
          difference: nextBalance - previousBalance,
          operationType,
          operationLabel,
          reason,
          createdAt: serverTimestamp(),
          createdByUid: user?.uid || null,
          createdByEmail: user?.email || null,
          createdByName: user?.displayName || user?.email || null,
        });
      });

      setForm(current => ({
        ...current,
        leaveBalance: String(persistedNextBalance),
      }));

      setManualLeaveBalance(String(persistedNextBalance));
      setManualLeaveBalanceOperation("add");
      setManualLeaveAdjustmentReason("");

      toast.success(
        tr(
          language,
          "تم تعديل رصيد الإجازات يدويًا.",
          "Leave balance was adjusted manually."
        )
      );
    } catch (error) {
      console.error("manual_leave_balance_update_failed", error);
      toast.error(
        tr(
          language,
          "تعذر تعديل رصيد الإجازات.",
          "Could not adjust leave balance."
        )
      );
    } finally {
      setSavingManualLeaveBalance(false);
    }
  };

  const handleReviewNoteChange = (requestId: string, value: string) => {
    setReviewNotes(current => ({
      ...current,
      [requestId]: value,
    }));
  };

  const handleReviewLeaveRequest = async (
    request: EmployeeLeaveRequestRecord,
    nextStatus: EmployeeLeaveRequestStatus
  ) => {
    if (!selectedEmployee || !selectedEmployeeProfile) return;
    if (!canManageEmployees) {
      toast.error(
        tr(
          language,
          "لا تملك صلاحية مراجعة طلبات الإجازة.",
          "You do not have permission to review leave requests."
        )
      );
      return;
    }

    setReviewingLeaveRequestId(request.id);
    try {
      await runTransaction(db, async tx => {
        const leaveRequestRef = doc(
          db,
          EMPLOYEE_LEAVE_REQUESTS_COLLECTION,
          request.id
        );
        const leaveRequestSnap = await tx.get(leaveRequestRef);
        if (!leaveRequestSnap.exists()) {
          throw new Error("leave_request_not_found");
        }

        const currentLeaveRequest =
          leaveRequestSnap.data() as EmployeeLeaveRequestDoc;
        const currentStatus = String(currentLeaveRequest.status || "pending")
          .trim()
          .toLowerCase();
        if (currentStatus !== "pending") {
          throw new Error("leave_request_already_reviewed");
        }

        const daysCount = Number(
          currentLeaveRequest.daysCount ?? request.daysCount ?? 0
        );
        if (!Number.isFinite(daysCount) || daysCount <= 0) {
          throw new Error("leave_request_invalid_days");
        }

        const hrNote = String(
          reviewNotes[request.id] ?? request.hrNote ?? ""
        ).trim();

        if (nextStatus === "rejected" && !hrNote) {
          throw new Error("leave_rejection_note_required");
        }

        const userRef = doc(db, "users", selectedEmployee.id);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists()) {
          throw new Error("employee_user_not_found");
        }

        const userData = (userSnap.data() as Record<string, any>) || {};
        const userEmployment = (userData.employeeProfile?.employment ||
          userData.employment ||
          {}) as Record<string, any>;
        const linkedUserUid = selectedEmployeeAuthUid || selectedEmployee.id;

        const employeeDocId = String(
          selectedEmployee.linkedEmployeeId ||
            currentLeaveRequest.employeeDocId ||
            currentLeaveRequest.employeeId ||
            ""
        ).trim();
        const employeeRef = employeeDocId
          ? doc(db, "employees", employeeDocId)
          : null;
        const employeeSnap = employeeRef ? await tx.get(employeeRef) : null;
        const employeeData =
          employeeSnap?.exists() && employeeSnap.data()
            ? (employeeSnap.data() as Record<string, any>) || {}
            : null;
        const employeeEmployment = (employeeData?.employeeProfile?.employment ||
          employeeData?.employment ||
          {}) as Record<string, any>;

        if (nextStatus === "approved") {
          const currentLeaveBalance = resolveEmploymentLeaveBalance(
            userData,
            employeeData
          );
          if (currentLeaveBalance < daysCount) {
            throw new Error("leave_balance_insufficient");
          }

          const nextLeaveBalance = currentLeaveBalance - daysCount;
          const nextUserEmployment = {
            ...userEmployment,
            leaveBalance: nextLeaveBalance,
            updatedAt: serverTimestamp(),
            updatedByUid: user?.uid || null,
            updatedByEmail: user?.email || null,
          };

          tx.set(
            userRef,
            {
              leaveBalance: nextLeaveBalance,
              updatedAt: serverTimestamp(),
              employment: nextUserEmployment,
              employeeProfile: {
                personal: (userData.employeeProfile?.personal ||
                  userData.personal ||
                  null) as Record<string, any> | null,
                employment: nextUserEmployment,
              },
            },
            { merge: true }
          );

          if (employeeRef) {
            const nextEmployeeEmployment = {
              ...employeeEmployment,
              leaveBalance: nextLeaveBalance,
              updatedAt: serverTimestamp(),
              updatedByUid: user?.uid || null,
              updatedByEmail: user?.email || null,
            };

            tx.set(
              employeeRef,
              {
                uid: linkedUserUid,
                linkedUserUid: linkedUserUid,
                leaveBalance: nextLeaveBalance,
                updatedAt: serverTimestamp(),
                employment: nextEmployeeEmployment,
                employeeProfile: {
                  personal: (employeeData?.employeeProfile?.personal ||
                    employeeData?.personal ||
                    null) as Record<string, any> | null,
                  employment: nextEmployeeEmployment,
                },
              },
              { merge: true }
            );
          }
        }

        tx.update(leaveRequestRef, {
          status: nextStatus,
          hrNote,
          decidedAt: serverTimestamp(),
          decidedBy: user?.uid || null,
          decidedByEmail: user?.email || null,
          decidedByName: user?.displayName || user?.email || null,
          reviewedAt: serverTimestamp(),
          reviewedBy: user?.uid || null,
          reviewedByEmail: user?.email || null,
          reviewedByName: user?.displayName || user?.email || null,
          updatedAt: serverTimestamp(),
        });
      });

      try {
        await createInAppNotification({
          userId: request.employeeUid,
          title:
            nextStatus === "approved"
              ? tr(language, "تم اعتماد طلب الإجازة", "Leave Request Approved")
              : tr(language, "تم رفض طلب الإجازة", "Leave Request Rejected"),
          body:
            nextStatus === "approved"
              ? tr(
                  language,
                  "تم اعتماد طلب الإجازة الخاص بك وتحديث الرصيد وفقًا لذلك.",
                  "Your leave request was approved and the balance was updated."
                )
              : tr(
                  language,
                  "تم رفض طلب الإجازة الخاص بك. يمكنك مراجعة الملاحظة الإدارية داخل الطلب.",
                  "Your leave request was rejected. You can review the admin note inside the request."
                ),
          type: "leave",
          relatedId: request.id,
          relatedTo: "employee_leave_request",
          relatedPath: "/hr/profile",
        });
      } catch (notificationError) {
        console.error("employee_leave_notification_failed", notificationError);
      }

      setReviewNotes(current => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });

      toast.success(
        nextStatus === "approved"
          ? tr(
              language,
              "تم اعتماد طلب الإجازة وخصم الرصيد.",
              "Leave request approved and balance deducted."
            )
          : tr(language, "تم رفض طلب الإجازة.", "Leave request rejected.")
      );
    } catch (reviewError) {
      console.error("review_leave_request_error", reviewError);

      if (
        reviewError instanceof Error &&
        reviewError.message === "leave_balance_insufficient"
      ) {
        toast.error(
          tr(
            language,
            "رصيد الإجازات الحالي لا يكفي لاعتماد هذا الطلب.",
            "The current leave balance is not enough to approve this request."
          )
        );
      } else if (
        reviewError instanceof Error &&
        reviewError.message === "leave_request_already_reviewed"
      ) {
        toast.error(
          tr(
            language,
            "تمت مراجعة هذا الطلب مسبقًا.",
            "This request has already been reviewed."
          )
        );
      } else if (
        reviewError instanceof Error &&
        reviewError.message === "leave_rejection_note_required"
      ) {
        toast.error(
          tr(
            language,
            "يجب كتابة ملاحظة عند رفض طلب الإجازة.",
            "A note is required when rejecting a leave request."
          )
        );
      } else {
        toast.error(
          tr(
            language,
            "تعذر تحديث حالة طلب الإجازة.",
            "Could not update leave request status."
          )
        );
      }
    } finally {
      setReviewingLeaveRequestId(null);
    }
  };

  const handleReviewServiceRequest = async (
    request: EmployeeServiceRequestRecord,
    nextStatus: EmployeeServiceRequestStatus
  ) => {
    if (!canManageEmployees) {
      toast.error("لا تملك صلاحية مراجعة طلبات الموظفين.");
      return;
    }

    const hrNote = String(
      reviewNotes[request.id] ?? request.hrNote ?? ""
    ).trim();
    if (nextStatus === "rejected" && !hrNote) {
      toast.error("يجب كتابة ملاحظة عند رفض الطلب.");
      return;
    }

    setReviewingServiceRequestId(request.id);
    try {
      await runTransaction(db, async tx => {
        const requestRef = doc(
          db,
          EMPLOYEE_SERVICE_REQUESTS_COLLECTION,
          request.id
        );
        const requestSnap = await tx.get(requestRef);
        if (!requestSnap.exists()) {
          throw new Error("service_request_not_found");
        }

        const currentStatus = String(requestSnap.data()?.status || "pending")
          .trim()
          .toLowerCase();
        if (currentStatus !== "pending") {
          throw new Error("service_request_already_reviewed");
        }

        tx.update(requestRef, {
          status: nextStatus,
          hrNote,
          decidedAt: serverTimestamp(),
          decidedBy: user?.uid || null,
          decidedByEmail: user?.email || null,
          decidedByName: user?.displayName || user?.email || null,
          reviewedAt: serverTimestamp(),
          reviewedBy: user?.uid || null,
          reviewedByEmail: user?.email || null,
          reviewedByName: user?.displayName || user?.email || null,
          updatedAt: serverTimestamp(),
        });
      });

      try {
        const requestLabel = getEmployeeServiceRequestTypeLabel(
          request.requestType
        );
        await createInAppNotification({
          userId: request.employeeUid,
          title:
            nextStatus === "approved"
              ? `تم اعتماد ${requestLabel}`
              : `تم رفض ${requestLabel}`,
          body:
            nextStatus === "approved"
              ? `تم اعتماد ${requestLabel} الخاص بك.`
              : `تم رفض ${requestLabel} الخاص بك. يمكنك مراجعة ملاحظة HR داخل الطلب.`,
          type: "system",
          relatedId: request.id,
          relatedTo: "employee_service_request",
          relatedPath: "/hr/profile#employee-requests",
        });
      } catch (notificationError) {
        console.error(
          "employee_service_request_notification_failed",
          notificationError
        );
      }

      setReviewNotes(current => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });

      toast.success(
        nextStatus === "approved" ? "تم اعتماد الطلب." : "تم رفض الطلب."
      );
    } catch (reviewError) {
      console.error("review_service_request_error", reviewError);
      if (
        reviewError instanceof Error &&
        reviewError.message === "service_request_already_reviewed"
      ) {
        toast.error("تمت مراجعة هذا الطلب مسبقًا.");
      } else {
        toast.error("تعذر تحديث حالة الطلب.");
      }
    } finally {
      setReviewingServiceRequestId(null);
    }
  };

  return (
    <DashboardLayout area="hr">
      <div
        dir={pageDir}
        className={cn(
          "min-w-0 max-w-full space-y-6 overflow-x-hidden",
          pageTextAlignClass
        )}
      >
        {!selectedEmployee ? (
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight text-slate-950">
              {tr(language, "إدارة الموظفين", "Employee Management")}
            </h1>
            <p className="max-w-3xl text-lg text-slate-500">
              {tr(
                language,
                "صفحة مخصصة لإدارة البيانات الوظيفية للموظفين من جهة الإدارة والموارد البشرية، مع فصل واضح بين ما يشاهده الموظف في بروفايله وما يتم تعديله من داخل اللوحة.",
                "A dedicated page for managing employee work records from HR and administration, with a clear split between what employees see in their profiles and what is edited inside the dashboard."
              )}
            </p>
          </div>
        ) : null}

        {!selectedEmployee ? (
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-slate-200/80">
              <CardContent className="p-5">
                <div className="text-xs font-semibold tracking-[0.16em] text-slate-500">
                  {tr(language, "الموظفون", "Employees")}
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                  {formatNumberEN(employeeCards.length)}
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  {tr(
                    language,
                    "إجمالي السجلات الظاهرة ضمن صفحة إدارة الموظفين.",
                    "Total records shown in employee management."
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200/80">
              <CardContent className="p-5">
                <div className="text-xs font-semibold tracking-[0.16em] text-slate-500">
                  {tr(language, "على رأس العمل", "Active Employees")}
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                  {formatNumberEN(activeEmployeesCount)}
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  {tr(
                    language,
                    "موظفون بحالة وظيفية نشطة حاليًا.",
                    "Employees currently marked as active."
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200/80">
              <CardContent className="p-5">
                <div className="text-xs font-semibold tracking-[0.16em] text-slate-500">
                  {tr(language, "متابعة الحالة", "Status Overview")}
                </div>
                <div className="mt-2 flex items-center gap-3 text-sm font-semibold text-slate-950">
                  <span>
                    {tr(language, "إجازة", "Leave")}:{" "}
                    {formatNumberEN(onLeaveEmployeesCount)}
                  </span>
                  <span className="text-slate-300">|</span>
                  <span>
                    {tr(language, "تجربة", "Probation")}:{" "}
                    {formatNumberEN(probationEmployeesCount)}
                  </span>
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  {tr(
                    language,
                    "قراءة سريعة لحالات الموظفين التشغيلية.",
                    "A quick read of employee operating statuses."
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        <div className="min-w-0 max-w-full space-y-6 overflow-x-hidden">
          {!selectedEmployee ? (
            <Card className="overflow-hidden border-slate-200/80 py-0">
              <CardHeader className="shrink-0 border-b border-slate-100 bg-white/95 px-4 pb-4 pt-4">
                <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
                  <BriefcaseBusiness className="h-4 w-4 text-[#030640]" />
                  {tr(language, "قائمة الموظفين", "Employee List")}
                </CardTitle>
                <CardDescription className="text-xs leading-5 text-slate-500">
                  {tr(
                    language,
                    "اختر موظفًا لعرض ملفه الوظيفي وإدارة بياناته من نفس الصفحة.",
                    "Select an employee to review and manage their work profile on this page."
                  )}
                </CardDescription>

                <div className="relative mt-2">
                  <Search
                    className={cn(
                      "pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400",
                      language === "ar" ? "right-3" : "left-3"
                    )}
                  />
                  <Input
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    placeholder={tr(
                      language,
                      "ابحث بالاسم أو البريد أو القسم",
                      "Search by name, email, or department"
                    )}
                    className={cn(
                      "h-9 text-sm",
                      language === "ar" ? "pr-9 text-right" : "pl-9 text-left"
                    )}
                  />
                </div>
              </CardHeader>

              <CardContent className="px-4 pb-4 pt-3">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {loading ? (
                    <div className="col-span-full rounded-[24px] border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                      {tr(
                        language,
                        "جاري تحميل الموظفين...",
                        "Loading employees..."
                      )}
                    </div>
                  ) : error ? (
                    <div className="col-span-full rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-10 text-center text-sm text-rose-700">
                      {language === "ar"
                        ? error
                        : safeEnglishText(
                            error,
                            "Could not load employee list."
                          )}
                    </div>
                  ) : filteredEmployeeCards.length ? (
                    filteredEmployeeCards.map(card => {
                      const isActive = card.employee.id === selectedEmployeeId;
                      const employeeCardUnreadBucket =
                        employeeWorkspaceUnreadNotificationIndex.get(
                          card.employee.id
                        );
                      const showEmployeeCardIndicator =
                        Boolean(employeeCardUnreadBucket?.all.length) ||
                        (isActive && hasEmployeeWorkspaceAlerts);
                      const employeeName = card.displayName;
                      const employeeTitle = card.displayTitle;

                      return (
                        <button
                          key={card.employee.id}
                          type="button"
                          onClick={() => handleSelectEmployee(card.employee.id)}
                          aria-label={tr(
                            language,
                            `فتح تفاصيل ${employeeName}`,
                            `Open details for ${employeeName}`
                          )}
                          className={cn(
                            "group relative flex min-h-[96px] w-full items-center gap-3 overflow-hidden rounded-[20px] border px-3 py-3 transition-all",
                            pageTextAlignClass,
                            isActive
                              ? "border-[#F2B705]/55 bg-[linear-gradient(135deg,rgba(242,183,5,0.14)_0%,rgba(255,255,255,0.98)_70%)] shadow-[0_20px_44px_-34px_rgba(242,183,5,0.55)]"
                              : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                          )}
                        >
                          {showEmployeeCardIndicator ? (
                            <span
                              aria-hidden="true"
                              className={cn(
                                "absolute top-3 z-20 h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_0_3px_rgba(255,255,255,0.98)] pointer-events-none",
                                language === "ar" ? "right-3" : "left-3"
                              )}
                            />
                          ) : null}
                          <div className="relative z-10 shrink-0">
                            <Avatar className="h-12 w-12 rounded-[16px] border border-slate-200 bg-slate-100 shadow-sm">
                              <AvatarImage
                                src={card.displayAvatarUrl || undefined}
                                alt={employeeName}
                                className="object-cover"
                              />
                              <AvatarFallback className="rounded-[16px] bg-slate-900 text-xs font-semibold text-white">
                                {getEmployeeInitials(
                                  employeeName,
                                  card.profile.personal.email
                                )}
                              </AvatarFallback>
                            </Avatar>
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="truncate text-sm font-semibold text-slate-950">
                              {employeeName}
                            </div>
                            <div className="truncate text-xs text-slate-500">
                              {employeeTitle}
                            </div>
                          </div>

                          <div className="shrink-0 rounded-full border border-slate-200 bg-white/90 p-2 text-slate-500 shadow-sm transition group-hover:text-slate-900">
                            <ChevronLeft
                              className={cn(
                                "h-4 w-4",
                                language === "en" && "rotate-180"
                              )}
                            />
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <Empty className="col-span-full min-h-[360px] rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70">
                      <EmptyHeader>
                        <EmptyMedia
                          variant="icon"
                          className="bg-[#F2B705]/12 text-[#030640]"
                        >
                          <UserRound className="size-5" />
                        </EmptyMedia>
                        <EmptyTitle>
                          {tr(
                            language,
                            "لا توجد نتائج مطابقة",
                            "No Matching Results"
                          )}
                        </EmptyTitle>
                        <EmptyDescription>
                          {tr(
                            language,
                            "جرّب تغيير عبارة البحث أو أزل الفلتر لعرض الموظفين الحاليين.",
                            "Try changing the search term or clearing the filter to show current employees."
                          )}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex min-w-0 max-w-full flex-col gap-6 overflow-x-hidden">
            <Card
              ref={employeeDetailsTopRef}
              className={cn(
                "w-full max-w-full gap-0 overflow-hidden border-slate-200/80 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_56%,#fff7df_100%)] py-0 shadow-[0_22px_54px_-38px_rgba(15,23,42,0.28)]",
                !selectedEmployee && "hidden"
              )}
            >
              <CardHeader className="min-w-0 border-b border-slate-200/70 bg-white/70 px-4 pt-5 pb-4 backdrop-blur sm:px-6 sm:pt-6">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                  <div
                    className={cn(
                      "flex min-w-0 items-center gap-3 sm:gap-4",
                      pageTextAlignClass
                    )}
                  >
                    <Avatar className="h-16 w-16 shrink-0 rounded-[22px] border border-slate-200 bg-slate-100 shadow-sm sm:h-20 sm:w-20">
                      <AvatarImage
                        src={selectedEmployeeDisplayAvatarUrl || undefined}
                        alt={selectedEmployeeLabel}
                        className="object-cover"
                      />
                      <AvatarFallback className="rounded-[22px] bg-slate-900 text-xl font-semibold text-white">
                        {getEmployeeInitials(
                          selectedEmployeeLabel,
                          selectedEmployeeProfile?.personal?.email ||
                            selectedEmployee?.email ||
                            ""
                        )}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                        <UserRound className="h-3.5 w-3.5 text-[#030640]" />
                        {tr(language, "الملف الحالي", "Current Profile")}
                      </div>
                      <CardTitle className="truncate text-2xl tracking-tight text-slate-950 sm:text-3xl">
                        {selectedEmployeeLabel}
                      </CardTitle>
                      <div className="flex min-w-0 flex-wrap gap-2">
                        <Badge
                          variant="outline"
                          className="max-w-full truncate rounded-full"
                        >
                          {selectedEmployeeEmployment.title}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="max-w-full truncate rounded-full"
                        >
                          {selectedEmployeeEmployment.department}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-full",
                            selectedEmployeeEmployment.statusTone === "success"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : selectedEmployeeEmployment.statusTone ===
                                  "warning"
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-slate-200 bg-slate-100 text-slate-700"
                          )}
                        >
                          {selectedEmployeeEmployment.statusLabel}
                        </Badge>
                      </div>
                      <CardDescription className="text-sm leading-6 text-slate-500">
                        {tr(language, "جاري تعديل", "Editing")}:{" "}
                        {selectedEmployeeLabel}
                      </CardDescription>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="inline-flex h-auto min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#F2B705]/40 bg-[#F2B705]/12 px-4 py-2 text-sm font-semibold leading-6 text-[#030640] shadow-[0_14px_30px_-18px_rgba(242,183,5,0.9)] transition hover:border-[#F2B705]/65 hover:bg-[#F2B705]/20 hover:text-[#030640] focus-visible:ring-2 focus-visible:ring-[#F2B705]/40 xl:w-auto"
                    onClick={handleCloseEmployeeDetails}
                  >
                    <ArrowRight className="h-4 w-4 shrink-0" />
                    العودة إلى بطاقات الموظفين
                  </Button>
                </div>
              </CardHeader>
            </Card>

            {selectedEmployee && selectedEmployeeProfile ? (
              <div className="flex min-w-0 max-w-full flex-col gap-8 overflow-x-hidden rounded-[34px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.92)_0%,rgba(241,245,249,0.72)_100%)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] sm:p-4 lg:p-5">
                <Card
                  className={cn(
                    "order-0 sticky top-4 z-20 w-full max-w-full gap-0 overflow-hidden border-[#F2B705]/25 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(255,250,235,0.96)_100%)] py-0 shadow-[0_22px_52px_-34px_rgba(242,183,5,0.32)] ring-1 ring-white/80 backdrop-blur"
                  )}
                >
                  <CardContent className="min-w-0 px-3 py-3 sm:px-4">
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                      <ShieldCheck className="h-3.5 w-3.5 text-[#030640]" />
                      أقسام ملف الموظف
                    </div>
                    <div className="max-w-full overflow-x-auto overscroll-x-contain pb-1 pt-0.5">
                      <div className="flex w-max min-w-full justify-start gap-2 sm:gap-3.5">
                        {EMPLOYEE_WORKSPACE_SECTIONS.map(section => (
                          <EmployeeWorkspaceTabButton
                            key={section.key}
                            active={
                              activeEmployeeWorkspaceSection === section.key
                            }
                            icon={section.icon}
                            label={section.label}
                            showIndicator={
                              employeeWorkspaceSectionHasAlert[section.key]
                            }
                            onClick={() =>
                              activateEmployeeWorkspaceSection(section.key)
                            }
                          />
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card
                  id="employee-section-profile"
                  ref={employeeOverviewSectionRef}
                  className={cn(
                    "order-10 scroll-mt-36 gap-0 overflow-hidden border-[#F2B705]/25 bg-white py-0 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.38)] ring-1 ring-white/90 lg:scroll-mt-44",
                    activeEmployeeWorkspaceSection !== "profile" && "hidden"
                  )}
                >
                  <CardHeader className="border-b border-[#F2B705]/20 bg-[linear-gradient(135deg,rgba(255,251,235,0.95)_0%,rgba(255,255,255,0.92)_100%)] px-6 py-5 backdrop-blur">
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                            <UserRound className="h-4 w-4 text-[#030640]" />
                            ملخص الموظف
                          </div>
                          <CardTitle className="text-2xl tracking-tight text-slate-950">
                            {selectedEmployeeLabel}
                          </CardTitle>
                          <CardDescription className="text-sm text-slate-500">
                            {selectedEmployeeEmployment.title}
                          </CardDescription>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="rounded-full">
                            {selectedEmployeeEmployment.department}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full",
                              selectedEmployeeEmployment.statusTone ===
                                "success"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : selectedEmployeeEmployment.statusTone ===
                                    "warning"
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : "border-slate-200 bg-slate-100 text-slate-700"
                            )}
                          >
                            {selectedEmployeeEmployment.statusLabel}
                          </Badge>
                          {selectedEmployeeEmployment.employeeCode !==
                          EMPLOYEE_EMPTY_VALUE ? (
                            <Badge variant="outline" className="rounded-full">
                              رقم الموظف:{" "}
                              {selectedEmployeeEmployment.employeeCode}
                            </Badge>
                          ) : null}
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        className="w-full shrink-0 gap-2 rounded-full border-slate-200 bg-white text-slate-700 hover:bg-slate-50 sm:w-auto"
                        onClick={handleExportEmployeeExcelReport}
                        disabled={employeeReportExporting}
                      >
                        <Download className="h-4 w-4" />
                        {employeeReportExporting
                          ? "جارٍ إنشاء Excel..."
                          : "تصدير Excel"}
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className="bg-white p-5">
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <ReadonlyMeta
                        icon={Mail}
                        label="البريد"
                        value={
                          selectedEmployeeProfile?.personal?.email ||
                          selectedEmployee?.email ||
                          EMPLOYEE_EMPTY_VALUE
                        }
                        dir="ltr"
                      />
                      <ReadonlyMeta
                        icon={Phone}
                        label="الجوال"
                        value={
                          selectedEmployeeProfile?.personal?.phone ||
                          selectedEmployee?.phone ||
                          EMPLOYEE_EMPTY_VALUE
                        }
                        dir="ltr"
                      />
                      <ReadonlyMeta
                        icon={CalendarDays}
                        label="بداية العمل"
                        value={
                          selectedEmployeeEmployment.startDate
                            ? formatDateEN(selectedEmployeeEmployment.startDate)
                            : EMPLOYEE_EMPTY_VALUE
                        }
                      />
                      <ReadonlyMeta
                        icon={ShieldCheck}
                        label="رقم البصمة"
                        value={selectedEmployeeEmployment.fingerprintNumber}
                        dir="ltr"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card
                  id="employee-section-schedule"
                  ref={employeeScheduleSectionRef}
                  className={cn(
                    "order-18 scroll-mt-36 gap-0 overflow-hidden border-slate-200/80 bg-white/95 py-0 shadow-sm lg:scroll-mt-44",
                    activeEmployeeWorkspaceSection !== "schedule" && "hidden"
                  )}
                >
                  <CardHeader className="border-b border-slate-100 bg-white/90 px-6 pt-6 pb-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
                          <Clock3 className="h-5 w-5 text-[#030640]" />
                          جدول الدوام
                        </CardTitle>
                        <CardDescription className="text-sm leading-6 text-slate-500">
                          مصدر الحضور والغياب والتأخير واستثناء أيام الراحة من
                          احتساب الغياب.
                        </CardDescription>
                      </div>
                      <Badge
                        variant="outline"
                        className="w-fit rounded-full border-slate-200 bg-slate-50 text-slate-600 shadow-none"
                      >
                        {formatWeeklyOffDaysLabel(form.weeklyOffDays)}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-6 p-6">
                    <div className="grid gap-5 md:grid-cols-2">
                      <Field label="بداية الدوام">
                        <Input
                          type="time"
                          dir="ltr"
                          value={form.shiftStartTime}
                          onChange={event =>
                            handleFormChange(
                              "shiftStartTime",
                              event.target.value
                            )
                          }
                          className="h-11 bg-white text-center text-base font-semibold tabular-nums"
                          disabled={!canManageEmployees || saving}
                        />
                      </Field>

                      <Field label="نهاية الدوام">
                        <Input
                          type="time"
                          dir="ltr"
                          value={form.shiftEndTime}
                          onChange={event =>
                            handleFormChange("shiftEndTime", event.target.value)
                          }
                          className="h-11 bg-white text-center text-base font-semibold tabular-nums"
                          disabled={!canManageEmployees || saving}
                        />
                      </Field>
                    </div>

                    <div className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-900">
                          أيام الراحة الأسبوعية
                        </div>
                        <Badge
                          variant="outline"
                          className="rounded-full border-slate-200 bg-white text-slate-600"
                        >
                          {formatWeeklyOffDaysLabel(form.weeklyOffDays)}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                        {WORK_SCHEDULE_WEEKDAYS.map(day => {
                          const checked = form.weeklyOffDays.includes(
                            day.value
                          );
                          return (
                            <label
                              key={day.value}
                              className={cn(
                                "flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-2 py-2 text-xs font-semibold transition-colors",
                                checked
                                  ? "border-slate-900 bg-slate-950 text-white"
                                  : "border-slate-200 bg-white text-slate-600"
                              )}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={value =>
                                  handleToggleWeeklyOffDay(
                                    day.value,
                                    value === true
                                  )
                                }
                                disabled={!canManageEmployees || saving}
                                className="h-4 w-4 border-slate-300 data-[state=checked]:border-white data-[state=checked]:bg-white data-[state=checked]:text-slate-950"
                              />
                              {day.shortLabel}
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-3 rounded-[20px] border border-slate-200 bg-slate-50/70 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-900">
                          موقع العمل ونطاقات الحضور
                        </div>
                        <Badge
                          variant="outline"
                          className="rounded-full border-slate-200 bg-white text-slate-600"
                        >
                          {formatNumberEN(form.allowedZoneIds.length)} نطاق
                        </Badge>
                      </div>

                      {workZonesLoading ? (
                        <div className="text-sm text-slate-500">
                          جارٍ تحميل مناطق العمل...
                        </div>
                      ) : workZones.length ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          {workZones.map(zone => {
                            const checked = form.allowedZoneIds.includes(
                              zone.id
                            );
                            return (
                              <label
                                key={zone.id}
                                className={cn(
                                  "flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-3 transition-colors",
                                  checked
                                    ? "border-[#F2B705]/45 bg-[#F2B705]/10"
                                    : "border-slate-200 bg-white"
                                )}
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={value =>
                                    handleToggleAllowedZone(
                                      zone.id,
                                      value === true
                                    )
                                  }
                                  disabled={!canManageEmployees || saving}
                                  className="mt-1"
                                />
                                <span className="min-w-0 flex-1 space-y-1">
                                  <span className="text-sm font-semibold text-slate-950">
                                    {zone.name}
                                  </span>
                                  <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                    <MapPin className="h-3.5 w-3.5" />
                                    Radius {formatZoneRadiusLabel(zone)}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-[16px] border border-dashed border-slate-200 bg-white px-4 py-6 text-sm leading-6 text-slate-500">
                          لا توجد نطاقات عمل مضافة حتى الآن.
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <div
                  id="employee-section-attendance"
                  ref={employeeAttendanceSectionRef}
                  className={cn(
                    "order-20 scroll-mt-36 lg:scroll-mt-44",
                    activeEmployeeWorkspaceSection !== "attendance" && "hidden"
                  )}
                >
                  <EmployeeTodayAttendancePanel
                    employeeUid={selectedEmployeeAuthUid || null}
                    employeeDocId={selectedEmployeeDocumentId || null}
                    shiftStartTime={selectedEmployeeShiftSchedule.startTime}
                    shiftEndTime={selectedEmployeeShiftSchedule.endTime}
                    weeklyOffDays={selectedEmployeeShiftSchedule.weeklyOffDays}
                    approvedLeaveRequests={approvedLeaveRequests}
                    absenceDateKeys={employeeAbsences.map(
                      absence => absence.date
                    )}
                    canManageAttendance={canManageEmployees}
                    title="سجل حضور الموظف الشهري"
                    description="عرض إداري لكل عمليات الحضور والانصراف المقبولة فعليًا لهذا الموظف خلال الشهر الحالي."
                  />

                  <Card className="mt-6 gap-0 overflow-hidden border-slate-200/80 bg-white/95 py-0 shadow-sm">
                    <CardHeader className="border-b border-slate-100 bg-white/90 px-6 pt-6 pb-4">
                      <div className="space-y-2">
                        <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
                          <CalendarDays className="h-5 w-5 text-[#030640]" />
                          تسجيل غياب
                        </CardTitle>
                        <CardDescription className="text-sm leading-6 text-slate-500">
                          سجل الغياب الحالي أو بأثر رجعي من قسم الحضور، وسيتم
                          احتسابه عند إنشاء سجل راتب الشهر المحدد.
                        </CardDescription>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-5 p-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="تاريخ الغياب">
                          <NativeDatePickerInput
                            value={absenceForm.date}
                            onValueChange={value =>
                              handleAbsenceFormChange("date", value)
                            }
                            disabled={!canManageEmployees || savingAbsence}
                          />
                        </Field>

                        <Field label="نوع الغياب">
                          <Select
                            value={absenceForm.type}
                            onValueChange={value =>
                              handleAbsenceFormChange(
                                "type",
                                value as EmployeeAbsenceType
                              )
                            }
                            disabled={!canManageEmployees || savingAbsence}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="اختر نوع الغياب" />
                            </SelectTrigger>
                            <SelectContent>
                              {EMPLOYEE_ABSENCE_TYPE_OPTIONS.map(option => (
                                <SelectItem
                                  key={option.value}
                                  value={String(option.value)}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>

                      <Field
                        label="ملاحظات"
                        description="حقل اختياري لتوضيح سبب الغياب أو أي ملاحظة داخلية."
                      >
                        <Textarea
                          value={absenceForm.note}
                          onChange={event =>
                            handleAbsenceFormChange("note", event.target.value)
                          }
                          placeholder="مثال: غياب بعذر أو نصف يوم لمراجعة شخصية"
                          className="min-h-24"
                          disabled={!canManageEmployees || savingAbsence}
                        />
                      </Field>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          onClick={handleCreateEmployeeAbsence}
                          disabled={!canManageEmployees || savingAbsence}
                        >
                          {savingAbsence ? "جاري التسجيل..." : "تسجيل الغياب"}
                        </Button>
                      </div>

                      <div className="space-y-3 border-t border-slate-200 pt-4">
                        <div className="text-sm font-semibold text-slate-950">
                          سجل الغياب
                        </div>

                        {employeeAbsencesLoading ? (
                          <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                            جاري تحميل الغيابات...
                          </div>
                        ) : employeeAbsences.length ? (
                          <div className="space-y-3">
                            {employeeAbsences.slice(0, 6).map(absence => (
                              <div
                                key={absence.id}
                                className="rounded-[18px] border border-slate-200 bg-slate-50/70 p-4"
                              >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="space-y-1">
                                    <div className="text-sm font-semibold text-slate-950">
                                      {formatEmployeeAbsenceDate(absence.date)}
                                    </div>
                                    <div className="text-xs leading-6 text-slate-500">
                                      {absence.note || "بدون ملاحظات"}
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap gap-2">
                                    <Badge
                                      variant="outline"
                                      className="rounded-full border-amber-200 bg-amber-50 text-amber-800"
                                    >
                                      {getEmployeeAbsenceTypeLabel(
                                        absence.type
                                      )}
                                    </Badge>
                                    <Badge
                                      variant="outline"
                                      className="rounded-full border-slate-200 bg-white text-slate-600"
                                    >
                                      {formatDateTimeEN(absence.createdAt)}
                                    </Badge>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-8 rounded-full border-rose-200 px-3 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                      onClick={() =>
                                        void handleDeleteEmployeeAbsence(
                                          absence
                                        )
                                      }
                                      disabled={
                                        !canManageEmployees ||
                                        deletingAbsenceId === absence.id
                                      }
                                    >
                                      {deletingAbsenceId === absence.id ? (
                                        <Loader2 className="ml-1.5 h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Trash2 className="ml-1.5 h-3.5 w-3.5" />
                                      )}
                                      حذف الغياب
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                            لا توجد غيابات مسجلة لهذا الموظف حتى الآن.
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card
                  id="employee-section-messages"
                  ref={employeeMessagesSectionRef}
                  className={cn(
                    "order-40 scroll-mt-36 gap-0 overflow-hidden border-slate-200/80 bg-white/95 py-0 shadow-sm lg:scroll-mt-44",
                    activeEmployeeWorkspaceSection !== "messages" && "hidden"
                  )}
                >
                  <CardHeader className="border-b border-slate-100 bg-white/90 px-6 pt-6 pb-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                          <Mail className="h-4 w-4" />
                          التواصل الداخلي
                        </div>
                        <div className="text-2xl font-semibold tracking-tight text-slate-950">
                          رسائل HR مع الموظف
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <LeaveOverviewStat
                          icon={Mail}
                          label="إجمالي الرسائل"
                          value={formatNumberEN(employeeMessages.length)}
                        />
                        <LeaveOverviewStat
                          icon={Clock3}
                          label="بانتظار القراءة"
                          value={formatNumberEN(unreadEmployeeMessagesCount)}
                        />
                        <LeaveOverviewStat
                          icon={CheckCircle2}
                          label="تمت قراءتها"
                          value={formatNumberEN(readEmployeeMessagesCount)}
                        />
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-5">
                    <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
                      <div className="space-y-4" dir="rtl">
                        <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/75 p-4 text-right">
                          <div className="mb-3 text-sm font-semibold text-slate-900">
                            سجل المحادثات
                          </div>

                          {employeeMessagesLoading ? (
                            <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                              جارٍ تحميل الرسائل...
                            </div>
                          ) : employeeConversations.length ? (
                            <div className="space-y-2">
                              {employeeConversations.map(conversation => {
                                const latestMessage =
                                  conversation.latestMessage;
                                const isActive =
                                  conversation.id ===
                                  activeEmployeeConversationId;
                                const latestFromEmployee =
                                  latestMessage.fromUserId ===
                                  selectedEmployeeAuthUid;

                                return (
                                  <button
                                    key={conversation.id}
                                    type="button"
                                    onClick={() =>
                                      handleSelectEmployeeConversation(
                                        conversation
                                      )
                                    }
                                    className={cn(
                                      "w-full min-w-0 rounded-[22px] border px-4 py-4 text-right transition-all",
                                      isActive
                                        ? "border-slate-900 bg-slate-900 text-white shadow-[0_20px_42px_-28px_rgba(15,23,42,0.75)]"
                                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                                    )}
                                  >
                                    <div className="flex min-w-0 items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <Badge
                                            variant="outline"
                                            className={cn(
                                              "rounded-full shadow-none",
                                              isActive
                                                ? "border-white/20 bg-white/10 text-white"
                                                : "border-slate-200 bg-slate-50 text-slate-600"
                                            )}
                                          >
                                            {latestMessage.typeLabel}
                                          </Badge>
                                          <Badge
                                            variant="outline"
                                            className={cn(
                                              "rounded-full shadow-none",
                                              isActive
                                                ? "border-white/20 bg-white/10 text-white"
                                                : latestFromEmployee
                                                  ? "border-[#030640]/15 bg-[#030640]/5 text-[#030640]"
                                                  : "border-slate-200 bg-slate-100 text-slate-600"
                                            )}
                                          >
                                            {latestFromEmployee
                                              ? "الموظف"
                                              : "HR"}
                                          </Badge>
                                          {conversation.unreadCount > 0 ? (
                                            <Badge className="rounded-full bg-[#F2B705] text-slate-950 hover:bg-[#F2B705]">
                                              {conversation.unreadCount} جديد
                                            </Badge>
                                          ) : null}
                                        </div>

                                        <div className="mt-3 min-w-0 text-sm font-semibold">
                                          {latestFromEmployee
                                            ? latestMessage.fromUserName ||
                                              "الموظف"
                                            : latestMessage.toUserName ||
                                              "الموظف"}
                                        </div>
                                        <div
                                          className={cn(
                                            "mt-2 min-w-0 text-right text-sm leading-7 line-clamp-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
                                            isActive
                                              ? "text-white/80"
                                              : "text-slate-600"
                                          )}
                                        >
                                          {latestMessage.preview ||
                                            "لا يوجد نص محفوظ لهذه الرسالة."}
                                        </div>
                                      </div>

                                      <div
                                        className={cn(
                                          "shrink-0 whitespace-nowrap pt-0.5 text-[11px]",
                                          isActive
                                            ? "text-white/70"
                                            : "text-slate-500"
                                        )}
                                      >
                                        {latestMessage.createdAtDate
                                          ? formatDateTimeEN(
                                              latestMessage.createdAtDate
                                            )
                                          : "تاريخ غير متوفر"}
                                      </div>
                                    </div>

                                    <div
                                      className={cn(
                                        "mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs",
                                        isActive
                                          ? "border-white/10 text-white/70"
                                          : "border-slate-200 text-slate-500"
                                      )}
                                    >
                                      <span>
                                        {conversation.messages.length} رسالة
                                        داخل السجل
                                      </span>
                                      <span>
                                        {latestFromEmployee
                                          ? "آخر تحديث من الموظف"
                                          : "آخر تحديث من HR"}
                                      </span>
                                    </div>
                                    {openingEmployeeConversationId ===
                                    conversation.id ? (
                                      <div
                                        className={cn(
                                          "mt-2 text-xs",
                                          isActive
                                            ? "text-white/70"
                                            : "text-slate-500"
                                        )}
                                      >
                                        جارٍ تحديث حالة القراءة...
                                      </div>
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                              لا توجد رسائل داخلية لهذا الموظف بعد.
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-4" dir="rtl">
                        <div className="space-y-5 text-right">
                          {activeEmployeeConversation ? (
                            <div className="space-y-5">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className="rounded-full border-[#F2B705]/35 bg-[#F2B705]/10 text-[#8b6700] shadow-none"
                                  >
                                    {
                                      activeEmployeeConversation.latestMessage
                                        .typeLabel
                                    }
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className="rounded-full border-slate-200 bg-white text-slate-600 shadow-none"
                                  >
                                    {activeEmployeeConversation.messages.length}{" "}
                                    رسالة داخل نفس السجل
                                  </Badge>
                                </div>

                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={handleCloseEmployeeConversation}
                                >
                                  إغلاق
                                </Button>
                              </div>

                              <div className="grid gap-3 md:grid-cols-3">
                                <ReadonlyMeta
                                  icon={Mail}
                                  label="المسار"
                                  value={
                                    composeEmployeeMessageAsNew ||
                                    !activeEmployeeConversation
                                      ? "رسالة جديدة"
                                      : "رد داخل المحادثة الحالية"
                                  }
                                />
                                <ReadonlyMeta
                                  icon={UserRound}
                                  label="الموظف"
                                  value={
                                    activeEmployeeConversation.latestMessage
                                      .toUserName ||
                                    activeEmployeeConversation.latestMessage
                                      .fromUserName ||
                                    "الموظف"
                                  }
                                />
                                <ReadonlyMeta
                                  icon={Clock3}
                                  label="آخر تحديث"
                                  value={formatDateTimeEN(
                                    activeEmployeeConversation.latestMessage
                                      .createdAtDate
                                  )}
                                />
                              </div>

                              <div className="space-y-4 pt-1" dir="ltr">
                                {activeEmployeeConversation.messages.map(
                                  message => {
                                    const ownMessage =
                                      message.fromUserId === user?.uid;
                                    const fromEmployee =
                                      message.fromUserId ===
                                      selectedEmployeeAuthUid;
                                    return (
                                      <div
                                        key={message.id}
                                        className={cn(
                                          "max-w-[92%] rounded-[24px] border px-5 py-4 text-right shadow-[0_18px_40px_-32px_rgba(15,23,42,0.32)] sm:max-w-[84%]",
                                          fromEmployee
                                            ? "mr-auto border-[#E7D8AA] bg-[#FBF7E8] text-slate-900"
                                            : "ml-auto border-slate-200 bg-white text-slate-800"
                                        )}
                                        dir="rtl"
                                      >
                                        <div className="flex flex-wrap items-center gap-2">
                                          <Badge
                                            variant="outline"
                                            className={cn(
                                              "rounded-full shadow-none",
                                              fromEmployee
                                                ? "border-[#E7D8AA] bg-white text-[#8b6700]"
                                                : "border-slate-200 bg-slate-50 text-slate-700"
                                            )}
                                          >
                                            {fromEmployee
                                              ? message.fromUserName || "الموظف"
                                              : message.fromUserName || "HR"}
                                          </Badge>
                                          <Badge
                                            variant="outline"
                                            className={cn(
                                              "rounded-full shadow-none",
                                              fromEmployee
                                                ? "border-[#E7D8AA] bg-[#F8F2DD] text-[#8b6700]"
                                                : "border-slate-200 bg-white text-slate-500"
                                            )}
                                          >
                                            {fromEmployee
                                              ? "رسالة موظف"
                                              : "رسالة HR"}
                                          </Badge>
                                          <Badge
                                            variant="outline"
                                            className="rounded-full border-slate-200 bg-white text-slate-500 shadow-none"
                                          >
                                            {message.typeLabel}
                                          </Badge>
                                        </div>

                                        <div className="mt-4 whitespace-pre-wrap break-words text-[0.97rem] leading-8 text-slate-800 [overflow-wrap:anywhere]">
                                          {message.body ||
                                            "لا يوجد نص محفوظ لهذه الرسالة."}
                                        </div>

                                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-3 text-xs text-slate-500">
                                          <span>
                                            {message.createdAtDate
                                              ? formatDateTimeEN(
                                                  message.createdAtDate
                                                )
                                              : "تاريخ غير متوفر"}
                                          </span>
                                          <span>
                                            {ownMessage
                                              ? message.isRead &&
                                                message.readAtDate
                                                ? `تمت القراءة في ${formatDateTimeEN(
                                                    message.readAtDate
                                                  )}`
                                                : "بانتظار القراءة"
                                              : "وارد من الموظف"}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  }
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-[20px] border border-dashed border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500">
                              اختر محادثة من القائمة لعرض سجلها هنا.
                            </div>
                          )}
                        </div>

                        <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/75 p-5">
                          <div className="mb-4 space-y-1">
                            <div className="text-sm font-semibold text-slate-900">
                              {composeEmployeeMessageAsNew ||
                              !activeEmployeeConversation
                                ? "إرسال رسالة جديدة"
                                : "الرد داخل المحادثة المحددة"}
                            </div>
                            <p className="text-sm leading-6 text-slate-500">
                              {composeEmployeeMessageAsNew ||
                              !activeEmployeeConversation
                                ? "ستصل الرسالة للموظف داخل صفحة الرسائل، مع تنبيه داخلي مباشر."
                                : "سيتم إلحاق الرسالة بالمحادثة الحالية بحيث يظهر الرد من الموظف داخل نفس السجل."}
                            </p>
                          </div>

                          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                            <span>
                              {composeEmployeeMessageAsNew ||
                              !activeEmployeeConversation
                                ? "الوضع الحالي: بدء محادثة جديدة"
                                : "الوضع الحالي: الرد على المحادثة المحددة"}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() =>
                                setComposeEmployeeMessageAsNew(
                                  current => !current
                                )
                              }
                              disabled={
                                sendingEmployeeMessage ||
                                !activeEmployeeConversation
                              }
                            >
                              {composeEmployeeMessageAsNew
                                ? "الرد داخل المحادثة الحالية"
                                : "بدء محادثة جديدة"}
                            </Button>
                          </div>

                          <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                            <Field label="نوع الرسالة">
                              <Select
                                value={employeeMessageForm.type}
                                onValueChange={value =>
                                  handleEmployeeMessageFormChange(
                                    "type",
                                    value as EmployeeMessageType
                                  )
                                }
                                disabled={
                                  !canManageEmployees || sendingEmployeeMessage
                                }
                              >
                                <SelectTrigger className="w-full bg-white">
                                  <SelectValue placeholder="اختر نوع الرسالة" />
                                </SelectTrigger>
                                <SelectContent>
                                  {EMPLOYEE_MESSAGE_TYPE_OPTIONS.map(option => (
                                    <SelectItem
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </Field>

                            <Field label="نص الرسالة">
                              <Textarea
                                value={employeeMessageForm.message}
                                onChange={event =>
                                  handleEmployeeMessageFormChange(
                                    "message",
                                    event.target.value
                                  )
                                }
                                placeholder="اكتب الرسالة الداخلية التي ستصل إلى الموظف"
                                className="min-h-36 resize-y bg-white text-right leading-7 [direction:rtl]"
                                disabled={
                                  !canManageEmployees || sendingEmployeeMessage
                                }
                              />
                            </Field>
                          </div>

                          <div className="mt-4 flex flex-row-reverse gap-3 w-full">
                            <Button
                              type="button"
                              className="bg-[#F2B705] text-slate-950 hover:bg-[#e0ab00]"
                              onClick={() => void handleSendEmployeeMessage()}
                              disabled={
                                !canManageEmployees || sendingEmployeeMessage
                              }
                            >
                              <Mail className="ml-2 h-4 w-4" />
                              {sendingEmployeeMessage
                                ? "جارٍ الإرسال..."
                                : composeEmployeeMessageAsNew ||
                                    !activeEmployeeConversation
                                  ? "إرسال الرسالة"
                                  : "إرسال الرد"}
                            </Button>

                            <Button
                              type="button"
                              variant="outline"
                              onClick={resetEmployeeMessageForm}
                              disabled={
                                sendingEmployeeMessage ||
                                (!employeeMessageForm.message.trim() &&
                                  employeeMessageForm.type === "message")
                              }
                            >
                              إعادة ضبط
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card
                  id="employee-section-files"
                  ref={employeeFilesSectionRef}
                  className={cn(
                    "order-50 scroll-mt-36 gap-0 overflow-hidden border-slate-200/80 bg-white/95 py-0 shadow-sm lg:scroll-mt-44",
                    activeEmployeeWorkspaceSection !== "files" && "hidden"
                  )}
                >
                  <CardHeader className="border-b border-slate-100 bg-white/90 px-6 pt-6 pb-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                          <FileText className="h-4 w-4" />
                          الملفات الداخلية
                        </div>
                        <div className="text-2xl font-semibold tracking-tight text-slate-950">
                          رفع وعرض ملفات الموظف
                        </div>
                        <p className="max-w-2xl text-sm leading-7 text-slate-500">
                          يمكن للموارد البشرية رفع ملف جديد لهذا الموظف، وسيظهر
                          داخل حسابه مع حالة القراءة وتاريخ الاطلاع.
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <LeaveOverviewStat
                          icon={FileText}
                          label="النسخ الحالية"
                          value={String(visibleEmployeeFiles.length)}
                        />
                        <LeaveOverviewStat
                          icon={
                            unreadEmployeeFilesCount > 0 ? Clock3 : CheckCircle2
                          }
                          label="ملفات جديدة"
                          value={String(unreadEmployeeFilesCount)}
                        />
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-5">
                    <div className="space-y-6">
                      {archivedEmployeeFilesCount > 0 ? (
                        <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                          يتم إخفاء {archivedEmployeeFilesCount} من النسخ
                          المستبدلة عن القائمة الأساسية.
                        </div>
                      ) : null}

                      <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.42fr)_minmax(0,0.58fr)]">
                        <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-5">
                          <div className="space-y-4">
                            {replacingEmployeeFile ? (
                              <div className="rounded-[18px] border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-800">
                                <div className="font-semibold">
                                  وضع الاستبدال مفعل
                                </div>
                                <div className="mt-1">
                                  سيتم رفع نسخة معدلة بدل الملف:{" "}
                                  {replacingEmployeeFile.title}
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="mt-3 rounded-full border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-100"
                                  onClick={resetEmployeeFileForm}
                                  disabled={uploadingEmployeeFile}
                                >
                                  إلغاء الاستبدال
                                </Button>
                              </div>
                            ) : null}

                            <Field label="عنوان الملف">
                              <Input
                                value={employeeFileForm.title}
                                onChange={event =>
                                  handleEmployeeFileFormChange(
                                    "title",
                                    event.target.value
                                  )
                                }
                                placeholder="مثال: خطاب مباشرة العمل"
                                disabled={
                                  !canManageEmployees || uploadingEmployeeFile
                                }
                              />
                            </Field>

                            <Field label="وصف الملف">
                              <Textarea
                                value={employeeFileForm.description}
                                onChange={event =>
                                  handleEmployeeFileFormChange(
                                    "description",
                                    event.target.value
                                  )
                                }
                                placeholder="أضف وصفًا بسيطًا للملف"
                                className="min-h-28"
                                disabled={
                                  !canManageEmployees || uploadingEmployeeFile
                                }
                              />
                            </Field>

                            <Field label="نوع الملف">
                              <Select
                                value={employeeFileForm.fileType}
                                onValueChange={value =>
                                  handleEmployeeFileFormChange(
                                    "fileType",
                                    value
                                  )
                                }
                                disabled={
                                  !canManageEmployees || uploadingEmployeeFile
                                }
                              >
                                <SelectTrigger className="w-full bg-white">
                                  <SelectValue placeholder="اختر نوع الملف" />
                                </SelectTrigger>
                                <SelectContent>
                                  {EMPLOYEE_FILE_TYPE_OPTIONS.filter(
                                    option =>
                                      !["cv", "education_certificate"].includes(
                                        option.value
                                      )
                                  ).map(option => (
                                    <SelectItem
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </Field>

                            <Field label="ملف الموظف">
                              <Input
                                id="employee-file-input"
                                ref={employeeFileInputRef}
                                type="file"
                                className="sr-only"
                                onChange={handleEmployeeFileSelected}
                                disabled={
                                  !canManageEmployees || uploadingEmployeeFile
                                }
                              />
                              <div
                                role="button"
                                tabIndex={
                                  canManageEmployees && !uploadingEmployeeFile
                                    ? 0
                                    : -1
                                }
                                onClick={() =>
                                  employeeFileInputRef.current?.click()
                                }
                                onKeyDown={event => {
                                  if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                  ) {
                                    event.preventDefault();
                                    employeeFileInputRef.current?.click();
                                  }
                                }}
                                onDragOver={event => event.preventDefault()}
                                onDrop={handleEmployeeFileDrop}
                                className={cn(
                                  "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600 transition hover:border-[#F2B705] hover:bg-[#F2B705]/5",
                                  (!canManageEmployees ||
                                    uploadingEmployeeFile) &&
                                    "pointer-events-none cursor-not-allowed opacity-60"
                                )}
                              >
                                <Upload className="h-6 w-6 text-slate-500" />
                                {employeeFileForm.file ? (
                                  <div className="space-y-1">
                                    <div className="font-semibold text-slate-900">
                                      {employeeFileForm.file.name}
                                    </div>
                                    <div>
                                      الحجم:{" "}
                                      {formatFileSizeEN(
                                        employeeFileForm.file.size
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-1">
                                    <div className="font-semibold text-slate-900">
                                      اسحب الملف هنا أو انقر للاختيار
                                    </div>
                                    <div>
                                      سيتم إرفاق الملف ضمن ملفات الموظف.
                                    </div>
                                  </div>
                                )}
                              </div>
                            </Field>

                            <Button
                              type="button"
                              className="w-full bg-[#F2B705] text-slate-950 hover:bg-[#e0ab00]"
                              onClick={() => void handleUploadEmployeeFile()}
                              disabled={
                                !canManageEmployees || uploadingEmployeeFile
                              }
                            >
                              <Upload className="ml-2 h-4 w-4" />
                              {uploadingEmployeeFile
                                ? "جارٍ رفع الملف..."
                                : replacingEmployeeFile
                                  ? "رفع نسخة معدلة"
                                  : "رفع ملف"}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-4">
                          {employeeFilesLoading ? (
                            <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                              جاري تحميل ملفات الموظف...
                            </div>
                          ) : visibleEmployeeFiles.length ? (
                            visibleEmployeeFiles.map(file => (
                              <div
                                key={file.id}
                                className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 shadow-sm"
                              >
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="min-w-0 space-y-2.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <EmployeeFileVersionBadge file={file} />
                                      <EmployeeFileStatusBadge file={file} />
                                      <Badge
                                        variant="outline"
                                        className="rounded-full bg-white shadow-none"
                                      >
                                        {file.fileTypeLabel}
                                      </Badge>
                                    </div>

                                    <div>
                                      <div className="text-base font-semibold text-slate-950">
                                        {file.title}
                                      </div>
                                      <div className="mt-1 text-sm text-slate-500">
                                        {file.uploadedAtDate
                                          ? `تاريخ الرفع: ${formatDateTimeEN(file.uploadedAtDate)}`
                                          : "تاريخ الرفع غير متوفر"}
                                      </div>
                                    </div>

                                    <p className="text-sm leading-6 text-slate-500">
                                      {file.description ||
                                        "لا يوجد وصف لهذا الملف."}
                                    </p>

                                    <div className="flex flex-wrap gap-1.5">
                                      <EmployeeFileMetaBadge
                                        label={file.fileName}
                                        dir="ltr"
                                      />
                                      <EmployeeFileMetaBadge
                                        label={formatFileSizeEN(
                                          file.fileSize ?? null
                                        )}
                                      />
                                      <EmployeeFileMetaBadge
                                        label={file.contentType || "بدون نوع"}
                                      />
                                      {file.uploadedByName ? (
                                        <EmployeeFileMetaBadge
                                          label={`بواسطة: ${file.uploadedByName}`}
                                        />
                                      ) : null}
                                    </div>

                                    <div
                                      className={cn(
                                        "text-xs",
                                        file.isRead
                                          ? "text-emerald-700"
                                          : "text-amber-700"
                                      )}
                                    >
                                      {file.isRead && file.readAtDate
                                        ? `تمت القراءة في ${formatDateTimeEN(file.readAtDate)}`
                                        : "الملف لم يُفتح بعد من الموظف."}
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap gap-1.5 lg:justify-end">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="rounded-full"
                                      onClick={() =>
                                        handleStartEmployeeFileReplacement(file)
                                      }
                                      disabled={
                                        !canManageEmployees ||
                                        uploadingEmployeeFile
                                      }
                                    >
                                      <Upload className="ml-2 h-4 w-4" />
                                      استبدال الملف
                                    </Button>

                                    {file.viewUrl ? (
                                      <Button
                                        asChild
                                        variant="outline"
                                        size="sm"
                                        className="rounded-full"
                                      >
                                        <a
                                          href={file.viewUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          <Eye className="ml-2 h-4 w-4" />
                                          معاينة
                                        </a>
                                      </Button>
                                    ) : null}

                                    {file.downloadUrl ? (
                                      <Button
                                        asChild
                                        size="sm"
                                        className="rounded-full"
                                      >
                                        <a
                                          href={file.downloadUrl}
                                          rel="noreferrer"
                                          download={file.fileName || true}
                                        >
                                          <Download className="ml-2 h-4 w-4" />
                                          تحميل
                                        </a>
                                      </Button>
                                    ) : null}

                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="sm"
                                      className="rounded-full"
                                      onClick={() =>
                                        void handleDeleteEmployeeFile(file)
                                      }
                                      disabled={
                                        !canManageEmployees ||
                                        deletingEmployeeFileId === file.id
                                      }
                                    >
                                      <Trash2 className="ml-2 h-4 w-4" />
                                      {deletingEmployeeFileId === file.id
                                        ? "جارٍ الحذف..."
                                        : "حذف"}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <Empty className="min-h-[320px] rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70">
                              <EmptyHeader>
                                <EmptyMedia
                                  variant="icon"
                                  className="bg-[#F2B705]/12 text-[#030640]"
                                >
                                  <Inbox className="size-5" />
                                </EmptyMedia>
                                <EmptyTitle>
                                  لا توجد ملفات لهذا الموظف
                                </EmptyTitle>
                                <EmptyDescription>
                                  ارفع أول ملف من النموذج المجاور ليظهر هنا وفي
                                  حساب الموظف مباشرة.
                                </EmptyDescription>
                              </EmptyHeader>
                            </Empty>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card
                  id="employee-section-salary"
                  ref={employeeSalarySectionRef}
                  className={cn(
                    "order-25 scroll-mt-36 gap-0 overflow-hidden border-slate-200/80 bg-white/95 py-0 shadow-sm lg:scroll-mt-44",
                    activeEmployeeWorkspaceSection !== "salary" && "hidden"
                  )}
                >
                  <CardHeader className="border-b border-white/70 bg-white/70 px-6 py-4 backdrop-blur">
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                          <BadgeCheck className="h-4 w-4" />
                          الرواتب
                        </div>
                        <div className="text-2xl font-semibold tracking-tight text-slate-950">
                          قفل الراتب وسجل الرواتب
                        </div>
                        <p className="max-w-2xl text-sm leading-7 text-slate-500">
                          احتساب راتب نهاية الشهر من الحضور والغياب والتأخير
                          والأوفر تايم، ثم حفظ السجل الشهري.
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <LeaveOverviewStat
                          icon={BadgeCheck}
                          label="الراتب الأساسي"
                          value={`${formatNumberEN(baseSalaryNumber || 0)} ر.س`}
                        />
                        <LeaveOverviewStat
                          icon={Plus}
                          label="البدلات الثابتة"
                          value={`${formatNumberEN(totalAllowances || 0)} ر.س`}
                        />
                        <LeaveOverviewStat
                          icon={Clock3}
                          label="ساعات العمل"
                          value={`${formatHoursDuration(payrollRateWorkHours)} / ${formatNumberEN(expectedWorkDaysNumber || 0)} يوم`}
                        />
                        <LeaveOverviewStat
                          icon={CheckCircle2}
                          label="بعد التأمينات"
                          value={`${formatNumberEN(baseSalaryAfterInsurance || 0)} ر.س`}
                        />
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 p-4">
                    <div className="space-y-4">
                      <div className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
                        <div className="space-y-4">
                          <div className="max-w-3xl space-y-2">
                            <div className="text-base font-semibold text-slate-950">
                              قفل راتب نهاية الشهر
                            </div>
                            <p className="text-sm leading-7 text-slate-500">
                              اضبط شهر الراتب، احسب الحضور، أضف الخصومات
                              الداخلية ثم أنشئ سجلًا مستقلًا يحفظ نتيجة هذا
                              الشهر.
                            </p>
                          </div>

                          <div className="space-y-4">
                            <div className="max-w-xs">
                              <Field label="الشهر المستهدف">
                                <NativeDatePickerInput
                                  type="month"
                                  value={payrollMonthInput}
                                  onValueChange={value =>
                                    setPayrollMonthInput(value)
                                  }
                                  disabled={
                                    !canManageEmployees || creatingPayrollRecord
                                  }
                                />
                              </Field>
                            </div>

                            <div className="space-y-4 rounded-[22px] border border-slate-200 bg-white p-4">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div className="space-y-1">
                                  <div className="text-sm font-semibold text-slate-950">
                                    وقت الدوام واحتساب الحضور
                                  </div>
                                  <p className="text-xs leading-6 text-slate-500">
                                    يقرأ وقت الدوام من بيانات الموظف المحفوظة
                                    ويستخدمه في حساب التأخير والأوفر تايم لهذا
                                    الشهر.
                                  </p>
                                  {selectedPayrollMonthMeta ? (
                                    <div className="space-y-1 text-xs leading-6 text-slate-500">
                                      {selectedPayrollCalculationRange ? (
                                        <p>
                                          نطاق الاحتساب:{" "}
                                          {selectedPayrollCalculationRange.isCurrentMonth
                                            ? "من بداية الشهر حتى اليوم"
                                            : `${formatPayrollCalculationDate(
                                                selectedPayrollCalculationRange.calculationStartDate
                                              )} إلى ${formatPayrollCalculationDate(
                                                selectedPayrollCalculationRange.calculationEndDate
                                              )}`}
                                        </p>
                                      ) : null}
                                      {selectedPayrollCalculationRange
                                        ?.isFutureMonth ? (
                                        <p className="font-semibold text-red-600">
                                          لا يمكن احتساب الحضور لشهر مستقبلي.
                                        </p>
                                      ) : selectedPayrollCalculationRange
                                          ?.excludesFutureDays ? (
                                        <p className="font-semibold text-slate-600">
                                          الأيام المستقبلية غير محسوبة.
                                        </p>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>

                                <Button
                                  type="button"
                                  className="h-11 w-full rounded-[16px] bg-[#030640] px-5 text-white shadow-sm hover:bg-[#11154d] lg:w-auto"
                                  onClick={() =>
                                    void handleCalculatePayrollFromAttendance()
                                  }
                                  disabled={
                                    !canManageEmployees ||
                                    saving ||
                                    attendancePayrollLoading ||
                                    !selectedPayrollMonthMeta ||
                                    selectedPayrollCalculationRange
                                      ?.isFutureMonth
                                  }
                                >
                                  {attendancePayrollLoading ? (
                                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <Clock3 className="ml-2 h-4 w-4" />
                                  )}
                                  {attendancePayrollLoading
                                    ? "جاري احتساب الحضور..."
                                    : selectedPayrollCalculationRange
                                        ?.isCurrentMonth
                                      ? "احتساب الحضور حتى اليوم"
                                      : "احتساب حضور الشهر"}
                                </Button>
                              </div>

                              <div
                                className={cn(
                                  "rounded-[18px] border px-4 py-3 text-sm font-semibold",
                                  selectedEmployeeShiftSchedule.startTime &&
                                    selectedEmployeeShiftSchedule.endTime
                                    ? "border-slate-200 bg-slate-50 text-slate-800"
                                    : "border-red-200 bg-red-50 text-red-700"
                                )}
                              >
                                وقت الدوام المعتمد لهذا الموظف:{" "}
                                {selectedEmployeeScheduleLabel}
                                <div className="mt-1 text-xs font-medium leading-5 text-slate-500">
                                  أيام الراحة:{" "}
                                  {formatWeeklyOffDaysLabel(
                                    selectedEmployeeShiftSchedule.weeklyOffDays
                                  )}{" "}
                                  · أيام العمل داخل نطاق الاحتساب:{" "}
                                  {formatNumberEN(
                                    selectedPayrollCalculationRange?.isFutureMonth
                                      ? 0
                                      : payrollAttendanceWorkDateKeys.length
                                  )}{" "}
                                  يوم
                                </div>
                                {!selectedEmployeeShiftSchedule.startTime ||
                                !selectedEmployeeShiftSchedule.endTime ? (
                                  <div className="mt-1 text-xs font-medium leading-5">
                                    يجب تحديد وقت الدوام من بيانات الموظف قبل
                                    الاحتساب من الحضور
                                  </div>
                                ) : null}
                              </div>

                              {attendancePayrollSummary ? (
                                <div className="grid gap-3 text-sm sm:grid-cols-2">
                                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    التأخير:{" "}
                                    {formatHoursDuration(
                                      attendancePayrollSummary.lateHours
                                    )}
                                  </div>
                                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    النقص:{" "}
                                    {formatHoursDuration(
                                      attendancePayrollSummary.missingHours
                                    )}
                                  </div>
                                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    الأوفر تايم:{" "}
                                    {formatHoursDuration(
                                      attendancePayrollSummary.overtimeHours
                                    )}
                                  </div>
                                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    أيام مكتملة:{" "}
                                    {formatNumberEN(
                                      attendancePayrollSummary.completeDays
                                    )}
                                  </div>
                                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                                    غياب:{" "}
                                    {formatNumberEN(attendanceAbsentDaysNumber)}{" "}
                                    أيام
                                  </div>
                                </div>
                              ) : null}
                            </div>

                            <div className="space-y-4 rounded-[22px] border border-slate-200 bg-white p-4">
                              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                                <div className="space-y-1">
                                  <div className="text-sm font-semibold text-slate-950">
                                    الخصومات اليدوية
                                  </div>
                                  <p className="text-xs leading-6 text-slate-500">
                                    أضف خصومات داخلية فقط مثل الغياب أو التأخير
                                    أو أي استقطاع آخر. التأمينات تظهر كحقل مستقل
                                    ولا تدخل في إجمالي الخصومات.
                                  </p>
                                </div>

                                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                                  <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                                    <div className="text-xs font-semibold text-slate-500">
                                      إجمالي الخصومات
                                    </div>
                                    <div className="mt-1 text-lg font-semibold text-slate-950 tabular-nums">
                                      {formatNumberEN(
                                        totalSalaryDeductions || 0
                                      )}{" "}
                                      ر.س
                                    </div>
                                  </div>

                                  {salaryDeductions.length ? (
                                    <Button
                                      type="button"
                                      onClick={handleAddSalaryDeduction}
                                      disabled={!canManageEmployees || saving}
                                      className="h-11 rounded-[16px] bg-slate-950 px-5 text-white hover:bg-slate-900"
                                    >
                                      <Plus className="ml-2 h-4 w-4" />
                                      إضافة خصم جديد
                                    </Button>
                                  ) : null}
                                </div>
                              </div>

                              {employeeAbsences.length ? (
                                <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                                  <div className="font-semibold">
                                    ملاحظة غياب مسجل
                                  </div>
                                  <div className="mt-1 text-xs leading-6">
                                    لدى الموظف غياب مسجل سابقًا:{" "}
                                    {employeeAbsences
                                      .slice(0, 3)
                                      .map(
                                        absence =>
                                          `${formatEmployeeAbsenceDate(
                                            absence.date
                                          )} (${getEmployeeAbsenceTypeLabel(
                                            absence.type
                                          )})`
                                      )
                                      .join("، ")}
                                    {employeeAbsences.length > 3
                                      ? `، و${formatNumberEN(
                                          employeeAbsences.length - 3
                                        )} أخرى`
                                      : ""}
                                    . هذه ملاحظة فقط ولا تضيف خصمًا يدويًا مكررًا؛
                                    خصم الغياب يتم من سجل الغياب عند إنشاء الراتب.
                                  </div>
                                </div>
                              ) : null}

                              {salaryDeductions.length ? (
                                <div className="space-y-3">
                                  {salaryDeductions.map(item => (
                                    <div
                                      key={item.id}
                                      className="grid gap-3 rounded-[18px] border border-slate-200 bg-slate-50/70 p-4 md:grid-cols-[minmax(0,1fr)_160px_auto]"
                                    >
                                      <Input
                                        value={item.title}
                                        onChange={event =>
                                          handleSalaryDeductionChange(
                                            item.id,
                                            "title",
                                            event.target.value
                                          )
                                        }
                                        placeholder="مثال: خصم غياب"
                                        disabled={!canManageEmployees || saving}
                                      />

                                      <Input
                                        type="number"
                                        dir="rtl"
                                        inputMode="decimal"
                                        step="0.01"
                                        value={item.amount}
                                        onChange={event =>
                                          handleSalaryDeductionChange(
                                            item.id,
                                            "amount",
                                            normalizeEnglishDigits(
                                              event.target.value
                                            )
                                          )
                                        }
                                        placeholder="قيمة الخصم"
                                        className="text-right tabular-nums"
                                        disabled={!canManageEmployees || saving}
                                      />

                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                        onClick={() =>
                                          handleRemoveSalaryDeduction(item.id)
                                        }
                                        disabled={!canManageEmployees || saving}
                                      >
                                        حذف
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-5 py-7 text-center">
                                  <div className="text-sm font-semibold text-slate-950">
                                    لا توجد خصومات مضافة حتى الآن.
                                  </div>
                                  <div className="mt-1 text-sm leading-6 text-slate-500">
                                    أضف خصمًا يدويًا مثل الغياب أو التأخير أو أي
                                    استقطاع آخر.
                                  </div>
                                  <Button
                                    type="button"
                                    onClick={handleAddSalaryDeduction}
                                    disabled={!canManageEmployees || saving}
                                    className="mt-4 h-11 rounded-[16px] bg-slate-950 px-5 text-white hover:bg-slate-900"
                                  >
                                    <Plus className="ml-2 h-4 w-4" />
                                    إضافة أول خصم
                                  </Button>
                                </div>
                              )}

                              <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                                  <div className="text-xs font-semibold text-slate-500">
                                    فرق الساعات
                                  </div>
                                  <div
                                    className={cn(
                                      "mt-2 text-base font-semibold",
                                      calculatedHoursDifference > 0 &&
                                        "text-emerald-600",
                                      calculatedHoursDifference < 0 &&
                                        "text-red-600",
                                      calculatedHoursDifference === 0 &&
                                        "text-slate-950"
                                    )}
                                  >
                                    {formatHoursDifferenceLabel(
                                      calculatedHoursDifference
                                    )}
                                  </div>
                                </div>

                                <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                                  <div className="text-xs font-semibold text-slate-500">
                                    راتب اليوم
                                  </div>
                                  <div className="mt-2 text-base font-semibold text-slate-950">
                                    {formatNumberEN(calculatedDailyRate || 0)}{" "}
                                    ر.س
                                  </div>
                                </div>

                                <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                                  <div className="text-xs font-semibold text-slate-500">
                                    راتب الساعة
                                  </div>
                                  <div className="mt-2 text-base font-semibold text-slate-950">
                                    {formatNumberEN(calculatedHourlyRate || 0)}{" "}
                                    ر.س
                                  </div>
                                </div>

                                <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                                  <div className="text-xs font-semibold text-slate-500">
                                    قيمة الأوفر تايم
                                  </div>
                                  <div className="mt-2 text-base font-semibold text-slate-950">
                                    {formatNumberEN(
                                      calculatedOvertimeAmount || 0
                                    )}{" "}
                                    ر.س
                                  </div>
                                </div>

                                <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                                  <div className="text-xs font-semibold text-slate-500">
                                    خصم نقص الساعات
                                  </div>
                                  <div className="mt-2 text-base font-semibold text-slate-950">
                                    {formatNumberEN(
                                      calculatedMissingDeduction || 0
                                    )}{" "}
                                    ر.س
                                  </div>
                                </div>

                                <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                                  <div className="text-xs font-semibold text-slate-500">
                                    غياب
                                  </div>
                                  <div className="mt-2 text-base font-semibold text-red-600">
                                    {formatNumberEN(attendanceAbsentDaysNumber)}{" "}
                                    أيام
                                  </div>
                                </div>

                                <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                                  <div className="text-xs font-semibold text-slate-500">
                                    خصم الغياب
                                  </div>
                                  <div className="mt-2 text-base font-semibold text-slate-950">
                                    {formatNumberEN(
                                      calculatedAttendanceAbsenceDeduction || 0
                                    )}{" "}
                                    ر.س
                                  </div>
                                </div>

                                <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                                  <div className="text-xs font-semibold text-slate-500">
                                    الراتب قبل الخصومات
                                  </div>
                                  <div className="mt-2 text-base font-semibold text-slate-950">
                                    {formatNumberEN(calculatedGrossSalary || 0)}{" "}
                                    ر.س
                                  </div>
                                </div>

                                <div className="rounded-[18px] border border-emerald-200 bg-emerald-50/70 px-4 py-4 sm:col-span-2">
                                  <div className="text-xs font-semibold text-emerald-700">
                                    الراتب الفعلي النهائي
                                  </div>
                                  <div className="mt-2 text-lg font-semibold text-emerald-800">
                                    {formatNumberEN(calculatedNetSalary || 0)}{" "}
                                    ر.س
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="w-full">
                              <Field
                                label="إرفاق مستند مدد (اختياري)"
                                description="الصيغ المدعومة: PDF, PNG, JPG."
                              >
                                <Input
                                  id="payroll-mudad-document-input"
                                  ref={payrollMudadDocumentInputRef}
                                  type="file"
                                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                                  className="sr-only"
                                  onChange={handlePayrollMudadDocumentSelected}
                                  disabled={
                                    !canManageEmployees ||
                                    creatingPayrollRecord ||
                                    !!selectedPayrollRecord
                                  }
                                />
                                <div
                                  role="button"
                                  tabIndex={
                                    canManageEmployees &&
                                    !creatingPayrollRecord &&
                                    !selectedPayrollRecord
                                      ? 0
                                      : -1
                                  }
                                  onClick={() =>
                                    payrollMudadDocumentInputRef.current?.click()
                                  }
                                  onKeyDown={event => {
                                    if (
                                      event.key === "Enter" ||
                                      event.key === " "
                                    ) {
                                      event.preventDefault();
                                      payrollMudadDocumentInputRef.current?.click();
                                    }
                                  }}
                                  onDragOver={event => event.preventDefault()}
                                  onDrop={handlePayrollMudadDocumentDrop}
                                  className={cn(
                                    "flex min-h-40 w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-[#F2B705] bg-[#F2B705]/10 px-5 py-8 text-center text-sm text-slate-700 transition hover:bg-[#F2B705]/15 sm:px-10",
                                    (!canManageEmployees ||
                                      creatingPayrollRecord ||
                                      !!selectedPayrollRecord) &&
                                      "pointer-events-none cursor-not-allowed opacity-60"
                                  )}
                                >
                                  <Upload className="h-6 w-6 text-[#030640]" />
                                  {payrollMudadDocument ? (
                                    <div className="max-w-full space-y-1">
                                      <div className="font-semibold text-slate-950">
                                        {payrollMudadDocument.name}
                                      </div>
                                      <div className="text-xs text-slate-600">
                                        الحجم:{" "}
                                        {formatFileSizeEN(
                                          payrollMudadDocument.size
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="max-w-md space-y-2">
                                      <div className="font-semibold text-slate-950">
                                        اسحب مستند مدد هنا أو انقر للاختيار
                                      </div>
                                      <div className="text-xs leading-6 text-slate-600">
                                        سيتم حفظ المرفق مع سجل راتب الشهر
                                        الحالي.
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </Field>
                            </div>

                            <div className="flex justify-end pt-1">
                              <Button
                                type="button"
                                className="w-full whitespace-nowrap px-6 sm:w-auto"
                                onClick={handleCreatePayrollRecord}
                                disabled={
                                  !canManageEmployees ||
                                  creatingPayrollRecord ||
                                  !selectedPayrollMonthMeta ||
                                  !!selectedPayrollRecord ||
                                  isDirty
                                }
                              >
                                {creatingPayrollRecord
                                  ? "جاري إنشاء السجل..."
                                  : "إضافة راتب نهاية الشهر"}
                              </Button>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-4 text-sm leading-6 text-slate-600">
                          {isDirty ? (
                            <span>
                              توجد تغييرات غير محفوظة في بيانات الراتب الحالية.
                              احفظها أولًا ثم أنشئ سجل نهاية الشهر.
                            </span>
                          ) : selectedPayrollRecord &&
                            selectedPayrollMonthMeta ? (
                            <span>
                              يوجد بالفعل سجل راتب محفوظ لشهر{" "}
                              {selectedPayrollMonthMeta.label}.
                            </span>
                          ) : selectedPayrollMonthMeta ? (
                            <span>
                              سيتم احتساب جميع غيابات شهر{" "}
                              {selectedPayrollMonthMeta.label} ثم حفظ الراتب
                              النهائي كسجل مستقل لا يتغير تلقائيًا لاحقًا.
                            </span>
                          ) : (
                            <span>اختر شهرًا صالحًا لإنشاء سجل الراتب.</span>
                          )}
                        </div>

                        <div className="space-y-3">
                          <div className="text-sm font-semibold text-slate-950">
                            سجل الرواتب
                          </div>

                          {employeePayrollRecordsLoading ? (
                            <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
                              جاري تحميل سجلات الرواتب...
                            </div>
                          ) : employeePayrollRecords.length ? (
                            <div className="space-y-3">
                              {employeePayrollRecords.map(record => (
                                <div
                                  key={record.id}
                                  className="rounded-[20px] border border-slate-200 bg-white p-4"
                                >
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="space-y-1">
                                      <div className="text-base font-semibold text-slate-950">
                                        {formatEmployeePayrollMonthLabel(
                                          record.payrollMonth
                                        )}
                                      </div>
                                      <div className="text-xs text-slate-500">
                                        أضيف في{" "}
                                        {formatDateTimeEN(record.createdAt)}
                                      </div>
                                    </div>

                                    <Badge
                                      variant="outline"
                                      className="w-fit rounded-full border-slate-200 bg-slate-50 text-slate-700"
                                    >
                                      {record.payrollMonth}
                                    </Badge>
                                  </div>

                                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/60 px-4 py-3">
                                    {record.mudadDocument ? (
                                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0 space-y-1">
                                          <div className="flex items-center gap-2 text-sm font-semibold text-rose-900">
                                            <FileText className="h-4 w-4 shrink-0" />
                                            <span>المستند المرفق: مدد</span>
                                          </div>
                                          <div className="truncate text-xs text-rose-700">
                                            {record.mudadDocument.fileName ||
                                              "مستند مدد"}
                                          </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                          {record.mudadDocumentViewUrl ? (
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="outline"
                                              className="h-9 gap-2 border-rose-200 bg-white text-rose-800 hover:bg-rose-50"
                                              asChild
                                            >
                                              <a
                                                href={
                                                  record.mudadDocumentViewUrl
                                                }
                                                target="_blank"
                                                rel="noreferrer"
                                              >
                                                <Eye className="h-4 w-4" />
                                                عرض
                                              </a>
                                            </Button>
                                          ) : null}
                                          {record.mudadDocumentDownloadUrl ? (
                                            <Button
                                              type="button"
                                              size="sm"
                                              className="h-9 gap-2 bg-rose-700 text-white hover:bg-rose-800"
                                              asChild
                                            >
                                              <a
                                                href={
                                                  record.mudadDocumentDownloadUrl
                                                }
                                                target="_blank"
                                                rel="noreferrer"
                                              >
                                                <Download className="h-4 w-4" />
                                                تحميل
                                              </a>
                                            </Button>
                                          ) : null}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2 text-sm font-semibold text-rose-800">
                                        <FileText className="h-4 w-4" />
                                        <span>
                                          المستند المرفق: لا يوجد مستند مدد
                                          محفوظ
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                                      <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                                        الراتب الأساسي
                                      </div>
                                      <div className="mt-2 text-base font-semibold text-slate-950">
                                        {formatNumberEN(record.baseSalary || 0)}{" "}
                                        ر.س
                                      </div>
                                    </div>

                                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                                      <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                                        غياب
                                      </div>
                                      <div className="mt-2 text-base font-semibold text-slate-950">
                                        {formatEmployeeAbsenceDays(
                                          record.absenceDays || 0
                                        )}
                                      </div>
                                    </div>

                                    <div className="rounded-[18px] border border-amber-200 bg-amber-50/70 px-4 py-4">
                                      <div className="text-xs font-semibold tracking-[0.14em] text-amber-700">
                                        خصم الغياب
                                      </div>
                                      <div className="mt-2 text-base font-semibold text-amber-800">
                                        {formatNumberEN(
                                          record.absenceDeduction || 0
                                        )}{" "}
                                        ر.س
                                      </div>
                                    </div>

                                    <div className="rounded-[18px] border border-emerald-200 bg-emerald-50/70 px-4 py-4">
                                      <div className="text-xs font-semibold tracking-[0.14em] text-emerald-700">
                                        الراتب النهائي
                                      </div>
                                      <div className="mt-2 text-base font-semibold text-emerald-800">
                                        {formatNumberEN(
                                          record.finalSalary || 0
                                        )}{" "}
                                        ر.س
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                                      <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                                        خصم التأخير / نقص الساعات
                                      </div>
                                      <div className="mt-2 text-sm font-semibold text-slate-900">
                                        {formatNumberEN(
                                          record.delayDeduction || 0
                                        )}{" "}
                                        ر.س
                                      </div>
                                    </div>

                                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                                      <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                                        غياب من الحضور
                                      </div>
                                      <div className="mt-2 text-sm font-semibold text-slate-900">
                                        {formatNumberEN(
                                          record.attendanceAbsentDays || 0
                                        )}{" "}
                                        يوم
                                      </div>
                                    </div>

                                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                                      <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                                        خصم الغياب
                                      </div>
                                      <div className="mt-2 text-sm font-semibold text-slate-900">
                                        {formatNumberEN(
                                          record.attendanceAbsenceDeduction || 0
                                        )}{" "}
                                        ر.س
                                      </div>
                                    </div>

                                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                                      <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                                        مكافأة الإضافي
                                      </div>
                                      <div className="mt-2 text-sm font-semibold text-slate-900">
                                        {formatNumberEN(
                                          record.overtimeBonus || 0
                                        )}{" "}
                                        ر.س
                                      </div>
                                    </div>

                                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                                      <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                                        خصومات أخرى
                                      </div>
                                      <div className="mt-2 text-sm font-semibold text-slate-900">
                                        {formatNumberEN(
                                          record.totalSalaryDeductions || 0
                                        )}{" "}
                                        ر.س
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
                              لا توجد سجلات رواتب محفوظة لهذا الموظف حتى الآن.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card
                  id="employee-section-requests"
                  ref={employeeRequestsSectionRef}
                  className={cn(
                    "order-25 scroll-mt-36 gap-0 overflow-hidden border-slate-200/80 bg-white/95 py-0 shadow-sm lg:scroll-mt-44",
                    activeEmployeeWorkspaceSection !== "requests" && "hidden"
                  )}
                >
                  <CardHeader className="border-b border-white/70 bg-white/70 px-6 pt-6 pb-4 backdrop-blur">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                          <Inbox className="h-4 w-4" />
                          الطلبات
                        </div>
                        <div className="text-2xl font-semibold tracking-tight text-slate-950">
                          طلبات الموظف العامة
                        </div>
                        <p className="max-w-2xl text-sm leading-7 text-slate-500">
                          يشمل طلبات التصحيح والاستئذان والأوفر تايم والسلفة
                          والاستقالة والخروج والعودة والخطابات.
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <LeaveOverviewStat
                          icon={Clock3}
                          label="بانتظار المراجعة"
                          value={formatNumberEN(pendingServiceRequestsCount)}
                        />
                        <LeaveOverviewStat
                          icon={CheckCircle2}
                          label="المعتمدة"
                          value={formatNumberEN(
                            serviceRequests.filter(
                              request => request.status === "approved"
                            ).length
                          )}
                        />
                        <LeaveOverviewStat
                          icon={XCircle}
                          label="المرفوضة"
                          value={formatNumberEN(
                            serviceRequests.filter(
                              request => request.status === "rejected"
                            ).length
                          )}
                        />
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 p-5">
                    {serviceRequestsLoading ? (
                      <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                        جاري تحميل طلبات الموظف...
                      </div>
                    ) : serviceRequests.length ? (
                      serviceRequests.map((request, index) => {
                        const isPending = request.status === "pending";
                        const currentReviewNote =
                          reviewNotes[request.id] ?? request.hrNote ?? "";

                        return (
                          <div
                            key={request.id}
                            className={cn(
                              "rounded-[24px] border p-5 shadow-sm",
                              index === 0
                                ? "border-[#F2B705]/35 bg-[#F2B705]/[0.08]"
                                : "border-slate-200/80 bg-slate-50/70"
                            )}
                          >
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                              <div className="space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  {index === 0 ? (
                                    <Badge
                                      variant="outline"
                                      className="rounded-full border-[#F2B705]/35 bg-[#F2B705]/10 text-[#8b6700] shadow-none"
                                    >
                                      أحدث طلب
                                    </Badge>
                                  ) : null}
                                  <Badge
                                    variant="outline"
                                    className="rounded-full"
                                  >
                                    {getEmployeeServiceRequestTypeLabel(
                                      request.requestType
                                    )}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "rounded-full shadow-none",
                                      request.status === "approved"
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                        : request.status === "pending"
                                          ? "border-amber-200 bg-amber-50 text-amber-700"
                                          : "border-rose-200 bg-rose-50 text-rose-700"
                                    )}
                                  >
                                    {getEmployeeServiceRequestStatusLabel(
                                      request.status
                                    )}
                                  </Badge>
                                </div>

                                <div className="grid gap-2 text-sm text-slate-600">
                                  {request.requestDate ? (
                                    <div>
                                      <span className="font-semibold text-slate-900">
                                        تاريخ الطلب:
                                      </span>{" "}
                                      {formatDateEN(request.requestDate)}
                                    </div>
                                  ) : null}
                                  {request.startDate || request.endDate ? (
                                    <div>
                                      <span className="font-semibold text-slate-900">
                                        الفترة:
                                      </span>{" "}
                                      {[request.startDate, request.endDate]
                                        .filter(Boolean)
                                        .map(value => formatDateEN(value))
                                        .join(" - ")}
                                    </div>
                                  ) : null}
                                  {request.startTime || request.endTime ? (
                                    <div>
                                      <span className="font-semibold text-slate-900">
                                        الوقت:
                                      </span>{" "}
                                      {[request.startTime, request.endTime]
                                        .filter(Boolean)
                                        .join(" - ")}
                                    </div>
                                  ) : null}
                                  {request.amount ? (
                                    <div>
                                      <span className="font-semibold text-slate-900">
                                        المبلغ:
                                      </span>{" "}
                                      {formatNumberEN(request.amount)} ر.س
                                    </div>
                                  ) : null}
                                  {request.letterType ? (
                                    <div>
                                      <span className="font-semibold text-slate-900">
                                        نوع الخطاب:
                                      </span>{" "}
                                      {request.letterType}
                                    </div>
                                  ) : null}
                                  <div>
                                    <span className="font-semibold text-slate-900">
                                      تاريخ الإنشاء:
                                    </span>{" "}
                                    {formatDateTimeEN(request.createdAt)}
                                  </div>
                                </div>

                                {request.employeeNote ? (
                                  <div className="rounded-[20px] border border-slate-200 bg-white/85 px-4 py-3 text-sm leading-7 text-slate-700">
                                    <span className="font-semibold text-slate-900">
                                      ملاحظة الموظف:
                                    </span>{" "}
                                    {request.employeeNote}
                                  </div>
                                ) : null}
                              </div>

                              <div className="w-full max-w-xl space-y-3">
                                <div className="rounded-[20px] border border-slate-200 bg-white/90 px-4 py-3 text-sm leading-7 text-slate-700">
                                  <span className="font-semibold text-slate-900">
                                    ملاحظة HR:
                                  </span>{" "}
                                  {request.hrNote || "لا توجد ملاحظة حتى الآن."}
                                </div>

                                {isPending ? (
                                  <div className="space-y-3 rounded-[20px] border border-slate-200 bg-white/90 p-4">
                                    <Label className="text-sm font-semibold text-slate-800">
                                      ملاحظة إدارية للطلب
                                    </Label>
                                    <Textarea
                                      value={currentReviewNote}
                                      onChange={event =>
                                        handleReviewNoteChange(
                                          request.id,
                                          event.target.value
                                        )
                                      }
                                      placeholder="اكتب ملاحظة عند الاعتماد أو الرفض"
                                      className="min-h-28"
                                      disabled={
                                        !canManageEmployees ||
                                        reviewingServiceRequestId === request.id
                                      }
                                    />

                                    <div className="flex flex-wrap gap-3">
                                      <Button
                                        type="button"
                                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                                        disabled={
                                          !canManageEmployees ||
                                          reviewingServiceRequestId ===
                                            request.id
                                        }
                                        onClick={() =>
                                          void handleReviewServiceRequest(
                                            request,
                                            "approved"
                                          )
                                        }
                                      >
                                        {reviewingServiceRequestId ===
                                        request.id ? (
                                          <Clock3 className="ml-2 h-4 w-4 animate-pulse" />
                                        ) : (
                                          <CheckCircle2 className="ml-2 h-4 w-4" />
                                        )}
                                        اعتماد الطلب
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                        disabled={
                                          !canManageEmployees ||
                                          reviewingServiceRequestId ===
                                            request.id
                                        }
                                        onClick={() =>
                                          void handleReviewServiceRequest(
                                            request,
                                            "rejected"
                                          )
                                        }
                                      >
                                        <XCircle className="ml-2 h-4 w-4" />
                                        رفض الطلب
                                      </Button>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                        لا توجد طلبات عامة مسجلة لهذا الموظف.
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card
                  id="employee-section-leave"
                  ref={employeeLeaveSectionRef}
                  className={cn(
                    "order-30 scroll-mt-36 gap-0 overflow-hidden border-slate-200/80 bg-white/95 py-0 shadow-sm lg:scroll-mt-44",
                    activeEmployeeWorkspaceSection !== "leave" && "hidden"
                  )}
                >
                  <CardHeader className="border-b border-white/70 bg-white/70 px-6 pt-6 pb-4 backdrop-blur">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                          <CalendarDays className="h-4 w-4" />
                          الإجازات
                        </div>
                        <div className="text-2xl font-semibold tracking-tight text-slate-950">
                          رصيد الإجازات وسجل الطلبات
                        </div>
                        <p className="max-w-2xl text-sm leading-7 text-slate-500">
                          هذا القسم هو المرجع الكامل للإجازات: الرصيد الحالي،
                          آخر خصم تم، آخر إجازة معتمدة، مجموع الأيام المعتمدة،
                          والطلبات المعلقة وسجل المراجعة.
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <LeaveOverviewStat
                          icon={BadgeCheck}
                          label="الرصيد الحالي"
                          value={`${formatNumberEN(currentLeaveBalanceNumber)} يوم`}
                        />

                        <LeaveOverviewStat
                          icon={CalendarDays}
                          label="إجمالي الأيام المعتمدة"
                          value={`${formatNumberEN(approvedLeaveDaysTotal)} يوم`}
                        />

                        <LeaveOverviewStat
                          icon={Clock3}
                          label="طلبات بانتظار المراجعة"
                          value={formatNumberEN(pendingLeaveRequestsCount)}
                        />

                        <LeaveOverviewStat
                          icon={CheckCircle2}
                          label="آخر خصم تم"
                          value={
                            latestDeductedLeaveRequest
                              ? formatLeaveDaysLabel(
                                  latestDeductedLeaveRequest.daysCount
                                )
                              : "لا يوجد"
                          }
                        />
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-5">
                    <div className="space-y-5">
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                          <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                            الرصيد الحالي
                          </div>
                          <div className="mt-2 text-lg font-semibold text-slate-950">
                            {formatNumberEN(currentLeaveBalanceNumber)} يوم
                          </div>
                        </div>

                        <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                          <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                            الرصيد قبل آخر خصم
                          </div>
                          <div className="mt-2 text-lg font-semibold text-slate-950">
                            {formatNumberEN(
                              previousLeaveBalanceBeforeLastApproval
                            )}{" "}
                            يوم
                          </div>
                        </div>

                        <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                          <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                            آخر خصم من الرصيد
                          </div>
                          <div className="mt-2 text-lg font-semibold text-slate-950">
                            {latestDeductedLeaveRequest
                              ? `${formatNumberEN(Number(latestDeductedLeaveRequest.daysCount) || 0)} يوم`
                              : "لا يوجد"}
                          </div>
                        </div>

                        <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                          <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                            تاريخ آخر اعتماد
                          </div>
                          <div className="mt-2 text-lg font-semibold text-slate-950">
                            {latestDeductedLeaveRequest?.reviewedAt
                              ? formatDateTimeEN(
                                  latestDeductedLeaveRequest.reviewedAt
                                )
                              : "غير متوفر"}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/75 p-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="space-y-2">
                            <div className="text-base font-semibold text-slate-950">
                              تعديل رصيد الإجازات يدويًا
                            </div>
                            <p className="max-w-2xl text-sm leading-7 text-slate-500">
                              استخدم هذا الإجراء فقط عند وجود تسوية إدارية أو
                              تصحيح رصيد أو ترحيل رصيد من فترة سابقة.
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-4 lg:grid-cols-3">
                          <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                            <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                              الرصيد الحالي
                            </div>
                            <div className="mt-2 text-lg font-semibold text-slate-950">
                              {formatNumberEN(currentLeaveBalanceNumber)} يوم
                            </div>
                          </div>

                          <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                            <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                              آخر رصيد محفوظ
                            </div>
                            <div className="mt-2 text-lg font-semibold text-slate-950">
                              {latestManualLeaveAdjustmentMeta
                                ? `${formatNumberEN(Number(latestManualLeaveAdjustmentMeta.nextBalance) || 0)} يوم`
                                : "لا يوجد"}
                            </div>
                          </div>

                          <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                            <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                              الرصيد السابق
                            </div>
                            <div className="mt-2 text-lg font-semibold text-slate-950">
                              {latestManualLeaveAdjustmentMeta
                                ? `${formatNumberEN(Number(latestManualLeaveAdjustmentMeta.previousBalance) || 0)} يوم`
                                : "لا يوجد"}
                            </div>
                          </div>
                        </div>

                        <div className="mt-5 flex max-w-xl flex-col gap-3">
                          <Field label="نوع العملية">
                            <Select
                              value={manualLeaveBalanceOperation}
                              onValueChange={value => {
                                const nextOperation =
                                  value === "deduct" ? "deduct" : "add";
                                setManualLeaveBalanceOperation(nextOperation);
                                setManualLeaveBalance(
                                  nextOperation === "deduct"
                                    ? ""
                                    : String(currentLeaveBalanceNumber)
                                );
                              }}
                              disabled={
                                !canManageEmployees || savingManualLeaveBalance
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="اختر نوع العملية" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="add">إضافة رصيد</SelectItem>
                                <SelectItem value="deduct">خصم رصيد</SelectItem>
                              </SelectContent>
                            </Select>
                          </Field>

                          <Field
                            label={
                              manualLeaveBalanceOperation === "deduct"
                                ? "عدد أيام الخصم"
                                : "الرصيد الجديد"
                            }
                          >
                            <Input
                              type="number"
                              dir="rtl"
                              inputMode="decimal"
                              step="0.5"
                              min="0"
                              value={manualLeaveBalance}
                              onChange={event =>
                                setManualLeaveBalance(
                                  normalizeEnglishDigits(event.target.value)
                                )
                              }
                              placeholder={
                                manualLeaveBalanceOperation === "deduct"
                                  ? "مثال: 2"
                                  : "مثال: 18"
                              }
                              className="w-32 text-right tabular-nums sm:w-36"
                              disabled={
                                !canManageEmployees || savingManualLeaveBalance
                              }
                            />
                            {manualLeaveBalanceOperation === "deduct" &&
                            manualLeaveBalanceAmount !== null &&
                            manualLeaveBalanceAmount > 0 ? (
                              <p className="mt-2 text-xs leading-6 text-slate-500">
                                سيتم خصم{" "}
                                {formatNumberEN(manualLeaveBalanceAmount)} يوم
                                من الرصيد الحالي
                                {manualLeaveDeductionPreview !== null
                                  ? `، وسيصبح الرصيد ${formatNumberEN(manualLeaveDeductionPreview)} يوم`
                                  : ""}
                              </p>
                            ) : null}
                          </Field>

                          <Field label="سبب التعديل">
                            <Textarea
                              value={manualLeaveAdjustmentReason}
                              onChange={event =>
                                setManualLeaveAdjustmentReason(
                                  event.target.value
                                )
                              }
                              placeholder="مثال: ترحيل رصيد من السنة الماضية أو تصحيح إداري"
                              className="min-h-20"
                              disabled={
                                !canManageEmployees || savingManualLeaveBalance
                              }
                            />
                          </Field>
                        </div>

                        <div className="mt-3 flex max-w-xl justify-start">
                          <Button
                            type="button"
                            className="w-full bg-[#F2B705] text-slate-950 hover:bg-[#e0ab00] sm:w-auto"
                            onClick={() => void handleSaveManualLeaveBalance()}
                            disabled={
                              !canManageEmployees || savingManualLeaveBalance
                            }
                          >
                            <Save className="ml-2 h-4 w-4" />
                            {savingManualLeaveBalance
                              ? "جارٍ الحفظ..."
                              : "حفظ الرصيد"}
                          </Button>
                        </div>

                        {latestManualLeaveAdjustmentMeta ? (
                          <div className="mt-4 rounded-[20px] border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-700">
                            <div>
                              <span className="font-semibold text-slate-900">
                                آخر تعديل:
                              </span>{" "}
                              {latestManualLeaveAdjustmentMeta.adjustedAt
                                ? formatDateTimeEN(
                                    latestManualLeaveAdjustmentMeta.adjustedAt
                                  )
                                : "غير متوفر"}
                            </div>
                            {latestManualLeaveAdjustmentMeta.operationLabel ||
                            latestManualLeaveAdjustmentMeta.operationType ? (
                              <div>
                                <span className="font-semibold text-slate-900">
                                  نوع العملية:
                                </span>{" "}
                                {latestManualLeaveAdjustmentMeta.operationLabel ||
                                  (latestManualLeaveAdjustmentMeta.operationType ===
                                  "deduct"
                                    ? "خصم"
                                    : "إضافة")}
                              </div>
                            ) : null}
                            <div>
                              <span className="font-semibold text-slate-900">
                                من:
                              </span>{" "}
                              {formatNumberEN(
                                Number(
                                  latestManualLeaveAdjustmentMeta.previousBalance
                                ) || 0
                              )}{" "}
                              يوم
                            </div>
                            <div>
                              <span className="font-semibold text-slate-900">
                                إلى:
                              </span>{" "}
                              {formatNumberEN(
                                Number(
                                  latestManualLeaveAdjustmentMeta.nextBalance
                                ) || 0
                              )}{" "}
                              يوم
                            </div>
                            <div>
                              <span className="font-semibold text-slate-900">
                                السبب:
                              </span>{" "}
                              {latestManualLeaveAdjustmentMeta.reason ||
                                "غير متوفر"}
                            </div>
                            <div>
                              <span className="font-semibold text-slate-900">
                                بواسطة:
                              </span>{" "}
                              {latestManualLeaveAdjustmentMeta.adjustedByName ||
                                latestManualLeaveAdjustmentMeta.adjustedByEmail ||
                                "غير متوفر"}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/75 p-5">
                        {latestApprovedLeaveRequest ? (
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className="rounded-full border-[#F2B705]/35 bg-[#F2B705]/10 text-[#8b6700] shadow-none"
                              >
                                آخر إجازة معتمدة
                              </Badge>
                              <Badge variant="outline" className="rounded-full">
                                {getLeaveTypeLabel(
                                  latestApprovedLeaveRequest.leaveType
                                )}
                              </Badge>
                              <LeaveStatusBadge
                                status={latestApprovedLeaveRequest.status}
                              />
                            </div>

                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                              <ReadonlyMeta
                                icon={CalendarDays}
                                label="تاريخ البداية"
                                value={formatDateEN(
                                  latestApprovedLeaveRequest.startDate
                                )}
                              />
                              <ReadonlyMeta
                                icon={CalendarDays}
                                label="تاريخ النهاية"
                                value={formatDateEN(
                                  latestApprovedLeaveRequest.endDate
                                )}
                              />
                              <ReadonlyMeta
                                icon={CalendarDays}
                                label="عدد الأيام"
                                value={formatLeaveDaysLabel(
                                  latestApprovedLeaveRequest.daysCount
                                )}
                              />
                              <ReadonlyMeta
                                icon={Clock3}
                                label="تاريخ الطلب"
                                value={formatDateTimeEN(
                                  latestApprovedLeaveRequest.createdAt
                                )}
                              />
                            </div>

                            {latestApprovedLeaveRequest.employeeNote ? (
                              <div className="rounded-[20px] border border-slate-200 bg-white/90 px-4 py-3 text-sm leading-7 text-slate-700">
                                <span className="font-semibold text-slate-900">
                                  ملاحظة الموظف:
                                </span>{" "}
                                {latestApprovedLeaveRequest.employeeNote}
                              </div>
                            ) : null}

                            {latestApprovedLeaveRequest.hrNote ? (
                              <div className="rounded-[20px] border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm leading-7 text-emerald-800">
                                <span className="font-semibold">
                                  ملاحظة HR:
                                </span>{" "}
                                {latestApprovedLeaveRequest.hrNote}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/90 px-5 py-10 text-center text-sm text-slate-500">
                            لا توجد أي إجازات أو طلبات إجازة لهذا الموظف حتى
                            الآن.
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="text-sm font-semibold text-slate-900">
                          سجل تعديلات الرصيد اليدوية
                        </div>

                        {leaveBalanceAdjustmentsLoading ? (
                          <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                            جاري تحميل سجل تعديلات الرصيد...
                          </div>
                        ) : leaveBalanceAdjustments.length ? (
                          <div className="space-y-3">
                            {leaveBalanceAdjustments.slice(0, 5).map(item => (
                              <div
                                key={item.id}
                                className="rounded-[20px] border border-slate-200 bg-white px-4 py-4"
                              >
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="space-y-2 text-sm text-slate-700">
                                    {item.operationLabel ||
                                    item.operationType ? (
                                      <div>
                                        <span className="font-semibold text-slate-900">
                                          نوع العملية:
                                        </span>{" "}
                                        {item.operationLabel ||
                                          (item.operationType === "deduct"
                                            ? "خصم"
                                            : "إضافة")}
                                      </div>
                                    ) : null}
                                    <div>
                                      <span className="font-semibold text-slate-900">
                                        من:
                                      </span>{" "}
                                      {formatNumberEN(
                                        Number(item.previousBalance) || 0
                                      )}{" "}
                                      يوم
                                    </div>
                                    <div>
                                      <span className="font-semibold text-slate-900">
                                        إلى:
                                      </span>{" "}
                                      {formatNumberEN(
                                        Number(item.nextBalance) || 0
                                      )}{" "}
                                      يوم
                                    </div>
                                    <div>
                                      <span className="font-semibold text-slate-900">
                                        الفرق:
                                      </span>{" "}
                                      {formatNumberEN(
                                        Number(item.difference) || 0
                                      )}{" "}
                                      يوم
                                    </div>
                                    <div>
                                      <span className="font-semibold text-slate-900">
                                        السبب:
                                      </span>{" "}
                                      {item.reason || "غير متوفر"}
                                    </div>
                                    <div>
                                      <span className="font-semibold text-slate-900">
                                        بواسطة:
                                      </span>{" "}
                                      {item.createdByName ||
                                        item.createdByEmail ||
                                        "غير متوفر"}
                                    </div>
                                  </div>

                                  <div className="text-xs text-slate-500">
                                    {item.createdAtDate
                                      ? formatDateTimeEN(item.createdAtDate)
                                      : "تاريخ غير متوفر"}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                            لا توجد تعديلات يدوية على الرصيد حتى الآن.
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="text-sm font-semibold text-slate-900">
                          سجل الإجازات
                        </div>

                        {leaveRequestsLoading ? (
                          <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                            جاري تحميل طلبات الإجازة...
                          </div>
                        ) : leaveRequests.length ? (
                          leaveRequests.map((request, index) => {
                            const isPending = request.status === "pending";
                            const currentReviewNote =
                              reviewNotes[request.id] ?? request.hrNote ?? "";

                            return (
                              <div
                                key={request.id}
                                className={cn(
                                  "rounded-[24px] border p-5 shadow-sm",
                                  index === 0
                                    ? "border-[#F2B705]/35 bg-[#F2B705]/[0.08]"
                                    : "border-slate-200/80 bg-slate-50/70"
                                )}
                              >
                                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                  <div className="space-y-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                      {index === 0 ? (
                                        <Badge
                                          variant="outline"
                                          className="rounded-full border-[#F2B705]/35 bg-[#F2B705]/10 text-[#8b6700] shadow-none"
                                        >
                                          أحدث طلب
                                        </Badge>
                                      ) : null}
                                      <Badge
                                        variant="outline"
                                        className="rounded-full"
                                      >
                                        {getLeaveTypeLabel(request.leaveType)}
                                      </Badge>
                                      <LeaveStatusBadge
                                        status={request.status}
                                      />
                                      <LeaveImpactBadge
                                        status={request.status}
                                      />
                                    </div>

                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "rounded-full shadow-none",
                                        request.status === "approved"
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                          : request.status === "pending"
                                            ? "border-amber-200 bg-amber-50 text-amber-700"
                                            : "border-rose-200 bg-rose-50 text-rose-700"
                                      )}
                                    >
                                      {request.status === "approved"
                                        ? "تم اعتماد الطلب"
                                        : request.status === "pending"
                                          ? "بانتظار مراجعة HR"
                                          : "تم رفض الطلب"}
                                    </Badge>

                                    <div className="grid gap-2 text-sm text-slate-600">
                                      <div>
                                        <span className="font-semibold text-slate-900">
                                          الفترة:
                                        </span>{" "}
                                        {formatLeaveDateRange(
                                          request.startDate,
                                          request.endDate
                                        )}
                                      </div>

                                      <div>
                                        <span className="font-semibold text-slate-900">
                                          عدد الأيام:
                                        </span>{" "}
                                        {formatLeaveDaysLabel(
                                          request.daysCount
                                        )}
                                      </div>

                                      <div>
                                        <span className="font-semibold text-slate-900">
                                          تاريخ الإنشاء:
                                        </span>{" "}
                                        {formatDateTimeEN(request.createdAt)}
                                      </div>

                                      {request.reviewedAt ? (
                                        <div>
                                          <span className="font-semibold text-slate-900">
                                            تمت المراجعة:
                                          </span>{" "}
                                          {formatDateTimeEN(request.reviewedAt)}
                                        </div>
                                      ) : null}

                                      <div>
                                        <span className="font-semibold text-slate-900">
                                          أثر الطلب على الرصيد:
                                        </span>{" "}
                                        {request.status === "approved"
                                          ? "تم اعتماد الطلب وخصم الأيام من الرصيد"
                                          : request.status === "pending"
                                            ? "الطلب ما زال تحت المراجعة ولم يتم الخصم بعد"
                                            : "تم رفض الطلب ولم يتم الخصم من الرصيد"}
                                      </div>

                                      {request.status === "approved" ? (
                                        <>
                                          <div>
                                            <span className="font-semibold text-slate-900">
                                              الرصيد قبل الطلب:
                                            </span>{" "}
                                            {formatNumberEN(
                                              getLeaveBalanceBeforeRequest(
                                                request
                                              ) || 0
                                            )}{" "}
                                            يوم
                                          </div>

                                          <div>
                                            <span className="font-semibold text-slate-900">
                                              الرصيد بعد الطلب:
                                            </span>{" "}
                                            {formatNumberEN(
                                              getLeaveBalanceAfterRequest(
                                                request
                                              ) || 0
                                            )}{" "}
                                            يوم
                                          </div>
                                        </>
                                      ) : null}
                                    </div>

                                    {request.employeeNote ? (
                                      <div className="rounded-[20px] border border-slate-200 bg-white/85 px-4 py-3 text-sm leading-7 text-slate-700">
                                        <span className="font-semibold text-slate-900">
                                          ملاحظة الموظف:
                                        </span>{" "}
                                        {request.employeeNote}
                                      </div>
                                    ) : null}
                                  </div>

                                  <div className="w-full max-w-xl space-y-3">
                                    <div className="rounded-[20px] border border-slate-200 bg-white/90 px-4 py-3 text-sm leading-7 text-slate-700">
                                      <span className="font-semibold text-slate-900">
                                        ملاحظة HR:
                                      </span>{" "}
                                      {request.hrNote ||
                                        "لا توجد ملاحظة حتى الآن."}
                                    </div>

                                    {isPending ? (
                                      <div className="space-y-3 rounded-[20px] border border-slate-200 bg-white/90 p-4">
                                        <Label className="text-sm font-semibold text-slate-800">
                                          ملاحظة إدارية للطلب
                                        </Label>
                                        <Textarea
                                          value={currentReviewNote}
                                          onChange={event =>
                                            handleReviewNoteChange(
                                              request.id,
                                              event.target.value
                                            )
                                          }
                                          placeholder="اكتب ملاحظة عند الاعتماد أو الرفض"
                                          className="min-h-28"
                                          disabled={
                                            !canManageEmployees ||
                                            reviewingLeaveRequestId ===
                                              request.id
                                          }
                                        />

                                        <div className="flex flex-wrap gap-3">
                                          <Button
                                            type="button"
                                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                                            disabled={
                                              !canManageEmployees ||
                                              reviewingLeaveRequestId ===
                                                request.id
                                            }
                                            onClick={() =>
                                              void handleReviewLeaveRequest(
                                                request,
                                                "approved"
                                              )
                                            }
                                          >
                                            {reviewingLeaveRequestId ===
                                            request.id ? (
                                              <Clock3 className="ml-2 h-4 w-4 animate-pulse" />
                                            ) : (
                                              <CheckCircle2 className="ml-2 h-4 w-4" />
                                            )}
                                            اعتماد الطلب
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                            disabled={
                                              !canManageEmployees ||
                                              reviewingLeaveRequestId ===
                                                request.id
                                            }
                                            onClick={() =>
                                              void handleReviewLeaveRequest(
                                                request,
                                                "rejected"
                                              )
                                            }
                                          >
                                            <XCircle className="ml-2 h-4 w-4" />
                                            رفض الطلب
                                          </Button>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                            لا توجد طلبات إجازة مسجلة لهذا الموظف.
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div
                  className={cn(
                    "order-19",
                    activeEmployeeWorkspaceSection !== "profile" && "hidden"
                  )}
                >
                  <EmployeeWorkspaceSectionBreak
                    icon={ShieldCheck}
                    title="منطقة تعديل البيانات"
                    description="هذا فاصل بصري مستقل بين ملخص الموظف والحقول القابلة للتعديل حتى لا تظهر المعلومات ككتلة واحدة."
                  />
                </div>

                <Card
                  className={cn(
                    "order-20 gap-0 overflow-hidden border-slate-300/80 bg-white py-0 shadow-[0_28px_70px_-46px_rgba(15,23,42,0.42)] ring-1 ring-white/90",
                    activeEmployeeWorkspaceSection !== "profile" && "hidden"
                  )}
                >
                  <CardHeader className="border-b border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-6 pt-6 pb-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
                          <ShieldCheck className="h-5 w-5 text-[#030640]" />
                          تفاصيل البيانات الوظيفية
                        </CardTitle>
                        <CardDescription className="text-sm leading-6 text-slate-500">
                          حدّث المعلومات الأساسية للموظف من مكان واحد منظم، مع
                          فصل واضح بين بيانات الملف وبقية الأقسام التشغيلية.
                        </CardDescription>
                      </div>

                      <Badge
                        variant="outline"
                        className={cn(
                          "w-fit rounded-full shadow-none",
                          canManageEmployees
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-100 text-slate-600"
                        )}
                      >
                        {canManageEmployees ? "تعديل مفعل" : "عرض فقط"}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-7 bg-white p-6">
                    <div className="grid gap-5 md:grid-cols-2">
                      <Field label="اسم الموظف">
                        <Input
                          value={form.fullName}
                          onChange={event =>
                            handleFormChange("fullName", event.target.value)
                          }
                          placeholder="مثال: نواف العليان"
                          disabled={!canManageEmployees || saving}
                        />
                      </Field>

                      <Field label="البريد الإلكتروني">
                        <Input
                          type="email"
                          dir="ltr"
                          value={form.email}
                          onChange={event =>
                            handleFormChange("email", event.target.value)
                          }
                          placeholder="name@example.com"
                          disabled={!canManageEmployees || saving}
                        />
                      </Field>

                      <Field label="رقم الجوال">
                        <Input
                          dir="ltr"
                          value={form.phone}
                          onChange={event =>
                            handleFormChange("phone", event.target.value)
                          }
                          placeholder="05xxxxxxxx"
                          disabled={!canManageEmployees || saving}
                        />
                      </Field>
                      <Field label="المسمى الوظيفي">
                        <Input
                          value={form.jobTitle}
                          onChange={event =>
                            handleFormChange("jobTitle", event.target.value)
                          }
                          placeholder="مثال: مسؤول عمليات"
                          disabled={!canManageEmployees || saving}
                        />
                      </Field>

                      <Field label="القسم / الإدارة">
                        <Input
                          value={form.department}
                          onChange={event =>
                            handleFormChange("department", event.target.value)
                          }
                          placeholder="مثال: الموارد البشرية"
                          disabled={!canManageEmployees || saving}
                        />
                      </Field>

                      <Field label="الحالة الوظيفية">
                        <Select
                          value={form.employmentStatus}
                          onValueChange={value =>
                            handleFormChange("employmentStatus", value)
                          }
                          disabled={!canManageEmployees || saving}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="اختر الحالة الوظيفية" />
                          </SelectTrigger>
                          <SelectContent>
                            {EMPLOYMENT_STATUS_OPTIONS.map(option => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>

                      <Field label="تاريخ بداية العمل">
                        <NativeDatePickerInput
                          value={form.startDate}
                          onValueChange={value =>
                            handleFormChange("startDate", value)
                          }
                          disabled={!canManageEmployees || saving}
                        />
                      </Field>

                      <Field
                        label="رقم البصمة"
                        description="حقل اختياري، ويجب ألا يتكرر بين الموظفين عند إدخاله."
                      >
                        <Input
                          dir="ltr"
                          value={form.fingerprintNumber}
                          onChange={event =>
                            handleFormChange(
                              "fingerprintNumber",
                              event.target.value
                            )
                          }
                          placeholder="مثال: 10245"
                          disabled={!canManageEmployees || saving}
                        />
                      </Field>

                      <div className="space-y-5 rounded-[26px] border border-slate-200 bg-[linear-gradient(135deg,rgba(248,250,252,0.98)_0%,rgba(255,255,255,0.96)_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] md:col-span-2">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                              <BadgeCheck className="h-4 w-4" />
                              الرواتب
                            </div>
                            <div className="text-xl font-semibold tracking-tight text-slate-950">
                              بيانات الراتب
                            </div>
                            <p className="text-sm leading-6 text-slate-500">
                              إعدادات مالية ثابتة محفوظة في ملف الموظف وتستخدم
                              كمصدر أساس عند قفل راتب نهاية الشهر.
                            </p>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-4">
                            <LeaveOverviewStat
                              icon={BadgeCheck}
                              label="الراتب الأساسي"
                              value={`${formatNumberEN(baseSalaryNumber || 0)} ر.س`}
                            />
                            <LeaveOverviewStat
                              icon={Plus}
                              label="البدلات الثابتة"
                              value={`${formatNumberEN(totalAllowances || 0)} ر.س`}
                            />
                            <LeaveOverviewStat
                              icon={Clock3}
                              label="ساعات العمل"
                              value={`${formatHoursDuration(payrollRateWorkHours)} / ${formatNumberEN(expectedWorkDaysNumber || 0)} يوم`}
                            />
                            <LeaveOverviewStat
                              icon={CheckCircle2}
                              label="بعد التأمينات"
                              value={`${formatNumberEN(baseSalaryAfterInsurance || 0)} ر.س`}
                            />
                          </div>
                        </div>

                        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                          <Field label="الراتب الأساسي">
                            <Input
                              type="text"
                              dir="ltr"
                              inputMode="decimal"
                              step="0.01"
                              value={form.baseSalary}
                              onChange={event =>
                                handleFormChange(
                                  "baseSalary",
                                  normalizeEnglishDigits(event.target.value)
                                )
                              }
                              placeholder="مثال: 4500"
                              className="text-right tabular-nums"
                              disabled={!canManageEmployees || saving}
                            />
                          </Field>

                          <Field label="بدل السكن">
                            <Input
                              type="text"
                              dir="ltr"
                              inputMode="decimal"
                              step="0.01"
                              value={form.housingAllowance}
                              onChange={event =>
                                handleFormChange(
                                  "housingAllowance",
                                  normalizeEnglishDigits(event.target.value)
                                )
                              }
                              placeholder="مثال: 1250"
                              className="text-right tabular-nums"
                              disabled={!canManageEmployees || saving}
                            />
                          </Field>

                          <Field label="بدل المواصلات">
                            <Input
                              type="text"
                              dir="ltr"
                              inputMode="decimal"
                              step="0.01"
                              value={form.transportationAllowance}
                              onChange={event =>
                                handleFormChange(
                                  "transportationAllowance",
                                  normalizeEnglishDigits(event.target.value)
                                )
                              }
                              placeholder="مثال: 500"
                              className="text-right tabular-nums"
                              disabled={!canManageEmployees || saving}
                            />
                          </Field>

                          <Field label="بدلات ثابتة أخرى">
                            <Input
                              type="text"
                              dir="ltr"
                              inputMode="decimal"
                              step="0.01"
                              value={form.otherAllowances}
                              onChange={event =>
                                handleFormChange(
                                  "otherAllowances",
                                  normalizeEnglishDigits(event.target.value)
                                )
                              }
                              placeholder="مثال: 300"
                              className="text-right tabular-nums"
                              disabled={!canManageEmployees || saving}
                            />
                          </Field>

                          <Field label="عدد أيام العمل">
                            <Input
                              type="text"
                              dir="ltr"
                              inputMode="decimal"
                              step="1"
                              value={form.expectedWorkDays}
                              onChange={event =>
                                handleFormChange(
                                  "expectedWorkDays",
                                  normalizeEnglishDigits(event.target.value)
                                )
                              }
                              placeholder="مثال: 26"
                              className="text-right tabular-nums"
                              disabled={!canManageEmployees || saving}
                            />
                          </Field>

                          <Field
                            label="ساعات الشهر اليدوية"
                            description="تستخدم كبديل فقط إذا لم يتم تحديد وقت بداية ونهاية الدوام."
                          >
                            <Input
                              type="text"
                              dir="ltr"
                              inputMode="decimal"
                              step="0.5"
                              value={form.expectedWorkHours}
                              onChange={event =>
                                handleFormChange(
                                  "expectedWorkHours",
                                  normalizeEnglishDigits(event.target.value)
                                )
                              }
                              placeholder="مثال: 240"
                              className="text-right tabular-nums"
                              disabled={!canManageEmployees || saving}
                            />
                          </Field>

                          <Field label="سعر ساعة الأوفر تايم">
                            <Input
                              type="text"
                              dir="ltr"
                              inputMode="decimal"
                              step="0.01"
                              value={form.overtimeHourlyRate}
                              onChange={event =>
                                handleFormChange(
                                  "overtimeHourlyRate",
                                  normalizeEnglishDigits(event.target.value)
                                )
                              }
                              placeholder="إذا تركته فارغًا سيُستخدم سعر الساعة العادي"
                              className="text-right tabular-nums"
                              disabled={!canManageEmployees || saving}
                            />
                          </Field>

                          <Field label="خصم التأمينات">
                            <Input
                              type="text"
                              dir="ltr"
                              inputMode="decimal"
                              step="0.01"
                              value={form.insuranceDeduction}
                              onChange={event =>
                                handleFormChange(
                                  "insuranceDeduction",
                                  normalizeEnglishDigits(event.target.value)
                                )
                              }
                              placeholder="مثال: 400"
                              className="text-right tabular-nums"
                              disabled={!canManageEmployees || saving}
                            />
                          </Field>

                          <Field label="إجمالي البدلات الثابتة">
                            <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900">
                              {formatNumberEN(totalAllowances || 0)} ر.س
                            </div>
                          </Field>

                          <Field label="الراتب قبل الخصومات">
                            <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900">
                              {formatNumberEN(
                                (baseSalaryNumber || 0) + (totalAllowances || 0)
                              )}{" "}
                              ر.س
                            </div>
                          </Field>

                          <Field label="الراتب بعد التأمينات والخصومات الثابتة">
                            <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                              {formatNumberEN(
                                Math.max(
                                  0,
                                  (baseSalaryNumber || 0) +
                                    (totalAllowances || 0) -
                                    effectiveInsuranceDeduction -
                                    totalSalaryDeductions
                                )
                              )}{" "}
                              ر.س
                            </div>
                          </Field>
                        </div>
                      </div>

                      <div className="hidden">
                        <Field
                          label="جدول الدوام ونطاقات الحضور"
                          description="حدد وقت الدوام الثابت، أيام الراحة الأسبوعية، والنطاقات المسموح منها تسجيل الحضور."
                        >
                          <div className="space-y-4 rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-600">
                                  بداية الدوام
                                </Label>
                                <Input
                                  type="time"
                                  dir="ltr"
                                  value={form.shiftStartTime}
                                  onChange={event =>
                                    handleFormChange(
                                      "shiftStartTime",
                                      event.target.value
                                    )
                                  }
                                  className="h-11 bg-white text-center text-base font-semibold tabular-nums"
                                  disabled={!canManageEmployees || saving}
                                />
                              </div>

                              <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-600">
                                  نهاية الدوام
                                </Label>
                                <Input
                                  type="time"
                                  dir="ltr"
                                  value={form.shiftEndTime}
                                  onChange={event =>
                                    handleFormChange(
                                      "shiftEndTime",
                                      event.target.value
                                    )
                                  }
                                  className="h-11 bg-white text-center text-base font-semibold tabular-nums"
                                  disabled={!canManageEmployees || saving}
                                />
                              </div>
                            </div>

                            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <div className="text-sm font-semibold text-slate-800">
                                    أيام الراحة الأسبوعية
                                  </div>
                                  <div className="mt-1 text-xs leading-5 text-slate-500">
                                    لا تُحسب هذه الأيام كغياب ولا تدخل في نقص
                                    الساعات.
                                  </div>
                                </div>
                                <Badge
                                  variant="outline"
                                  className="rounded-full border-slate-200 bg-slate-50 text-slate-600"
                                >
                                  {formatWeeklyOffDaysLabel(form.weeklyOffDays)}
                                </Badge>
                              </div>

                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                                {WORK_SCHEDULE_WEEKDAYS.map(day => {
                                  const checked = form.weeklyOffDays.includes(
                                    day.value
                                  );
                                  return (
                                    <label
                                      key={day.value}
                                      className={cn(
                                        "flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-2 py-2 text-xs font-semibold transition-colors",
                                        checked
                                          ? "border-slate-900 bg-slate-950 text-white"
                                          : "border-slate-200 bg-slate-50 text-slate-600"
                                      )}
                                    >
                                      <Checkbox
                                        checked={checked}
                                        onCheckedChange={value =>
                                          handleToggleWeeklyOffDay(
                                            day.value,
                                            value === true
                                          )
                                        }
                                        disabled={!canManageEmployees || saving}
                                        className="h-4 w-4 border-slate-300 data-[state=checked]:border-white data-[state=checked]:bg-white data-[state=checked]:text-slate-950"
                                      />
                                      {day.shortLabel}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
                              <div className="text-sm font-semibold text-slate-800">
                                نطاقات الدوام
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 rounded-xl border-slate-200 bg-white"
                                onClick={() => {
                                  if (newWorkZoneOpen) {
                                    resetWorkZoneForm();
                                    return;
                                  }
                                  setNewWorkZoneOpen(true);
                                }}
                                disabled={!canManageEmployees || saving}
                              >
                                <Plus className="h-4 w-4" />
                                {newWorkZoneOpen ? "إغلاق" : "إضافة نطاق"}
                              </Button>
                            </div>

                            {newWorkZoneOpen ? (
                              <div className="space-y-3 rounded-2xl border border-[#F2B705]/35 bg-white p-3">
                                <div className="text-sm font-semibold text-slate-900">
                                  {editingWorkZoneId
                                    ? "تعديل نطاق الدوام"
                                    : "إضافة نطاق دوام جديد"}
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">
                                      اسم النطاق
                                    </Label>
                                    <Input
                                      value={newWorkZoneForm.name}
                                      onChange={event =>
                                        handleNewWorkZoneFormChange(
                                          "name",
                                          event.target.value
                                        )
                                      }
                                      placeholder="مثال: مكتب جدة"
                                      disabled={
                                        !canManageEmployees ||
                                        saving ||
                                        creatingWorkZone
                                      }
                                    />
                                  </div>

                                  <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">
                                      Radius بالمتر
                                    </Label>
                                    <Input
                                      dir="ltr"
                                      inputMode="numeric"
                                      value={newWorkZoneForm.radiusMeters}
                                      onChange={event =>
                                        handleNewWorkZoneFormChange(
                                          "radiusMeters",
                                          event.target.value
                                        )
                                      }
                                      placeholder="200"
                                      disabled={
                                        !canManageEmployees ||
                                        saving ||
                                        creatingWorkZone
                                      }
                                    />
                                  </div>

                                  <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">
                                      خط العرض
                                    </Label>
                                    <Input
                                      dir="ltr"
                                      inputMode="decimal"
                                      value={newWorkZoneForm.lat}
                                      onChange={event =>
                                        handleNewWorkZoneFormChange(
                                          "lat",
                                          event.target.value
                                        )
                                      }
                                      disabled={
                                        !canManageEmployees ||
                                        saving ||
                                        creatingWorkZone
                                      }
                                    />
                                  </div>

                                  <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">
                                      خط الطول
                                    </Label>
                                    <Input
                                      dir="ltr"
                                      inputMode="decimal"
                                      value={newWorkZoneForm.lng}
                                      onChange={event =>
                                        handleNewWorkZoneFormChange(
                                          "lng",
                                          event.target.value
                                        )
                                      }
                                      disabled={
                                        !canManageEmployees ||
                                        saving ||
                                        creatingWorkZone
                                      }
                                    />
                                  </div>
                                </div>

                                <div className="flex flex-wrap justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-xl border-slate-200 bg-white"
                                    onClick={resetWorkZoneForm}
                                    disabled={creatingWorkZone}
                                  >
                                    إلغاء
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-xl border-slate-200 bg-white"
                                    onClick={() =>
                                      void handleUseCurrentLocationForWorkZone()
                                    }
                                    disabled={
                                      !canManageEmployees ||
                                      saving ||
                                      creatingWorkZone ||
                                      locatingWorkZone
                                    }
                                  >
                                    {locatingWorkZone ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <MapPin className="h-4 w-4" />
                                    )}
                                    استخدام موقعي
                                  </Button>
                                  <Button
                                    type="button"
                                    className="rounded-xl bg-slate-950 text-white hover:bg-slate-900"
                                    onClick={() =>
                                      void handleSaveWorkZoneFromEmployee()
                                    }
                                    disabled={
                                      !canManageEmployees ||
                                      saving ||
                                      creatingWorkZone
                                    }
                                  >
                                    {creatingWorkZone ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Save className="h-4 w-4" />
                                    )}
                                    {editingWorkZoneId
                                      ? "حفظ التعديل"
                                      : "إنشاء وتحديد"}
                                  </Button>
                                </div>
                              </div>
                            ) : null}

                            {workZonesLoading ? (
                              <div className="text-sm text-slate-500">
                                جارٍ تحميل مناطق العمل...
                              </div>
                            ) : workZones.length ? (
                              workZones.map(zone => {
                                const checked = form.allowedZoneIds.includes(
                                  zone.id
                                );
                                return (
                                  <label
                                    key={zone.id}
                                    className={cn(
                                      "flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-3 transition-colors",
                                      checked
                                        ? "border-[#F2B705]/45 bg-[#F2B705]/10"
                                        : "border-slate-200 bg-white"
                                    )}
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={value =>
                                        handleToggleAllowedZone(
                                          zone.id,
                                          value === true
                                        )
                                      }
                                      disabled={!canManageEmployees || saving}
                                      className="mt-1"
                                    />
                                    <span className="min-w-0 flex-1 space-y-1">
                                      <span className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-semibold text-slate-950">
                                          {zone.name}
                                        </span>
                                        <Badge
                                          variant="outline"
                                          className={cn(
                                            "rounded-full",
                                            zone.active
                                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                              : "border-slate-200 bg-slate-100 text-slate-500"
                                          )}
                                        >
                                          {zone.active ? "مفعلة" : "غير مفعلة"}
                                        </Badge>
                                      </span>
                                      <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                        <MapPin className="h-3.5 w-3.5" />
                                        Radius {formatZoneRadiusLabel(zone)}
                                        {canManageEmployees ? (
                                          <button
                                            type="button"
                                            className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 transition hover:border-[#F2B705]/45 hover:bg-[#F2B705]/10"
                                            onClick={event => {
                                              event.preventDefault();
                                              event.stopPropagation();
                                              handleEditWorkZoneFromEmployee(
                                                zone
                                              );
                                            }}
                                            disabled={
                                              saving || creatingWorkZone
                                            }
                                          >
                                            تعديل
                                          </button>
                                        ) : null}
                                      </span>
                                    </span>
                                  </label>
                                );
                              })
                            ) : (
                              <div className="text-sm leading-6 text-slate-500">
                                لا توجد مناطق عمل. أضفها من إعدادات HR ثم عد
                                لهذه الصفحة.
                              </div>
                            )}
                          </div>
                        </Field>
                      </div>
                    </div>

                    <Field
                      label="ملاحظات إدارية"
                      description="ملاحظات داخلية مخصصة للإدارة والموارد البشرية."
                    >
                      <Textarea
                        value={form.adminNotes}
                        onChange={event =>
                          handleFormChange("adminNotes", event.target.value)
                        }
                        placeholder="اكتب أي ملاحظات إدارية داخلية هنا"
                        className="min-h-36"
                        disabled={!canManageEmployees || saving}
                      />
                    </Field>

                    <div className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-4">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-slate-950">
                          المستندات الرسمية
                        </div>
                        <p className="text-xs leading-5 text-slate-500">
                          ارفع أي مستند رسمي يخص الموظف، وسيظهر داخل بياناته
                          الوظيفية.
                        </p>
                      </div>

                      <div className="rounded-[18px] border border-slate-200 bg-slate-50/50 p-3.5 sm:p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar className="h-12 w-12 shrink-0 rounded-[18px] border border-slate-200 bg-slate-100 shadow-sm">
                              <AvatarImage
                                src={
                                  selectedEmployeeDisplayAvatarUrl || undefined
                                }
                                alt={selectedEmployeeLabel}
                                className="object-cover"
                              />
                              <AvatarFallback className="rounded-[18px] bg-slate-900 text-base font-semibold text-white">
                                {getEmployeeInitials(
                                  selectedEmployeeLabel,
                                  selectedEmployeeProfile?.personal?.email ||
                                    selectedEmployee?.email ||
                                    ""
                                )}
                              </AvatarFallback>
                            </Avatar>

                            <div className="min-w-0 space-y-0.5">
                              <div className="text-sm font-semibold text-slate-950">
                                صورة الموظف
                              </div>
                              <p className="text-xs leading-5 text-slate-500">
                                ارفع صورة رسمية للموظف لتظهر في بطاقته وفي ملفه
                                داخل اللوحة.
                              </p>
                            </div>
                          </div>

                          <Badge
                            variant="outline"
                            className="w-fit rounded-full border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 shadow-none"
                          >
                            اختياري
                          </Badge>
                        </div>

                        <div className="mt-3 space-y-3">
                          <Input
                            id="employee-avatar-upload-input"
                            ref={employeeAvatarInputRef}
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={handleEmployeeAvatarSelected}
                            disabled={
                              !canManageEmployees || uploadingEmployeeAvatar
                            }
                          />

                          <div
                            role="button"
                            tabIndex={
                              canManageEmployees && !uploadingEmployeeAvatar
                                ? 0
                                : -1
                            }
                            onClick={() =>
                              employeeAvatarInputRef.current?.click()
                            }
                            onKeyDown={event => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                employeeAvatarInputRef.current?.click();
                              }
                            }}
                            onDragOver={event => event.preventDefault()}
                            onDrop={handleEmployeeAvatarDrop}
                            className={cn(
                              "flex cursor-pointer items-center justify-center gap-3 rounded-[14px] border border-slate-200 bg-white px-3 py-3 text-center text-xs text-slate-600 transition hover:border-[#F2B705]/60 hover:bg-[#F2B705]/5",
                              (!canManageEmployees ||
                                uploadingEmployeeAvatar) &&
                                "pointer-events-none cursor-not-allowed opacity-60"
                            )}
                          >
                            <Camera className="h-5 w-5 text-slate-500" />
                            {employeeAvatarCropDraft ? (
                              <div className="space-y-0.5">
                                <div className="text-sm font-semibold text-slate-900">
                                  {employeeAvatarCropDraft.fileName}
                                </div>
                                <div className="text-xs">
                                  الحجم:{" "}
                                  {formatFileSizeEN(
                                    employeeAvatarCropDraft.fileSize
                                  )}
                                </div>
                                <div className="text-xs text-slate-500">
                                  بعد الاختيار ستفتح نافذة القص والمعاينة.
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                <div className="text-sm font-semibold text-slate-900">
                                  اسحب الصورة هنا أو انقر للاختيار
                                </div>
                                <div className="text-xs">
                                  سيتم فتح القص والمعاينة قبل الاعتماد النهائي.
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              className="h-9 rounded-lg bg-[#F2B705] px-3 text-sm text-slate-950 hover:bg-[#e0ab00]"
                              onClick={() =>
                                employeeAvatarInputRef.current?.click()
                              }
                              disabled={
                                !canManageEmployees || uploadingEmployeeAvatar
                              }
                            >
                              <Camera className="ml-1.5 h-4 w-4" />
                              {employeeAvatarCropDraft
                                ? "تغيير الصورة"
                                : "اختيار الصورة"}
                            </Button>

                            <Button
                              type="button"
                              variant="outline"
                              className="h-9 rounded-lg px-3 text-sm"
                              onClick={resetEmployeeAvatarForm}
                              disabled={
                                !canManageEmployees || uploadingEmployeeAvatar
                              }
                            >
                              إعادة ضبط
                            </Button>
                          </div>
                        </div>

                        <p className="hidden">
                          بعد اختيار الصورة ستظهر نافذة المعاينة والقص مثل التي
                          في البروفايل، ثم تعتمد الصورة داخل البطاقة والملف.
                        </p>
                      </div>

                      <Dialog
                        open={employeeAvatarCropOpen}
                        onOpenChange={open => {
                          if (uploadingEmployeeAvatar) return;
                          if (!open) {
                            resetEmployeeAvatarCropState();
                            return;
                          }
                          setEmployeeAvatarCropOpen(true);
                        }}
                      >
                        <DialogContent
                          showCloseButton={!uploadingEmployeeAvatar}
                          className="w-[min(94vw,46rem)] max-w-[46rem] overflow-hidden rounded-[30px] border border-slate-200 bg-white p-0 shadow-[0_28px_80px_-36px_rgba(15,23,42,0.4)]"
                          onPointerDownOutside={event => {
                            if (uploadingEmployeeAvatar) {
                              event.preventDefault();
                            }
                          }}
                        >
                          <DialogHeader className="border-b border-slate-100 bg-white px-6 pt-6 pb-4 text-right sm:text-right">
                            <DialogTitle className="text-xl font-semibold text-slate-950">
                              معاينة وقص الصورة
                            </DialogTitle>
                          </DialogHeader>

                          <div className="grid gap-6 px-6 pb-6 pt-5 lg:grid-cols-[minmax(0,1fr)_220px]">
                            <div className="space-y-4">
                              <div
                                ref={employeeAvatarCropViewportRef}
                                className={cn(
                                  "relative mx-auto aspect-square w-full max-w-[360px] overflow-hidden rounded-[32px] bg-slate-950 touch-none select-none",
                                  employeeAvatarCropDragging
                                    ? "cursor-grabbing"
                                    : "cursor-grab"
                                )}
                                onPointerDown={
                                  handleEmployeeAvatarCropPointerDown
                                }
                                onPointerMove={
                                  handleEmployeeAvatarCropPointerMove
                                }
                                onPointerUp={handleEmployeeAvatarCropPointerEnd}
                                onPointerCancel={
                                  handleEmployeeAvatarCropPointerEnd
                                }
                              >
                                {employeeAvatarCropDraft ? (
                                  <img
                                    src={employeeAvatarCropDraft.objectUrl}
                                    alt="معاينة الصورة الشخصية"
                                    draggable={false}
                                    className="pointer-events-none absolute max-w-none select-none object-cover"
                                    style={employeeAvatarCropImageStyle}
                                  />
                                ) : null}
                                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,transparent_58%,rgba(15,23,42,0.5)_59%,rgba(15,23,42,0.75)_100%)]" />
                                <div className="pointer-events-none absolute inset-[9%] rounded-full border-[3px] border-white/95 shadow-[0_0_0_1px_rgba(255,255,255,0.12)]" />
                              </div>

                              <div className="rounded-[24px] border border-slate-200 bg-slate-50/85 p-4">
                                <div className="flex items-center justify-between gap-3 text-sm">
                                  <Label className="font-semibold text-slate-800">
                                    مستوى التكبير
                                  </Label>
                                  <span className="font-semibold text-slate-600">
                                    {employeeAvatarCropZoomLabel}
                                  </span>
                                </div>

                                <div className="mt-4 flex items-center gap-3">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-10 w-10 rounded-full border-slate-200 bg-white p-0"
                                    onClick={() =>
                                      handleEmployeeAvatarCropZoomStep("out")
                                    }
                                    disabled={
                                      uploadingEmployeeAvatar ||
                                      employeeAvatarCropZoom <=
                                        EMPLOYEE_AVATAR_CROP_MIN_ZOOM
                                    }
                                  >
                                    <Minus className="h-4 w-4" />
                                  </Button>
                                  <Slider
                                    value={[employeeAvatarCropZoom]}
                                    onValueChange={values => {
                                      const nextZoom =
                                        values[0] ??
                                        EMPLOYEE_AVATAR_CROP_MIN_ZOOM;
                                      setEmployeeAvatarCropZoom(
                                        clampNumber(
                                          nextZoom,
                                          EMPLOYEE_AVATAR_CROP_MIN_ZOOM,
                                          EMPLOYEE_AVATAR_CROP_MAX_ZOOM
                                        )
                                      );
                                    }}
                                    min={EMPLOYEE_AVATAR_CROP_MIN_ZOOM}
                                    max={EMPLOYEE_AVATAR_CROP_MAX_ZOOM}
                                    step={0.01}
                                    className="flex-1"
                                    disabled={uploadingEmployeeAvatar}
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-10 w-10 rounded-full border-slate-200 bg-white p-0"
                                    onClick={() =>
                                      handleEmployeeAvatarCropZoomStep("in")
                                    }
                                    disabled={
                                      uploadingEmployeeAvatar ||
                                      employeeAvatarCropZoom >=
                                        EMPLOYEE_AVATAR_CROP_MAX_ZOOM
                                    }
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-4">
                              <div className="rounded-[24px] border border-slate-200 bg-slate-50/85 p-5 text-center">
                                <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                                  المعاينة النهائية
                                </div>
                                <div className="mt-4 flex justify-center">
                                  <div className="relative size-28 overflow-hidden rounded-full border-4 border-white bg-slate-200 shadow-[0_18px_38px_-26px_rgba(15,23,42,0.42)]">
                                    {employeeAvatarCropDraft ? (
                                      <img
                                        src={employeeAvatarCropDraft.objectUrl}
                                        alt="المعاينة النهائية للصورة"
                                        draggable={false}
                                        className="pointer-events-none absolute max-w-none select-none object-cover"
                                        style={
                                          employeeAvatarCropMiniPreviewStyle
                                        }
                                      />
                                    ) : null}
                                  </div>
                                </div>
                                <p className="mt-4 text-sm leading-6 text-slate-600">
                                  هذه المعاينة تحاكي شكل الصورة داخل الـ Avatar
                                  بعد الحفظ.
                                </p>
                              </div>

                              <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-4 py-4 text-sm leading-6 text-slate-600">
                                اسحب الصورة يمينًا أو يسارًا أو للأعلى والأسفل
                                لتحديد أفضل موضع، ثم استخدم شريط التكبير لضبط
                                مقاس الوجه داخل الدائرة.
                              </div>
                            </div>
                          </div>

                          <DialogFooter className="border-t border-slate-100 bg-white px-6 py-4 sm:justify-between">
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-2xl border-slate-200 bg-white"
                              onClick={resetEmployeeAvatarCropState}
                              disabled={uploadingEmployeeAvatar}
                            >
                              إلغاء
                            </Button>
                            <Button
                              type="button"
                              className="rounded-2xl bg-slate-950 text-white hover:bg-[#15233c]"
                              onClick={() =>
                                void handleConfirmEmployeeAvatarCrop()
                              }
                              disabled={
                                !employeeAvatarCropDraft ||
                                uploadingEmployeeAvatar
                              }
                            >
                              {uploadingEmployeeAvatar ? (
                                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                              ) : null}
                              اعتماد الصورة
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <div className="grid gap-5 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
                        <div className="space-y-3 rounded-[18px] border border-slate-200 bg-slate-50/50 p-4">
                          <Field label="عنوان المستند">
                            <Input
                              value={officialDocumentForm.title}
                              onChange={event =>
                                handleOfficialDocumentFormChange(
                                  "title",
                                  event.target.value
                                )
                              }
                              placeholder="مثال: عقد عمل، شهادة خبرة، هوية"
                              disabled={
                                !canManageEmployees || uploadingOfficialDocument
                              }
                            />
                          </Field>

                          <Field label="وصف المستند (اختياري)">
                            <Textarea
                              value={officialDocumentForm.description}
                              onChange={event =>
                                handleOfficialDocumentFormChange(
                                  "description",
                                  event.target.value
                                )
                              }
                              placeholder="أضف ملاحظة مختصرة عن المستند"
                              className="min-h-24"
                              disabled={
                                !canManageEmployees || uploadingOfficialDocument
                              }
                            />
                          </Field>

                          <Field label="نوع المستند">
                            <Select
                              value={officialDocumentForm.fileType}
                              onValueChange={value =>
                                handleOfficialDocumentFormChange(
                                  "fileType",
                                  value
                                )
                              }
                              disabled={
                                !canManageEmployees || uploadingOfficialDocument
                              }
                            >
                              <SelectTrigger className="w-full bg-white">
                                <SelectValue placeholder="اختر نوع المستند" />
                              </SelectTrigger>
                              <SelectContent>
                                {OFFICIAL_DOCUMENT_TYPE_OPTIONS.map(option => (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Field>

                          <Field label="ملف المستند">
                            <Input
                              id="official-document-file-input"
                              ref={officialDocumentInputRef}
                              type="file"
                              className="sr-only"
                              onChange={handleOfficialDocumentSelected}
                              disabled={
                                !canManageEmployees || uploadingOfficialDocument
                              }
                            />
                            <div
                              role="button"
                              tabIndex={
                                canManageEmployees && !uploadingOfficialDocument
                                  ? 0
                                  : -1
                              }
                              onClick={() =>
                                officialDocumentInputRef.current?.click()
                              }
                              onKeyDown={event => {
                                if (
                                  event.key === "Enter" ||
                                  event.key === " "
                                ) {
                                  event.preventDefault();
                                  officialDocumentInputRef.current?.click();
                                }
                              }}
                              onDragOver={event => event.preventDefault()}
                              onDrop={handleOfficialDocumentDrop}
                              className={cn(
                                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] border border-slate-200 bg-white px-4 py-4 text-center text-sm text-slate-600 transition hover:border-[#F2B705]/60 hover:bg-[#F2B705]/5",
                                (!canManageEmployees ||
                                  uploadingOfficialDocument) &&
                                  "pointer-events-none cursor-not-allowed opacity-60"
                              )}
                            >
                              <Upload className="h-6 w-6 text-slate-500" />
                              {officialDocumentForm.file ? (
                                <div className="space-y-1">
                                  <div className="font-semibold text-slate-900">
                                    {officialDocumentForm.file.name}
                                  </div>
                                  <div>
                                    الحجم:{" "}
                                    {formatFileSizeEN(
                                      officialDocumentForm.file.size
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <div className="font-semibold text-slate-900">
                                    اسحب الملف هنا أو انقر للاختيار
                                  </div>
                                  <div>
                                    سيتم إرفاق الملف ضمن المستندات الرسمية
                                    للموظف.
                                  </div>
                                </div>
                              )}
                            </div>
                          </Field>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              className="h-10 rounded-lg bg-[#F2B705] px-4 text-slate-950 hover:bg-[#e0ab00]"
                              onClick={() =>
                                void handleUploadOfficialDocument()
                              }
                              disabled={
                                !canManageEmployees || uploadingOfficialDocument
                              }
                            >
                              <Upload className="ml-2 h-4 w-4" />
                              {uploadingOfficialDocument
                                ? "جارٍ رفع المستند..."
                                : "رفع المستند"}
                            </Button>

                            <Button
                              type="button"
                              variant="outline"
                              className="h-10 rounded-lg px-4"
                              onClick={resetOfficialDocumentForm}
                              disabled={
                                !canManageEmployees || uploadingOfficialDocument
                              }
                            >
                              إعادة ضبط
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-4">
                          {employeeOfficialFiles.length ? (
                            employeeOfficialFiles.map(file => (
                              <div
                                key={file.id}
                                className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 shadow-sm"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="space-y-1.5">
                                    <div className="text-base font-semibold text-slate-950">
                                      {file.title}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                      <Badge
                                        variant="outline"
                                        className="rounded-full border-slate-200 bg-slate-50 text-slate-600 shadow-none"
                                      >
                                        {file.fileTypeLabel}
                                      </Badge>
                                      <Badge
                                        variant="outline"
                                        className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700 shadow-none"
                                      >
                                        مستند رسمي
                                      </Badge>
                                    </div>
                                  </div>

                                  <div className="text-xs text-slate-500">
                                    {file.uploadedAtDate
                                      ? formatDateTimeEN(file.uploadedAtDate)
                                      : "غير متوفر"}
                                  </div>
                                </div>

                                {file.description ? (
                                  <div className="mt-3 text-sm leading-6 text-slate-500">
                                    {file.description}
                                  </div>
                                ) : null}

                                <div className="mt-3 grid gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-500 md:grid-cols-2 xl:grid-cols-3">
                                  <div className="min-w-0">
                                    <div className="text-xs text-slate-500">
                                      اسم الملف
                                    </div>
                                    <div className="mt-0.5 truncate font-semibold text-slate-800" dir="ltr">
                                      {file.fileName}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-slate-500">
                                      الحجم
                                    </div>
                                    <div className="mt-0.5 font-semibold text-slate-800">
                                      {formatFileSizeEN(file.fileSize ?? null)}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-slate-500">
                                      تاريخ الرفع
                                    </div>
                                    <div className="mt-0.5 font-semibold text-slate-800">
                                      {file.uploadedAtDate
                                        ? formatDateTimeEN(file.uploadedAtDate)
                                        : "غير متوفر"}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  {file.viewUrl ? (
                                    <Button
                                      asChild
                                      type="button"
                                      variant="outline"
                                    >
                                      <a
                                        href={file.viewUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        <Eye className="ml-2 h-4 w-4" />
                                        فتح الملف
                                      </a>
                                    </Button>
                                  ) : null}

                                  {file.downloadUrl ? (
                                    <Button
                                      asChild
                                      type="button"
                                      variant="outline"
                                    >
                                      <a
                                        href={file.downloadUrl}
                                        rel="noreferrer"
                                        download={file.fileName || true}
                                      >
                                        <Download className="ml-2 h-4 w-4" />
                                        تحميل
                                      </a>
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-[20px] border border-dashed border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500">
                              لا توجد مستندات رسمية مرفوعة لهذا الموظف حتى الآن.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                {isDirty ? (
                  <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
                    <div className="pointer-events-auto mx-auto w-full max-w-4xl rounded-[24px] border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_20px_45px_-24px_rgba(15,23,42,0.28)] backdrop-blur sm:px-5 sm:py-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-1 text-right">
                          <div className="text-base font-semibold text-slate-950">
                            إجراءات الحفظ
                          </div>
                          <div className="text-sm text-slate-500">
                            هناك تعديلات غير محفوظة، يمكنك حفظها الآن أو
                            استعادتها لآخر نسخة محفوظة.
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleReset}
                            disabled={!isDirty || saving}
                            className="h-12 rounded-[18px] px-5"
                          >
                            العودة إلى المحفوظ
                          </Button>

                          <Button
                            type="button"
                            onClick={() => void handleSave()}
                            disabled={!canManageEmployees || !isDirty || saving}
                            className="h-12 rounded-[18px] bg-slate-950 px-5 text-white hover:bg-slate-900"
                          >
                            <Save className="ml-2 h-4 w-4" />
                            {saving ? "جارٍ الحفظ..." : "حفظ التغييرات"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
