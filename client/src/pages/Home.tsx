import { useEffect, useState } from "react";
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
  title: string;
  location: string;
  category: string; // عربي
  image: string;
};

const FALLBACK_IMG = "/HOOM-HERO.png";

// ✅ نفس مسميات Projects.tsx
const TYPE_LABELS: Record<string, string> = {
  sukuk: "استثمار بالصكوك",
  land_development: "تطوير أراضي",
  vip_exclusive: "VIP حصري",
};

// ✅ helper: يجعل صور public تشتغل لو كتبت اسم الملف فقط
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

  /* =========================
     Load published projects
  ========================= */
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

        const list: HomeProject[] = snap.docs.map((d) => {
          const data = d.data() as any;

          // ✅ مهم: أحيانًا الحقل يكون projectType أو category
          const typeKey = String(data.projectType || data.category || "").trim();
          const category = TYPE_LABELS[typeKey] || typeKey || "مشروع";

          // ✅ مهم: أحيانًا الغلاف يكون coverImage أو image أو مجرد اسم ملف
          const rawImg = String(data.coverImage || data.image || "").trim();
          const image = rawImg ? normalizePublicImage(rawImg) : FALLBACK_IMG;

          return {
            id: d.id,
            title: String(data.titleAr || data.titleEn || data.title || "مشروع بدون عنوان"),
            location: String(
              data.locationAr ||
                data.locationEn ||
                data.location ||
                "المملكة العربية السعودية"
            ),
            category,
            image,
          };
        });

        console.log("HOME projects loaded:", list.length, list);
        setProjects(list);
      } catch (err) {
        console.error("Failed to load home projects:", err);
        setProjects([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadProjects();
  }, []);

  // نعرض 4 فقط للموزاييك
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

    return (
      <div className={`group relative overflow-hidden rounded-[28px] ${aspect}`}>
        <img
          src={p.image}
          alt={p.title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          loading="lazy"
          onError={(e) => {
            const img = e.currentTarget;
            if (img.src.includes(FALLBACK_IMG)) return;
            img.src = FALLBACK_IMG;
          }}
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

        <div className="absolute bottom-0 right-0 p-6 md:p-7 w-full text-white">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-accent/90 text-accent-foreground backdrop-blur-sm">
            {p.category}
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
      </div>
    );
  };

  return (
    <div
      className="rsg-page min-h-screen flex flex-col text-foreground overflow-x-hidden"
      dir="rtl"
      lang="ar"
    >
      <Header />

      <main className="flex-grow">
        {/* =========================
            HERO
        ========================== */}
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

              <button
                type="button"
                onClick={() => setIsVideoOpen(true)}
                className="group inline-flex items-center gap-3 px-8 py-4 rounded-full border border-white/40 bg-white/10 backdrop-blur-md text-white text-lg hover:bg-white hover:text-black transition"
              >
                <span>شاهد الفيديو</span>
                <Play className="w-5 h-5" />
              </button>
            </div>
          </div>
        </section>

        {/* =========================
            PROJECTS
        ========================== */}
        <section className="py-24">
          <div className="container">
            <h2 className="text-4xl font-bold text-primary mb-12">مشاريعنا</h2>

            {isLoading ? (
              <div className="text-center text-muted-foreground py-20">
                جاري تحميل المشاريع...
              </div>
            ) : projects.length ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {card(p0, "big")}
                {card(p1, "big")}
                <div className="grid gap-8">
                  {card(p2, "small")}
                  {card(p3, "small")}
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-20">
                لا توجد مشاريع منشورة حالياً.
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
