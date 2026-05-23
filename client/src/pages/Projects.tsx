// client/src/pages/Projects.tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useDragScroll } from "@/hooks/useDragScroll";
import { cn } from "@/lib/utils";
import {
  normalizeProjectImagePath,
  pickAssetPath,
  PROJECT_IMAGE_FALLBACK,
} from "@/lib/publicAssets";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Hourglass,
  Landmark,
  Layers3,
  Search,
  MapPin,
  TrendingUp,
  Shield,
  Sparkles,
  Target,
  Users,
  Wallet,
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
import { getProjectBusinessId } from "@/lib/businessIds";
import { useSiteContent } from "@/contexts/SiteContentContext";
import { getSitePageMediaUrl } from "@/lib/siteContent";
import {
  formatCurrencyEN,
  formatNumberEN,
  formatPercentEN,
} from "@/lib/formatters";
import { getProjectComputedAmounts } from "@/lib/projectAmounts";

type BiLabel = { ar?: string; en?: string };
type LabelValue = string | BiLabel;
type AttachmentLink = { name?: string; url?: string; externalUrl?: string };

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

const PAGE_SIZE = 12;

type ProjectDoc = {
  id: string;

  titleAr?: string;
  titleEn?: string;

  locationAr?: string;
  locationEn?: string;

  projectType?: string;
  status?: string;

  businessId?: string;
  issueNumber?: string;

  coverImage?: string;
  coverImageUrl?: string;
  image?: string;
  imageUrl?: string;
  heroImage?: string;
  media?: unknown;
  gallery?: string[];
  galleryImages?: string[];
  images?: string[];
  attachments?: AttachmentLink[];

  overviewAr?: string;
  descriptionAr?: string;
  descriptionEn?: string;

  targetAmount?: number;
  currentAmount?: number;
  coverageRate?: number;
  baseCoveredAmount?: number;
  investmentsAmount?: number;

  minInvestment?: number;
  annualReturn?: number;
  duration?: number;
  investorsCount?: number;
  featured?: boolean;
  isVip?: boolean;
  vipOnly?: boolean;
  vipTier?: string;
  highlights?: string[];

  risksAr?: string;

  videoUrl?: string;

  createdAt?: Timestamp | any;
};

function MobileProjectCarousel({
  items,
  renderCard,
  sectionLabel,
  hint,
  tone = "light",
}: {
  items: ProjectDoc[];
  renderCard: (project: ProjectDoc, index: number) => ReactNode;
  sectionLabel: string;
  hint: string;
  tone?: "light" | "dark";
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef<number | null>(null);

  const canNavigate = items.length > 1;
  const toneMap =
    tone === "dark"
      ? {
        shell:
          "border-white/12 bg-[linear-gradient(180deg,rgba(16,33,55,0.96)_0%,rgba(11,26,44,0.92)_100%)] text-white shadow-[0_28px_62px_-40px_rgba(2,12,27,0.62)]",
        kicker: "text-white/52",
        title: "text-white",
        helper: "text-white/68",
        counter: "border-white/12 bg-white/8 text-white",
        swipeHint: "border-white/10 bg-white/6 text-white/70",
        divider: "border-white/10",
        dotIdle: "bg-white/20",
        dotActive: "bg-white",
        arrowEnabled:
          "border-white/14 bg-white/8 text-white shadow-[0_14px_30px_-24px_rgba(0,0,0,0.55)] hover:bg-white hover:text-slate-950",
        arrowDisabled: "border-white/10 bg-white/5 text-white/28",
      }
      : {
        shell:
          "border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.95)_100%)] text-slate-950 shadow-[0_26px_58px_-42px_rgba(15,23,42,0.18)]",
        kicker: "text-slate-400",
        title: "text-slate-950",
        helper: "text-slate-500",
        counter: "border-slate-200/80 bg-white text-slate-900",
        swipeHint: "border-slate-200 bg-slate-50/90 text-slate-600",
        divider: "border-slate-200/80",
        dotIdle: "bg-slate-300",
        dotActive: "bg-slate-900",
        arrowEnabled:
          "border-slate-200 bg-white text-slate-700 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.18)] hover:bg-slate-50",
        arrowDisabled: "border-slate-200/80 bg-slate-100 text-slate-300",
      };

  useEffect(() => {
    setActiveIndex(currentIndex =>
      Math.max(0, Math.min(items.length - 1, currentIndex))
    );
    setDragOffsetPx(0);
    setIsDragging(false);
    dragStartXRef.current = null;
  }, [items.length]);

  const canScrollPrev = canNavigate && activeIndex > 0;
  const canScrollNext = canNavigate && activeIndex < items.length - 1;

  const scrollToIndex = (targetIndex: number) => {
    const nextIndex = Math.max(0, Math.min(items.length - 1, targetIndex));
    setActiveIndex(nextIndex);
  };

  const isInteractiveTarget = (target: EventTarget | null) =>
    target instanceof Element &&
    Boolean(
      target.closest(
        "a, button, input, textarea, select, label, [role='button'], [data-carousel-ignore-drag='true']"
      )
    );

  const finishDrag = () => {
    dragStartXRef.current = null;
    setDragOffsetPx(0);
    setIsDragging(false);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canNavigate) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (isInteractiveTarget(event.target)) return;

    dragStartXRef.current = event.clientX;
    setDragOffsetPx(0);
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const startX = dragStartXRef.current;
    if (startX === null) return;

    const rawDelta = event.clientX - startX;
    const dampedDelta =
      (activeIndex === 0 && rawDelta > 0) ||
        (activeIndex === items.length - 1 && rawDelta < 0)
        ? rawDelta * 0.32
        : rawDelta;

    setDragOffsetPx(dampedDelta);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const startX = dragStartXRef.current;
    if (startX === null) return;

    const deltaX = event.clientX - startX;
    const swipeThreshold = 56;

    if (deltaX <= -swipeThreshold) {
      scrollToIndex(activeIndex + 1);
    } else if (deltaX >= swipeThreshold) {
      scrollToIndex(activeIndex - 1);
    }

    finishDrag();
  };

  return (
    <div className="md:hidden">
      <div className={cn("rounded-[26px] border p-4", toneMap.shell)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div
              className={cn(
                "text-[11px] font-semibold tracking-[0.16em]",
                toneMap.kicker
              )}
            >
              {sectionLabel}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div
                className={cn(
                  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
                  toneMap.counter
                )}
              >
                الفرصة {formatNumberEN(activeIndex + 1)} من{" "}
                {formatNumberEN(items.length)}
              </div>

              {canNavigate ? (
                <div
                  className={cn(
                    "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium",
                    toneMap.swipeHint
                  )}
                >
                  اسحب للتنقل أو استخدم الأسهم
                </div>
              ) : null}
            </div>
            <p className={cn("mt-2 text-xs leading-6", toneMap.helper)}>
              {hint}
            </p>
          </div>

          {canNavigate ? (
            <div dir="ltr" className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn(
                  "h-10 w-10 rounded-full border transition-all duration-200 disabled:opacity-100",
                  canScrollPrev
                    ? toneMap.arrowEnabled
                    : toneMap.arrowDisabled
                )}
                onClick={() => scrollToIndex(activeIndex - 1)}
                disabled={!canScrollPrev}
                aria-label="الفرصة السابقة"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn(
                  "h-10 w-10 rounded-full border transition-all duration-200 disabled:opacity-100",
                  canScrollNext
                    ? toneMap.arrowEnabled
                    : toneMap.arrowDisabled
                )}
                onClick={() => scrollToIndex(activeIndex + 1)}
                disabled={!canScrollNext}
                aria-label="الفرصة التالية"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          <div
            className="overflow-hidden [touch-action:pan-y] select-none"
            dir="ltr"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={finishDrag}
            onLostPointerCapture={finishDrag}
          >
            <div
              className={cn(
                "flex items-stretch will-change-transform",
                isDragging
                  ? "transition-none"
                  : "transition-transform duration-300 ease-out"
              )}
              style={{
                transform: `translate3d(calc(${activeIndex * -100}% + ${dragOffsetPx}px), 0, 0)`,
              }}
            >
              {items.map((project, index) => (
                <div
                  key={project.id}
                  dir="rtl"
                  data-mobile-project-card
                  className="min-w-full max-w-full flex-none pb-2 pt-1"
                >
                  {renderCard(project, index)}
                </div>
              ))}
            </div>
          </div>
        </div>

        {canNavigate ? (
          <div
            className={cn(
              "mt-3 flex items-center justify-between gap-3 border-t pt-3",
              toneMap.divider
            )}
          >
            <div className={cn("text-[11px] font-medium", toneMap.helper)}>
              تنقل سريع بين الفرص مع تثبيت واضح لكل بطاقة
            </div>
            <div className="flex items-center gap-1.5">
              {items.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "h-2 rounded-full transition-all duration-200",
                    index === activeIndex
                      ? cn("w-6", toneMap.dotActive)
                      : cn("w-2", toneMap.dotIdle)
                  )}
                  onClick={() => scrollToIndex(index)}
                  aria-label={`الانتقال إلى الفرصة ${index + 1}`}
                  aria-current={index === activeIndex ? "true" : undefined}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function safeNumber(n: any) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function fmtSAR(n: any) {
  return formatCurrencyEN(safeNumber(n));
}

function pickLabel(v: unknown, lang: "ar" | "en" = "ar", fallback = "") {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as BiLabel;
    return (lang === "ar" ? o.ar : o.en) || o.ar || o.en || fallback;
  }
  return fallback;
}

function getProjectImageSource(project: ProjectDoc) {
  return normalizeProjectImagePath(
    pickAssetPath(
      project.coverImage,
      project.coverImageUrl,
      project.heroImage,
      project.imageUrl,
      project.image,
      project.media,
      project.gallery,
      project.galleryImages,
      project.images
    )
  );
}

function humanizeFirestoreError(err: unknown): string {
  const e = err as Partial<FirestoreError> | undefined;

  if (e?.code === "permission-denied") {
    return "تعذر تحميل المشاريع بسبب صلاحيات الوصول. يرجى التواصل مع إدارة المنصة.";
  }
  if (e?.code === "failed-precondition") {
    return "تعذر تحميل المشاريع بسبب إعداد غير مكتمل في خدمة البيانات. يرجى التواصل مع إدارة المنصة.";
  }
  if (e?.code === "unauthenticated") {
    return "يرجى تسجيل الدخول لعرض المشاريع.";
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

        const list: ProjectDoc[] = snap.docs.map(d => ({
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

      const more: ProjectDoc[] = snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as any),
      }));

      setItems(prev => [...prev, ...more]);
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
  imageSrc,
  children,
}: {
  title: ReactNode;
  desc: string;
  imageSrc: string;
  children: ReactNode;
}) {
  return (
    <section className="relative z-0 min-h-[100svh] overflow-hidden bg-[#050b14] text-white">
      <div className="pointer-events-none absolute inset-0">
        <img
          src={imageSrc}
          alt="Projects Hero"
          className="h-full w-full object-cover object-center"
          onError={event => {
            const image = event.currentTarget;
            if (image.src.endsWith("/HOOM-HERO7.jpg")) return;
            image.src = "/HOOM-HERO7.jpg";
          }}
        />
      </div>
      {/* الغطاء الداكن */}
      <div className="pointer-events-none absolute inset-0 bg-black/44" />
      {/* لمعة */}
      <div className="pointer-events-none absolute inset-0 opacity-24 bg-[radial-gradient(60%_60%_at_50%_18%,rgba(255,255,255,0.16),transparent_60%)]" />

      {/* محتوى */}
      {/*  270 px + env ( safe - area - inset - top)  كود ثابت ما يتغير  */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/35 to-transparent" />
      <div className="container relative z-10 flex min-h-[100svh] flex-col justify-center pt-[calc(var(--site-header-offset)+1.25rem)] pb-6 sm:pb-8 md:pt-[calc(var(--site-header-offset)+1.75rem)] md:pb-10">
        <div className="mx-auto w-full max-w-5xl space-y-7 md:space-y-8">
          <div className="flex flex-col gap-4 text-center md:text-right">
            <div className="space-y-2.5">
              <h1 className="flex items-center justify-center gap-2 text-4xl font-bold text-white md:justify-start md:text-5xl">
                {title}
              </h1>
              <p className="mx-auto max-w-3xl text-lg text-white/75 md:mx-0">
                {desc}
              </p>
            </div>
          </div>

          {/* كرت الفلاتر */}
          <div>{children}</div>
        </div>
      </div>

      {/* تقويسة تحت */}
      <svg
        className="pointer-events-none absolute bottom-0 left-0 h-20 w-full text-[#f8fafc] sm:h-24 md:h-28"
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          fill="currentColor"
          d="M0,64 C240,120 480,120 720,88 C960,56 1200,8 1440,40 L1440,120 L0,120 Z"
        />
      </svg>
    </section>
  );
}

export default function ProjectsPage() {
  const { content } = useSiteContent();
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
  const projectsHeroImage = getSitePageMediaUrl(
    content,
    "projects",
    "projectsHeroImage",
    "/HOOM-HERO7.jpg"
  );

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

  const isVipProject = (project: ProjectDoc) =>
    Boolean(project.vipOnly) ||
    Boolean(project.isVip) ||
    project.projectType === "vip_exclusive";

  const progressPercent = (p: ProjectDoc) => {
    return getProjectComputedAmounts(p).progressPercent;
  };

  const blockedReason = useMemo(() => {
    if (flags.maintenanceMode) return "maintenance";
    if (flags.vipOnlyMode) return "vip_only_mode";
    return null;
  }, [flags.maintenanceMode, flags.vipOnlyMode]);

  const filteredPublished = useMemo(() => {
    let list = [...published.items];

    if (flags.hideVipProjects) {
      list = list.filter(p => p.projectType !== "vip_exclusive");
    }
    if (flags.vipOnlyMode) {
      list = list.filter(p => p.projectType === "vip_exclusive");
    }

    if (typeFilter !== "all") {
      list = list.filter(p => p.projectType === typeFilter);
    }

    const q = qText.trim().toLowerCase();
    if (q) {
      list = list.filter(p => {
        const t = (p.titleAr || p.titleEn || "").toLowerCase();
        const l = (p.locationAr || p.locationEn || "").toLowerCase();
        const i = getProjectBusinessId(p).toLowerCase();
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

  const publishedFundingCurrent = useMemo(
    () =>
      filteredPublished.reduce(
        (sum, project) => sum + getProjectComputedAmounts(project).currentAmount,
        0
      ),
    [filteredPublished]
  );

  const publishedFundingTarget = useMemo(
    () =>
      filteredPublished.reduce(
        (sum, project) => sum + safeNumber(project.targetAmount),
        0
      ),
    [filteredPublished]
  );

  const bestPublishedReturn = useMemo(
    () =>
      filteredPublished.reduce(
        (best, project) => Math.max(best, safeNumber(project.annualReturn)),
        0
      ),
    [filteredPublished]
  );

  const upcomingFundingTarget = useMemo(
    () =>
      upcoming.items.reduce(
        (sum, project) => sum + safeNumber(project.targetAmount),
        0
      ),
    [upcoming.items]
  );

  const upcomingBestReturn = useMemo(
    () =>
      upcoming.items.reduce(
        (best, project) => Math.max(best, safeNumber(project.annualReturn)),
        0
      ),
    [upcoming.items]
  );

  const completedDocumentedCount = useMemo(
    () =>
      done.items.filter(project => {
        const hasGallery = Array.isArray(project.gallery) && project.gallery.length > 0;
        const hasAttachments =
          Array.isArray(project.attachments) && project.attachments.length > 0;
        return hasGallery || hasAttachments;
      }).length,
    [done.items]
  );

  const completedVipCount = useMemo(
    () => done.items.filter(isVipProject).length,
    [done.items]
  );

  const SectionHeaderBlock = (props: {
    kicker?: string;
    title: string;
    desc?: string;
    badge?: string;
    inverted?: boolean;
    metrics?: Array<{ label: string; value: string }>;
  }) => {
    const inverted = props.inverted;

    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="mx-auto max-w-3xl text-center">
          <div className="flex flex-wrap items-center justify-center gap-3">
            {props.kicker ? (
              <Badge
                className={cn(
                  "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                  inverted
                    ? "border-white/12 bg-white/8 text-white/80"
                    : "border-slate-200 bg-white text-slate-700"
                )}
              >
                {props.kicker}
              </Badge>
            ) : null}
            {props.badge ? (
              <Badge
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold",
                  inverted
                    ? "border-amber-300/20 bg-amber-300/12 text-amber-200"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                )}
              >
                {props.badge}
              </Badge>
            ) : null}
          </div>

          <h2
            className={cn(
              "mt-4 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl",
              inverted ? "text-white" : "text-slate-950"
            )}
          >
            {props.title}
          </h2>

          {props.desc ? (
            <p
              className={cn(
                "mx-auto mt-4 max-w-2xl text-sm leading-8 sm:text-base",
                inverted ? "text-white/72" : "text-slate-600"
              )}
            >
              {props.desc}
            </p>
          ) : null}
        </div>

        {props.metrics?.length ? (
          <div className="grid gap-3 md:grid-cols-3">
            {props.metrics.map(metric => (
              <div
                key={metric.label}
                className={cn(
                  "rounded-[24px] border px-5 py-4 shadow-sm",
                  inverted
                    ? "border-white/10 bg-white/6 text-white backdrop-blur"
                    : "border-slate-200/80 bg-white/90 text-slate-950"
                )}
              >
                <div
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-[0.18em]",
                    inverted ? "text-white/55" : "text-slate-500"
                  )}
                >
                  {metric.label}
                </div>
                <div className="mt-2 text-xl font-semibold">{metric.value}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const CompletedProjectCard = (project: ProjectDoc) => {
    const cover = getProjectImageSource(project);
    const title = project.titleAr || project.titleEn || "بدون عنوان";
    const location = project.locationAr || project.locationEn || "—";
    const projectTypeLabel = typeLabel(project.projectType);
    const isVip = isVipProject(project);
    const auxiliaryTag = isVip
      ? "VIP"
      : project.featured
        ? "مميز"
        : "سجل منجز";

    return (
      <Card
        key={project.id}
        className="group overflow-hidden rounded-[30px] border border-slate-200/80 bg-slate-950 py-0 text-white shadow-[0_34px_90px_-48px_rgba(15,23,42,0.45)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_42px_110px_-46px_rgba(15,23,42,0.52)]"
      >
        <div className="relative min-h-[360px] w-full overflow-hidden">
          <img
            src={cover}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            draggable={false}
            onError={e => {
              const img = e.currentTarget;
              if (img.src.includes(PROJECT_IMAGE_FALLBACK)) return;
              img.src = PROJECT_IMAGE_FALLBACK;
            }}
          />

          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.10)_0%,rgba(2,6,23,0.16)_26%,rgba(2,6,23,0.58)_72%,rgba(2,6,23,0.88)_100%)]" />
          <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.20),transparent_60%)]" />

          <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge className="rounded-full border border-emerald-300/24 bg-emerald-300/14 px-3 py-1 text-[11px] font-semibold text-emerald-50 backdrop-blur">
                مكتمل
              </Badge>
              {projectTypeLabel ? (
                <Badge className="rounded-full border border-white/16 bg-black/25 px-3 py-1 text-[11px] font-semibold text-white/92 backdrop-blur">
                  {projectTypeLabel}
                </Badge>
              ) : null}
              <Badge className="rounded-full border border-amber-300/24 bg-amber-300/14 px-3 py-1 text-[11px] font-semibold text-amber-50 backdrop-blur">
                {auxiliaryTag}
              </Badge>
            </div>

            {getProjectBusinessId(project) ? (
              <Badge className="rounded-full border border-white/16 bg-black/25 px-3 py-1 text-[11px] font-semibold text-white/88 backdrop-blur">
                {getProjectBusinessId(project)}
              </Badge>
            ) : null}
          </div>

          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
            <div className="rounded-[28px] border border-white/12 bg-black/20 p-5 shadow-[0_18px_42px_-26px_rgba(2,6,23,0.9)] backdrop-blur-md">
              <div className="space-y-3">
                <h3 className="text-2xl font-semibold leading-tight tracking-tight text-white">
                  {title}
                </h3>

                <div className="flex items-center gap-2 text-sm text-white/78">
                  <MapPin className="h-4 w-4 text-white/68" />
                  <span className="line-clamp-1">{location}</span>
                </div>

                <Link href={`/projects/${project.id}`}>
                  <Button className="mt-2 h-11 rounded-2xl border border-white/14 bg-white/12 px-4 text-sm font-semibold text-white shadow-none hover:bg-white hover:text-slate-950">
                    <span>عرض النتائج</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Card>
    );
  };

  const InvestmentCard = (
    p: ProjectDoc,
    mode: "published" | "draft" | "done"
  ) => {
    const computedAmounts = getProjectComputedAmounts(p);
    const target = computedAmounts.targetAmount;
    const current = computedAmounts.currentAmount;
    const displayCurrent =
      mode === "done" && !current && target ? target : current;
    const progress = mode === "done" ? 100 : progressPercent(p);
    const cover = getProjectImageSource(p);
    const title = p.titleAr || p.titleEn || "بدون عنوان";
    const location = p.locationAr || p.locationEn || "—";
    const description = (
      p.overviewAr ||
      p.descriptionAr ||
      p.descriptionEn ||
      ""
    ).trim();
    const leadingHighlight = Array.isArray(p.highlights)
      ? p.highlights.map(item => String(item || "").trim()).find(Boolean) || ""
      : "";
    const annualReturn = safeNumber(p.annualReturn);
    const duration = safeNumber(p.duration);
    const investors = computedAmounts.remainingInvestorsCount;
    const minInvestment = safeNumber(p.minInvestment);
    const isVip =
      Boolean(p.vipOnly) ||
      Boolean(p.isVip) ||
      p.projectType === "vip_exclusive";
    const isFeatured = Boolean(p.featured);

    const modeMeta =
      mode === "published"
        ? {
          badgeLabel: "مفتوح الآن",
          badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
          subline: "فرصة استثمارية نشطة",
          heroCaption:
            "العائد الظاهر هنا هو أول عنصر يجب أن يلتقط عين المستثمر عند تقييم الفرصة.",
          ctaLabel: "التفاصيل",
          ctaClass:
            "bg-slate-900 text-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.55)] hover:bg-slate-800",
          noteLabel: "جاهز للاستثمار",
          noteCopy:
            "الفرصة مفتوحة الآن ويمكن الانتقال من صفحة المشروع مباشرة إلى طلب الاستثمار.",
          trustCopy:
            investors > 0
              ? `انضم ${formatNumberEN(investors)} مستثمرًا حتى الآن`
              : "فرصة جاهزة للمراجعة والاستثمار",
        }
        : mode === "draft"
          ? {
            badgeLabel: "قريبًا",
            badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
            subline: "فرصة قيد الإطلاق",
            heroCaption:
              "بطاقة استثمار أولية تمنح نظرة مبكرة على العائد والمدة وهيكل الفرصة القادمة.",
            ctaLabel: "عرض الخطة والتسجيل",
            ctaClass:
              "bg-amber-50 text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100",
            noteLabel: "مرحلة تمهيد",
            noteCopy:
              "لا يوجد اكتتاب مفتوح بعد، لكن يمكنك متابعة الخطة والتسجيل للاهتمام عند الإطلاق.",
            trustCopy: "تحت التحضير والإتاحة قريبًا",
          }
          : {
            badgeLabel: "مكتمل",
            badgeClass: "border-slate-300 bg-slate-100 text-slate-700",
            subline: "أداء مشروع منجز",
            heroCaption:
              "المشروع وصل إلى مرحلته النهائية ويمكن مراجعته كمرجع أداء واستثمار مكتمل.",
            ctaLabel: "عرض النتائج",
            ctaClass:
              "bg-slate-100 text-slate-800 ring-1 ring-slate-200 hover:bg-slate-200",
            noteLabel: "عرض معلوماتي",
            noteCopy:
              "الاكتتاب مغلق لهذا المشروع، وتبقى البطاقة مدخلًا لمراجعة الأداء والنتائج النهائية.",
            trustCopy: "سجل إنجاز مكتمل داخل المنصة",
          };

    return (
      <Card
        key={p.id}
        className={cn(
          "group gap-0 overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/96 py-0 shadow-[0_24px_64px_-42px_rgba(15,23,42,0.28)] transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01] hover:shadow-[0_34px_84px_-40px_rgba(15,23,42,0.42)] md:rounded-[30px]",
          mode === "done" && "border-slate-300/90"
        )}
      >
        <div className="relative h-40 w-full bg-muted sm:h-48 md:h-60">
          <img
            src={cover}
            alt={title}
            className={cn(
              "h-full w-full object-cover transition-transform duration-500 group-hover:scale-105",
              mode === "done" && "grayscale-[0.1]"
            )}
            loading="lazy"
            draggable={false}
            onError={e => {
              const img = e.currentTarget;
              if (img.src.includes(PROJECT_IMAGE_FALLBACK)) return;
              img.src = PROJECT_IMAGE_FALLBACK;
            }}
          />

          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,12,24,0.08),rgba(4,12,24,0.16)_34%,rgba(4,12,24,0.34)_100%)]" />
          <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_60%)]" />

          <div className="absolute left-3 right-3 top-3 flex flex-wrap items-start justify-between gap-2.5 md:left-4 md:right-4 md:top-4 md:gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[10px] md:px-3 md:py-1 md:text-xs",
                  modeMeta.badgeClass
                )}
              >
                {modeMeta.badgeLabel}
              </Badge>
              <Badge className="rounded-full border border-white/15 bg-black/25 px-2.5 py-0.5 text-[10px] text-white backdrop-blur-md md:px-3 md:py-1 md:text-xs">
                {typeLabel(p.projectType)}
              </Badge>
              {isVip ? (
                <Badge className="rounded-full border border-amber-300/25 bg-amber-300/14 px-2.5 py-0.5 text-[10px] text-amber-100 backdrop-blur-md md:px-3 md:py-1 md:text-xs">
                  VIP
                </Badge>
              ) : null}
              {isFeatured ? (
                <Badge className="rounded-full border border-sky-300/20 bg-sky-300/14 px-2.5 py-0.5 text-[10px] text-sky-100 backdrop-blur-md md:px-3 md:py-1 md:text-xs">
                  مميز
                </Badge>
              ) : null}
            </div>

            {getProjectBusinessId(p) ? (
              <Badge className="rounded-full border border-white/15 bg-black/25 px-2.5 py-0.5 text-[10px] text-white backdrop-blur-md md:px-3 md:py-1 md:text-xs">
                {getProjectBusinessId(p)}
              </Badge>
            ) : null}
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-[linear-gradient(180deg,transparent_0%,rgba(4,12,24,0.22)_48%,rgba(4,12,24,0.42)_100%)] md:hidden" />

          <div className="absolute bottom-3 right-3 left-3 md:hidden">
            <div className="text-lg font-semibold leading-tight tracking-tight text-white line-clamp-2">
              {title}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-white/88">
              <MapPin className="h-3.5 w-3.5" />
              <span className="line-clamp-1">{location}</span>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-4 md:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-400">
                {modeMeta.subline}
              </div>
              <div className="mt-1 text-sm leading-6 text-slate-600 line-clamp-1">
                {modeMeta.trustCopy}
              </div>
            </div>

            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              {formatPercentEN(progress, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[18px] border border-slate-200/80 bg-slate-50/85 px-3 py-2.5">
              <div className="text-[10px] font-semibold tracking-[0.12em] text-slate-400">
                العائد
              </div>
              <div className="mt-1 flex items-center gap-1 text-sm font-semibold text-slate-950">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                {formatPercentEN(annualReturn, {
                  maximumFractionDigits: 0,
                })}
              </div>
            </div>

            <div className="rounded-[18px] border border-slate-200/80 bg-slate-50/85 px-3 py-2.5">
              <div className="text-[10px] font-semibold tracking-[0.12em] text-slate-400">
                المدة
              </div>
              <div className="mt-1 flex items-center gap-1 text-sm font-semibold text-slate-950">
                <Clock3 className="h-3.5 w-3.5 text-slate-500" />
                {duration ? formatNumberEN(duration) : "—"} شهر
              </div>
            </div>

            <div className="rounded-[18px] border border-slate-200/80 bg-slate-50/85 px-3 py-2.5">
              <div className="text-[10px] font-semibold tracking-[0.12em] text-slate-400">
                النوع
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-950 line-clamp-1">
                {typeLabel(p.projectType)}
              </div>
            </div>
          </div>

          <div className="rounded-[20px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,rgba(248,250,252,0.95)_100%)] px-4 py-3.5 shadow-[0_18px_34px_-34px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-slate-500">نسبة التمويل</span>
              <span className="font-semibold text-slate-950">
                {formatPercentEN(progress, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 1,
                })}
              </span>
            </div>

            <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="absolute inset-y-0 right-0 rounded-full"
                style={{
                  width: `${progress > 0 ? Math.max(progress, 6) : 0}%`,
                  background:
                    "linear-gradient(90deg, color-mix(in oklab, var(--gold) 88%, white 12%) 0%, color-mix(in oklab, var(--gold) 58%, var(--primary) 42%) 45%, var(--primary) 100%)",
                }}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
              <div>
                المبلغ الحالي
                <div className="mt-1 text-sm font-semibold text-slate-950">
                  {fmtSAR(displayCurrent)}
                </div>
              </div>
              <div className="text-left">
                المبلغ المستهدف
                <div className="mt-1 text-sm font-semibold text-slate-950">
                  {fmtSAR(target)}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[18px] border border-slate-200/80 bg-white px-3 py-2.5">
              <div className="text-[10px] font-semibold tracking-[0.12em] text-slate-400">
                الحد الأدنى
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-950">
                {fmtSAR(minInvestment)}
              </div>
            </div>

            <div className="rounded-[18px] border border-slate-200/80 bg-white px-3 py-2.5">
              <div className="text-[10px] font-semibold tracking-[0.12em] text-slate-400">
                المستثمرون
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-950">
                {formatNumberEN(investors)}
              </div>
            </div>
          </div>

          <p className="text-sm leading-6 text-slate-600 line-clamp-2">
            {leadingHighlight ||
              description ||
              (mode === "done"
                ? "مشروع مكتمل يوضح شكل الإنجاز النهائي داخل المنصة."
                : mode === "draft"
                  ? "فرصة قادمة قيد الإعداد مع مؤشرات أولية واضحة للمستثمر."
                  : "فرصة استثمارية معروضة ببيانات مالية واضحة تسهّل قراءة القرار.")}
          </p>

          <div className="rounded-[18px] border border-slate-200/80 bg-slate-50/90 px-3.5 py-3 text-xs leading-6 text-slate-600 line-clamp-2">
            {modeMeta.noteCopy}
          </div>

          <Link href={`/projects/${p.id}`}>
            <Button
              className={cn(
                "h-11 w-full rounded-2xl px-4 transition-all",
                modeMeta.ctaClass
              )}
            >
              <span>{modeMeta.ctaLabel}</span>
              <ArrowLeft className="mr-2 h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="hidden space-y-5 p-5 sm:p-6 md:block">
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Investment Unit
                </div>
                <div className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-slate-950 line-clamp-2">
                  {title}
                </div>
              </div>

              <div className="rounded-[20px] bg-slate-50/90 px-4 py-3 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] sm:min-w-[180px]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  الثقة
                </div>
                <div className="mt-1.5 text-sm font-semibold leading-6 text-slate-800">
                  {modeMeta.trustCopy}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5">
                <MapPin className="h-4 w-4 text-slate-500" />
                <span className="line-clamp-1">{location}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5">
                <Building2 className="h-4 w-4 text-slate-500" />
                <span>{modeMeta.subline}</span>
              </span>
            </div>
          </div>

          <div className="rounded-[28px] bg-[linear-gradient(135deg,#0b1726_0%,#13243b_68%,#1a304a_100%)] p-5 text-white shadow-[0_24px_60px_-34px_rgba(11,23,38,0.85)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/56">
                  العائد السنوي المتوقع
                </div>
                <div className="mt-3 flex items-end gap-2">
                  <div className="text-5xl font-bold tracking-tight">
                    {formatPercentEN(annualReturn, {
                      maximumFractionDigits: 0,
                    })}
                  </div>
                  <div className="pb-2 text-sm text-white/66">سنوياً</div>
                </div>
                <p className="mt-2 max-w-md text-sm leading-7 text-white/72">
                  {modeMeta.heroCaption}
                </p>
              </div>

              <div className="min-w-[124px] rounded-[22px] border border-white/12 bg-white/10 p-4 text-right shadow-inner backdrop-blur">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/56">
                  المدة
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {duration ? formatNumberEN(duration) : "—"}
                </div>
                <div className="mt-1 flex items-center justify-end gap-1 text-xs text-white/66">
                  <Clock3 className="h-3.5 w-3.5" />
                  <span>شهر</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/85 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <Target className="h-4 w-4 text-slate-500" />
                <span>المبلغ المستهدف</span>
              </div>
              <div className="mt-3 text-lg font-semibold text-slate-950">
                {fmtSAR(target)}
              </div>
            </div>

            <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/85 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <Wallet className="h-4 w-4 text-slate-500" />
                <span>
                  {mode === "done" ? "المبلغ النهائي" : "المبلغ الحالي"}
                </span>
              </div>
              <div className="mt-3 text-lg font-semibold text-slate-950">
                {fmtSAR(displayCurrent)}
              </div>
            </div>

            <div className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <Landmark className="h-4 w-4 text-slate-500" />
                <span>الحد الأدنى</span>
              </div>
              <div className="mt-3 text-lg font-semibold text-slate-950">
                {fmtSAR(minInvestment)}
              </div>
            </div>

            <div className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <Users className="h-4 w-4 text-slate-500" />
                <span>عدد المستثمرين</span>
              </div>
              <div className="mt-3 text-lg font-semibold text-slate-950">
                {formatNumberEN(investors)}
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,1))] p-4 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  نسبة التمويل
                </div>
                <div className="mt-1 text-2xl font-semibold text-slate-950">
                  {formatPercentEN(progress, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 1,
                  })}
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs text-slate-500">
                  {mode === "done"
                    ? "تم الوصول إلى الهدف"
                    : mode === "draft"
                      ? "جاهز للإطلاق"
                      : "الممول حاليًا"}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-950">
                  {fmtSAR(displayCurrent)}
                </div>
              </div>
            </div>

            <div
              className="relative mt-4 h-4 overflow-hidden rounded-full border border-slate-200 bg-white shadow-inner"
              aria-label="progress"
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.03),rgba(15,23,42,0.06),rgba(242,174,48,0.08))]" />
              <div
                className="absolute inset-y-0 right-0 rounded-full transition-[width] duration-500"
                style={{
                  width: `${progress > 0 ? Math.max(progress, 6) : 0}%`,
                  background:
                    "linear-gradient(90deg, color-mix(in oklab, var(--gold) 88%, white 12%) 0%, color-mix(in oklab, var(--gold) 58%, var(--primary) 42%) 45%, var(--primary) 100%)",
                  boxShadow:
                    "0 14px 30px rgba(242,174,48,0.28), 0 0 0 1px rgba(255,255,255,0.25) inset",
                }}
              />
              <div
                className="absolute inset-y-0 right-0 opacity-55"
                style={{
                  width: `${progress}%`,
                  background:
                    "linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)",
                }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span>{fmtSAR(displayCurrent)}</span>
              <span className="font-medium text-slate-700">
                {fmtSAR(target)}
              </span>
            </div>
          </div>

          <div className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
                {modeMeta.noteLabel}
              </Badge>
              {isVip ? (
                <Badge className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
                  وصول خاص
                </Badge>
              ) : null}
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-600 line-clamp-3">
              {leadingHighlight ||
                description ||
                (mode === "done"
                  ? "مشروع مكتمل يوضح شكل الإنجاز النهائي داخل المنصة."
                  : mode === "draft"
                    ? "فرصة قادمة قيد الإعداد، ويمكن استعراض هيكلها المالي من الآن."
                    : "فرصة استثمارية معروضة ببيانات مالية واضحة تسهّل قراءة القرار.")}
            </p>
            <div className="mt-3 rounded-[18px] bg-slate-50/90 px-4 py-3 text-sm leading-7 text-slate-700">
              {modeMeta.noteCopy}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200/80 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                {mode === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : mode === "draft" ? (
                  <Hourglass className="h-4 w-4 text-amber-600" />
                ) : (
                  <Layers3 className="h-4 w-4 text-slate-700" />
                )}
                <span>{modeMeta.trustCopy}</span>
              </span>
            </div>

            <Link href={`/projects/${p.id}`}>
              <Button
                className={cn(
                  "h-12 w-full rounded-2xl px-5 transition-all sm:w-auto",
                  modeMeta.ctaClass
                )}
              >
                <span>{modeMeta.ctaLabel}</span>
                <ArrowLeft className="mr-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    );
  };

  /**
   * FIX: Removed nested <a> inside <Link> to fix Hydration error.
   * The Card itself is now wrapped in Link, or the button is the link.
   */
  const ProjectCard = (p: ProjectDoc, mode: "published" | "draft" | "done") => {
    const computedAmounts = getProjectComputedAmounts(p);
    const target = computedAmounts.targetAmount;
    const current = computedAmounts.currentAmount;
    const prog = mode === "done" ? 100 : progressPercent(p);

    const cover = getProjectImageSource(p);

    const title = p.titleAr || p.titleEn || "بدون عنوان";
    const location = p.locationAr || p.locationEn || "—";

    const isDone = mode === "done";
    const isDraft = mode === "draft";

    return (
      <Card
        key={p.id}
        className={`overflow-hidden ${isDone ? "opacity-90" : ""}`}
      >
        <div className="relative h-44 w-full bg-muted">
          <img
            src={cover}
            alt={title}
            className={`h-full w-full object-cover ${isDone ? "grayscale-[0.15]" : ""
              }`}
            loading="lazy"
            draggable={false}
            onError={e => {
              const img = e.currentTarget;
              if (img.src.includes(PROJECT_IMAGE_FALLBACK)) return;
              img.src = PROJECT_IMAGE_FALLBACK;
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

            {getProjectBusinessId(p) && (
              <Badge variant="secondary" className="bg-white/80">
                {getProjectBusinessId(p)}
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
    innerClassName?: string;
    children: ReactNode;
    variant?: "light" | "dark";
    bottomDecoration?: ReactNode;
  }) => (
    <section
      id={props.id}
      className={cn(
        "relative py-20 sm:py-24",
        props.variant === "dark"
          ? "overflow-hidden bg-[linear-gradient(180deg,#0b1726_0%,#102137_100%)] text-white"
          : "overflow-visible bg-[#f8fafc] text-foreground",
        props.className
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          props.variant === "dark"
            ? "bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_45%)]"
            : "bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.04),transparent_48%)]"
        )}
      />
      <div
        className={cn("container relative z-10 w-full", props.innerClassName)}
      >
        {props.children}
      </div>
      {props.bottomDecoration}
    </section>
  );

  const premiumView = (
    <div className="rsg-page w-full bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_42%,#ffffff_100%)] text-foreground">
      <div className="pt-0">
        <CurvedProjectsHero
          imageSrc={projectsHeroImage}
          title={
            <>
              مشاريعنا الاستثمارية
            </>
          }
          desc=""
        >
          <div className="space-y-5">
            {blockedReason === "maintenance" && (
              <Card className="border-amber-300/30 bg-white/95 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.45)] backdrop-blur">
                <CardContent className="flex items-start gap-3 py-5">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
                  <div className="space-y-1">
                    <div className="font-semibold text-slate-950">
                      المنصة تحت الصيانة
                    </div>
                    <div className="text-sm leading-7 text-slate-600">
                      بعض الإجراءات الاستثمارية متوقفة مؤقتًا، لكن بإمكانك
                      مراجعة المشروعات المتاحة والبيانات الحالية.
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {blockedReason === "vip_only_mode" && (
              <Card className="border-sky-300/25 bg-white/95 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.45)] backdrop-blur">
                <CardContent className="flex items-start gap-3 py-5">
                  <Shield className="mt-0.5 h-5 w-5 text-sky-600" />
                  <div className="space-y-1">
                    <div className="font-semibold text-slate-950">
                      وضع الوصول الاستثماري الخاص
                    </div>
                    <div className="text-sm leading-7 text-slate-600">
                      القائمة الحالية تركز على الفرص الحصرية فقط، مع استمرار نفس
                      البيانات والمنطق التشغيلي بدون تغيير.
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="mx-auto w-full max-w-[56rem] overflow-hidden border border-white/10 bg-[linear-gradient(145deg,rgba(8,18,31,0.78),rgba(11,24,40,0.68))] text-white shadow-[0_28px_72px_-40px_rgba(2,8,18,0.78)] backdrop-blur-[20px]">
              <CardContent className="p-4 sm:p-[18px]">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3.5">
                    <div className="max-w-[42rem]">
                      <div className="flex flex-wrap items-center gap-3">
                        <Badge className="rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85">
                          Investment Desk
                        </Badge>
                        <Badge className="rounded-full border border-emerald-300/20 bg-emerald-300/12 px-3 py-1 text-xs font-semibold text-emerald-200">
                          فرص جارية
                        </Badge>
                      </div>

                      <h2 className="mt-2.5 text-2xl font-semibold tracking-tight text-white sm:text-[1.85rem]">
                        سوق استثماري يضع العائد والتغطية في مقدمة القرار
                      </h2>
                      <p className="mt-2 max-w-[38rem] text-sm leading-7 text-white/76 sm:text-[15px]">
                        ابحث في الفرص المفتوحة
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-[22px] border border-white/10 bg-[rgba(5,12,22,0.42)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_34px_-28px_rgba(0,0,0,0.72)] backdrop-blur-md">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/62">
                        بحث سريع
                      </div>
                      <div className="relative mt-2">
                        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/52" />
                        <Input
                          value={qText}
                          onChange={e => setQText(e.target.value)}
                          placeholder="ابحث بالعنوان أو الموقع أو رقم الإصدار"
                          className="h-9 rounded-xl border-white/10 bg-[rgba(3,9,17,0.52)] pr-9 text-sm text-white placeholder:text-white/42 focus-visible:ring-1 focus-visible:ring-white/20"
                          disabled={flags.maintenanceMode}
                        />
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-white/10 bg-[rgba(5,12,22,0.42)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_34px_-28px_rgba(0,0,0,0.72)] backdrop-blur-md">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/62">
                        نوع الفرصة
                      </div>
                      <Select
                        value={typeFilter}
                        onValueChange={setTypeFilter}
                        disabled={flags.maintenanceMode}
                      >
                        <SelectTrigger className="mt-2 h-9 rounded-xl border-white/10 bg-[rgba(3,9,17,0.52)] text-sm text-white">
                          <SelectValue placeholder="كل الأنواع" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">كل الأنواع</SelectItem>
                          {Object.entries(labels.projectTypes).map(
                            ([key, value]) => (
                              <SelectItem key={key} value={key}>
                                {pickLabel(value, "ar", key)}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="rounded-[22px] border border-white/10 bg-[rgba(5,12,22,0.42)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_34px_-28px_rgba(0,0,0,0.72)] backdrop-blur-md">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/62">
                        ترتيب العرض
                      </div>
                      <Select
                        value={sortBy}
                        onValueChange={setSortBy}
                        disabled={flags.maintenanceMode}
                      >
                        <SelectTrigger className="mt-2 h-9 rounded-xl border-white/10 bg-[rgba(3,9,17,0.52)] text-sm text-white">
                          <SelectValue placeholder="اختر الترتيب" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="newest">الأحدث</SelectItem>
                          <SelectItem value="progress">
                            الأعلى تمويلاً
                          </SelectItem>
                          <SelectItem value="return">الأعلى عائدًا</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                </div>
              </CardContent>
            </Card>
          </div>
        </CurvedProjectsHero>
      </div>

      <main className="relative flex-1">
        <SectionShell className="pt-12 pb-28 sm:pt-16" variant="light">
          <div className="space-y-10">
            <SectionHeaderBlock
              kicker="Live Opportunities"
              badge={flags.vipOnlyMode ? "VIP فقط" : "السوق المفتوح"}
              title="فرص استثمارية متاحة الآن"
              desc="وحدات استثمارية مصممة لإبراز العائد والمدد ونِسب التغطية، مع قراءة أسرع للقرار المالي داخل كل بطاقة."
              metrics={[
                {
                  label: "التمويل الجاري",
                  value: fmtSAR(publishedFundingCurrent),
                },
                {
                  label: "الرأسمال المستهدف",
                  value: fmtSAR(publishedFundingTarget),
                },
                {
                  label: "أعلى عائد",
                  value: formatPercentEN(bestPublishedReturn, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  }),
                },
              ]}
            />

            <div className="rounded-[34px] border border-slate-200/70 bg-white/85 p-4 shadow-[0_34px_90px_-56px_rgba(15,23,42,0.42)] backdrop-blur sm:p-6">
              {flags.maintenanceMode ? (
                <div className="py-16 text-center text-muted-foreground">
                  المشاريع غير متاحة حاليًا بسبب الصيانة.
                </div>
              ) : (
                <>
                  {published.loading && (
                    <div className="py-16 text-center text-muted-foreground">
                      جاري تحميل المشروعات...
                    </div>
                  )}

                  {published.loadError && !published.loading && (
                    <Card className="mt-2 border-destructive/25 shadow-sm">
                      <CardContent className="space-y-3 py-10 text-center">
                        <div className="font-semibold">
                          {published.loadError}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          ملاحظة: تعذر ترتيب المشاريع بسبب نقص في بيانات تاريخ النشر.
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => setRefreshKey(x => x + 1)}
                          className="h-11 rounded-2xl px-5"
                        >
                          إعادة المحاولة
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {!published.loading &&
                    !published.loadError &&
                    filteredPublished.length === 0 && (
                      <Card className="mt-2 border-slate-200/80 shadow-sm">
                        <CardContent className="space-y-3 py-12 text-center text-muted-foreground">
                          <div>
                            لا توجد مشروعات مطابقة لنتائج البحث أو الفلترة
                            الحالية.
                          </div>
                          {published.hasMore && published.items.length > 0 && (
                            <Button
                              variant="outline"
                              onClick={published.loadMore}
                              disabled={published.loadingMore}
                              className="h-11 rounded-2xl px-5"
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
                        <MobileProjectCarousel
                          items={filteredPublished}
                          sectionLabel="الفرص الحالية"
                          hint="اسحب لتصفح المشاريع أو استخدم الأسهم والتنقل السريع بين الفرص."
                          renderCard={project =>
                            InvestmentCard(project, "published")
                          }
                        />

                        <div className="hidden gap-5 md:grid md:grid-cols-2 xl:grid-cols-3">
                          {filteredPublished.map(p =>
                            InvestmentCard(p, "published")
                          )}
                        </div>

                        <div className="mt-10 flex justify-center">
                          {published.hasMore ? (
                            <Button
                              variant="outline"
                              onClick={published.loadMore}
                              disabled={published.loadingMore}
                              className="h-12 rounded-2xl border-slate-300/80 px-6"
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
          </div>
        </SectionShell>

        <SectionShell
          variant="dark"
          className="pb-0"
          innerClassName="pb-24 sm:pb-28"
          bottomDecoration={
            <svg
              className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full text-[#f8fafc] md:h-28"
              viewBox="0 0 1440 120"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                fill="currentColor"
                d="M0,64 C240,120 480,120 720,88 C960,56 1200,8 1440,40 L1440,120 L0,120 Z"
              />
            </svg>
          }
        >
          <div className="space-y-10">
            <SectionHeaderBlock
              kicker="Pipeline"
              badge="قريبًا"
              inverted
              title="فرص استثمارية قيد الإطلاق"
              desc="نفس نموذج البطاقة الاستثمارية، لكن بحالة قادمة حتى تبقى الرؤية متسقة بين السوق الحالي وخط الفرص القادم."
              metrics={[
                {
                  label: "عدد الفرص",
                  value: formatNumberEN(upcoming.items.length),
                },
                { label: "رأسمال متوقع", value: fmtSAR(upcomingFundingTarget) },
                {
                  label: "أعلى عائد معلن",
                  value: formatPercentEN(upcomingBestReturn, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  }),
                },
              ]}
            />

            <div className="rounded-[34px] border border-white/10 bg-white/6 p-4 shadow-[0_34px_90px_-56px_rgba(0,0,0,0.68)] backdrop-blur sm:p-6">
              {upcoming.loading ? (
                <div className="py-16 text-center text-white/70">
                  جاري تحميل المشروعات...
                </div>
              ) : upcoming.loadError ? (
                <Card className="mt-2 border-white/10 bg-white/5 backdrop-blur">
                  <CardContent className="space-y-3 py-10 text-center text-white">
                    <div className="font-semibold">{upcoming.loadError}</div>
                    <Button
                      variant="outline"
                      onClick={() => setRefreshKey(x => x + 1)}
                      className="h-11 rounded-2xl border-white/15 bg-white/5 px-5 text-white hover:bg-white hover:text-slate-950"
                    >
                      إعادة المحاولة
                    </Button>
                  </CardContent>
                </Card>
              ) : upcoming.items.length === 0 ? (
                <div className="py-16 text-center text-white/70">
                  لا توجد مشروعات مستقبلية حالياً.
                </div>
              ) : (
                <>
                  <MobileProjectCarousel
                    items={upcoming.items}
                    sectionLabel="الفرص القادمة"
                    hint="هناك أكثر من فرصة قادمة. تنقّل بالسحب أو بالأسهم لمراجعة الخطط المقبلة."
                    tone="dark"
                    renderCard={project => InvestmentCard(project, "draft")}
                  />

                  <div
                    ref={upcomingSlider.ref}
                    {...upcomingSlider.bind}
                    dir="ltr"
                    className="
                      hidden md:flex gap-5 overflow-x-auto overflow-y-hidden pb-4
                      snap-x snap-mandatory
                      scroll-smooth
                      [-ms-overflow-style:none] [scrollbar-width:none]
                      [&::-webkit-scrollbar]:hidden
                      select-none
                      cursor-grab active:cursor-grabbing
                    "
                    style={{ WebkitOverflowScrolling: "touch" }}
                  >
                    {upcoming.items.map(p => (
                      <div
                        key={p.id}
                        dir="rtl"
                        className="w-[88%] shrink-0 snap-start sm:w-[420px] md:w-[460px]"
                      >
                        {InvestmentCard(p, "draft")}
                      </div>
                    ))}
                  </div>

                  <div className="mt-10 flex justify-center">
                    {upcoming.hasMore ? (
                      <Button
                        variant="outline"
                        onClick={upcoming.loadMore}
                        disabled={upcoming.loadingMore}
                        className="h-12 rounded-2xl border-white/15 bg-white/5 px-6 text-white hover:bg-white hover:text-slate-950"
                      >
                        {upcoming.loadingMore
                          ? "جاري التحميل..."
                          : "تحميل المزيد"}
                      </Button>
                    ) : (
                      <div className="text-sm text-white/65" />
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </SectionShell>

        <SectionShell variant="light">
          <div className="space-y-10">
            <SectionHeaderBlock
              kicker="Track Record"
              badge="منجزة"
              title="سجل المشاريع المكتملة"
              desc="واجهة مستقلة للمشاريع التي تم تنفيذها وإقفالها، تركّز على الصورة والنتائج والمخرجات النهائية بدل مؤشرات الاستثمار النشط."
              metrics={[
                {
                  label: "مشاريع مكتملة",
                  value: formatNumberEN(done.items.length),
                },
                {
                  label: "مشاريع VIP",
                  value: formatNumberEN(completedVipCount),
                },
                { label: "بمخرجات موثقة", value: formatNumberEN(completedDocumentedCount) },
              ]}
            />

            <div className="rounded-[34px] border border-slate-200/70 bg-white/85 p-4 shadow-[0_34px_90px_-56px_rgba(15,23,42,0.42)] backdrop-blur sm:p-6">
              {done.loading ? (
                <div className="py-16 text-center text-muted-foreground">
                  جاري تحميل المشروعات...
                </div>
              ) : done.loadError ? (
                <Card className="mt-2 border-destructive/25 shadow-sm">
                  <CardContent className="space-y-3 py-10 text-center">
                    <div className="font-semibold">{done.loadError}</div>
                    <Button
                      variant="outline"
                      onClick={() => setRefreshKey(x => x + 1)}
                      className="h-11 rounded-2xl px-5"
                    >
                      إعادة المحاولة
                    </Button>
                  </CardContent>
                </Card>
              ) : done.items.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  لا توجد مشروعات مكتملة حالياً.
                </div>
              ) : (
                <>
                  <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {done.items.map(CompletedProjectCard)}
                  </div>

                  <div className="mt-10 flex justify-center">
                    {done.hasMore ? (
                      <Button
                        variant="outline"
                        onClick={done.loadMore}
                        disabled={done.loadingMore}
                        className="h-12 rounded-2xl border-slate-300/80 px-6"
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

  return premiumView;

  return (
    <div className="rsg-page w-full bg-transparent text-foreground">
      <div className="pt-0">
        <CurvedProjectsHero
          imageSrc={projectsHeroImage}
          title={
            <>
              مشاريعنا الاستثمارية
            </>
          }
          desc="استعرض الفرص المتاحة، تفاصيل العوائد، وقدم اهتمامك بسهولة."
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

            <Card className="bg-white/95 backdrop-blur border border-white/15 shadow-xl">
              <CardContent className="py-6 grid lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium">بحث</div>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={qText}
                      onChange={e => setQText(e.target.value)}
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

              </CardContent>
            </Card>
          </div>
        </CurvedProjectsHero>
      </div>

      {/* ✅ سناب سكشن سكشن */}
      <main className="flex-1">
        {/* 1) المشاريع الحالية */}
        <SectionShell variant="light">
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
                        ملاحظة: تعذر ترتيب المشاريع بسبب نقص في بيانات تاريخ النشر.
                      </div>

                      <Button
                        variant="outline"
                        onClick={() => setRefreshKey(x => x + 1)}
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
                        {filteredPublished.map(p => (
                          <div
                            key={p.id}
                            dir="rtl"
                            className="snap-start shrink-0 w-[86%] sm:w-[420px]"
                          >
                            {InvestmentCard(p, "published")}
                          </div>
                        ))}
                      </div>

                      {/* ✅ Desktop: Grid */}
                      <div className="hidden md:grid mt-10 md:grid-cols-2 xl:grid-cols-3 gap-5">
                        {filteredPublished.map(p =>
                          InvestmentCard(p, "published")
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
                    <Button
                      variant="outline"
                      onClick={() => setRefreshKey(x => x + 1)}
                    >
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
                      {upcoming.items.map(p => (
                        <div
                          key={p.id}
                          dir="rtl"
                          className="snap-start shrink-0 w-[86%] sm:w-[420px] md:w-[460px]"
                        >
                          {InvestmentCard(p, "draft")}
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
                        {upcoming.loadingMore
                          ? "جاري التحميل..."
                          : "تحميل المزيد"}
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
                      onClick={() => setRefreshKey(x => x + 1)}
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
                    {done.items.map(CompletedProjectCard)}
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
