// client/src/pages/admin/Projects.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import AdminPanelStatCard from "@/components/AdminPanelStatCard";
import {
  AUDIT_ACTIONS,
  auditedDeleteDoc,
  auditedUpdateDoc,
  buildAuditSource,
} from "@/lib/auditLog";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { recomputeProjectAggregatesClient } from "../../_core/recomputeAggregates";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  AlertTriangle,
  RefreshCw,
  Search,
  Plus,
  Pencil,
  Eye,
  EyeOff,
  Trash2,
  Layers,
  CheckCircle2,
  Clock,
} from "lucide-react";

import { toast } from "sonner";

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/_core/firebase";
import { getProjectBusinessId } from "@/lib/businessIds";
import { formatCurrencyEN, formatNumberEN } from "@/lib/formatters";
import { getProjectComputedAmounts } from "@/lib/projectAmounts";
import { cn } from "@/lib/utils";

/* =========================
   Labels (support string OR {ar,en})
========================= */
type BiLabel = { ar?: string; en?: string };
type LabelValue = string | BiLabel;

type LabelsDoc = {
  projectTypes?: Record<string, LabelValue>;
  projectStatuses?: Record<string, LabelValue>;
};

type FlagsDoc = {
  hideVipProjects?: boolean;
  vipOnlyMode?: boolean;
  maintenanceMode?: boolean;
};

const DEFAULT_LABELS: Required<LabelsDoc> = {
  projectTypes: {
    sukuk: "استثمار بالصكوك",
    land_development: "تطوير أراضي",
    vip_exclusive: "VIP حصري",
  },
  projectStatuses: {
    draft: "قريبا",
    published: "منشور",
    closed: "مغلق",
    completed: "مكتمل",
  },
};

const PROJECT_CARD_CLASS =
  "group flex h-full flex-col overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_16px_40px_-28px_rgba(15,23,42,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300/90 hover:shadow-[0_24px_52px_-30px_rgba(15,23,42,0.22)]";
const PROJECT_CARD_HEADER_CLASS =
  "space-y-3 border-b border-slate-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-5 py-5";
const PROJECT_CARD_CONTENT_CLASS = "flex flex-1 flex-col space-y-5 px-5 py-5";
const PROJECT_CARD_PILL_BASE_CLASS =
  "inline-flex h-8 items-center justify-center rounded-full border px-3 text-xs font-semibold leading-none tracking-[0.01em] shadow-sm";
const PROJECT_CARD_TYPE_BADGE_CLASS =
  "border-slate-200 bg-white text-slate-700";
const PROJECT_CARD_META_BLOCK_CLASS =
  "rounded-[18px] border border-slate-200/80 bg-slate-50/85 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]";
const PROJECT_CARD_ACTION_BUTTON_CLASS =
  "h-9 rounded-xl px-3.5 text-[13px] font-medium shadow-none transition-colors";
const PROJECT_CARD_OUTLINE_BUTTON_CLASS = `${PROJECT_CARD_ACTION_BUTTON_CLASS} border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50`;
const PROJECT_CARD_PRIMARY_BUTTON_CLASS = `${PROJECT_CARD_ACTION_BUTTON_CLASS} bg-slate-900 text-white hover:bg-slate-800`;
const PROJECT_CARD_DANGER_BUTTON_CLASS = `${PROJECT_CARD_ACTION_BUTTON_CLASS} border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800`;

type ProjectDoc = {
  id: string;

  // titles
  titleAr?: string;
  titleEn?: string;

  // meta
  projectType?: string;
  status?: string; // draft/published/closed/completed...
  businessId?: string;
  issueNumber?: string;

  locationAr?: string;
  locationEn?: string;

  // finance
  targetAmount?: number;
  currentAmount?: number;
  coverageRate?: number;
  baseCoveredAmount?: number;
  investmentsAmount?: number;
  minInvestment?: number;
  annualReturn?: number;
  duration?: number;

  investorsCount?: number;

  createdAt?: Timestamp | any;
  updatedAt?: Timestamp | any;
};

function safeNumber(n: any) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function fmtSAR(n: any) {
  return formatCurrencyEN(safeNumber(n));
}

// ✅ يمنع كراش React لما تكون القيمة {ar,en}
function pickLabel(v: unknown, lang: "ar" | "en" = "ar", fallback = "") {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as BiLabel;
    return (lang === "ar" ? o.ar : o.en) || o.ar || o.en || fallback;
  }
  return fallback;
}

export default function ProjectsManagement() {
  const [, setLocation] = useLocation();

  const [labels, setLabels] = useState<Required<LabelsDoc>>(DEFAULT_LABELS);
  const [flags, setFlags] = useState<FlagsDoc>({
    hideVipProjects: false,
    vipOnlyMode: false,
    maintenanceMode: false,
  });
  const [recomputeId, setRecomputeId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectDoc[]>([]);

  // filters
  const [qText, setQText] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // ui
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  /* =========================
     Load settings (labels + flags)
  ========================= */
  useEffect(() => {
    (async () => {
      try {
        const [labelsSnap, flagsSnap] = await Promise.all([
          getDoc(doc(db, "settings", "labels")),
          getDoc(doc(db, "settings", "flags")),
        ]);

        if (labelsSnap.exists()) {
          const data = labelsSnap.data() as LabelsDoc;
          setLabels({
            projectTypes: {
              ...DEFAULT_LABELS.projectTypes,
              ...(data.projectTypes || {}),
            },
            projectStatuses: {
              ...DEFAULT_LABELS.projectStatuses,
              ...(data.projectStatuses || {}),
            },
          });
        } else {
          setLabels(DEFAULT_LABELS);
        }

        if (flagsSnap.exists()) setFlags(flagsSnap.data() as FlagsDoc);
      } catch {
        // keep defaults
      }
    })();
  }, []);

  /* =========================
     Load projects (Realtime)
  ========================= */
  useEffect(() => {
    setLoading(true);
    setLoadError(null);

    const qy = query(collection(db, "projects"), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      qy,
      snap => {
        const list: ProjectDoc[] = snap.docs.map(d => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setProjects(list);
        setLoading(false);
      },
      err => {
        console.error(err);
        setLoadError("تعذر تحميل المشاريع");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [refreshKey]);

  /* =========================
     Derived labels
  ========================= */
  const typeLabel = (type?: string) => {
    if (!type) return "—";
    return pickLabel(labels.projectTypes[type], "ar", type);
  };

  const statusLabel = (st?: string) => {
    if (!st) return "—";
    return pickLabel(labels.projectStatuses[st], "ar", st);
  };

  const statusBadgeClass = (st?: string) => {
    const map: Record<string, string> = {
      published: "border-emerald-200 bg-emerald-50 text-emerald-700",
      draft: "border-amber-200 bg-amber-50 text-amber-700",
      closed: "border-slate-200 bg-slate-100 text-slate-600",
      completed: "border-sky-200 bg-sky-50 text-sky-700",
    };

    return cn(
      PROJECT_CARD_PILL_BASE_CLASS,
      map[
        String(st || "")
          .trim()
          .toLowerCase()
      ] || "border-slate-200 bg-slate-100 text-slate-600"
    );
  };

  /* =========================
     Filtering
  ========================= */
  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();

    return projects.filter(p => {
      if (typeFilter !== "all" && (p.projectType || "") !== typeFilter)
        return false;
      if (statusFilter !== "all" && (p.status || "") !== statusFilter)
        return false;

      if (!t) return true;

      const hay = [
        p.titleAr,
        p.titleEn,
        p.locationAr,
        p.locationEn,
        getProjectBusinessId(p),
        p.projectType,
        p.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(t);
    });
  }, [projects, qText, typeFilter, statusFilter]);

  /* =========================
     Quick stats
  ========================= */
  const stats = useMemo(() => {
    const total = filtered.length;
    const published = filtered.filter(p => p.status === "published").length;
    const draft = filtered.filter(p => p.status === "draft").length;

    const totalTarget = filtered.reduce(
      (acc, p) => acc + safeNumber(p.targetAmount),
      0
    );
    const totalCurrent = filtered.reduce(
      (acc, p) => acc + getProjectComputedAmounts(p).currentAmount,
      0
    );

    return { total, published, draft, totalTarget, totalCurrent };
  }, [filtered]);

  /* =========================
     Actions
  ========================= */
  const togglePublish = async (p: ProjectDoc) => {
    try {
      setBusyId(p.id);

      const nextStatus = p.status === "published" ? "draft" : "published";
      await auditedUpdateDoc({
        ref: doc(db, "projects", p.id),
        data: { status: nextStatus },
        action: AUDIT_ACTIONS.PROJECT_STATUS_CHANGED,
        category: "project",
        entityType: "project",
        source: buildAuditSource({
          area: "admin",
          page: "ProjectsAdmin",
          method: "toggle_status",
        }),
        relatedIds: { projectId: p.id },
        message: `${nextStatus === "published" ? "Published" : "Unpublished"} project ${p.titleAr || p.titleEn || p.id}`,
        meta: {
          projectName: p.titleAr || p.titleEn || p.id,
          previousStatus: p.status,
          nextStatus,
        },
      });

      toast.success(
        nextStatus === "published" ? "تم نشر المشروع" : "تم إخفاء المشروع"
      );
    } catch (e) {
      console.error(e);
      toast.error("فشل تحديث الحالة");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (p: ProjectDoc) => {
    const ok = window.confirm(
      `تأكيد حذف المشروع؟\n\n${p.titleAr || p.titleEn || p.id}\n\n⚠️ لا يمكن التراجع`
    );
    if (!ok) return;

    try {
      setBusyId(p.id);
      await auditedDeleteDoc({
        ref: doc(db, "projects", p.id),
        action: AUDIT_ACTIONS.PROJECT_DELETED,
        category: "project",
        entityType: "project",
        source: buildAuditSource({
          area: "admin",
          page: "ProjectsAdmin",
          method: "delete",
        }),
        relatedIds: { projectId: p.id },
        message: `Deleted project ${p.titleAr || p.titleEn || p.id}`,
        meta: {
          projectName: p.titleAr || p.titleEn || p.id,
          projectStatus: p.status,
        },
      });
      toast.success("تم حذف المشروع");
    } catch (e) {
      console.error(e);
      toast.error("فشل حذف المشروع");
    } finally {
      setBusyId(null);
    }
  };

  /* =========================
     UI
  ========================= */
  return (
    <DashboardLayout>
      <div className="container py-10 space-y-6">
        {/* Top row */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Layers className="w-7 h-7" />
              إدارة المشاريع
            </h1>
            <p className="text-muted-foreground">
              عرض/بحث/تعديل/نشر المشاريع مباشرة من Firestore
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => setRefreshKey(x => x + 1)}
              disabled={loading}
            >
              <RefreshCw className="w-4 h-4 ml-2" />
              تحديث
            </Button>

            <Button onClick={() => setLocation("/admin/projects/create")}>
              <Plus className="w-4 h-4 ml-2" />
              مشروع جديد
            </Button>
          </div>
        </div>

        {/* Maintenance notice */}
        {flags.maintenanceMode && (
          <Card className="border-yellow-500/30">
            <CardContent className="py-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold">وضع الصيانة مفعّل</div>
                <div className="text-sm text-muted-foreground">
                  الموقع العام قد يمنع عرض المشاريع، لكن لوحة الإدارة تظل تعمل.
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card className="overflow-hidden border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-slate-100/80 shadow-sm">
          <CardHeader className="gap-4 border-b border-slate-200/70 bg-white/70 pb-5 backdrop-blur">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle className="text-xl text-slate-950">
                فلترة وبحث
              </CardTitle>

              <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-600">
                {formatNumberEN(filtered.length)} مشروع مطابق
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              ابحث بسرعة في العنوان والموقع ورقم الإصدار، ثم صفِّ النتائج حسب
              النوع والحالة.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 bg-slate-50/55 pt-6 lg:grid-cols-3">
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <div className="text-sm font-medium text-slate-700">بحث</div>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={qText}
                  onChange={e => setQText(e.target.value)}
                  placeholder="ابحث بالعنوان / الموقع / رقم الإصدار..."
                  className="h-11 border-slate-200 bg-white pr-10"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <div className="text-sm font-medium text-slate-700">
                نوع المشروع
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-11 border-slate-200 bg-white">
                  <SelectValue placeholder="اختر النوع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {Object.keys(labels.projectTypes).map(k => (
                    <SelectItem key={k} value={k}>
                      {pickLabel(labels.projectTypes[k], "ar", k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <div className="text-sm font-medium text-slate-700">الحالة</div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-11 border-slate-200 bg-white">
                  <SelectValue placeholder="اختر الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {Object.keys(labels.projectStatuses).map(k => (
                    <SelectItem key={k} value={k}>
                      {pickLabel(labels.projectStatuses[k], "ar", k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminPanelStatCard
            title="إجمالي المشاريع"
            value={stats.total}
            description="عدد المشاريع المطابقة للبحث والفلاتر الحالية داخل لوحة الإدارة."
            helper={`إجمالي المستهدف المالي: ${fmtSAR(stats.totalTarget)}`}
            icon={<Layers className="h-5 w-5" />}
            accent="amber"
          />

          <AdminPanelStatCard
            title="المشاريع المنشورة"
            value={stats.published}
            description="المشاريع الظاهرة حاليًا للمستخدمين والتي أصبحت ضمن واجهة العرض العامة."
            helper={`${stats.published} مشروع في حالة منشور`}
            icon={<CheckCircle2 className="h-5 w-5" />}
            accent="emerald"
          />

          <AdminPanelStatCard
            title="قيد التجهيز"
            value={stats.draft}
            description="المشاريع التي ما زالت في المسودة أو بانتظار الإطلاق والنشر الرسمي."
            helper={`${stats.draft} مشروع ضمن حالات ما قبل النشر`}
            icon={<Clock className="h-5 w-5" />}
            accent="blue"
          />

          <AdminPanelStatCard
            title="إجمالي التقدم"
            value={fmtSAR(stats.totalCurrent)}
            description="إجمالي التمويل الحالي عبر المشاريع المطابقة مقارنة بالمستهدف المالي الكلي."
            helper={`المستهدف الكلي: ${fmtSAR(stats.totalTarget)}`}
            icon={<RefreshCw className="h-5 w-5" />}
            accent="slate"
            valueClassName="text-3xl sm:text-4xl"
          />
        </div>

        {/* Content states */}
        {loading && (
          <div className="py-14 text-center text-muted-foreground">
            جاري تحميل المشاريع...
          </div>
        )}

        {loadError && !loading && (
          <Card className="border-destructive/30">
            <CardContent className="py-8 text-center space-y-3">
              <div className="font-semibold">{loadError}</div>
              <Button
                variant="outline"
                onClick={() => setRefreshKey(x => x + 1)}
              >
                إعادة المحاولة
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && !loadError && filtered.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              ما فيه مشاريع مطابقة للبحث/الفلترة.
            </CardContent>
          </Card>
        )}

        {/* Projects grid */}
        {!loading && !loadError && filtered.length > 0 && (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map(p => {
              const computedAmounts = getProjectComputedAmounts(p);
              const target = computedAmounts.targetAmount;
              const current = computedAmounts.currentAmount;
              const progress = computedAmounts.progressPercent;

              return (
                <Card key={p.id} className={PROJECT_CARD_CLASS}>
                  <CardHeader className={PROJECT_CARD_HEADER_CLASS}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <CardTitle className="text-[1.05rem] leading-7 tracking-tight text-slate-950">
                          {p.titleAr || p.titleEn || "بدون عنوان"}
                        </CardTitle>
                        <div className="text-sm font-medium text-slate-500">
                          {p.locationAr || p.locationEn || "—"}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <Badge className={statusBadgeClass(p.status)}>
                          {statusLabel(p.status)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            PROJECT_CARD_PILL_BASE_CLASS,
                            PROJECT_CARD_TYPE_BADGE_CLASS
                          )}
                        >
                          {typeLabel(p.projectType)}
                        </Badge>
                      </div>
                    </div>

                    {getProjectBusinessId(p) && (
                      <div className="text-[11px] font-medium tracking-[0.08em] text-slate-500">
                        رقم المشروع: {getProjectBusinessId(p)}
                      </div>
                    )}
                  </CardHeader>

                  <CardContent className={PROJECT_CARD_CONTENT_CLASS}>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-500">
                          التقدم
                        </span>
                        <span className="font-semibold text-slate-900">
                          {progress.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#0f172a_0%,#334155_100%)]"
                          style={{ width: `${progress}%` }}
                        />
                      </div>

                      <div className="mt-1 flex justify-between text-[11px] font-medium text-slate-500">
                        <span>{fmtSAR(current)}</span>
                        <span>{fmtSAR(target)}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className={PROJECT_CARD_META_BLOCK_CLASS}>
                        <div className="text-[11px] font-medium tracking-[0.12em] text-slate-500">
                          الحد الأدنى
                        </div>
                        <div className="mt-2 text-[15px] font-semibold text-slate-950">
                          {fmtSAR(p.minInvestment)}
                        </div>
                      </div>
                      <div className={PROJECT_CARD_META_BLOCK_CLASS}>
                        <div className="text-[11px] font-medium tracking-[0.12em] text-slate-500">
                          العائد السنوي
                        </div>
                        <div className="mt-2 text-[15px] font-semibold text-slate-950">
                          {safeNumber(p.annualReturn)}%
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2.5 pt-1">
                      <Link href={`/projects/${p.id}`} className="inline-flex">
                        <Button
                          variant="outline"
                          size="sm"
                          className={PROJECT_CARD_OUTLINE_BUTTON_CLASS}
                        >
                          عرض
                        </Button>
                      </Link>

                      <Button
                        variant="outline"
                        size="sm"
                        className={PROJECT_CARD_OUTLINE_BUTTON_CLASS}
                        onClick={() =>
                          setLocation(`/admin/projects/${p.id}/edit`)
                        }
                      >
                        <Pencil className="w-4 h-4" />
                        تعديل
                      </Button>

                      <Button
                        size="sm"
                        className={PROJECT_CARD_PRIMARY_BUTTON_CLASS}
                        onClick={() => togglePublish(p)}
                        disabled={busyId === p.id}
                      >
                        {p.status === "published" ? (
                          <>
                            <EyeOff className="w-4 h-4" />
                            إخفاء
                          </>
                        ) : (
                          <>
                            <Eye className="w-4 h-4" />
                            نشر
                          </>
                        )}
                      </Button>

                      <Button
                        variant="destructive"
                        size="sm"
                        className={PROJECT_CARD_DANGER_BUTTON_CLASS}
                        onClick={() => handleDelete(p)}
                        disabled={busyId === p.id}
                      >
                        <Trash2 className="w-4 h-4" />
                        حذف
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        className={PROJECT_CARD_OUTLINE_BUTTON_CLASS}
                        disabled={recomputeId === p.id || busyId === p.id}
                        onClick={async () => {
                          try {
                            setRecomputeId(p.id);
                            const r = await recomputeProjectAggregatesClient(
                              p.id,
                              {
                                source: {
                                  area: "admin",
                                  page: "ProjectsAdmin",
                                  method: "manual_recompute",
                                },
                                reason: "projects_admin_manual_recompute",
                                relatedIds: { projectId: p.id },
                              }
                            );
                            toast.success(
                              `تم التحديث ✅ (المبلغ: ${r.currentAmount} | المستثمرين: ${r.investorsCount})`
                            );
                          } catch (e: any) {
                            toast.error(e?.message || "فشل إعادة الحساب");
                          } finally {
                            setRecomputeId(null);
                          }
                        }}
                      >
                        {recomputeId === p.id ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            جاري إعادة الحساب...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4" />
                            إعادة حساب
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
