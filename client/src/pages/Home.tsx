import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import VideoModal from "@/components/VideoModal";
import ProjectCard from "@/components/ProjectCard";
import {
  Play,
  TrendingUp,
  Users,
  Shield,
  ArrowRight,
  Building2,
  Landmark,
  Crown,
} from "lucide-react";

// 🔥 Firestore
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "@/_core/firebase";

export default function Home() {
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
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
          ...d.data(),
        }));

        setProjects(list);
      } catch (err) {
        console.error("Failed to load projects", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadProjects();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 hero-overlay">
          <img
            src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070"
            alt="Real Estate"
            className="w-full h-full object-cover"
          />
        </div>

        <div className="relative z-10 container text-center text-white py-32">
          <div className="max-w-4xl mx-auto space-y-6 animate-slide-up">
            <h1 className="text-5xl md:text-7xl font-bold">
              استثمر في مستقبل
              <span className="block text-primary">العقارات</span>
            </h1>

            <p className="text-xl text-white/90 max-w-2xl mx-auto">
              منصة معدن تربطك بأفضل فرص الاستثمار العقاري
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
              <Link href="/projects">
                <Button size="lg" className="gold-gradient px-8 py-6 text-lg">
                  استكشف المشاريع
                  <ArrowRight className="mr-2 w-5 h-5" />
                </Button>
              </Link>

              <Button
                size="lg"
                variant="outline"
                className="px-8 py-6 text-lg bg-white/10 text-white"
                onClick={() => setIsVideoOpen(true)}
              >
                <Play className="ml-2 w-5 h-5" />
                شاهد الفيديو
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-16">
              <div>
                <div className="text-4xl font-bold text-primary">500+</div>
                <div className="text-white/80">مستثمر</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-primary">50+</div>
                <div className="text-white/80">مشروع</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-primary">15%</div>
                <div className="text-white/80">عائد سنوي</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-primary">2B+</div>
                <div className="text-white/80">ريال استثمارات</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Projects */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-4xl font-bold mb-4">المشاريع المميزة</h2>
              <p className="text-xl text-muted-foreground">
                أحدث الفرص الاستثمارية
              </p>
            </div>
            <Link href="/projects">
              <Button variant="outline" size="lg">
                عرض الكل
                <ArrowRight className="mr-2 w-4 h-4" />
              </Button>
            </Link>
          </div>

          {isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="h-[500px] animate-pulse bg-muted" />
              ))}
            </div>
          ) : projects.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {projects.slice(0, 6).map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">
                لا توجد مشاريع متاحة حالياً
              </p>
            </Card>
          )}
        </div>
      </section>

      {/* Why Us */}
      <section className="py-20">
        <div className="container grid md:grid-cols-3 gap-8">
          <Card className="p-8 text-center">
            <Shield className="mx-auto w-10 h-10 text-primary mb-4" />
            <h3 className="text-xl font-bold mb-2">أمان وموثوقية</h3>
            <p className="text-muted-foreground">
              مشاريع مدروسة بعناية
            </p>
          </Card>

          <Card className="p-8 text-center">
            <TrendingUp className="mx-auto w-10 h-10 text-primary mb-4" />
            <h3 className="text-xl font-bold mb-2">عوائد مجزية</h3>
            <p className="text-muted-foreground">
              عوائد تصل إلى 25%
            </p>
          </Card>

          <Card className="p-8 text-center">
            <Users className="mx-auto w-10 h-10 text-primary mb-4" />
            <h3 className="text-xl font-bold mb-2">دعم متواصل</h3>
            <p className="text-muted-foreground">
              فريق متخصص معك دائمًا
            </p>
          </Card>
        </div>
      </section>

      <Footer />

      <VideoModal
        isOpen={isVideoOpen}
        onClose={() => setIsVideoOpen(false)}
        videoUrl="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        title="فيديو تعريفي عن معدن"
      />
    </div>
  );
}
