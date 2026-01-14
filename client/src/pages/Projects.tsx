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
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/_core/firebase";

type ProjectDoc = {
  id?: string;

  titleAr?: string;
  locationAr?: string;

  projectType?: string;
  status?: string;

  issueNumber?: string;

  overviewAr?: string;
  descriptionAr?: string;

  targetAmount?: number | string;
  currentAmount?: number | string;

  investorsCount?: number;

  minInvestment?: number | string;
  annualReturn?: number | string;
  duration?: number | string;

  risksAr?: string;

  videoUrl?: string;
};

export default function ProjectDetails() {
  const [, params] = useRoute("/projects/:id");
  const projectId = params?.id ? String(params.id) : "";

  const [isInterestFormOpen, setIsInterestFormOpen] = useState(false);

  const { user } = useAuth();

  const [project, setProject] = useState<ProjectDoc | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [sending, setSending] = useState(false);

  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: "",
    estimatedAmount: "",
    message: "",
  });

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      name: prev.name || user?.name || "",
      email: prev.email || user?.email || "",
    }));
  }, [user?.name, user?.email]);

  const loadProject = async () => {
    try {
      setIsLoading(true);
      setLoadError(null);

      if (!projectId) {
        setProject(null);
        return;
      }

      const snap = await getDoc(doc(db, "projects", projectId));
      if (!snap.exists()) {
        setProject(null);
        return;
      }

      setProject({ id: snap.id, ...(snap.data() as ProjectDoc) });
    } catch (e) {
      console.error(e);
      setLoadError("ÕœÀ Œÿ√ √À‰«¡  Õ„Ì· «·„‘—Ê⁄");
      setProject(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const progress = useMemo(() => {
    if (!project?.targetAmount) return 0;
    const target = Number(project.targetAmount || 0);
    const current = Number(project.currentAmount || 0);
    if (!target) return 0;
    return (current / target) * 100;
  }, [project?.targetAmount, project?.currentAmount]);

  const heroVideo =
    project?.videoUrl ||
    "https://cdn.coverr.co/videos/coverr-modern-architecture-1604/1080p.mp4";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (!project) return;

      setSending(true);

      await addDoc(collection(db, "messages"), {
        type: "investment_request",
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        subject: `ÿ·» «” À„«— ›Ì „‘—Ê⁄ ${project.titleAr || ""}`,
        message: formData.message,
        projectId: project.id,
        projectTitleAr: project.titleAr || "",
        estimatedAmount: formData.estimatedAmount || "",
        createdAt: serverTimestamp(),
        createdByUid: user?.uid || null,
        createdByEmail: user?.email || null,
      });

      toast.success(" „ ≈—”«· ÿ·»ﬂ »‰Ã«Õ! ”‰ Ê«’· „⁄ﬂ ﬁ—Ì»«.");
      setIsInterestFormOpen(false);

      setFormData((prev) => ({
        ...prev,
        phone: "",
        estimatedAmount: "",
        message: "",
      }));
    } catch (e) {
      console.error(e);
      toast.error("ÕœÀ Œÿ√° Ì—ÃÏ «·„Õ«Ê·… „—… √Œ—Ï");
    } finally {
      setSending(false);
    }
  };

  if (isLoading) {
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

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Card className="p-10 text-center space-y-4">
            <AlertCircle className="w-14 h-14 mx-auto text-muted-foreground" />
            <div className="text-xl font-bold">{loadError}</div>
            <div className="flex justify-center gap-3">
              <Button onClick={loadProject}>≈⁄«œ… «·„Õ«Ê·…</Button>
              <Link href="/projects">
                <Button variant="outline">«·⁄Êœ… ··„‘«—Ì⁄</Button>
              </Link>
            </div>
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
            <h2 className="text-2xl font-bold mb-2">«·„‘—Ê⁄ €Ì— „ÊÃÊœ</h2>
            <Link href="/projects">
              <Button>«·⁄Êœ… ··„‘«—Ì⁄</Button>
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
                {project.projectType}
              </Badge>
              <Badge className="bg-black/50 backdrop-blur-sm px-4 py-2">
                #{project.issueNumber}
              </Badge>
            </div>

            <h1 className="text-5xl md:text-6xl font-bold mb-4">
              {project.titleAr}
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

      <section className="py-12 bg-background">
        <div className="container grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card>
              <CardHeader>
                <CardTitle className="text-3xl">‰Ÿ—… ⁄«„…</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  {project.overviewAr || project.descriptionAr}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-3xl flex items-center gap-2">
                  <TrendingUp className="w-7 h-7 text-primary" />
                  «· ›«’Ì· «·„«·Ì…
                </CardTitle>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-6">
                <div>
                  <div className="text-sm text-muted-foreground">
                    «·„»·€ «·„” Âœ›
                  </div>
                  <div className="text-3xl font-bold text-primary">
                    {Number(project.targetAmount || 0).toLocaleString()} —.”
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">«·Õœ «·√œ‰Ï</div>
                  <div className="text-3xl font-bold">
                    {Number(project.minInvestment || 0).toLocaleString()} —.”
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">«·⁄«∆œ «·”‰ÊÌ</div>
                  <div className="text-3xl font-bold text-green-600">
                    {project.annualReturn}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">«·„œ…</div>
                  <div className="text-3xl font-bold">{project.duration} ‘Â—</div>
                </div>
              </CardContent>
            </Card>

            {project.risksAr && (
              <Card className="border-destructive/20">
                <CardHeader>
                  <CardTitle className="text-3xl flex items-center gap-2">
                    <Shield className="w-7 h-7 text-destructive" />
                    «·„Œ«ÿ—
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

          <div>
            <Card className="sticky top-24 border-2 border-primary/20">
              <CardHeader className="bg-primary/5">
                <CardTitle className="text-2xl">„·Œ’ «·«” À„«—</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">«· ﬁœ„</span>
                    <span className="font-bold text-primary">
                      {progress.toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={progress} className="h-3" />
                </div>

                <Dialog open={isInterestFormOpen} onOpenChange={setIsInterestFormOpen}>
                  <DialogTrigger asChild>
                    <Button size="lg" className="w-full py-6 gold-gradient text-lg">
                      √»œˆ «Â „«„ﬂ
                      <ArrowRight className="mr-2 w-5 h-5" />
                    </Button>
                  </DialogTrigger>

                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>‰„Ê–Ã «·«Â „«„</DialogTitle>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <Label>«·«”„</Label>
                        <Input
                          value={formData.name}
                          onChange={(e) =>
                            setFormData({ ...formData, name: e.target.value })
                          }
                          required
                        />
                      </div>

                      <div>
                        <Label>«·»—Ìœ «·≈·ﬂ —Ê‰Ì</Label>
                        <Input
                          type="email"
                          value={formData.email}
                          onChange={(e) =>
                            setFormData({ ...formData, email: e.target.value })
                          }
                          required
                        />
                      </div>

                      <div>
                        <Label>—ﬁ„ «·ÃÊ«·</Label>
                        <Input
                          value={formData.phone}
                          onChange={(e) =>
                            setFormData({ ...formData, phone: e.target.value })
                          }
                        />
                      </div>

                      <div>
                        <Label>«·„»·€ «· ﬁœÌ—Ì</Label>
                        <Input
                          type="number"
                          value={formData.estimatedAmount}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              estimatedAmount: e.target.value,
                            })
                          }
                        />
                      </div>

                      <div>
                        <Label>„·«ÕŸ« </Label>
                        <Textarea
                          rows={4}
                          value={formData.message}
                          onChange={(e) =>
                            setFormData({ ...formData, message: e.target.value })
                          }
                        />
                      </div>

                      <Button type="submit" className="w-full" disabled={sending}>
                        {sending ? "Ã«—Ì «·≈—”«·..." : "≈—”«· «·ÿ·»"}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>

                <div className="space-y-3 pt-4">
                  {[
                    "⁄Ê«∆œ „” ﬁ—…",
                    "≈œ«—… «Õ —«›Ì…",
                    " ﬁ«—Ì— œÊ—Ì…",
                    "„ Ê«›ﬁ „⁄ «·‘—Ì⁄…",
                  ].map((t) => (
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
