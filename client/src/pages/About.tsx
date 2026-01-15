// client/src/pages/About.tsx
import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Building2, Users, TrendingUp, Shield } from "lucide-react";
import { db } from "@/_core/firebase";
import { doc, getDoc } from "firebase/firestore";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/* =========================
   Types
========================= */
type AboutStats = {
  projects: string;
  investors: string;
  annualReturn: string;
  totalInvestment: string;
};

export default function About() {
  const [statsData, setStatsData] = useState<AboutStats>({
    projects: "50+",
    investors: "500+",
    annualReturn: "15%",
    totalInvestment: "2B+",
  });

  /* =========================
     Load Firestore (optional)
  ========================= */
  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "app", "about", "main"));
        if (snap.exists()) {
          setStatsData((prev) => ({ ...prev, ...snap.data().stats }));
        }
      } catch {
        // fallback silently
      }
    };
    load();
  }, []);

  const stats = useMemo(
    () => [
      { icon: Building2, label: "مشروع", value: statsData.projects },
      { icon: Users, label: "مستثمر", value: statsData.investors },
      { icon: TrendingUp, label: "عائد سنوي", value: statsData.annualReturn },
      { icon: Shield, label: "ريال استثمارات", value: statsData.totalInvestment },
    ],
    [statsData]
  );

  const values = useMemo(
    () => [
      {
        title: "الشفافية",
        description: "نوفر معلومات واضحة ودقيقة عن جميع المشاريع والعوائد المتوقعة.",
        icon: "🔍",
      },
      {
        title: "الأمان",
        description: "استثمارات متوافقة مع الشريعة ومدروسة بعناية فائقة.",
        icon: "🛡️",
      },
      {
        title: "الاحترافية",
        description: "فريق متخصص بخبرات في الاستثمار والتطوير العقاري.",
        icon: "⭐",
      },
      {
        title: "العوائد المجزية",
        description: "نركز على فرص تحقق عوائد مستدامة على المدى المتوسط والطويل.",
        icon: "💰",
      },
    ],
    []
  );

  const faqs = useMemo(
    () => [
      {
        q: "وش هي منصة معدن (MAEDIN)؟",
        a: "منصة للاستثمار العقاري المتوافق مع الشريعة، نعرض فرصًا مدروسة بمعلومات واضحة، ونمكّن المستثمر من متابعة فرصه واستثماراته بشكل منظم.",
      },
      {
        q: "كيف تختارون المشاريع؟",
        a: "نقيم المشروع من عدة جوانب: الموقع، المخاطر، الجدوى، خطة التنفيذ، والسيناريوهات المتوقعة للعائد، ثم نعتمد ما يحقق توازنًا بين الأمان والعائد.",
      },
      {
        q: "هل المنصة تدعم RTL واللغة العربية بالكامل؟",
        a: "نعم. التصميم مبني ليكون Mobile-first وRTL-friendly، مع اهتمام بالخطوط والمسافات ومحاذاة النصوص والتفاعل.",
      },
      {
        q: "كيف يكون التفاعل (Hover/Focus)؟",
        a: "تفاعل هادئ وفخم: انتقالات قصيرة، بدون مبالغة، مع إبراز واضح في حالة التركيز (Focus) لأغراض الوصولية.",
      },
    ],
    []
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      {/* محتوى الصفحة */}
      <main className="flex-1 pt-20">
        {/* =========================
            Hero (RSG-like)
        ========================= */}
        <section className="relative overflow-hidden">
          {/* خلفية هادئة + لمسة زخرفة خفيفة */}
          <div className="absolute inset-0 bg-gradient-to-b from-muted/40 via-background to-background" />
          <div className="absolute -top-24 -right-24 h-[420px] w-[420px] rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 h-[420px] w-[420px] rounded-full bg-secondary/10 blur-3xl" />

          <div className="relative">
            <div className="container">
              <div className="mx-auto max-w-4xl text-center py-16 sm:py-20 md:py-24">
                <p className="text-sm sm:text-base text-muted-foreground tracking-wide">
                  منصة الاستثمار العقاري
                </p>

                <h1 className="mt-4 text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.1] text-secondary">
                  عن <span className="text-primary">معدن</span>
                </h1>

                <p className="mt-5 sm:mt-6 text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed">
                  منصة رائدة في الاستثمار العقاري المتوافق مع الشريعة الإسلامية، بتجربة
                  هادئة وفخمة مستوحاة من أفضل المواقع المؤسسية.
                </p>

                <div className="mt-8 flex items-center justify-center gap-3 sm:gap-4">
                  <a
                    href="#faq"
                    className="inline-flex items-center justify-center rounded-full border border-primary/35 px-6 py-3 text-sm font-medium text-secondary hover:bg-primary/10 transition"
                  >
                    اقرأ المزيد
                  </a>
                  <a
                    href="/projects"
                    className="inline-flex items-center justify-center rounded-full bg-secondary px-6 py-3 text-sm font-medium text-white hover:opacity-95 transition"
                  >
                    تصفح المشاريع
                  </a>
                </div>
              </div>
            </div>

            {/* فاصل سفلي ناعم */}
            <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>
        </section>

        {/* =========================
            Story (Museum-like spacing)
        ========================= */}
        <section className="py-14 sm:py-16 md:py-20">
          <div className="container">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
              {/* عنوان كبير يمين (RTL-friendly) */}
              <div className="lg:col-span-5">
                <p className="text-xs sm:text-sm text-muted-foreground tracking-wide">
                  قصتنا
                </p>
                <h2 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-bold text-secondary leading-tight">
                  استثمارٌ عقاريٌ
                  <span className="text-primary"> برؤية واضحة</span>
                </h2>
              </div>

              {/* نص طويل مرتب */}
              <div className="lg:col-span-7">
                <div className="rounded-3xl border bg-card/70 backdrop-blur px-5 sm:px-7 py-6 sm:py-8">
                  <div className="text-muted-foreground leading-relaxed space-y-5 text-[15px] sm:text-base">
                    <p>
                      تأسست <b className="text-secondary">معدن</b> بهدف توفير فرص
                      استثمارية عقارية متميزة للمستثمرين في المملكة العربية السعودية
                      ودول الخليج، مع التركيز على الاستثمارات المتوافقة مع الشريعة الإسلامية.
                    </p>
                    <p>
                      يعمل فريقنا على دراسة المشاريع بعناية فائقة لضمان الشفافية وتحقيق
                      عوائد مجزية ومستدامة، مع تجربة استخدام هادئة ومريحة للمستثمر.
                    </p>

                    <div className="pt-2">
                      <a
                        href="/contact"
                        className="inline-flex items-center justify-center rounded-full border border-primary/35 px-6 py-3 text-sm font-medium text-secondary hover:bg-primary/10 transition"
                      >
                        تواصل معنا
                      </a>
                    </div>
                  </div>
                </div>

                {/* سطر زخرفة خفيف مثل RSG */}
                <div className="mt-8 h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />
              </div>
            </div>
          </div>
        </section>

        {/* =========================
            Stats (Soft beige panel)
        ========================= */}
        <section className="py-14 sm:py-16 md:py-20">
          <div className="container">
            <div className="rounded-[28px] border bg-muted/35 px-5 sm:px-8 py-10 sm:py-12">
              <div className="text-center max-w-2xl mx-auto">
                <p className="text-xs sm:text-sm text-muted-foreground tracking-wide">
                  بالأرقام
                </p>
                <h2 className="mt-3 text-2xl sm:text-3xl md:text-4xl font-bold text-secondary">
                  إنجازاتنا بالأرقام
                </h2>
                <p className="mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
                  مؤشرات مختصرة تعكس نمو المنصة، مع الحفاظ على المعايير والحوكمة.
                </p>
              </div>

              <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
                {stats.map((stat, i) => {
                  const Icon = stat.icon;
                  return (
                    <div
                      key={i}
                      className="rounded-2xl bg-background/70 border px-4 sm:px-5 py-6 text-center hover:bg-background transition"
                    >
                      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>

                      <div className="text-2xl sm:text-3xl font-bold text-secondary">
                        {stat.value}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {stat.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* =========================
            Values (Cards like RSG blocks)
        ========================= */}
        <section className="py-14 sm:py-16 md:py-20">
          <div className="container">
            <div className="flex flex-col items-center text-center">
              <p className="text-xs sm:text-sm text-muted-foreground tracking-wide">
                ما الذي نؤمن به
              </p>
              <h2 className="mt-3 text-2xl sm:text-3xl md:text-4xl font-bold text-secondary">
                قيمنا الأساسية
              </h2>
              <p className="mt-4 max-w-2xl text-sm sm:text-base text-muted-foreground leading-relaxed">
                مبادئ واضحة تقود قراراتنا وتُشكّل تجربة المستخدم وجودة الفرص الاستثمارية.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
              {values.map((v, i) => (
                <div
                  key={i}
                  className="group rounded-3xl border bg-card/80 backdrop-blur px-5 sm:px-6 py-7 hover:bg-card transition"
                >
                  <div className="text-4xl mb-4">{v.icon}</div>
                  <h3 className="text-lg sm:text-xl font-bold text-secondary mb-2">
                    {v.title}
                  </h3>
                  <p className="text-sm sm:text-[15px] text-muted-foreground leading-relaxed">
                    {v.description}
                  </p>

                  <div className="mt-6 h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />
                  <div className="mt-4 text-xs text-muted-foreground">
                    اكتشف المزيد داخل الأسئلة الشائعة
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* =========================
            FAQ (Accordion integrated)
        ========================= */}
        <section id="faq" className="py-14 sm:py-16 md:py-20">
          <div className="container">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
              <div className="lg:col-span-5">
                <p className="text-xs sm:text-sm text-muted-foreground tracking-wide">
                  الأسئلة الشائعة
                </p>
                <h2 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-bold text-secondary leading-tight">
                  كل شيء
                  <span className="text-primary"> واضح</span>
                </h2>
                <p className="mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
                  جمعنا أهم الأسئلة المتكررة بشكل أنيق وسهل القراءة، مع تفاعل هادئ.
                </p>
              </div>

              <div className="lg:col-span-7">
                <div className="rounded-[28px] border bg-card/70 backdrop-blur px-4 sm:px-6 py-4 sm:py-6">
                  <Accordion type="single" collapsible className="w-full">
                    {faqs.map((f, idx) => (
                      <AccordionItem key={idx} value={`faq-${idx}`}>
                        <AccordionTrigger className="text-secondary">
                          {f.q}
                        </AccordionTrigger>
                        <AccordionContent className="text-muted-foreground leading-relaxed">
                          {f.a}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>

                <div className="mt-8 flex items-center gap-3">
                  <a
                    href="/contact"
                    className="inline-flex items-center justify-center rounded-full bg-secondary px-6 py-3 text-sm font-medium text-white hover:opacity-95 transition"
                  >
                    اسألنا مباشرة
                  </a>
                  <a
                    href="/projects"
                    className="inline-flex items-center justify-center rounded-full border border-primary/35 px-6 py-3 text-sm font-medium text-secondary hover:bg-primary/10 transition"
                  >
                    شاهد المشاريع
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================
            Vision (Elegant dark block)
        ========================= */}
        <section className="py-16 sm:py-20 md:py-24 bg-secondary text-white">
          <div className="container">
            <div className="mx-auto max-w-4xl text-center">
              <p className="text-xs sm:text-sm text-white/70 tracking-wide">
                رؤيتنا
              </p>
              <h2 className="mt-4 text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
                نعيد تعريف تجربة الاستثمار
                <span className="text-primary"> بثقة</span>
              </h2>
              <p className="mt-6 text-base sm:text-lg text-white/80 leading-relaxed">
                أن نكون المنصة الأولى للاستثمار العقاري في المنطقة، ونساهم في تحقيق
                رؤية المملكة 2030 عبر فرص استثمارية مبتكرة ومستدامة وتجربة رقمية فاخرة.
              </p>

              <div className="mt-9 flex items-center justify-center gap-3 sm:gap-4">
                <a
                  href="/projects"
                  className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-medium text-secondary hover:opacity-95 transition"
                >
                  ابدأ الآن
                </a>
                <a
                  href="/contact"
                  className="inline-flex items-center justify-center rounded-full border border-white/25 px-6 py-3 text-sm font-medium text-white hover:bg-white/10 transition"
                >
                  تواصل معنا
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
