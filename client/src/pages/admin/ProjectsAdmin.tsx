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
import { formatCurrencyEN, formatNumberEN } from "@/lib/formatters";

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

type ProjectDoc = {
  id: string;

  // titles
  titleAr?: string;
  titleEn?: string;

  // meta
  projectType?: string;
  status?: string; // draft/published/closed/completed...
  issueNumber?: string;

  locationAr?: string;
  locationEn?: string;

  // finance
  targetAmount?: number;
  currentAmount?: number;
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
      (snap) => {
        const list: ProjectDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setProjects(list);
        setLoading(false);
      },
      (err) => {
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

  const statusBadgeVariant = (st?: string) => {
    if (st === "published") return "default";
    if (st === "draft") return "secondary";
    if (st === "closed" || st === "completed") return "outline";
    return "secondary";
  };

  /* =========================
     Filtering
  ========================= */
  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();

    return projects.filter((p) => {
      if (typeFilter !== "all" && (p.projectType || "") !== typeFilter) return false;
      if (statusFilter !== "all" && (p.status || "") !== statusFilter) return false;

      if (!t) return true;

      const hay = [
        p.titleAr,
        p.titleEn,
        p.locationAr,
        p.locationEn,
        p.issueNumber,
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
    const published = filtered.filter((p) => p.status === "published").length;
    const draft = filtered.filter((p) => p.status === "draft").length;

    const totalTarget = filtered.reduce((acc, p) => acc + safeNumber(p.targetAmount), 0);
    const totalCurrent = filtered.reduce((acc, p) => acc + safeNumber(p.currentAmount), 0);

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

      toast.success(nextStatus === "published" ? "تم نشر المشروع" : "تم إخفاء المشروع");
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
              onClick={() => setRefreshKey((x) => x + 1)}
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
              <CardTitle className="text-xl text-slate-950">فلترة وبحث</CardTitle>

              <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-600">
                {formatNumberEN(filtered.length)} مشروع مطابق
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              ابحث بسرعة في العنوان والموقع ورقم الإصدار، ثم صفِّ النتائج حسب النوع والحالة.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 bg-slate-50/55 pt-6 lg:grid-cols-3">
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <div className="text-sm font-medium text-slate-700">بحث</div>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                  placeholder="ابحث بالعنوان / الموقع / رقم الإصدار..."
                  className="h-11 border-slate-200 bg-white pr-10"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <div className="text-sm font-medium text-slate-700">نوع المشروع</div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-11 border-slate-200 bg-white">
                  <SelectValue placeholder="اختر النوع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {Object.keys(labels.projectTypes).map((k) => (
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
                  {Object.keys(labels.projectStatuses).map((k) => (
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
              <Button variant="outline" onClick={() => setRefreshKey((x) => x + 1)}>
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
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((p) => {
              const target = safeNumber(p.targetAmount);
              const current = safeNumber(p.currentAmount);
              const progress = target ? Math.min(100, (current / target) * 100) : 0;

              return (
                <Card key={p.id} className="overflow-hidden">
                  <CardHeader className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <CardTitle className="text-lg leading-tight">
                          {p.titleAr || p.titleEn || "بدون عنوان"}
                        </CardTitle>
                        <div className="text-sm text-muted-foreground">
                          {p.locationAr || p.locationEn || "—"}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 items-end">
                        <Badge variant={statusBadgeVariant(p.status)}>
                          {statusLabel(p.status)}
                        </Badge>
                        <Badge variant="outline">{typeLabel(p.projectType)}</Badge>
                      </div>
                    </div>

                    {p.issueNumber && (
                      <div className="text-xs text-muted-foreground">
                        رقم الإصدار: #{p.issueNumber}
                      </div>
                    )}
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">التقدم</span>
                        <span className="font-semibold">{progress.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                      </div>

                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>{fmtSAR(current)}</span>
                        <span>{fmtSAR(target)}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">الحد الأدنى</div>
                        <div className="font-semibold">{fmtSAR(p.minInvestment)}</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">العائد السنوي</div>
                        <div className="font-semibold">{safeNumber(p.annualReturn)}%</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link href={`/projects/${p.id}`}>
                        <Button variant="outline" size="sm">
                          عرض
                        </Button>
                      </Link>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLocation(`/admin/projects/${p.id}/edit`)}
                      >
                        <Pencil className="w-4 h-4 ml-2" />
                        تعديل
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => togglePublish(p)}
                        disabled={busyId === p.id}
                      >
                        {p.status === "published" ? (
                          <>
                            <EyeOff className="w-4 h-4 ml-2" />
                            إخفاء
                          </>
                        ) : (
                          <>
                            <Eye className="w-4 h-4 ml-2" />
                            نشر
                          </>
                        )}
                      </Button>

                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(p)}
                        disabled={busyId === p.id}
                      >
                        <Trash2 className="w-4 h-4 ml-2" />
                        حذف
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        disabled={recomputeId === p.id || busyId === p.id}
                        onClick={async () => {
                          try {
                            setRecomputeId(p.id);
                            const r = await recomputeProjectAggregatesClient(p.id, {
                              source: {
                                area: "admin",
                                page: "ProjectsAdmin",
                                method: "manual_recompute",
                              },
                              reason: "projects_admin_manual_recompute",
                              relatedIds: { projectId: p.id },
                            });
                            toast.success(`تم التحديث ✅ (المبلغ: ${r.currentAmount} | المستثمرين: ${r.investorsCount})`);
                          } catch (e: any) {
                            toast.error(e?.message || "فشل إعادة الحساب");
                          } finally {
                            setRecomputeId(null);
                          }
                        }}
                      >
                        {recomputeId === p.id ? (
                          <>
                            <RefreshCw className="w-4 h-4 ml-2 animate-spin" />
                            جاري إعادة الحساب...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4 ml-2" />
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
