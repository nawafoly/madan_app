// client/src/pages/Home.tsx
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import VideoModal from "@/components/VideoModal";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Play,
  CheckCircle2,
  Shield,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { useDragScroll } from "@/hooks/useDragScroll";

// 🔥 Firestore
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  limit,
  where,
} from "firebase/firestore";
import { db } from "@/_core/firebase";

/* =========================
   Types
========================= */
type HomeProject = {
  id: string;
  title: string;
  location: string;
  categoryKey: string; // projectType
  image: string;
};

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

type StatsDoc = {
  totalInvestment?: string; // مثال: "120M+"
  projectsCount?: string; // مثال: "15+"
  avgReturn?: string; // مثال: "12%+"
  avgDuration?: string; // مثال: "18 شهر"
};

const DEFAULT_LABELS: Required<LabelsDoc> = {
  projectTypes: {
    sukuk: "استثمار بالصكوك",
    land_development: "تطوير أراضي",
    vip_exclusive: "VIP حصري",
  },
  projectStatuses: {
    draft: "قريباً",
    published: "منشور",
    closed: "مغلق",
    completed: "مكتمل",
  },
};

const DEFAULT_FLAGS: FlagsDoc = {
  hideVipProjects: false,
  vipOnlyMode: false,
  maintenanceMode: false,
};

const DEFAULT_STATS: StatsDoc = {
  totalInvestment: "120M+",
  projectsCount: "15+",
  avgReturn: "12%+",
  avgDuration: "18 شهر",
};

const FALLBACK_IMG = "/HOOM-HERO.png";

// ✅ صورة قسم "قصتنا"
const STORY_IMG = "/about-poto1.jpg";

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

export default function Home() {
  const [location] = useLocation();

  const [isVideoOpen, setIsVideoOpen] = useState(false);

  // ✅ Projects sections
  const [featured, setFeatured] = useState<HomeProject[]>([]);
  const [projects, setProjects] = useState<HomeProject[]>([]);

  const [isLoading, setIsLoading] = useState(true);

  const [labels, setLabels] = useState<Required<LabelsDoc>>(DEFAULT_LABELS);
  const [flags, setFlags] = useState<FlagsDoc>(DEFAULT_FLAGS);
  const [stats, setStats] = useState<StatsDoc>(DEFAULT_STATS);

  // ✅ Drag scroll for home slider
  const { ref: homeSliderRef, bind: homeSliderBind } =
    useDragScroll<HTMLDivElement>();

  // ✅ flags ref to avoid stale closures
  const flagsRef = useRef<FlagsDoc>(DEFAULT_FLAGS);
  useEffect(() => {
    flagsRef.current = flags;
  }, [flags]);

  // ✅ scroll top on route change
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location]);

  const categoryLabel = (key: string) =>
    pickLabel(labels.projectTypes[key], "ar", key || "مشروع");

  // ✅ سكشن موحّد: نفس حجم الشاشة + snap
  const SECTION = "min-h-screen snap-start flex items-center";

  /**
   * ✅ Card style we agreed:
   * - Clickable
   * - Flip on laptop only (CSS media query)
   * - Mobile: no flip
   * - FIX: Removed nested <a> inside <Link> to fix Hydration error.
   */
  const projectCard = (p: HomeProject | undefined, isFeatured = false) => {
    if (!p) return null;

    const href = `/projects/${p.id}`;
    const aspect = isFeatured
      ? "aspect-[4/5] md:aspect-[16/10]"
      : "aspect-[4/5] md:aspect-[16/13]";

    return (
      <Link href={href}>
        <div
          className={`rsg-flip group block relative overflow-hidden rounded-[28px] cursor-pointer ${aspect}`}
          aria-label={p.title}
        >
          <div className="rsg-flip__inner">
            {/* FRONT */}
            <div className="rsg-flip__face">
              <img
                src={p.image}
                alt={p.title}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                loading="lazy"
                draggable={false}
                onError={(e) => {
                  const img = e.currentTarget;
                  if (img.src.includes(FALLBACK_IMG)) return;
                  img.src = FALLBACK_IMG;
                }}
              />

              {/* Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent opacity-90 transition-opacity" />

              {/* Badge */}
              <div className="absolute top-4 right-4 md:top-5 md:right-5">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] md:text-xs font-bold bg-white/14 text-white border border-white/22 backdrop-blur-md">
                  {isFeatured ? "مشروع مميز" : categoryLabel(p.categoryKey)}
                </span>
              </div>

              {/* Bottom text */}
              <div className="absolute bottom-0 right-0 p-6 md:p-7 w-full text-white">
                <h3 className="text-2xl md:text-3xl font-bold leading-snug drop-shadow">
                  {p.title}
                </h3>

                <p className="mt-2 text-white/85 text-sm flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {p.location}
                </p>
              </div>
            </div>

            {/* BACK */}
            <div className="rsg-flip__face rsg-flip__back">
              <div className="absolute inset-0 bg-black/72" />
              <div className="absolute inset-0 p-6 md:p-8 flex flex-col justify-end text-white">
                <span className="inline-flex w-fit items-center px-3 py-1 rounded-full text-[11px] md:text-xs font-bold bg-white/14 border border-white/22 backdrop-blur-md">
                  {isFeatured ? "مشروع مميز" : categoryLabel(p.categoryKey)}
                </span>

                <h3 className="mt-3 text-2xl md:text-3xl font-bold leading-snug">
                  {p.title}
                </h3>

                <p className="mt-3 text-white/85 text-sm md:text-base leading-relaxed">
                  نبذة مختصرة عن المشروع بشكل بسيط وجذاب، تساعدك تعرف الفكرة بسرعة
                  قبل الدخول للتفاصيل.
                </p>

                <p className="mt-3 text-white/70 text-xs">اضغط لعرض التفاصيل</p>
              </div>
            </div>
          </div>
        </div>
      </Link>
    );
  };

  // ✅ Live load: labels + flags + stats + projects + featured
  useEffect(() => {
    setIsLoading(true);

    const unsubLabels = onSnapshot(doc(db, "settings", "labels"), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as LabelsDoc;
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
    });

    const unsubFlags = onSnapshot(doc(db, "settings", "flags"), (snap) => {
      if (snap.exists())
        setFlags({ ...DEFAULT_FLAGS, ...(snap.data() as FlagsDoc) });
      else setFlags(DEFAULT_FLAGS);
    });

    const unsubStats = onSnapshot(doc(db, "settings", "homeStats"), (snap) => {
      if (snap.exists())
        setStats({ ...DEFAULT_STATS, ...(snap.data() as StatsDoc) });
      else setStats(DEFAULT_STATS);
    });

    const qy = query(
      collection(db, "projects"),
      where("status", "==", "published"),
      orderBy("createdAt", "desc"),
      limit(30)
    );

    const unsubProjects = onSnapshot(
      qy,
      (snap) => {
        const f = flagsRef.current || DEFAULT_FLAGS;

        const published = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((p: any) => {
            const status = String(p.status || "").trim();
            const type = String(p.projectType || p.category || "").trim();

            if (status !== "published") return false;

            if (f.vipOnlyMode) return type === "vip_exclusive";
            if (f.hideVipProjects && type === "vip_exclusive") return false;

            return true;
          });

        const picked = published
          .filter((p: any) => !!p.homeFeatured)
          .slice(0, 2);
        const finalFeatured = (picked.length ? picked : published).slice(0, 2);

        const featuredIds = new Set(finalFeatured.map((x: any) => String(x.id)));

        const nonFeatured = published.filter(
          (p: any) => !featuredIds.has(String(p.id))
        );
        const latest4 = nonFeatured.slice(0, 4);

        const mapToHomeProject = (p: any): HomeProject => {
          const typeKey = String(p.projectType || p.category || "").trim();
          const rawImg = String(p.coverImage || p.image || "").trim();
          const image = rawImg ? normalizePublicImage(rawImg) : FALLBACK_IMG;

          return {
            id: String(p.id),
            title: String(p.titleAr || p.titleEn || p.title || "مشروع بدون عنوان"),
            location: String(
              p.locationAr ||
                p.locationEn ||
                p.location ||
                "المملكة العربية السعودية"
            ),
            categoryKey: typeKey || "unknown",
            image,
          };
        };

        setFeatured(finalFeatured.map(mapToHomeProject));
        setProjects(latest4.map(mapToHomeProject));
        setIsLoading(false);
      },
      (err) => {
        console.error("Failed to live load home projects:", err);
        setFeatured([]);
        setProjects([]);
        setIsLoading(false);
      }
    );

    return () => {
      unsubLabels();
      unsubFlags();
      unsubStats();
      unsubProjects();
    };
  }, []);

  return (
    <div className="rsg-page min-h-screen flex flex-col text-foreground">

      {/* ✅ scroll-snap container */}
      <main className="flex-grow relative z-0">
        <div className="relative z-10">
          {/* HERO */}
          <section className={`${SECTION} relative w-full overflow-hidden`}>
            <div className="absolute inset-0 z-0">
              <img
                src="/HOOM-HERO1.jpg"
                alt="MAEDIN Hero"
                className="w-full h-full object-cover object-top"
              />
            </div>

            <div className="absolute inset-0 bg-black/35 z-[1]" />

            <div className="container relative z-10 flex items-center justify-center w-full">
              <div className="w-full max-w-3xl text-center pt-[110px] pb-16 space-y-10">
                <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white">
                  بناء وجهات
                  <br />
                  الغد الاستثمارية
                </h1>

                <p className="text-xl md:text-2xl text-white/85">
                  مع معدن، نحو مستقبل مشرق للاستثمار العقاري.
                </p>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsVideoOpen(true)}
                  className="h-12 px-7 rounded-full border-white/35 bg-white/10 text-white hover:bg-white hover:text-black"
                >
                  <span>شاهد الفيديو</span>
                  <Play className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </section>

          {/* ✅ قصتنا */}
          <section className={`${SECTION} py-16 md:py-20`}>
            <div className="container w-full">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
                <div className="text-center lg:text-right">
                  <div className="flex items-center justify-center lg:justify-start gap-3">
                    <span className="text-4xl md:text-5xl font-bold text-amber-600">
                      من نحن
                    </span>
                    <span className="text-4xl md:text-5xl font-bold text-foreground">
                      قصتنا
                    </span>
                  </div>

                  <p className="mt-6 text-base md:text-lg text-muted-foreground leading-relaxed">
                    بجذور راسخة وطموح لا يحده أفق، انطلقت معدن لتكون منارة في عالم
                    الاستثمار العقاري.
                  </p>

                  <p className="mt-4 text-base md:text-lg text-muted-foreground leading-relaxed">
                    نحن نؤمن بأن العقار ليس مجرد بناء، بل هو مساحة للحياة والنمو،
                    ورؤيتنا تتجاوز المألوف لخلق بيئات سكنية وتجارية تلهم قاطنيها
                    وتوفر عوائد استثمارية مستدامة لشركائنا.
                  </p>

                  <p className="mt-4 text-base md:text-lg text-muted-foreground leading-relaxed">
                    من خلال دمج التصميم العصري مع الأصالة والابتكار مع الخبرة،
                    نسعى لبناء إرث يدوم للأجيال القادمة.
                  </p>

                  <div className="mt-8">
                    <Link href="/about">
                      <Button className="rounded-full h-11 px-7">
                        المزيد عنا
                        <ArrowRight className="mr-2 w-5 h-5" />
                      </Button>
                    </Link>
                  </div>
                </div>

                <div className="relative">
                  <div className="relative overflow-hidden rounded-[28px] shadow-[0_24px_80px_rgba(0,0,0,0.12)]">
                    <img
                      src={STORY_IMG}
                      alt="قصتنا"
                      className="w-full h-[420px] md:h-[520px] object-cover"
                      onError={(e) => {
                        e.currentTarget.src = "/HOOM-HERO1.jpg";
                      }}
                    />
                  </div>

                  <div className="absolute -bottom-8 md:-bottom-10 left-1/2 -translate-x-1/2 w-[92%] sm:w-[360px]">
                    <div className="bg-white/95 backdrop-blur-xl border border-border rounded-2xl shadow-lg p-5">
                      <div className="flex items-start gap-4">
                        <div className="flex-1 text-center">
                          <div className="text-2xl font-bold text-foreground">
                            15+
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            عاماً من الخبرة
                          </div>
                        </div>

                        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-5 h-5 text-amber-700" />
                        </div>
                      </div>

                      <p className="mt-3 text-sm text-muted-foreground text-center leading-relaxed">
                        سجل حافل بالإنجازات في تطوير وإدارة المشاريع العقارية
                        الفاخرة.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-10 md:h-12" />
            </div>
          </section>

          {/* ✅ Stats */}
          <section className={`${SECTION} section-dark-wave py-16 md:py-20`}>
  <div className="container text-center w-full">
    <h2 className="text-4xl md:text-5xl font-bold">أرقام تعكس ثقتنا</h2>
    <p className="mt-3 text-white/80">
      مؤشرات مختصرة تساعدك على اتخاذ القرار بسرعة.
    </p>

    <div className="rsg-stats mt-12">
      <div className="rsg-stat">
        <div className="rsg-stat__value">{stats.totalInvestment}</div>
        <div className="rsg-stat__label">إجمالي الاستثمارات</div>
      </div>

      <div className="rsg-stat">
        <div className="rsg-stat__value">{stats.projectsCount}</div>
        <div className="rsg-stat__label">عدد المشاريع</div>
      </div>

      <div className="rsg-stat">
        <div className="rsg-stat__value">{stats.avgReturn}</div>
        <div className="rsg-stat__label">متوسط العائد</div>
      </div>

      <div className="rsg-stat">
        <div className="rsg-stat__value">{stats.avgDuration}</div>
        <div className="rsg-stat__label">متوسط مدة المشروع</div>
      </div>
    </div>
  </div>

  {/* ✅ أضف هذا بالأسفل مباشرة */}
  <svg
    className="absolute bottom-[-1px] left-0 w-full h-24 md:h-28 text-white pointer-events-none"
    viewBox="0 0 1440 120"
    preserveAspectRatio="none"
  >
    <path
      fill="currentColor"
      d="M0,64 C240,120 480,120 720,88 C960,56 1200,8 1440,40 L1440,120 L0,120 Z"
    />
  </svg>
</section>


          {/* ✅ Featured */}
          <section className={`${SECTION} section-light py-16 md:py-20`}>
            <div className="container w-full">
              <div className="text-center max-w-2xl mx-auto">
                <h2 className="text-4xl md:text-5xl font-semibold text-foreground">
                  مشاريع مميزة
                </h2>
                <div className="mx-auto mt-3 h-[2px] w-16 rounded-full bg-primary/60" />
                <p className="mt-4 text-base md:text-lg text-muted-foreground">
                  اخترنا لك فرصتين استثماريتين بعناية — اضغط على الكرت لعرض التفاصيل.
                </p>
              </div>

              <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-7 md:gap-8">
                {featured.length ? (
                  featured.map((p) => <div key={p.id}>{projectCard(p, true)}</div>)
                ) : (
                  <div className="col-span-full text-center text-muted-foreground py-10">
                    لا توجد مشاريع مميزة حالياً.
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ✅ Projects */}
          <section className={`${SECTION} rsg-projects-curveCenter py-16 md:py-20`}>
            <div className="container rsg-projects-curveCenter__inner w-full">
              <div className="text-center max-w-2xl mx-auto">
                <h2 className="text-4xl md:text-5xl font-semibold">مشاريعنا</h2>
                <div className="rsg-projects-curve__line" />
                <p className="mt-4 text-white/75 text-base md:text-lg">
                  استعرض مشاريعنا واطّلع على تفاصيل كل مشروع بخطوة واحدة.
                </p>
              </div>

              <div className="mt-10">
                {isLoading ? (
                  <div className="text-center text-white/70 py-16">
                    جاري تحميل المشاريع...
                  </div>
                ) : projects.length ? (
                  <>
                    <div
                      ref={homeSliderRef}
                      {...homeSliderBind}
                      dir="ltr"
                      className="
                        lg:hidden
                        flex gap-5 overflow-x-auto overflow-y-hidden pb-4
                        snap-x snap-mandatory
                        scroll-smooth
                        select-none
                        [-ms-overflow-style:none] [scrollbar-width:none]
                        [&::-webkit-scrollbar]:hidden
                        cursor-grab active:cursor-grabbing
                      "
                      style={{ WebkitOverflowScrolling: "touch" }}
                    >
                      {projects.map((p) => (
                        <div
                          key={p.id}
                          dir="rtl"
                          className="snap-start shrink-0 w-[86%] sm:w-[420px]"
                        >
                          {projectCard(p, false)}
                        </div>
                      ))}
                    </div>

                    <div className="hidden lg:grid grid-cols-2 xl:grid-cols-4 gap-8">
                      {projects.slice(0, 4).map((p) => (
                        <div key={p.id}>{projectCard(p, false)}</div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center text-white/70 py-16">
                    لا توجد مشاريع حالياً.
                  </div>
                )}
              </div>

              <div className="mt-14 flex justify-center">
                <Link href="/projects">
                  <Button className="rsg-cta rsg-cta--gold">
                    عرض جميع المشاريع
                    <ArrowRight className="mr-2 w-5 h-5" />
                  </Button>
                </Link>
              </div>
            </div>
          </section>

          {/* ✅ Why */}
          <section className={`${SECTION} py-16 md:py-20`}>
            <div className="container w-full">
              <div className="rsg-card p-8 md:p-10">
                <div className="text-center max-w-2xl mx-auto">
                  <h2 className="text-4xl md:text-5xl font-semibold text-foreground">
                    لماذا الاستثمار مع معدن؟
                  </h2>
                  <p className="mt-4 text-base md:text-lg text-muted-foreground">
                    رحلة واضحة من اختيار المشروع إلى متابعة الأداء… بكل شفافية.
                  </p>
                </div>

                <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="rounded-2xl border border-border bg-white/70 backdrop-blur p-6 text-center">
                    <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                      <Sparkles className="w-6 h-6 text-amber-700" />
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-foreground">
                      اختيار ذكي للمشاريع
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                      مشاريع مدروسة بعناية مع عرض واضح للموقع والنوع والصور.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border bg-white/70 backdrop-blur p-6 text-center">
                    <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                      <Shield className="w-6 h-6 text-amber-700" />
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-foreground">
                      شفافية وموثوقية
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                      معلومات موحدة، وإظهار المشاريع المنشورة فقط حسب إعدادات الإدارة.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border bg-white/70 backdrop-blur p-6 text-center">
                    <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-amber-700" />
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-foreground">
                      خطوات استثمار واضحة
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                      ابدأ بمشاهدة المشاريع، ثم تفاصيل كل مشروع، ثم اتخاذ قرار الاستثمار.
                    </p>
                  </div>
                </div>

                <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Link href="/projects">
                    <Button className="rounded-full h-11 px-7">
                      استعرض المشاريع الآن
                      <ArrowRight className="mr-2 w-5 h-5" />
                    </Button>
                  </Link>

                  <Link href="/about">
                    <Button variant="outline" className="rounded-full h-11 px-7">
                      تعرّف على معدن
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </section>

        </div>
      </main>

      <VideoModal
        isOpen={isVideoOpen}
        onClose={() => setIsVideoOpen(false)}
        videoUrl="https://www.youtube.com/watch?v=PxzIjQY0qa4"
        title="فيديو تعريفي عن مايدن"
      />
    </div>
  );
}
