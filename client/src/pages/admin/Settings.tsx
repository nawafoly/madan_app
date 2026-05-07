// client/src/pages/admin/Settings.tsx
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import DashboardLayout from "@/components/DashboardLayout";
import RecruitmentFormFields from "@/components/recruitment/RecruitmentFormFields";
import RecruitmentSettingsEditor from "@/components/recruitment/RecruitmentSettingsEditor";
import SettingsBackupTab from "./settings/SettingsBackupTab";
import SettingsContentTab from "./settings/SettingsContentTab";
import SettingsDatabaseTab from "./settings/SettingsDatabaseTab";
import SettingsFlagsTab from "./settings/SettingsFlagsTab";
import SettingsGeneralTab from "./settings/SettingsGeneralTab";
import SettingsLabelsTab from "./settings/SettingsLabelsTab";
import SettingsLayout from "./settings/SettingsLayout";
import SettingsNotificationsTab from "./settings/SettingsNotificationsTab";
import SettingsRolesTab from "./settings/SettingsRolesTab";
import SettingsSecurityTab from "./settings/SettingsSecurityTab";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Settings as SettingsIcon,
  Bell,
  BriefcaseBusiness,
  Shield,
  Database,
  Users,
  KeyRound,
  Tags,
  Plus,
  Pencil,
  Trash2,
  SlidersHorizontal,
  FileDown,
  Type,
  Archive,
  Building2,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Files,
  FolderOpen,
  Globe,
  HardDrive,
  Landmark,
  Mail,
  RefreshCw,
  Sparkles,
  ServerCog,
  TrendingUp,
  ArrowUp,
  ArrowDown,
  type LucideIcon,
} from "lucide-react";

import { db } from "@/_core/firebase";
import {
  formatDateTimeEN,
  formatFileSizeEN,
  formatNumberEN,
} from "@/lib/formatters";
import {
  createRecruitmentField,
  createRecruitmentOption,
  getRecruitmentFieldHint,
  getRecruitmentFieldTypeLabel,
  getRecruitmentNumberModeLabel,
  hasRecruitmentFieldType,
  isRecruitmentFieldRequired,
  moveItem,
  normalizeRecruitmentField,
  normalizeRecruitmentSettings,
  syncRecruitmentValuesWithFields,
  validateRecruitmentSettings,
} from "@/lib/recruitment";
import { getRoleDisplayLabel } from "@/lib/ownerAccounts";
import { cn } from "@/lib/utils";
import {
  getContractBusinessId,
  getInvestmentBusinessId,
} from "@/lib/businessIds";
import {
  AUDIT_ACTIONS,
  auditedDeleteDoc,
  auditedSetDoc,
  auditedUpdateDoc,
  buildAuditSource,
  diffAuditTargets,
  logAuditEvent,
  runAuditedOperation,
} from "@/lib/auditLog";
import {
  fetchDocumentStorageDashboardSnapshot,
  getDocumentWorkerBaseUrl,
  type DocumentStorageDashboardSnapshot,
  type DocumentStorageMetricSource,
  type DocumentStorageServiceHealth,
} from "@/lib/documentUploadService";
import {
  syncEmployeeDirectoryFromWorker,
  type EmployeeDirectorySyncResult,
} from "@/lib/employeeDirectoryWorker";
import {
  generateBusinessExcelExport,
  type BusinessExcelExportSummary,
} from "@/lib/businessExcelExport";
import {
  generateContractExportPackage,
  listContractExportCandidates,
  type ContractExportCandidate,
  type ContractExportSummary,
} from "@/lib/contractExport";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  ALL_PERMISSION_KEYS as CENTRAL_PERMISSION_KEYS,
  getEffectivePermissions,
  PERMISSION_DEFINITIONS as CENTRAL_PERMISSION_DEFINITIONS,
  ROLE_DEFAULT_PERMS,
  type Permission,
} from "@/_core/hooks/useAuth";
import {
  DEFAULT_RECRUITMENT_SETTINGS,
  RECRUITMENT_SETTINGS_DOC_ID,
  type RecruitmentFieldDefinition,
  type RecruitmentFieldType,
  type RecruitmentFormValues,
  type RecruitmentSettingsDoc,
} from "@shared/recruitment";

/* =========================
   Types
========================= */

type AppSettings = {
  name: string;
  email: string;
  phone: string;
  address: string;
  minInvestment: string;
  maxInvestment: string;
  defaultReturn: string;
  defaultHorizonYears: string;
};

const DEFAULT_APP_SETTINGS: AppSettings = {
  name: "",
  email: "",
  phone: "",
  address: "",
  minInvestment: "",
  maxInvestment: "",
  defaultReturn: "",
  defaultHorizonYears: "",
};

const APP_SETTINGS_KEYS: Array<keyof AppSettings> = [
  "name",
  "email",
  "phone",
  "address",
  "minInvestment",
  "maxInvestment",
  "defaultReturn",
  "defaultHorizonYears",
];

const APP_SETTINGS_LABELS: Record<keyof AppSettings, string> = {
  name: "اسم المنصة",
  email: "البريد الإلكتروني",
  phone: "رقم الهاتف",
  address: "العنوان",
  minInvestment: "الحد الأدنى للاستثمار",
  maxInvestment: "الحد الأعلى للاستثمار",
  defaultReturn: "العائد الافتراضي",
  defaultHorizonYears: "الأفق الافتراضي",
};

const SETTINGS_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseNumericSetting(value: string) {
  const normalized = String(value || "")
    .trim()
    .replace(/,/g, "");

  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

type NotificationSettings = {
  email: boolean;
  sms: boolean;
  investments: boolean;
  messages: boolean;
};

type NotificationFieldKey = keyof NotificationSettings;

type NotificationSectionConfig = {
  key: "delivery_channels" | "notification_triggers";
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  items: Array<{
    key: NotificationFieldKey;
    label: string;
    description: string;
  }>;
};

type SecuritySettings = {
  twoFactor: boolean;
};

type RoleDoc = {
  key: string; // roleKey unique
  nameAr: string;
  nameEn?: string;
  description?: string;
  permissions: string[];
  isActive: boolean;
  isSystem?: boolean;
  createdAt?: any;
  updatedAt?: any;
};

type AdminUserDoc = {
  includeInEmployeeManagement?: boolean;
  id: string;
  displayName: string;
  email: string;
  roleKey: string;
  title?: string;
  isActive: boolean;
  linkedUserUid?: string;
  employeeProfileEnabled?: boolean;
  linkedEmployeeId?: string | null;
  notes?: string;

  // ✅ Flexible per-user overrides
  permissionsAllow?: string[];
  permissionsDeny?: string[];

  createdAt?: any;
  updatedAt?: any;
};

type EmployeeLinkMode = "existing" | "create";

type EmployeeDirectoryEntry = {
  id: string;
  displayName: string;
  email: string;
  linkedUserUid?: string | null;
  title?: string | null;
};

// ✅ NEW: invite/promote by email (no UID)
type RoleInviteDoc = {
  id: string; // doc id = email lower
  email: string;
  roleKey: string; // owner/admin/accountant/hr/staff
  isActive: boolean;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
  createdByUid?: string;
};

type LabelsSettings = {
  projectTypes: Record<string, { ar: string; en?: string }>;
  projectStatuses: Record<string, { ar: string; en?: string }>;
  investmentStatuses: Record<string, { ar: string; en?: string }>;
  uiRoles: Record<string, { ar: string; en?: string }>;
};

type FlagsSettings = {
  disableInvestments: boolean;
  disableMessages: boolean;
  vipOnlyMode: boolean;
  hideVipProjects: boolean;
  maintenanceMode: boolean;
};

type ContentSettings = {
  heroTitleAr: string;
  heroTitleEn: string;
  heroSubtitleAr: string;
  heroSubtitleEn: string;

  footerAboutAr: string;
  footerAboutEn: string;

  contactEmail: string;
  contactPhone: string;
};

function createDefaultNotificationSettings(): NotificationSettings {
  return {
    email: true,
    sms: false,
    investments: true,
    messages: true,
  };
}

const NOTIFICATION_SECTION_CONFIG: NotificationSectionConfig[] = [
  {
    key: "delivery_channels",
    icon: Mail,
    eyebrow: "الوحدة 01",
    title: "قنوات الإرسال",
    description:
      "اختر قنوات الإرسال التي يعتمد عليها النظام عند بث التنبيهات الإدارية.",
    items: [
      {
        key: "email",
        label: "إشعارات البريد",
        description:
          "إرسال التنبيهات الرسمية عبر البريد الإلكتروني المسجل.",
      },
      {
        key: "sms",
        label: "إشعارات SMS",
        description:
          "إرسال تنبيهات نصية مختصرة للرسائل أو الحالات الحرجة.",
      },
    ],
  },
  {
    key: "notification_triggers",
    icon: Bell,
    eyebrow: "الوحدة 02",
    title: "محفزات التنبيه",
    description:
      "حدد ما إذا كان النظام ينشئ تنبيهات عند وصول استشارات أو رسائل جديدة.",
    items: [
      {
        key: "investments",
        label: "استشارات جديدة",
        description:
          "تنبيه الإدارة عند وصول استشارة أو طلب استثمار جديد.",
      },
      {
        key: "messages",
        label: "رسائل جديدة",
        description:
          "تنبيه الفريق عند استقبال رسالة جديدة من المستخدمين أو العملاء.",
      },
    ],
  },
];

function createDefaultSecuritySettings(): SecuritySettings {
  return {
    twoFactor: false,
  };
}

function createDefaultLabelsSettings(): LabelsSettings {
  return {
    projectTypes: {
      sukuk: { ar: "صكوك", en: "Sukuk" },
      land_development: { ar: "تطوير أراضٍ", en: "Land Development" },
      vip_exclusive: { ar: "VIP حصري", en: "VIP Exclusive" },
    },
    projectStatuses: {
      draft: { ar: "قريبًا", en: "Draft" },
      published: { ar: "منشور", en: "Published" },
      closed: { ar: "مغلق", en: "Closed" },
      completed: { ar: "مكتمل", en: "Completed" },
    },
    investmentStatuses: {
      pending: { ar: "معلق", en: "Pending" },
      approved: { ar: "معتمد", en: "Approved" },
      active: { ar: "نشط", en: "Active" },
      completed: { ar: "مكتمل", en: "Completed" },
      rejected: { ar: "مرفوض", en: "Rejected" },
    },
    uiRoles: {
      owner: { ar: "المالك", en: "Owner" },
      admin: { ar: "أدمن", en: "Admin" },
      accountant: { ar: "محاسب", en: "Accountant" },
      hr: { ar: "الموارد البشرية", en: "HR" },
      staff: { ar: "موظف", en: "Staff" },
      client: { ar: "عميل", en: "Client" },
      guest: { ar: "زائر", en: "Guest" },
    },
  };
}

function createDefaultFlagsSettings(): FlagsSettings {
  return {
    disableInvestments: false,
    disableMessages: false,
    vipOnlyMode: false,
    hideVipProjects: false,
    maintenanceMode: false,
  };
}

function createDefaultContentSettings(): ContentSettings {
  return {
    heroTitleAr: "منصة معدن البناء",
    heroTitleEn: "MAEDIN Platform",
    heroSubtitleAr: "استثمر بثقة مع فرص مدروسة",
    heroSubtitleEn: "Invest with confidence in curated opportunities",
    footerAboutAr:
      "معدن البناء منصة لإتاحة فرص استثمارية بشكل احترافي.",
    footerAboutEn:
      "MAEDIN is a platform for curated investment opportunities.",
    contactEmail: "",
    contactPhone: "",
  };
}

type DatabaseServiceKey = "worker" | "d1" | "r2";
type DatabaseUiStatus = "success" | "failed" | "not_ready" | "checking";
type DatabaseMetricKey =
  | "totalFiles"
  | "totalBytes"
  | "latestUploadAt"
  | "d1Records";
type DatabaseActionKey =
  | "browseFiles"
  | "refreshStatus"
  | "exportData"
  | "backup"
  | "cleanup";

type DatabaseOverviewCard = {
  key: DatabaseServiceKey | "overall";
  title: string;
  value: string;
  subtitle: string;
  icon: LucideIcon;
  valueDir?: "ltr" | "rtl";
  status: DatabaseUiStatus;
  statusLabel: string;
  statusDetail?: string | null;
};

type DatabaseMetricCard = {
  key: DatabaseMetricKey;
  title: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  valueDir?: "ltr" | "rtl";
};

type DatabaseActionCard = {
  key: DatabaseActionKey;
  title: string;
  description: string;
  icon: LucideIcon;
};

type DatabaseDetailRow = {
  label: string;
  value: string;
  valueDir?: "ltr" | "rtl";
};

const DATABASE_OVERVIEW_CARDS: DatabaseOverviewCard[] = [
  {
    key: "d1",
    title: "قاعدة البيانات",
    value: "خدمة قاعدة البيانات",
    subtitle: "مهيأة للوثائق",
    icon: Database,
    valueDir: "ltr",
    status: "not_ready",
    statusLabel: "غير مهيأ",
  },
  {
    key: "r2",
    title: "التخزين",
    value: "خدمة تخزين الملفات",
    subtitle: "مهيأة للمستندات",
    icon: HardDrive,
    valueDir: "ltr",
    status: "not_ready",
    statusLabel: "غير مهيأ",
  },
  {
    key: "worker",
    title: "خدمة الرفع",
    value: "خدمة معالجة الرفع",
    subtitle: "مهيأة لاستقبال الملفات",
    icon: ServerCog,
    valueDir: "ltr",
    status: "not_ready",
    statusLabel: "غير مهيأ",
  },
  {
    key: "overall",
    title: "الحالة",
    value: "غير مهيأ",
    subtitle: "لم يتم تنفيذ الفحص بعد.",
    icon: CheckCircle2,
    status: "not_ready",
    statusLabel: "غير مهيأ",
  },
];

const DATABASE_METRIC_CARDS: DatabaseMetricCard[] = [
  {
    key: "totalFiles",
    title: "عدد الملفات",
    value: "—",
    helper: "قريبًا",
    icon: Files,
    valueDir: "ltr",
  },
  {
    key: "totalBytes",
    title: "إجمالي الحجم",
    value: "—",
    helper: "قريبًا",
    icon: HardDrive,
    valueDir: "ltr",
  },
  {
    key: "latestUploadAt",
    title: "آخر عملية رفع",
    value: "—",
    helper: "قريبًا",
    icon: Clock3,
    valueDir: "rtl",
  },
  {
    key: "d1Records",
    title: "عدد سجلات الملفات",
    value: "—",
    helper: "قريبًا",
    icon: Database,
    valueDir: "ltr",
  },
];

const DATABASE_ACTION_CARDS: DatabaseActionCard[] = [
  {
    key: "browseFiles",
    title: "عرض الملفات",
    description: "واجهة لتصفح الملفات المخزنة فعليًا في المنصة.",
    icon: FolderOpen,
  },
  {
    key: "refreshStatus",
    title: "تحديث الحالة",
    description: "إعادة فحص جاهزية خدمات التخزين والرفع.",
    icon: RefreshCw,
  },
  {
    key: "exportData",
    title: "تصدير البيانات",
    description: "إعداد تصدير إداري للبيانات والملفات المرتبطة.",
    icon: FileDown,
  },
  {
    key: "backup",
    title: "نسخة احتياطية",
    description: "تجهيز آلية نسخ احتياطي تشغيلي لهذه البنية.",
    icon: Archive,
  },
  {
    key: "cleanup",
    title: "تنظيف الملفات اليتيمة",
    description: "مراجعة الملفات غير المرتبطة بسجلات موثقة قبل الحذف.",
    icon: Trash2,
  },
];

const DATABASE_TECHNICAL_DETAILS: DatabaseDetailRow[] = [
  { label: "قاعدة البيانات", value: "خدمة الوثائق", valueDir: "rtl" },
  { label: "تخزين الملفات", value: "خدمة المستندات", valueDir: "rtl" },
  { label: "خدمة المعالجة", value: "مفعلة", valueDir: "rtl" },
  { label: "المزوّد", value: "خدمة التخزين السحابي", valueDir: "rtl" },
  { label: "البيئة", value: "الإنتاج", valueDir: "rtl" },
];

const DATABASE_NOTES = [
  "هذا القسم مخصص لخدمات الوثائق والملفات فقط.",
  "تعرض البيانات هنا حالة خدمات التخزين المستخدمة في المنصة.",
  "النسخ الاحتياطي المتقدم سيضاف لاحقًا.",
];

const EMPTY_DATABASE_DASHBOARD: DocumentStorageDashboardSnapshot = {
  checkedAt: null,
  services: {
    worker: { status: "not_ready", message: "idle", detail: null },
    d1: { status: "not_ready", message: "idle", detail: null },
    r2: { status: "not_ready", message: "idle", detail: null },
  },
  metrics: {
    totalFiles: null,
    totalBytes: null,
    latestUploadAt: null,
    d1Records: null,
  },
  sources: {
    totalFiles: null,
    totalBytes: null,
    latestUploadAt: null,
    d1Records: null,
  },
};

function createUnavailableDatabaseDashboard(
  workerStatus: DocumentStorageServiceHealth["status"],
  reason: string
): DocumentStorageDashboardSnapshot {
  return {
    checkedAt: null,
    services: {
      worker: {
        status: workerStatus,
        message: reason,
        detail: reason,
      },
      d1: {
        status: "not_ready",
        message: "worker_unavailable",
        detail: reason,
      },
      r2: {
        status: "not_ready",
        message: "worker_unavailable",
        detail: reason,
      },
    },
    metrics: {
      totalFiles: null,
      totalBytes: null,
      latestUploadAt: null,
      d1Records: null,
    },
    sources: {
      totalFiles: null,
      totalBytes: null,
      latestUploadAt: null,
      d1Records: null,
    },
  };
}

function getDatabaseStatusLabel(status: DatabaseUiStatus) {
  switch (status) {
    case "success":
      return "جاهز";
    case "failed":
      return "فشل";
    case "checking":
      return "جارٍ الفحص";
    case "not_ready":
    default:
      return "غير مهيأ";
  }
}

function getDatabaseStatusTone(status: DatabaseUiStatus) {
  switch (status) {
    case "success":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "failed":
      return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
    case "checking":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "not_ready":
    default:
      return "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300";
  }
}

function formatDatabaseMetricSource(
  source: DocumentStorageMetricSource,
  hasValue: boolean
) {
  if (!hasValue) return "غير متاح";
  if (source === "r2") return "من خدمة الملفات";
  if (source === "d1") return "من خدمة البيانات";
  return "—";
}

function formatDatabaseCount(value: number | null) {
  if (value === null) return "—";
  return formatNumberEN(value);
}

function formatDatabaseBytes(value: number | null) {
  return formatFileSizeEN(value);
}

function formatDatabaseTimestamp(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return formatDateTimeEN(date, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDatabaseServiceDetail(
  detail: string | null | undefined,
  fallback: string
) {
  const normalized = String(detail || "").trim();
  if (!normalized) return fallback;

  switch (normalized) {
    case "stats_endpoint_responded":
      return "استجابة الخدمة بنجاح.";
    case "d1_metadata_aggregated":
      return "تمت قراءة إحصاءات الملفات.";
    case "r2_objects_aggregated":
      return "تم عدّ الملفات المخزنة فعليًا.";
    case "worker_unavailable":
      return "يتطلب توفر خدمة المعالجة أولًا.";
    case "Missing VITE_R2_UPLOAD_WORKER_URL":
      return "رابط خدمة الرفع غير مهيأ في البيئة.";
    default:
      return normalized.replace(/_/g, " ");
  }
}

function getOverallDatabaseStatus(
  snapshot: DocumentStorageDashboardSnapshot
): DatabaseUiStatus {
  const statuses = [
    snapshot.services.worker.status,
    snapshot.services.d1.status,
    snapshot.services.r2.status,
  ];

  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("not_ready")) return "not_ready";
  return "success";
}

/* =========================
   Permissions Catalog
========================= */

const DEFAULT_PERMISSIONS: Array<{ key: string; label: string }> = [
  { key: "dashboard.view", label: "عرض لوحة التحكم" },
  { key: "projects.view", label: "عرض المشاريع" },
  { key: "projects.manage", label: "إدارة المشاريع (إنشاء/تعديل/نشر)" },
  { key: "projects.publish", label: "نشر المشاريع (Publish)" },
  { key: "investments.view", label: "عرض الاستثمارات" },
  { key: "investments.manage", label: "إدارة الاستثمارات (موافقة/رفض/تحديث)" },
  { key: "users.view", label: "عرض العملاء" },
  { key: "users.manage", label: "إدارة العملاء (VIP/ملاحظات)" },
  { key: "messages.view", label: "عرض الرسائل" },
  { key: "messages.manage", label: "إدارة الرسائل" },
  { key: "recruitment.view", label: "عرض طلبات التوظيف" },
  { key: "recruitment.manage", label: "إدارة طلبات التوظيف" },
  { key: "employees.view", label: "عرض الموظفين" },
  { key: "employees.manage", label: "إدارة الموظفين" },
  { key: "reports.view", label: "عرض التقارير" },
  { key: "financial.view", label: "عرض المالية" },
  { key: "financial.edit", label: "تعديل المالية" },
  { key: "settings.manage", label: "إدارة الإعدادات" },
];

// ✅ ruols
const SYSTEM_ROLE_KEYS = [
  "owner",
  "admin",
  "accountant",
  "hr",
  "staff",
  "client",
  "guest",
];

type AppRoleKey =
  | "owner"
  | "admin"
  | "accountant"
  | "hr"
  | "staff"
  | "client"
  | "guest";

const ADMIN_ROLE_KEYS = ["owner", "admin", "accountant", "hr", "staff"] as const;
type AdminRoleKey = (typeof ADMIN_ROLE_KEYS)[number];

const ADMIN_ROLE_LABELS: Record<AdminRoleKey, string> = {
  owner: "المالك",
  admin: "أدمن",
  accountant: "محاسب",
  hr: "الموارد البشرية",
  staff: "موظف",
};

const ALL_PERMISSION_KEYS = DEFAULT_PERMISSIONS.map(
  ({ key }) => key as Permission
);

function isSystemRoleKey(roleKey: string): roleKey is AppRoleKey {
  return SYSTEM_ROLE_KEYS.includes(roleKey);
}

function isAdminRoleKey(roleKey: unknown): roleKey is AdminRoleKey {
  return ADMIN_ROLE_KEYS.includes(String(roleKey || "") as AdminRoleKey);
}

function normalizeAdminRoleKey(roleKey: unknown): AdminRoleKey {
  return isAdminRoleKey(roleKey) ? roleKey : "staff";
}

function isKnownPermission(
  permissionKey: unknown
): permissionKey is Permission {
  return CENTRAL_PERMISSION_KEYS.includes(permissionKey as Permission);
}

function normalizePermissionOverrides(
  allow: string[] = [],
  deny: string[] = []
): { permissionsAllow: Permission[]; permissionsDeny: Permission[] } {
  const allowSet = new Set<Permission>(
    (allow || []).filter(isKnownPermission) as Permission[]
  );
  const denySet = new Set<Permission>(
    (deny || []).filter(isKnownPermission) as Permission[]
  );

  denySet.forEach(deniedPermission => {
    allowSet.delete(deniedPermission);
  });

  return {
    permissionsAllow: CENTRAL_PERMISSION_KEYS.filter(permissionKey =>
      allowSet.has(permissionKey)
    ),
    permissionsDeny: CENTRAL_PERMISSION_KEYS.filter(permissionKey =>
      denySet.has(permissionKey)
    ),
  };
}

function getPermissionLabel(permissionKey: string): string {
  return (
    CENTRAL_PERMISSION_DEFINITIONS.find(
      permission => permission.key === permissionKey
    )?.label ?? permissionKey
  );
}

function pickEmployeeDirectoryText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && text !== "undefined" && text !== "null") return text;
  }
  return "";
}

function normalizeEmployeeDirectoryEntry(
  id: string,
  raw: Record<string, any>
): EmployeeDirectoryEntry {
  const employment = (raw.employeeProfile?.employment ||
    raw.employment ||
    {}) as Record<string, any>;

  return {
    id,
    displayName:
      pickEmployeeDirectoryText(raw.displayName, raw.name, raw.fullName) || id,
    email: pickEmployeeDirectoryText(raw.email),
    linkedUserUid:
      pickEmployeeDirectoryText(raw.linkedUserUid, raw.uid, raw.userId) || null,
    title:
      pickEmployeeDirectoryText(
        raw.title,
        employment.title,
        employment.jobTitle
      ) || null,
  };
}

function getRoleDefaultPermissionKeys(roleKey: string): Permission[] {
  if (!isSystemRoleKey(roleKey)) return [];
  return ROLE_DEFAULT_PERMS[roleKey];
}

function getEffectivePermissionKeys(
  roleKey: string,
  allow: string[] = [],
  deny: string[] = []
): Permission[] {
  const { permissionsAllow, permissionsDeny } = normalizePermissionOverrides(
    allow,
    deny
  );
  return getEffectivePermissions({
    role: isSystemRoleKey(roleKey) ? roleKey : "guest",
    permissionsAllow,
    permissionsDeny,
  });
}

function buildOverridesFromEffectiveSelection(
  roleKey: string,
  selectedPermissions: Iterable<unknown>
): { permissionsAllow: Permission[]; permissionsDeny: Permission[] } {
  const defaults = new Set(getRoleDefaultPermissionKeys(roleKey));
  const selected = new Set<Permission>();

  for (const permissionKey of Array.from(selectedPermissions)) {
    if (isKnownPermission(permissionKey)) {
      selected.add(permissionKey);
    }
  }

  const permissionsAllow: Permission[] = [];
  const permissionsDeny: Permission[] = [];

  for (const permissionKey of CENTRAL_PERMISSION_KEYS) {
    const isSelected = selected.has(permissionKey);
    const isDefault = defaults.has(permissionKey);

    if (isSelected && !isDefault) {
      permissionsAllow.push(permissionKey);
    } else if (!isSelected && isDefault) {
      permissionsDeny.push(permissionKey);
    }
  }

  return {
    permissionsAllow,
    permissionsDeny,
  };
}

/* =========================
   JSON Export Shape
========================= */
type SettingsExport = {
  exportedAt: string;
  settings: {
    app: AppSettings;
    notifications: NotificationSettings;
    security: SecuritySettings;
    roles: RoleDoc[];
    labels: LabelsSettings;
    flags: FlagsSettings;
    content: ContentSettings;
    recruitment: RecruitmentSettingsDoc;
  };
};

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("general");

  // Existing docs
  const [app, setApp] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [savedApp, setSavedApp] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [savingApp, setSavingApp] = useState(false);
  const [appSubmitAttempted, setAppSubmitAttempted] = useState(false);

  const [notifications, setNotifications] = useState<NotificationSettings>({
    email: true,
    sms: false,
    investments: true,
    messages: true,
  });
  const [savedNotifications, setSavedNotifications] =
    useState<NotificationSettings>(createDefaultNotificationSettings);
  const [savingNotifications, setSavingNotifications] = useState(false);

  const [security, setSecurity] = useState<SecuritySettings>({
    twoFactor: false,
  });
  const [savedSecurity, setSavedSecurity] = useState<SecuritySettings>(
    createDefaultSecuritySettings
  );
  const [savingSecurity, setSavingSecurity] = useState(false);

  // NEW: roles / admin users / labels / flags / content
  const [roles, setRoles] = useState<RoleDoc[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUserDoc[]>([]);
  const [employeeDirectory, setEmployeeDirectory] = useState<
    EmployeeDirectoryEntry[]
  >([]);

  // ✅ NEW: role invites
  const [roleInvites, setRoleInvites] = useState<RoleInviteDoc[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleKey, setInviteRoleKey] =
    useState<AdminRoleKey>("staff");
  const [inviteNotes, setInviteNotes] = useState("");

  const [labels, setLabels] = useState<LabelsSettings>({
    projectTypes: {
      sukuk: { ar: "صكوك", en: "Sukuk" },
      land_development: { ar: "تطوير أراضي", en: "Land Development" },
      vip_exclusive: { ar: "VIP حصري", en: "VIP Exclusive" },
    },
    projectStatuses: {
      draft: { ar: "قريبا", en: "Draft" },
      published: { ar: "منشور", en: "Published" },
      closed: { ar: "مغلق", en: "Closed" },
      completed: { ar: "مكتمل", en: "Completed" },
    },
    investmentStatuses: {
      pending: { ar: "معلق", en: "Pending" },
      approved: { ar: "معتمد", en: "Approved" },
      active: { ar: "نشط", en: "Active" },
      completed: { ar: "مكتمل", en: "Completed" },
      rejected: { ar: "مرفوض", en: "Rejected" },
    },
    uiRoles: {
      owner: { ar: "المالك", en: "Owner" },
      admin: { ar: "أدمن", en: "Admin" },
      accountant: { ar: "محاسب", en: "Accountant" },
      hr: { ar: "الموارد البشرية", en: "HR" },
      staff: { ar: "موظف", en: "Staff" },
      client: { ar: "عميل", en: "Client" },
      guest: { ar: "زائر", en: "Guest" },
    },
  });
  const [savedLabels, setSavedLabels] = useState<LabelsSettings>(
    createDefaultLabelsSettings
  );
  const [savingLabels, setSavingLabels] = useState(false);

  const [flags, setFlags] = useState<FlagsSettings>({
    disableInvestments: false,
    disableMessages: false,
    vipOnlyMode: false,
    hideVipProjects: false,
    maintenanceMode: false,
  });
  const [savedFlags, setSavedFlags] = useState<FlagsSettings>(
    createDefaultFlagsSettings
  );
  const [savingFlags, setSavingFlags] = useState(false);

  const [content, setContent] = useState<ContentSettings>({
    heroTitleAr: "منصة معدن البناء",
    heroTitleEn: "MAEDIN Platform",
    heroSubtitleAr: "استثمر بثقة مع فرص مدروسة",
    heroSubtitleEn: "Invest with confidence in curated opportunities",
    footerAboutAr: "معدن البناء منصة لإتاحة فرص استثمارية بشكل احترافي.",
    footerAboutEn: "MAEDIN is a platform for curated investment opportunities.",
    contactEmail: "",
    contactPhone: "",
  });
  const [savedContent, setSavedContent] = useState<ContentSettings>(
    createDefaultContentSettings
  );
  const [savingContent, setSavingContent] = useState(false);

  const [recruitment, setRecruitment] = useState<RecruitmentSettingsDoc>(
    normalizeRecruitmentSettings(DEFAULT_RECRUITMENT_SETTINGS)
  );
  const [savedRecruitment, setSavedRecruitment] =
    useState<RecruitmentSettingsDoc>(
      normalizeRecruitmentSettings(DEFAULT_RECRUITMENT_SETTINGS)
    );
  const [savingRecruitment, setSavingRecruitment] = useState(false);
  const [recruitmentPreviewValues, setRecruitmentPreviewValues] =
    useState<RecruitmentFormValues>({});

  const [error, setError] = useState<string>("");
  const databaseWorkerUrl = useMemo(() => getDocumentWorkerBaseUrl(), []);
  const [databaseDashboard, setDatabaseDashboard] =
    useState<DocumentStorageDashboardSnapshot>(() =>
      databaseWorkerUrl
        ? EMPTY_DATABASE_DASHBOARD
        : createUnavailableDatabaseDashboard(
          "not_ready",
          "Missing VITE_R2_UPLOAD_WORKER_URL"
        )
    );
  const [databaseRefreshing, setDatabaseRefreshing] = useState(false);
  const [databaseLoaded, setDatabaseLoaded] = useState(
    Boolean(!databaseWorkerUrl)
  );
  const [employeeDirectorySyncing, setEmployeeDirectorySyncing] =
    useState(false);
  const [employeeDirectorySyncSummary, setEmployeeDirectorySyncSummary] =
    useState<EmployeeDirectorySyncResult | null>(null);

  /* =========================
     Dialogs state
  ========================= */

  // Role dialog
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [editingRoleKey, setEditingRoleKey] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState<RoleDoc>({
    key: "",
    nameAr: "",
    nameEn: "",
    description: "",
    permissions: [],
    isActive: true,
    isSystem: false,
  });

  // Admin user dialog
  const [isAdminDialogOpen, setIsAdminDialogOpen] = useState(false);
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
  const [adminEmployeeLinkMode, setAdminEmployeeLinkMode] =
    useState<EmployeeLinkMode>("create");
  const [adminForm, setAdminForm] = useState<Omit<AdminUserDoc, "id">>({
    displayName: "",
    email: "",
    roleKey: "staff",
    title: "",
    isActive: true,
    linkedUserUid: "",
    employeeProfileEnabled: true,
    linkedEmployeeId: null,
    includeInEmployeeManagement: true,
    notes: "",
    permissionsAllow: [],
    permissionsDeny: [],
  });

  // Import JSON
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [contractExportItems, setContractExportItems] = useState<
    ContractExportCandidate[]
  >([]);
  const [contractExportLoading, setContractExportLoading] = useState(false);
  const [contractExporting, setContractExporting] = useState(false);
  const [contractExcelExporting, setContractExcelExporting] = useState(false);
  const [selectedContractIds, setSelectedContractIds] = useState<string[]>([]);
  const [contractSearch, setContractSearch] = useState("");
  const [contractStatusFilter, setContractStatusFilter] = useState("all");
  const [contractExportSummary, setContractExportSummary] =
    useState<ContractExportSummary | null>(null);
  const [contractExcelExportSummary, setContractExcelExportSummary] =
    useState<BusinessExcelExportSummary | null>(null);
  const [contractExportError, setContractExportError] = useState("");
  const [contractExcelExportError, setContractExcelExportError] = useState("");

  const appValidation = useMemo(() => {
    const errors: Partial<Record<keyof AppSettings, string>> = {};

    if (!app.name.trim()) {
      errors.name = "اسم المنصة مطلوب لعرض الهوية الأساسية للنظام.";
    }

    if (!app.email.trim()) {
      errors.email = "البريد الإلكتروني مطلوب لقنوات التواصل الرسمية.";
    } else if (!SETTINGS_EMAIL_REGEX.test(app.email.trim())) {
      errors.email = "صيغة البريد الإلكتروني غير صحيحة.";
    }

    if (!app.phone.trim()) {
      errors.phone = "رقم الهاتف مطلوب لبيانات التواصل.";
    }

    if (!app.address.trim()) {
      errors.address = "أدخل عنوانًا مختصرًا أو مقرًا رسميًا للمنصة.";
    }

    const minInvestmentValue = parseNumericSetting(app.minInvestment);
    const maxInvestmentValue = parseNumericSetting(app.maxInvestment);
    const defaultReturnValue = parseNumericSetting(app.defaultReturn);
    const defaultHorizonValue = parseNumericSetting(app.defaultHorizonYears);

    if (!app.minInvestment.trim()) {
      errors.minInvestment = "الحد الأدنى مطلوب لتوجيه طلبات الاستثمار.";
    } else if (
      minInvestmentValue === null ||
      Number.isNaN(minInvestmentValue)
    ) {
      errors.minInvestment = "أدخل رقمًا صحيحًا للحد الأدنى.";
    } else if (minInvestmentValue <= 0) {
      errors.minInvestment = "يجب أن يكون الحد الأدنى أكبر من صفر.";
    }

    if (!app.maxInvestment.trim()) {
      errors.maxInvestment = "الحد الأعلى مطلوب لتحديد السقف التشغيلي.";
    } else if (
      maxInvestmentValue === null ||
      Number.isNaN(maxInvestmentValue)
    ) {
      errors.maxInvestment = "أدخل رقمًا صحيحًا للحد الأعلى.";
    } else if (maxInvestmentValue <= 0) {
      errors.maxInvestment = "يجب أن يكون الحد الأعلى أكبر من صفر.";
    }

    if (
      minInvestmentValue !== null &&
      maxInvestmentValue !== null &&
      !Number.isNaN(minInvestmentValue) &&
      !Number.isNaN(maxInvestmentValue) &&
      minInvestmentValue > maxInvestmentValue
    ) {
      errors.maxInvestment =
        "الحد الأعلى يجب أن يكون مساويًا أو أكبر من الحد الأدنى.";
    }

    if (!app.defaultReturn.trim()) {
      errors.defaultReturn = "أدخل نسبة العائد الافتراضية.";
    } else if (
      defaultReturnValue === null ||
      Number.isNaN(defaultReturnValue)
    ) {
      errors.defaultReturn = "أدخل نسبة رقمية صحيحة.";
    } else if (defaultReturnValue <= 0 || defaultReturnValue > 100) {
      errors.defaultReturn = "النسبة يجب أن تكون بين 0 و100.";
    }

    if (!app.defaultHorizonYears.trim()) {
      errors.defaultHorizonYears = "أدخل المدة الافتراضية للاستثمار.";
    } else if (
      defaultHorizonValue === null ||
      Number.isNaN(defaultHorizonValue)
    ) {
      errors.defaultHorizonYears = "أدخل مدة رقمية صحيحة.";
    } else if (defaultHorizonValue <= 0) {
      errors.defaultHorizonYears = "المدة يجب أن تكون أكبر من صفر.";
    }

    return {
      errors,
      isValid: Object.keys(errors).length === 0,
      completedFields: APP_SETTINGS_KEYS.filter(key =>
        String(app[key] || "").trim()
      ).length,
      minInvestmentValue:
        minInvestmentValue !== null && !Number.isNaN(minInvestmentValue)
          ? minInvestmentValue
          : null,
      maxInvestmentValue:
        maxInvestmentValue !== null && !Number.isNaN(maxInvestmentValue)
          ? maxInvestmentValue
          : null,
      defaultReturnValue:
        defaultReturnValue !== null && !Number.isNaN(defaultReturnValue)
          ? defaultReturnValue
          : null,
      defaultHorizonValue:
        defaultHorizonValue !== null && !Number.isNaN(defaultHorizonValue)
          ? defaultHorizonValue
          : null,
    };
  }, [app]);

  const appDirty = useMemo(
    () => JSON.stringify(app) !== JSON.stringify(savedApp),
    [app, savedApp]
  );

  const changedAppFields = useMemo(
    () => APP_SETTINGS_KEYS.filter(key => app[key] !== savedApp[key]),
    [app, savedApp]
  );

  const appIssues = useMemo(
    () => Object.values(appValidation.errors).filter(Boolean) as string[],
    [appValidation.errors]
  );

  const investmentRangePreview = useMemo(() => {
    if (
      appValidation.minInvestmentValue === null ||
      appValidation.maxInvestmentValue === null
    ) {
      return "غير محدد بعد";
    }

    return `${formatNumberEN(appValidation.minInvestmentValue)} - ${formatNumberEN(
      appValidation.maxInvestmentValue
    )} ر.س`;
  }, [appValidation.maxInvestmentValue, appValidation.minInvestmentValue]);

  const returnProfilePreview = useMemo(() => {
    if (
      appValidation.defaultReturnValue === null ||
      appValidation.defaultHorizonValue === null
    ) {
      return "غير مكتمل";
    }

    return `${formatNumberEN(appValidation.defaultReturnValue)}% لمدة ${formatNumberEN(
      appValidation.defaultHorizonValue
    )} سنة`;
  }, [appValidation.defaultHorizonValue, appValidation.defaultReturnValue]);

  const shouldShowAppFieldFeedback = (key: keyof AppSettings) =>
    appSubmitAttempted || app[key] !== savedApp[key];

  const notificationsEnabledCount =
    Object.values(notifications).filter(Boolean).length;
  const updateNotificationField = (
    key: NotificationFieldKey,
    value: boolean
  ) => {
    setNotifications(previous => ({
      ...previous,
      [key]: value,
    }));
  };
  const notificationsDirty = useMemo(
    () =>
      JSON.stringify(notifications) !== JSON.stringify(savedNotifications),
    [notifications, savedNotifications]
  );
  const securityEnabledCount = Object.values(security).filter(Boolean).length;
  const securityDirty = useMemo(
    () => JSON.stringify(security) !== JSON.stringify(savedSecurity),
    [savedSecurity, security]
  );
  const activeRolesCount = roles.filter(role => role.isActive).length;
  const systemRolesCount = roles.filter(role => role.isSystem).length;
  const activeAdminsCount = adminUsers.filter(user => user.isActive).length;
  const activeInvitesCount = roleInvites.filter(
    invite => invite.isActive
  ).length;
  const totalLabelEntries =
    Object.keys(labels.projectTypes || {}).length +
    Object.keys(labels.projectStatuses || {}).length +
    Object.keys(labels.investmentStatuses || {}).length +
    Object.keys(labels.uiRoles || {}).length;
  const labelsDirty = useMemo(
    () => JSON.stringify(labels) !== JSON.stringify(savedLabels),
    [labels, savedLabels]
  );
  const enabledFlagsCount = Object.values(flags).filter(Boolean).length;
  const flagsDirty = useMemo(
    () => JSON.stringify(flags) !== JSON.stringify(savedFlags),
    [flags, savedFlags]
  );
  const contentCompletedCount = Object.values(content).filter(value =>
    String(value || "").trim()
  ).length;
  const contentDirty = useMemo(
    () => JSON.stringify(content) !== JSON.stringify(savedContent),
    [content, savedContent]
  );
  const recruitmentDirty = useMemo(
    () =>
      JSON.stringify(normalizeRecruitmentSettings(recruitment)) !==
      JSON.stringify(normalizeRecruitmentSettings(savedRecruitment)),
    [recruitment, savedRecruitment]
  );
  const requiredRecruitmentFieldsCount = useMemo(
    () => recruitment.fields.filter((field) => isRecruitmentFieldRequired(field)).length,
    [recruitment.fields]
  );
  const selectRecruitmentFieldsCount = useMemo(
    () => recruitment.fields.filter((field) => hasRecruitmentFieldType(field, "select")).length,
    [recruitment.fields]
  );
  const recruitmentValidation = useMemo(
    () => validateRecruitmentSettings(recruitment),
    [recruitment]
  );
  const recruitmentFieldIssuesCount = Object.values(
    recruitmentValidation.fieldErrors
  ).reduce((sum, issues) => sum + issues.length, 0);
  const recruitmentIssuesCount =
    recruitmentValidation.formErrors.length + recruitmentFieldIssuesCount;

  useEffect(() => {
    setRecruitmentPreviewValues((current) =>
      syncRecruitmentValuesWithFields(recruitment.fields, current)
    );
  }, [recruitment.fields]);

  /* =========================
     Load settings (Firestore)
  ========================= */

  const loadSettingsOnce = async () => {
    try {
      const [
        appSnap,
        notifSnap,
        secSnap,
        labelsSnap,
        rolesSnap,
        flagsSnap,
        contentSnap,
        recruitmentSnap,
      ] = await Promise.all([
        getDoc(doc(db, "settings", "app")),
        getDoc(doc(db, "settings", "notifications")),
        getDoc(doc(db, "settings", "security")),
        getDoc(doc(db, "settings", "labels")),
        getDoc(doc(db, "settings", "roles")),
        getDoc(doc(db, "settings", "flags")),
        getDoc(doc(db, "settings", "content")),
        getDoc(doc(db, "settings", RECRUITMENT_SETTINGS_DOC_ID)),
      ]);

      const nextApp = appSnap.exists()
        ? ({
          ...DEFAULT_APP_SETTINGS,
          ...((appSnap.data() as any) || {}),
        } as AppSettings)
        : DEFAULT_APP_SETTINGS;
      setApp(nextApp);
      setSavedApp(nextApp);
      setAppSubmitAttempted(false);
      const nextNotifications = notifSnap.exists()
        ? ({
          ...createDefaultNotificationSettings(),
          ...((notifSnap.data() as any) || {}),
        } as NotificationSettings)
        : createDefaultNotificationSettings();
      setNotifications(nextNotifications);
      setSavedNotifications(nextNotifications);

      const nextSecurity = secSnap.exists()
        ? ({
          ...createDefaultSecuritySettings(),
          ...((secSnap.data() as any) || {}),
        } as SecuritySettings)
        : createDefaultSecuritySettings();
      setSecurity(nextSecurity);
      setSavedSecurity(nextSecurity);

      const defaultLabels = createDefaultLabelsSettings();
      const nextLabels = labelsSnap.exists()
        ? (() => {
          const d = labelsSnap.data() as any;
          return {
            ...defaultLabels,
            ...(d || {}),
            projectTypes: d?.projectTypes ?? defaultLabels.projectTypes,
            projectStatuses:
              d?.projectStatuses ?? defaultLabels.projectStatuses,
            investmentStatuses:
              d?.investmentStatuses ?? defaultLabels.investmentStatuses,
            uiRoles: d?.uiRoles ?? defaultLabels.uiRoles,
          } satisfies LabelsSettings;
        })()
        : defaultLabels;
      setLabels(nextLabels);
      setSavedLabels(nextLabels);

      if (rolesSnap.exists()) {
        const d = rolesSnap.data() as any;
        if (Array.isArray(d?.roles)) setRoles(d.roles);
      }

      const nextFlags = flagsSnap.exists()
        ? ({
          ...createDefaultFlagsSettings(),
          ...((flagsSnap.data() as any) || {}),
        } as FlagsSettings)
        : createDefaultFlagsSettings();
      setFlags(nextFlags);
      setSavedFlags(nextFlags);

      const nextContent = contentSnap.exists()
        ? ({
          ...createDefaultContentSettings(),
          ...((contentSnap.data() as any) || {}),
        } as ContentSettings)
        : createDefaultContentSettings();
      setContent(nextContent);
      setSavedContent(nextContent);
      const nextRecruitment = recruitmentSnap.exists()
        ? normalizeRecruitmentSettings(recruitmentSnap.data())
        : normalizeRecruitmentSettings(DEFAULT_RECRUITMENT_SETTINGS);
      setRecruitment(nextRecruitment);
      setSavedRecruitment(nextRecruitment);
    } catch (e) {
      console.error(e);
      toast.error("فشل تحميل الإعدادات");
    }
  };

  const refreshDatabaseDashboard = async ({ manual = false } = {}) => {
    if (!databaseWorkerUrl) {
      setDatabaseDashboard(
        createUnavailableDatabaseDashboard(
          "not_ready",
          "Missing VITE_R2_UPLOAD_WORKER_URL"
        )
      );
      setDatabaseLoaded(true);
      if (manual) {
        toast.error("تعذر فحص الخدمات لأن رابط خدمة الرفع غير مهيأ");
      }
      return;
    }

    setDatabaseRefreshing(true);
    try {
      const snapshot = await fetchDocumentStorageDashboardSnapshot();
      setDatabaseDashboard(snapshot);
      if (manual) {
        toast.success("تم تحديث حالة الخدمات والبيانات");
      }
    } catch (e) {
      const reason =
        e instanceof Error ? e.message : "document_storage_snapshot_failed";
      console.error("database dashboard refresh failed:", e);
      setDatabaseDashboard(
        createUnavailableDatabaseDashboard("failed", reason)
      );
      if (manual) {
        toast.error("فشل تحديث حالة خدمات التخزين");
      }
    } finally {
      setDatabaseRefreshing(false);
      setDatabaseLoaded(true);
    }
  };

  const handleSyncEmployeeDirectory = async () => {
    if (!databaseWorkerUrl) {
      toast.error("تعذر تنفيذ المزامنة لأن رابط خدمة الرفع غير مهيأ");
      return;
    }

    setEmployeeDirectorySyncing(true);
    try {
      const summary = await syncEmployeeDirectoryFromWorker();
      setEmployeeDirectorySyncSummary(summary);

      toast.success(
        `تمت مزامنة دليل الموظفين: ${formatNumberEN(
          summary.employeesSynced
        )} سجل`
      );

      void logAuditEvent({
        action: "employee_directory_synced",
        category: "settings",
        entityType: "employee_directory",
        entityId: "d1",
        source: settingsSource("sync_employee_directory"),
        message: `Synced employee_directory to D1 (${summary.employeesSynced} rows, ${summary.employeesDeleted} deleted).`,
        meta: {
          syncedAt: summary.syncedAt,
          sourceCount: summary.sourceCount,
          employeesSynced: summary.employeesSynced,
          employeesDeleted: summary.employeesDeleted,
          actorRole: summary.actor?.role || null,
        },
      }).catch(error => {
        console.warn("employee_directory_sync_audit_failed", error);
      });
    } catch (error) {
      console.error("employee_directory_sync_failed", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "فشلت مزامنة دليل الموظفين."
      );
    } finally {
      setEmployeeDirectorySyncing(false);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const loadContractExportItems = async ({ manual = false } = {}) => {
    setContractExportLoading(true);
    setContractExportError("");

    try {
      const rows = await listContractExportCandidates();
      setContractExportItems(rows);
      setSelectedContractIds(previous =>
        previous.filter(contractId => rows.some(row => row.id === contractId))
      );
      if (manual) {
        toast.success("تم تحديث قائمة العقود.");
      }
    } catch (error) {
      console.error("contract export candidates failed:", error);
      const message =
        error instanceof Error ? error.message : "فشل تحميل العقود.";
      setContractExportError(message);
      if (manual) {
        toast.error("فشل تحديث قائمة العقود.");
      }
    } finally {
      setContractExportLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setError("");

    loadSettingsOnce()
      .catch(() => null)
      .finally(() => setLoading(false));

    void refreshDatabaseDashboard();
    void loadContractExportItems();

    // Realtime: admin_users
    const unsubAdmins = onSnapshot(
      collection(db, "admin_users"),
      snap => {
        const rows = snap.docs.map(d => ({
          id: d.id,
          ...(d.data() as any),
        })) as AdminUserDoc[];
        setAdminUsers(rows);
      },
      err => {
        console.error("admin_users snapshot error:", err);
        setError("تعذر تحميل بيانات حسابات الإدارة (صلاحيات/اتصال).");
      }
    );

    const unsubEmployees = onSnapshot(
      collection(db, "employees"),
      snap => {
        const rows = snap.docs
          .map(employeeDoc =>
            normalizeEmployeeDirectoryEntry(
              employeeDoc.id,
              (employeeDoc.data() as Record<string, any>) || {}
            )
          )
          .sort((left, right) => {
            const leftName = `${left.displayName} ${left.email}`
              .trim()
              .toLowerCase();
            const rightName = `${right.displayName} ${right.email}`
              .trim()
              .toLowerCase();
            return leftName.localeCompare(rightName);
          });

        setEmployeeDirectory(rows);
      },
      err => {
        console.error("employees snapshot error:", err);
      }
    );

    // Realtime: role_invites
    const unsubInvites = onSnapshot(
      collection(db, "role_invites"),
      snap => {
        const rows = snap.docs.map(d => ({
          id: d.id,
          ...(d.data() as any),
        })) as RoleInviteDoc[];
        rows.sort((a, b) =>
          String(a.email || "").localeCompare(String(b.email || ""))
        );
        setRoleInvites(rows);
      },
      err => {
        console.error("role_invites snapshot error:", err);
      }
    );

    return () => {
      unsubAdmins();
      unsubEmployees();
      unsubInvites();
    };
  }, [databaseWorkerUrl]);

  /* =========================
     Save handlers
  ========================= */
  const settingsSource = (method: string) =>
    buildAuditSource({
      area: "admin",
      page: "Settings",
      method,
    });

  const persistSettingsDoc = async (
    docId: string,
    payload: Record<string, unknown>,
    message: string
  ) => {
    await auditedSetDoc({
      ref: doc(db, "settings", docId),
      data: {
        ...payload,
        updatedAt: serverTimestamp(),
      },
      action: AUDIT_ACTIONS.SETTINGS_UPDATED,
      category: "settings",
      entityType: "settings",
      entityId: docId,
      source: settingsSource(`save_${docId}`),
      message,
      meta: {
        settingDocId: docId,
      },
      ignoreFields: ["updatedAt"],
    });
  };

  const saveApp = async () => {
    setAppSubmitAttempted(true);

    if (!appValidation.isValid) {
      toast.error("يرجى مراجعة الحقول المميزة قبل حفظ الإعدادات.");
      return;
    }

    try {
      setSavingApp(true);
      await persistSettingsDoc(
        "app",
        app as unknown as Record<string, unknown>,
        "Updated app settings"
      );
      setSavedApp({ ...app });
      toast.success("تم حفظ الإعدادات العامة");
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ الإعدادات العامة");
    } finally {
      setSavingApp(false);
    }
  };

  const resetAppChanges = () => {
    setApp(savedApp);
    setAppSubmitAttempted(false);
  };

  const saveNotifications = async () => {
    try {
      setSavingNotifications(true);
      await persistSettingsDoc(
        "notifications",
        notifications as unknown as Record<string, unknown>,
        "Updated notification settings"
      );
      setSavedNotifications({ ...notifications });
      toast.success("تم حفظ إعدادات الإشعارات");
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ إعدادات الإشعارات");
    } finally {
      setSavingNotifications(false);
    }
  };

  const resetNotificationsChanges = () => {
    setNotifications({ ...savedNotifications });
  };

  const saveSecurity = async () => {
    try {
      setSavingSecurity(true);
      await persistSettingsDoc(
        "security",
        security as unknown as Record<string, unknown>,
        "Updated security settings"
      );
      setSavedSecurity({ ...security });
      toast.success("تم حفظ إعدادات الأمان");
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ إعدادات الأمان");
    } finally {
      setSavingSecurity(false);
    }
  };

  const resetSecurityChanges = () => {
    setSecurity(savedSecurity);
  };

  const saveLabels = async () => {
    try {
      setSavingLabels(true);
      await persistSettingsDoc(
        "labels",
        labels as unknown as Record<string, unknown>,
        "Updated labels settings"
      );
      setSavedLabels(labels);
      toast.success("تم حفظ المسميات");
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ المسميات");
    } finally {
      setSavingLabels(false);
    }
  };

  const resetLabelsChanges = () => {
    setLabels(savedLabels);
  };

  const saveFlags = async () => {
    try {
      setSavingFlags(true);
      await persistSettingsDoc(
        "flags",
        flags as unknown as Record<string, unknown>,
        "Updated feature flags"
      );
      setSavedFlags({ ...flags });
      toast.success("تم حفظ الميزات التجريبية");
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ الميزات التجريبية");
    } finally {
      setSavingFlags(false);
    }
  };

  const resetFlagsChanges = () => {
    setFlags(savedFlags);
  };

  const saveContent = async () => {
    try {
      setSavingContent(true);
      await persistSettingsDoc(
        "content",
        content as unknown as Record<string, unknown>,
        "Updated site content settings"
      );
      setSavedContent({ ...content });
      toast.success("تم حفظ محتوى الموقع");
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ محتوى الموقع");
    } finally {
      setSavingContent(false);
    }
  };

  const resetContentChanges = () => {
    setContent(savedContent);
  };

  const saveRecruitment = async () => {
    if (recruitmentIssuesCount > 0) {
      toast.error("يرجى معالجة ملاحظات نموذج التوظيف قبل الحفظ.");
      return;
    }

    const normalized = normalizeRecruitmentSettings(recruitment);

    try {
      setSavingRecruitment(true);
      await persistSettingsDoc(
        RECRUITMENT_SETTINGS_DOC_ID,
        normalized as unknown as Record<string, unknown>,
        "Updated recruitment settings"
      );
      setRecruitment(normalized);
      setSavedRecruitment(normalized);
      toast.success("تم حفظ إعدادات نموذج التوظيف");
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ إعدادات نموذج التوظيف");
    } finally {
      setSavingRecruitment(false);
    }
  };

  const resetRecruitmentChanges = () => {
    setRecruitment(savedRecruitment);
    setRecruitmentPreviewValues(
      syncRecruitmentValuesWithFields(savedRecruitment.fields)
    );
  };

  const addRecruitmentField = (type: RecruitmentFieldType = "text") => {
    setRecruitment((current) => ({
      ...current,
      fields: [...current.fields, createRecruitmentField(type)],
    }));
  };

  const updateRecruitmentField = (
    fieldId: string,
    patch: Partial<RecruitmentFieldDefinition>
  ) => {
    setRecruitment((current) => ({
      ...current,
      fields: current.fields.map((field, index) => {
        if (field.id !== fieldId) return field;

        if (patch.type && patch.type !== field.type) {
          const nextTypeTemplate = createRecruitmentField(patch.type);
          return normalizeRecruitmentField(
            {
              ...field,
              ...nextTypeTemplate,
              ...patch,
              id: field.id,
              label: String(patch.label ?? field.label).trim() || field.label,
              required:
                typeof patch.required === "boolean"
                  ? patch.required
                  : field.required,
              placeholder:
                patch.type === "date" || patch.type === "file"
                  ? ""
                  : typeof patch.placeholder === "string"
                    ? patch.placeholder
                    : field.placeholder,
            },
            index
          );
        }

        return normalizeRecruitmentField(
          {
            ...field,
            ...patch,
            items: undefined,
          },
          index
        );
      }),
    }));
  };

  const moveRecruitmentFieldBy = (fieldId: string, direction: "up" | "down") => {
    setRecruitment((current) => {
      const index = current.fields.findIndex((field) => field.id === fieldId);
      if (index === -1) return current;

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      return {
        ...current,
        fields: moveItem(current.fields, index, targetIndex),
      };
    });
  };

  const removeRecruitmentField = (fieldId: string) => {
    setRecruitment((current) => ({
      ...current,
      fields: current.fields.filter((field) => field.id !== fieldId),
    }));
  };

  const addRecruitmentOption = (fieldId: string) => {
    setRecruitment((current) => ({
      ...current,
      fields: current.fields.map((field, index) => {
        if (field.id !== fieldId) return field;

        return normalizeRecruitmentField(
          {
            ...field,
            options: [...(field.options || []), createRecruitmentOption()],
          },
          index
        );
      }),
    }));
  };

  const updateRecruitmentOption = (
    fieldId: string,
    optionId: string,
    label: string
  ) => {
    setRecruitment((current) => ({
      ...current,
      fields: current.fields.map((field, index) => {
        if (field.id !== fieldId) return field;

        return normalizeRecruitmentField(
          {
            ...field,
            options: (field.options || []).map((option) =>
              option.id === optionId
                ? createRecruitmentOption({
                  id: option.id,
                  label,
                })
                : option
            ),
          },
          index
        );
      }),
    }));
  };

  const removeRecruitmentOption = (
    fieldId: string,
    optionId: string
  ) => {
    setRecruitment((current) => ({
      ...current,
      fields: current.fields.map((field, index) => {
        if (field.id !== fieldId) return field;

        return normalizeRecruitmentField(
          {
            ...field,
            options: (field.options || []).filter(
              (option) => option.id !== optionId
            ),
          },
          index
        );
      }),
    }));
  };

  /* =========================
     Roles
  ========================= */

  const saveRolesDoc = async (nextRoles: RoleDoc[]) => {
    await auditedSetDoc({
      ref: doc(db, "settings", "roles"),
      data: {
        roles: nextRoles,
        updatedAt: serverTimestamp(),
      },
      action: AUDIT_ACTIONS.SETTINGS_UPDATED,
      category: "settings",
      entityType: "settings",
      entityId: "roles",
      source: settingsSource("save_roles"),
      message: "Updated roles settings",
      meta: {
        roleCount: nextRoles.length,
      },
      ignoreFields: ["updatedAt"],
    });
  };

  const openCreateRole = () => {
    setEditingRoleKey(null);
    setRoleForm({
      key: "",
      nameAr: "",
      nameEn: "",
      description: "",
      permissions: [],
      isActive: true,
      isSystem: false,
    });
    setIsRoleDialogOpen(true);
  };

  const openEditRole = (r: RoleDoc) => {
    setEditingRoleKey(r.key);
    setRoleForm({ ...r });
    setIsRoleDialogOpen(true);
  };

  const togglePermission = (perm: string) => {
    setRoleForm(p => {
      const exists = p.permissions.includes(perm);
      return {
        ...p,
        permissions: exists
          ? p.permissions.filter(x => x !== perm)
          : [...p.permissions, perm],
      };
    });
  };

  const handleSaveRole = async () => {
    const key = roleForm.key.trim();
    const nameAr = roleForm.nameAr.trim();

    if (!key) return toast.error("مفتاح الدور مطلوب");
    if (!/^[a-z0-9_]+$/i.test(key))
      return toast.error("مفتاح الدور يجب أن يتكون من حروف أو أرقام أو `_` فقط");
    if (!nameAr) return toast.error("اسم الدور (عربي) مطلوب");

    try {
      const exists = roles.some(r => r.key === key);
      if (!editingRoleKey && exists)
        return toast.error("مفتاح الدور مستخدم مسبقًا");

      const nowRole: RoleDoc = {
        ...roleForm,
        key,
        nameAr,
        nameEn: roleForm.nameEn?.trim() || "",
        description: roleForm.description?.trim() || "",
        updatedAt: serverTimestamp(),
        createdAt: roleForm.createdAt ?? serverTimestamp(),
      };

      const next =
        editingRoleKey && editingRoleKey !== key
          ? roles.filter(r => r.key !== editingRoleKey).concat(nowRole)
          : roles.filter(r => r.key !== key).concat(nowRole);

      next.sort((a, b) => a.key.localeCompare(b.key));

      await saveRolesDoc(next);
      setRoles(next);

      // Optional: keep uiRoles labels in sync
      setLabels(prev => ({
        ...prev,
        uiRoles: {
          ...prev.uiRoles,
          [key]: {
            ar: nowRole.nameAr,
            en: nowRole.nameEn || "",
          },
        },
      }));

      toast.success("تم حفظ الدور");
      setIsRoleDialogOpen(false);
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ الدور");
    }
  };

  const handleDeleteRole = async (roleKey: string) => {
    if (SYSTEM_ROLE_KEYS.includes(roleKey)) {
      return toast.error("لا يمكن حذف دور أساسي");
    }
    try {
      const next = roles.filter(r => r.key !== roleKey);
      await saveRolesDoc(next);
      setRoles(next);
      toast.success("تم حذف الدور");
    } catch (e) {
      console.error(e);
      toast.error("فشل حذف الدور");
    }
  };

  const handleToggleRoleActive = async (roleKey: string) => {
    const role = roles.find(item => item.key === roleKey);
    if (!role) return;

    const next = roles.map(item =>
      item.key === roleKey ? { ...item, isActive: !item.isActive } : item
    );

    try {
      await saveRolesDoc(next);
      setRoles(next);
      toast.success(role.isActive ? "تم إيقاف الدور" : "تم تفعيل الدور");
    } catch (e) {
      console.error(e);
      toast.error("فشل تحديث الدور");
    }
  };

  /* =========================
     Admin Users (Firestore only)
  ========================= */

  const roleOptions = ADMIN_ROLE_KEYS.map(key => ({
    key,
    nameAr: ADMIN_ROLE_LABELS[key],
  }));

  const adminFormEffectivePermissions = useMemo(
    () =>
      getEffectivePermissionKeys(
        adminForm.roleKey,
        adminForm.permissionsAllow || [],
        adminForm.permissionsDeny || []
      ),
    [adminForm.permissionsAllow, adminForm.permissionsDeny, adminForm.roleKey]
  );

  const adminFormPermissionOverrides = useMemo(
    () =>
      normalizePermissionOverrides(
        adminForm.permissionsAllow || [],
        adminForm.permissionsDeny || []
      ),
    [adminForm.permissionsAllow, adminForm.permissionsDeny]
  );

  const selectedEmployeeDirectoryEntry = useMemo(
    () =>
      employeeDirectory.find(
        employee => employee.id === String(adminForm.linkedEmployeeId || "").trim()
      ) || null,
    [adminForm.linkedEmployeeId, employeeDirectory]
  );

  const findUserDocsByEmail = async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return [];

    const userQuery = query(
      collection(db, "users"),
      where("email", "==", normalizedEmail),
      limit(10)
    );
    const snapshot = await getDocs(userQuery);
    return snapshot.docs;
  };

  const resolveLinkedUserDocs = async (
    email: string,
    linkedUserUid?: string | null
  ) => {
    const linkedDocs = new Map<string, any>();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUid = String(linkedUserUid || "").trim();

    if (normalizedUid) {
      const linkedUserSnap = await getDoc(doc(db, "users", normalizedUid));
      if (linkedUserSnap.exists()) {
        linkedDocs.set(linkedUserSnap.id, linkedUserSnap);
      }
    }

    const matchedUserDocs = await findUserDocsByEmail(normalizedEmail);
    for (const matchedUserDoc of matchedUserDocs) {
      linkedDocs.set(matchedUserDoc.id, matchedUserDoc);
    }

    return Array.from(linkedDocs.values());
  };

  const resolveLinkedEmployeeDocIds = async ({
    linkedEmployeeId,
    linkedUserUids,
  }: {
    linkedEmployeeId?: string | null;
    linkedUserUids: Array<string | null | undefined>;
  }) => {
    const employeeDocIds = new Set<string>();
    const normalizedLinkedEmployeeId = String(linkedEmployeeId || "").trim();
    const candidateUserUids = Array.from(
      new Set(
        linkedUserUids
          .map(uid => String(uid || "").trim())
          .filter(Boolean)
      )
    );

    if (normalizedLinkedEmployeeId) {
      const linkedEmployeeSnap = await getDoc(
        doc(db, "employees", normalizedLinkedEmployeeId)
      );

      if (linkedEmployeeSnap.exists()) {
        const linkedEmployeeData =
          (linkedEmployeeSnap.data() as Record<string, any>) || {};
        const resolvedLinkedUserUid = pickEmployeeDirectoryText(
          linkedEmployeeData.linkedUserUid,
          linkedEmployeeData.uid,
          linkedEmployeeData.userId
        );

        if (
          !candidateUserUids.length ||
          !resolvedLinkedUserUid ||
          candidateUserUids.includes(resolvedLinkedUserUid)
        ) {
          employeeDocIds.add(linkedEmployeeSnap.id);
        }
      }
    }

    for (const linkedUserUid of candidateUserUids) {
      const directEmployeeSnap = await getDoc(doc(db, "employees", linkedUserUid));
      if (directEmployeeSnap.exists()) {
        employeeDocIds.add(directEmployeeSnap.id);
      }

      for (const fieldName of ["linkedUserUid", "uid", "userId"] as const) {
        const employeeQuery = query(
          collection(db, "employees"),
          where(fieldName, "==", linkedUserUid),
          limit(10)
        );
        const employeeSnapshot = await getDocs(employeeQuery);
        employeeSnapshot.docs.forEach(employeeDoc => {
          employeeDocIds.add(employeeDoc.id);
        });
      }
    }

    return Array.from(employeeDocIds.values());
  };

  const ensureLinkedEmployeeRecord = async ({
    employeeProfileEnabled,
    requestedEmployeeId,
    linkMode,
    linkedUserUid,
    displayName,
    email,
    title,
    isActive,
    includeInEmployeeManagement,
  }: {
    employeeProfileEnabled: boolean;
    requestedEmployeeId?: string | null;
    linkMode: EmployeeLinkMode;
    linkedUserUid?: string | null;
    displayName: string;
    email: string;
    title: string;
    isActive: boolean;
    includeInEmployeeManagement: boolean;
  }): Promise<string | null> => {
    if (!employeeProfileEnabled) return null;

    const normalizedLinkedUserUid = String(linkedUserUid || "").trim();
    if (!normalizedLinkedUserUid) {
      throw new Error(
        "ربط ملف الموظف يتطلب وجود حساب مستخدم مطابق لتأكيد الربط الصحيح."
      );
    }

    const normalizedRequestedEmployeeId = String(
      requestedEmployeeId || ""
    ).trim();
    const employeeId =
      linkMode === "existing"
        ? normalizedRequestedEmployeeId
        : normalizedLinkedUserUid;

    if (!employeeId) {
      throw new Error("اختر بروفايل موظف موجود أو أنشئ سجلًا جديدًا.");
    }

    const employeeRef = doc(db, "employees", employeeId);
    const employeeSnap = await getDoc(employeeRef);
    if (linkMode === "existing" && !employeeSnap.exists()) {
      throw new Error("سجل الموظف المحدد غير موجود.");
    }

    const existingEmployee = employeeSnap.exists()
      ? ((employeeSnap.data() as Record<string, any>) || {})
      : {};
    const existingLinkedUserUid =
      pickEmployeeDirectoryText(
        existingEmployee.linkedUserUid,
        existingEmployee.uid,
        existingEmployee.userId
      ) || "";

    if (
      linkMode === "existing" &&
      existingLinkedUserUid &&
      existingLinkedUserUid !== normalizedLinkedUserUid
    ) {
      throw new Error(
        "بروفايل الموظف المحدد مرتبط بالفعل بحساب مستخدم آخر."
      );
    }

    const existingEmployment = (existingEmployee.employeeProfile?.employment ||
      existingEmployee.employment ||
      {}) as Record<string, any>;
    const existingPersonal = (existingEmployee.employeeProfile?.personal ||
      {}) as Record<string, any>;
    const normalizedTitle = String(title || "").trim();

    await setDoc(
      employeeRef,
      {
        uid: normalizedLinkedUserUid,
        linkedUserUid: normalizedLinkedUserUid,
        includeInEmployeeManagement,
        email: email || existingEmployee.email || "",
        displayName:
          displayName ||
          existingEmployee.displayName ||
          existingEmployee.name ||
          "",
        name:
          displayName ||
          existingEmployee.name ||
          existingEmployee.displayName ||
          "",
        title:
          pickEmployeeDirectoryText(existingEmployee.title, normalizedTitle) ||
          null,
        active: isActive,
        isActive,
        updatedAt: serverTimestamp(),
        createdAt: existingEmployee.createdAt ?? serverTimestamp(),
        employeeProfile: {
          personal: existingPersonal,
          employment: {
            ...existingEmployment,
            title:
              pickEmployeeDirectoryText(
                existingEmployment.title,
                existingEmployment.jobTitle,
                normalizedTitle
              ) || null,
            jobTitle:
              pickEmployeeDirectoryText(
                existingEmployment.jobTitle,
                existingEmployment.title,
                normalizedTitle
              ) || null,
            updatedAt: serverTimestamp(),
          },
        },
      },
      { merge: true }
    );

    return employeeRef.id;
  };

  const buildAdminUserPayload = ({
    displayName,
    email,
    roleKey,
    title,
    isActive,
    employeeProfileEnabled,
    linkedEmployeeId,
    includeInEmployeeManagement,
    notes,
    permissionsAllow,
    permissionsDeny,
  }: {
    displayName: string;
    email: string;
    roleKey: AdminRoleKey;
    title: string;
    isActive: boolean;
    employeeProfileEnabled: boolean;
    linkedEmployeeId: string | null;
    includeInEmployeeManagement: boolean;
    notes: string;
    permissionsAllow: Permission[];
    permissionsDeny: Permission[];
  }) => ({
    displayName,
    email,
    roleKey,
    title: title || "",
    isActive,
    employeeProfileEnabled,
    linkedEmployeeId,
    includeInEmployeeManagement,
    notes,
    permissionsAllow,
    permissionsDeny,
  });

  const buildUserSyncPayload = ({
    displayName,
    email,
    roleKey,
    title,
    isActive,
    employeeProfileEnabled,
    includeInEmployeeManagement,
    linkedEmployeeId,
    permissionsAllow,
    permissionsDeny,
  }: {
    displayName: string;
    email: string;
    roleKey: AdminRoleKey;
    title: string;
    isActive: boolean;
    employeeProfileEnabled: boolean;
    includeInEmployeeManagement: boolean;
    linkedEmployeeId: string | null;
    permissionsAllow: Permission[];
    permissionsDeny: Permission[];
  }) => ({
    email,
    role: roleKey,
    displayName: displayName || null,
    name: displayName || null,
    title: title || null,
    includeInEmployeeManagement,
    employeeProfileEnabled,
    linkedEmployeeId,
    permissionsAllow,
    permissionsDeny,
    active: isActive,
    updatedAt: serverTimestamp(),
  });

  const toggleAdminEffectivePermission = (permissionKey: Permission) => {
    setAdminForm(previous => {
      const effective = new Set(
        getEffectivePermissionKeys(
          previous.roleKey,
          previous.permissionsAllow || [],
          previous.permissionsDeny || []
        )
      );

      if (effective.has(permissionKey)) {
        effective.delete(permissionKey);
      } else {
        effective.add(permissionKey);
      }

      return {
        ...previous,
        ...buildOverridesFromEffectiveSelection(previous.roleKey, effective),
      };
    });
  };

  const resetAdminPermissionOverrides = () => {
    setAdminForm(previous => ({
      ...previous,
      permissionsAllow: [],
      permissionsDeny: [],
    }));
  };

  const openCreateAdmin = () => {
    setEditingAdminId(null);
    setAdminEmployeeLinkMode("create");
    setAdminForm({
      includeInEmployeeManagement: true,
      displayName: "",
      email: "",
      roleKey: "staff",
      title: "",
      isActive: true,
      linkedUserUid: "",
      employeeProfileEnabled: true,
      linkedEmployeeId: null,
      notes: "",
      permissionsAllow: [],
      permissionsDeny: [],
    });
    setIsAdminDialogOpen(true);
  };

  const openEditAdmin = (u: AdminUserDoc) => {
    setEditingAdminId((u.email || "").trim().toLowerCase());
    setAdminEmployeeLinkMode(
      String(u.linkedEmployeeId || "").trim() ? "existing" : "create"
    );
    setAdminForm({
      includeInEmployeeManagement: !!u.includeInEmployeeManagement,
      displayName: String(u.displayName || "").trim(),
      email: u.email || "",
      roleKey: normalizeAdminRoleKey(u.roleKey),
      title: String(u.title || "").trim(),
      isActive: !!u.isActive,
      linkedUserUid: String(u.linkedUserUid || "").trim(),
      employeeProfileEnabled: !!u.employeeProfileEnabled,
      linkedEmployeeId: String(u.linkedEmployeeId || "").trim() || null,
      notes: u.notes || "",
      permissionsAllow: u.permissionsAllow || [],
      permissionsDeny: u.permissionsDeny || [],
    });
    setIsAdminDialogOpen(true);
  };

  const handleSaveAdminUser = async () => {
    const roleKey = normalizeAdminRoleKey(adminForm.roleKey);
    const displayName = String(adminForm.displayName || "").trim();
    const title = String(adminForm.title || "").trim();
    const email = adminForm.email.trim().toLowerCase();
    const employeeProfileEnabled = !!adminForm.employeeProfileEnabled;
    const includeInEmployeeManagement = !!adminForm.includeInEmployeeManagement;
    const requestedLinkedEmployeeId =
      String(adminForm.linkedEmployeeId || "").trim() || null;
    const needsExistingEmployeeSelection =
      employeeProfileEnabled &&
      adminEmployeeLinkMode === "existing" &&
      !requestedLinkedEmployeeId;

    if (!displayName) return toast.error("اسم الحساب مطلوب");
    if (!email || !email.includes("@")) return toast.error("البريد غير صحيح");
    if (!roleKey) return toast.error("اختر الدور");

    // ✅ sanitize arrays
    const { permissionsAllow, permissionsDeny } = normalizePermissionOverrides(
      adminForm.permissionsAllow || [],
      adminForm.permissionsDeny || []
    );
    const effectivePermissions = getEffectivePermissionKeys(
      roleKey,
      permissionsAllow,
      permissionsDeny
    );

    if (needsExistingEmployeeSelection) {
      return toast.error("اختر بروفايل موظف موجود لربط الحساب به.");
    }

    try {
      // ✅ ALWAYS upsert by emailLower (docId = email)
      const linkedUserDocs = await resolveLinkedUserDocs(
        email,
        adminForm.linkedUserUid
      );
      const linkedUserDoc = linkedUserDocs[0] || null;
      const linkedUserUid = linkedUserDoc?.id || null;
      const linkedEmployeeId = await ensureLinkedEmployeeRecord({
        employeeProfileEnabled,
        includeInEmployeeManagement,
        requestedEmployeeId: requestedLinkedEmployeeId,
        linkMode: adminEmployeeLinkMode,
        linkedUserUid,
        displayName,
        email,
        title,
        isActive: adminForm.isActive,
      });
      await auditedSetDoc({
        ref: doc(db, "admin_users", email),
        data: {
          ...buildAdminUserPayload({
            displayName,
            email,
            roleKey,
            title,
            isActive: adminForm.isActive,
            employeeProfileEnabled,
            linkedEmployeeId,
            includeInEmployeeManagement,
            notes: String(adminForm.notes || "").trim(),
            permissionsAllow,
            permissionsDeny,
          }),
          linkedUserUid,

          // ✅ حافظ على createdAt إذا موجود (لا تعيد تصفيره)
          createdAt: (adminForm as any).createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        options: { merge: true },
        action: editingAdminId
          ? AUDIT_ACTIONS.USER_UPDATED
          : AUDIT_ACTIONS.USER_CREATED,
        category: "user",
        entityType: "user",
        source: settingsSource(
          editingAdminId ? "update_admin_user" : "create_admin_user"
        ),
        relatedIds: { userId: linkedUserUid || email },
        message: `${editingAdminId ? "Updated" : "Created"} admin user ${email}`,
        meta: {
          roleKey,
          permissionsAllow,
          permissionsDeny,
          effectivePermissions,
          linkedUserUid,
          employeeProfileEnabled,
          linkedEmployeeId,
          adminEmployeeLinkMode,
          matchedUserCount: linkedUserDocs.length,
          targetUserEmail: email,
        },
        ignoreFields: ["updatedAt"],
      });

      // ✅ تنظيف تلقائي: لو كنت تعدّل سجل قديم (random id) أو تغير الإيميل
      // احذف الوثيقة القديمة إذا كانت مختلفة عن email الحالي
      for (const matchedUserDoc of linkedUserDocs) {
        await auditedSetDoc({
          ref: doc(db, "users", matchedUserDoc.id),
          data: {
            uid: matchedUserDoc.id,
            ...buildUserSyncPayload({
              displayName,
              email,
              roleKey,
              title,
              isActive: adminForm.isActive,
              employeeProfileEnabled,
              includeInEmployeeManagement,
              linkedEmployeeId,
              permissionsAllow,
              permissionsDeny,
            }),
          },
          options: { merge: true },
          action: AUDIT_ACTIONS.USER_UPDATED,
          category: "user",
          entityType: "user",
          entityId: matchedUserDoc.id,
          source: settingsSource("sync_admin_user_to_users"),
          relatedIds: {
            userId: matchedUserDoc.id,
          },
          message: `Synced admin user ${email} to users/${matchedUserDoc.id}`,
          meta: {
            roleKey,
            permissionsAllow,
            permissionsDeny,
            effectivePermissions,
            active: adminForm.isActive,
            employeeProfileEnabled,
            linkedEmployeeId,
            targetUserEmail: email,
          },
          ignoreFields: ["updatedAt"],
        });
      }

      if (editingAdminId && editingAdminId !== email) {
        try {
          await auditedDeleteDoc({
            ref: doc(db, "admin_users", editingAdminId),
            action: AUDIT_ACTIONS.USER_UPDATED,
            category: "user",
            entityType: "user",
            source: settingsSource("cleanup_old_admin_user"),
            relatedIds: { userId: editingAdminId },
            message: `Removed stale admin user record ${editingAdminId}`,
            meta: {
              replacedBy: email,
            },
          });
        } catch {
          // ignore
        }
      }

      toast.success(
        linkedUserDoc
          ? editingAdminId
            ? "تم تحديث الحساب الإداري ومزامنته مع users"
            : "تم إنشاء الحساب الإداري ومزامنته مع users"
          : editingAdminId
            ? "تم تحديث الحساب الإداري. ستتم مزامنته مع users عند وجود الحساب"
            : "تم إنشاء الحساب الإداري. ستتم مزامنته مع users عند وجود الحساب"
      );
      setIsAdminDialogOpen(false);
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ حساب الإدارة");
    }
  };

  const handleToggleAdminActive = async (u: AdminUserDoc) => {
    try {
      const id = (u.email || u.id || "").trim().toLowerCase(); // ✅ canonical
      const nextIsActive = !u.isActive;
      await auditedUpdateDoc({
        ref: doc(db, "admin_users", id),
        data: {
          isActive: nextIsActive,
          updatedAt: serverTimestamp(),
        },
        action: u.isActive
          ? AUDIT_ACTIONS.USER_DISABLED
          : AUDIT_ACTIONS.USER_ENABLED,
        category: "user",
        entityType: "user",
        source: settingsSource(
          u.isActive ? "disable_admin_user" : "enable_admin_user"
        ),
        relatedIds: { userId: id },
        message: `${u.isActive ? "Disabled" : "Enabled"} admin user ${id}`,
        meta: {
          targetUserEmail: id,
        },
      });
      const linkedUserDocs = await resolveLinkedUserDocs(id, u.linkedUserUid);
      for (const linkedUserDoc of linkedUserDocs) {
        await auditedSetDoc({
          ref: doc(db, "users", linkedUserDoc.id),
          data: {
            uid: linkedUserDoc.id,
            active: nextIsActive,
            updatedAt: serverTimestamp(),
          },
          options: { merge: true },
          action: u.isActive
            ? AUDIT_ACTIONS.USER_DISABLED
            : AUDIT_ACTIONS.USER_ENABLED,
          category: "user",
          entityType: "user",
          entityId: linkedUserDoc.id,
          source: settingsSource(
            u.isActive
              ? "disable_admin_user_users_sync"
              : "enable_admin_user_users_sync"
          ),
          relatedIds: { userId: linkedUserDoc.id },
          message: `${u.isActive ? "Disabled" : "Enabled"} primary user ${linkedUserDoc.id}`,
          meta: {
            targetUserEmail: id,
          },
          ignoreFields: ["updatedAt"],
        });
      }
      toast.success(u.isActive ? "تم تعطيل الحساب" : "تم تفعيل الحساب");
    } catch (e) {
      console.error(e);
      toast.error("فشل تحديث حالة الحساب");
    }
  };

  const handleDeleteAdmin = async (u: AdminUserDoc) => {
    try {
      const id = (u.email || u.id || "").trim().toLowerCase(); // ✅ canonical
      const linkedUserDocs = await resolveLinkedUserDocs(id, u.linkedUserUid);
      const linkedEmployeeDocIds = await resolveLinkedEmployeeDocIds({
        linkedEmployeeId: u.linkedEmployeeId,
        linkedUserUids: [
          u.linkedUserUid,
          ...linkedUserDocs.map(linkedUserDoc => linkedUserDoc.id),
        ],
      });
      await auditedDeleteDoc({
        ref: doc(db, "admin_users", id),
        action: AUDIT_ACTIONS.USER_UPDATED,
        category: "user",
        entityType: "user",
        source: settingsSource("delete_admin_user"),
        relatedIds: { userId: id },
        message: `Deleted admin user ${id}`,
        meta: {
          targetUserEmail: id,
        },
      });

      for (const linkedUserDoc of linkedUserDocs) {
        await auditedSetDoc({
          ref: doc(db, "users", linkedUserDoc.id),
          data: {
            uid: linkedUserDoc.id,
            permissionsAllow: [],
            permissionsDeny: [],
            active: true,
            updatedAt: serverTimestamp(),
          },
          options: { merge: true },
          action: AUDIT_ACTIONS.USER_ROLE_UPDATED,
          category: "user",
          entityType: "user",
          entityId: linkedUserDoc.id,
          source: settingsSource("delete_admin_user_users_sync"),
          relatedIds: { userId: linkedUserDoc.id },
          message: `Removed admin account record for user ${linkedUserDoc.id}`,
          meta: {
            targetUserEmail: id,
          },
          ignoreFields: ["updatedAt"],
        });
      }

      toast.success("تم حذف الحساب الإداري فقط");
    } catch (e) {
      console.error(e);
      toast.error("فشل حذف الحساب");
    }
  };

  /* =========================
     Role Invites (Promote by Email)
  ========================= */


  const upsertRoleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    const roleKey = inviteRoleKey;

    if (!email || !email.includes("@")) return toast.error("البريد غير صحيح");
    if (!roleKey) return toast.error("اختر الدور");

    try {
      await auditedSetDoc({
        ref: doc(db, "role_invites", email),
        data: {
          email,
          roleKey,
          isActive: true,
          notes: inviteNotes.trim(),
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        options: { merge: true },
        action: AUDIT_ACTIONS.ROLE_INVITE_CREATED,
        category: "user",
        entityType: "user",
        source: settingsSource("upsert_role_invite"),
        relatedIds: { userId: email },
        message: `Upserted role invite for ${email}`,
        meta: {
          roleKey,
          note: inviteNotes.trim() || null,
        },
        ignoreFields: ["updatedAt"],
      });

      toast.success("تم حفظ الدعوة — سيتم تطبيق الدور عند أول تسجيل دخول");
      setInviteEmail("");
      setInviteRoleKey("staff");
      setInviteNotes("");
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ الدعوة");
    }
  };

  const toggleInviteActive = async (inv: RoleInviteDoc) => {
    try {
      await auditedUpdateDoc({
        ref: doc(db, "role_invites", inv.id),
        data: {
          isActive: !inv.isActive,
          updatedAt: serverTimestamp(),
        },
        action: AUDIT_ACTIONS.ROLE_INVITE_UPDATED,
        category: "user",
        entityType: "user",
        source: settingsSource("toggle_role_invite"),
        relatedIds: { userId: inv.id },
        message: `${inv.isActive ? "Disabled" : "Enabled"} role invite ${inv.id}`,
        meta: {
          roleKey: inv.roleKey,
        },
      });
      toast.success(inv.isActive ? "تم تعطيل الدعوة" : "تم تفعيل الدعوة");
    } catch (e) {
      console.error(e);
      toast.error("فشل تحديث الدعوة");
    }
  };

  const deleteInvite = async (id: string) => {
    try {
      await auditedDeleteDoc({
        ref: doc(db, "role_invites", id),
        action: AUDIT_ACTIONS.ROLE_INVITE_DELETED,
        category: "user",
        entityType: "user",
        source: settingsSource("delete_role_invite"),
        relatedIds: { userId: id },
        message: `Deleted role invite ${id}`,
      });
      toast.success("تم حذف الدعوة");
    } catch (e) {
      console.error(e);
      toast.error("فشل حذف الدعوة");
    }
  };

  /* =========================
     Export / Import JSON
  ========================= */

  const buildExportJson = (): SettingsExport => ({
    exportedAt: new Date().toISOString(),
    settings: {
      app,
      notifications,
      security,
      roles,
      labels,
      flags,
      content,
      recruitment,
    },
  });

  const downloadJson = (obj: any, filename: string) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    const payload = buildExportJson();
    downloadJson(payload, `maedin-settings-${Date.now()}.json`);
    toast.success("تم تصدير ملف الإعدادات بصيغة JSON");
  };

  const applyImport = async (payload: SettingsExport) => {
    const s = payload.settings;
    await runAuditedOperation({
      action: AUDIT_ACTIONS.SETTINGS_IMPORTED,
      category: "settings",
      entityType: "settings",
      entityId: "bulk_import",
      source: settingsSource("import"),
      message: "Imported settings payload",
      meta: {
        sections: [
          "app",
          "notifications",
          "security",
          "roles",
          "labels",
          "flags",
          "content",
          "recruitment",
        ],
        roleCount: s.roles.length,
      },
      targets: [
        {
          ref: doc(db, "settings", "app"),
          entityType: "settings",
          label: "app",
        },
        {
          ref: doc(db, "settings", "notifications"),
          entityType: "settings",
          label: "notifications",
        },
        {
          ref: doc(db, "settings", "security"),
          entityType: "settings",
          label: "security",
        },
        {
          ref: doc(db, "settings", "roles"),
          entityType: "settings",
          label: "roles",
        },
        {
          ref: doc(db, "settings", "labels"),
          entityType: "settings",
          label: "labels",
        },
        {
          ref: doc(db, "settings", "flags"),
          entityType: "settings",
          label: "flags",
        },
        {
          ref: doc(db, "settings", "content"),
          entityType: "settings",
          label: "content",
        },
        {
          ref: doc(db, "settings", RECRUITMENT_SETTINGS_DOC_ID),
          entityType: "settings",
          label: "recruitment",
        },
      ],
      execute: async () => {
        await Promise.all([
          setDoc(doc(db, "settings", "app"), {
            ...s.app,
            importedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          setDoc(doc(db, "settings", "notifications"), {
            ...s.notifications,
            importedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          setDoc(doc(db, "settings", "security"), {
            ...s.security,
            importedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          setDoc(doc(db, "settings", "roles"), {
            roles: s.roles,
            importedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          setDoc(doc(db, "settings", "labels"), {
            ...s.labels,
            importedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          setDoc(doc(db, "settings", "flags"), {
            ...s.flags,
            importedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          setDoc(doc(db, "settings", "content"), {
            ...s.content,
            importedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          setDoc(doc(db, "settings", RECRUITMENT_SETTINGS_DOC_ID), {
            ...normalizeRecruitmentSettings(
              s.recruitment ?? DEFAULT_RECRUITMENT_SETTINGS
            ),
            importedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        ]);
      },
    });

    setApp(s.app);
    setNotifications(s.notifications);
    setSecurity(s.security);
    setRoles(s.roles);
    setLabels(s.labels);
    setFlags(s.flags);
    setContent(s.content);
    const nextRecruitment = normalizeRecruitmentSettings(
      s.recruitment ?? DEFAULT_RECRUITMENT_SETTINGS
    );
    setRecruitment(nextRecruitment);
    setSavedRecruitment(nextRecruitment);
  };

  const handlePickImportFile = () => fileInputRef.current?.click();

  const handleImportFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const f = e.target.files?.[0];
    if (!f) return;

    setImporting(true);
    try {
      const text = await f.text();
      const parsed = JSON.parse(text);

      if (!parsed?.settings?.app || !parsed?.settings?.labels) {
        toast.error("ملف غير صالح");
        return;
      }

      await applyImport(parsed as SettingsExport);
      toast.success("تم استيراد الإعدادات بنجاح");
    } catch (err) {
      console.error(err);
      toast.error("فشل استيراد الملف");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const contractStatusOptions = useMemo(() => {
    return Array.from(
      new Set(
        contractExportItems
          .map(item => String(item.status || "").trim())
          .filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right));
  }, [contractExportItems]);

  const filteredContractExportItems = useMemo(() => {
    const normalizedSearch = contractSearch.trim().toLowerCase();
    return contractExportItems.filter(item => {
      const matchesStatus =
        contractStatusFilter === "all" ||
        String(item.status || "") === contractStatusFilter;

      if (!matchesStatus) return false;
      if (!normalizedSearch) return true;

      const haystack = [
        item.id,
        item.investmentId,
        item.projectId,
        item.projectTitle,
        item.investorName,
        item.investorEmail,
        item.status,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [contractExportItems, contractSearch, contractStatusFilter]);

  const selectedContractIdSet = useMemo(
    () => new Set(selectedContractIds),
    [selectedContractIds]
  );

  const allFilteredSelected =
    filteredContractExportItems.length > 0 &&
    filteredContractExportItems.every(item =>
      selectedContractIdSet.has(item.id)
    );

  const toggleContractSelection = (contractId: string, checked: boolean) => {
    setSelectedContractIds(previous => {
      if (checked) {
        return Array.from(new Set([...previous, contractId]));
      }
      return previous.filter(value => value !== contractId);
    });
  };

  const toggleSelectAllFilteredContracts = (checked: boolean) => {
    setSelectedContractIds(previous => {
      if (!checked) {
        const filteredIds = new Set(
          filteredContractExportItems.map(item => item.id)
        );
        return previous.filter(value => !filteredIds.has(value));
      }
      return Array.from(
        new Set([
          ...previous,
          ...filteredContractExportItems.map(item => item.id),
        ])
      );
    });
  };

  const handleContractExport = async () => {
    if (!selectedContractIds.length) {
      toast.error("اختر عقدًا واحدًا على الأقل.");
      return;
    }

    setContractExporting(true);
    setContractExportError("");

    try {
      const result = await generateContractExportPackage({
        contractIds: selectedContractIds,
      });

      downloadBlob(result.blob, result.fileName);
      setContractExportSummary(result.summary);

      await logAuditEvent({
        action: "contract_export_generated",
        category: "contract",
        entityType: "contract_export",
        entityId:
          result.summary.exportedContractCount === 1
            ? selectedContractIds[0]
            : "multi",
        source: settingsSource("contract_export"),
        relatedIds:
          result.summary.exportedContractCount === 1
            ? { contractId: selectedContractIds[0] }
            : undefined,
        message: `Generated contract export package for ${result.summary.exportedContractCount} contract(s)`,
        meta: {
          requestedContractIds: selectedContractIds,
          exportedContractCount: result.summary.exportedContractCount,
          attachmentCount: result.summary.attachmentCount,
          warningCount: result.summary.warningCount,
          fileName: result.fileName,
        },
      });

      toast.success(
        result.summary.warningCount
          ? `Contract package exported with ${result.summary.warningCount} warning(s).`
          : "Contract package exported successfully."
      );
    } catch (error) {
      console.error("contract export failed:", error);
      const message =
        error instanceof Error ? error.message : "Contract export failed.";
      setContractExportError(message);
      toast.error(message);
    } finally {
      setContractExporting(false);
    }
  };

  const handleBusinessExcelExport = async () => {
    if (!selectedContractIds.length) {
      toast.error("اختر عقدًا واحدًا على الأقل.");
      return;
    }

    setContractExcelExporting(true);
    setContractExcelExportError("");

    try {
      const result = await generateBusinessExcelExport({
        contractIds: selectedContractIds,
      });

      downloadBlob(result.blob, result.fileName);
      setContractExcelExportSummary(result.summary);

      await logAuditEvent({
        action: "contract_excel_export_generated",
        category: "contract",
        entityType: "contract_export_excel",
        entityId:
          result.summary.exportedContractCount === 1
            ? selectedContractIds[0]
            : "multi",
        source: settingsSource("contract_export_excel"),
        relatedIds:
          result.summary.exportedContractCount === 1
            ? { contractId: selectedContractIds[0] }
            : undefined,
        message: `Generated Excel contract export for ${result.summary.exportedContractCount} contract(s)`,
        meta: {
          requestedContractIds: selectedContractIds,
          exportedContractCount: result.summary.exportedContractCount,
          workbookCount: result.summary.workbookCount,
          warningCount: result.summary.warningCount,
          fileName: result.fileName,
        },
      });

      toast.success(
        result.summary.warningCount
          ? `Excel export generated with ${result.summary.warningCount} warning(s).`
          : "Excel export generated successfully."
      );
    } catch (error) {
      console.error("business excel export failed:", error);
      const message =
        error instanceof Error ? error.message : "Excel export failed.";
      setContractExcelExportError(message);
      toast.error(message);
    } finally {
      setContractExcelExporting(false);
    }
  };

  const databaseOverviewCards = useMemo<DatabaseOverviewCard[]>(() => {
    const overallStatus: DatabaseUiStatus = databaseRefreshing
      ? "checking"
      : getOverallDatabaseStatus(databaseDashboard);

    return DATABASE_OVERVIEW_CARDS.map(card => {
      if (card.key === "overall") {
        return {
          ...card,
          value:
            overallStatus === "success"
              ? "مستقر"
              : overallStatus === "failed"
                ? "تنبيه"
                : overallStatus === "checking"
                  ? "جارٍ الفحص"
                  : "غير جاهز",
          subtitle: databaseDashboard.checkedAt
            ? `آخر فحص: ${formatDatabaseTimestamp(databaseDashboard.checkedAt)}`
            : databaseLoaded
              ? "بانتظار أول فحص ناجح."
              : "جاري تنفيذ أول فحص للخدمات.",
          status: overallStatus,
          statusLabel: getDatabaseStatusLabel(overallStatus),
          statusDetail:
            overallStatus === "success"
              ? "جميع الخدمات الرئيسية استجابت بنجاح."
              : overallStatus === "checking"
                ? "يتم الآن تحديث البيانات وحالة الخدمات."
                : "يوجد خلل أو عدم جاهزية في واحدة أو أكثر من الخدمات.",
        };
      }

      const service = databaseDashboard.services[card.key];
      const status: DatabaseUiStatus = databaseRefreshing
        ? "checking"
        : service.status;
      const fallbackDetail =
        card.key === "d1"
          ? "المرجع: خدمة الوثائق"
          : card.key === "r2"
            ? "المرجع: خدمة المستندات"
            : "المرجع: خدمة معالجة الرفع";

      return {
        ...card,
        subtitle:
          card.key === "worker" && databaseWorkerUrl
            ? "مهيأة لاستقبال الملفات"
            : card.subtitle,
        status,
        statusLabel: getDatabaseStatusLabel(status),
        statusDetail: databaseRefreshing
          ? "يتم الآن إعادة الفحص..."
          : formatDatabaseServiceDetail(service.detail, fallbackDetail),
      };
    });
  }, [
    databaseDashboard,
    databaseLoaded,
    databaseRefreshing,
    databaseWorkerUrl,
  ]);

  const databaseMetricCards = useMemo(() => {
    return DATABASE_METRIC_CARDS.map(metric => {
      switch (metric.key) {
        case "totalFiles":
          return {
            ...metric,
            value: formatDatabaseCount(databaseDashboard.metrics.totalFiles),
            helper: databaseRefreshing
              ? "جارٍ التحديث"
              : !databaseLoaded
                ? "جاري القراءة"
                : formatDatabaseMetricSource(
                  databaseDashboard.sources.totalFiles,
                  databaseDashboard.metrics.totalFiles !== null
                ),
          };
        case "totalBytes":
          return {
            ...metric,
            value: formatDatabaseBytes(databaseDashboard.metrics.totalBytes),
            helper: databaseRefreshing
              ? "جارٍ التحديث"
              : !databaseLoaded
                ? "جاري القراءة"
                : formatDatabaseMetricSource(
                  databaseDashboard.sources.totalBytes,
                  databaseDashboard.metrics.totalBytes !== null
                ),
          };
        case "latestUploadAt":
          return {
            ...metric,
            value: formatDatabaseTimestamp(
              databaseDashboard.metrics.latestUploadAt
            ),
            helper: databaseRefreshing
              ? "جارٍ التحديث"
              : !databaseLoaded
                ? "جاري القراءة"
                : formatDatabaseMetricSource(
                  databaseDashboard.sources.latestUploadAt,
                  databaseDashboard.metrics.latestUploadAt !== null
                ),
          };
        case "d1Records":
        default:
          return {
            ...metric,
            value: formatDatabaseCount(databaseDashboard.metrics.d1Records),
            helper: databaseRefreshing
              ? "جارٍ التحديث"
              : !databaseLoaded
                ? "جاري القراءة"
                : formatDatabaseMetricSource(
                  databaseDashboard.sources.d1Records,
                  databaseDashboard.metrics.d1Records !== null
                ),
          };
      }
    });
  }, [databaseDashboard, databaseLoaded, databaseRefreshing]);

  const databaseHealthyServicesCount = databaseOverviewCards.filter(
    card => card.status === "success"
  ).length;
  const databaseActiveMetricCount = databaseMetricCards.filter(
    metric => metric.value !== "—"
  ).length;

  const databaseTechnicalDetails = useMemo(() => {
    return DATABASE_TECHNICAL_DETAILS.map(item => {
      if (item.label !== "Worker" || !databaseWorkerUrl) return item;
      return {
        ...item,
        value: databaseWorkerUrl,
      };
    });
  }, [databaseWorkerUrl]);

  const databaseNotes = useMemo(() => {
    const notes = [...DATABASE_NOTES];
    notes.push(
      databaseDashboard.checkedAt
        ? `آخر فحص ناجح/متاح: ${formatDatabaseTimestamp(databaseDashboard.checkedAt)}.`
        : databaseLoaded
          ? "لم يتم الحصول بعد على قراءة ناجحة من خدمات التخزين."
          : "جارٍ تنفيذ أول فحص لخدمات التخزين."
    );
    return notes;
  }, [databaseDashboard.checkedAt, databaseLoaded]);

  const backupHeroStats = [
    {
      icon: FileDown,
      label: "المحدد",
      value: formatNumberEN(selectedContractIds.length),
      helper: "العقود المحددة للتصدير",
    },
    {
      icon: Files,
      label: "المفلتر",
      value: formatNumberEN(filteredContractExportItems.length),
      helper: "العقود المطابقة للفلاتر الحالية",
    },
    {
      icon: Archive,
      label: "التصدير",
      value:
        contractExportSummary || contractExcelExportSummary
          ? "جاهزة"
          : "قيد التحضير",
      helper: "آخر حالة تصدير معروفة",
    },
  ];

  const backupHeroMetrics = [
    {
      label: "إعدادات المنصة",
      value: importing ? "جارٍ الاستيراد" : "JSON جاهز",
      helper: "تصدير واستيراد الإعدادات",
    },
    {
      label: "حزمة النظام",
      value: contractExportSummary ? "جاهزة" : "قيد الانتظار",
      helper: "CSV + المرفقات + ملف الوصف",
    },
    {
      label: "حزمة Excel",
      value: contractExcelExportSummary ? "جاهزة" : "قيد الانتظار",
      helper: "تصدير مناسب للمراجعة",
    },
  ];

  const settingsTabs = [
    {
      value: "general",
      label: "عام",
      helper: "هوية المنصة والإعدادات الأساسية",
      icon: SettingsIcon,
    },
    {
      value: "notifications",
      label: "الإشعارات",
      helper: "القنوات والتنبيهات التشغيلية",
      icon: Bell,
    },
    {
      value: "security",
      label: "الأمان",
      helper: "المصادقة والسياسات الوقائية",
      icon: Shield,
    },
    {
      value: "roles",
      label: "الأدوار والصلاحيات",
      helper: "إدارة الوصول والصلاحيات",
      icon: KeyRound,
    },
    {
      value: "admins",
      label: "حسابات الإدارة",
      helper: "الترقيات والدعوات والحسابات",
      icon: Users,
    },
    {
      value: "labels",
      label: "المسميات",
      helper: "قاموس النصوص المركزية",
      icon: Tags,
    },
    {
      value: "flags",
      label: "الميزات التجريبية",
      helper: "مفاتيح التحكم التشغيلي",
      icon: SlidersHorizontal,
    },
    {
      value: "content",
      label: "محتوى الموقع",
      helper: "النصوص العامة وبيانات التواصل",
      icon: Type,
    },
    {
      value: "recruitment",
      label: "التوظيف",
      helper: "محرر الحقول ونموذج التقديم العام",
      icon: BriefcaseBusiness,
    },
    {
      value: "backup",
      label: "النسخ الاحتياطي",
      helper: "التصدير والاستيراد وحزم العقود",
      icon: FileDown,
    },
    {
      value: "database",
      label: "قاعدة البيانات",
      helper: "التخزين والمؤشرات الفنية",
      icon: Database,
    },
  ] as const;

  const activeTabMeta =
    settingsTabs.find(tab => tab.value === activeTab) ?? settingsTabs[0];

  const activeTabDescription =
    {
      general:
        "إدارة هوية المنصة، بيانات التواصل، والسياسات الاستثمارية الأساسية من واجهة مؤسسية موحدة.",
      notifications:
        "تنظيم قنوات الإشعارات والتنبيهات التشغيلية ضمن توزيع أوضح وتجميع منطقي أكثر احترافية.",
      security:
        "ضبط سياسات الأمان والمصادقة ضمن تجربة إعدادات أكثر وضوحًا واتساقًا مع بقية النظام.",
      roles:
        "إدارة الأدوار والصلاحيات من خلال دليل صلاحيات منظم ومقسّم إلى وحدات قابلة للمراجعة السريعة.",
      admins:
        "متابعة حسابات الإدارة، الدعوات، وربطها بالأدوار من لوحة موحدة تشبه المنصات الإدارية الحديثة.",
      labels:
        "توحيد مسميات النظام والقوائم المرجعية ضمن محررات منظمة وسهلة القراءة والتحديث.",
      flags:
        "التحكم في الميزات التجريبية وتجارب الإطلاق التدريجي من تبويب موحد ومتسق مع بقية الإعدادات.",
      content:
        "إدارة محتوى الموقع التشغيلي والتسويقي من وحدات واضحة تحافظ على نفس جودة تجربة الإعدادات.",
      recruitment:
        "إدارة نموذج التوظيف العام من نفس مركز الإعدادات، مع ترتيب واضح للحقول، وأنواع منظمة، ومعاينة مباشرة لما سيظهر للزائر في الصفحة العامة.",
      backup:
        "إدارة النسخ، الاستيراد، وحزم التصدير التشغيلية من تجربة منظمة تحافظ على وضوح الحالة والإجراءات.",
      database:
        "مراجعة حالة البنية، التخزين، والمؤشرات التشغيلية في لوحة تقنية موحدة وواضحة القراءة.",
    }[activeTab] ??
    "لوحة إعدادات موحدة تغطي جميع الجوانب التشغيلية والإدارية للمنصة بنفس الهوية البصرية.";

  const activeTabHeaderBadges: Array<{
    label: string;
    tone: "success" | "warning" | "neutral" | "info";
  }> =
    activeTab === "general"
      ? [
        {
          label: appDirty
            ? `${formatNumberEN(changedAppFields.length)} تغييرات غير محفوظة`
            : "جميع التغييرات محفوظة",
          tone: appDirty ? "warning" : "success",
        },
        {
          label: `${formatNumberEN(appValidation.completedFields)}/${formatNumberEN(APP_SETTINGS_KEYS.length)} حقول مكتملة`,
          tone: "neutral",
        },
        {
          label: appValidation.isValid
            ? "جاهزة للحفظ"
            : `${formatNumberEN(appIssues.length)} ملاحظات تحتاج مراجعة`,
          tone: appValidation.isValid ? "success" : "warning",
        },
      ]
      : activeTab === "notifications"
        ? [
          {
            label: `${formatNumberEN(notificationsEnabledCount)} عناصر مفعلة`,
            tone: "success",
          },
          {
            label: "قنوات وتنبيهات تشغيلية",
            tone: "neutral",
          },
          {
            label: "تجربة موحدة مع بقية التبويبات",
            tone: "info",
          },
        ]
        : activeTab === "security"
          ? [
            {
              label: `${formatNumberEN(securityEnabledCount)} سياسات مفعلة`,
              tone: "success",
            },
            {
              label: "مراجعة المصادقة والوصول",
              tone: "neutral",
            },
            {
              label: "واجهة أمان موحدة",
              tone: "info",
            },
          ]
          : activeTab === "roles"
            ? [
              {
                label: `${formatNumberEN(activeRolesCount)} أدوار نشطة`,
                tone: "success",
              },
              {
                label: `${formatNumberEN(systemRolesCount)} أدوار نظام`,
                tone: "neutral",
              },
              {
                label: "دليل صلاحيات منظم",
                tone: "info",
              },
            ]
            : activeTab === "admins"
              ? [
                {
                  label: `${formatNumberEN(activeAdminsCount)} حسابات نشطة`,
                  tone: "success",
                },
                {
                  label: `${formatNumberEN(activeInvitesCount)} دعوات فعالة`,
                  tone: "neutral",
                },
                {
                  label: "ربط الأدوار بالحسابات",
                  tone: "info",
                },
              ]
              : activeTab === "labels"
                ? [
                  {
                    label: `${formatNumberEN(totalLabelEntries)} تسمية معرفة`,
                    tone: "success",
                  },
                  {
                    label: "عربي / إنجليزي",
                    tone: "neutral",
                  },
                  {
                    label: "محررات موحدة",
                    tone: "info",
                  },
                ]
                : activeTab === "flags"
                  ? [
                    {
                      label: `${formatNumberEN(enabledFlagsCount)} ميزات مفعلة`,
                      tone: "success",
                    },
                    {
                      label: `${formatNumberEN(Object.keys(flags).length)} مفاتيح إجمالاً`,
                      tone: "neutral",
                    },
                    {
                      label: "تحكم تدريجي بالخصائص",
                      tone: "info",
                    },
                  ]
                  : activeTab === "content"
                    ? [
                      {
                        label: `${formatNumberEN(contentCompletedCount)} حقول مكتملة`,
                        tone: "success",
                      },
                      {
                        label: `${formatNumberEN(Object.keys(content).length)} حقول إجمالاً`,
                        tone: "neutral",
                      },
                      {
                        label: "تحرير محتوى موحد",
                        tone: "info",
                      },
                    ]
                    : activeTab === "recruitment"
                      ? [
                        {
                          label: recruitment.isPublished
                            ? "النموذج منشور"
                            : "النموذج غير منشور",
                          tone: recruitment.isPublished
                            ? "success"
                            : "warning",
                        },
                        {
                          label: `${formatNumberEN(recruitment.fields.length)} حقول`,
                          tone: "neutral",
                        },
                        {
                          label:
                            recruitmentIssuesCount === 0
                              ? "جاهز للعرض العام"
                              : `${formatNumberEN(recruitmentIssuesCount)} ملاحظات`,
                          tone:
                            recruitmentIssuesCount === 0
                              ? "info"
                              : "warning",
                        },
                      ]
                      : activeTab === "backup"
                        ? [
                          {
                            label: `${formatNumberEN(selectedContractIds.length)} عقود محددة`,
                            tone: selectedContractIds.length
                              ? "success"
                              : "neutral",
                          },
                          {
                            label: contractExportSummary
                              ? "باقة النظام متاحة"
                              : "باقة النظام غير مولدة",
                            tone: contractExportSummary ? "success" : "warning",
                          },
                          {
                            label: contractExcelExportSummary
                              ? "نسخة Excel متاحة"
                              : "نسخة Excel غير مولدة",
                            tone: contractExcelExportSummary
                              ? "info"
                              : "neutral",
                          },
                        ]
                        : [
                          {
                            label: `${formatNumberEN(databaseHealthyServicesCount)} خدمات سليمة`,
                            tone: "success",
                          },
                          {
                            label: `${formatNumberEN(databaseActiveMetricCount)} مؤشرات معروضة`,
                            tone: "neutral",
                          },
                          {
                            label: databaseRefreshing
                              ? "جاري فحص البنية"
                              : "حالة مباشرة",
                            tone: "info",
                          },
                        ];

  const tabActionConfigs: Partial<
    Record<
      string,
      {
        tabLabel: string;
        dirty: boolean;
        saving: boolean;
        onSave: () => void;
        onReset: () => void;
      }
    >
  > = {
    general: {
      tabLabel: "الإعدادات العامة",
      dirty: appDirty,
      saving: savingApp,
      onSave: saveApp,
      onReset: resetAppChanges,
    },
    notifications: {
      tabLabel: "الإشعارات",
      dirty: notificationsDirty,
      saving: savingNotifications,
      onSave: saveNotifications,
      onReset: resetNotificationsChanges,
    },
    security: {
      tabLabel: "الأمان",
      dirty: securityDirty,
      saving: savingSecurity,
      onSave: saveSecurity,
      onReset: resetSecurityChanges,
    },
    labels: {
      tabLabel: "المسميات",
      dirty: labelsDirty,
      saving: savingLabels,
      onSave: saveLabels,
      onReset: resetLabelsChanges,
    },
    flags: {
      tabLabel: "الميزات التجريبية",
      dirty: flagsDirty,
      saving: savingFlags,
      onSave: saveFlags,
      onReset: resetFlagsChanges,
    },
    content: {
      tabLabel: "محتوى الموقع",
      dirty: contentDirty,
      saving: savingContent,
      onSave: saveContent,
      onReset: resetContentChanges,
    },
    recruitment: {
      tabLabel: "التوظيف",
      dirty: recruitmentDirty,
      saving: savingRecruitment,
      onSave: saveRecruitment,
      onReset: resetRecruitmentChanges,
    },
  };

  const dirtyActionKeys = Object.entries(tabActionConfigs)
    .filter(([, config]) => config?.dirty)
    .map(([key]) => key);

  const prioritizedActionKey =
    tabActionConfigs[activeTab]?.dirty ? activeTab : dirtyActionKeys[0] ?? null;

  const activeBottomBarAction = prioritizedActionKey
    ? tabActionConfigs[prioritizedActionKey] ?? null
    : null;

  const dirtyTabsCount = dirtyActionKeys.length;

  /* =========================
     UI
  ========================= */

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-10 text-center">جاري التحميل...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <SettingsLayout
        activeTab={activeTab}
        onActiveTabChange={setActiveTab}
        settingsTabs={settingsTabs}
        activeTabMeta={activeTabMeta}
        activeTabDescription={activeTabDescription}
        activeTabHeaderBadges={activeTabHeaderBadges}
        error={error}
        activeBottomBarAction={activeBottomBarAction}
        dirtyTabsCount={dirtyTabsCount}
        prioritizedActionKey={prioritizedActionKey}
      >

        {/* =========================
              General
          ========================= */}
        <SettingsGeneralTab
          app={app}
          appDirty={appDirty}
          appValidation={appValidation}
          appIssuesCount={appIssues.length}
          appSettingsFieldsCount={APP_SETTINGS_KEYS.length}
          changedAppFieldsCount={changedAppFields.length}
          investmentRangePreview={investmentRangePreview}
          returnProfilePreview={returnProfilePreview}
          shouldShowAppFieldFeedback={shouldShowAppFieldFeedback}
          onAppFieldChange={(key, value) => setApp({ ...app, [key]: value })}
        />

        {/* =========================
              Notifications
          ========================= */}
        <SettingsNotificationsTab
          notifications={notifications}
          notificationsEnabledCount={notificationsEnabledCount}
          sections={NOTIFICATION_SECTION_CONFIG}
          onNotificationFieldChange={updateNotificationField}
        />

        {/* =========================
              Security
          ========================= */}
        <SettingsSecurityTab
          security={security}
          securityEnabledCount={securityEnabledCount}
          onTwoFactorChange={(twoFactor: boolean) =>
            setSecurity({ twoFactor })
          }
        />

        {/* =========================
              الأدوار والصلاحيات
          ========================= */}
        <SettingsRolesTab
          activeRolesCount={activeRolesCount}
          formatNumberEN={formatNumberEN}
          getRoleDisplayLabel={roleKey =>
            getRoleDisplayLabel(roleKey) || roleKey
          }
          onCreateRole={openCreateRole}
          onDeleteRole={handleDeleteRole}
          onEditRole={openEditRole}
          onToggleRoleActive={handleToggleRoleActive}
          permissionDefinitions={CENTRAL_PERMISSION_DEFINITIONS}
          roles={roles}
          systemRoleKeys={SYSTEM_ROLE_KEYS}
          systemRolesCount={systemRolesCount}
        />

        {/* =========================
              Admin Accounts
          ========================= */}
        <TabsContent value="admins" className="space-y-6">
          <SettingsTabHero
            eyebrow="وصول الإدارة"
            title="حسابات الإدارة"
            description="إدارة الترقية، الدعوات، والحسابات الإدارية من تبويب واحد منظم يعرض الحالة الحالية، القنوات المفتوحة، وعدد الحسابات النشطة بوضوح."
            stats={[
              {
                icon: Users,
                label: "الحسابات",
                value: formatNumberEN(adminUsers.length),
                helper: "إجمالي حسابات الإدارة",
              },
              {
                icon: CheckCircle2,
                label: "النشطة",
                value: formatNumberEN(activeAdminsCount),
                helper: "الحسابات المفعلة حاليًا",
              },
              {
                icon: Mail,
                label: "الدعوات",
                value: formatNumberEN(roleInvites.length),
                helper: "دعوات وربط أدوار عبر البريد",
              },
            ]}
            panel={
              <SettingsHeroPanel
                status="وصول منظم"
                title="إدارة الوصول"
                description=""
                metrics={[
                  {
                    label: "الحسابات المباشرة",
                    value: formatNumberEN(adminUsers.length),
                    helper: "",
                  },
                ]}
              />
            }
          />

          <SettingsSectionCard
            icon={Mail}
            eyebrow="الوحدة 01"
            title="دعوات الأدوار"
            description="ربط دور ببريد إلكتروني حتى يتم تطبيقه تلقائيًا عند تسجيل الدخول أو إنشاء الحساب."
          >
            <div className="grid gap-5 md:grid-cols-3">
              <SettingsField
                label="الإيميل"
                description="البريد الذي سيحمل الدعوة أو الترقية المؤجلة."
                placeholder="accountant@example.com"
                value={inviteEmail}
                onChange={setInviteEmail}
                dir="ltr"
                inputClassName="text-left"
                containerClassName="md:col-span-2"
              />

              <SettingsSelectField
                label="الدور"
                description="الدور الافتراضي عند تطبيق الدعوة."
              >
                <Select
                  value={inviteRoleKey}
                  onValueChange={(v: any) =>
                    setInviteRoleKey(normalizeAdminRoleKey(v))
                  }
                >
                  <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white px-4 shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">موظف</SelectItem>
                    <SelectItem value="hr">
                      الموارد البشرية
                    </SelectItem>
                    <SelectItem value="accountant">
                      محاسب
                    </SelectItem>
                    <SelectItem value="admin">مشرف</SelectItem>
                    <SelectItem value="owner">المالك</SelectItem>
                  </SelectContent>
                </Select>
              </SettingsSelectField>

              <SettingsField
                label="ملاحظات (اختياري)"
                description="تفاصيل إضافية توضح غرض الدعوة أو الجهة المسؤولة."
                placeholder="مثال: محاسب رسمي"
                value={inviteNotes}
                onChange={setInviteNotes}
                textarea
                rows={3}
                containerClassName="md:col-span-3"
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                className="bg-[#F2B705] text-slate-950 hover:bg-[#e0ab00]"
                onClick={upsertRoleInvite}
              >
                حفظ الدعوة
              </Button>
            </div>

            <div className="mt-8 space-y-4 border-t border-slate-200 pt-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-slate-950">
                    الدعوات الحالية
                  </div>
                  <div className="text-sm text-slate-500">
                    مراجعة الدعوات النشطة أو الموقوفة وإدارتها من هنا.
                  </div>
                </div>
                <Badge variant="outline" className="rounded-full">
                  {formatNumberEN(roleInvites.length)}
                </Badge>
              </div>

              {roleInvites.length ? (
                <div className="grid gap-4">
                  {roleInvites.map(inv => (
                    <div
                      key={inv.id}
                      className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-5"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="rounded-full">
                              {inv.email}
                            </Badge>
                            <Badge
                              variant="secondary"
                              className="rounded-full"
                            >
                              {getRoleDisplayLabel(inv.roleKey) ||
                                inv.roleKey}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-full",
                                inv.isActive
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-slate-200 bg-white text-slate-500"
                              )}
                            >
                              {inv.isActive ? "مفعلة" : "موقوفة"}
                            </Badge>
                          </div>

                          <p className="text-sm leading-7 text-slate-600">
                            {inv.notes ||
                              "لا توجد ملاحظات مضافة لهذه الدعوة."}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            onClick={() => toggleInviteActive(inv)}
                          >
                            {inv.isActive ? "تعطيل" : "تفعيل"}
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => deleteInvite(inv.id)}
                          >
                            حذف
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[22px] border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                  لا توجد دعوات محفوظة حتى الآن.
                </div>
              )}
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard
            icon={Users}
            eyebrow="الوحدة 03"
            title="دليل الحسابات الإدارية"
            description="إدارة الحسابات الإدارية الحالية ومراجعة صلاحياتها الفعلية وحالتها التشغيلية."
            action={
              <Button
                onClick={openCreateAdmin}
                className="bg-[#F2B705] text-slate-950 hover:bg-[#e0ab00]"
              >
                <Plus className="w-4 h-4 ml-2" /> حساب إداري جديد
              </Button>
            }
          >
            {adminUsers.length ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {adminUsers
                  .slice()
                  .sort((a, b) =>
                    String(a.email || "").localeCompare(String(b.email || ""))
                  )
                  .map(u => (
                    <div
                      key={u.id}
                      className="rounded-[24px] border border-slate-200/80 bg-slate-50/60 p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.24)]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="rounded-full">
                              ID: {u.id}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-full",
                                u.isActive
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-slate-200 bg-white text-slate-500"
                              )}
                            >
                              {u.isActive ? "مفعّل" : "معطّل"}
                            </Badge>
                            <Badge
                              variant="secondary"
                              className="rounded-full"
                            >
                              {getRoleDisplayLabel(u.roleKey) || u.roleKey}
                            </Badge>
                            {u.title ? (
                              <Badge
                                variant="outline"
                                className="rounded-full"
                              >
                                {u.title}
                              </Badge>
                            ) : null}
                          </div>

                          <div>
                            <div className="text-lg font-semibold tracking-tight text-slate-950">
                              {u.displayName || "بدون اسم"}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              {u.email}
                            </div>
                          </div>

                          {getEffectivePermissionKeys(
                            u.roleKey,
                            u.permissionsAllow || [],
                            u.permissionsDeny || []
                          ).length ? (
                            <div className="flex flex-wrap gap-2">
                              {getEffectivePermissionKeys(
                                u.roleKey,
                                u.permissionsAllow || [],
                                u.permissionsDeny || []
                              )
                                .slice(0, 6)
                                .map(permissionKey => (
                                  <Badge
                                    key={`effective-${u.id}-${permissionKey}`}
                                    variant="secondary"
                                    className="rounded-full text-xs"
                                  >
                                    {getPermissionLabel(permissionKey)}
                                  </Badge>
                                ))}
                            </div>
                          ) : null}

                          {u.permissionsAllow?.length ||
                            u.permissionsDeny?.length ? (
                            <div className="flex flex-wrap gap-2">
                              {(u.permissionsAllow || [])
                                .slice(0, 6)
                                .map((permissionKey: string) => (
                                  <Badge
                                    key={`a-${u.id}-${permissionKey}`}
                                    variant="secondary"
                                    className="rounded-full text-xs"
                                  >
                                    + {getPermissionLabel(permissionKey)}
                                  </Badge>
                                ))}

                              {(u.permissionsDeny || [])
                                .slice(0, 6)
                                .map(permissionKey => (
                                  <Badge
                                    key={`d-${u.id}-${permissionKey}`}
                                    variant="outline"
                                    className="rounded-full text-xs"
                                  >
                                    - {getPermissionLabel(permissionKey)}
                                  </Badge>
                                ))}
                            </div>
                          ) : null}

                          <p className="text-sm leading-7 text-slate-600">
                            {u.notes || "لا توجد ملاحظات مرتبطة بهذا الحساب."}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center">
                          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                            Effective
                          </div>
                          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                            {formatNumberEN(
                              getEffectivePermissionKeys(
                                u.roleKey,
                                u.permissionsAllow || [],
                                u.permissionsDeny || []
                              ).length
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() => openEditAdmin(u)}
                        >
                          <Pencil className="w-4 h-4 ml-2" /> تعديل
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleToggleAdminActive(u)}
                        >
                          {u.isActive ? "تعطيل" : "تفعيل"}
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => handleDeleteAdmin(u)}
                        >
                          <Trash2 className="w-4 h-4 ml-2" /> حذف
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="rounded-[22px] border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                لا توجد حسابات إدارة محفوظة حتى الآن.
              </div>
            )}
          </SettingsSectionCard>
        </TabsContent>

        {/* =========================
              Labels
          ========================= */}
        <SettingsLabelsTab
          labels={labels}
          totalLabelEntries={totalLabelEntries}
          onLabelsFieldChange={(key, value) =>
            setLabels(previous => ({ ...previous, [key]: value }))
          }
        />

        {/* =========================
              Flags
          ========================= */}
        <SettingsFlagsTab
          flags={flags}
          enabledFlagsCount={enabledFlagsCount}
          onFlagChange={(key, value) =>
            setFlags(previous => ({ ...previous, [key]: value }))
          }
        />

        {/* =========================
              Content CMS
          ========================= */}
        <SettingsContentTab
          content={content}
          contentCompletedCount={contentCompletedCount}
          onContentFieldChange={(key, value) =>
            setContent(previous => ({ ...previous, [key]: value }))
          }
        />

        {/* =========================
              Recruitment
          ========================= */}
        <TabsContent value="recruitment" className="space-y-6">
          <RecruitmentSettingsEditor
            recruitment={recruitment}
            recruitmentPreviewValues={recruitmentPreviewValues}
            requiredRecruitmentFieldsCount={requiredRecruitmentFieldsCount}
            selectRecruitmentFieldsCount={selectRecruitmentFieldsCount}
            recruitmentIssuesCount={recruitmentIssuesCount}
            recruitmentValidation={recruitmentValidation}
            onPublishedChange={(value) =>
              setRecruitment((current) => ({
                ...current,
                isPublished: value,
              }))
            }
            onAddField={addRecruitmentField}
            onUpdateField={updateRecruitmentField}
            onMoveField={moveRecruitmentFieldBy}
            onRemoveField={removeRecruitmentField}
            onAddOption={addRecruitmentOption}
            onUpdateOption={updateRecruitmentOption}
            onRemoveOption={removeRecruitmentOption}
            onPreviewValueChange={(fieldId, value) =>
              setRecruitmentPreviewValues((current) => ({
                ...current,
                [fieldId]: value,
              }))
            }
          />
          {false ? (
            <>
              <SettingsTabHero
                eyebrow="محرر نموذج التوظيف"
                title="إعدادات نموذج التوظيف العام"
                description="أضف الحقول المطلوبة، اختر نوع كل حقل، وحدد ما إذا كان إلزاميًا، ثم ستظهر نفس الحقول تلقائيًا في صفحة التوظيف العامة بنفس الترتيب ومن دون أي تعديل يدوي إضافي."
                stats={[
                  {
                    icon: BriefcaseBusiness,
                    label: "الحقول",
                    value: formatNumberEN(recruitment.fields.length),
                    helper: "إجمالي الحقول الحالية في النموذج",
                  },
                  {
                    icon: CheckCircle2,
                    label: "المطلوب",
                    value: formatNumberEN(requiredRecruitmentFieldsCount),
                    helper: "الحقول الإلزامية للمتقدّم",
                  },
                  {
                    icon: Type,
                    label: "القوائم",
                    value: formatNumberEN(selectRecruitmentFieldsCount),
                    helper: "حقول Select التي تحتوي على خيارات",
                  },
                ]}
                panel={
                  <SettingsHeroPanel
                    status={recruitment.isPublished ? "منشور" : "متوقف"}
                    title="الربط مع صفحة التوظيف العامة"
                    description="تنعكس إعدادات نموذج التوظيف مباشرة على صفحة التوظيف العامة، بما يشمل ترتيب الحقول وأنواعها."
                    metrics={[
                      {
                        label: "صفحة التوظيف",
                        value: "صفحة التوظيف العامة",
                        helper: "الصفحة العامة الظاهرة للزوار",
                      },
                      {
                        label: "الحالة",
                        value: recruitment.isPublished
                          ? "استقبال الطلبات مفعل"
                          : "استقبال الطلبات متوقف",
                        helper: "يمكن إيقاف الاستقبال دون حذف الحقول",
                      },
                      {
                        label: "سلامة الإعدادات",
                        value:
                          recruitmentIssuesCount === 0
                            ? "جاهز للحفظ"
                            : `${formatNumberEN(recruitmentIssuesCount)} ملاحظات`,
                        helper: "مراجعة الحقول قبل نشر التعديلات",
                      },
                    ]}
                  />
                }
              />

              <div className="space-y-6">
                <SettingsSectionCard
                  icon={BriefcaseBusiness}
                  eyebrow="الوحدة 01"
                  title="حالة النموذج"
                  description="تحكم سريع في إتاحة صفحة التوظيف العامة، مع ملخص فوري عن جودة الإعدادات وعدد الملاحظات التي تحتاج مراجعة."
                >
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="space-y-4">
                      <Toggle
                        label="استقبال طلبات التوظيف"
                        description="عند الإيقاف ستبقى الصفحة العامة موجودة، لكن سيظهر للزائر أن استقبال الطلبات متوقف مؤقتًا."
                        value={recruitment.isPublished}
                        onChange={(value) =>
                          setRecruitment((current) => ({
                            ...current,
                            isPublished: value,
                          }))
                        }
                      />

                      {recruitmentValidation.formErrors.length > 0 ? (
                        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                          <CircleAlert className="h-4 w-4" />
                          <AlertTitle>ملاحظات عامة على النموذج</AlertTitle>
                          <AlertDescription className="space-y-1 pt-2 leading-7">
                            {recruitmentValidation.formErrors.map((issue) => (
                              <p key={issue}>{issue}</p>
                            ))}
                          </AlertDescription>
                        </Alert>
                      ) : null}

                      <Alert className="border-slate-200 bg-slate-50">
                        <Globe className="h-4 w-4" />
                        <AlertTitle>آلية الانعكاس المباشر</AlertTitle>
                        <AlertDescription className="leading-7">
                          يتم حفظ تعريف الحقول في إعدادات النموذج، والصفحة
                          العامة تقرأه مباشرة من إعدادات المنصة. هذا يجعل الداشبورد
                          هو محرر النموذج، والصفحة العامة هي مكان التعبئة فقط.
                        </AlertDescription>
                      </Alert>
                    </div>

                    <div className="rounded-[26px] border border-slate-200/80 bg-slate-50/70 p-5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        ملخص الإعدادات
                      </div>

                      <div className="mt-5 space-y-3">
                        <div className="rounded-2xl border border-white/90 bg-white px-4 py-3 shadow-sm">
                          <div className="text-xs text-slate-500">الحقول الحالية</div>
                          <div className="mt-2 text-xl font-semibold text-slate-950">
                            {formatNumberEN(recruitment.fields.length)}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/90 bg-white px-4 py-3 shadow-sm">
                          <div className="text-xs text-slate-500">حقول Select</div>
                          <div className="mt-2 text-xl font-semibold text-slate-950">
                            {formatNumberEN(selectRecruitmentFieldsCount)}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/90 bg-white px-4 py-3 shadow-sm">
                          <div className="text-xs text-slate-500">ملاحظات تحتاج مراجعة</div>
                          <div className="mt-2 text-xl font-semibold text-slate-950">
                            {formatNumberEN(recruitmentIssuesCount)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </SettingsSectionCard>

                <SettingsSectionCard
                  icon={Type}
                  eyebrow="الوحدة 02"
                  title="محرر الحقول"
                  description="أضف الحقول الأساسية من هنا، ثم عدّل عنوان الحقل ونوعه وخصائصه. الترتيب الحالي هو نفسه الذي سيظهر للزائر في الصفحة العامة."
                >
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => addRecruitmentField("text")}
                      >
                        <Plus className="ml-2 h-4 w-4" />
                        حقل نصي
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => addRecruitmentField("number")}
                      >
                        <Plus className="ml-2 h-4 w-4" />
                        حقل رقمي
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => addRecruitmentField("date")}
                      >
                        <Plus className="ml-2 h-4 w-4" />
                        حقل تاريخ
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => addRecruitmentField("select")}
                      >
                        <Plus className="ml-2 h-4 w-4" />
                        قائمة خيارات
                      </Button>
                    </div>

                    {recruitment.fields.length ? (
                      <div className="space-y-4">
                        {recruitment.fields.map((field, index) => {
                          const fieldIssues =
                            recruitmentValidation.fieldErrors[field.id] || [];

                          return (
                            <div
                              key={field.id}
                              className="rounded-[26px] border border-slate-200/80 bg-slate-50/70 p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.24)]"
                            >
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="space-y-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className="rounded-full">
                                      الحقل {formatNumberEN(index + 1)}
                                    </Badge>
                                    <Badge
                                      variant="outline"
                                      className="rounded-full border-sky-200 bg-sky-50 text-sky-700"
                                    >
                                      {getRecruitmentFieldTypeLabel(field.type)}
                                    </Badge>
                                    {field.type === "number" ? (
                                      <Badge
                                        variant="outline"
                                        className="rounded-full border-amber-200 bg-amber-50 text-amber-700"
                                      >
                                        {getRecruitmentNumberModeLabel(
                                          field.numberMode || "default"
                                        )}
                                      </Badge>
                                    ) : null}
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "rounded-full",
                                        field.required
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                          : "border-slate-200 bg-white text-slate-500"
                                      )}
                                    >
                                      {field.required ? "مطلوب" : "اختياري"}
                                    </Badge>
                                  </div>

                                  <div>
                                    <div className="text-lg font-semibold text-slate-950">
                                      {field.label || "حقل بدون عنوان"}
                                    </div>
                                    <div className="mt-1 text-sm leading-7 text-slate-500">
                                      {getRecruitmentFieldHint(field)}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() =>
                                      moveRecruitmentFieldBy(field.id, "up")
                                    }
                                    disabled={index === 0}
                                    title="نقل للأعلى"
                                  >
                                    <ArrowUp className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() =>
                                      moveRecruitmentFieldBy(field.id, "down")
                                    }
                                    disabled={index === recruitment.fields.length - 1}
                                    title="نقل للأسفل"
                                  >
                                    <ArrowDown className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="icon"
                                    onClick={() => removeRecruitmentField(field.id)}
                                    title="حذف الحقل"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>

                              <div className="mt-5 grid gap-5 md:grid-cols-2">
                                <SettingsField
                                  label="عنوان الحقل"
                                  description="الاسم الظاهر للمتقدّم في الصفحة العامة."
                                  value={field.label}
                                  onChange={(value) =>
                                    updateRecruitmentField(field.id, {
                                      label: value,
                                    })
                                  }
                                  placeholder="مثال: الاسم"
                                />

                                <SettingsSelectField
                                  label="نوع الحقل"
                                  description="حدد نوع الإدخال المناسب لهذا الحقل."
                                >
                                  <Select
                                    value={field.type}
                                    onValueChange={(value) =>
                                      updateRecruitmentField(field.id, {
                                        type: value as RecruitmentFieldType,
                                      })
                                    }
                                  >
                                    <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white shadow-none">
                                      <SelectValue placeholder="اختر النوع" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="text">نصي</SelectItem>
                                      <SelectItem value="email">
                                        بريد إلكتروني
                                      </SelectItem>
                                      <SelectItem value="number">رقمي</SelectItem>
                                      <SelectItem value="date">تاريخ</SelectItem>
                                      <SelectItem value="select">قائمة</SelectItem>
                                      <SelectItem value="textarea">
                                        نص طويل
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </SettingsSelectField>

                                {field.type !== "date" ? (
                                  <SettingsField
                                    label="النص التوضيحي داخل الحقل"
                                    description="نص إرشادي داخل الحقل عند الحاجة."
                                    value={field.placeholder || ""}
                                    onChange={(value) =>
                                      updateRecruitmentField(field.id, {
                                        placeholder: value,
                                      })
                                    }
                                    placeholder="مثال: اكتب الإجابة"
                                  />
                                ) : (
                                  <div className="space-y-3">
                                    <Label className="text-[13px] font-semibold text-slate-900">
                                      النص التوضيحي داخل الحقل
                                    </Label>
                                    <div className="rounded-[20px] border border-slate-200 bg-slate-50/70 px-4 py-4 text-sm leading-7 text-slate-500">
                                      حقول التاريخ تستخدم أداة اختيار التاريخ، لذلك
                                      لا يظهر النص التوضيحي عادة داخل الواجهة.
                                    </div>
                                  </div>
                                )}

                                <div className="space-y-3">
                                  <Label className="text-[13px] font-semibold text-slate-900">
                                    خصائص الحقل
                                  </Label>

                                  <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                                    <div className="flex items-center justify-between gap-4">
                                      <div className="space-y-1">
                                        <div className="font-semibold text-slate-900">
                                          هل الحقل مطلوب؟
                                        </div>
                                        <p className="text-sm leading-6 text-slate-500">
                                          إذا كان مطلوبًا فلن يتم إرسال الطلب قبل
                                          تعبئته.
                                        </p>
                                      </div>

                                      <Checkbox
                                        checked={field.required}
                                        onCheckedChange={(checked) =>
                                          updateRecruitmentField(field.id, {
                                            required: Boolean(checked),
                                          })
                                        }
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {field.type === "number" ? (
                                <div className="mt-5">
                                  <SettingsSelectField
                                    label="نمط الرقم"
                                    description="اختر ما إذا كان هذا الحقل رقمًا عامًا أو رقم جوال."
                                  >
                                    <Select
                                      value={field.numberMode || "default"}
                                      onValueChange={(value) =>
                                        updateRecruitmentField(field.id, {
                                          numberMode: value as
                                            | "default"
                                            | "phone",
                                        })
                                      }
                                    >
                                      <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white shadow-none">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="default">
                                          رقم عادي
                                        </SelectItem>
                                        <SelectItem value="phone">
                                          رقم جوال
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </SettingsSelectField>
                                </div>
                              ) : null}

                              {field.type === "select" ? (
                                <div className="mt-5 space-y-4">
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <div className="text-sm font-semibold text-slate-950">
                                        خيارات القائمة
                                      </div>
                                      <div className="text-sm text-slate-500">
                                        هذه الخيارات ستظهر كما هي داخل القائمة
                                        المنسدلة في الصفحة العامة.
                                      </div>
                                    </div>

                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => addRecruitmentOption(field.id)}
                                    >
                                      <Plus className="ml-2 h-4 w-4" />
                                      خيار جديد
                                    </Button>
                                  </div>

                                  <div className="space-y-3">
                                    {(field.options || []).map((option, optionIndex) => (
                                      <div
                                        key={option.id}
                                        className="flex items-center gap-3 rounded-[20px] border border-slate-200 bg-white px-4 py-3"
                                      >
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                                          {formatNumberEN(optionIndex + 1)}
                                        </div>

                                        <Input
                                          value={option.label}
                                          onChange={(event) =>
                                            updateRecruitmentOption(
                                              field.id,
                                              option.id,
                                              event.target.value
                                            )
                                          }
                                          placeholder="اكتب اسم الخيار"
                                          className="h-11 rounded-xl border-slate-200 bg-white shadow-none"
                                        />

                                        <Button
                                          type="button"
                                          variant="ghost"
                                          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                          onClick={() =>
                                            removeRecruitmentOption(
                                              field.id,
                                              option.id
                                            )
                                          }
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              {fieldIssues.length ? (
                                <Alert className="mt-5 border-amber-200 bg-amber-50 text-amber-900">
                                  <CircleAlert className="h-4 w-4" />
                                  <AlertTitle>هذا الحقل يحتاج مراجعة</AlertTitle>
                                  <AlertDescription className="space-y-1 pt-2 leading-7">
                                    {fieldIssues.map((issue) => (
                                      <p key={issue}>{issue}</p>
                                    ))}
                                  </AlertDescription>
                                </Alert>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-[26px] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-14 text-center text-slate-500">
                        أضف أول حقل ليبدأ تكوين نموذج التوظيف العام.
                      </div>
                    )}
                  </div>
                </SettingsSectionCard>

                <SettingsSectionCard
                  icon={Globe}
                  eyebrow="الوحدة 03"
                  title="معاينة الصفحة العامة"
                  description="معاينة سريعة لنفس الحقول التي ستظهر للزائر في صفحة التوظيف العامة، مع الحفاظ على الترتيب الحالي للنموذج."
                >
                  {recruitment.fields.length ? (
                    <div className="rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_20px_52px_-40px_rgba(15,23,42,0.25)] sm:p-8">
                      <div className="flex flex-col gap-2 border-b border-slate-100 pb-6 text-right">
                        <div className="text-sm font-semibold text-[#8d6700]">
                          صفحة التوظيف العامة
                        </div>
                        <div className="text-2xl font-semibold tracking-tight text-slate-950">
                          نموذج التقديم كما سيظهر للزائر
                        </div>
                        <div className="text-sm leading-7 text-slate-500">
                          يمكن اختبار ترتيب الحقول والسلوك العام مباشرة من هنا قبل
                          الحفظ النهائي.
                        </div>
                      </div>

                      <div className="mt-8 space-y-8">
                        <RecruitmentFormFields
                          idPrefix="recruitment-preview"
                          fields={recruitment.fields}
                          values={recruitmentPreviewValues}
                          onValueChange={(fieldId, value) =>
                            setRecruitmentPreviewValues((current) => ({
                              ...current,
                              [fieldId]: value,
                            }))
                          }
                        />

                        <div className="flex justify-end">
                          <Button
                            type="button"
                            className="h-12 rounded-full bg-[#0f172a] px-8 text-sm font-semibold text-white hover:bg-[#111f38]"
                            disabled
                          >
                            إرسال الطلب
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[26px] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-14 text-center text-slate-500">
                      ستظهر المعاينة هنا بعد إضافة الحقول إلى النموذج.
                    </div>
                  )}
                </SettingsSectionCard>
              </div>
            </>
          ) : null}
        </TabsContent>

        {/* =========================
              Backup
          ========================= */}
        <SettingsBackupTab
          allFilteredSelected={allFilteredSelected}
          contractExcelExportError={contractExcelExportError}
          contractExcelExportSummary={contractExcelExportSummary}
          contractExcelExporting={contractExcelExporting}
          contractExportError={contractExportError}
          contractExportLoading={contractExportLoading}
          contractExportSummary={contractExportSummary}
          contractExporting={contractExporting}
          contractSearch={contractSearch}
          contractStatusFilter={contractStatusFilter}
          contractStatusOptions={contractStatusOptions}
          fileInputRef={fileInputRef}
          filteredContractExportItems={filteredContractExportItems}
          formatDatabaseTimestamp={formatDatabaseTimestamp}
          heroDescription="واجهة موحدة لحفظ إعدادات المنصة وتصدير حزم العقود والبيانات المرتبطة بها من مصادر النظام الحية."
          heroEyebrow="النسخ الاحتياطي والتصدير"
          heroPanelDescription="هذا التبويب يركّز على نقل إعدادات المنصة وتوليد باقات العقود من دون أي تعديل على بنية البيانات الأصلية."
          heroPanelMetrics={backupHeroMetrics}
          heroPanelStatus="جاهز للنقل"
          heroPanelTitle="حركة البيانات"
          heroStats={backupHeroStats}
          heroTitle="النسخ الاحتياطي والتصدير"
          importing={importing}
          onBusinessExcelExport={() => void handleBusinessExcelExport()}
          onClearSelectedContracts={() => setSelectedContractIds([])}
          onContractExport={() => void handleContractExport()}
          onContractSearchChange={setContractSearch}
          onContractStatusFilterChange={setContractStatusFilter}
          onExport={handleExport}
          onImportFileChange={handleImportFileChange}
          onPickImportFile={handlePickImportFile}
          onRefreshContractExportItems={() =>
            void loadContractExportItems({ manual: true })
          }
          onToggleContractSelection={toggleContractSelection}
          onToggleSelectAllFilteredContracts={toggleSelectAllFilteredContracts}
          selectedContractCountLabel={formatNumberEN(selectedContractIds.length)}
          selectedContractIds={selectedContractIds}
          selectedContractIdSet={selectedContractIdSet}
        />

        {/* =========================
              Database
          ========================= */}
        <SettingsDatabaseTab
          actionCards={DATABASE_ACTION_CARDS}
          d1Status={
            databaseRefreshing ? "checking" : databaseDashboard.services.d1.status
          }
          d1StatusLabel={getDatabaseStatusLabel(
            databaseRefreshing ? "checking" : databaseDashboard.services.d1.status
          )}
          databaseNotes={databaseNotes}
          databaseRefreshing={databaseRefreshing}
          employeeDirectorySyncSummary={employeeDirectorySyncSummary}
          employeeDirectorySyncing={employeeDirectorySyncing}
          formatDatabaseTimestamp={formatDatabaseTimestamp}
          formatNumberEN={formatNumberEN}
          getDatabaseStatusTone={getDatabaseStatusTone}
          hero={
            <SettingsTabHero
              eyebrow="نظرة عامة"
              title="حالة خدمات التخزين"
              description="تعرض هذه اللوحة حالة خدمات التخزين والملفات، مع توضيح الجاهزية والأخطاء والمؤشرات التشغيلية."
              stats={[
                {
                  icon: Database,
                  label: "الخدمات السليمة",
                  value: formatNumberEN(databaseHealthyServicesCount),
                  helper: "الخدمات السليمة حاليًا",
                },
                {
                  icon: Files,
                  label: "المؤشرات",
                  value: formatNumberEN(databaseActiveMetricCount),
                  helper: "المؤشرات التي لها بيانات",
                },
                {
                  icon: ServerCog,
                  label: "الحالة",
                  value: databaseRefreshing ? "جارٍ الفحص" : "مباشر",
                  helper: "حالة القراءة الحالية",
                },
              ]}
              panel={
                <SettingsHeroPanel
                  status={databaseRefreshing ? "جارٍ الفحص" : "خدمات التخزين"}
                  title="مراقبة الخدمات"
                  description="تعرض هذه اللوحة حالة الخدمات المرتبطة بالتخزين، وتساعدك على معرفة إذا كانت البنية جاهزة أو تحتاج تدخل."
                  metrics={[
                    {
                      label: "خدمة المعالجة",
                      value: getDatabaseStatusLabel(
                        databaseRefreshing
                          ? "checking"
                          : databaseDashboard.services.worker.status
                      ),
                      helper: "حالة خدمة معالجة الملفات",
                    },
                    {
                      label: "البيانات والملفات",
                      value: `${getDatabaseStatusLabel(
                        databaseRefreshing
                          ? "checking"
                          : databaseDashboard.services.d1.status
                      )} / ${getDatabaseStatusLabel(
                        databaseRefreshing
                          ? "checking"
                          : databaseDashboard.services.r2.status
                      )}`,
                      helper: "حالة قواعد البيانات والتخزين",
                    },
                    {
                      label: "آخر فحص",
                      value: databaseDashboard.checkedAt
                        ? formatDatabaseTimestamp(databaseDashboard.checkedAt)
                        : "غير متاح",
                      helper: "آخر وقت تم فيه الفحص",
                    },
                  ]}
                />
              }
            />
          }
          metricCards={databaseMetricCards}
          onRefresh={() =>
            void refreshDatabaseDashboard({
              manual: true,
            })
          }
          onSyncEmployeeDirectory={() => void handleSyncEmployeeDirectory()}
          overviewCards={databaseOverviewCards}
          r2Status={
            databaseRefreshing ? "checking" : databaseDashboard.services.r2.status
          }
          r2StatusLabel={getDatabaseStatusLabel(
            databaseRefreshing ? "checking" : databaseDashboard.services.r2.status
          )}
          technicalDetails={databaseTechnicalDetails}
          workerStatus={
            databaseRefreshing
              ? "checking"
              : databaseDashboard.services.worker.status
          }
          workerStatusLabel={getDatabaseStatusLabel(
            databaseRefreshing
              ? "checking"
              : databaseDashboard.services.worker.status
          )}
          workerUrl={databaseWorkerUrl}
        />

      </SettingsLayout>

      {/* =========================
          Role Dialog
      ========================= */}
      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent className="!w-[98vw] !max-w-none h-[92vh] overflow-hidden p-0 sm:!w-[95vw]">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle>
              {editingRoleKey ? "تعديل الدور" : "إنشاء دور جديد"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>مفتاح الدور (فريد)</Label>
                <Input
                  value={roleForm.key}
                  onChange={e =>
                    setRoleForm(p => ({ ...p, key: e.target.value }))
                  }
                  placeholder="مثال: manager / support / auditor"
                  disabled={
                    !!editingRoleKey &&
                    SYSTEM_ROLE_KEYS.includes(editingRoleKey)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  حروف/أرقام/_ فقط — ويُستخدم لاحقًا في الـ Rules
                </p>
              </div>

              <div className="space-y-1">
                <Label>اسم الدور (عربي)</Label>
                <Input
                  value={roleForm.nameAr}
                  onChange={e =>
                    setRoleForm(p => ({ ...p, nameAr: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>اسم الدور (إنجليزي)</Label>
                <Input
                  value={roleForm.nameEn || ""}
                  onChange={e =>
                    setRoleForm(p => ({ ...p, nameEn: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-1">
                <Label>الحالة</Label>
                <div className="flex items-center justify-between border rounded-md px-3 py-2">
                  <span className="text-sm">
                    {roleForm.isActive ? "مفعّل" : "موقوف"}
                  </span>
                  <Switch
                    checked={roleForm.isActive}
                    onCheckedChange={v =>
                      setRoleForm(p => ({ ...p, isActive: v }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label>وصف (اختياري)</Label>
              <Textarea
                rows={3}
                value={roleForm.description || ""}
                onChange={e =>
                  setRoleForm(p => ({ ...p, description: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>الصلاحيات</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {CENTRAL_PERMISSION_DEFINITIONS.map(perm => {
                  const checked = roleForm.permissions.includes(perm.key);
                  return (
                    <div
                      key={perm.key}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 bg-background/60 hover:bg-background transition"
                    >
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium">{perm.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {perm.key}
                        </div>
                      </div>

                      <Switch
                        checked={checked}
                        onCheckedChange={() => togglePermission(perm.key)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setIsRoleDialogOpen(false)}
              >
                إلغاء
              </Button>
              <Button className="bg-[#F2B705]" onClick={handleSaveRole}>
                {editingRoleKey ? "حفظ التعديل" : "إنشاء الدور"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* =========================
        Admin User Dialog
    ========================= */}
      <Dialog open={isAdminDialogOpen} onOpenChange={setIsAdminDialogOpen}>
        <DialogContent className="!w-[98vw] !max-w-none h-[92vh] overflow-hidden p-0 sm:!w-[95vw]">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle>
              {editingAdminId ? "تعديل حساب إداري" : "إنشاء حساب إداري"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>الاسم</Label>
                <Input
                  value={adminForm.displayName}
                  onChange={e =>
                    setAdminForm(p => ({ ...p, displayName: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-1">
                <Label>البريد</Label>
                <Input
                  value={adminForm.email}
                  onChange={e =>
                    setAdminForm(p => ({ ...p, email: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>الدور</Label>
                <Select
                  value={adminForm.roleKey}
                  onValueChange={(v: AdminRoleKey) =>
                    setAdminForm(p => ({
                      ...p,
                      roleKey: v,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map(r => (
                      <SelectItem key={r.key} value={r.key}>
                        {`${r.nameAr} (${r.key})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>المنصب/العنوان (اختياري)</Label>
                <Input
                  value={adminForm.title || ""}
                  onChange={e =>
                    setAdminForm(p => ({ ...p, title: e.target.value }))
                  }
                  placeholder="مثال: مدير مالي"
                />
              </div>

              <div className="space-y-1">
                <Label>الحالة</Label>
                <div className="flex items-center justify-between border rounded-md px-3 py-2">
                  <span className="text-sm">
                    {adminForm.isActive ? "مفعّل" : "معطّل"}
                  </span>
                  <Switch
                    checked={adminForm.isActive}
                    onCheckedChange={v =>
                      setAdminForm(p => ({ ...p, isActive: v }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label>لديه بروفايل موظف</Label>
                  <p className="text-xs text-muted-foreground">
                    يبقى الدور مسؤولًا عن الصلاحيات فقط، بينما بروفايل الموظف
                    يستخدم لبيانات الموظف التشغيلية والظهور في واجهات الموظفين.
                  </p>
                </div>

                <Switch
                  checked={!!adminForm.employeeProfileEnabled}
                  onCheckedChange={checked =>
                    setAdminForm(previous => ({
                      ...previous,
                      employeeProfileEnabled: checked,
                      linkedEmployeeId: checked
                        ? previous.linkedEmployeeId || null
                        : null,
                    }))
                  }
                />
              </div>

              {adminForm.employeeProfileEnabled ? (
                <>
                  {/* طريقة الربط */}
                </>
              ) : null}
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label>يعامل كموظف</Label>
                  <p className="text-xs text-muted-foreground">
                    عند التفعيل سيظهر هذا الحساب داخل صفحة إدارة الموظفين ويمكن إدارة ملفه الوظيفي.
                    عند الإيقاف لن يظهر في قائمة الموظفين حتى لو كان Owner أو Admin.
                  </p>
                </div>
                <Switch
                  checked={!!adminForm.includeInEmployeeManagement}
                  onCheckedChange={checked =>
                    setAdminForm(previous => ({
                      ...previous,
                      includeInEmployeeManagement: checked,
                    }))
                  }
                />
              </div>

              {adminForm.employeeProfileEnabled ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>طريقة الربط</Label>
                    <Select
                      value={adminEmployeeLinkMode}
                      onValueChange={(value: EmployeeLinkMode) => {
                        setAdminEmployeeLinkMode(value);
                        if (value === "create") {
                          setAdminForm(previous => ({
                            ...previous,
                            linkedEmployeeId: null,
                          }));
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="create">
                          إنشاء سجل موظف جديد مرتبط بالحساب
                        </SelectItem>
                        <SelectItem value="existing">
                          ربط بسجل موظف موجود
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {adminEmployeeLinkMode === "existing" ? (
                    <div className="space-y-1">
                      <Label>سجل الموظف المرتبط</Label>
                      <Select
                        value={String(adminForm.linkedEmployeeId || "")}
                        onValueChange={value =>
                          setAdminForm(previous => ({
                            ...previous,
                            linkedEmployeeId: value || null,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="اختر سجل موظف" />
                        </SelectTrigger>
                        <SelectContent>
                          {employeeDirectory.length ? (
                            employeeDirectory.map(employee => (
                              <SelectItem key={employee.id} value={employee.id}>
                                {employee.displayName}
                                {employee.email ? ` - ${employee.email}` : ""}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="__empty" disabled>
                              لا توجد سجلات موظفين متاحة
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Label>طريقة الإنشاء</Label>
                      <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                        سيتم إنشاء سجل موظف وربطه بحساب المستخدم عند الحفظ إذا وُجد حساب مطابق لهذا البريد.
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {adminForm.employeeProfileEnabled ? (
                <div className="rounded-[18px] border border-slate-200 bg-slate-50/80 p-4">
                  <div className="mb-3 text-xs font-semibold tracking-[0.12em] text-slate-500">
                    ملخص الربط
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-[14px] border border-white/80 bg-white px-3 py-3">
                      <div className="text-[11px] text-slate-500">مصدر الربط</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900 break-all">
                        {adminEmployeeLinkMode === "existing"
                          ? String(adminForm.linkedEmployeeId ? "سجل موظف مرتبط" : "سجل موظف غير محدد")
                          : "سجل موظف جديد مرتبط بالحساب"}
                      </div>
                    </div>

                    <div className="rounded-[14px] border border-white/80 bg-white px-3 py-3">
                      <div className="text-[11px] text-slate-500">الدور الحالي</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {getRoleDisplayLabel(adminForm.roleKey) || "موظف"}
                      </div>
                    </div>

                    <div className="rounded-[14px] border border-white/80 bg-white px-3 py-3">
                      <div className="text-[11px] text-slate-500">السجل المختار</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900 break-all">
                        {selectedEmployeeDirectoryEntry
                          ? `${selectedEmployeeDirectoryEntry.id}${selectedEmployeeDirectoryEntry.email
                            ? ` - ${selectedEmployeeDirectoryEntry.email}`
                            : ""
                          }`
                          : "لا يوجد سجل محدد"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs leading-6 text-slate-500">
                    هذا الربط ينشئ أو يربط ملف الموظف فقط، ولا يغيّر الدور الفعلي للحساب.
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label>ملاحظات (اختياري)</Label>
              <Textarea
                rows={3}
                value={adminForm.notes || ""}
                onChange={e =>
                  setAdminForm(p => ({ ...p, notes: e.target.value }))
                }
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الصلاحيات الفعلية</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {CENTRAL_PERMISSION_DEFINITIONS.map(perm => {
                    const checked = adminFormEffectivePermissions.includes(
                      perm.key as Permission
                    );
                    return (
                      <Button
                        key={`effective-${perm.key}`}
                        type="button"
                        variant={checked ? "default" : "outline"}
                        className={checked ? "bg-[#F2B705] text-black" : ""}
                        onClick={() =>
                          toggleAdminEffectivePermission(perm.key as Permission)
                        }
                      >
                        <div className="flex flex-col items-start leading-tight">
                          <span className="text-sm font-medium">
                            {perm.label}
                          </span>
                          <span className="text-[11px] opacity-70">
                            {perm.key}
                          </span>
                        </div>
                      </Button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  يتم العرض هنا بناءً على الصلاحيات الفعلية: صلاحيات الدور
                  الأساسية مع أي استثناءات محفوظة للحساب.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    الصلاحيات الافتراضية:{" "}
                    {getRoleDefaultPermissionKeys(adminForm.roleKey).length}
                  </Badge>
                  <Badge variant="secondary">
                    الفعلية: {adminFormEffectivePermissions.length}
                  </Badge>
                  <Badge variant="outline">
                    الاستثناءات: +
                    {adminFormPermissionOverrides.permissionsAllow.length} / -
                    {adminFormPermissionOverrides.permissionsDeny.length}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <Label>ملخص الاستثناءات</Label>
                <div className="flex flex-wrap gap-2 rounded-lg border border-dashed p-3 min-h-16">
                  {adminFormPermissionOverrides.permissionsAllow.map(
                    permissionKey => (
                      <Badge
                        key={`override-allow-${permissionKey}`}
                        variant="secondary"
                      >
                        + {getPermissionLabel(permissionKey)}
                      </Badge>
                    )
                  )}
                  {adminFormPermissionOverrides.permissionsDeny.map(
                    permissionKey => (
                      <Badge
                        key={`override-deny-${permissionKey}`}
                        variant="outline"
                      >
                        - {getPermissionLabel(permissionKey)}
                      </Badge>
                    )
                  )}
                  {adminFormPermissionOverrides.permissionsAllow.length === 0 &&
                    adminFormPermissionOverrides.permissionsDeny.length === 0 ? (
                    <span className="text-sm text-muted-foreground">
                      لا توجد تعديلات يدوية حالياً. الحساب يستخدم صلاحيات الدور
                      الافتراضية فقط.
                    </span>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetAdminPermissionOverrides}
                    disabled={
                      adminFormPermissionOverrides.permissionsAllow.length ===
                      0 &&
                      adminFormPermissionOverrides.permissionsDeny.length === 0
                    }
                  >
                    إعادة ضبط الاستثناءات
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setIsAdminDialogOpen(false)}
              >
                إلغاء
              </Button>
              <Button className="bg-[#F2B705]" onClick={handleSaveAdminUser}>
                {editingAdminId ? "حفظ التعديل" : "إنشاء"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout >
  );
}

/* =========================
 Small UI helpers
========================= */

function SettingsTabHero({
  eyebrow,
  title,
  description,
  stats,
  panel,
}: {
  eyebrow: string;
  title: string;
  description: string;
  stats: Array<{
    icon: LucideIcon;
    label: string;
    value: string;
    helper: string;
  }>;
  panel: ReactNode;
}) {
  return (
    <Card className="overflow-hidden border-slate-200/80 bg-[radial-gradient(circle_at_top_right,rgba(242,183,5,0.14),transparent_25%),linear-gradient(135deg,#ffffff_0%,#f8fafc_48%,#eef4ff_100%)] shadow-[0_28px_75px_-44px_rgba(15,23,42,0.35)]">
      <CardContent className="px-6 py-6 sm:px-8 sm:py-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)] xl:items-end">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full border border-[#F2B705]/30 bg-[#F2B705]/12 px-3 py-1 text-xs font-semibold text-[#8d6700] shadow-none">
                <Sparkles className="h-3.5 w-3.5" />
                {eyebrow}
              </Badge>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">
                {title}
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-slate-600">
                {description}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {stats.map(stat => (
                <SettingsOverviewStat
                  key={stat.label}
                  icon={stat.icon}
                  label={stat.label}
                  value={stat.value}
                  helper={stat.helper}
                />
              ))}
            </div>
          </div>

          {panel}
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsHeroPanel({
  status,
  title,
  description,
  metrics,
}: {
  status: string;
  title: string;
  description: string;
  metrics: Array<{
    label: string;
    value: string;
    helper: string;
  }>;
}) {
  return (
    <div className="rounded-[28px] border border-[#1e3358] bg-[linear-gradient(180deg,rgba(8,18,47,0.98),rgba(2,6,23,0.96))] p-6 text-white shadow-[0_28px_60px_-42px_rgba(2,6,23,0.85)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
            الجاهزية
          </p>
          <h3 className="mt-3 text-xl font-semibold tracking-tight">{title}</h3>
        </div>
        <Badge
          variant="outline"
          className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/80 shadow-none"
        >
          {status}
        </Badge>
      </div>

      <p className="mt-4 text-sm leading-7 text-white/60">{description}</p>

      <div className="mt-6 grid gap-3">
        {metrics.map(metric => (
          <SettingsSidebarMetric
            key={metric.label}
            label={metric.label}
            value={metric.value}
            helper={metric.helper}
          />
        ))}
      </div>
    </div>
  );
}

function SettingsOverviewStat({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.3)]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {label}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 text-slate-700">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-4 text-base font-semibold tracking-tight text-slate-950">
        {value}
      </div>
      <div className="mt-2 text-xs leading-6 text-slate-500">{helper}</div>
    </div>
  );
}

function SettingsSidebarMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-xs text-white/55">{label}</div>
      <div className="mt-2 text-sm font-semibold text-white/92">{value}</div>
      <div className="mt-1 text-xs text-white/50">{helper}</div>
    </div>
  );
}

function SettingsSectionCard({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
  className,
  headerClassName,
  contentClassName,
  children,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]",
        className
      )}
    >
      <CardHeader
        className={cn("border-b border-slate-100/80 pb-6", headerClassName)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-3 text-slate-700">
              <Icon className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                {eyebrow}
              </div>
              <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950">
                {title}
              </CardTitle>
              <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600">
                {description}
              </CardDescription>
            </div>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </CardHeader>
      <CardContent className={cn("pt-6", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}

function SettingsField({
  label,
  description,
  value,
  onChange,
  placeholder,
  helper,
  error,
  suffix,
  type = "text",
  textarea = false,
  rows = 3,
  dir,
  inputMode,
  className,
  containerClassName,
  inputClassName,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
  error?: string;
  suffix?: string;
  type?: string;
  textarea?: boolean;
  rows?: number;
  dir?: "ltr" | "rtl";
  inputMode?: ComponentProps<"input">["inputMode"];
  className?: string;
  containerClassName?: string;
  inputClassName?: string;
}) {
  const hasValue = String(value || "").trim().length > 0;
  const statusTone = error
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : hasValue
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-slate-200 bg-slate-50 text-slate-500";

  const sharedControlClassName = cn(
    "rounded-xl border-slate-200 bg-white/90 px-4 text-sm shadow-none transition hover:border-slate-300 focus-visible:ring-slate-300/60",
    error && "border-rose-300 bg-rose-50/60 focus-visible:ring-rose-200",
    hasValue && !error && "border-emerald-300/80 bg-emerald-50/30",
    inputClassName,
    className
  );

  return (
    <div className={cn("space-y-3", containerClassName)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Label className="text-[13px] font-semibold text-slate-900">
            {label}
          </Label>
          <p className="text-xs leading-6 text-slate-500">{description}</p>
        </div>
        <div
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
            statusTone
          )}
        >
          {error ? "يحتاج مراجعة" : hasValue ? "مكتمل" : "بانتظار الإدخال"}
        </div>
      </div>

      {textarea ? (
        <Textarea
          rows={rows}
          dir={dir}
          value={value}
          aria-invalid={!!error}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          className={cn("min-h-[108px] py-3 leading-7", sharedControlClassName)}
        />
      ) : suffix ? (
        <InputGroup className="h-12 rounded-xl border-slate-200 bg-white/90 shadow-none">
          <InputGroupInput
            type={type}
            dir={dir}
            value={value}
            inputMode={inputMode}
            aria-invalid={!!error}
            placeholder={placeholder}
            onChange={e => onChange(e.target.value)}
            className={cn("h-full px-4", sharedControlClassName)}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText className="text-xs font-semibold text-slate-500">
              {suffix}
            </InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      ) : (
        <Input
          type={type}
          dir={dir}
          value={value}
          inputMode={inputMode}
          aria-invalid={!!error}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          className={cn("h-12", sharedControlClassName)}
        />
      )}

      <p
        className={cn(
          "text-xs leading-6",
          error ? "text-rose-600" : "text-slate-500"
        )}
      >
        {error || helper || " "}
      </p>
    </div>
  );
}

function SettingsSelectField({
  label,
  description,
  children,
  containerClassName,
}: {
  label: string;
  description: string;
  children: ReactNode;
  containerClassName?: string;
}) {
  return (
    <div className={cn("space-y-3", containerClassName)}>
      <div className="space-y-1">
        <Label className="text-[13px] font-semibold text-slate-900">
          {label}
        </Label>
        <p className="text-xs leading-6 text-slate-500">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      dir="rtl"
      className={cn(
        "flex items-start justify-between gap-3 rounded-[20px] border px-4 py-3.5 text-right transition-colors",
        value
          ? "border-emerald-200 bg-emerald-50/70"
          : "border-slate-200 bg-slate-50/70"
      )}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center justify-start gap-2">
          <span className="font-semibold text-slate-900">{label}</span>
          <Badge
            variant="outline"
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-none",
              value
                ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                : "border-slate-200 bg-white text-slate-500"
            )}
          >
            {value ? "مفعّل" : "معطّل"}
          </Badge>
        </div>
        {description ? (
          <p className="text-sm leading-6 text-slate-600">
            {description}
          </p>
        ) : null}
      </div>

      <div className="shrink-0 pt-0.5">
        <Switch
          checked={value}
          onCheckedChange={onChange}
          aria-label={label}
          className="h-5 w-9 data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-300"
        />
      </div>
    </div>
  );
}

function LabelsEditor({
  title,
  data,
  onChange,
}: {
  title: string;
  data: Record<string, { ar: string; en?: string }>;
  onChange: (next: Record<string, { ar: string; en?: string }>) => void;
}) {
  const rows = Object.entries(data || {});

  const addRow = () => {
    const key = `new_${Date.now()}`;
    onChange({
      ...data,
      [key]: { ar: "جديد", en: "New" },
    });
  };

  const removeRow = (k: string) => {
    const next = { ...data };
    delete next[k];
    onChange(next);
  };

  const updateRow = (k: string, field: "ar" | "en", v: string) => {
    onChange({
      ...data,
      [k]: {
        ...data[k],
        [field]: v,
      },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold tracking-tight text-slate-950">
          {title}
        </h3>
        <Button variant="outline" onClick={addRow}>
          <Plus className="w-4 h-4 ml-2" /> إضافة
        </Button>
      </div>

      <div className="grid gap-3">
        {rows.map(([k, val]) => (
          <div
            key={k}
            className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-4 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.2)]"
          >
            <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)_auto] lg:items-end">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  المفتاح
                </Label>
                <Input
                  value={k}
                  readOnly
                  className="h-11 rounded-xl border-slate-200 bg-white text-slate-600 shadow-none"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-[13px] font-semibold text-slate-900">
                    عربي
                  </Label>
                  <Input
                    value={val.ar || ""}
                    onChange={e => updateRow(k, "ar", e.target.value)}
                    className="h-11 rounded-xl border-slate-200 bg-white shadow-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px] font-semibold text-slate-900">
                    إنجليزي
                  </Label>
                  <Input
                    value={val.en || ""}
                    onChange={e => updateRow(k, "en", e.target.value)}
                    dir="ltr"
                    className="h-11 rounded-xl border-slate-200 bg-white text-left shadow-none"
                  />
                </div>
              </div>

              <Button
                variant="destructive"
                onClick={() => removeRow(k)}
                className="lg:self-end"
              >
                <Trash2 className="w-4 h-4 ml-2" /> حذف
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
