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
} from "@/lib/formatters";
import { cn } from "@/lib/utils";
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

const EMPLOYEE_PORTAL_VIEW_TITLES: Record<EmployeePortalView, string> = {
  dashboard: "بوابة الموظف",
  attendance: "الحضور",
  requests: "الطلبات",
  "leave-request": "طلب إجازة",
  "permission-request": "طلب استئذان",
  "attendance-correction-request": "طلب تصحيح",
  "overtime-request": "طلب أوفرتايم",
  "salary-advance-request": "صرف معجل للراتب",
  "resignation-request": "طلب استقالة",
  "exit-reentry-request": "طلب خروج وعودة",
  "letter-request": "الخطابات",
  "hr-info": "معلومات الموارد البشرية",
  employment: "البيانات الوظيفية",
  "work-schedule": "جدول الدوام",
  "salary-settings": "بيانات الراتب",
  salary: "الراتب والتفاصيل المالية",
  contracts: "العقود",
  leaves: "الإجازات",
  documents: "المستندات",
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
          عرض فقط
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

function getRequestStatusPresentation(status: unknown) {
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
      label: meta.label || "مقبول",
      dotClassName: "bg-emerald-500",
      badgeClassName: "bg-emerald-50 text-emerald-700",
    };
  }

  if (normalized === "rejected" || normalized === "declined") {
    return {
      label: meta.label || "مرفوض",
      dotClassName: "bg-red-500",
      badgeClassName: "bg-red-50 text-red-700",
    };
  }

  return {
    label: meta.label || "قيد المراجعة",
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
    <div className="flex items-center justify-end gap-4 text-right">
      <div className="min-w-0">
        <div className="text-lg font-medium text-slate-500">{label}</div>
        <div className="mt-2 text-base font-semibold text-slate-950">
          {value}
        </div>
      </div>
      <Icon className="h-9 w-9 shrink-0 text-slate-400" />
    </div>
  );
}

function EmployeeRequestCard({
  request,
  index,
}: {
  request: EmployeeLeaveRequestRecord;
  index: number;
}) {
  const status = getRequestStatusPresentation(request.status);
  const requestNumber = getRequestNumber(request, index);
  const dateRange = formatLeaveDateRange(request.startDate, request.endDate);

  return (
    <article className="rounded-[20px] bg-white px-7 py-7 text-right shadow-[0_14px_34px_-26px_rgba(15,23,42,0.42)] ring-1 ring-slate-100">
      <div className="flex items-start justify-between gap-6">
        <div
          className={cn(
            "rounded-full px-5 py-3 text-base font-medium",
            status.badgeClassName
          )}
        >
          {status.label}
        </div>

        <div className="space-y-2">
          <h3 className="text-2xl font-medium text-slate-950">طلب إجازة</h3>
          <div className="text-sm text-slate-400">
            {formatDateTimeEN(request.createdAt)}
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-8">
        <RequestInfoRow
          icon={FileText}
          label="نوع الطلب"
          value={getLeaveTypeLabel(request.leaveType)}
        />
        <RequestInfoRow
          icon={CalendarDays}
          label="التاريخ المرتبط"
          value={dateRange}
        />
        <RequestInfoRow icon={Hash} label="رقم الطلب" value={requestNumber} />
      </div>

      <div className="mt-10 flex items-center justify-end gap-3 text-lg text-slate-500">
        <span>{status.label}</span>
        <span className={cn("h-3 w-3 rounded-full", status.dotClassName)} />
      </div>
    </article>
  );
}

function EmployeeServiceRequestCard({
  request,
  index,
}: {
  request: EmployeeServiceRequestRecord;
  index: number;
}) {
  const status = getRequestStatusPresentation(request.status);
  const requestNumber = getServiceRequestNumber(request, index);
  const dateValue =
    request.startDate && request.endDate
      ? `${request.startDate} إلى ${request.endDate}`
      : request.requestDate || request.startDate || "--";
  const timeValue =
    request.startTime || request.endTime
      ? `${request.startTime || "--"} - ${request.endTime || "--"}`
      : request.amount
        ? `${formatNumberEN(request.amount)} ر.س`
        : request.letterType || "--";

  return (
    <article className="rounded-[20px] bg-white px-7 py-7 text-right shadow-[0_14px_34px_-26px_rgba(15,23,42,0.42)] ring-1 ring-slate-100">
      <div className="flex items-start justify-between gap-6">
        <div
          className={cn(
            "rounded-full px-5 py-3 text-base font-medium",
            status.badgeClassName
          )}
        >
          {status.label}
        </div>

        <div className="space-y-2">
          <h3 className="text-2xl font-medium text-slate-950">
            {getEmployeeServiceRequestTypeLabel(request.requestType)}
          </h3>
          <div className="text-sm text-slate-400">
            {formatDateTimeEN(request.createdAt)}
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-8">
        <RequestInfoRow
          icon={FileText}
          label="نوع الطلب"
          value={getEmployeeServiceRequestTypeLabel(request.requestType)}
        />
        <RequestInfoRow icon={CalendarDays} label="التاريخ" value={dateValue} />
        <RequestInfoRow icon={Clock3} label="التفاصيل" value={timeValue} />
        <RequestInfoRow icon={Hash} label="رقم الطلب" value={requestNumber} />
      </div>

      {request.employeeNote || request.hrNote ? (
        <div className="mt-8 space-y-3 text-sm leading-7">
          {request.employeeNote ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600">
              {request.employeeNote}
            </div>
          ) : null}
          {request.hrNote ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
              {request.hrNote}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function EmployeePortalViewHeader({
  title,
  description,
  onBack,
}: {
  title: string;
  description?: string;
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
        رجوع
      </Button>
    </div>
  );
}

export default function EmployeeProfilePage() {
  const { user } = useAuth();
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
  const [employeeProfileSource, setEmployeeProfileSource] = useState<{
    collectionName: "employees" | "users";
    docId: string;
    entityId: string;
  } | null>(null);

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
  }, [user?.uid]);

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
          sortEmployeePayrollRecords(Array.from(rowsById.values()))
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
  }, [user?.linkedEmployeeId, user?.uid]);

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
  }, [user?.uid]);

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
  }, [user?.uid]);

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
    ? getEmployeeServiceRequestTypeLabel(currentServiceRequestType)
    : "";

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
      title={EMPLOYEE_PORTAL_VIEW_TITLES[activeView]}
      description={
        activeView === "dashboard"
          ? "لوحة مختصرة لمتابعة الحضور، الطلبات، والتنقل بين معلومات الموظف."
          : "عرض مستقل داخل بوابة الموظف بدون تغيير مسارات النظام أو منطق البيانات."
      }
      hideHero={activeView === "dashboard"}
    >
      {activeView === "dashboard" ? (
        <div className="space-y-6">
          <section className="space-y-2 text-right">
            <p className="text-sm font-medium text-slate-500">مساء الخير</p>
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
            title="اختصارات سريعة"
            subtitle="وصول سريع لأكثر الإجراءات استخداماً"
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
                  تصحيح البصمة
                </span>
              </button>
              <button
                type="button"
                className="rounded-[24px] border border-slate-100 bg-slate-50/80 px-4 py-5 text-center transition hover:bg-white hover:shadow-sm"
                onClick={() => openEmployeeView("leave-request")}
              >
                <CalendarDays className="mx-auto h-7 w-7 text-slate-500" />
                <span className="mt-3 block text-sm font-semibold text-slate-900">
                  طلب إجازة
                </span>
              </button>
              <button
                type="button"
                className="rounded-[24px] border border-slate-100 bg-slate-50/80 px-4 py-5 text-center transition hover:bg-white hover:shadow-sm"
                onClick={() => openEmployeeView("permission-request")}
              >
                <Send className="mx-auto h-7 w-7 text-slate-500" />
                <span className="mt-3 block text-sm font-semibold text-slate-900">
                  طلب استئذان
                </span>
              </button>
            </div>
          </EmployeeCard>

          <EmployeeCard
            title="معلومات الموارد البشرية"
            subtitle="عناصر تنقل فقط، كل قسم يفتح في صفحة داخلية مستقلة"
          >
            <div className="-mx-5 -my-5 divide-y divide-slate-100">
              <InfoRow
                icon={UserRound}
                label="شخصي"
                helper="المعلومات الشخصية، الهوية، العنوان"
                onClick={() => openEmployeeView("hr-info")}
              />
              <InfoRow
                icon={BriefcaseBusiness}
                label="البيانات الوظيفية"
                helper="تاريخ الالتحاق، المسمى الوظيفي، نوع التوظيف"
                onClick={() => openEmployeeView("employment")}
              />
              <InfoRow
                icon={Clock3}
                label="جدول الدوام"
                helper="بداية ونهاية الدوام، أيام الراحة، ونطاق الحضور"
                onClick={() => openEmployeeView("work-schedule")}
              />
              <InfoRow
                icon={BadgeCheck}
                label="بيانات الراتب"
                helper="الراتب الأساسي، التأمينات، البدلات، والخصومات الثابتة"
                onClick={() => openEmployeeView("salary-settings")}
              />
              <InfoRow
                icon={BadgeCheck}
                label="الراتب والتفاصيل المالية"
                helper="سجل رواتب نهاية الشهر والراتب النهائي المقفل"
                onClick={() => openEmployeeView("salary")}
              />
              <InfoRow
                icon={FileText}
                label="العقود"
                helper="العقود الحالية والمنتهية"
                onClick={() => openEmployeeView("contracts")}
              />
              <InfoRow
                icon={CalendarDays}
                label="الإجازات"
                helper="الرصيد، الطلبات، والإجازات المعتمدة المستثناة من الغياب"
                onClick={() => openEmployeeView("leaves")}
              />
              <InfoRow
                icon={FileText}
                label="مستندات"
                helper="الإقامة، الجواز والمستندات الأخرى"
                onClick={() => openEmployeeView("documents")}
              />
            </div>
          </EmployeeCard>

          <EmployeeCard
            title="آخر الطلبات"
            subtitle="آخر الطلبات المسجلة في النظام الحالي"
          >
            {leaveRequestsLoading || serviceRequestsLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                جاري تحميل الطلبات...
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
                          {getEmployeeServiceRequestTypeLabel(
                            request.requestType
                          )}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatDateTimeEN(request.createdAt)}
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className="rounded-full border-slate-200 bg-white"
                      >
                        {getEmployeeServiceRequestStatusLabel(request.status)}
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
                          {getLeaveTypeLabel(request.leaveType)}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatLeaveDateRange(
                            request.startDate,
                            request.endDate
                          )}
                        </div>
                      </div>
                      <LeaveStatusBadge status={request.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                لا توجد طلبات حتى الآن.
              </div>
            )}
          </EmployeeCard>

          <div className="grid gap-4 md:grid-cols-2">
            <EmployeeCard
              title="الإعلانات"
              subtitle="TODO: Placeholder لربط إعلانات الموارد البشرية لاحقاً بدون Firebase جديد."
            >
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                لا توجد إعلانات حالياً.
              </div>
            </EmployeeCard>
            <EmployeeCard
              title="الرصيد المتبقي"
              subtitle="يعرض الرصيد الحالي من بيانات الموظف الموجودة"
            >
              <div className="rounded-[24px] bg-slate-950 px-5 py-6 text-white">
                <div className="text-sm text-white/65">رصيد الإجازات</div>
                <div className="mt-2 text-3xl font-semibold">
                  {profile.employment.leaveBalanceLabel}
                </div>
              </div>
            </EmployeeCard>
          </div>
        </div>
      ) : null}

      {activeView === "attendance" ? (
        <section className="mx-auto max-w-[760px]">
          <EmployeeTodayAttendancePanel
            employeeUid={employeeUidForAttendance}
            title="الحضور"
            refreshKey={attendanceRefreshKey}
            shiftStartTime={profile.employment.shiftStartTime}
            shiftEndTime={profile.employment.shiftEndTime}
            weeklyOffDays={profile.employment.weeklyOffDays}
            approvedLeaveRequests={approvedLeaveRequests}
          />
        </section>
      ) : null}

      {activeView === "requests" ? (
        <section dir="rtl" className="mx-auto max-w-[760px] space-y-7">
          <h1 className="text-center text-3xl font-medium text-slate-950">
            الطلبات
          </h1>

          {leaveRequestsLoading || serviceRequestsLoading ? (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500 shadow-sm">
              جاري تحميل الطلبات...
            </div>
          ) : leaveRequests.length || serviceRequests.length ? (
            <div className="space-y-6">
              {serviceRequests.map((request, index) => (
                <EmployeeServiceRequestCard
                  key={request.id}
                  request={request}
                  index={index}
                />
              ))}
              {leaveRequests.map((request, index) => (
                <EmployeeRequestCard
                  key={request.id}
                  request={request}
                  index={index}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-5 py-14 text-center shadow-sm">
              <FileText className="mx-auto h-10 w-10 text-slate-300" />
              <div className="mt-4 text-xl font-semibold text-slate-950">
                لا توجد طلبات
              </div>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-7 text-slate-400">
                ستظهر هنا طلباتك الحالية وحالاتها بعد إنشائها من زر طلب جديد.
              </p>
            </div>
          )}
        </section>
      ) : null}

      {currentServiceRequestType ? (
        <section className="space-y-6">
          <EmployeePortalViewHeader
            title={currentServiceRequestLabel}
            description="ارفع الطلب وسيصل مباشرة إلى لوحة الموارد البشرية للمراجعة والاعتماد أو الرفض."
            onBack={backToDashboard}
          />

          <Card className="rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.22)]">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                <Send className="h-4 w-4" />
                طلب جديد
              </div>
              <CardTitle className="text-xl font-semibold text-slate-950">
                {currentServiceRequestLabel}
              </CardTitle>
              <CardDescription className="text-sm leading-7 text-slate-600">
                أدخل تفاصيل الطلب المطلوبة. لا يتم اعتماد الطلب إلا بعد مراجعة
                HR.
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
                    تاريخ الطلب
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
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <section
            className={cn("space-y-6", activeView !== "hr-info" && "hidden")}
          >
            <EmployeePortalViewHeader
              title="معلومات الموارد البشرية"
              description="المعلومات الشخصية وإعدادات الحساب المتاحة حالياً."
              onBack={backToDashboard}
            />

            <SectionHeading
              icon={UserRound}
              title="البيانات الشخصية"
              description="يعرض هذا القسم بياناتك الأساسية. يمكنك تعديل رقم الجوال والصورة الشخصية فقط، بينما الاسم والبريد للعرض فقط في هذه المرحلة."
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
                        موظف
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
                        ? "تغيير الصورة"
                        : "رفع الصورة"}
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
                    label="الاسم"
                    value={profile.personal.name}
                    icon={UserRound}
                  />
                  <ReadonlyField
                    label="البريد الإلكتروني"
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
                        رقم الجوال
                      </div>
                      <p className="text-sm leading-7 text-slate-600">
                        يمكنك تحديث رقم الجوال المرتبط بحسابك لاستخدامه في
                        التواصل.
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700 shadow-none"
                    >
                      قابل للتعديل
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
                      حفظ رقم الجوال
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.22)]">
              <CardHeader className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                  <KeyRound className="h-4 w-4" />
                  أمان الحساب
                </div>
                <CardTitle className="text-xl font-semibold text-slate-950">
                  تغيير كلمة المرور
                </CardTitle>
                <CardDescription className="text-sm leading-7 text-slate-600">
                  يمكنك تغيير كلمة المرور الخاصة بحسابك فقط. لن يؤثر ذلك على أي
                  إعدادات إدارية أخرى.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={event => setCurrentPassword(event.target.value)}
                  placeholder="كلمة المرور الحالية"
                  className="h-12 rounded-2xl border-slate-200 bg-slate-50/80 shadow-none"
                />
                <Input
                  type="password"
                  value={newPassword}
                  onChange={event => setNewPassword(event.target.value)}
                  placeholder="كلمة المرور الجديدة"
                  className="h-12 rounded-2xl border-slate-200 bg-slate-50/80 shadow-none"
                />
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  placeholder="تأكيد كلمة المرور الجديدة"
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
                    تغيير كلمة المرور
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>

          <section
            className={cn("space-y-6", activeView !== "employment" && "hidden")}
          >
            <EmployeePortalViewHeader
              title="البيانات الوظيفية"
              description="بيانات العمل المعروضة من المصدر الحالي بدون تعديل."
              onBack={backToDashboard}
            />

            <SectionHeading
              icon={BriefcaseBusiness}
              title="بيانات العمل"
              description="هذه البيانات مرتبطة بوظيفتك داخل الشركة، وهي للعرض فقط في هذه المرحلة. تعديلها سيكون لاحقًا من جهة الإدارة أو الموارد البشرية."
            />

            <Card className="rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.22)]">
              <CardContent className="space-y-5 p-6 sm:p-8">
                <div className="grid gap-4 sm:grid-cols-2">
                  <EmploymentTile
                    label="المسمى الوظيفي"
                    value={profile.employment.title}
                    icon={BriefcaseBusiness}
                  />
                  <EmploymentTile
                    label="القسم / الإدارة"
                    value={profile.employment.department}
                    icon={Building2}
                  />
                  <EmploymentTile
                    label="تاريخ بداية العمل"
                    value={
                      profile.employment.startDate
                        ? formatDateEN(profile.employment.startDate)
                        : EMPLOYEE_EMPTY_VALUE
                    }
                    icon={CalendarDays}
                  />
                  <EmploymentTile
                    label="رقم البصمة"
                    value={profile.employment.fingerprintNumber}
                    icon={UserRound}
                    dir="ltr"
                  />
                  <EmploymentTile
                    label="رصيد الإجازات"
                    value={profile.employment.leaveBalanceLabel}
                    icon={BadgeCheck}
                  />
                  <EmploymentTile
                    label="الحالة الوظيفية"
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
                      label="الرقم الوظيفي"
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
                      label="وقت الدوام"
                      value={formatWorkScheduleRange({
                        startTime: profile.employment.shiftStartTime,
                        endTime: profile.employment.shiftEndTime,
                      })}
                      icon={Clock3}
                      dir="ltr"
                    />
                    <EmploymentTile
                      label="أيام الراحة"
                      value={profile.employment.weeklyOffDaysLabel}
                      icon={CalendarDays}
                    />
                    <EmploymentTile
                      label="نطاق الحضور"
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
            title="جدول الدوام"
            description="مصدر الحضور والغياب والتأخير واستثناء أيام الراحة من الغياب."
            onBack={backToDashboard}
          />

          <EmployeeCard
            title="جدول الدوام ونطاق الحضور"
            subtitle="هذه القيم للعرض من ملف الموظف وتعتمد عليها صفحات الحضور والراتب."
          >
            <div className="grid gap-4 md:grid-cols-3">
              <EmploymentTile
                label="وقت الدوام"
                value={formatWorkScheduleRange({
                  startTime: profile.employment.shiftStartTime,
                  endTime: profile.employment.shiftEndTime,
                })}
                icon={Clock3}
                dir="ltr"
              />
              <EmploymentTile
                label="أيام الراحة الأسبوعية"
                value={profile.employment.weeklyOffDaysLabel}
                icon={CalendarDays}
              />
              <EmploymentTile
                label="نطاق الحضور"
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
            title="بيانات الراتب"
            description="إعدادات الراتب الثابتة المحفوظة في ملف الموظف، وليست سجل قفل نهاية الشهر."
            onBack={backToDashboard}
          />

          <EmployeeCard
            title="بيانات الراتب الثابتة"
            subtitle="تستخدم هذه القيم كمرجع أساسي عند احتساب راتب نهاية الشهر."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <EmploymentTile
                label="الراتب الأساسي"
                value={
                  profile.employment.baseSalary === null
                    ? EMPLOYEE_EMPTY_VALUE
                    : formatCurrencyValue(profile.employment.baseSalary)
                }
                icon={BadgeCheck}
              />
              <EmploymentTile
                label="بدل السكن"
                value={formatOptionalCurrencyValue(
                  profile.employment.housingAllowance
                )}
                icon={Plus}
              />
              <EmploymentTile
                label="بدل المواصلات"
                value={formatOptionalCurrencyValue(
                  profile.employment.transportationAllowance
                )}
                icon={Plus}
              />
              <EmploymentTile
                label="بدلات ثابتة أخرى"
                value={formatOptionalCurrencyValue(
                  profile.employment.otherAllowances
                )}
                icon={Plus}
              />
              <EmploymentTile
                label="إجمالي البدلات"
                value={formatOptionalCurrencyValue(
                  profile.employment.allowances
                )}
                icon={Plus}
              />
              <EmploymentTile
                label="التأمينات"
                value={formatOptionalCurrencyValue(
                  profile.employment.insuranceDeduction
                )}
                icon={ShieldCheck}
              />
              <EmploymentTile
                label="الخصومات الثابتة"
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
            title="الراتب والتفاصيل المالية"
            description="سجل رواتب نهاية الشهر المحسوب من الحضور والغياب والتأخير والأوفر تايم."
            onBack={backToDashboard}
          />

          <div className="hidden">
            <EmployeeCard
              title="التفاصيل المالية الأساسية"
              subtitle="هذه القيم من بيانات الموظف وتستخدم كمرجع لاحتساب الرواتب المقفلة."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <EmploymentTile
                  label="الراتب الأساسي"
                  value={
                    profile.employment.baseSalary === null
                      ? EMPLOYEE_EMPTY_VALUE
                      : formatCurrencyValue(profile.employment.baseSalary)
                  }
                  icon={BadgeCheck}
                />
                <EmploymentTile
                  label="التأمينات"
                  value={formatOptionalCurrencyValue(
                    profile.employment.insuranceDeduction
                  )}
                  icon={ShieldCheck}
                />
                <EmploymentTile
                  label="الخصومات الثابتة"
                  value={formatOptionalCurrencyValue(fixedDeductionsTotal)}
                  icon={Minus}
                />
                <EmploymentTile
                  label="البدلات"
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
            title="آخر راتب مقفل"
            subtitle="آخر سجل راتب نهاية شهر محفوظ للموظف، مع الراتب قبل الخصومات والراتب النهائي."
          >
            {employeePayrollRecordsLoading ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                جاري تحميل سجلات الرواتب...
              </div>
            ) : latestPayrollRecord ? (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <EmploymentTile
                    label="الشهر"
                    value={formatEmployeePayrollMonthLabel(
                      latestPayrollRecord.payrollMonth
                    )}
                    icon={CalendarDays}
                  />
                  <EmploymentTile
                    label="الراتب قبل الخصومات"
                    value={formatCurrencyValue(
                      latestPayrollBeforeManualDeductions
                    )}
                    icon={Clock3}
                  />
                  <EmploymentTile
                    label="الراتب النهائي"
                    value={formatCurrencyValue(latestPayrollRecord.finalSalary)}
                    icon={BadgeCheck}
                    valueClassName="text-emerald-700"
                  />
                  <EmploymentTile
                    label="أيام بدون حضور"
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
            title="سجل رواتب نهاية الشهر"
            subtitle="كل راتب مقفل يظهر هنا مع المبلغ النهائي ومرفق الراتب إن وجد."
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
            title="العقود"
            description="واجهة عرض مبدئية للعقود بدون إنشاء Collections أو منطق جديد."
            onBack={backToDashboard}
          />

          <EmployeeCard
            title="العقود الحالية والمنتهية"
            subtitle="TODO: Placeholder حتى تتوفر بيانات العقود من المصدر الحالي."
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
            title="الإجازات"
            description="رصيد الإجازات، الطلبات، والإجازات المعتمدة المستثناة من الغياب واحتساب الراتب."
            onBack={backToDashboard}
          />

          <EmployeeCard
            title="ملخص الإجازات"
            subtitle="الإجازات المعتمدة تمرر لتقويم الحضور واحتساب الراتب كي لا تعتبر غياباً."
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
                label="رصيد الإجازات"
                value={
                  leaveEntitlementDaysCount === null
                    ? EMPLOYEE_EMPTY_VALUE
                    : formatLeaveDaysCountValue(leaveEntitlementDaysCount)
                }
                icon={BadgeCheck}
                accent="text-[#B98500]"
              />
              <LeaveSummaryCard
                label="الإجازات المستخدمة"
                value={formatLeaveDaysCountValue(approvedLeaveDaysCount)}
                icon={CheckCircle2}
                accent="text-emerald-600"
              />
              <LeaveSummaryCard
                label="الإجازات المتبقية"
                value={profile.employment.leaveBalanceLabel}
                icon={CalendarDays}
              />
              <LeaveSummaryCard
                label="آخر إجازة"
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
            title="الإجازات المعتمدة"
            subtitle="هذه الأيام لا تظهر كغياب في تقويم الحضور ولا تدخل ضمن خصومات الراتب."
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
                      <LeaveStatusBadge status={request.status} />
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
            title="طلبات الإجازة"
            subtitle="كل طلب يظهر بنوع الإجازة وحالته: معلق، موافق، أو مرفوض."
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
                          <LeaveStatusBadge status={request.status} />
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
                            <span className="font-semibold">ملاحظة HR:</span>{" "}
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
            title="المستندات"
            description="عرض المستندات الرسمية المتاحة حالياً مع رابط صفحة الملفات الموجودة مسبقاً."
            onBack={backToDashboard}
          />

          <EmployeeCard
            title="المستندات الرسمية"
            subtitle="يعرض ما هو محمل مسبقاً من بيانات الملفات الحالية فقط."
            action={
              <Button
                asChild
                type="button"
                variant="outline"
                className="rounded-2xl border-slate-200 bg-white"
              >
                <a href="/employee/files">فتح صفحة الملفات</a>
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
            title="طلب إجازة"
            description="إنشاء طلب إجازة باستخدام منطق الإرسال الحالي نفسه."
            onBack={backToDashboard}
          />

          <SectionHeading
            icon={CalendarDays}
            title="الإجازات"
            description="هنا يمكنك متابعة رصيد الإجازات ورفع طلب جديد والاطلاع على آخر إجازة وسجل الطلبات السابقة."
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
                    label="الرصيد الحالي"
                    value={profile.employment.leaveBalanceLabel}
                    icon={BadgeCheck}
                    accent="text-[#B98500]"
                  />
                  <LeaveSummaryCard
                    label="حالة آخر إجازة معتمدة"
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
                    label="عدد الأيام"
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
                              <span className="font-semibold">ملاحظة HR:</span>{" "}
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
                          <LeaveStatusBadge status={request.status} />
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
                            <span className="font-semibold">ملاحظة HR:</span>{" "}
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
