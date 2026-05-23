import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from "react";
import { useSearch } from "wouter";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
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
  Download,
  Eye,
  FileText,
  Inbox,
  Mail,
  Phone,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { createInAppNotification } from "@/lib/inAppNotifications";
import {
  EMPLOYEE_EMPTY_VALUE,
  normalizeEmployeeProfile,
  type EmployeeProfileUserDoc,
} from "@/lib/employeeProfile";
import {
  EMPLOYEE_LEAVE_REQUESTS_COLLECTION,
  getLatestApprovedEmployeeLeaveRequest,
  formatLeaveDateRange,
  formatLeaveDaysLabel,
  getLeaveStatusMeta,
  getLeaveTypeLabel,
  normalizeEmployeeLeaveRequest,
  sortEmployeeLeaveRequests,
  type EmployeeLeaveRequestRecord,
} from "@/lib/employeeLeave";
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
import { cn } from "@/lib/utils";
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
import { EMPLOYEE_MESSAGES_COLLECTION } from "@shared/employee";

type EmployeeRecord = EmployeeProfileUserDoc & {
  id: string;
  linkedEmployeeId?: string | null;
  firebaseUser?: {
    photoURL?: string | null;
  } | null;
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
  expectedWorkDays: string;
  expectedWorkHours: string;
  actualWorkedHours: string;
  overtimeHourlyRate: string;
  insuranceDeduction: string;
  adminNotes: string;
};

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
  | "salary"
  | "leave"
  | "messages"
  | "files";


const EMPLOYEE_WORKSPACE_SECTIONS: Array<{
  key: EmployeeWorkspaceSectionKey;
  label: string;
  icon: typeof ShieldCheck;
}> = [
    { key: "profile", label: "بيانات الموظف", icon: ShieldCheck },
    { key: "salary", label: "الرواتب", icon: BadgeCheck },
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
    case "salary":
    case "payroll":
    case "salary-info":
      return "salary";
    case "leave":
    case "leaves":
    case "vacation":
    case "vacations":
      return "leave";
    case "messages":
      return "messages";
    case "files":
      return "files";
    default:
      return null;
  }
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

function isSupportedMudadPayrollDocument(file: File | null) {
  if (!file) return false;

  const mime = String(file.type || "").trim().toLowerCase();
  const name = String(file.name || "").trim().toLowerCase();

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
      employment.baseSalary === 0
        ? "0"
        : pickText(employment.baseSalary),
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
    overtimeHourlyRate:
      employment.overtimeHourlyRate === 0
        ? "0"
        : pickText(employment.overtimeHourlyRate),
    insuranceDeduction:
      employment.insuranceDeduction === 0
        ? "0"
        : pickText(employment.insuranceDeduction),
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
    <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div dir={dir} className="mt-2 text-sm font-semibold text-slate-950">
        {value || EMPLOYEE_EMPTY_VALUE}
      </div>
    </div>
  );
}

function EmployeeWorkspaceTabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof ShieldCheck;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent border-b-2 px-3 text-xs font-semibold transition-all",
        active
          ? "border-b-[#F2B705] bg-[#F2B705]/10 text-[#030640]"
          : "border-b-transparent bg-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-950"
      )}
    >
      <Icon
        className={cn("h-3.5 w-3.5", active ? "text-[#030640]" : "text-slate-500")}
      />
      <span>{label}</span>
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
      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600"
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
  const normalizedStatus = String(status || "").trim().toLowerCase();

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

function resolveEmployeeAuthUid(employee: EmployeeRecord | null | undefined) {
  return String(employee?.uid || employee?.id || "").trim();
}

function resolveEmployeeDocumentId(employee: EmployeeRecord | null | undefined) {
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

function normalizeSalaryDeductions(value: unknown): EmployeeSalaryDeductionFormValue[] {
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
    .filter(item => item.title && Number.isFinite(item.amount) && item.amount > 0);
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
  const search = useSearch();
  const canManageEmployees = hasPermission(user, "employees.manage");

  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
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
  const [employeeAbsences, setEmployeeAbsences] = useState<EmployeeAbsenceRecord[]>(
    []
  );
  const [employeeAbsencesLoading, setEmployeeAbsencesLoading] = useState(false);
  const [absenceForm, setAbsenceForm] = useState<EmployeeAbsenceFormValues>(
    buildEmployeeAbsenceFormValues
  );
  const [savingAbsence, setSavingAbsence] = useState(false);
  const [employeePayrollRecords, setEmployeePayrollRecords] = useState<
    EmployeePayrollRecord[]
  >([]);
  const [employeePayrollRecordsLoading, setEmployeePayrollRecordsLoading] =
    useState(false);
  const [payrollMonthInput, setPayrollMonthInput] = useState(
    buildEmployeePayrollMonthInput
  );
  const [payrollMudadDocument, setPayrollMudadDocument] = useState<File | null>(
    null
  );
  const [creatingPayrollRecord, setCreatingPayrollRecord] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaveRequests, setLeaveRequests] = useState<
    EmployeeLeaveRequestRecord[]
  >([]);
  const [leaveRequestsLoading, setLeaveRequestsLoading] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [manualLeaveBalance, setManualLeaveBalance] = useState("");
  const [manualLeaveBalanceOperation, setManualLeaveBalanceOperation] =
    useState<"add" | "deduct">("add");
  const [manualLeaveAdjustmentReason, setManualLeaveAdjustmentReason] = useState("");
  const [savingManualLeaveBalance, setSavingManualLeaveBalance] = useState(false);
  const [leaveBalanceAdjustments, setLeaveBalanceAdjustments] = useState<
    Array<Record<string, any>>
  >([]);
  const [leaveBalanceAdjustmentsLoading, setLeaveBalanceAdjustmentsLoading] =
    useState(false);
  const [employeeReportExporting, setEmployeeReportExporting] = useState(false);
  const [reviewingLeaveRequestId, setReviewingLeaveRequestId] = useState<
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
  const [employeeMessages, setEmployeeMessages] = useState<
    EmployeeMessageRecord[]
  >([]);
  const [employeeMessagesLoading, setEmployeeMessagesLoading] = useState(false);
  const [employeeMessageForm, setEmployeeMessageForm] =
    useState<EmployeeMessageFormValues>(buildEmployeeMessageFormValues);
  const [activeEmployeeWorkspaceSection, setActiveEmployeeWorkspaceSection] =
    useState<EmployeeWorkspaceSectionKey>("profile");
  const [activeEmployeeConversationId, setActiveEmployeeConversationId] =
    useState<string | null>(null);
  const [openingEmployeeConversationId, setOpeningEmployeeConversationId] =
    useState<string | null>(null);
  const [composeEmployeeMessageAsNew, setComposeEmployeeMessageAsNew] =
    useState(false);
  const [sendingEmployeeMessage, setSendingEmployeeMessage] = useState(false);
  const employeeFileInputRef = useRef<HTMLInputElement | null>(null);
  const officialDocumentInputRef = useRef<HTMLInputElement | null>(null);
  const payrollMudadDocumentInputRef = useRef<HTMLInputElement | null>(null);
  const employeeSalarySectionRef = useRef<HTMLDivElement | null>(null);
  const employeeOverviewSectionRef = useRef<HTMLDivElement | null>(null);
  const employeeLeaveSectionRef = useRef<HTMLDivElement | null>(null);
  const employeeMessagesSectionRef = useRef<HTMLDivElement | null>(null);
  const employeeFilesSectionRef = useRef<HTMLDivElement | null>(null);
  const handledEmployeeSearchRef = useRef("");
  const handledMessageSearchRef = useRef("");
  const handledSectionNavigationRef = useRef("");

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
      if (selectedEmployeeId !== requestedEmployeeId) {
        setSelectedEmployeeId(requestedEmployeeId);
      }
      return;
    }

    const selectedExists = employees.some(
      employee => employee.id === selectedEmployeeId
    );
    if (!selectedEmployeeId || !selectedExists) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [employees, requestedEmployeeId, search, selectedEmployeeId]);

  const employeeCards = useMemo(
    () =>
      employees.map(employee => {
        const profile = normalizeEmployeeProfile(employee, {
          displayName: employee.displayName,
          email: employee.email,
          photoURL:
            employee.photoURL ||
            employee.firebaseUser?.photoURL ||
            auth.currentUser?.photoURL,
        });

        return {
          employee,
          profile,
          searchText: [
            profile.personal.name,
            profile.personal.email,
            profile.personal.phone,
            profile.employment.title,
            profile.employment.department,
            profile.employment.employeeCode,
            profile.employment.fingerprintNumber,
          ]
            .join(" ")
            .toLowerCase(),
        };
      }),
    [employees]
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
  const selectedEmployeeDocumentId = resolveEmployeeDocumentId(selectedEmployee);

  const selectedEmployeeProfile = useMemo(
    () =>
      selectedEmployee
        ? normalizeEmployeeProfile(selectedEmployee, {
          displayName: selectedEmployee.displayName,
          email: selectedEmployee.email,
          photoURL:
            selectedEmployee.photoURL ||
            selectedEmployee.firebaseUser?.photoURL ||
            auth.currentUser?.photoURL,
        })
        : null,
    [selectedEmployee]
  );
  const selectedEmployeeLabel = useMemo(
    () =>
      selectedEmployeeProfile?.personal.name &&
        selectedEmployeeProfile.personal.name !== EMPLOYEE_EMPTY_VALUE
        ? selectedEmployeeProfile.personal.name
        : pickText(
          selectedEmployee?.displayName,
          selectedEmployee?.name,
          selectedEmployee?.email
        ) || "الموظف",
    [selectedEmployee, selectedEmployeeProfile]
  );

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
    resetEmployeeMessageForm();
    setAbsenceForm(buildEmployeeAbsenceFormValues());
    setPayrollMonthInput(buildEmployeePayrollMonthInput());
    setActiveEmployeeWorkspaceSection("profile");
    setActiveEmployeeConversationId(null);
    setComposeEmployeeMessageAsNew(false);
    handledSectionNavigationRef.current = "";
  }, [selectedEmployeeId]);

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

    setSalaryDeductions(
      normalizeSalaryDeductions(employment.salaryDeductions)
    );
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
      JSON.stringify(salaryDeductions) !== JSON.stringify(initialSalaryDeductions),
    [form, initialForm, salaryDeductions, initialSalaryDeductions]
  );
  const selectedPayrollMonthMeta = useMemo(
    () => parseEmployeePayrollMonth(payrollMonthInput),
    [payrollMonthInput]
  );
  const selectedPayrollRecord = useMemo(
    () =>
      selectedPayrollMonthMeta
        ? employeePayrollRecords.find(
          record => record.payrollMonth === selectedPayrollMonthMeta.payrollMonth
        ) || null
        : null,
    [employeePayrollRecords, selectedPayrollMonthMeta]
  );

  const latestApprovedLeaveRequest = useMemo(
    () => getLatestApprovedEmployeeLeaveRequest(leaveRequests),
    [leaveRequests]
  );

  const approvedLeaveRequests = useMemo(
    () => leaveRequests.filter(request => request.status === "approved"),
    [leaveRequests]
  );

  const pendingLeaveRequestsCount = useMemo(
    () => leaveRequests.filter(request => request.status === "pending").length,
    [leaveRequests]
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
    if (manualLeaveBalanceOperation !== "deduct" || manualLeaveBalanceAmount === null) {
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
    return currentLeaveBalanceNumber + (Number(latestDeductedLeaveRequest.daysCount) || 0);
  }, [currentLeaveBalanceNumber, latestDeductedLeaveRequest]);

  const latestManualLeaveAdjustmentMeta = useMemo(() => {
    const employment = (selectedEmployee?.employeeProfile?.employment ||
      selectedEmployee?.employment ||
      {}) as Record<string, any>;

    return (employment.leaveBalanceAdjustmentMeta ||
      null) as Record<string, any> | null;
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
        const aTime = toDateSafe(a.reviewedAt || a.updatedAt || a.createdAt)?.getTime() || 0;
        const bTime = toDateSafe(b.reviewedAt || b.updatedAt || b.createdAt)?.getTime() || 0;
        return aTime - bTime;
      });

    chronologicalApproved.forEach(request => {
      runningApprovedDays += Number(request.daysCount) || 0;
      map.set(String(request.id || "").trim(), runningApprovedDays);
    });

    return map;
  }, [approvedLeaveRequests]);

  const getLeaveBalanceBeforeRequest = (request: EmployeeLeaveRequestRecord) => {
    if (request.status !== "approved") return null;

    const requestId = String(request.id || "").trim();
    const approvedUsedAfterThisRequest =
      approvedLeaveDaysAfterRequest.get(requestId) || 0;

    const approvedUsedBeforeThisRequest =
      approvedUsedAfterThisRequest - (Number(request.daysCount) || 0);

    return currentLeaveBalanceNumber + approvedLeaveDaysTotal - approvedUsedBeforeThisRequest;
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
  const archivedEmployeeFilesCount =
    employeeFiles.length - visibleEmployeeFiles.length;
  const replacingEmployeeFile = useMemo(
    () =>
      visibleEmployeeFiles.find(file => file.id === replacingEmployeeFileId) ||
      null,
    [replacingEmployeeFileId, visibleEmployeeFiles]
  );


  const employeeOfficialFiles = useMemo(
    () => filterActiveEmployeeFiles(employeeFiles).filter(isOfficialEmployeeFile),
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
  const readEmployeeMessagesCount =
    employeeMessages.length - unreadEmployeeMessagesCount;

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

  const scrollToEmployeeWorkspaceSection = (
    section: EmployeeWorkspaceSectionKey,
    behavior: ScrollBehavior = "smooth"
  ) => {
    setActiveEmployeeWorkspaceSection(section);

    const target =
      section === "profile"
        ? employeeOverviewSectionRef.current
        : section === "salary"
          ? employeeSalarySectionRef.current
          : section === "leave"
            ? employeeLeaveSectionRef.current
            : section === "messages"
              ? employeeMessagesSectionRef.current
              : employeeFilesSectionRef.current;

    target?.scrollIntoView({
      behavior,
      block: "start",
    });
  };

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
  const expectedWorkDaysNumber = Number(form.expectedWorkDays || 0);
  const expectedWorkHoursNumber = Number(form.expectedWorkHours || 0);
  const actualWorkedHoursNumber = Number(form.actualWorkedHours || 0);
  const overtimeHourlyRateInputNumber = Number(form.overtimeHourlyRate || 0);
  const insuranceDeductionNumber = Number(form.insuranceDeduction || 0);

  const totalSalaryDeductions = useMemo(
    () =>
      salaryDeductions.reduce((sum, item) => {
        const amount = Number(item.amount || 0);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0) +
      (Number.isFinite(insuranceDeductionNumber)
        ? insuranceDeductionNumber
        : 0),
    [salaryDeductions, insuranceDeductionNumber]
  );

  const calculatedDailyRate = useMemo(() => {
    if (!Number.isFinite(baseSalaryNumber) || baseSalaryNumber <= 0) return 0;
    if (!Number.isFinite(expectedWorkDaysNumber) || expectedWorkDaysNumber <= 0)
      return 0;

    return baseSalaryNumber / expectedWorkDaysNumber;
  }, [baseSalaryNumber, expectedWorkDaysNumber]);

  const calculatedHourlyRate = useMemo(() => {
    if (!Number.isFinite(baseSalaryNumber) || baseSalaryNumber <= 0) return 0;
    if (!Number.isFinite(expectedWorkHoursNumber) || expectedWorkHoursNumber <= 0)
      return 0;

    return baseSalaryNumber / expectedWorkHoursNumber;
  }, [baseSalaryNumber, expectedWorkHoursNumber]);

  const calculatedHoursDifference = useMemo(() => {
    const safeExpectedHours = Math.max(0, expectedWorkHoursNumber || 0);
    const safeActualHours = Math.max(0, actualWorkedHoursNumber || 0);
    return safeActualHours - safeExpectedHours;
  }, [expectedWorkHoursNumber, actualWorkedHoursNumber]);

  const calculatedOvertimeHours = useMemo(() => {
    return Math.max(0, calculatedHoursDifference);
  }, [calculatedHoursDifference]);

  const calculatedMissingHours = useMemo(() => {
    return Math.max(0, -calculatedHoursDifference);
  }, [calculatedHoursDifference]);

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
    if (!Number.isFinite(effectiveOvertimeHourlyRate) || effectiveOvertimeHourlyRate <= 0)
      return 0;

    return calculatedOvertimeHours * effectiveOvertimeHourlyRate;
  }, [calculatedOvertimeHours, effectiveOvertimeHourlyRate]);

  const calculatedMissingDeduction = useMemo(() => {
    if (!Number.isFinite(calculatedHourlyRate) || calculatedHourlyRate <= 0) return 0;

    return calculatedMissingHours * calculatedHourlyRate;
  }, [calculatedMissingHours, calculatedHourlyRate]);

  const calculatedGrossSalary = useMemo(() => {
    if (!Number.isFinite(baseSalaryNumber) || baseSalaryNumber <= 0) return 0;

    return Math.max(0, baseSalaryNumber + calculatedOvertimeAmount - calculatedMissingDeduction);
  }, [baseSalaryNumber, calculatedOvertimeAmount, calculatedMissingDeduction]);

  const calculatedNetSalary = useMemo(
    () => Math.max(0, calculatedGrossSalary - totalSalaryDeductions),
    [calculatedGrossSalary, totalSalaryDeductions]
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
            area: "admin",
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

    if (baseSalary === null || baseSalary <= 0) {
      toast.error("يجب إدخال الراتب الأساسي أولًا.");
      return;
    }

    if (payrollMudadDocument && !isSupportedMudadPayrollDocument(payrollMudadDocument)) {
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
          absence.date >= selectedPayrollMonthMeta.monthStart &&
          absence.date <= selectedPayrollMonthMeta.monthEnd
      );

      const normalizedSalaryDeductions =
        normalizeSalaryDeductionsForPersistence(salaryDeductions);
      const payrollComputation = computeEmployeePayroll({
        baseSalary,
        expectedWorkDays,
        expectedWorkHours,
        actualWorkedHours,
        overtimeHourlyRate,
        insuranceDeduction,
        salaryDeductions: normalizedSalaryDeductions,
        absences: monthlyAbsences,
      });

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
          baseSalary: payrollComputation.baseSalary,
          absenceDays: payrollComputation.absenceDays,
          absenceDeduction: payrollComputation.absenceDeduction,
          delayDeduction: payrollComputation.delayDeduction,
          overtimeBonus: payrollComputation.overtimeBonus,
          insuranceDeduction: payrollComputation.insuranceDeduction,
          salaryDeductions: normalizedSalaryDeductions,
          totalSalaryDeductions: payrollComputation.totalSalaryDeductions,
          absenceCount: monthlyAbsences.length,
          absenceEntriesSummary: monthlyAbsences.map(absence => ({
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
            area: "admin",
            page: "Employees",
            method: "create_employee_payroll_record",
          }),
          message: `Created payroll record for ${selectedEmployeeLabel}`,
          meta: {
            employeeId: selectedEmployeeDocumentId,
            employeeUid: selectedEmployeeAuthUid || selectedEmployee.id,
            payrollMonth: selectedPayrollMonthMeta.payrollMonth,
            baseSalary: payrollComputation.baseSalary,
            absenceDays: payrollComputation.absenceDays,
            absenceDeduction: payrollComputation.absenceDeduction,
            delayDeduction: payrollComputation.delayDeduction,
            overtimeBonus: payrollComputation.overtimeBonus,
            totalSalaryDeductions: payrollComputation.totalSalaryDeductions,
            finalSalary: payrollComputation.finalSalary,
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
        selectedEmployeeProfile.personal.name !== EMPLOYEE_EMPTY_VALUE
          ? selectedEmployeeProfile.personal.name
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
          relatedPath: `/employee/messages?messageId=${messageRef.id}`,
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
          selectedEmployeeProfile.personal.name !== EMPLOYEE_EMPTY_VALUE
            ? selectedEmployeeProfile.personal.name
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
          area: "admin",
          page: "Employees",
          method: "upload_official_employee_document",
        }),
        relatedIds: {
          userId: selectedEmployee.id,
        },
        message: replacedCandidates.length
          ? `Replaced official employee document for ${selectedEmployeeProfile.personal.name}`
          : `Uploaded official employee document for ${selectedEmployeeProfile.personal.name}`,
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
          relatedPath: "/employee/profile",
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
          area: "admin",
          page: "Employees",
          method: "delete_employee_file",
        }),
        relatedIds: {
          userId: selectedEmployee.id,
        },
        message: `Deleted employee file for ${selectedEmployeeProfile.personal.name}`,
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
          selectedEmployeeProfile.personal.name !== EMPLOYEE_EMPTY_VALUE
            ? selectedEmployeeProfile.personal.name
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
          area: "admin",
          page: "Employees",
          method: "upload_employee_file",
        }),
        relatedIds: {
          userId: selectedEmployee.id,
        },
        message: replacedCandidates.length
          ? `Replaced employee file for ${selectedEmployeeProfile.personal.name}`
          : `Uploaded employee file for ${selectedEmployeeProfile.personal.name}`,
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
          relatedPath: "/employee/files",
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

    if (form.expectedWorkDays.trim() && expectedWorkDays === null) {
      toast.error("عدد أيام العمل يجب أن يكون رقمًا صالحًا.");
      return;
    }

    if (form.expectedWorkHours.trim() && expectedWorkHours === null) {
      toast.error("عدد ساعات العمل يجب أن يكون رقمًا صالحًا.");
      return;
    }

    if (form.actualWorkedHours.trim() && actualWorkedHours === null) {
      toast.error("عدد الساعات الفعلية يجب أن يكون رقمًا صالحًا.");
      return;
    }

    if (form.overtimeHourlyRate.trim() && overtimeHourlyRate === null) {
      toast.error("سعر ساعة الأوفر تايم يجب أن يكون رقمًا صالحًا.");
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
      const nextPersonal = {
        ...currentPersonal,
        name: normalizedFullName,
        email: normalizedEmail,
        phone: normalizedPhone || null,
      };

      const normalizedSalaryDeductions =
        normalizeSalaryDeductionsForPersistence(salaryDeductions);

      const nextEmployment: EmployeeEmploymentDoc = {
        ...currentEmployment,
        title: form.jobTitle.trim() || null,
        jobTitle: form.jobTitle.trim() || null,
        department: form.department.trim() || null,
        startDate: form.startDate || null,
        leaveBalance,
        baseSalary,
        expectedWorkDays,
        expectedWorkHours,
        actualWorkedHours,
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
            area: "admin",
            page: "Employees",
            method: "update_employment_profile",
          }),
          relatedIds: { userId: selectedEmployee.id },
          message: `Updated employee employment profile for ${selectedEmployeeProfile.personal.name}`,
          meta: {
            targetUserEmail: normalizedEmail,
            targetUserName: normalizedFullName,
            phone: normalizedPhone || null,
            jobTitle: nextEmployment.jobTitle || null,
            department: nextEmployment.department || null,
            employmentStatus: nextEmployment.employmentStatus || null,
            fingerprintNumber: nextEmployment.fingerprintNumber || null,
            leaveBalance,
            baseSalary,
            expectedWorkDays,
            expectedWorkHours,
            actualWorkedHours,
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

      if (selectedEmployee.linkedEmployeeId) {
        try {
          await setDoc(
            doc(db, "employees", selectedEmployee.linkedEmployeeId),
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
            employeeDocId: selectedEmployee.linkedEmployeeId,
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
    const operationType = manualLeaveBalanceOperation === "deduct" ? "deduct" : "add";

    if (!manualLeaveBalance.trim() || !Number.isFinite(manualBalanceValue) || manualBalanceValue < 0) {
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
      const employeeDocId = String(selectedEmployee.linkedEmployeeId || "").trim();
      const employeeRef = employeeDocId ? doc(db, "employees", employeeDocId) : null;

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
            ? ((employeeSnap.data() as Record<string, any>) || {})
            : null;

        const employeeEmployment = (employeeData?.employeeProfile?.employment ||
          employeeData?.employment ||
          {}) as Record<string, any>;

        const previousBalance = resolveEmploymentLeaveBalance(userData, employeeData);
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
            selectedEmployeeProfile.personal.name !== EMPLOYEE_EMPTY_VALUE
              ? selectedEmployeeProfile.personal.name
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

      toast.success("تم تعديل رصيد الإجازات يدويًا.");
    } catch (error) {
      console.error("manual_leave_balance_update_failed", error);
      toast.error("تعذر تعديل رصيد الإجازات.");
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
      toast.error("لا تملك صلاحية مراجعة طلبات الإجازة.");
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

        const hrNote = String(reviewNotes[request.id] ?? request.hrNote ?? "").trim();

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
              ? "تم اعتماد طلب الإجازة"
              : "تم رفض طلب الإجازة",
          body:
            nextStatus === "approved"
              ? "تم اعتماد طلب الإجازة الخاص بك وتحديث الرصيد وفقًا لذلك."
              : "تم رفض طلب الإجازة الخاص بك. يمكنك مراجعة الملاحظة الإدارية داخل الطلب.",
          type: "leave",
          relatedId: request.id,
          relatedTo: "employee_leave_request",
          relatedPath: "/employee/profile",
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
          ? "تم اعتماد طلب الإجازة وخصم الرصيد."
          : "تم رفض طلب الإجازة."
      );
    } catch (reviewError) {
      console.error("review_leave_request_error", reviewError);

      if (
        reviewError instanceof Error &&
        reviewError.message === "leave_balance_insufficient"
      ) {
        toast.error("رصيد الإجازات الحالي لا يكفي لاعتماد هذا الطلب.");
      } else if (
        reviewError instanceof Error &&
        reviewError.message === "leave_request_already_reviewed"
      ) {
        toast.error("تمت مراجعة هذا الطلب مسبقًا.");
      } else if (
        reviewError instanceof Error &&
        reviewError.message === "leave_rejection_note_required"
      ) {
        toast.error("يجب كتابة ملاحظة عند رفض طلب الإجازة.");
      } else {
        toast.error("تعذر تحديث حالة طلب الإجازة.");
      }
    } finally {
      setReviewingLeaveRequestId(null);
    }
  };

  return (
    <DashboardLayout>
      <div dir="rtl" className="space-y-6 text-right">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-slate-950">
            إدارة الموظفين
          </h1>
          <p className="max-w-3xl text-lg text-slate-500">
            صفحة مخصصة لإدارة البيانات الوظيفية للموظفين من جهة الإدارة والموارد
            البشرية، مع فصل واضح بين ما يشاهده الموظف في بروفايله وما يتم تعديله
            من داخل اللوحة.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-slate-200/80">
            <CardContent className="p-5">
              <div className="text-xs font-semibold tracking-[0.16em] text-slate-500">
                الموظفون
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {formatNumberEN(employeeCards.length)}
              </div>
              <div className="mt-2 text-sm text-slate-500">
                إجمالي السجلات الظاهرة ضمن صفحة إدارة الموظفين.
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80">
            <CardContent className="p-5">
              <div className="text-xs font-semibold tracking-[0.16em] text-slate-500">
                على رأس العمل
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {formatNumberEN(activeEmployeesCount)}
              </div>
              <div className="mt-2 text-sm text-slate-500">
                موظفون بحالة وظيفية نشطة حاليًا.
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80">
            <CardContent className="p-5">
              <div className="text-xs font-semibold tracking-[0.16em] text-slate-500">
                متابعة الحالة
              </div>
              <div className="mt-2 flex items-center gap-3 text-sm font-semibold text-slate-950">
                <span>إجازة: {formatNumberEN(onLeaveEmployeesCount)}</span>
                <span className="text-slate-300">|</span>
                <span>تجربة: {formatNumberEN(probationEmployeesCount)}</span>
              </div>
              <div className="mt-2 text-sm text-slate-500">
                قراءة سريعة لحالات الموظفين التشغيلية.
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="flex max-h-none self-start overflow-hidden border-slate-200/80 py-0 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:flex-col">
            <CardHeader className="shrink-0 border-b border-slate-100 bg-white/95 px-4 pb-4 pt-4">
              <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
                <BriefcaseBusiness className="h-4 w-4 text-[#030640]" />
                قائمة الموظفين
              </CardTitle>
              <CardDescription className="text-xs leading-5 text-slate-500">
                اختر موظفًا لعرض ملفه الوظيفي وإدارة بياناته من نفس الصفحة.
              </CardDescription>

              <div className="relative mt-2">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  placeholder="ابحث بالاسم أو البريد أو القسم"
                  className="h-9 pr-9 text-sm"
                />
              </div>
            </CardHeader>

            <CardContent className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
              <div className="space-y-2">
                {loading ? (
                  <div className="rounded-[24px] border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                    جاري تحميل الموظفين...
                  </div>
                ) : error ? (
                  <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-10 text-center text-sm text-rose-700">
                    {error}
                  </div>
                ) : filteredEmployeeCards.length ? (
                  filteredEmployeeCards.map(card => {
                    const isActive = card.employee.id === selectedEmployeeId;
                    const startDateLabel = card.profile.employment.startDate
                      ? formatDateEN(card.profile.employment.startDate)
                      : EMPLOYEE_EMPTY_VALUE;

                    return (
                      <button
                        key={card.employee.id}
                        type="button"
                        onClick={() => setSelectedEmployeeId(card.employee.id)}
                        className={cn(
                          "w-full rounded-[18px] border px-3 py-3 text-right transition-all",
                          isActive
                            ? "border-[#F2B705]/50 bg-[#F2B705]/10 shadow-[0_20px_44px_-34px_rgba(242,183,5,0.55)]"
                            : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                        )}
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="text-sm font-semibold text-slate-950">
                                {card.profile.personal.name}
                              </div>
                              <div className="text-xs text-slate-500">
                                {card.profile.personal.email}
                              </div>
                            </div>

                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-full",
                                card.profile.employment.statusTone === "success"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : card.profile.employment.statusTone ===
                                    "warning"
                                    ? "border-amber-200 bg-amber-50 text-amber-700"
                                    : "border-slate-200 bg-slate-100 text-slate-700"
                              )}
                            >
                              {card.profile.employment.statusLabel}
                            </Badge>
                          </div>

                          <div className="grid gap-1.5 text-xs text-slate-600">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-slate-500">المسمى</span>
                              <span className="font-medium text-slate-900">
                                {card.profile.employment.title}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-slate-500">القسم</span>
                              <span className="font-medium text-slate-900">
                                {card.profile.employment.department}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-slate-500">رقم البصمة</span>
                              <span
                                dir="ltr"
                                className="font-medium text-slate-900"
                              >
                                {card.profile.employment.fingerprintNumber}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-slate-500">
                                بداية العمل
                              </span>
                              <span className="font-medium text-slate-900">
                                {startDateLabel}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <Empty className="min-h-[360px] rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70">
                    <EmptyHeader>
                      <EmptyMedia
                        variant="icon"
                        className="bg-[#F2B705]/12 text-[#030640]"
                      >
                        <UserRound className="size-5" />
                      </EmptyMedia>
                      <EmptyTitle>لا توجد نتائج مطابقة</EmptyTitle>
                      <EmptyDescription>
                        جرّب تغيير عبارة البحث أو أزل الفلتر لعرض الموظفين
                        الحاليين.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex min-w-0 flex-col gap-6">
            <Card className="gap-0 overflow-hidden border-slate-200/80 bg-white/95 py-0 shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-white/90 px-6 pt-6 pb-4">
                <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
                  <ShieldCheck className="h-5 w-5 text-[#030640]" />
                  بيانات الموظف الوظيفية
                </CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-500">
                  هذا القسم مخصص للإدارة والموارد البشرية فقط. الموظف يرى هذه
                  البيانات في بروفايله بشكل للعرض فقط ولا يحررها بنفسه.
                </CardDescription>
              </CardHeader>
            </Card>

            {selectedEmployee && selectedEmployeeProfile ? (
              <div className="flex flex-col gap-6">
                <Card className="order-0 sticky top-4 z-20 gap-0 overflow-hidden border-slate-200/80 bg-white/95 py-0 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.28)] backdrop-blur">
                  <CardContent className="px-4 py-3">
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                      <ShieldCheck className="h-3.5 w-3.5 text-[#030640]" />
                      أقسام ملف الموظف
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {EMPLOYEE_WORKSPACE_SECTIONS.map(section => (
                        <EmployeeWorkspaceTabButton
                          key={section.key}
                          active={
                            activeEmployeeWorkspaceSection === section.key
                          }
                          icon={section.icon}
                          label={section.label}
                          onClick={() =>
                            scrollToEmployeeWorkspaceSection(section.key)
                          }
                        />
                      ))}
                    </div>

                  </CardContent>
                </Card>

                <Card
                  id="employee-section-profile"
                  ref={employeeOverviewSectionRef}
                  className="order-10 scroll-mt-36 gap-0 overflow-hidden border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.95)_100%)] py-0 shadow-sm lg:scroll-mt-44"
                >
                  <CardHeader className="border-b border-white/70 bg-white/70 px-6 pt-6 pb-4 backdrop-blur">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                            <UserRound className="h-4 w-4 text-[#030640]" />
                            ملخص الموظف
                          </div>
                          <CardTitle className="text-2xl tracking-tight text-slate-950">
                            {selectedEmployeeProfile.personal.name}
                          </CardTitle>
                          <CardDescription className="text-sm text-slate-500">
                            {selectedEmployeeProfile.employment.title}
                          </CardDescription>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="rounded-full">
                            {selectedEmployeeProfile.employment.department}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full",
                              selectedEmployeeProfile.employment.statusTone ===
                                "success"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : selectedEmployeeProfile.employment
                                  .statusTone === "warning"
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : "border-slate-200 bg-slate-100 text-slate-700"
                            )}
                          >
                            {selectedEmployeeProfile.employment.statusLabel}
                          </Badge>
                          {selectedEmployeeProfile.employment.employeeCode !==
                            EMPLOYEE_EMPTY_VALUE ? (
                            <Badge variant="outline" className="rounded-full">
                              رقم الموظف:{" "}
                              {selectedEmployeeProfile.employment.employeeCode}
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

                  <CardContent className="p-5">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <ReadonlyMeta
                        icon={Mail}
                        label="البريد"
                        value={selectedEmployeeProfile.personal.email}
                        dir="ltr"
                      />
                      <ReadonlyMeta
                        icon={Phone}
                        label="الجوال"
                        value={
                          selectedEmployeeProfile.personal.phone ||
                          EMPLOYEE_EMPTY_VALUE
                        }
                        dir="ltr"
                      />
                      <ReadonlyMeta
                        icon={CalendarDays}
                        label="بداية العمل"
                        value={
                          selectedEmployeeProfile.employment.startDate
                            ? formatDateEN(
                              selectedEmployeeProfile.employment.startDate
                            )
                            : EMPLOYEE_EMPTY_VALUE
                        }
                      />
                      <ReadonlyMeta
                        icon={ShieldCheck}
                        label="رقم البصمة"
                        value={
                          selectedEmployeeProfile.employment.fingerprintNumber
                        }
                        dir="ltr"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card
                  id="employee-section-messages"
                  ref={employeeMessagesSectionRef}
                  className="order-40 scroll-mt-36 gap-0 overflow-hidden border-slate-200/80 bg-white/95 py-0 shadow-sm lg:scroll-mt-44"
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

                      <div className="grid gap-3 sm:grid-cols-3">
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
                            <ScrollArea className="h-[420px] pr-1">
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
                            </ScrollArea>
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
                  className="order-50 scroll-mt-36 gap-0 overflow-hidden border-slate-200/80 bg-white/95 py-0 shadow-sm lg:scroll-mt-44"
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
                                  {EMPLOYEE_FILE_TYPE_OPTIONS
                                    .filter(option =>
                                      !["cv", "education_certificate"].includes(option.value)
                                    )
                                    .map(option => (<SelectItem
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
                                onClick={() => employeeFileInputRef.current?.click()}
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
                                  (!canManageEmployees || uploadingEmployeeFile) &&
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
                                className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-5"
                              >
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="min-w-0 space-y-3">
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
                                      <div className="text-lg font-semibold text-slate-950">
                                        {file.title}
                                      </div>
                                      <div className="mt-1 text-sm text-slate-500">
                                        {file.uploadedAtDate
                                          ? `تاريخ الرفع: ${formatDateTimeEN(file.uploadedAtDate)}`
                                          : "تاريخ الرفع غير متوفر"}
                                      </div>
                                    </div>

                                    <p className="text-sm leading-7 text-slate-600">
                                      {file.description ||
                                        "لا يوجد وصف لهذا الملف."}
                                    </p>

                                    <div className="flex flex-wrap gap-2">
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

                                  <div className="flex flex-wrap gap-2 lg:justify-end">
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
                  className="order-25 scroll-mt-36 gap-0 overflow-hidden border-slate-200/80 bg-white/95 py-0 shadow-sm lg:scroll-mt-44"
                >
                  <CardHeader className="border-b border-white/70 bg-white/70 px-6 pt-6 pb-4 backdrop-blur">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                          <BadgeCheck className="h-4 w-4" />
                          الرواتب
                        </div>
                        <div className="text-2xl font-semibold tracking-tight text-slate-950">
                          الراتب والحضور والخصومات
                        </div>
                        <p className="max-w-2xl text-sm leading-7 text-slate-500">
                          أدخل الراتب الأساسي وساعات العمل والساعات الفعلية، وسيتم احتساب الراتب
                          الفعلي تلقائيًا بعد تطبيق الخصومات.
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <LeaveOverviewStat
                          icon={BadgeCheck}
                          label="الراتب الأساسي"
                          value={`${formatNumberEN(baseSalaryNumber || 0)} ر.س`}
                        />
                        <LeaveOverviewStat
                          icon={Clock3}
                          label="فرق الساعات"
                          value={
                            calculatedHoursDifference > 0
                              ? `+${formatNumberEN(calculatedHoursDifference)} ساعة إضافية`
                              : calculatedHoursDifference < 0
                                ? `${formatNumberEN(calculatedHoursDifference)} ساعة نقص`
                                : "0 ساعة"
                          }
                        />
                        <LeaveOverviewStat
                          icon={CheckCircle2}
                          label="الراتب الفعلي"
                          value={`${formatNumberEN(calculatedNetSalary || 0)} ر.س`}
                        />
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-6 p-5">
                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
                      <Field label="الراتب الأساسي">
                        <Input
                          type="number"
                          dir="rtl"
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

                      <Field label="عدد أيام العمل">
                        <Input
                          type="number"
                          dir="rtl"
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

                      <Field label="عدد ساعات العمل">
                        <Input
                          type="number"
                          dir="rtl"
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

                      <Field label="عدد الساعات الفعلية">
                        <Input
                          type="number"
                          dir="rtl"
                          inputMode="decimal"
                          step="0.5"
                          value={form.actualWorkedHours}
                          onChange={event =>
                            handleFormChange(
                              "actualWorkedHours",
                              normalizeEnglishDigits(event.target.value)
                            )
                          }
                          placeholder="مثال: 228"
                          className="text-right tabular-nums"
                          disabled={!canManageEmployees || saving}
                        />
                      </Field>

                      <Field label="سعر ساعة الأوفر تايم">
                        <Input
                          type="number"
                          dir="rtl"
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
                          type="number"
                          dir="rtl"
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

                      <Field label="الراتب قبل الخصومات">
                        <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                          {formatNumberEN(calculatedGrossSalary || 0)} ر.س
                        </div>
                      </Field>
                    </div>

                    <div className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-base font-semibold text-slate-950">
                            الخصومات
                          </div>
                          <p className="text-sm leading-6 text-slate-500">
                            أضف أي خصم مثل الغياب أو التأخير أو أي استقطاع آخر.
                          </p>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleAddSalaryDeduction}
                          disabled={!canManageEmployees || saving}
                        >
                          إضافة خصم
                        </Button>
                      </div>

                      {salaryDeductions.length ? (
                        <div className="space-y-3">
                          {salaryDeductions.map(item => (
                            <div
                              key={item.id}
                              className="grid gap-3 rounded-[20px] border border-slate-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_180px_auto]"
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
                                    normalizeEnglishDigits(event.target.value)
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
                                onClick={() => handleRemoveSalaryDeduction(item.id)}
                                disabled={!canManageEmployees || saving}
                              >
                                حذف
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-[20px] border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                          لا توجد خصومات مضافة حتى الآن.
                        </div>
                      )}

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                        <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                          <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                            فرق الساعات
                          </div>
                          <div
                            className={cn(
                              "mt-2 text-lg font-semibold",
                              calculatedHoursDifference > 0 && "text-emerald-600",
                              calculatedHoursDifference < 0 && "text-red-600",
                              calculatedHoursDifference === 0 && "text-slate-950"
                            )}
                          >                            {calculatedHoursDifference > 0 && (
                            <>+{formatNumberEN(calculatedHoursDifference)} ساعة إضافية</>
                          )}

                            {calculatedHoursDifference < 0 && (
                              <>{formatNumberEN(calculatedHoursDifference)} ساعة نقص</>
                            )}

                            {calculatedHoursDifference === 0 && (
                              <>0 ساعة</>
                            )}
                          </div>
                        </div>

                        <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                          <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                            راتب اليوم
                          </div>
                          <div className="mt-2 text-lg font-semibold text-slate-950">
                            {formatNumberEN(calculatedDailyRate || 0)} ر.س
                          </div>
                        </div>

                        <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                          <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                            راتب الساعة
                          </div>
                          <div className="mt-2 text-lg font-semibold text-slate-950">
                            {formatNumberEN(calculatedHourlyRate || 0)} ر.س
                          </div>
                        </div>

                        <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                          <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                            قيمة الأوفر تايم
                          </div>
                          <div className="mt-2 text-lg font-semibold text-slate-950">
                            {formatNumberEN(calculatedOvertimeAmount || 0)} ر.س
                          </div>
                        </div>

                        <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                          <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                            خصم نقص الساعات
                          </div>
                          <div className="mt-2 text-lg font-semibold text-slate-950">
                            {formatNumberEN(calculatedMissingDeduction || 0)} ر.س
                          </div>
                        </div>

                        <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                          <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                            الراتب قبل الخصومات
                          </div>
                          <div className="mt-2 text-lg font-semibold text-slate-950">
                            {formatNumberEN(calculatedGrossSalary || 0)} ر.س
                          </div>
                        </div>

                        <div className="rounded-[20px] border border-emerald-200 bg-emerald-50/70 px-4 py-4">
                          <div className="text-xs font-semibold tracking-[0.14em] text-emerald-700">
                            الراتب الفعلي النهائي
                          </div>
                          <div className="mt-2 text-lg font-semibold text-emerald-800">
                            {formatNumberEN(calculatedNetSalary || 0)} ر.س
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
                      <div className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-5">
                        <div className="space-y-1">
                          <div className="text-base font-semibold text-slate-950">
                            تسجيل غياب
                          </div>
                          <p className="text-sm leading-6 text-slate-500">
                            يمكن تسجيل الغياب الحالي أو بأثر رجعي، وسيتم احتسابه فقط عند
                            إنشاء سجل راتب الشهر المحدد.
                          </p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <Field label="تاريخ الغياب">
                            <Input
                              type="date"
                              value={absenceForm.date}
                              onChange={event =>
                                handleAbsenceFormChange("date", event.target.value)
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
                                        {getEmployeeAbsenceTypeLabel(absence.type)}
                                      </Badge>
                                      <Badge
                                        variant="outline"
                                        className="rounded-full border-slate-200 bg-white text-slate-600"
                                      >
                                        {formatDateTimeEN(absence.createdAt)}
                                      </Badge>
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
                      </div>

                      <div className="space-y-6 rounded-[24px] border border-slate-200 bg-slate-50/70 p-5 sm:p-6">
                        <div className="space-y-6">
                          <div className="max-w-3xl space-y-2">
                            <div className="text-base font-semibold text-slate-950">
                              إضافة راتب نهاية الشهر
                            </div>
                            <p className="text-sm leading-7 text-slate-500">
                              يتم إنشاء سجل راتب شهري مستقل للموظف، ويشمل ملخص الغياب لذلك الشهر
                              ضمن التقرير فقط دون ربط سجل الرواتب بسجل الغياب نفسه.
                            </p>
                          </div>

                          <div className="space-y-6">
                            <div className="max-w-xs">
                              <Field label="الشهر المستهدف">
                                <Input
                                  type="month"
                                  value={payrollMonthInput}
                                  onChange={event =>
                                    setPayrollMonthInput(event.target.value)
                                  }
                                  disabled={
                                    !canManageEmployees || creatingPayrollRecord
                                  }
                                />
                              </Field>
                            </div>

                            <div className="w-full">
                              <Field
                                label="إرفاق مستند مدد (اختياري/إجباري)"
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
                                        {formatFileSizeEN(payrollMudadDocument.size)}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="max-w-md space-y-2">
                                      <div className="font-semibold text-slate-950">
                                        اسحب مستند مدد هنا أو انقر للاختيار
                                      </div>
                                      <div className="text-xs leading-6 text-slate-600">
                                        سيتم حفظ المرفق مع سجل راتب الشهر الحالي.
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
                              توجد تغييرات غير محفوظة في بيانات الراتب الحالية. احفظها أولًا
                              ثم أنشئ سجل نهاية الشهر.
                            </span>
                          ) : selectedPayrollRecord && selectedPayrollMonthMeta ? (
                            <span>
                              يوجد بالفعل سجل راتب محفوظ لشهر{" "}
                              {selectedPayrollMonthMeta.label}.
                            </span>
                          ) : selectedPayrollMonthMeta ? (
                            <span>
                              سيتم احتساب جميع غيابات شهر {selectedPayrollMonthMeta.label} ثم
                              حفظ الراتب النهائي كسجل مستقل لا يتغير تلقائيًا لاحقًا.
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
                                        أضيف في {formatDateTimeEN(record.createdAt)}
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
                                            {record.mudadDocument.fileName || "مستند مدد"}
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
                                                href={record.mudadDocumentViewUrl}
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
                                                href={record.mudadDocumentDownloadUrl}
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
                                        <span>المستند المرفق: لا يوجد مستند مدد محفوظ</span>
                                      </div>
                                    )}
                                  </div>

                                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                                      <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                                        الراتب الأساسي
                                      </div>
                                      <div className="mt-2 text-base font-semibold text-slate-950">
                                        {formatNumberEN(record.baseSalary || 0)} ر.س
                                      </div>
                                    </div>

                                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                                      <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                                        أيام الغياب
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
                                        {formatNumberEN(record.absenceDeduction || 0)} ر.س
                                      </div>
                                    </div>

                                    <div className="rounded-[18px] border border-emerald-200 bg-emerald-50/70 px-4 py-4">
                                      <div className="text-xs font-semibold tracking-[0.14em] text-emerald-700">
                                        الراتب النهائي
                                      </div>
                                      <div className="mt-2 text-base font-semibold text-emerald-800">
                                        {formatNumberEN(record.finalSalary || 0)} ر.س
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                                      <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                                        خصم التأخير / نقص الساعات
                                      </div>
                                      <div className="mt-2 text-sm font-semibold text-slate-900">
                                        {formatNumberEN(record.delayDeduction || 0)} ر.س
                                      </div>
                                    </div>

                                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                                      <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                                        مكافأة الإضافي
                                      </div>
                                      <div className="mt-2 text-sm font-semibold text-slate-900">
                                        {formatNumberEN(record.overtimeBonus || 0)} ر.س
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
                  id="employee-section-leave"
                  ref={employeeLeaveSectionRef}
                  className="order-30 scroll-mt-36 gap-0 overflow-hidden border-slate-200/80 bg-white/95 py-0 shadow-sm lg:scroll-mt-44"
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
                          هذا القسم هو المرجع الكامل للإجازات: الرصيد الحالي، آخر خصم تم،
                          آخر إجازة معتمدة، مجموع الأيام المعتمدة، والطلبات المعلقة وسجل المراجعة.
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
                              ? formatLeaveDaysLabel(latestDeductedLeaveRequest.daysCount)
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
                            {formatNumberEN(previousLeaveBalanceBeforeLastApproval)} يوم
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
                              ? formatDateTimeEN(latestDeductedLeaveRequest.reviewedAt)
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
                              استخدم هذا الإجراء فقط عند وجود تسوية إدارية أو تصحيح رصيد أو ترحيل رصيد من فترة سابقة.
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
                              disabled={!canManageEmployees || savingManualLeaveBalance}
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
                              disabled={!canManageEmployees || savingManualLeaveBalance}
                            />
                            {manualLeaveBalanceOperation === "deduct" &&
                            manualLeaveBalanceAmount !== null &&
                            manualLeaveBalanceAmount > 0 ? (
                              <p className="mt-2 text-xs leading-6 text-slate-500">
                                سيتم خصم {formatNumberEN(manualLeaveBalanceAmount)} يوم من الرصيد الحالي
                                {manualLeaveDeductionPreview !== null
                                  ? `، وسيصبح الرصيد ${formatNumberEN(manualLeaveDeductionPreview)} يوم`
                                  : ""}
                              </p>
                            ) : null}
                          </Field>

                          <Field label="سبب التعديل">
                            <Textarea
                              value={manualLeaveAdjustmentReason}
                              onChange={event => setManualLeaveAdjustmentReason(event.target.value)}
                              placeholder="مثال: ترحيل رصيد من السنة الماضية أو تصحيح إداري"
                              className="min-h-20"
                              disabled={!canManageEmployees || savingManualLeaveBalance}
                            />
                          </Field>
                        </div>

                        <div className="mt-3 flex max-w-xl justify-start">
                          <Button
                            type="button"
                            className="w-full bg-[#F2B705] text-slate-950 hover:bg-[#e0ab00] sm:w-auto"
                            onClick={() => void handleSaveManualLeaveBalance()}
                            disabled={!canManageEmployees || savingManualLeaveBalance}
                          >
                            <Save className="ml-2 h-4 w-4" />
                            {savingManualLeaveBalance ? "جارٍ الحفظ..." : "حفظ الرصيد"}
                          </Button>
                        </div>

                        {latestManualLeaveAdjustmentMeta ? (
                          <div className="mt-4 rounded-[20px] border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-700">
                            <div>
                              <span className="font-semibold text-slate-900">آخر تعديل:</span>{" "}
                              {latestManualLeaveAdjustmentMeta.adjustedAt
                                ? formatDateTimeEN(latestManualLeaveAdjustmentMeta.adjustedAt)
                                : "غير متوفر"}
                            </div>
                            {latestManualLeaveAdjustmentMeta.operationLabel ||
                            latestManualLeaveAdjustmentMeta.operationType ? (
                              <div>
                                <span className="font-semibold text-slate-900">نوع العملية:</span>{" "}
                                {latestManualLeaveAdjustmentMeta.operationLabel ||
                                  (latestManualLeaveAdjustmentMeta.operationType === "deduct"
                                    ? "خصم"
                                    : "إضافة")}
                              </div>
                            ) : null}
                            <div>
                              <span className="font-semibold text-slate-900">من:</span>{" "}
                              {formatNumberEN(Number(latestManualLeaveAdjustmentMeta.previousBalance) || 0)} يوم
                            </div>
                            <div>
                              <span className="font-semibold text-slate-900">إلى:</span>{" "}
                              {formatNumberEN(Number(latestManualLeaveAdjustmentMeta.nextBalance) || 0)} يوم
                            </div>
                            <div>
                              <span className="font-semibold text-slate-900">السبب:</span>{" "}
                              {latestManualLeaveAdjustmentMeta.reason || "غير متوفر"}
                            </div>
                            <div>
                              <span className="font-semibold text-slate-900">بواسطة:</span>{" "}
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
                                    {item.operationLabel || item.operationType ? (
                                      <div>
                                        <span className="font-semibold text-slate-900">نوع العملية:</span>{" "}
                                        {item.operationLabel ||
                                          (item.operationType === "deduct"
                                            ? "خصم"
                                            : "إضافة")}
                                      </div>
                                    ) : null}
                                    <div>
                                      <span className="font-semibold text-slate-900">من:</span>{" "}
                                      {formatNumberEN(Number(item.previousBalance) || 0)} يوم
                                    </div>
                                    <div>
                                      <span className="font-semibold text-slate-900">إلى:</span>{" "}
                                      {formatNumberEN(Number(item.nextBalance) || 0)} يوم
                                    </div>
                                    <div>
                                      <span className="font-semibold text-slate-900">الفرق:</span>{" "}
                                      {formatNumberEN(Number(item.difference) || 0)} يوم
                                    </div>
                                    <div>
                                      <span className="font-semibold text-slate-900">السبب:</span>{" "}
                                      {item.reason || "غير متوفر"}
                                    </div>
                                    <div>
                                      <span className="font-semibold text-slate-900">بواسطة:</span>{" "}
                                      {item.createdByName || item.createdByEmail || "غير متوفر"}
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
                                      <LeaveImpactBadge status={request.status} />
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
                                        {formatLeaveDaysLabel(request.daysCount)}
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
                                            {formatNumberEN(getLeaveBalanceBeforeRequest(request) || 0)} يوم
                                          </div>

                                          <div>
                                            <span className="font-semibold text-slate-900">
                                              الرصيد بعد الطلب:
                                            </span>{" "}
                                            {formatNumberEN(getLeaveBalanceAfterRequest(request) || 0)} يوم
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

                <Card className="order-20 gap-0 overflow-hidden border-slate-200/80 bg-white/95 py-0 shadow-sm">
                  <CardHeader className="border-b border-slate-100 bg-white/90 px-6 pt-6 pb-4">
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

                  <CardContent className="space-y-6 p-6">
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
                        <Input
                          type="date"
                          value={form.startDate}
                          onChange={event =>
                            handleFormChange("startDate", event.target.value)
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

                      <Field
                        label="صلاحية الصفحة"
                        description={
                          canManageEmployees
                            ? "يمكنك تعديل بيانات العمل وحفظها من هذه الصفحة."
                            : "تمتلك صلاحية عرض فقط، والحفظ معطل لهذا الحساب."
                        }
                      >
                        <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                          {canManageEmployees
                            ? "إدارة كاملة لبيانات الموظف الوظيفية"
                            : "عرض بيانات الموظف الوظيفية فقط"}
                        </div>
                      </Field>
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

                    <div className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
                      <div className="space-y-1">
                        <div className="text-base font-semibold text-slate-950">
                          المستندات الرسمية
                        </div>
                        <p className="text-sm leading-6 text-slate-500">
                          ارفع أي مستند رسمي يخص الموظف، وسيظهر داخل بياناته الوظيفية.
                        </p>
                      </div>

                      <div className="grid gap-5 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
                        <div className="space-y-4 rounded-[20px] border border-slate-200 bg-white p-4">
                          <Field label="عنوان المستند">
                            <Input
                              value={officialDocumentForm.title}
                              onChange={event =>
                                handleOfficialDocumentFormChange("title", event.target.value)
                              }
                              placeholder="مثال: عقد عمل، شهادة خبرة، هوية"
                              disabled={!canManageEmployees || uploadingOfficialDocument}
                            />
                          </Field>

                          <Field label="وصف المستند (اختياري)">
                            <Textarea
                              value={officialDocumentForm.description}
                              onChange={event =>
                                handleOfficialDocumentFormChange("description", event.target.value)
                              }
                              placeholder="أضف ملاحظة مختصرة عن المستند"
                              className="min-h-24"
                              disabled={!canManageEmployees || uploadingOfficialDocument}
                            />
                          </Field>

                          <Field label="نوع المستند">
                            <Select
                              value={officialDocumentForm.fileType}
                              onValueChange={value =>
                                handleOfficialDocumentFormChange("fileType", value)
                              }
                              disabled={!canManageEmployees || uploadingOfficialDocument}
                            >
                              <SelectTrigger className="w-full bg-white">
                                <SelectValue placeholder="اختر نوع المستند" />
                              </SelectTrigger>
                              <SelectContent>
                                {OFFICIAL_DOCUMENT_TYPE_OPTIONS.map(option => (
                                  <SelectItem key={option.value} value={option.value}>
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
                              disabled={!canManageEmployees || uploadingOfficialDocument}
                            />
                            <div
                              role="button"
                              tabIndex={canManageEmployees && !uploadingOfficialDocument ? 0 : -1}
                              onClick={() => officialDocumentInputRef.current?.click()}
                              onKeyDown={event => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  officialDocumentInputRef.current?.click();
                                }
                              }}
                              onDragOver={event => event.preventDefault()}
                              onDrop={handleOfficialDocumentDrop}
                              className={cn(
                                "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600 transition hover:border-[#F2B705] hover:bg-[#F2B705]/5",
                                (!canManageEmployees || uploadingOfficialDocument) &&
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
                                    الحجم: {formatFileSizeEN(officialDocumentForm.file.size)}
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <div className="font-semibold text-slate-900">
                                    اسحب الملف هنا أو انقر للاختيار
                                  </div>
                                  <div>سيتم إرفاق الملف ضمن المستندات الرسمية للموظف.</div>
                                </div>
                              )}
                            </div>
                          </Field>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              className="h-10 rounded-lg bg-[#F2B705] px-4 text-slate-950 hover:bg-[#e0ab00]"
                              onClick={() => void handleUploadOfficialDocument()}
                              disabled={!canManageEmployees || uploadingOfficialDocument}
                            >
                              <Upload className="ml-2 h-4 w-4" />
                              {uploadingOfficialDocument ? "جارٍ رفع المستند..." : "رفع المستند"}
                            </Button>

                            <Button
                              type="button"
                              variant="outline"
                              className="h-10 rounded-lg px-4"
                              onClick={resetOfficialDocumentForm}
                              disabled={!canManageEmployees || uploadingOfficialDocument}
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
                                className="space-y-4 rounded-[20px] border border-slate-200 bg-white p-4"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="space-y-2">
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
                                  <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-600">
                                    {file.description}
                                  </div>
                                ) : null}

                                <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4">
                                  <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3">
                                    <div className="text-xs text-slate-500">اسم الملف</div>
                                    <div className="mt-1 font-semibold text-slate-900">
                                      {file.fileName}
                                    </div>
                                  </div>
                                  <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3">
                                    <div className="text-xs text-slate-500">الحجم</div>
                                    <div className="mt-1 font-semibold text-slate-900">
                                      {formatFileSizeEN(file.fileSize ?? null)}
                                    </div>
                                  </div>
                                  <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2 xl:col-span-2">
                                    <div className="text-xs text-slate-500">تاريخ الرفع</div>
                                    <div className="mt-1 font-semibold text-slate-900">
                                      {file.uploadedAtDate
                                        ? formatDateTimeEN(file.uploadedAtDate)
                                        : "غير متوفر"}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  {file.viewUrl ? (
                                    <Button asChild type="button" variant="outline">
                                      <a href={file.viewUrl} target="_blank" rel="noreferrer">
                                        <Eye className="ml-2 h-4 w-4" />
                                        فتح الملف
                                      </a>
                                    </Button>
                                  ) : null}

                                  {file.downloadUrl ? (
                                    <Button asChild type="button" variant="outline">
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
                  <div className="pointer-events-none fixed inset-x-3 bottom-4 z-40 sm:inset-x-4 sm:bottom-5 xl:left-[calc(360px+2rem)] xl:right-8">
                    <div className="pointer-events-auto rounded-[28px] border border-slate-200 bg-white/95 px-5 py-4 shadow-[0_20px_45px_-24px_rgba(15,23,42,0.28)] backdrop-blur">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-1 text-right">
                          <div className="text-base font-semibold text-slate-950">
                            إجراءات الحفظ
                          </div>
                          <div className="text-sm text-slate-500">
                            هناك تعديلات غير محفوظة، يمكنك حفظها الآن أو استعادتها لآخر نسخة محفوظة.
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
            ) : (
              <Card className="gap-0 overflow-hidden border-slate-200/80 bg-white/95 py-0 shadow-sm">
                <CardContent className="p-6">
                  <Empty className="min-h-[560px] rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70">
                    <EmptyHeader>
                      <EmptyMedia
                        variant="icon"
                        className="bg-[#F2B705]/12 text-[#030640]"
                      >
                        <BriefcaseBusiness className="size-5" />
                      </EmptyMedia>
                      <EmptyTitle>لا يوجد موظف محدد</EmptyTitle>
                      <EmptyDescription>
                        اختر موظفًا من القائمة لعرض ملفه الوظيفي وإدارة بياناته.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
