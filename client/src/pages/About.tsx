// client/src/pages/About.tsx
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Building2, Users, TrendingUp, Shield } from "lucide-react";
import { db } from "@/_core/firebase";
import { doc, getDoc } from "firebase/firestore";

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
          setStatsData(prev => ({ ...prev, ...snap.data().stats }));
        }
      } catch {
        // fallback silently
      }
    };
    load();
  }, []);

  const stats = [
    { icon: Building2, label: "مشروع", value: statsData.projects, color: "text-[#F2B705]" },
    { icon: Users, label: "مستثمر", value: statsData.investors, color: "text-blue-500" },
    { icon: TrendingUp, label: "عائد سنوي", value: statsData.annualReturn, color: "text-green-500" },
    { icon: Shield, label: "ريال استثمارات", value: statsData.totalInvestment, color: "text-purple-500" },
  ];

  const values = [
    {
      title: "الشفافية",
      description: "نوفر معلومات واضحة ودقيقة عن جميع المشاريع والعوائد المتوقعة",
      icon: "🔍",
    },
    {
      title: "الأمان",
      description: "جميع استثماراتنا متوافقة مع الشريعة الإسلامية ومدروسة بعناية فائقة",
      icon: "🛡️",
    },
    {
      title: "الاحترافية",
      description: "فريق متخصص من الخبراء في الاستثمار العقاري والتطوير",
      icon: "⭐",
    },
    {
      title: "العوائد المجزية",
      description: "نسعى لتحقيق أفضل العوائد الممكنة لمستثمرينا",
      icon: "💰",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 pt-20">
        {/* Hero */}
        <section className="bg-gradient-to-b from-[#030640] to-background py-20">
          <div className="container text-center max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
              عن معدن
            </h1>
            <p className="text-xl text-gray-300">
              منصة رائدة في الاستثمار العقاري المتوافق مع الشريعة الإسلامية
            </p>
          </div>
        </section>

        {/* Story */}
        <section className="py-20">
          <div className="container max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
              قصتنا
            </h2>
            <div className="prose prose-lg max-w-none text-muted-foreground space-y-6">
              <p>
                تأسست <b>معدن</b> بهدف توفير فرص استثمارية عقارية متميزة للمستثمرين في
                المملكة العربية السعودية ودول الخليج، مع التركيز على الاستثمارات
                المتوافقة مع الشريعة الإسلامية.
              </p>
              <p>
                يعمل فريقنا على دراسة المشاريع بعناية فائقة لضمان الشفافية وتحقيق
                عوائد مجزية ومستدامة.
              </p>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-20 bg-muted/50">
          <div className="container">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
              إنجازاتنا بالأرقام
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {stats.map((stat, i) => {
                const Icon = stat.icon;
                return (
                  <div key={i} className="text-center">
                    <Icon className={`w-12 h-12 mx-auto mb-4 ${stat.color}`} />
                    <div className="text-4xl font-bold mb-2">{stat.value}</div>
                    <div className="text-muted-foreground">{stat.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="py-20">
          <div className="container">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
              قيمنا الأساسية
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {values.map((v, i) => (
                <div
                  key={i}
                  className="bg-card border rounded-xl p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="text-4xl mb-4">{v.icon}</div>
                  <h3 className="text-xl font-bold mb-3">{v.title}</h3>
                  <p className="text-muted-foreground">{v.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Vision */}
        <section className="py-20 bg-gradient-to-r from-[#030640] to-[#0B0F19]">
          <div className="container max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
              رؤيتنا
            </h2>
            <p className="text-xl text-gray-300 leading-relaxed">
              أن نكون المنصة الأولى للاستثمار العقاري في المنطقة، ونساهم في تحقيق
              رؤية المملكة 2030 عبر فرص استثمارية مبتكرة ومستدامة.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
