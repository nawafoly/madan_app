import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  or,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import {
  BriefcaseBusiness,
  Clock3,
  Camera,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Minus,
  Phone,
  Plus,
  ShieldCheck,
  UserRound,
  CalendarDays,
  Building2,
  BadgeCheck,
  KeyRound,
  Send,
  Hash,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import EmployeeAttendanceCard from "@/components/EmployeeAttendanceCard";
import EmployeeTodayAttendancePanel from "@/components/EmployeeTodayAttendancePanel";
import EmployeeLayout from "@/components/EmployeeLayout";
import EmployeeCard from "@/components/employee-portal/EmployeeCard";
import InfoRow from "@/components/employee-portal/InfoRow";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { auth, db } from "@/_core/firebase";
import { hasPermission, useAuth } from "@/_core/hooks/useAuth";
import {
  EMPLOYEE_AVATAR_CATEGORY,
  EMPLOYEE_EMPTY_VALUE,
  buildEmployeeAvatarPatch,
  buildEmployeePhonePatch,
  normalizeEmployeeProfile,
  type EmployeeProfileUserDoc,
} from "@/lib/employeeProfile";
import {
  EMPLOYEE_FILES_COLLECTION,
  filterActiveEmployeeFiles,
  isOfficialEmployeeFile,
  normalizeEmployeeFileRecord,
  sortEmployeeFiles,
  type EmployeeFileRecord,
} from "@/lib/employeeFiles";
import {
  EMPLOYEE_LEAVE_REQUESTS_COLLECTION,
  EMPLOYEE_LEAVE_TYPE_OPTIONS,
  buildLeaveDateFromInput,
  buildEmployeeLeaveRequestPayload,
  calculateLeaveDaysCount,
  formatLeaveDateRange,
  formatLeaveDaysLabel,
  getLatestApprovedEmployeeLeaveRequest,
  getLeaveStatusMeta,
  getLeaveTypeLabel,
  normalizeEmployeeLeaveRequest,
  sortEmployeeLeaveRequests,
  type EmployeeLeaveRequestRecord,
} from "@/lib/employeeLeave";
import {
  EMPLOYEE_SERVICE_REQUESTS_COLLECTION,
  buildEmployeeServiceRequestPayload,
  getEmployeeServiceRequestStatusLabel,
  getEmployeeServiceRequestTypeLabel,
  normalizeEmployeeServiceRequest,
  sortEmployeeServiceRequests,
  type EmployeeServiceRequestRecord,
} from "@/lib/employeeServiceRequests";
import {
  EMPLOYEE_PAYROLL_RECORDS_COLLECTION,
  formatEmployeePayrollMonthLabel,
  normalizeEmployeePayrollRecord,
  sortEmployeePayrollRecords,
  type EmployeePayrollRecord,
} from "@/lib/employeePayroll";
import type { EmployeeServiceRequestType } from "@shared/employee";
import { uploadDocumentToCloudflare } from "@/lib/documentUploadService";
import { createInAppNotification } from "@/lib/inAppNotifications";
import {
  formatDateEN,
  formatDateTimeEN,
  formatFileSizeEN,
  formatNumberEN,
  toDateSafe,
} from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { languageDir, tr } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const AVATAR_CROP_OUTPUT_SIZE = 512;
const AVATAR_CROP_MIN_ZOOM = 1;
const AVATAR_CROP_MAX_ZOOM = 3;

function formatWorkScheduleTime(value?: string | null) {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(String(value || "").trim());
  if (!match) return "";

  const hours = Number(match[1]);
  const minutes = match[2];
  const displayHours = hours % 12 || 12;
  const suffix = hours < 12 ? "ص" : "م";
  return `${formatNumberEN(displayHours, { maximumFractionDigits: 0 })}:${minutes} ${suffix}`;
}

function formatWorkScheduleRange(input: {
  startTime?: string | null;
  endTime?: string | null;
}) {
  const start = formatWorkScheduleTime(input.startTime);
  const end = formatWorkScheduleTime(input.endTime);
  return start && end ? `${start} - ${end}` : EMPLOYEE_EMPTY_VALUE;
}

function formatCurrencyValue(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return EMPLOYEE_EMPTY_VALUE;
  return `${formatNumberEN(amount)} ر.س`;
}

function formatOptionalCurrencyValue(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "لا يوجد";
  return formatCurrencyValue(amount);
}

function formatLeaveDaysCountValue(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "0 يوم";
  return `${formatNumberEN(amount)} يوم`;
}

function sumMoneyValues(items: Array<{ amount?: number | null }>) {
  return items.reduce((sum, item) => {
    const amount = Number(item.amount || 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

function calculatePayrollBeforeManualDeductions(
  record: EmployeePayrollRecord | null
) {
  if (!record) return null;

  const baseSalary = Number(record.baseSalary || 0);
  const overtimeBonus = Number(record.overtimeBonus || 0);
  const attendanceAbsenceDeduction = Number(
    record.attendanceAbsenceDeduction || 0
  );
  const delayDeduction = Number(record.delayDeduction || 0);
  return Math.max(
    0,
    baseSalary + overtimeBonus - attendanceAbsenceDeduction - delayDeduction
  );
}

type AvatarCropDraft = {
  objectUrl: string;
  fileName: string;
  fileType: string;
  naturalWidth: number;
  naturalHeight: number;
};

type AvatarCropPosition = {
  x: number;
  y: number;
};

type AvatarCropMetrics = {
  width: number;
  height: number;
  maxOffsetX: number;
  maxOffsetY: number;
};

type EmployeePortalView =
  | "dashboard"
  | "attendance"
  | "requests"
  | "leave-request"
  | "permission-request"
  | "attendance-correction-request"
  | "overtime-request"
  | "salary-advance-request"
  | "resignation-request"
  | "exit-reentry-request"
  | "letter-request"
  | "hr-info"
  | "employment"
  | "work-schedule"
  | "salary-settings"
  | "salary"
  | "contracts"
  | "leaves"
  | "documents";

type EmployeeProfileSource = {
  collectionName: "employees" | "users";
  docId: string;
  entityId: string;
};

type EmployeeRecordScope = {
  authUid: string;
  employeeDocId: string | null;
};

const EMPLOYEE_PORTAL_VIEW_TITLES: Record<
  EmployeePortalView,
  { ar: string; en: string }
> = {
  dashboard: { ar: "بوابة الموظف", en: "Employee Portal" },
  attendance: { ar: "الحضور", en: "Attendance" },
  requests: { ar: "الطلبات", en: "Requests" },
  "leave-request": { ar: "طلب إجازة", en: "Leave Request" },
  "permission-request": { ar: "طلب استئذان", en: "Permission Request" },
  "attendance-correction-request": {
    ar: "طلب تصحيح",
    en: "Correction Request",
  },
  "overtime-request": { ar: "طلب أوفرتايم", en: "Overtime Request" },
  "salary-advance-request": {
    ar: "صرف معجل للراتب",
    en: "Salary Advance",
  },
  "resignation-request": { ar: "طلب استقالة", en: "Resignation Request" },
  "exit-reentry-request": {
    ar: "طلب خروج وعودة",
    en: "Exit/Re-entry Request",
  },
  "letter-request": { ar: "الخطابات", en: "Letters" },
  "hr-info": { ar: "معلومات الموارد البشرية", en: "HR Information" },
  employment: { ar: "البيانات الوظيفية", en: "Employment Details" },
  "work-schedule": { ar: "جدول الدوام", en: "Work Schedule" },
  "salary-settings": { ar: "بيانات الراتب", en: "Salary Details" },
  salary: { ar: "الراتب والتفاصيل المالية", en: "Payroll And Finance" },
  contracts: { ar: "العقود", en: "Contracts" },
  leaves: { ar: "الإجازات", en: "Leaves" },
  documents: { ar: "المستندات", en: "Documents" },
};

const EMPLOYEE_PORTAL_HASH_TO_VIEW: Record<string, EmployeePortalView> = {
  dashboard: "dashboard",
  attendance: "attendance",
  "employee-attendance": "attendance",
  requests: "requests",
  "employee-requests": "requests",
  "leave-request": "leave-request",
  "employee-leave-request": "leave-request",
  "permission-request": "permission-request",
  "employee-permission-request": "permission-request",
  "attendance-correction-request": "attendance-correction-request",
  "employee-attendance-correction-request": "attendance-correction-request",
  "overtime-request": "overtime-request",
  "employee-overtime-request": "overtime-request",
  "salary-advance-request": "salary-advance-request",
  "employee-salary-advance-request": "salary-advance-request",
  "resignation-request": "resignation-request",
  "employee-resignation-request": "resignation-request",
  "exit-reentry-request": "exit-reentry-request",
  "employee-exit-reentry-request": "exit-reentry-request",
  "letter-request": "letter-request",
  "employee-letter-request": "letter-request",
  "hr-info": "hr-info",
  "employee-profile-info": "hr-info",
  employment: "employment",
  "employee-employment-info": "employment",
  "work-schedule": "work-schedule",
  "employee-work-schedule": "work-schedule",
  "salary-settings": "salary-settings",
  "employee-salary-settings": "salary-settings",
  salary: "salary",
  "employee-payroll-info": "salary",
  contracts: "contracts",
  "employee-contracts-info": "contracts",
  leaves: "leaves",
  documents: "documents",
  "employee-documents-info": "documents",
};

const SERVICE_REQUEST_VIEW_TO_TYPE: Partial<
  Record<EmployeePortalView, EmployeeServiceRequestType>
> = {
  "attendance-correction-request": "attendance_correction",
  "permission-request": "permission",
  "overtime-request": "overtime",
  "salary-advance-request": "salary_advance",
  "resignation-request": "resignation",
  "exit-reentry-request": "exit_reentry",
  "letter-request": "letter",
};

function normalizeScopeValue(value: unknown) {
  const text = String(value ?? "").trim();
  return text && text !== "undefined" && text !== "null" ? text : "";
}

function buildEmployeeRecordScope(
  authUid: string | null | undefined,
  source: EmployeeProfileSource | null
): EmployeeRecordScope | null {
  const normalizedAuthUid = normalizeScopeValue(authUid);
  if (!normalizedAuthUid || !source) return null;

  return {
    authUid: normalizedAuthUid,
    employeeDocId:
      source.collectionName === "employees"
        ? normalizeScopeValue(source.docId) || null
        : null,
  };
}

function employeeRecordBelongsToScope(
  record: {
    employeeUid?: string | null;
    userId?: string | null;
    employeeId?: string | null;
    employeeDocId?: string | null;
  },
  scope: EmployeeRecordScope | null
) {
  if (!scope) return false;

  const recordAuthIds = [
    normalizeScopeValue(record.employeeUid),
    normalizeScopeValue(record.userId),
  ].filter(Boolean);
  const recordEmployeeDocId = normalizeScopeValue(
    record.employeeDocId || record.employeeId
  );

  if (scope.employeeDocId) {
    if (recordEmployeeDocId) {
      return recordEmployeeDocId === scope.employeeDocId;
    }

    return (
      scope.employeeDocId === scope.authUid &&
      recordAuthIds.includes(scope.authUid)
    );
  }

  return recordAuthIds.includes(scope.authUid);
}

function getEmployeePortalViewFromHash(): EmployeePortalView {
  if (typeof window === "undefined") return "dashboard";
  const hash = window.location.hash.replace(/^#/, "").trim();
  return EMPLOYEE_PORTAL_HASH_TO_VIEW[hash] || "dashboard";
}

function initialsFromName(name: string, email: string) {
  const source = String(name || email || "").trim();
  if (!source) return "م";
  const parts = source
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean)
    .slice(0, 2);
  return parts
    .map(part => part.charAt(0))
    .join("")
    .toUpperCase();
}

function friendlyPasswordError(code?: string) {
  switch (String(code || "").trim()) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "كلمة المرور الحالية غير صحيحة.";
    case "auth/weak-password":
      return "كلمة المرور الجديدة ضعيفة. استخدم 6 أحرف على الأقل.";
    case "auth/requires-recent-login":
      return "لأمان الحساب، سجّل الدخول مرة أخرى ثم حاول تغيير كلمة المرور.";
    default:
      return "تعذر تغيير كلمة المرور الآن.";
  }
}

function validatePhone(value: string) {
  const normalized = String(value || "").trim();
  const digits = normalized.replace(/\D/g, "");
  return normalized.length >= 7 && digits.length >= 7;
}

function validateAvatarFile(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("يرجى اختيار صورة فقط.");
  }

  if (file.size > AVATAR_MAX_SIZE_BYTES) {
    throw new Error("حجم الصورة كبير. الحد الأعلى 5MB.");
  }
}

function shouldReceiveLeaveNotification(userDoc: Record<string, any>) {
  if (userDoc?.active === false || userDoc?.isActive === false) return false;

  const role = String(userDoc?.role || userDoc?.roleKey || "")
    .trim()
    .toLowerCase();
  if (!role) return false;
  if (role === "owner" || role === "hr") return true;
  if (role !== "admin") return false;

  const subject = {
    role: "admin" as const,
    permissionsAllow: Array.isArray(userDoc?.permissionsAllow)
      ? userDoc.permissionsAllow
      : [],
    permissionsDeny: Array.isArray(userDoc?.permissionsDeny)
      ? userDoc.permissionsDeny
      : [],
    isActive: userDoc?.active ?? userDoc?.isActive ?? true,
  };

  return (
    hasPermission(subject, "employees.view") ||
    hasPermission(subject, "employees.manage")
  );
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getAvatarCropMetrics(input: {
  naturalWidth: number;
  naturalHeight: number;
  viewportSize: number;
  zoom: number;
}): AvatarCropMetrics {
  const viewportSize = Math.max(1, input.viewportSize);
  const naturalWidth = Math.max(1, input.naturalWidth);
  const naturalHeight = Math.max(1, input.naturalHeight);
  const zoom = clampNumber(
    input.zoom,
    AVATAR_CROP_MIN_ZOOM,
    AVATAR_CROP_MAX_ZOOM
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

function clampAvatarCropPosition(
  position: AvatarCropPosition,
  metrics: AvatarCropMetrics
): AvatarCropPosition {
  return {
    x: clampNumber(position.x, -metrics.maxOffsetX, metrics.maxOffsetX),
    y: clampNumber(position.y, -metrics.maxOffsetY, metrics.maxOffsetY),
  };
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("تعذر تحميل الصورة المختارة للمعاينة."));
    image.src = src;
  });
}

async function createAvatarCropDraft(file: File): Promise<AvatarCropDraft> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImageElement(objectUrl);
    return {
      objectUrl,
      fileName: file.name,
      fileType: file.type,
      naturalWidth: image.naturalWidth || image.width || 1,
      naturalHeight: image.naturalHeight || image.height || 1,
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function resolveAvatarOutputType(fileType: string) {
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

async function buildCroppedAvatarFile(input: {
  draft: AvatarCropDraft;
  viewportSize: number;
  zoom: number;
  position: AvatarCropPosition;
}) {
  const viewportSize = Math.max(1, input.viewportSize);
  const image = await loadImageElement(input.draft.objectUrl);
  const metrics = getAvatarCropMetrics({
    naturalWidth: input.draft.naturalWidth,
    naturalHeight: input.draft.naturalHeight,
    viewportSize,
    zoom: input.zoom,
  });
  const position = clampAvatarCropPosition(input.position, metrics);
  const outputType = resolveAvatarOutputType(input.draft.fileType);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("تعذر تجهيز الصورة المقصوصة.");
  }

  canvas.width = AVATAR_CROP_OUTPUT_SIZE;
  canvas.height = AVATAR_CROP_OUTPUT_SIZE;

  const scale = AVATAR_CROP_OUTPUT_SIZE / viewportSize;
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

  return new File([blob], `${fileNameBase}-avatar.${extension}`, {
    type: outputType,
    lastModified: Date.now(),
  });
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof UserRound;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-3">
      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-4 py-1.5 text-xs font-semibold text-slate-600">
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
          {title}
        </h2>
        <p className="text-sm leading-7 text-slate-600">{description}</p>
      </div>
    </div>
  );
}

function ReadonlyField({
  label,
  value,
  icon: Icon,
  dir,
}: {
  label: string;
  value: string;
  icon: typeof UserRound;
  dir?: "rtl" | "ltr";
}) {
  const { language } = useLanguage();

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div
        dir={dir}
        className="mt-2 break-words text-sm font-semibold leading-7 text-slate-950"
      >
        {value || EMPLOYEE_EMPTY_VALUE}
      </div>
      <div className="mt-3">
        <Badge
          variant="outline"
          className="rounded-full border-slate-200 bg-white/80 text-slate-500 shadow-none"
        >
          {tr(language, "عرض فقط", "Read Only")}
        </Badge>
      </div>
    </div>
  );
}

function EmploymentTile({
  label,
  value,
  icon: Icon,
  valueClassName,
  badge,
  dir,
}: {
  label: string;
  value: string;
  icon: typeof UserRound;
  valueClassName?: string;
  badge?: ReactNode;
  dir?: "rtl" | "ltr";
}) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white/95 p-5 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div
        dir={dir}
        className={cn(
          "mt-3 break-words text-lg font-semibold text-slate-950",
          valueClassName
        )}
      >
        {value}
      </div>
      {badge ? <div className="mt-3">{badge}</div> : null}
    </div>
  );
}

function getLocalizedLeaveStatusLabel(status: unknown, language: "ar" | "en") {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();
  if (normalized === "approved") return tr(language, "معتمد", "Approved");
  if (normalized === "rejected") return tr(language, "مرفوض", "Rejected");
  if (normalized === "pending") return tr(language, "بانتظار المراجعة", "Pending Review");
  return tr(language, String(status || "غير محدد").trim() || "غير محدد", "Not Set");
}

function formatDateTimeByLanguage(value: unknown, language: "ar" | "en") {
  if (language === "ar") return formatDateTimeEN(value);
  const date = toDateSafe(value);
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateByLanguage(value: unknown, language: "ar" | "en") {
  if (language === "ar") return formatDateEN(value);
  const date = toDateSafe(value);
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

function getLocalizedServiceRequestTypeLabel(
  value: unknown,
  language: "ar" | "en"
) {
  const normalized = String(value || "").trim();
  const labels: Record<string, { ar: string; en: string }> = {
    attendance_correction: { ar: "طلب تصحيح", en: "Correction Request" },
    permission: { ar: "طلب استئذان", en: "Permission Request" },
    overtime: { ar: "طلب أوفرتايم", en: "Overtime Request" },
    salary_advance: { ar: "صرف معجل للراتب", en: "Salary Advance" },
    resignation: { ar: "طلب استقالة", en: "Resignation Request" },
    exit_reentry: { ar: "طلب خروج وعودة", en: "Exit/Re-entry Request" },
    letter: { ar: "الخطابات", en: "Letters" },
  };
  const label = labels[normalized];
  if (label) return tr(language, label.ar, label.en);
  return tr(language, "طلب موظف", "Employee Request");
}

function getLocalizedServiceRequestStatusLabel(
  value: unknown,
  language: "ar" | "en"
) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "approved") return tr(language, "معتمد", "Approved");
  if (normalized === "rejected") return tr(language, "مرفوض", "Rejected");
  return tr(language, "قيد المراجعة", "Under Review");
}

function getLocalizedLeaveTypeLabel(value: unknown, language: "ar" | "en") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  const labels: Record<string, { ar: string; en: string }> = {
    annual: { ar: "إجازة سنوية", en: "Annual Leave" },
    sick: { ar: "إجازة مرضية", en: "Sick Leave" },
    emergency: { ar: "إجازة اضطرارية", en: "Emergency Leave" },
    unpaid: { ar: "إجازة بدون راتب", en: "Unpaid Leave" },
    other: { ar: "أخرى", en: "Other" },
  };
  const label = labels[normalized];
  if (label) return tr(language, label.ar, label.en);
  return tr(language, "غير محدد", "Not Set");
}

function LeaveStatusBadge({
  status,
  language = "ar",
}: {
  status: unknown;
  language?: "ar" | "en";
}) {
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
      {getLocalizedLeaveStatusLabel(status, language)}
    </Badge>
  );
}

function LeaveSummaryCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: typeof UserRound;
  accent?: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white/95 p-5 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
        <Icon className={cn("h-3.5 w-3.5", accent)} />
        {label}
      </div>
      <div className="mt-3 text-lg font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function getRequestStatusPresentation(status: unknown, language: "ar" | "en") {
  const meta = getLeaveStatusMeta(status);
  const normalized = String(status || "")
    .trim()
    .toLowerCase();

  if (
    normalized === "approved" ||
    normalized === "accepted" ||
    normalized === "approve"
  ) {
    return {
      label: getLocalizedLeaveStatusLabel(status, language) || meta.label || tr(language, "مقبول", "Approved"),
      dotClassName: "bg-emerald-500",
      badgeClassName: "bg-emerald-50 text-emerald-700",
    };
  }

  if (normalized === "rejected" || normalized === "declined") {
    return {
      label: getLocalizedLeaveStatusLabel(status, language) || meta.label || tr(language, "مرفوض", "Rejected"),
      dotClassName: "bg-red-500",
      badgeClassName: "bg-red-50 text-red-700",
    };
  }

  return {
    label: getLocalizedLeaveStatusLabel(status, language) || meta.label || tr(language, "قيد المراجعة", "Under Review"),
    dotClassName: "bg-amber-500",
    badgeClassName: "bg-amber-50 text-amber-700",
  };
}

function getRequestNumber(request: EmployeeLeaveRequestRecord, index: number) {
  const id = String(request.id || "").trim();
  if (!id) return String(233000 + index + 1);
  const compactId = id.replace(/[^a-zA-Z0-9]/g, "");
  return compactId.slice(-6).toUpperCase() || String(233000 + index + 1);
}

function getServiceRequestNumber(
  request: EmployeeServiceRequestRecord,
  index: number
) {
  const id = String(request.id || "").trim();
  if (!id) return String(333000 + index + 1);
  const compactId = id.replace(/[^a-zA-Z0-9]/g, "");
  return compactId.slice(-6).toUpperCase() || String(333000 + index + 1);
}

function RequestInfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-[96px] items-start gap-3 rounded-[18px] border border-slate-200/80 bg-slate-50/70 p-4 text-start">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-500 ring-1 ring-slate-200/80">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </div>
        <div className="mt-2 break-words text-base font-semibold text-slate-950">
          {value}
        </div>
      </div>
    </div>
  );
}

function RequestNote({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success";
}) {
  return (
    <div
      className={cn(
        "rounded-[18px] border px-4 py-3 text-sm leading-7",
        tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-slate-50 text-slate-700"
      )}
    >
      <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] opacity-70">
        {label}
      </div>
      {value}
    </div>
  );
}

function EmployeeRequestCard({
  request,
  index,
  language,
}: {
  request: EmployeeLeaveRequestRecord;
  index: number;
  language: "ar" | "en";
}) {
  const status = getRequestStatusPresentation(request.status, language);
  const requestNumber = getRequestNumber(request, index);
  const dateRange = formatLeaveDateRange(request.startDate, request.endDate);

  return (
    <article className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_22px_65px_-48px_rgba(15,23,42,0.32)]">
      <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div
          className={cn(
            "inline-flex w-fit rounded-full px-4 py-2 text-sm font-semibold",
            status.badgeClassName
          )}
        >
          {status.label}
        </div>

        <div className="min-w-0 space-y-1 text-start sm:text-end">
          <h3 className="text-xl font-semibold text-slate-950">
            {tr(language, "طلب إجازة", "Leave Request")}
          </h3>
          <div className="text-sm text-slate-400">
            {formatDateTimeByLanguage(request.createdAt, language)}
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-5 md:grid-cols-3">
        <RequestInfoRow
          icon={FileText}
          label={tr(language, "نوع الطلب", "Request Type")}
          value={getLocalizedLeaveTypeLabel(request.leaveType, language)}
        />
        <RequestInfoRow
          icon={CalendarDays}
          label={tr(language, "التاريخ المرتبط", "Related Date")}
          value={dateRange}
        />
        <RequestInfoRow
          icon={Hash}
          label={tr(language, "رقم الطلب", "Request Number")}
          value={requestNumber}
        />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-500">
        <span className="font-medium">
          {tr(language, "حالة الطلب", "Request Status")}
        </span>
        <span className="inline-flex items-center gap-2 font-semibold">
          <span className={cn("h-2.5 w-2.5 rounded-full", status.dotClassName)} />
          {status.label}
        </span>
      </div>
    </article>
  );
}

function EmployeeServiceRequestCard({
  request,
  index,
  language,
}: {
  request: EmployeeServiceRequestRecord;
  index: number;
  language: "ar" | "en";
}) {
  const status = getRequestStatusPresentation(request.status, language);
  const requestNumber = getServiceRequestNumber(request, index);
  const dateValue =
    request.startDate && request.endDate
      ? `${request.startDate} ${tr(language, "إلى", "to")} ${request.endDate}`
      : request.requestDate || request.startDate || "--";
  const timeValue =
    request.startTime || request.endTime
      ? `${request.startTime || "--"} - ${request.endTime || "--"}`
      : request.amount
        ? `${formatNumberEN(request.amount)} ${tr(language, "ر.س", "SAR")}`
        : request.letterType || "--";

  return (
    <article className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_22px_65px_-48px_rgba(15,23,42,0.32)]">
      <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div
          className={cn(
            "inline-flex w-fit rounded-full px-4 py-2 text-sm font-semibold",
            status.badgeClassName
          )}
        >
          {status.label}
        </div>

        <div className="min-w-0 space-y-1 text-start sm:text-end">
          <h3 className="text-xl font-semibold text-slate-950">
            {getLocalizedServiceRequestTypeLabel(
              request.requestType,
              language
            )}
          </h3>
          <div className="text-sm text-slate-400">
            {formatDateTimeByLanguage(request.createdAt, language)}
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
        <RequestInfoRow
          icon={FileText}
          label={tr(language, "نوع الطلب", "Request Type")}
          value={getLocalizedServiceRequestTypeLabel(
            request.requestType,
            language
          )}
        />
        <RequestInfoRow
          icon={CalendarDays}
          label={tr(language, "التاريخ", "Date")}
          value={dateValue}
        />
        <RequestInfoRow
          icon={Clock3}
          label={tr(language, "التفاصيل", "Details")}
          value={timeValue}
        />
        <RequestInfoRow
          icon={Hash}
          label={tr(language, "رقم الطلب", "Request Number")}
          value={requestNumber}
        />
      </div>

      {request.employeeNote || request.hrNote ? (
        <div className="space-y-3 border-t border-slate-100 px-5 pb-5 pt-0">
          {request.employeeNote ? (
            <RequestNote
              label={tr(language, "ملاحظة الموظف", "Employee Note")}
              value={request.employeeNote}
            />
          ) : null}
          {request.hrNote ? (
            <RequestNote
              label={tr(language, "ملاحظة HR", "HR Note")}
              value={request.hrNote}
              tone="success"
            />
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-500">
        <span className="font-medium">
          {tr(language, "حالة الطلب", "Request Status")}
        </span>
        <span className="inline-flex items-center gap-2 font-semibold">
          <span className={cn("h-2.5 w-2.5 rounded-full", status.dotClassName)} />
          {status.label}
        </span>
      </div>
    </article>
  );
}

function EmployeePortalViewHeader({
  title,
  description,
  backLabel = "Back",
  onBack,
}: {
  title: string;
  description?: string;
  backLabel?: string;
  onBack: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[28px] border border-slate-100 bg-white px-5 py-5 shadow-[0_18px_45px_-34px_rgba(15,23,42,0.35)]">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
          {title}
        </h2>
        {description ? (
          <p className="text-sm leading-6 text-slate-500">{description}</p>
        ) : null}
      </div>
      <Button
        type="button"
        variant="outline"
        className="h-10 rounded-2xl border-slate-200 bg-white px-4 text-slate-700"
        onClick={onBack}
      >
        {backLabel}
      </Button>
    </div>
  );
}

export default function EmployeeProfilePage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarCropViewportRef = useRef<HTMLDivElement | null>(null);
  const avatarCropDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const [userDoc, setUserDoc] = useState<EmployeeProfileUserDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<EmployeePortalView>(() =>
    getEmployeePortalViewFromHash()
  );
  const [phoneInput, setPhoneInput] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarCropOpen, setAvatarCropOpen] = useState(false);
  const [avatarCropDraft, setAvatarCropDraft] =
    useState<AvatarCropDraft | null>(null);
  const [avatarCropZoom, setAvatarCropZoom] = useState(1);
  const [avatarCropPosition, setAvatarCropPosition] =
    useState<AvatarCropPosition>({
      x: 0,
      y: 0,
    });
  const [avatarCropViewportSize, setAvatarCropViewportSize] = useState(320);
  const [avatarCropDragging, setAvatarCropDragging] = useState(false);
  const [leaveRequests, setLeaveRequests] = useState<
    EmployeeLeaveRequestRecord[]
  >([]);
  const [leaveRequestsLoading, setLeaveRequestsLoading] = useState(true);
  const [serviceRequests, setServiceRequests] = useState<
    EmployeeServiceRequestRecord[]
  >([]);
  const [serviceRequestsLoading, setServiceRequestsLoading] = useState(true);
  const [leaveForm, setLeaveForm] = useState({
    leaveType: "annual",
    startDate: "",
    endDate: "",
    employeeNote: "",
  });
  const [serviceRequestForm, setServiceRequestForm] = useState({
    requestDate: "",
    startDate: "",
    endDate: "",
    startTime: "",
    endTime: "",
    amount: "",
    letterType: "",
    employeeNote: "",
  });
  const [submittingLeaveRequest, setSubmittingLeaveRequest] = useState(false);
  const [submittingServiceRequest, setSubmittingServiceRequest] =
    useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [attendanceRefreshKey, setAttendanceRefreshKey] = useState(0);
  const [employeeFiles, setEmployeeFiles] = useState<EmployeeFileRecord[]>([]);
  const [employeeFilesLoading, setEmployeeFilesLoading] = useState(true);
  const [employeePayrollRecords, setEmployeePayrollRecords] = useState<
    EmployeePayrollRecord[]
  >([]);
  const [employeePayrollRecordsLoading, setEmployeePayrollRecordsLoading] =
    useState(true);
  const [employeeProfileSource, setEmployeeProfileSource] =
    useState<EmployeeProfileSource | null>(null);

  useEffect(() => {
    const syncViewFromHash = () => {
      setActiveView(getEmployeePortalViewFromHash());
    };

    syncViewFromHash();
    window.addEventListener("hashchange", syncViewFromHash);
    return () => window.removeEventListener("hashchange", syncViewFromHash);
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setEmployeeProfileSource(null);
      return;
    }

    let cancelled = false;

    const resolveSource = async () => {
      const linkedEmployeeId = String(user.linkedEmployeeId || "").trim();
      const candidateEmployeeDocIds = Array.from(
        new Set([linkedEmployeeId, user.uid].filter(Boolean))
      );

      for (const docId of candidateEmployeeDocIds) {
        try {
          const employeeSnapshot = await getDoc(doc(db, "employees", docId));
          if (employeeSnapshot.exists()) {
            if (!cancelled) {
              setEmployeeProfileSource({
                collectionName: "employees",
                docId,
                entityId: docId,
              });
            }
            return;
          }
        } catch (error) {
          console.error("employee_profile_source_lookup_failed", error);
        }
      }

      if (!cancelled) {
        setEmployeeProfileSource({
          collectionName: "users",
          docId: user.uid,
          entityId: user.uid,
        });
      }
    };

    void resolveSource();

    return () => {
      cancelled = true;
    };
  }, [
    user?.employeeProfileEnabled,
    user?.linkedEmployeeId,
    user?.role,
    user?.uid,
  ]);

  useEffect(() => {
    if (!user?.uid) {
      setUserDoc(null);
      setLoading(false);
      return;
    }

    if (!employeeProfileSource) {
      setLoading(true);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      doc(
        db,
        employeeProfileSource.collectionName,
        employeeProfileSource.docId
      ),
      snapshot => {
        const snapshotData = snapshot.data() as
          | EmployeeProfileUserDoc
          | undefined;
        setUserDoc(
          snapshot.exists()
            ? ({
                ...(snapshotData || {}),
                uid:
                  String(snapshotData?.uid || user.uid || snapshot.id).trim() ||
                  snapshot.id,
              } as EmployeeProfileUserDoc)
            : null
        );
        setLoading(false);
      },
      error => {
        console.error("employee_profile_snapshot_error", error);
        setUserDoc(null);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [employeeProfileSource, user?.uid]);

  const profile = useMemo(
    () =>
      normalizeEmployeeProfile(userDoc, {
        displayName: user?.displayName,
        email: user?.email,
        photoURL: user?.firebaseUser?.photoURL || auth.currentUser?.photoURL,
      }),
    [user?.displayName, user?.email, user?.firebaseUser?.photoURL, userDoc]
  );
  const employeeRecordScope = useMemo(
    () => buildEmployeeRecordScope(user?.uid, employeeProfileSource),
    [employeeProfileSource, user?.uid]
  );
  const avatarCropMetrics = useMemo(
    () =>
      avatarCropDraft
        ? getAvatarCropMetrics({
            naturalWidth: avatarCropDraft.naturalWidth,
            naturalHeight: avatarCropDraft.naturalHeight,
            viewportSize: avatarCropViewportSize,
            zoom: avatarCropZoom,
          })
        : null,
    [avatarCropDraft, avatarCropViewportSize, avatarCropZoom]
  );
  const avatarCropImageStyle = useMemo(() => {
    if (!avatarCropMetrics) return undefined;

    const position = clampAvatarCropPosition(
      avatarCropPosition,
      avatarCropMetrics
    );

    return {
      width: `${avatarCropMetrics.width}px`,
      height: `${avatarCropMetrics.height}px`,
      left: `${
        (avatarCropViewportSize - avatarCropMetrics.width) / 2 + position.x
      }px`,
      top: `${
        (avatarCropViewportSize - avatarCropMetrics.height) / 2 + position.y
      }px`,
    };
  }, [avatarCropMetrics, avatarCropPosition, avatarCropViewportSize]);
  const avatarCropMiniPreviewStyle = useMemo(() => {
    if (!avatarCropMetrics) return undefined;

    const previewSize = 112;
    const scale = previewSize / Math.max(1, avatarCropViewportSize);
    const position = clampAvatarCropPosition(
      avatarCropPosition,
      avatarCropMetrics
    );

    return {
      width: `${avatarCropMetrics.width * scale}px`,
      height: `${avatarCropMetrics.height * scale}px`,
      left: `${
        (previewSize - avatarCropMetrics.width * scale) / 2 + position.x * scale
      }px`,
      top: `${
        (previewSize - avatarCropMetrics.height * scale) / 2 +
        position.y * scale
      }px`,
    };
  }, [avatarCropMetrics, avatarCropPosition, avatarCropViewportSize]);
  const avatarCropZoomLabel = `${Math.round(avatarCropZoom * 100)}%`;

  useEffect(() => {
    return () => {
      if (avatarCropDraft?.objectUrl) {
        URL.revokeObjectURL(avatarCropDraft.objectUrl);
      }
    };
  }, [avatarCropDraft?.objectUrl]);

  useEffect(() => {
    if (!avatarCropOpen) return;

    const element = avatarCropViewportRef.current;
    if (!element) return;

    const updateViewportSize = () => {
      const nextSize = Math.max(
        240,
        Math.round(element.getBoundingClientRect().width)
      );
      setAvatarCropViewportSize(nextSize);
    };

    updateViewportSize();

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      updateViewportSize();
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [avatarCropOpen, avatarCropDraft]);

  useEffect(() => {
    if (!avatarCropMetrics) return;
    setAvatarCropPosition(current =>
      clampAvatarCropPosition(current, avatarCropMetrics)
    );
  }, [avatarCropMetrics]);

  useEffect(() => {
    if (!user?.uid) {
      setEmployeeFiles([]);
      setEmployeeFilesLoading(false);
      return;
    }

    setEmployeeFilesLoading(true);
    const unsubscribe = onSnapshot(
      query(
        collection(db, EMPLOYEE_FILES_COLLECTION),
        where("employeeUid", "==", user.uid)
      ),
      snapshot => {
        const rows = sortEmployeeFiles(
          snapshot.docs.map(docSnapshot =>
            normalizeEmployeeFileRecord(
              docSnapshot.id,
              (docSnapshot.data() as Record<string, any>) || {}
            )
          ).filter(record =>
            employeeRecordBelongsToScope(record, employeeRecordScope)
          )
        );
        setEmployeeFiles(rows);
        setEmployeeFilesLoading(false);
      },
      error => {
        console.error("employee_profile_files_snapshot_error", error);
        setEmployeeFiles([]);
        setEmployeeFilesLoading(false);
      }
    );

    return () => unsubscribe();
  }, [employeeRecordScope, user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setEmployeePayrollRecords([]);
      setEmployeePayrollRecordsLoading(false);
      return;
    }

    const linkedEmployeeId = String(user.linkedEmployeeId || "").trim();
    const payrollQuery =
      linkedEmployeeId && linkedEmployeeId !== user.uid
        ? query(
            collection(db, EMPLOYEE_PAYROLL_RECORDS_COLLECTION),
            or(
              where("employeeUid", "==", user.uid),
              where("employeeId", "==", linkedEmployeeId)
            )
          )
        : query(
            collection(db, EMPLOYEE_PAYROLL_RECORDS_COLLECTION),
            where("employeeUid", "==", user.uid)
          );

    setEmployeePayrollRecordsLoading(true);
    const unsubscribe = onSnapshot(
      payrollQuery,
      snapshot => {
        const rowsById = new Map<string, EmployeePayrollRecord>();
        snapshot.docs.forEach(docSnapshot => {
          rowsById.set(
            docSnapshot.id,
            normalizeEmployeePayrollRecord(
              docSnapshot.id,
              (docSnapshot.data() as Record<string, any>) || {}
            )
          );
        });
        setEmployeePayrollRecords(
          sortEmployeePayrollRecords(
            Array.from(rowsById.values()).filter(record =>
              employeeRecordBelongsToScope(record, employeeRecordScope)
            )
          )
        );
        setEmployeePayrollRecordsLoading(false);
      },
      error => {
        console.error("employee_payroll_records_snapshot_error", error);
        setEmployeePayrollRecords([]);
        setEmployeePayrollRecordsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [employeeRecordScope, user?.linkedEmployeeId, user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setLeaveRequests([]);
      setLeaveRequestsLoading(false);
      return;
    }

    setLeaveRequestsLoading(true);
    const unsubscribe = onSnapshot(
      query(
        collection(db, EMPLOYEE_LEAVE_REQUESTS_COLLECTION),
        or(
          where("userId", "==", user.uid),
          where("employeeUid", "==", user.uid)
        )
      ),
      snapshot => {
        const rows = sortEmployeeLeaveRequests(
          snapshot.docs.map(docSnapshot =>
            normalizeEmployeeLeaveRequest(
              docSnapshot.id,
              (docSnapshot.data() as Record<string, any>) || {}
            )
          ).filter(request =>
            employeeRecordBelongsToScope(request, employeeRecordScope)
          )
        );
        setLeaveRequests(rows);
        setLeaveRequestsLoading(false);
      },
      error => {
        console.error("employee_leave_requests_snapshot_error", error);
        setLeaveRequests([]);
        setLeaveRequestsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [employeeRecordScope, user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setServiceRequests([]);
      setServiceRequestsLoading(false);
      return;
    }

    setServiceRequestsLoading(true);
    const unsubscribe = onSnapshot(
      query(
        collection(db, EMPLOYEE_SERVICE_REQUESTS_COLLECTION),
        where("employeeUid", "==", user.uid)
      ),
      snapshot => {
        const rows = sortEmployeeServiceRequests(
          snapshot.docs.map(docSnapshot =>
            normalizeEmployeeServiceRequest(
              docSnapshot.id,
              (docSnapshot.data() as Record<string, any>) || {}
            )
          ).filter(request =>
            employeeRecordBelongsToScope(request, employeeRecordScope)
          )
        );
        setServiceRequests(rows);
        setServiceRequestsLoading(false);
      },
      error => {
        console.error("employee_service_requests_snapshot_error", error);
        setServiceRequests([]);
        setServiceRequestsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [employeeRecordScope, user?.uid]);

  useEffect(() => {
    setPhoneInput(profile.personal.phone || "");
  }, [profile.personal.phone]);

  const phoneDirty = phoneInput.trim() !== profile.personal.phone.trim();
  const phoneValid = validatePhone(phoneInput);
  const requestedLeaveDays = useMemo(
    () => calculateLeaveDaysCount(leaveForm.startDate, leaveForm.endDate),
    [leaveForm.endDate, leaveForm.startDate]
  );

  const latestApprovedLeaveRequest = useMemo(
    () => getLatestApprovedEmployeeLeaveRequest(leaveRequests),
    [leaveRequests]
  );
  const approvedLeaveRequests = useMemo(
    () => leaveRequests.filter(request => request.status === "approved"),
    [leaveRequests]
  );
  const approvedLeaveDaysCount = useMemo(
    () =>
      approvedLeaveRequests.reduce((sum, request) => {
        const daysCount = Number(request.daysCount || 0);
        return sum + (Number.isFinite(daysCount) ? daysCount : 0);
      }, 0),
    [approvedLeaveRequests]
  );
  const leaveEntitlementDaysCount =
    profile.employment.leaveBalance === null
      ? null
      : profile.employment.leaveBalance + approvedLeaveDaysCount;
  const latestPayrollRecord = employeePayrollRecords[0] || null;
  const latestPayrollBeforeManualDeductions =
    calculatePayrollBeforeManualDeductions(latestPayrollRecord);
  const fixedDeductionsTotal = sumMoneyValues(
    profile.employment.salaryDeductions
  );
  const latestPayrollAttachment = latestPayrollRecord?.mudadDocument || null;

  const employeeOfficialFiles = useMemo(
    () =>
      filterActiveEmployeeFiles(employeeFiles).filter(isOfficialEmployeeFile),
    [employeeFiles]
  );

  const handleSavePhone = async () => {
    const normalizedPhone = phoneInput.trim();
    if (!user?.uid || !employeeProfileSource) return;
    if (!validatePhone(normalizedPhone)) {
      toast.error("رقم الجوال غير صالح.");
      return;
    }

    setSavingPhone(true);
    try {
      await setDoc(
        doc(
          db,
          employeeProfileSource.collectionName,
          employeeProfileSource.docId
        ),
        {
          ...buildEmployeePhonePatch(normalizedPhone),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      toast.success("تم تحديث رقم الجوال.");
    } catch (error) {
      console.error("employee_phone_update_failed", error);
      toast.error("تعذر تحديث رقم الجوال.");
    } finally {
      setSavingPhone(false);
    }
  };

  const resetAvatarCropState = () => {
    setAvatarCropOpen(false);
    setAvatarCropDraft(null);
    setAvatarCropZoom(1);
    setAvatarCropPosition({ x: 0, y: 0 });
    setAvatarCropDragging(false);
    avatarCropDragRef.current = null;
  };

  const handleAvatarButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;
    if (!user?.uid || !employeeProfileSource) {
      toast.error("تعذر الوصول إلى ملف الموظف الحالي.");
      return;
    }

    try {
      validateAvatarFile(file);
      const draft = await createAvatarCropDraft(file);
      setAvatarCropDraft(draft);
      setAvatarCropZoom(1);
      setAvatarCropPosition({ x: 0, y: 0 });
      setAvatarCropOpen(true);
      return;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ملف الصورة غير صالح."
      );
      event.target.value = "";
      return;
    }
  };

  /*
      const uploaded = await uploadDocumentToCloudflare({
        entityType: "employee",
        entityId: employeeProfileSource.entityId,
        category: EMPLOYEE_AVATAR_CATEGORY,
        file,
        kind: "attachment",
        uploadedBy: user.uid,
        storageFolder: "profile_avatar",
      });

      const avatarPayload = {
        id: uploaded.id,
        fileName: uploaded.fileName,
        filePath: uploaded.filePath,
        fileUrl: uploaded.fileUrl,
        contentType: uploaded.contentType,
        fileSize: uploaded.fileSize,
        uploadedAt: uploaded.uploadedAt,
      };

      await setDoc(
        doc(
          db,
          employeeProfileSource.collectionName,
          employeeProfileSource.docId
        ),
        {
          ...buildEmployeeAvatarPatch(avatarPayload),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          photoURL: uploaded.fileUrl,
        });
      }

      toast.success("تم تحديث الصورة الشخصية.");
    } catch (error) {
      console.error("employee_avatar_upload_failed", error);
      toast.error("تعذر رفع الصورة الشخصية.");
    } finally {
      setUploadingAvatar(false);
      event.target.value = "";
    }
  };

    */

  const handleAvatarCropPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (!avatarCropMetrics) return;

    event.preventDefault();
    avatarCropDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: avatarCropPosition.x,
      originY: avatarCropPosition.y,
    };
    setAvatarCropDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleAvatarCropPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    const activeDrag = avatarCropDragRef.current;
    if (
      !activeDrag ||
      activeDrag.pointerId !== event.pointerId ||
      !avatarCropMetrics
    ) {
      return;
    }

    setAvatarCropPosition(
      clampAvatarCropPosition(
        {
          x: activeDrag.originX + (event.clientX - activeDrag.startX),
          y: activeDrag.originY + (event.clientY - activeDrag.startY),
        },
        avatarCropMetrics
      )
    );
  };

  const handleAvatarCropPointerEnd = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (avatarCropDragRef.current?.pointerId !== event.pointerId) return;

    avatarCropDragRef.current = null;
    setAvatarCropDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleAvatarCropZoomStep = (direction: "in" | "out") => {
    setAvatarCropZoom(current =>
      clampNumber(
        current + (direction === "in" ? 0.15 : -0.15),
        AVATAR_CROP_MIN_ZOOM,
        AVATAR_CROP_MAX_ZOOM
      )
    );
  };

  const handleConfirmAvatarCrop = async () => {
    if (!avatarCropDraft || !user?.uid || !employeeProfileSource) return;

    setUploadingAvatar(true);
    try {
      const croppedFile = await buildCroppedAvatarFile({
        draft: avatarCropDraft,
        viewportSize: avatarCropViewportSize,
        zoom: avatarCropZoom,
        position: avatarCropPosition,
      });
      const uploaded = await uploadDocumentToCloudflare({
        entityType: "employee",
        entityId: employeeProfileSource.entityId,
        category: EMPLOYEE_AVATAR_CATEGORY,
        file: croppedFile,
        kind: "attachment",
        uploadedBy: user.uid,
        storageFolder: "profile_avatar",
      });

      const avatarPayload = {
        id: uploaded.id,
        fileName: uploaded.fileName,
        filePath: uploaded.filePath,
        fileUrl: uploaded.fileUrl,
        contentType: uploaded.contentType,
        fileSize: uploaded.fileSize,
        uploadedAt: uploaded.uploadedAt,
      };

      await setDoc(
        doc(
          db,
          employeeProfileSource.collectionName,
          employeeProfileSource.docId
        ),
        {
          ...buildEmployeeAvatarPatch(avatarPayload),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          photoURL: uploaded.fileUrl,
        });
      }

      toast.success("تم تحديث الصورة الشخصية.");
      resetAvatarCropState();
    } catch (error) {
      console.error("employee_avatar_upload_failed", error);
      toast.error("تعذر رفع الصورة الشخصية.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleLeaveFormChange = (
    key: keyof typeof leaveForm,
    value: string
  ) => {
    setLeaveForm(current => ({
      ...current,
      [key]: value,
    }));
  };

  const handleServiceRequestFormChange = (
    key: keyof typeof serviceRequestForm,
    value: string
  ) => {
    setServiceRequestForm(current => ({
      ...current,
      [key]: value,
    }));
  };

  const resetServiceRequestForm = () => {
    setServiceRequestForm({
      requestDate: "",
      startDate: "",
      endDate: "",
      startTime: "",
      endTime: "",
      amount: "",
      letterType: "",
      employeeNote: "",
    });
  };

  const handleSubmitServiceRequest = async () => {
    const requestType = SERVICE_REQUEST_VIEW_TO_TYPE[activeView];
    if (!requestType) return;

    if (!user?.uid || !employeeProfileSource) {
      toast.error("تعذر تحديد ملف الموظف الحالي.");
      return;
    }

    const amount = Number(serviceRequestForm.amount || 0);
    const needsRequestDate = [
      "attendance_correction",
      "permission",
      "overtime",
      "resignation",
    ].includes(requestType);
    const needsTimeRange = [
      "attendance_correction",
      "permission",
      "overtime",
    ].includes(requestType);

    if (needsRequestDate && !serviceRequestForm.requestDate) {
      toast.error("حدد تاريخ الطلب.");
      return;
    }

    if (
      needsTimeRange &&
      (!serviceRequestForm.startTime || !serviceRequestForm.endTime)
    ) {
      toast.error("حدد وقت البداية والنهاية.");
      return;
    }

    if (
      requestType === "salary_advance" &&
      (!Number.isFinite(amount) || amount <= 0)
    ) {
      toast.error("أدخل مبلغ السلفة بشكل صحيح.");
      return;
    }

    if (
      requestType === "exit_reentry" &&
      (!serviceRequestForm.startDate || !serviceRequestForm.endDate)
    ) {
      toast.error("حدد تاريخ الخروج وتاريخ العودة.");
      return;
    }

    if (requestType === "letter" && !serviceRequestForm.letterType.trim()) {
      toast.error("اكتب نوع الخطاب المطلوب.");
      return;
    }

    if (!serviceRequestForm.employeeNote.trim()) {
      toast.error("اكتب سبب الطلب أو ملاحظة مختصرة.");
      return;
    }

    setSubmittingServiceRequest(true);
    try {
      const employeeDocId =
        (employeeProfileSource.collectionName === "employees"
          ? employeeProfileSource.docId
          : String(user.linkedEmployeeId || "").trim()) || null;
      const requestLabel = getEmployeeServiceRequestTypeLabel(requestType);
      const docRef = await addDoc(
        collection(db, EMPLOYEE_SERVICE_REQUESTS_COLLECTION),
        {
          ...buildEmployeeServiceRequestPayload({
            authUid: user.uid,
            employeeDocId,
            employeeName:
              profile.personal.name !== EMPLOYEE_EMPTY_VALUE
                ? profile.personal.name
                : user.displayName || user.email || "موظف",
            employeeEmail:
              profile.personal.email !== EMPLOYEE_EMPTY_VALUE
                ? profile.personal.email
                : user.email || null,
            requestType,
            requestDate: serviceRequestForm.requestDate,
            startDate: serviceRequestForm.startDate,
            endDate: serviceRequestForm.endDate,
            startTime: serviceRequestForm.startTime,
            endTime: serviceRequestForm.endTime,
            amount: requestType === "salary_advance" ? amount : null,
            letterType: serviceRequestForm.letterType,
            employeeNote: serviceRequestForm.employeeNote,
          }),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );

      const hrUsers = await getDocs(
        query(
          collection(db, "users"),
          where("role", "in", ["owner", "admin", "hr"])
        )
      );

      const recipients = hrUsers.docs.filter(
        docSnap =>
          docSnap.id !== user.uid &&
          shouldReceiveLeaveNotification(docSnap.data() as Record<string, any>)
      );

      await Promise.all(
        recipients.map(docSnap =>
          createInAppNotification({
            userId: docSnap.id,
            title: `${requestLabel} جديد`,
            body: `${requestLabel} جديد من ${user.displayName || user.email}`,
            type: "system",
            relatedId: docRef.id,
            relatedTo: "employee_service_request",
            relatedPath: `/hr/employees?employeeId=${user.uid}&panel=requests`,
          })
        )
      );

      resetServiceRequestForm();
      toast.success("تم رفع الطلب بنجاح.");
      openEmployeeView("requests");
    } catch (error) {
      console.error("employee_service_request_create_failed", error);
      toast.error("تعذر رفع الطلب الآن.");
    } finally {
      setSubmittingServiceRequest(false);
    }
  };

  const handleSubmitLeaveRequest = async () => {
    if (!user?.uid || !employeeProfileSource) {
      toast.error("تعذر تحديد ملف الموظف الحالي.");
      return;
    }

    const startDate = buildLeaveDateFromInput(leaveForm.startDate);
    const endDate = buildLeaveDateFromInput(leaveForm.endDate);
    const daysCount = calculateLeaveDaysCount(
      leaveForm.startDate,
      leaveForm.endDate
    );

    if (!leaveForm.leaveType) {
      toast.error("اختر نوع الإجازة.");
      return;
    }

    if (!startDate || !endDate || !daysCount) {
      toast.error("أدخل تاريخ بداية ونهاية صالحين للإجازة.");
      return;
    }

    setSubmittingLeaveRequest(true);
    try {
      const employeeDocId =
        (employeeProfileSource.collectionName === "employees"
          ? employeeProfileSource.docId
          : String(user.linkedEmployeeId || "").trim()) || null;

      const docRef = await addDoc(
        collection(db, EMPLOYEE_LEAVE_REQUESTS_COLLECTION),
        {
          ...buildEmployeeLeaveRequestPayload({
            authUid: user.uid,
            employeeDocId,
            employeeName:
              profile.personal.name !== EMPLOYEE_EMPTY_VALUE
                ? profile.personal.name
                : user.displayName || user.email || "موظف",
            employeeEmail:
              profile.personal.email !== EMPLOYEE_EMPTY_VALUE
                ? profile.personal.email
                : user.email || null,
            leaveType: leaveForm.leaveType,
            startDate,
            endDate,
            daysCount,
            employeeNote: leaveForm.employeeNote,
          }),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );

      const hrUsers = await getDocs(
        query(
          collection(db, "users"),
          where("role", "in", ["owner", "admin", "hr"])
        )
      );

      const leaveNotificationRecipients = hrUsers.docs.filter(
        docSnap =>
          docSnap.id !== user.uid &&
          shouldReceiveLeaveNotification(docSnap.data() as Record<string, any>)
      );

      await Promise.all(
        leaveNotificationRecipients.map(docSnap => {
          return createInAppNotification({
            userId: docSnap.id,
            title: "طلب إجازة جديد",
            body: `طلب إجازة جديد من ${user.displayName || user.email}`,
            type: "leave_request_submitted",
            relatedId: docRef.id,
            relatedTo: "leave_request",
            relatedPath: `/hr/employees?employeeId=${user.uid}&panel=leave`,
          });
        })
      );

      setLeaveForm({
        leaveType: "annual",
        startDate: "",
        endDate: "",
        employeeNote: "",
      });
      toast.success("تم رفع طلب الإجازة بنجاح.");
    } catch (error) {
      console.error("employee_leave_request_create_failed", error);
      toast.error("تعذر رفع طلب الإجازة الآن.");
    } finally {
      setSubmittingLeaveRequest(false);
    }
  };

  const handleChangePassword = async () => {
    const currentUser = auth.currentUser;
    const email = String(currentUser?.email || user?.email || "").trim();

    if (!currentUser || !email) {
      toast.error("تعذر الوصول إلى حسابك الآن.");
      return;
    }

    if (!currentPassword.trim()) {
      toast.error("اكتب كلمة المرور الحالية.");
      return;
    }

    if (newPassword.trim().length < 6) {
      toast.error("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("كلمة المرور الجديدة وتأكيدها غير متطابقين.");
      return;
    }

    setChangingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("تم تغيير كلمة المرور.");
    } catch (error: any) {
      console.error("employee_password_change_failed", error);
      toast.error(friendlyPasswordError(error?.code));
    } finally {
      setChangingPassword(false);
    }
  };

  const statusBadgeClass =
    profile.employment.statusTone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : profile.employment.statusTone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-100 text-slate-600";

  const employeeIdForAttendance =
    employeeProfileSource?.entityId ||
    user?.linkedEmployeeId ||
    user?.uid ||
    null;
  const employeeUidForAttendance = user?.uid || null;

  const latestLeaveRequestsForDashboard = leaveRequests.slice(0, 2);
  const latestServiceRequestsForDashboard = serviceRequests.slice(0, 2);
  const currentServiceRequestType =
    SERVICE_REQUEST_VIEW_TO_TYPE[activeView] || null;
  const currentServiceRequestLabel = currentServiceRequestType
    ? getLocalizedServiceRequestTypeLabel(currentServiceRequestType, language)
    : "";
  const activeViewTitle = tr(
    language,
    EMPLOYEE_PORTAL_VIEW_TITLES[activeView].ar,
    EMPLOYEE_PORTAL_VIEW_TITLES[activeView].en
  );
  const backLabel = tr(language, "رجوع", "Back");

  const openEmployeeView = (view: EmployeePortalView) => {
    setActiveView(view);
    if (typeof window === "undefined") return;

    if (view === "dashboard") {
      window.history.pushState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`
      );
    } else {
      window.location.hash = view;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const backToDashboard = () => openEmployeeView("dashboard");

  return (
    <EmployeeLayout
      title={activeViewTitle}
      description={
        activeView === "dashboard"
          ? tr(
              language,
              "لوحة مختصرة لمتابعة الحضور، الطلبات، والتنقل بين معلومات الموظف.",
              "A compact dashboard for attendance, requests, and employee information."
            )
          : tr(
              language,
              "عرض مستقل داخل بوابة الموظف بدون تغيير مسارات النظام أو منطق البيانات.",
              "A focused employee portal view using the existing system data."
            )
      }
      hideHero={activeView === "dashboard"}
    >
      {activeView === "dashboard" ? (
        <div className="space-y-6">
          <section className="space-y-2 text-start">
            <p className="text-sm font-medium text-slate-500">
              {tr(language, "مساء الخير", "Good Evening")}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              {profile.personal.name}
            </h1>
            <p className="text-sm leading-6 text-slate-500">
              {profile.employment.department} · {profile.employment.title}
            </p>
          </section>

          <EmployeeAttendanceCard
            employeeId={employeeIdForAttendance}
            employeeUid={employeeUidForAttendance}
            onRecorded={() => setAttendanceRefreshKey(key => key + 1)}
          />

          <EmployeeCard
            title={tr(language, "اختصارات سريعة", "Quick Actions")}
            subtitle={tr(
              language,
              "وصول سريع لأكثر الإجراءات استخداماً",
              "Fast access to the most used actions"
            )}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <button
                type="button"
                className="rounded-[24px] border border-slate-100 bg-slate-50/80 px-4 py-5 text-center transition hover:bg-white hover:shadow-sm"
                onClick={() =>
                  openEmployeeView("attendance-correction-request")
                }
              >
                <UserRound className="mx-auto h-7 w-7 text-slate-500" />
                <span className="mt-3 block text-sm font-semibold text-slate-900">
                  {tr(language, "تصحيح البصمة", "Correct Attendance")}
                </span>
              </button>
              <button
                type="button"
                className="rounded-[24px] border border-slate-100 bg-slate-50/80 px-4 py-5 text-center transition hover:bg-white hover:shadow-sm"
                onClick={() => openEmployeeView("leave-request")}
              >
                <CalendarDays className="mx-auto h-7 w-7 text-slate-500" />
                <span className="mt-3 block text-sm font-semibold text-slate-900">
                  {tr(language, "طلب إجازة", "Leave Request")}
                </span>
              </button>
              <button
                type="button"
                className="rounded-[24px] border border-slate-100 bg-slate-50/80 px-4 py-5 text-center transition hover:bg-white hover:shadow-sm"
                onClick={() => openEmployeeView("permission-request")}
              >
                <Send className="mx-auto h-7 w-7 text-slate-500" />
                <span className="mt-3 block text-sm font-semibold text-slate-900">
                  {tr(language, "طلب استئذان", "Permission Request")}
                </span>
              </button>
            </div>
          </EmployeeCard>

          <EmployeeCard
            title={tr(language, "معلومات الموارد البشرية", "HR Information")}
            subtitle={tr(
              language,
              "عناصر تنقل فقط، كل قسم يفتح في صفحة داخلية مستقلة",
              "Navigation items only; each section opens in a separate internal view"
            )}
          >
            <div className="-mx-5 -my-5 divide-y divide-slate-100">
              <InfoRow
                icon={UserRound}
                label={tr(language, "شخصي", "Personal")}
                helper={tr(
                  language,
                  "المعلومات الشخصية، الهوية، العنوان",
                  "Personal information, ID, and address"
                )}
                onClick={() => openEmployeeView("hr-info")}
              />
              <InfoRow
                icon={BriefcaseBusiness}
                label={tr(language, "البيانات الوظيفية", "Employment Details")}
                helper={tr(
                  language,
                  "تاريخ الالتحاق، المسمى الوظيفي، نوع التوظيف",
                  "Joining date, job title, and employment type"
                )}
                onClick={() => openEmployeeView("employment")}
              />
              <InfoRow
                icon={Clock3}
                label={tr(language, "جدول الدوام", "Work Schedule")}
                helper={tr(
                  language,
                  "بداية ونهاية الدوام، أيام الراحة، ونطاق الحضور",
                  "Shift start/end, days off, and attendance zone"
                )}
                onClick={() => openEmployeeView("work-schedule")}
              />
              <InfoRow
                icon={BadgeCheck}
                label={tr(language, "بيانات الراتب", "Salary Details")}
                helper={tr(
                  language,
                  "الراتب الأساسي، التأمينات، البدلات، والخصومات الثابتة",
                  "Base salary, insurance, allowances, and fixed deductions"
                )}
                onClick={() => openEmployeeView("salary-settings")}
              />
              <InfoRow
                icon={BadgeCheck}
                label={tr(
                  language,
                  "الراتب والتفاصيل المالية",
                  "Payroll And Finance"
                )}
                helper={tr(
                  language,
                  "سجل رواتب نهاية الشهر والراتب النهائي المقفل",
                  "Month-end payroll and locked final salary"
                )}
                onClick={() => openEmployeeView("salary")}
              />
              <InfoRow
                icon={FileText}
                label={tr(language, "العقود", "Contracts")}
                helper={tr(language, "العقود الحالية والمنتهية", "Current and expired contracts")}
                onClick={() => openEmployeeView("contracts")}
              />
              <InfoRow
                icon={CalendarDays}
                label={tr(language, "الإجازات", "Leaves")}
                helper={tr(
                  language,
                  "الرصيد، الطلبات، والإجازات المعتمدة المستثناة من الغياب",
                  "Balance, requests, and approved leave excluded from absence"
                )}
                onClick={() => openEmployeeView("leaves")}
              />
              <InfoRow
                icon={FileText}
                label={tr(language, "مستندات", "Documents")}
                helper={tr(
                  language,
                  "الإقامة، الجواز والمستندات الأخرى",
                  "Iqama, passport, and other documents"
                )}
                onClick={() => openEmployeeView("documents")}
              />
            </div>
          </EmployeeCard>

          <EmployeeCard
            title={tr(language, "آخر الطلبات", "Latest Requests")}
            subtitle={tr(
              language,
              "آخر الطلبات المسجلة في النظام الحالي",
              "Latest requests recorded in the current system"
            )}
          >
            {leaveRequestsLoading || serviceRequestsLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                {tr(language, "جاري تحميل الطلبات...", "Loading requests...")}
              </div>
            ) : latestLeaveRequestsForDashboard.length ||
              latestServiceRequestsForDashboard.length ? (
              <div className="space-y-3">
                {latestServiceRequestsForDashboard.map(request => (
                  <div
                    key={request.id}
                    className="rounded-[22px] border border-slate-100 bg-slate-50/70 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-slate-950">
                          {getLocalizedServiceRequestTypeLabel(
                            request.requestType,
                            language
                          )}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatDateTimeByLanguage(request.createdAt, language)}
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className="rounded-full border-slate-200 bg-white"
                      >
                        {getLocalizedServiceRequestStatusLabel(
                          request.status,
                          language
                        )}
                      </Badge>
                    </div>
                  </div>
                ))}
                {latestLeaveRequestsForDashboard.map(request => (
                  <div
                    key={request.id}
                    className="rounded-[22px] border border-slate-100 bg-slate-50/70 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-slate-950">
                          {getLocalizedLeaveTypeLabel(
                            request.leaveType,
                            language
                          )}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatLeaveDateRange(
                            request.startDate,
                            request.endDate
                          )}
                        </div>
                      </div>
                      <LeaveStatusBadge
                        status={request.status}
                        language={language}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                {tr(language, "لا توجد طلبات حتى الآن.", "No requests yet.")}
              </div>
            )}
          </EmployeeCard>

          <div className="grid gap-4 md:grid-cols-2">
            <EmployeeCard
              title={tr(language, "الإعلانات", "Announcements")}
              subtitle={tr(
                language,
                "لا توجد إعلانات مرتبطة حالياً.",
                "No linked announcements are available now."
              )}
            >
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                {tr(language, "لا توجد إعلانات حالياً.", "No announcements now.")}
              </div>
            </EmployeeCard>
            <EmployeeCard
              title={tr(language, "الرصيد المتبقي", "Remaining Balance")}
              subtitle={tr(
                language,
                "يعرض الرصيد الحالي من بيانات الموظف الموجودة",
                "Shows the current balance from the employee record"
              )}
            >
              <div className="rounded-[24px] bg-slate-950 px-5 py-6 text-white">
                <div className="text-sm text-white/65">
                  {tr(language, "رصيد الإجازات", "Leave Balance")}
                </div>
                <div className="mt-2 text-3xl font-semibold">
                  {profile.employment.leaveBalanceLabel}
                </div>
              </div>
            </EmployeeCard>
          </div>
        </div>
      ) : null}

      {activeView === "attendance" ? (
        <section className="w-full">
          <EmployeeTodayAttendancePanel
            employeeUid={employeeUidForAttendance}
            title={tr(language, "الحضور", "Attendance")}
            refreshKey={attendanceRefreshKey}
            shiftStartTime={profile.employment.shiftStartTime}
            shiftEndTime={profile.employment.shiftEndTime}
            weeklyOffDays={profile.employment.weeklyOffDays}
            approvedLeaveRequests={approvedLeaveRequests}
          />
        </section>
      ) : null}

      {activeView === "requests" ? (
        <section dir={languageDir(language)} className="w-full space-y-7">
          <h1 className="text-center text-3xl font-medium text-slate-950">
            {tr(language, "الطلبات", "Requests")}
          </h1>

          {leaveRequestsLoading || serviceRequestsLoading ? (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500 shadow-sm">
              {tr(language, "جاري تحميل الطلبات...", "Loading requests...")}
            </div>
          ) : leaveRequests.length || serviceRequests.length ? (
            <div className="space-y-6">
              {serviceRequests.map((request, index) => (
                <EmployeeServiceRequestCard
                  key={request.id}
                  request={request}
                  index={index}
                  language={language}
                />
              ))}
              {leaveRequests.map((request, index) => (
                <EmployeeRequestCard
                  key={request.id}
                  request={request}
                  index={index}
                  language={language}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-5 py-14 text-center shadow-sm">
              <FileText className="mx-auto h-10 w-10 text-slate-300" />
              <div className="mt-4 text-xl font-semibold text-slate-950">
                {tr(language, "لا توجد طلبات", "No Requests")}
              </div>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-7 text-slate-400">
                {tr(
                  language,
                  "ستظهر هنا طلباتك الحالية وحالاتها بعد إنشائها من زر طلب جديد.",
                  "Your current requests and statuses will appear here after creating them from New Request."
                )}
              </p>
            </div>
          )}
        </section>
      ) : null}

      {currentServiceRequestType ? (
        <section className="space-y-6">
          <EmployeePortalViewHeader
            title={currentServiceRequestLabel}
            description={tr(
              language,
              "ارفع الطلب وسيصل مباشرة إلى لوحة الموارد البشرية للمراجعة والاعتماد أو الرفض.",
              "Submit the request and it will go directly to HR for review, approval, or rejection."
            )}
            backLabel={backLabel}
            onBack={backToDashboard}
          />

          <Card className="rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.22)]">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                <Send className="h-4 w-4" />
                {tr(language, "طلب جديد", "New Request")}
              </div>
              <CardTitle className="text-xl font-semibold text-slate-950">
                {currentServiceRequestLabel}
              </CardTitle>
              <CardDescription className="text-sm leading-7 text-slate-600">
                {tr(
                  language,
                  "أدخل تفاصيل الطلب المطلوبة. لا يتم اعتماد الطلب إلا بعد مراجعة HR.",
                  "Enter the required request details. Requests are approved only after HR review."
                )}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              {[
                "attendance_correction",
                "permission",
                "overtime",
                "resignation",
              ].includes(currentServiceRequestType) ? (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-800">
                    {tr(language, "تاريخ الطلب", "Request Date")}
                  </Label>
                  <Input
                    type="date"
                    value={serviceRequestForm.requestDate}
                    onChange={event =>
                      handleServiceRequestFormChange(
                        "requestDate",
                        event.target.value
                      )
                    }
                    className="h-12 rounded-2xl border-slate-200 bg-slate-50/80 shadow-none"
                    disabled={submittingServiceRequest}
                  />
                </div>
              ) : null}

              {["attendance_correction", "permission", "overtime"].includes(
                currentServiceRequestType
              ) ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-800">
                      وقت البداية
                    </Label>
                    <Input
                      type="time"
                      dir="ltr"
                      value={serviceRequestForm.startTime}
                      onChange={event =>
                        handleServiceRequestFormChange(
                          "startTime",
                          event.target.value
                        )
                      }
                      className="h-12 rounded-2xl border-slate-200 bg-slate-50/80 text-center shadow-none"
                      disabled={submittingServiceRequest}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-800">
                      وقت النهاية
                    </Label>
                    <Input
                      type="time"
                      dir="ltr"
                      value={serviceRequestForm.endTime}
                      onChange={event =>
                        handleServiceRequestFormChange(
                          "endTime",
                          event.target.value
                        )
                      }
                      className="h-12 rounded-2xl border-slate-200 bg-slate-50/80 text-center shadow-none"
                      disabled={submittingServiceRequest}
                    />
                  </div>
                </div>
              ) : null}

              {currentServiceRequestType === "salary_advance" ? (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-800">
                    مبلغ الصرف المعجل
                  </Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    dir="rtl"
                    value={serviceRequestForm.amount}
                    onChange={event =>
                      handleServiceRequestFormChange(
                        "amount",
                        event.target.value
                      )
                    }
                    placeholder="مثال: 1000"
                    className="h-12 rounded-2xl border-slate-200 bg-slate-50/80 text-right shadow-none"
                    disabled={submittingServiceRequest}
                  />
                </div>
              ) : null}

              {currentServiceRequestType === "exit_reentry" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-800">
                      تاريخ الخروج
                    </Label>
                    <Input
                      type="date"
                      value={serviceRequestForm.startDate}
                      onChange={event =>
                        handleServiceRequestFormChange(
                          "startDate",
                          event.target.value
                        )
                      }
                      className="h-12 rounded-2xl border-slate-200 bg-slate-50/80 shadow-none"
                      disabled={submittingServiceRequest}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-800">
                      تاريخ العودة
                    </Label>
                    <Input
                      type="date"
                      value={serviceRequestForm.endDate}
                      onChange={event =>
                        handleServiceRequestFormChange(
                          "endDate",
                          event.target.value
                        )
                      }
                      className="h-12 rounded-2xl border-slate-200 bg-slate-50/80 shadow-none"
                      disabled={submittingServiceRequest}
                    />
                  </div>
                </div>
              ) : null}

              {currentServiceRequestType === "letter" ? (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-800">
                    نوع الخطاب
                  </Label>
                  <Input
                    value={serviceRequestForm.letterType}
                    onChange={event =>
                      handleServiceRequestFormChange(
                        "letterType",
                        event.target.value
                      )
                    }
                    placeholder="مثال: تعريف راتب، خطاب جهة، شهادة خبرة"
                    className="h-12 rounded-2xl border-slate-200 bg-slate-50/80 text-right shadow-none"
                    disabled={submittingServiceRequest}
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-800">
                  سبب الطلب / الملاحظات
                </Label>
                <Textarea
                  value={serviceRequestForm.employeeNote}
                  onChange={event =>
                    handleServiceRequestFormChange(
                      "employeeNote",
                      event.target.value
                    )
                  }
                  placeholder="اكتب تفاصيل الطلب بوضوح"
                  className="min-h-32 rounded-[22px] border-slate-200 bg-slate-50/80 shadow-none"
                  disabled={submittingServiceRequest}
                />
              </div>

              <div className="flex justify-end rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                <Button
                  type="button"
                  className="h-11 rounded-2xl bg-slate-950 px-5 text-white hover:bg-[#15233c]"
                  onClick={() => void handleSubmitServiceRequest()}
                  disabled={submittingServiceRequest}
                >
                  {submittingServiceRequest ? (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="ml-2 h-4 w-4" />
                  )}
                  رفع الطلب
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {activeView === "hr-info" || activeView === "employment" ? (
        <div className="w-full space-y-6">
          <section
            className={cn("space-y-6", activeView !== "hr-info" && "hidden")}
          >
            <EmployeePortalViewHeader
              title={tr(language, "معلومات الموارد البشرية", "HR Information")}
              description={tr(
                language,
                "المعلومات الشخصية وإعدادات الحساب المتاحة حالياً.",
                "Personal information and currently available account settings."
              )}
              backLabel={backLabel}
              onBack={backToDashboard}
            />

            <SectionHeading
              icon={UserRound}
              title={tr(language, "البيانات الشخصية", "Personal Details")}
              description={tr(
                language,
                "يعرض هذا القسم بياناتك الأساسية. يمكنك تعديل رقم الجوال والصورة الشخصية فقط، بينما الاسم والبريد للعرض فقط في هذه المرحلة.",
                "This section shows your basic details. You can update only your mobile number and profile photo; name and email are read-only for now."
              )}
            />

            <Card className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.28)]">
              <CardContent className="space-y-6 p-6 sm:p-8">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-52 w-52 shrink-0 rounded-full border-2 border-white bg-slate-100 shadow-sm ring-2 ring-slate-200/80">
                      <AvatarImage
                        src={profile.personal.avatarUrl || undefined}
                        alt={profile.personal.name}
                        className="object-cover"
                      />
                      <AvatarFallback className="bg-slate-900 text-lg font-semibold text-white">
                        {initialsFromName(
                          profile.personal.name,
                          profile.personal.email
                        )}
                      </AvatarFallback>
                    </Avatar>

                    <div className="space-y-2">
                      <div className="text-2xl font-semibold tracking-tight text-slate-950">
                        {profile.personal.name}
                      </div>
                      <div className="text-sm text-slate-500">
                        {profile.personal.email}
                      </div>
                      <Badge
                        variant="outline"
                        className="rounded-full border-[#F2B705]/35 bg-[#F2B705]/10 text-[#8b6700] shadow-none"
                      >
                        {tr(language, "موظف", "Employee")}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-2xl border-slate-200 bg-white/90"
                      onClick={handleAvatarButtonClick}
                      disabled={uploadingAvatar}
                    >
                      {uploadingAvatar ? (
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Camera className="ml-2 h-4 w-4" />
                      )}
                      {profile.personal.avatarUrl
                        ? tr(language, "تغيير الصورة", "Change Photo")
                        : tr(language, "رفع الصورة", "Upload Photo")}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <ReadonlyField
                    label={tr(language, "الاسم", "Name")}
                    value={profile.personal.name}
                    icon={UserRound}
                  />
                  <ReadonlyField
                    label={tr(language, "البريد الإلكتروني", "Email")}
                    value={profile.personal.email}
                    icon={Mail}
                    dir="ltr"
                  />
                </div>

                <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/75 p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                        <Phone className="h-3.5 w-3.5" />
                        {tr(language, "رقم الجوال", "Mobile Number")}
                      </div>
                      <p className="text-sm leading-7 text-slate-600">
                        {tr(
                          language,
                          "يمكنك تحديث رقم الجوال المرتبط بحسابك لاستخدامه في التواصل.",
                          "You can update the mobile number linked to your account for communication."
                        )}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700 shadow-none"
                    >
                      {tr(language, "قابل للتعديل", "Editable")}
                    </Badge>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                    <Input
                      dir="ltr"
                      value={phoneInput}
                      onChange={event => setPhoneInput(event.target.value)}
                      placeholder="05xxxxxxxx"
                      className="h-12 rounded-2xl border-slate-200 bg-white text-left shadow-none"
                    />
                    <Button
                      type="button"
                      className="h-12 rounded-2xl bg-slate-950 px-6 text-white hover:bg-[#15233c]"
                      disabled={savingPhone || !phoneDirty || !phoneValid}
                      onClick={handleSavePhone}
                    >
                      {savingPhone ? (
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      ) : null}
                      {tr(language, "حفظ رقم الجوال", "Save Mobile Number")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.22)]">
              <CardHeader className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                  <KeyRound className="h-4 w-4" />
                  {tr(language, "أمان الحساب", "Account Security")}
                </div>
                <CardTitle className="text-xl font-semibold text-slate-950">
                  {tr(language, "تغيير كلمة المرور", "Change Password")}
                </CardTitle>
                <CardDescription className="text-sm leading-7 text-slate-600">
                  {tr(
                    language,
                    "يمكنك تغيير كلمة المرور الخاصة بحسابك فقط. لن يؤثر ذلك على أي إعدادات إدارية أخرى.",
                    "You can change only your account password. This will not affect any other admin settings."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={event => setCurrentPassword(event.target.value)}
                  placeholder={tr(language, "كلمة المرور الحالية", "Current Password")}
                  className="h-12 rounded-2xl border-slate-200 bg-slate-50/80 shadow-none"
                />
                <Input
                  type="password"
                  value={newPassword}
                  onChange={event => setNewPassword(event.target.value)}
                  placeholder={tr(language, "كلمة المرور الجديدة", "New Password")}
                  className="h-12 rounded-2xl border-slate-200 bg-slate-50/80 shadow-none"
                />
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  placeholder={tr(language, "تأكيد كلمة المرور الجديدة", "Confirm New Password")}
                  className="h-12 rounded-2xl border-slate-200 bg-slate-50/80 shadow-none"
                />
                <div className="flex justify-start">
                  <Button
                    type="button"
                    className="h-12 rounded-2xl bg-[#F2B705] px-6 text-slate-950 hover:bg-[#dfaa00]"
                    disabled={changingPassword}
                    onClick={handleChangePassword}
                  >
                    {changingPassword ? (
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {tr(language, "تغيير كلمة المرور", "Change Password")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>

          <section
            className={cn("space-y-6", activeView !== "employment" && "hidden")}
          >
            <EmployeePortalViewHeader
              title={tr(language, "البيانات الوظيفية", "Employment Details")}
              description={tr(
                language,
                "بيانات العمل المعروضة من المصدر الحالي بدون تعديل.",
                "Work details shown from the current source without edits."
              )}
              backLabel={backLabel}
              onBack={backToDashboard}
            />

            <SectionHeading
              icon={BriefcaseBusiness}
              title={tr(language, "بيانات العمل", "Work Details")}
              description={tr(
                language,
                "هذه البيانات مرتبطة بوظيفتك داخل الشركة، وهي للعرض فقط في هذه المرحلة. تعديلها سيكون لاحقًا من جهة الإدارة أو الموارد البشرية.",
                "These details are linked to your role in the company and are read-only at this stage. Updates will be handled later by administration or HR."
              )}
            />

            <Card className="rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.22)]">
              <CardContent className="space-y-5 p-6 sm:p-8">
                <div className="grid gap-4 sm:grid-cols-2">
                  <EmploymentTile
                    label={tr(language, "المسمى الوظيفي", "Job Title")}
                    value={profile.employment.title}
                    icon={BriefcaseBusiness}
                  />
                  <EmploymentTile
                    label={tr(language, "القسم / الإدارة", "Department")}
                    value={profile.employment.department}
                    icon={Building2}
                  />
                  <EmploymentTile
                    label={tr(language, "تاريخ بداية العمل", "Start Date")}
                    value={
                      profile.employment.startDate
                        ? formatDateByLanguage(profile.employment.startDate, language)
                        : EMPLOYEE_EMPTY_VALUE
                    }
                    icon={CalendarDays}
                  />
                  <EmploymentTile
                    label={tr(language, "رقم البصمة", "Fingerprint ID")}
                    value={profile.employment.fingerprintNumber}
                    icon={UserRound}
                    dir="ltr"
                  />
                  <EmploymentTile
                    label={tr(language, "رصيد الإجازات", "Leave Balance")}
                    value={profile.employment.leaveBalanceLabel}
                    icon={BadgeCheck}
                  />
                  <EmploymentTile
                    label={tr(language, "الحالة الوظيفية", "Employment Status")}
                    value={profile.employment.statusLabel}
                    icon={ShieldCheck}
                    badge={
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full shadow-none",
                          statusBadgeClass
                        )}
                      >
                        {profile.employment.statusLabel}
                      </Badge>
                    }
                  />
                  {profile.employment.employeeCode !== EMPLOYEE_EMPTY_VALUE ? (
                    <EmploymentTile
                      label={tr(language, "الرقم الوظيفي", "Employee Number")}
                      value={profile.employment.employeeCode}
                      icon={UserRound}
                    />
                  ) : null}
                </div>

                <div className="hidden space-y-4 rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
                  <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                    <Clock3 className="h-4 w-4" />
                    جدول الدوام
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <EmploymentTile
                      label={tr(language, "وقت الدوام", "Working Hours")}
                      value={formatWorkScheduleRange({
                        startTime: profile.employment.shiftStartTime,
                        endTime: profile.employment.shiftEndTime,
                      })}
                      icon={Clock3}
                      dir="ltr"
                    />
                    <EmploymentTile
                      label={tr(language, "أيام الراحة", "Days Off")}
                      value={profile.employment.weeklyOffDaysLabel}
                      icon={CalendarDays}
                    />
                    <EmploymentTile
                      label={tr(language, "نطاق الحضور", "Attendance Radius")}
                      value={profile.employment.attendanceZoneLabel}
                      icon={MapPin}
                    />
                  </div>
                </div>

                <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm leading-7 text-slate-600">
                  بيانات العمل هنا للعرض فقط. لا يمكنك تعديل المسمى الوظيفي أو
                  رصيد الإجازات أو الحالة الوظيفية بنفسك من هذه الصفحة.
                </div>

                <div className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
                  <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                    <FileText className="h-4 w-4" />
                    المستندات الرسمية
                  </div>

                  <div className="text-sm leading-7 text-slate-600">
                    ارفع أي مستند رسمي يخص الموظف، وسيظهر داخل بياناته الوظيفية.
                  </div>

                  {employeeFilesLoading ? (
                    <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                      جاري تحميل المستندات الرسمية...
                    </div>
                  ) : employeeOfficialFiles.length ? (
                    <div className="grid gap-4">
                      {employeeOfficialFiles.map(file => (
                        <div
                          key={file.id}
                          className="space-y-4 rounded-[20px] border border-slate-200 bg-white p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-2">
                              <div className="text-base font-semibold text-slate-900">
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
                              <div className="text-xs text-slate-500">
                                اسم الملف
                              </div>
                              <div className="mt-1 font-semibold text-slate-900">
                                {file.fileName}
                              </div>
                            </div>
                            <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3">
                              <div className="text-xs text-slate-500">
                                الحجم
                              </div>
                              <div className="mt-1 font-semibold text-slate-900">
                                {formatFileSizeEN(file.fileSize ?? null)}
                              </div>
                            </div>
                            <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2 xl:col-span-2">
                              <div className="text-xs text-slate-500">
                                تاريخ الرفع
                              </div>
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
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[16px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                      لا توجد مستندات رسمية مرفوعة حتى الآن.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      ) : null}

      {activeView === "work-schedule" ? (
        <section className="space-y-6">
          <EmployeePortalViewHeader
            title={tr(language, "جدول الدوام", "Work Schedule")}
            description={tr(language, "مصدر الحضور والغياب والتأخير واستثناء أيام الراحة من الغياب.", "The source for attendance, absence, delays, and excluding days off from absence.")}
            backLabel={backLabel}
            onBack={backToDashboard}
          />

          <EmployeeCard
            title={tr(language, "جدول الدوام ونطاق الحضور", "Work Schedule and Attendance Radius")}
            subtitle={tr(language, "هذه القيم للعرض من ملف الموظف وتعتمد عليها صفحات الحضور والراتب.", "These values are displayed from the employee profile and used by attendance and salary pages.")}
          >
            <div className="grid gap-4 md:grid-cols-3">
              <EmploymentTile
                label={tr(language, "وقت الدوام", "Working Hours")}
                value={formatWorkScheduleRange({
                  startTime: profile.employment.shiftStartTime,
                  endTime: profile.employment.shiftEndTime,
                })}
                icon={Clock3}
                dir="ltr"
              />
              <EmploymentTile
                label={tr(language, "أيام الراحة الأسبوعية", "Weekly Days Off")}
                value={profile.employment.weeklyOffDaysLabel}
                icon={CalendarDays}
              />
              <EmploymentTile
                label={tr(language, "نطاق الحضور", "Attendance Radius")}
                value={profile.employment.attendanceZoneLabel}
                icon={MapPin}
              />
            </div>
          </EmployeeCard>
        </section>
      ) : null}

      {activeView === "salary-settings" ? (
        <section className="space-y-6">
          <EmployeePortalViewHeader
            title={tr(language, "بيانات الراتب", "Salary Details")}
            description={tr(language, "إعدادات الراتب الثابتة المحفوظة في ملف الموظف، وليست سجل قفل نهاية الشهر.", "Fixed salary settings saved in the employee profile, not the month-end locked payroll record.")}
            backLabel={backLabel}
            onBack={backToDashboard}
          />

          <EmployeeCard
            title={tr(language, "بيانات الراتب الثابتة", "Fixed Salary Details")}
            subtitle={tr(language, "تستخدم هذه القيم كمرجع أساسي عند احتساب راتب نهاية الشهر.", "These values are used as the base reference for month-end payroll calculation.")}
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <EmploymentTile
                label={tr(language, "الراتب الأساسي", "Base Salary")}
                value={
                  profile.employment.baseSalary === null
                    ? EMPLOYEE_EMPTY_VALUE
                    : formatCurrencyValue(profile.employment.baseSalary)
                }
                icon={BadgeCheck}
              />
              <EmploymentTile
                label={tr(language, "بدل السكن", "Housing Allowance")}
                value={formatOptionalCurrencyValue(
                  profile.employment.housingAllowance
                )}
                icon={Plus}
              />
              <EmploymentTile
                label={tr(language, "بدل المواصلات", "Transportation Allowance")}
                value={formatOptionalCurrencyValue(
                  profile.employment.transportationAllowance
                )}
                icon={Plus}
              />
              <EmploymentTile
                label={tr(language, "بدلات ثابتة أخرى", "Other Fixed Allowances")}
                value={formatOptionalCurrencyValue(
                  profile.employment.otherAllowances
                )}
                icon={Plus}
              />
              <EmploymentTile
                label={tr(language, "إجمالي البدلات", "Total Allowances")}
                value={formatOptionalCurrencyValue(
                  profile.employment.allowances
                )}
                icon={Plus}
              />
              <EmploymentTile
                label={tr(language, "التأمينات", "Insurance")}
                value={formatOptionalCurrencyValue(
                  profile.employment.insuranceDeduction
                )}
                icon={ShieldCheck}
              />
              <EmploymentTile
                label={tr(language, "الخصومات الثابتة", "Fixed Deductions")}
                value={formatOptionalCurrencyValue(fixedDeductionsTotal)}
                icon={Minus}
              />
            </div>

            {profile.employment.salaryDeductions.length ? (
              <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
                <div className="mb-4 text-sm font-semibold text-slate-900">
                  تفاصيل الخصومات الثابتة
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {profile.employment.salaryDeductions.map(
                    (deduction, index) => (
                      <div
                        key={deduction.id || `${deduction.title}-${index}`}
                        className="rounded-[18px] border border-slate-200 bg-white px-4 py-3"
                      >
                        <div className="text-xs text-slate-500">
                          {deduction.title}
                        </div>
                        <div className="mt-1 text-base font-semibold text-slate-950">
                          {formatCurrencyValue(deduction.amount)}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            ) : null}
          </EmployeeCard>
        </section>
      ) : null}

      {activeView === "salary" ? (
        <section className="space-y-6">
          <EmployeePortalViewHeader
            title={tr(language, "الراتب والتفاصيل المالية", "Salary and Financial Details")}
            description={tr(language, "سجل رواتب نهاية الشهر المحسوب من الحضور والغياب والتأخير والأوفر تايم.", "Month-end payroll records calculated from attendance, absence, delays, and overtime.")}
            backLabel={backLabel}
            onBack={backToDashboard}
          />

          <div className="hidden">
            <EmployeeCard
              title={tr(language, "التفاصيل المالية الأساسية", "Basic Financial Details")}
              subtitle={tr(language, "هذه القيم من بيانات الموظف وتستخدم كمرجع لاحتساب الرواتب المقفلة.", "These values come from employee data and are used as a reference for locked payrolls.")}
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <EmploymentTile
                  label={tr(language, "الراتب الأساسي", "Base Salary")}
                  value={
                    profile.employment.baseSalary === null
                      ? EMPLOYEE_EMPTY_VALUE
                      : formatCurrencyValue(profile.employment.baseSalary)
                  }
                  icon={BadgeCheck}
                />
                <EmploymentTile
                  label={tr(language, "التأمينات", "Insurance")}
                  value={formatOptionalCurrencyValue(
                    profile.employment.insuranceDeduction
                  )}
                  icon={ShieldCheck}
                />
                <EmploymentTile
                  label={tr(language, "الخصومات الثابتة", "Fixed Deductions")}
                  value={formatOptionalCurrencyValue(fixedDeductionsTotal)}
                  icon={Minus}
                />
                <EmploymentTile
                  label={tr(language, "البدلات", "Allowances")}
                  value={formatOptionalCurrencyValue(
                    profile.employment.allowances
                  )}
                  icon={Plus}
                />
              </div>

              {profile.employment.salaryDeductions.length ? (
                <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
                  <div className="mb-4 text-sm font-semibold text-slate-900">
                    تفاصيل الخصومات الثابتة
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {profile.employment.salaryDeductions.map(
                      (deduction, index) => (
                        <div
                          key={deduction.id || `${deduction.title}-${index}`}
                          className="rounded-[18px] border border-slate-200 bg-white px-4 py-3"
                        >
                          <div className="text-xs text-slate-500">
                            {deduction.title}
                          </div>
                          <div className="mt-1 text-base font-semibold text-slate-950">
                            {formatCurrencyValue(deduction.amount)}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              ) : null}
            </EmployeeCard>
          </div>

          <EmployeeCard
            title={tr(language, "آخر راتب مقفل", "Latest Locked Payroll")}
            subtitle={tr(language, "آخر سجل راتب نهاية شهر محفوظ للموظف، مع الراتب قبل الخصومات والراتب النهائي.", "The latest saved month-end payroll record, including salary before deductions and net salary.")}
          >
            {employeePayrollRecordsLoading ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                جاري تحميل سجلات الرواتب...
              </div>
            ) : latestPayrollRecord ? (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <EmploymentTile
                    label={tr(language, "الشهر", "Month")}
                    value={formatEmployeePayrollMonthLabel(
                      latestPayrollRecord.payrollMonth
                    )}
                    icon={CalendarDays}
                  />
                  <EmploymentTile
                    label={tr(language, "الراتب قبل الخصومات", "Salary Before Deductions")}
                    value={formatCurrencyValue(
                      latestPayrollBeforeManualDeductions
                    )}
                    icon={Clock3}
                  />
                  <EmploymentTile
                    label={tr(language, "الراتب النهائي", "Net Salary")}
                    value={formatCurrencyValue(latestPayrollRecord.finalSalary)}
                    icon={BadgeCheck}
                    valueClassName="text-emerald-700"
                  />
                  <EmploymentTile
                    label={tr(language, "أيام بدون حضور", "Days Without Attendance")}
                    value={formatLeaveDaysCountValue(
                      latestPayrollRecord.attendanceAbsentDays || 0
                    )}
                    icon={CalendarDays}
                    valueClassName={
                      latestPayrollRecord.attendanceAbsentDays
                        ? "text-rose-600"
                        : undefined
                    }
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-xs text-slate-500">
                      خصم أيام بدون حضور
                    </div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {formatCurrencyValue(
                        latestPayrollRecord.attendanceAbsenceDeduction || 0
                      )}
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-xs text-slate-500">
                      خصم نقص الساعات
                    </div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {formatCurrencyValue(
                        latestPayrollRecord.delayDeduction || 0
                      )}
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-xs text-slate-500">التأمينات</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {formatCurrencyValue(
                        latestPayrollRecord.insuranceDeduction || 0
                      )}
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-xs text-slate-500">
                      الخصومات الثابتة
                    </div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {formatCurrencyValue(
                        latestPayrollRecord.totalSalaryDeductions || 0
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        مرفقات الراتب
                      </div>
                      <div className="mt-1 text-sm leading-6 text-slate-500">
                        {latestPayrollAttachment
                          ? latestPayrollAttachment.fileName || "مرفق الراتب"
                          : "لا توجد مرفقات راتب لهذا السجل."}
                      </div>
                    </div>

                    {latestPayrollAttachment ? (
                      <div className="flex flex-wrap gap-2">
                        {latestPayrollRecord.mudadDocumentViewUrl ? (
                          <Button asChild type="button" variant="outline">
                            <a
                              href={latestPayrollRecord.mudadDocumentViewUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Eye className="ml-2 h-4 w-4" />
                              معاينة
                            </a>
                          </Button>
                        ) : null}
                        {latestPayrollRecord.mudadDocumentDownloadUrl ? (
                          <Button asChild type="button" variant="outline">
                            <a
                              href={
                                latestPayrollRecord.mudadDocumentDownloadUrl
                              }
                              rel="noreferrer"
                              download={
                                latestPayrollAttachment.fileName || true
                              }
                            >
                              <Download className="ml-2 h-4 w-4" />
                              تنزيل
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                لا توجد رواتب نهاية شهر مقفلة حتى الآن.
              </div>
            )}
          </EmployeeCard>

          <EmployeeCard
            title={tr(language, "سجل رواتب نهاية الشهر", "Month-End Payroll Log")}
            subtitle={tr(language, "كل راتب مقفل يظهر هنا مع المبلغ النهائي ومرفق الراتب إن وجد.", "Every locked payroll appears here with the final amount and attachment, if available.")}
          >
            {employeePayrollRecordsLoading ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                جاري تحميل سجل الرواتب...
              </div>
            ) : employeePayrollRecords.length ? (
              <div className="space-y-3">
                {employeePayrollRecords.map(record => {
                  const beforeManualDeductions =
                    calculatePayrollBeforeManualDeductions(record);

                  return (
                    <div
                      key={record.id}
                      className="rounded-[22px] border border-slate-100 bg-slate-50/70 p-4"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700 shadow-none"
                            >
                              مقفل
                            </Badge>
                            <div className="text-base font-semibold text-slate-950">
                              {formatEmployeePayrollMonthLabel(
                                record.payrollMonth
                              )}
                            </div>
                          </div>
                          <div className="grid gap-2 text-sm text-slate-600 md:grid-cols-3">
                            <span>
                              الأساسي:{" "}
                              <strong className="text-slate-900">
                                {formatCurrencyValue(record.baseSalary)}
                              </strong>
                            </span>
                            <span>
                              قبل الخصومات:{" "}
                              <strong className="text-slate-900">
                                {formatCurrencyValue(beforeManualDeductions)}
                              </strong>
                            </span>
                            <span>
                              النهائي:{" "}
                              <strong className="text-emerald-700">
                                {formatCurrencyValue(record.finalSalary)}
                              </strong>
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {record.mudadDocumentViewUrl ? (
                            <Button
                              asChild
                              type="button"
                              variant="outline"
                              size="sm"
                            >
                              <a
                                href={record.mudadDocumentViewUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <Eye className="ml-2 h-4 w-4" />
                                المرفق
                              </a>
                            </Button>
                          ) : null}
                          {record.mudadDocumentDownloadUrl ? (
                            <Button
                              asChild
                              type="button"
                              variant="outline"
                              size="sm"
                            >
                              <a
                                href={record.mudadDocumentDownloadUrl}
                                rel="noreferrer"
                                download={
                                  record.mudadDocument?.fileName || true
                                }
                              >
                                <Download className="ml-2 h-4 w-4" />
                                تنزيل
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                لا يوجد سجل رواتب نهاية شهر حتى الآن.
              </div>
            )}
          </EmployeeCard>
        </section>
      ) : null}

      {activeView === "contracts" ? (
        <section className="space-y-6">
          <EmployeePortalViewHeader
            title={tr(language, "العقود", "Contracts")}
            description={tr(language, "واجهة عرض مبدئية للعقود بدون إنشاء Collections أو منطق جديد.", "Initial contract display view without creating new collections or logic.")}
            backLabel={backLabel}
            onBack={backToDashboard}
          />

          <EmployeeCard
            title={tr(language, "العقود الحالية والمنتهية", "Current and Expired Contracts")}
            subtitle={tr(language, "TODO: Placeholder حتى تتوفر بيانات العقود من المصدر الحالي.", "Placeholder until contract data is available from the current source.")}
          >
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
              لا توجد بيانات عقود متاحة حالياً.
            </div>
          </EmployeeCard>
        </section>
      ) : null}

      {activeView === "leaves" ? (
        <section className="space-y-6">
          <EmployeePortalViewHeader
            title={tr(language, "الإجازات", "Leaves")}
            description={tr(language, "رصيد الإجازات، الطلبات، والإجازات المعتمدة المستثناة من الغياب واحتساب الراتب.", "Leave balance, requests, and approved leaves excluded from absence and payroll calculations.")}
            backLabel={backLabel}
            onBack={backToDashboard}
          />

          <EmployeeCard
            title={tr(language, "ملخص الإجازات", "Leave Summary")}
            subtitle={tr(language, "الإجازات المعتمدة تمرر لتقويم الحضور واحتساب الراتب كي لا تعتبر غياباً.", "Approved leaves are passed to attendance and payroll so they are not counted as absence.")}
            action={
              <Button
                type="button"
                className="rounded-2xl bg-slate-950 text-white hover:bg-[#15233c]"
                onClick={() => openEmployeeView("leave-request")}
              >
                <Send className="ml-2 h-4 w-4" />
                رفع طلب إجازة
              </Button>
            }
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <LeaveSummaryCard
                label={tr(language, "رصيد الإجازات", "Leave Balance")}
                value={
                  leaveEntitlementDaysCount === null
                    ? EMPLOYEE_EMPTY_VALUE
                    : formatLeaveDaysCountValue(leaveEntitlementDaysCount)
                }
                icon={BadgeCheck}
                accent="text-[#B98500]"
              />
              <LeaveSummaryCard
                label={tr(language, "الإجازات المستخدمة", "Used Leaves")}
                value={formatLeaveDaysCountValue(approvedLeaveDaysCount)}
                icon={CheckCircle2}
                accent="text-emerald-600"
              />
              <LeaveSummaryCard
                label={tr(language, "الإجازات المتبقية", "Remaining Leaves")}
                value={profile.employment.leaveBalanceLabel}
                icon={CalendarDays}
              />
              <LeaveSummaryCard
                label={tr(language, "آخر إجازة", "Latest Leave")}
                value={
                  latestApprovedLeaveRequest
                    ? formatLeaveDateRange(
                        latestApprovedLeaveRequest.startDate,
                        latestApprovedLeaveRequest.endDate
                      )
                    : "لا توجد"
                }
                icon={Clock3}
              />
            </div>
          </EmployeeCard>

          <EmployeeCard
            title={tr(language, "الإجازات المعتمدة", "Approved Leaves")}
            subtitle={tr(language, "هذه الأيام لا تظهر كغياب في تقويم الحضور ولا تدخل ضمن خصومات الراتب.", "These days do not appear as absence in attendance and are not included in salary deductions.")}
          >
            {leaveRequestsLoading ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                جاري تحميل الإجازات المعتمدة...
              </div>
            ) : approvedLeaveRequests.length ? (
              <div className="space-y-3">
                {approvedLeaveRequests.map(request => (
                  <div
                    key={request.id}
                    className="rounded-[22px] border border-emerald-100 bg-emerald-50/45 p-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className="rounded-full border-emerald-200 bg-white text-emerald-700 shadow-none"
                          >
                            {getLeaveTypeLabel(request.leaveType)}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="rounded-full border-sky-200 bg-sky-50 text-sky-700 shadow-none"
                          >
                            مستثناة من الغياب والراتب
                          </Badge>
                        </div>
                        <div className="grid gap-2 text-sm text-slate-600 md:grid-cols-3">
                          <span>
                            الفترة:{" "}
                            <strong className="text-slate-900">
                              {formatLeaveDateRange(
                                request.startDate,
                                request.endDate
                              )}
                            </strong>
                          </span>
                          <span>
                            عدد الأيام:{" "}
                            <strong className="text-slate-900">
                              {formatLeaveDaysLabel(request.daysCount)}
                            </strong>
                          </span>
                          <span>
                            تاريخ الطلب:{" "}
                            <strong className="text-slate-900">
                              {formatDateTimeEN(request.createdAt)}
                            </strong>
                          </span>
                        </div>
                      </div>
                      <LeaveStatusBadge
                        status={request.status}
                        language={language}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                لا توجد إجازات معتمدة حتى الآن.
              </div>
            )}
          </EmployeeCard>

          <EmployeeCard
            title={tr(language, "طلبات الإجازة", "Leave Requests")}
            subtitle={tr(language, "كل طلب يظهر بنوع الإجازة وحالته: معلق، موافق، أو مرفوض.", "Each request shows the leave type and status: pending, approved, or rejected.")}
          >
            {leaveRequestsLoading ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                جاري تحميل طلبات الإجازة...
              </div>
            ) : leaveRequests.length ? (
              <div className="space-y-3">
                {leaveRequests.map(request => (
                  <div
                    key={request.id}
                    className="rounded-[22px] border border-slate-100 bg-slate-50/70 p-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="rounded-full">
                            {getLeaveTypeLabel(request.leaveType)}
                          </Badge>
                          <LeaveStatusBadge
                            status={request.status}
                            language={language}
                          />
                        </div>
                        <div className="grid gap-2 text-sm text-slate-600 md:grid-cols-3">
                          <span>
                            الفترة:{" "}
                            <strong className="text-slate-900">
                              {formatLeaveDateRange(
                                request.startDate,
                                request.endDate
                              )}
                            </strong>
                          </span>
                          <span>
                            عدد الأيام:{" "}
                            <strong className="text-slate-900">
                              {formatLeaveDaysLabel(request.daysCount)}
                            </strong>
                          </span>
                          <span>
                            تاريخ الطلب:{" "}
                            <strong className="text-slate-900">
                              {formatDateTimeEN(request.createdAt)}
                            </strong>
                          </span>
                        </div>
                        {request.hrNote ? (
                          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 px-4 py-3 text-sm leading-7 text-emerald-800">
                            <span className="font-semibold">{tr(language, "ملاحظة HR:", "HR Note:")}</span>{" "}
                            {request.hrNote}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                لا توجد طلبات إجازة حتى الآن.
              </div>
            )}
          </EmployeeCard>
        </section>
      ) : null}

      {activeView === "documents" ? (
        <section className="space-y-6">
          <EmployeePortalViewHeader
            title={tr(language, "المستندات", "Documents")}
            description={tr(language, "عرض المستندات الرسمية المتاحة حالياً مع رابط صفحة الملفات الموجودة مسبقاً.", "View available official documents with a link to the existing files page.")}
            backLabel={backLabel}
            onBack={backToDashboard}
          />

          <EmployeeCard
            title={tr(language, "المستندات الرسمية", "Official Documents")}
            subtitle={tr(language, "يعرض ما هو محمل مسبقاً من بيانات الملفات الحالية فقط.", "Shows only documents already loaded from current file data.")}
            action={
              <Button
                asChild
                type="button"
                variant="outline"
                className="rounded-2xl border-slate-200 bg-white"
              >
                <a href="/employee/files">{tr(language, "فتح صفحة الملفات", "Open Files Page")}</a>
              </Button>
            }
          >
            {employeeFilesLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                جاري تحميل المستندات...
              </div>
            ) : employeeOfficialFiles.length ? (
              <div className="space-y-3">
                {employeeOfficialFiles.map(file => (
                  <div
                    key={file.id}
                    className="rounded-[22px] border border-slate-100 bg-slate-50/70 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-950">
                          {file.title}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {file.fileTypeLabel}
                        </div>
                      </div>
                      {file.viewUrl ? (
                        <Button
                          asChild
                          type="button"
                          variant="outline"
                          size="sm"
                        >
                          <a
                            href={file.viewUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            فتح
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                لا توجد مستندات رسمية مرفوعة حتى الآن.
              </div>
            )}
          </EmployeeCard>
        </section>
      ) : null}

      {activeView === "leave-request" ? (
        <section className="space-y-6">
          <EmployeePortalViewHeader
            title={tr(language, "طلب إجازة", "Leave Request")}
            description={tr(language, "إنشاء طلب إجازة باستخدام منطق الإرسال الحالي نفسه.", "Create a leave request using the existing submission flow.")}
            backLabel={backLabel}
            onBack={backToDashboard}
          />

          <SectionHeading
            icon={CalendarDays}
            title={tr(language, "الإجازات", "Leaves")}
            description={tr(language, "هنا يمكنك متابعة رصيد الإجازات ورفع طلب جديد والاطلاع على آخر إجازة وسجل الطلبات السابقة.", "Track your leave balance, submit a new request, and view your latest leave and previous requests.")}
          />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
            <Card className="rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.22)]">
              <CardHeader className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                  <Clock3 className="h-4 w-4" />
                  آخر إجازة معتمدة
                </div>
                <CardTitle className="text-xl font-semibold text-slate-950">
                  ملخص الإجازات الحالية
                </CardTitle>
                <CardDescription className="text-sm leading-7 text-slate-600">
                  الرصيد الحالي وآخر إجازة معتمدة يظهران هنا بشكل مباشر وسريع.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <LeaveSummaryCard
                    label={tr(language, "الرصيد الحالي", "Current Balance")}
                    value={profile.employment.leaveBalanceLabel}
                    icon={BadgeCheck}
                    accent="text-[#B98500]"
                  />
                  <LeaveSummaryCard
                    label={tr(language, "حالة آخر إجازة معتمدة", "Latest Approved Leave Status")}
                    value={
                      latestApprovedLeaveRequest
                        ? getLeaveStatusMeta(latestApprovedLeaveRequest.status)
                            .label
                        : "لا توجد إجازات"
                    }
                    icon={
                      latestApprovedLeaveRequest?.status === "approved"
                        ? CheckCircle2
                        : latestApprovedLeaveRequest?.status === "rejected"
                          ? XCircle
                          : Clock3
                    }
                  />
                  <LeaveSummaryCard
                    label={tr(language, "عدد الأيام", "Number of Days")}
                    value={
                      latestApprovedLeaveRequest
                        ? formatLeaveDaysLabel(
                            latestApprovedLeaveRequest.daysCount
                          )
                        : "—"
                    }
                    icon={CalendarDays}
                  />
                </div>

                {latestApprovedLeaveRequest ? (
                  <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/75 p-5 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className="rounded-full border-[#F2B705]/35 bg-[#F2B705]/10 text-[#8b6700] shadow-none"
                          >
                            {getLeaveTypeLabel(
                              latestApprovedLeaveRequest.leaveType
                            )}
                          </Badge>
                          <LeaveStatusBadge
                            status={latestApprovedLeaveRequest.status}
                            language={language}
                          />
                        </div>

                        <div className="grid gap-2 text-sm text-slate-600">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900">
                              الفترة:
                            </span>
                            <span>
                              {formatLeaveDateRange(
                                latestApprovedLeaveRequest.startDate,
                                latestApprovedLeaveRequest.endDate
                              )}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900">
                              تاريخ الطلب:
                            </span>
                            <span>
                              {formatDateTimeEN(
                                latestApprovedLeaveRequest.createdAt
                              )}
                            </span>
                          </div>
                          {latestApprovedLeaveRequest.employeeNote ? (
                            <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 leading-7 text-slate-600">
                              <span className="font-semibold text-slate-900">
                                ملاحظتك:
                              </span>{" "}
                              {latestApprovedLeaveRequest.employeeNote}
                            </div>
                          ) : null}
                          {latestApprovedLeaveRequest.hrNote ? (
                            <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 px-4 py-3 leading-7 text-emerald-800">
                              <span className="font-semibold">{tr(language, "ملاحظة HR:", "HR Note:")}</span>{" "}
                              {latestApprovedLeaveRequest.hrNote}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/80 px-4 py-4 text-center">
                        <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                          آخر إجازة معتمدة
                        </div>
                        <div className="mt-2 text-lg font-semibold text-slate-950">
                          {formatLeaveDaysLabel(
                            latestApprovedLeaveRequest.daysCount
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                    لا توجد أي إجازات مسجلة لك حتى الآن.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.22)]">
              <CardHeader className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                  <Send className="h-4 w-4" />
                  طلب جديد
                </div>
                <CardTitle className="text-xl font-semibold text-slate-950">
                  رفع طلب إجازة
                </CardTitle>
                <CardDescription className="text-sm leading-7 text-slate-600">
                  أدخل تفاصيل الإجازة المطلوبة، وسيصل الطلب للموارد البشرية
                  للمراجعة والاعتماد أو الرفض.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-800">
                      نوع الإجازة
                    </Label>
                    <Select
                      value={leaveForm.leaveType}
                      onValueChange={value =>
                        handleLeaveFormChange("leaveType", value)
                      }
                      disabled={submittingLeaveRequest}
                    >
                      <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-slate-50/80">
                        <SelectValue placeholder="اختر نوع الإجازة" />
                      </SelectTrigger>
                      <SelectContent>
                        {EMPLOYEE_LEAVE_TYPE_OPTIONS.map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-800">
                      عدد الأيام
                    </Label>
                    <div className="flex h-12 items-center rounded-2xl border border-slate-200 bg-slate-50/80 px-4 text-sm font-semibold text-slate-900">
                      {requestedLeaveDays
                        ? formatLeaveDaysLabel(requestedLeaveDays)
                        : "حدّد تاريخ البداية والنهاية"}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-800">
                      تاريخ البداية
                    </Label>
                    <Input
                      type="date"
                      value={leaveForm.startDate}
                      onChange={event =>
                        handleLeaveFormChange("startDate", event.target.value)
                      }
                      className="h-12 rounded-2xl border-slate-200 bg-slate-50/80 shadow-none"
                      disabled={submittingLeaveRequest}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-800">
                      تاريخ النهاية
                    </Label>
                    <Input
                      type="date"
                      value={leaveForm.endDate}
                      onChange={event =>
                        handleLeaveFormChange("endDate", event.target.value)
                      }
                      className="h-12 rounded-2xl border-slate-200 bg-slate-50/80 shadow-none"
                      disabled={submittingLeaveRequest}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-800">
                    ملاحظة / سبب الطلب
                  </Label>
                  <Textarea
                    value={leaveForm.employeeNote}
                    onChange={event =>
                      handleLeaveFormChange("employeeNote", event.target.value)
                    }
                    placeholder="اكتب ملاحظة توضح سبب الإجازة إذا رغبت"
                    className="min-h-32 rounded-[22px] border-slate-200 bg-slate-50/80 shadow-none"
                    disabled={submittingLeaveRequest}
                  />
                </div>

                <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-slate-500">
                      لن يتم خصم الرصيد إلا بعد اعتماد الطلب من الموارد البشرية.
                    </div>
                    <Button
                      type="button"
                      className="h-11 rounded-2xl bg-slate-950 px-5 text-white hover:bg-[#15233c]"
                      disabled={
                        submittingLeaveRequest ||
                        !leaveForm.leaveType ||
                        !leaveForm.startDate ||
                        !leaveForm.endDate ||
                        !requestedLeaveDays
                      }
                      onClick={() => void handleSubmitLeaveRequest()}
                    >
                      {submittingLeaveRequest ? (
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="ml-2 h-4 w-4" />
                      )}
                      رفع طلب الإجازة
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.22)]">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                <CalendarDays className="h-4 w-4" />
                سجل الإجازات
              </div>
              <CardTitle className="text-xl font-semibold text-slate-950">
                الطلبات السابقة
              </CardTitle>
              <CardDescription className="text-sm leading-7 text-slate-600">
                جميع طلبات الإجازة السابقة تظهر هنا مع حالتها وتواريخها وأي
                ملاحظات مضافة.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {leaveRequestsLoading ? (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                  جاري تحميل طلبات الإجازة...
                </div>
              ) : leaveRequests.length ? (
                leaveRequests.map((request, index) => (
                  <div
                    key={request.id}
                    className={cn(
                      "rounded-[24px] border p-5 shadow-sm",
                      index === 0
                        ? "border-[#F2B705]/35 bg-[#F2B705]/[0.08]"
                        : "border-slate-200/80 bg-slate-50/70"
                    )}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
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
                          <Badge variant="outline" className="rounded-full">
                            {getLeaveTypeLabel(request.leaveType)}
                          </Badge>
                          <LeaveStatusBadge
                            status={request.status}
                            language={language}
                          />
                        </div>

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
                              تاريخ الطلب:
                            </span>{" "}
                            {formatDateTimeEN(request.createdAt)}
                          </div>
                        </div>
                      </div>

                      <div className="min-w-[220px] space-y-2 text-sm text-slate-600">
                        {request.employeeNote ? (
                          <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 leading-7">
                            <span className="font-semibold text-slate-900">
                              ملاحظتك:
                            </span>{" "}
                            {request.employeeNote}
                          </div>
                        ) : null}

                        {request.hrNote ? (
                          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 px-4 py-3 leading-7 text-emerald-800">
                            <span className="font-semibold">{tr(language, "ملاحظة HR:", "HR Note:")}</span>{" "}
                            {request.hrNote}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                  لم يتم رفع أي طلب إجازة حتى الآن.
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      ) : null}

      <Dialog
        open={avatarCropOpen}
        onOpenChange={open => {
          if (uploadingAvatar) return;
          if (!open) {
            resetAvatarCropState();
            return;
          }
          setAvatarCropOpen(true);
        }}
      >
        <DialogContent
          showCloseButton={!uploadingAvatar}
          className="w-[min(94vw,46rem)] max-w-[46rem] overflow-hidden rounded-[30px] border border-slate-200 bg-white p-0 shadow-[0_28px_80px_-36px_rgba(15,23,42,0.4)]"
          onPointerDownOutside={event => {
            if (uploadingAvatar) {
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
                ref={avatarCropViewportRef}
                className={cn(
                  "relative mx-auto aspect-square w-full max-w-[360px] overflow-hidden rounded-[32px] bg-slate-950 touch-none select-none",
                  avatarCropDragging ? "cursor-grabbing" : "cursor-grab"
                )}
                onPointerDown={handleAvatarCropPointerDown}
                onPointerMove={handleAvatarCropPointerMove}
                onPointerUp={handleAvatarCropPointerEnd}
                onPointerCancel={handleAvatarCropPointerEnd}
              >
                {avatarCropDraft ? (
                  <img
                    src={avatarCropDraft.objectUrl}
                    alt="معاينة الصورة الشخصية"
                    draggable={false}
                    className="pointer-events-none absolute max-w-none select-none object-cover"
                    style={avatarCropImageStyle}
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
                    {avatarCropZoomLabel}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-10 rounded-full border-slate-200 bg-white p-0"
                    onClick={() => handleAvatarCropZoomStep("out")}
                    disabled={
                      uploadingAvatar || avatarCropZoom <= AVATAR_CROP_MIN_ZOOM
                    }
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Slider
                    value={[avatarCropZoom]}
                    onValueChange={values => {
                      const nextZoom = values[0] ?? AVATAR_CROP_MIN_ZOOM;
                      setAvatarCropZoom(
                        clampNumber(
                          nextZoom,
                          AVATAR_CROP_MIN_ZOOM,
                          AVATAR_CROP_MAX_ZOOM
                        )
                      );
                    }}
                    min={AVATAR_CROP_MIN_ZOOM}
                    max={AVATAR_CROP_MAX_ZOOM}
                    step={0.01}
                    className="flex-1"
                    disabled={uploadingAvatar}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-10 rounded-full border-slate-200 bg-white p-0"
                    onClick={() => handleAvatarCropZoomStep("in")}
                    disabled={
                      uploadingAvatar || avatarCropZoom >= AVATAR_CROP_MAX_ZOOM
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
                    {avatarCropDraft ? (
                      <img
                        src={avatarCropDraft.objectUrl}
                        alt="المعاينة النهائية للصورة"
                        draggable={false}
                        className="pointer-events-none absolute max-w-none select-none object-cover"
                        style={avatarCropMiniPreviewStyle}
                      />
                    ) : null}
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  هذه المعاينة تحاكي شكل الصورة داخل الـ Avatar بعد الحفظ.
                </p>
              </div>

              <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-4 py-4 text-sm leading-6 text-slate-600">
                اسحب الصورة يمينًا أو يسارًا أو للأعلى والأسفل لتحديد أفضل موضع،
                ثم استخدم شريط التكبير لضبط مقاس الوجه داخل الدائرة.
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-slate-100 bg-white px-6 py-4 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl border-slate-200 bg-white"
              onClick={resetAvatarCropState}
              disabled={uploadingAvatar}
            >
              إلغاء
            </Button>
            <Button
              type="button"
              className="rounded-2xl bg-slate-950 text-white hover:bg-[#15233c]"
              onClick={() => void handleConfirmAvatarCrop()}
              disabled={!avatarCropDraft || uploadingAvatar}
            >
              {uploadingAvatar ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : null}
              اعتماد الصورة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="pointer-events-none fixed inset-0 z-40 bg-white/45 backdrop-blur-[1px]">
          <div className="flex h-full items-center justify-center">
            <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 shadow-lg">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري تحميل بروفايل الموظف...
            </div>
          </div>
        </div>
      ) : null}
    </EmployeeLayout>
  );
}
