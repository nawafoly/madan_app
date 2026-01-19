// client/src/pages/Home.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import VideoModal from "@/components/VideoModal";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";
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
  getDocs,
  orderBy,
  query,
  where,
  limit,
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

const FALLBACK_IMG = "/HOOM-HERO.png";

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
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [projects, setProjects] = useState<HomeProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [labels, setLabels] = useState<Required<LabelsDoc>>(DEFAULT_LABELS);

  // ✅ Drag scroll for home slider
  const { ref: homeSliderRef, bind: homeSliderBind } =
    useDragScroll<HTMLDivElement>();

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);

        const labelsSnap = await getDoc(doc(db, "settings", "labels"));
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

        const qy = query(
          collection(db, "projects"),
          where("status", "==", "published"),
          orderBy("createdAt", "desc"),
          limit(4)
        );

        const snap = await getDocs(qy);

        const list: HomeProject[] = snap.docs.map((d) => {
          const data = d.data() as any;

          const typeKey = String(data.projectType || data.category || "").trim();
          const rawImg = String(data.coverImage || data.image || "").trim();
          const image = rawImg ? normalizePublicImage(rawImg) : FALLBACK_IMG;

          return {
            id: d.id,
            title: String(
              data.titleAr || data.titleEn || data.title || "مشروع بدون عنوان"
            ),
            location: String(
              data.locationAr ||
                data.locationEn ||
                data.location ||
                "المملكة العربية السعودية"
            ),
            categoryKey: typeKey || "unknown",
            image,
          };
        });

        setProjects(list);
      } catch (err) {
        console.error("Failed to load home projects:", err);
        setProjects([]);
        setLabels(DEFAULT_LABELS);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  const categoryLabel = (key: string) =>
    pickLabel(labels.projectTypes[key], "ar", key || "مشروع");

  const p0 = projects[0];
  const p1 = projects[1];
  const p2 = projects[2];
  const p3 = projects[3];

  const card = (p: HomeProject | undefined, size: "big" | "small") => {
    if (!p) return null;

    const aspect =
      size === "big"
        ? "aspect-[4/5] md:aspect-[16/13]"
        : "aspect-[16/9] md:aspect-[16/10]";

    // ✅ الضغط يودّي لتفاصيل المشروع مباشرة
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
                        style={{
                          WebkitOverflowScrolling: "touch"
                        }}
                      >
                        {projects.map((p) => (
                          <div
                            key={p.id}
                            dir="rtl"
                            className="snap-start shrink-0 w-[86%] sm:w-[420px]"
                          >
                            {card(p, "big")}
                          </div>
                        ))}
                      </div>

                      {/* ✅ Desktop: mosaic */}
                      <div className="hidden lg:grid grid-cols-3 gap-8">
                        {card(p0, "big")}
                        {card(p1, "big")}
                        <div className="grid gap-8">
                          {card(p2, "small")}
                          {card(p3, "small")}
                        </div>
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
        </div>
      </main>

      <Footer />

      <VideoModal
        isOpen={isVideoOpen}
        onClose={() => setIsVideoOpen(false)}
        videoUrl="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        title="فيديو تعريفي عن مايدن"
      />
    </div>
  );
}
