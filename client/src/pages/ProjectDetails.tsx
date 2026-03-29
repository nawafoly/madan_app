// client/src/pages/ProjectDetails.tsx
import { useEffect, useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { toast } from "sonner";

import { doc, getDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/_core/firebase";
import { useAuth } from "@/_core/hooks/useAuth";
import { AUDIT_ACTIONS, auditedSetDoc, buildAuditSource } from "@/lib/auditLog";
import { formatCurrencyEN, formatNumberEN, formatPercentEN } from "@/lib/formatters";
import { cn } from "@/lib/utils";

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
  return formatCurrencyEN(safeNumber(n));
}

function toDateSafe(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    const parsed = value.toDate();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
  }
  if (typeof value?.seconds === "number") {
    const parsed = new Date(value.seconds * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value?._seconds === "number") {
    const parsed = new Date(value._seconds * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatRemainingTime(value: any) {
  const endDate = toDateSafe(value);
  if (!endDate) return "غير محدد";

  const now = new Date();
  const diffMs = endDate.getTime() - now.getTime();

  if (diffMs <= 0) return "انتهى";

  const dayMs = 24 * 60 * 60 * 1000;
  const totalDays = Math.ceil(diffMs / dayMs);
  const months = Math.floor(totalDays / 30);
  const days = totalDays % 30;

  if (months > 0 && days > 0) return `${months} شهر و${days} يوم`;
  if (months > 0) return `${months} شهر`;
  return `${totalDays} يوم`;
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

type Attachment = { name?: string; url?: string; externalUrl?: string };
type Milestone = { title?: string; date?: string; status?: string; description?: string };
type Faq = { q?: string; a?: string };

type ProgressMode = "funding" | "milestones" | "hybrid";

type MilestoneState = "done" | "current" | "upcoming";

function isMilestoneCurrent(status: any) {
  const v = normStatus(status);
  return (
    v === "current" ||
    v === "active" ||
    v === "in progress" ||
    v === "ongoing" ||
    v.includes("ط¬ط§ط±") ||
    v.includes("ظ‚ظٹط¯") ||
    v.includes("ط­ط§ظ„ظٹ") ||
    v.includes("طھظ†ظپظٹط°")
  );
}

function getMilestoneState(status: any): MilestoneState {
  if (isMilestoneDone(status)) return "done";
  if (isMilestoneCurrent(status)) return "current";
  return "upcoming";
}

function getMilestoneStateUi(state: MilestoneState) {
  switch (state) {
    case "done":
      return {
        label: "منجز",
        badgeClass:
          "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
        dotClass:
          "border-emerald-200 bg-emerald-500 text-white shadow-[0_10px_24px_rgba(16,185,129,0.28)]",
        cardClass: "border-emerald-100 bg-emerald-50/60",
      };
    case "current":
      return {
        label: "جاري",
        badgeClass:
          "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50",
        dotClass:
          "border-amber-200 bg-amber-500 text-white shadow-[0_10px_24px_rgba(245,158,11,0.25)]",
        cardClass: "border-amber-100 bg-amber-50/70",
      };
    default:
      return {
        label: "قادم",
        badgeClass:
          "border border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-100",
        dotClass: "border-slate-200 bg-white text-slate-500",
        cardClass: "border-slate-200 bg-white",
      };
  }
}

function parseOverviewContent(value: unknown) {
  const raw = String(value ?? "").replace(/\r/g, "").trim();
  if (!raw) return { lead: "", bullets: [] as string[] };

  const blocks = raw
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const segments = (blocks.length > 1 ? blocks : raw.split(/[.!؟]+/))
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return {
    lead: segments[0] || raw,
    bullets: segments.slice(1, 5),
  };
}

function getAttachmentName(attachment: Attachment) {
  const explicitName = String(attachment?.name || "").trim();
  if (explicitName) return explicitName;

  const link = String(attachment?.url || attachment?.externalUrl || "").trim();
  if (!link) return "مرفق";

  const fallback = link
    .split("?")[0]
    .split("#")[0]
    .split("/")
    .filter(Boolean)
    .pop();

  if (!fallback) return "مرفق";

  try {
    return decodeURIComponent(fallback);
  } catch {
    return fallback;
  }
}

function getAttachmentKind(attachment: Attachment) {
  const source = [
    attachment?.name || "",
    attachment?.url || "",
    attachment?.externalUrl || "",
  ]
    .join(" ")
    .toLowerCase();

  if (!attachment?.url && attachment?.externalUrl) return "رابط خارجي";
  if (source.includes(".pdf")) return "PDF";
  if (/\.(doc|docx)(\?|$)/.test(source)) return "DOC";
  if (/\.(xls|xlsx|csv)(\?|$)/.test(source)) return "Sheet";
  if (/\.(jpg|jpeg|png|webp|gif)(\?|$)/.test(source)) return "صورة";
  return "ملف";
}

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
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<any | null>(null);

  const [sending, setSending] = useState(false);

  const [formMessage, setFormMessage] = useState<{
    type: "error" | "success" | null;
    text: string;
  }>({ type: null, text: "" });

  // ✅ NEW: user profile from Firestore
  const [userProfile, setUserProfile] = useState<any | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    estimatedAmount: "",
    message: "",
  });

  // ✅ NEW: load users/{uid} to fill name/phone/isInvestor
  useEffect(() => {
    (async () => {
      try {
        if (!user?.uid) {
          setUserProfile(null);
          setFormData((p) => ({
            ...p,
            name: "",
            email: "",
            phone: "",
          }));
          return;
        }

        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) {
          setUserProfile(null);
          setFormData((p) => ({
            ...p,
            name: p.name || (user.displayName || ""),
            email: p.email || (user.email || ""),
            phone: p.phone || "",
          }));
          return;
        }

        const p = snap.data() as any;
        setUserProfile(p);

        setFormData((prev) => ({
          ...prev,
          name: prev.name || p.displayName || user.displayName || "",
          email: prev.email || p.email || user.email || "",
          phone: prev.phone || p.phone || "",
        }));
      } catch (e) {
        console.error(e);
      }
    })();
  }, [user?.uid]);

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

  const overviewSource = useMemo(
    () => project?.overviewAr || project?.descriptionAr || project?.description || "",
    [project?.overviewAr, project?.descriptionAr, project?.description]
  );

  const overviewContent = useMemo(
    () => parseOverviewContent(overviewSource),
    [overviewSource]
  );

  const durationValue = safeNumber(project?.duration);
  const durationText =
    durationValue > 0 ? `${formatNumberEN(durationValue)} شهر` : "يحدد لاحقًا";
  const annualReturnText =
    safeNumber(project?.annualReturn) > 0
      ? formatPercentEN(safeNumber(project?.annualReturn), {
          maximumFractionDigits: 0,
        })
      : "—";
  const targetAmountText = fmtSAR(project?.targetAmount);
  const currentAmountText = fmtSAR(project?.currentAmount);
  const minimumInvestmentText = fmtSAR(project?.minInvestment);
  const remainingAmountText = fmtSAR(Math.max(targetAmount - currentAmount, 0));
  const progressPercentageText = `${progress.toFixed(1)}%`;
  const investorsCountText = formatNumberEN(safeNumber(project?.investorsCount));
  const projectEndDate =
    project?.plannedEndAt || project?.actualEndAt || project?.endDate || project?.endAt || null;
  const remainingTimeText = formatRemainingTime(projectEndDate);
  const progressHint =
    progressMode === "funding"
      ? "يُحتسب التقدم حسب التمويل فقط"
      : progressMode === "milestones"
      ? "يُحتسب التقدم حسب المراحل فقط"
      : `هجين: التمويل ${fundingW}% + المراحل ${milestonesW}%`;

  const overviewBullets = useMemo(() => {
    if (overviewContent.bullets.length > 0) return overviewContent.bullets;

    return [
      typeLabel ? `نوع الاستثمار: ${typeLabel}` : "",
      project?.locationAr || project?.location
        ? `الموقع: ${project?.locationAr || project?.location}`
        : "",
      durationValue > 0 ? `مدة الاستثمار: ${durationText}` : "",
      safeNumber(project?.minInvestment) > 0
        ? `الحد الأدنى للمشاركة: ${minimumInvestmentText}`
        : "",
    ].filter(Boolean);
  }, [
    durationText,
    durationValue,
    minimumInvestmentText,
    overviewContent.bullets,
    project?.location,
    project?.locationAr,
    project?.minInvestment,
    typeLabel,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;

    try {
      setSending(true);

      if (!user?.uid) {
        toast.error("الرجاء تسجيل الدخول أولاً");
        return;
      }

      const phone = formData.phone.trim();
      if (!phone) {
        toast.error("رقم الجوال مطلوب");
        return;
      }

      const amount = Number(formData.estimatedAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("المبلغ مطلوب ويجب أن يكون أكبر من صفر");
        return;
      }

      const requestRef = doc(collection(db, "interest_requests"));
      const payload = {
        requestId: requestRef.id,
        type: "investment_request",
        projectId: project?.id || projectId,
        projectTitle: project?.titleAr || project?.title || "",

        // ✅ user links
        investorUid: user.uid,
        userId: user.uid,
        createdByUid: user.uid,
        createdByEmail: user.email || null,
        investorEmail: user.email || null,
        investorName: formData.name || null,
        investorPhone: phone || null,

        // ✅ amount/status
        amount,
        status: "pending",
        stageRole: "review",
        stage: "review",
        note: formData.message || null,

        // ✅ snapshots (ثابتة)
        projectSnapshot: {
          titleAr: project?.titleAr || null,
          title: project?.title || null,
          minInvestment: project?.minInvestment ?? null,
          annualReturn: project?.annualReturn ?? null,
          duration: project?.duration ?? null,
        },
        userSnapshot: {
          uid: user.uid,
          displayName: formData.name || null,
          email: formData.email || null,
          phone: phone || null,
          isInvestor: userProfile?.isInvestor ?? false,
        },

        source: "project_details",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await auditedSetDoc({
        ref: requestRef,
        data: payload,
        action: AUDIT_ACTIONS.REQUEST_CREATED,
        category: "request",
        entityType: "request",
        source: buildAuditSource({
          area: "client",
          page: "ProjectDetails",
          method: "create_request",
        }),
        relatedIds: {
          requestId: requestRef.id,
          projectId: String(project?.id || projectId || ""),
          userId: user.uid,
        },
        message: `Created interest request ${requestRef.id}`,
        meta: {
          projectName: project?.titleAr || project?.title || null,
          amount,
          requestCode: requestRef.id,
        },
        ignoreFields: ["updatedAt"],
      });

      setIsInterestFormOpen(false); // يقفل نموذج الاهتمام
      setIsSuccessOpen(true);       // يفتح مودال النجاح المستقل
      setFormData((p) => ({ ...p, estimatedAmount: "", message: "" }));



    } catch (err) {
      console.error(err);
      setFormMessage({
        type: "error",
        text: "حدث خطأ أثناء الإرسال. حاول مرة أخرى.",
      });
    } finally {
      setSending(false);
    }
  };

  /* =========================
     UI states
  ========================= */
  if (loading) {
    return (
      <div className="w-full">
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-24 w-24 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  if (blockedReason) {
    return (
      <div className="w-full">
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
      <div className="w-full">
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
    <div className="w-full bg-[#f4f7fb]">
      {/* HERO */}
      <section className="relative overflow-hidden bg-[#07111f] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(244,201,93,0.16),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(56,189,248,0.14),transparent_28%)]" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#07111f] via-[#0c1b33] to-[#173554]" />

        <div className="absolute inset-y-0 left-0 hidden w-[42%] overflow-hidden lg:block">
          {coverImage ? (
            <img
              src={coverImage}
              alt={project.titleAr || project.title || "Project"}
              className="h-full w-full object-cover opacity-20 mix-blend-screen"
            />
          ) : (
            <video
              autoPlay
              muted
              loop
              playsInline
              className="h-full w-full object-cover opacity-20 mix-blend-screen"
              src={heroVideo}
            />
          )}
        </div>

        <div className="absolute inset-0 bg-gradient-to-l from-[#07111f]/15 via-[#07111f]/45 to-[#07111f]" />

        <div className="container relative py-24 md:py-28">
          <div className="space-y-10 text-white">
            <div className="flex flex-wrap gap-2">
              {typeLabel && (
                <Badge className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-white backdrop-blur-sm">
                  {typeLabel}
                </Badge>
              )}

              {statusLabel && (
                <Badge className="rounded-full border border-white/15 bg-black/20 px-4 py-2 text-white/90 backdrop-blur-sm">
                  {statusLabel}
                </Badge>
              )}

              {project.issueNumber && (
                <Badge className="rounded-full border border-white/15 bg-black/20 px-4 py-2 text-white/90 backdrop-blur-sm">
                  #{project.issueNumber}
                </Badge>
              )}
            </div>

            <h1 className="max-w-5xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
              {project.titleAr || project.title || "—"}
            </h1>

            {(project.locationAr || project.location) && (
              <div className="flex items-center gap-2 text-base text-white/78 md:text-lg">
                <MapPin className="h-5 w-5" />
                <span>{project.locationAr || project.location}</span>
              </div>
            )}

            <p className="max-w-3xl text-base leading-8 text-white/72 md:text-lg">
              {overviewContent.lead ||
                "فرصة استثمارية مصممة بعرض بصري أوضح يبرز العائد، المدة، والحد الأدنى قبل بدء الطلب."}
            </p>

            <div className="rounded-[32px] border border-white/12 bg-white/8 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl md:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-white/58">العائد السنوي المتوقع</div>
                  <div className="mt-3 text-5xl font-black tracking-tight text-[#f4c95d] md:text-6xl">
                    {annualReturnText}
                  </div>
                  <div className="mt-3 max-w-sm text-sm leading-7 text-white/60">
                    عرض تمهيدي يضع نسبة العائد في الصدارة ويعطي قراءة سريعة لما سيدخله المستثمر
                    قبل بدء الطلب.
                  </div>
                </div>

                {typeLabel && (
                  <div className="rounded-2xl border border-white/12 bg-black/15 px-4 py-3 text-center">
                    <div className="text-[11px] text-white/55">نوع الاستثمار</div>
                    <div className="mt-2 text-sm font-semibold text-white">{typeLabel}</div>
                  </div>
                )}
              </div>

              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <div className="text-xs text-white/55">المبلغ المستهدف</div>
                  <div className="mt-2 text-xl font-semibold text-white">{targetAmountText}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <div className="text-xs text-white/55">الحد الأدنى</div>
                  <div className="mt-2 text-xl font-semibold text-white">{minimumInvestmentText}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <div className="text-xs text-white/55">مدة الاستثمار</div>
                  <div className="mt-2 text-xl font-semibold text-white">{durationText}</div>
                </div>
              </div>

            </div>

          </div>
        </div>
      </section>

      <section className="relative -mt-10 pb-16">
        <div className="container">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_45px_rgba(15,23,42,0.08)]">
              <div className="text-sm text-slate-500">المبلغ المتبقي</div>
              <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                {remainingAmountText}
              </div>
              <div className="mt-2 text-sm text-slate-500">المبلغ المطلوب للوصول إلى الهدف التمويلي.</div>
            </div>

            <div className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_45px_rgba(15,23,42,0.08)]">
              <div className="text-sm text-slate-500">نسبة التقدم</div>
              <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                {progressPercentageText}
              </div>
              <div className="mt-2 text-sm text-slate-500">{progressHint}</div>
            </div>

            <div className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_45px_rgba(15,23,42,0.08)]">
              <div className="text-sm text-slate-500">عدد المستثمرين</div>
              <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                {investorsCountText}
              </div>
              <div className="mt-2 text-sm text-slate-500">عدد المشاركين الحاليين في هذا المشروع.</div>
            </div>

            <div className="rounded-[30px] border border-slate-200/80 bg-[#0f172a] p-6 text-white shadow-[0_24px_60px_rgba(15,23,42,0.25)]">
              <div className="text-sm text-white/55">الوقت المتبقي</div>
              <div className="mt-3 text-3xl font-semibold tracking-tight">{remainingTimeText}</div>
              <div className="mt-2 text-sm text-white/60">
                محسوب من تاريخ نهاية المشروع المخطط متى ما كان متاحًا.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CONTENT */}
      <section className="pb-20 pt-4">
        <div className="container grid gap-8 lg:grid-cols-[1.45fr_0.85fr]">
          {/* LEFT */}
          <div className="lg:col-span-2 space-y-8">
            {/* Overview */}
            <Card className="overflow-hidden border-0 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <CardHeader className="border-b border-slate-100 pb-6">
                <div className="space-y-3">
                  <Badge variant="outline" className="w-fit border-slate-200 bg-slate-50 text-slate-600">
                    نظرة عامة
                  </Badge>
                  <CardTitle className="text-3xl font-semibold tracking-tight">قراءة سريعة للفرصة</CardTitle>
                  <CardDescription className="max-w-2xl">
                    صياغة مختصرة تسهّل على المستثمر فهم الفكرة الرئيسية قبل الدخول في التفاصيل.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-6 pt-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[28px] bg-[#0f172a] p-6 text-white">
                  <div className="text-sm text-white/55">الخلاصة التنفيذية</div>
                  <p className="mt-4 text-lg leading-8 text-white/88">
                    {overviewContent.lead || "لا توجد مقدمة تفصيلية متاحة لهذا المشروع حالياً."}
                  </p>
                </div>

                <div className="grid gap-3">
                  {overviewBullets.map((item, idx) => (
                    <div
                      key={`${item}-${idx}`}
                      className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <div className="text-sm leading-7 text-slate-700">{item}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Highlights (optional) */}
            {highlights.length > 0 && (
              <Card className="overflow-hidden border border-slate-200/70 bg-gradient-to-br from-white to-slate-50">
                <CardHeader className="border-b border-slate-100 pb-6">
                  <CardTitle className="text-3xl flex items-center gap-2">
                    <CheckCircle2 className="w-7 h-7 text-primary" />
                    مميزات المشروع
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {highlights.map((t, i) => (
                      <div
                        key={i}
                        className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg"
                      >
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                          <CheckCircle2 className="h-5 w-5" />
                        </div>
                        <div className="mt-4 text-sm leading-7 text-slate-700">{t}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Financial details */}
            <Card className="overflow-hidden border border-slate-200/70 bg-white">
              <CardHeader className="border-b border-slate-100 pb-6">
                <CardTitle className="text-3xl flex items-center gap-2">
                  <TrendingUp className="w-7 h-7 text-primary" />
                  التفاصيل المالية
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 pt-6">
                <div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
                  <div className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-5">
                    <div className="text-sm text-slate-500">المبلغ الحالي</div>
                    <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                      {currentAmountText}
                    </div>
                    <div className="mt-2 text-sm text-slate-500">
                      إجمالي التمويل الذي دخل فعليًا إلى المشروع حتى الآن.
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-slate-200 bg-white p-5">
                    <div className="text-sm text-slate-500">جدول العوائد</div>
                    <div className="mt-3 text-base font-semibold leading-8 text-slate-900">
                      {project.paymentScheduleAr
                        ? String(project.paymentScheduleAr)
                        : "سيتم عرض آلية توزيع العوائد هنا عند توفرها في بيانات المشروع."}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Milestones (optional) */}
            {milestones.length > 0 && (
              <Card className="overflow-hidden border border-slate-200/70 bg-white">
                <CardHeader className="border-b border-slate-100 pb-6">
                  <CardTitle className="text-3xl flex items-center gap-2">
                    <Calendar className="w-7 h-7 text-primary" />
                    خطة التنفيذ
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-0">
                    {milestones.map((m, idx) => {
                      const milestoneState = getMilestoneState(m?.status);
                      const milestoneUi = getMilestoneStateUi(milestoneState);

                      return (
                        <div key={idx} className="relative pb-8 pr-12 last:pb-0">
                          {idx < milestones.length - 1 ? (
                            <span className="absolute right-[18px] top-10 bottom-0 w-px bg-slate-200" />
                          ) : null}

                          <span
                            className={cn(
                              "absolute right-0 top-1 flex h-9 w-9 items-center justify-center rounded-full border text-xs font-bold",
                              milestoneUi.dotClass
                            )}
                          >
                            {idx + 1}
                          </span>

                          <div className={cn("rounded-[28px] border p-5", milestoneUi.cardClass)}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-2">
                                <div className="text-lg font-semibold text-slate-900">
                                  {m.title || "مرحلة"}
                                </div>
                                {m.description && (
                                  <div className="text-sm leading-7 text-slate-600 whitespace-pre-line">
                                    {m.description}
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {m.date && (
                                  <Badge
                                    variant="outline"
                                    className="border-slate-200 bg-white text-xs text-slate-600"
                                  >
                                    {m.date}
                                  </Badge>
                                )}
                                <Badge className={milestoneUi.badgeClass}>{milestoneUi.label}</Badge>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Attachments (optional) */}
            {attachments.length > 0 && (
              <Card className="overflow-hidden border border-slate-200/70 bg-white">
                <CardHeader className="border-b border-slate-100 pb-6">
                  <CardTitle className="text-3xl flex items-center gap-2">
                    <FileText className="w-7 h-7 text-primary" />
                    مستندات ومرفقات
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
                  {attachments.map((a, idx) => {
                    const fileUrl = (a?.url || "").toString().trim();
                    const externalUrl = (a?.externalUrl || "").toString().trim();
                    if (!fileUrl && !externalUrl) return null;
                    const primaryHref = fileUrl || externalUrl;
                    const attachmentKind = getAttachmentKind(a);
                    const attachmentName = getAttachmentName(a);

                    return (
                      <div
                        key={idx}
                        className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg"
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
                          <FileText className="h-5 w-5" />
                        </div>

                        <div className="mt-5 flex items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="text-lg font-semibold text-slate-900 break-words">
                              {attachmentName}
                            </div>
                            <div className="text-sm text-slate-500">
                              {fileUrl
                                ? "مرفق جاهز للعرض مباشرة داخل نافذة جديدة."
                                : "رابط خارجي مرتبط بالمستند أو مصدره."}
                            </div>
                          </div>

                          <Badge
                            variant="outline"
                            className="shrink-0 border-slate-200 bg-slate-50 text-slate-600"
                          >
                            {attachmentKind}
                          </Badge>
                        </div>

                        <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                          <div className="text-xs text-slate-400">
                            {fileUrl ? "داخل المنصة" : "مصدر خارجي"}
                          </div>

                          <Button asChild variant="outline" size="sm" className="rounded-full px-4">
                            <a href={primaryHref} target="_blank" rel="noreferrer">
                              عرض
                            </a>
                          </Button>
                        </div>
                      </div>
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
          <div className="lg:sticky lg:top-24">
            <Card className="overflow-hidden border-0 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
              <CardHeader className="bg-gradient-to-br from-[#09162c] via-[#102544] to-[#1a3c61] pb-8 text-white">
                <CardTitle className="text-2xl text-white">ملخص الاستثمار</CardTitle>
                <CardDescription className="text-white/65">
                  بطاقة تنفيذية تجمع التقدم، الحد الأدنى، العائد، وزر بدء الطلب في مكان واحد.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5 text-sm leading-7 text-slate-600">
                  تبدأ العملية بإرسال الطلب، ثم مراجعته من الفريق، وبعدها يتم التواصل معك لاستكمال
                  الخطوات النظامية إن كانت الفرصة مناسبة لك.
                </div>

                <Dialog
                  open={isInterestFormOpen}
                  onOpenChange={(open) => {
                    setIsInterestFormOpen(open);
                    if (open) setFormMessage({ type: null, text: "" });
                  }}
                >
                  <DialogTrigger asChild>
                    <Button
                      size="lg"
                      className="w-full rounded-2xl bg-[#0f172a] py-6 text-lg text-white hover:bg-[#162338]"
                    >
                      ابدأ طلب الاستثمار
                      <ArrowRight className="mr-2 w-5 h-5" />
                    </Button>
                  </DialogTrigger>

                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>ابدأ طلب الاستثمار</DialogTitle>
                    </DialogHeader>


                    <form onSubmit={handleSubmit} className="space-y-4">


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
                          required
                          placeholder="05xxxxxxxx"
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


                      <Button
                        type="submit"
                        className="w-full"
                        disabled={sending || formMessage.type === "success"}
                      >
                        {sending ? "جاري الإرسال..." : "إرسال الطلب"}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>

                <div className="grid gap-3 pt-2 sm:grid-cols-2">
                  {["عوائد مستقرة", "إدارة احترافية", "تقارير دورية", "متوافق مع الشريعة"].map((t) => (
                    <div key={t} className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-3">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        <span className="text-sm text-slate-700">{t}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4">
                  <Link href="/projects">
                    <Button variant="outline" className="w-full rounded-2xl">
                      العودة للمشاريع
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ✅ SUCCESS MODAL (مستقل) */}
      <Dialog
        open={isSuccessOpen}
        onOpenChange={(open) => {
          setIsSuccessOpen(open);
          // ✅ لو قفلناه نرجع الرسائل لحالتها
          if (!open) setFormMessage({ type: null, text: "" });
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تم إرسال الطلب بنجاح</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-900 text-sm leading-relaxed">
              تم إرسال طلب الاهتمام بنجاح. سيتم التواصل معك بعد المراجعة.
            </div>

            <Button className="w-full" onClick={() => setIsSuccessOpen(false)}>
              تم
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
