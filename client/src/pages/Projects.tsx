// client/src/pages/Projects.tsx
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useDragScroll } from "@/hooks/useDragScroll";

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

function pickLabel(v: unknown, lang: "ar" | "en" = "ar", fallback = "") {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as BiLabel;
    return (lang === "ar" ? o.ar : o.en) || o.ar || o.en || fallback;
  }
  return fallback;
}

function normalizePublicImage(src?: string) {
  const s = (src ?? "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("/")) return s;
  return `/${s}`;
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

/**
 * Hook بسيط للـ pagination حسب status:
 * - statusEq: حالة واحدة (published/draft/...)
 * - statusIn: أكثر من حالة (مثل completed+closed)
 */
function usePagedProjects(opts: {
  statusEq?: string;
  statusIn?: string[];
  pageSize?: number;
  refreshKey: number;
}) {
  const pageSize = opts.pageSize ?? PAGE_SIZE;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ProjectDoc[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [lastDoc, setLastDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const buildBaseQuery = () => {
    const base = collection(db, "projects");

    if (opts.statusEq) {
      return query(
        base,
        where("status", "==", opts.statusEq),
        orderBy("createdAt", "desc"),
        limit(pageSize)
      );
    }

    if (opts.statusIn && opts.statusIn.length) {
      return query(
        base,
        where("status", "in", opts.statusIn),
        orderBy("createdAt", "desc"),
        limit(pageSize)
      );
    }

    return query(base, orderBy("createdAt", "desc"), limit(pageSize));
  };

  const buildMoreQuery = (after: QueryDocumentSnapshot<DocumentData>) => {
    const base = collection(db, "projects");

    if (opts.statusEq) {
      return query(
        base,
        where("status", "==", opts.statusEq),
        orderBy("createdAt", "desc"),
        startAfter(after),
        limit(pageSize)
      );
    }

    if (opts.statusIn && opts.statusIn.length) {
      return query(
        base,
        where("status", "in", opts.statusIn),
        orderBy("createdAt", "desc"),
        startAfter(after),
        limit(pageSize)
      );
    }

    return query(
      base,
      orderBy("createdAt", "desc"),
      startAfter(after),
      limit(pageSize)
    );
  };

  useEffect(() => {
    const loadFirstPage = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        setItems([]);
        setLastDoc(null);
        setHasMore(true);

        const qy = buildBaseQuery();
        const snap = await getDocs(qy);

        const list: ProjectDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));

        setItems(list);
        setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
        setHasMore(snap.docs.length === pageSize);
      } catch (err) {
        console.error("Projects load error:", err);
        setLoadError(humanizeFirestoreError(err));
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    };

    loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.refreshKey]);

  const loadMore = async () => {
    if (!hasMore || loadingMore || !lastDoc) return;

    try {
      setLoadingMore(true);

      const qy = buildMoreQuery(lastDoc);
      const snap = await getDocs(qy);

      const more: ProjectDoc[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));

      setItems((prev) => [...prev, ...more]);
      setLastDoc(snap.docs[snap.docs.length - 1] ?? lastDoc);
      setHasMore(snap.docs.length === pageSize);
    } catch (err) {
      console.error("Load more error:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  return { loading, items, loadError, hasMore, loadingMore, loadMore };
}

function CurvedProjectsHero({
  title,
  desc,
  onRefresh,
  refreshDisabled,
  children,
}: {
  title: ReactNode;
  desc: string;
  onRefresh: () => void;
  refreshDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden">
      {/* الغطاء الداكن */}
      <div className="relative h-[420px] md:h-[460px]">
        <div className="absolute inset-0 bg-zinc-950" />

        {/* لمعة */}
        <div className="absolute inset-0 opacity-40 bg-[radial-gradient(60%_60%_at_50%_20%,rgba(255,255,255,0.18),transparent_60%)]" />

        {/* نقط خفيفة */}
        <div className="absolute inset-0 opacity-[0.08] bg-[radial-gradient(circle_at_1px_1px,#ffffff_1px,transparent_1px)] [background-size:18px_18px]" />

        {/* محتوى */}
        {/*  270 px + env ( safe - area - inset - top)  كود ثابت ما يتغير  */}
        <div className="container relative z-10 h-full flex items-center pt-[calc(270px+env(safe-area-inset-top))] md:pt-[140px]">
          <div className="w-full">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              {/* ✅ توسيط الكلام فقط */}
              <div className="space-y-2 text-center md:text-right md:space-y-2">
                <h1 className="text-4xl md:text-5xl font-bold text-white flex items-center justify-center md:justify-start gap-2">
                  {title}
                </h1>
                <p className="text-white/75 text-lg">{desc}</p>
              </div>

              <div className="hidden md:flex">
                <Button
                  variant="outline"
                  onClick={onRefresh}
                  disabled={refreshDisabled}
                  className="bg-white/10 border-white/25 text-white hover:bg-white hover:text-black"
                >
                  تحديث
                </Button>
              </div>
            </div>

            {/* كرت الفلاتر */}
            <div className="mt-10">{children}</div>
          </div>
        </div>

        {/* تقويسة تحت */}
        <svg
          className="absolute bottom-[-1px] left-0 w-full h-24 md:h-28 text-white"
          viewBox="0 0 1440 120"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M0,64 C240,120 480,120 720,88 C960,56 1200,8 1440,40 L1440,120 L0,120 Z"
          />
        </svg>
      </div>
    </section>
  );
}

export default function ProjectsPage() {
  const publishedSlider = useDragScroll<HTMLDivElement>();
  const upcomingSlider = useDragScroll<HTMLDivElement>();

  const [labels, setLabels] = useState<Required<LabelsDoc>>(DEFAULT_LABELS);
  const [flags, setFlags] = useState<FlagsDoc>({
    hideVipProjects: false,
    vipOnlyMode: false,
    maintenanceMode: false,
  });

  const [refreshKey, setRefreshKey] = useState(0);

  const published = usePagedProjects({ statusEq: "published", refreshKey });
  const upcoming = usePagedProjects({ statusEq: "draft", refreshKey });
  const done = usePagedProjects({
    statusIn: ["closed", "completed"],
    refreshKey,
  });

  const [qText, setQText] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  useEffect(() => {
    (async () => {
      try {
        const [lSnap, fSnap] = await Promise.all([
          getDoc(doc(db, "settings", "labels")),
          getDoc(doc(db, "settings", "flags")),
        ]);
        if (lSnap.exists()) {
          const d = lSnap.data() as LabelsDoc;
          setLabels({
            projectTypes: {
              ...DEFAULT_LABELS.projectTypes,
              ...(d.projectTypes || {}),
            },
            projectStatuses: {
              ...DEFAULT_LABELS.projectStatuses,
              ...(d.projectStatuses || {}),
            },
          });
        }
        if (fSnap.exists()) setFlags(fSnap.data() as FlagsDoc);
      } catch (e) {
        console.error("Settings load error:", e);
      }
    })();
  }, []);

  const typeLabel = (key: any) =>
    pickLabel(labels.projectTypes[String(key)], "ar", String(key || ""));

  const progressPercent = (p: ProjectDoc) => {
    const t = safeNumber(p.targetAmount);
    if (!t) return 0;
    return Math.min(100, (safeNumber(p.currentAmount) / t) * 100);
  };

  const blockedReason = useMemo(() => {
    if (flags.maintenanceMode) return "maintenance";
    if (flags.vipOnlyMode) return "vip_only_mode";
    return null;
  }, [flags.maintenanceMode, flags.vipOnlyMode]);

  const filteredPublished = useMemo(() => {
    let list = [...published.items];

    if (flags.hideVipProjects) {
      list = list.filter((p) => p.projectType !== "vip_exclusive");
    }
    if (flags.vipOnlyMode) {
      list = list.filter((p) => p.projectType === "vip_exclusive");
    }

    if (typeFilter !== "all") {
      list = list.filter((p) => p.projectType === typeFilter);
    }

    const q = qText.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const t = (p.titleAr || p.titleEn || "").toLowerCase();
        const l = (p.locationAr || p.locationEn || "").toLowerCase();
        const i = (p.issueNumber || "").toLowerCase();
        return t.includes(q) || l.includes(q) || i.includes(q);
      });
    }

    list.sort((a, b) => {
      if (sortBy === "progress") return progressPercent(b) - progressPercent(a);
      if (sortBy === "return")
        return safeNumber(b.annualReturn) - safeNumber(a.annualReturn);

      const ad = a.createdAt?.toMillis?.() || 0;
      const bd = b.createdAt?.toMillis?.() || 0;
      return bd - ad;
    });

    return list;
  }, [
    published.items,
    qText,
    typeFilter,
    sortBy,
    flags.hideVipProjects,
    flags.vipOnlyMode,
  ]);

  const SectionHeaderBlock = (props: {
    kicker?: string;
    title: string;
    desc?: string;
  }) => (
    <div className="text-center max-w-3xl mx-auto">
      {props.kicker ? (
        <p className="text-xs sm:text-sm text-muted-foreground tracking-wide">
          {props.kicker}
        </p>
      ) : null}
      <h2 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-bold">
        {props.title}
      </h2>
      <div className="mx-auto mt-4 h-[2px] w-16 rounded-full bg-primary/60" />
      {props.desc ? (
        <p className="mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
          {props.desc}
        </p>
      ) : null}
    </div>
  );

  /**
   * FIX: Removed nested <a> inside <Link> to fix Hydration error.
   * The Card itself is now wrapped in Link, or the button is the link.
   */
  const ProjectCard = (p: ProjectDoc, mode: "published" | "draft" | "done") => {
    const target = safeNumber(p.targetAmount);
    const current = safeNumber(p.currentAmount);
    const prog = mode === "done" ? 100 : progressPercent(p);

    const rawCover =
      (p.coverImage && String(p.coverImage).trim()) ||
      (p.image && String(p.image).trim()) ||
      "";
    const cover = rawCover ? normalizePublicImage(rawCover) : FALLBACK_COVER;

    const title = p.titleAr || p.titleEn || "بدون عنوان";
    const location = p.locationAr || p.locationEn || "—";

    const isDone = mode === "done";
    const isDraft = mode === "draft";

    return (
      <Card key={p.id} className={`overflow-hidden ${isDone ? "opacity-90" : ""}`}>
        <div className="relative h-44 w-full bg-muted">
          <img
            src={cover}
            alt={title}
            className={`h-full w-full object-cover ${isDone ? "grayscale-[0.15]" : ""
              }`}
            loading="lazy"
            draggable={false}
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

            {isDraft && (
              <Badge variant="secondary" className="bg-white/80">
                قريباً
              </Badge>
            )}

            {isDone && (
              <Badge variant="secondary" className="bg-white/80">
                مكتمل
              </Badge>
            )}

            {p.issueNumber && (
              <Badge variant="secondary" className="bg-white/80">
                #{p.issueNumber}
              </Badge>
            )}
          </div>

          <div className="absolute bottom-3 right-3 left-3">
            <div className="text-white text-lg font-semibold leading-tight line-clamp-1">
              {title}
            </div>
            <div className="text-white/85 text-sm flex items-center gap-2 mt-1">
              <MapPin className="w-4 h-4" />
              <span className="line-clamp-1">{location}</span>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">التقدم</span>

              <span className="inline-flex items-center gap-2 font-semibold">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--gold), var(--gold-deep))",
                    boxShadow: "0 0 0 6px rgba(242,174,48,0.10)",
                  }}
                />
                {prog.toFixed(1)}%
              </span>
            </div>

            <div
              className="relative h-3 w-full overflow-hidden rounded-full"
              style={{
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.06), rgba(0,0,0,0.03))",
                border: "1px solid rgba(0,0,0,0.08)",
                boxShadow: "0 10px 28px rgba(3,6,64,0.06) inset",
              }}
              aria-label="progress"
              role="progressbar"
              aria-valuenow={Math.round(prog)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(80% 140% at 30% 0%, rgba(255,255,255,0.65), transparent 45%)",
                  opacity: 0.35,
                }}
              />

              <div
                className="absolute inset-y-0 right-0 rounded-full"
                style={{
                  width: `${prog}%`,
                  background:
                    "linear-gradient(135deg, var(--primary), color-mix(in oklab, var(--primary) 70%, var(--gold) 30%))",
                  boxShadow:
                    "0 10px 24px rgba(3,6,64,0.18), 0 0 0 1px rgba(255,255,255,0.20) inset",
                }}
              />

              <div
                className="absolute inset-y-0 right-0"
                style={{
                  width: `${prog}%`,
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0))",
                  mixBlendMode: "overlay",
                  opacity: 0.65,
                }}
              />
            </div>

            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{fmtSAR(isDone ? target : current)}</span>
              <span>{fmtSAR(target)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">الحد الأدنى</div>
              <div className="font-semibold">{fmtSAR(p.minInvestment)}</div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">العائد السنوي</div>
              <div className="font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                {safeNumber(p.annualReturn)}%
              </div>
            </div>

            <div className="rounded-lg border p-3 col-span-2">
              <div className="text-xs text-muted-foreground">المدة</div>
              <div className="font-semibold">{safeNumber(p.duration)} شهر</div>
            </div>
          </div>

          <div className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
            {p.overviewAr || p.descriptionAr || p.descriptionEn || "—"}
          </div>

          <Link href={`/projects/${p.id}`}>
            <Button
              className="w-full"
              variant={isDraft ? "outline" : "default"}
            >
              عرض التفاصيل
            </Button>
          </Link>
        </div>
      </Card>
    );
  };

  // ✅ سكشن موحد: يملا الشاشة + سناب + light/dark
  const SectionShell = (props: {
    id?: string;
    className?: string;
    children: ReactNode;
    variant?: "light" | "dark";
  }) => (
    <section
      id={props.id}
      className={[
        "min-h-[100vh] snap-start relative overflow-hidden",
        "py-16 sm:py-20",
        props.variant === "dark"
          ? "bg-zinc-950 text-white"
          : "bg-transparent text-foreground",
        props.className ?? "",
      ].join(" ")}
    >
      <div className="container w-full">{props.children}</div>
    </section>
  );

  return (
    <div
      className="rsg-page w-full bg-transparent text-foreground"
      dir="rtl"
      lang="ar"
    >

      <div className="pt-0">
        <CurvedProjectsHero
          title={
            <>
              <Sparkles className="w-7 h-7" />
              مشاريعنا الاستثمارية
            </>
          }
          desc="استعرض الفرص المتاحة، تفاصيل العوائد، وقدم اهتمامك بسهولة."
          onRefresh={() => setRefreshKey((x) => x + 1)}
          refreshDisabled={
            published.loading ||
            published.loadingMore ||
            upcoming.loading ||
            upcoming.loadingMore ||
            done.loading ||
            done.loadingMore
          }
        >
          <div className="space-y-4">
            {blockedReason === "maintenance" && (
              <Card
                className="border"
                style={{
                  borderColor:
                    "color-mix(in oklab, var(--gold) 35%, transparent)",
                }}
              >
                <CardContent className="py-6 flex items-start gap-3">
                  <AlertTriangle
                    className="w-5 h-5 mt-0.5"
                    style={{
                      color:
                        "color-mix(in oklab, var(--gold) 82%, white 18%)",
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

            <Card className="bg-white/95 backdrop-blur border border-white/15 shadow-xl">
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

                <div className="lg:hidden flex justify-center pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setRefreshKey((x) => x + 1)}
                    disabled={
                      published.loading ||
                      upcoming.loading ||
                      done.loading ||
                      published.loadingMore ||
                      upcoming.loadingMore ||
                      done.loadingMore
                    }
                  >
                    تحديث
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </CurvedProjectsHero>
      </div>

      {/* ✅ سناب سكشن سكشن */}
      <main className="flex-1">
        {/* 1) المشاريع الحالية */}
        <SectionShell className="-mt-10" variant="light">
          <div className="flex justify-center">
            <p className="inline-block px-3 py-1 text-[20px] sm:text-[16px] md:text-[30px] font-semibold text-center text-black/90 border border-black/50 rounded-[10px]">
              الحالية
            </p>
          </div>

          <SectionHeaderBlock
            title="المشاريع المنشورة"
            desc="هذه المشاريع متاحة الآن للاطلاع والتفاصيل."
          />

          <div className="mt-10">
            {flags.maintenanceMode ? (
              <div className="py-16 text-center text-muted-foreground">
                المشاريع غير متاحة حالياً بسبب الصيانة.
              </div>
            ) : (
              <>
                {published.loading && (
                  <div className="py-16 text-center text-muted-foreground">
                    جاري تحميل المشاريع...
                  </div>
                )}

                {published.loadError && !published.loading && (
                  <Card className="border-destructive/30 mt-6">
                    <CardContent className="py-10 text-center space-y-3">
                      <div className="font-semibold">{published.loadError}</div>

                      <div className="text-sm text-muted-foreground">
                        ملاحظة: هذه الصفحة تحتاج مشاريع بها{" "}
                        <span className="font-semibold">createdAt</span>{" "}
                        (Timestamp).
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

                {!published.loading &&
                  !published.loadError &&
                  filteredPublished.length === 0 && (
                    <Card className="mt-6">
                      <CardContent className="py-12 text-center text-muted-foreground space-y-3">
                        <div>لا توجد مشاريع مطابقة للبحث/الفلترة.</div>
                        {published.hasMore && published.items.length > 0 && (
                          <Button
                            variant="outline"
                            onClick={published.loadMore}
                            disabled={published.loadingMore}
                          >
                            {published.loadingMore
                              ? "جاري التحميل..."
                              : "تحميل المزيد"}
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  )}

                {!published.loading &&
                  !published.loadError &&
                  filteredPublished.length > 0 && (
                    <>
                      {/* ✅ Mobile: صف أفقي (سحب يمين/يسار) */}
                      <div
                        ref={publishedSlider.ref}
                        {...publishedSlider.bind}
                        dir="ltr"
                        className="
                          md:hidden
                          flex gap-5 overflow-x-auto overflow-y-hidden pb-4
                          snap-x snap-mandatory
                          scroll-smooth
                          [-ms-overflow-style:none] [scrollbar-width:none]
                          [&::-webkit-scrollbar]:hidden
                          select-none
                          cursor-grab active:cursor-grabbing
                        "
                        style={{ WebkitOverflowScrolling: "touch" }}
                      >
                        {filteredPublished.map((p) => (
                          <div
                            key={p.id}
                            dir="rtl"
                            className="snap-start shrink-0 w-[86%] sm:w-[420px]"
                          >
                            {ProjectCard(p, "published")}
                          </div>
                        ))}
                      </div>

                      {/* ✅ Desktop: Grid */}
                      <div className="hidden md:grid mt-10 md:grid-cols-2 xl:grid-cols-3 gap-5">
                        {filteredPublished.map((p) =>
                          ProjectCard(p, "published")
                        )}
                      </div>

                      <div className="mt-10 flex justify-center">
                        {published.hasMore ? (
                          <Button
                            variant="outline"
                            onClick={published.loadMore}
                            disabled={published.loadingMore}
                          >
                            {published.loadingMore
                              ? "جاري التحميل..."
                              : "تحميل المزيد"}
                          </Button>
                        ) : (
                          <div className="text-sm text-muted-foreground" />
                        )}
                      </div>
                    </>
                  )}
              </>
            )}
          </div>
        </SectionShell>

        {/* 2) المشاريع المستقبلية */}
        <SectionShell variant="dark" className="pb-24">
          {/* محتوى السكشن */}
          <div className="w-full">
            <div className="text-center max-w-3xl mx-auto">
              <p className="inline-block px-3 py-1 text-[20px] sm:text-[16px] md:text-[30px] font-semibold text-white/90 border border-white/50 rounded-[10px]">
                قريباً
              </p>

              <h2 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-bold">
                المشاريع المستقبلية
              </h2>

              <div className="mx-auto mt-4 h-[2px] w-16 rounded-full bg-white/20" />

              <p className="mt-4 text-sm sm:text-base text-white/75 leading-relaxed">
                فرص قادمة قيد الدراسة والتحضير.
              </p>
            </div>

            <div className="mt-10">
              {upcoming.loading ? (
                <div className="py-16 text-center text-white/70">
                  جاري تحميل المشاريع...
                </div>
              ) : upcoming.loadError ? (
                <Card className="border-white/10 bg-white/5 backdrop-blur mt-6">
                  <CardContent className="py-10 text-center space-y-3 text-white">
                    <div className="font-semibold">{upcoming.loadError}</div>
                    <Button variant="outline" onClick={() => setRefreshKey((x) => x + 1)}>
                      إعادة المحاولة
                    </Button>
                  </CardContent>
                </Card>
              ) : upcoming.items.length === 0 ? (
                <div className="py-16 text-center text-white/70">
                  لا توجد مشاريع مستقبلية حالياً.
                </div>
              ) : (
                <>
                  <div className="mt-10">
                    <div
                      ref={upcomingSlider.ref}
                      {...upcomingSlider.bind}
                      dir="ltr"
                      className="
                flex gap-5 overflow-x-auto overflow-y-hidden pb-4
                snap-x snap-mandatory
                scroll-smooth
                [-ms-overflow-style:none] [scrollbar-width:none]
                [&::-webkit-scrollbar]:hidden
                select-none
                cursor-grab active:cursor-grabbing
              "
                      style={{ WebkitOverflowScrolling: "touch" }}
                    >
                      {upcoming.items.map((p) => (
                        <div
                          key={p.id}
                          dir="rtl"
                          className="snap-start shrink-0 w-[86%] sm:w-[420px] md:w-[460px]"
                        >
                          {ProjectCard(p, "draft")}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-10 flex justify-center">
                    {upcoming.hasMore ? (
                      <Button
                        variant="outline"
                        onClick={upcoming.loadMore}
                        disabled={upcoming.loadingMore}
                      >
                        {upcoming.loadingMore ? "جاري التحميل..." : "تحميل المزيد"}
                      </Button>
                    ) : (
                      <div className="text-sm text-white/65" />
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ✅ التقوس مثبت بأسفل السكشن نفسه */}
          <svg
            className="absolute bottom-[-1px] left-0 w-full h-24 md:h-28 text-white pointer-events-none"
            viewBox="0 0 1440 120"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M0,64 C240,120 480,120 720,88 C960,56 1200,8 1440,40 L1440,120 L0,120 Z"
            />
          </svg>
        </SectionShell>

        {/* 3) المشاريع المكتملة */}
        <SectionShell variant="light">
          <div className="w-full">
            <div className="flex justify-center">
              <p className="inline-block px-3 py-1 text-[20px] sm:text-[16px] md:text-[30px] font-semibold text-center text-black/90 border border-black/50 rounded-[10px]">
                منجزة
              </p>
            </div>

            <SectionHeaderBlock
              title="المشاريع المكتملة"
              desc="مشاريع تم الانتهاء منها أو إغلاقها."
            />

            <div className="mt-10">
              {done.loading ? (
                <div className="py-16 text-center text-muted-foreground">
                  جاري تحميل المشاريع...
                </div>
              ) : done.loadError ? (
                <Card className="border-destructive/30 mt-6">
                  <CardContent className="py-10 text-center space-y-3">
                    <div className="font-semibold">{done.loadError}</div>
                    <Button
                      variant="outline"
                      onClick={() => setRefreshKey((x) => x + 1)}
                    >
                      إعادة المحاولة
                    </Button>
                  </CardContent>
                </Card>
              ) : done.items.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  لا توجد مشاريع مكتملة حالياً.
                </div>
              ) : (
                <>
                  <div className="mt-10 grid md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {done.items.map((p) => ProjectCard(p, "done"))}
                  </div>

                  <div className="mt-10 flex justify-center">
                    {done.hasMore ? (
                      <Button
                        variant="outline"
                        onClick={done.loadMore}
                        disabled={done.loadingMore}
                      >
                        {done.loadingMore ? "جاري التحميل..." : "تحميل المزيد"}
                      </Button>
                    ) : (
                      <div className="text-sm text-muted-foreground" />
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </SectionShell>
      </main>
    </div>
  );
}
