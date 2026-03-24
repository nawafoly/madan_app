// client/src/pages/admin/Settings.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
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
  CheckCircle2,
  CircleAlert,
  Clock3,
  Files,
  FolderOpen,
  Globe,
  HardDrive,
  RefreshCw,
  ServerCog,
  type LucideIcon,
} from "lucide-react";

import { db } from "@/_core/firebase";
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
  roleKey: string; // owner/admin/accountant/staff/client
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
type DatabaseMetricKey = "totalFiles" | "totalBytes" | "latestUploadAt" | "d1Records";
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

function formatDatabaseMetricSource(source: DocumentStorageMetricSource, hasValue: boolean) {
  if (!hasValue) return "غير متاح";
  if (source === "r2") return "من R2";
  if (source === "d1") return "من D1";
  return "—";
}

function formatDatabaseCount(value: number | null) {
  if (value === null) return "—";
  return value.toLocaleString("ar-SA");
}

function formatDatabaseBytes(value: number | null) {
  if (value === null) return "—";
  if (value === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toLocaleString("en-US", {
    maximumFractionDigits: size >= 100 ? 0 : size >= 10 ? 1 : 2,
  })} ${units[unitIndex]}`;
}

function formatDatabaseTimestamp(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDatabaseServiceDetail(detail: string | null | undefined, fallback: string) {
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

  // Existing docs
  const [app, setApp] = useState<AppSettings>({
    name: "",
    email: "",
    phone: "",
    address: "",
    minInvestment: "",
    maxInvestment: "",
    defaultReturn: "",
    defaultHorizonYears: "",
  });

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
  const [promoteRoleKey, setPromoteRoleKey] = useState<AppRoleKey>("accountant");
  const [promoting, setPromoting] = useState(false);
  const [roleInvites, setRoleInvites] = useState<RoleInviteDoc[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleKey, setInviteRoleKey] =
    useState<AppRoleKey>("accountant");
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
      owner: { ar: "أونر", en: "Owner" },
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
  const [databaseDashboard, setDatabaseDashboard] = useState<DocumentStorageDashboardSnapshot>(() =>
    databaseWorkerUrl
      ? EMPTY_DATABASE_DASHBOARD
      : createUnavailableDatabaseDashboard("not_ready", "Missing VITE_R2_UPLOAD_WORKER_URL")
  );
  const [databaseRefreshing, setDatabaseRefreshing] = useState(false);
  const [databaseLoaded, setDatabaseLoaded] = useState(Boolean(!databaseWorkerUrl));

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
    notes: "",
    permissionsAllow: [],
    permissionsDeny: [],
  });

  // Import JSON
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [contractExportItems, setContractExportItems] = useState<ContractExportCandidate[]>([]);
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

      if (appSnap.exists()) {
        const d = appSnap.data() as any;
        setApp((prev) => ({ ...prev, ...(d || {}) }));
      }
      if (notifSnap.exists()) setNotifications(notifSnap.data() as any);
      if (secSnap.exists()) setSecurity(secSnap.data() as any);

      if (labelsSnap.exists()) {
        const d = labelsSnap.data() as any;
        setLabels((prev) => ({
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
        setFlags((prev) => ({
          ...prev,
          ...d,
        }));
      }

      if (contentSnap.exists()) {
        const d = contentSnap.data() as any;
        setContent((prev) => ({
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
        createUnavailableDatabaseDashboard("not_ready", "Missing VITE_R2_UPLOAD_WORKER_URL")
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
      const reason = e instanceof Error ? e.message : "document_storage_snapshot_failed";
      console.error("database dashboard refresh failed:", e);
      setDatabaseDashboard(createUnavailableDatabaseDashboard("failed", reason));
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
      setSelectedContractIds((previous) =>
        previous.filter((contractId) => rows.some((row) => row.id === contractId))
      );
      if (manual) {
        toast.success("Contract list refreshed.");
      }
    } catch (error) {
      console.error("contract export candidates failed:", error);
      const message = error instanceof Error ? error.message : "Failed to load contracts.";
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
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as AdminUserDoc[];
        setAdminUsers(rows);
      },
      (err) => {
        console.error("admin_users snapshot error:", err);
        setError("تعذر تحميل بيانات حسابات الإدارة (صلاحيات/اتصال).");
      }
    );

    // Realtime: role_invites
    const unsubInvites = onSnapshot(
      collection(db, "role_invites"),
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as RoleInviteDoc[];
        rows.sort((a, b) =>
          String(a.email || "").localeCompare(String(b.email || ""))
        );
        setRoleInvites(rows);
      },
      (err) => {
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
    try {
      await persistSettingsDoc("app", app as unknown as Record<string, unknown>, "Updated app settings");
      toast.success("تم حفظ الإعدادات العامة");
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ الإعدادات العامة");
    }
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
    setRoleForm((p) => {
      const exists = p.permissions.includes(perm);
      return {
        ...p,
        permissions: exists
          ? p.permissions.filter((x) => x !== perm)
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
      const exists = roles.some((r) => r.key === key);
      if (!editingRoleKey && exists) return toast.error("Role Key موجود مسبقًا");

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
          ? roles.filter((r) => r.key !== editingRoleKey).concat(nowRole)
          : roles.filter((r) => r.key !== key).concat(nowRole);

      next.sort((a, b) => a.key.localeCompare(b.key));

      await saveRolesDoc(next);
      setRoles(next);

      // Optional: keep uiRoles labels in sync
      setLabels((prev) => ({
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
      const next = roles.filter((r) => r.key !== roleKey);
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

  const roleOptions = useMemo(() => {
    const active = roles.filter((r) => r.isActive);
    if (active.length) return active;
    return [
      { key: "owner", nameAr: "أونر" },
      { key: "admin", nameAr: "أدمن" },
      { key: "accountant", nameAr: "محاسب" },
      { key: "staff", nameAr: "موظف" },
      { key: "client", nameAr: "عميل" },
      { key: "guest", nameAr: "زائر" },
    ] as any[];
  }, [roles]);

  const openCreateAdmin = () => {
    setEditingAdminId(null);
    setAdminForm({
      displayName: "",
      email: "",
      roleKey: "staff",
      title: "",
      isActive: true,
      notes: "",
      permissionsAllow: [],
      permissionsDeny: [],
    });
    setIsAdminDialogOpen(true);
  };

  const openEditAdmin = (u: AdminUserDoc) => {
    setEditingAdminId((u.email || "").trim().toLowerCase());
    setAdminForm({
      displayName: u.displayName || "",
      email: u.email || "",
      roleKey: u.roleKey || "staff",
      title: u.title || "",
      isActive: !!u.isActive,
      notes: u.notes || "",
      permissionsAllow: u.permissionsAllow || [],
      permissionsDeny: u.permissionsDeny || [],
    });
    setIsAdminDialogOpen(true);
  };

  const handleSaveAdminUser = async () => {
    const displayName = adminForm.displayName.trim();
    const email = adminForm.email.trim().toLowerCase();
    const roleKey = adminForm.roleKey;

    if (!displayName) return toast.error("اسم الحساب مطلوب");
    if (!email || !email.includes("@")) return toast.error("البريد غير صحيح");
    if (!roleKey) return toast.error("اختر Role");

    // ✅ sanitize arrays
    const permissionsAllow = Array.from(
      new Set(adminForm.permissionsAllow || [])
    );
    const permissionsDeny = Array.from(new Set(adminForm.permissionsDeny || []));

    try {
      // ✅ ALWAYS upsert by emailLower (docId = email)
      await auditedSetDoc({
        ref: doc(db, "admin_users", email),
        data: {
          ...adminForm,
          displayName,
          email,
          roleKey,
          permissionsAllow,
          permissionsDeny,

          // ✅ حافظ على createdAt إذا موجود (لا تعيد تصفيره)
          createdAt: (adminForm as any).createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        options: { merge: true },
        action: editingAdminId ? AUDIT_ACTIONS.USER_UPDATED : AUDIT_ACTIONS.USER_CREATED,
        category: "user",
        entityType: "user",
        source: settingsSource(editingAdminId ? "update_admin_user" : "create_admin_user"),
        relatedIds: { userId: email },
        message: `${editingAdminId ? "Updated" : "Created"} admin user ${email}`,
        meta: {
          roleKey,
          permissionsAllow,
          permissionsDeny,
          targetUserEmail: email,
        },
        ignoreFields: ["updatedAt"],
      });

      // ✅ تنظيف تلقائي: لو كنت تعدّل سجل قديم (random id) أو تغير الإيميل
      // احذف الوثيقة القديمة إذا كانت مختلفة عن email الحالي
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

      toast.success(editingAdminId ? "تم تحديث حساب الإدارة" : "تم إنشاء حساب إدارة جديد");
      setIsAdminDialogOpen(false);
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ حساب الإدارة");
    }

  };

  const handleToggleAdminActive = async (u: AdminUserDoc) => {
    try {
      const id = (u.email || u.id || "").trim().toLowerCase(); // ✅ canonical
      await auditedUpdateDoc({
        ref: doc(db, "admin_users", id),
        data: {
          isActive: !u.isActive,
          updatedAt: serverTimestamp(),
        },
        action: u.isActive ? AUDIT_ACTIONS.USER_DISABLED : AUDIT_ACTIONS.USER_ENABLED,
        category: "user",
        entityType: "user",
        source: settingsSource(u.isActive ? "disable_admin_user" : "enable_admin_user"),
        relatedIds: { userId: id },
        message: `${u.isActive ? "Disabled" : "Enabled"} admin user ${id}`,
        meta: {
          targetUserEmail: id,
        },
      });
      toast.success(u.isActive ? "تم تعطيل الحساب" : "تم تفعيل الحساب");
    } catch (e) {
      console.error(e);
      toast.error("فشل تحديث حالة الحساب");
    }
  };


  const handleDeleteAdmin = async (u: AdminUserDoc) => {
    try {
      const id = (u.email || u.id || "").trim().toLowerCase(); // ✅ canonical
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
      toast.success("تم حذف الحساب");
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
    if (!roleKey) return toast.error("اختر Role");

    setPromoting(true);
    try {
      // ✅ ابحث عن المستخدم في users حسب email
      const q = query(collection(db, "users"), where("email", "==", email), limit(1));
      const snap = await getDocs(q);

      if (snap.empty) {
        toast.error("هذا الإيميل ما له حساب مسجل (لا يوجد users doc). خليّه يسوي تسجيل مرة واحدة ثم رقّيه.");
        return;
      }

      const userDoc = snap.docs[0];
      const userData = userDoc.data() as any;
      const beforeAdminSnap = await getDoc(doc(db, "admin_users", email));
      const beforeAdminData = beforeAdminSnap.exists() ? beforeAdminSnap.data() : null;

      // ✅ (1) تحديث role داخل users
      await updateDoc(doc(db, "users", userDoc.id), {
        role: roleKey,
        updatedAt: serverTimestamp(),
      });

      // ✅ (2) إنشاء/تحديث سجل داخل admin_users عشان يظهر في قسم حسابات الإدارة
      // نخلي docId = email (أسهل تعديل لاحقًا)
      await setDoc(
        doc(db, "admin_users", email),
        {
          displayName: userData?.displayName || userData?.name || email.split("@")[0],
          email,
          roleKey,          // نفس المفتاح اللي تستخدمه في الواجهة
          title: "",
          isActive: true,
          notes: "",
          permissionsAllow: [],
          permissionsDeny: [],
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
        message: `Promoted user ${email} to ${roleKey}`,
        changes: diffAuditTargets([
          {
            label: "user",
            before: userData,
            after: refreshedUserSnap.exists() ? refreshedUserSnap.data() : null,
          },
          {
            label: "admin_user",
            before: beforeAdminData,
            after: refreshedAdminSnap.exists() ? refreshedAdminSnap.data() : null,
          },
        ]),
        meta: {
          roleKey,
          targetUserEmail: email,
        },
      });

      toast.success(`تمت الترقية + إضافته لحسابات الإدارة: ${email} → ${roleKey}`);
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
    if (!roleKey) return toast.error("اختر Role");

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
        sections: ["app", "notifications", "security", "roles", "labels", "flags", "content"],
        roleCount: s.roles.length,
      },
      targets: [
        { ref: doc(db, "settings", "app"), entityType: "settings", label: "app" },
        { ref: doc(db, "settings", "notifications"), entityType: "settings", label: "notifications" },
        { ref: doc(db, "settings", "security"), entityType: "settings", label: "security" },
        { ref: doc(db, "settings", "roles"), entityType: "settings", label: "roles" },
        { ref: doc(db, "settings", "labels"), entityType: "settings", label: "labels" },
        { ref: doc(db, "settings", "flags"), entityType: "settings", label: "flags" },
        { ref: doc(db, "settings", "content"), entityType: "settings", label: "content" },
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
      new Set(contractExportItems.map((item) => String(item.status || "").trim()).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right));
  }, [contractExportItems]);

  const filteredContractExportItems = useMemo(() => {
    const normalizedSearch = contractSearch.trim().toLowerCase();
    return contractExportItems.filter((item) => {
      const matchesStatus =
        contractStatusFilter === "all" || String(item.status || "") === contractStatusFilter;

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
    filteredContractExportItems.every((item) => selectedContractIdSet.has(item.id));

  const toggleContractSelection = (contractId: string, checked: boolean) => {
    setSelectedContractIds((previous) => {
      if (checked) {
        return Array.from(new Set([...previous, contractId]));
      }
      return previous.filter((value) => value !== contractId);
    });
  };

  const toggleSelectAllFilteredContracts = (checked: boolean) => {
    setSelectedContractIds((previous) => {
      if (!checked) {
        const filteredIds = new Set(filteredContractExportItems.map((item) => item.id));
        return previous.filter((value) => !filteredIds.has(value));
      }
      return Array.from(
        new Set([...previous, ...filteredContractExportItems.map((item) => item.id)])
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
        entityId: result.summary.exportedContractCount === 1 ? selectedContractIds[0] : "multi",
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
      const message = error instanceof Error ? error.message : "Contract export failed.";
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
        entityId: result.summary.exportedContractCount === 1 ? selectedContractIds[0] : "multi",
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
      const message = error instanceof Error ? error.message : "Excel export failed.";
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

    return DATABASE_OVERVIEW_CARDS.map((card) => {
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
      const status: DatabaseUiStatus = databaseRefreshing ? "checking" : service.status;
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
  }, [databaseDashboard, databaseLoaded, databaseRefreshing, databaseWorkerUrl]);

  const databaseMetricCards = useMemo(() => {
    return DATABASE_METRIC_CARDS.map((metric) => {
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
            value: formatDatabaseTimestamp(databaseDashboard.metrics.latestUploadAt),
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

  const databaseTechnicalDetails = useMemo(() => {
    return DATABASE_TECHNICAL_DETAILS.map((item) => {
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
      <div className="container py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">الإعدادات</h1>
          <p className="text-muted-foreground">
            مركز التحكم الأساسي للمنصة (Firebase)
          </p>
          {error ? <p className="text-red-600 mt-2 text-sm">{error}</p> : null}
        </div>

        <Tabs defaultValue="general">
          {/* ✅ Mobile: horizontal scroll بدل wrap عشان ما ينقص شيء */}
          <TabsList className="w-full h-auto justify-start gap-2 overflow-x-auto flex-nowrap whitespace-nowrap">
            <TabsTrigger value="general" className="shrink-0 whitespace-nowrap">
              <SettingsIcon className="w-4 h-4 ml-2" /> عام
            </TabsTrigger>

            <TabsTrigger value="notifications" className="shrink-0 whitespace-nowrap">
              <Bell className="w-4 h-4 ml-2" /> الإشعارات
            </TabsTrigger>

            <TabsTrigger value="security" className="shrink-0 whitespace-nowrap">
              <Shield className="w-4 h-4 ml-2" /> الأمان
            </TabsTrigger>

            <TabsTrigger value="roles" className="shrink-0 whitespace-nowrap">
              <KeyRound className="w-4 h-4 ml-2" /> الأدوار والصلاحيات
            </TabsTrigger>

            <TabsTrigger value="admins" className="shrink-0 whitespace-nowrap">
              <Users className="w-4 h-4 ml-2" /> حسابات الإدارة
            </TabsTrigger>

            <TabsTrigger value="labels" className="shrink-0 whitespace-nowrap">
              <Tags className="w-4 h-4 ml-2" /> المسميات
            </TabsTrigger>

            <TabsTrigger value="flags" className="shrink-0 whitespace-nowrap">
              <SlidersHorizontal className="w-4 h-4 ml-2" /> Feature Flags
            </TabsTrigger>

            <TabsTrigger value="content" className="shrink-0 whitespace-nowrap">
              <Type className="w-4 h-4 ml-2" /> محتوى الموقع
            </TabsTrigger>

            <TabsTrigger value="backup" className="shrink-0 whitespace-nowrap">
              <FileDown className="w-4 h-4 ml-2" /> Backup
            </TabsTrigger>

            <TabsTrigger value="database" className="shrink-0 whitespace-nowrap">
              <Database className="w-4 h-4 ml-2" /> قاعدة البيانات
            </TabsTrigger>
          </TabsList>

          {/* =========================
              General
          ========================= */}
          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>معلومات المنصة</CardTitle>
                <CardDescription>بيانات التواصل والضبط العام</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field
                  label="اسم المنصة"
                  value={app.name}
                  onChange={(v: string) => setApp({ ...app, name: v })}
                />
                <Field
                  label="البريد الإلكتروني"
                  value={app.email}
                  onChange={(v: string) => setApp({ ...app, email: v })}
                />
                <Field
                  label="رقم الهاتف"
                  value={app.phone}
                  onChange={(v: string) => setApp({ ...app, phone: v })}
                />
                <Field
                  label="العنوان"
                  value={app.address}
                  onChange={(v: string) => setApp({ ...app, address: v })}
                />

                <div className="grid md:grid-cols-4 gap-4">
                  <Field
                    label="الحد الأدنى للاستثمار"
                    value={app.minInvestment}
                    onChange={(v: string) =>
                      setApp({ ...app, minInvestment: v })
                    }
                  />
                  <Field
                    label="الحد الأعلى للاستثمار"
                    value={app.maxInvestment}
                    onChange={(v: string) =>
                      setApp({ ...app, maxInvestment: v })
                    }
                  />
                  <Field
                    label="العائد الافتراضي %"
                    value={app.defaultReturn}
                    onChange={(v: string) =>
                      setApp({ ...app, defaultReturn: v })
                    }
                  />
                  <Field
                    label="الأفق الافتراضي (سنوات)"
                    value={app.defaultHorizonYears}
                    onChange={(v: string) =>
                      setApp({ ...app, defaultHorizonYears: v })
                    }
                  />
                </div>

                <Button className="bg-[#F2B705]" onClick={saveApp}>
                  حفظ
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* =========================
              Notifications
          ========================= */}
          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>الإشعارات</CardTitle>
                <CardDescription>تحكم في إشعارات النظام</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Toggle
                  label="إشعارات البريد"
                  value={notifications.email}
                  onChange={(v: boolean) =>
                    setNotifications({ ...notifications, email: v })
                  }
                />
                <Toggle
                  label="إشعارات SMS"
                  value={notifications.sms}
                  onChange={(v: boolean) =>
                    setNotifications({ ...notifications, sms: v })
                  }
                />
                <Toggle
                  label="استثمارات جديدة"
                  value={notifications.investments}
                  onChange={(v: boolean) =>
                    setNotifications({ ...notifications, investments: v })
                  }
                />
                <Toggle
                  label="رسائل جديدة"
                  value={notifications.messages}
                  onChange={(v: boolean) =>
                    setNotifications({ ...notifications, messages: v })
                  }
                />

                <Button className="bg-[#F2B705]" onClick={saveNotifications}>
                  حفظ
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* =========================
              Security
          ========================= */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>الأمان</CardTitle>
                <CardDescription>إعدادات أمان عامة</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Toggle
                  label="المصادقة الثنائية"
                  value={security.twoFactor}
                  onChange={(v: boolean) => setSecurity({ twoFactor: v })}
                />
                <Button className="bg-[#F2B705]" onClick={saveSecurity}>
                  حفظ
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* =========================
              Roles & Permissions
          ========================= */}
          <TabsContent value="roles">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>الأدوار والصلاحيات</CardTitle>
                  <CardDescription>
                    أنشئ Role لأي تخصص، وحدد صلاحياته — وهذا اللي بنبني عليه
                    Rules لاحقًا
                  </CardDescription>
                </div>
                <Button onClick={openCreateRole} className="bg-[#F2B705]">
                  <Plus className="w-4 h-4 ml-2" /> Role جديد
                </Button>
              </CardHeader>

              <CardContent className="space-y-3">
                {roles.length ? (
                  <div className="grid gap-3">
                    {roles
                      .slice()
                      .sort((a, b) => a.key.localeCompare(b.key))
                      .map((r) => (
                        <div
                          key={r.key}
                          className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border rounded-lg p-4"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline">{r.key}</Badge>
                              <span className="font-bold">{r.nameAr}</span>
                              {!r.isActive ? (
                                <Badge variant="secondary">موقوف</Badge>
                              ) : null}
                              {SYSTEM_ROLE_KEYS.includes(r.key) ? (
                                <Badge>أساسي</Badge>
                              ) : null}
                            </div>

                            {r.description ? (
                              <p className="text-sm text-muted-foreground">
                                {r.description}
                              </p>
                            ) : null}

                            <div className="flex flex-wrap gap-2 mt-2">
                              {r.permissions?.length ? (
                                r.permissions.slice(0, 10).map((p) => (
                                  <Badge key={p} variant="secondary">
                                    {p}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-sm text-muted-foreground">
                                  لا توجد صلاحيات
                                </span>
                              )}
                              {r.permissions?.length > 10 ? (
                                <Badge variant="secondary">
                                  +{r.permissions.length - 10}
                                </Badge>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() => openEditRole(r)}
                            >
                              <Pencil className="w-4 h-4 ml-2" /> تعديل
                            </Button>
                            <Button
                              variant="outline"
                              onClick={async () => {
                                const next = roles.map((x) =>
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
                  <div className="text-sm text-muted-foreground">
                    لا توجد Roles محفوظة بعد. اضغط “Role جديد”.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* =========================
              Admin Accounts
          ========================= */}
          <TabsContent value="admins">

            <Card className="mb-4">
              <CardHeader>
                <CardTitle>ترقية مباشرة (بدون دعوة)</CardTitle>
                <CardDescription>
                  يرقّي مستخدم موجود بالفعل في users حسب الإيميل (لا ينشئ حساب جديد).
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-1 md:col-span-2">
                    <Label>الإيميل</Label>
                    <Input
                      value={promoteEmail}
                      onChange={(e) => setPromoteEmail(e.target.value)}
                      placeholder="info@madanalbena.com"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label>الدور</Label>
                    <Select
                      value={promoteRoleKey}
                      onValueChange={(v: any) => setPromoteRoleKey(v as AppRoleKey)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="accountant">محاسب (accountant)</SelectItem>
                        <SelectItem value="staff">موظف (staff)</SelectItem>
                        <SelectItem value="admin">أدمن (admin)</SelectItem>
                        <SelectItem value="owner">أونر (owner)</SelectItem>
                        <SelectItem value="client">عميل (client)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button className="bg-[#F2B705]" onClick={promoteExistingUserByEmail} disabled={promoting}>
                  {promoting ? "جاري الترقية..." : "ترقية الآن"}
                </Button>
              </CardContent>
            </Card>


            {/* ✅ NEW: Promote by email (no UID needed) */}
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>ترقية دور حسب الإيميل (بدون UID)</CardTitle>
                <CardDescription>
                  اكتب الإيميل وحدد الدور — أول ما يسوي Login/Signup يتم تعيين role
                  تلقائيًا في users/{"{uid}"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-1 md:col-span-2">
                    <Label>الإيميل</Label>
                    <Input
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="accountant@example.com"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label>الدور</Label>
                    <Select
                      value={inviteRoleKey}
                      onValueChange={(v: any) =>
                        setInviteRoleKey(v as AppRoleKey)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="accountant">
                          محاسب (accountant)
                        </SelectItem>
                        <SelectItem value="staff">موظف (staff)</SelectItem>
                        <SelectItem value="admin">أدمن (admin)</SelectItem>
                        <SelectItem value="owner">أونر (owner)</SelectItem>
                        <SelectItem value="client">عميل (client)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>ملاحظات (اختياري)</Label>
                  <Textarea
                    rows={2}
                    value={inviteNotes}
                    onChange={(e) => setInviteNotes(e.target.value)}
                    placeholder="مثال: محاسب رسمي"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button className="bg-[#F2B705]" onClick={upsertRoleInvite}>
                    حفظ الدعوة
                  </Button>
                </div>

                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold">الدعوات الحالية</div>
                    <Badge variant="outline">{roleInvites.length}</Badge>
                  </div>

                  {roleInvites.length ? (
                    <div className="grid gap-3">
                      {roleInvites.map((inv) => (
                        <div
                          key={inv.id}
                          className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline">{inv.email}</Badge>
                              <Badge variant="secondary">
                                Role: {inv.roleKey}
                              </Badge>
                              {inv.isActive ? (
                                <Badge>مفعّلة</Badge>
                              ) : (
                                <Badge variant="secondary">موقوفة</Badge>
                              )}
                            </div>
                            {inv.notes ? (
                              <div className="text-sm text-muted-foreground">
                                {inv.notes}
                              </div>
                            ) : null}
                          </div>

                          <div className="flex gap-2">
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
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      لا توجد دعوات بعد.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Existing admin_users card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>حسابات الإدارة</CardTitle>
                  <CardDescription>
                    إنشاء/تعديل/تفعيل/تعطيل حسابات الإدارة (Firestore فقط)
                  </CardDescription>
                </div>
                <Button onClick={openCreateAdmin} className="bg-[#F2B705]">
                  <Plus className="w-4 h-4 ml-2" /> حساب إداري جديد
                </Button>
              </CardHeader>

              <CardContent className="space-y-3">
                {adminUsers.length ? (
                  <div className="grid gap-3">
                    {adminUsers
                      .slice()
                      .sort((a, b) =>
                        String(a.email || "").localeCompare(
                          String(b.email || "")
                        )
                      )
                      .map((u) => (
                        <div
                          key={u.id}
                          className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">ID: {u.id}</Badge>
                              <span className="font-bold">{u.displayName}</span>
                              {u.isActive ? (
                                <Badge>مفعّل</Badge>
                              ) : (
                                <Badge variant="secondary">معطّل</Badge>
                              )}
                              <Badge variant="secondary">
                                Role: {u.roleKey}
                              </Badge>
                              {u.title ? (
                                <Badge variant="outline">{u.title}</Badge>
                              ) : null}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {u.email}
                            </div>

                            {u.permissionsAllow?.length ||
                              u.permissionsDeny?.length ? (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {(u.permissionsAllow || [])
                                  .slice(0, 6)
                                  .map((p) => (
                                    <Badge
                                      key={`a-${u.id}-${p}`}
                                      variant="secondary"
                                    >
                                      + {p}
                                    </Badge>
                                  ))}
                                {(u.permissionsDeny || [])
                                  .slice(0, 6)
                                  .map((p) => (
                                    <Badge
                                      key={`d-${u.id}-${p}`}
                                      variant="outline"
                                    >
                                      - {p}
                                    </Badge>
                                  ))}
                              </div>
                            ) : null}

                            {u.notes ? (
                              <div className="text-sm text-muted-foreground line-clamp-2">
                                {u.notes}
                              </div>
                            ) : null}
                          </div>

                          <div className="flex gap-2">
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
                  <div className="text-sm text-muted-foreground">
                    لا توجد حسابات إدارة بعد.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* =========================
              Labels
          ========================= */}
          <TabsContent value="labels">
            <Card>
              <CardHeader>
                <CardTitle>المسميات</CardTitle>
                <CardDescription>
                  تغيير كل المسميات اللي تظهر في النظام (أنواع/حالات/أدوار) بدون
                  تعديل كود
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">
                <LabelsEditor
                  title="مسميات أنواع المشاريع (Project Types)"
                  data={labels.projectTypes}
                  onChange={(next) =>
                    setLabels((p) => ({ ...p, projectTypes: next }))
                  }
                />

                <LabelsEditor
                  title="مسميات حالات المشاريع (Project Statuses)"
                  data={labels.projectStatuses}
                  onChange={(next) =>
                    setLabels((p) => ({ ...p, projectStatuses: next }))
                  }
                />

                <LabelsEditor
                  title="مسميات حالات الاستثمارات (Investment Statuses)"
                  data={labels.investmentStatuses}
                  onChange={(next) =>
                    setLabels((p) => ({ ...p, investmentStatuses: next }))
                  }
                />

                <LabelsEditor
                  title="مسميات الأدوار للعرض (UI Roles Labels)"
                  data={labels.uiRoles}
                  onChange={(next) =>
                    setLabels((p) => ({ ...p, uiRoles: next }))
                  }
                />

                <Button className="bg-[#F2B705]" onClick={saveLabels}>
                  حفظ المسميات
                </Button>

                <p className="text-sm text-muted-foreground">
                  * لاحقًا نربط صفحات العرض بحيث تستخدم المسميات من settings/labels
                  بدل النصوص الثابتة.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* =========================
              Flags
          ========================= */}
          <TabsContent value="flags">
            <Card>
              <CardHeader>
                <CardTitle>Feature Flags</CardTitle>
                <CardDescription>
                  تشغيل/إيقاف أجزاء من الموقع فورًا (بدون كود إضافي)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Toggle
                  label="Maintenance Mode (إيقاف الموقع/وضع صيانة)"
                  value={flags.maintenanceMode}
                  onChange={(v: boolean) =>
                    setFlags((p) => ({ ...p, maintenanceMode: v }))
                  }
                />
                <Toggle
                  label="تعطيل الاستثمارات (منع إنشاء استثمار جديد)"
                  value={flags.disableInvestments}
                  onChange={(v: boolean) =>
                    setFlags((p) => ({ ...p, disableInvestments: v }))
                  }
                />
                <Toggle
                  label="تعطيل الرسائل (إخفاء نموذج/صفحة الرسائل)"
                  value={flags.disableMessages}
                  onChange={(v: boolean) =>
                    setFlags((p) => ({ ...p, disableMessages: v }))
                  }
                />
                <Toggle
                  label="VIP Only Mode (عرض محتوى VIP فقط)"
                  value={flags.vipOnlyMode}
                  onChange={(v: boolean) =>
                    setFlags((p) => ({ ...p, vipOnlyMode: v }))
                  }
                />
                <Toggle
                  label="إخفاء مشاريع VIP من العامة"
                  value={flags.hideVipProjects}
                  onChange={(v: boolean) =>
                    setFlags((p) => ({ ...p, hideVipProjects: v }))
                  }
                />

                <Button className="bg-[#F2B705]" onClick={saveFlags}>
                  حفظ Flags
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* =========================
              Content CMS
          ========================= */}
          <TabsContent value="content">
            <Card>
              <CardHeader>
                <CardTitle>محتوى الموقع (CMS)</CardTitle>
                <CardDescription>تحكم بالنصوص العامة للواجهة</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Hero Title (عربي)</Label>
                    <Input
                      value={content.heroTitleAr}
                      onChange={(e) =>
                        setContent((p) => ({
                          ...p,
                          heroTitleAr: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Hero Title (English)</Label>
                    <Input
                      value={content.heroTitleEn}
                      onChange={(e) =>
                        setContent((p) => ({
                          ...p,
                          heroTitleEn: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Hero Subtitle (عربي)</Label>
                    <Textarea
                      rows={3}
                      value={content.heroSubtitleAr}
                      onChange={(e) =>
                        setContent((p) => ({
                          ...p,
                          heroSubtitleAr: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Hero Subtitle (English)</Label>
                    <Textarea
                      rows={3}
                      value={content.heroSubtitleEn}
                      onChange={(e) =>
                        setContent((p) => ({
                          ...p,
                          heroSubtitleEn: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Footer About (عربي)</Label>
                    <Textarea
                      rows={3}
                      value={content.footerAboutAr}
                      onChange={(e) =>
                        setContent((p) => ({
                          ...p,
                          footerAboutAr: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Footer About (English)</Label>
                    <Textarea
                      rows={3}
                      value={content.footerAboutEn}
                      onChange={(e) =>
                        setContent((p) => ({
                          ...p,
                          footerAboutEn: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Contact Email</Label>
                    <Input
                      value={content.contactEmail}
                      onChange={(e) =>
                        setContent((p) => ({
                          ...p,
                          contactEmail: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Contact Phone</Label>
                    <Input
                      value={content.contactPhone}
                      onChange={(e) =>
                        setContent((p) => ({
                          ...p,
                          contactPhone: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <Button className="bg-[#F2B705]" onClick={saveContent}>
                  حفظ المحتوى
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* =========================
              Backup
          ========================= */}
          <TabsContent value="backup" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Backup / Restore</CardTitle>
                <CardDescription>
                  تصدير واستيراد إعدادات المنصة بسرعة
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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

            <Card>
              <CardHeader className="gap-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <CardTitle>Contract Export</CardTitle>
                    <CardDescription className="max-w-2xl leading-6">
                      Generate either the system package or the human-readable Excel bundle from
                      the current live sources: Firestore business data, D1 file metadata, and R2
                      file references.
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {selectedContractIds.length.toLocaleString("en-US")} selected
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void loadContractExportItems({ manual: true })}
                      disabled={
                        contractExportLoading || contractExporting || contractExcelExporting
                      }
                    >
                      <RefreshCw
                        className={cn("mr-2 h-4 w-4", contractExportLoading && "animate-spin")}
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
                    <AlertDescription>{contractExcelExportError}</AlertDescription>
                  </Alert>
                ) : null}

                {contractExportSummary ? (
                  <Alert className="border-emerald-500/30 bg-emerald-500/5 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Last System Package Export</AlertTitle>
                    <AlertDescription className="space-y-1">
                      <p>
                        {contractExportSummary.fileName} generated at{" "}
                        {formatDatabaseTimestamp(contractExportSummary.generatedAt)}.
                      </p>
                      <p>
                        Contracts: {contractExportSummary.rowCounts.contracts} | Investments:{" "}
                        {contractExportSummary.rowCounts.investments} | Attachments:{" "}
                        {contractExportSummary.attachmentCount} | Warnings:{" "}
                        {contractExportSummary.warningCount}
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
                        {formatDatabaseTimestamp(contractExcelExportSummary.generatedAt)}.
                      </p>
                      <p>
                        Workbooks: {contractExcelExportSummary.workbookCount} | Contracts:{" "}
                        {contractExcelExportSummary.rowCounts.contracts} | Files:{" "}
                        {contractExcelExportSummary.rowCounts.files} | Warnings:{" "}
                        {contractExcelExportSummary.warningCount}
                      </p>
                    </AlertDescription>
                  </Alert>
                ) : null}

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-2">
                    <Label htmlFor="contract-export-search">Search contracts</Label>
                    <Input
                      id="contract-export-search"
                      value={contractSearch}
                      onChange={(event) => setContractSearch(event.target.value)}
                      placeholder="Search by contract, project, investor, or investment ID"
                      disabled={contractExporting || contractExcelExporting}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Status filter</Label>
                    <Select value={contractStatusFilter} onValueChange={setContractStatusFilter}>
                      <SelectTrigger disabled={contractExporting || contractExcelExporting}>
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        {contractStatusOptions.map((status) => (
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
                    onClick={() => toggleSelectAllFilteredContracts(!allFilteredSelected)}
                    disabled={
                      !filteredContractExportItems.length ||
                      contractExportLoading ||
                      contractExporting ||
                      contractExcelExporting
                    }
                  >
                    {allFilteredSelected ? "Deselect Filtered" : "Select Filtered"}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => setSelectedContractIds([])}
                    disabled={
                      !selectedContractIds.length || contractExporting || contractExcelExporting
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

                <div className="rounded-2xl border">
                  {contractExportLoading ? (
                    <div className="p-6 text-sm text-muted-foreground">
                      Loading contracts for export...
                    </div>
                  ) : filteredContractExportItems.length ? (
                    <div className="max-h-[420px] divide-y overflow-y-auto">
                      {filteredContractExportItems.map((item) => {
                        const checked = selectedContractIdSet.has(item.id);
                        return (
                          <label
                            key={item.id}
                            className="flex cursor-pointer items-start gap-3 p-4 hover:bg-muted/30"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) =>
                                toggleContractSelection(item.id, value === true)
                              }
                              className="mt-1"
                              disabled={contractExporting || contractExcelExporting}
                            />

                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">{item.id}</p>
                                <Badge variant="outline">{item.status}</Badge>
                                {item.projectTitle ? (
                                  <Badge variant="secondary" className="max-w-full truncate">
                                    {item.projectTitle}
                                  </Badge>
                                ) : null}
                              </div>

                              <p className="text-sm text-muted-foreground">
                                Investor: {item.investorName || "Unknown"}{" "}
                                {item.investorEmail ? `(${item.investorEmail})` : ""}
                              </p>

                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span>Investment: {item.investmentId || "-"}</span>
                                <span>Project: {item.projectId || "-"}</span>
                                <span>
                                  Updated:{" "}
                                  {formatDatabaseTimestamp(
                                    item.updatedAt || item.signedAt || item.createdAt
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
                  Package contents: investors.csv, projects.csv, investments.csv,
                  contracts.csv, interest_requests.csv, files.csv, attachments/, manifest.json,
                  and README.md.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* =========================
              Database
          ========================= */}
          <TabsContent value="database" className="space-y-6">
            <Card>
              <CardHeader className="gap-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Database className="h-4 w-4" />
                      <span>Database / Storage</span>
                    </div>
                    <CardTitle className="text-2xl">
                      قاعدة البيانات والتخزين
                    </CardTitle>
                    <CardDescription className="max-w-2xl leading-6">
                      إدارة بنية الملفات الحالية عبر Cloudflare D1 وR2
                      وWorkers
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Cloudflare</Badge>
                    <Badge variant="secondary">Production</Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {databaseOverviewCards.map((card) => {
                    const Icon = card.icon;

                    return (
                      <div
                        key={card.title}
                        className="rounded-2xl border bg-muted/20 p-4 shadow-sm"
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
                              className={cn("mt-2", getDatabaseStatusTone(card.status))}
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

            <Card>
              <CardHeader>
                <CardTitle>المعمارية الحالية</CardTitle>
                <CardDescription>
                  تدفق الملفات والبيانات من واجهة المنصة إلى طبقة الرفع ثم إلى
                  Cloudflare D1 وR2.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">
                <div className="rounded-2xl border bg-muted/20 p-4">
                  <div
                    className="flex flex-col gap-3 lg:flex-row lg:items-center"
                    dir="ltr"
                  >
                    <div className="flex-1 rounded-xl border bg-background p-4 text-right">
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

                    <div className="flex-1 rounded-xl border bg-background p-4 text-right">
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

                    <div className="flex-1 rounded-xl border bg-background p-4 text-right">
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
                  <div className="rounded-2xl border bg-muted/20 p-4">
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

                  <div className="rounded-2xl border bg-muted/20 p-4">
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

                  <div className="rounded-2xl border bg-muted/20 p-4">
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

            <Card>
              <CardHeader>
                <CardTitle>إحصاءات تشغيلية</CardTitle>
                <CardDescription>
                  يتم تحديثها من بيانات التخزين الحالية عبر Cloudflare Worker.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {databaseMetricCards.map((metric) => {
                    const Icon = metric.icon;

                    return (
                      <div
                        key={metric.title}
                        className="rounded-2xl border bg-muted/20 p-4"
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

            <Card>
              <CardHeader>
                <CardTitle>عمليات إدارية</CardTitle>
                <CardDescription>
                  المتاح حاليًا هو إعادة فحص الخدمات وتحديث القيم المعروضة فقط.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  {DATABASE_ACTION_CARDS.map((action) => {
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
                        className="rounded-2xl border bg-muted/20 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="rounded-xl border bg-background p-2 text-muted-foreground">
                            <Icon className={cn("h-4 w-4", isBusy && "animate-spin")} />
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
                              ? () => void refreshDatabaseDashboard({ manual: true })
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
              <Card>
                <CardHeader>
                  <CardTitle>تفاصيل تقنية</CardTitle>
                  <CardDescription>
                    معلومات read-only عن البنية الحالية المعتمدة لهذا القسم.
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    {databaseTechnicalDetails.map((item) => (
                      <div
                        key={item.label}
                        className="rounded-2xl border bg-muted/20 p-4"
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

              <Card>
                <CardHeader>
                  <CardTitle>ملاحظات</CardTitle>
                  <CardDescription>
                    توضيحات تشغيلية مهمة مرتبطة ببنية التخزين الحالية.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <Alert className="border-dashed bg-muted/20">
                    <CircleAlert className="h-4 w-4" />
                    <AlertTitle>Cloudflare Only</AlertTitle>
                    <AlertDescription>
                      {databaseNotes.map((note) => (
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
                  onChange={(e) =>
                    setRoleForm((p) => ({ ...p, key: e.target.value }))
                  }
                  placeholder="مثال: manager / support / auditor"
                  disabled={
                    !!editingRoleKey && SYSTEM_ROLE_KEYS.includes(editingRoleKey)
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
                  onChange={(e) =>
                    setRoleForm((p) => ({ ...p, nameAr: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>اسم الدور (إنجليزي)</Label>
                <Input
                  value={roleForm.nameEn || ""}
                  onChange={(e) =>
                    setRoleForm((p) => ({ ...p, nameEn: e.target.value }))
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
                    onCheckedChange={(v) =>
                      setRoleForm((p) => ({ ...p, isActive: v }))
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
                onChange={(e) =>
                  setRoleForm((p) => ({ ...p, description: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>الصلاحيات</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {DEFAULT_PERMISSIONS.map((perm) => {
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
                  onChange={(e) =>
                    setAdminForm((p) => ({ ...p, displayName: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-1">
                <Label>البريد</Label>
                <Input
                  value={adminForm.email}
                  onChange={(e) =>
                    setAdminForm((p) => ({ ...p, email: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>الدور</Label>
                <Select
                  value={adminForm.roleKey}
                  onValueChange={(v: any) =>
                    setAdminForm((p) => ({ ...p, roleKey: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((r) => (
                      <SelectItem key={r.key} value={r.key}>
                        {r.nameAr} ({r.key})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>المنصب/العنوان (اختياري)</Label>
                <Input
                  value={adminForm.title || ""}
                  onChange={(e) =>
                    setAdminForm((p) => ({ ...p, title: e.target.value }))
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
                    onCheckedChange={(v) =>
                      setAdminForm((p) => ({ ...p, isActive: v }))
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
                onChange={(e) =>
                  setAdminForm((p) => ({ ...p, notes: e.target.value }))
                }
              />
            </div>

            {/* Permissions overrides */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Permissions Allow (اختياري)</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {DEFAULT_PERMISSIONS.map((perm) => {
                    const checked = (adminForm.permissionsAllow || []).includes(
                      perm.key
                    );
                    return (
                      <Button
                        key={`allow-${perm.key}`}
                        type="button"
                        variant={checked ? "default" : "outline"}
                        className={checked ? "bg-[#F2B705] text-black" : ""}
                        onClick={() => {
                          setAdminForm((p) => {
                            const cur = new Set(p.permissionsAllow || []);
                            if (cur.has(perm.key)) cur.delete(perm.key);
                            else cur.add(perm.key);
                            return {
                              ...p,
                              permissionsAllow: Array.from(cur),
                            };
                          });
                        }}
                      >
                        <div className="flex flex-col items-start leading-tight">
                          <span className="text-sm font-medium">سماح: {perm.label}</span>
                          <span className="text-[11px] opacity-70">{perm.key}</span>
                        </div>
                      </Button>

                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  هذه الصلاحيات تُضاف فوق صلاحيات الـ Role.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Permissions Deny (اختياري)</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {DEFAULT_PERMISSIONS.map((perm) => {
                    const checked = (adminForm.permissionsDeny || []).includes(
                      perm.key
                    );
                    return (
                      <Button
                        key={`deny-${perm.key}`}
                        type="button"
                        variant={checked ? "destructive" : "outline"}
                        onClick={() => {
                          setAdminForm((p) => {
                            const cur = new Set(p.permissionsDeny || []);
                            if (cur.has(perm.key)) cur.delete(perm.key);
                            else cur.add(perm.key);
                            return {
                              ...p,
                              permissionsDeny: Array.from(cur),
                            };
                          });
                        }}
                      >
                        <div className="flex flex-col items-start leading-tight">
                          <span className="text-sm font-medium">منع: {perm.label}</span>
                          <span className="text-[11px] opacity-70">{perm.key}</span>
                        </div>
                      </Button>

                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  هذه الصلاحيات تمنع المستخدم حتى لو كانت موجودة في الـ Role.
                </p>
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

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between border rounded-md px-4 py-3">
      <span className="font-medium">{label}</span>
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
        <h3 className="font-bold">{title}</h3>
        <Button variant="outline" onClick={addRow}>
          <Plus className="w-4 h-4 ml-2" /> إضافة
        </Button>
      </div>

      <div className="grid gap-3">
        {rows.map(([k, val]) => (
          <div
            key={k}
            className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
          >
            <div className="w-full md:w-44">
              <Label>Key</Label>
              <Input value={k} readOnly />
            </div>

            <div className="grid md:grid-cols-2 gap-3 w-full">
              <div className="space-y-1">
                <Label>عربي</Label>
                <Input
                  value={val.ar || ""}
                  onChange={(e) => updateRow(k, "ar", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>English</Label>
                <Input
                  value={val.en || ""}
                  onChange={(e) => updateRow(k, "en", e.target.value)}
                />
              </div>
            </div>

            <Button
              variant="destructive"
              onClick={() => removeRow(k)}
              className="md:self-end"
            >
              <Trash2 className="w-4 h-4 ml-2" /> حذف
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
