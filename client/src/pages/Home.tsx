import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  MapPin,
  Shield,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useDragScroll } from "@/hooks/useDragScroll";
import { normalizePublicAssetPath } from "@/lib/publicAssets";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/_core/firebase";

type HomeProject = {
  id: string;
  title: string;
  location: string;
  categoryKey: string;
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
  totalInvestment?: string;
  projectsCount?: string;
  avgReturn?: string;
  avgDuration?: string;
};

type IconFeature = {
  title: string;
  description: string;
  icon: LucideIcon;
};

type SectionIntroProps = {
  eyebrow: string;
  title: string;
  description: string;
  centered?: boolean;
  invert?: boolean;
};

const DEFAULT_LABELS: Required<LabelsDoc> = {
  projectTypes: {
    sukuk: "استثمار بالصكوك",
    land_development: "تطوير أراضٍ",
    vip_exclusive: "VIP حصري",
  },
  projectStatuses: {
    draft: "قريبًا",
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

const OVERVIEW_PILLARS: IconFeature[] = [
  {
    title: "اختيار مدروس للفرص",
    description:
      "نختار فرصًا عقارية مدروسة بعناية، مع عرض واضح يساعدك على تقييمها بسرعة.",
    icon: Sparkles,
  },
  {
    title: "حوكمة وشفافية",
    description:
      "معلومات موحدة ومنظمة تمنحك وضوحًا كاملًا وثقة أعلى في كل قرار.",
    icon: Shield,
  },
  {
    title: "نمو قائم على التنفيذ",
    description:
      "نركز على تنفيذ فعلي يحقق قيمة مستدامة ونتائج ملموسة للاستثمار.",
    icon: TrendingUp,
  },
];

const INVESTMENT_FLOW = [
  {
    step: "01",
    title: "استكشاف الفرص",
    description:
      "نقدم لك مجموعة مختارة من الفرص الاستثمارية بعناية، مع رؤية واضحة لأهداف كل مشروع وقيمته المستقبلية.",
  },
  {
    step: "02",
    title: "فهم التفاصيل",
    description:
      "نضع بين يديك جميع المعلومات الجوهرية، من البيانات المالية إلى عناصر المشروع التشغيلية، لضمان رؤية شاملة قبل اتخاذ القرار.",
  },
  {
    step: "03",
    title: "قرار بثقة",
    description:
      "نرافقك في رحلتك الاستثمارية بخطوات واضحة، من البداية وحتى تحقيق العائد، مع متابعة مستمرة لكل استثمار.",
  },
];

const HERO_TRUST_POINTS = [
  "رؤية مؤسسية أوضح للمشاريع",
  "عرض موحد للمعلومات الأساسية",
  "تجربة أكثر ترتيبًا عبر جميع الأجهزة",
];

const FALLBACK_IMG = "/HOOM-HERO.png";
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
  return normalizePublicAssetPath(src);
}

function SectionIntro({
  eyebrow,
  title,
  description,
  centered = false,
  invert = false,
}: SectionIntroProps) {
  return (
    <div
      className={`max-w-3xl space-y-4 ${
        centered ? "mx-auto text-center" : "text-right"
      }`}
    >
      <span
        className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-semibold ${
          invert
            ? "bg-white/10 text-white/75 ring-1 ring-white/15"
            : "bg-[#f7f3ea] text-primary/75 ring-1 ring-[#eadfbe]"
        }`}
      >
        {eyebrow}
      </span>
      <h2
        className={`text-3xl font-semibold leading-tight sm:text-4xl lg:text-[2.8rem] ${
          invert ? "text-white" : "text-foreground"
        }`}
      >
        {title}
      </h2>
      <p
        className={`text-base leading-8 sm:text-lg ${
          invert ? "text-white/72" : "text-muted-foreground"
        }`}
      >
        {description}
      </p>
    </div>
  );
}

export default function Home() {
  const [location] = useLocation();
  const [featured, setFeatured] = useState<HomeProject[]>([]);
  const [projects, setProjects] = useState<HomeProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [labels, setLabels] = useState<Required<LabelsDoc>>(DEFAULT_LABELS);
  const [flags, setFlags] = useState<FlagsDoc>(DEFAULT_FLAGS);
  const [stats, setStats] = useState<StatsDoc>(DEFAULT_STATS);

  const { ref: homeSliderRef, bind: homeSliderBind } =
    useDragScroll<HTMLDivElement>();

  const flagsRef = useRef<FlagsDoc>(DEFAULT_FLAGS);

  useEffect(() => {
    flagsRef.current = flags;
  }, [flags]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location]);

  const categoryLabel = (key: string) =>
    pickLabel(labels.projectTypes[key], "ar", key || "مشروع");

  const metrics = [
    {
      value: stats.totalInvestment || DEFAULT_STATS.totalInvestment,
      label: "إجمالي الاستثمارات",
    },
    {
      value: stats.projectsCount || DEFAULT_STATS.projectsCount,
      label: "عدد المشاريع",
    },
    {
      value: stats.avgReturn || DEFAULT_STATS.avgReturn,
      label: "متوسط العائد",
    },
    {
      value: stats.avgDuration || DEFAULT_STATS.avgDuration,
      label: "متوسط مدة المشروع",
    },
  ];

  const projectCard = (project: HomeProject | undefined, isFeatured = false) => {
    if (!project) return null;
    const href = `/projects/${project.id}`;
    const aspect = isFeatured
      ? "aspect-[5/6] md:aspect-[16/11]"
      : "aspect-[5/6] md:aspect-[4/5] xl:aspect-[16/15]";

    return (
      <Link href={href} className="block h-full">
        <article
          className={`rsg-flip group relative h-full overflow-hidden rounded-[30px] border border-slate-200/10 bg-slate-950 shadow-[0_32px_90px_-38px_rgba(11,23,38,0.7)] ${aspect}`}
          aria-label={project.title}
        >
          <div className="rsg-flip__inner">
            <div className="rsg-flip__face">
              <img
                src={project.image}
                alt={project.title}
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                loading="lazy"
                draggable={false}
                onError={(event) => {
                  const image = event.currentTarget;
                  if (image.src.includes(FALLBACK_IMG)) return;
                  image.src = FALLBACK_IMG;
                }}
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,14,24,0.16)_0%,rgba(6,14,24,0.22)_24%,rgba(6,14,24,0.88)_100%)]" />
              <div className="absolute inset-x-0 top-0 flex items-center justify-between p-5 md:p-6">
                <span className="inline-flex items-center rounded-full border border-white/18 bg-white/12 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-md md:text-xs">
                  {isFeatured ? "مشروع مميز" : categoryLabel(project.categoryKey)}
                </span>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/16 bg-white/10 text-white backdrop-blur-md transition-transform duration-300 group-hover:translate-x-[-4px]">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
              <div className="absolute inset-x-0 bottom-0 p-6 text-white md:p-7">
                <p className="text-xs font-medium tracking-[0.24em] text-white/65">
                  فرصة منشورة
                </p>
                <h3 className="mt-3 text-2xl font-semibold leading-snug md:text-3xl">
                  {project.title}
                </h3>
                <div className="mt-4 flex items-center gap-2 text-sm text-white/78">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span>{project.location}</span>
                </div>
              </div>
            </div>
            <div className="rsg-flip__face rsg-flip__back">
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,14,24,0.96)_0%,rgba(15,32,52,0.96)_100%)]" />
              <div className="absolute inset-0 flex flex-col justify-end p-6 text-white md:p-7">
                <span className="inline-flex w-fit items-center rounded-full border border-white/14 bg-white/8 px-3 py-1 text-[11px] font-semibold text-white/90 backdrop-blur md:text-xs">
                  {isFeatured ? "مشروع مميز" : categoryLabel(project.categoryKey)}
                </span>
                <h3 className="mt-4 text-2xl font-semibold leading-snug md:text-3xl">
                  {project.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-white/72 md:text-base">
                  عرض استثماري مرتب يوضح الفكرة العامة للمشروع بسرعة قبل الانتقال
                  إلى التفاصيل الكاملة.
                </p>
                <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#f2ae30]">
                  عرض التفاصيل
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </div>
          </div>
        </article>
      </Link>
    );
  };

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
      if (snap.exists()) {
        setFlags({ ...DEFAULT_FLAGS, ...(snap.data() as FlagsDoc) });
      } else {
        setFlags(DEFAULT_FLAGS);
      }
    });

    const unsubStats = onSnapshot(doc(db, "settings", "homeStats"), (snap) => {
      if (snap.exists()) {
        setStats({ ...DEFAULT_STATS, ...(snap.data() as StatsDoc) });
      } else {
        setStats(DEFAULT_STATS);
      }
    });

    const projectsQuery = query(
      collection(db, "projects"),
      where("status", "==", "published"),
      orderBy("createdAt", "desc"),
      limit(30)
    );

    const unsubProjects = onSnapshot(
      projectsQuery,
      (snap) => {
        const currentFlags = flagsRef.current || DEFAULT_FLAGS;
        const published = snap.docs
          .map((projectDoc) => ({ id: projectDoc.id, ...(projectDoc.data() as any) }))
          .filter((project: any) => {
            const status = String(project.status || "").trim();
            const type = String(project.projectType || project.category || "").trim();
            if (status !== "published") return false;
            if (currentFlags.vipOnlyMode) return type === "vip_exclusive";
            if (currentFlags.hideVipProjects && type === "vip_exclusive") return false;
            return true;
          });

        const pickedFeatured = published
          .filter((project: any) => !!project.homeFeatured)
          .slice(0, 2);
        const finalFeatured = (pickedFeatured.length ? pickedFeatured : published).slice(
          0,
          2
        );
        const featuredIds = new Set(finalFeatured.map((project: any) => String(project.id)));

        const latestProjects = published
          .filter((project: any) => !featuredIds.has(String(project.id)))
          .slice(0, 4);

        const mapToHomeProject = (project: any): HomeProject => {
          const typeKey = String(project.projectType || project.category || "").trim();
          const rawImg = String(project.coverImage || project.image || "").trim();
          const image = rawImg ? normalizePublicImage(rawImg) : FALLBACK_IMG;
          return {
            id: String(project.id),
            title: String(project.titleAr || project.titleEn || project.title || "مشروع"),
            location: String(
              project.locationAr ||
                project.locationEn ||
                project.location ||
                "المملكة العربية السعودية"
            ),
            categoryKey: typeKey || "unknown",
            image,
          };
        };

        setFeatured(finalFeatured.map(mapToHomeProject));
        setProjects(latestProjects.map(mapToHomeProject));
        setIsLoading(false);
      },
      (error) => {
        console.error("Failed to live load home projects:", error);
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
    <div
      dir="rtl"
      className="min-h-screen bg-[linear-gradient(180deg,#f5f6f8_0%,#ffffff_18%,#f8f8f9_100%)] text-foreground"
    >
      <main className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(circle_at_top,rgba(242,174,48,0.16),transparent_55%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute right-[-8rem] top-[28rem] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(11,23,38,0.08),transparent_68%)] blur-3xl"
        />

        <section className="relative h-screen min-h-screen min-h-[100svh] overflow-hidden">
          <div className="absolute inset-0 z-0">
            <video
              src="/about-hero.mp4"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover object-top"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              onCanPlay={(event) => {
                const video = event.currentTarget;
                if (video.paused) {
                  void video.play().catch(() => undefined);
                }
              }}
            />
          </div>

          <div className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(112deg,rgba(6,14,24,0.92)_0%,rgba(8,17,28,0.82)_42%,rgba(9,20,33,0.56)_100%)]" />
          <div className="pointer-events-none absolute inset-0 z-[2] bg-[radial-gradient(circle_at_top_right,rgba(242,174,48,0.22),transparent_34%)]" />

          <div className="container relative z-10 h-full px-4 sm:px-6">
            <div className="flex h-full items-center justify-center pt-[calc(var(--site-header-offset)+1.5rem)]">
              <div className="mx-auto max-w-4xl text-center text-white">
                <h1 className="text-4xl font-bold leading-[1.35] tracking-tight sm:text-5xl lg:text-6xl lg:leading-[1.25]">
                  بناء وجهات الغد الاستثمارية
                </h1>

                <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-white/78 sm:text-xl">
                  مع معدن، نحو مستقبل أكثر وضوحًا في الاستثمار العقاري عبر
                  واجهة مرتبة، موثوقة، ومصممة لتقديم الفرص بصورة احترافية.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="relative py-16 sm:py-20">
          <div className="container px-4 sm:px-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.88fr)] lg:items-stretch">
              <div className="rounded-[34px] border border-slate-200/80 bg-white p-8 shadow-[0_28px_85px_-56px_rgba(11,23,38,0.32)] sm:p-10">
                <div className="max-w-2xl text-right">
                  <p className="text-sm font-semibold text-primary/70">
                    نظرة سريعة
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
                    مدخل مختصر إلى المنصة وتجربة التصفح
                  </h2>
                  <p className="mt-4 text-base leading-8 text-muted-foreground sm:text-lg">
                    نقلنا العناصر الداعمة إلى هذا السكشن ليبقى الهيرو نظيفًا
                    ورسميًا، بينما تبقى المؤشرات وأزرار الانتقال ونقاط الثقة في
                    مساحة مستقلة وواضحة بصريًا.
                  </p>
                </div>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-start">
                  <Link href="/projects">
                    <Button className="h-12 rounded-full bg-[#f2ae30] px-7 text-sm font-semibold text-primary hover:bg-[#f6b63f]">
                      استعرض المشاريع
                      <ArrowRight className="mr-2 h-4 w-4" />
                    </Button>
                  </Link>

                  <Link href="/about">
                    <Button
                      variant="outline"
                      className="h-12 rounded-full px-7 text-sm font-semibold"
                    >
                      المزيد عنا
                    </Button>
                  </Link>
                </div>

                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  {HERO_TRUST_POINTS.map((point) => (
                    <div
                      key={point}
                      className="rounded-[24px] border border-slate-200/80 bg-slate-50/85 px-4 py-4 text-sm leading-7 text-muted-foreground"
                    >
                      {point}
                    </div>
                  ))}
                </div>
              </div>

              <div className="overflow-hidden rounded-[34px] bg-[linear-gradient(135deg,#0b1726_0%,#13253b_55%,#1a2f48_100%)] p-6 text-white shadow-[0_36px_100px_-46px_rgba(0,0,0,0.75)] sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div className="text-right">
                    <p className="text-sm font-medium text-white/70">
                      مؤشرات أساسية
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold leading-tight">
                      صورة سريعة عن المنصة
                    </h2>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-white/8 p-3">
                    <Building2 className="h-6 w-6 text-[#f2ae30]" />
                  </div>
                </div>

                <div className="mt-8 grid grid-cols-2 gap-4">
                  {metrics.map((metric) => (
                    <div
                      key={metric.label}
                      className="rounded-[24px] border border-white/12 bg-[#08111d]/48 p-4"
                    >
                      <div className="text-2xl font-semibold text-white sm:text-3xl">
                        {metric.value}
                      </div>
                      <div className="mt-2 text-sm text-white/68">
                        {metric.label}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-[26px] border border-white/12 bg-[#08111d]/58 p-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-[#f2ae30]/18 p-2.5">
                      <CheckCircle2 className="h-5 w-5 text-[#f2ae30]" />
                    </div>
                    <div className="text-right">
                      <h3 className="text-base font-semibold">
                        سجل تشغيلي ممتد
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-white/72">
                        أكثر من 15 عامًا من الخبرة في تطوير وإدارة المشاريع
                        العقارية الفاخرة، مع تركيز واضح على الجودة والاستدامة.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative py-20 sm:py-24 lg:py-28">
          <div className="container px-4 sm:px-6">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)] lg:items-start lg:gap-14">
              <div className="relative">
                <div className="relative overflow-hidden rounded-[34px] border border-slate-200/70 bg-[#0b1726] shadow-[0_32px_90px_-48px_rgba(11,23,38,0.35)]">
                  <img
                    src={STORY_IMG}
                    alt="قصتنا"
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={(event) => {
                      event.currentTarget.src = "/HOOM-HERO1.jpg";
                    }}
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,23,38,0.32)_0%,rgba(11,23,38,0.46)_36%,rgba(11,23,38,0.88)_100%)]" />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(242,174,48,0.18),transparent_34%)]" />

                  <div className="relative z-10 flex min-h-[560px] flex-col justify-between items-end p-6 md:min-h-[640px] md:p-8">
                    <div className="w-full max-w-[28rem] text-right text-white">
                      <p className="text-xs font-medium tracking-[0.24em] text-white/65">
                        من نحن
                      </p>
                      <p className="mt-3 text-lg leading-8 text-white/88 md:text-[1.375rem] md:leading-9">
                        نبني بيئات سكنية وتجارية تلهم قاطنيها وتمنح شركاءنا وضوحًا
                        أكبر في تقييم الفرص الاستثمارية.
                      </p>
                    </div>

                    <div className="w-full max-w-[28rem] rounded-[28px] border border-slate-200/85 bg-white/98 p-6 shadow-[0_24px_70px_-44px_rgba(11,23,38,0.35)] backdrop-blur-sm">
                      <div className="flex items-start gap-4">
                        <div className="rounded-full bg-[#f7edd7] p-3">
                          <CheckCircle2 className="h-5 w-5 text-[#b57919]" />
                        </div>
                        <div className="text-right">
                          <div className="text-3xl font-semibold text-foreground">
                            15+
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            عامًا من الخبرة
                          </div>
                          <p className="mt-4 text-sm leading-7 text-muted-foreground">
                            سجل حافل بالإنجازات في تطوير وإدارة المشاريع العقارية
                            الفاخرة وبناء قيمة مستدامة على المدى الطويل.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <SectionIntro
                  eyebrow="قصتنا"
                  title="حضور مؤسسي يجمع بين الأصالة، الخبرة، والطموح"
                  description="نعيد صياغة الصفحة الرئيسية بأسلوب يعبّر عن شركة استثمار عقاري احترافية، واضحة في رسالتها، ومنظمة في عرض محتواها."
                />

                <div className="mt-6 space-y-4 text-base leading-8 text-muted-foreground sm:text-lg">
                  <p>
                    بجذور راسخة وطموح لا يحده أفق، انطلقت معدن لتكون منارة في عالم
                    الاستثمار العقاري.
                  </p>
                  <p>
                    نحن نؤمن بأن العقار ليس مجرد بناء، بل هو مساحة للحياة والنمو،
                    ورؤيتنا تتجاوز المألوف لخلق بيئات سكنية وتجارية تلهم قاطنيها
                    وتوفر عوائد استثمارية مستدامة لشركائنا.
                  </p>
                  <p>
                    من خلال دمج التصميم العصري مع الأصالة والابتكار مع الخبرة،
                    نسعى لبناء إرث يدوم للأجيال القادمة.
                  </p>
                </div>

                <div className="mt-8">
                  <Link href="/about">
                    <Button className="h-12 rounded-full px-7 text-sm font-semibold">
                      المزيد عنا
                      <ArrowRight className="mr-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="pb-20 sm:pb-24">
          <div className="container px-4 sm:px-6">
            <div className="overflow-hidden rounded-[36px] bg-[linear-gradient(135deg,#0b1726_0%,#13253b_55%,#1a2f48_100%)] px-6 py-10 text-white shadow-[0_36px_110px_-56px_rgba(11,23,38,0.95)] sm:px-8 lg:px-12 lg:py-12">
              <SectionIntro
                eyebrow="الأرقام"
                title="مؤشرات تعكس الثقة والاتساق"
                description="مؤشرات مختصرة تساعد المستثمر على تكوين صورة أولية سريعة عن حجم الحضور وفرص النمو داخل المنصة."
                invert
              />

              <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {metrics.map((metric) => (
                  <article
                    key={metric.label}
                    className="rounded-[26px] border border-white/10 bg-white/6 p-5 backdrop-blur-sm"
                  >
                    <div className="text-3xl font-semibold text-[#f2ae30] md:text-[2.4rem]">
                      {metric.value}
                    </div>
                    <div className="mt-3 text-sm leading-7 text-white/74">
                      {metric.label}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 sm:py-24">
          <div className="container px-4 sm:px-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <SectionIntro
                eyebrow="المشاريع المميزة"
                title="فرص مختارة تعكس أسلوب العرض المؤسسي"
                description="مشاريع بارزة تظهر في الصفحة الرئيسية بهيكل بصري أوضح، وكروت موحدة، ومسافات أكثر انضباطًا."
              />

              <Link href="/projects">
                <Button
                  variant="outline"
                  className="h-12 rounded-full px-6 text-sm font-semibold"
                >
                  عرض كل المشاريع
                </Button>
              </Link>
            </div>

            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              {featured.length ? (
                featured.map((project) => (
                  <div key={project.id}>{projectCard(project, true)}</div>
                ))
              ) : (
                <div className="col-span-full rounded-[30px] border border-dashed border-slate-300 bg-white/75 px-6 py-16 text-center text-muted-foreground shadow-[0_24px_80px_-60px_rgba(11,23,38,0.25)]">
                  لا توجد مشاريع مميزة حاليًا.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="py-20 sm:py-24">
          <div className="container px-4 sm:px-6">
            <div className="mx-auto max-w-4xl rounded-[34px] border border-slate-200/70 bg-white p-8 shadow-[0_28px_80px_-52px_rgba(11,23,38,0.28)] sm:p-10 lg:p-12">
              <div className="max-w-3xl text-right">
                <SectionIntro
                  eyebrow="لماذا معدن"
                  title="مسار استثماري أوضح… من الفرصة إلى القرار"
                  description="نعمل في «معدن» على تقديم فرص استثمارية مدروسة بوضوح، تساعدك على فهم المشروع من جميع جوانبه، وتقليل عدم اليقين، لاتخاذ قرارات استثمارية مبنية على أسس قوية وثقة عالية."
                />
              </div>

              <div className="mt-8 space-y-4">
                {INVESTMENT_FLOW.map((item) => (
                  <div
                    key={item.step}
                    className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-5"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-white">
                        {item.step}
                      </div>
                      <div className="text-right">
                        <h3 className="text-lg font-semibold text-foreground">
                          {item.title}
                        </h3>
                        <p className="mt-2 text-sm leading-7 text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="pb-20 sm:pb-24">
          <div className="container px-4 sm:px-6">
            <div className="rounded-[34px] border border-slate-200/70 bg-white/85 p-8 shadow-[0_24px_80px_-56px_rgba(11,23,38,0.24)] sm:p-10">
              <div className="max-w-3xl text-right">
                <SectionIntro
                  eyebrow="ما الذي يميز معدن"
                  title="مرتكزات العمل في معدن"
                  description="ثلاثة مرتكزات واضحة تنظم طريقة اختيار الفرص وعرضها وتنفيذها، بما يعزز وضوح التجربة وثقة المستثمر."
                />
              </div>

              <div className="mt-8 grid gap-5 md:grid-cols-3">
                {OVERVIEW_PILLARS.map((pillar) => {
                  const Icon = pillar.icon;
                  return (
                    <article
                      key={`${pillar.title}-support`}
                      className="flex min-h-[180px] flex-col justify-between rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f7f8fa_100%)] p-6 text-right shadow-[0_24px_80px_-56px_rgba(11,23,38,0.22)]"
                    >
                      <div className="flex items-center gap-4">
                        <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f7f3ea] text-primary">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="h-px flex-1 bg-slate-200/80" />
                      </div>

                      <div className="mt-6 flex flex-1 flex-col gap-3">
                        <h3 className="line-clamp-1 text-lg font-semibold text-foreground">
                          {pillar.title}
                        </h3>
                        <p className="line-clamp-2 overflow-hidden text-sm leading-7 text-muted-foreground">
                          {pillar.description}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 sm:py-24 lg:py-28">
          <div className="container px-4 sm:px-6">
            <div className="rounded-[36px] border border-slate-200/70 bg-white px-6 py-8 shadow-[0_30px_90px_-54px_rgba(11,23,38,0.32)] sm:px-8 sm:py-10 lg:px-10 lg:py-12">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <SectionIntro
                  eyebrow="مشاريعنا"
                  title="فرص منشورة بواجهة أوضح وتسلسل أبسط"
                  description="استعراض أحدث المشاريع ضمن شبكة موحدة من الكروت والعناوين والمسافات، مع تجربة مناسبة للجوال والتابلت والديسكتوب."
                />

                <Link href="/projects">
                  <Button className="h-12 rounded-full px-7 text-sm font-semibold">
                    عرض جميع المشاريع
                    <ArrowRight className="mr-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>

              <div className="mt-10">
                {isLoading ? (
                  <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-16 text-center text-muted-foreground">
                    جاري تحميل المشاريع...
                  </div>
                ) : projects.length ? (
                  <>
                    <div
                      ref={homeSliderRef}
                      {...homeSliderBind}
                      dir="ltr"
                      className="flex gap-5 overflow-x-auto overflow-y-hidden pb-4 lg:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden cursor-grab snap-x snap-mandatory scroll-smooth select-none active:cursor-grabbing"
                      style={{ WebkitOverflowScrolling: "touch" }}
                    >
                      {projects.map((project) => (
                        <div
                          key={project.id}
                          dir="rtl"
                          className="w-[86%] shrink-0 snap-start sm:w-[420px]"
                        >
                          {projectCard(project)}
                        </div>
                      ))}
                    </div>

                    <div className="hidden gap-6 lg:grid lg:grid-cols-2 xl:grid-cols-4">
                      {projects.slice(0, 4).map((project) => (
                        <div key={project.id}>{projectCard(project)}</div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-16 text-center text-muted-foreground">
                    لا توجد مشاريع حاليًا.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="pb-8 sm:pb-10 lg:pb-12">
          <div className="container px-4 sm:px-6">
            <div className="relative overflow-hidden rounded-[34px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96)_0%,rgba(247,248,250,0.98)_65%,rgba(242,174,48,0.12)_100%)] px-6 py-10 shadow-[0_28px_85px_-56px_rgba(11,23,38,0.3)] sm:px-8 lg:px-10">
              <div
                aria-hidden
                className="pointer-events-none absolute left-0 top-0 h-28 w-28 rounded-full bg-[#f2ae30]/18 blur-3xl"
              />

              <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-2xl text-right">
                  <p className="text-sm font-semibold text-primary/70">
                    الخطوة التالية
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
                    واجهة أوضح اليوم، وانتقال أسلس إلى قسم التواصل أسفل الصفحة.
                  </h2>
                  <p className="mt-4 text-base leading-8 text-muted-foreground sm:text-lg">
                    ابدأ من المشاريع المنشورة أو تعرّف أكثر على معدن، ثم أكمل
                    رحلتك مباشرة إلى قسم التواصل والفوتر بتسلسل بصري أكثر اتزانًا.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link href="/projects">
                    <Button className="h-12 rounded-full px-7 text-sm font-semibold">
                      استعرض المشاريع
                      <ArrowRight className="mr-2 h-4 w-4" />
                    </Button>
                  </Link>

                  <Link href="/about">
                    <Button
                      variant="outline"
                      className="h-12 rounded-full px-7 text-sm font-semibold"
                    >
                      تعرّف على معدن
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
