// client/src/pages/client/ProjectDetails.tsx
import { useEffect, useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  MapPin,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Shield,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import { doc, getDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/_core/firebase";

import { useAuth } from "@/_core/hooks/useAuth";

type LabelsDoc = {
  projectTypes?: Record<string, string>;
  projectStatuses?: Record<string, string>;
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
    draft: "مسودة",
    published: "منشور",
    closed: "مغلق",
    completed: "مكتمل",
  },
};

export default function ProjectDetails() {
  const [, params] = useRoute("/projects/:id");
  const projectId = params?.id || "";

  const [isInterestFormOpen, setIsInterestFormOpen] = useState(false);

  const { user } = useAuth();

  const [labels, setLabels] = useState<Required<LabelsDoc>>(DEFAULT_LABELS);
  const [flags, setFlags] = useState<FlagsDoc>({
    hideVipProjects: false,
    vipOnlyMode: false,
    maintenanceMode: false,
  });

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<any | null>(null);

  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: "",
    estimatedAmount: "",
    message: "",
  });

  /* =========================
     Load settings (labels + flags)
  ========================= */
  useEffect(() => {
    (async () => {
      try {
        const [labelsSnap, flagsSnap] = await Promise.all([
          getDoc(doc(db, "settings", "labels")),
          getDoc(doc(db, "settings", "flags")),
        ]);

        if (labelsSnap.exists()) {
          const data = labelsSnap.data() as LabelsDoc;
          setLabels({
            projectTypes: { ...DEFAULT_LABELS.projectTypes, ...(data.projectTypes || {}) },
            projectStatuses: { ...DEFAULT_LABELS.projectStatuses, ...(data.projectStatuses || {}) },
          });
        } else {
          setLabels(DEFAULT_LABELS);
        }

        if (flagsSnap.exists()) setFlags(flagsSnap.data() as FlagsDoc);
      } catch {
        // keep defaults
      }
    })();
  }, []);

  /* =========================
     Load project from Firestore
  ========================= */
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        if (!projectId) {
          setProject(null);
          return;
        }

        const snap = await getDoc(doc(db, "projects", projectId));
        if (!snap.exists()) {
          setProject(null);
          return;
        }

        const p = { id: snap.id, ...(snap.data() as any) };
        setProject(p);
      } catch (e) {
        console.error(e);
        toast.error("فشل تحميل المشروع");
        setProject(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  /* =========================
     Guards by flags
  ========================= */
  const blockedReason = useMemo(() => {
    if (!project) return null;
    const isVip = project.projectType === "vip_exclusive";

    if (flags.maintenanceMode) return "maintenance";
    if (flags.hideVipProjects && isVip) return "vip_hidden";
    if (flags.vipOnlyMode && !isVip) return "vip_only";
    return null;
  }, [project, flags.maintenanceMode, flags.hideVipProjects, flags.vipOnlyMode]);

  const progress = useMemo(() => {
    if (!project?.targetAmount) return 0;
    return (Number(project.currentAmount || 0) / Number(project.targetAmount)) * 100;
  }, [project]);

  const heroVideo =
    project?.videoUrl ||
    "https://cdn.coverr.co/videos/coverr-modern-architecture-1604/1080p.mp4";

  const typeLabel = project?.projectType
    ? labels.projectTypes[project.projectType] || project.projectType
    : "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await addDoc(collection(db, "messages"), {
        type: "investment_request",
        status: "new",
        projectId: project?.id || projectId,
        projectTitle: project?.titleAr || project?.title || "",
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        estimatedAmount: formData.estimatedAmount ? Number(formData.estimatedAmount) : null,
        message: formData.message,
        createdAt: serverTimestamp(),
      });

      toast.success("تم إرسال طلبك بنجاح! سنتواصل معك قريباً");
      setIsInterestFormOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ، يرجى المحاولة مرة أخرى");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-24 w-24 border-b-2 border-primary" />
        </div>
        <Footer />
      </div>
    );
  }

  // maintenance / blocked
  if (blockedReason) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Card className="p-10 text-center max-w-xl">
            <AlertTriangle className="w-14 h-14 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-2xl font-bold mb-2">
              {blockedReason === "maintenance"
                ? "الموقع تحت الصيانة"
                : "غير متاح"}
            </h2>
            <p className="text-muted-foreground mb-6">
              {blockedReason === "maintenance"
                ? "نعتذر، سيتم إعادة تفعيل المشاريع قريبًا."
                : blockedReason === "vip_hidden"
                ? "هذا المشروع غير متاح حاليًا."
                : "هذا المشروع غير متاح في الوضع الحالي."}
            </p>
            <Link href="/projects">
              <Button>العودة للمشاريع</Button>
            </Link>
          </Card>
        </div>
        <Footer />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Card className="p-12 text-center">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-2xl font-bold mb-2">المشروع غير موجود</h2>
            <Link href="/projects">
              <Button>العودة للمشاريع</Button>
            </Link>
          </Card>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* HERO WITH VIDEO */}
      <section className="relative h-[65vh] min-h-[520px] overflow-hidden mt-20">
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          src={heroVideo}
        />

        <div className="absolute inset-0 bg-black/65" />

        <div className="relative z-10 h-full flex items-center">
          <div className="container text-white max-w-4xl">
            <div className="flex gap-3 mb-4">
              <Badge className="bg-primary text-primary-foreground px-4 py-2">
                {typeLabel}
              </Badge>
              <Badge className="bg-black/50 backdrop-blur-sm px-4 py-2">
                #{project.issueNumber}
              </Badge>
            </div>

            <h1 className="text-5xl md:text-6xl font-bold mb-4">
              {project.titleAr || project.title}
            </h1>

            {project.locationAr && (
              <div className="flex items-center gap-2 text-xl">
                <MapPin className="w-6 h-6" />
                <span>{project.locationAr}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* CONTENT */}
      <section className="py-12 bg-background">
        <div className="container grid lg:grid-cols-3 gap-8">
          {/* LEFT */}
          <div className="lg:col-span-2 space-y-8">
            <Card>
              <CardHeader>
                <CardTitle className="text-3xl">نظرة عامة</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  {project.overviewAr || project.descriptionAr || project.description}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-3xl flex items-center gap-2">
                  <TrendingUp className="w-7 h-7 text-primary" />
                  التفاصيل المالية
                </CardTitle>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-6">
                <div>
                  <div className="text-sm text-muted-foreground">
                    المبلغ المستهدف
                  </div>
                  <div className="text-3xl font-bold text-primary">
                    {Number(project.targetAmount || 0).toLocaleString()} ر.س
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">الحد الأدنى</div>
                  <div className="text-3xl font-bold">
                    {Number(project.minInvestment || 0).toLocaleString()} ر.س
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">العائد السنوي</div>
                  <div className="text-3xl font-bold text-green-600">
                    {Number(project.annualReturn || 0)}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">المدة</div>
                  <div className="text-3xl font-bold">
                    {Number(project.duration || 0)} شهر
                  </div>
                </div>
              </CardContent>
            </Card>

            {project.risksAr && (
              <Card className="border-destructive/20">
                <CardHeader>
                  <CardTitle className="text-3xl flex items-center gap-2">
                    <Shield className="w-7 h-7 text-destructive" />
                    المخاطر
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg text-muted-foreground whitespace-pre-line">
                    {project.risksAr}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* RIGHT */}
          <div>
            <Card className="sticky top-24 border-2 border-primary/20">
              <CardHeader className="bg-primary/5">
                <CardTitle className="text-2xl">ملخص الاستثمار</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">التقدم</span>
                    <span className="font-bold text-primary">
                      {progress.toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={progress} className="h-3" />
                </div>

                <Dialog open={isInterestFormOpen} onOpenChange={setIsInterestFormOpen}>
                  <DialogTrigger asChild>
                    <Button size="lg" className="w-full py-6 gold-gradient text-lg">
                      أبدِ اهتمامك
                      <ArrowRight className="mr-2 w-5 h-5" />
                    </Button>
                  </DialogTrigger>

                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>نموذج الاهتمام</DialogTitle>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <Label>الاسم</Label>
                        <Input
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          required
                        />
                      </div>

                      <div>
                        <Label>البريد الإلكتروني</Label>
                        <Input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          required
                        />
                      </div>

                      <div>
                        <Label>رقم الجوال</Label>
                        <Input
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        />
                      </div>

                      <div>
                        <Label>المبلغ التقديري</Label>
                        <Input
                          type="number"
                          value={formData.estimatedAmount}
                          onChange={(e) =>
                            setFormData({ ...formData, estimatedAmount: e.target.value })
                          }
                        />
                      </div>

                      <div>
                        <Label>ملاحظات</Label>
                        <Textarea
                          rows={4}
                          value={formData.message}
                          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                        />
                      </div>

                      <Button type="submit" className="w-full">
                        إرسال الطلب
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>

                <div className="space-y-3 pt-4">
                  {["عوائد مستقرة", "إدارة احترافية", "تقارير دورية", "متوافق مع الشريعة"].map((t) => (
                    <div key={t} className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <span className="text-sm">{t}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
