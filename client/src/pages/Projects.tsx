// client/src/pages/Projects.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Search,
  MapPin,
  TrendingUp,
  Shield,
  Sparkles,
  RefreshCw,
} from "lucide-react";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
  Timestamp,
  limit,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore";
import type { FirestoreError } from "firebase/firestore";
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

const FALLBACK_COVER = "/HOOM-HERO.png";
const PAGE_SIZE = 12;

type ProjectDoc = {
  id: string;

  titleAr?: string;
  titleEn?: string;

  locationAr?: string;
  locationEn?: string;

  projectType?: string;
  status?: string;

  issueNumber?: string;

  // ✅ image fields
  coverImage?: string;
  image?: string;

  overviewAr?: string;
  descriptionAr?: string;
  descriptionEn?: string;

  targetAmount?: number;
  currentAmount?: number;

  minInvestment?: number;
  annualReturn?: number;
  duration?: number;

  risksAr?: string;

  videoUrl?: string;

  createdAt?: Timestamp | any;
};

function safeNumber(n: any) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function fmtSAR(n: any) {
  return safeNumber(n).toLocaleString("ar-SA") + " ر.س";
}

function humanizeFirestoreError(err: unknown): string {
  const e = err as Partial<FirestoreError> | undefined;

  if (e?.code === "permission-denied") {
    return "صلاحيات Firestore تمنع تحميل المشاريع (permission-denied). راجع Rules الخاصة بـ projects.";
  }
  if (e?.code === "failed-precondition") {
    return "الاستعلام يحتاج Index في Firestore (failed-precondition). افتح Console وستجد رابط إنشاء الـ Index.";
  }
  if (e?.code === "unauthenticated") {
    return "غير مسجّل دخول (unauthenticated).";
  }

  return "تعذر تحميل المشاريع";
}

export default function ProjectsPage() {
  const [labels, setLabels] = useState<Required<LabelsDoc>>(DEFAULT_LABELS);
  const [flags, setFlags] = useState<FlagsDoc>({
    hideVipProjects: false,
    vipOnlyMode: false,
    maintenanceMode: false,
  });

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // pagination
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(
    null
  );
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // filters
  const [qText, setQText] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest"); // newest | progress | return

  // refresh
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
     Load published projects (Paged)
  ========================= */
  useEffect(() => {
    const loadFirstPage = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        setProjects([]);
        setLastDoc(null);
        setHasMore(true);

        const qy = query(
          collection(db, "projects"),
          where("status", "==", "published"),
          orderBy("createdAt", "desc"),
          limit(PAGE_SIZE)
        );

        const snap = await getDocs(qy);

        const list: ProjectDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));

        setProjects(list);
        setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
        setHasMore(snap.docs.length === PAGE_SIZE);
      } catch (err) {
        console.error("Projects load error:", err);
        setLoadError(humanizeFirestoreError(err));
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    };

    loadFirstPage();
  }, [refreshKey]);

  const loadMore = async () => {
    if (!hasMore || loadingMore || !lastDoc) return;

    try {
      setLoadingMore(true);

      const qy = query(
        collection(db, "projects"),
        where("status", "==", "published"),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(PAGE_SIZE)
      );

      const snap = await getDocs(qy);

      const more: ProjectDoc[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));

      setProjects((prev) => [...prev, ...more]);
      setLastDoc(snap.docs[snap.docs.length - 1] ?? lastDoc);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error("Load more error:", err);
      // ما نوقف الصفحة بسبب زر Load More
    } finally {
      setLoadingMore(false);
    }
  };

  /* =========================
     Helpers
  ========================= */
  const typeLabel = (type?: string) => {
    if (!type) return "—";
    return labels.projectTypes[type] || type;
  };

  const isVip = (p: ProjectDoc) => p.projectType === "vip_exclusive";

  const progressPercent = (p: ProjectDoc) => {
    const t = safeNumber(p.targetAmount);
    const c = safeNumber(p.currentAmount);
    if (!t) return 0;
    return Math.min(100, (c / t) * 100);
  };

  /* =========================
     Guard by flags
  ========================= */
  const blockedReason = useMemo(() => {
    if (flags.maintenanceMode) return "maintenance";
    if (flags.vipOnlyMode) return "vip_only_mode";
    return null;
  }, [flags.maintenanceMode, flags.vipOnlyMode]);

  /* =========================
     Filter + sort (Client-side on loaded pages)
  ========================= */
  const filtered = useMemo(() => {
    const text = qText.trim().toLowerCase();

    let list = projects.filter((p) => {
      if (flags.hideVipProjects && isVip(p)) return false;
      if (flags.vipOnlyMode && !isVip(p)) return false;
      if (typeFilter !== "all" && (p.projectType || "") !== typeFilter)
        return false;

      if (!text) return true;

      const hay = [
        p.titleAr,
        p.titleEn,
        p.locationAr,
        p.locationEn,
        p.issueNumber,
        p.projectType,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(text);
    });

    list = [...list].sort((a, b) => {
      if (sortBy === "progress") return progressPercent(b) - progressPercent(a);
      if (sortBy === "return")
        return safeNumber(b.annualReturn) - safeNumber(a.annualReturn);

      const ad = (a.createdAt?.seconds ?? 0) as number;
      const bd = (b.createdAt?.seconds ?? 0) as number;
      return bd - ad;
    });

    return list;
  }, [
    projects,
    qText,
    typeFilter,
    sortBy,
    flags.hideVipProjects,
    flags.vipOnlyMode,
  ]);

  /* =========================
     UI
  ========================= */
  return (
    <div
      className="rsg-page min-h-screen flex flex-col bg-transparent text-foreground"
      dir="rtl"
      lang="ar"
    >
      <Header />

      {/* HERO */}
      <section className="mt-20">
        <div className="container py-10 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <h1 className="text-4xl md:text-5xl font-bold flex items-center gap-2">
                <Sparkles className="w-7 h-7" />
                مشاريعنا الاستثمارية
              </h1>
              <p className="text-muted-foreground text-lg">
                استعرض الفرص المتاحة، تفاصيل العوائد، وقدم اهتمامك بسهولة.
              </p>
            </div>

            <Button
              variant="outline"
              onClick={() => setRefreshKey((x) => x + 1)}
              disabled={loading || loadingMore}
            >
              <RefreshCw className="w-4 h-4 ml-2" />
              تحديث
            </Button>
          </div>

          {/* ✅ Gold subtle maintenance */}
          {blockedReason === "maintenance" && (
            <Card
              className="border"
              style={{
                borderColor: "color-mix(in oklab, var(--gold) 35%, transparent)",
              }}
            >
              <CardContent className="py-6 flex items-start gap-3">
                <AlertTriangle
                  className="w-5 h-5 mt-0.5"
                  style={{
                    color: "color-mix(in oklab, var(--gold) 82%, white 18%)",
                  }}
                />
                <div className="space-y-1">
                  <div className="font-semibold">الموقع تحت الصيانة</div>
                  <div className="text-sm text-muted-foreground">
                    نعتذر، سيتم إعادة تفعيل المشاريع قريبًا.
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {blockedReason === "vip_only_mode" && (
            <Card className="border-primary/20">
              <CardContent className="py-6 flex items-start gap-3">
                <Shield className="w-5 h-5 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold">وضع VIP فقط</div>
                  <div className="text-sm text-muted-foreground">
                    المعروض الآن مشاريع VIP فقط.
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filters */}
          <Card>
            <CardContent className="py-6 grid lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">بحث</div>
                <div className="relative">
                  <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={qText}
                    onChange={(e) => setQText(e.target.value)}
                    placeholder="ابحث بالعنوان / الموقع / رقم الإصدار..."
                    className="pr-9"
                    disabled={flags.maintenanceMode}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">نوع المشروع</div>
                <Select
                  value={typeFilter}
                  onValueChange={setTypeFilter}
                  disabled={flags.maintenanceMode}
                >
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
                <div className="text-sm font-medium">الترتيب</div>
                <Select
                  value={sortBy}
                  onValueChange={setSortBy}
                  disabled={flags.maintenanceMode}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الترتيب" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">الأحدث</SelectItem>
                    <SelectItem value="progress">الأعلى تقدمًا</SelectItem>
                    <SelectItem value="return">الأعلى عائدًا</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CONTENT */}
      <main className="flex-1">
        <div className="container pb-12">
          {flags.maintenanceMode ? (
            <div className="py-16 text-center text-muted-foreground">
              المشاريع غير متاحة حالياً بسبب الصيانة.
            </div>
          ) : (
            <>
              {loading && (
                <div className="py-16 text-center text-muted-foreground">
                  جاري تحميل المشاريع...
                </div>
              )}

              {loadError && !loading && (
                <Card className="border-destructive/30">
                  <CardContent className="py-10 text-center space-y-3">
                    <div className="font-semibold">{loadError}</div>

                    <div className="text-sm text-muted-foreground">
                      ملاحظة: هذه الصفحة تعرض فقط المشاريع التي حالتها{" "}
                      <span className="font-semibold">published</span> وبها{" "}
                      <span className="font-semibold">createdAt</span> (Timestamp).
                    </div>

                    <Button
                      variant="outline"
                      onClick={() => setRefreshKey((x) => x + 1)}
                    >
                      إعادة المحاولة
                    </Button>
                  </CardContent>
                </Card>
              )}

              {!loading && !loadError && filtered.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground space-y-3">
                    <div>لا توجد مشاريع مطابقة للبحث/الفلترة.</div>

                    {/* ✅ لو فيه صفحات إضافية، نخلي المستخدم يقدر يجرب تحميل أكثر */}
                    {hasMore && projects.length > 0 && (
                      <Button
                        variant="outline"
                        onClick={loadMore}
                        disabled={loadingMore}
                      >
                        {loadingMore ? "جاري التحميل..." : "تحميل المزيد"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

              {!loading && !loadError && filtered.length > 0 && (
                <>
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filtered.map((p) => {
                      const target = safeNumber(p.targetAmount);
                      const current = safeNumber(p.currentAmount);
                      const prog = progressPercent(p);

                      const cover =
                        (p.coverImage && String(p.coverImage).trim()) ||
                        (p.image && String(p.image).trim()) ||
                        FALLBACK_COVER;

                      return (
                        <Card key={p.id} className="overflow-hidden">
                          {/* ✅ Cover Image */}
                          <div className="relative h-44 w-full bg-muted">
                            <img
                              src={cover}
                              alt={p.titleAr || p.titleEn || "Project"}
                              className="h-full w-full object-cover"
                              loading="lazy"
                              onError={(e) => {
                                const img = e.currentTarget;
                                if (img.src.includes(FALLBACK_COVER)) return;
                                img.src = FALLBACK_COVER;
                              }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />

                            <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
                              <Badge variant="outline" className="bg-white/80">
                                {typeLabel(p.projectType)}
                              </Badge>
                              {p.issueNumber && (
                                <Badge
                                  variant="secondary"
                                  className="bg-white/80"
                                >
                                  #{p.issueNumber}
                                </Badge>
                              )}
                            </div>

                            <div className="absolute bottom-3 right-3 left-3">
                              <div className="text-white text-lg font-semibold leading-tight line-clamp-1">
                                {p.titleAr || p.titleEn || "بدون عنوان"}
                              </div>
                              <div className="text-white/85 text-sm flex items-center gap-2 mt-1">
                                <MapPin className="w-4 h-4" />
                                <span className="line-clamp-1">
                                  {p.locationAr || p.locationEn || "—"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* ✅ Content */}
                          <div className="p-6 space-y-4">
                            <div className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  التقدم
                                </span>
                                <span className="font-semibold">
                                  {prog.toFixed(1)}%
                                </span>
                              </div>

                              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full bg-primary"
                                  style={{ width: `${prog}%` }}
                                />
                              </div>

                              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                <span>{fmtSAR(current)}</span>
                                <span>{fmtSAR(target)}</span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="rounded-lg border p-3">
                                <div className="text-xs text-muted-foreground">
                                  الحد الأدنى
                                </div>
                                <div className="font-semibold">
                                  {fmtSAR(p.minInvestment)}
                                </div>
                              </div>

                              <div className="rounded-lg border p-3">
                                <div className="text-xs text-muted-foreground">
                                  العائد السنوي
                                </div>
                                <div className="font-semibold flex items-center gap-2">
                                  <TrendingUp className="w-4 h-4" />
                                  {safeNumber(p.annualReturn)}%
                                </div>
                              </div>

                              <div className="rounded-lg border p-3 col-span-2">
                                <div className="text-xs text-muted-foreground">
                                  المدة
                                </div>
                                <div className="font-semibold">
                                  {safeNumber(p.duration)} شهر
                                </div>
                              </div>
                            </div>

                            <div className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                              {p.overviewAr ||
                                p.descriptionAr ||
                                p.descriptionEn ||
                                "—"}
                            </div>

                            <Link href={`/projects/${p.id}`}>
                              <Button className="w-full">عرض التفاصيل</Button>
                            </Link>
                          </div>
                        </Card>
                      );
                    })}
                  </div>

                  {/* ✅ Load More */}
                  {!loading && !loadError && projects.length > 0 && (
                    <div className="mt-10 flex justify-center">
                      {hasMore ? (
                        <Button
                          variant="outline"
                          onClick={loadMore}
                          disabled={loadingMore}
                        >
                          {loadingMore ? "جاري التحميل..." : "تحميل المزيد"}
                        </Button>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          تم عرض جميع المشاريع.
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
