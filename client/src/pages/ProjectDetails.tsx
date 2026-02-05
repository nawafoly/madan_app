// client/src/pages/ProjectDetails.tsx
import { useEffect, useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
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
  FileText,
  Images,
  Calendar,
  Users,
  BadgeCheck,
} from "lucide-react";
import { toast } from "sonner";

import { doc, getDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/_core/firebase";
import { useAuth } from "@/_core/hooks/useAuth";

type BiLabel = { ar?: string; en?: string };
type LabelValue = string | BiLabel;

type LabelsDoc = {
  projectTypes?: Record<string, LabelValue>;
  projectStatuses?: Record<string, LabelValue>;
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
    draft: "قريبا",
    published: "منشور",
    closed: "مغلق",
    completed: "مكتمل",
  },
};

/* =========================
   Helpers
========================= */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeNumber(n: any) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function fmtSAR(n: any) {
  return safeNumber(n).toLocaleString("ar-SA") + " ر.س";
}

// ✅ يمنع كراش React لما تكون القيمة {ar,en}
function pickLabel(v: unknown, lang: "ar" | "en" = "ar", fallback = "") {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as BiLabel;
    return (lang === "ar" ? o.ar : o.en) || o.ar || o.en || fallback;
  }
  return fallback;
}

// ✅ helper: يجعل صور public تشتغل لو كتبت اسم الملف فقط
function normalizeCover(src?: string) {
  const s = (src ?? "").toString().trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("/")) return s;
  return `/${s}`;
}

/** ✅ NEW: milestone status helpers */
function normStatus(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isMilestoneDone(status: any) {
  const v = normStatus(status);
  return (
    v === "completed" ||
    v === "done" ||
    v.includes("مكتمل") ||
    v.includes("منجز") ||
    v.includes("تم")
  );
}

type Attachment = { name?: string; url?: string };
type Milestone = { title?: string; date?: string; status?: string; description?: string };
type Faq = { q?: string; a?: string };

type ProgressMode = "funding" | "milestones" | "hybrid";

export default function ProjectDetails() {
  const [, params] = useRoute("/projects/:id");
  const projectId = params?.id ? String(params.id) : "";

  const { user } = useAuth();

  const [labels, setLabels] = useState<Required<LabelsDoc>>(DEFAULT_LABELS);
  const [flags, setFlags] = useState<FlagsDoc>({
    hideVipProjects: false,
    vipOnlyMode: false,
    maintenanceMode: false,
  });

  const [isInterestFormOpen, setIsInterestFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<any | null>(null);

  const [sending, setSending] = useState(false);
  const [formData, setFormData] = useState({
    name: (user as any)?.name || "",
    email: user?.email || "",
    phone: "",
    estimatedAmount: "",
    message: "",
  });

  // keep form in sync after auth loads
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      name: prev.name || (user as any)?.name || "",
      email: prev.email || user?.email || "",
    }));
  }, [user, user?.email]);

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
            projectTypes: {
              ...DEFAULT_LABELS.projectTypes,
              ...(data.projectTypes || {}),
            },
            projectStatuses: {
              ...DEFAULT_LABELS.projectStatuses,
              ...(data.projectStatuses || {}),
            },
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

        setProject({ id: snap.id, ...(snap.data() as any) });
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

  // Optional sections (render only if present)
  const gallery: string[] = useMemo(() => {
    const raw = project?.gallery;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map((x) => normalizeCover(String(x || ""))).filter(Boolean);
    return [];
  }, [project?.gallery]);

  const attachments: Attachment[] = useMemo(() => {
    const raw = project?.attachments;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as Attachment[];
    return [];
  }, [project?.attachments]);

  const milestones: Milestone[] = useMemo(() => {
    const raw = project?.milestones;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as Milestone[];
    return [];
  }, [project?.milestones]);

  const faq: Faq[] = useMemo(() => {
    const raw = project?.faq;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as Faq[];
    return [];
  }, [project?.faq]);

  const highlights: string[] = useMemo(() => {
    const raw = project?.highlights;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map((x) => String(x || "").trim()).filter(Boolean);
    return [];
  }, [project?.highlights]);

  /** =========================
   * ✅ NEW Progress Calculation (funding + milestones + hybrid)
   ========================= */
  const targetAmount = safeNumber(project?.targetAmount);
  const currentAmount = safeNumber(project?.currentAmount);

  const fundingProgress = useMemo(() => {
    if (!targetAmount) return 0;
    return clamp((currentAmount / targetAmount) * 100, 0, 100);
  }, [targetAmount, currentAmount]);

  const milestonesProgress = useMemo(() => {
    const total = milestones.length;
    if (!total) return 0;
    const done = milestones.filter((m) => isMilestoneDone(m?.status)).length;
    return clamp((done / total) * 100, 0, 100);
  }, [milestones]);

  const progressMode: ProgressMode = String(project?.progressMode || "hybrid") as ProgressMode;

  const fundingW = clamp(safeNumber(project?.progressFundingWeight ?? 60), 0, 100);
  const milestonesW = clamp(safeNumber(project?.progressMilestonesWeight ?? 40), 0, 100);

  const progress = useMemo(() => {
    if (progressMode === "funding") return fundingProgress;
    if (progressMode === "milestones") return milestonesProgress;

    // hybrid
    const sum = fundingW + milestonesW || 100;
    const fw = fundingW / sum;
    const mw = milestonesW / sum;
    return clamp(fundingProgress * fw + milestonesProgress * mw, 0, 100);
  }, [progressMode, fundingProgress, milestonesProgress, fundingW, milestonesW]);

  // ✅ HERO MEDIA: صورة أولاً، وإذا ما فيه يرجع للفيديو
  const coverImage = useMemo(() => normalizeCover(project?.coverImage), [project?.coverImage]);

  const heroVideo =
    project?.videoUrl ||
    "https://cdn.coverr.co/videos/coverr-modern-architecture-1604/1080p.mp4";

  // ✅ FIX: labels ممكن تكون {ar,en} فلازم نحولها لنص
  const typeLabel = project?.projectType
    ? pickLabel(labels.projectTypes[project.projectType], "ar", project.projectType)
    : "";

  const statusLabel = project?.status
    ? pickLabel(labels.projectStatuses[project.status], "ar", project.status)
    : "";


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;

    try {
      setSending(true);

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
        createdByUid: user?.uid || null,
        createdByEmail: user?.email || null,
      });

      toast.success("تم إرسال طلبك بنجاح! سنتواصل معك قريباً");
      setIsInterestFormOpen(false);
      setFormData((p) => ({ ...p, phone: "", estimatedAmount: "", message: "" }));
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ، يرجى المحاولة مرة أخرى");
    } finally {
      setSending(false);
    }
  };

  /* =========================
     UI states
  ========================= */
  if (loading) {
    return (
      <div className="w-full" dir="rtl" lang="ar">
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-24 w-24 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  if (blockedReason) {
    return (
      <div className="w-full" dir="rtl" lang="ar">
        <div className="flex-1 flex items-center justify-center">
          <Card className="p-10 text-center max-w-xl">
            <AlertTriangle className="w-14 h-14 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-2xl font-bold mb-2">
              {blockedReason === "maintenance" ? "الموقع تحت الصيانة" : "غير متاح"}
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
      </div>
    );
  }

  if (!project) {
    return (
      <div className="w-full" dir="rtl" lang="ar">
        <div className="flex-1 flex items-center justify-center">
          <Card className="p-12 text-center">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-2xl font-bold mb-2">المشروع غير موجود</h2>
            <Link href="/projects">
              <Button>العودة للمشاريع</Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full" dir="rtl" lang="ar">
      {/* HERO (IMAGE OR VIDEO) */}
      <section className="relative h-[65vh] min-h-[520px] overflow-hidden pt-20">
        {coverImage ? (
          <img
            src={coverImage}
            alt={project.titleAr || project.title || "Project"}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <video
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
            src={heroVideo}
          />
        )}

        <div className="absolute inset-0 bg-black/65" />

        <div className="relative z-10 h-full flex items-center">
          <div className="container text-white max-w-4xl">
            <div className="flex flex-wrap gap-2 mb-4">
              {typeLabel && (
                <Badge className="bg-primary text-primary-foreground px-4 py-2">
                  {typeLabel}
                </Badge>
              )}

              {statusLabel && (
                <Badge className="bg-black/50 backdrop-blur-sm px-4 py-2">
                  {statusLabel}
                </Badge>
              )}

              {project.issueNumber && (
                <Badge className="bg-black/50 backdrop-blur-sm px-4 py-2">
                  #{project.issueNumber}
                </Badge>
              )}
            </div>

            <h1 className="text-5xl md:text-6xl font-bold mb-4">
              {project.titleAr || project.title || "—"}
            </h1>

            {(project.locationAr || project.location) && (
              <div className="flex items-center gap-2 text-xl text-white/90">
                <MapPin className="w-6 h-6" />
                <span>{project.locationAr || project.location}</span>
              </div>
            )}

            {/* Quick facts */}
            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
              {safeNumber(project.investorsCount) > 0 && (
                <div className="rounded-xl bg-white/10 border border-white/15 backdrop-blur-sm p-4">
                  <div className="flex items-center gap-2 text-white/85 text-sm">
                    <Users className="w-4 h-4" />
                    المستثمرون
                  </div>
                  <div className="mt-1 text-2xl font-bold">
                    {safeNumber(project.investorsCount).toLocaleString("ar-SA")}
                  </div>
                </div>
              )}

              {safeNumber(project.duration) > 0 && (
                <div className="rounded-xl bg-white/10 border border-white/15 backdrop-blur-sm p-4">
                  <div className="flex items-center gap-2 text-white/85 text-sm">
                    <Calendar className="w-4 h-4" />
                    المدة
                  </div>
                  <div className="mt-1 text-2xl font-bold">
                    {safeNumber(project.duration).toLocaleString("ar-SA")} شهر
                  </div>
                </div>
              )}

              {safeNumber(project.annualReturn) > 0 && (
                <div className="rounded-xl bg-white/10 border border-white/15 backdrop-blur-sm p-4">
                  <div className="flex items-center gap-2 text-white/85 text-sm">
                    <TrendingUp className="w-4 h-4" />
                    العائد السنوي
                  </div>
                  <div className="mt-1 text-2xl font-bold">
                    {safeNumber(project.annualReturn).toLocaleString("ar-SA")}%
                  </div>
                </div>
              )}

              {project.shariaCompliant === true && (
                <div className="rounded-xl bg-white/10 border border-white/15 backdrop-blur-sm p-4">
                  <div className="flex items-center gap-2 text-white/85 text-sm">
                    <BadgeCheck className="w-4 h-4" />
                    متوافق
                  </div>
                  <div className="mt-1 text-2xl font-bold">شرعي</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* CONTENT */}
      <section className="py-12 bg-transparent">
        <div className="container grid lg:grid-cols-3 gap-8">
          {/* LEFT */}
          <div className="lg:col-span-2 space-y-8">
            {/* Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-3xl">نظرة عامة</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg text-muted-foreground leading-relaxed whitespace-pre-line">
                  {project.overviewAr || project.descriptionAr || project.description || "—"}
                </p>
              </CardContent>
            </Card>

            {/* Highlights (optional) */}
            {highlights.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-3xl flex items-center gap-2">
                    <CheckCircle2 className="w-7 h-7 text-primary" />
                    مميزات المشروع
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-3">
                    {highlights.map((t, i) => (
                      <div key={i} className="flex items-start gap-3 rounded-xl border p-4">
                        <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
                        <div className="text-sm leading-relaxed">{t}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Financial details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-3xl flex items-center gap-2">
                  <TrendingUp className="w-7 h-7 text-primary" />
                  التفاصيل المالية
                </CardTitle>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-6">
                <div>
                  <div className="text-sm text-muted-foreground">المبلغ المستهدف</div>
                  <div className="text-3xl font-bold text-primary">
                    {fmtSAR(project.targetAmount)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">المبلغ الحالي</div>
                  <div className="text-3xl font-bold">{fmtSAR(project.currentAmount)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">الحد الأدنى</div>
                  <div className="text-3xl font-bold">{fmtSAR(project.minInvestment)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">العائد السنوي</div>
                  <div className="text-3xl font-bold text-green-600">
                    {safeNumber(project.annualReturn).toLocaleString("ar-SA")}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">المدة</div>
                  <div className="text-3xl font-bold">
                    {safeNumber(project.duration).toLocaleString("ar-SA")} شهر
                  </div>
                </div>
                {project.paymentScheduleAr && (
                  <div>
                    <div className="text-sm text-muted-foreground">جدول العوائد</div>
                    <div className="text-base font-semibold leading-relaxed">
                      {String(project.paymentScheduleAr)}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Milestones (optional) */}
            {milestones.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-3xl flex items-center gap-2">
                    <Calendar className="w-7 h-7 text-primary" />
                    خطة التنفيذ
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {milestones.map((m, idx) => (
                    <div key={idx} className="rounded-xl border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-bold">{m.title || "مرحلة"}</div>
                        <div className="flex items-center gap-2">
                          {m.date && (
                            <Badge variant="outline" className="text-xs">
                              {m.date}
                            </Badge>
                          )}
                          {m.status && (
                            <Badge className="text-xs">{String(m.status)}</Badge>
                          )}
                        </div>
                      </div>
                      {m.description && (
                        <div className="mt-2 text-sm text-muted-foreground whitespace-pre-line">
                          {m.description}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Attachments (optional) */}
            {attachments.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-3xl flex items-center gap-2">
                    <FileText className="w-7 h-7 text-primary" />
                    مستندات ومرفقات
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-3">
                  {attachments.map((a, idx) => {
                    const url = (a?.url || "").toString().trim();
                    if (!url) return null;
                    return (
                      <a
                        key={idx}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border p-4 hover:bg-muted/40 transition flex items-start gap-3"
                      >
                        <FileText className="w-5 h-5 mt-0.5 text-primary" />
                        <div className="space-y-1">
                          <div className="font-semibold">{a?.name || "ملف"}</div>
                          <div className="text-xs text-muted-foreground break-all">{url}</div>
                        </div>
                      </a>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Gallery (optional) */}
            {gallery.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-3xl flex items-center gap-2">
                    <Images className="w-7 h-7 text-primary" />
                    صور من المشروع
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {gallery.map((src, idx) => (
                      <div key={idx} className="relative overflow-hidden rounded-2xl border aspect-[4/3]">
                        <img
                          src={src}
                          alt={`gallery-${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Risks (optional) */}
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

            {/* FAQ (optional) */}
            {faq.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-3xl">الأسئلة الشائعة</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {faq.map((f, idx) => (
                    <div key={idx} className="rounded-xl border p-4">
                      <div className="font-bold">{f.q || "—"}</div>
                      <div className="mt-2 text-sm text-muted-foreground whitespace-pre-line">
                        {f.a || "—"}
                      </div>
                    </div>
                  ))}
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
                    <span className="font-bold text-primary">{progress.toFixed(1)}%</span>
                  </div>

                  <Progress value={progress} className="h-3" />

                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span>{fmtSAR(currentAmount)}</span>
                    <span>{fmtSAR(targetAmount)}</span>
                  </div>

                  <div className="mt-2 text-[11px] text-muted-foreground">
                    {progressMode === "funding"
                      ? "يُحسب حسب التمويل فقط"
                      : progressMode === "milestones"
                        ? "يُحسب حسب المراحل فقط"
                        : `هجين: التمويل ${fundingW}% + المراحل ${milestonesW}%`}
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="rounded-xl border p-4">
                    <div className="text-xs text-muted-foreground">الحد الأدنى للاستثمار</div>
                    <div className="text-lg font-bold">{fmtSAR(project.minInvestment)}</div>
                  </div>
                  <div className="rounded-xl border p-4">
                    <div className="text-xs text-muted-foreground">العائد السنوي</div>
                    <div className="text-lg font-bold text-green-600">
                      {safeNumber(project.annualReturn).toLocaleString("ar-SA")}%
                    </div>
                  </div>
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

                      <Button type="submit" className="w-full" disabled={sending}>
                        {sending ? "جاري الإرسال..." : "إرسال الطلب"}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>

                <div className="space-y-3 pt-2">
                  {["عوائد مستقرة", "إدارة احترافية", "تقارير دورية", "متوافق مع الشريعة"].map((t) => (
                    <div key={t} className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <span className="text-sm">{t}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-4">
                  <Link href="/projects">
                    <Button variant="outline" className="w-full">
                      العودة للمشاريع
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
