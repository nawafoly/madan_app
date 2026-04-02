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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardFooter,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  FileUp,
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
  Save,
  Sparkles,
  ServerCog,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import { db } from "@/_core/firebase";
import {
  formatDateTimeEN,
  formatFileSizeEN,
  formatNumberEN,
} from "@/lib/formatters";
import { getRoleDisplayLabel } from "@/lib/ownerAccounts";
import { cn } from "@/lib/utils";
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
  getEffectivePermissions,
  ROLE_DEFAULT_PERMS,
  type Permission,
} from "@/_core/hooks/useAuth";

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
  id: string;
  displayName: string;
  email: string;
  roleKey: string;
  title?: string;
  isActive: boolean;
  linkedUserUid?: string;
  notes?: string;

  // ✅ Flexible per-user overrides
  permissionsAllow?: string[];
  permissionsDeny?: string[];

  createdAt?: any;
  updatedAt?: any;
};

// ✅ NEW: invite/promote by email (no UID)
type RoleInviteDoc = {
  id: string; // doc id = email lower
  email: string;
  roleKey: string; // owner/admin/accountant/staff
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
    value: "Cloudflare D1",
    subtitle: "maedin-documents",
    icon: Database,
    valueDir: "ltr",
    status: "not_ready",
    statusLabel: "غير مهيأ",
  },
  {
    key: "r2",
    title: "التخزين",
    value: "Cloudflare R2",
    subtitle: "maedin-storage",
    icon: HardDrive,
    valueDir: "ltr",
    status: "not_ready",
    statusLabel: "غير مهيأ",
  },
  {
    key: "worker",
    title: "خدمة الرفع",
    value: "Cloudflare Workers",
    subtitle: "upload.maedin.workers.dev",
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
    title: "عدد سجلات D1",
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
    description: "واجهة لتصفح الملفات الفعلية المخزنة في R2.",
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
    description: "إعداد تصدير إداري لبيانات D1 والملفات المرتبطة.",
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
    description: "مراجعة الملفات غير المرتبطة بسجلات D1 قبل الحذف.",
    icon: Trash2,
  },
];

const DATABASE_TECHNICAL_DETAILS: DatabaseDetailRow[] = [
  { label: "Database", value: "maedin-documents", valueDir: "ltr" },
  { label: "Bucket", value: "maedin-storage", valueDir: "ltr" },
  { label: "Worker", value: "upload.maedin.workers.dev", valueDir: "ltr" },
  { label: "Provider", value: "Cloudflare", valueDir: "ltr" },
  { label: "Environment", value: "Production", valueDir: "ltr" },
];

const DATABASE_NOTES = [
  "Firebase لا يستخدم لهذا القسم.",
  "هذا التبويب يعتمد على Cloudflare فقط.",
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
  if (source === "r2") return "من R2";
  if (source === "d1") return "من D1";
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
      return "استجابة مباشرة من الـ Worker.";
    case "d1_metadata_aggregated":
      return "تمت قراءة إحصاءات file_metadata.";
    case "r2_objects_aggregated":
      return "تم عدّ كائنات R2 الفعلية.";
    case "worker_unavailable":
      return "يتطلب نجاح الوصول إلى الـ Worker أولًا.";
    case "Missing VITE_R2_UPLOAD_WORKER_URL":
      return "رابط Cloudflare Worker غير مهيأ في البيئة.";
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
  "staff",
  "client",
  "guest",
];

type AppRoleKey =
  | "owner"
  | "admin"
  | "accountant"
  | "staff"
  | "client"
  | "guest";

const ADMIN_ROLE_KEYS = ["owner", "admin", "accountant", "staff"] as const;
type AdminRoleKey = (typeof ADMIN_ROLE_KEYS)[number];

const ADMIN_ROLE_LABELS: Record<AdminRoleKey, string> = {
  owner: "المالك",
  admin: "أدمن",
  accountant: "محاسب",
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
  return ALL_PERMISSION_KEYS.includes(permissionKey as Permission);
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
    permissionsAllow: Array.from(allowSet),
    permissionsDeny: Array.from(denySet),
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

  for (const permissionKey of ALL_PERMISSION_KEYS) {
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

  const [security, setSecurity] = useState<SecuritySettings>({
    twoFactor: false,
  });

  // NEW: roles / admin users / labels / flags / content
  const [roles, setRoles] = useState<RoleDoc[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUserDoc[]>([]);

  // ✅ NEW: role invites
  const [promoteEmail, setPromoteEmail] = useState("");
  const [promoteRoleKey, setPromoteRoleKey] =
    useState<AdminRoleKey>("accountant");
  const [promoting, setPromoting] = useState(false);
  const [roleInvites, setRoleInvites] = useState<RoleInviteDoc[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleKey, setInviteRoleKey] =
    useState<AdminRoleKey>("accountant");
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
      staff: { ar: "موظف", en: "Staff" },
      client: { ar: "عميل", en: "Client" },
      guest: { ar: "زائر", en: "Guest" },
    },
  });

  const [flags, setFlags] = useState<FlagsSettings>({
    disableInvestments: false,
    disableMessages: false,
    vipOnlyMode: false,
    hideVipProjects: false,
    maintenanceMode: false,
  });

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
  const [adminForm, setAdminForm] = useState<Omit<AdminUserDoc, "id">>({
    displayName: "",
    email: "",
    roleKey: "staff",
    title: "",
    isActive: true,
    linkedUserUid: "",
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
  const securityEnabledCount = Object.values(security).filter(Boolean).length;
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
  const enabledFlagsCount = Object.values(flags).filter(Boolean).length;
  const contentCompletedCount = Object.values(content).filter(value =>
    String(value || "").trim()
  ).length;

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
      ] = await Promise.all([
        getDoc(doc(db, "settings", "app")),
        getDoc(doc(db, "settings", "notifications")),
        getDoc(doc(db, "settings", "security")),
        getDoc(doc(db, "settings", "labels")),
        getDoc(doc(db, "settings", "roles")),
        getDoc(doc(db, "settings", "flags")),
        getDoc(doc(db, "settings", "content")),
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
      if (notifSnap.exists()) setNotifications(notifSnap.data() as any);
      if (secSnap.exists()) setSecurity(secSnap.data() as any);

      if (labelsSnap.exists()) {
        const d = labelsSnap.data() as any;
        setLabels(prev => ({
          ...prev,
          ...(d || {}),
          projectTypes: d?.projectTypes ?? prev.projectTypes,
          projectStatuses: d?.projectStatuses ?? prev.projectStatuses,
          investmentStatuses: d?.investmentStatuses ?? prev.investmentStatuses,
          uiRoles: d?.uiRoles ?? prev.uiRoles,
        }));
      }

      if (rolesSnap.exists()) {
        const d = rolesSnap.data() as any;
        if (Array.isArray(d?.roles)) setRoles(d.roles);
      }

      if (flagsSnap.exists()) {
        const d = flagsSnap.data() as any;
        setFlags(prev => ({
          ...prev,
          ...d,
        }));
      }

      if (contentSnap.exists()) {
        const d = contentSnap.data() as any;
        setContent(prev => ({
          ...prev,
          ...d,
        }));
      }
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
        toast.error("تعذر فحص الخدمات لأن رابط الـ Worker غير مهيأ");
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
        toast.success("Contract list refreshed.");
      }
    } catch (error) {
      console.error("contract export candidates failed:", error);
      const message =
        error instanceof Error ? error.message : "Failed to load contracts.";
      setContractExportError(message);
      if (manual) {
        toast.error("Failed to refresh contract list.");
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
      await persistSettingsDoc(
        "notifications",
        notifications as unknown as Record<string, unknown>,
        "Updated notification settings"
      );
      toast.success("تم حفظ إعدادات الإشعارات");
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ إعدادات الإشعارات");
    }
  };

  const saveSecurity = async () => {
    try {
      await persistSettingsDoc(
        "security",
        security as unknown as Record<string, unknown>,
        "Updated security settings"
      );
      toast.success("تم حفظ إعدادات الأمان");
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ إعدادات الأمان");
    }
  };

  const saveLabels = async () => {
    try {
      await persistSettingsDoc(
        "labels",
        labels as unknown as Record<string, unknown>,
        "Updated labels settings"
      );
      toast.success("تم حفظ المسميات");
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ المسميات");
    }
  };

  const saveFlags = async () => {
    try {
      await persistSettingsDoc(
        "flags",
        flags as unknown as Record<string, unknown>,
        "Updated feature flags"
      );
      toast.success("تم حفظ Feature Flags");
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ Feature Flags");
    }
  };

  const saveContent = async () => {
    try {
      await persistSettingsDoc(
        "content",
        content as unknown as Record<string, unknown>,
        "Updated site content settings"
      );
      toast.success("تم حفظ محتوى الموقع");
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ محتوى الموقع");
    }
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

    if (!key) return toast.error("Role Key مطلوب");
    if (!/^[a-z0-9_]+$/i.test(key))
      return toast.error("Role Key يجب أن يكون حروف/أرقام/_ فقط");
    if (!nameAr) return toast.error("اسم الدور (عربي) مطلوب");

    try {
      const exists = roles.some(r => r.key === key);
      if (!editingRoleKey && exists)
        return toast.error("Role Key موجود مسبقًا");

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
      return toast.error("لا يمكن حذف Role أساسي");
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

  const buildAdminUserPayload = ({
    displayName,
    email,
    roleKey,
    title,
    isActive,
    notes,
    permissionsAllow,
    permissionsDeny,
  }: {
    displayName: string;
    email: string;
    roleKey: AdminRoleKey;
    title: string;
    isActive: boolean;
    notes: string;
    permissionsAllow: Permission[];
    permissionsDeny: Permission[];
  }) => ({
    displayName,
    email,
    roleKey,
    title: title || "",
    isActive,
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
    permissionsAllow,
    permissionsDeny,
  }: {
    displayName: string;
    email: string;
    roleKey: AdminRoleKey;
    title: string;
    isActive: boolean;
    permissionsAllow: Permission[];
    permissionsDeny: Permission[];
  }) => ({
    email,
    role: roleKey,
    displayName: displayName || null,
    name: displayName || null,
    title: title || null,
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
    setAdminForm({
      displayName: "",
      email: "",
      roleKey: "staff",
      title: "",
      isActive: true,
      linkedUserUid: "",
      notes: "",
      permissionsAllow: [],
      permissionsDeny: [],
    });
    setIsAdminDialogOpen(true);
  };

  const openEditAdmin = (u: AdminUserDoc) => {
    setEditingAdminId((u.email || "").trim().toLowerCase());
    setAdminForm({
      displayName: String(u.displayName || "").trim(),
      email: u.email || "",
      roleKey: normalizeAdminRoleKey(u.roleKey),
      title: String(u.title || "").trim(),
      isActive: !!u.isActive,
      linkedUserUid: String(u.linkedUserUid || "").trim(),
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

    try {
      // ✅ ALWAYS upsert by emailLower (docId = email)
      const linkedUserDocs = await resolveLinkedUserDocs(
        email,
        adminForm.linkedUserUid
      );
      const linkedUserDoc = linkedUserDocs[0] || null;
      const linkedUserUid = linkedUserDoc?.id || null;
      await auditedSetDoc({
        ref: doc(db, "admin_users", email),
        data: {
          ...buildAdminUserPayload({
            displayName,
            email,
            roleKey,
            title,
            isActive: adminForm.isActive,
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
            role: "client",
            permissionsAllow: [],
            permissionsDeny: [],
            active: true,
            title: null,
            updatedAt: serverTimestamp(),
          },
          options: { merge: true },
          action: AUDIT_ACTIONS.USER_ROLE_UPDATED,
          category: "user",
          entityType: "user",
          entityId: linkedUserDoc.id,
          source: settingsSource("delete_admin_user_users_sync"),
          relatedIds: { userId: linkedUserDoc.id },
          message: `Demoted primary user ${linkedUserDoc.id} to client after removing admin record`,
          meta: {
            targetUserEmail: id,
            roleKey: "client",
          },
          ignoreFields: ["updatedAt"],
        });
      }

      toast.success(
        linkedUserDocs.length
          ? "تم حذف الحساب الإداري وإرجاع المستخدم إلى عميل"
          : "تم حذف الحساب الإداري"
      );
    } catch (e) {
      console.error(e);
      toast.error("فشل حذف الحساب");
    }
  };

  /* =========================
     Role Invites (Promote by Email)
  ========================= */

  const promoteExistingUserByEmail = async () => {
    const email = promoteEmail.trim().toLowerCase();
    const roleKey = promoteRoleKey;

    if (!email || !email.includes("@")) return toast.error("البريد غير صحيح");
    if (!roleKey) return toast.error("اختر الدور");

    setPromoting(true);
    try {
      // ✅ ابحث عن المستخدم في users حسب email
      const q = query(
        collection(db, "users"),
        where("email", "==", email),
        limit(1)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        toast.error(
          "هذا الإيميل ما له حساب مسجل (لا يوجد users doc). خليّه يسوي تسجيل مرة واحدة ثم رقّيه."
        );
        return;
      }

      const userDoc = snap.docs[0];
      const userData = userDoc.data() as any;
      const beforeAdminSnap = await getDoc(doc(db, "admin_users", email));
      const beforeAdminData = beforeAdminSnap.exists()
        ? beforeAdminSnap.data()
        : null;
      const { permissionsAllow, permissionsDeny } =
        normalizePermissionOverrides(
          beforeAdminData?.permissionsAllow || [],
          beforeAdminData?.permissionsDeny || []
        );
      const effectivePermissions = getEffectivePermissionKeys(
        roleKey,
        permissionsAllow,
        permissionsDeny
      );

      // ✅ (1) تحديث role داخل users
      const displayName = String(
        beforeAdminData?.displayName ||
          userData?.displayName ||
          userData?.name ||
          email.split("@")[0]
      ).trim();
      const title = String(
        beforeAdminData?.title || userData?.title || ""
      ).trim();
      const notes = String(beforeAdminData?.notes || "").trim();
      const isActive = beforeAdminData?.isActive !== false;
      await updateDoc(doc(db, "users", userDoc.id), {
        role: roleKey,
        active: isActive,
        displayName: displayName || null,
        name: displayName || null,
        title: title || null,
        permissionsAllow,
        permissionsDeny,
        updatedAt: serverTimestamp(),
      });

      // ✅ (2) إنشاء/تحديث سجل داخل admin_users عشان يظهر في قسم حسابات الإدارة
      // نخلي docId = email (أسهل تعديل لاحقًا)
      await setDoc(
        doc(db, "admin_users", email),
        {
          displayName: displayName || "",
          email,
          roleKey, // نفس المفتاح اللي تستخدمه في الواجهة
          title,
          isActive,
          linkedUserUid: userDoc.id,
          notes,
          permissionsAllow,
          permissionsDeny,
          updatedAt: serverTimestamp(),
          createdAt: userData?.createdAt ?? serverTimestamp(),
        },
        { merge: true }
      );

      const refreshedUserSnap = await getDoc(doc(db, "users", userDoc.id));
      const refreshedAdminSnap = await getDoc(doc(db, "admin_users", email));
      await logAuditEvent({
        action: AUDIT_ACTIONS.USER_ROLE_UPDATED,
        category: "user",
        entityType: "user",
        entityId: userDoc.id,
        entityPath: `users/${userDoc.id}`,
        source: settingsSource("promote_existing_user"),
        relatedIds: { userId: userDoc.id },
        message: `Promoted user ${email} to ${getRoleDisplayLabel(roleKey) || roleKey}`,
        changes: diffAuditTargets([
          {
            label: "user",
            before: userData,
            after: refreshedUserSnap.exists() ? refreshedUserSnap.data() : null,
          },
          {
            label: "admin_user",
            before: beforeAdminData,
            after: refreshedAdminSnap.exists()
              ? refreshedAdminSnap.data()
              : null,
          },
        ]),
        meta: {
          roleKey,
          permissionsAllow,
          permissionsDeny,
          effectivePermissions,
          targetUserEmail: email,
        },
      });

      toast.success(
        `تمت الترقية + إضافته لحسابات الإدارة: ${email} → ${getRoleDisplayLabel(roleKey) || roleKey}`
      );
      setPromoteEmail("");
      setPromoteRoleKey("accountant");
    } catch (e) {
      console.error(e);
      toast.error("فشل ترقية المستخدم");
    } finally {
      setPromoting(false);
    }
  };

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
      setInviteRoleKey("accountant");
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
    toast.success("تم تصدير ملف الإعدادات JSON");
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
      toast.error("Please select at least one contract.");
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
      toast.error("Please select at least one contract.");
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
          ? "المرجع: maedin-documents"
          : card.key === "r2"
            ? "المرجع: maedin-storage"
            : "المرجع: upload.maedin.workers.dev";

      return {
        ...card,
        subtitle:
          card.key === "worker" && databaseWorkerUrl
            ? databaseWorkerUrl
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
          : "جارٍ تنفيذ أول فحص لخدمات Cloudflare."
    );
    return notes;
  }, [databaseDashboard.checkedAt, databaseLoaded]);

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
        "متابعة حسابات الإدارة، الدعوات، وربطها بالأدوار من لوحة موحدة تشبه أنظمة SaaS الحديثة.",
      labels:
        "توحيد مسميات النظام والقوائم المرجعية ضمن محررات منظمة وسهلة القراءة والتحديث.",
      flags:
        "التحكم في Feature Flags وتجارب الإطلاق التدريجي من تبويب موحد ومتسق مع بقية الإعدادات.",
      content:
        "إدارة محتوى الموقع التشغيلي والتسويقي من وحدات واضحة تحافظ على نفس جودة تجربة الإعدادات.",
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
                      label: "عربي / English",
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

  const headerBadgeToneClassName = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    neutral: "border-slate-200 bg-white text-slate-600",
    info: "border-sky-200 bg-sky-50 text-sky-700",
  } as const;

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
      <div className="container space-y-8 py-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Badge className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600 shadow-none">
              Platform Control Center
            </Badge>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                الإعدادات
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-slate-600">
                {activeTabDescription}
              </p>
            </div>
            {error ? (
              <p className="text-sm font-medium text-red-600">{error}</p>
            ) : null}
          </div>

          {activeTabHeaderBadges.length ? (
            <div className="flex flex-wrap gap-2">
              {activeTabHeaderBadges.map(badge => (
                <Badge
                  key={badge.label}
                  variant="outline"
                  className={cn(
                    "rounded-full px-3 py-1 text-sm font-medium",
                    headerBadgeToneClassName[badge.tone]
                  )}
                >
                  {badge.label}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-6"
        >
          <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto rounded-[22px] border border-slate-200/80 bg-white/90 p-2 shadow-[0_18px_45px_-34px_rgba(15,23,42,0.35)] backdrop-blur flex-nowrap whitespace-nowrap">
            <TabsTrigger
              value="general"
              className="shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-slate-600 data-[state=active]:border-slate-950 data-[state=active]:bg-slate-950 data-[state=active]:text-white"
            >
              <SettingsIcon className="w-4 h-4 ml-2" /> عام
            </TabsTrigger>

            <TabsTrigger
              value="notifications"
              className="shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-slate-600 data-[state=active]:border-slate-950 data-[state=active]:bg-slate-950 data-[state=active]:text-white"
            >
              <Bell className="w-4 h-4 ml-2" /> الإشعارات
            </TabsTrigger>

            <TabsTrigger
              value="security"
              className="shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-slate-600 data-[state=active]:border-slate-950 data-[state=active]:bg-slate-950 data-[state=active]:text-white"
            >
              <Shield className="w-4 h-4 ml-2" /> الأمان
            </TabsTrigger>

            <TabsTrigger
              value="roles"
              className="shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-slate-600 data-[state=active]:border-slate-950 data-[state=active]:bg-slate-950 data-[state=active]:text-white"
            >
              <KeyRound className="w-4 h-4 ml-2" /> الأدوار والصلاحيات
            </TabsTrigger>

            <TabsTrigger
              value="admins"
              className="shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-slate-600 data-[state=active]:border-slate-950 data-[state=active]:bg-slate-950 data-[state=active]:text-white"
            >
              <Users className="w-4 h-4 ml-2" /> حسابات الإدارة
            </TabsTrigger>

            <TabsTrigger
              value="labels"
              className="shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-slate-600 data-[state=active]:border-slate-950 data-[state=active]:bg-slate-950 data-[state=active]:text-white"
            >
              <Tags className="w-4 h-4 ml-2" /> المسميات
            </TabsTrigger>

            <TabsTrigger
              value="flags"
              className="shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-slate-600 data-[state=active]:border-slate-950 data-[state=active]:bg-slate-950 data-[state=active]:text-white"
            >
              <SlidersHorizontal className="w-4 h-4 ml-2" /> Feature Flags
            </TabsTrigger>

            <TabsTrigger
              value="content"
              className="shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-slate-600 data-[state=active]:border-slate-950 data-[state=active]:bg-slate-950 data-[state=active]:text-white"
            >
              <Type className="w-4 h-4 ml-2" /> محتوى الموقع
            </TabsTrigger>

            <TabsTrigger
              value="backup"
              className="shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-slate-600 data-[state=active]:border-slate-950 data-[state=active]:bg-slate-950 data-[state=active]:text-white"
            >
              <FileDown className="w-4 h-4 ml-2" /> Backup
            </TabsTrigger>

            <TabsTrigger
              value="database"
              className="shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-slate-600 data-[state=active]:border-slate-950 data-[state=active]:bg-slate-950 data-[state=active]:text-white"
            >
              <Database className="w-4 h-4 ml-2" /> قاعدة البيانات
            </TabsTrigger>
          </TabsList>

          {/* =========================
              General
          ========================= */}
          <TabsContent value="general" className="space-y-6">
            <Card className="overflow-hidden border-slate-200/80 bg-[radial-gradient(circle_at_top_right,rgba(242,183,5,0.14),transparent_25%),linear-gradient(135deg,#ffffff_0%,#f8fafc_48%,#eef4ff_100%)] shadow-[0_28px_75px_-44px_rgba(15,23,42,0.35)]">
              <CardContent className="px-6 py-6 sm:px-8 sm:py-8">
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)] xl:items-end">
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="rounded-full border border-[#F2B705]/30 bg-[#F2B705]/12 px-3 py-1 text-xs font-semibold text-[#8d6700] shadow-none">
                        <Sparkles className="h-3.5 w-3.5" />
                        Settings Experience
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-semibold shadow-none",
                          appDirty
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        )}
                      >
                        {appDirty
                          ? `${formatNumberEN(changedAppFields.length)} تغييرات قيد المراجعة`
                          : "جميع القيم متزامنة"}
                      </Badge>
                    </div>

                    <div className="space-y-3">
                      <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">
                        إعدادات المنصة الأساسية
                      </h2>
                      <p className="max-w-2xl text-sm leading-7 text-slate-600">
                        لوحة تحكم مقسمة إلى وحدات واضحة للهوية، التواصل، سياسات
                        الاستثمار، والإعدادات المالية الافتراضية.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <SettingsOverviewStat
                        icon={Building2}
                        label="Platform"
                        value={app.name || "غير محدد"}
                        helper="هوية المنصة في النظام"
                      />
                      <SettingsOverviewStat
                        icon={Landmark}
                        label="Investment Window"
                        value={investmentRangePreview}
                        helper="النطاق المرجعي للاستثمار"
                      />
                      <SettingsOverviewStat
                        icon={TrendingUp}
                        label="Return Profile"
                        value={returnProfilePreview}
                        helper="العائد والمدة الافتراضية"
                      />
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-[#1e3358] bg-[linear-gradient(180deg,rgba(8,18,47,0.98),rgba(2,6,23,0.96))] p-6 text-white shadow-[0_28px_60px_-42px_rgba(2,6,23,0.85)]">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
                          Readiness
                        </p>
                        <h3 className="mt-3 text-xl font-semibold tracking-tight">
                          جاهزية الإعدادات
                        </h3>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full border px-3 py-1 text-[11px] font-semibold shadow-none",
                          appValidation.isValid
                            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                            : "border-amber-400/30 bg-amber-400/10 text-amber-200"
                        )}
                      >
                        {appValidation.isValid ? "Stable" : "Needs Review"}
                      </Badge>
                    </div>

                    <div className="mt-6 grid gap-3">
                      <SettingsSidebarMetric
                        label="الحقول المكتملة"
                        value={`${formatNumberEN(appValidation.completedFields)}/${formatNumberEN(APP_SETTINGS_KEYS.length)}`}
                        helper="مستوى اكتمال الإعدادات الأساسية"
                      />
                      <SettingsSidebarMetric
                        label="التواصل الرسمي"
                        value={app.email || "غير محدد"}
                        helper={app.phone || "أضف رقم خدمة عملاء رسمي"}
                      />
                      <SettingsSidebarMetric
                        label="المراجعات المطلوبة"
                        value={
                          appIssues.length === 0
                            ? "لا توجد ملاحظات حرجة"
                            : `${formatNumberEN(appIssues.length)} ملاحظات`
                        }
                        helper="نفس الحقول ستُحفظ إلى settings/app"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-6">
                <SettingsSectionCard
                  icon={Building2}
                  eyebrow="Module 01"
                  title="Platform Info"
                  description="الهوية الأساسية للمنصة كما تظهر داخليًا وفي الواجهات الرسمية."
                >
                  <div className="grid gap-5 md:grid-cols-2">
                    <SettingsField
                      label="اسم المنصة"
                      description="الاسم الرسمي المستخدم في التقارير والواجهات."
                      placeholder="مثال: Maedin Capital"
                      value={app.name}
                      onChange={v => setApp({ ...app, name: v })}
                      error={
                        shouldShowAppFieldFeedback("name")
                          ? appValidation.errors.name
                          : undefined
                      }
                    />
                    <SettingsField
                      label="العنوان"
                      description="عنوان مختصر للمقر أو الجهة التشغيلية."
                      placeholder="الرياض، المملكة العربية السعودية"
                      value={app.address}
                      onChange={v => setApp({ ...app, address: v })}
                      textarea
                      rows={4}
                      containerClassName="md:col-span-2"
                      className="min-h-[124px]"
                      error={
                        shouldShowAppFieldFeedback("address")
                          ? appValidation.errors.address
                          : undefined
                      }
                    />
                  </div>
                </SettingsSectionCard>

                <SettingsSectionCard
                  icon={Mail}
                  eyebrow="Module 02"
                  title="Contact Details"
                  description="بيانات التواصل الرسمية التي يعتمد عليها المستخدمون والإدارة."
                >
                  <div className="grid gap-5 md:grid-cols-2">
                    <SettingsField
                      label="البريد الإلكتروني"
                      description="البريد المعتمد للدعم والتواصل الرسمي."
                      placeholder="support@maedin.sa"
                      value={app.email}
                      onChange={v => setApp({ ...app, email: v })}
                      type="email"
                      dir="ltr"
                      inputClassName="text-left"
                      error={
                        shouldShowAppFieldFeedback("email")
                          ? appValidation.errors.email
                          : undefined
                      }
                    />
                    <SettingsField
                      label="رقم الهاتف"
                      description="رقم خدمة العملاء أو خط الدعم الأساسي."
                      placeholder="+966 5X XXX XXXX"
                      value={app.phone}
                      onChange={v => setApp({ ...app, phone: v })}
                      dir="ltr"
                      inputClassName="text-left"
                      error={
                        shouldShowAppFieldFeedback("phone")
                          ? appValidation.errors.phone
                          : undefined
                      }
                    />
                  </div>
                </SettingsSectionCard>

                <SettingsSectionCard
                  icon={Landmark}
                  eyebrow="Module 03"
                  title="Investment Rules"
                  description="الحدود التشغيلية الافتراضية لطلبات الاستثمار الجديدة."
                >
                  <div className="grid gap-5 md:grid-cols-2">
                    <SettingsField
                      label="الحد الأدنى للاستثمار"
                      description="أقل قيمة مسموحة لبدء طلب استثماري."
                      placeholder="50000"
                      value={app.minInvestment}
                      onChange={v => setApp({ ...app, minInvestment: v })}
                      suffix="ر.س"
                      inputMode="decimal"
                      dir="ltr"
                      inputClassName="text-right font-semibold tabular-nums"
                      helper={
                        appValidation.minInvestmentValue !== null
                          ? `القيمة الحالية: ${formatNumberEN(appValidation.minInvestmentValue)} ر.س`
                          : "اكتب الرقم بدون نصوص إضافية."
                      }
                      error={
                        shouldShowAppFieldFeedback("minInvestment")
                          ? appValidation.errors.minInvestment
                          : undefined
                      }
                    />
                    <SettingsField
                      label="الحد الأعلى للاستثمار"
                      description="السقف الافتراضي لكل استثمار داخل المنصة."
                      placeholder="500000"
                      value={app.maxInvestment}
                      onChange={v => setApp({ ...app, maxInvestment: v })}
                      suffix="ر.س"
                      inputMode="decimal"
                      dir="ltr"
                      inputClassName="text-right font-semibold tabular-nums"
                      helper={
                        appValidation.maxInvestmentValue !== null
                          ? `القيمة الحالية: ${formatNumberEN(appValidation.maxInvestmentValue)} ر.س`
                          : "اكتب الرقم بدون نصوص إضافية."
                      }
                      error={
                        shouldShowAppFieldFeedback("maxInvestment")
                          ? appValidation.errors.maxInvestment
                          : undefined
                      }
                    />
                  </div>
                </SettingsSectionCard>

                <SettingsSectionCard
                  icon={TrendingUp}
                  eyebrow="Module 04"
                  title="Financial Defaults"
                  description="العائد والمدة المرجعية للمشاريع والاستثمارات الجديدة."
                >
                  <div className="grid gap-5 md:grid-cols-2">
                    <SettingsField
                      label="العائد الافتراضي"
                      description="نسبة عائد مرجعية قبل تخصيص كل مشروع."
                      placeholder="12"
                      value={app.defaultReturn}
                      onChange={v => setApp({ ...app, defaultReturn: v })}
                      suffix="%"
                      inputMode="decimal"
                      dir="ltr"
                      inputClassName="text-right font-semibold tabular-nums"
                      helper={
                        appValidation.defaultReturnValue !== null
                          ? `المعدل الحالي: ${formatNumberEN(appValidation.defaultReturnValue)}%`
                          : "أدخل نسبة مرجعية للمشاريع الجديدة."
                      }
                      error={
                        shouldShowAppFieldFeedback("defaultReturn")
                          ? appValidation.errors.defaultReturn
                          : undefined
                      }
                    />
                    <SettingsField
                      label="الأفق الافتراضي"
                      description="المدة الأساسية للاستثمار قبل التخصيص."
                      placeholder="3"
                      value={app.defaultHorizonYears}
                      onChange={v => setApp({ ...app, defaultHorizonYears: v })}
                      suffix="سنة"
                      inputMode="decimal"
                      dir="ltr"
                      inputClassName="text-right font-semibold tabular-nums"
                      helper={
                        appValidation.defaultHorizonValue !== null
                          ? `المدة الحالية: ${formatNumberEN(appValidation.defaultHorizonValue)} سنة`
                          : "استخدم رقمًا يمثل عدد السنوات."
                      }
                      error={
                        shouldShowAppFieldFeedback("defaultHorizonYears")
                          ? appValidation.errors.defaultHorizonYears
                          : undefined
                      }
                    />
                  </div>
                </SettingsSectionCard>
              </div>

              <div className="space-y-4 xl:sticky xl:top-24 self-start">
                <SettingsSavePanel
                  appDirty={appDirty}
                  savingApp={savingApp}
                  appIssues={appIssues}
                  changedFields={changedAppFields}
                  onReset={resetAppChanges}
                  onSave={saveApp}
                />

                <Alert className="border-slate-200/80 bg-white shadow-[0_16px_40px_-34px_rgba(15,23,42,0.25)]">
                  <Sparkles className="h-4 w-4" />
                  <AlertTitle>بدون تغيير في المنطق</AlertTitle>
                  <AlertDescription className="leading-7">
                    الحفظ ما زال يستخدم نفس Firestore document ونفس أسماء الحقول
                    الحالية، والتعديل هنا يقتصر على طبقة UI / UX فقط.
                  </AlertDescription>
                </Alert>
              </div>
            </div>
          </TabsContent>

          {/* =========================
              Notifications
          ========================= */}
          <TabsContent value="notifications" className="space-y-6">
            <SettingsTabHero
              eyebrow="Notification Center"
              title="إعدادات الإشعارات"
              description="تحكم في قنوات التنبيه والأحداث التي تستحق إشعارًا داخل النظام، مع فصل واضح بين قنوات الإرسال ومحفزات التنبيه."
              stats={[
                {
                  icon: Bell,
                  label: "Enabled",
                  value: formatNumberEN(notificationsEnabledCount),
                  helper: "عدد الإعدادات المفعلة حاليًا",
                },
                {
                  icon: Mail,
                  label: "Channels",
                  value: formatNumberEN(
                    [notifications.email, notifications.sms].filter(Boolean)
                      .length
                  ),
                  helper: "قنوات الإرسال النشطة",
                },
                {
                  icon: Globe,
                  label: "Triggers",
                  value: formatNumberEN(
                    [notifications.investments, notifications.messages].filter(
                      Boolean
                    ).length
                  ),
                  helper: "الأحداث التي تولد إشعارات",
                },
              ]}
              panel={
                <SettingsHeroPanel
                  status={
                    notificationsEnabledCount > 0 ? "Operational" : "Muted"
                  }
                  title="تنبيهات النظام"
                  description="يمكنك ضبط القنوات ومحفزات التنبيه من دون تغيير أي منطق تشغيلي أو طرق الإرسال."
                  metrics={[
                    {
                      label: "البريد الإلكتروني",
                      value: notifications.email ? "مفعّل" : "موقوف",
                      helper: "القناة الرسمية الأساسية",
                    },
                    {
                      label: "الرسائل النصية",
                      value: notifications.sms ? "مفعّل" : "موقوف",
                      helper: "للتنبيهات الحساسة أو العاجلة",
                    },
                    {
                      label: "الأحداث الرئيسية",
                      value:
                        notifications.investments || notifications.messages
                          ? "نشطة"
                          : "صامتة",
                      helper: "الاستثمارات والرسائل الجديدة",
                    },
                  ]}
                />
              }
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-6">
                <SettingsSectionCard
                  icon={Mail}
                  eyebrow="Module 01"
                  title="Delivery Channels"
                  description="اختر قنوات الإرسال التي يعتمد عليها النظام عند بث التنبيهات الإدارية."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <Toggle
                      label="إشعارات البريد"
                      description="إرسال التنبيهات الرسمية عبر البريد الإلكتروني المسجل."
                      value={notifications.email}
                      onChange={(v: boolean) =>
                        setNotifications({ ...notifications, email: v })
                      }
                    />
                    <Toggle
                      label="إشعارات SMS"
                      description="إرسال تنبيهات نصية مختصرة للرسائل أو الحالات الحرجة."
                      value={notifications.sms}
                      onChange={(v: boolean) =>
                        setNotifications({ ...notifications, sms: v })
                      }
                    />
                  </div>
                </SettingsSectionCard>

                <SettingsSectionCard
                  icon={Bell}
                  eyebrow="Module 02"
                  title="Event Triggers"
                  description="حدد ما إذا كان النظام ينشئ تنبيهات عند وصول استثمارات أو رسائل جديدة."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <Toggle
                      label="استثمارات جديدة"
                      description="تنبيه الإدارة عندما يصل طلب استثمار أو تحديث استثماري جديد."
                      value={notifications.investments}
                      onChange={(v: boolean) =>
                        setNotifications({
                          ...notifications,
                          investments: v,
                        })
                      }
                    />
                    <Toggle
                      label="رسائل جديدة"
                      description="تنبيه الفريق عند استقبال رسالة جديدة من المستخدمين أو العملاء."
                      value={notifications.messages}
                      onChange={(v: boolean) =>
                        setNotifications({ ...notifications, messages: v })
                      }
                    />
                  </div>
                </SettingsSectionCard>
              </div>

              <div className="space-y-4 xl:sticky xl:top-24 self-start">
                <SettingsSimpleActionPanel
                  title="حفظ إعدادات الإشعارات"
                  description="احفظ تفضيلات الإشعارات الحالية إلى نفس مستند الإعدادات بدون أي تغيير على منطق الإرسال."
                  metrics={[
                    {
                      label: "القنوات المفعلة",
                      value: formatNumberEN(
                        [notifications.email, notifications.sms].filter(Boolean)
                          .length
                      ),
                      helper: "Email / SMS",
                    },
                    {
                      label: "الأحداث المفعلة",
                      value: formatNumberEN(
                        [
                          notifications.investments,
                          notifications.messages,
                        ].filter(Boolean).length
                      ),
                      helper: "Investments / Messages",
                    },
                  ]}
                  primaryLabel="Save Notification Settings"
                  primaryAction={saveNotifications}
                  notice={
                    <Alert className="border-white/10 bg-white/5 text-white">
                      <Bell className="h-4 w-4 text-[#F2B705]" />
                      <AlertTitle className="text-white">
                        تفعيل متوازن
                      </AlertTitle>
                      <AlertDescription className="text-white/70">
                        يفضّل إبقاء قناة واحدة على الأقل مفعلة حتى لا تصبح
                        المنصة صامتة بالكامل.
                      </AlertDescription>
                    </Alert>
                  }
                />
              </div>
            </div>
          </TabsContent>

          {/* =========================
              Security
          ========================= */}
          <TabsContent value="security" className="space-y-6">
            <SettingsTabHero
              eyebrow="Security Controls"
              title="إعدادات الأمان"
              description="لوحة موحدة للتحكم في إعدادات الأمان العامة للمنصة مع إبراز الحالة الحالية والجاهزية التشغيلية."
              stats={[
                {
                  icon: Shield,
                  label: "Policies",
                  value: formatNumberEN(Object.keys(security).length),
                  helper: "سياسات أمنية مرتبطة بالإعدادات",
                },
                {
                  icon: CheckCircle2,
                  label: "Enabled",
                  value: formatNumberEN(securityEnabledCount),
                  helper: "عدد السياسات المفعلة حاليًا",
                },
                {
                  icon: KeyRound,
                  label: "2FA",
                  value: security.twoFactor ? "On" : "Off",
                  helper: "المصادقة الثنائية للإدارة",
                },
              ]}
              panel={
                <SettingsHeroPanel
                  status={security.twoFactor ? "Protected" : "Basic"}
                  title="حالة الأمان"
                  description="هذا التبويب يحافظ على نفس المنطق الحالي مع تحسين واضح في العرض والقراءة واتخاذ القرار."
                  metrics={[
                    {
                      label: "المصادقة الثنائية",
                      value: security.twoFactor ? "مفعلة" : "غير مفعلة",
                      helper: "للتحقق الإضافي أثناء تسجيل الدخول",
                    },
                    {
                      label: "جاهزية المراجعة",
                      value: "فورية",
                      helper: "التغيير ينعكس فقط على واجهة الإعدادات الحالية",
                    },
                  ]}
                />
              }
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-6">
                <SettingsSectionCard
                  icon={Shield}
                  eyebrow="Module 01"
                  title="Authentication Policy"
                  description="التحكم في إعداد التحقق الإضافي للإدارة من داخل لوحة إعدادات موحدة وأكثر وضوحًا."
                >
                  <div className="grid gap-4">
                    <Toggle
                      label="المصادقة الثنائية"
                      description="إضافة طبقة تحقق إضافية لحسابات الإدارة عند تسجيل الدخول."
                      value={security.twoFactor}
                      onChange={(v: boolean) => setSecurity({ twoFactor: v })}
                    />
                  </div>
                </SettingsSectionCard>

                <SettingsSectionCard
                  icon={CircleAlert}
                  eyebrow="Module 02"
                  title="Security Guidance"
                  description="توصيات تشغيلية سريعة للحفاظ على مستوى موثوق من الأمان داخل لوحة الإدارة."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <Alert className="border-slate-200 bg-slate-50">
                      <Shield className="h-4 w-4" />
                      <AlertTitle>وضع الحماية</AlertTitle>
                      <AlertDescription className="leading-7">
                        عند تفعيل المصادقة الثنائية، تصبح حسابات الإدارة أكثر
                        مقاومة للوصول غير المصرح به.
                      </AlertDescription>
                    </Alert>
                    <Alert className="border-slate-200 bg-slate-50">
                      <KeyRound className="h-4 w-4" />
                      <AlertTitle>بدون تغيير في المنطق</AlertTitle>
                      <AlertDescription className="leading-7">
                        التعديل هنا بصري فقط، مع الحفاظ على نفس بنية المستند
                        الحالية ونفس سلوك الحفظ.
                      </AlertDescription>
                    </Alert>
                  </div>
                </SettingsSectionCard>
              </div>

              <div className="space-y-4 xl:sticky xl:top-24 self-start">
                <SettingsSimpleActionPanel
                  title="حفظ إعدادات الأمان"
                  description="استخدم زر الحفظ لتثبيت الإعداد الحالي على نفس مستند الأمان الموجود بالفعل."
                  metrics={[
                    {
                      label: "السياسات النشطة",
                      value: formatNumberEN(securityEnabledCount),
                      helper: "من إجمالي السياسات الحالية",
                    },
                    {
                      label: "المستوى الحالي",
                      value: security.twoFactor ? "محمي" : "أساسي",
                      helper: "بحسب حالة المصادقة الثنائية",
                    },
                  ]}
                  primaryLabel="Save Security Settings"
                  primaryAction={saveSecurity}
                  notice={
                    <Alert className="border-white/10 bg-white/5 text-white">
                      <Shield className="h-4 w-4 text-[#F2B705]" />
                      <AlertTitle className="text-white">
                        توصية تشغيلية
                      </AlertTitle>
                      <AlertDescription className="text-white/70">
                        تفعيل المصادقة الثنائية يرفع موثوقية المنصة خصوصًا عند
                        وجود أكثر من حساب إداري.
                      </AlertDescription>
                    </Alert>
                  }
                />
              </div>
            </div>
          </TabsContent>

          {/* =========================
              Roles & Permissions
          ========================= */}
          <TabsContent value="roles" className="space-y-6">
            <SettingsTabHero
              eyebrow="Roles & Permissions"
              title="الأدوار والصلاحيات"
              description="إدارة الأدوار وصلاحياتها من خلال لوحة أكثر تنظيمًا، مع إبراز الأدوار الأساسية، الأدوار النشطة، وحجم كتالوج الصلاحيات المتاح."
              stats={[
                {
                  icon: KeyRound,
                  label: "Roles",
                  value: formatNumberEN(roles.length),
                  helper: "إجمالي الأدوار المحفوظة",
                },
                {
                  icon: CheckCircle2,
                  label: "Active",
                  value: formatNumberEN(activeRolesCount),
                  helper: "عدد الأدوار النشطة حاليًا",
                },
                {
                  icon: Shield,
                  label: "Permissions",
                  value: formatNumberEN(DEFAULT_PERMISSIONS.length),
                  helper: "كتالوج الصلاحيات المتاح",
                },
              ]}
              panel={
                <SettingsHeroPanel
                  status="Governed"
                  title="حوكمة الوصول"
                  description="كل الأدوار هنا تعتمد على نفس البنية الحالية في Firestore، لكن الواجهة الآن أوضح في عرض الحالة والصلاحيات والإجراءات."
                  metrics={[
                    {
                      label: "الأدوار الأساسية",
                      value: formatNumberEN(systemRolesCount),
                      helper: "System roles",
                    },
                    {
                      label: "الأدوار المخصصة",
                      value: formatNumberEN(roles.length - systemRolesCount),
                      helper: "Custom roles",
                    },
                    {
                      label: "الحالة العامة",
                      value: activeRolesCount > 0 ? "نشطة" : "فارغة",
                      helper: "بحسب عدد الأدوار المفعلة",
                    },
                  ]}
                />
              }
            />

            <SettingsSectionCard
              icon={KeyRound}
              eyebrow="Module 01"
              title="Role Directory"
              description="أنشئ أدوارًا جديدة أو راجع الأدوار الحالية وصلاحياتها من بطاقة موحدة لكل دور."
              action={
                <Button
                  onClick={openCreateRole}
                  className="bg-[#F2B705] text-slate-950 hover:bg-[#e0ab00]"
                >
                  <Plus className="w-4 h-4 ml-2" /> Role جديد
                </Button>
              }
            >
              {roles.length ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  {roles
                    .slice()
                    .sort((a, b) => a.key.localeCompare(b.key))
                    .map(r => (
                      <div
                        key={r.key}
                        className="rounded-[24px] border border-slate-200/80 bg-slate-50/60 p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.24)]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="rounded-full">
                                {getRoleDisplayLabel(r.key) || r.key}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-full",
                                  r.isActive
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-slate-200 bg-white text-slate-500"
                                )}
                              >
                                {r.isActive ? "نشط" : "موقوف"}
                              </Badge>
                              {SYSTEM_ROLE_KEYS.includes(r.key) ? (
                                <Badge className="rounded-full">أساسي</Badge>
                              ) : null}
                            </div>

                            <div>
                              <div className="text-lg font-semibold tracking-tight text-slate-950">
                                {r.nameAr}
                              </div>
                              <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                                {r.nameEn || r.key}
                              </div>
                            </div>

                            <p className="min-h-[48px] text-sm leading-7 text-slate-600">
                              {r.description ||
                                "لا يوجد وصف مخصص لهذا الدور بعد."}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                              Permissions
                            </div>
                            <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                              {formatNumberEN(r.permissions?.length || 0)}
                            </div>
                          </div>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-2">
                          {r.permissions?.length ? (
                            r.permissions.slice(0, 8).map(permission => (
                              <Badge
                                key={permission}
                                variant="secondary"
                                className="rounded-full"
                              >
                                {permission}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-sm text-slate-500">
                              لا توجد صلاحيات مرتبطة بهذا الدور.
                            </span>
                          )}
                          {(r.permissions?.length || 0) > 8 ? (
                            <Badge variant="outline" className="rounded-full">
                              +{(r.permissions?.length || 0) - 8}
                            </Badge>
                          ) : null}
                        </div>

                        <div className="mt-5 flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            onClick={() => openEditRole(r)}
                          >
                            <Pencil className="w-4 h-4 ml-2" /> تعديل
                          </Button>
                          <Button
                            variant="outline"
                            onClick={async () => {
                              const next = roles.map(x =>
                                x.key === r.key
                                  ? { ...x, isActive: !x.isActive }
                                  : x
                              );
                              try {
                                await saveRolesDoc(next);
                                setRoles(next);
                                toast.success(
                                  r.isActive
                                    ? "تم إيقاف الدور"
                                    : "تم تفعيل الدور"
                                );
                              } catch (e) {
                                console.error(e);
                                toast.error("فشل تحديث الدور");
                              }
                            }}
                          >
                            {r.isActive ? "إيقاف" : "تفعيل"}
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => handleDeleteRole(r.key)}
                            disabled={SYSTEM_ROLE_KEYS.includes(r.key)}
                          >
                            <Trash2 className="w-4 h-4 ml-2" /> حذف
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="rounded-[22px] border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                  لا توجد أدوار محفوظة بعد. ابدأ بإنشاء Role جديد لإكمال الهيكل.
                </div>
              )}
            </SettingsSectionCard>

            <SettingsSectionCard
              icon={Shield}
              eyebrow="Module 02"
              title="Permission Catalog"
              description="مرجع سريع للصلاحيات المتاحة داخل النظام كما يتم استخدامها حاليًا."
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {DEFAULT_PERMISSIONS.map(permission => (
                  <div
                    key={permission.key}
                    className="rounded-[20px] border border-slate-200 bg-white p-4"
                  >
                    <div className="text-sm font-semibold text-slate-950">
                      {permission.label}
                    </div>
                    <div className="mt-2 text-xs leading-6 text-slate-500">
                      {permission.key}
                    </div>
                  </div>
                ))}
              </div>
            </SettingsSectionCard>
          </TabsContent>

          {/* =========================
              Admin Accounts
          ========================= */}
          <TabsContent value="admins" className="space-y-6">
            <SettingsTabHero
              eyebrow="Admin Access"
              title="حسابات الإدارة"
              description="إدارة الترقية، الدعوات، والحسابات الإدارية من تبويب واحد منظم يعرض الحالة الحالية، القنوات المفتوحة، وعدد الحسابات النشطة بوضوح."
              stats={[
                {
                  icon: Users,
                  label: "Admins",
                  value: formatNumberEN(adminUsers.length),
                  helper: "إجمالي حسابات الإدارة",
                },
                {
                  icon: CheckCircle2,
                  label: "Active",
                  value: formatNumberEN(activeAdminsCount),
                  helper: "الحسابات المفعلة حاليًا",
                },
                {
                  icon: Mail,
                  label: "Invites",
                  value: formatNumberEN(roleInvites.length),
                  helper: "دعوات وربط أدوار عبر البريد",
                },
              ]}
              panel={
                <SettingsHeroPanel
                  status="Access Managed"
                  title="إدارة الوصول"
                  description="يمكنك هنا الترقية المباشرة، إنشاء دعوات بالدور، وإدارة الحسابات الإدارية القائمة بنفس المنطق الحالي."
                  metrics={[
                    {
                      label: "الدعوات المفعلة",
                      value: formatNumberEN(activeInvitesCount),
                      helper: "Active role invites",
                    },
                    {
                      label: "الحسابات المباشرة",
                      value: formatNumberEN(adminUsers.length),
                      helper: "Firestore admin_users",
                    },
                    {
                      label: "الجاهزية الحالية",
                      value: adminUsers.length > 0 ? "مكتملة" : "قيد الإعداد",
                      helper: "بحسب وجود حسابات إدارية",
                    },
                  ]}
                />
              }
            />

            <SettingsSectionCard
              icon={Users}
              eyebrow="Module 01"
              title="Direct Promotion"
              description="ترقية مستخدم موجود داخل users مباشرةً عبر البريد الإلكتروني، من دون إنشاء حساب جديد."
            >
              <div className="grid gap-5 md:grid-cols-3">
                <SettingsField
                  label="الإيميل"
                  description="البريد الخاص بالمستخدم الموجود مسبقًا داخل users."
                  placeholder="info@madanalbena.com"
                  value={promoteEmail}
                  onChange={setPromoteEmail}
                  dir="ltr"
                  inputClassName="text-left"
                  containerClassName="md:col-span-2"
                />

                <SettingsSelectField
                  label="الدور"
                  description="الدور الذي سيتم تعيينه مباشرة للمستخدم."
                >
                  <Select
                    value={promoteRoleKey}
                    onValueChange={(v: any) =>
                      setPromoteRoleKey(normalizeAdminRoleKey(v))
                    }
                  >
                    <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white px-4 shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="accountant">
                        محاسب (accountant)
                      </SelectItem>
                      <SelectItem value="staff">موظف (staff)</SelectItem>
                      <SelectItem value="admin">أدمن (admin)</SelectItem>
                      <SelectItem value="owner">المالك (owner)</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingsSelectField>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  className="bg-[#F2B705] text-slate-950 hover:bg-[#e0ab00]"
                  onClick={promoteExistingUserByEmail}
                  disabled={promoting}
                >
                  {promoting ? "جاري الترقية..." : "ترقية الآن"}
                </Button>
              </div>
            </SettingsSectionCard>

            <SettingsSectionCard
              icon={Mail}
              eyebrow="Module 02"
              title="Role Invites"
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
                      <SelectItem value="accountant">
                        محاسب (accountant)
                      </SelectItem>
                      <SelectItem value="staff">موظف (staff)</SelectItem>
                      <SelectItem value="admin">أدمن (admin)</SelectItem>
                      <SelectItem value="owner">المالك (owner)</SelectItem>
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
              eyebrow="Module 03"
              title="Admin Accounts Directory"
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
                                  .map(p => (
                                    <Badge
                                      key={`effective-${u.id}-${p}`}
                                      variant="secondary"
                                      className="rounded-full"
                                    >
                                      {p}
                                    </Badge>
                                  ))}
                              </div>
                            ) : null}

                            {u.permissionsAllow?.length ||
                            u.permissionsDeny?.length ? (
                              <div className="flex flex-wrap gap-2">
                                {(u.permissionsAllow || [])
                                  .slice(0, 6)
                                  .map(p => (
                                    <Badge
                                      key={`a-${u.id}-${p}`}
                                      variant="secondary"
                                      className="rounded-full"
                                    >
                                      + {p}
                                    </Badge>
                                  ))}
                                {(u.permissionsDeny || [])
                                  .slice(0, 6)
                                  .map(p => (
                                    <Badge
                                      key={`d-${u.id}-${p}`}
                                      variant="outline"
                                      className="rounded-full"
                                    >
                                      - {p}
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
          <TabsContent value="labels" className="space-y-6">
            <SettingsTabHero
              eyebrow="Label Management"
              title="المسميات"
              description="إدارة نصوص العرض المركزية للأنواع والحالات والأدوار من داخل لوحة موحدة، بحيث تبقى الهوية اللغوية للنظام متماسكة وسهلة الصيانة."
              stats={[
                {
                  icon: Tags,
                  label: "Entries",
                  value: formatNumberEN(totalLabelEntries),
                  helper: "إجمالي المسميات المحفوظة",
                },
                {
                  icon: FolderOpen,
                  label: "Categories",
                  value: "4",
                  helper: "أنواع، حالات، أدوار، استثمارات",
                },
                {
                  icon: Globe,
                  label: "Languages",
                  value: "AR / EN",
                  helper: "حقول العرض المتاحة",
                },
              ]}
              panel={
                <SettingsHeroPanel
                  status="Centralized"
                  title="قاموس العرض"
                  description="التحكم في نصوص الواجهة من مكان واحد يساعد على الحفاظ على التناسق بين صفحات الإدارة والعملاء."
                  metrics={[
                    {
                      label: "أنواع المشاريع",
                      value: formatNumberEN(
                        Object.keys(labels.projectTypes || {}).length
                      ),
                      helper: "Project Types",
                    },
                    {
                      label: "حالات المشاريع",
                      value: formatNumberEN(
                        Object.keys(labels.projectStatuses || {}).length
                      ),
                      helper: "Project Statuses",
                    },
                    {
                      label: "حالات الاستثمار",
                      value: formatNumberEN(
                        Object.keys(labels.investmentStatuses || {}).length
                      ),
                      helper: "Investment Statuses / UI Roles",
                    },
                  ]}
                />
              }
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-6">
                <SettingsSectionCard
                  icon={Tags}
                  eyebrow="Module 01"
                  title="Project Types"
                  description="مسميات أنواع المشاريع التي تظهر في صفحات الإدارة والعرض."
                >
                  <LabelsEditor
                    title="مسميات أنواع المشاريع (Project Types)"
                    data={labels.projectTypes}
                    onChange={next =>
                      setLabels(p => ({ ...p, projectTypes: next }))
                    }
                  />
                </SettingsSectionCard>

                <SettingsSectionCard
                  icon={FolderOpen}
                  eyebrow="Module 02"
                  title="Project Statuses"
                  description="حالات المشاريع المعروضة في النظام للمستخدمين والإدارة."
                >
                  <LabelsEditor
                    title="مسميات حالات المشاريع (Project Statuses)"
                    data={labels.projectStatuses}
                    onChange={next =>
                      setLabels(p => ({ ...p, projectStatuses: next }))
                    }
                  />
                </SettingsSectionCard>

                <SettingsSectionCard
                  icon={TrendingUp}
                  eyebrow="Module 03"
                  title="Investment Statuses"
                  description="النصوص المستخدمة لوصف مراحل وحالات الاستثمار داخل النظام."
                >
                  <LabelsEditor
                    title="مسميات حالات الاستثمارات (Investment Statuses)"
                    data={labels.investmentStatuses}
                    onChange={next =>
                      setLabels(p => ({ ...p, investmentStatuses: next }))
                    }
                  />
                </SettingsSectionCard>

                <SettingsSectionCard
                  icon={Users}
                  eyebrow="Module 04"
                  title="UI Roles Labels"
                  description="مسميات العرض للأدوار المختلفة كما تظهر في واجهات النظام."
                >
                  <LabelsEditor
                    title="مسميات الأدوار للعرض (UI Roles Labels)"
                    data={labels.uiRoles}
                    onChange={next => setLabels(p => ({ ...p, uiRoles: next }))}
                  />
                </SettingsSectionCard>
              </div>

              <div className="space-y-4 xl:sticky xl:top-24 self-start">
                <SettingsSimpleActionPanel
                  title="حفظ المسميات"
                  description="بعد مراجعة التعديلات، احفظ كل القواميس اللغوية إلى نفس مستند `settings/labels` الحالي."
                  metrics={[
                    {
                      label: "إجمالي السجلات",
                      value: formatNumberEN(totalLabelEntries),
                      helper: "كل المسميات الحالية",
                    },
                    {
                      label: "نطاق التغطية",
                      value: "4 وحدات",
                      helper: "Projects / Investments / Roles",
                    },
                  ]}
                  primaryLabel="Save Label Settings"
                  primaryAction={saveLabels}
                  notice={
                    <Alert className="border-white/10 bg-white/5 text-white">
                      <Tags className="h-4 w-4 text-[#F2B705]" />
                      <AlertTitle className="text-white">
                        قاموس مركزي
                      </AlertTitle>
                      <AlertDescription className="text-white/70">
                        هذا التبويب يغيّر نصوص العرض فقط، من دون أي تعديل على
                        الكود أو المفاتيح المستخدمة في البيانات.
                      </AlertDescription>
                    </Alert>
                  }
                />
              </div>
            </div>
          </TabsContent>

          {/* =========================
              Flags
          ========================= */}
          <TabsContent value="flags" className="space-y-6">
            <SettingsTabHero
              eyebrow="Feature Flag Center"
              title="Feature Flags"
              description="إدارة مفاتيح التحكم التشغيلي بشكل أوضح، مع فصل الإعدادات المتعلقة بالإتاحة العامة عن الإعدادات الخاصة بجمهور VIP."
              stats={[
                {
                  icon: SlidersHorizontal,
                  label: "Flags",
                  value: formatNumberEN(Object.keys(flags).length),
                  helper: "إجمالي مفاتيح التحكم",
                },
                {
                  icon: CheckCircle2,
                  label: "Enabled",
                  value: formatNumberEN(enabledFlagsCount),
                  helper: "عدد المفاتيح المفعلة",
                },
                {
                  icon: Globe,
                  label: "Audience",
                  value: flags.vipOnlyMode ? "VIP" : "Public",
                  helper: "وضع إتاحة المحتوى الحالي",
                },
              ]}
              panel={
                <SettingsHeroPanel
                  status={enabledFlagsCount > 0 ? "Managed" : "Baseline"}
                  title="مفاتيح التحكم"
                  description="استخدم هذا التبويب لتفعيل أو تعطيل سلوكيات واجهة محددة من دون أي refactor في البزنس لوجك."
                  metrics={[
                    {
                      label: "وضع الصيانة",
                      value: flags.maintenanceMode ? "مفعل" : "مغلق",
                      helper: "Maintenance Mode",
                    },
                    {
                      label: "الاستثمارات",
                      value: flags.disableInvestments ? "معطلة" : "متاحة",
                      helper: "إنشاء استثمار جديد",
                    },
                    {
                      label: "قناة VIP",
                      value: flags.vipOnlyMode ? "حصرية" : "عامة",
                      helper: "VIP Only / Hide VIP Projects",
                    },
                  ]}
                />
              }
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-6">
                <SettingsSectionCard
                  icon={SlidersHorizontal}
                  eyebrow="Module 01"
                  title="Platform Availability"
                  description="مفاتيح تؤثر على إتاحة أجزاء النظام للعامة أو للإدارة."
                >
                  <div className="grid gap-4">
                    <Toggle
                      label="Maintenance Mode"
                      description="إيقاف واجهة الموقع مؤقتًا أو إظهار وضع الصيانة."
                      value={flags.maintenanceMode}
                      onChange={(v: boolean) =>
                        setFlags(p => ({ ...p, maintenanceMode: v }))
                      }
                    />
                    <Toggle
                      label="تعطيل الاستثمارات"
                      description="منع إنشاء استثمار جديد من الواجهة الحالية."
                      value={flags.disableInvestments}
                      onChange={(v: boolean) =>
                        setFlags(p => ({ ...p, disableInvestments: v }))
                      }
                    />
                    <Toggle
                      label="تعطيل الرسائل"
                      description="إخفاء أو إيقاف نموذج وصفحة الرسائل للمستخدمين."
                      value={flags.disableMessages}
                      onChange={(v: boolean) =>
                        setFlags(p => ({ ...p, disableMessages: v }))
                      }
                    />
                  </div>
                </SettingsSectionCard>

                <SettingsSectionCard
                  icon={Users}
                  eyebrow="Module 02"
                  title="Audience Controls"
                  description="مفاتيح التحكم في ظهور المحتوى الخاص بالمستخدمين العامين أو جمهور VIP."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <Toggle
                      label="VIP Only Mode"
                      description="عرض محتوى VIP فقط داخل الواجهة العامة."
                      value={flags.vipOnlyMode}
                      onChange={(v: boolean) =>
                        setFlags(p => ({ ...p, vipOnlyMode: v }))
                      }
                    />
                    <Toggle
                      label="إخفاء مشاريع VIP من العامة"
                      description="إخفاء مشاريع VIP من الواجهات العامة غير المخصصة."
                      value={flags.hideVipProjects}
                      onChange={(v: boolean) =>
                        setFlags(p => ({ ...p, hideVipProjects: v }))
                      }
                    />
                  </div>
                </SettingsSectionCard>
              </div>

              <div className="space-y-4 xl:sticky xl:top-24 self-start">
                <SettingsSimpleActionPanel
                  title="حفظ Feature Flags"
                  description="احفظ مفاتيح التحكم الحالية إلى نفس المستند من دون أي تغيير في الأسماء أو طريقة القراءة داخل النظام."
                  metrics={[
                    {
                      label: "المفاتيح المفعلة",
                      value: formatNumberEN(enabledFlagsCount),
                      helper: "من إجمالي مفاتيح التحكم",
                    },
                    {
                      label: "وضع الجمهور",
                      value: flags.vipOnlyMode ? "VIP" : "عام",
                      helper: "بحسب حالة VIP Only Mode",
                    },
                  ]}
                  primaryLabel="Save Feature Flags"
                  primaryAction={saveFlags}
                  notice={
                    <Alert className="border-white/10 bg-white/5 text-white">
                      <CircleAlert className="h-4 w-4 text-[#F2B705]" />
                      <AlertTitle className="text-white">
                        تأثير مباشر على الواجهة
                      </AlertTitle>
                      <AlertDescription className="text-white/70">
                        هذه المفاتيح تغير الإتاحة والسلوك الظاهري، لذلك يفضّل
                        مراجعتها بعناية قبل الحفظ.
                      </AlertDescription>
                    </Alert>
                  }
                />
              </div>
            </div>
          </TabsContent>

          {/* =========================
              Content CMS
          ========================= */}
          <TabsContent value="content" className="space-y-6">
            <SettingsTabHero
              eyebrow="Content Management"
              title="محتوى الموقع"
              description="إدارة النصوص العامة للواجهة من داخل لوحة منظمة تشبه إعدادات أنظمة SaaS الاحترافية، مع فصل واضح بين Hero وFooter وبيانات التواصل."
              stats={[
                {
                  icon: Type,
                  label: "Fields",
                  value: formatNumberEN(Object.keys(content).length),
                  helper: "إجمالي حقول المحتوى المتاحة",
                },
                {
                  icon: CheckCircle2,
                  label: "Completed",
                  value: formatNumberEN(contentCompletedCount),
                  helper: "الحقول التي تحتوي على قيمة",
                },
                {
                  icon: Globe,
                  label: "Locales",
                  value: "AR / EN",
                  helper: "محتوى عربي وإنجليزي",
                },
              ]}
              panel={
                <SettingsHeroPanel
                  status="Editorial"
                  title="واجهة المحتوى"
                  description="يتم هنا ضبط النصوص العامة للمنصة من دون أي تغيير على بنية الصفحات أو منطق عرضها."
                  metrics={[
                    {
                      label: "Hero",
                      value:
                        content.heroTitleAr || content.heroTitleEn
                          ? "مكتمل جزئيًا"
                          : "فارغ",
                      helper: "العنوان والوصف الرئيسي",
                    },
                    {
                      label: "Footer",
                      value:
                        content.footerAboutAr || content.footerAboutEn
                          ? "مكتمل جزئيًا"
                          : "فارغ",
                      helper: "نص تعريف المنصة",
                    },
                    {
                      label: "Contact",
                      value:
                        content.contactEmail || content.contactPhone
                          ? "جاهز"
                          : "غير مكتمل",
                      helper: "قنوات التواصل في الواجهة",
                    },
                  ]}
                />
              }
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-6">
                <SettingsSectionCard
                  icon={Type}
                  eyebrow="Module 01"
                  title="Hero Content"
                  description="النصوص الرئيسية التي تشكل الانطباع الأول داخل الواجهة."
                >
                  <div className="grid gap-5 md:grid-cols-2">
                    <SettingsField
                      label="Hero Title (عربي)"
                      description="العنوان الرئيسي للواجهة باللغة العربية."
                      placeholder="اكتب العنوان العربي"
                      value={content.heroTitleAr}
                      onChange={value =>
                        setContent(p => ({ ...p, heroTitleAr: value }))
                      }
                    />
                    <SettingsField
                      label="Hero Title (English)"
                      description="العنوان الرئيسي للواجهة باللغة الإنجليزية."
                      placeholder="Write the English headline"
                      value={content.heroTitleEn}
                      onChange={value =>
                        setContent(p => ({ ...p, heroTitleEn: value }))
                      }
                      dir="ltr"
                      inputClassName="text-left"
                    />
                    <SettingsField
                      label="Hero Subtitle (عربي)"
                      description="وصف مختصر يشرح القيمة الأساسية للمنصة."
                      placeholder="اكتب الوصف العربي"
                      value={content.heroSubtitleAr}
                      onChange={value =>
                        setContent(p => ({ ...p, heroSubtitleAr: value }))
                      }
                      textarea
                      rows={4}
                      containerClassName="md:col-span-2"
                    />
                    <SettingsField
                      label="Hero Subtitle (English)"
                      description="Supporting hero copy in English."
                      placeholder="Write the English supporting copy"
                      value={content.heroSubtitleEn}
                      onChange={value =>
                        setContent(p => ({ ...p, heroSubtitleEn: value }))
                      }
                      textarea
                      rows={4}
                      dir="ltr"
                      inputClassName="text-left"
                      containerClassName="md:col-span-2"
                    />
                  </div>
                </SettingsSectionCard>

                <SettingsSectionCard
                  icon={Archive}
                  eyebrow="Module 02"
                  title="Footer Content"
                  description="محتوى footer التعريفي بالمنصة باللغتين العربية والإنجليزية."
                >
                  <div className="grid gap-5 md:grid-cols-2">
                    <SettingsField
                      label="Footer About (عربي)"
                      description="النص التعريفي العربي المختصر في footer."
                      placeholder="اكتب وصفًا مختصرًا للمنصة"
                      value={content.footerAboutAr}
                      onChange={value =>
                        setContent(p => ({ ...p, footerAboutAr: value }))
                      }
                      textarea
                      rows={4}
                    />
                    <SettingsField
                      label="Footer About (English)"
                      description="English footer description."
                      placeholder="Write a short platform description"
                      value={content.footerAboutEn}
                      onChange={value =>
                        setContent(p => ({ ...p, footerAboutEn: value }))
                      }
                      textarea
                      rows={4}
                      dir="ltr"
                      inputClassName="text-left"
                    />
                  </div>
                </SettingsSectionCard>

                <SettingsSectionCard
                  icon={Mail}
                  eyebrow="Module 03"
                  title="Contact Content"
                  description="بيانات التواصل التي تعرض للمستخدمين داخل واجهة المنصة."
                >
                  <div className="grid gap-5 md:grid-cols-2">
                    <SettingsField
                      label="Contact Email"
                      description="البريد الظاهر للمستخدمين في الواجهة."
                      placeholder="support@maedin.sa"
                      value={content.contactEmail}
                      onChange={value =>
                        setContent(p => ({ ...p, contactEmail: value }))
                      }
                      dir="ltr"
                      inputClassName="text-left"
                    />
                    <SettingsField
                      label="Contact Phone"
                      description="رقم الهاتف المعروض في بيانات التواصل."
                      placeholder="+966 5X XXX XXXX"
                      value={content.contactPhone}
                      onChange={value =>
                        setContent(p => ({ ...p, contactPhone: value }))
                      }
                      dir="ltr"
                      inputClassName="text-left"
                    />
                  </div>
                </SettingsSectionCard>
              </div>

              <div className="space-y-4 xl:sticky xl:top-24 self-start">
                <SettingsSimpleActionPanel
                  title="حفظ محتوى الموقع"
                  description="احفظ النصوص الحالية إلى نفس مستند المحتوى من غير أي تغيير في أسماء الحقول أو طريقة استخدامها."
                  metrics={[
                    {
                      label: "الحقول المكتملة",
                      value: formatNumberEN(contentCompletedCount),
                      helper: "من إجمالي حقول المحتوى",
                    },
                    {
                      label: "التغطية اللغوية",
                      value: "عربي / English",
                      helper: "حقول عرض ثنائية اللغة",
                    },
                  ]}
                  primaryLabel="Save Content Settings"
                  primaryAction={saveContent}
                  notice={
                    <Alert className="border-white/10 bg-white/5 text-white">
                      <Type className="h-4 w-4 text-[#F2B705]" />
                      <AlertTitle className="text-white">
                        توحيد الرسائل
                      </AlertTitle>
                      <AlertDescription className="text-white/70">
                        يفضّل مراجعة النسختين العربية والإنجليزية معًا للحفاظ
                        على نبرة موحدة للمنتج.
                      </AlertDescription>
                    </Alert>
                  }
                />
              </div>
            </div>
          </TabsContent>

          {/* =========================
              Backup
          ========================= */}
          <TabsContent value="backup" className="space-y-6">
            <SettingsTabHero
              eyebrow="Backup & Export"
              title="النسخ الاحتياطي والتصدير"
              description="واجهة موحدة لحفظ إعدادات المنصة وتصدير حزم العقود والبيانات المرتبطة بها من مصادر النظام الحية."
              stats={[
                {
                  icon: FileDown,
                  label: "Selected",
                  value: formatNumberEN(selectedContractIds.length),
                  helper: "العقود المحددة للتصدير",
                },
                {
                  icon: Files,
                  label: "Filtered",
                  value: formatNumberEN(filteredContractExportItems.length),
                  helper: "العقود المطابقة للفلاتر الحالية",
                },
                {
                  icon: Archive,
                  label: "Exports",
                  value:
                    contractExportSummary || contractExcelExportSummary
                      ? "جاهزة"
                      : "قيد التحضير",
                  helper: "آخر حالة تصدير معروفة",
                },
              ]}
              panel={
                <SettingsHeroPanel
                  status="Portable"
                  title="حركة البيانات"
                  description="هذا التبويب يركّز على نقل إعدادات المنصة وتوليد باقات العقود من دون أي تعديل على بنية البيانات الأصلية."
                  metrics={[
                    {
                      label: "إعدادات المنصة",
                      value: importing ? "Importing" : "JSON Ready",
                      helper: "Export / Import settings",
                    },
                    {
                      label: "System Package",
                      value: contractExportSummary ? "Generated" : "Pending",
                      helper: "CSV + attachments + manifest",
                    },
                    {
                      label: "Excel Bundle",
                      value: contractExcelExportSummary
                        ? "Generated"
                        : "Pending",
                      helper: "Human-readable export",
                    },
                  ]}
                />
              }
            />

            <Card className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
              <CardHeader className="border-b border-slate-100/80 pb-6">
                <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950">
                  Backup / Restore
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600">
                  تصدير واستيراد إعدادات المنصة بسرعة من خلال ملف JSON محفوظ.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button variant="outline" onClick={handleExport}>
                    <FileDown className="w-4 h-4 ml-2" /> Export JSON
                  </Button>

                  <Button
                    variant="outline"
                    onClick={handlePickImportFile}
                    disabled={importing}
                  >
                    <FileUp className="w-4 h-4 ml-2" />
                    {importing ? "جاري الاستيراد..." : "Import JSON"}
                  </Button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={handleImportFileChange}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
              <CardHeader className="gap-4 border-b border-slate-100/80 pb-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950">
                      Contract Export
                    </CardTitle>
                    <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600">
                      Generate either the system package or the human-readable
                      Excel bundle from the current live sources: Firestore
                      business data, D1 file metadata, and R2 file references.
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {formatNumberEN(selectedContractIds.length)} selected
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void loadContractExportItems({ manual: true })
                      }
                      disabled={
                        contractExportLoading ||
                        contractExporting ||
                        contractExcelExporting
                      }
                    >
                      <RefreshCw
                        className={cn(
                          "mr-2 h-4 w-4",
                          contractExportLoading && "animate-spin"
                        )}
                      />
                      Refresh Contracts
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {contractExportError ? (
                  <Alert className="border-red-500/40 bg-red-500/5 text-red-700">
                    <CircleAlert className="h-4 w-4" />
                    <AlertTitle>Contract Export Error</AlertTitle>
                    <AlertDescription>{contractExportError}</AlertDescription>
                  </Alert>
                ) : null}

                {contractExcelExportError ? (
                  <Alert className="border-red-500/40 bg-red-500/5 text-red-700">
                    <CircleAlert className="h-4 w-4" />
                    <AlertTitle>Excel Export Error</AlertTitle>
                    <AlertDescription>
                      {contractExcelExportError}
                    </AlertDescription>
                  </Alert>
                ) : null}

                {contractExportSummary ? (
                  <Alert className="border-emerald-500/30 bg-emerald-500/5 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Last System Package Export</AlertTitle>
                    <AlertDescription className="space-y-1">
                      <p>
                        {contractExportSummary.fileName} generated at{" "}
                        {formatDatabaseTimestamp(
                          contractExportSummary.generatedAt
                        )}
                        .
                      </p>
                      <p>
                        Contracts: {contractExportSummary.rowCounts.contracts} |
                        Investments:{" "}
                        {contractExportSummary.rowCounts.investments} |
                        Attachments: {contractExportSummary.attachmentCount} |
                        Warnings: {contractExportSummary.warningCount}
                      </p>
                    </AlertDescription>
                  </Alert>
                ) : null}

                {contractExcelExportSummary ? (
                  <Alert className="border-sky-500/30 bg-sky-500/5 text-sky-700">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Last Excel Export</AlertTitle>
                    <AlertDescription className="space-y-1">
                      <p>
                        {contractExcelExportSummary.fileName} generated at{" "}
                        {formatDatabaseTimestamp(
                          contractExcelExportSummary.generatedAt
                        )}
                        .
                      </p>
                      <p>
                        Workbooks: {contractExcelExportSummary.workbookCount} |
                        Contracts:{" "}
                        {contractExcelExportSummary.rowCounts.contracts} |
                        Files: {contractExcelExportSummary.rowCounts.files} |
                        Warnings: {contractExcelExportSummary.warningCount}
                      </p>
                    </AlertDescription>
                  </Alert>
                ) : null}

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-2">
                    <Label htmlFor="contract-export-search">
                      Search contracts
                    </Label>
                    <Input
                      id="contract-export-search"
                      value={contractSearch}
                      onChange={event => setContractSearch(event.target.value)}
                      placeholder="Search by contract, project, investor, or investment ID"
                      disabled={contractExporting || contractExcelExporting}
                      className="h-12 rounded-xl border-slate-200 bg-white shadow-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Status filter</Label>
                    <Select
                      value={contractStatusFilter}
                      onValueChange={setContractStatusFilter}
                    >
                      <SelectTrigger
                        className="h-12 rounded-xl border-slate-200 bg-white px-4 shadow-none"
                        disabled={contractExporting || contractExcelExporting}
                      >
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        {contractStatusOptions.map(status => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      toggleSelectAllFilteredContracts(!allFilteredSelected)
                    }
                    disabled={
                      !filteredContractExportItems.length ||
                      contractExportLoading ||
                      contractExporting ||
                      contractExcelExporting
                    }
                  >
                    {allFilteredSelected
                      ? "Deselect Filtered"
                      : "Select Filtered"}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => setSelectedContractIds([])}
                    disabled={
                      !selectedContractIds.length ||
                      contractExporting ||
                      contractExcelExporting
                    }
                  >
                    Clear Selection
                  </Button>

                  <Button
                    className="bg-[#F2B705] text-black hover:bg-[#d7a404]"
                    onClick={() => void handleContractExport()}
                    disabled={
                      !selectedContractIds.length ||
                      contractExportLoading ||
                      contractExporting ||
                      contractExcelExporting
                    }
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    {contractExporting
                      ? "Generating System Package..."
                      : "Contract Export (System Package)"}
                  </Button>

                  <Button
                    variant="outline"
                    className="border-[#F2B705] text-[#7a5b00] hover:bg-[#fff7d1] hover:text-[#5e4600]"
                    onClick={() => void handleBusinessExcelExport()}
                    disabled={
                      !selectedContractIds.length ||
                      contractExportLoading ||
                      contractExporting ||
                      contractExcelExporting
                    }
                  >
                    <Files className="mr-2 h-4 w-4" />
                    {contractExcelExporting
                      ? "Generating Excel Bundle..."
                      : "Contract Export (Excel)"}
                  </Button>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-slate-50/40">
                  {contractExportLoading ? (
                    <div className="p-6 text-sm text-muted-foreground">
                      Loading contracts for export...
                    </div>
                  ) : filteredContractExportItems.length ? (
                    <div className="max-h-[420px] divide-y overflow-y-auto">
                      {filteredContractExportItems.map(item => {
                        const checked = selectedContractIdSet.has(item.id);
                        return (
                          <label
                            key={item.id}
                            className="flex cursor-pointer items-start gap-3 p-4 transition hover:bg-white"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={value =>
                                toggleContractSelection(item.id, value === true)
                              }
                              className="mt-1"
                              disabled={
                                contractExporting || contractExcelExporting
                              }
                            />

                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">{item.id}</p>
                                <Badge
                                  variant="outline"
                                  className="rounded-full"
                                >
                                  {item.status}
                                </Badge>
                                {item.projectTitle ? (
                                  <Badge
                                    variant="secondary"
                                    className="max-w-full truncate rounded-full"
                                  >
                                    {item.projectTitle}
                                  </Badge>
                                ) : null}
                              </div>

                              <p className="text-sm text-muted-foreground">
                                Investor: {item.investorName || "Unknown"}{" "}
                                {item.investorEmail
                                  ? `(${item.investorEmail})`
                                  : ""}
                              </p>

                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span>
                                  Investment: {item.investmentId || "-"}
                                </span>
                                <span>Project: {item.projectId || "-"}</span>
                                <span>
                                  Updated:{" "}
                                  {formatDatabaseTimestamp(
                                    item.updatedAt ||
                                      item.signedAt ||
                                      item.createdAt
                                  )}
                                </span>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-6 text-sm text-muted-foreground">
                      No contracts match the current filters.
                    </div>
                  )}
                </div>

                <p className="text-xs leading-5 text-muted-foreground">
                  Package contents: investors.csv, projects.csv,
                  investments.csv, contracts.csv, interest_requests.csv,
                  files.csv, attachments/, manifest.json, and README.md.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* =========================
              Database
          ========================= */}
          <TabsContent value="database" className="space-y-6">
            <SettingsTabHero
              eyebrow="Infrastructure Overview"
              title="قاعدة البيانات والتخزين"
              description="عرض تشغيلي موحد لبنية Cloudflare الحالية، يشمل الحالة العامة للخدمات، حركة البيانات، والمقاييس الحية المرتبطة بالتخزين."
              stats={[
                {
                  icon: Database,
                  label: "Healthy",
                  value: formatNumberEN(databaseHealthyServicesCount),
                  helper: "الخدمات الجاهزة حاليًا",
                },
                {
                  icon: Files,
                  label: "Metrics",
                  value: formatNumberEN(databaseActiveMetricCount),
                  helper: "المقاييس التي تحمل قيمة",
                },
                {
                  icon: ServerCog,
                  label: "Status",
                  value: databaseRefreshing ? "Checking" : "Live",
                  helper: "فحص حالة الخدمات",
                },
              ]}
              panel={
                <SettingsHeroPanel
                  status={databaseRefreshing ? "Checking" : "Cloudflare"}
                  title="طبقة التخزين"
                  description="جميع البيانات هنا للعرض والمراجعة التشغيلية فقط، مع إبقاء نفس مصادر القراءة والمنطق القائم."
                  metrics={[
                    {
                      label: "Worker",
                      value: getDatabaseStatusLabel(
                        databaseRefreshing
                          ? "checking"
                          : databaseDashboard.services.worker.status
                      ),
                      helper: "Cloudflare Worker health",
                    },
                    {
                      label: "D1 / R2",
                      value: `${getDatabaseStatusLabel(
                        databaseRefreshing
                          ? "checking"
                          : databaseDashboard.services.d1.status
                      )} / ${getDatabaseStatusLabel(
                        databaseRefreshing
                          ? "checking"
                          : databaseDashboard.services.r2.status
                      )}`,
                      helper: "Storage layers",
                    },
                    {
                      label: "Last Check",
                      value: databaseDashboard.checkedAt
                        ? formatDatabaseTimestamp(databaseDashboard.checkedAt)
                        : "غير متاح",
                      helper: "آخر تحديث معروف للحالة",
                    },
                  ]}
                />
              }
            />

            <Card className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
              <CardHeader className="gap-4 border-b border-slate-100/80 pb-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Database className="h-4 w-4" />
                      <span>Database / Storage</span>
                    </div>
                    <CardTitle className="text-2xl font-semibold tracking-tight text-slate-950">
                      قاعدة البيانات والتخزين
                    </CardTitle>
                    <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600">
                      إدارة بنية الملفات الحالية عبر Cloudflare D1 وR2 وWorkers
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Cloudflare</Badge>
                    <Badge variant="secondary">Production</Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {databaseOverviewCards.map(card => {
                    const Icon = card.icon;

                    return (
                      <div
                        key={card.title}
                        className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.22)]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">
                              {card.title}
                            </p>
                            <p
                              className="text-lg font-semibold tracking-tight"
                              dir={card.valueDir}
                            >
                              {card.value}
                            </p>
                            <Badge
                              variant="outline"
                              className={cn(
                                "mt-2",
                                getDatabaseStatusTone(card.status)
                              )}
                            >
                              {card.statusLabel}
                            </Badge>
                          </div>

                          <div className="rounded-xl border bg-background p-2 text-muted-foreground">
                            <Icon className="h-4 w-4" />
                          </div>
                        </div>

                        <p
                          className="mt-4 text-sm text-muted-foreground"
                          dir={card.valueDir}
                        >
                          {card.subtitle}
                        </p>

                        {card.statusDetail ? (
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            {card.statusDetail}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
              <CardHeader className="border-b border-slate-100/80 pb-6">
                <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950">
                  المعمارية الحالية
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600">
                  تدفق الملفات والبيانات من واجهة المنصة إلى طبقة الرفع ثم إلى
                  Cloudflare D1 وR2.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6 pt-6">
                <div className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-4">
                  <div
                    className="flex flex-col gap-3 lg:flex-row lg:items-center"
                    dir="ltr"
                  >
                    <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 text-right">
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl border bg-muted/30 p-2 text-muted-foreground">
                          <Globe className="h-4 w-4" />
                        </div>
                        <div className="space-y-1">
                          <div className="text-sm text-muted-foreground">
                            الموقع
                          </div>
                          <div className="font-semibold">واجهة المنصة</div>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 px-2 text-center text-lg text-muted-foreground">
                      →
                    </div>

                    <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 text-right">
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl border bg-muted/30 p-2 text-muted-foreground">
                          <ServerCog className="h-4 w-4" />
                        </div>
                        <div className="space-y-1">
                          <div className="text-sm text-muted-foreground">
                            Cloudflare Worker
                          </div>
                          <div className="font-semibold" dir="ltr">
                            {databaseWorkerUrl || "upload.maedin.workers.dev"}
                          </div>
                          <div className="pt-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                getDatabaseStatusTone(
                                  databaseRefreshing
                                    ? "checking"
                                    : databaseDashboard.services.worker.status
                                )
                              )}
                            >
                              Worker:{" "}
                              {getDatabaseStatusLabel(
                                databaseRefreshing
                                  ? "checking"
                                  : databaseDashboard.services.worker.status
                              )}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 px-2 text-center text-lg text-muted-foreground">
                      →
                    </div>

                    <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 text-right">
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl border bg-muted/30 p-2 text-muted-foreground">
                          <Database className="h-4 w-4" />
                        </div>
                        <div className="space-y-1">
                          <div className="text-sm text-muted-foreground">
                            طبقة التخزين
                          </div>
                          <div className="font-semibold" dir="ltr">
                            D1 + R2
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2" dir="ltr">
                        <Badge variant="outline">maedin-documents</Badge>
                        <Badge variant="outline">maedin-storage</Badge>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            getDatabaseStatusTone(
                              databaseRefreshing
                                ? "checking"
                                : databaseDashboard.services.d1.status
                            )
                          )}
                        >
                          D1:{" "}
                          {getDatabaseStatusLabel(
                            databaseRefreshing
                              ? "checking"
                              : databaseDashboard.services.d1.status
                          )}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            getDatabaseStatusTone(
                              databaseRefreshing
                                ? "checking"
                                : databaseDashboard.services.r2.status
                            )
                          )}
                        >
                          R2:{" "}
                          {getDatabaseStatusLabel(
                            databaseRefreshing
                              ? "checking"
                              : databaseDashboard.services.r2.status
                          )}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl border bg-background p-2 text-muted-foreground">
                        <Database className="h-4 w-4" />
                      </div>
                      <div className="font-medium">بيانات الملفات</div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      يتم حفظ بيانات الملفات وسجلاتها المرجعية داخل Cloudflare
                      D1.
                    </p>
                  </div>

                  <div className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl border bg-background p-2 text-muted-foreground">
                        <HardDrive className="h-4 w-4" />
                      </div>
                      <div className="font-medium">الملفات الفعلية</div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      يتم حفظ الملفات الفعلية والأصول المرفوعة داخل Cloudflare
                      R2.
                    </p>
                  </div>

                  <div className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl border bg-background p-2 text-muted-foreground">
                        <ServerCog className="h-4 w-4" />
                      </div>
                      <div className="font-medium">عمليات الرفع والتحقق</div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      تتم عمليات الرفع والتحقق والربط بين D1 وR2 عبر Cloudflare
                      Workers.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
              <CardHeader className="border-b border-slate-100/80 pb-6">
                <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950">
                  إحصاءات تشغيلية
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600">
                  يتم تحديثها من بيانات التخزين الحالية عبر Cloudflare Worker.
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {databaseMetricCards.map(metric => {
                    const Icon = metric.icon;

                    return (
                      <div
                        key={metric.title}
                        className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">
                              {metric.title}
                            </p>
                            <p
                              className="text-3xl font-semibold tracking-tight"
                              dir={metric.valueDir}
                            >
                              {metric.value}
                            </p>
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            <Badge variant="secondary">{metric.helper}</Badge>
                            <div className="rounded-xl border bg-background p-2 text-muted-foreground">
                              <Icon className="h-4 w-4" />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
              <CardHeader className="border-b border-slate-100/80 pb-6">
                <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950">
                  عمليات إدارية
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600">
                  المتاح حاليًا هو إعادة فحص الخدمات وتحديث القيم المعروضة فقط.
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  {DATABASE_ACTION_CARDS.map(action => {
                    const Icon = action.icon;
                    const isRefreshAction = action.key === "refreshStatus";
                    const isBusy = isRefreshAction && databaseRefreshing;
                    const status: DatabaseUiStatus = isRefreshAction
                      ? databaseRefreshing
                        ? "checking"
                        : "success"
                      : "not_ready";

                    return (
                      <div
                        key={action.title}
                        className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="rounded-xl border bg-background p-2 text-muted-foreground">
                            <Icon
                              className={cn(
                                "h-4 w-4",
                                isBusy && "animate-spin"
                              )}
                            />
                          </div>
                          <Badge
                            variant={isRefreshAction ? "outline" : "secondary"}
                            className={
                              isRefreshAction
                                ? cn(getDatabaseStatusTone(status))
                                : undefined
                            }
                          >
                            {isRefreshAction
                              ? databaseRefreshing
                                ? "جارٍ الفحص"
                                : "مفعل"
                              : "قريبًا"}
                          </Badge>
                        </div>

                        <div className="mt-4 space-y-2">
                          <div className="font-medium">{action.title}</div>
                          <p className="text-sm leading-6 text-muted-foreground">
                            {action.description}
                          </p>
                        </div>

                        <Button
                          variant="outline"
                          disabled={!isRefreshAction || databaseRefreshing}
                          className="mt-4 w-full"
                          onClick={
                            isRefreshAction
                              ? () =>
                                  void refreshDatabaseDashboard({
                                    manual: true,
                                  })
                              : undefined
                          }
                        >
                          {isRefreshAction
                            ? databaseRefreshing
                              ? "جارٍ التحديث..."
                              : "تحديث الآن"
                            : "غير متاح حاليًا"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <Card className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
                <CardHeader className="border-b border-slate-100/80 pb-6">
                  <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950">
                    تفاصيل تقنية
                  </CardTitle>
                  <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600">
                    معلومات read-only عن البنية الحالية المعتمدة لهذا القسم.
                  </CardDescription>
                </CardHeader>

                <CardContent className="pt-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    {databaseTechnicalDetails.map(item => (
                      <div
                        key={item.label}
                        className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-4"
                      >
                        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          {item.label}
                        </div>
                        <div
                          className="mt-3 font-mono text-sm font-medium text-foreground"
                          dir={item.valueDir}
                        >
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
                <CardHeader className="border-b border-slate-100/80 pb-6">
                  <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950">
                    ملاحظات
                  </CardTitle>
                  <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600">
                    توضيحات تشغيلية مهمة مرتبطة ببنية التخزين الحالية.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4 pt-6">
                  <Alert className="border-dashed border-slate-200 bg-slate-50/60">
                    <CircleAlert className="h-4 w-4" />
                    <AlertTitle>Cloudflare Only</AlertTitle>
                    <AlertDescription>
                      {databaseNotes.map(note => (
                        <p key={note}>{note}</p>
                      ))}
                    </AlertDescription>
                  </Alert>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">No Firebase</Badge>
                    <Badge variant="outline">D1 + R2 + Workers</Badge>
                    <Badge variant="secondary">Advanced Backup Soon</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* =========================
          Role Dialog
      ========================= */}
      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent className="!w-[98vw] !max-w-none h-[92vh] overflow-hidden p-0 sm:!w-[95vw]">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle>
              {editingRoleKey ? "تعديل Role" : "إنشاء Role جديد"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Role Key (unique)</Label>
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
                {DEFAULT_PERMISSIONS.map(perm => {
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
                  {DEFAULT_PERMISSIONS.map(perm => {
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
                  الأساسية مع أي overrides محفوظة للحساب.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    Defaults:{" "}
                    {getRoleDefaultPermissionKeys(adminForm.roleKey).length}
                  </Badge>
                  <Badge variant="secondary">
                    Effective: {adminFormEffectivePermissions.length}
                  </Badge>
                  <Badge variant="outline">
                    Overrides: +
                    {adminFormPermissionOverrides.permissionsAllow.length} / -
                    {adminFormPermissionOverrides.permissionsDeny.length}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <Label>ملخص الـ Overrides</Label>
                <div className="flex flex-wrap gap-2 rounded-lg border border-dashed p-3 min-h-16">
                  {adminFormPermissionOverrides.permissionsAllow.map(
                    permissionKey => (
                      <Badge
                        key={`override-allow-${permissionKey}`}
                        variant="secondary"
                      >
                        + {permissionKey}
                      </Badge>
                    )
                  )}
                  {adminFormPermissionOverrides.permissionsDeny.map(
                    permissionKey => (
                      <Badge
                        key={`override-deny-${permissionKey}`}
                        variant="outline"
                      >
                        - {permissionKey}
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
                    إعادة ضبط الـ Overrides
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
    </DashboardLayout>
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
            Readiness
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

function SettingsSimpleActionPanel({
  title,
  description,
  metrics,
  primaryLabel,
  primaryAction,
  secondaryLabel,
  secondaryAction,
  primaryDisabled,
  primaryBusyLabel,
  isPrimaryBusy = false,
  notice,
}: {
  title: string;
  description: string;
  metrics: Array<{
    label: string;
    value: string;
    helper: string;
  }>;
  primaryLabel: string;
  primaryAction: () => void;
  secondaryLabel?: string;
  secondaryAction?: () => void;
  primaryDisabled?: boolean;
  primaryBusyLabel?: string;
  isPrimaryBusy?: boolean;
  notice?: ReactNode;
}) {
  return (
    <Card className="overflow-hidden rounded-[26px] border-[#17284a] bg-[linear-gradient(180deg,#08122f_0%,#020617_100%)] text-white shadow-[0_26px_60px_-42px_rgba(2,6,23,0.9)]">
      <CardHeader className="gap-3 border-b border-white/10 pb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="rounded-2xl border border-[#F2B705]/25 bg-[#F2B705]/10 p-3 text-[#F2B705]">
            <Save className="h-5 w-5" />
          </div>
        </div>

        <div className="space-y-2">
          <CardTitle className="text-xl font-semibold text-white">
            {title}
          </CardTitle>
          <CardDescription className="text-sm leading-7 text-white/65">
            {description}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {metrics.map(metric => (
            <SettingsSidebarMetric
              key={metric.label}
              label={metric.label}
              value={metric.value}
              helper={metric.helper}
            />
          ))}
        </div>

        {notice}
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-3 border-t border-white/10 pt-5">
        {secondaryLabel && secondaryAction ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            onClick={secondaryAction}
          >
            {secondaryLabel}
          </Button>
        ) : null}

        <Button
          type="button"
          className="h-11 rounded-xl bg-[#F2B705] text-slate-950 hover:bg-[#e0ab00]"
          onClick={primaryAction}
          disabled={primaryDisabled || isPrimaryBusy}
        >
          {isPrimaryBusy ? (
            <>
              <Spinner className="h-4 w-4" />
              {primaryBusyLabel || primaryLabel}
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {primaryLabel}
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
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
  children,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
      <CardHeader className="border-b border-slate-100/80 pb-6">
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
      <CardContent className="pt-6">{children}</CardContent>
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
          {error ? "Needs review" : hasValue ? "Ready" : "Pending"}
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

function SettingsSavePanel({
  appDirty,
  savingApp,
  appIssues,
  changedFields,
  onReset,
  onSave,
}: {
  appDirty: boolean;
  savingApp: boolean;
  appIssues: string[];
  changedFields: Array<keyof AppSettings>;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <Card className="overflow-hidden rounded-[26px] border-[#17284a] bg-[linear-gradient(180deg,#08122f_0%,#020617_100%)] text-white shadow-[0_26px_60px_-42px_rgba(2,6,23,0.9)]">
      <CardHeader className="gap-3 border-b border-white/10 pb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="rounded-2xl border border-[#F2B705]/25 bg-[#F2B705]/10 p-3 text-[#F2B705]">
            <Save className="h-5 w-5" />
          </div>
          <Badge
            variant="outline"
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-semibold shadow-none",
              appDirty
                ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
            )}
          >
            {appDirty ? "Dirty State" : "In Sync"}
          </Badge>
        </div>

        <div className="space-y-2">
          <CardTitle className="text-xl font-semibold text-white">
            Save Changes
          </CardTitle>
          <CardDescription className="text-sm leading-7 text-white/65">
            راجع الحقول المعدلة ثم احفظها إلى `settings/app` من دون أي تغيير على
            منطق الحفظ أو بنية البيانات.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <SettingsSidebarMetric
            label="الحقول المعدلة"
            value={formatNumberEN(changedFields.length)}
            helper="تتبع حي للتغييرات غير المحفوظة"
          />
          <SettingsSidebarMetric
            label="ملاحظات التحقق"
            value={formatNumberEN(appIssues.length)}
            helper="راجع الحقول المميزة قبل الحفظ"
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-white/90">
              سجل التعديلات
            </div>
            <span className="text-xs text-white/45">Live</span>
          </div>

          <div className="mt-4 space-y-2">
            {changedFields.length > 0 ? (
              changedFields.map(fieldKey => (
                <div
                  key={fieldKey}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-sm"
                >
                  <span className="text-white/88">
                    {APP_SETTINGS_LABELS[fieldKey]}
                  </span>
                  <span className="text-xs text-white/45">Modified</span>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-sm text-white/60">
                لا توجد تعديلات غير محفوظة حاليًا. أي تحديث جديد سيظهر هنا
                مباشرة.
              </div>
            )}
          </div>
        </div>

        {appIssues.length > 0 ? (
          <Alert className="border-amber-400/20 bg-amber-400/10 text-white">
            <CircleAlert className="h-4 w-4 text-amber-200" />
            <AlertTitle className="text-amber-100">
              يلزم مراجعة بعض الحقول
            </AlertTitle>
            <AlertDescription className="space-y-1 text-amber-50/90">
              {appIssues.slice(0, 3).map(issue => (
                <p key={issue}>{issue}</p>
              ))}
              {appIssues.length > 3 ? (
                <p>
                  وهناك {formatNumberEN(appIssues.length - 3)} ملاحظات إضافية.
                </p>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-emerald-400/20 bg-emerald-400/10 text-white">
            <CheckCircle2 className="h-4 w-4 text-emerald-200" />
            <AlertTitle className="text-emerald-100">
              الإعدادات جاهزة للحفظ
            </AlertTitle>
            <AlertDescription className="text-emerald-50/90">
              جميع الوحدات الأساسية مكتملة ويمكن ترحيلها مباشرة إلى الإعدادات
              العامة.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-3 border-t border-white/10 pt-5">
        <Button
          type="button"
          variant="outline"
          className="h-11 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
          onClick={onReset}
          disabled={!appDirty || savingApp}
        >
          تراجع عن التعديلات
        </Button>

        <Button
          type="button"
          className="h-11 rounded-xl bg-[#F2B705] text-slate-950 hover:bg-[#e0ab00]"
          onClick={onSave}
          disabled={!appDirty || savingApp}
        >
          {savingApp ? (
            <>
              <Spinner className="h-4 w-4" />
              جاري حفظ التغييرات...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
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
      className={cn(
        "flex items-start justify-between gap-4 rounded-[22px] border px-5 py-4 transition-colors",
        value
          ? "border-emerald-200 bg-emerald-50/70"
          : "border-slate-200 bg-slate-50/70"
      )}
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
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
            {value ? "Enabled" : "Disabled"}
          </Badge>
        </div>
        {description ? (
          <p className="max-w-2xl text-sm leading-7 text-slate-600">
            {description}
          </p>
        ) : null}
      </div>

      <Switch checked={value} onCheckedChange={onChange} />
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
                  Key
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
                    English
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
