import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import NextStepSliderBanner from "@/components/NextStepSliderBanner";
import {
  ArrowRight,
  Award,
  Building2,
  CheckCircle2,
  Landmark,
  ScanSearch,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/_core/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useSiteContent } from "@/contexts/SiteContentContext";
import {
  getSitePageMediaUrl,
} from "@/lib/siteContent";

type AboutStats = {
  projects: string;
  investors: string;
  annualReturn: string;
  totalInvestment: string;
};

type ParsedStat = {
  value: number;
  suffix: string;
  decimals: number;
};

type FeatureBlock = {
  title: string;
  description: string;
  icon: LucideIcon;
};

type FrameworkBlock = {
  eyebrow: string;
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

const HERO_POINTS = [
  "فرص مدروسة بعناية",
  "حوكمة واضحة للمعلومات",
  "متابعة تشغيلية أكثر اتساقًا",
];

const PLATFORM_STRENGTHS: FeatureBlock[] = [
  {
    title: "فحص دقيق للفرص",
    description:
      "نقيّم كل فرصة استثمارية ضمن معايير واضحة توازن بين الجاذبية الاستثمارية والانضباط المهني.",
    icon: ScanSearch,
  },
  {
    title: "وضوح في العرض",
    description:
      "نعرض البيانات الأساسية والمالية والتشغيلية بصيغة منظمة تساعد على القراءة السريعة واتخاذ القرار.",
    icon: ShieldCheck,
  },
  {
    title: "تنفيذ ومتابعة",
    description:
      "لا يتوقف دورنا عند عرض الفرصة، بل يمتد إلى المتابعة المستمرة وبناء صورة أوضح لمسار الاستثمار.",
    icon: Award,
  },
];

const COMPANY_FRAMEWORK: FrameworkBlock[] = [
  {
    eyebrow: "الرؤية",
    title: "حضور مؤسسي يبني الثقة",
    description:
      "أن تكون «معدن» مرجعًا أوضح للفرص العقارية، بمنهج يعزز الثقة ويختصر الطريق إلى القرار.",
    icon: Landmark,
  },
  {
    eyebrow: "الرسالة",
    title: "تجربة استثمارية أكثر وضوحًا",
    description:
      "تقديم فرص عقارية مدروسة ضمن تجربة رقمية متسقة، تنظّم المعلومات وتدعم قراءة المشروع من جميع جوانبه.",
    icon: Building2,
  },
  {
    eyebrow: "المنهج",
    title: "اختيار وتحليل ثم متابعة",
    description:
      "نعتمد تسلسلًا واضحًا يبدأ بدراسة الفرصة، ثم بناء عرض منظم لها، ثم متابعة مستمرة لما بعد الإطلاق.",
    icon: TrendingUp,
  },
];

function parseStat(input: string): ParsedStat {
  const value = String(input ?? "").trim();
  const match = value.match(/(\d+(?:\.\d+)?)/);
  const numericPart = match?.[1] ?? "0";
  const decimals = numericPart.includes(".")
    ? numericPart.split(".")[1]?.length ?? 0
    : 0;

  return {
    value: Number.isFinite(Number(numericPart)) ? Number(numericPart) : 0,
    suffix: match
      ? value.slice((match.index ?? 0) + match[0].length).trim()
      : "",
    decimals,
  };
}

function formatCount(value: number, decimals = 0) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
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

    const easeOut = (progress: number) => 1 - Math.pow(1 - progress, 3);

    const tick = (timestamp: number) => {
      if (startRef.current == null) startRef.current = timestamp;

      const elapsed = timestamp - startRef.current;
      const progress = Math.min(1, elapsed / durationMs);
      setCurrent(target * easeOut(progress));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [durationMs, start, target]);

  return formatCount(current, decimals);
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

export default function About() {
  const { content } = useSiteContent();
  const [statsData, setStatsData] = useState<AboutStats>({
    projects: "15+",
    investors: "500+",
    annualReturn: "12%+",
    totalInvestment: "120M+",
  });

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "app", "about", "main"));
        if (snap.exists() && snap.data()?.stats) {
          setStatsData(current => ({ ...current, ...snap.data()!.stats }));
        }
      } catch {
        // Keep defaults if remote stats are unavailable.
      }
    })();
  }, []);

  const parsedStats = useMemo(
    () => ({
      projects: parseStat(statsData.projects),
      investors: parseStat(statsData.investors),
      annualReturn: parseStat(statsData.annualReturn),
      totalInvestment: parseStat(statsData.totalInvestment),
    }),
    [statsData]
  );

  const statsRef = useRef<HTMLElement | null>(null);
  const [statsInView, setStatsInView] = useState(false);

  useEffect(() => {
    if (!statsRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStatsInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(statsRef.current);

    return () => observer.disconnect();
  }, []);

  const stats = [
    {
      icon: Building2,
      label: "مشروع",
      animated: useCountUp(parsedStats.projects.value, statsInView, {
        decimals: parsedStats.projects.decimals,
      }),
      suffix: parsedStats.projects.suffix,
    },
    {
      icon: CheckCircle2,
      label: "مستثمر",
      animated: useCountUp(parsedStats.investors.value, statsInView, {
        decimals: parsedStats.investors.decimals,
      }),
      suffix: parsedStats.investors.suffix,
    },
    {
      icon: TrendingUp,
      label: "عائد سنوي",
      animated: useCountUp(parsedStats.annualReturn.value, statsInView, {
        decimals: parsedStats.annualReturn.decimals,
      }),
      suffix: parsedStats.annualReturn.suffix,
    },
    {
      icon: Landmark,
      label: "إجمالي الاستثمارات",
      animated: useCountUp(parsedStats.totalInvestment.value, statsInView, {
        decimals: parsedStats.totalInvestment.decimals,
      }),
      suffix: parsedStats.totalInvestment.suffix,
    },
  ];
  const aboutHeroImage = getSitePageMediaUrl(
    content,
    "about",
    "aboutHeroImage",
    "/about-poto1.jpg"
  );
  const aboutStoryImage = getSitePageMediaUrl(
    content,
    "about",
    "aboutStoryParallax",
    "/about-poto1.jpg"
  );

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[linear-gradient(180deg,#f5f6f8_0%,#ffffff_18%,#f8f8f9_100%)] text-foreground"
    >
      <main className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(circle_at_top,rgba(242,174,48,0.12),transparent_56%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-[-10rem] top-[30rem] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(11,23,38,0.06),transparent_68%)] blur-3xl"
        />

        <section className="relative min-h-[100svh] overflow-hidden">
          <div className="absolute inset-0">
            <img
              src={aboutHeroImage}
              alt="عن معدن"
              className="h-full w-full object-cover object-center"
              onError={event => {
                const image = event.currentTarget;
                if (image.src.endsWith("/about-poto1.jpg")) return;
                image.src = "/about-poto1.jpg";
              }}
            />
          </div>
          <div className="absolute inset-0 bg-[linear-gradient(112deg,rgba(6,14,24,0.92)_0%,rgba(8,17,28,0.84)_42%,rgba(9,20,33,0.64)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(242,174,48,0.18),transparent_34%)]" />

          <div className="container relative z-10 flex min-h-[100svh] items-center px-4 sm:px-6">
            <div className="mx-auto max-w-5xl text-center text-white">
              <h1 className="text-4xl font-bold leading-[1.35] tracking-tight sm:text-5xl lg:text-6xl lg:leading-[1.22]">
                شركة ومنصة استثمارية تنظّم القرار العقاري بوضوح أعلى
              </h1>

              <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-white/76 sm:text-xl">
                نعمل في «معدن» على تقديم فرص استثمارية عقارية مدروسة، تجمع بين
                وضوح العرض، الانضباط التشغيلي، والمتابعة المستمرة ضمن تجربة رقمية
                مؤسسية متسقة.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {HERO_POINTS.map(point => (
                  <div
                    key={point}
                    className="rounded-[22px] border border-white/12 bg-white/8 px-4 py-4 text-sm font-medium text-white/88 backdrop-blur-sm"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[#f2ae30]" />
                      <span>{point}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <svg
            className="pointer-events-none absolute bottom-0 left-0 h-20 w-full text-white sm:h-24 md:h-28"
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

        <section className="relative py-16 sm:py-20">
          <div className="container px-4 sm:px-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center">
              <div className="relative min-h-[460px] overflow-hidden rounded-[34px] border border-slate-200/70 bg-slate-950 shadow-[0_30px_90px_-50px_rgba(11,23,38,0.52)]">
                <img
                  src={aboutStoryImage}
                  alt="معدن"
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={event => {
                    const image = event.currentTarget;
                    if (image.src.endsWith("/about-poto1.jpg")) return;
                    image.src = "/about-poto1.jpg";
                  }}
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,14,24,0.16)_0%,rgba(6,14,24,0.3)_24%,rgba(6,14,24,0.92)_100%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(242,174,48,0.18),transparent_34%)]" />

                <div className="relative z-10 flex h-full flex-col justify-between p-6 md:p-8">
                  <div className="inline-flex w-fit rounded-full border border-white/14 bg-white/8 px-4 py-2 text-[11px] font-semibold tracking-[0.18em] text-white/78 backdrop-blur-sm">
                    حضور مؤسسي أوضح للفرص والاستثمار
                  </div>

                  <div className="max-w-[25rem] rounded-[28px] border border-slate-200/85 bg-white/95 p-6 shadow-[0_24px_70px_-44px_rgba(11,23,38,0.35)] backdrop-blur-sm">
                    <div className="text-right">
                      <div className="text-xs font-semibold tracking-[0.18em] text-primary/72">
                        منصة في صيغة أوضح
                      </div>
                      <p className="mt-4 text-lg leading-8 text-foreground">
                        نبني تجربة تجمع بين وضوح العرض والانضباط التشغيلي، لتقديم
                        فرص عقارية بصيغة أكثر ثقة واتزانًا.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <SectionIntro
                  eyebrow="من نحن"
                  title="معدن تجمع بين خبرة السوق وبناء تجربة استثمارية أكثر تنظيمًا"
                  description="لسنا مجرد واجهة عرض للفرص، بل منصة تعمل بمنهج مؤسسي يربط بين دراسة المشروع، تنظيم المعلومات، ومتابعة التنفيذ داخل تجربة متسقة وواضحة للمستثمر."
                />

                <div className="mt-6 space-y-4 text-base leading-8 text-muted-foreground sm:text-lg">
                  <p>
                    تأسست «معدن» لتمنح المستثمر مدخلًا أوضح إلى الفرص العقارية،
                    عبر معلومات منظمة ومسار يساعد على الانتقال من قراءة الفرصة إلى
                    اتخاذ القرار بثقة أعلى.
                  </p>
                  <p>
                    نعمل على تقديم المحتوى الاستثماري بلغة احترافية متوازنة، بحيث
                    تكون كل فرصة معروضة ضمن إطار مهني يوازن بين الجاذبية
                    الاستثمارية والوضوح في التفاصيل الأساسية.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          ref={statsRef as any}
          className="pb-20 sm:pb-24"
        >
          <div className="container px-4 sm:px-6">
            <div className="overflow-hidden rounded-[36px] bg-[linear-gradient(135deg,#0b1726_0%,#13253b_55%,#1a2f48_100%)] px-6 py-10 text-white shadow-[0_36px_110px_-56px_rgba(11,23,38,0.95)] sm:px-8 lg:px-12 lg:py-12">
              <SectionIntro
                eyebrow="الأرقام"
                title="مؤشرات تعكس الحضور والثقة"
                description="أرقام مختصرة تساعد على تكوين صورة أولية عن حجم النشاط الاستثماري والحضور المؤسسي الذي تبنيه «معدن»."
                centered
                invert
              />

              <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {stats.map(stat => {
                  const Icon = stat.icon;

                  return (
                    <article
                      key={stat.label}
                      className="rounded-[26px] border border-white/10 bg-white/6 p-5 text-center backdrop-blur-sm"
                    >
                      <div className="mx-auto inline-flex rounded-2xl bg-white/8 p-3 text-[#f2ae30]">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="mt-4 text-3xl font-semibold text-[#f2ae30] md:text-[2.4rem]">
                        {stat.animated}
                        {stat.suffix}
                      </div>
                      <div className="mt-3 text-sm leading-7 text-white/74">
                        {stat.label}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 sm:py-24">
          <div className="container px-4 sm:px-6">
            <SectionIntro
              eyebrow="عرض القيمة"
              title="ما الذي يميز معدن"
              description="مرتكزات عملية تنعكس على طريقة اختيار الفرص، تنظيم عرضها، ومتابعتها ضمن تجربة استثمارية أكثر وضوحًا واتزانًا."
              centered
            />

            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {PLATFORM_STRENGTHS.map(item => {
                const Icon = item.icon;

                return (
                  <article
                    key={item.title}
                    className="flex min-h-[220px] flex-col justify-between rounded-[30px] border border-slate-200/70 bg-white p-6 text-right shadow-[0_24px_80px_-56px_rgba(11,23,38,0.24)]"
                  >
                    <div className="inline-flex w-fit rounded-2xl bg-[#f7f3ea] p-3 text-primary">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="mt-6 space-y-3">
                      <h3 className="text-xl font-semibold text-foreground">
                        {item.title}
                      </h3>
                      <p className="text-sm leading-7 text-muted-foreground sm:text-[15px]">
                        {item.description}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="pb-20 sm:pb-24">
          <div className="container px-4 sm:px-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="rounded-[34px] border border-slate-200/70 bg-white p-8 shadow-[0_28px_80px_-52px_rgba(11,23,38,0.28)] sm:p-10">
                <SectionIntro
                  eyebrow="الرؤية والرسالة والمنهج"
                  title="منهج مؤسسي يربط بين الاختيار والتنفيذ والمتابعة"
                  description="تسلسل العمل في «معدن» لا يعتمد على العرض وحده، بل على إطار متكامل يبدأ بتقييم الفرصة، ويمر بتنظيم المعلومات، وينتهي بمتابعة أكثر اتساقًا لمسار الاستثمار."
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {COMPANY_FRAMEWORK.map(item => {
                  const Icon = item.icon;

                  return (
                    <article
                      key={item.eyebrow}
                      className="rounded-[28px] border border-slate-200/70 bg-white p-6 text-right shadow-[0_22px_70px_-52px_rgba(11,23,38,0.22)]"
                    >
                      <div className="inline-flex rounded-2xl bg-[#f7f3ea] p-3 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="mt-5 text-xs font-semibold tracking-[0.18em] text-primary/68">
                        {item.eyebrow}
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-foreground">
                        {item.title}
                      </h3>
                      <p className="mt-3 text-sm leading-7 text-muted-foreground">
                        {item.description}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="pb-8 sm:pb-10 lg:pb-12">
          <div className="container px-4 sm:px-6">
            <NextStepSliderBanner
              slider={content.nextStepSlider}
              className="min-h-[260px] p-0 sm:min-h-[360px] lg:min-h-[440px]"
            />
          </div>
        </section>
      </main>
    </div>
  );
}
