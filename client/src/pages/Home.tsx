import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import VideoModal from "@/components/VideoModal";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";

// 🔥 Firestore
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "@/_core/firebase";

type HomeProject = {
  id: string;
  title?: string;
  location?: string;
  category?: string; // سياحي/سكني/تجاري...
  image?: string;
  status?: string;
  createdAt?: any;
};

const FALLBACK_IMG = "/HOOM-HERO.png";

export default function Home() {
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [projects, setProjects] = useState<HomeProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ✅ Load published projects from Firestore
  useEffect(() => {
    const loadProjects = async () => {
      try {
        setIsLoading(true);

        const q = query(
          collection(db, "projects"),
          where("status", "==", "published"),
          orderBy("createdAt", "desc")
        );

        const snap = await getDocs(q);
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as HomeProject[];

        setProjects(list);
      } catch (err) {
        console.error("Failed to load projects", err);
        setProjects([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadProjects();
  }, []);

  // ✅ Demo cards (فقط لو ما فيه بيانات/صور) عشان الشكل النهائي يبان
  const demoProjects: HomeProject[] = useMemo(
    () => [
      {
        id: "demo-1",
        title: "واحة الأعمال",
        location: "الدمام، المملكة العربية السعودية",
        category: "تجاري",
        image: FALLBACK_IMG,
      },
      {
        id: "demo-2",
        title: "أبراج النخيل",
        location: "الرياض، المملكة العربية السعودية",
        category: "سكني",
        image: FALLBACK_IMG,
      },
      {
        id: "demo-3",
        title: "منتجع البحر الأحمر",
        location: "جدة، المملكة العربية السعودية",
        category: "سياحي",
        image: FALLBACK_IMG,
      },
      {
        id: "demo-4",
        title: "واجهة الأعمال",
        location: "الخبر، المملكة العربية السعودية",
        category: "تجاري",
        image: FALLBACK_IMG,
      },
    ],
    []
  );

  const effectiveProjects = useMemo(() => {
    if (isLoading) return [];
    return projects.length ? projects : demoProjects;
  }, [isLoading, projects, demoProjects]);

  // نعرض 4 فقط عشان الموزاييك (2 كبار + 2 صغار)
  const p0 = effectiveProjects[0];
  const p1 = effectiveProjects[1];
  const p2 = effectiveProjects[2];
  const p3 = effectiveProjects[3];

  const card = (p: HomeProject | undefined, size: "big" | "small") => {
    const title = p?.title?.trim() || "مشروع بدون عنوان";
    const location = p?.location?.trim() || "المملكة العربية السعودية";
    const category = p?.category?.trim() || "مشروع";
    const initialSrc = (p?.image?.trim() || FALLBACK_IMG) as string;

    const aspect =
      size === "big"
        ? "aspect-[4/5] md:aspect-[16/13]"
        : "aspect-[16/9] md:aspect-[16/10]";

    return (
      <div className={`group relative overflow-hidden rounded-[28px] ${aspect}`}>
        <img
          src={initialSrc}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          onError={(e) => {
            const img = e.currentTarget;
            if (img.src.endsWith(FALLBACK_IMG)) return;
            img.src = FALLBACK_IMG;
          }}
        />

        {/* overlay مثل المرجع */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

        {/* content */}
        <div className="absolute bottom-0 right-0 p-6 md:p-7 w-full text-white">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-accent/90 text-accent-foreground backdrop-blur-sm">
            {category}
          </span>

          <h3 className="mt-3 text-2xl md:text-3xl font-bold leading-snug">
            {title}
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
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            {location}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div
      className="rsg-page min-h-screen flex flex-col  text-foreground overflow-x-hidden"
      dir="rtl"
      lang="ar"
    >
      {/* ✅ تم حذف rsg-bg من هنا لأنك حاطها في App.tsx */}

      <Header />

      <main className="flex-grow">
        {/* =========================
          HERO (صورة فوق فوق + نص بالمنتصف)
        ========================== */}
        <section className="relative w-full min-h-screen overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0 z-0">
            <img
              src="/HOOM-HERO1.jpg"
              alt="MAEDIN Hero"
              className="w-full h-full object-cover object-top"
            />
          </div>

          {/* Overlay خفيف لرفع وضوح النص */}
          <div className="absolute inset-0 bg-black/35 z-[1]" />

          {/* Content */}
          <div className="container relative z-10 flex items-center justify-center min-h-screen">
            <div className="w-full max-w-3xl text-center pt-[110px] pb-16 space-y-10">
              {/* النص */}
              <div className="space-y-5">
                <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-tight">
                  بناء وجهات
                  <br />
                  <span className="text-white">الغد الاستثمارية</span>
                </h1>

                <p className="text-xl md:text-2xl font-light text-white/85 leading-relaxed">
                  مع معد ن ، نحو مستقبل مشرق للاستثمار العقاري. نقدم لك فرصاً
                  استثنائية تجمع بين الفخامة والعائد المجزي.
                </p>
              </div>

              {/* الزر */}
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setIsVideoOpen(true)}
                  className="
                    group inline-flex items-center gap-3
                    px-8 py-4 rounded-full
                    border border-white/40
                    bg-white/10 backdrop-blur-md
                    text-white text-lg font-medium
                    transition-all duration-300
                    hover:bg-white hover:text-black
                    hover:scale-[1.03]
                    active:scale-[0.97]
                  "
                >
                  <span>شاهد الفيديو</span>
                  <Play className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* =========================
            STORY (قصتنا)
        ========================== */}
        <section className="py-24 bg-[rgba(15,23,42,0.03)] relative">
          <div className="container grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* الصورة يمين */}
            <div className="order-2 lg:order-2 relative">
              <div className="relative aspect-square rounded-3xl overflow-hidden shadow-2xl bg-muted">
                <img
                  src="/story-bg.jpg"
                  alt="قصتنا"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (img.src.endsWith(FALLBACK_IMG)) return;
                    img.src = FALLBACK_IMG;
                  }}
                />
              </div>

              {/* كرت +15 */}
              <div className="absolute -bottom-10 -left-10 bg-white/95 p-8 rounded-2xl shadow-xl max-w-xs hidden md:block border border-border">
                <div className="flex items-center gap-4 mb-4">
                  <div className="h-12 w-12 rounded-full bg-accent/20 flex items-center justify-center text-accent">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                      <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-primary">+15</p>
                    <p className="text-xs text-muted-foreground">عاماً من الخبرة</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  سجل حافل بالنجاحات في تطوير وإدارة المشاريع العقارية الفاخرة.
                </p>
              </div>
            </div>

            {/* النص يسار */}
            <div className="order-1 lg:order-1 space-y-8">
              <div className="space-y-4">
                <span className="text-accent font-bold tracking-wider text-sm uppercase">
                  من نحن
                </span>
                <h2 className="text-4xl md:text-5xl font-bold text-primary leading-tight">
                  قصتنا
                </h2>
                <p className="text-xl text-muted-foreground/80 font-light leading-relaxed">
                  بجذور راسخة وطموح لا يحده أفق، انطلقت مايدن لتكون منارة في عالم
                  الاستثمار العقاري.
                </p>
              </div>

              <div className="space-y-6 text-muted-foreground leading-relaxed">
                <p>
                  نحن نؤمن بأن العقار ليس مجرد بناء، بل هو مساحة للحياة والنمو.
                  رؤيتنا تتجاوز المألوف لنخلق بيئات سكنية وتجارية تلهم قاطنيها
                  وتوفر عوائد استثمارية مستدامة لشركائنا.
                </p>
                <p>
                  من خلال دمج التصميم العصري مع الأصالة، والابتكار مع الخبرة،
                  نسعى لبناء إرث يدوم للأجيال القادمة.
                </p>
              </div>

              <Button
                variant="outline"
                className="border-primary text-primary hover:bg-primary hover:text-primary-foreground px-8 py-6 rounded-xl text-lg mt-4"
              >
                المزيد عنا
              </Button>
            </div>
          </div>
        </section>

        {/* =========================
            PROJECTS (موزاييك)
        ========================== */}
        <section className="py-24  relative overflow-hidden">
          <div className="container">
            <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
              <div className="space-y-4">
                <h2 className="text-4xl font-bold text-primary">مشاريعنا</h2>
                <div className="h-1 w-24 bg-accent rounded-full" />
              </div>

              <div className="max-w-md text-muted-foreground">
                <p>
                  نقدم مجموعة مختارة من المشاريع العقارية الرائدة التي تعيد تعريف
                  مفهوم الفخامة والاستدامة في المنطقة.
                </p>
              </div>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="rounded-[28px] bg-primary/5 h-[420px] animate-pulse" />
                <div className="rounded-[28px] bg-primary/5 h-[420px] animate-pulse" />
                <div className="grid gap-8">
                  <div className="rounded-[28px] bg-primary/5 h-[200px] animate-pulse" />
                  <div className="rounded-[28px] bg-primary/5 h-[200px] animate-pulse" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {card(p0, "big")}
                {card(p1, "big")}
                <div className="grid gap-8">
                  {card(p2, "small")}
                  {card(p3, "small")}
                </div>
              </div>
            )}

            <div className="mt-16 flex justify-center">
              <Link href="/projects">
                <Button className="rsg-cta rsg-cta--navy">
                  عرض جميع المشاريع
                  <ArrowRight className="mr-2 w-5 h-5" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
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
