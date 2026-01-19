import { useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  Building2,
  Users,
  TrendingUp,
  Shield,
  ScanSearch,
  ShieldCheck,
  Award,
  Banknote,
} from "lucide-react";
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

type ParsedStat = {
  value: number;
  suffix: string;
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

  useEffect(() => {
    if (!start) return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startRef.current = null;
    setCurrent(0);

    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (ts: number) => {
      if (startRef.current == null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / durationMs);
      setCurrent(target * easeOut(t));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
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

  /* Load Firestore */
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "app", "about", "main"));
        if (snap.exists() && snap.data()?.stats) {
          setStatsData((p) => ({ ...p, ...snap.data()!.stats }));
        }
      } catch {}
    })();
  }, []);

  const parsed = useMemo(() => {
    return {
      p: parseStat(statsData.projects),
      i: parseStat(statsData.investors),
      a: parseStat(statsData.annualReturn),
      t: parseStat(statsData.totalInvestment),
    };
  }, [statsData]);

  const statsRef = useRef<HTMLElement | null>(null);
  const [statsInView, setStatsInView] = useState(false);

  useEffect(() => {
    if (!statsRef.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setStatsInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(statsRef.current);
    return () => io.disconnect();
  }, []);

  const projectsCount = useCountUp(parsed.p.value, statsInView);
  const investorsCount = useCountUp(parsed.i.value, statsInView);
  const annualReturnCount = useCountUp(parsed.a.value, statsInView);
  const totalInvestmentCount = useCountUp(parsed.t.value, statsInView);

  const stats = [
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
  ];

  const values = [
    {
      title: "الشفافية",
      description: "نوفر معلومات واضحة ودقيقة عن جميع المشاريع والعوائد المتوقعة.",
      icon: ScanSearch,
    },
    {
      title: "الأمان",
      description: "استثمارات متوافقة مع الشريعة ومدروسة بعناية فائقة.",
      icon: ShieldCheck,
    },
    {
      title: "الاحترافية",
      description: "فريق متخصص بخبرات في الاستثمار والتطوير العقاري.",
      icon: Award,
    },
    {
      title: "العوائد المجزية",
      description: "نركز على فرص تحقق عوائد مستدامة.",
      icon: Banknote,
    },
  ];

  const faqs = [
    { q: "وش هي منصة معدن؟", a: "منصة استثمار عقاري متوافق مع الشريعة." },
    { q: "كيف تختارون المشاريع؟", a: "نقيمها من حيث المخاطر والعائد والتنفيذ." },
    { q: "هل تدعم العربية و RTL؟", a: "نعم، التصميم عربي Mobile-first." },
    { q: "كيف التفاعل؟", a: "تفاعل هادئ وفخم بدون إزعاج." },
  ];

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <Header />

      <main className="flex-1">
        {/* HERO */}
        <section className="relative h-[100svh] pt-[96px] overflow-hidden bg-black">
          <img
            src="/about-poto1.jpg"
            alt="عن معدن"
            className="absolute inset-0 w-full h-full object-cover opacity-95"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/45 to-black/80" />
          <div className="relative z-10 h-full flex items-center justify-center text-center text-white px-4">
            <div className="max-w-3xl">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold">
                عن <span style={{ color: "var(--gold)" }}>معدن</span>
              </h1>
              <div className="mx-auto mt-4 h-[2px] w-16 bg-white/60" />
              <p className="mt-6 text-base sm:text-lg text-white/85">
                منصة رائدة في الاستثمار العقاري المتوافق مع الشريعة الإسلامية.
              </p>
            </div>
          </div>
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

                <h2 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-bold leading-tight text-foreground text-center lg:text-right">
                  استثمارٌ عقاريٌ
                  <span className="text-primary"> برؤية واضحة</span>
                </h2>
              </div>

              <div className="lg:col-span-7">
                <div className="rsg-card p-6 sm:p-8">
                  <div className="text-muted-foreground leading-relaxed space-y-5 text-[15px] sm:text-base text-center lg:text-right">
                    <p>
                      تأسست <b className="text-foreground">معدن</b> بهدف توفير فرص
                      استثمارية عقارية متميزة للمستثمرين في المملكة العربية السعودية
                      ودول الخليج، مع التركيز على الاستثمارات المتوافقة مع الشريعة الإسلامية.
                    </p>
                    <p>
                      يعمل فريقنا على دراسة المشاريع بعناية فائقة لضمان الشفافية وتحقيق
                      عوائد مجزية ومستدامة، مع تجربة استخدام هادئة ومريحة للمستثمر.
                    </p>

                    <div className="pt-2 flex justify-center lg:justify-start">
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
        <section ref={statsRef as any} className="section-dark-soft py-20">
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

                      <div className="mt-1 text-sm text-white/70">{stat.label}</div>
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
              {values.map((v, i) => {
                const VIcon = v.icon;
                return (
                  <div
                    key={i}
                    className="group rounded-3xl border bg-card/80 backdrop-blur px-5 sm:px-6 py-7 hover:bg-card transition text-center"
                  >
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background/60">
                      <VIcon className="h-6 w-6 text-primary" />
                    </div>

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
                );
              })}
            </div>
          </div>
        </section>

        {/* =========================
            FAQ (Dark) + (paired with Vision -> same color family)
        ========================== */}
        <section id="faq" className="section-dark py-20">
          <div className="container">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
              <div className="lg:col-span-5 text-center lg:text-right">
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
                      <AccordionItem
                        key={idx}
                        value={`faq-${idx}`}
                        // @ts-ignore
                        className="border-white/10"
                      >
                        <AccordionTrigger className="text-white text-right">
                          {f.q}
                        </AccordionTrigger>
                        <AccordionContent className="text-white/75 leading-relaxed text-right">
                          {f.a}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>

                <div className="mt-8 flex items-center justify-center lg:justify-start gap-3">
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
