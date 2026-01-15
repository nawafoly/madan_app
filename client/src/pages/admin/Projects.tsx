// client/src/pages/admin/Projects.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

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
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/_core/firebase";

type LabelsDoc = {
  projectTypes?: Record<string, string>;
  projectStatuses?: Record<string, string>;
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
    draft: "مسودة",
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
  return safeNumber(n).toLocaleString("ar-SA") + " ر.س";
}

export default function ProjectsManagement() {
  const [, setLocation] = useLocation();

  const [labels, setLabels] = useState<Required<LabelsDoc>>(DEFAULT_LABELS);
  const [flags, setFlags] = useState<FlagsDoc>({
    hideVipProjects: false,
    vipOnlyMode: false,
    maintenanceMode: false,
  });

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

    // ✅ Admin view: show all (draft + published + closed ...)
    // If you want only non-deleted, add field filters here.
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
    return labels.projectTypes[type] || type;
  };

  const statusLabel = (st?: string) => {
    if (!st) return "—";
    return labels.projectStatuses[st] || st;
  };

  const statusBadgeVariant = (st?: string) => {
    // keep it simple (shadcn variants depend on your Badge implementation)
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
      await updateDoc(doc(db, "projects", p.id), {
        status: nextStatus,
        updatedAt: Timestamp.now(),
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
    // ✅ تأكيد بسيط بدون مودال عشان ما نعقدها
    const ok = window.confirm(
      `تأكيد حذف المشروع؟\n\n${p.titleAr || p.titleEn || p.id}\n\n⚠️ لا يمكن التراجع`
    );
    if (!ok) return;

    try {
      setBusyId(p.id);
      await deleteDoc(doc(db, "projects", p.id));
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
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 mt-20">
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
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">فلترة وبحث</CardTitle>
            </CardHeader>
            <CardContent className="grid lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">بحث</div>
                <div className="relative">
                  <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={qText}
                    onChange={(e) => setQText(e.target.value)}
                    placeholder="ابحث بالعنوان / الموقع / رقم الإصدار..."
                    className="pr-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">نوع المشروع</div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر النوع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {Object.keys(labels.projectTypes).map((k) => (
                      <SelectItem key={k} value={k}>
                        {labels.projectTypes[k] || k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">الحالة</div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الحالة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {Object.keys(labels.projectStatuses).map((k) => (
                      <SelectItem key={k} value={k}>
                        {labels.projectStatuses[k] || k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="py-5 space-y-1">
                <div className="text-sm text-muted-foreground">الإجمالي</div>
                <div className="text-2xl font-bold">{stats.total}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-5 space-y-1">
                <div className="text-sm text-muted-foreground">المنشور</div>
                <div className="text-2xl font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  {stats.published}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-5 space-y-1">
                <div className="text-sm text-muted-foreground">المسودات</div>
                <div className="text-2xl font-bold flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  {stats.draft}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-5 space-y-1">
                <div className="text-sm text-muted-foreground">إجمالي التقدم</div>
                <div className="text-lg font-semibold">
                  {fmtSAR(stats.totalCurrent)} / {fmtSAR(stats.totalTarget)}
                </div>
              </CardContent>
            </Card>
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
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${progress}%` }}
                          />
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
                          <div className="font-semibold">
                            {safeNumber(p.annualReturn)}%
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {/* View public details */}
                        <Link href={`/projects/${p.id}`}>
                          <Button variant="outline" size="sm">
                            عرض
                          </Button>
                        </Link>

                        {/* Edit */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setLocation(`/admin/projects/${p.id}/edit`)}
                        >
                          <Pencil className="w-4 h-4 ml-2" />
                          تعديل
                        </Button>

                        {/* Publish / Draft */}
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

                        {/* Delete (optional) */}
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(p)}
                          disabled={busyId === p.id}
                        >
                          <Trash2 className="w-4 h-4 ml-2" />
                          حذف
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
