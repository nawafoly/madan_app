import { useDeferredValue, useEffect, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatDateTimeEN,
  formatNumberEN,
  formatRelativeTimeFromNowEN,
} from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { collection, limit, onSnapshot, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "@/_core/firebase";
import {
  Activity,
  Copy,
  Database,
  Filter,
  Fingerprint,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User,
  Workflow,
} from "lucide-react";

type RawLog = Record<string, unknown> & { id: string };

type AuditChange = {
  field: string;
  before: unknown;
  after: unknown;
};

type AuditActor = {
  uid: string;
  name: string;
  email: string;
  role: string;
};

type AuditSource = {
  area: string;
  page: string;
  route: string;
  method: string;
};

type AuditLog = {
  id: string;
  action: string;
  category: string;
  severity: string;
  status: string;
  message: string;
  entityType: string;
  entityId: string;
  entityPath: string;
  actor: AuditActor;
  source: AuditSource;
  relatedIds: Record<string, string>;
  changes: AuditChange[];
  meta: Record<string, unknown>;
  createdAt: Date | null;
  requestId: string;
  sessionId: string;
  searchText: string;
  raw: RawLog;
};

type ViewMode = "feed" | "table";

const FILTER_ALL = "all";

const ENTITY_LABELS: Record<string, string> = {
  project: "مشروع",
  investment: "استثمار",
  request: "طلب",
  message: "رسالة",
  contract: "عقد",
  user: "مستخدم",
  settings: "إعدادات",
  finance: "مالي",
  system: "نظام",
  role_invite: "دعوة صلاحية",
};

const ROLE_LABELS: Record<string, string> = {
  owner: "مالك",
  admin: "مدير",
  accountant: "محاسب",
  staff: "موظف",
  client: "عميل",
  system: "نظام",
  script: "سكربت",
  guest: "زائر",
  user: "مستخدم",
};

const AREA_LABELS: Record<string, string> = {
  admin: "لوحة الإدارة",
  client: "بوابة العميل",
  public: "الواجهة العامة",
  function: "الدوال السحابية",
  script: "السكربتات",
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  success: {
    label: "نجح",
    className: "border-emerald-200 bg-emerald-500/10 text-emerald-700",
  },
  failed: {
    label: "فشل",
    className: "border-rose-200 bg-rose-500/10 text-rose-700",
  },
};

const SEVERITY_META: Record<string, { label: string; className: string }> = {
  info: {
    label: "اعتيادي",
    className: "border-slate-200 bg-slate-500/10 text-slate-700",
  },
  warning: {
    label: "تحذير",
    className: "border-amber-200 bg-amber-500/10 text-amber-700",
  },
  critical: {
    label: "حرج",
    className: "border-rose-200 bg-rose-500/10 text-rose-700",
  },
};

const ACTION_LABELS: Record<string, string> = {
  project_created: "إنشاء مشروع",
  project_updated: "تحديث مشروع",
  project_status_changed: "تحديث حالة مشروع",
  project_deleted: "حذف مشروع",
  investment_created: "إنشاء استثمار",
  investment_approved: "اعتماد استثمار",
  investment_rejected: "رفض استثمار",
  investment_status_changed: "تغيير حالة استثمار",
  investment_financials_updated: "تحديث بيانات مالية",
  request_created: "إنشاء طلب",
  request_updated: "تحديث طلب",
  request_status_changed: "تغيير حالة طلب",
  request_rejected: "رفض طلب",
  request_reviewed: "مراجعة طلب",
  message_created: "إنشاء رسالة",
  message_reviewed: "مراجعة رسالة",
  contract_created: "إنشاء عقد",
  contract_uploaded: "رفع عقد",
  contract_signed: "توقيع عقد",
  contract_verified: "توثيق عقد",
  contract_deleted: "حذف عقد",
  user_created: "إنشاء مستخدم",
  user_updated: "تحديث مستخدم",
  user_role_updated: "تعديل صلاحية مستخدم",
  settings_updated: "تحديث الإعدادات",
  settings_imported: "استيراد الإعدادات",
  aggregates_recomputed: "إعادة احتساب المجاميع",
  user_login: "تسجيل دخول",
};

function pickString(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  if (!text || text === "undefined" || text === "null") return fallback;
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseMaybeJson(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

function toDateSafe(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      return Number.isFinite(date.getTime()) ? date : null;
    } catch {
      return null;
    }
  }
  if (typeof (value as { seconds?: unknown }).seconds === "number") {
    return new Date(Number((value as { seconds: number }).seconds) * 1000);
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const date = new Date(Number(value));
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

function normalizeStringMap(value: unknown) {
  const source = parseMaybeJson(value);
  if (!isRecord(source)) return {};
  return Object.fromEntries(
    Object.entries(source)
      .map(([key, entry]) => [key, pickString(entry)])
      .filter(([, entry]) => Boolean(entry))
  );
}

function normalizeMeta(value: unknown) {
  const parsed = parseMaybeJson(value);
  return isRecord(parsed) ? parsed : {};
}

function normalizeChanges(value: unknown): AuditChange[] {
  const parsed = parseMaybeJson(value);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((entry) => {
      const raw = isRecord(entry) ? entry : {};
      return {
        field: pickString(raw.field, "value"),
        before: raw.before ?? null,
        after: raw.after ?? null,
      };
    })
    .filter((entry) => entry.field);
}

function flattenValueText(value: unknown, depth = 0): string {
  if (depth > 4 || value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => flattenValueText(item, depth + 1)).join(" ");
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .flatMap(([key, entry]) => [key, flattenValueText(entry, depth + 1)])
      .join(" ");
  }
  return String(value);
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function truncateText(text: string, length = 140) {
  if (text.length <= length) return text;
  return `${text.slice(0, length).trim()}...`;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function summarizeCounts(values: string[], limitCount = 5) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  const total = values.length || 1;
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, limitCount)
    .map(([label, count]) => ({ label, count, ratio: count / total }));
}

function getEntityLabel(entityType: string) {
  return ENTITY_LABELS[entityType] ?? entityType ?? "كيان";
}

function getRoleLabel(role: string) {
  return ROLE_LABELS[role] ?? role ?? "غير محدد";
}

function getAreaLabel(area: string) {
  return AREA_LABELS[area] ?? area ?? "غير محدد";
}

function getStatusMeta(status: string) {
  return (
    STATUS_META[status] ?? {
      label: status || "غير معروف",
      className: "border-slate-200 bg-slate-500/10 text-slate-700",
    }
  );
}

function getSeverityMeta(severity: string) {
  return (
    SEVERITY_META[severity] ?? {
      label: severity || "غير معروف",
      className: "border-slate-200 bg-slate-500/10 text-slate-700",
    }
  );
}

function humanizeFieldKey(field: string) {
  return field
    .replace(/\[(\d+)\]/g, " #$1")
    .replace(/\./g, " / ")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

function getActionLabel(action: string, entityType: string) {
  const normalized = pickString(action).toLowerCase();
  if (ACTION_LABELS[normalized]) return ACTION_LABELS[normalized];
  const entityLabel = getEntityLabel(entityType);
  if (normalized.includes("create")) return `إنشاء ${entityLabel}`;
  if (normalized.includes("update")) return `تحديث ${entityLabel}`;
  if (normalized.includes("delete")) return `حذف ${entityLabel}`;
  if (normalized.includes("approve")) return `اعتماد ${entityLabel}`;
  if (normalized.includes("reject")) return `رفض ${entityLabel}`;
  if (normalized.includes("sign")) return `توقيع ${entityLabel}`;
  if (normalized.includes("login")) return "تسجيل دخول";
  if (normalized.includes("recompute")) return "إعادة احتساب";
  return normalized.replace(/_/g, " ");
}

function getActionBadgeClass(action: string) {
  const normalized = action.toLowerCase();
  if (normalized.includes("create") || normalized.includes("approve") || normalized.includes("signed")) {
    return "border-emerald-200 bg-emerald-500/10 text-emerald-700";
  }
  if (normalized.includes("delete") || normalized.includes("reject") || normalized.includes("disable")) {
    return "border-rose-200 bg-rose-500/10 text-rose-700";
  }
  if (normalized.includes("update") || normalized.includes("change") || normalized.includes("review")) {
    return "border-sky-200 bg-sky-500/10 text-sky-700";
  }
  if (normalized.includes("import") || normalized.includes("backfill") || normalized.includes("recompute")) {
    return "border-amber-200 bg-amber-500/10 text-amber-700";
  }
  return "border-slate-200 bg-slate-500/10 text-slate-700";
}

function extractChangedKeys(log: AuditLog) {
  const fromMeta = Array.isArray(log.meta.changedKeys)
    ? log.meta.changedKeys.map((value) => pickString(value)).filter(Boolean)
    : [];
  const fromChanges = log.changes.map((change) => change.field).filter(Boolean);
  return uniqueStrings([...fromMeta, ...fromChanges]).map(humanizeFieldKey);
}

function formatDateTimeAR(value: Date | null) {
  return value ? formatDateTimeEN(value) : "بدون تاريخ";
}

function formatRelativeTime(value: Date | null) {
  return value ? formatRelativeTimeFromNowEN(value) : "بدون وقت";
}

function normalizeLog(raw: RawLog): AuditLog {
  const actorRaw = isRecord(raw.actor) ? raw.actor : {};
  const sourceRaw = isRecord(raw.source) ? raw.source : {};
  const meta = normalizeMeta(raw.meta);
  const changes = normalizeChanges(raw.changes);
  const relatedIds = normalizeStringMap(raw.relatedIds);
  const action = pickString(raw.action, "unknown_action");
  const entityType = pickString(raw.entityType, "unknown");
  const entityId = pickString(raw.entityId, raw.id);
  const actor: AuditActor = {
    uid: pickString(actorRaw.uid, "system"),
    name: pickString(actorRaw.name || raw.userName, "غير محدد"),
    email: pickString(actorRaw.email),
    role: pickString(actorRaw.role || raw.userRole, "system"),
  };
  const source: AuditSource = {
    area: pickString(sourceRaw.area, "admin"),
    page: pickString(sourceRaw.page, "unknown"),
    route: pickString(sourceRaw.route),
    method: pickString(sourceRaw.method, "unknown"),
  };
  const createdAt =
    toDateSafe(raw.occurredAt) || toDateSafe(raw.clientTimestamp) || toDateSafe(raw.createdAt);
  const message = pickString(raw.message, getActionLabel(action, entityType));
  const searchText = [
    action,
    message,
    entityType,
    entityId,
    pickString(raw.entityPath),
    actor.uid,
    actor.name,
    actor.email,
    actor.role,
    source.area,
    source.page,
    source.route,
    source.method,
    pickString(raw.requestId),
    pickString(raw.sessionId),
    Object.values(relatedIds).join(" "),
    changes.map((change) => change.field).join(" "),
    flattenValueText(meta),
  ]
    .join(" ")
    .toLowerCase();

  return {
    id: raw.id,
    action,
    category: pickString(raw.category, "system"),
    severity: pickString(raw.severity, "info"),
    status: pickString(raw.status, "success"),
    message,
    entityType,
    entityId,
    entityPath: pickString(raw.entityPath),
    actor,
    source,
    relatedIds,
    changes,
    meta,
    createdAt,
    requestId: pickString(raw.requestId),
    sessionId: pickString(raw.sessionId),
    searchText,
    raw,
  };
}

function isHighRisk(log: AuditLog) {
  return log.status === "failed" || log.severity === "warning" || log.severity === "critical";
}

function DetailValue({
  label,
  value,
  tone,
}: {
  label: string;
  value: unknown;
  tone: "before" | "after";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        tone === "before"
          ? "border-rose-100 bg-rose-500/5"
          : "border-emerald-100 bg-emerald-500/5"
      )}
    >
      <div className="mb-2 text-xs font-medium text-muted-foreground">{label}</div>
      <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-all text-xs leading-6 text-foreground">
        {safeJsonStringify(value)}
      </pre>
    </div>
  );
}

function MetricCard({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  hint: string;
  icon: typeof Activity;
}) {
  const displayValue = typeof value === "number" ? formatNumberEN(value) : value;

  return (
    <Card className="gap-4">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
        <div className="rounded-xl border border-border/70 bg-muted/40 p-2">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        <div className="text-3xl font-semibold tracking-tight">{displayValue}</div>
        <p className="text-xs leading-6 text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function InfoCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border bg-muted/20 p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-2 text-sm font-semibold leading-7">{value || "-"}</div>
      {hint ? <div className="mt-1 text-xs leading-6 text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function DistributionList({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: Array<{ label: string; count: number; ratio: number }>;
  emptyLabel: string;
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium uppercase tracking-[0.2em] text-white/60">{title}</div>
      {items.length ? (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.label} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-white/80">{item.label}</span>
                <span className="text-white/60">{formatNumberEN(item.count)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[#F2B705]"
                  style={{ width: `${Math.max(item.ratio * 100, 8)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}

export default function AuditLogPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState(FILTER_ALL);
  const [severityFilter, setSeverityFilter] = useState(FILTER_ALL);
  const [statusFilter, setStatusFilter] = useState(FILTER_ALL);
  const [sourceAreaFilter, setSourceAreaFilter] = useState(FILTER_ALL);
  const [changesOnly, setChangesOnly] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("feed");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [selectedLogId, setSelectedLogId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const deferredSearch = useDeferredValue(searchQuery.trim().toLowerCase());

  useEffect(() => {
    setLoading(true);
    setError("");

    const auditQuery = query(
      collection(db, "audit_logs"),
      orderBy("createdAt", "desc"),
      limit(2000)
    );

    const unsubscribe = onSnapshot(
      auditQuery,
      (snapshot) => {
        const rows = snapshot.docs.map((docSnapshot) =>
          normalizeLog({
            id: docSnapshot.id,
            ...(docSnapshot.data() as Record<string, unknown>),
          })
        );

        setAuditLogs(rows);
        setLastSyncedAt(new Date());
        setLoading(false);
      },
      (snapshotError) => {
        console.error("audit log snapshot error", snapshotError);
        setError("تعذر تحميل سجل التدقيق الحالي. تحقق من الصلاحيات أو الاتصال.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const entityOptions = useMemo(
    () => uniqueStrings(auditLogs.map((log) => log.entityType)).sort(),
    [auditLogs]
  );

  const sourceAreaOptions = useMemo(
    () => uniqueStrings(auditLogs.map((log) => log.source.area)).sort(),
    [auditLogs]
  );

  const filteredLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      if (entityTypeFilter !== FILTER_ALL && log.entityType !== entityTypeFilter) return false;
      if (severityFilter !== FILTER_ALL && log.severity !== severityFilter) return false;
      if (statusFilter !== FILTER_ALL && log.status !== statusFilter) return false;
      if (sourceAreaFilter !== FILTER_ALL && log.source.area !== sourceAreaFilter) return false;
      if (changesOnly && !log.changes.length) return false;
      if (deferredSearch && !log.searchText.includes(deferredSearch)) return false;
      return true;
    });
  }, [
    auditLogs,
    changesOnly,
    deferredSearch,
    entityTypeFilter,
    severityFilter,
    sourceAreaFilter,
    statusFilter,
  ]);

  useEffect(() => {
    if (!filteredLogs.length) {
      if (selectedLogId) setSelectedLogId("");
      return;
    }
    if (!filteredLogs.some((log) => log.id === selectedLogId)) {
      setSelectedLogId(filteredLogs[0].id);
    }
  }, [filteredLogs, selectedLogId]);

  const selectedLog = useMemo(
    () => filteredLogs.find((log) => log.id === selectedLogId) ?? null,
    [filteredLogs, selectedLogId]
  );

  const filteredRiskyCount = useMemo(
    () => filteredLogs.filter(isHighRisk).length,
    [filteredLogs]
  );
  const filteredFailedCount = useMemo(
    () => filteredLogs.filter((log) => log.status === "failed").length,
    [filteredLogs]
  );
  const uniqueActorsCount = useMemo(
    () =>
      new Set(
        filteredLogs.map((log) => log.actor.uid || log.actor.email || log.actor.name).filter(Boolean)
      ).size,
    [filteredLogs]
  );
  const uniqueSessionsCount = useMemo(
    () => new Set(filteredLogs.map((log) => log.sessionId).filter(Boolean)).size,
    [filteredLogs]
  );
  const entityDistribution = useMemo(
    () => summarizeCounts(filteredLogs.map((log) => getEntityLabel(log.entityType)), 5),
    [filteredLogs]
  );
  const areaDistribution = useMemo(
    () => summarizeCounts(filteredLogs.map((log) => getAreaLabel(log.source.area)), 4),
    [filteredLogs]
  );
  const topChangedFields = useMemo(
    () => summarizeCounts(filteredLogs.flatMap((log) => extractChangedKeys(log)), 6),
    [filteredLogs]
  );

  const latestVisibleActivity = filteredLogs[0]?.createdAt ?? auditLogs[0]?.createdAt ?? null;
  const topEntity = entityDistribution[0];
  const topArea = areaDistribution[0];

  const handleResetFilters = () => {
    setSearchQuery("");
    setEntityTypeFilter(FILTER_ALL);
    setSeverityFilter(FILTER_ALL);
    setStatusFilter(FILTER_ALL);
    setSourceAreaFilter(FILTER_ALL);
    setChangesOnly(false);
  };

  const handleCopy = async (label: string, value: string) => {
    if (!value) return;
    if (!navigator?.clipboard) {
      toast.error(`تعذر نسخ ${label}`);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`تم نسخ ${label}`);
    } catch {
      toast.error(`تعذر نسخ ${label}`);
    }
  };

  const selectedChangedKeys = selectedLog ? extractChangedKeys(selectedLog) : [];
  const selectedReferenceEntries = selectedLog
    ? [
        ["المعرف الأساسي", selectedLog.entityId],
        ["المسار", selectedLog.entityPath],
        ["رقم الطلب", selectedLog.requestId],
        ["رقم الجلسة", selectedLog.sessionId],
        ...Object.entries(selectedLog.relatedIds),
      ].filter(([, value]) => Boolean(value))
    : [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-[30px] border border-[#112255] bg-[radial-gradient(circle_at_top_right,rgba(242,183,5,0.18),transparent_32%),linear-gradient(135deg,#020617_0%,#08122f_45%,#030640_100%)] text-white shadow-xl">
          <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.04)_36%,transparent_70%)]" />
          <div className="relative grid gap-8 px-6 py-7 lg:grid-cols-[minmax(0,1.35fr)_360px] lg:px-8 lg:py-8">
            <div className="space-y-5">
              <Badge className="w-fit border-white/15 bg-white/10 text-white shadow-none">
                بث مباشر
              </Badge>
              <div className="space-y-3">
                <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                  <Shield className="h-9 w-9 text-[#F2B705]" />
                  مركز سجل التدقيق
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-white/70 sm:text-base">
                  لوحة مراقبة احترافية لقراءة كل أحداث النظام من `audit_logs` بشكل لحظي، مع فلاتر
                  دقيقة ولوحة تفاصيل كاملة لكل سجل تشمل التغييرات والمصدر والمراجع الفنية.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-white/70">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2">
                  <RefreshCw className="h-3.5 w-3.5 text-[#F2B705]" />
                  آخر 2000 سجل تتم مزامنتها مباشرة
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2">
                  <Activity className="h-3.5 w-3.5 text-[#F2B705]" />
                  {lastSyncedAt ? `تم التحديث ${formatRelativeTime(lastSyncedAt)}` : "بانتظار أول مزامنة"}
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2">
                  <ShieldAlert className="h-3.5 w-3.5 text-[#F2B705]" />
                  {formatNumberEN(filteredRiskyCount)} حدث حساس ضمن العرض الحالي
                </div>
              </div>
            </div>

            <div className="rounded-[26px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <div className="space-y-5">
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.24em] text-white/60">
                    تركيز اللحظة
                  </div>
                  <div className="mt-3 grid gap-3">
                    <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                      <div className="text-xs text-white/60">آخر نشاط ظاهر</div>
                      <div className="mt-2 text-lg font-semibold">
                        {latestVisibleActivity ? formatRelativeTime(latestVisibleActivity) : "لا يوجد"}
                      </div>
                      <div className="mt-1 text-xs text-white/50">
                        {formatDateTimeAR(latestVisibleActivity)}
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                        <div className="text-xs text-white/60">أكثر كيان نشاطاً</div>
                        <div className="mt-2 text-base font-semibold">{topEntity?.label ?? "لا يوجد"}</div>
                        <div className="mt-1 text-xs text-white/50">
                          {topEntity ? `${formatNumberEN(topEntity.count)} سجل` : "بانتظار البيانات"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                        <div className="text-xs text-white/60">المصدر الأكثر استخداماً</div>
                        <div className="mt-2 text-base font-semibold">{topArea?.label ?? "لا يوجد"}</div>
                        <div className="mt-1 text-xs text-white/50">
                          {topArea ? `${formatNumberEN(topArea.count)} سجل` : "بانتظار البيانات"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <Separator className="bg-white/10" />
                <DistributionList
                  title="الحقول الأكثر تغيراً"
                  items={topChangedFields}
                  emptyLabel="لا توجد حقول متغيرة ضمن الفلاتر الحالية."
                />
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="إجمالي السجلات"
            value={formatNumberEN(auditLogs.length)}
            hint="إجمالي السجلات المحملة حالياً من البث المباشر"
            icon={Activity}
          />
          <MetricCard
            title="النتائج الحالية"
            value={formatNumberEN(filteredLogs.length)}
            hint={filteredLogs.length === auditLogs.length ? "بدون استبعاد إضافي" : "مطابقة للفلاتر والبحث الحالي"}
            icon={Filter}
          />
          <MetricCard
            title="الأحداث الحساسة"
            value={formatNumberEN(filteredRiskyCount)}
            hint={`${formatNumberEN(filteredFailedCount)} فشل مباشر ضمن النتائج`}
            icon={ShieldAlert}
          />
          <MetricCard
            title="الجلسات المرصودة"
            value={formatNumberEN(uniqueSessionsCount)}
            hint={`${formatNumberEN(uniqueActorsCount)} منفذ أو مستخدم مميز`}
            icon={Fingerprint}
          />
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-primary" />
              فلاتر وتحكم
            </CardTitle>
            <CardDescription>
              ابحث في اسم المنفذ والكيان والمعرف والجلسة والرسالة والحقول المتغيرة ثم ضيق النتائج
              بحسب النوع والحساسية والحالة والمصدر.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_repeat(4,minmax(0,1fr))]">
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="ابحث باسم المستخدم، الرسالة، المعرف، الجلسة أو المسار..."
                  className="h-11 pr-10"
                />
              </div>
              <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="نوع الكيان" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>كل الكيانات</SelectItem>
                  {entityOptions.map((entityType) => (
                    <SelectItem key={entityType} value={entityType}>
                      {getEntityLabel(entityType)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="الحساسية" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>كل الدرجات</SelectItem>
                  <SelectItem value="info">اعتيادي</SelectItem>
                  <SelectItem value="warning">تحذير</SelectItem>
                  <SelectItem value="critical">حرج</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>كل الحالات</SelectItem>
                  <SelectItem value="success">نجح</SelectItem>
                  <SelectItem value="failed">فشل</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceAreaFilter} onValueChange={setSourceAreaFilter}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="المصدر" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>كل المصادر</SelectItem>
                  {sourceAreaOptions.map((area) => (
                    <SelectItem key={area} value={area}>
                      {getAreaLabel(area)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={changesOnly ? "default" : "outline"}
                  onClick={() => setChangesOnly((current) => !current)}
                >
                  فقط السجلات التي تحتوي تغييرات
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={handleResetFilters}>
                  إعادة ضبط الفلاتر
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                {formatNumberEN(filteredLogs.length)} نتيجة مطابقة
              </div>
            </div>
          </CardContent>
        </Card>

        {error ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-rose-600">{error}</CardContent>
          </Card>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_420px]">
          <Card className="overflow-hidden">
            <CardHeader className="border-b">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <CardTitle>السجل الزمني</CardTitle>
                  <CardDescription>
                    انقر على أي سجل لعرض التفاصيل الكاملة، التغيرات، المراجع الفنية، والحمولة
                    الخام.
                  </CardDescription>
                </div>
                <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
                  <TabsList>
                    <TabsTrigger value="feed">بطاقات</TabsTrigger>
                    <TabsTrigger value="table">جدول</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="flex flex-wrap gap-2">
                {topChangedFields.length ? (
                  topChangedFields.map((field) => (
                    <Badge key={field.label} variant="outline" className="bg-muted/40">
                      {field.label} · {formatNumberEN(field.count)}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="outline" className="bg-muted/40">
                    لا توجد تغييرات بنيوية ضمن النتائج الحالية
                  </Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="px-0 pt-0">
              {loading ? (
                <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                  جاري تحميل سجل التدقيق...
                </div>
              ) : !filteredLogs.length ? (
                <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                  لا توجد سجلات تطابق الفلاتر الحالية.
                </div>
              ) : (
                <Tabs value={viewMode} className="gap-0">
                  <TabsContent value="feed" className="mt-0">
                    <ScrollArea className="h-[62vh] lg:h-[68vh] xl:h-[72vh]">
                      <div className="space-y-3 p-4">
                        {filteredLogs.map((log) => {
                          const statusMeta = getStatusMeta(log.status);
                          const severityMeta = getSeverityMeta(log.severity);
                          const isSelected = selectedLogId === log.id;
                          const changedKeys = extractChangedKeys(log).slice(0, 4);
                          const totalChangedKeys = extractChangedKeys(log).length;

                          return (
                            <button
                              key={log.id}
                              type="button"
                              onClick={() => setSelectedLogId(log.id)}
                              className={cn(
                                "w-full rounded-[24px] border p-4 text-right transition-all duration-150",
                                "hover:border-primary/40 hover:bg-muted/25",
                                isSelected && "border-primary/50 bg-primary/5 shadow-sm"
                              )}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="min-w-0 flex-1 space-y-3">
                                  <div className="flex flex-wrap gap-2">
                                    <Badge className={cn("shadow-none", getActionBadgeClass(log.action))}>
                                      {getActionLabel(log.action, log.entityType)}
                                    </Badge>
                                    <Badge variant="outline">{getEntityLabel(log.entityType)}</Badge>
                                    <Badge className={cn("shadow-none", statusMeta.className)}>
                                      {statusMeta.label}
                                    </Badge>
                                    <Badge className={cn("shadow-none", severityMeta.className)}>
                                      {severityMeta.label}
                                    </Badge>
                                  </div>

                                  <div>
                                    <div className="text-base font-semibold leading-8">{log.message}</div>
                                    <div className="mt-1 text-sm leading-7 text-muted-foreground">
                                      {truncateText(
                                        [
                                          log.actor.name,
                                          getRoleLabel(log.actor.role),
                                          getAreaLabel(log.source.area),
                                          log.entityId && `#${log.entityId}`,
                                        ]
                                          .filter(Boolean)
                                          .join(" • "),
                                        120
                                      )}
                                    </div>
                                  </div>

                                  <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                                    <div className="inline-flex items-center gap-2">
                                      <User className="h-4 w-4" />
                                      <span>{truncateText(log.actor.name || "غير محدد", 26)}</span>
                                    </div>
                                    <div className="inline-flex items-center gap-2">
                                      <Database className="h-4 w-4" />
                                      <span className="font-mono text-xs">#{log.entityId}</span>
                                    </div>
                                    <div className="inline-flex items-center gap-2">
                                      <Workflow className="h-4 w-4" />
                                      <span>{truncateText(log.source.method || "unknown", 28)}</span>
                                    </div>
                                  </div>

                                  {changedKeys.length ? (
                                    <div className="flex flex-wrap gap-2">
                                      {changedKeys.map((field) => (
                                        <Badge key={field} variant="outline" className="bg-background/80">
                                          {field}
                                        </Badge>
                                      ))}
                                      {totalChangedKeys > changedKeys.length ? (
                                        <Badge variant="outline" className="bg-background/80">
                                          +{totalChangedKeys - changedKeys.length}
                                        </Badge>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>

                                <div className="min-w-[120px] text-left text-xs text-muted-foreground">
                                  <div>{formatDateTimeAR(log.createdAt)}</div>
                                  <div className="mt-1">{formatRelativeTime(log.createdAt)}</div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                  <TabsContent value="table" className="mt-0">
                    <ScrollArea className="h-[62vh] lg:h-[68vh] xl:h-[72vh]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>الوقت</TableHead>
                            <TableHead>المنفذ</TableHead>
                            <TableHead>الإجراء</TableHead>
                            <TableHead>الحالة</TableHead>
                            <TableHead>الكيان</TableHead>
                            <TableHead>المعرف</TableHead>
                            <TableHead>عدد التغييرات</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredLogs.map((log) => {
                            const statusMeta = getStatusMeta(log.status);
                            const severityMeta = getSeverityMeta(log.severity);
                            const isSelected = selectedLogId === log.id;

                            return (
                              <TableRow
                                key={log.id}
                                className={cn(
                                  "cursor-pointer transition-colors hover:bg-muted/40",
                                  isSelected && "bg-primary/5"
                                )}
                                onClick={() => setSelectedLogId(log.id)}
                              >
                                <TableCell className="align-top">
                                  <div className="space-y-1 text-xs">
                                    <div>{formatDateTimeAR(log.createdAt)}</div>
                                    <div className="text-muted-foreground">
                                      {formatRelativeTime(log.createdAt)}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="align-top">
                                  <div className="space-y-1">
                                    <div className="font-medium">{log.actor.name}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {getRoleLabel(log.actor.role)}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="align-top">
                                  <div className="space-y-2">
                                    <Badge className={cn("shadow-none", getActionBadgeClass(log.action))}>
                                      {getActionLabel(log.action, log.entityType)}
                                    </Badge>
                                    <div className="max-w-[300px] text-xs leading-6 text-muted-foreground">
                                      {truncateText(log.message, 86)}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="align-top">
                                  <div className="flex flex-wrap gap-2">
                                    <Badge className={cn("shadow-none", statusMeta.className)}>
                                      {statusMeta.label}
                                    </Badge>
                                    <Badge className={cn("shadow-none", severityMeta.className)}>
                                      {severityMeta.label}
                                    </Badge>
                                  </div>
                                </TableCell>
                                <TableCell className="align-top">
                                  <Badge variant="outline">{getEntityLabel(log.entityType)}</Badge>
                                </TableCell>
                                <TableCell className="align-top font-mono text-xs">
                                  #{log.entityId}
                                </TableCell>
                                <TableCell className="align-top">
                                  {formatNumberEN(log.changes.length)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)]">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                تفاصيل السجل المحدد
              </CardTitle>
              <CardDescription>
                عرض كامل للحدث يشمل التغيرات، المصدر، المعرفات المرتبطة، والبيانات الخام.
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-6">
              {selectedLog ? (
                <ScrollArea className="h-[65vh] xl:h-[calc(100vh-13rem)]">
                  <div className="space-y-6 pr-4">
                    <div className="rounded-[26px] border bg-muted/20 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-2">
                            <Badge className={cn("shadow-none", getActionBadgeClass(selectedLog.action))}>
                              {getActionLabel(selectedLog.action, selectedLog.entityType)}
                            </Badge>
                            <Badge variant="outline">{getEntityLabel(selectedLog.entityType)}</Badge>
                            <Badge className={cn("shadow-none", getStatusMeta(selectedLog.status).className)}>
                              {getStatusMeta(selectedLog.status).label}
                            </Badge>
                            <Badge className={cn("shadow-none", getSeverityMeta(selectedLog.severity).className)}>
                              {getSeverityMeta(selectedLog.severity).label}
                            </Badge>
                          </div>

                          <div className="text-lg font-semibold leading-8">{selectedLog.message}</div>
                          <div className="text-sm leading-7 text-muted-foreground">
                            {formatDateTimeAR(selectedLog.createdAt)} • {formatRelativeTime(selectedLog.createdAt)}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleCopy("رقم السجل", selectedLog.id)}
                          >
                            <Copy className="h-4 w-4" />
                            رقم السجل
                          </Button>
                          {selectedLog.entityId ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void handleCopy("معرف الكيان", selectedLog.entityId)}
                            >
                              <Copy className="h-4 w-4" />
                              معرف الكيان
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <InfoCard
                        label="المنفذ"
                        value={selectedLog.actor.name || "غير محدد"}
                        hint={
                          [getRoleLabel(selectedLog.actor.role), selectedLog.actor.email || selectedLog.actor.uid]
                            .filter(Boolean)
                            .join(" • ") || undefined
                        }
                      />
                      <InfoCard
                        label="الكيان المستهدف"
                        value={getEntityLabel(selectedLog.entityType)}
                        hint={[selectedLog.entityId && `#${selectedLog.entityId}`, selectedLog.category]
                          .filter(Boolean)
                          .join(" • ") || undefined}
                      />
                      <InfoCard
                        label="المصدر"
                        value={getAreaLabel(selectedLog.source.area)}
                        hint={[selectedLog.source.page, selectedLog.source.method].filter(Boolean).join(" • ") || undefined}
                      />
                      <InfoCard
                        label="المسار"
                        value={selectedLog.source.route || "بدون مسار"}
                        hint={selectedLog.entityPath || undefined}
                      />
                    </div>

                    <div className="space-y-3">
                      <div>
                        <h3 className="text-sm font-semibold">الحقول المتأثرة</h3>
                        <p className="mt-1 text-xs leading-6 text-muted-foreground">
                          أكثر الحقول أو المفاتيح التي تأثرت في هذا الحدث.
                        </p>
                      </div>
                      {selectedChangedKeys.length ? (
                        <div className="flex flex-wrap gap-2">
                          {selectedChangedKeys.map((key) => (
                            <Badge key={key} variant="outline" className="bg-muted/30">
                              {key}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                          لا توجد قائمة تغييرات هيكلية محفوظة لهذا السجل.
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <h3 className="text-sm font-semibold">التغييرات المسجلة</h3>
                        <p className="mt-1 text-xs leading-6 text-muted-foreground">
                          مقارنة مباشرة بين الحالة السابقة واللاحقة لكل حقل محفوظ.
                        </p>
                      </div>
                      {selectedLog.changes.length ? (
                        <div className="space-y-3">
                          {selectedLog.changes.map((change, index) => (
                            <div key={`${change.field}-${index}`} className="rounded-[22px] border p-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="text-sm font-semibold">{humanizeFieldKey(change.field)}</div>
                                <Badge variant="outline" className="font-mono text-[11px]">
                                  {change.field}
                                </Badge>
                              </div>
                              <div className="mt-4 grid gap-3">
                                <DetailValue label="قبل" value={change.before} tone="before" />
                                <DetailValue label="بعد" value={change.after} tone="after" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-[22px] border border-dashed p-4 text-sm text-muted-foreground">
                          السجل محفوظ بدون مصفوفة تغييرات. يمكن الرجوع إلى الرسالة أو الحمولة الخام أدناه.
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <h3 className="text-sm font-semibold">المعرفات والربط</h3>
                        <p className="mt-1 text-xs leading-6 text-muted-foreground">
                          جميع المعرفات الفنية المرتبطة بهذا الحدث لسهولة التتبع والربط المتقاطع.
                        </p>
                      </div>
                      {selectedReferenceEntries.length ? (
                        <div className="space-y-2">
                          {selectedReferenceEntries.map(([label, value]) => (
                            <div
                              key={`${label}-${value}`}
                              className="flex items-center justify-between gap-3 rounded-2xl border bg-muted/20 px-4 py-3"
                            >
                              <div className="text-xs font-medium text-muted-foreground">{label}</div>
                              <div className="flex items-center gap-2">
                                <span className="max-w-[210px] truncate font-mono text-xs">{value}</span>
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  onClick={() => void handleCopy(label, String(value))}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                          لا توجد معرفات إضافية مرتبطة بهذا السجل.
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <h3 className="text-sm font-semibold">البيانات الإضافية</h3>
                        <p className="mt-1 text-xs leading-6 text-muted-foreground">
                          الميتاداتا الخام المخزنة مع السجل كما وصلت من عملية التدقيق.
                        </p>
                      </div>
                      {Object.keys(selectedLog.meta).length ? (
                        <div className="rounded-[22px] border bg-muted/20 p-4">
                          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs leading-6">
                            {safeJsonStringify(selectedLog.meta)}
                          </pre>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                          لا توجد metadata إضافية مخزنة لهذا السجل.
                        </div>
                      )}
                    </div>

                    <details className="rounded-[22px] border p-4">
                      <summary className="cursor-pointer text-sm font-semibold">
                        عرض الحمولة الخام
                      </summary>
                      <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs leading-6 text-muted-foreground">
                        {safeJsonStringify(selectedLog.raw)}
                      </pre>
                    </details>
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex min-h-[340px] items-center justify-center rounded-[24px] border border-dashed p-6 text-center text-sm leading-7 text-muted-foreground">
                  اختر سجلاً من القائمة لعرض جميع التفاصيل بشكل كامل ومنظم.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
