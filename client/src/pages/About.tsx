// client/src/pages/About.tsx
import { useEffect, useMemo, useRef, useState } from "react";
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
  projects: string; // e.g. "50+"
  investors: string; // e.g. "500+"
  annualReturn: string; // e.g. "15%"
  totalInvestment: string; // e.g. "2B+"
};

type ParsedStat = {
  value: number;
  suffix: string; // "+", "%", "B+"
};

function parseStat(input: string): ParsedStat {
  const s = String(input ?? "").trim();
  const m = s.match(/(\d+(?:\.\d+)?)/);
  const num = m ? Number(m[1]) : 0;
  const suffix = m ? s.slice((m.index ?? 0) + m[0].length).trim() : "";
  return { value: Number.isFinite(num) ? num : 0, suffix };
}

function formatCount(value: number, decimals = 0) {
  if (!Number.isFinite(value)) return "0";
  const fixed = value.toFixed(decimals);
  return decimals > 0 ? fixed.replace(/\.0+$/, "") : fixed;
}

function useCountUp(
  target: number,
  start: boolean,
  options?: { durationMs?: number; decimals?: number }
) {
  const durationMs = options?.durationMs ?? 1100;
  const decimals = options?.decimals ?? 0;

  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    if (!start) return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startRef.current = null;
    fromRef.current = 0;
    setCurrent(0);

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (ts: number) => {
      if (startRef.current == null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeOutCubic(t);

      const val = fromRef.current + (target - fromRef.current) * eased;
      setCurrent(val);

      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [start, target, durationMs]);

  return formatCount(current, decimals);
}

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
          const data = snap.data() as any;
          if (data?.stats) setStatsData((prev) => ({ ...prev, ...data.stats }));
        }
      } catch {
        // fallback silently
      }
    };
    load();
  }, []);

  // ---------- Stats parsing ----------
  const parsed = useMemo(() => {
    const p = parseStat(statsData.projects);
    const i = parseStat(statsData.investors);
    const a = parseStat(statsData.annualReturn);
    const t = parseStat(statsData.totalInvestment);
    return { p, i, a, t };
  }, [statsData]);

  // ---------- Start animation when stats section is visible ----------
  const statsRef = useRef<HTMLElement | null>(null);
  const [statsInView, setStatsInView] = useState(false);

  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e?.isIntersecting) {
          setStatsInView(true);
          io.disconnect(); // run once
        }
      },
      { threshold: 0.35 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Count ups (B option: animate all including 2B+)
  const projectsCount = useCountUp(parsed.p.value, statsInView, {
    durationMs: 1100,
    decimals: parsed.p.value % 1 === 0 ? 0 : 1,
  });

  const investorsCount = useCountUp(parsed.i.value, statsInView, {
    durationMs: 1200,
    decimals: parsed.i.value % 1 === 0 ? 0 : 1,
  });

  const annualReturnCount = useCountUp(parsed.a.value, statsInView, {
    durationMs: 1000,
    decimals: parsed.a.value % 1 === 0 ? 0 : 1,
  });

  const totalInvestmentCount = useCountUp(parsed.t.value, statsInView, {
    durationMs: 1300,
    decimals: parsed.t.value % 1 === 0 ? 0 : 1,
  });

  const stats = useMemo(
    () => [
      {
        icon: Building2,
        label: "مشروع",
        animated: projectsCount,
        suffix: parsed.p.suffix,
      },
      {
        icon: Users,
        label: "مستثمر",
        animated: investorsCount,
        suffix: parsed.i.suffix,
      },
      {
        icon: TrendingUp,
        label: "عائد سنوي",
        animated: annualReturnCount,
        suffix: parsed.a.suffix,
      },
      {
        icon: Shield,
        label: "ريال استثمارات",
        animated: totalInvestmentCount,
        suffix: parsed.t.suffix,
      },
    ],
    [
      projectsCount,
      investorsCount,
      annualReturnCount,
      totalInvestmentCount,
      parsed.p.suffix,
      parsed.i.suffix,
      parsed.a.suffix,
      parsed.t.suffix,
    ]
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
    <div
      className="rsg-page min-h-screen flex flex-col bg-background text-foreground"
      dir="rtl"
      lang="ar"
    >
      <Header />

      <main className="flex-1 ">
        {/* =========================
            HERO (Dark)
        ========================== */}
        <section className="relative overflow-hidden bg-primary">
          <div className="relative min-h-screen w-full">
            <img
              src="/about-poto1.jpg"
              alt="عن معدن"
              className="h-full w-full object-cover object-center opacity-95"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/35 to-black/70" />
            <div className="absolute inset-0">
              <div className="container h-full flex items-center justify-center">
                <div className="w-full max-w-3xl text-center text-white pt-10">

                  <h1 className="mt-4 text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.1]">
                    عن <span style={{ color: "var(--gold)" }}>معدن</span>
                  </h1>

                  <div className="mx-auto mt-4 h-[2px] w-16 rounded-full bg-white/60" />

                  <p className="mt-5 sm:mt-6 text-base sm:text-lg text-white/85 leading-relaxed">
                    منصة رائدة في الاستثمار العقاري المتوافق مع الشريعة الإسلامية، بتجربة
                    هادئة وفخمة.
                  </p>

                  <div className="mt-8 flex items-center justify-center gap-3 sm:gap-4">
                    <a
                      href="#faq"
                      className="inline-flex items-center justify-center rounded-full border border-white/30 px-6 py-3 text-sm font-medium text-white hover:bg-white/10 transition"
                    >
                      اقرأ المزيد
                    </a>
                    <a
                      href="/projects"
                      className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-medium text-[#0a1426] hover:opacity-95 transition"
                    >
                      تصفح المشاريع
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </section>

        {/* =========================
            STORY (Light)
        ========================== */}
        <section className="section-light py-20">
          <div className="container">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
              <div className="lg:col-span-5">
                <p className="text-center text-base sm:text-lg md:text-4xl font-semibold text-muted-foreground tracking-wider">
                  قصتنا
                </p>


                <h2 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-bold leading-tight text-foreground">
                  استثمارٌ عقاريٌ
                  <span className="text-primary"> برؤية واضحة</span>
                </h2>
              </div>

              <div className="lg:col-span-7">
                <div className="rsg-card p-6 sm:p-8">
                  <div className="text-muted-foreground leading-relaxed space-y-5 text-[15px] sm:text-base">
                    <p>
                      تأسست <b className="text-foreground">معدن</b> بهدف توفير فرص
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
                        className="inline-flex items-center justify-center rounded-full border border-primary/35 px-6 py-3 text-sm font-medium text-foreground hover:bg-primary/10 transition"
                      >
                        تواصل معنا
                      </a>
                    </div>
                  </div>
                </div>

                <div className="mt-8 h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />
              </div>
            </div>
          </div>
        </section>

        {/* =========================
            STATS (Dark + CountUp)
        ========================== */}
        <section ref={statsRef as any} className="section-dark py-20">
          <div className="container">
            <h2 className="mb-4 text-3xl sm:text-4xl md:text-5xl font-bold text-center">
              إنجازاتنا
            </h2>

            <div className="mx-auto mb-10 h-[2px] w-20 rounded-full bg-white/25" />

            <div className="rounded-[28px] border border-white/10 bg-white/5 backdrop-blur p-6 sm:p-10">

              <div className="text-center max-w-2xl mx-auto">

                <p className="mt-4 text-sm sm:text-base text-white/75 leading-relaxed">
                  مؤشرات مختصرة تعكس نمو المنصة، مع الحفاظ على المعايير والحوكمة.
                </p>
              </div>

              <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-5 sm:gap-6">
                {stats.map((stat, i) => {
                  const Icon = stat.icon;
                  return (
                    <div
                      key={i}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 sm:px-5 py-6 text-center hover:bg-white/10 transition"
                    >
                      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
                        <Icon className="h-6 w-6 text-white" />
                      </div>

                      <div
                        className="text-2xl sm:text-3xl font-extrabold tabular-nums"
                        style={{ color: "var(--gold)" }}
                      >
                        {stat.animated}
                        {stat.suffix}
                      </div>

                      <div className="mt-1 text-sm text-white/70">
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
            VALUES (Light)
        ========================== */}
        <section className="section-light py-20">
          <div className="container">
            <div className="flex flex-col items-center text-center">

              <h2 className="mt-3 text-2xl sm:text-3xl md:text-4xl font-bold text-foreground">
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
                  <h3 className="text-lg sm:text-xl font-bold text-foreground mb-2">
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
            FAQ (Dark) + (paired with Vision -> same color family)
        ========================== */}
        <section id="faq" className="section-dark py-20">
          <div className="container">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
              <div className="lg:col-span-5">
                <p className="text-xs sm:text-sm text-white/70 tracking-wide">
                  الأسئلة الشائعة
                </p>
                <h2 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
                  كل شيء
                  <span style={{ color: "var(--gold)" }}> واضح</span>
                </h2>
                <p className="mt-4 text-sm sm:text-base text-white/75 leading-relaxed">
                  جمعنا أهم الأسئلة المتكررة بشكل أنيق وسهل القراءة، مع تفاعل هادئ.
                </p>
              </div>

              <div className="lg:col-span-7">
                <div className="rounded-[28px] border border-white/10 bg-white/5 backdrop-blur p-4 sm:p-6">
                  <Accordion type="single" collapsible className="w-full">
                    {faqs.map((f, idx) => (
                      <AccordionItem key={idx} value={`faq-${idx}`} className="border-white/10">
                        <AccordionTrigger className="text-white">
                          {f.q}
                        </AccordionTrigger>
                        <AccordionContent className="text-white/75 leading-relaxed">
                          {f.a}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>

                <div className="mt-8 flex items-center gap-3">
                  <a
                    href="/contact"
                    className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-medium text-[#0a1426] hover:opacity-95 transition"
                  >
                    اسألنا مباشرة
                  </a>
                  <a
                    href="/projects"
                    className="inline-flex items-center justify-center rounded-full border border-white/25 px-6 py-3 text-sm font-medium text-white hover:bg-white/10 transition"
                  >
                    شاهد المشاريع
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================
    VISION (Light)
========================== */}
        <section className="section-light py-20">
          <div className="container">
            <div className="mx-auto max-w-4xl text-center">
              {/* عنوان السكشن */}
              <p className="mb-6 text-3xl sm:text-4xl md:text-5xl font-bold text-foreground">
                رؤيتنا
              </p>

              {/* خط فاصل بسيط */}
              <div className="mx-auto mb-8 h-[2px] w-20 rounded-full bg-border" />

              {/* العنوان الرئيسي */}
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight text-foreground">
                نعيد تعريف تجربة الاستثمار
                <span style={{ color: "var(--gold)" }}> بثقة</span>
              </h2>

              {/* الوصف */}
              <p className="mt-6 text-base sm:text-lg text-muted-foreground leading-relaxed">
                أن نكون المنصة الأولى للاستثمار العقاري في المنطقة، ونساهم في تحقيق
                رؤية المملكة 2030 عبر فرص استثمارية مبتكرة ومستدامة وتجربة رقمية فاخرة.
              </p>

              {/* الأزرار */}
              <div className="mt-9 flex items-center justify-center gap-3 sm:gap-4">
                <a
                  href="/projects"
                  className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-medium text-white hover:opacity-95 transition"
                >
                  ابدأ الآن
                </a>
                <a
                  href="/contact"
                  className="inline-flex items-center justify-center rounded-full border border-primary/30 px-6 py-3 text-sm font-medium text-foreground hover:bg-primary/5 transition"
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
