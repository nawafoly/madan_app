// client/src/pages/Home.tsx
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import VideoModal from "@/components/VideoModal";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play, CheckCircle2, Shield, TrendingUp, Sparkles } from "lucide-react";
import { useDragScroll } from "@/hooks/useDragScroll";

// ✅ Sections
import {
  Section,
  SectionHeader,
  SectionTitle,
  SectionDescription,
  SectionContent,
} from "@/components/Section";

// 🔥 Firestore
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  limit,
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

const FALLBACK_IMG = "/HOOM-HERO.png";

// ✅ صورة قسم "قصتنا"
const STORY_IMG = "/about-story.jpg";

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
  const [projects, setProjects] = useState<HomeProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [labels, setLabels] = useState<Required<LabelsDoc>>(DEFAULT_LABELS);
  const [flags, setFlags] = useState<FlagsDoc>(DEFAULT_FLAGS);

  // ✅ Drag scroll for home slider
  const { ref: homeSliderRef, bind: homeSliderBind } =
    useDragScroll<HTMLDivElement>();

  // ✅ نخلي flags دايمًا محدثة داخل onSnapshot بدون stale closure
  const flagsRef = useRef<FlagsDoc>(DEFAULT_FLAGS);
  useEffect(() => {
    flagsRef.current = flags;
  }, [flags]);

  // ✅ أي انتقال صفحة => رجّع للأعلى
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location]);

  // ✅ Live load: labels + flags + projects
  useEffect(() => {
    setIsLoading(true);

    // ✅ Realtime labels
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

    // ✅ Realtime flags
    const unsubFlags = onSnapshot(doc(db, "settings", "flags"), (snap) => {
      if (snap.exists()) {
        setFlags({ ...DEFAULT_FLAGS, ...(snap.data() as FlagsDoc) });
      } else {
        setFlags(DEFAULT_FLAGS);
      }
    });

    // ✅ Realtime projects
    const qy = query(
      collection(db, "projects"),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const unsubProjects = onSnapshot(
      qy,
      (snap) => {
        const f = flagsRef.current || DEFAULT_FLAGS;

        const filteredDocs = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((p: any) => {
            const status = String(p.status || "").trim();
            const type = String(p.projectType || p.category || "").trim();

            // لازم منشور
            if (status !== "published") return false;

            // vipOnlyMode => فقط vip_exclusive
            if (f.vipOnlyMode) return type === "vip_exclusive";
            if (f.hideVipProjects && type === "vip_exclusive") return false;

            return true;
          })
          .slice(0, 4);

        const list: HomeProject[] = filteredDocs.map((p: any) => {
          const typeKey = String(p.projectType || p.category || "").trim();
          const rawImg = String(p.coverImage || p.image || "").trim();
          const image = rawImg ? normalizePublicImage(rawImg) : FALLBACK_IMG;

          return {
            id: p.id,
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
        });

        setProjects(list);
        setIsLoading(false);
      },
      (err) => {
        console.error("Failed to live load home projects:", err);
        setProjects([]);
        setIsLoading(false);
      }
    );

    return () => {
      unsubLabels();
      unsubFlags();
      unsubProjects();
    };
  }, []);

  const categoryLabel = (key: string) =>
    pickLabel(labels.projectTypes[key], "ar", key || "مشروع");

  // ✅ Card (نفس الحجم للجميع)
  const card = (p: HomeProject | undefined) => {
    if (!p) return null;

    const aspect = "aspect-[4/5] md:aspect-[16/13]";
    const href = `/projects/${p.id}`;

    return (
      <Link href={href}>
        <a className={`group block relative overflow-hidden rounded-[28px] ${aspect}`}>
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

          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent opacity-85 group-hover:opacity-95 transition-opacity" />

          <div className="absolute bottom-0 right-0 p-6 md:p-7 w-full text-white">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-white/12 text-white border border-white/20 backdrop-blur-md">
              {categoryLabel(p.categoryKey)}
            </span>

            <h3 className="mt-3 text-2xl md:text-3xl font-bold leading-snug">
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
        </a>
      </Link>
    );
  };

  return (
    <div className="rsg-page min-h-screen flex flex-col text-foreground" dir="rtl" lang="ar">
      <Header />

      <main className="flex-grow relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="absolute -left-40 top-0 h-full w-[520px] opacity-[0.50] bg-[url('/bg-01-l.png')] bg-no-repeat bg-contain" />
          <div className="absolute -right-40 top-0 h-full w-[520px] opacity-[0.50] bg-[url('/bg-01-r.png')] bg-no-repeat bg-contain" />
          <div className="absolute inset-0 bg-white/60" />
        </div>

        <div className="relative z-10">
          {/* HERO */}
          <section className="relative w-full min-h-screen overflow-hidden">
            <div className="absolute inset-0 z-0">
              <img
                src="/HOOM-HERO1.jpg"
                alt="MAEDIN Hero"
                className="w-full h-full object-cover object-top"
              />
            </div>

            <div className="absolute inset-0 bg-black/35 z-[1]" />

            <div className="container relative z-10 flex items-center justify-center min-h-screen">
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
          <section className="py-16 md:py-20">
            <div className="container">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
                <div className="text-center lg:text-right">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-amber-700/90">
                    <span>من نحن</span>
                  </div>

                  <h2 className="mt-2 text-4xl md:text-5xl font-bold tracking-tight text-foreground">
                    قصتنا
                  </h2>

                  <p className="mt-6 text-base md:text-lg text-muted-foreground leading-relaxed">
                    بجذور راسخة وطموح لا يحده أفق، انطلقت معدن لتكون منارة في عالم الاستثمار العقاري.
                  </p>

                  <p className="mt-4 text-base md:text-lg text-muted-foreground leading-relaxed">
                    نحن نؤمن بأن العقار ليس مجرد بناء، بل هو مساحة للحياة والنمو، ورؤيتنا تتجاوز المألوف لخلق بيئات سكنية وتجارية تلهم قاطنيها وتوفر عوائد استثمارية مستدامة لشركائنا.
                  </p>

                  <p className="mt-4 text-base md:text-lg text-muted-foreground leading-relaxed">
                    من خلال دمج التصميم العصري مع الأصالة والابتكار مع الخبرة، نسعى لبناء إرث يدوم للأجيال القادمة.
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
                          <div className="text-2xl font-bold text-foreground">15+</div>
                          <div className="text-xs text-muted-foreground mt-1">عاماً من الخبرة</div>
                        </div>

                        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-5 h-5 text-amber-700" />
                        </div>
                      </div>

                      <p className="mt-3 text-sm text-muted-foreground text-center leading-relaxed">
                        سجل حافل بالإنجازات في تطوير وإدارة المشاريع العقارية الفاخرة.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-10 md:h-12" />
            </div>
          </section>

          {/* PROJECTS */}
          <Section className="py-0">
            <div className="container">
              <SectionHeader className="text-center max-w-2xl mx-auto">
                <SectionTitle className="text-4xl md:text-5xl font-semibold text-foreground">
                  مشاريعنا
                </SectionTitle>

                <div className="mx-auto mt-3 h-[2px] w-16 rounded-full bg-primary/60" />

                <SectionDescription className="mt-4 text-base md:text-lg text-muted-foreground">
                  أحدث المشاريع المنشورة لدينا
                </SectionDescription>
              </SectionHeader>

              <SectionContent>
                <div className="rsg-card p-6 md:p-8">
                  {isLoading ? (
                    <div className="text-center text-muted-foreground py-20">
                      جاري تحميل المشاريع...
                    </div>
                  ) : projects.length ? (
                    <>
                      {/* ✅ Mobile: slider */}
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
                            {card(p)}
                          </div>
                        ))}
                      </div>

                      {/* ✅ Desktop: equal cards */}
                      <div className="hidden lg:grid grid-cols-2 xl:grid-cols-4 gap-8">
                        {projects.slice(0, 4).map((p) => (
                          <div key={p.id}>{card(p)}</div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-center text-muted-foreground py-20">
                      لا توجد مشاريع منشورة حالياً.
                    </div>
                  )}

                  <div className="mt-16 flex justify-center">
                    <Link href="/projects">
                      <Button className="rsg-cta">
                        عرض جميع المشاريع
                        <ArrowRight className="mr-2 w-5 h-5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </SectionContent>
            </div>
          </Section>

          {/* ✅ سكشن جديد: لماذا الاستثمار مع معدن؟ */}
          <section className="py-16 md:py-20">
            <div className="container">
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

      <Footer />

      <VideoModal
        isOpen={isVideoOpen}
        onClose={() => setIsVideoOpen(false)}
        videoUrl="https://www.youtube.com/watch?v=PxzIjQY0qa4"
        title="فيديو تعريفي عن مايدن"
      />
    </div>
  );
}
